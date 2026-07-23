import type { OperationResult } from "../../core/contracts/index.js";
import type { Remediation } from "../../core/contracts/remediation.js";
import { structureRemediation } from "../../core/contracts/remediation.js";
import { resolveIsDryRun } from "../../core/mapping/access-query-request-mapper.js";
import { commitFlagFor, noWriteAliasFor } from "../../core/runtime/commit-flag-registry.js";
import type { WriteExecutionPolicy } from "../../core/runtime/write-execution-policy.js";
import {
  APPLY_DRYRUN_CONTRADICTION_PREFIX,
  validateInput,
} from "../../shared/validation/validator.js";
import type { ProjectConfigDiagnostic } from "../config/project-config-diagnostic.js";
import { buildExplainObject, relatedIssueNumbersForCode } from "./explain-builder.js";
import {
  type McpToolError,
  type McpToolResult,
  type McpWriteAccessResolver,
  translateCoreResultToMcpContent,
} from "./result-translation.js";
import { type JsonObjectSchema, MCP_TOOL_SCHEMAS } from "./schemas.js";

/**
 * Round-12 (#972) — uniform ErrorEnvelope. `explain`-mode-aware helper
 * that every gate envelope builder funnels through. Mutates a shallow
 * copy so the input envelope stays untouched (callers may extend it
 * further).
 *
 * Adds:
 *   - `errorCode`        — alias of `code`
 *   - `errorMessage`     — alias of `message`
 *   - `relatedIssueNumbers` — from the canonical lookup table
 *   - `explain?`         — when caller passed `explain: true`
 */
