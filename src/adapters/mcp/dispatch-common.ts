import type { OperationResult } from "../../core/contracts/index.js";
import { resolveIsDryRun } from "../../core/mapping/access-query-request-mapper.js";
import { validateInput } from "../../shared/validation/validator.js";
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
 * Issue #659 — schema-rejection envelope. Retains the legacy `MCP_INPUT_INVALID`
 * code (kept for backward compat per `gate-error-codes/spec.md` scenario 5).
 * The structured `error` block carries `code` + `message` but deliberately
 * OMITS `remediation` and `allowedProcedures` because schema rejections are
 * self-describing and the allowlist was never consulted.
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

export function invalidInput(message: string, remediation?: string): McpToolResult {
  const error: McpToolResult["error"] = {
    code: MCP_INPUT_INVALID_CODE,
    message,
  };
  if (remediation !== undefined) {
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
 * from the same code path that backs `dysflow_get_capabilities`
 * (`getCapabilitiesAll` → `config.allowedProcedures`).
 */
export function procedureNotAllowed(
  procedureName: string,
  allowedProcedures: readonly string[],
): McpToolResult {
  const allowedJson = JSON.stringify([...allowedProcedures]);
  const remediation =
    `Add '${procedureName}' to the 'allowedProcedures' allowlist in ` +
    `.dysflow/project.json, or call 'dysflow_get_capabilities' to introspect ` +
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
