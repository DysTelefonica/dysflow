import type {
  AccessQueryRequest,
  AccessVbaRequest,
  OperationResult,
  VbaSyncPort,
} from "../../core/contracts/index.js";
import type { Remediation } from "../../core/contracts/remediation.js";
import type { AccessCleanupResult } from "../../core/operations/access-operation-cleanup.js";
import type { AccessOperationRegistry } from "../../core/operations/access-operation-registry.js";
import type {
  AccessOrphanCandidate,
  AccessOrphanCleanupResult,
} from "../../core/operations/access-orphan-cleanup.js";
import type { CleanStaleMarkersService } from "../../core/operations/clean-stale-markers-service.js";
import type { AccessDiagnosticsRequest } from "../../core/runner/access-runner.js";
import {
  getHumanCompileState,
  HUMAN_COMPILE_REMINDER_TEXT,
  isHumanCompilePending,
} from "../../core/runtime/human-compile-state.js";
import type { AccessDiagnosticsResult } from "../../core/services/diagnostics-service.js";
import type { AccessQueryResult } from "../../core/services/query-service.js";
import type { AccessVbaResult } from "../../core/services/vba-service.js";
import { sanitizeMcpErrorMessage } from "../../core/utils/sanitize-error.js";
import type { ExplainObject } from "./explain-builder.js";
import { relatedIssueNumbersForCode } from "./explain-builder.js";
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
  /** Caller-safe structured context for typed adapter failures. */
  details?: Record<string, unknown>;
  /**
   * Optional remediation hint surfaced on gate-rejection envelopes (#659).
   * When present, the hint names the next action a consumer should take
   * (e.g. "call get_capabilities to introspect the allowlist").
   */
  remediation?: string;
  diagnostics?: readonly {
    code: string;
    severity: string;
    message: string;
    /**
     * Issue #970 — structured remediation. Accepts either a legacy plain
     * string (treated as `description` by `structureRemediation`) or the
     * new structured shape (`{description, command, platform, ...}`).
     */
    remediation?: Remediation | string;
  }[];
  /**
   * Optional allowlist surfaced when the rejection is an allowlist
   * membership check (#659). Equals the array that was active at the time
   * of the call — verbatim, NOT a snapshot — so a consumer can branch on
   * its contents without a second round-trip to `get_capabilities`.
   */
  allowedProcedures?: readonly string[];
  /**
   * Optional resolved export destination surfaced on
   * `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` (#785 / #783 partial).
   * When present, the consumer sees the path the export would have written
   * to, computed from the caller's `exportPath` / `destinationRoot` and
   * the project's access context.
   */
  destination?: string;
  /**
   * Optional resolved active source root surfaced on
   * `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` (#785 / #783 partial).
   * When present, equals the project's `destinationRoot` at the time of
   * the call (via the MCP access context resolver, with a documented
   * fallback to the caller's own `destinationRoot` only when the
   * resolver is unavailable).
   */
  sourceRoot?: string;
  /**
   * v2.9.0 (#757 C4) — when the schema-rejection (`MCP_INPUT_INVALID`)
   * is for a flag the tool does not accept, this is the literal flag
   * name the caller passed. Pairs with `toolCommitFlag` to surface the
   * correct replacement without forcing the consumer to consult schema
   * docs.
   */
  rejectedFlag?: string;
  /**
   * v2.9.0 (#757 C4) — the commit flag this tool actually accepts
   * (today: `"apply"`, `"dryRun"`, or `"diff"`). Together with
   * `rejectedFlag`, a consumer can write:
   *   `if (error.rejectedFlag === "apply" && error.toolCommitFlag === "dryRun") ...`
   * without parsing the legacy text body.
   */
  toolCommitFlag?: "apply" | "dryRun" | "diff" | "none";
  /**
   * Round-12 (#972) — uniform ErrorEnvelope. Alias of `code` so consumers
   * can branch on a single field name regardless of code origin. When
   * populated, `errorCode === code` (set together by every envelope
   * builder). Omitted only when the error block is omitted entirely
   * (success envelopes).
   */
  errorCode?: string;
  /**
   * Round-12 (#972) — alias of `message` for the same reason as
   * {@link McpToolError.errorCode}. Both keys carry the identical string;
   * the alias exists for consumers that prefer the uniform-envelope
   * field names.
   */
  errorMessage?: string;
  /**
   * Round-12 (#972) — issue numbers related to this error code, sourced
   * from the canonical {@link RELATED_ISSUE_NUMBERS} table in
   * `explain-builder.ts`. Consumers can grep these to learn the PR that
   * introduced the code, surfaced remediation guidance, and any
   * regression tests the runtime ships.
   *
   * Always populated for error envelopes from canonical codes
   * (#962, #659, #757, #785, #941, #972). Falls back to `["#972"]` for
   * codes without a registered entry.
   */
  relatedIssueNumbers?: readonly string[];
  /**
   * Round-12 (#972) — explain-mode attachment. Populated only when the
   * caller passed `explain: true` on the original tool call. Carries the
   * decision tree (≥3 steps) and a human-readable summary, sourced from
   * `explain-builder.ts`. Consumers can render this directly in a UI or
   * skip it for log-mode callers.
   */
  explain?: ExplainObject;
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
  /**
   * Round-12 (#976) — explicit user-callable cleanup of stale
   * `status: "running"` markers under
   * `<projectRoot>/.dysflow/runtime/markers/`. Wraps the #967
   * auto-cleanup with explicit `dryRun` / `olderThanMinutes` /
   * `keepFailed` / `confirm` semantics.
   */
  cleanStaleMarkersService?: CleanStaleMarkersService;
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