function applyUniformEnvelope(
  error: McpToolError,
  options: { explain?: boolean } = {},
): McpToolError {
  const out: McpToolError = {
    ...error,
    errorCode: error.code,
    errorMessage: error.message,
    diagnostics: ensureDiagnostics(error),
    relatedIssueNumbers: relatedIssueNumbersForCode(error.code),
  };
  if (options.explain === true) {
    out.explain = buildExplainObject({
      code: error.code,
      message: error.message,
      ...(typeof error.remediation === "string" ? { remediation: error.remediation } : {}),
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
  }
  return out;
}

/**
 * Round-12 (#972) — uniform `diagnostics` array. Every error envelope
 * MUST carry this field (possibly empty). When the source error already
 * supplies a `diagnostics` array, that wins; otherwise synthesize one
 * entry from the canonical `code` + `message` + `remediation`.
 */
function ensureDiagnostics(error: McpToolError): ReadonlyArray<{
  code: string;
  severity: "error" | "warning" | "info";
  message: string;
  remediation?: Remediation | string;
}> {
  const existing = error.diagnostics;
  if (existing && existing.length > 0) {
    return existing.map((entry) => ({
      code: entry.code,
      severity:
        entry.severity === "warning" || entry.severity === "info" ? entry.severity : "error",
      message: entry.message,
      ...(entry.remediation !== undefined ? { remediation: entry.remediation } : {}),
    }));
  }
  return [
    {
      code: error.code,
      severity: "error" as const,
      message: error.message,
      ...(error.remediation !== undefined ? { remediation: error.remediation } : {}),
    },
  ];
}

// ─── Gate error codes (#659) ───────────────────────────────────────────────────

/**
 * Issue #659 — write-gate envelope. Distinct string code so consumers can
 * branch on `error.code` without regex-matching the legacy text body.
 * Mirrors the HTTP `HTTP_WRITES_DISABLED` envelope pattern (per
 * `src/adapters/http/server.ts`) so the structured block stays uniform
 * across transports.
 */
export const PROJECT_CONFIG_NOT_WRITE_READY = "PROJECT_CONFIG_NOT_WRITE_READY" as const;
export const DESTINATION_ROOT_NOT_FOUND = "DESTINATION_ROOT_NOT_FOUND" as const;
export const OUTSIDE_PROJECT_ROOT = "OUTSIDE_PROJECT_ROOT" as const;
export const WRITE_LOCKED_BY_RUNNING_OP = "WRITE_LOCKED_BY_RUNNING_OP" as const;
export const CAPABILITIES_DISALLOW_WRITE = "CAPABILITIES_DISALLOW_WRITE" as const;
export const PROJECT_ID_MISMATCH = "PROJECT_ID_MISMATCH" as const;
/**
 * Issue #1044 — alias-set conflict. Distinct from the legacy
 * `PROJECT_CONFIG_NOT_WRITE_READY` fallback so a consumer can branch on
 * `error.code === "CONFLICTING_TARGET_ALIASES"` instead of regex-parsing
 * the legacy text body. Emitted when the request supplies more than one
 * frontend Access alias (`accessPath` / `accessDbPath` / `databasePath` /
 * `sourcePath`) and they do not normalize to the same Windows path. The
 * legacy `[legacy: PROJECT_CONFIG_NOT_WRITE_READY]` substring is preserved
 * in `error.message` for backward compat (#962 contract).
 */
export const CONFLICTING_TARGET_ALIASES = "CONFLICTING_TARGET_ALIASES" as const;
export type ConflictingTargetAliasesCode = typeof CONFLICTING_TARGET_ALIASES;

const writeGateCodes = new Set<string>([
  DESTINATION_ROOT_NOT_FOUND,
  OUTSIDE_PROJECT_ROOT,
  WRITE_LOCKED_BY_RUNNING_OP,
  CAPABILITIES_DISALLOW_WRITE,
  PROJECT_ID_MISMATCH,
  CONFLICTING_TARGET_ALIASES,
]);

const writeGateCodeByStatus: Partial<Record<ProjectConfigDiagnostic["status"], string>> = {
  "destination-root-not-found": DESTINATION_ROOT_NOT_FOUND,
  "outside-project-root": OUTSIDE_PROJECT_ROOT,
  "write-locked-by-running-op": WRITE_LOCKED_BY_RUNNING_OP,
  "capabilities-disallow-write": CAPABILITIES_DISALLOW_WRITE,
  "id-mismatch": PROJECT_ID_MISMATCH,
};

/** Whether this concrete request can mutate and therefore needs a write-ready project config. */
export async function requestRequiresWriteReady(
  toolName: string,
  access: "read-only" | "read-write" | "conditional-write",
  input: unknown,
  policy: WriteExecutionPolicy = "safe-by-default",
): Promise<boolean> {
  if (access === "read-only") return false;
  const request =
    typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};

  // These contracts select mutation by operation-specific fields rather than
  // the common apply/dryRun pair.
  if (toolName === "query_execute") return request.mode === "write" && !resolveIsDryRun(request);
  if (toolName === "cleanup_access_operation") return request.force === true;
  if (toolName === "access_force_cleanup_orphaned") return request.confirmPid !== undefined;

  // Load the policy seam only when a concrete request needs it. A static import
  // here creates an initialization cycle through risks -> contracts -> tools,
  // which can expose an uninitialized contract registry to ESM consumers.
  const { resolveEffectiveDryRunInput } = await import("./write-execution-dispatch.js");
  const effectiveInput = resolveEffectiveDryRunInput(toolName, policy, request);
  return !resolveIsDryRun(effectiveInput);
}
function resolveWriteGateErrorCode(diagnostic: ProjectConfigDiagnostic): string {
  const diagnosticCode = diagnostic.diagnostics[0]?.code;
  if (diagnosticCode !== undefined && writeGateCodes.has(diagnosticCode)) return diagnosticCode;
  return writeGateCodeByStatus[diagnostic.status] ?? PROJECT_CONFIG_NOT_WRITE_READY;
}

function buildWriteGateErrorEnvelope(
  toolName: string,
  diagnostic: ProjectConfigDiagnostic,
  options: { explain?: boolean } = {},
): McpToolResult {
  const code = resolveWriteGateErrorCode(diagnostic);
  // Issue #970 — promote each diagnostic.remediation to the structured
  // Remediation shape so consumers can branch on description/command/platform
  // without string-parsing. A legacy string is wrapped via
  // `structureRemediation` (description = original text); a structured
  // Remediation is forwarded verbatim.
  const diagnostics = diagnostic.diagnostics.map((entry, index) => {
    const coerced: typeof entry = {
      ...entry,
      ...(entry.remediation === undefined
        ? {}
        : { remediation: structureRemediation(entry.remediation) }),
    };
    return index === 0 && entry.code !== code ? { ...coerced, code } : coerced;
  });
  const specificMessage = diagnostics[0]?.message ?? "Project config is not write-ready.";
  const message = `${specificMessage} [legacy: ${PROJECT_CONFIG_NOT_WRITE_READY}]`;
  return {
    content: [{ type: "text", text: `${code}: ${message}` }],
    isError: true,
    ok: false,
    error: applyUniformEnvelope(
      {
        code,
        message,
        diagnostics,
        ...(diagnostic.remediation === null ? {} : { remediation: diagnostic.remediation }),
        details: {
          operation: toolName,
          status: diagnostic.status,
          ...(diagnostic.configPath !== undefined ? { configPath: diagnostic.configPath } : {}),
          ...(diagnostic.destinationRoot !== null
            ? { destinationRoot: diagnostic.destinationRoot }
            : {}),
          ...(diagnostic.accessPath !== null ? { accessPath: diagnostic.accessPath } : {}),
          remediation: diagnostic.remediation,
          projectId: diagnostic.projectId,
        },
      },
      options,
    ),
  };
}

export function projectConfigNotWriteReady(
  toolName: string,
  diagnostic: ProjectConfigDiagnostic,
  options: { explain?: boolean } = {},
): McpToolResult {
  return buildWriteGateErrorEnvelope(toolName, diagnostic, options);
}

export const MCP_WRITES_DISABLED = "MCP_WRITES_DISABLED" as const;
export type McpWritesDisabledCode = typeof MCP_WRITES_DISABLED;

/**
 * Issue #659 — procedure-not-in-allowlist branch of `ensureProcedureAllowed`.
 * Distinct from `MCP_INPUT_INVALID` so consumers can branch on `error.code`
 * without regex-matching the legacy text body. Other gate branches
 * (allowlist-not-configured, dry-run-required) keep the existing
 * `MCP_INPUT_INVALID` envelope until their own follow-up issue lands.
 */
export const MCP_PROCEDURE_NOT_ALLOWED = "MCP_PROCEDURE_NOT_ALLOWED" as const;
export type McpProcedureNotAllowedCode = typeof MCP_PROCEDURE_NOT_ALLOWED;

/**
 * Issue #757 (F6) — allowlist-not-configured branch of the procedure gate.
 * Split out of the generic `MCP_INPUT_INVALID` so consumers can distinguish
 * "this project declares no allowedProcedures at all" (a config problem the
 * operator fixes in `.dysflow/project.json`) from a genuine input-shape error.
 * Reserved earlier in `canonical-handlers-procedure-not-allowed.test.ts`
 * ("other SDD work owns MCP_ALLOWLIST_NOT_CONFIGURED"). Emitted by BOTH the
 * MCP-handler gate (`ensureProcedureAllowed`, run_vba/dysflow_vba_execute) and
 * the adapter gate (`VbaExecutionAdapter.ensureTestProceduresAllowed`,
 * test_vba) so a consumer greps one string regardless of which layer refused.
 */
export const MCP_ALLOWLIST_NOT_CONFIGURED = "MCP_ALLOWLIST_NOT_CONFIGURED" as const;
export type McpAllowlistNotConfiguredCode = typeof MCP_ALLOWLIST_NOT_CONFIGURED;

/**
 * Issue #785 (v2.1.1) — export-source guard refusal envelope.
 *
 * Refuses `export_modules` / `export_all` calls in `developer` mode when
 * the resolved destination overlaps the project's active source root and
 * the caller has not passed `confirmOverwriteSource: true`. The envelope
 * shape mirrors `MCP_PROCEDURE_NOT_ALLOWED`: structured `error.code` for
 * programmatic dispatch, structured `error.destination` / `sourceRoot`
 * / `error.remediation` for diagnostic introspection, legacy
 * `content[0].text` prefix for regex consumers.
 *
 * The guard is policy-driven: `safe-by-default` never reaches the
 * enforcement branch (the dispatcher injects `dryRun: true`, which
 * short-circuits the guard via the `isExecuteMode === false` check).
 * Only `developer` mode opt-in projects can encounter the refusal.
 */
export const EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION =
  "EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION" as const;
export type ExportOverwritesSourceRequiresConfirmationCode =
  typeof EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION;

// ─── Read-tool taxonomy (#980) ─────────────────────────────────────────────────

/**
 * Issue #980 — extends the #962 write-tool taxonomy to ALL dysflow tools
 * (read + write) with six new error codes that cover the binary/lock/
 * password/format/internal failure paths. The codes are reachable from the
 * dispatch boundary (helper envelopes below) AND from the runner layer
 * (legacy `CONFIG_TARGET_NOT_FOUND` etc. are remapped to these canonical
 * codes at the dispatch-factory seam — see `dispatch-factory.ts`).
 *
 *   BINARY_NOT_FOUND            accessPath does not resolve to a real file
 *   BINARY_LOCKED               accessPath is locked by another process
 *   BINARY_PASSWORD_INVALID     ACCESS_VBA_PASSWORD is set but incorrect
 *   BINARY_FORMAT_UNSUPPORTED   .accdb is not a recognized Access format
 *   INTERNAL_ERROR              unexpected internal exception (no raw stack leak)
 *   RUNTIME_STALE               runtime state is corrupted; restart recommended
 */
export const BINARY_NOT_FOUND = "BINARY_NOT_FOUND" as const;
export type BinaryNotFoundCode = typeof BINARY_NOT_FOUND;

export const BINARY_LOCKED = "BINARY_LOCKED" as const;
export type BinaryLockedCode = typeof BINARY_LOCKED;

export const BINARY_PASSWORD_INVALID = "BINARY_PASSWORD_INVALID" as const;
export type BinaryPasswordInvalidCode = typeof BINARY_PASSWORD_INVALID;

export const BINARY_FORMAT_UNSUPPORTED = "BINARY_FORMAT_UNSUPPORTED" as const;
export type BinaryFormatUnsupportedCode = typeof BINARY_FORMAT_UNSUPPORTED;

export const INTERNAL_ERROR = "INTERNAL_ERROR" as const;
export type InternalErrorCode = typeof INTERNAL_ERROR;

export const RUNTIME_STALE = "RUNTIME_STALE" as const;
export type RuntimeStaleCode = typeof RUNTIME_STALE;

/**
 * Issue #980 — legacy runner-layer codes remapped to the canonical taxonomy.
 * The runner (`access-runner.ts`) emits these older codes; the dispatch
 * layer (`dispatch-factory.ts`) translates them to the #980 canonical codes
 * before the envelope reaches the MCP wire so consumers can branch on a
 * single field name regardless of where the failure originated.
 */
export const LEGACY_READ_TOOL_CODE_MAP: Readonly<Record<string, string>> = {
  CONFIG_TARGET_NOT_FOUND: BINARY_NOT_FOUND,
  BINARY_ALREADY_LOCKED: BINARY_LOCKED,
  ACCESS_PASSWORD_INVALID: BINARY_PASSWORD_INVALID,
  ACCDB_FORMAT_UNSUPPORTED: BINARY_FORMAT_UNSUPPORTED,
};

/**
 * Issue #980 — per-code field-renames applied during the legacy→canonical
 * remap so the canonical envelope carries the canonical field names.
 * Today this normalizes `accessDbPath` (the runner-layer name for the
 * target access file) to `accessPath` (the #980 canonical name).
 * Unknown fields are forwarded verbatim so the remap is additive.
 */
const LEGACY_READ_TOOL_DETAIL_RENAMES: Readonly<Record<string, Readonly<Record<string, string>>>> =
  {
    CONFIG_TARGET_NOT_FOUND: { accessDbPath: "accessPath" },
  };

/**
 * Remap a runner-layer error code to the canonical #980 taxonomy. Returns
 * the input verbatim when no remap exists so legacy / unmapped codes
 * (including future ones) flow through the translator untouched. The
 * caller is responsible for forwarding the remapped code + original
 * details so structured introspection survives the translation.
 */
export function remapLegacyReadToolCode(code: string): string {
  return LEGACY_READ_TOOL_CODE_MAP[code] ?? code;
}

/**
 * Issue #980 — apply per-code detail renames when a legacy code was
 * remapped to a canonical code. When the code has no rename map the
 * input details are returned verbatim (shallow-copied). Used at the
 * dispatch boundary so the canonical envelope carries the canonical
 * field names (`accessPath` instead of `accessDbPath`) regardless of
 * the runner-layer naming convention.
 */
export function normalizeLegacyReadToolDetails(
  code: string,
  details: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (details === undefined) return undefined;
  const renames = LEGACY_READ_TOOL_DETAIL_RENAMES[code];
  if (renames === undefined) return { ...details };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    const renamed = renames[key] ?? key;
    out[renamed] = value;
  }
  return out;
}

