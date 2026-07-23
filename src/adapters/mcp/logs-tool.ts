// `logs` — Issue #973 AI-aware log access.
//
// Read-only MCP tool that surfaces runtime telemetry from `.dysflow/runtime/`
// as structured log entries. The handler is pure: never opens Access, never
// spawns PowerShell, never mutates state. The single filesystem read is
// scoped to `<cwd>/.dysflow/runtime/` — the same boundary the rest of the
// Dysflow MCP adapter uses for project-scoped reads.
//
// Sources:
//   - `operations.json` — every recorded operation (AccessOperationRecord).
//     Records are normalized into LogEntry via a deterministic mapping:
//       timestamp  <- updatedAt
//       level      <- mapped from status (failed/timed_out/abandoned=error,
//                     cleanup_pending=warning, completed/cleaned=info,
//                     others=debug)
//       operationId <- operationId
//       tool       <- action
//       message    <- `${action} (${status})`
//       context    <- metadata
//   - `markers/*.json` — per-operation marker files (best-effort). Each
//     marker file MUST be a JSON object carrying at least `operationId` and
//     `updatedAt`; everything else is best-effort. Malformed files are
//     skipped without throwing (the consumer expects a structured envelope,
//     never a JSON-parse error).
//
// Filtering / pagination happens AFTER the source merge so the consumer sees
// `totalCount` against the post-filter cardinality and `truncated:true`
// when more entries exist past `limit`. `orderBy` defaults to `desc` so the
// most recent events surface first (the AI-friendly default).

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { JsonObjectSchema } from "../../shared/validation/index.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";
import { CWD_OVERRIDE_SCHEMA_PROP, resolveCwdOverride } from "./cwd-override.js";
import type { DysflowMcpTool, McpTextContent, McpToolResult } from "./result-translation.js";

// ─── Public types ─────────────────────────────────────────────────────────────

export type LogLevel = "error" | "warning" | "info" | "debug";

export type LogEntry = {
  timestamp: string;
  level: LogLevel;
  operationId: string;
  tool: string;
  message: string;
  context: Record<string, unknown>;
};

export type LogsOptions = {
  since?: string;
  until?: string;
  level?: LogLevel;
  operationId?: string;
  tool?: string;
  limit?: number;
  orderBy?: "asc" | "desc";
};

export type LogsInput = {
  projectId?: string;
  options?: LogsOptions;
};

export type LogsResult = {
  entries: LogEntry[];
  totalCount: number;
  truncated: boolean;
};

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

// ─── Operations.json shape (subset of AccessOperationRecord) ──────────────────

type OperationStatus =
  | "starting"
  | "running"
  | "completed"
  | "failed"
  | "timed_out"
  | "cleanup_pending"
  | "cleaned"
  | "pid_unknown"
  | "running_untracked"
  | "abandoned";

type OperationAction = "vba" | "query" | "diagnostics" | "import" | "test" | "run";

type OperationRecord = {
  operationId?: unknown;
  action?: unknown;
  status?: unknown;
  updatedAt?: unknown;
  metadata?: unknown;
};

type OperationsFile = {
  records?: unknown;
};

const ERROR_LEVEL_STATUSES: ReadonlySet<OperationStatus> = new Set([
  "failed",
  "timed_out",
  "abandoned",
]);

const WARNING_LEVEL_STATUSES: ReadonlySet<OperationStatus> = new Set(["cleanup_pending"]);

const INFO_LEVEL_STATUSES: ReadonlySet<OperationStatus> = new Set(["completed", "cleaned"]);

function isOperationStatus(value: unknown): value is OperationStatus {
  return (
    typeof value === "string" &&
    [
      "starting",
      "running",
      "completed",
      "failed",
      "timed_out",
      "cleanup_pending",
      "cleaned",
      "pid_unknown",
      "running_untracked",
      "abandoned",
    ].includes(value)
  );
}

function isOperationAction(value: unknown): value is OperationAction {
  return (
    typeof value === "string" &&
    ["vba", "query", "diagnostics", "import", "test", "run"].includes(value)
  );
}

function statusToLevel(status: OperationStatus | undefined): LogLevel {
  if (status === undefined) return "debug";
  if (ERROR_LEVEL_STATUSES.has(status)) return "error";
  if (WARNING_LEVEL_STATUSES.has(status)) return "warning";
  if (INFO_LEVEL_STATUSES.has(status)) return "info";
  return "debug";
}

function isLogLevel(value: unknown): value is LogLevel {
  return value === "error" || value === "warning" || value === "info" || value === "debug";
}

