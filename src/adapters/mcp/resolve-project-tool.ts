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
import type { OperationResult } from "../../core/contracts/index.js";
import { successResult } from "../../core/contracts/index.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";
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
    projectId: {
      type: "string",
      description:
        "Optional projectId to verify against .dysflow/project.json. When omitted, the resolver only checks whether a project.json is readable.",
    },
  },
} as const;

/**
 * Factory for the `resolve_project` MCP tool. The factory is
 * pure: it captures `cwd` once at construction and the handler reads it
 * on every invocation. Tests pass a `mkdtempSync` directory so the
 * integration exercise does not depend on `process.cwd()`.
 */
export function createResolveProjectTool(opts: { cwd: string }): DysflowMcpTool {
  return {
    name: "resolve_project",
    description:
      "Read .dysflow/project.json from the supplied cwd and return a structured diagnosis of how a hypothetical projectId would resolve. Companion to get_capabilities: the snapshot tool reports the projectId captured at factory construction; this tool re-checks the project.json on disk. Read-only — does not open Access, does not spawn PowerShell, does not mutate state. Returns { projectId, outcome, reason, accessPath, projectRoot, sourceRoot } with reason one of: explicit id match | single project config found | project.json not found | id mismatch | unknown. Use outcome === 'resolved' to confirm a projectId is wired; use outcome === 'unresolved' + reason to diagnose a missing or mismatched config. " +
      MCP_TOOL_CONTRACTS.resolve_project.summary,
    inputSchema: RESOLVE_PROJECT_SCHEMA,
    handler: async (input): Promise<ReturnType<typeof translateCoreResultToMcpContent>> => {
      const params =
        typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
      const projectId = typeof params.projectId === "string" ? params.projectId : undefined;

      const result = await tryResolveProject({ projectId }, opts.cwd);
      const opResult: OperationResult<ResolvedProjectResult> = successResult(result);
      return translateCoreResultToMcpContent(opResult);
    },
  };
}