/**
 * Issue #659 — schema-rejection envelope. Retains the legacy `MCP_INPUT_INVALID`
 * code (kept for backward compat per `gate-error-codes/spec.md` scenario 5).
 * The structured `error` block carries `code`, `message`, and a one-line
 * remediation. `allowedProcedures` remains absent because the allowlist was
 * never consulted.
 */
export const MCP_INPUT_INVALID_CODE = "MCP_INPUT_INVALID" as const;
export type McpInputInvalidCode = typeof MCP_INPUT_INVALID_CODE;

// ─── Read-tool envelope helpers (#980) ─────────────────────────────────────────

/**
 * Issue #980 — `BINARY_NOT_FOUND` envelope. Emitted when the accessPath
 * the runner tried to open does not resolve to a real file on disk. The
 * structured `details.accessPath` lets a consumer branch on the missing
 * path without parsing the message body.
 *
 * Mirrors the write-gate envelope shape: legacy `<CODE>: <message>`
 * prefix on `content[0].text`, structured `error.code` for programmatic
 * dispatch, uniform Round-12 (#972) envelope (errorCode alias,
 * diagnostics array, relatedIssueNumbers).
 */
export function binaryNotFound(
  args: { accessPath: string },
  options: { explain?: boolean } = {},
): McpToolResult {
  const { accessPath } = args;
  const message = `Access database not found at '${accessPath}'. Verify the configured accessPath / databasePath points to an existing .accdb file.`;
  const remediation =
    `Verify the file at '${accessPath}' exists on disk (path is case-sensitive on Windows). ` +
    `If the path moved recently, update 'accessPath' in .dysflow/project.json or pass ` +
    `'databasePath' / 'sourcePath' explicitly on the call.`;
  return {
    content: [{ type: "text", text: `${BINARY_NOT_FOUND}: ${message}` }],
    isError: true,
    ok: false,
    error: applyUniformEnvelope(
      {
        code: BINARY_NOT_FOUND,
        message,
        remediation,
        details: { accessPath },
      },
      options,
    ),
  };
}

