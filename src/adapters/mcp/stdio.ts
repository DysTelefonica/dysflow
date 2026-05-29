import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { Readable, Writable } from "node:stream";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { type DysflowConfig, loadDysflowConfigAsync } from "../../core/config/dysflow-config.js";
import { type DysflowError, failureResult } from "../../core/contracts/index.js";
import { AccessOperationCleanupService } from "../../core/operations/access-operation-cleanup.js";
import {
  FileAccessOperationRegistry,
  resolveProjectOperationRegistryPath as resolveRegistryPath,
} from "../../core/operations/access-operation-registry.js";
import {
  WindowsMsAccessProcessInspector,
  WindowsMsAccessProcessScanner,
  WindowsProcessKiller,
} from "../../core/operations/windows-processes.js";
import { AccessPowerShellRunner } from "../../core/runner/access-runner.js";
import { AccessDiagnosticsService } from "../../core/services/diagnostics-service.js";
import { AccessQueryService } from "../../core/services/query-service.js";
import { AccessVbaService } from "../../core/services/vba-service.js";
import { isRecord } from "../../core/utils/index.js";
import { readPackageVersionNear } from "../../core/utils/package-info.js";
import { VbaSyncAdapter } from "../vba-sync/vba-sync-adapter.js";
import {
  createDysflowMcpTools,
  type DysflowMcpServices,
  type DysflowMcpTool,
  type McpToolResult,
  sanitizeMcpErrorMessage,
} from "./tools.js";
import type { McpToolContext } from "./types.js";
import { DEFAULT_MAX_REQUEST_BYTES, SizeLimitTransform } from "./stdio-size-guard.js";
import {
  buildHiddenToolRegistry,
  wrapWithErrorAbsorber,
  wrapWithSanitizer,
} from "./stdio-wrappers.js";

const SERVER_VERSION = readPackageVersionNear(import.meta.url);

// MCP protocol version this server implements.
// Check https://spec.modelcontextprotocol.io for newer versions.
// To upgrade: update PROTOCOL_VERSION (re-exported as MCP_PROTOCOL_VERSION) and verify tool schema compatibility.
export const MCP_PROTOCOL_VERSION = "2024-11-05" as const;
export { DEFAULT_MAX_REQUEST_BYTES };

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
  maxRequestBytes?: number;
};

export class JsonLineMcpStdioRuntime implements McpStdioRuntime {
  private readonly tools = new Map<string, DysflowMcpTool>();
  private readonly input: Readable;
  private readonly output: Writable;
  private readonly maxRequestBytes: number;

  constructor(options: JsonLineMcpStdioRuntimeOptions = {}) {
    this.input = options.input ?? process.stdin;
    this.output = options.output ?? process.stdout;
    this.maxRequestBytes = Math.max(
      1,
      Math.floor(options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES),
    );
  }

  registerTool(tool: DysflowMcpTool): void {
    this.tools.set(tool.name, tool);
  }

