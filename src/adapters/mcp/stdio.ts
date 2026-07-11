import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  DEFAULT_NEGOTIATED_PROTOCOL_VERSION,
  LATEST_PROTOCOL_VERSION,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { DysflowConfig } from "../../core/config/dysflow-config.js";
import { type DysflowError, failureResult, successResult } from "../../core/contracts/index.js";
import { AccessOperationCleanupService } from "../../core/operations/access-operation-cleanup.js";
import {
  type AccessOperationRecord,
  createInMemoryAccessOperationRegistry,
  createProjectAccessOperationRegistry,
} from "../../core/operations/access-operation-registry.js";
import { AccessOrphanCleanupService } from "../../core/operations/access-orphan-cleanup.js";
import { AccessPowerShellRunner } from "../../core/runner/access-runner.js";
import { AccessDiagnosticsService } from "../../core/services/diagnostics-service.js";
import { AccessQueryService } from "../../core/services/query-service.js";
import { AccessVbaService } from "../../core/services/vba-service.js";
import { isRecord, truthy } from "../../core/utils/index.js";
import { readPackageVersionNear } from "../../core/utils/package-info.js";
import { createDefaultCodeGraphVbaInvoker } from "../codegraph-vba/index.js";
import { loadDysflowConfigAsync } from "../config/dysflow-config-node.js";
import { nodeRegistryFileSystem } from "../operations/node-registry-file-system.js";
import { createDefaultPowerShellExecutor } from "../powershell/default-executor.js";
import {
  createWindowsAccessOperationPreflightCleanup,
  WindowsMsAccessProcessInspector,
  WindowsMsAccessProcessScanner,
  WindowsProcessKiller,
} from "../process/windows-processes.js";
import { nodeLockFileSystem } from "../runner/node-lock-file-system.js";
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
const MAX_UNAVAILABLE_SERVICE_CACHE_ENTRIES = 16;

// MCP protocol version this server targets.
//
// Protocol negotiation is owned by the official SDK (McpServer +
// StdioServerTransport handle the initialize handshake). This constant is a
// maintenance marker that MUST reflect what the SDK actually negotiates, so it
// is DERIVED from the SDK's own `DEFAULT_NEGOTIATED_PROTOCOL_VERSION` rather
// than hand-maintained — that way it can never silently drift from reality.
// The SDK additionally supports up to `LATEST_PROTOCOL_VERSION`.
// Check https://spec.modelcontextprotocol.io for newer revisions.
export const MCP_PROTOCOL_VERSION = DEFAULT_NEGOTIATED_PROTOCOL_VERSION;
export const MCP_PROTOCOL_VERSION_LATEST_SUPPORTED = LATEST_PROTOCOL_VERSION;

/**
 * Maintenance marker for the targeted MCP protocol version.
 *
 * Bumping `MCP_PROTOCOL_VERSION` requires updating this object in the same
 * commit so the protocol change is mechanically auditable:
 *   - `version` must stay equal to `MCP_PROTOCOL_VERSION`
 *   - `reviewedAt` records the date the upstream MCP spec was last cross-checked
 *   - `specRef` cites the upstream MCP spec revision that justifies the bump
 *
 * The release checklist (docs/release-checklist.md) must be reviewed before
 * tagging a release. See docs/testing/mcp-protocol-maintenance.md for the
 * hand-written JSON-RPC adapter policy.
 */
export const MCP_PROTOCOL_VERSION_REVIEW = {
  version: MCP_PROTOCOL_VERSION,
  // DELTA-012 — bump reviewedAt on each upstream MCP spec cross-check. The
  // Vitest age gate in test/adapters/mcp/stdio-protocol-review.test.ts
  // fails when this is older than 90 days; see
  // docs/testing/mcp-protocol-maintenance.md.
  reviewedAt: "2026-06-27",
  specRef: "https://modelcontextprotocol.io/specification/2025-03-26",
} as const;

export { DEFAULT_MAX_REQUEST_BYTES };

