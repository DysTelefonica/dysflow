import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createUnavailableServices,
  DEFAULT_MAX_REQUEST_BYTES,
  MCP_PROTOCOL_VERSION,
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

  it("declares the targeted MCP protocol version as a named maintenance constant", () => {
    expect(MCP_PROTOCOL_VERSION).toBe("2024-11-05");
  });

  it("is at most 1 MiB to prevent memory amplification on slow consumers", () => {
    expect(DEFAULT_MAX_REQUEST_BYTES).toBeLessThanOrEqual(1024 * 1024);
  });
});
