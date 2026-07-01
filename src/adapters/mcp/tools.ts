import {
  type AccessQueryRequest,
  type AccessVbaRequest,
  createDysflowError,
  failureResult,
} from "../../core/contracts/index.js";
import { resolveIsDryRun } from "../../core/mapping/access-query-request-mapper.js";
import type { AccessDiagnosticsRequest } from "../../core/runner/access-runner.js";
import {
  handleMcpAccessCleanup,
  handleMcpAccessOperationsList,
  handleMcpAccessOrphanCleanup,
  handleMcpQueryExecute,
  handleMcpVbaExecute,
} from "./canonical-handlers.js";
import { registerMcpTools } from "./dispatch.js";
import { MCP_TOOL_CONTRACTS } from "./mcp-tool-contracts.js";

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
  McpAccessContextResolver,
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
  accessContextResolver: McpAccessContextResolver = async () =>
    failureResult(
      createDysflowError(
        "ORPHAN_CLEANUP_PATH_UNRESOLVED",
        "accessPath must be provided or .dysflow/project.json must declare one.",
      ),
    ),
): DysflowMcpTool[] {
  const currentTools: DysflowMcpTool[] = [
    {
      name: "dysflow_vba_execute",
      description: `Execute one public VBA procedure by procedureName with optional moduleName and arguments. Requires an already compiled project. PR1a (#621 F1): the adapter now defaults to deny — a call without an 'allowedProcedures' allowlist (project config) AND without dryRun:true is refused with MCP_INPUT_INVALID. Pass dryRun:true in the request body to use the explicit escape hatch. ${MCP_TOOL_CONTRACTS.dysflow_vba_execute.summary}`,
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
      description: `Execute Access SQL with explicit mode: "read" or mode: "write". Write mode honors dryRun/apply, is blocked by the MCP write gate when writes are disabled, and returns MCP_WRITES_DISABLED instead of mutating data. ${MCP_TOOL_CONTRACTS.dysflow_query_execute.summary}`,
      inputSchema: QUERY_EXECUTE_SCHEMA,
      handler: async (input, context) =>
        handleMcpQueryExecute(
          input,
          QUERY_EXECUTE_SCHEMA,
          services,
          writesEnabled,
          writeAccessResolver,
          (validatedInput) => {
            const request = validatedInput as AccessQueryRequest;
            if (request.mode !== "write") return request;
            return { ...request, dryRun: resolveIsDryRun(validatedInput) };
          },
          context,
        ),
    },
    {
      name: "dysflow_doctor",
      description: `Run core diagnostic checks for projectId or explicit accessPath/backendPath overrides; includeEnvironment adds environment diagnostics when supported. ${MCP_TOOL_CONTRACTS.dysflow_doctor.summary}`,
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
      description: `List recent Dysflow Access operation records, including operationId, PID/process metadata when known, status, and target path. This is read-only and kills nothing. ${MCP_TOOL_CONTRACTS.dysflow_access_operations_list.summary}`,
      inputSchema: NO_INPUT_SCHEMA,
      handler: async () => handleMcpAccessOperationsList(services),
    },
    {
      name: "dysflow_access_cleanup",
      description: `Reconcile or clean a tracked Access operation by operationId and accessPath. Without force it only inspects/reconciles eligible terminal records and kills nothing; force: true may kill a Dysflow-owned process and is write-gated with MCP_WRITES_DISABLED when writes are off. ${MCP_TOOL_CONTRACTS.dysflow_access_cleanup.summary}`,
      inputSchema: CLEANUP_SCHEMA,
      handler: async (input) =>
        handleMcpAccessCleanup(
          input,
          CLEANUP_SCHEMA,
          services,
          writesEnabled,
          writeAccessResolver,
          (validatedInput) =>
            validatedInput as { operationId: string; accessPath: string; force?: boolean },
        ),
    },
    {
      name: "dysflow_access_force_cleanup_orphaned",
      description: `List orphaned headless MSACCESS processes holding the project's accessPath, or kill exactly one only when confirmPid is explicitly provided. Listing is read-only; confirmPid is write-gated, returns MCP_WRITES_DISABLED when writes are off, and still refuses non-headless, wrong-path, or Dysflow-owned processes. ${MCP_TOOL_CONTRACTS.dysflow_access_force_cleanup_orphaned.summary}`,
      inputSchema: ORPHAN_CLEANUP_SCHEMA,
      handler: async (input) =>
        handleMcpAccessOrphanCleanup(
          input,
          ORPHAN_CLEANUP_SCHEMA,
          services,
          writesEnabled,
          writeAccessResolver,
          async (validatedInput) => {
            const request = validatedInput as { confirmPid?: number };
            const context = await accessContextResolver(validatedInput);
            if (!context.ok) return translateCoreResultToMcpContent(context);
            if (request.confirmPid === undefined) return context.data;
            return {
              ...context.data,
              confirmPid: request.confirmPid,
            };
          },
        ),
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
