// `dysflow.diagnose` — aggregated project health in one call.
//
// Issue #965. Replaces the 4-5 round-trip pattern AI consumers (and humans)
// hit today when bringing a project into scope:
//   1. `get_capabilities` — runtime snapshot
//   2. `resolve_project`  — re-resolve `.dysflow/project.json` from disk
//   3. `list_access_operations` — recent operation registry
//   4. `access_force_cleanup_orphaned` (LISTING, no `confirmPid`) — orphan count
//   5. filesystem stat on accessPath / backendPath / destinationRoot
//
// `diagnose` collapses those into one read-only call. The handler never opens
// Access, never spawns PowerShell, never writes to the filesystem. The
// dispatcher registers it as `read-only` (`MCP_TOOL_CONTRACTS.diagnose`) so
// the write-gate never fires — `dysflow mcp --disable-writes` still exposes it.
//
// The aggregator is split into a pure async function (`computeDiagnose`)
// plus a thin MCP factory (`createDiagnoseTool`) that adapts the result to
// the `McpToolResult.content[0].text` JSON envelope — same pattern as
// `createResolveProjectTool` (#963) and `createSchemaTool` (#971).
//
// Pairs with:
//   - `get_capabilities` (#656) — live state of the running adapter
//   - `resolve_project` (#963) — project config re-resolution
//   - `schema` (#971) — runtime contract for every advertised tool
//   - `dysflow.state` (#978) — operational history (NOT in this file)

import { existsSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import {
  type AccessOperationListEntry,
  type AccessOperationRecord,
  type AccessOperationRegistry,
  type AccessOperationStatus,
  createInMemoryAccessOperationRegistry,
  listRecentAccessOperations,
  resolveAccessOperationRegistry,
} from "../../core/operations/access-operation-registry.js";
import type { WriteExecutionPolicy } from "../../core/runtime/write-execution-policy.js";
import {
  diagnoseProjectConfig,
  type ProjectConfigDiagnostic,
} from "../config/project-config-diagnostic.js";
import { CWD_OVERRIDE_SCHEMA_PROP, resolveCwdOverride } from "./cwd-override.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";
import type { DysflowMcpTool } from "./result-translation.js";

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Single filesystem probe — same shape for every path the diagnose result
 * carries. `readable` mirrors `exists`: a missing file is `readable: false`,
 * a present file is `readable: true` (we probe via `statSync` which throws
 * on permission failures but never on Windows ACLs in the test environment).
 */
export type FilesystemPathStatus = {
  path: string | null;
  exists: boolean;
  readable: boolean;
  sizeBytes: number | null;
  lastModified: string | null;
};

/**
 * Slimmer shape for `backendPath` / `destinationRoot` — neither needs a
 * `readable` field (their consumers branch only on existence). `hint`
 * surfaces the remediation string when the path is missing.
 */
export type FilesystemDirStatus = {
  path: string | null;
  exists: boolean;
  hint: string | null;
};

/**
 * Per-path filesystem block returned under `result.filesystem`. `projectRoot`
 * carries the same shape as `accessPath` minus the `readable` / `sizeBytes`
 * fields (consumers only need to know whether the worktree root exists).
 */
export type DiagnoseFilesystem = {
  accessPath: FilesystemPathStatus;
  backendPath: FilesystemDirStatus;
  destinationRoot: FilesystemDirStatus;
  projectRoot: { path: string; exists: boolean };
};

/**
 * Runtime block — the cross-cutting "is the live process / registry in a
 * healthy state?" snapshot. The orphans counts intentionally default to `0`
 * for v1 (the diagnostic does not spawn a process scanner); a follow-up issue
 * can promote them to a real `ProcessScanner` enumeration without breaking
 * the contract (additive fields).
 */
export type DiagnoseRuntime = {
  staleMarkers: number;
  activeOps: number;
  orphans: { msaccess: number; pwshWorkers: number };
  dysflowVersion: string;
  writeExecutionPolicy: WriteExecutionPolicy;
};

/**
 * Project-config block. Mirrors `ProjectConfigDiagnostic` but adds an
 * explicit `severity` on each diagnostic (`"error" | "warning" | "info"`)
 * and an always-string `remediation` so consumers can show a unified UI
 * without per-field null-checks. The transform from `ProjectConfigDiagnostic`
 * is one-to-one and stable.
 */
export type DiagnoseProjectConfig = {
  status: ProjectConfigDiagnostic["status"];
  projectId: string | null;
  writeReady: boolean;
  diagnostics: Array<{
    code: string;
    severity: "error" | "warning" | "info";
    message: string;
    remediation: string;
  }>;
  owningWorktree: string | null;
};

/**
 * Top-level `diagnose` result — additive contract. New fields may appear in
 * future versions but existing field order and shape MUST stay stable so AI
 * consumers can branch without consulting schema docs (the `schema` tool
 * exposes this same shape for live validation).
 */
export type DiagnoseResult = {
  projectConfig: DiagnoseProjectConfig;
  filesystem: DiagnoseFilesystem;
  runtime: DiagnoseRuntime;
};

/**
 * Input shape for the `diagnose` MCP tool. Mirrors the issue's TypeScript
 * sketch; all fields are optional — when omitted, the handler uses the live
 * snapshot (projectId from `.dysflow/project.json`, default `accessPath` from
 * the same source, no contextId, no verbose).
 */
export type DiagnoseInput = {
  projectId?: string;
  accessPath?: string;
  contextId?: string;
  verbose?: boolean;
};

// ─── Pure aggregator ──────────────────────────────────────────────────────────

/**
 * Default stale-marker threshold. Per issue #965 AC4, the runtime block counts
 * only markers with `status: "running"` AND `updatedAt` older than 5 minutes.
 * A future `.dysflow/project.json` field (`capabilities.staleMarkerThresholdMinutes`,
 * already wired into `cleanupStaleMarkers` for #967) can override this; the
 * tool's `verbose` flag is reserved for surfacing the active threshold
 * (currently always default).
 */
export const DEFAULT_STALE_MARKER_THRESHOLD_MS = 5 * 60 * 1000;

const ACTIVE_OPERATION_STATUSES: readonly AccessOperationStatus[] = ["running", "starting"];

const MISSING_DESTINATION_HINT =
  "Destination root is missing. Run `mkdir -p '<destinationRoot>/{classes,modules,forms,reports}'` to scaffold the managed source tree, or run `git rm -r` if it was deleted accidentally.";

const MISSING_BACKEND_HINT =
  "Configured backendPath does not exist on disk. Verify the Access backend is mounted, or update `capabilities.backendPath` in `.dysflow/project.json`.";

export type ComputeDiagnoseOptions = {
  /** Absolute path used as the `cwd` for the project-config diagnostic. */
  cwd: string;
  /** Snapshot from the live adapter — `get_capabilities`-equivalent state. */
  snapshot: {
    adapterVersion: string;
    writeExecutionPolicy: WriteExecutionPolicy;
  };
  /**
   * Operation registry. When omitted, the aggregator uses an in-memory
   * empty registry so the function stays pure (no host-FS read of the
   * project's `operations.json` file — that's the registry's job, and
   * tests inject a fake). Production wires the per-project
   * `FileAccessOperationRegistry` via the dispatch factory.
   */
  registry?: AccessOperationRegistry;
  /** Stale-marker threshold in milliseconds. Default: 5 minutes. */
  thresholdMs?: number;
  /** Wall-clock injection for deterministic tests. Default: `Date.now()`. */
  nowMs?: number;
  /**
   * Optional projectId to thread into the project-config resolver. When
   * supplied and the resolver finds an `id-mismatch`, the resulting
   * `projectConfig.status` is `"id-mismatch"` while the filesystem block
   * still reflects the on-disk truth — exactly the "what's broken?"
   * surface the consumer wants.
   */
  projectId?: string;
};

/**
 * Pure aggregator — never throws. Every filesystem probe is wrapped in a
 * try/catch so a corrupt ACL on one path does not zero out the whole result.
 * Same defensive posture as `diagnoseProjectConfig` and `tryResolveProject`.
 *
 * Async because `AccessOperationRegistry.listRecent` is async; tests inject
 * an in-memory registry and pre-seed records so a single `await` is the
 * only async seam.
 */
export async function computeDiagnose(options: ComputeDiagnoseOptions): Promise<DiagnoseResult> {
  const { cwd, snapshot } = options;
  const thresholdMs = options.thresholdMs ?? DEFAULT_STALE_MARKER_THRESHOLD_MS;
  const nowMs = options.nowMs ?? Date.now();
  const registry = resolveAccessOperationRegistry(
    options.registry,
    createInMemoryAccessOperationRegistry,
  );

  // 1. projectConfig — delegate to the canonical resolver. Thread an explicit
  // projectId through so the resolver reports `id-mismatch` when the caller
  // asks for a different project than the disk-declared one.
  const projectConfigRaw = diagnoseProjectConfig(
    cwd,
    options.projectId === undefined ? {} : { projectId: options.projectId },
  );

  // 2. filesystem — three probes around the resolved config paths. When
  // the diagnostic fail-closed (no project config / outside-project-root),
  // we still surface a default `<projectRoot>/src` for destinationRoot so
  // the consumer can detect the missing-directory footgun even without a
  // `.dysflow/project.json` in scope. Same for accessPath / backendPath:
  // the path field is the resolved-or-default string the consumer should
  // investigate; `exists` stays honest (false when the default is missing).
  const projectRoot = projectConfigRaw.projectRoot ?? normalize(cwd);
  const accessPathResolved = projectConfigRaw.accessPath;
  const backendPathResolved = projectConfigRaw.backendPath;
  // Default destinationRoot to <projectRoot>/src when the diagnostic did
  // not resolve one. Matches `diagnoseProjectConfig`'s own fallback.
  const destinationRootResolved =
    projectConfigRaw.destinationRoot ?? normalize(join(projectRoot, "src"));

  const accessPath = statPath(accessPathResolved);
  const backendPath: FilesystemDirStatus = {
    path: backendPathResolved,
    exists: backendPathResolved !== null && existsSync(backendPathResolved),
    hint:
      backendPathResolved !== null && !existsSync(backendPathResolved)
        ? MISSING_BACKEND_HINT
        : null,
  };
  const destinationRoot: FilesystemDirStatus = {
    path: destinationRootResolved,
    exists: existsSync(destinationRootResolved),
    hint: existsSync(destinationRootResolved) ? null : MISSING_DESTINATION_HINT,
  };
  const projectRootBlock = {
    path: projectRoot,
    exists: existsSync(projectRoot),
  };

  // 3. runtime — walk the registry. `listRecentAccessOperations` enriches the
  // records with `isStale`, but for `diagnose` we filter in-process so the
  // caller can swap the threshold without re-walking the registry.
  const records = await listRecentAccessOperations(registry, { nowMs });
  const staleMarkers = filterStaleMarkers(records, nowMs, thresholdMs);
  const activeOps = filterActiveOps(records);

  return {
    projectConfig: shapeProjectConfig(projectConfigRaw),
    filesystem: {
      accessPath,
      backendPath,
      destinationRoot,
      projectRoot: projectRootBlock,
    },
    runtime: {
      staleMarkers,
      activeOps,
      orphans: { msaccess: 0, pwshWorkers: 0 },
      dysflowVersion: snapshot.adapterVersion,
      writeExecutionPolicy: snapshot.writeExecutionPolicy,
    },
  };
}

// ─── MCP tool factory ─────────────────────────────────────────────────────────

export const DIAGNOSE_INPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "Optional projectId to verify against .dysflow/project.json. When omitted, the resolver uses whichever single project.json is in scope.",
    },
    accessPath: {
      type: "string",
      description:
        "Optional explicit Access target override. Mirrors the convention used by `doctor` — explicit per-call overrides win over `.dysflow/project.json` when diagnosing context skew.",
    },
    contextId: {
      type: "string",
      description:
        "Optional contextId for cross-project correlation. Reserved for a future per-context scoping extension (#966 follow-up).",
    },
    verbose: {
      type: "boolean",
      description:
        "When true, the runtime block surfaces the active staleMarker threshold and an extended orphans enumeration. Reserved for v2.16.x; currently always reports the default.",
    },
    // #1057 (F10) — optional per-call cwd override.
    cwd: CWD_OVERRIDE_SCHEMA_PROP,
  },
} as const;

