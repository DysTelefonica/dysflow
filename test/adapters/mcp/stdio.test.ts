import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DEFAULT_NEGOTIATED_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import {
  createUnavailableServices,
  DEFAULT_MAX_REQUEST_BYTES,
  MCP_PROTOCOL_VERSION,
  MCP_PROTOCOL_VERSION_REVIEW,
  resolveMcpWriteAccessForInput,
  resolveProjectOperationRegistryPath,
} from "../../../src/adapters/mcp/stdio.js";
import { type OperationResult, successResult } from "../../../src/core/contracts/index.js";
import type { AccessDiagnosticsResult } from "../../../src/core/services/diagnostics-service.js";
import type { AccessQueryResult } from "../../../src/core/services/query-service.js";
import type { AccessVbaResult } from "../../../src/core/services/vba-service.js";

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
