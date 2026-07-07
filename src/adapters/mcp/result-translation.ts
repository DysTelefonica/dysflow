import type {
  AccessQueryRequest,
  AccessVbaRequest,
  OperationResult,
  VbaSyncPort,
} from "../../core/contracts/index.js";
import type { AccessCleanupResult } from "../../core/operations/access-operation-cleanup.js";
import type { AccessOperationRegistry } from "../../core/operations/access-operation-registry.js";
import type {
  AccessOrphanCandidate,
  AccessOrphanCleanupResult,
} from "../../core/operations/access-orphan-cleanup.js";
import type { AccessDiagnosticsRequest } from "../../core/runner/access-runner.js";
import type { AccessDiagnosticsResult } from "../../core/services/diagnostics-service.js";
import type { AccessQueryResult } from "../../core/services/query-service.js";
import type { AccessVbaResult } from "../../core/services/vba-service.js";
import {
  getHumanCompileState,
  HUMAN_COMPILE_REMINDER_TEXT,
  isHumanCompilePending,
} from "../../core/runtime/human-compile-state.js";
import { sanitizeMcpErrorMessage } from "../../core/utils/sanitize-error.js";
import type { JsonObjectSchema } from "./schemas.js";
import type { McpToolContext } from "./types.js";

// Re-export sanitizeMcpErrorMessage so the adapter layer can import it from here.
export { sanitizeMcpErrorMessage } from "../../core/utils/sanitize-error.js";

export type McpTextContent = {
  type: "text";
  text: string;
};

export type McpToolError = {
  code: string;
  message: string;
  /**
   * Optional remediation hint surfaced on gate-rejection envelopes (#659).
   * When present, the hint names the next action a consumer should take
   * (e.g. "call dysflow_get_capabilities to introspect the allowlist").
   */
  remediation?: string;
  /**
   * Optional allowlist surfaced when the rejection is an allowlist
   * membership check (#659). Equals the array that was active at the time
   * of the call — verbatim, NOT a snapshot — so a consumer can branch on
   * its contents without a second round-trip to `dysflow_get_capabilities`.
   */
  allowedProcedures?: readonly string[];
};

export type McpToolResult = {
  content: readonly McpTextContent[];
  isError: boolean;
  /**
   * Mirror of `!isError` exposed for contract-style consumers (#616 slice 3).
   * Optional for backward compatibility with literal `{ content, isError }`
   * construction sites across the test suite; new dispatch surfaces populate it
   * explicitly. When omitted, treat `ok = !isError`.
   */
  ok?: boolean;
  /**
   * Structured error envelope (#659). Populated by gate-rejection helpers
   * (e.g. `procedureNotAllowed`) so consumers can branch on `error.code`
   * instead of regex-matching the legacy `content[0].text` body. The
   * `content[0].text` body still carries the same `<CODE>: <message>`
   * prefix for backward compatibility with regex consumers.
   */
  error?: McpToolError;
};

export type DysflowMcpTool = {
  name: string;
  description: string;
  inputSchema?: JsonObjectSchema;
  /**
   * When true, this tool is excluded from the tools/list MCP projection while its
   * handler stays callable via tools/call. Per the zero-hidden-tools policy (#510),
   * no registered tool currently sets this; it is retained only as the mechanism a
   * future pending/stub tool would use, derived from the parity registry (#433).
   */
  hidden?: boolean;
  handler(input: unknown, context?: McpToolContext): Promise<McpToolResult>;
};

export type DysflowMcpServices = {
  vbaService: {
    execute(
      request: AccessVbaRequest,
      onProgress?: (percent: number, total?: number, message?: string) => void,
    ): Promise<OperationResult<AccessVbaResult>>;
  };
  queryService: {
    execute(
      request: AccessQueryRequest,
      onProgress?: (percent: number, total?: number, message?: string) => void,
    ): Promise<OperationResult<AccessQueryResult>>;
  };
  diagnosticsService: {
    run(request?: AccessDiagnosticsRequest): Promise<OperationResult<AccessDiagnosticsResult>>;
  };
  /** Optional registry override. When omitted, MCP operation-list tools intentionally use Dysflow's default process-local registry. */
  operationRegistry?: AccessOperationRegistry;
  cleanupService?: {
    cleanup(request: {
      operationId: string;
      accessPath: string;
      force?: boolean;
    }): Promise<OperationResult<AccessCleanupResult>>;
  };
  orphanCleanupService?: {
    listOrphans(request: {
      accessPath?: string;
      projectRoot?: string;
    }): Promise<OperationResult<AccessOrphanCandidate[]>>;
    cleanupOrphan(request: {
      accessPath: string;
      projectRoot: string;
      confirmPid: number;
    }): Promise<OperationResult<AccessOrphanCleanupResult>>;
  };
  /** Injected adapter for VBA sync tool dispatch. See VbaSyncPort in core/contracts. */
  vbaSyncToolService?: VbaSyncPort;
};

