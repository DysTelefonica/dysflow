import { loadDysflowConfig } from "../../core/config/dysflow-config.js";
import { AccessPowerShellRunner } from "../../core/runner/access-runner.js";
import { AccessDiagnosticsService } from "../../core/services/diagnostics-service.js";
import { AccessQueryService } from "../../core/services/query-service.js";
import { AccessVbaService } from "../../core/services/vba-service.js";
import { createDysflowMcpTools, type DysflowMcpTool } from "./tools.js";

export type McpStdioRuntime = {
  registerTool(tool: DysflowMcpTool): void;
  start(): Promise<void>;
};

export async function startMcpStdioAdapter(runtime?: McpStdioRuntime): Promise<void> {
  if (runtime === undefined) {
    throw new Error(
      "MCP_STDIO_RUNTIME_NOT_IMPLEMENTED: dysflow mcp requires the real MCP stdio runtime before it can serve tools.",
    );
  }

  const configResult = loadDysflowConfig();
  if (!configResult.ok) {
    throw new Error(`${configResult.error.code}: ${configResult.error.message}`);
  }

  const runner = new AccessPowerShellRunner();
  const services = {
    vbaService: new AccessVbaService({ runner, config: configResult.data }),
    queryService: new AccessQueryService({ runner, config: configResult.data }),
    diagnosticsService: new AccessDiagnosticsService({ runner, config: configResult.data }),
  };

  const stdioRuntime = runtime;
  for (const tool of createDysflowMcpTools(services)) {
    stdioRuntime.registerTool(tool);
  }

  await stdioRuntime.start();
}