  async start(): Promise<void> {
    let buffer = "";
    let pendingBytes = 0;
    let droppingOversizedLine = false;

    for await (const chunk of this.input) {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      const chunkLength = text.length;
      let cursor = 0;
      while (cursor < chunkLength) {
        const nextNewline = text.indexOf("\n", cursor);
        if (nextNewline === -1) {
          if (!droppingOversizedLine) {
            const tail = text.slice(cursor);
            buffer += tail;
            pendingBytes += Buffer.byteLength(tail, "utf8");
            if (pendingBytes > this.maxRequestBytes) {
              this.writeResponse(null, {
                code: -32700,
                message: `Request line exceeds ${this.maxRequestBytes} bytes.`,
              });
              droppingOversizedLine = true;
              buffer = "";
              pendingBytes = 0;
            }
          }
          break;
        }

        if (!droppingOversizedLine) {
          const chunkLine = text.slice(cursor, nextNewline);
          buffer += chunkLine;
          pendingBytes += Buffer.byteLength(chunkLine, "utf8");
          if (buffer.trim().length === 0) {
            buffer = "";
            pendingBytes = 0;
          } else if (pendingBytes > this.maxRequestBytes) {
            this.writeResponse(null, {
              code: -32700,
              message: `Request line exceeds ${this.maxRequestBytes} bytes.`,
            });
            droppingOversizedLine = true;
            buffer = "";
            pendingBytes = 0;
          } else {
            const line = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
            await this.handleLine(line);
            buffer = "";
            pendingBytes = 0;
          }
        }

        if (droppingOversizedLine) {
          droppingOversizedLine = false;
        }
        cursor = nextNewline + 1;
      }
    }

    if (!droppingOversizedLine && buffer.trim().length > 0) {
      if (pendingBytes > this.maxRequestBytes) {
        this.writeResponse(null, {
          code: -32700,
          message: `Request line exceeds ${this.maxRequestBytes} bytes.`,
        });
      } else {
        const line = buffer.endsWith("\r") ? buffer.slice(0, -1) : buffer;
        await this.handleLine(line);
      }
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
            inputSchema: tool.inputSchema ?? {
              type: "object",
              additionalProperties: false,
              properties: {},
            },
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

    const meta = isRecord(call._meta) ? call._meta : undefined;
    const progressToken =
      meta !== undefined &&
      (typeof meta.progressToken === "string" || typeof meta.progressToken === "number")
        ? meta.progressToken
        : undefined;

    const sendProgress: McpToolContext["sendProgress"] | undefined =
      progressToken !== undefined
        ? (progress, total, message) => {
            this.writeNotification("notifications/progress", {
              progressToken,
              progress,
              ...(total !== undefined ? { total } : {}),
              ...(message !== undefined ? { message } : {}),
            });
          }
        : undefined;

    const context: McpToolContext = {
      progressToken,
      sendProgress: sendProgress as McpToolContext["sendProgress"],
    };

    try {
      return await tool.handler(call.arguments, context);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool call failed.";
      return {
        content: [{ type: "text", text: `MCP_TOOL_ERROR: ${sanitizeMcpErrorMessage(message)}` }],
        isError: true,
      };
    }
  }

  private writeNotification(method: string, params: unknown): void {
    this.output.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
  }

  private writeResponse(
    id: string | number | null,
    error?: { code: number; message: string },
    result?: unknown,
  ): void {
    const payload =
      error === undefined ? { jsonrpc: "2.0", id, result } : { jsonrpc: "2.0", id, error };
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
export async function startMcpStdioAdapter(
  config?: DysflowConfig,
  runtime?: McpStdioRuntime,
): Promise<void>;
export async function startMcpStdioAdapter(
  config?: DysflowConfig,
  options?: { writesEnabled?: boolean },
  runtime?: McpStdioRuntime,
): Promise<void>;
export async function startMcpStdioAdapter(
  configOrRuntime?: DysflowConfig | McpStdioRuntime,
  optionsOrRuntime?: { writesEnabled?: boolean } | McpStdioRuntime,
  runtime?: McpStdioRuntime,
): Promise<void> {
  const suppliedRuntime = isMcpStdioRuntime(configOrRuntime)
    ? configOrRuntime
    : isMcpStdioRuntime(optionsOrRuntime)
      ? optionsOrRuntime
      : runtime;
  const options = isMcpStdioRuntime(optionsOrRuntime) ? undefined : optionsOrRuntime;
  const config = isMcpStdioRuntime(configOrRuntime) ? undefined : configOrRuntime;

  const configResult =
    config === undefined ? await loadDysflowConfigAsync() : { ok: true as const, data: config };
  const services = configResult.ok
    ? createConfiguredServices(configResult.data)
    : createUnavailableServices(configResult.error);
  const writesEnabled = options?.writesEnabled ?? false;
  const startupConfig = configResult.ok ? configResult.data : undefined;

  const tools = createDysflowMcpTools(
    services,
    writesEnabled,
    async (input) => resolveMcpWriteAccessForInput(input, startupConfig),
    process.env,
    startupConfig?.allowedProcedures,
  );

  // When a legacy runtime is supplied, use it for backward compatibility.
  if (suppliedRuntime !== undefined) {
    for (const tool of tools) {
      suppliedRuntime.registerTool(tool);
    }
    await suppliedRuntime.start();
    return;
  }

  // New SDK-based path: wire SizeLimitTransform → StdioServerTransport → McpServer.
  await startWithSdkServer(tools);
}

/**
 * Starts an McpServer backed by the official SDK transport.
 *
 * Hidden tools are registered via server.tool() so the SDK's tools/call handler
 * dispatches them normally. We override tools/list via server.server.setRequestHandler
 * to strip hidden tools from the advertised list — keeping them callable but invisible
 * to clients that enumerate tools.
 *
 * SizeLimitTransform guards stdin: oversized lines emit a -32700 error frame and are
 * dropped; normal lines pass through for JSON-RPC parsing by StdioServerTransport.
 *
 * @param tools - The tools to register.
 * @param transport - Optional transport override. When provided, the SizeLimitTransform
 *   and StdioServerTransport are skipped. Used in tests with InMemoryTransport.
 */
export async function startWithSdkServer(
  tools: DysflowMcpTool[],
  transport?: import("@modelcontextprotocol/sdk/shared/transport.js").Transport,
): Promise<void> {
  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const hiddenRegistry = buildHiddenToolRegistry(tools);

  const server = new McpServer({ name: "dysflow", version: SERVER_VERSION });

  // Register capabilities and handlers directly on the underlying Server to avoid
  // overload ambiguity from passing raw JSON Schema objects to server.tool().
  server.server.registerCapabilities({ tools: {} });

  server.server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: tools
      .filter((t) => !hiddenRegistry.has(t.name))
      .map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema ?? {
          type: "object" as const,
          additionalProperties: false,
          properties: {},
        },
      })),
  }));

  server.server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args, _meta } = request.params;
    const tool = toolMap.get(name);
    if (tool === undefined) {
      return {
        content: [{ type: "text" as const, text: `MCP_TOOL_ERROR: Tool not found: ${name}` }],
        isError: true,
      };
    }

    const progressToken = _meta?.progressToken;
    const sendProgress: McpToolContext["sendProgress"] =
      progressToken !== undefined
        ? (progress, total, message) => {
            void extra.sendNotification({
              method: "notifications/progress",
              params: {
                progressToken,
                progress,
                ...(total !== undefined ? { total } : {}),
                ...(message !== undefined ? { message } : {}),
              },
            });
          }
        : undefined;

    const context: McpToolContext = { progressToken, sendProgress };
    const wrappedHandler = wrapWithSanitizer(wrapWithErrorAbsorber(tool.handler));
    const result = await wrappedHandler(args, context);
    // Spread readonly content[] into mutable array as required by the SDK's CallToolResult type.
    return { ...result, content: [...result.content] };
  });

  if (transport !== undefined) {
    await server.connect(transport);
    return;
  }

  const sizeGuard = new SizeLimitTransform(DEFAULT_MAX_REQUEST_BYTES, process.stdout);
  process.stdin.pipe(sizeGuard);

  const stdioTransport = new StdioServerTransport(sizeGuard, process.stdout);
  await server.connect(stdioTransport);
}