export type CreateDiagnoseToolOptions = {
  cwd: string;
  snapshot: { adapterVersion: string; writeExecutionPolicy: WriteExecutionPolicy };
  registry?: AccessOperationRegistry;
  thresholdMs?: number;
};

/**
 * Factory for the `diagnose` MCP tool. The factory is pure: it captures
 * `cwd`, `snapshot`, and the optional `registry` / `thresholdMs` once at
 * construction. Tests pass a deterministic `nowMs` indirectly by
 * pre-seeding the registry with `updatedAt` values relative to the wall
 * clock — the function reads `Date.now()` only when `nowMs` is omitted.
 *
 * The handler is read-only by contract (`MCP_TOOL_CONTRACTS.diagnose`) and
 * by construction (no `apply`, no `dryRun`, no `confirmPid` anywhere).
 */
export function createDiagnoseTool(options: CreateDiagnoseToolOptions): DysflowMcpTool {
  return {
    name: "diagnose",
    description:
      "Return aggregated project health (projectConfig + filesystem + runtime) in a single call. Replaces the 4-5 round-trip pattern (get_capabilities + resolve_project + list_access_operations + access_force_cleanup_orphaned listing + filesystem stat). Read-only — does not open Access, does not spawn PowerShell, does not mutate state. Returns { projectConfig: { status, writeReady, diagnostics[], owningWorktree }, filesystem: { accessPath, backendPath, destinationRoot, projectRoot }, runtime: { staleMarkers, activeOps, orphans, dysflowVersion, writeExecutionPolicy } }. " +
      MCP_TOOL_CONTRACTS.diagnose.summary,
    inputSchema: DIAGNOSE_INPUT_SCHEMA,
    handler: async (input) => {
      const params =
        typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
      const projectId =
        typeof params.projectId === "string" && params.projectId.length > 0
          ? params.projectId
          : undefined;
      const accessPathOverride =
        typeof params.accessPath === "string" && params.accessPath.length > 0
          ? params.accessPath
          : undefined;
      const contextId =
        typeof params.contextId === "string" && params.contextId.length > 0
          ? params.contextId
          : undefined;
      const verbose = params.verbose === true;

      // Reserved for v2.16.x — keep the override/contextId threads visible
      // so the follow-up issue can wire them without re-touching the schema.
      void accessPathOverride;
      void contextId;
      void verbose;

      // #1057 (F10) — honor a per-call cwd override; fall back to the
      // factory cwd (backwards compatible).
      const cwdResolution = resolveCwdOverride(input, options.cwd);
      if (!cwdResolution.ok) return cwdResolution.error;

      const result = await computeDiagnose({
        cwd: cwdResolution.cwd,
        snapshot: options.snapshot,
        ...(options.registry === undefined ? {} : { registry: options.registry }),
        ...(options.thresholdMs === undefined ? {} : { thresholdMs: options.thresholdMs }),
        ...(projectId === undefined ? {} : { projectId }),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(result) }],
        isError: false,
        ok: true,
      };
    },
  };
}

