// `state` — Issue #978 runtime operational state.
//
// Read-only MCP tool that surfaces the runtime operational state of a
// dysflow project: which operations are pending/running, which markers
// are on disk, and rolling 24h counters. The handler is pure: never
// opens Access, never spawns PowerShell, never mutates state.
//
// Pairing:
//   - `resolve_project` (config diagnosis) — "is the project wired?"
//   - `diagnose`           (project health) — "is the project healthy?"
//   - `logs`               (event timeline) — "what happened?"
//   - `state` (this tool)  (live snapshot)  — "what is happening now?"
//
// Sources:
//   1. AccessOperationRegistry (in-memory or file-backed). `listRecent`
//      yields the most-recent records up to
//      DEFAULT_RECENT_ACCESS_OPERATION_LIMIT (50); each record is
//      normalized into an OperationEntry. Pure delegation — no rewrite
//      of registry logic, just a typed mapper.
//   2. `.dysflow/runtime/markers/*.json` (best-effort). Each marker MUST
//      be a JSON object carrying at least `operationId` and `updatedAt`;
//      the implementation accepts the flat `{...}` shape AND the wrapped
//      `{marker:{...}}` shape (matches what `findRunningOperations` and
//      the #976 cleanup services already tolerate).
//   3. `.dysflow/runtime/operations.json` (file-backed operations log).
//      Cross-references `list_access_operations`. Not the same as the
//      in-memory registry — the file-backed registry persists across MCP
//      restarts; the in-memory one is per-process. We expose the
//      in-memory registry today (matches the live `list_access_operations`
//      behavior); the file-backed registry stays available via the same
//      seam.
//
// The 24h counters aggregate over the registry's records (the registry
// is the source of truth for succeeded/failed/abandoned status). The
// `totalOperations` field reports the registry's full cardinality so a
// consumer can sanity-check the 24h slice.
//
// The `locks` array is reserved for a future lock-registry split (the
// schema-level file-lock inventory that backs #957/#958/#967); today
// it is an empty array. The shape is documented so a follow-up issue
// can populate it without a schema break.

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type AccessOperationRecord,
  type AccessOperationRegistry,
  type AccessOperationStatus,
  DEFAULT_RECENT_ACCESS_OPERATION_LIMIT,
  resolveAccessOperationRegistry,
} from "../../core/operations/access-operation-registry.js";
import { CWD_OVERRIDE_SCHEMA_PROP, resolveCwdOverride } from "./cwd-override.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";
import type { DysflowMcpTool, McpTextContent, McpToolResult } from "./result-translation.js";
import type { JsonObjectSchema } from "./schemas.js";

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Documented input shape for `dysflow.state`. `projectId` is reserved
 * for a future per-project scoping extension (#966 follow-up); the
 * current implementation returns the global state regardless of the
 * supplied `projectId` (mirrors `schema` and `resolve_project`).
 */
export type StateInput = {
  projectId?: string;
};

/**
 * Documented `operations` entry shape. Mirrors the AccessOperationRecord
 * shape (operationId, action, accessPath, status, metadata, …) but
 * exposes the registry-canonical fields an AI consumer needs and renames
 * `action` to `tool` so the surface reads naturally as "operations
 * recorded by tool X".
 *
 * `startedAt` falls back to `updatedAt` when `processStartTime` is null
 * (pre-process records, e.g. operations that completed before PID
 * capture).
 */
export type OperationEntry = {
  operationId: string;
  tool: string;
  status: AccessOperationStatus;
  startedAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
};

/**
 * Documented `markers` entry shape. `ageMinutes` is computed at read
 * time relative to `nowMs` (defaults to `Date.now()`) so the same
 * payload, queried 5 minutes apart, reports different ages.
 */
export type MarkerEntry = {
  operationId: string;
  action: string;
  status: string;
  updatedAt: string;
  ageMinutes: number;
};

/**
 * Documented `locks` entry shape. Reserved for the future lock-registry
 * split (file-level mutex inventory). Today the array is empty.
 */
export type LockEntry = {
  lockId: string;
  resource: string;
  acquiredAt: string;
  acquiredBy: string;
};

/**
 * Documented `counters` shape. `totalOperations` reports the registry's
 * full cardinality; the `*Last24h` fields slice by `nowMs - updatedAt
 * <= 24h` against the documented status set.
 */
export type Counters = {
  totalOperations: number;
  succeededLast24h: number;
  failedLast24h: number;
  abandonedLast24h: number;
};

/**
 * Top-level result envelope. The four top-level fields are required;
 * each is populated by a deterministic source so the consumer can rely
 * on the shape without consulting docs.
 */
export type StateResult = {
  operations: OperationEntry[];
  markers: MarkerEntry[];
  locks: LockEntry[];
  counters: Counters;
};

// ─── Constants ────────────────────────────────────────────────────────────────

/** ISO 8601 cutoff for the 24h counter slice. */
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/** Statuses that count toward `succeededLast24h`. */
const SUCCEEDED_STATUSES: ReadonlySet<AccessOperationStatus> = new Set(["completed", "cleaned"]);

/** Statuses that count toward `failedLast24h`. */
const FAILED_STATUSES: ReadonlySet<AccessOperationStatus> = new Set(["failed", "timed_out"]);

/** Statuses that count toward `abandonedLast24h`. */
const ABANDONED_STATUSES: ReadonlySet<AccessOperationStatus> = new Set(["abandoned"]);

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function recordMetadata(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function operationRecordToEntry(record: AccessOperationRecord): OperationEntry {
  const updatedAt = optionalString(record.updatedAt) ?? new Date(0).toISOString();
  const startedAt = optionalString(record.processStartTime) ?? updatedAt;
  return {
    operationId: record.operationId,
    tool: record.action,
    status: record.status,
    startedAt,
    updatedAt,
    metadata: recordMetadata(record.metadata),
  };
}

function parseIsoMs(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function computeAgeMinutes(updatedAtMs: number, nowMs: number): number {
  const deltaMs = Math.max(0, nowMs - updatedAtMs);
  return Math.round(deltaMs / 60000);
}

function markerToEntry(
  parsed: unknown,
  fallbackOperationId: string,
  nowMs: number,
): MarkerEntry | null {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  const inner =
    obj.marker !== null && typeof obj.marker === "object" && !Array.isArray(obj.marker)
      ? (obj.marker as Record<string, unknown>)
      : obj;
  const operationId = optionalString(inner.operationId) ?? fallbackOperationId;
  const updatedAtRaw = optionalString(inner.updatedAt);
  const updatedAtMs = parseIsoMs(updatedAtRaw);
  if (updatedAtMs === null) return null;
  const updatedAt = updatedAtRaw ?? new Date(updatedAtMs).toISOString();
  const action = optionalString(inner.action) ?? "marker";
  const status = optionalString(inner.status) ?? "unknown";
  return {
    operationId,
    action,
    status,
    updatedAt,
    ageMinutes: computeAgeMinutes(updatedAtMs, nowMs),
  };
}

async function readMarkers(cwd: string, nowMs: number): Promise<MarkerEntry[]> {
  const markersPath = join(cwd, ".dysflow", "runtime", "markers");
  let names: string[];
  try {
    names = await readdir(markersPath);
  } catch {
    return [];
  }
  const entries: MarkerEntry[] = [];
  for (const name of names) {
    if (!name.toLowerCase().endsWith(".json")) continue;
    const filePath = join(markersPath, name);
    let raw: string;
    try {
      raw = await readFile(filePath, "utf-8");
    } catch {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const fallbackId = name.slice(0, -".json".length);
    const entry = markerToEntry(parsed, fallbackId, nowMs);
    if (entry !== null) entries.push(entry);
  }
  return entries;
}

function computeCounters(records: readonly AccessOperationRecord[], nowMs: number): Counters {
  const counters: Counters = {
    totalOperations: records.length,
    succeededLast24h: 0,
    failedLast24h: 0,
    abandonedLast24h: 0,
  };
  for (const record of records) {
    const updatedAtMs = parseIsoMs(record.updatedAt);
    if (updatedAtMs === null) continue;
    if (nowMs - updatedAtMs > TWENTY_FOUR_HOURS_MS) continue;
    if (SUCCEEDED_STATUSES.has(record.status)) counters.succeededLast24h += 1;
    else if (FAILED_STATUSES.has(record.status)) counters.failedLast24h += 1;
    else if (ABANDONED_STATUSES.has(record.status)) counters.abandonedLast24h += 1;
  }
  return counters;
}

// ─── Pure aggregator ──────────────────────────────────────────────────────────

export type BuildStateOptions = {
  /** Absolute path to scan for `<.dysflow>/runtime/markers/*.json`. */
  cwd: string;
  /** Access operation registry. */
  registry: AccessOperationRegistry;
  /** Inject the wall clock. Defaults to `Date.now()`. */
  nowMs?: number;
};

/**
 * Build the runtime state snapshot. Pure function — never opens Access,
 * never spawns PowerShell, never mutates state. The `cwd` is consumed
 * for marker reads; the registry is consumed for operations and
 * counters.
 *
 * @param opts - cwd + registry + optional `nowMs`.
 * @returns A `StateResult` whose four fields are always present.
 */
export async function buildStateResult(opts: BuildStateOptions): Promise<StateResult> {
  const nowMs = opts.nowMs ?? Date.now();
  const [records, markers] = await Promise.all([
    opts.registry.listRecent({ limit: DEFAULT_RECENT_ACCESS_OPERATION_LIMIT }),
    readMarkers(opts.cwd, nowMs),
  ]);
  return {
    operations: records.map(operationRecordToEntry),
    markers,
    locks: [],
    counters: computeCounters(records, nowMs),
  };
}

// ─── MCP tool factory ─────────────────────────────────────────────────────────

export const STATE_TOOL_SCHEMA: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "Optional projectId. Reserved for a future per-project scoping extension (#966 follow-up). The current state snapshot is global.",
    },
    // #1057 (F10) — optional per-call cwd override.
    cwd: CWD_OVERRIDE_SCHEMA_PROP,
  },
};

/**
 * Factory for the `state` MCP tool. Pure: `cwd` is captured once at
 * construction and the handler reads it on every invocation. The
 * `registry` is resolved at factory time so the handler can be sync-fast
 * on the operations path; tests inject an in-memory registry while
 * production wires the file-backed registry the same way `list_access_operations`
 * does.
 *
 * The handler is read-only — it never opens Access, never spawns
 * PowerShell, and never mutates state. Every filesystem read is scoped
 * to `<cwd>/.dysflow/runtime/markers/`.
 */
export function createStateTool(opts: BuildStateOptions): DysflowMcpTool {
  // Resolve once so the fallback (caller omitted the registry) is a
  // single in-memory instance per factory — matches the
  // `resolveAccessOperationRegistry` contract used by every other tool
  // that consults the registry.
  const registry = resolveAccessOperationRegistry(opts.registry);
  return {
    name: "state",
    description:
      "Return the runtime operational state of a dysflow project: `{ operations, markers, locks, counters }`. `operations` lists every record from the access operation registry (cross-ref `list_access_operations`) normalized to `{ operationId, tool, status, startedAt, updatedAt, metadata }`. `markers` enumerates `<cwd>/.dysflow/runtime/markers/*.json` with `ageMinutes` computed against the wall clock. `counters` reports `totalOperations` plus `succeededLast24h` / `failedLast24h` / `abandonedLast24h` slices. `locks` is reserved for a future lock-registry split (#967 follow-up); today it is empty. Read-only — never opens Access, never spawns PowerShell, never mutates state. Pairs with `resolve_project` (config), `diagnose` (health), `logs` (event timeline). " +
      MCP_TOOL_CONTRACTS.state.summary,
    inputSchema: STATE_TOOL_SCHEMA,
    handler: async (input): Promise<McpToolResult> => {
      const params =
        typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
      const projectId =
        typeof params.projectId === "string" && params.projectId.length > 0
          ? params.projectId
          : undefined;
      // #1057 (F10) — honor a per-call cwd override; fall back to the
      // factory cwd (backwards compatible).
      const cwdResolution = resolveCwdOverride(input, opts.cwd);
      if (!cwdResolution.ok) return cwdResolution.error;
      const result = await buildStateResult({
        cwd: cwdResolution.cwd,
        registry,
        nowMs: opts.nowMs,
      });
      // Echo projectId for symmetry with `schema` and `resolve_project` —
      // the global state is unaffected by `projectId` today but the
      // envelope stays stable for a future per-project extension.
      void projectId;
      const content: McpTextContent[] = [{ type: "text", text: JSON.stringify(result) }];
      return { content, isError: false, ok: true };
    },
  };
}