function sanitizeMcpErrorDetails(
  details: Record<string, unknown>,
  secrets?: readonly string[],
): Record<string, unknown> {
  return JSON.parse(sanitizeMcpErrorMessage(stringifyForMcp(details), secrets)) as Record<
    string,
    unknown
  >;
}

export function translateCoreResultToMcpContent<TData>(
  result: OperationResult<TData>,
  secrets?: readonly string[],
): McpToolResult {
  if (!result.ok) {
    const sanitizedMessage = sanitizeMcpErrorMessage(result.error.message, secrets);
    const errorCode = result.error.code;
    const relatedIssueNumbers = relatedIssueNumbersForCode(errorCode);
    // Round-12 (#972) — uniform diagnostics array. The core envelope
    // (DysflowError) does not carry per-diagnostic entries (it has
    // `details` instead), so synthesize one entry from the canonical
    // (code, message, remediation) tuple.
    const synthesizedDiagnostics = [
      {
        code: errorCode,
        severity: "error" as const,
        message: sanitizedMessage,
        ...(typeof result.error.remediation === "string"
          ? { remediation: result.error.remediation }
          : {}),
      },
    ];
    return {
      content: [
        {
          type: "text",
          text: `${errorCode}: ${sanitizedMessage}`,
        },
      ],
      isError: true,
      ok: false,
      error: {
        code: errorCode,
        // Round-12 (#972) — uniform envelope aliases.
        errorCode,
        message: sanitizedMessage,
        errorMessage: sanitizedMessage,
        diagnostics: synthesizedDiagnostics,
        relatedIssueNumbers,
        ...(result.error.remediation ? { remediation: result.error.remediation } : {}),
        ...(result.error.details
          ? { details: sanitizeMcpErrorDetails(result.error.details, secrets) }
          : {}),
        ...(result.error.allowedProcedures
          ? { allowedProcedures: result.error.allowedProcedures }
          : {}),
      },
    };
  }

  return {
    content: [{ type: "text", text: stringifyForMcp(result.data) }],
    isError: false,
    ok: true,
  };
}