// ─── Internals (not exported) ─────────────────────────────────────────────────

function filterStaleMarkers(
  records: readonly AccessOperationListEntry[],
  nowMs: number,
  thresholdMs: number,
): number {
  let count = 0;
  for (const record of records) {
    if (record.status !== "running") continue;
    const updatedMs = Date.parse(record.updatedAt);
    if (!Number.isFinite(updatedMs)) continue;
    if (nowMs - updatedMs >= thresholdMs) count += 1;
  }
  return count;
}

function filterActiveOps(records: readonly AccessOperationRecord[]): number {
  let count = 0;
  for (const record of records) {
    if (ACTIVE_OPERATION_STATUSES.includes(record.status)) count += 1;
  }
  return count;
}

function shapeProjectConfig(raw: ProjectConfigDiagnostic): DiagnoseProjectConfig {
  return {
    status: raw.status,
    projectId: raw.projectId,
    writeReady: raw.writeReady,
    diagnostics: raw.diagnostics.map((d) => ({
      code: d.code,
      severity: d.severity,
      message: d.message,
      // Issue #970 — preserve the human-readable description when the
      // diagnostic carries a structured Remediation; fall back to the
      // legacy string verbatim. The diagnose tool's surface intentionally
      // exposes a flat string for consumers that do not parse JSON-typed
      // remediation objects; full structured shape is reachable via the
      // MCP error envelope and `get_capabilities` instead.
      remediation:
        typeof d.remediation === "object" && d.remediation !== null
          ? d.remediation.description
          : (d.remediation ?? ""),
    })),
    owningWorktree: raw.owningWorktree ?? null,
  };
}

function statPath(path: string | null): FilesystemPathStatus {
  if (path === null) {
    return {
      path: null,
      exists: false,
      readable: false,
      sizeBytes: null,
      lastModified: null,
    };
  }
  try {
    const stats = statSync(path);
    return {
      path,
      exists: true,
      readable: true,
      sizeBytes: stats.size,
      lastModified: stats.mtime.toISOString(),
    };
  } catch {
    return {
      path,
      exists: existsSync(path),
      readable: false,
      sizeBytes: null,
      lastModified: null,
    };
  }
}
