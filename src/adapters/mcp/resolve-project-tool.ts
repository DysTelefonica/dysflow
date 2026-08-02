import { resolveProjectResultContract } from "./contracts/bootstrap-result-contracts.js";
// `resolve_project` — round-3 Item 1 companion to
// `get_capabilities`. The snapshot tool reports the projectId that
// was captured at factory construction; this tool re-resolves
// `.dysflow/project.json` from disk so a consumer can ask
// "what would the MCP think if I passed THIS projectId?" without
// round-tripping through the MCP restart cycle.
//
// The handler is read-only: it never opens Access, never spawns
// PowerShell, and never mutates state. The single filesystem read is
// scoped to `<cwd>/.dysflow/project.json` — the same path the legacy
// `loadDysflowConfigShared` walk eventually finds. We deliberately do
// NOT import the full DysflowConfig loader here: the consumer needs a
// diagnostic answer, not a validated config; importing the loader would
// pull in the whole walk-up-the-tree behaviour, which would be a
// behaviour change vs. the consumer's stated intent (read the project
// config that *this cwd* ships with).

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { discoverWorktreeProjectConfigs } from "../../core/config/dysflow-config.js";
import type { OperationResult } from "../../core/contracts/index.js";
import { successResult } from "../../core/contracts/index.js";
import { PROJECT_IDENTITY_BLOCK } from "../../shared/validation/index.js";
import { nodeConfigFileSystem } from "../config/dysflow-config-node.js";
import {
  type DiscoveredProjectDiagnostic,
  diagnoseProjectConfig,
  type ProjectConfigDiagnostic,
} from "../config/project-config-diagnostic.js";
import { CWD_OVERRIDE_SCHEMA_PROP, resolveCwdOverride } from "./cwd-override.js";
import { invalidInput } from "./dispatch-common.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";
import {
  CLEAR_RESOLUTION_SCHEMA_PROP,
  createProjectResolutionRecovery,
  PROJECT_RECOVERY_SCHEMA_BLOCK,
  type ProjectResolutionRecovery,
} from "./project-resolution-recovery.js";
import type { DysflowMcpTool } from "./result-translation.js";
import { translateCoreResultToMcpContent } from "./result-translation.js";

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Reason taxonomy for `ResolvedProjectResult.reason`. The literal set is
 * intentionally narrow — every value is a verb-driven description the
 * consumer can show on a dashboard or a log line without further
 * translation. Extensions are additive (a future cache layer can grow the
 * list with "cache stale"; a future cyrb53-checksum verifier can grow
 * it with "checksum mismatch") but MUST keep the existing literals
 * stable so dashboards do not break.
 */
export type ResolvedProjectReason =
  | "explicit id match"
  | "single project config found"
  | "project.json not found"
  | "id mismatch"
  | "unknown";

/**
 * Discriminated union: `outcome === "resolved"` always carries a
 * non-null `projectId` and three best-effort path fields; `outcome ===
 * "unresolved"` always returns `null` for the identity + path fields so
 * the consumer can safely `.accessPath` without a nullability
 * footgun.
 */
export type ResolvedProjectResult =
  | {
      projectId: null;
      outcome: "ambiguous";
      reason: "ambiguous project";
      accessPath: null;
      projectRoot: null;
      sourceRoot: null;
      availableProjects: readonly {
        projectId: string;
        projectRoot: string;
        accessPath: string | null;
      }[];
      recoveryToken: string;
      recoveryInstruction: string;
    }
  | {
      projectId: string;
      outcome: "resolved";
      reason: "explicit id match" | "single project config found";
      accessPath: string | null;
      projectRoot: string | null;
      sourceRoot: string | null;
    }
  | {
      projectId: null;
      outcome: "unresolved";
      reason: Exclude<ResolvedProjectReason, "explicit id match" | "single project config found">;
      accessPath: null;
      projectRoot: null;
      sourceRoot: null;
    };

export type ResolveProjectInput = {
  projectId?: string;
  projectChoiceReason?: string;
  recoveryToken?: string;
  clearResolution?: boolean;
};

