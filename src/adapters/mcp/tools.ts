import type { AccessQueryRequest, AccessVbaRequest, OperationResult } from "../../core/contracts/index.js";
import type { AccessDiagnosticsRequest } from "../../core/runner/access-runner.js";
import type { AccessDiagnosticsResult } from "../../core/services/diagnostics-service.js";
import type { AccessQueryResult } from "../../core/services/query-service.js";
import type { AccessVbaResult } from "../../core/services/vba-service.js";

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
};

export function createDysflowMcpTools(services: DysflowMcpServices): DysflowMcpTool[] {
  return [
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
  ];
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