/**
 * Issue #980 — `BINARY_LOCKED` envelope. Emitted when the accessPath is
 * held open by another process (typical: a stray MSACCESS.EXE instance,
 * or a non-headless interactive Access session with the same frontend).
 * The structured `details.holderPid` lets a consumer introspect the
 * blocking process without string-parsing.
 *
 * `lockType` is the kind of lock observed (e.g. `"laccdb"`, `"ldb"`,
 * `"ldbin"`). When omitted, the envelope just omits the field rather than
 * fabricate a value.
 */
export function binaryLocked(
  args: { accessPath: string; holderPid: number; lockType?: string },
  options: { explain?: boolean } = {},
): McpToolResult {
  const { accessPath, holderPid, lockType } = args;
  const message = `Access database at '${accessPath}' is locked by another process (pid=${holderPid}${lockType ? `, lock=${lockType}` : ""}). The runtime cannot open an exclusive handle until the lock is released.`;
  const remediation =
    `Close the process holding the lock (pid=${holderPid}) or, if it's a stray orphan, ` +
    `call 'access_force_cleanup_orphaned({confirmPid: ${holderPid}})' to terminate it. ` +
    `Never kill MSACCESS.EXE by process name — verify headless ownership first.`;
  return {
    content: [{ type: "text", text: `${BINARY_LOCKED}: ${message}` }],
    isError: true,
    ok: false,
    error: applyUniformEnvelope(
      {
        code: BINARY_LOCKED,
        message,
        remediation,
        details: {
          accessPath,
          holderPid,
          ...(lockType !== undefined ? { lockType } : {}),
        },
      },
      options,
    ),
  };
}

/**
 * Issue #980 — `BINARY_PASSWORD_INVALID` envelope. Emitted when the
 * database is password-protected and the value pointed to by the env var
 * named in `passwordEnv` does not unlock the file. SECURITY: only the
 * env-var NAME is echoed; the password VALUE is never reflected on the
 * wire. Callers that need to rotate credentials must reset the env var
 * (and restart any spawned child process if applicable).
 *
 * The structured `details.passwordEnv` field carries the env-var name so
 * a consumer can grep process environment without re-deriving it from
 * the message.
 */
