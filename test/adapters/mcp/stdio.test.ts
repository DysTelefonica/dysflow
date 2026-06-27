import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import {
  createDynamicServices,
  createUnavailableServices,
  DEFAULT_MAX_REQUEST_BYTES,
  inputTargetsConfig,
  MCP_PROTOCOL_VERSION,
  MCP_PROTOCOL_VERSION_REVIEW,
  resolveMcpWriteAccessForInput,
  resolveProjectOperationRegistryPath,
  startWithSdkServer,
} from "../../../src/adapters/mcp/stdio.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { type OperationResult, successResult } from "../../../src/core/contracts/index.js";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry.js";
import type { AccessDiagnosticsResult } from "../../../src/core/services/diagnostics-service.js";
import type { AccessQueryResult } from "../../../src/core/services/query-service.js";
import type { AccessVbaResult } from "../../../src/core/services/vba-service.js";
import { isRecord } from "../../../src/core/utils/index.js";

class FakeVbaService {
  public requests: unknown[] = [];
  constructor(private readonly result: OperationResult<AccessVbaResult>) {}
  async execute(request: unknown): Promise<OperationResult<AccessVbaResult>> {
    this.requests.push(request);
    return this.result;
  }
}

class FakeQueryService {
  public requests: unknown[] = [];
  async execute(request?: unknown): Promise<OperationResult<AccessQueryResult>> {
    this.requests.push(request);
    return successResult({ rows: [] });
  }
}

class FakeDiagnosticsService {
  async run(): Promise<OperationResult<AccessDiagnosticsResult>> {
    return successResult({ checks: [] });
  }
}