// ─── Source readers ───────────────────────────────────────────────────────────

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function recordMetadata(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function recordToLogEntry(record: OperationRecord): LogEntry | null {
  const operationId = optionalString(record.operationId);
  if (operationId === undefined) return null;
  const action = isOperationAction(record.action) ? record.action : "diagnostics";
  const status = isOperationStatus(record.status) ? record.status : undefined;
  const timestamp = optionalString(record.updatedAt) ?? new Date(0).toISOString();
  const level = statusToLevel(status);
  return {
    timestamp,
    level,
    operationId,
    tool: action,
    message: status === undefined ? `${action}` : `${action} (${status})`,
    context: recordMetadata(record.metadata),
  };
}

async function readOperationsLog(runtimePath: string): Promise<LogEntry[]> {
  const operationsPath = join(runtimePath, "operations.json");
  let raw: string;
  try {
    raw = await readFile(operationsPath, "utf-8");
  } catch {
    return [];
  }
  let parsed: OperationsFile;
  try {
    const value: unknown = JSON.parse(raw);
    if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
    parsed = value as OperationsFile;
  } catch {
    return [];
  }
  const records = parsed.records;
  if (!Array.isArray(records)) return [];
  const entries: LogEntry[] = [];
  for (const rawRecord of records) {
    if (rawRecord === null || typeof rawRecord !== "object" || Array.isArray(rawRecord)) continue;
    const entry = recordToLogEntry(rawRecord as OperationRecord);
    if (entry !== null) entries.push(entry);
  }
  return entries;
}

function markerToLogEntry(parsed: unknown, fallbackOperationId: string): LogEntry | null {
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  const operationId = optionalString(obj.operationId) ?? fallbackOperationId;
  const timestamp = optionalString(obj.updatedAt) ?? new Date(0).toISOString();
  const levelRaw = obj.level;
  const level = isLogLevel(levelRaw)
    ? levelRaw
    : statusToLevel(isOperationStatus(obj.status) ? obj.status : undefined);
  const tool = optionalString(obj.tool) ?? optionalString(obj.action) ?? "marker";
  const message =
    optionalString(obj.message) ??
    (typeof obj.status === "string" ? `${tool} (${obj.status})` : tool);
  return {
    timestamp,
    level,
    operationId,
    tool,
    message,
    context: recordMetadata(obj.context ?? obj.metadata),
  };
}

async function readMarkers(runtimePath: string): Promise<LogEntry[]> {
  const markersPath = join(runtimePath, "markers");
  let names: string[];
  try {
    names = await readdir(markersPath);
  } catch {
    return [];
  }
  const entries: LogEntry[] = [];
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
    const entry = markerToLogEntry(parsed, fallbackId);
    if (entry !== null) entries.push(entry);
  }
  return entries;
}

// ─── Filtering / ordering ─────────────────────────────────────────────────────

function compareTimestamp(a: LogEntry, b: LogEntry, orderBy: "asc" | "desc"): number {
  if (a.timestamp === b.timestamp) return 0;
  const ascending = a.timestamp < b.timestamp ? -1 : 1;
  return orderBy === "asc" ? ascending : -ascending;
}

function withinTimeRange(
  entry: LogEntry,
  since: string | undefined,
  until: string | undefined,
): boolean {
  if (since !== undefined && entry.timestamp < since) return false;
  if (until !== undefined && entry.timestamp > until) return false;
  return true;
}

function applyFilters(entries: LogEntry[], options: LogsOptions | undefined): LogEntry[] {
  if (options === undefined) return entries;
  const { since, until, level, operationId, tool } = options;
  if (
    since === undefined &&
    until === undefined &&
    level === undefined &&
    operationId === undefined &&
    tool === undefined
  ) {
    return entries;
  }
  return entries.filter((entry) => {
    if (!withinTimeRange(entry, since, until)) return false;
    if (level !== undefined && entry.level !== level) return false;
    if (operationId !== undefined && entry.operationId !== operationId) return false;
    if (tool !== undefined && entry.tool !== tool) return false;
    return true;
  });
}

function clampLimit(value: number | undefined): number {
  if (value === undefined || Number.isNaN(value)) return DEFAULT_LIMIT;
  const integer = Math.floor(value);
  if (integer <= 0) return DEFAULT_LIMIT;
  return Math.min(integer, MAX_LIMIT);
}

// ─── Pure helper ──────────────────────────────────────────────────────────────