export function binaryPasswordInvalid(
  args: { accessPath: string; passwordEnv: string },
  options: { explain?: boolean } = {},
): McpToolResult {
  const { accessPath, passwordEnv } = args;
  const message =
    `Access database at '${accessPath}' is password-protected and the value ` +
    `in env var '${passwordEnv}' did not unlock it. The password value itself ` +
    `is never reflected on the wire.`;
  const remediation =
    `Verify the value in env var '${passwordEnv}' matches the database password. ` +
    `If you recently rotated the password, restart any spawned child processes so ` +
    `they pick up the new env var. The value itself is never echoed — set the env ` +
    `var in the shell that launches the MCP adapter.`;
  return {
    content: [{ type: "text", text: `${BINARY_PASSWORD_INVALID}: ${message}` }],
    isError: true,
    ok: false,
    error: applyUniformEnvelope(
      {
        code: BINARY_PASSWORD_INVALID,
        message,
        remediation,
        details: { accessPath, passwordEnv },
      },
      options,
    ),
  };
}

/**
 * Issue #980 — `BINARY_FORMAT_UNSUPPORTED` envelope. Emitted when the
 * file at `accessPath` exists but does not parse as a recognized Access
 * format. The structured `details.observedMagic` carries the leading
 * bytes the runner read so a consumer can distinguish a corrupt
 * truncation from a misnamed non-Access file (e.g. a renamed .docx).
 */
export function binaryFormatUnsupported(
  args: { accessPath: string; observedMagic?: string },
  options: { explain?: boolean } = {},
): McpToolResult {
  const { accessPath, observedMagic } = args;
  const magicSuffix = observedMagic !== undefined ? ` (observed magic: '${observedMagic}')` : "";
  const message =
    `Access database at '${accessPath}' is not a recognized Access format${magicSuffix}. ` +
    `The runtime expects .accdb (Office 2007+) or legacy .mdb.`;
  const remediation =
    `Verify '${accessPath}' is an Access database file (.accdb / .mdb). ` +
    `If it is a renamed file or a corrupt copy, restore the original from backup. ` +
    `If you recently upgraded the project from a pre-2007 format, run Access's ` +
    `'Convert Database' tool and retry.`;
  return {
    content: [{ type: "text", text: `${BINARY_FORMAT_UNSUPPORTED}: ${message}` }],
    isError: true,
    ok: false,
    error: applyUniformEnvelope(
      {
        code: BINARY_FORMAT_UNSUPPORTED,
        message,
        remediation,
        details: {
          accessPath,
          ...(observedMagic !== undefined ? { observedMagic } : {}),
        },
      },
      options,
    ),
  };
}

/**
 * Issue #980 — `INTERNAL_ERROR` envelope. Emitted when the dispatch
 * layer catches an unexpected exception (synchronous throw OR async
 * rejection) from a downstream service. The structured
 * `details.errorClass` carries the JS error constructor name (e.g.
 * `"TypeError"`) so a consumer can branch on it without parsing
 * stacks.
 *
 * SECURITY: the raw `error.message` and `error.stack` are NEVER reflected
 * on the wire — only the class name and a synthesized sanitized
 * description. Stack frames routinely contain file system paths and
 * other process-local context; consumers that need them should opt into
 * debug logging at the adapter layer, not the public envelope.
 *
 * The helper accepts a captured `Error` (preferred) OR a pre-extracted
 * `errorClass` + `message` pair so tests and refactor-safe call sites
 * that already normalized the throw can pass components verbatim.
 *
 * NOTE: even when the caller passes `message` explicitly via the
 * `{errorClass, message}` overload, the string is dropped — it is
 * captured only for backward source compatibility (tests + call sites
 * that normalized the throw) but is NEVER reflected on the wire. The
 * wire message intentionally does NOT include the captured text so the
 * contract (`not.toContain(<raw-message>)`) holds regardless of caller.
 */
export function internalError(
  args: { errorClass: string; message?: string } | { error: Error; message?: string },
  options: { explain?: boolean } = {},
): McpToolResult {
  let errorClass: string;
  // Two overloads: pass an Error directly, OR pass the pre-extracted
  // class name. The runtime union narrowing via the `in` operator is
  // forbidden by `check-optional-presence-guards.mjs` (treats the
  // `in` on `args` as a presence guard); use the optional fields'
  // undefined state instead so the discriminator is value-driven.
  const maybeError = (args as { error?: Error }).error;
  if (maybeError !== undefined) {
    errorClass = maybeError.name || "Error";
    // maybeError.message / args.message are intentionally NOT forwarded
    // to the wire envelope. Only the error class is.
  } else {
    errorClass = (args as { errorClass: string }).errorClass;
  }
  const message = `Unexpected internal error of type ${errorClass}. See server logs for the full stack (never reflected on the wire).`;
  const remediation =
    `This is a runtime defect, not a caller error. Inspect the MCP adapter's ` +
    `stderr for the full stack (rotated to logs by the runtime). If the failure ` +
    `persists across retries, open an issue with the captured errorClass, the ` +
    `tool name, and the input payload (with secrets redacted).`;
  return {
    content: [{ type: "text", text: `${INTERNAL_ERROR}: ${message}` }],
    isError: true,
    ok: false,
    error: applyUniformEnvelope(
      {
        code: INTERNAL_ERROR,
        message,
        remediation,
        details: { errorClass },
      },
      options,
    ),
  };
}

/**
 * Issue #980 — `RUNTIME_STALE` envelope. Emitted when the runtime's
 * in-memory state is corrupted beyond self-healing (e.g. the service
 * cache overflows its hard cap, or a marker file holds an impossible
 * combination of fields). The structured `details.tool` carries the
 * tool name that detected the corruption, and `details.signal` carries
 * a short machine-grep-able description of WHY the runtime declared
 * itself stale.
 *
 * Remediation always mentions a restart as the canonical recovery
 * action. The runtime does NOT auto-restart: a stale runtime requires
 * human / orchestrator intervention because state corruption can be
 * silent and a clean restart is the only way to re-derive invariants.
 */
