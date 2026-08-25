import { logsResultContract } from "./contracts/bootstrap-result-contracts.js";
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
import type { InvocationTelemetryEntry } from "../../core/telemetry/invocation-telemetry.js";
import { type JsonObjectSchema, PROJECT_IDENTITY_BLOCK } from "../../shared/validation/index.js";
import { CWD_OVERRIDE_SCHEMA_PROP, resolveCwdOverride } from "./cwd-override.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";
import type { DysflowMcpTool, McpTextContent, McpToolResult } from "./result-translation.js";

// ─── Public types ─────────────────────────────────────────────────────────────

export type LogLevel = "error" | "warning" | "info" | "debug";

export type LogEntry = {
  timestamp: string;
  level: LogLevel;
  operationId: string | null;
  tool: string;
  action: string;
  message: string;
  context: Record<string, unknown>;
};

export type LogsOptions = {
  since?: string;
  until?: string;
  level?: LogLevel;
  operationId?: string;
  tool?: string;
  action?: string;
  groupBy?: "tool";
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
  aggregate?: {
    calls: {
      confirmationRequired: number;
      confirmationProvided: number;
    };
    tools: Array<{
      tool: string;
      calls: number;
      errors: number;
      contractErrors: number;
      runtimeErrors: number;
      p50Ms: number;
      p95Ms: number;
      lastUsed: string;
    }>;
    rejectedParams: Array<{ parameter: string; count: number }>;
    missingParams: Array<{ parameter: string; count: number }>;
    warnings: {
      byCode: Array<{ code: string; count: number }>;
    };
  };
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
    action,
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
    action: optionalString(obj.action) ?? tool,
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

function isInvocationTelemetryEntry(value: unknown): value is InvocationTelemetryEntry {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.timestamp === "string" &&
    typeof record.tool === "string" &&
    typeof record.action === "string" &&
    (record.operationId === null || typeof record.operationId === "string") &&
    (record.projectId === null || typeof record.projectId === "string") &&
    (record.outcome === "ok" || record.outcome === "error") &&
    (record.failureClass === "contract" ||
      record.failureClass === "runtime" ||
      record.failureClass === "none") &&
    (record.errorCode === null || typeof record.errorCode === "string") &&
    typeof record.durationMs === "number" &&
    (record.writeIntent === "apply" ||
      record.writeIntent === "dryRun" ||
      record.writeIntent === "read") &&
    Array.isArray(record.paramNamesPresent) &&
    record.paramNamesPresent.every((name) => typeof name === "string") &&
    (record.missingParams === undefined ||
      (Array.isArray(record.missingParams) &&
        record.missingParams.every((name) => typeof name === "string"))) &&
    Array.isArray(record.rejectedParams) &&
    record.rejectedParams.every((name) => typeof name === "string") &&
    (record.unknownToolName === null || typeof record.unknownToolName === "string") &&
    (record.warningCodes === undefined ||
      (Array.isArray(record.warningCodes) &&
        record.warningCodes.every((code) => typeof code === "string")))
  );
}

function invocationToLogEntry(record: InvocationTelemetryEntry): LogEntry {
  return {
    timestamp: record.timestamp,
    level: record.outcome === "error" ? "error" : "info",
    operationId: record.operationId,
    tool: record.tool,
    action: record.action,
    message: `${record.tool} (${record.outcome})`,
    context: {
      outcome: record.outcome,
      failureClass: record.failureClass,
      errorCode: record.errorCode,
      durationMs: record.durationMs,
      writeIntent: record.writeIntent,
      projectId: record.projectId,
      paramNamesPresent: record.paramNamesPresent,
      missingParams: record.missingParams,
      rejectedParams: record.rejectedParams,
      unknownToolName: record.unknownToolName,
      warningCodes: record.warningCodes ?? [],
    },
  };
}

async function readInvocationLog(
  runtimePath: string,
): Promise<Array<{ entry: LogEntry; record: InvocationTelemetryEntry }>> {
  let names: string[];
  try {
    names = (await readdir(runtimePath))
      .filter((name) => /^invocations\.jsonl(?:\.\d+)?$/.test(name))
      .sort();
  } catch {
    return [];
  }
  const records: Array<{ entry: LogEntry; record: InvocationTelemetryEntry }> = [];
  for (const name of names) {
    let raw: string;
    try {
      raw = await readFile(join(runtimePath, name), "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split(/\r?\n/)) {
      if (line.trim().length === 0) continue;
      try {
        const parsed: unknown = JSON.parse(line);
        if (!isInvocationTelemetryEntry(parsed)) continue;
        const record = {
          ...parsed,
          missingParams: parsed.missingParams ?? [],
        };
        records.push({ entry: invocationToLogEntry(record), record });
      } catch {}
    }
  }
  return records;
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
  const { since, until, level, operationId, tool, action } = options;
  if (
    since === undefined &&
    until === undefined &&
    level === undefined &&
    operationId === undefined &&
    tool === undefined &&
    action === undefined
  ) {
    return entries;
  }
  return entries.filter((entry) => {
    if (!withinTimeRange(entry, since, until)) return false;
    if (level !== undefined && entry.level !== level) return false;
    if (operationId !== undefined && entry.operationId !== operationId) return false;
    if (tool !== undefined && entry.tool !== tool) return false;
    if (action !== undefined && entry.action !== action) return false;
    return true;
  });
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(ordered.length * ratio) - 1)] ?? 0;
}