export async function startMcpStdioAdapter(
  config?: DysflowConfig,
  options?: { writesEnabled?: boolean },
): Promise<void> {
  const configResult =
    config === undefined ? await loadDysflowConfigAsync() : { ok: true as const, data: config };
  const services = createDynamicServices(
    configResult.ok ? configResult.data : undefined,
    configResult.ok ? undefined : configResult.error,
  );
  const writesEnabled = options?.writesEnabled ?? true;
  const startupConfig = configResult.ok ? configResult.data : undefined;

  const tools = createDysflowMcpTools({
    services,
    writes: writesEnabled,
    writeAccessResolver: async (input) => resolveMcpWriteAccessForInput(input, startupConfig),
    env: process.env,
    // #674 — per-input allowedProcedures resolution. The MCP gate (see
    // canonical-handlers.ts:ensureProcedureAllowed) now sees the allowlist
    // of the project the input targets, not the startup one. Without this,
    // a caller could pass the gate with project A's allowlist and execute
    // against project B's binary.
    allowedProcedures: async (input) => {
      const configResult = await resolveConfigForInput(input);
      if (!configResult.ok) return undefined;
      return configResult.data.allowedProcedures;
    },
    accessContextResolver: async (input) => resolveMcpAccessContextForInput(input, startupConfig),
    // allowWrites: leave undefined → defaults to writesEnabled at the
    // capabilities snapshot layer.
    projectId: undefined,
    // #731 — startup project's lint rule overrides (e.g. enabled:false
    // for identifier-safety on a legacy Spanish project). Surfaced into
    // lint_module so it honors opt-outs and triggers the legacy
    // auto-detection downgrade.
    lintOverrides: startupConfig?.lintRulesOverride ?? {},
    // Issue #789 — opt-in to the historical strict (error) severity for
    // the `identifier-safety` non-ASCII check. Resolved from
    // `capabilities.lint.identifierSafety.strictNonAscii` in
    // `.dysflow/project.json`. Default `false`; when `true` the
    // `lint_module` tool restores the legacy strict contract.
    lintIdentifierSafetyStrict: startupConfig?.lintIdentifierSafetyStrict === true,
    // PR-1 (issue #762, v1.20.0) — forward the resolved front-end `.accdb`
    // path so `get_capabilities` can surface the per-project
    // `humanCompilePending` flag from the process-local state cache.
    accessDbPath: startupConfig?.accessDbPath,
  });

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
type SendNotificationFn = (n: unknown) => Promise<unknown>;

interface ProgressExtra {
  sendNotification: SendNotificationFn;
}

/**
 * Build a progress notifier that catches sendNotification rejections so they
 * never escape as unhandledRejection. Logs only when DYSFLOW_DEBUG_PROGRESS
 * is set (opt-in verbose mode); silently swallows otherwise.
 *
 * Extracted as a pure helper (DELTA-008) so it can be unit-tested directly
 * with a mock `sendNotification` that rejects — the SDK's InMemoryTransport
 * does not propagate client-side onprogress throws back to the server's
 * sendNotification, so the only way to exercise the .catch path is to
 * invoke the closure with a rejecting notifier.
 */
export function createProgressNotifier(
  progressToken: string | number | undefined,
  extra: ProgressExtra,
): McpToolContext["sendProgress"] {
  if (progressToken === undefined) return undefined;
  return (progress, total, message) => {
    extra
      .sendNotification({
        method: "notifications/progress",
        params: {
          progressToken,
          progress,
          ...(total !== undefined ? { total } : {}),
          ...(message !== undefined ? { message } : {}),
        },
      })
      .catch((err: unknown) => {
        if (process.env.DYSFLOW_DEBUG_PROGRESS === "true") {
          process.stderr.write(`[dysflow] sendProgress error: ${String(err)}\n`);
        }
      });
  };
}

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
        ok: false,
      };
    }

    const progressToken = _meta?.progressToken;
    const sendProgress = createProgressNotifier(progressToken, {
      sendNotification: (n) =>
        extra.sendNotification(n as Parameters<typeof extra.sendNotification>[0]),
    });

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

export async function resolveMcpAccessContextForInput(
  input: unknown,
  startupConfig?: DysflowConfig,
  options: { cwd?: string; env?: Record<string, string | undefined> } = {},
) {
  if (startupConfig !== undefined && inputTargetsConfig(input, startupConfig)) {
    return successAccessContext(startupConfig, options.cwd);
  }

  const configResult = await resolveConfigForInput(input, options);
  if (!configResult.ok) return configResult;
  return successAccessContext(configResult.data, options.cwd);
}

function successAccessContext(config: DysflowConfig, cwd = process.cwd()) {
  return successResult({
    accessPath: config.accessDbPath,
    projectRoot: config.projectRoot ?? cwd,
    destinationRoot: config.destinationRoot,
  });
}

