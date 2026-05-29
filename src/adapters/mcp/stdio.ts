import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
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
import { DEFAULT_MAX_REQUEST_BYTES, SizeLimitTransform } from "./stdio-size-guard.js";
import {
  buildHiddenToolRegistry,
  wrapWithErrorAbsorber,
  wrapWithSanitizer,
} from "./stdio-wrappers.js";
import { createDysflowMcpTools, type DysflowMcpServices, type DysflowMcpTool } from "./tools.js";
import type { McpToolContext } from "./types.js";

const SERVER_VERSION = readPackageVersionNear(import.meta.url);

// MCP protocol version this server implements.
// Check https://spec.modelcontextprotocol.io for newer versions.
// To upgrade: update PROTOCOL_VERSION (re-exported as MCP_PROTOCOL_VERSION) and verify tool schema compatibility.
export const MCP_PROTOCOL_VERSION = "2024-11-05" as const;
export { DEFAULT_MAX_REQUEST_BYTES };

export async function startMcpStdioAdapter(
  config?: DysflowConfig,
  options?: { writesEnabled?: boolean },
): Promise<void> {
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