export async function resolveMcpWriteAccessForInput(
  input: unknown,
  startupConfig?: DysflowConfig,
  options: { cwd?: string; env?: Record<string, string | undefined> } = {},
): Promise<boolean> {
  if (startupConfig !== undefined && inputTargetsConfig(input, startupConfig)) {
    return startupConfig.allowWrites;
  }
  const configResult = await resolveConfigForInput(input, options, { preferProjectConfig: true });
  return configResult.ok ? configResult.data.allowWrites : false;
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
      processScanner: new WindowsMsAccessProcessScanner(),
    }),
    vbaSyncToolService: new VbaSyncAdapter({
      processTimeoutMs: config.processTimeoutMs,
      cwd: config.projectRoot ?? process.cwd(),
      env: process.env,
      accessPassword: config.accessPassword,
    }),
  };
}

export function createUnavailableServices(
  error: DysflowError,
  options: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    serviceFactory?: (config: DysflowConfig) => DysflowMcpServices;
  } = {},
): DysflowMcpServices {
  const unavailable = async () => failureResult(error);
  const resolveService = async (input: unknown): Promise<DysflowMcpServices | undefined> => {
    const configResult = await resolveConfigForInput(input, options);
    if (configResult.ok && !existsSync(configResult.data.accessDbPath)) return undefined;
    return configResult.ok
      ? (options.serviceFactory ?? createConfiguredServices)(configResult.data)
      : undefined;
  };
  return {
    vbaService: {
      execute: async (request, onProgress) => {
        const dynamicServices = await resolveService(request);
        if (dynamicServices === undefined) return unavailable();
        return dynamicServices.vbaService.execute(request, onProgress);
      },
    },
    queryService: {
      execute: async (request, onProgress) => {
        const dynamicServices = await resolveService(request);
        if (dynamicServices === undefined) return unavailable();
        return dynamicServices.queryService.execute(request, onProgress);
      },
    },
    diagnosticsService: {
      run: async (request) => {
        const dynamicServices = await resolveService(request);
        if (dynamicServices !== undefined) return dynamicServices.diagnosticsService.run(request);
        return failureResult({
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        });
      },
    },
    vbaSyncToolService: createUnavailableVbaSyncToolService(error, options),
  };
}