// #757 (F7) — exported as a test seam so the per-input allowedProcedures
// resolver wiring (below) can be asserted directly without spinning up the
// full SDK server.
export function createConfiguredServices(
  config: DysflowConfig,
  options: { cwd?: string; env?: Record<string, string | undefined> } = {},
): DysflowMcpServices {
  const operationRegistry = createProjectAccessOperationRegistry({
    ...config,
    fileSystem: nodeRegistryFileSystem,
  });
  const runner = new AccessPowerShellRunner({
    executor: createDefaultPowerShellExecutor(),
    lockFileSystem: nodeLockFileSystem,
    operationRegistry,
    preflightCleanup: createWindowsAccessOperationPreflightCleanup({ registry: operationRegistry }),
  });
  const cleanupService = new AccessOperationCleanupService({
    registry: operationRegistry,
    processInspector: new WindowsMsAccessProcessInspector(),
    processKiller: new WindowsProcessKiller(),
    processScanner: new WindowsMsAccessProcessScanner(),
  });
  const orphanCleanupService = new AccessOrphanCleanupService({
    registry: operationRegistry,
    processScanner: new WindowsMsAccessProcessScanner(),
    processInspector: new WindowsMsAccessProcessInspector(),
    processKiller: new WindowsProcessKiller(),
  });
  return {
    vbaService: new AccessVbaService({ runner, config }),
    queryService: new AccessQueryService({ runner, config }),
    diagnosticsService: new AccessDiagnosticsService({ runner, config }),
    operationRegistry,
    cleanupService,
    orphanCleanupService,
    vbaSyncToolService: new VbaSyncAdapter({
      operationRegistry,
      cleanupService,
      timeoutMs: config.timeoutMs,
      cwd: config.projectRoot ?? process.cwd(),
      env: process.env,
      accessPassword: config.accessPassword,
      // PR1b (#621 F1) — forward the project's allowedProcedures allowlist so
      // `VbaExecutionAdapter.executeTestVba` enforces the same default-deny
      // gate as the MCP-handler `handleMcpVbaExecute`. The MCP-handler gate
      // covers `run_vba` / `dysflow_vba_execute` (PR1a); `test_vba` routes
      // through the adapter (PR1b) and shares the same allowlist.
      //
      // #757 (F7) — pass a per-input RESOLVER instead of the frozen
      // config.allowedProcedures. This service bundle is cached by serviceCache
      // per resolved-config key, so a frozen array meant a mid-session edit to
      // .dysflow/project.json was ignored by test_vba until a server restart.
      // The resolver re-reads config on every call (loadDysflowConfig has no
      // cache), so a newly-added test procedure takes effect immediately —
      // mirroring the MCP-handler gate resolver wired in startMcpStdioAdapter
      // (#674/#748) that already gives run_vba this behavior.
      allowedProcedures: async (input: unknown) => {
        const resolved = await resolveConfigForInput(input, options);
        return resolved.ok ? resolved.data.allowedProcedures : undefined;
      },
      // Issue #830 — internal CodeGraph-VBA invoker (one-way: dysflow →
      // codegraph-vba). The default factory shells out to the
      // `codegraph-vba` CLI on demand when `map_form_behavior` is invoked
      // with `autoFetchCodeGraph:true`. Graceful fallback on any failure
      // (no `.codegraph/` index, CLI missing, parse error) is built into
      // the factory — never throws.
      codeGraphVbaInvoker: createDefaultCodeGraphVbaInvoker(),
    }),
  };
}