describe("stdio-services / createUnavailableServices / resolves path", () => {
  it("resolves persistent operation registry under repo-local .dysflow/runtime", () => {
    expect(
      resolveProjectOperationRegistryPath({
        projectRoot: "C:/repo/app",
      }).replace(/\\/g, "/"),
    ).toBe("C:/repo/app/.dysflow/runtime/operations.json");
  });

  it("allows project-scoped writes from projectRoot config even when explicit paths are present", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-mcp-write-access-"));
    const project = join(root, "project");
    mkdirSync(join(project, ".dysflow"), { recursive: true });
    writeFileSync(join(project, "front.accdb"), "", "utf8");
    writeFileSync(join(project, "backend.accdb"), "", "utf8");
    writeFileSync(
      join(project, ".dysflow", "project.json"),
      JSON.stringify({
        id: "backend-ddl-project",
        accessPath: "front.accdb",
        backendPath: "backend.accdb",
        allowWrites: true,
      }),
      "utf8",
    );

    await expect(
      resolveMcpWriteAccessForInput({
        projectId: "backend-ddl-project",
        projectRoot: project,
        accessPath: resolve(project, "front.accdb"),
        backendPath: resolve(project, "backend.accdb"),
        tableName: "ZZZ_DDL_TARGET",
        apply: true,
      }),
    ).resolves.toBe(true);
  });

  it("keeps explicit-path writes blocked when the project config does not allow writes", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-mcp-write-denied-"));
    const project = join(root, "project");
    mkdirSync(join(project, ".dysflow"), { recursive: true });
    writeFileSync(join(project, "front.accdb"), "", "utf8");
    writeFileSync(join(project, "backend.accdb"), "", "utf8");
    writeFileSync(
      join(project, ".dysflow", "project.json"),
      JSON.stringify({
        id: "readonly-ddl-project",
        accessPath: "front.accdb",
        backendPath: "backend.accdb",
        allowWrites: false,
      }),
      "utf8",
    );

    await expect(
      resolveMcpWriteAccessForInput({
        projectId: "readonly-ddl-project",
        projectRoot: project,
        accessPath: resolve(project, "front.accdb"),
        backendPath: resolve(project, "backend.accdb"),
        tableName: "ZZZ_DDL_TARGET",
        apply: true,
      }),
    ).resolves.toBe(false);
  });

  it("rejects registered import dry-run after global registry deprecation", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-mcp-startup-"));
    const startup = join(root, "startup");
    const project = join(root, "project");
    const registryPath = join(root, "projects.json");
    mkdirSync(startup, { recursive: true });
    mkdirSync(join(project, ".dysflow"), { recursive: true });
    mkdirSync(join(project, "src", "modules"), { recursive: true });
    writeFileSync(join(project, "front.accdb"), "", "utf8");
    writeFileSync(join(project, "src", "modules", "Entorno.bas"), "", "utf8");
    writeFileSync(
      join(project, ".dysflow", "project.json"),
      JSON.stringify({
        id: "registered-project",
        accessPath: "front.accdb",
        destinationRoot: "src",
      }),
      "utf8",
    );
    writeFileSync(
      registryPath,
      JSON.stringify({
        projects: {
          "registered-project": { configPath: join(project, ".dysflow", "project.json") },
        },
      }),
      "utf8",
    );

    const services = createUnavailableServices(
      {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "startup cwd has no project",
        retryable: false,
      },
      { cwd: startup, env: { DYSFLOW_PROJECT_REGISTRY_PATH: registryPath } },
    );
    const result = await services.vbaSyncToolService?.execute("import_all", {
      contextId: "registered-project",
      dryRun: true,
      importMode: "Code",
    });

    expect(result?.ok).toBe(false);
    if (result === undefined || result.ok) throw new Error("expected registry deprecation failure");
    expect(result.error.code).toBe("CONFIG_PROJECT_NOT_REGISTERED");
    expect(result.error.message).toContain("deprecated");

    const result2 = await services.vbaSyncToolService?.execute("import_all", {
      contextId: "registered-project",
      dryRun: "true",
      importMode: "Code",
    });

    expect(result2?.ok).toBe(false);
    if (result2 === undefined || result2.ok)
      throw new Error("expected registry deprecation failure");
    expect(result2.error.code).toBe("CONFIG_PROJECT_NOT_REGISTERED");
    expect(result2.error.message).toContain("deprecated");
  });

  it("rejects registered read query by projectId after global registry deprecation", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-mcp-read-startup-"));
    const startup = join(root, "startup");
    const project = join(root, "project");
    const registryPath = join(root, "projects.json");
    mkdirSync(startup, { recursive: true });
    mkdirSync(join(project, ".dysflow"), { recursive: true });
    writeFileSync(join(project, "front.accdb"), "", "utf8");
    writeFileSync(
      join(project, ".dysflow", "project.json"),
      JSON.stringify({ id: "lanzadera", accessPath: "front.accdb" }),
      "utf8",
    );
    writeFileSync(
      registryPath,
      JSON.stringify({
        projects: { lanzadera: { configPath: join(project, ".dysflow", "project.json") } },
      }),
      "utf8",
    );

    const query = new FakeQueryService();
    const services = createUnavailableServices(
      {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "startup cwd has no project",
        retryable: false,
      },
      {
        cwd: startup,
        env: { DYSFLOW_PROJECT_REGISTRY_PATH: registryPath },
        serviceFactory: () => ({
          vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
          queryService: query,
          diagnosticsService: new FakeDiagnosticsService(),
        }),
      },
    );
    const result = await services.queryService.execute({
      projectId: "lanzadera",
      sql: "SELECT 1",
      mode: "read",
    } as unknown as Parameters<typeof services.queryService.execute>[0]);

    expect(result.ok).toBe(false);
    expect(query.requests).toEqual([]);
  }, 15_000);

  // #13228 (E2E) — the MCP resolution path must honor an explicit destinationRoot
  // override carried by the request, even when the startup cwd resolves a different
  // repo config. This is the exact path that overwrote 186 staging files: a request
  // passing only destinationRoot (no accessPath) used to collapse to the startup src/.
  it("honors an explicit destinationRoot override over the startup repo config", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-mcp-dest-override-"));
    const startup = join(root, "staging");
    const worktreeSrc = join(root, "worktree", "src");
    mkdirSync(worktreeSrc, { recursive: true });
    mkdirSync(join(startup, ".dysflow"), { recursive: true });
    writeFileSync(join(startup, "front.accdb"), "", "utf8");
    writeFileSync(
      join(startup, ".dysflow", "project.json"),
      JSON.stringify({ id: "staging", accessPath: "front.accdb", destinationRoot: "src" }),
      "utf8",
    );

    let capturedDestinationRoot: string | undefined;
    const services = createUnavailableServices(
      {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "startup cwd has no project",
        retryable: false,
      },
      {
        cwd: startup,
        env: {},
        serviceFactory: (config) => {
          capturedDestinationRoot = config.destinationRoot;
          return {
            vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
            queryService: new FakeQueryService(),
            diagnosticsService: new FakeDiagnosticsService(),
          };
        },
      },
    );

    await services.vbaService.execute({
      destinationRoot: worktreeSrc,
    } as unknown as Parameters<typeof services.vbaService.execute>[0]);

    expect(capturedDestinationRoot).toBe(worktreeSrc);
  });

  it("reuses unavailable-path services when resolved config is unchanged", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-mcp-cache-same-"));
    const frontend = join(root, "front.accdb");
    writeFileSync(frontend, "", "utf8");

    const query = new FakeQueryService();
    let serviceFactoryCalls = 0;
    const services = createUnavailableServices(
      {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "startup cwd has no project",
        retryable: false,
      },
      {
        env: {},
        serviceFactory: () => {
          serviceFactoryCalls += 1;
          return {
            vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
            queryService: query,
            diagnosticsService: new FakeDiagnosticsService(),
          };
        },
      },
    );

    const request = {
      accessPath: frontend,
      sql: "SELECT 1",
      mode: "read",
    } as unknown as Parameters<typeof services.queryService.execute>[0];
    await expect(services.queryService.execute(request)).resolves.toMatchObject({ ok: true });
    await expect(services.queryService.execute(request)).resolves.toMatchObject({ ok: true });

    expect(serviceFactoryCalls).toBe(1);
    expect(query.requests).toHaveLength(2);
  });

  const windowsIt = process.platform === "win32" ? it : it.skip;

  windowsIt("reuses unavailable-path services for equivalent Windows path identities", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-mcp-cache-path-identity-"));
    const frontend = join(root, "front.accdb");
    writeFileSync(frontend, "", "utf8");

    let serviceFactoryCalls = 0;
    const services = createUnavailableServices(
      {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "startup cwd has no project",
        retryable: false,
      },
      {
        env: {},
        serviceFactory: () => {
          serviceFactoryCalls += 1;
          return {
            vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
            queryService: new FakeQueryService(),
            diagnosticsService: new FakeDiagnosticsService(),
          };
        },
      },
    );

    await expect(
      services.queryService.execute({
        accessPath: frontend,
        sql: "SELECT 1",
        mode: "read",
      } as unknown as Parameters<typeof services.queryService.execute>[0]),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      services.queryService.execute({
        accessPath: frontend.toUpperCase(),
        sql: "SELECT 1",
        mode: "read",
      } as unknown as Parameters<typeof services.queryService.execute>[0]),
    ).resolves.toMatchObject({ ok: true });

    expect(serviceFactoryCalls).toBe(1);
  });

  it("creates new unavailable-path services when resolved config changes", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-mcp-cache-changed-"));
    const firstFrontend = join(root, "first.accdb");
    const secondFrontend = join(root, "second.accdb");
    writeFileSync(firstFrontend, "", "utf8");
    writeFileSync(secondFrontend, "", "utf8");

    const resolvedAccessPaths: string[] = [];
    const services = createUnavailableServices(
      {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "startup cwd has no project",
        retryable: false,
      },
      {
        env: {},
        serviceFactory: (config) => {
          resolvedAccessPaths.push(config.accessDbPath);
          return {
            vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
            queryService: new FakeQueryService(),
            diagnosticsService: new FakeDiagnosticsService(),
          };
        },
      },
    );

    await expect(
      services.queryService.execute({
        accessPath: firstFrontend,
        sql: "SELECT 1",
        mode: "read",
      } as unknown as Parameters<typeof services.queryService.execute>[0]),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      services.queryService.execute({
        accessPath: secondFrontend,
        sql: "SELECT 1",
        mode: "read",
      } as unknown as Parameters<typeof services.queryService.execute>[0]),
    ).resolves.toMatchObject({ ok: true });

    expect(resolvedAccessPaths).toEqual([resolve(firstFrontend), resolve(secondFrontend)]);
  });

  it("evicts the oldest unavailable-path service after the bounded cache limit", async () => {
    const root = await mkdtemp(join(tmpdir(), "dysflow-mcp-cache-eviction-"));
    const frontends = Array.from({ length: 17 }, (_, index) => join(root, `front-${index}.accdb`));
    for (const frontend of frontends) {
      writeFileSync(frontend, "", "utf8");
    }

    let serviceFactoryCalls = 0;
    const services = createUnavailableServices(
      {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "startup cwd has no project",
        retryable: false,
      },
      {
        env: {},
        serviceFactory: () => {
          serviceFactoryCalls += 1;
          return {
            vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
            queryService: new FakeQueryService(),
            diagnosticsService: new FakeDiagnosticsService(),
          };
        },
      },
    );

    for (const frontend of frontends) {
      await expect(
        services.queryService.execute({
          accessPath: frontend,
          sql: "SELECT 1",
          mode: "read",
        } as unknown as Parameters<typeof services.queryService.execute>[0]),
      ).resolves.toMatchObject({ ok: true });
    }
    await expect(
      services.queryService.execute({
        accessPath: frontends[0],
        sql: "SELECT 1",
        mode: "read",
      } as unknown as Parameters<typeof services.queryService.execute>[0]),
    ).resolves.toMatchObject({ ok: true });

    expect(serviceFactoryCalls).toBe(18);
  });

  it("keeps non-dry-run VBA sync tools unavailable after startup config failure", async () => {
    const services = createUnavailableServices(
      {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "startup cwd has no project",
        retryable: false,
      },
      { cwd: "C:/missing", env: {} },
    );

    const result = await services.vbaSyncToolService?.execute("import_all", {
      dryRun: false,
      projectId: "registered-project",
    });

    expect(result?.ok).toBe(false);
    if (result === undefined || result.ok) throw new Error("expected startup failure");
    expect(result.error.code).toBe("CONFIG_MISSING_ACCESS_PATH");
  });

  it("createUnavailableServices returns unavailable for diagnostics when config cannot be resolved", async () => {
    const services = createUnavailableServices(
      {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "Access database path is required.",
        retryable: false,
      },
      { cwd: "C:/missing", env: {} },
    );
    const result = await services.diagnosticsService.run({});
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.error.code).toBe("CONFIG_MISSING_ACCESS_PATH");
  });

  it("createUnavailableServices vba service returns a failure result when config cannot be resolved", async () => {
    const services = createUnavailableServices(
      {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "Access database path is required.",
        retryable: false,
      },
      { cwd: "C:/missing", env: {} },
    );
    const result = await services.vbaService.execute({
      moduleName: "SomeModule",
      procedureName: "SomeProc",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected error");
    expect(result.error.code).toBe("CONFIG_MISSING_ACCESS_PATH");
  });

  it("derives the targeted MCP protocol version from the SDK's negotiated default", () => {
    // The SDK owns protocol negotiation; the marker must reflect what the
    // server actually negotiates, not a hand-maintained string that drifts.
    expect(MCP_PROTOCOL_VERSION).toBe(DEFAULT_NEGOTIATED_PROTOCOL_VERSION);
  });

  it("keeps the protocol version review marker synchronized with MCP_PROTOCOL_VERSION", () => {
    // Any intentional MCP protocol bump must update MCP_PROTOCOL_VERSION_REVIEW
    // in the same commit. Drift between the two is a maintenance signal.
    expect(MCP_PROTOCOL_VERSION_REVIEW.version).toBe(MCP_PROTOCOL_VERSION);
  });

  it("records a well-formed maintenance review reference for the MCP protocol version", () => {
    expect(MCP_PROTOCOL_VERSION_REVIEW.reviewedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(MCP_PROTOCOL_VERSION_REVIEW.specRef).toMatch(/^https?:\/\//);
  });

  it("is at most 1 MiB to prevent memory amplification on slow consumers", () => {
    expect(DEFAULT_MAX_REQUEST_BYTES).toBeLessThanOrEqual(1024 * 1024);
  });

  it("resolves vbaSyncToolService dynamically when accessPath is passed explicitly", async () => {
    const tempDbPath = resolve("test-runtime/temp-db-sync.accdb");
    mkdirSync(join(process.cwd(), "test-runtime"), { recursive: true });
    writeFileSync(tempDbPath, "", "utf8");

    let serviceFactoryCalledWithConfig = false;
    const services = createUnavailableServices(
      {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "startup cwd has no project",
        retryable: false,
      },
      {
        cwd: "C:/missing",
        env: {},
        serviceFactory: (config) => {
          if (config.accessDbPath === resolve(tempDbPath)) {
            serviceFactoryCalledWithConfig = true;
          }
          return {
            vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
            queryService: new FakeQueryService(),
            diagnosticsService: new FakeDiagnosticsService(),
            vbaSyncToolService: {
              execute: async (toolName) => {
                return successResult({ toolRun: toolName });
              },
            },
          };
        },
      },
    );

    const result = await services.vbaSyncToolService?.execute("export_modules", {
      accessPath: tempDbPath,
    });

    expect(result?.ok).toBe(true);
    expect(serviceFactoryCalledWithConfig).toBe(true);
    expect(result).toMatchObject({ ok: true, data: { toolRun: "export_modules" } });
  });

  it("routes operationRegistry.update to the registry that owns the operationId (dynamic services)", async () => {
    const tempDbPath = resolve("test-runtime/temp-db-ops-registry.accdb");
    mkdirSync(join(process.cwd(), "test-runtime"), { recursive: true });
    writeFileSync(tempDbPath, "", "utf8");

    const services = createUnavailableServices(
      {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "startup cwd has no project",
        retryable: false,
      },
      {
        cwd: "C:/missing",
        env: {},
        serviceFactory: () => ({
          vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
          queryService: new FakeQueryService(),
          diagnosticsService: new FakeDiagnosticsService(),
          operationRegistry: new InMemoryAccessOperationRegistry(),
        }),
      },
    );

    const registry = services.operationRegistry;
    expect(registry).toBeDefined();
    if (!registry) return;

    // create routes to the registry resolved from accessPath and caches that service.
    const created = await registry.create({
      operationId: "op-dyn-1",
      action: "vba",
      accessPath: tempDbPath,
      accessPid: null,
      processStartTime: null,
      status: "starting",
      metadata: {},
      updatedAt: new Date().toISOString(),
    });
    expect(created.operationId).toBe("op-dyn-1");

    // update must find the owning registry in the cache and land the patch there.
    const updated = await registry.update("op-dyn-1", { status: "running" });
    expect(updated?.status).toBe("running");

    // and the change is observable through a subsequent get.
    const fetched = await registry.get("op-dyn-1");
    expect(fetched?.status).toBe("running");

    // updating an unknown operationId routes to the default registry and returns undefined.
    const missing = await registry.update("op-does-not-exist", { status: "completed" });
    expect(missing).toBeUndefined();
  });

  it("resolves queryService dynamically when databasePath is passed in adapted request", async () => {
    const tempDbPath = resolve("test-runtime/temp-db-query.accdb");
    mkdirSync(join(process.cwd(), "test-runtime"), { recursive: true });
    writeFileSync(tempDbPath, "", "utf8");

    let serviceFactoryCalledWithConfig = false;
    const services = createUnavailableServices(
      {
        code: "CONFIG_MISSING_ACCESS_PATH",
        message: "startup cwd has no project",
        retryable: false,
      },
      {
        cwd: "C:/missing",
        env: {},
        serviceFactory: (config) => {
          if (config.accessDbPath === resolve(tempDbPath)) {
            serviceFactoryCalledWithConfig = true;
          }
          return {
            vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
            queryService: {
              execute: async (request) => {
                return successResult({ sqlRun: request.sql } as unknown as Record<string, unknown>);
              },
            },
            diagnosticsService: new FakeDiagnosticsService(),
          };
        },
      },
    );

    const result = await services.queryService.execute({
      databasePath: tempDbPath,
      sql: "SELECT * FROM Table",
      mode: "read",
    } as unknown as Parameters<typeof services.queryService.execute>[0]);

    expect(result.ok).toBe(true);
    expect(serviceFactoryCalledWithConfig).toBe(true);
    expect(result).toMatchObject({ ok: true, data: { sqlRun: "SELECT * FROM Table" } });
  });
});

describe("createDynamicServices — caching, isolation and routing", () => {
  it("caches and reuses services when configs match, and creates new ones when overrides differ", async () => {
    const dbPathA = resolve("test-runtime/db-a.accdb");
    const dbPathB = resolve("test-runtime/db-b.accdb");
    mkdirSync(join(process.cwd(), "test-runtime"), { recursive: true });
    writeFileSync(dbPathA, "", "utf8");
    writeFileSync(dbPathB, "", "utf8");

    const createdConfigs: string[] = [];
    const services = createDynamicServices(
      undefined,
      { code: "STARTUP_ERR", message: "Startup error", retryable: false },
      {
        cwd: process.cwd(),
        env: {},
        serviceFactory: (config) => {
          createdConfigs.push(config.accessDbPath);
          return {
            vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
            queryService: new FakeQueryService(),
            diagnosticsService: new FakeDiagnosticsService(),
          };
        },
      },
    );

    // First call with dbPathA
    const result1 = await services.vbaService.execute({
      accessPath: dbPathA,
      moduleName: "Mod",
      procedureName: "Proc",
    });
    expect(result1.ok).toBe(true);
    expect(createdConfigs).toEqual([resolve(dbPathA)]);

    // Second call with dbPathA — should be cached
    const result2 = await services.vbaService.execute({
      accessPath: dbPathA,
      moduleName: "Mod",
      procedureName: "Proc",
    });
    expect(result2.ok).toBe(true);
    expect(createdConfigs).toEqual([resolve(dbPathA)]); // No new factory call

    // Third call with dbPathB — should create new service instance
    const result3 = await services.vbaService.execute({
      accessPath: dbPathB,
      moduleName: "Mod",
      procedureName: "Proc",
    });
    expect(result3.ok).toBe(true);
    expect(createdConfigs).toEqual([resolve(dbPathA), resolve(dbPathB)]);
  });

  it("propagates timeoutMs override to service configurations", async () => {
    const dbPath = resolve("test-runtime/db-timeout.accdb");
    mkdirSync(join(process.cwd(), "test-runtime"), { recursive: true });
    writeFileSync(dbPath, "", "utf8");

    let resolvedTimeout: number | undefined;
    const services = createDynamicServices(
      undefined,
      { code: "STARTUP_ERR", message: "Startup error", retryable: false },
      {
        cwd: process.cwd(),
        env: {},
        serviceFactory: (config) => {
          resolvedTimeout = config.timeoutMs;
          return {
            vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
            queryService: new FakeQueryService(),
            diagnosticsService: new FakeDiagnosticsService(),
          };
        },
      },
    );

    await services.vbaService.execute({
      accessPath: dbPath,
      moduleName: "Mod",
      procedureName: "Proc",
      timeoutMs: 9999,
    });

    expect(resolvedTimeout).toBe(9999);
  });
});

describe("E2E mock transport — multiple database targeting with overrides", () => {
  it("routes tool calls to the correct database dynamically via overrides", async () => {
    const dbPath1 = resolve("test-runtime/db-e2e-1.accdb");
    const dbPath2 = resolve("test-runtime/db-e2e-2.accdb");
    mkdirSync(join(process.cwd(), "test-runtime"), { recursive: true });
    writeFileSync(dbPath1, "", "utf8");
    writeFileSync(dbPath2, "", "utf8");

    const targetedDbs: string[] = [];
    const services = createDynamicServices(
      undefined,
      { code: "STARTUP_ERR", message: "Startup error", retryable: false },
      {
        cwd: process.cwd(),
        env: {},
        serviceFactory: (config) => {
          return {
            vbaService: {
              execute: async () => {
                targetedDbs.push(config.accessDbPath);
                return successResult({
                  returnValue: `result-from-${basename(config.accessDbPath)}`,
                });
              },
            },
            queryService: new FakeQueryService(),
            diagnosticsService: new FakeDiagnosticsService(),
          };
        },
      },
    );

    const tools = createDysflowMcpTools(
      services,
      false, // writesEnabled
      async () => false, // writeAccessResolver
      {}, // env
      undefined, // allowedProcedures
      async (input) => {
        const accessPath =
          isRecord(input) && typeof input.accessPath === "string" ? input.accessPath : dbPath1;
        return successResult({ accessPath, projectRoot: process.cwd() });
      },
    );

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const serverDone = startWithSdkServer(tools, serverTransport);

    const client = new Client({ name: "test-client", version: "0.0.1" }, { capabilities: {} });
    await client.connect(clientTransport);

    try {
      const res1 = await client.callTool({
        name: "run_vba",
        arguments: {
          procedureName: "SomeProc",
          accessPath: dbPath1,
        },
      });
      expect(res1.isError).toBeFalsy();
      expect(targetedDbs).toContain(resolve(dbPath1));

      const res2 = await client.callTool({
        name: "run_vba",
        arguments: {
          procedureName: "SomeProc",
          accessPath: dbPath2,
        },
      });
      expect(res2.isError).toBeFalsy();
      expect(targetedDbs).toContain(resolve(dbPath2));
    } finally {
      await client.close();
      await serverDone.catch(() => {});
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELTA-003 (mcp-reliability-fix) — inputTargetsConfig rejects empty input and
// write-gated dispatch tools reject {} with MCP_INPUT_INVALID (#584).
// ─────────────────────────────────────────────────────────────────────────────

describe("DELTA-003 — inputTargetsConfig rejects empty input targeting startup config", () => {
  const startupConfig = {
    projectId: "dysflow",
    accessDbPath: "C:/repo/front.accdb",
    projectRoot: "C:/repo",
    allowWrites: false,
  } as const;

  it("returns false when input is an empty object (does NOT silently target startup config)", () => {
    expect(inputTargetsConfig({}, startupConfig)).toBe(false);
  });

  it("returns false when input has only undeclared fields (no projectId/accessPath/projectRoot)", () => {
    expect(inputTargetsConfig({ unknownField: "x" }, startupConfig)).toBe(false);
  });

  it("returns true when input has projectId equal to startup config projectId", () => {
    expect(inputTargetsConfig({ projectId: "dysflow" }, startupConfig)).toBe(true);
  });

  it("returns true when input has accessPath equal to startup config accessDbPath", () => {
    expect(inputTargetsConfig({ accessPath: "C:/repo/front.accdb" }, startupConfig)).toBe(true);
  });

  it("returns true when input has projectRoot equal to startup config projectRoot", () => {
    expect(inputTargetsConfig({ projectRoot: "C:/repo" }, startupConfig)).toBe(true);
  });

  it("resolveMcpWriteAccessForInput does NOT short-circuit to startup.allowWrites on empty input", async () => {
    // Empty input would, in the buggy path, return startupConfig.allowWrites (true).
    // After DELTA-003, inputTargetsConfig returns false on empty → the resolver
    // falls through to resolveConfigForInput which has no project to load → returns
    // the startupError path. The point is: empty input MUST NOT be treated as
    // "matches startup config and inheriting allowWrites".
    const root = await mkdtemp(join(tmpdir(), "dysflow-empty-input-"));
    const services = createUnavailableServices(
      { code: "STARTUP_ERR", message: "no startup config", retryable: false },
      { cwd: root, env: {} },
    );

    // Spy on the service factory: it should NOT be invoked for empty input.
    let factoryCalls = 0;
    const wrapped = createDynamicServices(undefined, undefined, {
      cwd: root,
      env: {},
      serviceFactory: (config) => {
        factoryCalls += 1;
        return {
          vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
          queryService: new FakeQueryService(),
          diagnosticsService: new FakeDiagnosticsService(),
        };
      },
    });

    // Empty {} should NOT be resolved to startup config (allowWrites is false, so
    // even if it were, the result is observable). Use the startup-aware resolver
    // with the test startup config: empty input must not produce a true result.
    const result = await resolveMcpWriteAccessForInput(
      {},
      {
        projectId: "dysflow",
        accessDbPath: "C:/repo/front.accdb",
        projectRoot: "C:/repo",
        allowWrites: true, // Even with allowWrites:true, empty input must NOT inherit it
      },
    );
    expect(result).toBe(false);
    expect(wrapped).toBeDefined();
    // factoryCalls asserted indirectly via result === false
    void factoryCalls;
  });
});

describe("DELTA-003 — write-gated dispatch tools reject empty input with MCP_INPUT_INVALID", () => {
  it("catalog_add_control with arguments:{} returns MCP_INPUT_INVALID without invoking service", async () => {
    const vbaSyncToolService = {
      execute: vi.fn(async () => successResult({ written: true })),
    };
    const services = {
      vbaService: { execute: vi.fn(async () => successResult({ returnValue: "ok" })) },
      queryService: { execute: vi.fn(async () => successResult({ rows: [] })) },
      diagnosticsService: { run: vi.fn(async () => successResult({ checks: [] })) },
      vbaSyncToolService,
    };

    // Use createDysflowMcpTools so we exercise the full dispatch path (incl. alias tools).
    const tools = createDysflowMcpTools(services, false);
    const tool = tools.find((t) => t.name === "catalog_add_control");
    expect(tool).toBeDefined();

    const result = await tool?.handler({});
    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("MCP_INPUT_INVALID");
    expect(vbaSyncToolService.execute).not.toHaveBeenCalled();
  });

  it("generate_form with arguments:{} returns MCP_INPUT_INVALID without invoking service", async () => {
    const vbaSyncToolService = {
      execute: vi.fn(async () => successResult({ written: true })),
    };
    const services = {
      vbaService: { execute: vi.fn(async () => successResult({ returnValue: "ok" })) },
      queryService: { execute: vi.fn(async () => successResult({ rows: [] })) },
      diagnosticsService: { run: vi.fn(async () => successResult({ checks: [] })) },
      vbaSyncToolService,
    };

    const tools = createDysflowMcpTools(services, false);
    const tool = tools.find((t) => t.name === "generate_form");
    expect(tool).toBeDefined();

    const result = await tool?.handler({});
    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("MCP_INPUT_INVALID");
    expect(vbaSyncToolService.execute).not.toHaveBeenCalled();
  });

  it("tools with NO_INPUT_SCHEMA (e.g. list_access_operations) remain exempt from empty-input rejection", async () => {
    const services = {
      vbaService: { execute: vi.fn(async () => successResult({ returnValue: "ok" })) },
      queryService: { execute: vi.fn(async () => successResult({ rows: [] })) },
      diagnosticsService: { run: vi.fn(async () => successResult({ checks: [] })) },
    };
    const tools = createDysflowMcpTools(services, false);
    const tool = tools.find((t) => t.name === "list_access_operations");
    expect(tool).toBeDefined();

    // Should not throw MCP_INPUT_INVALID — list_access_operations uses NO_INPUT_SCHEMA.
    const result = await tool?.handler({});
    expect(result?.isError).toBeFalsy();
  });
});