async function resolveConfigForInput(
  input: unknown,
  options: { cwd?: string; env?: Record<string, string | undefined> } = {},
  resolutionOptions: { preferProjectConfig?: boolean } = {},
) {
  const params = isRecord(input) ? input : {};
  const projectRoot = stringOrUndefined(params.projectRoot);
  const preferProjectConfig = resolutionOptions.preferProjectConfig === true;
  return await loadDysflowConfigAsync({
    cwd: projectRoot ?? options.cwd,
    env: options.env,
    projectId: stringOrUndefined(params.projectId),
    contextId: stringOrUndefined(params.contextId),
    accessDbPath: preferProjectConfig ? undefined : stringOrUndefined(params.accessPath),
    backendPath: preferProjectConfig ? undefined : stringOrUndefined(params.backendPath),
    destinationRoot: stringOrUndefined(params.destinationRoot),
    projectRoot,
  });
}

function inputTargetsConfig(input: unknown, config: DysflowConfig): boolean {
  const params = isRecord(input) ? input : {};
  const requestedProjectId =
    stringOrUndefined(params.projectId) ?? stringOrUndefined(params.contextId);
  if (requestedProjectId !== undefined) return requestedProjectId === config.projectId;

  const accessPath = stringOrUndefined(params.accessPath);
  if (accessPath !== undefined && pathsMatch(accessPath, config.accessDbPath)) return true;

  const projectRoot = stringOrUndefined(params.projectRoot);
  if (projectRoot !== undefined && config.projectRoot !== undefined) {
    return pathsMatch(projectRoot, config.projectRoot);
  }

  return Object.keys(params).length === 0;
}

function pathsMatch(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase();
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function createUnavailableVbaSyncToolService(
  error: DysflowError,
  options: { cwd?: string; env?: Record<string, string | undefined> },
): NonNullable<DysflowMcpServices["vbaSyncToolService"]> {
  const fallback = new VbaSyncAdapter({
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

// re-exported from core — do not add new imports from adapters here
export { resolveProjectOperationRegistryPath } from "../../core/operations/access-operation-registry.js";

function createProjectOperationRegistry(
  config: Pick<DysflowConfig, "projectRoot">,
): FileAccessOperationRegistry {
  return new FileAccessOperationRegistry({ filePath: resolveRegistryPath(config) });
}

function isMcpStdioRuntime(value: unknown): value is McpStdioRuntime {
  return (
    isRecord(value) && typeof value.registerTool === "function" && typeof value.start === "function"
  );
}