export function createDynamicServices(
  startupConfig?: DysflowConfig,
  startupError?: DysflowError,
  options: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    serviceFactory?: (config: DysflowConfig) => DysflowMcpServices;
  } = {},
): DysflowMcpServices {
  const serviceCache = new Map<string, DysflowMcpServices>();

  const defaultRegistry = startupConfig
    ? createProjectAccessOperationRegistry({
        ...startupConfig,
        fileSystem: nodeRegistryFileSystem,
      })
    : createInMemoryAccessOperationRegistry();

  const resolveService = async (
    input: unknown,
  ): Promise<{ ok: true; services: DysflowMcpServices } | { ok: false; error: DysflowError }> => {
    const configResult = await resolveConfigForInput(input, options);
    if (!configResult.ok) {
      if (startupError !== undefined) {
        return { ok: false, error: startupError };
      }
      return { ok: false, error: configResult.error };
    }

    if (!existsSync(configResult.data.accessDbPath)) {
      if (startupError !== undefined) {
        return { ok: false, error: startupError };
      }
      return {
        ok: false,
        error: {
          code: "CONFIG_TARGET_NOT_FOUND",
          message: `Configured accessPath does not exist on disk: ${configResult.data.accessDbPath}.`,
          retryable: false,
          details: {
            accessDbPath: configResult.data.accessDbPath,
            configPath: configResult.data.configPath,
            projectRoot: configResult.data.projectRoot,
          },
        },
      };
    }

    const cacheKey = resolvedConfigCacheKey(configResult.data);
    let services = serviceCache.get(cacheKey);
    if (services !== undefined) {
      // DELTA-009 — LRU eviction. Re-insert the entry on get so the
      // insertion-order iterator's head always points at the LEAST recently
      // accessed key. The side-effect (re-set) is acceptable because
      // serviceCache stores unavailable-service references (the wrappers),
      // not the underlying services themselves — see
      // dysflow/mcp-reliability-fix/lru-strategy.
      serviceCache.delete(cacheKey);
      serviceCache.set(cacheKey, services);
    } else {
      // #757 (F7) — the default factory needs `options` (cwd/env) so its
      // per-input allowedProcedures resolver resolves config against the same
      // roots the dispatcher uses. An injected serviceFactory keeps the legacy
      // single-arg shape (tests supply their own allowlist directly).
      services = options.serviceFactory
        ? options.serviceFactory(configResult.data)
        : createConfiguredServices(configResult.data, options);
      if (serviceCache.size >= MAX_UNAVAILABLE_SERVICE_CACHE_ENTRIES) {
        const oldestKey = serviceCache.keys().next().value;
        if (oldestKey !== undefined) serviceCache.delete(oldestKey);
      }
      serviceCache.set(cacheKey, services);
    }
    return { ok: true, services };
  };

  return {
    vbaService: {
      execute: async (request, onProgress) => {
        const res = await resolveService(request);
        if (!res.ok) return failureResult(res.error);
        return res.services.vbaService.execute(request, onProgress);
      },
    },
    queryService: {
      execute: async (request, onProgress) => {
        const res = await resolveService(request);
        if (!res.ok) return failureResult(res.error);
        return res.services.queryService.execute(request, onProgress);
      },
    },
    diagnosticsService: {
      run: async (request) => {
        const res = await resolveService(request);
        if (!res.ok) return failureResult(res.error);
        return res.services.diagnosticsService.run(request);
      },
    },
    cleanupService: {
      cleanup: async (request) => {
        const res = await resolveService(request);
        if (!res.ok) return failureResult(res.error);
        if (res.services.cleanupService === undefined) {
          return failureResult({
            code: "SERVICE_UNAVAILABLE",
            message: "Cleanup service is not available.",
            retryable: false,
          });
        }
        return res.services.cleanupService.cleanup(request);
      },
    },
    orphanCleanupService: {
      listOrphans: async (request) => {
        // DELTA-005 — mirror cleanupOrphan: return failureResult, never throw.
        // A raw throw breaks symmetry with cleanupOrphan and reaches the SDK
        // as an unhandled exception instead of a structured error frame.
        const res = await resolveService(request);
        if (!res.ok) return failureResult(res.error);
        if (res.services.orphanCleanupService === undefined) {
          return failureResult({
            code: "SERVICE_UNAVAILABLE",
            message: "Orphan cleanup service is not available.",
            retryable: false,
          });
        }
        return res.services.orphanCleanupService.listOrphans(request);
      },
      cleanupOrphan: async (request) => {
        const res = await resolveService(request);
        if (!res.ok) return failureResult(res.error);
        if (res.services.orphanCleanupService === undefined) {
          return failureResult({
            code: "SERVICE_UNAVAILABLE",
            message: "Orphan cleanup service is not available.",
            retryable: false,
          });
        }
        return res.services.orphanCleanupService.cleanupOrphan(request);
      },
    },
    operationRegistry: {
      create: async (record) => {
        const res = await resolveService(record);
        const reg =
          res.ok && res.services.operationRegistry
            ? res.services.operationRegistry
            : defaultRegistry;
        return reg.create(record);
      },
      update: async (operationId, patch) => {
        // update() is a no-op returning undefined when the registry does not own the id
        // (see AccessOperationRegistry.update), so we can probe each cached registry with a
        // single locked read-modify-write instead of a separate get() followed by update() —
        // which, for the file-backed registry, read the JSON twice per call.
        for (const service of serviceCache.values()) {
          if (service.operationRegistry) {
            const updated = await service.operationRegistry.update(operationId, patch);
            if (updated) return updated;
          }
        }
        return defaultRegistry.update(operationId, patch);
      },
      get: async (operationId) => {
        for (const service of serviceCache.values()) {
          if (service.operationRegistry) {
            const record = await service.operationRegistry.get(operationId);
            if (record) return record;
          }
        }
        return defaultRegistry.get(operationId);
      },
      listRecent: async (opts) => {
        const allRecordsMap = new Map<string, AccessOperationRecord>();
        const addRecords = (records: AccessOperationRecord[]) => {
          for (const r of records) {
            allRecordsMap.set(r.operationId, r);
          }
        };
        for (const service of serviceCache.values()) {
          if (service.operationRegistry) {
            try {
              const records = await service.operationRegistry.listRecent(opts);
              addRecords(records);
            } catch {
              // ignore
            }
          }
        }
        try {
          const records = await defaultRegistry.listRecent(opts);
          addRecords(records);
        } catch {
          // ignore
        }
        const sorted = Array.from(allRecordsMap.values()).sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        const limit = opts?.limit ?? 50;
        return sorted.slice(0, limit);
      },
      // DELTA-001 (#575): aggregate `registryHealth` across every cached service
      // (and the default registry). If ANY of them is degraded, the aggregate is
      // degraded — corrupt-registry detection must not be hidden behind
      // fan-out. The first degraded entry wins so the caller gets a concrete
      // quarantinePath to inspect.
      getHealth: () => {
        for (const service of serviceCache.values()) {
          if (service.operationRegistry) {
            const health = service.operationRegistry.getHealth();
            if (health.status === "degraded") return health;
          }
        }
        return defaultRegistry.getHealth();
      },
    },
    vbaSyncToolService: {
      execute: async (toolName, input) => {
        const res = await resolveService(input);
        if (res.ok && res.services.vbaSyncToolService !== undefined) {
          return res.services.vbaSyncToolService.execute(toolName, input);
        }
        const fallbackService = createUnavailableVbaSyncToolService(
          res.ok
            ? { code: "CONFIG_MISSING_ACCESS_PATH", message: "Missing", retryable: false }
            : res.error,
          options,
        );
        return fallbackService.execute(toolName, input);
      },
    },
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
  return createDynamicServices(undefined, error, options);
}

async function resolveConfigForInput(
  input: unknown,
  options: { cwd?: string; env?: Record<string, string | undefined> } = {},
  resolutionOptions: { preferProjectConfig?: boolean } = {},
) {
  const params = isRecord(input) ? input : {};
  const projectRoot = stringOrUndefined(params.projectRoot);
  const preferProjectConfig = resolutionOptions.preferProjectConfig === true;
  const timeoutMs =
    typeof params.timeoutMs === "number"
      ? params.timeoutMs
      : typeof params.timeoutMs === "string" && !Number.isNaN(Number(params.timeoutMs))
        ? Number(params.timeoutMs)
        : undefined;

  return await loadDysflowConfigAsync({
    cwd: projectRoot ?? options.cwd,
    env: options.env,
    projectId: stringOrUndefined(params.projectId),
    contextId: stringOrUndefined(params.contextId),
    accessDbPath: preferProjectConfig
      ? undefined
      : stringOrUndefined(params.accessPath ?? params.databasePath ?? params.accessDbPath),
    backendPath: preferProjectConfig ? undefined : stringOrUndefined(params.backendPath),
    destinationRoot: stringOrUndefined(params.destinationRoot),
    projectRoot,
    timeoutMs,
  });
}

export function inputTargetsConfig(input: unknown, config: DysflowConfig): boolean {
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

  return false;
}

function resolvedConfigCacheKey(config: DysflowConfig): string {
  const identity = [
    config.configSource,
    config.allowWrites,
    config.allowedProcedures === undefined ? null : [...new Set(config.allowedProcedures)].sort(),
    pathIdentity(config.accessDbPath),
    optionalPathIdentity(config.backendPath),
    optionalPathIdentity(config.destinationRoot),
    optionalPathIdentity(config.projectRoot),
    config.projectId ?? null,
    config.timeoutMs,
    config.accessPassword ?? null,
    config.backendPassword ?? null,
    config.accessPasswordEnv ?? null,
    config.backendPasswordEnv ?? null,
    optionalPathIdentity(config.configPath),
    config.httpToken ?? null,
    config.httpTokenEnv ?? null,
  ];
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

function optionalPathIdentity(value: string | undefined): string | null {
  return value === undefined ? null : pathIdentity(value);
}

function pathIdentity(value: string): string {
  return resolve(value).toLowerCase();
}

function pathsMatch(left: string, right: string): boolean {
  return pathIdentity(left) === pathIdentity(right);
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
        (toolName === "import_all" || toolName === "import_modules") && truthy(params.dryRun);
      if (isSafeImportDryRun) return fallback.execute(toolName, input);
      return failureResult(error);
    },
  };
}

// re-exported from core — do not add new imports from adapters here
export { resolveProjectOperationRegistryPath } from "../../core/operations/access-operation-registry.js";
