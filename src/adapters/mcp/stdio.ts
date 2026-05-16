import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { loadDysflowConfig, type DysflowConfig } from "../../core/config/dysflow-config.js";
import { AccessOperationCleanupService } from "../../core/operations/access-operation-cleanup.js";
import { WindowsMsAccessProcessInspector, WindowsProcessKiller } from "../../core/operations/windows-processes.js";
import { AccessPowerShellRunner, getDefaultAccessOperationRegistry } from "../../core/runner/access-runner.js";
import { AccessDiagnosticsService } from "../../core/services/diagnostics-service.js";
import { AccessQueryService } from "../../core/services/query-service.js";
import { AccessVbaService } from "../../core/services/vba-service.js";
import { VbaSyncLegacyService } from "../../core/services/vba-sync-legacy-service.js";
import { createDysflowMcpTools, type DysflowMcpTool, type McpToolResult } from "./tools.js";
import { isRecord } from "../../core/utils/index.js";

const require = createRequire(import.meta.url);
const packageJson = require("../../../package.json") as { version?: unknown };
const SERVER_VERSION = typeof packageJson.version === "string" ? packageJson.version : "0.0.0";

export type McpStdioRuntime = {
  registerTool(tool: DysflowMcpTool): void;
  start(): Promise<void>;
};

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

type JsonLineMcpStdioRuntimeOptions = {
  input?: Readable;
  output?: Writable;
};

export class JsonLineMcpStdioRuntime implements McpStdioRuntime {
  private readonly tools = new Map<string, DysflowMcpTool>();
  private readonly input: Readable;
  private readonly output: Writable;

  constructor(options: JsonLineMcpStdioRuntimeOptions = {}) {
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
  }

  registerTool(tool: DysflowMcpTool): void {
    this.tools.set(tool.name, tool);
  }

  async start(): Promise<void> {
    const lines = createInterface({ input: this.input, crlfDelay: Infinity });
    for await (const line of lines) {
      if (line.trim().length === 0) continue;
      await this.handleLine(line);
    }
  }

  private async handleLine(line: string): Promise<void> {
    let request: JsonRpcRequest;
    try {
      request = JSON.parse(line) as JsonRpcRequest;
    } catch {
      this.writeResponse(null, { code: -32700, message: "Parse error" });
      return;
    }

    if (request.id === undefined) {
      return;
    }

    try {
      const result = await this.dispatch(request);
      this.writeResponse(request.id, undefined, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "MCP request failed.";
      const code = error instanceof JsonRpcMethodNotFound ? error.code : -32603;
      this.writeResponse(request.id, { code, message });
    }
  }

  private async dispatch(request: JsonRpcRequest): Promise<unknown> {
    if (request.method === "initialize") {
      return {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "dysflow", version: SERVER_VERSION },
      };
    }

    if (request.method === "tools/list") {
      return {
        tools: [...this.tools.values()].map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema ?? { type: "object", additionalProperties: false, properties: {} },
        })),
      };
    }

    if (request.method === "tools/call") {
      return this.callTool(request.params);
    }

    throw new JsonRpcMethodNotFound(request.method ?? "<missing>");
  }

  private async callTool(params: unknown): Promise<McpToolResult> {
    const call = isRecord(params) ? params : {};
    const name = typeof call.name === "string" ? call.name : "";
    const tool = this.tools.get(name);
    if (tool === undefined) {
      throw new JsonRpcMethodNotFound(`tool ${name}`);
    }
    return tool.handler(call.arguments);
  }

  private writeResponse(id: string | number | null, error?: { code: number; message: string }, result?: unknown): void {
    const payload = error === undefined
      ? { jsonrpc: "2.0", id, result }
      : { jsonrpc: "2.0", id, error };
    this.output.write(`${JSON.stringify(payload)}\n`);
  }
}

class JsonRpcMethodNotFound extends Error {
  public readonly code = -32601;
  constructor(method: string) {
    super(`Method not found: ${method}`);
  }
}

export async function startMcpStdioAdapter(runtime?: McpStdioRuntime): Promise<void>;
export async function startMcpStdioAdapter(config?: DysflowConfig, runtime?: McpStdioRuntime): Promise<void>;
export async function startMcpStdioAdapter(configOrRuntime?: DysflowConfig | McpStdioRuntime, runtime?: McpStdioRuntime): Promise<void> {
  const suppliedRuntime = isMcpStdioRuntime(configOrRuntime) ? configOrRuntime : runtime;
  const config = isMcpStdioRuntime(configOrRuntime) ? undefined : configOrRuntime;
  const activeRuntime = suppliedRuntime ?? new JsonLineMcpStdioRuntime();
  const configResult = config === undefined ? loadDysflowConfig() : { ok: true as const, data: config };
  if (!configResult.ok) {
    throw new Error(`${configResult.error.code}: ${configResult.error.message}`);
  }

  const operationRegistry = getDefaultAccessOperationRegistry();
  const runner = new AccessPowerShellRunner({ operationRegistry });
  const services = {
    vbaService: new AccessVbaService({ runner, config: configResult.data }),
    queryService: new AccessQueryService({ runner, config: configResult.data }),
    diagnosticsService: new AccessDiagnosticsService({ runner, config: configResult.data }),
    operationRegistry,
    cleanupService: new AccessOperationCleanupService({
      registry: operationRegistry,
      processInspector: new WindowsMsAccessProcessInspector(),
      processKiller: new WindowsProcessKiller(),
    }),
    legacyToolService: new VbaSyncLegacyService({ processTimeoutMs: configResult.data.processTimeoutMs }),
  };

  for (const tool of createDysflowMcpTools(services)) {
    activeRuntime.registerTool(tool);
  }

  await activeRuntime.start();
}

function isMcpStdioRuntime(value: unknown): value is McpStdioRuntime {
  return isRecord(value) && typeof value.registerTool === "function" && typeof value.start === "function";
}