// ─── Pure helper ──────────────────────────────────────────────────────────────

const PROJECT_CONFIG_RELATIVE_PATH = join(".dysflow", "project.json");
const ID_FIELD = "id";
const ACCESS_PATH_FIELD = "accessPath";
const PROJECT_ROOT_FIELD = "projectRoot";
const SOURCE_ROOT_FIELD = "sourceRoot";
const DESTINATION_ROOT_FIELD = "destinationRoot";

/**
 * Read `.dysflow/project.json` from `cwd` and return a structured
 * diagnosis. Never throws — every filesystem or JSON-parse failure is
 * translated into a typed `ResolvedProjectResult` so the consumer can
 * branch on `outcome` instead of catching.
 *
 * @param input  - caller-supplied `projectId` (optional). When set, the
 *                 file's `id` MUST match; a mismatch returns
 *                 `reason: "id mismatch"`.
 * @param cwd    - the absolute path to scan. Tests pass a `mkdtempSync`
 *                 directory; production calls pass `process.cwd()`.
 */
export async function tryResolveProject(
  input: ResolveProjectInput,
  cwd: string,
): Promise<ResolvedProjectResult> {
  const configPath = join(cwd, PROJECT_CONFIG_RELATIVE_PATH);

  let raw: string;
  try {
    raw = await readFile(configPath, "utf-8");
  } catch {
    return {
      projectId: null,
      outcome: "unresolved",
      reason: "project.json not found",
      accessPath: null,
      projectRoot: null,
      sourceRoot: null,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    const value = JSON.parse(raw);
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return unresolvedUnknown();
    }
    parsed = value as Record<string, unknown>;
  } catch {
    return unresolvedUnknown();
  }

  if (typeof parsed[ID_FIELD] !== "string" || (parsed[ID_FIELD] as string).length === 0) {
    return unresolvedUnknown();
  }
  const declaredId = parsed[ID_FIELD] as string;

  if (input.projectId !== undefined && input.projectId !== declaredId) {
    return {
      projectId: null,
      outcome: "unresolved",
      reason: "id mismatch",
      accessPath: null,
      projectRoot: null,
      sourceRoot: null,
    };
  }

  const destinationRoot =
    optionalString(parsed[DESTINATION_ROOT_FIELD]) ?? optionalString(parsed[SOURCE_ROOT_FIELD]);

  return {
    projectId: declaredId,
    outcome: "resolved",
    reason: input.projectId === undefined ? "single project config found" : "explicit id match",
    accessPath: optionalString(parsed[ACCESS_PATH_FIELD]),
    projectRoot: optionalString(parsed[PROJECT_ROOT_FIELD]),
    sourceRoot: destinationRoot,
  };
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function unresolvedUnknown(): ResolvedProjectResult {
  return {
    projectId: null,
    outcome: "unresolved",
    reason: "unknown",
    accessPath: null,
    projectRoot: null,
    sourceRoot: null,
  };
}

// ─── MCP tool factory ─────────────────────────────────────────────────────────

export const RESOLVE_PROJECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    // Issue #1076 — compose the shared ProjectIdentity block so the
    // consumer-facing description matches every other tool that uses
    // this atom.
    ...PROJECT_IDENTITY_BLOCK,
    ...PROJECT_RECOVERY_SCHEMA_BLOCK,
    clearResolution: CLEAR_RESOLUTION_SCHEMA_PROP,
    // #1057 (F10) — optional per-call cwd override.
    cwd: CWD_OVERRIDE_SCHEMA_PROP,
  },
} as const;

