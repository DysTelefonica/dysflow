import { describe, expect, it } from "vitest";
import { createDysflowMcpTools, translateCoreResultToMcpContent } from "../../../src/adapters/mcp/tools";
import { failureResult, successResult, type OperationResult } from "../../../src/core/contracts/index";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry";
import type { AccessDiagnosticsResult } from "../../../src/core/services/diagnostics-service";
import type { AccessQueryResult } from "../../../src/core/services/query-service";
import type { AccessVbaResult } from "../../../src/core/services/vba-service";

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
  constructor(private readonly result: OperationResult<AccessQueryResult>) {}
  async execute(request: unknown): Promise<OperationResult<AccessQueryResult>> {
    this.requests.push(request);
    return this.result;
  }
}

class FakeDiagnosticsService {
  public requests: unknown[] = [];
  constructor(private readonly result: OperationResult<AccessDiagnosticsResult>) {}
  async run(request: unknown): Promise<OperationResult<AccessDiagnosticsResult>> {
    this.requests.push(request);
    return this.result;
  }
}

describe("MCP tool registration over core services", () => {
  it("exposes context with resolved paths, password source and cleanup safety without leaking secrets", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({
      operationId: "op-risk",
      action: "vba",
      accessPath: "C:/Proyectos/dysflow/NoConformidades.accdb",
      projectRootAbs: "C:/Proyectos/dysflow",
      destinationRootAbs: "C:/Proyectos/dysflow",
      accessPid: 1234,
      processStartTime: "2026-05-16T10:00:00.000Z",
      status: "completed",
      metadata: {},
      updatedAt: "2026-05-16T10:00:00.000Z",
    });
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: null })),
      queryService: new FakeQueryService(successResult({ rows: [] })),
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      operationRegistry: registry,
      context: {
        configuredAccessPath: "C:/00repos/codigo/00_GESTION_RIESGOS_develop/Gestion_Riesgos.accdb",
        resolvedAccessPath: "C:/00repos/codigo/00_GESTION_RIESGOS_develop/Gestion_Riesgos.accdb",
        backendPath: "C:/00repos/codigo/00_GESTION_RIESGOS_develop/Gestion_Riesgos_Datos.accdb",
        projectRoot: "C:/00repos/codigo/00_GESTION_RIESGOS_develop",
        destinationRoot: "C:/00repos/codigo/00_GESTION_RIESGOS_develop",
        sessionAccessPath: undefined,
        passwordSource: "env",
      },
    });

    const result = await tools.find((tool) => tool.name === "dysflow.context")?.handler({});
    expect(result?.isError).toBe(false);
    const data = JSON.parse(result?.content[0]?.text ?? "{}") as Record<string, unknown>;

    expect(data).toMatchObject({
      configuredAccessPath: "C:/00repos/codigo/00_GESTION_RIESGOS_develop/Gestion_Riesgos.accdb",
      resolvedAccessPath: "C:/00repos/codigo/00_GESTION_RIESGOS_develop/Gestion_Riesgos.accdb",
      backendPath: "C:/00repos/codigo/00_GESTION_RIESGOS_develop/Gestion_Riesgos_Datos.accdb",
      projectRoot: "C:/00repos/codigo/00_GESTION_RIESGOS_develop",
      destinationRoot: "C:/00repos/codigo/00_GESTION_RIESGOS_develop",
      passwordSource: "env",
    });
    expect(JSON.stringify(data)).not.toContain("env-secret");
    expect(data).toMatchObject({
      activeOperations: [{
        operationId: "op-risk",
        accessPath: "C:/Proyectos/dysflow/NoConformidades.accdb",
        accessPid: 1234,
        cleanupSafe: false,
      }],
    });
  });

  it("publishes useful MCP input schemas for multi-project Access tools", () => {
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: null })),
      queryService: new FakeQueryService(successResult({ rows: [] })),
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    expect(tools.find((tool) => tool.name === "import_modules")?.inputSchema).toMatchObject({
      properties: {
        accessPath: { type: "string" },
        destinationRoot: { type: "string" },
        moduleNames: { type: "array" },
        importMode: { type: "string" },
      },
      required: ["accessPath", "destinationRoot"],
    });
    expect(tools.find((tool) => tool.name === "test_vba")?.inputSchema).toMatchObject({
      properties: {
        accessPath: { type: "string" },
        destinationRoot: { type: "string" },
        testsPath: { type: "string" },
        procedureName: { type: "string" },
        compile: { type: "boolean" },
        reuseInstance: { type: "boolean" },
      },
    });
    expect(tools.find((tool) => tool.name === "dysflow.vba.execute")?.inputSchema).toMatchObject({
      properties: {
        accessPath: { type: "string" },
        procedureName: { type: "string" },
      },
      required: ["procedureName", "accessPath"],
    });
  });

  it("registers protocol-safe MCP tools that invoke the matching core services", async () => {
    const vba = new FakeVbaService(successResult({ returnValue: "refreshed" }, { durationMs: 7 }));
    const query = new FakeQueryService(successResult({ rows: [{ id: 1, name: "Ada" }] }, { durationMs: 5 }));
    const diagnostics = new FakeDiagnosticsService(
      successResult({ checks: [{ name: "access-db-path", ok: true, message: "configured" }] }, { durationMs: 3 }),
    );

    const tools = createDysflowMcpTools({ vbaService: vba, queryService: query, diagnosticsService: diagnostics });
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toEqual(expect.arrayContaining(["dysflow.vba.execute", "dysflow.query.execute", "dysflow.doctor", "dysflow.access.operations.list", "dysflow.access.cleanup"]));
    await expect(tools[0]?.handler({ moduleName: "Automation", procedureName: "Refresh", arguments: [2026], accessPath: "C:/data/app.accdb" })).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ returnValue: "refreshed" }) }],
      isError: false,
    });
    await expect(tools[1]?.handler({ sql: "SELECT id, name FROM People", mode: "read" })).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ rows: [{ id: 1, name: "Ada" }] }) }],
      isError: false,
    });
    await expect(tools[2]?.handler({ includeEnvironment: true })).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ checks: [{ name: "access-db-path", ok: true, message: "configured" }], context: { passwordSource: "missing", activeOperations: [] } }) }],
      isError: false,
    });

    expect(vba.requests).toEqual([{ moduleName: "Automation", procedureName: "Refresh", arguments: [2026], accessPath: "C:/data/app.accdb" }]);
    expect(query.requests).toEqual([{ sql: "SELECT id, name FROM People", mode: "read" }]);
    expect(diagnostics.requests).toEqual([{ includeEnvironment: true }]);
  });

  it("translates core failures to safe MCP errors without leaking diagnostics or protocol details", () => {
    const result = failureResult(
      { code: "RUNNER_FAILED", message: "PowerShell runner failed: password=[REDACTED]", retryable: false },
      { diagnostics: [{ level: "error", source: "powershell.stderr", message: "raw internal stack" }], durationMs: 11 },
    );

    expect(translateCoreResultToMcpContent(result)).toEqual({
      content: [{ type: "text", text: "RUNNER_FAILED: PowerShell runner failed: password=[REDACTED]" }],
      isError: true,
    });
  });

  it("routes legacy read-only query and schema tools through the query service", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: null })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    await tools.find((tool) => tool.name === "list_tables")?.handler({});
    await tools.find((tool) => tool.name === "list_linked_tables")?.handler({});
    await tools.find((tool) => tool.name === "get_schema")?.handler({ tableName: "Customers" });
    await tools.find((tool) => tool.name === "count_rows")?.handler({ tableName: "Customers" });
    await tools.find((tool) => tool.name === "distinct_values")?.handler({ table: "Customers", column: "Country" });
    await tools.find((tool) => tool.name === "compare_backends")?.handler({ backendPath: "C:/data/other.accdb" });
    await tools.find((tool) => tool.name === "list_access_files")?.handler({ rootPath: "C:/data" });
    await tools.find((tool) => tool.name === "get_relationships")?.handler({});

    expect(query.requests).toEqual([
      { action: "list_tables", mode: "read", sql: undefined, tableName: undefined, columnName: undefined, backendPath: undefined, rootPath: undefined },
      { action: "list_linked_tables", mode: "read", sql: undefined, tableName: undefined, columnName: undefined, backendPath: undefined, rootPath: undefined },
      { action: "get_schema", mode: "read", sql: undefined, tableName: "Customers", columnName: undefined, backendPath: undefined, rootPath: undefined },
      { action: "count_rows", mode: "read", sql: undefined, tableName: "Customers", columnName: undefined, backendPath: undefined, rootPath: undefined },
      { action: "distinct_values", mode: "read", sql: undefined, tableName: "Customers", columnName: "Country", backendPath: undefined, rootPath: undefined },
      { action: "compare_backends", mode: "read", sql: undefined, tableName: undefined, columnName: undefined, backendPath: "C:/data/other.accdb", rootPath: undefined },
      { action: "list_access_files", mode: "read", sql: undefined, tableName: undefined, columnName: undefined, backendPath: undefined, rootPath: "C:/data" },
      { action: "get_relationships", mode: "read", sql: undefined, tableName: undefined, columnName: undefined, backendPath: undefined, rootPath: undefined },
    ]);
  });

  it("routes legacy guarded write and fixture tools through the query service as dry-run by default", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: null })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    await tools.find((tool) => tool.name === "exec_sql")?.handler({ sql: "UPDATE Customers SET Active=True", apply: true, allowTables: ["Customers"] });
    await tools.find((tool) => tool.name === "run_script")?.handler({ scriptPath: "C:/fixtures/setup.sql", allowTable: "Customers" });
    await tools.find((tool) => tool.name === "create_table")?.handler({ tableName: "Fixture_Customers", definition: "Id INTEGER" });
    await tools.find((tool) => tool.name === "drop_table")?.handler({ tableName: "Fixture_Customers", apply: true, allowTables: ["Fixture_Customers"] });
    await tools.find((tool) => tool.name === "seed_fixture")?.handler({ tableName: "Fixture_Customers", rows: [{ Id: 1, Name: "Ada" }] });
    await tools.find((tool) => tool.name === "teardown_fixture")?.handler({ tableName: "Fixture_Customers", apply: true, allowTables: ["Fixture_Customers"] });

    expect(query.requests).toEqual([
      { action: "exec_sql", mode: "write", sql: "UPDATE Customers SET Active=True", tableName: undefined, columnName: undefined, backendPath: undefined, rootPath: undefined, scriptPath: undefined, definition: undefined, rows: undefined, dryRun: false, allowTables: ["Customers"], denyTables: undefined },
      { action: "run_script", mode: "write", sql: undefined, tableName: undefined, columnName: undefined, backendPath: undefined, rootPath: undefined, scriptPath: "C:/fixtures/setup.sql", definition: undefined, rows: undefined, dryRun: true, allowTables: ["Customers"], denyTables: undefined },
      { action: "create_table", mode: "write", sql: undefined, tableName: "Fixture_Customers", columnName: undefined, backendPath: undefined, rootPath: undefined, scriptPath: undefined, definition: "Id INTEGER", rows: undefined, dryRun: true, allowTables: undefined, denyTables: undefined },
      { action: "drop_table", mode: "write", sql: undefined, tableName: "Fixture_Customers", columnName: undefined, backendPath: undefined, rootPath: undefined, scriptPath: undefined, definition: undefined, rows: undefined, dryRun: false, allowTables: ["Fixture_Customers"], denyTables: undefined },
      { action: "seed_fixture", mode: "write", sql: undefined, tableName: "Fixture_Customers", columnName: undefined, backendPath: undefined, rootPath: undefined, scriptPath: undefined, definition: undefined, rows: [{ Id: 1, Name: "Ada" }], dryRun: true, allowTables: undefined, denyTables: undefined },
      { action: "teardown_fixture", mode: "write", sql: undefined, tableName: "Fixture_Customers", columnName: undefined, backendPath: undefined, rootPath: undefined, scriptPath: undefined, definition: undefined, rows: undefined, dryRun: false, allowTables: ["Fixture_Customers"], denyTables: undefined },
    ]);
  });
});
