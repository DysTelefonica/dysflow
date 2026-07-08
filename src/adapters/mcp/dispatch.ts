import { ALIAS_TOOL_NAMES, buildAliasTools } from "./alias-tools.js";
import type { AllowedProcedures } from "./allowed-procedures-resolver.js";
import { createDispatchTool } from "./dispatch-factory.js";
import type { GeneratedDispatchToolName } from "./dispatch-routes.js";
import { DYSFLOW_MCP_TOOL_NAMES } from "./mcp-tool-registry.js";
import type {
  DysflowMcpServices,
  DysflowMcpTool,
  McpWriteAccessResolver,
} from "./result-translation.js";
import type { WriteExecutionPolicy } from "../../core/runtime/write-execution-policy.js";

// ─── Re-exports — compatibility surface ───────────────────────────────────────

export { ALIAS_TOOL_NAMES, buildAliasTools } from "./alias-tools.js";

export {
  handleValidatedMcpWrite,
  invalidInput,
  isWriteAllowed,
  type McpArgsJsonParseResult,
  mcpSchemaFor,
  parseMcpArgsJson,
  writesDisabled,
} from "./dispatch-common.js";
export { createDispatchTool } from "./dispatch-factory.js";
export {
  MCP_TOOL_QUERY_ACTIONS,
  MCP_TOOL_ROUTES,
  type McpToolRoute,
  queryActionFor,
} from "./dispatch-routes.js";

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Pure registration helper: accepts a list of tool entries, detects duplicate names, and
 * returns the final list. Throws on any repeated name. Exported for contract testing (#405).
 */
export function registerMcpToolList(entries: readonly DysflowMcpTool[]): DysflowMcpTool[] {
  const names = new Set<string>();
  const out: DysflowMcpTool[] = [];
  for (const tool of entries) {
    if (names.has(tool.name)) {
      throw new Error(`Duplicate MCP tool registration: ${tool.name}`);
    }
    names.add(tool.name);
    out.push(tool);
  }
  return out;
}

export function registerMcpTools(
  currentTools: DysflowMcpTool[],
  services: DysflowMcpServices,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
  env: Record<string, string | undefined>,
  allowedProcedures?: AllowedProcedures,
  // Issue #785 (v2.1.1) — wire the v2.1.0 foundation. When the resolved
  // policy is omitted, the dispatch defaults to `safe-by-default` so legacy
  // call sites keep their existing behavior byte-for-byte.
  writeExecutionPolicy?: WriteExecutionPolicy,
): DysflowMcpTool[] {
  const aliasTools = buildAliasTools(
    services,
    writesEnabled,
    writeAccessResolver,
    allowedProcedures,
  );

  // Dispatch loop skips alias names — each DysflowMcpToolName is owned by exactly one path (#405).
  const dispatchToolNames = DYSFLOW_MCP_TOOL_NAMES.filter(
    (name): name is GeneratedDispatchToolName => !ALIAS_TOOL_NAMES.has(name),
  );
  const dispatchTools = dispatchToolNames.map((name) =>
    createDispatchTool(name, services, writesEnabled, writeAccessResolver, env, writeExecutionPolicy),
  );

  return registerMcpToolList([...currentTools, ...aliasTools, ...dispatchTools]);
}
