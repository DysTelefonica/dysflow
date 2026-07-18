import type { OperationResult } from "../../core/contracts/index.js";
import { resolveIsDryRun } from "../../core/mapping/access-query-request-mapper.js";
import { commitFlagFor, noWriteAliasFor } from "../../core/runtime/commit-flag-registry.js";
import type { WriteExecutionPolicy } from "../../core/runtime/write-execution-policy.js";
import { validateInput } from "../../shared/validation/validator.js";
import type { ProjectConfigDiagnostic } from "../config/project-config-diagnostic.js";
import {
  type McpToolResult,
  type McpWriteAccessResolver,
  translateCoreResultToMcpContent,
} from "./result-translation.js";
import { type JsonObjectSchema, MCP_TOOL_SCHEMAS } from "./schemas.js";

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

const writeGateCodes = new Set<string>([
  DESTINATION_ROOT_NOT_FOUND,
  OUTSIDE_PROJECT_ROOT,
  WRITE_LOCKED_BY_RUNNING_OP,
  CAPABILITIES_DISALLOW_WRITE,
  PROJECT_ID_MISMATCH,
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
export function projectConfigNotWriteReady(
  toolName: string,
  diagnostic: ProjectConfigDiagnostic,
): McpToolResult {
  const diagnosticCode = diagnostic.diagnostics[0]?.code;
  const code =
    diagnosticCode !== undefined && writeGateCodes.has(diagnosticCode)
      ? diagnosticCode
      : (writeGateCodeByStatus[diagnostic.status] ?? PROJECT_CONFIG_NOT_WRITE_READY);
  const specificMessage =
    diagnostic.diagnostics[0]?.message ?? "Project config is not write-ready.";
  const message = `${specificMessage} [legacy: ${PROJECT_CONFIG_NOT_WRITE_READY}]`;
  return {
    content: [{ type: "text", text: `${code}: ${message}` }],
    isError: true,
    ok: false,
    error: {
      code,
      message,
      diagnostics: diagnostic.diagnostics,
      ...(diagnostic.remediation === null ? {} : { remediation: diagnostic.remediation }),
      details: {
        operation: toolName,
        status: diagnostic.status,
        remediation: diagnostic.remediation,
      },
    },
  };
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

/**
 * Issue #659 — schema-rejection envelope. Retains the legacy `MCP_INPUT_INVALID`
 * code (kept for backward compat per `gate-error-codes/spec.md` scenario 5).
 * The structured `error` block carries `code`, `message`, and a one-line
 * remediation. `allowedProcedures` remains absent because the allowlist was
 * never consulted.
 */
export const MCP_INPUT_INVALID_CODE = "MCP_INPUT_INVALID" as const;
export type McpInputInvalidCode = typeof MCP_INPUT_INVALID_CODE;

// ─── Internal helpers ──────────────────────────────────────────────────────────

export function writesDisabled(toolName?: string): McpToolResult {
  const suffix = toolName ? ` (attempted: ${toolName})` : "";
  const message = `Write tools are disabled for this MCP adapter${suffix}. Enable writes by setting "allowWrites": true in .dysflow/project.json (per-repo, recommended) or by launching the server with \`dysflow mcp --enable-writes\` (process-wide).`;
  const remediation = `Set "allowWrites": true in .dysflow/project.json, or launch the server with \`dysflow mcp --enable-writes\` (process-wide).`;
  return {
    content: [{ type: "text", text: `MCP_WRITES_DISABLED: ${message}` }],
    isError: true,
    ok: false,
    error: {
      code: MCP_WRITES_DISABLED,
      message,
      remediation,
    },
  };
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
    /** Tool name — used to look up the tool's commit-flag metadata. */
    toolName?: string;
  },
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
      const guidance =
        remediation ??
        (enrichment.toolName === "form_set_property" && enrichment.rejectedFlag === "propertyName"
          ? "Check the tool schema: form_set_property's schema requires `property` (single string token), not `propertyName`."
          : `${enrichment.toolName} does not accept "${enrichment.rejectedFlag}".`);
      if (noWriteAlias === null) {
        // No-write default: the tool never writes (or never accepts a
        // no-write knob). If the rejected flag IS the commit flag,
        // the caller is mis-using the API entirely.
        if (enrichment.rejectedFlag === commitFlag) {
          error.remediation = `${guidance} ${enrichment.toolName} is a ${commitFlag === "apply" ? "read-only / no-write" : "no-write"} tool — passing ${commitFlag}:true cannot make it write. Run a write-class tool (export_*, import_*, delete_module, etc.) instead.`;
        } else {
          error.remediation = guidance;
        }
      } else if (enrichment.rejectedFlag === commitFlag) {
        // Same as above for write-class tools.
        error.remediation = `${guidance} Pass ${commitFlag}:true to commit, ${noWriteAlias}:true to plan, or omit both to use the tool's default.`;
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
    error,
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
    error: {
      code: MCP_PROCEDURE_NOT_ALLOWED,
      message,
      allowedProcedures: [...allowedProcedures],
      remediation,
    },
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
export function allowlistNotConfigured(procedureName: string): McpToolResult {
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
    error: {
      code: MCP_ALLOWLIST_NOT_CONFIGURED,
      message,
      remediation,
    },
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
export function exportSourceGuardRefused(args: {
  toolName: string;
  destination: string;
  sourceRoot: string;
}): McpToolResult {
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
    error: {
      code: EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION,
      message,
      destination,
      sourceRoot,
      remediation,
    },
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
): Promise<McpToolResult> {
  const validation = validateInput(input, schema);
  if (validation !== undefined) return invalidInput(validation);
  const isDryRun = resolveIsDryRun(input);
  if (!isDryRun && !(await isWriteAllowed(input, writesEnabled, writeAccessResolver)))
    return writesDisabled();
  return translateCoreResultToMcpContent(await execute());
}
