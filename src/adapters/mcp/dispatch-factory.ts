import {
  buildMaintenanceRequest,
  buildQueryReadRequest,
  buildWriteFixtureRequest,
  resolveIsDryRun,
} from "../../core/mapping/access-query-request-mapper.js";
import { detectWriteSqlKeyword } from "../../core/utils/index.js";
import { invalidInput, isWriteAllowed, mcpSchemaFor, writesDisabled } from "./dispatch-common.js";
import { MCP_TOOL_ROUTES, queryActionFor } from "./dispatch-routes.js";
import type { DysflowMcpToolName } from "./mcp-tool-registry.js";
import {
  type DysflowMcpServices,
  type DysflowMcpTool,
  type McpWriteAccessResolver,
  resolveInScopeSecrets,
  translateCoreResultToMcpContent,
} from "./result-translation.js";
import { getToolDefinition, isHiddenStubTool } from "./tool-parity-registry.js";
import { validateInput } from "./validator.js";

// ─── Read-mode SQL guard ───────────────────────────────────────────────────────

/**
 * Returns an error string when sql contains write keywords that are forbidden
 * in read-only query mode, or undefined when the sql looks read-only.
 * Exported for contract testing.
 */
export function rejectWriteSqlInReadMode(sql: string): string | undefined {
  const keyword = detectWriteSqlKeyword(sql);
  if (keyword === undefined) return undefined;
  return `${keyword} statements are not allowed in read-only queries. Use exec_sql or dysflow_query_execute with mode "write" for write operations.`;
}

// ─── Dispatch tool factory ────────────────────────────────────────────────────

export function createDispatchTool(
  name: DysflowMcpToolName,
  services: DysflowMcpServices,
  writesEnabled: boolean,
  writeAccessResolver: McpWriteAccessResolver | undefined,
  env: Record<string, string | undefined>,
): DysflowMcpTool {
  const definition = getToolDefinition(name);
  // MCP_TOOL_SCHEMAS is the sole source of truth for all MCP tool schemas (#200).
  const schema = mcpSchemaFor(name);
  const route = MCP_TOOL_ROUTES[name];
  const isWriteGated =
    route.kind === "query-write-fixture" ||
    (route.kind === "query-maintenance" && route.queryMode === "write");

  return {
    name,
    description: definition.description,
    inputSchema: schema,
    hidden: isHiddenStubTool(name) ? true : undefined,
    handler: async (input) => {
      const validation = validateInput(input, schema);
      if (validation !== undefined) return invalidInput(validation);
      const isDryRun = resolveIsDryRun(input);
      if (
        isWriteGated &&
        !isDryRun &&
        !(await isWriteAllowed(input, writesEnabled, writeAccessResolver))
      ) {
        return writesDisabled();
      }
      switch (route.kind) {
        case "vba-sync":
          if (services.vbaSyncToolService !== undefined) {
            return translateCoreResultToMcpContent(
              await services.vbaSyncToolService.execute(name, input),
            );
          }
          return {
            isError: true,
            content: [
              {
                type: "text",
                text: `MCP_SERVICE_UNAVAILABLE: ${name} requires the VBA sync service to be configured.`,
              },
            ],
          };
        case "query-maintenance": {
          const queryMode = getToolDefinition(name).queryMode ?? "write";
          const maintenanceRequest = buildMaintenanceRequest(
            queryActionFor(name),
            queryMode,
            input,
            (key) => env[key],
          );
          return translateCoreResultToMcpContent(
            await services.queryService.execute(maintenanceRequest),
            resolveInScopeSecrets(maintenanceRequest.backendPassword),
          );
        }
        case "query-read":
          return translateCoreResultToMcpContent(
            await services.queryService.execute(buildQueryReadRequest(queryActionFor(name), input)),
          );
        case "query-write-fixture":
          return translateCoreResultToMcpContent(
            await services.queryService.execute(
              buildWriteFixtureRequest(queryActionFor(name), input),
            ),
          );
      }
    },
  };
}