export function runtimeStale(
  args: { tool: string; signal: string },
  options: { explain?: boolean } = {},
): McpToolResult {
  const { tool, signal } = args;
  const message =
    `Runtime state is corrupted beyond self-healing (detected by '${tool}', signal: '${signal}'). ` +
    `The runtime cannot safely continue; a restart is required to re-derive invariants.`;
  const remediation =
    `Restart the MCP adapter (kill the process and relaunch). The runtime does NOT ` +
    `auto-restart because stale state can be silent and a clean boot is the only way ` +
    `to re-derive the invariants. If the failure recurs within minutes of restart, ` +
    `inspect runtime state under .dysflow/runtime/ for orphan markers or oversized ` +
    `caches and file an issue with the captured 'tool' + 'signal'.`;
  return {
    content: [{ type: "text", text: `${RUNTIME_STALE}: ${message}` }],
    isError: true,
    ok: false,
    error: applyUniformEnvelope(
      {
        code: RUNTIME_STALE,
        message,
        remediation,
        details: { tool, signal },
      },
      options,
    ),
  };
}

// ─── Internal helpers ──────────────────────────────────────────────────────────

export function writesDisabled(
  toolName?: string,
  options: { explain?: boolean } = {},
): McpToolResult {
  const suffix = toolName ? ` (attempted: ${toolName})` : "";
  const message = `Write tools are disabled for this MCP adapter${suffix}. Enable writes by setting "allowWrites": true in .dysflow/project.json (per-repo, recommended) or by launching the server with \`dysflow mcp --enable-writes\` (process-wide).`;
  const remediation = `Set "allowWrites": true in .dysflow/project.json, or launch the server with \`dysflow mcp --enable-writes\` (process-wide).`;
  return {
    content: [{ type: "text", text: `MCP_WRITES_DISABLED: ${message}` }],
    isError: true,
    ok: false,
    error: applyUniformEnvelope(
      {
        code: MCP_WRITES_DISABLED,
        message,
        remediation,
        ...(toolName !== undefined ? { details: { toolName } } : {}),
      },
      options,
    ),
  };
}

/**
 * Issue #1078 — derive the enrichment payload for a `validateInput`
 * rejection message. When the message names the apply/dryRun
 * contradiction (today the only multi-flag surface), populate BOTH
 * `rejectedFlag` (primary) and `rejectedFlags` (full list) so the
 * structured envelope can branch on either form. When the message is
 * the legacy `"<flag> is not allowed."` shape (#757 C4), populate
 * `rejectedFlag` with the literal flag name. Otherwise return
 * `undefined` so the caller falls back to the plain `invalidInput`
 * path.
 *
 * Centralizing the match here means every dispatch entry point
 * (`createDispatchTool`, `handleMcpVbaExecute`, `handleMcpQueryExecute`,
 * the `doctor` / `list_procedures` / etc. bespoke handlers in
 * `tools.ts`) produces a uniform `MCP_INPUT_INVALID` envelope without
 * each call site re-implementing the regex.
 */
export function enrichmentForValidationMessage(
  validation: string,
  toolName: string,
):
  | {
      rejectedFlag?: string;
      rejectedFlags?: readonly string[];
      toolName: string;
    }
  | undefined {
  // Apply/dryRun contradiction surface — both flags are rejected.
  if (validation.startsWith(APPLY_DRYRUN_CONTRADICTION_PREFIX)) {
    return {
      rejectedFlag: "apply",
      rejectedFlags: ["apply", "dryRun"],
      toolName,
    };
  }
  // Legacy single-flag rejection shape (#757 C4).
  const flagMatch = /"([^"]+)"\s+is not allowed\.|^([a-zA-Z][a-zA-Z0-9_]*)\s+is not allowed\./.exec(
    validation,
  );
  const rejectedFlag = flagMatch?.[1] ?? flagMatch?.[2];
  if (rejectedFlag !== undefined) {
    return { rejectedFlag, toolName };
  }
  return undefined;
}

/**
 * Surface a `MCP_INPUT_INVALID` envelope. The plain text body mirrors
 * the legacy prefix (`MCP_INPUT_INVALID: <message>`). When the
 * rejection is for a flag the caller passed that the tool doesn't
 * accept (#757 C4), the structured `error` block enumerates the
 * rejected flag and the tool's actual commit flag so the consumer can
 * act without consulting schema docs.
 */
