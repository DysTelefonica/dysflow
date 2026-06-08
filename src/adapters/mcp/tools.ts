import type { AccessQueryRequest, AccessVbaRequest } from "../../core/contracts/index.js";
import type { AccessDiagnosticsRequest } from "../../core/runner/access-runner.js";
import {
  handleMcpAccessCleanup,
  handleMcpAccessOperationsList,
  handleMcpAccessOrphanCleanup,
  handleMcpQueryExecute,
  handleMcpVbaExecute,
} from "./canonical-handlers.js";
import { registerMcpTools } from "./dispatch.js";

export {
  ALIAS_TOOL_NAMES,
  MCP_TOOL_QUERY_ACTIONS,
  MCP_TOOL_ROUTES,
  registerMcpToolList,
} from "./dispatch.js";
export {
  type DysflowMcpServices,
  type DysflowMcpTool,
  type McpTextContent,
  type McpToolResult,
  type McpWriteAccessResolver,
  sanitizeMcpErrorMessage,
  translateCoreResultToMcpContent,
} from "./result-translation.js";
export { type JsonObjectSchema, MCP_TOOL_SCHEMAS } from "./schemas.js";

import { invalidInput } from "./dispatch-common.js";
import type {
  DysflowMcpServices,
  DysflowMcpTool,
  McpWriteAccessResolver,
} from "./result-translation.js";
import { translateCoreResultToMcpContent } from "./result-translation.js";
import {
  CLEANUP_SCHEMA,
  DOCTOR_SCHEMA,
  NO_INPUT_SCHEMA,
  ORPHAN_CLEANUP_SCHEMA,
  QUERY_EXECUTE_SCHEMA,
  VBA_EXECUTE_SCHEMA,
} from "./schemas.js";
import { validateInput } from "./validator.js";

// ─── Modern tool names ─────────────────────────────────────────────────────────

/**
 * Canonical modern Dysflow MCP tool names.
 * These names use underscore separators and are the authoritative source of truth
 * for the six modern tool identifiers advertised via tools/list.
 * Exported for contract testing and regression guards.
 */
export const MODERN_TOOL_NAMES = [
  "dysflow_vba_execute",
  "dysflow_query_execute",
  "dysflow_doctor",
  "dysflow_access_operations_list",
  "dysflow_access_cleanup",
  "dysflow_access_force_cleanup_orphaned",
] as const;

export type ModernDysflowMcpToolName = (typeof MODERN_TOOL_NAMES)[number];

// ─── Main factory ─────────────────────────────────────────────────────────────

export function createDysflowMcpTools(
  services: DysflowMcpServices,
  writesEnabled = false,
  writeAccessResolver?: McpWriteAccessResolver,
  env: Record<string, string | undefined> = process.env,
  allowedProcedures?: readonly string[],
): DysflowMcpTool[] {
  const currentTools: DysflowMcpTool[] = [
    {
      name: "dysflow_vba_execute",
      description: "Execute a VBA procedure through Dysflow core services.",
      inputSchema: VBA_EXECUTE_SCHEMA,
      handler: async (input, context) =>
        handleMcpVbaExecute(
          input,
          VBA_EXECUTE_SCHEMA,
          services,
          allowedProcedures,
          (validatedInput) => validatedInput as AccessVbaRequest,
          context,
        ),
    },
    {
      name: "dysflow_query_execute",
      description: "Execute a query action through Dysflow core services.",
      inputSchema: QUERY_EXECUTE_SCHEMA,
      handler: async (input, context) =>
        handleMcpQueryExecute(
          input,
          QUERY_EXECUTE_SCHEMA,
          services,
          writesEnabled,
          writeAccessResolver,
          (validatedInput) => validatedInput as AccessQueryRequest,
          context,
        ),
    },
    {
      name: "dysflow_doctor",
      description: "Run core diagnostic checks through Dysflow services.",
      inputSchema: DOCTOR_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, DOCTOR_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        const request = input as AccessDiagnosticsRequest;
        return translateCoreResultToMcpContent(await services.diagnosticsService.run(request));
      },
    },
    {
      name: "dysflow_access_operations_list",
      description: "List recent Dysflow Access operation records.",
      inputSchema: NO_INPUT_SCHEMA,
      handler: async () => handleMcpAccessOperationsList(services),
    },
    {
      name: "dysflow_access_cleanup",
      description: "Clean up resources associated with a recent Access operation.",
      inputSchema: CLEANUP_SCHEMA,
      handler: async (input) =>
        handleMcpAccessCleanup(
          input,
          CLEANUP_SCHEMA,
          services,
          (validatedInput) =>
            validatedInput as { operationId: string; accessPath: string; force?: boolean },
        ),
    },
    {
      name: "dysflow_access_force_cleanup_orphaned",
      description:
        "Kill an orphaned headless MSACCESS process holding the project's accessPath. Requires explicit operator confirmation of the PID. Refuses to kill any process that is not headless or that does not hold the accessPath.",
      inputSchema: ORPHAN_CLEANUP_SCHEMA,
      handler: async (input) => {
        const validation = validateInput(input, ORPHAN_CLEANUP_SCHEMA);
        if (validation !== undefined) return invalidInput(validation);
        const request = input as { projectId?: string; accessPath?: string; confirmPid: number };
        if (!request.accessPath) {
          return {
            content: [
              {
                type: "text",
                text: "ORPHAN_CLEANUP_PATH_UNRESOLVED: accessPath must be provided or .dysflow/project.json must declare one.",
              },
            ],
            isError: true,
          };
        }
        return handleMcpAccessOrphanCleanup(
          input,
          ORPHAN_CLEANUP_SCHEMA,
          services,
          (_validatedInput) => {
            // request is already validated; accessPath is confirmed non-null by the check above
            return {
              accessPath: request.accessPath as string,
              projectRoot: process.cwd(),
              confirmPid: request.confirmPid,
            };
          },
        );
      },
    },
  ];

  return registerMcpTools(
    currentTools,
    services,
    writesEnabled,
    writeAccessResolver,
    env,
    allowedProcedures,
  );
}