/**
 * F14 — Multi-AI friction log (2026-07-06) — make MCP tool results always
 * JSON-stringifiable so consumers can `JSON.stringify(r)` without try/catch.
 *
 * Without this, the following inputs cause `translateCoreResultToMcpContent`
 * to either throw or to silently lose information:
 *
 *   - `BigInt`               throws `TypeError: Do not know how to serialize a BigInt`
 *   - circular object        throws `TypeError: Converting circular structure to JSON`
 *   - `undefined` (top-level) `JSON.stringify(undefined)` returns `undefined`,
 *                            which propagates as `content[0].text === undefined`
 *                            and breaks the MCP wire-shape contract
 *   - `Symbol` (top-level)   `JSON.stringify(Symbol('x'))` returns `undefined`
 *   - `function` (top-level) `JSON.stringify(fn)` returns `undefined`
 *   - nested function/symbol silently dropped from the encoded object
 *   - `Error` instances      `.message` is non-enumerable on some hosts,
 *                            so a plain stringify loses the message
 *
 * The contract this helper enforces: the returned string is a JSON document
 * that `JSON.parse` and a second `JSON.stringify` will accept. The shape
 * varies by case:
 *
 *   - Already-JSON-serializable object/array  → encoded as-is
 *   - `null`                                  → encoded as `null`
 *   - Top-level `function`                    → `{ raw: "...", type: "function" }`
 *   - Top-level `Symbol`                      → `{ raw: "Symbol(...)", type: "symbol" }`
 *   - Top-level `BigInt`                      → `{ raw: "<digits>", type: "bigint" }`
 *   - Top-level `undefined`                   → `{ raw: "undefined", type: "undefined" }`
 *   - Top-level `Error`                       → `{ message, raw: <stack+message>, type: "error", code?: <Error.code> }`
 *   - Object with circular refs               → encoded with `__circular__`
 *                                              placeholders for back-edges
 *   - Object containing BigInt/function/etc. → deep-normalized so nested values
 *                                              are never silently dropped
 *
 * The helper is pure and side-effect free. Exporting it from the module lets
 * tests and other adapters reuse the same normalization rule.
 */
export function stringifyForMcp(value: unknown): string {
  // Fast path: top-level primitives that JSON.stringify handles cleanly.
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    // Number.isFinite guards against NaN/Infinity, which JSON.stringify also
    // emits as `null` — keep that behavior explicit so the contract holds.
    return Number.isFinite(value) ? String(value) : "null";
  }
  if (typeof value === "boolean") return value ? "true" : "false";

  // Top-level BigInt — wrap explicitly; JSON.stringify throws here.
  if (typeof value === "bigint") {
    return JSON.stringify({ raw: value.toString(), type: "bigint" });
  }

  // Top-level Symbol — JSON.stringify returns `undefined` here, losing the
  // value silently. Wrap so the consumer can grep for the symbol description.
  if (typeof value === "symbol") {
    return JSON.stringify({
      raw: value.toString(),
      type: "symbol",
    });
  }

  // Top-level function — same silent-loss problem.
  if (typeof value === "function") {
    return JSON.stringify({
      raw: describeFunction(value as (...args: unknown[]) => unknown),
      type: "function",
    });
  }

  // Top-level Error — extract .message / .stack / .code explicitly so the
  // diagnostic context survives the MCP wire.
  if (value instanceof Error) {
    return JSON.stringify(serializeError(value));
  }

  // Top-level undefined — JSON.stringify returns `undefined` (which means
  // `JSON.stringify(undefined)` IS `undefined`, breaking the MCP `text` shape).
  if (value === undefined) {
    return JSON.stringify({ raw: "undefined", type: "undefined" });
  }

  // Top-level object/array — try a normal stringify first. If it throws (the
  // circular case) or if the result would be `undefined` (silently dropped),
  // fall back to the deep normalizer which replaces cycles and converts
  // non-serializable leaves into representative strings.
  try {
    if (!requiresDeepNormalization(value, new WeakSet())) {
      const direct = JSON.stringify(value);
      if (direct !== undefined) return direct;
    }
  } catch {
    // Swallow — the deep normalizer handles circular references and
    // BigInt/function children by emitting representative placeholders.
  }

  return JSON.stringify(normalizeForJsonStringify(value, new WeakSet()));
}

// ─── Deep normalizer (F14) ────────────────────────────────────────────────────

const MAX_NORMALIZE_DEPTH = 64;

/**
 * Walk `value` and return a structurally identical shape whose leaves are
 * JSON-safe:
 *   - `BigInt`           → its `.toString()`
 *   - `function`         → the literal string `"[function <name or 'anonymous'>]"`
 *   - `Symbol`           → `Symbol(...).toString()`
 *   - `Error`            → `{ message, stack?, name?, code? }` via `serializeError`
 *   - circular back-edge → the literal string `"__circular__"`
 *   - everything else     → passed through unchanged
 *
 * `seen` is the set of objects currently being walked; on re-entry the
 * back-edge is replaced by `"__circular__"` instead of recursing forever.
 */