/**
 * Read `.dysflow/runtime/` from `cwd`, apply `options`, and return a
 * structured `LogsResult`. Never throws — every filesystem or JSON-parse
 * failure is translated into an empty `entries` array so the consumer can
 * branch on `totalCount` instead of catching.
 *
 * @param input - caller-supplied filters / pagination. All fields optional.
 * @param cwd   - absolute path to scan. Tests pass a `mkdtempSync` directory;
 *                production calls pass `process.cwd()`.
 */
export async function tryReadLogs(input: LogsInput, cwd: string): Promise<LogsResult> {
  const runtimePath = join(cwd, ".dysflow", "runtime");
  const options = input.options;

  const [operationsEntries, markerEntries] = await Promise.all([
    readOperationsLog(runtimePath),
    readMarkers(runtimePath),
  ]);

  const merged: LogEntry[] = [...operationsEntries, ...markerEntries];
  const filtered = applyFilters(merged, options);

  const orderBy = options?.orderBy ?? "desc";
  const ordered = [...filtered].sort((a, b) => compareTimestamp(a, b, orderBy));

  const limit = clampLimit(options?.limit);
  const entries = ordered.slice(0, limit);
  const totalCount = ordered.length;
  const truncated = totalCount > entries.length;

  return { entries, totalCount, truncated };
}

// ─── MCP tool factory ─────────────────────────────────────────────────────────

export const LOGS_TOOL_SCHEMA: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    projectId: {
      type: "string",
      description:
        "Canonical project identity for traceability. The logs source is always <cwd>/.dysflow/runtime/; projectId is echoed back in the result envelope (for future per-project scoping).",
    },
    // #1057 (F10) — optional per-call cwd override.
    cwd: CWD_OVERRIDE_SCHEMA_PROP,
    options: {
      type: "object",
      additionalProperties: false,
      properties: {
        since: {
          type: "string",
          description: "ISO 8601 timestamp. Entries with timestamp < since are excluded.",
        },
        until: {
          type: "string",
          description: "ISO 8601 timestamp. Entries with timestamp > until are excluded.",
        },
        level: {
          type: "string",
          enum: ["error", "warning", "info", "debug"],
          description: "Filter by log level.",
        },
        operationId: {
          type: "string",
          description: "Filter to a single operationId.",
        },
        tool: {
          type: "string",
          description: "Filter by tool/action (e.g. vba, query, diagnostics).",
        },
        limit: {
          type: "number",
          minimum: 1,
          maximum: MAX_LIMIT,
          description: `Maximum entries to return. Defaults to ${DEFAULT_LIMIT}; capped at ${MAX_LIMIT}.`,
        },
        orderBy: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order by timestamp. Defaults to desc (most recent first).",
        },
      },
    },
  },
};

/**
 * Factory for the `logs` MCP tool. Pure: `cwd` is captured once at
 * construction and the handler reads it on every invocation. Tests pass a
 * `mkdtempSync` directory so the integration exercise does not depend on
 * `process.cwd()`.
 *
 * The handler is read-only: it never opens Access, never spawns
 * PowerShell, and never mutates state. Every filesystem read is scoped to
 * `<cwd>/.dysflow/runtime/`.
 */
export function createLogsTool(opts: { cwd: string }): DysflowMcpTool {
  return {
    name: "logs",
    description:
      "Return runtime log entries from `.dysflow/runtime/` as a structured envelope. Sources: operations.json (recorded operations) + markers/*.json (per-operation markers). Filter by since/until/level/operationId/tool; limit defaults to 100, capped at 1000; orderBy defaults to desc (most recent first). Response: { entries: LogEntry[], totalCount, truncated }. Each LogEntry carries { timestamp, level, operationId, tool, message, context }. Read-only — never opens Access, never spawns PowerShell, never mutates state. " +
      MCP_TOOL_CONTRACTS.logs.summary,
    inputSchema: LOGS_TOOL_SCHEMA,
    handler: async (input): Promise<McpToolResult> => {
      const params =
        typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
      const projectId =
        typeof params.projectId === "string" && params.projectId.length > 0
          ? params.projectId
          : undefined;
      const options =
        params.options !== null &&
        typeof params.options === "object" &&
        !Array.isArray(params.options)
          ? (params.options as LogsOptions)
          : undefined;

      // #1057 (F10) — honor a per-call cwd override; fall back to the
      // factory cwd (backwards compatible).
      const cwdResolution = resolveCwdOverride(input, opts.cwd);
      if (!cwdResolution.ok) return cwdResolution.error;
      const result = await tryReadLogs({ projectId, options }, cwdResolution.cwd);
      const content: McpTextContent[] = [{ type: "text", text: JSON.stringify(result) }];
      return { content, isError: false, ok: true };
    },
  };
}