export function invalidInput(
  message: string,
  remediation?: string,
  enrichment?: {
    /** Flag the caller passed that was rejected. Pinpoint for the consumer. */
    rejectedFlag?: string;
    /**
     * Issue #1078 — when the schema-rejection names MULTIPLE rejected
     * fields (today: the apply/dryRun contradiction surface), every
     * literal flag the caller passed. The dispatcher populates both
     * `rejectedFlag` (the primary flag) and `rejectedFlags` (the full
     * list) so consumers can branch on either form.
     */
    rejectedFlags?: readonly string[];
    /** Tool name — used to look up the tool's commit-flag metadata. */
    toolName?: string;
  },
  options: { explain?: boolean } = {},
): McpToolResult {
  const error: McpToolResult["error"] = {
    code: MCP_INPUT_INVALID_CODE,
    message,
    remediation:
      remediation ??
      "Check the tool schema and replace unsupported or missing fields before retrying.",
  };
  if (enrichment?.rejectedFlag !== undefined) {
    error.rejectedFlag = enrichment.rejectedFlag;
    if (enrichment.rejectedFlags !== undefined && enrichment.rejectedFlags.length > 0) {
      error.rejectedFlags = enrichment.rejectedFlags;
    }
    // Auto-derive the tool's actual commit flag from the registry so
    // the structured envelope is always honest about what the tool
    // accepts. `none` means the registry has no entry for the tool
    // (and thus the caller is misrouted).
    if (enrichment.toolName !== undefined) {
      const commitFlag = commitFlagFor(enrichment.toolName);
      const noWriteAlias = noWriteAliasFor(enrichment.toolName);
      error.toolCommitFlag = commitFlag;
      // Always enrich the remediation with tool-aware guidance so
      // consumers that hit the schema rejection know what to do.
      // Three flavors:
      //   1. Caller passed the tool's commit flag (e.g. apply:true on
      //      verify_code) → the tool's noop nature is the issue; the
      //      remediation explicitly notes this tool has no write side.
      //   2. Caller passed something the schema rejects but the
      //      tool's noWriteAlias exists → the remediation mentions it.
      //   3. The registry has no record (anonymous tool) → fall back
      //      to the message verbatim.
      const rejectedList = enrichment.rejectedFlags ?? [enrichment.rejectedFlag];
      const guidance =
        remediation ??
        (enrichment.toolName === "form_set_property" && enrichment.rejectedFlag === "propertyName"
          ? "Check the tool schema: form_set_property's schema requires `property` (single string token), not `propertyName`."
          : rejectedList.length > 1
            ? `${enrichment.toolName} does not accept conflicting write-intent flags "${rejectedList.join(", ")}" simultaneously.`
            : commitFlag === "dryRun"
              ? `${enrichment.toolName} does not accept "${enrichment.rejectedFlag}". The canonical commit signal for this tool is "${commitFlag}".`
              : `${enrichment.toolName} does not accept "${enrichment.rejectedFlag}".`);
      if (noWriteAlias === null) {
        // No-write default: the tool never writes (or never accepts a
        // no-write knob). If the rejected flag IS the commit flag,
        // the caller is mis-using the API entirely.
        if (rejectedList.includes(commitFlag)) {
          error.remediation = `${guidance} ${enrichment.toolName} is a ${commitFlag === "apply" ? "read-only / no-write" : "no-write"} tool — passing ${commitFlag}:true cannot make it write. Run a write-class tool (export_*, import_*, delete_module, etc.) instead.`;
        } else {
          error.remediation = guidance;
        }
      } else if (rejectedList.includes(commitFlag)) {
        // Same as above for write-class tools. The contradiction
        // branch (apply + dryRun) lands here too — both flags are in
        // the rejected list, the canonical `apply` is the commit
        // signal, and the no-write alias (`dryRun` / `diff`) carries
        // the inverse intent.
        error.remediation = `${guidance} Pass ${commitFlag}:true to commit, ${noWriteAlias}:true to plan, or omit both to use the tool's default. Do NOT pass ${rejectedList.join(" + ")} together — they map to opposite write intents.`;
      } else {
        // Caller passed something the tool doesn't accept. Suggest
        // the tool's actual flags.
        error.remediation = `${guidance} ${enrichment.toolName} accepts "${commitFlag}" (commit) and "${noWriteAlias}" (plan) — not "${enrichment.rejectedFlag}".`;
      }
    } else if (remediation !== undefined) {
      error.remediation = remediation;
    }
  } else if (remediation !== undefined) {
    error.remediation = remediation;
  }
  return {
    content: [{ type: "text", text: `MCP_INPUT_INVALID: ${message}` }],
    isError: true,
    ok: false,
    error: applyUniformEnvelope(error, options),
  };
}

/**
 * Issue #659 — gate-rejection envelope for the procedure-not-in-allowlist
 * branch. Emits the new `MCP_PROCEDURE_NOT_ALLOWED` code in BOTH the
 * legacy `content[0].text` body (regex-consumer compatible) and a
 * structured `error` block so consumers can branch on `error.code`
 * without parsing strings.
 *
 * The `allowedProcedures` parameter is the array active at the time of
 * the call — verbatim, NOT a snapshot — so a consumer can introspect it
 * from the same code path that backs `get_capabilities`
 * (`getCapabilitiesAll` → `config.allowedProcedures`).
 */
export function procedureNotAllowed(
  procedureName: string,
  allowedProcedures: readonly string[],
  options: { explain?: boolean } = {},
): McpToolResult {
  const allowedJson = JSON.stringify([...allowedProcedures]);
  const remediation =
    `Add '${procedureName}' to the 'allowedProcedures' allowlist in ` +
    `.dysflow/project.json, or call 'get_capabilities' to introspect ` +
    `the current allowlist before retrying.`;
  const message =
    `Procedure '${procedureName}' is not in the configured allowedProcedures ` +
    `list (active: ${allowedJson}). ${remediation}`;
  return {
    content: [{ type: "text", text: `MCP_PROCEDURE_NOT_ALLOWED: ${message}` }],
    isError: true,
    ok: false,
    error: applyUniformEnvelope(
      {
        code: MCP_PROCEDURE_NOT_ALLOWED,
        message,
        allowedProcedures: [...allowedProcedures],
        remediation,
        details: { procedure: procedureName },
      },
      options,
    ),
  };
}