/**
 * Factory for the `resolve_project` MCP tool. The factory is
 * pure: it captures `cwd` once at construction and the handler reads it
 * on every invocation. Tests pass a `mkdtempSync` directory so the
 * integration exercise does not depend on `process.cwd()`.
 *
 * #963 — Idempotence contract.
 *
 * The handler MUST perform a fresh filesystem validation on every call.
 * `tryResolveProject` reads `<cwd>/.dysflow/project.json` via `readFile` and
 * `diagnoseProjectConfig` performs fresh sync probes (`existsSync`,
 * `realpathSync`, `readFileSync`) every invocation. 10 sequential calls
 * with the same input return byte-identical JSON when the filesystem is
 * stable, and mutations between calls (destinationRoot added/removed,
 * project id changed) are reflected in the immediately subsequent call.
 *
 * Issue #1313 adds one deliberately narrow exception: an explicit human
 * recovery selection is cached process-locally, with TTL and config/worktree
 * fingerprint invalidation. Ordinary unambiguous calls remain uncached.
 * Read the
 * contract-pinning test at
 * `test/adapters/mcp/resolve-project-idempotence.test.ts` — it asserts
 * the three acceptance criteria (AC1: 10-call byte-equality, AC2:
 * filesystem-change reflection, AC3: no-cache behaviour) and is the
 * authoritative guard against accidental cache regressions.
 */