export function buildInvocationAggregate(
  records: InvocationTelemetryEntry[],
): NonNullable<LogsResult["aggregate"]> {
  const perTool = new Map<string, InvocationTelemetryEntry[]>();
  const rejected = new Map<string, number>();
  const missing = new Map<string, number>();
  const warnings = new Map<string, number>();
  for (const record of records) {
    const bucket = perTool.get(record.tool) ?? [];
    bucket.push(record);
    perTool.set(record.tool, bucket);
    for (const parameter of record.rejectedParams) {
      rejected.set(parameter, (rejected.get(parameter) ?? 0) + 1);
    }
    for (const parameter of record.missingParams) {
      missing.set(parameter, (missing.get(parameter) ?? 0) + 1);
    }
    for (const code of record.warningCodes ?? []) {
      warnings.set(code, (warnings.get(code) ?? 0) + 1);
    }
  }
  const tools = [...perTool.entries()]
    .map(([tool, bucket]) => ({
      tool,
      calls: bucket.length,
      errors: bucket.filter((record) => record.outcome === "error").length,
      contractErrors: bucket.filter((record) => record.failureClass === "contract").length,
      runtimeErrors: bucket.filter((record) => record.failureClass === "runtime").length,
      p50Ms: percentile(
        bucket.map((record) => record.durationMs),
        0.5,
      ),
      p95Ms: percentile(
        bucket.map((record) => record.durationMs),
        0.95,
      ),
      lastUsed: bucket.reduce(
        (latest, record) => (record.timestamp > latest ? record.timestamp : latest),
        "",
      ),
    }))
    .sort((left, right) => right.calls - left.calls || left.tool.localeCompare(right.tool));
  const rejectedParams = [...rejected.entries()]
    .map(([parameter, count]) => ({ parameter, count }))
    .sort(
      (left, right) => right.count - left.count || left.parameter.localeCompare(right.parameter),
    );
  const missingParams = [...missing.entries()]
    .map(([parameter, count]) => ({ parameter, count }))
    .sort(
      (left, right) => right.count - left.count || left.parameter.localeCompare(right.parameter),
    );
  const calls = {
    confirmationRequired: records.filter((record) => record.errorCode === "CONFIRMATION_REQUIRED")
      .length,
    confirmationProvided: records.filter(
      (record) =>
        record.paramNamesPresent.includes("implements_check") &&
        record.paramNamesPresent.includes("confirmedRequiresConfirmation"),
    ).length,
  };
  const byCode = [...warnings.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
  return { calls, tools, rejectedParams, missingParams, warnings: { byCode } };
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

  const [operationsEntries, markerEntries, invocationPairs] = await Promise.all([
    readOperationsLog(runtimePath),
    readMarkers(runtimePath),
    readInvocationLog(runtimePath),
  ]);

  const merged: LogEntry[] = [
    ...operationsEntries,
    ...markerEntries,
    ...invocationPairs.map(({ entry }) => entry),
  ];
  const filtered = applyFilters(merged, options);

  const orderBy = options?.orderBy ?? "desc";
  const ordered = [...filtered].sort((a, b) => compareTimestamp(a, b, orderBy));

  const limit = clampLimit(options?.limit);
  const entries = ordered.slice(0, limit);
  const totalCount = ordered.length;
  const truncated = totalCount > entries.length;

  const aggregate =
    options?.groupBy === "tool"
      ? buildInvocationAggregate(
          invocationPairs
            .filter(({ entry }) => applyFilters([entry], options).length === 1)
            .map(({ record }) => record),
        )
      : undefined;

  return {
    entries,
    totalCount,
    truncated,
    ...(aggregate === undefined ? {} : { aggregate }),
  };
}

// ─── MCP tool factory ─────────────────────────────────────────────────────────

export const LOGS_TOOL_SCHEMA: JsonObjectSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    // Issue #1076 — compose the shared ProjectIdentity block so the
    // consumer-facing description matches every other tool that uses
    // this atom.
    ...PROJECT_IDENTITY_BLOCK,
    // #1057 (F10) — optional per-call cwd override.
    cwd: CWD_OVERRIDE_SCHEMA_PROP,
    options: {
      type: "object",
      description:
        "Optional log query controls: since, until, level, operationId, real MCP tool, coarse action, aggregate grouping, limit, and orderBy. Defaults to limit 100 and newest-first order; limit is capped at 1000. Unknown keys or invalid enum values are rejected by the schema.",
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
          description:
            "Filter by the exact MCP tool name (for example query_sql or import_modules).",
        },
        action: {
          type: "string",
          description:
            "Filter by the coarse compatibility action family (for example vba, query, diagnostics, import, test, or run).",
        },
        groupBy: {
          type: "string",
          enum: ["tool"],
          description:
            "Return aggregate per-tool call/error/latency statistics, warning counts by code, plus rejected and omitted-required parameter frequencies.",
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
    resultContract: logsResultContract,
    description:
      "Return runtime log entries from `.dysflow/runtime/` as a structured envelope. Sources: invocations.jsonl (real MCP attempts), operations.json (lock ledger), and markers/*.json. Filter exact tool and coarse action independently; groupBy:'tool' adds per-tool counts, split errors, latency percentiles, last use, warning counts by code, and rejected/omitted-required parameter frequencies. Read-only — never opens Access, never spawns PowerShell, never mutates state. " +
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