export function normalizeForJsonStringify(value: unknown, seen?: WeakSet<object>): unknown {
  const tracker = seen ?? new WeakSet<object>();
  return normalizeRecursive(value, tracker, 0);
}

function normalizeRecursive(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (depth > MAX_NORMALIZE_DEPTH) return "[max depth reached]";
  if (value === null) return null;
  if (value === undefined) return undefined;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;

  // Errors serialize to a plain object explicitly so .message/.code/.stack
  // survive even when those fields are non-enumerable on the host.
  if (value instanceof Error) return serializeError(value);

  if (typeof value === "bigint") return value.toString();
  if (typeof value === "symbol") return value.toString();
  if (typeof value === "function")
    return describeFunction(value as (...args: unknown[]) => unknown);

  if (typeof value !== "object") return null;

  // From here on it's `object` (arrays included). Cycle guard fires BEFORE
  // the recursive call so back-edges do not stack-overflow.
  const obj = value as object;
  if (seen.has(obj)) return "__circular__";
  seen.add(obj);

  try {
    if (Array.isArray(obj)) {
      return obj.map((item) => normalizeRecursive(item, seen, depth + 1));
    }
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      try {
        out[key] = normalizeRecursive((obj as Record<string, unknown>)[key], seen, depth + 1);
      } catch {
        // Defensive: any per-key failure converts to a string repr so the
        // overall structure still serializes.
        out[key] = "[unserializable]";
      }
    }
    return out;
  } finally {
    // Allow the same object to appear in NON-cyclic sibling branches of the
    // walk; only re-entry from a currently-open ancestor should be cut off.
    seen.delete(obj);
  }
}

function requiresDeepNormalization(value: unknown, seen: WeakSet<object>, depth = 0): boolean {
  if (depth > MAX_NORMALIZE_DEPTH) return true;
  if (value === null || value === undefined) return false;
  const kind = typeof value;
  if (kind === "bigint" || kind === "symbol" || kind === "function") return true;
  if (kind !== "object") return false;
  if (value instanceof Error) return true;

  const obj = value as object;
  if (seen.has(obj)) return true;
  seen.add(obj);

  try {
    const children = Array.isArray(obj)
      ? obj
      : Object.keys(obj as Record<string, unknown>).map(
          (key) => (obj as Record<string, unknown>)[key],
        );
    return children.some((child) => requiresDeepNormalization(child, seen, depth + 1));
  } finally {
    seen.delete(obj);
  }
}

function describeFunction(fn: (...args: unknown[]) => unknown): string {
  // Function.prototype.toString() returns the source — safe and observable
  // for grep. Falls back to a synthesized description if the runtime cannot
  // produce a source string.
  let source = "";
  try {
    source = fn.toString();
  } catch {
    source = "[function <unstringifiable>]";
  }
  return source.length > 0 ? source : "[function <anonymous>]";
}

function serializeError(error: Error): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: "error",
    name: error.name,
    message: error.message,
    // `raw` mirrors the F14 envelope contract: a single string consumers can
    // grep when they do not want to branch on `type`. Includes the stack
    // when available so a downstream log scraper can extract frames.
    raw: typeof error.stack === "string" ? error.stack : `${error.name}: ${error.message}`,
  };
  // `.code` is a non-standard but widely-used extension (Node sets it on
  // many built-in errors; DysflowError attached it explicitly). Capture it
  // when present.
  const maybeCode = (error as Error & { code?: unknown }).code;
  if (typeof maybeCode === "string" || typeof maybeCode === "number") {
    out.code = maybeCode;
  }
  if (typeof error.stack === "string") {
    out.stack = error.stack;
  }
  // Some adapters stuff extras (e.g. DysflowError.attachDetails) onto the
  // instance; capture them too so the consumer can see what came back.
  const extras: Record<string, unknown> = {};
  for (const key of Object.keys(error as unknown as Record<string, unknown>)) {
    if (key === "message" || key === "stack" || key === "name") continue;
    try {
      extras[key] = (error as unknown as Record<string, unknown>)[key];
    } catch {
      // ignore — the consumer still has the canonical fields.
    }
  }
  if (Object.keys(extras).length > 0) {
    out.details = extras;
  }
  return out;
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