export function createResolveProjectTool(opts: {
  cwd: string;
  recovery?: ProjectResolutionRecovery;
  projectConfigResolver?: (
    cwd: string,
    input: Record<string, unknown>,
  ) => ProjectConfigDiagnostic | Promise<ProjectConfigDiagnostic>;
}): DysflowMcpTool {
  const recovery = opts.recovery ?? createProjectResolutionRecovery();
  const projectConfigResolver =
    opts.projectConfigResolver ??
    ((cwd: string, input: Record<string, unknown>) => diagnoseProjectConfig(cwd, input));
  return {
    name: "resolve_project",
    resultContract: resolveProjectResultContract,
    description:
      "Read .dysflow/project.json from the supplied cwd and return a structured project diagnosis. Ambiguous outcomes include availableProjects, a process-local recoveryToken, and an instruction for committing an exact human choice. clearResolution drops the process-local choice. The tool never writes project files or opens Access. " +
      MCP_TOOL_CONTRACTS.resolve_project.summary,
    inputSchema: RESOLVE_PROJECT_SCHEMA,
    handler: async (input): Promise<ReturnType<typeof translateCoreResultToMcpContent>> => {
      const params =
        typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
      let projectId = typeof params.projectId === "string" ? params.projectId : undefined;

      // #1057 (F10) — honor a per-call cwd override; fall back to the
      // factory cwd (backwards compatible).
      const cwdResolution = resolveCwdOverride(input, opts.cwd);
      if (!cwdResolution.ok) return cwdResolution.error;
      const effectiveCwd = cwdResolution.cwd;

      if (params.clearResolution === true) recovery.clear();

      const hasRecoveryField =
        params.projectChoiceReason !== undefined || params.recoveryToken !== undefined;
      let selectedRoot: string | undefined;
      if (hasRecoveryField) {
        const selection = recovery.consume({
          cwd: effectiveCwd,
          projectId,
          projectChoiceReason:
            typeof params.projectChoiceReason === "string" ? params.projectChoiceReason : undefined,
          recoveryToken:
            typeof params.recoveryToken === "string" ? params.recoveryToken : undefined,
        });
        if (!selection.ok) {
          if (selection.code === "PROJECT_ID_COLLISION") {
            const error = {
              code: selection.code,
              message: selection.message,
              errorCode: selection.code,
              errorMessage: selection.message,
              remediation: selection.remediation,
            };
            return {
              content: [{ type: "text", text: JSON.stringify({ ok: false, error }) }],
              isError: true,
              ok: false,
              error,
            };
          }
          return invalidInput(selection.message, selection.remediation, {
            rejectedFlag: "recoveryToken",
          });
        }
        projectId = selection.project.projectId;
        selectedRoot = selection.project.projectRoot;
      } else if (projectId === undefined) {
        const cached = recovery.getCached();
        if (cached !== null) {
          projectId = cached.projectId;
          selectedRoot = cached.projectRoot;
        }
      }

      // #1313 — production ambiguity discovery. `diagnoseProjectConfig`
      // intentionally scopes its final `discoveredProjects` projection to the
      // selected worktree, which is correct for diagnostics isolation but too
      // narrow for the explicit recovery surface. Resolve discovery is bounded
      // to the current worktree and its registered sibling directory; it never
      // scans arbitrary roots. An explicit/cached/token-backed selection skips
      // this branch and resolves only its frozen candidate.
      if (selectedRoot === undefined) {
        const visibleProjects = discoverWorktreeProjectConfigs(effectiveCwd, nodeConfigFileSystem);
        if (projectId === undefined && visibleProjects.length > 1) {
          const projectConfig = ambiguousDiagnostic(effectiveCwd, visibleProjects);
          const envelope = recovery.issue(projectConfig);
          const ambiguous: ResolvedProjectResult = {
            projectId: null,
            outcome: "ambiguous",
            reason: "ambiguous project",
            accessPath: null,
            projectRoot: null,
            sourceRoot: null,
            ...envelope,
          };
          return translateCoreResultToMcpContent(successResult({ ...ambiguous, projectConfig }));
        }
        if (projectId !== undefined) {
          const matches = visibleProjects.filter((project) => project.id === projectId);
          if (matches.length > 1) {
            const message = `Project id '${projectId}' identifies more than one visible project.`;
            const error = {
              code: "PROJECT_ID_COLLISION",
              message,
              errorCode: "PROJECT_ID_COLLISION",
              errorMessage: message,
              remediation:
                "Give each worktree a unique project id before selecting a recovery candidate.",
            };
            return {
              content: [{ type: "text", text: JSON.stringify({ ok: false, error }) }],
              isError: true,
              ok: false,
              error,
            };
          }
          selectedRoot = matches[0]?.projectRoot;
        } else if (visibleProjects.length === 1) {
          selectedRoot = visibleProjects[0]?.projectRoot;
        }
      }

      const resolutionRoot = selectedRoot ?? effectiveCwd;
      const result = await tryResolveProject({ projectId }, resolutionRoot);
      const projectConfig = await projectConfigResolver(resolutionRoot, {
        ...(projectId === undefined ? {} : { projectId }),
      });
      if (projectConfig.status === "ambiguous") {
        // A project-id choice cannot resolve a second ambiguity inside the
        // selected config (for example, multiple frontend files). Never
        // report that state as resolved or retain a misleading cache entry.
        if (projectId !== undefined) recovery.clear();
        const envelope = recovery.issue(projectConfig);
        const ambiguous: ResolvedProjectResult = {
          projectId: null,
          outcome: "ambiguous",
          reason: "ambiguous project",
          accessPath: null,
          projectRoot: null,
          sourceRoot: null,
          ...envelope,
        };
        const opResult: OperationResult<
          ResolvedProjectResult & { projectConfig: ProjectConfigDiagnostic }
        > = successResult({ ...ambiguous, projectConfig });
        return translateCoreResultToMcpContent(opResult);
      }
      const opResult: OperationResult<
        ResolvedProjectResult & { projectConfig: ProjectConfigDiagnostic }
      > = successResult({ ...result, projectConfig });
      return translateCoreResultToMcpContent(opResult);
    },
  };
}

function ambiguousDiagnostic(
  cwd: string,
  projects: readonly DiscoveredProjectDiagnostic[],
): ProjectConfigDiagnostic {
  return {
    status: "ambiguous",
    cwd,
    configPath: join(cwd, ".dysflow", "project.json"),
    projectRoot: cwd,
    projectId: null,
    accessPath: null,
    backendPath: null,
    destinationRoot: null,
    writeReady: false,
    discoveredProjects: projects,
    diagnostics: [
      {
        code: "FRONTEND_TARGET_AMBIGUOUS",
        severity: "error",
        message: "Multiple sibling worktree projects are visible from this cwd.",
      },
    ],
    remediation:
      "Ask the user to choose one availableProjects entry and retry with the recovery trio.",
  };
}
