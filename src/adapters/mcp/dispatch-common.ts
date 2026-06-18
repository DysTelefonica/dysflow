import type { OperationResult } from "../../core/contracts/index.js";
import { resolveIsDryRun } from "../../core/mapping/access-query-request-mapper.js";
import { validateInput } from "../../shared/validation/validator.js";
import {
  type McpToolResult,
  type McpWriteAccessResolver,
  translateCoreResultToMcpContent,
} from "./result-translation.js";
import { type JsonObjectSchema, MCP_TOOL_SCHEMAS } from "./schemas.js";

// ─── Internal helpers ──────────────────────────────────────────────────────────

export function writesDisabled(toolName?: string): McpToolResult {
  const suffix = toolName ? ` (attempted: ${toolName})` : "";
  return {
    content: [
      {
        type: "text",
        text: `MCP_WRITES_DISABLED: Write tools are disabled for this MCP adapter${suffix}. Enable writes by setting "allowWrites": true in .dysflow/project.json (per-repo, recommended) or by launching the server with \`dysflow mcp --enable-writes\` (process-wide).`,
      },
    ],
    isError: true,
  };
}

export function invalidInput(message: string): McpToolResult {
  return { content: [{ type: "text", text: `MCP_INPUT_INVALID: ${message}` }], isError: true };
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