/**
 * Issue #757 (F6) — gate-rejection envelope for the allowlist-NOT-configured
 * branch (project declares no `allowedProcedures` and the caller did not pass
 * `dryRun:true`). Distinct from `procedureNotAllowed` (which fires when an
 * allowlist IS configured but the requested procedure is absent) and from the
 * generic schema-rejection `invalidInput`. Emits the new
 * `MCP_ALLOWLIST_NOT_CONFIGURED` code in BOTH the legacy `content[0].text`
 * body and the structured `error` block. No `allowedProcedures` field is
 * surfaced because there is no allowlist to introspect.
 */
export function allowlistNotConfigured(
  procedureName: string,
  options: { explain?: boolean } = {},
): McpToolResult {
  const remediation =
    `Declare a non-empty 'allowedProcedures' allowlist in .dysflow/project.json ` +
    `(it is re-read per call — no server restart is needed), or pass dryRun:true ` +
    `to plan without executing.`;
  const message =
    `Refusing to execute VBA procedure '${procedureName}': project config declares ` +
    `no allowedProcedures allowlist. ${remediation}`;
  return {
    content: [{ type: "text", text: `${MCP_ALLOWLIST_NOT_CONFIGURED}: ${message}` }],
    isError: true,
    ok: false,
    error: applyUniformEnvelope(
      {
        code: MCP_ALLOWLIST_NOT_CONFIGURED,
        message,
        remediation,
        details: { procedure: procedureName },
      },
      options,
    ),
  };
}

/**
 * Issue #785 (v2.1.1) — structured refusal envelope for the export-source
 * guard. The dispatch layer (`dispatch-factory.ts`) calls this helper when
 * `requiresExportSourceConfirmation` returns a refusal from the
 * write-execution-dispatch helper. The envelope shape mirrors the
 * `procedureNotAllowed` / `allowlistNotConfigured` helpers so consumers
 * have a uniform structured-error contract across all gate refusals.
 *
 * Mirrors the `MCP_PROCEDURE_NOT_ALLOWED` /
 * `MCP_ALLOWLIST_NOT_CONFIGURED` envelope pattern: structured `error.code`
 * for programmatic dispatch, structured `error.destination` /
 * `error.sourceRoot` for diagnostic introspection, legacy
 * `content[0].text` regex prefix for legacy consumers.
 */
export function exportSourceGuardRefused(
  args: {
    toolName: string;
    destination: string;
    sourceRoot: string;
  },
  options: { explain?: boolean } = {},
): McpToolResult {
  const { toolName, destination, sourceRoot } = args;
  const remediation =
    `Pass confirmOverwriteSource: true to confirm the overwrite, or point ` +
    `exportPath / destinationRoot outside the project's source tree.`;
  const message =
    `Refusing ${toolName}: destination ${destination} overlaps the project's ` +
    `active source root (${sourceRoot}). ${remediation}`;
  return {
    content: [
      {
        type: "text",
        text: `${EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION}: ${message}`,
      },
    ],
    isError: true,
    ok: false,
    error: applyUniformEnvelope(
      {
        code: EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION,
        message,
        destination,
        sourceRoot,
        remediation,
        details: { toolName, destination, sourceRoot },
      },
      options,
    ),
  };
}

export async function isWriteAllowed(
  input: unknown,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
): Promise<boolean> {
  if (writesEnabled) return true;
  if (writeAccessResolver === undefined) return false;
  return await writeAccessResolver(input);
}

export function mcpSchemaFor(name: keyof typeof MCP_TOOL_SCHEMAS): JsonObjectSchema {
  const schema = MCP_TOOL_SCHEMAS[name];
  if (schema === undefined) {
    throw new Error(`Missing MCP tool schema: ${String(name)}`);
  }
  return schema;
}

export type McpArgsJsonParseResult =
  | { ok: true; value: unknown[] }
  | { ok: false; message: string };

export function parseMcpArgsJson(argsJson: string | undefined): McpArgsJsonParseResult {
  if (argsJson === undefined || argsJson.trim().length === 0) return { ok: true, value: [] };
  try {
    const parsed = JSON.parse(argsJson) as unknown;
    return { ok: true, value: Array.isArray(parsed) ? parsed : [parsed] };
  } catch {
    return { ok: false, message: "argsJson must be valid JSON." };
  }
}

export async function handleValidatedMcpWrite<TData>(
  input: unknown,
  schema: JsonObjectSchema,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
  execute: () => Promise<OperationResult<TData>>,
  // Issue #1078 — the structured rejection envelope needs a tool name
  // to look up the registry's commit-flag metadata and surface
  // `rejectedFlag` / `toolCommitFlag` / `remediation`. Callers that
  // have the tool name at hand pass it; legacy callers (the validator
  // tests, etc.) can omit it and the envelope degrades to the plain
  // `MCP_INPUT_INVALID` shape.
  toolName?: string,
): Promise<McpToolResult> {
  const validation = validateInput(input, schema);
  if (validation !== undefined) {
    if (toolName !== undefined) {
      const enrichment = enrichmentForValidationMessage(validation, toolName);
      if (enrichment !== undefined) return invalidInput(validation, undefined, enrichment);
    }
    return invalidInput(validation);
  }
  const isDryRun = resolveIsDryRun(input);
  if (!isDryRun && !(await isWriteAllowed(input, writesEnabled, writeAccessResolver)))
    return writesDisabled();
  return translateCoreResultToMcpContent(await execute());
}
