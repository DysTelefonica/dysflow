import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseJsonRejectingDuplicateKeys } from "../../core/utils/parse-json-strict.js";
import {
  buildSetupProjectConfig,
  type ProjectConfigMutationObserver,
  publishProjectConfig,
  type SetupProjectConfigInput,
} from "../config/project-config-bootstrap-service.js";
import { diagnoseProjectConfig } from "../config/project-config-diagnostic.js";
import { setupProjectResultContract } from "./contracts/bootstrap-result-contracts.js";
import { projectPublicResolvedConfig } from "./contracts/public-project-config.js";
import { enrichmentForValidationMessage, invalidInput, writesDisabled } from "./dispatch-common.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";
import type { DysflowMcpTool, McpToolResult } from "./result-translation.js";
import { SETUP_PROJECT_SCHEMA } from "./schemas/setup-project-schema.js";
import { validateInput } from "./validator.js";

export type SetupProjectInput = SetupProjectConfigInput & {
  cwd?: string;
  fromCwd?: string;
  overrideProjectRoot?: string;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readProjectConfig(
  projectRoot: string,
): Promise<Record<string, unknown> | undefined> {
  const configPath = join(projectRoot, ".dysflow", "project.json");
  if (!existsSync(configPath)) return undefined;
  const parsed: unknown = parseJsonRejectingDuplicateKeys(await readFile(configPath, "utf8"));
  if (!isRecord(parsed)) throw new Error("Project config must be a JSON object.");
  return parsed;
}

function stringField(config: Record<string, unknown>, key: string): string | undefined {
  const value = config[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function samePath(left: string, right: string): boolean {
  const leftResolved = resolve(left);
  const rightResolved = resolve(right);
  return process.platform === "win32"
    ? leftResolved.toLowerCase() === rightResolved.toLowerCase()
    : leftResolved === rightResolved;
}

function hasValidProcedureAllow(config: Record<string, unknown>): boolean {
  if (!isRecord(config.capabilities) || !isRecord(config.capabilities.procedures)) return true;
  const allow = config.capabilities.procedures.allow;
  return (
    allow === undefined ||
    (Array.isArray(allow) && allow.every((entry) => typeof entry === "string"))
  );
}

function mergeCapabilities(
  inherited: unknown,
  input: SetupProjectConfigInput["capabilities"],
): SetupProjectConfigInput["capabilities"] {
  const base = isRecord(inherited) ? inherited : {};
  const inheritedProcedures = isRecord(base.procedures) ? base.procedures : {};
  const procedures =
    input?.procedures?.allow === undefined
      ? inheritedProcedures
      : { ...inheritedProcedures, allow: [...input.procedures.allow] };
  return {
    allowWrites:
      input?.allowWrites ?? (typeof base.allowWrites === "boolean" ? base.allowWrites : undefined),
    writeExecutionPolicy:
      input?.writeExecutionPolicy ??
      (base.writeExecutionPolicy === "safe-by-default" || base.writeExecutionPolicy === "developer"
        ? base.writeExecutionPolicy
        : undefined),
    ...(Object.keys(procedures).length === 0
      ? {}
      : {
          procedures: {
            ...(Array.isArray(procedures.allow)
              ? {
                  allow: procedures.allow.filter(
                    (value): value is string => typeof value === "string",
                  ),
                }
              : {}),
          },
        }),
  };
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
        let inheritedConfig: Record<string, unknown> | undefined;
        if (params.fromCwd !== undefined) {
          const sourceRoot = resolve(params.fromCwd);
          if (
            !existsSync(sourceRoot) ||
            !existsSync(join(sourceRoot, ".dysflow", "project.json"))
          ) {
            return failure(
              "FROMCWD_NOT_FOUND",
              `No source project config found under fromCwd: ${sourceRoot}.`,
              "Pass fromCwd pointing at an existing Git worktree with .dysflow/project.json.",
            );
          }
          if (
            params.overrideProjectRoot === undefined ||
            !samePath(params.overrideProjectRoot, projectRoot)
          ) {
            return failure(
              "MCP_INPUT_INVALID",
              "overrideProjectRoot must resolve to the target cwd when fromCwd is used.",
              `Pass overrideProjectRoot equal to the target worktree root: ${projectRoot}.`,
            );
          }
          try {
            inheritedConfig = await readProjectConfig(sourceRoot);
          } catch (error) {
            return failure(
              "FROMCWD_CONFIG_INVALID",
              `Source project config is invalid: ${error instanceof Error ? error.message : String(error)}`,
              "Repair the source .dysflow/project.json and retry the import.",
            );
          }
          if (inheritedConfig === undefined) {
            return failure(
              "FROMCWD_NOT_FOUND",
              `Source project config disappeared before it could be read: ${sourceRoot}.`,
              "Restore the source .dysflow/project.json and retry the import.",
            );
          }
          if (!hasValidProcedureAllow(inheritedConfig)) {
            return failure(
              "FROMCWD_CONFIG_INVALID",
              "Source capabilities.procedures.allow must be an array of strings.",
              "Repair capabilities.procedures.allow in the source config and retry the import.",
            );
          }
          const sourceDiagnostic = diagnoseProjectConfig(sourceRoot, {}, inheritedConfig);
          if (!sourceDiagnostic.writeReady) {
            return failure(
              "FROMCWD_CONFIG_INVALID",
              sourceDiagnostic.diagnostics[0]?.message ?? "Source project config is invalid.",
              sourceDiagnostic.remediation ??
                "Repair the source .dysflow/project.json and retry the import.",
            );
          }
        } else {
          try {
            inheritedConfig = await readProjectConfig(projectRoot);
          } catch {
            inheritedConfig = undefined;
          }
        }

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
        const inheritedCapabilities = inheritedConfig?.capabilities;
        const capabilitiesToPreserve =
          params.fromCwd !== undefined
            ? inheritedCapabilities
            : isRecord(inheritedCapabilities) && isRecord(inheritedCapabilities.procedures)
              ? { procedures: inheritedCapabilities.procedures }
              : undefined;
        const setupInput: SetupProjectConfigInput = {
          frontendFile:
            params.frontendFile ?? stringField(inheritedConfig ?? {}, "frontendFile") ?? "",
          backendPath: params.backendPath ?? stringField(inheritedConfig ?? {}, "backendPath"),
          destinationRoot:
            params.destinationRoot ?? stringField(inheritedConfig ?? {}, "destinationRoot"),
          timeoutMs:
            params.timeoutMs ??
            (typeof inheritedConfig?.timeoutMs === "number"
              ? inheritedConfig.timeoutMs
              : undefined),
          capabilities: mergeCapabilities(capabilitiesToPreserve, params.capabilities),
          projectId:
            explicitProjectId === undefined || explicitProjectId.length === 0
              ? (existingProjectId ?? stringField(inheritedConfig ?? {}, "id"))
              : explicitProjectId,
        };
        const built = buildSetupProjectConfig(setupInput, projectRoot);
        const inheritedProcedures = isRecord(inheritedCapabilities)
          ? inheritedCapabilities.procedures
          : undefined;
        const builtCapabilities = built.capabilities as Record<string, unknown>;
        const builtProcedures = builtCapabilities.procedures;
        resolvedConfig = {
          ...(params.fromCwd === undefined ? {} : inheritedConfig),
          ...built,
          ...(params.fromCwd === undefined ? {} : { projectRoot }),
          capabilities: {
            ...(isRecord(inheritedCapabilities) ? inheritedCapabilities : {}),
            ...builtCapabilities,
            ...(isRecord(inheritedProcedures) || isRecord(builtProcedures)
              ? {
                  procedures: {
                    ...(isRecord(inheritedProcedures) ? inheritedProcedures : {}),
                    ...(isRecord(builtProcedures) ? builtProcedures : {}),
                  },
                }
              : {}),
          },
        };
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
                resolvedConfig: projectPublicResolvedConfig(resolvedConfig),
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
            resolvedConfig: projectPublicResolvedConfig(resolvedConfig),
          },
        );
      }
    },
  };
}
