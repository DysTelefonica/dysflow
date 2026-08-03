import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  buildSetupProjectConfig,
  type ProjectConfigMutationObserver,
  publishProjectConfig,
  type SetupProjectConfigInput,
} from "../config/project-config-bootstrap-service.js";
import { diagnoseProjectConfig } from "../config/project-config-diagnostic.js";
import { setupProjectResultContract } from "./contracts/bootstrap-result-contracts.js";
import { enrichmentForValidationMessage, invalidInput, writesDisabled } from "./dispatch-common.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";
import type { DysflowMcpTool, McpToolResult } from "./result-translation.js";
import { SETUP_PROJECT_SCHEMA } from "./schemas/setup-project-schema.js";
import { validateInput } from "./validator.js";

export type SetupProjectInput = SetupProjectConfigInput & {
  cwd?: string;
  apply?: boolean;
};

export type SetupProjectToolOptions = {
  cwd: string;
  writesEnabled: boolean;
  resolveExistingProjectId?: (cwd: string) => string | null | Promise<string | null>;
  onConfigMutated?: ProjectConfigMutationObserver;
};

export { SETUP_PROJECT_SCHEMA } from "./schemas/setup-project-schema.js";

function failure(
  code: string,
  message: string,
  remediation: string,
  evidence?: { configPath: string; resolvedConfig: Record<string, unknown> },
): McpToolResult {
  const error = {
    code,
    message,
    errorCode: code,
    errorMessage: message,
    remediation,
    ...evidence,
  };
  return {
    content: [{ type: "text", text: JSON.stringify({ ok: false, error }) }],
    isError: true,
    ok: false,
    error,
  };
}

function assertCandidateWriteReady(projectRoot: string, candidate: Record<string, unknown>): void {
  const diagnostic = diagnoseProjectConfig(projectRoot, {}, candidate);
  if (diagnostic.writeReady) return;
  const code =
    diagnostic.diagnostics[0]?.code ?? diagnostic.status.toUpperCase().replaceAll("-", "_");
  throw Object.assign(new Error(diagnostic.diagnostics[0]?.message ?? diagnostic.status), {
    code,
    remediation: diagnostic.remediation ?? "Correct the candidate project configuration and retry.",
  });
}

export function createSetupProjectTool(options: SetupProjectToolOptions): DysflowMcpTool {
  return {
    name: "setup_project",
    resultContract: setupProjectResultContract,
    description:
      "Plan or atomically create .dysflow/project.json in a fresh Git worktree without requiring shell access. A fresh bootstrap requires projectId; omission reuses an existing WorktreeContext id or fails closed. Omitted apply plans only; apply:true requires the process write gate and candidate capabilities.allowWrites:true. " +
      MCP_TOOL_CONTRACTS.setup_project.summary,
    inputSchema: SETUP_PROJECT_SCHEMA,
    handler: async (input): Promise<McpToolResult> => {
      const validation = validateInput(input, SETUP_PROJECT_SCHEMA);
      if (validation !== undefined) {
        const enrichment = enrichmentForValidationMessage(
          validation,
          "setup_project",
          SETUP_PROJECT_SCHEMA,
        );
        return invalidInput(validation, undefined, enrichment);
      }

      const params = input as SetupProjectInput;
      const projectRoot = resolve(params.cwd?.trim() || options.cwd);
      if (!existsSync(join(projectRoot, ".git"))) {
        return failure(
          "OUTSIDE_PROJECT_ROOT",
          `setup_project cwd is not a Git worktree root: ${projectRoot}.`,
          "Pass cwd pointing at a Git worktree root that contains its own .git entry.",
        );
      }

      let resolvedConfig: Record<string, unknown>;
      const warnings: string[] = [];
      try {
        const explicitProjectId = params.projectId?.trim();
        const existingProjectId =
          explicitProjectId === undefined || explicitProjectId.length === 0
            ? await options.resolveExistingProjectId?.(projectRoot)
            : null;
        if (
          (explicitProjectId === undefined || explicitProjectId.length === 0) &&
          existingProjectId !== null &&
          existingProjectId !== undefined
        ) {
          warnings.push(
            `projectId was omitted; reused existing WorktreeContext projectId "${existingProjectId}".`,
          );
        }
        resolvedConfig = buildSetupProjectConfig(
          {
            ...params,
            projectId:
              explicitProjectId === undefined || explicitProjectId.length === 0
                ? (existingProjectId ?? undefined)
                : explicitProjectId,
          },
          projectRoot,
        );
      } catch (error) {
        return failure(
          "MCP_INPUT_INVALID",
          error instanceof Error ? error.message : String(error),
          "Pass an explicit projectId for a fresh bootstrap, or select a WorktreeContext with an existing configured id. Also pass frontendFile as a basename at that worktree root.",
        );
      }

      const applyRequested = params.apply === true;
      if (!applyRequested) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: true,
                mode: "plan",
                dryRun: true,
                willWrite: true,
                configPath: join(projectRoot, ".dysflow", "project.json"),
                resolvedConfig,
                warnings,
              }),
            },
          ],
          isError: false,
          ok: true,
        };
      }

      if (options.writesEnabled !== true) return writesDisabled("setup_project");
      if ((resolvedConfig.capabilities as { allowWrites?: boolean }).allowWrites !== true) {
        return failure(
          "CAPABILITIES_DISALLOW_WRITE",
          "Candidate project config has capabilities.allowWrites disabled.",
          "Set capabilities.allowWrites:true to bootstrap a write-ready project, or omit apply to preview only.",
        );
      }

      try {
        const configPath = await publishProjectConfig(
          projectRoot,
          resolvedConfig,
          undefined,
          undefined,
          assertCandidateWriteReady,
        );
        await options.onConfigMutated?.(projectRoot);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                ok: true,
                mode: "apply",
                dryRun: false,
                configPath,
                writtenFields: Object.keys(resolvedConfig),
                warnings,
              }),
            },
          ],
          isError: false,
          ok: true,
        };
      } catch (error) {
        const candidate = error as { code?: string; remediation?: string; message?: string };
        return failure(
          candidate.code ?? "PROJECT_CONFIG_WRITE_FAILED",
          candidate.message ?? String(error),
          candidate.remediation ?? "Verify the worktree paths and retry setup_project.",
          {
            configPath: join(projectRoot, ".dysflow", "project.json"),
            resolvedConfig,
          },
        );
      }
    },
  };
}