export type McpWriteAccessResolver = (input: unknown) => Promise<boolean>;

export type McpAccessContext = {
  accessPath: string;
  projectRoot: string;
  destinationRoot?: string;
};

export type McpAccessContextResolver = (
  input: unknown,
) => Promise<OperationResult<McpAccessContext>>;

export function translateCoreResultToMcpContent<TData>(
  result: OperationResult<TData>,
  secrets?: readonly string[],
): McpToolResult {
  if (!result.ok) {
    return {
      content: [
        {
          type: "text",
          text: `${result.error.code}: ${sanitizeMcpErrorMessage(result.error.message, secrets)}`,
        },
      ],
      isError: true,
      ok: false,
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result.data) }],
    isError: false,
    ok: true,
  };
}

/**
 * Builds the explicit secret list for a maintenance error sink, mirroring the
 * HTTP adapter which filters non-empty secret values before sanitizeSecrets.
 * Returns undefined when no secret is in scope so the sink falls back to the
 * heuristic-only path.
 */
export function resolveInScopeSecrets(
  ...values: readonly (string | undefined)[]
): string[] | undefined {
  const secrets = values.filter((v): v is string => typeof v === "string" && v.length > 0);
  return secrets.length > 0 ? secrets : undefined;
}

// ─── Human-compile reminder (v1.20.0, issue #762) ──────────────────────────

/**
 * Tools whose successful result carries the `humanCompileReminder` field
 * when the per-project `humanCompilePending` flag is set. Read-only tools
 * (export, list, verify, query-read) are intentionally excluded — the
 * reminder only applies to "I'm about to test" or "I just changed the binary"
 * tool surfaces.
 */
const HUMAN_COMPILE_REMINDER_TOOLS: ReadonlySet<string> = new Set([
  "import_modules",
  "import_all",
  "delete_module",
  "test_vba",
  "run_vba",
  "dysflow_vba_execute",
]);

/**
 * PR-1 (issue #762) — wrap a translated `McpToolResult` to add the
 * `humanCompileReminder` field when:
 *   1. The tool is one of the reminder-bearing tools.
 *   2. The result is a successful (`ok: true`) envelope.
 *   3. The structured data is NOT a `dryRun: true` plan-shaped result
 *      (reminders are only surfaced for real operations).
 *   4. The per-project `humanCompilePending` flag is set.
 *
 * The field carries the reminder text with the actual `lastPersistenceAt`
 * ISO timestamp substituted for the `<ISO timestamp>` placeholder, so a
 * consumer can grep for `DYSFLOW_HUMAN_COMPILE_REMINDER` in logs and read
 * the persistence timestamp directly off the structured result.
 *
 * Reminder emission is additive: failures keep their `<CODE>: <message>`
 * envelope verbatim, and existing consumers that ignore the new field keep
 * working unchanged.
 */
export function withHumanCompileReminder(
  result: McpToolResult,
  options: { toolName: string; accessPath: string },
): McpToolResult {
  if (result.isError || result.ok === false) return result;
  if (!HUMAN_COMPILE_REMINDER_TOOLS.has(options.toolName)) return result;
  if (typeof options.accessPath !== "string" || options.accessPath.length === 0) return result;
  if (!isHumanCompilePending(options.accessPath)) return result;

  const first = result.content[0];
  if (first === undefined) return result;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(first.text) as Record<string, unknown>;
  } catch {
    // Non-JSON success content (rare — produced by inline paths). Skip.
    return result;
  }
  // Skip plan-shaped (dry-run) results — the runtime did NOT persist, so the
  // reminder must not surface ("the user has nothing new to compile yet").
  if (parsed.dryRun === true) return result;

  const state = getHumanCompileState(options.accessPath);
  if (state.lastPersistenceAt === undefined) return result;

  const reminder = HUMAN_COMPILE_REMINDER_TEXT.replace(
    "<ISO timestamp>",
    state.lastPersistenceAt.toISOString(),
  );
  return {
    ...result,
    content: [
      {
        type: "text",
        text: JSON.stringify({ ...parsed, humanCompileReminder: reminder }),
      },
    ],
  };
}

/**
 * Extract the access path from a tool input. Accepts the explicit override
 * fields (`accessPath`, `accessDbPath`, `databasePath`, `sourcePath`) that
 * the MCP wire protocol allows, so the reminder emitter works regardless of
 * which alias the caller used.
 */
export function extractAccessPathFromInput(input: unknown): string | undefined {
  if (typeof input !== "object" || input === null) return undefined;
  const obj = input as Record<string, unknown>;
  for (const key of ["accessPath", "accessDbPath", "databasePath", "sourcePath"] as const) {
    const value = obj[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return undefined;
}
