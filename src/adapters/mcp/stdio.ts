import { createInterface } from "node:readline";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { loadDysflowConfig, type DysflowConfig } from "../../core/config/dysflow-config.js";
import { AccessOperationCleanupService } from "../../core/operations/access-operation-cleanup.js";
import { WindowsMsAccessProcessInspector, WindowsProcessKiller } from "../../core/operations/windows-processes.js";
import { FileAccessOperationRegistry } from "../../core/operations/access-operation-registry.js";
import { AccessPowerShellRunner } from "../../core/runner/access-runner.js";
import { AccessDiagnosticsService } from "../../core/services/diagnostics-service.js";
import { AccessQueryService } from "../../core/services/query-service.js";
import { AccessVbaService } from "../../core/services/vba-service.js";
import { VbaSyncLegacyService } from "../../core/services/vba-sync-legacy-service.js";
import { createDysflowMcpTools, type DysflowMcpServices, type DysflowMcpTool, type McpToolResult } from "./tools.js";
import { isRecord } from "../../core/utils/index.js";
import { readPackageVersionNear } from "../../core/utils/package-info.js";
import { failureResult, type DysflowError } from "../../core/contracts/index.js";

const SERVER_VERSION = readPackageVersionNear(import.meta.url);

/**
 * MCP protocol version intentionally targeted by Dysflow's hand-written stdio runtime.
 * When MCP protocol support changes, update this constant and the protocol maintenance tests together.
 */
export const MCP_PROTOCOL_VERSION = "2024-11-05";

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
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "dysflow", version: SERVER_VERSION },
      };
    }

    if (request.method === "tools/list") {
      return {
        tools: [...this.tools.values()]
          .filter((tool) => !tool.hidden)
          .map((tool) => ({
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
    try {
      return await tool.handler(call.arguments);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool call failed.";
      return { content: [{ type: "text", text: `MCP_TOOL_ERROR: ${message}` }], isError: true };
    }
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
export async function startMcpStdioAdapter(config?: DysflowConfig, options?: { writesEnabled?: boolean }, runtime?: McpStdioRuntime): Promise<void>;
export async function startMcpStdioAdapter(configOrRuntime?: DysflowConfig | McpStdioRuntime, optionsOrRuntime?: { writesEnabled?: boolean } | McpStdioRuntime, runtime?: McpStdioRuntime): Promise<void> {
  const suppliedRuntime = isMcpStdioRuntime(configOrRuntime) ? configOrRuntime : isMcpStdioRuntime(optionsOrRuntime) ? optionsOrRuntime : runtime;
  const options = isMcpStdioRuntime(optionsOrRuntime) ? undefined : optionsOrRuntime;
  const config = isMcpStdioRuntime(configOrRuntime) ? undefined : configOrRuntime;
  const activeRuntime = suppliedRuntime ?? new JsonLineMcpStdioRuntime();
  const configResult = config === undefined ? loadDysflowConfig() : { ok: true as const, data: config };
  const services = configResult.ok ? createConfiguredServices(configResult.data) : createUnavailableServices(configResult.error);
  services.writesEnabled = options?.writesEnabled ?? false;

  for (const tool of createDysflowMcpTools(services)) {
    activeRuntime.registerTool(tool);
  }

  await activeRuntime.start();
}

function createConfiguredServices(config: DysflowConfig): DysflowMcpServices {
  const operationRegistry = createProjectOperationRegistry(config);
  const runner = new AccessPowerShellRunner({ operationRegistry });
  return {
    vbaService: new AccessVbaService({ runner, config }),
    queryService: new AccessQueryService({ runner, config }),
    diagnosticsService: new AccessDiagnosticsService({ runner, config }),
    operationRegistry,
    cleanupService: new AccessOperationCleanupService({
      registry: operationRegistry,
      processInspector: new WindowsMsAccessProcessInspector(),
      processKiller: new WindowsProcessKiller(),
    }),
    legacyToolService: new VbaSyncLegacyService({
      processTimeoutMs: config.processTimeoutMs,
      accessPath: config.accessDbPath,
      destinationRoot: config.destinationRoot,
      accessPassword: config.accessPassword,
    }),
  };
}

export function createUnavailableServices(
  error: DysflowError,
  options: { cwd?: string; env?: Record<string, string | undefined> } = {},
): DysflowMcpServices {
  const unavailable = async () => failureResult(error);
  return {
    vbaService: { execute: unavailable },
    queryService: { execute: unavailable },
    diagnosticsService: {
      run: async () => failureResult({
        code: error.code,
        message: error.message,
        retryable: error.retryable,
      }),
    },
    legacyToolService: createUnavailableLegacyToolService(error, options),
  };
}

function createUnavailableLegacyToolService(
  error: DysflowError,
  options: { cwd?: string; env?: Record<string, string | undefined> },
): NonNullable<DysflowMcpServices["legacyToolService"]> {
  const fallback = new VbaSyncLegacyService({
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
  });
  return {
    execute: async (toolName, input) => {
      const params = isRecord(input) ? input : {};
      const isSafeImportDryRun =
        (toolName === "import_all" || toolName === "import_modules") &&
        (params.dryRun === true || params.dryRun === "true");
      if (isSafeImportDryRun) return fallback.execute(toolName, input);
      return failureResult(error);
    },
  };
}

export function resolveProjectOperationRegistryPath(config: Pick<DysflowConfig, "projectRoot">): string {
  return join(config.projectRoot ?? process.cwd(), ".dysflow", "runtime", "operations.json");
}

function createProjectOperationRegistry(config: Pick<DysflowConfig, "projectRoot">): FileAccessOperationRegistry {
  return new FileAccessOperationRegistry({ filePath: resolveProjectOperationRegistryPath(config) });
}

function isMcpStdioRuntime(value: unknown): value is McpStdioRuntime {
  return isRecord(value) && typeof value.registerTool === "function" && typeof value.start === "function";
}
