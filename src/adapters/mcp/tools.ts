import type { AccessQueryRequest, AccessVbaRequest, OperationResult } from "../../core/contracts/index.js";
import type { AccessCleanupResult } from "../../core/operations/access-operation-cleanup.js";
import type { AccessOperationRecord, AccessOperationRegistry } from "../../core/operations/access-operation-registry.js";
import { getDefaultAccessOperationRegistry } from "../../core/runner/access-runner.js";
import { successResult } from "../../core/contracts/index.js";
import type { AccessDiagnosticsRequest } from "../../core/runner/access-runner.js";
import type { AccessDiagnosticsResult } from "../../core/services/diagnostics-service.js";
import type { AccessQueryResult } from "../../core/services/query-service.js";
import type { AccessVbaResult } from "../../core/services/vba-service.js";
import { LEGACY_DYSFLOW_MCP_TOOL_NAMES, type LegacyDysflowMcpToolName } from "./legacy-tool-inventory.js";

export type McpTextContent = {
  type: "text";
  text: string;
};

export type McpToolResult = {
  content: readonly McpTextContent[];
  isError: boolean;
};

export type DysflowMcpTool = {
  name: string;
  description: string;
  handler(input: unknown): Promise<McpToolResult>;
};

export type DysflowMcpServices = {
  vbaService: {
    execute(request: AccessVbaRequest): Promise<OperationResult<AccessVbaResult>>;
  };
  queryService: {
    execute(request: AccessQueryRequest): Promise<OperationResult<AccessQueryResult>>;
  };
  diagnosticsService: {
    run(request?: AccessDiagnosticsRequest): Promise<OperationResult<AccessDiagnosticsResult>>;
  };
  operationRegistry?: AccessOperationRegistry;
  cleanupService?: { cleanup(request: { operationId: string; accessPath: string; force?: boolean }): Promise<OperationResult<AccessCleanupResult>> };
};

export function createDysflowMcpTools(services: DysflowMcpServices): DysflowMcpTool[] {
  const currentTools: DysflowMcpTool[] = [
    {
      name: "dysflow.vba.execute",
      description: "Execute a VBA procedure through Dysflow core services.",
      handler: async (input) => translateCoreResultToMcpContent(await services.vbaService.execute(input as AccessVbaRequest)),
    },
    {
      name: "dysflow.query.execute",
      description: "Execute an Access SQL query through Dysflow core services.",
      handler: async (input) => translateCoreResultToMcpContent(await services.queryService.execute(input as AccessQueryRequest)),
    },
    {
      name: "dysflow.doctor",
      description: "Run Dysflow diagnostics through core services.",
      handler: async (input) => translateCoreResultToMcpContent(await services.diagnosticsService.run(input as AccessDiagnosticsRequest)),
    },
    {
      name: "dysflow.access.operations.list",
      description: "List recent Access operations tracked by Dysflow.",
      handler: async () => {
        const registry = services.operationRegistry ?? getDefaultAccessOperationRegistry();
        return translateCoreResultToMcpContent(successResult<readonly AccessOperationRecord[]>(await registry.listRecent({ limit: 50 })));
      },
    },
    {
      name: "dysflow.access.cleanup",
      description: "Safely cleanup a registered Access operation by operationId and accessPath.",
      handler: async (input) => {
        if (services.cleanupService === undefined) {
          return { content: [{ type: "text", text: "CLEANUP_NOT_CONFIGURED: Access cleanup service is not configured." }], isError: true };
        }
        return translateCoreResultToMcpContent(await services.cleanupService.cleanup(input as { operationId: string; accessPath: string; force?: boolean }));
      },
    },
  ];

  return appendLegacyCompatibilityTools(currentTools, services);
}

function appendLegacyCompatibilityTools(currentTools: DysflowMcpTool[], services: DysflowMcpServices): DysflowMcpTool[] {
  const tools = [...currentTools];
  const names = new Set(tools.map((tool) => tool.name));
  const add = (tool: DysflowMcpTool): void => {
    if (!names.has(tool.name)) {
      names.add(tool.name);
      tools.push(tool);
    }
  };

  add({
    name: "list_access_operations",
    description: "Legacy-compatible alias for listing Dysflow Access operations.",
    handler: async () => {
      const registry = services.operationRegistry ?? getDefaultAccessOperationRegistry();
      return translateCoreResultToMcpContent(successResult<readonly AccessOperationRecord[]>(await registry.listRecent({ limit: 50 })));
    },
  });
  add({
    name: "cleanup_access_operation",
    description: "Legacy-compatible alias for safe Access operation cleanup.",
    handler: async (input) => {
      if (services.cleanupService === undefined) {
        return { content: [{ type: "text", text: "CLEANUP_NOT_CONFIGURED: Access cleanup service is not configured." }], isError: true };
      }
      const request = input as { operationId: string; accessPath?: string; force?: boolean };
      return translateCoreResultToMcpContent(await services.cleanupService.cleanup({ operationId: request.operationId, accessPath: request.accessPath ?? "", force: request.force }));
    },
  });
  add({
    name: "run_vba",
    description: "Legacy-compatible alias for executing a public VBA procedure.",
    handler: async (input) => {
      const request = input as { procedureName: string; argsJson?: string };
      return translateCoreResultToMcpContent(await services.vbaService.execute({
        moduleName: "",
        procedureName: request.procedureName,
        arguments: parseLegacyArgsJson(request.argsJson),
      }));
    },
  });
  add({
    name: "query_sql",
    description: "Legacy-compatible alias for read-only Access SQL queries.",
    handler: async (input) => {
      const request = input as { sql?: string; query?: string };
      return translateCoreResultToMcpContent(await services.queryService.execute({ sql: request.sql ?? request.query ?? "", mode: "read" }));
    },
  });

  for (const legacyName of LEGACY_DYSFLOW_MCP_TOOL_NAMES) {
    add(createNotImplementedLegacyTool(legacyName));
  }

  return tools;
}

function createNotImplementedLegacyTool(name: LegacyDysflowMcpToolName): DysflowMcpTool {
  return {
    name,
    description: `Legacy Dysflow MCP tool ${name}; tracked for parity and implemented by its dedicated slice.`,
    handler: async () => ({
      isError: true,
      content: [{ type: "text", text: `LEGACY_TOOL_NOT_IMPLEMENTED: ${name} is tracked for legacy parity but not ported in this slice.` }],
    }),
  };
}

function parseLegacyArgsJson(argsJson: string | undefined): unknown[] {
  if (argsJson === undefined || argsJson.trim().length === 0) return [];
  const parsed = JSON.parse(argsJson) as unknown;
  return Array.isArray(parsed) ? parsed : [parsed];
}

export function translateCoreResultToMcpContent<TData>(result: OperationResult<TData>): McpToolResult {
  if (!result.ok) {
    return {
      content: [{ type: "text", text: `${result.error.code}: ${result.error.message}` }],
      isError: true,
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(result.data) }],
    isError: false,
  };
}
