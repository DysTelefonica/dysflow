import { describe, expect, it } from "vitest";
import {
  createDysflowMcpTools,
  type DysflowMcpServices,
  MCP_TOOL_SCHEMAS,
  MODERN_TOOL_NAMES,
  registerMcpToolList,
  translateCoreResultToMcpContent,
} from "../../../src/adapters/mcp/tools";
import type { AccessQueryRequest } from "../../../src/core/contracts/index";
import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../../../src/core/contracts/index";
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
  async execute(request: AccessQueryRequest): Promise<OperationResult<AccessQueryResult>> {
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

function collectArraySchemasMissingItems(schema: unknown, path = "schema"): string[] {
  if (typeof schema !== "object" || schema === null) return [];
  const record = schema as Record<string, unknown>;
  const missing = record.type === "array" && record.items === undefined ? [path] : [];
  for (const [key, value] of Object.entries(record)) {
    missing.push(...collectArraySchemasMissingItems(value, `${path}.${key}`));
  }
  return missing;
}

describe("MCP tool registration over core services", () => {
  it("declares items for every array in every MCP input schema", () => {
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: new FakeQueryService(successResult({ rows: [] })),
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    const missingItems = tools.flatMap((tool) =>
      collectArraySchemasMissingItems(tool.inputSchema, tool.name),
    );

    expect(missingItems).toEqual([]);
  });

  it("registers protocol-safe MCP tools that invoke the matching core services", async () => {
    const vba = new FakeVbaService(successResult({ returnValue: "refreshed" }, { durationMs: 7 }));
    const query = new FakeQueryService(
      successResult({ rows: [{ id: 1, name: "Ada" }] }, { durationMs: 5 }),
    );
    const diagnostics = new FakeDiagnosticsService(
      successResult(
        { checks: [{ name: "access-db-path", ok: true, message: "configured" }] },
        { durationMs: 3 },
      ),
    );

    const tools = createDysflowMcpTools({
      vbaService: vba,
      queryService: query,
      diagnosticsService: diagnostics,
    });
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toEqual(
      expect.arrayContaining([
        "dysflow_vba_execute",
        "dysflow_query_execute",
        "dysflow_doctor",
        "dysflow_access_operations_list",
        "dysflow_access_cleanup",
      ]),
    );
    expect(tools.find((tool) => tool.name === "dysflow_vba_execute")?.inputSchema).toMatchObject({
      type: "object",
      required: ["procedureName"],
      additionalProperties: false,
      properties: {
        moduleName: { type: "string" },
        procedureName: { type: "string" },
        arguments: { type: "array" },
        dryRun: { type: "boolean" },
      },
    });
    await expect(
      tools[0]?.handler({
        moduleName: "Automation",
        procedureName: "Refresh",
        arguments: [2026],
        dryRun: true,
      }),
    ).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ returnValue: "refreshed" }) }],
      isError: false,
      ok: true,
    });
    await expect(
      tools[1]?.handler({ sql: "SELECT id, name FROM People", mode: "read" }),
    ).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ rows: [{ id: 1, name: "Ada" }] }) }],
      isError: false,
      ok: true,
    });
    await expect(tools[2]?.handler({ includeEnvironment: true })).resolves.toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            checks: [{ name: "access-db-path", ok: true, message: "configured" }],
          }),
        },
      ],
      isError: false,
      ok: true,
    });

    expect(vba.requests).toEqual([
      { moduleName: "Automation", procedureName: "Refresh", arguments: [2026], dryRun: true },
    ]);
    expect(query.requests).toEqual([{ sql: "SELECT id, name FROM People", mode: "read" }]);
    expect(diagnostics.requests).toEqual([{ includeEnvironment: true }]);
  });

  it("registers modern MCP tool names with underscores instead of dots", () => {
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: new FakeQueryService(successResult({ rows: [] })),
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    const toolNames = tools.map((tool) => tool.name);
    const expectedModernToolNames = [
      "dysflow_vba_execute",
      "dysflow_query_execute",
      "dysflow_doctor",
      "dysflow_access_operations_list",
      "dysflow_access_cleanup",
      "dysflow_access_force_cleanup_orphaned",
    ];

    expect(toolNames).toEqual(expect.arrayContaining(expectedModernToolNames));
    expect(toolNames.filter((name) => name.startsWith("dysflow") && name.includes("."))).toEqual(
      [],
    );
  });

  it("regression: MODERN_TOOL_NAMES are exactly the 13 underscore-only names and none contains a dot", () => {
    // This test is the authoritative contract for modern tool names.
    // It guards against accidental regression to dotted names (e.g. dysflow.vba.execute).
    // PR-1 (#656) added dysflow_get_capabilities (read-only introspection).
    // #701 added read-only VBA procedure introspection tools.
    // #705 added dysflow_detect_dead_code (read-only dead-code analysis).
    // #703 added dysflow_validate_manifest (read-only VBA test manifest validation).
    // #704 added lint_module (read-only VBA module pre-import linting).
    const expectedNames = [
      "dysflow_vba_execute",
      "dysflow_query_execute",
      "dysflow_doctor",
      "dysflow_access_operations_list",
      "dysflow_access_cleanup",
      "dysflow_access_force_cleanup_orphaned",
      "dysflow_get_capabilities",
      "dysflow_list_procedures",
      "dysflow_get_procedure",
      "dysflow_find_references",
      "dysflow_detect_dead_code",
      "dysflow_validate_manifest",
      "lint_module",
      "dysflow_resolve_project",
    ];

    expect(MODERN_TOOL_NAMES).toEqual(expectedNames);

    for (const name of MODERN_TOOL_NAMES) {
      expect(name, `Modern tool name "${name}" must not contain a dot`).not.toContain(".");
    }
  });

  it("describes projectId as canonical trace identity and contextId as optional run context", () => {
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: new FakeQueryService(successResult({ rows: [] })),
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });
    const schema = tools.find((tool) => tool.name === "dysflow_vba_execute")?.inputSchema;

    expect(schema?.properties?.projectId?.description).toContain("canonical project identity");
    expect(schema?.properties?.projectId?.description).toContain("Engram");
    expect(schema?.properties?.contextId?.description).toContain("run/context id");
    expect(schema?.properties?.contextId?.description).toContain("Do not duplicate projectId");
  });

  it("accepts contextId/projectId on short core calls without requiring local path injection", async () => {
    const diagnostics = new FakeDiagnosticsService(successResult({ checks: [] }));
    const vba = new FakeVbaService(successResult({ returnValue: "ok" }));
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: vba,
      queryService: query,
      diagnosticsService: diagnostics,
    });

    await expect(
      tools
        .find((tool) => tool.name === "dysflow_doctor")
        ?.handler({ contextId: "00-no-conformidades-staging-clean" }),
    ).resolves.toMatchObject({ isError: false });
    await expect(
      tools
        .find((tool) => tool.name === "dysflow_vba_execute")
        ?.handler({
          contextId: "00-no-conformidades-staging-clean",
          procedureName: "Smoke",
          dryRun: true,
        }),
    ).resolves.toMatchObject({ isError: false });
    await expect(
      tools
        .find((tool) => tool.name === "dysflow_query_execute")
        ?.handler({
          contextId: "00-no-conformidades-staging-clean",
          sql: "SELECT 1",
          mode: "read",
        }),
    ).resolves.toMatchObject({ isError: false });

    expect(diagnostics.requests).toEqual([{ contextId: "00-no-conformidades-staging-clean" }]);
    expect(vba.requests).toEqual([
      {
        contextId: "00-no-conformidades-staging-clean",
        procedureName: "Smoke",
        dryRun: true,
      },
    ]);
    expect(query.requests).toEqual([
      { contextId: "00-no-conformidades-staging-clean", sql: "SELECT 1", mode: "read" },
    ]);
  });

  it("forwards explicit database targets on modern query execution", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    await expect(
      tools
        .find((tool) => tool.name === "dysflow_query_execute")
        ?.handler({
          sql: "SELECT * FROM BackendOnlyTable",
          mode: "read",
          backendPath: "C:/backend.accdb",
          databasePath: "C:/target.accdb",
          sourcePath: "C:/source.accdb",
        }),
    ).resolves.toMatchObject({ isError: false });

    expect(query.requests).toEqual([
      {
        sql: "SELECT * FROM BackendOnlyTable",
        mode: "read",
        backendPath: "C:/backend.accdb",
        databasePath: "C:/target.accdb",
        sourcePath: "C:/source.accdb",
      },
    ]);
  });

  it("advertises dryRun/apply on modern query execution", () => {
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: new FakeQueryService(successResult({ rows: [] })),
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    const properties = tools.find((tool) => tool.name === "dysflow_query_execute")?.inputSchema
      ?.properties;

    expect(properties).toHaveProperty("dryRun");
    expect(properties).toHaveProperty("apply");
  });

  it("treats modern write query with omitted flags as dry-run plan and bypasses write gate", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    await expect(
      tools
        .find((tool) => tool.name === "dysflow_query_execute")
        ?.handler({ sql: "UPDATE People SET name='Ada'", mode: "write" }),
    ).resolves.toMatchObject({ isError: false });

    expect(query.requests).toEqual([
      { sql: "UPDATE People SET name='Ada'", mode: "write", dryRun: true },
    ]);
  });

  it("treats modern write query with dryRun:true as plan and bypasses write gate", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    await expect(
      tools
        .find((tool) => tool.name === "dysflow_query_execute")
        ?.handler({ sql: "UPDATE People SET name='Ada'", mode: "write", dryRun: true }),
    ).resolves.toMatchObject({ isError: false });

    expect(query.requests).toEqual([
      { sql: "UPDATE People SET name='Ada'", mode: "write", dryRun: true },
    ]);
  });

  it("blocks modern write query with apply:true when writes are disabled", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    const result = await tools
      .find((tool) => tool.name === "dysflow_query_execute")
      ?.handler({ sql: "UPDATE People SET name='Ada'", mode: "write", apply: true });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(query.requests).toEqual([]);
  });

  it("blocks modern write query with dryRun:false when writes are disabled", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    const result = await tools
      .find((tool) => tool.name === "dysflow_query_execute")
      ?.handler({ sql: "UPDATE People SET name='Ada'", mode: "write", dryRun: false });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(query.requests).toEqual([]);
  });

  it("commits modern write query with apply:true when writes are enabled", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools(
      {
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: query,
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      },
      true,
    );

    await expect(
      tools
        .find((tool) => tool.name === "dysflow_query_execute")
        ?.handler({ sql: "UPDATE People SET name='Ada'", mode: "write", apply: true }),
    ).resolves.toMatchObject({ isError: false });

    expect(query.requests).toEqual([
      { sql: "UPDATE People SET name='Ada'", mode: "write", apply: true, dryRun: false },
    ]);
  });

  it("forwards explicit database targets on read-only query_sql", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    await expect(
      tools
        .find((tool) => tool.name === "query_sql")
        ?.handler({
          sql: "SELECT * FROM BackendOnlyTable",
          backendPath: "C:/backend.accdb",
          sourcePath: "C:/source.accdb",
        }),
    ).resolves.toMatchObject({ isError: false });

    expect(query.requests).toEqual([
      {
        sql: "SELECT * FROM BackendOnlyTable",
        mode: "read",
        backendPath: "C:/backend.accdb",
        databasePath: "C:/source.accdb",
      },
    ]);
  });

  it("rejects invalid MCP inputs before calling core services", async () => {
    const vba = new FakeVbaService(successResult({ returnValue: "ok" }));
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools(
      {
        vbaService: vba,
        queryService: query,
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      },
      true,
    );

    await expect(
      tools
        .find((tool) => tool.name === "dysflow_vba_execute")
        ?.handler({ moduleName: "Automation" }),
    ).resolves.toMatchObject({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: procedureName is required." }],
      isError: true,
      ok: false,
      error: { code: "MCP_INPUT_INVALID", message: "procedureName is required." },
    });
    await expect(
      tools.find((tool) => tool.name === "query_sql")?.handler({ sql: 42 }),
    ).resolves.toMatchObject({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: sql must be a string." }],
      isError: true,
      ok: false,
      error: { code: "MCP_INPUT_INVALID", message: "sql must be a string." },
    });
    await expect(
      tools
        .find((tool) => tool.name === "seed_fixture")
        ?.handler({ tableName: "People", allowTable: "People", rows: [{ id: 1 }], dryRun: true }),
    ).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ rows: [] }) }],
      isError: false,
      ok: true,
    });
    expect(
      tools.find((tool) => tool.name === "catalog_add_control")?.inputSchema?.properties,
    ).toHaveProperty("catalogPath");

    expect(vba.requests).toEqual([]);
    expect(query.requests).toEqual([
      expect.objectContaining({
        action: "seed_fixture",
        tableName: "People",
        allowTables: ["People"],
      }),
    ]);
  });

  it("rejects empty-string procedureName before reaching the runner (minLength guard)", async () => {
    const vba = new FakeVbaService(successResult({ returnValue: "ok" }));
    const tools = createDysflowMcpTools({
      vbaService: vba,
      queryService: new FakeQueryService(successResult({ rows: [] })),
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    await expect(
      tools.find((t) => t.name === "dysflow_vba_execute")?.handler({ procedureName: "" }),
    ).resolves.toMatchObject({
      isError: true,
      ok: false,
      content: [{ text: expect.stringContaining("procedureName") }],
    });
    await expect(
      tools.find((t) => t.name === "dysflow_vba_execute")?.handler({ procedureName: "   " }),
    ).resolves.toMatchObject({ isError: true });
    expect(vba.requests).toHaveLength(0);
  });

  it("rejects empty-string sql before reaching the runner (minLength guard)", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    await expect(
      tools.find((t) => t.name === "dysflow_query_execute")?.handler({ sql: "", mode: "read" }),
    ).resolves.toMatchObject({
      isError: true,
      ok: false,
      content: [{ text: expect.stringContaining("sql") }],
    });
    await expect(
      tools.find((t) => t.name === "query_sql")?.handler({ sql: "" }),
    ).resolves.toMatchObject({ isError: true });
    await expect(tools.find((t) => t.name === "query_sql")?.handler({})).resolves.toMatchObject({
      isError: true,
      ok: false,
      content: [{ text: expect.stringContaining("sql is required") }],
    });
    expect(query.requests).toHaveLength(0);
  });

  it("rejects invalid nested MCP inputs before calling core services", async () => {
    const vba = new FakeVbaService(successResult({ returnValue: "ok" }));
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: vba,
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    await expect(
      tools
        .find((tool) => tool.name === "dysflow_query_execute")
        ?.handler({ sql: "SELECT 1", mode: "delete" }),
    ).resolves.toMatchObject({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: mode must be one of: read, write." }],
      isError: true,
      ok: false,
      error: { code: "MCP_INPUT_INVALID", message: "mode must be one of: read, write." },
    });
    await expect(
      tools
        .find((tool) => tool.name === "dysflow_query_execute")
        ?.handler({ sql: "UPDATE People SET name='Ada'", mode: "write", apply: true }),
    ).resolves.toMatchObject({
      content: [
        {
          type: "text",
          text: 'MCP_WRITES_DISABLED: Write tools are disabled for this MCP adapter. Enable writes by setting "allowWrites": true in .dysflow/project.json (per-repo, recommended) or by launching the server with `dysflow mcp --enable-writes` (process-wide).',
        },
      ],
      isError: true,
      ok: false,
      error: {
        code: "MCP_WRITES_DISABLED",
        remediation: expect.stringContaining("dysflow mcp --enable-writes"),
      },
    });
    await expect(
      tools
        .find((tool) => tool.name === "seed_fixture")
        ?.handler({ tableName: "People", allowTables: ["People", 7], rows: [{ id: 1 }] }),
    ).resolves.toMatchObject({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: allowTables[1] must be a string." }],
      isError: true,
      ok: false,
      error: { code: "MCP_INPUT_INVALID", message: "allowTables[1] must be a string." },
    });
    await expect(
      tools
        .find((tool) => tool.name === "import_queries")
        ?.handler({ queryDefinitions: [{ name: "q_people", sql: 42 }] }),
    ).resolves.toMatchObject({
      content: [
        { type: "text", text: "MCP_INPUT_INVALID: queryDefinitions[0].sql must be a string." },
      ],
      isError: true,
      ok: false,
      error: {
        code: "MCP_INPUT_INVALID",
        message: "queryDefinitions[0].sql must be a string.",
      },
    });

    expect(vba.requests).toEqual([]);
    expect(query.requests).toEqual([]);
  });

  it("allows MCP write queries only when writes are explicitly enabled", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools(
      {
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: query,
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      },
      true,
    );

    await expect(
      tools
        .find((tool) => tool.name === "dysflow_query_execute")
        ?.handler({ sql: "UPDATE People SET name='Ada'", mode: "write", apply: true }),
    ).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ rows: [] }) }],
      isError: false,
      ok: true,
    });

    expect(query.requests).toEqual([
      { sql: "UPDATE People SET name='Ada'", mode: "write", apply: true, dryRun: false },
    ]);
  });

  it("allows write tool when project-scoped allowWrites resolver grants access", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools(
      {
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: query,
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      },
      false,
      async (input) => (input as { projectId?: string }).projectId === "lanzadera",
    );

    await expect(
      tools
        .find((tool) => tool.name === "seed_fixture")
        ?.handler({
          projectId: "lanzadera",
          tableName: "People",
          rows: [{ id: 1 }],
          apply: true,
        }),
    ).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ rows: [] }) }],
      isError: false,
      ok: true,
    });

    expect(query.requests).toEqual([
      expect.objectContaining({ action: "seed_fixture", mode: "write", dryRun: false }),
    ]);
  });

  it("keeps blocking write tool when allowWrites resolver denies the project", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools(
      {
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: query,
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      },
      false,
      async () => false,
    );

    const result = await tools
      .find((tool) => tool.name === "seed_fixture")
      ?.handler({
        projectId: "readonly-project",
        tableName: "People",
        rows: [{ id: 1 }],
        apply: true,
      });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(query.requests).toEqual([]);
  });

  it("handles run_vba argsJson as MCP input instead of raw JSON-RPC failures", async () => {
    const vba = new FakeVbaService(successResult({ returnValue: "ok" }));
    const tools = createDysflowMcpTools({
      vbaService: vba,
      queryService: new FakeQueryService(successResult({ rows: [] })),
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });
    const runVba = tools.find((tool) => tool.name === "run_vba");

    await expect(
      runVba?.handler({ procedureName: "Broken", argsJson: "[1," }),
    ).resolves.toMatchObject({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: argsJson must be valid JSON." }],
      isError: true,
      ok: false,
      error: { code: "MCP_INPUT_INVALID", message: "argsJson must be valid JSON." },
    });
    await expect(
      runVba?.handler({ procedureName: "Blank", argsJson: "   ", dryRun: true }),
    ).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ returnValue: "ok" }) }],
      isError: false,
      ok: true,
    });
    await expect(
      runVba?.handler({ procedureName: "Array", argsJson: '[1,"two"]', dryRun: true }),
    ).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ returnValue: "ok" }) }],
      isError: false,
      ok: true,
    });
    await expect(
      runVba?.handler({ procedureName: "Single", argsJson: "42", dryRun: true }),
    ).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ returnValue: "ok" }) }],
      isError: false,
      ok: true,
    });

    expect(vba.requests).toEqual([
      { moduleName: "", procedureName: "Blank", arguments: [], dryRun: true },
      { moduleName: "", procedureName: "Array", arguments: [1, "two"], dryRun: true },
      { moduleName: "", procedureName: "Single", arguments: [42], dryRun: true },
    ]);
  });

  it("declares explicit JSON schemas for every MCP tool", () => {
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: new FakeQueryService(successResult({ rows: [] })),
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    for (const tool of tools) {
      expect(tool.inputSchema, `${tool.name} should declare inputSchema`).toMatchObject({
        type: "object",
        properties: expect.any(Object),
      });
      expect(tool.inputSchema).not.toEqual({ type: "object", additionalProperties: true });
    }
  });

  describe("verify/reconcile tool visibility (#175, #510)", () => {
    const IMPLEMENTED_VERIFY_TOOL_NAMES = ["verify_code"] as const;

    function makeServices() {
      return {
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: new FakeQueryService(successResult({ rows: [] })),
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      };
    }

    it("keeps verify/reconcile tools visible in the tools/list projection now that they are implemented", () => {
      const tools = createDysflowMcpTools(makeServices());
      for (const implemented of IMPLEMENTED_VERIFY_TOOL_NAMES) {
        const tool = tools.find((t) => t.name === implemented);
        expect(tool, `${implemented} must be present in tool registry`).toBeDefined();
        expect(
          tool?.hidden,
          `${implemented} must be visible now that it is implemented`,
        ).toBeUndefined();
      }
    });

    it("visible VBA sync tools report service unavailability instead of not-implemented when no service is configured", async () => {
      const tools = createDysflowMcpTools(makeServices());
      for (const toolName of IMPLEMENTED_VERIFY_TOOL_NAMES) {
        const result = await tools.find((t) => t.name === toolName)?.handler({ diff: true });
        expect(result?.isError, `${toolName} should fail safely without the VBA sync service`).toBe(
          true,
        );
        expect(result?.content[0]?.text).toContain("MCP_SERVICE_UNAVAILABLE");
        expect(result?.content[0]?.text).not.toContain("TOOL_NOT_IMPLEMENTED");
      }
    });

    it("verify/reconcile tools dispatch to the VBA sync service instead of the not-implemented fallback", async () => {
      const tools = createDysflowMcpTools({
        ...makeServices(),
        vbaSyncToolService: {
          execute: async (toolName, input) => successResult({ toolName, input, ok: true }),
        },
      });

      for (const toolName of IMPLEMENTED_VERIFY_TOOL_NAMES) {
        const result = await tools.find((t) => t.name === toolName)?.handler({ diff: true });
        expect(result).toEqual({
          content: [
            { type: "text", text: JSON.stringify({ toolName, input: { diff: true }, ok: true }) },
          ],
          isError: false,
          ok: true,
        });
      }
    });
  });

  describe("per-tool input schemas (#177)", () => {
    function makeServices() {
      return {
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: new FakeQueryService(successResult({ rows: [] })),
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      };
    }

    it("every registered MCP tool has an entry in MCP_TOOL_SCHEMAS", () => {
      const tools = createDysflowMcpTools(makeServices());
      // Non-modern tools are those outside the MODERN_TOOL_NAMES namespace.
      // After Opción A (2026-07-07) the modern tools have canonical names
      // without the `dysflow_` prefix (e.g. `lint_module` instead of
      // `dysflow_lint_module`), so we filter against MODERN_TOOL_NAMES
      // directly instead of the old prefix heuristic.
      const modernSet = new Set<string>(MODERN_TOOL_NAMES);
      const nonModernTools = tools.filter((t) => !modernSet.has(t.name));
      for (const tool of nonModernTools) {
        expect(
          MCP_TOOL_SCHEMAS,
          `${tool.name} must have an entry in MCP_TOOL_SCHEMAS`,
        ).toHaveProperty(tool.name);
      }
    });

    it("list_tables schema does not include rows property", () => {
      const schema = MCP_TOOL_SCHEMAS.list_tables;
      expect(schema).toBeDefined();
      expect(schema?.properties).not.toHaveProperty("rows");
    });

    it("read/schema tools accept explicit backend and database target aliases", async () => {
      for (const toolName of ["get_schema", "get_relationships"] as const) {
        const schema = MCP_TOOL_SCHEMAS[toolName];
        expect(schema?.properties, `${toolName} should accept backendPath`).toHaveProperty(
          "backendPath",
        );
        expect(schema?.properties, `${toolName} should accept databasePath`).toHaveProperty(
          "databasePath",
        );
        expect(schema?.properties, `${toolName} should accept sourcePath`).toHaveProperty(
          "sourcePath",
        );
      }

      const query = new FakeQueryService(successResult({ rows: [] }));
      const tools = createDysflowMcpTools({
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: query,
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      });

      await expect(
        tools
          .find((tool) => tool.name === "get_schema")
          ?.handler({
            tableName: "People",
            backendPath: "C:/backend.accdb",
            databasePath: "C:/schema-target.accdb",
          }),
      ).resolves.toMatchObject({ isError: false });
      await expect(
        tools
          .find((tool) => tool.name === "get_relationships")
          ?.handler({
            backendPath: "C:/backend.accdb",
            sourcePath: "C:/relationships-source.accdb",
          }),
      ).resolves.toMatchObject({ isError: false });

      expect(query.requests).toEqual([
        expect.objectContaining({
          action: "get_schema",
          mode: "read",
          tableName: "People",
          backendPath: "C:/backend.accdb",
          databasePath: "C:/schema-target.accdb",
        }),
        expect.objectContaining({
          action: "get_relationships",
          mode: "read",
          backendPath: "C:/backend.accdb",
          databasePath: "C:/relationships-source.accdb",
        }),
      ]);
    });

    it("seed_fixture schema does not include query property", () => {
      const schema = MCP_TOOL_SCHEMAS.seed_fixture;
      expect(schema).toBeDefined();
      expect(schema?.properties).not.toHaveProperty("query");
    });

    it("exists schema accepts both public name and moduleName aliases", () => {
      const schema = MCP_TOOL_SCHEMAS.exists;
      expect(schema).toBeDefined();
      expect(schema?.properties).toHaveProperty("name");
      expect(schema?.properties).toHaveProperty("moduleName");
    });

    it("VBA runner schemas expose per-call timeoutMs overrides", async () => {
      const timeoutTools = [
        "export_modules",
        "export_all",
        "import_modules",
        "import_all",
        "list_objects",
        "exists",
        "test_vba",
        // feat-759-no-compile (v1.19.0) — compile_vba was removed.
        "verify_code",
        "delete_module",
        "generate_erd",
        "fix_encoding",
      ];
      for (const toolName of timeoutTools) {
        expect(
          MCP_TOOL_SCHEMAS[toolName]?.properties,
          `${toolName} should accept timeoutMs`,
        ).toHaveProperty("timeoutMs");
      }

      const tools = createDysflowMcpTools(
        {
          ...makeServices(),
          vbaSyncToolService: {
            execute: async (toolName, input) => successResult({ toolName, input, ok: true }),
          },
        },
        true,
      );
      // feat-759-no-compile (v1.19.0) — compile_vba was removed; use
      // verify_code (handled, also has a vbaSyncToolService route) as
      // the smoke-test fixture.
      const target = tools.find((t) => t.name === "verify_code");
      const result = await target?.handler({ timeoutMs: 120_000 });
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              toolName: "verify_code",
              input: { timeoutMs: 120_000 },
              ok: true,
            }),
          },
        ],
        isError: false,
        ok: true,
      });
    });

    it("passing a property not in a tool-specific schema returns MCP_INPUT_INVALID", async () => {
      const tools = createDysflowMcpTools(makeServices());
      // list_tables should not accept rows — passing rows should produce a validation error
      const listTables = tools.find((t) => t.name === "list_tables");
      expect(listTables).toBeDefined();
      // biome-ignore lint/style/noNonNullAssertion: listTables is asserted defined above
      const result = await listTables!.handler({ rows: [{ id: 1 }] });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("MCP_INPUT_INVALID");
    });

    it("accepts lowercase importMode aliases before dispatching import tools", async () => {
      const tools = createDysflowMcpTools(
        {
          ...makeServices(),
          vbaSyncToolService: {
            execute: async (toolName, input) => successResult({ toolName, input, ok: true }),
          },
        },
        // writesEnabled: import always writes (no real dry-run), so it is
        // write-gated regardless of the dryRun flag; this test exercises
        // importMode aliasing, not the gate.
        true,
      );
      const importModules = tools.find((tool) => tool.name === "import_modules");
      expect(importModules).toBeDefined();
      if (importModules === undefined) throw new Error("import_modules should be registered");

      // feat-759-no-compile (v1.19.0) — the `compile` parameter is gone
      // from import_tools. Use only the still-valid input.
      const result = await importModules.handler({
        moduleNames: ["DysflowMcpE2EMissing"],
        importMode: "code",
        dryRun: true,
      });

      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              toolName: "import_modules",
              input: {
                moduleNames: ["DysflowMcpE2EMissing"],
                importMode: "code",
                dryRun: true,
              },
              ok: true,
            }),
          },
        ],
        isError: false,
        ok: true,
      });
    });
  });

  it("translates core failures to safe MCP errors without leaking diagnostics, protocol details, or local paths", () => {
    const result = failureResult(
      {
        code: "RUNNER_FAILED",
        message:
          "PowerShell runner failed for C:\\Users\\Jane Doe\\NoConformidades.accdb and /Users/Jane Doe/db.accdb: password=[REDACTED]",
        retryable: false,
      },
      {
        diagnostics: [
          { level: "error", source: "powershell.stderr", message: "raw internal stack" },
        ],
        durationMs: 11,
      },
    );

    expect(translateCoreResultToMcpContent(result)).toEqual({
      content: [
        {
          type: "text",
          text: "RUNNER_FAILED: PowerShell runner failed for [PATH] and [PATH]: password=[REDACTED]",
        },
      ],
      isError: true,
      ok: false,
    });
  });

  it("routes dysflow_doctor runner timeouts to safe MCP tool error content", async () => {
    const diagnostics = new FakeDiagnosticsService(
      failureResult({
        code: "RUNNER_TIMEOUT",
        message: "Timed out opening C:\\Users\\Jane\\E2E_testing\\front.accdb",
        retryable: true,
      }),
    );
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: new FakeQueryService(successResult({ rows: [] })),
      diagnosticsService: diagnostics,
    });

    await expect(
      tools.find((tool) => tool.name === "dysflow_doctor")?.handler({ projectId: "dysflow" }),
    ).resolves.toEqual({
      content: [{ type: "text", text: "RUNNER_TIMEOUT: Timed out opening [PATH]" }],
      isError: true,
      ok: false,
    });
    expect(diagnostics.requests).toEqual([{ projectId: "dysflow" }]);
  });

  it("routes list_tables runner failures to safe MCP tool error content", async () => {
    const query = new FakeQueryService(
      failureResult({
        code: "RUNNER_FAILED",
        message: "PowerShell failed for C:\\Users\\Jane\\E2E_testing\\front.accdb",
        retryable: false,
      }),
    );
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    await expect(
      tools.find((tool) => tool.name === "list_tables")?.handler({ projectId: "dysflow" }),
    ).resolves.toEqual({
      content: [{ type: "text", text: "RUNNER_FAILED: PowerShell failed for [PATH]" }],
      isError: true,
      ok: false,
    });
    expect(query.requests).toEqual([
      expect.objectContaining({ action: "list_tables", mode: "read" }),
    ]);
  });

  // Issue #184: dryRun:true must bypass the write guard for relink_tables
  it("allows relink_tables with dryRun:true even when writes are disabled (issue #184)", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools(
      {
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: query,
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      },
      false,
    );
    const relinkTool = tools.find((tool) => tool.name === "relink_tables");

    // dryRun:true — must NOT be blocked by write guard
    const dryRunResult = await relinkTool?.handler({ dryRun: true });
    expect(dryRunResult?.isError).toBe(false);
    expect(dryRunResult?.content[0]?.text).not.toContain("MCP_WRITES_DISABLED");
    // Query service must have been called (the dry-run plan passes through)
    expect(query.requests.length).toBeGreaterThan(0);
    const dryRunRequest = query.requests[0] as Record<string, unknown>;
    expect(dryRunRequest.dryRun).toBe(true);
  });

  it("blocks relink_tables with dryRun:false when writes are disabled (issue #184)", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools(
      {
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: query,
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      },
      false,
    );
    const relinkTool = tools.find((tool) => tool.name === "relink_tables");

    // dryRun:false — must be blocked by write guard when writes are disabled
    const writeResult = await relinkTool?.handler({ dryRun: false });
    expect(writeResult?.isError).toBe(true);
    expect(writeResult?.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(query.requests).toEqual([]);
  });

  it("allows relink_tables with dryRun:false when writes are enabled (issue #184)", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools(
      {
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: query,
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      },
      true,
    );
    const relinkTool = tools.find((tool) => tool.name === "relink_tables");

    const writeResult = await relinkTool?.handler({ dryRun: false });
    expect(writeResult?.isError).toBe(false);
    expect(writeResult?.content[0]?.text).not.toContain("MCP_WRITES_DISABLED");
    expect(query.requests.length).toBeGreaterThan(0);
  });

  it("allows localize_backend_links with optional backendPath and dryRun", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools(
      {
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: query,
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      },
      true,
    );

    const localizeTool = tools.find((t) => t.name === "localize_backend_links");
    expect(localizeTool?.inputSchema?.properties).toHaveProperty("backendPath");

    const result = await localizeTool?.handler({
      backendPath: "C:/custom/backend.accdb",
      dryRun: false,
    });

    expect(result?.isError).toBe(false);
    expect(query.requests).toEqual([
      expect.objectContaining({
        action: "localize_backend_links",
        backendPath: "C:/custom/backend.accdb",
        dryRun: false,
      }),
    ]);
  });

  describe("writesEnabled explicit parameter (#197)", () => {
    function makeServices() {
      return {
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: new FakeQueryService(successResult({ rows: [] })),
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      };
    }

    it("write tool is gated when writesEnabled=false is passed as explicit second parameter", async () => {
      const query = new FakeQueryService(successResult({ rows: [] }));
      const services = { ...makeServices(), queryService: query };
      // New signature: createDysflowMcpTools(services, writesEnabled)
      // writesEnabled=false must block seed_fixture (a write tool)
      const tools = createDysflowMcpTools(services, false);
      const seedFixture = tools.find((tool) => tool.name === "seed_fixture");
      const result = await seedFixture?.handler({
        tableName: "People",
        rows: [{ id: 1 }],
        apply: true,
      });
      expect(result?.isError).toBe(true);
      expect(result?.content[0]?.text).toContain("MCP_WRITES_DISABLED");
      expect(query.requests).toEqual([]);
    });

    it("write tool succeeds when writesEnabled=true is passed as explicit second parameter", async () => {
      const query = new FakeQueryService(successResult({ rows: [] }));
      const services = { ...makeServices(), queryService: query };
      const tools = createDysflowMcpTools(services, true);
      const seedFixture = tools.find((tool) => tool.name === "seed_fixture");
      const result = await seedFixture?.handler({
        tableName: "People",
        rows: [{ id: 1 }],
        apply: true,
      });
      expect(result?.isError).toBe(false);
    });
  });

  describe("McpToolContext wiring — modern tools forward sendProgress to services", () => {
    class ProgressCapturingVbaService {
      public capturedOnProgress: unknown[] = [];
      async execute(
        _request: unknown,
        onProgress?: unknown,
      ): Promise<OperationResult<AccessVbaResult>> {
        this.capturedOnProgress.push(onProgress);
        return successResult({ returnValue: "ok" });
      }
    }

    class ProgressCapturingQueryService {
      public capturedOnProgress: unknown[] = [];
      async execute(
        _request: unknown,
        onProgress?: unknown,
      ): Promise<OperationResult<AccessQueryResult>> {
        this.capturedOnProgress.push(onProgress);
        return successResult({ rows: [] });
      }
    }

    it("dysflow_vba_execute forwards context.sendProgress to vbaService.execute as onProgress", async () => {
      const vba = new ProgressCapturingVbaService();
      const tools = createDysflowMcpTools({
        vbaService: vba as unknown as DysflowMcpServices["vbaService"],
        queryService: new FakeQueryService(successResult({ rows: [] })),
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      });

      const sendProgress = () => {};
      const context = { progressToken: "tok-1", sendProgress };

      const tool = tools.find((t) => t.name === "dysflow_vba_execute");
      await tool?.handler({ procedureName: "DoWork", dryRun: true }, context);

      expect(vba.capturedOnProgress).toHaveLength(1);
      expect(vba.capturedOnProgress[0]).toBe(sendProgress);
    });

    it("dysflow_query_execute forwards context.sendProgress to queryService.execute as onProgress", async () => {
      const query = new ProgressCapturingQueryService();
      const tools = createDysflowMcpTools(
        {
          vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
          queryService: query as unknown as DysflowMcpServices["queryService"],
          diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
        },
        true,
      );

      const sendProgress = () => {};
      const context = { progressToken: "tok-2", sendProgress };

      const tool = tools.find((t) => t.name === "dysflow_query_execute");
      await tool?.handler({ sql: "SELECT 1", mode: "read" }, context);

      expect(query.capturedOnProgress).toHaveLength(1);
      expect(query.capturedOnProgress[0]).toBe(sendProgress);
    });

    it("MCP tool handler called with a context does not throw", async () => {
      const vba = new FakeVbaService(successResult({ returnValue: "ok" }));
      const tools = createDysflowMcpTools({
        vbaService: vba,
        queryService: new FakeQueryService(successResult({ rows: [] })),
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      });

      const context = { progressToken: "tok-mcp", sendProgress: () => {} };
      const mcpTool = tools.find((t) => t.name === "run_vba");

      // MCP tool handlers don't use context — calling with it must not throw.
      // Pass dryRun:true so the default-deny gate passes; this test is about
      // context-passing, not gate behavior (see canonical-handlers.test.ts).
      await expect(
        mcpTool?.handler({ procedureName: "TestProc", dryRun: true }, context),
      ).resolves.toMatchObject({ isError: false });
    });
  });

  describe("allowedProcedures — procedureName allowlist for dysflow_vba_execute", () => {
    function makeTools(
      allowedProcedures: readonly string[],
      vba: FakeVbaService = new FakeVbaService(successResult({ returnValue: "ok" })),
    ) {
      return createDysflowMcpTools(
        {
          vbaService: vba,
          queryService: new FakeQueryService(successResult({ rows: [] })),
          diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
        },
        false,
        undefined,
        {},
        allowedProcedures,
      );
    }

    it("blocks a procedure not in the allowlist", async () => {
      const tools = makeTools(["Refresh", "Sync"]);
      const result = await tools
        .find((t) => t.name === "dysflow_vba_execute")
        ?.handler({ procedureName: "DeleteAll" });
      expect(result?.isError).toBe(true);
      expect(result?.content[0]).toMatchObject({
        text: expect.stringContaining("DeleteAll"),
      });
      expect(result?.content[0]).toMatchObject({
        text: expect.stringContaining("allowedProcedures"),
      });
    });

    it("allows a procedure that is in the allowlist", async () => {
      const tools = makeTools(["Refresh", "Sync"]);
      const result = await tools
        .find((t) => t.name === "dysflow_vba_execute")
        ?.handler({ procedureName: "Refresh" });
      expect(result?.isError).toBe(false);
    });

    it("refuses by default when allowlist is empty and no dryRun (default-deny, PR1a #621)", async () => {
      const tools = makeTools([]);
      const result = await tools
        .find((t) => t.name === "dysflow_vba_execute")
        ?.handler({ procedureName: "DeleteAll" });
      expect(result?.isError).toBe(true);
      // #757 (F6) — the no-allowlist branch now has its own distinct code.
      expect(result?.content[0]?.text).toContain("MCP_ALLOWLIST_NOT_CONFIGURED");
      expect(result?.content[0]?.text).toContain("DeleteAll");
      expect(result?.content[0]?.text).toMatch(/allowedProcedures|dryRun/);
    });

    it("refuses by default when allowedProcedures is not passed (default-deny, PR1a #621)", async () => {
      const tools = createDysflowMcpTools({
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: new FakeQueryService(successResult({ rows: [] })),
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      });
      const result = await tools
        .find((t) => t.name === "dysflow_vba_execute")
        ?.handler({ procedureName: "AnyProcedure" });
      expect(result?.isError).toBe(true);
      expect(result?.content[0]?.text).toMatch(/allowedProcedures|dryRun/);
    });

    it("accepts dryRun:true as escape hatch when allowlist is empty (PR1a #621)", async () => {
      const vba = new FakeVbaService(successResult({ returnValue: "ok" }));
      const tools = makeTools([], vba);
      const result = await tools
        .find((t) => t.name === "dysflow_vba_execute")
        ?.handler({ procedureName: "DeleteAll", dryRun: true });
      expect(result?.isError).toBe(false);
      expect(vba.requests).toEqual([
        expect.objectContaining({ procedureName: "DeleteAll", dryRun: true }),
      ]);
    });

    it("accepts dryRun:true as escape hatch when allowedProcedures is not passed (PR1a #621)", async () => {
      const vba = new FakeVbaService(successResult({ returnValue: "ok" }));
      const tools = createDysflowMcpTools({
        vbaService: vba,
        queryService: new FakeQueryService(successResult({ rows: [] })),
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      });
      const result = await tools
        .find((t) => t.name === "dysflow_vba_execute")
        ?.handler({ procedureName: "AnyProcedure", dryRun: true });
      expect(result?.isError).toBe(false);
      expect(vba.requests).toEqual([
        expect.objectContaining({ procedureName: "AnyProcedure", dryRun: true }),
      ]);
    });

    it("still refuses a procedure not in the configured allowlist even when dryRun is true", async () => {
      const tools = makeTools(["Refresh", "Sync"]);
      const result = await tools
        .find((t) => t.name === "dysflow_vba_execute")
        ?.handler({ procedureName: "DeleteAll", dryRun: true });
      expect(result?.isError).toBe(true);
      expect(result?.content[0]?.text).toContain("DeleteAll");
      expect(result?.content[0]?.text).toContain("allowedProcedures");
    });
  });

  describe("allowedProcedures — procedureName allowlist for run_vba alias", () => {
    function makeTools(
      allowedProcedures: readonly string[],
      vba: FakeVbaService = new FakeVbaService(successResult({ returnValue: "ok" })),
    ) {
      return createDysflowMcpTools(
        {
          vbaService: vba,
          queryService: new FakeQueryService(successResult({ rows: [] })),
          diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
        },
        false,
        undefined,
        {},
        allowedProcedures,
      );
    }

    it("blocks a procedure not in the allowlist", async () => {
      const tools = makeTools(["Refresh", "Sync"]);
      const result = await tools
        .find((t) => t.name === "run_vba")
        ?.handler({ procedureName: "DeleteAll" });
      expect(result?.isError).toBe(true);
      expect(result?.content[0]).toMatchObject({
        text: expect.stringContaining("DeleteAll"),
      });
      expect(result?.content[0]).toMatchObject({
        text: expect.stringContaining("allowedProcedures"),
      });
    });

    it("allows a procedure that is in the allowlist", async () => {
      const tools = makeTools(["Refresh", "Sync"]);
      const result = await tools
        .find((t) => t.name === "run_vba")
        ?.handler({ procedureName: "Refresh" });
      expect(result?.isError).toBe(false);
    });

    it("refuses by default when allowlist is empty and no dryRun (default-deny, PR1a #621)", async () => {
      const tools = makeTools([]);
      const result = await tools
        .find((t) => t.name === "run_vba")
        ?.handler({ procedureName: "DeleteAll" });
      expect(result?.isError).toBe(true);
      // #757 (F6) — the no-allowlist branch now has its own distinct code.
      expect(result?.content[0]?.text).toContain("MCP_ALLOWLIST_NOT_CONFIGURED");
      expect(result?.content[0]?.text).toContain("DeleteAll");
      expect(result?.content[0]?.text).toMatch(/allowedProcedures|dryRun/);
    });

    it("refuses by default when allowedProcedures is not passed (default-deny, PR1a #621)", async () => {
      const tools = createDysflowMcpTools({
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: new FakeQueryService(successResult({ rows: [] })),
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      });
      const result = await tools
        .find((t) => t.name === "run_vba")
        ?.handler({ procedureName: "AnyProcedure" });
      expect(result?.isError).toBe(true);
      expect(result?.content[0]?.text).toMatch(/allowedProcedures|dryRun/);
    });

    it("accepts dryRun:true as escape hatch when allowlist is empty (PR1a #621)", async () => {
      const vba = new FakeVbaService(successResult({ returnValue: "ok" }));
      const tools = makeTools([], vba);
      const result = await tools
        .find((t) => t.name === "run_vba")
        ?.handler({ procedureName: "DeleteAll", dryRun: true });
      expect(result?.isError).toBe(false);
      expect(vba.requests).toEqual([
        expect.objectContaining({ procedureName: "DeleteAll", dryRun: true }),
      ]);
    });

    it("accepts dryRun:true as escape hatch when allowedProcedures is not passed (PR1a #621)", async () => {
      const vba = new FakeVbaService(successResult({ returnValue: "ok" }));
      const tools = createDysflowMcpTools({
        vbaService: vba,
        queryService: new FakeQueryService(successResult({ rows: [] })),
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      });
      const result = await tools
        .find((t) => t.name === "run_vba")
        ?.handler({ procedureName: "AnyProcedure", dryRun: true });
      expect(result?.isError).toBe(false);
      expect(vba.requests).toEqual([
        expect.objectContaining({ procedureName: "AnyProcedure", dryRun: true }),
      ]);
    });

    it("still refuses a procedure not in the configured allowlist even when dryRun is true", async () => {
      const tools = makeTools(["Refresh", "Sync"]);
      const result = await tools
        .find((t) => t.name === "run_vba")
        ?.handler({ procedureName: "DeleteAll", dryRun: true });
      expect(result?.isError).toBe(true);
      expect(result?.content[0]?.text).toContain("DeleteAll");
      expect(result?.content[0]?.text).toContain("allowedProcedures");
    });
  });

  describe("modern and alias handler compatibility", () => {
    it("returns the same allowlist error for dysflow_vba_execute and run_vba", async () => {
      const tools = createDysflowMcpTools(
        {
          vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
          queryService: new FakeQueryService(successResult({ rows: [] })),
          diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
        },
        false,
        undefined,
        {},
        ["AllowedProcedure"],
      );

      const modernResult = await tools
        .find((t) => t.name === "dysflow_vba_execute")
        ?.handler({ procedureName: "BlockedProcedure" });
      const aliasResult = await tools
        .find((t) => t.name === "run_vba")
        ?.handler({ procedureName: "BlockedProcedure" });

      expect(aliasResult).toEqual(modernResult);
    });

    it("delegates read-only query_sql through the same query execution path as dysflow_query_execute", async () => {
      const query = new FakeQueryService(successResult({ rows: [{ ok: true }] }));
      const tools = createDysflowMcpTools({
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: query,
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      });

      await expect(
        tools
          .find((t) => t.name === "dysflow_query_execute")
          ?.handler({ sql: "SELECT 1", mode: "read" }),
      ).resolves.toMatchObject({ isError: false });
      await expect(
        tools.find((t) => t.name === "query_sql")?.handler({ sql: "SELECT 1" }),
      ).resolves.toMatchObject({ isError: false });

      expect(query.requests).toEqual([
        { sql: "SELECT 1", mode: "read" },
        { sql: "SELECT 1", mode: "read", backendPath: undefined, databasePath: undefined },
      ]);
    });
  });

  describe("read-only SQL delegation to queryService", () => {
    it("blocks DDL via query_sql tool by delegating to queryService", async () => {
      const query = new FakeQueryService(
        failureResult(
          createDysflowError(
            "INVALID_READ_ONLY_QUERY",
            'DROP statements are not allowed in read-only queries. Use exec_sql or dysflow_query_execute with mode "write" for write operations.',
          ),
        ),
      );
      const tools = createDysflowMcpTools({
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: query,
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      });

      const result = await tools
        .find((t) => t.name === "query_sql")
        ?.handler({ sql: "DROP TABLE TbConfiguracion" });
      expect(result).toMatchObject({
        isError: true,
        ok: false,
        content: [{ type: "text", text: expect.stringContaining("INVALID_READ_ONLY_QUERY") }],
      });

      expect(query.requests).toHaveLength(1);
    });

    it("blocks DDL via dysflow_query_execute with mode read by delegating to queryService", async () => {
      const query = new FakeQueryService(
        failureResult(
          createDysflowError(
            "INVALID_READ_ONLY_QUERY",
            'DELETE statements are not allowed in read-only queries. Use exec_sql or dysflow_query_execute with mode "write" for write operations.',
          ),
        ),
      );
      const tools = createDysflowMcpTools({
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: query,
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      });

      const result = await tools
        .find((t) => t.name === "dysflow_query_execute")
        ?.handler({ sql: "DELETE FROM TbConfiguracion", mode: "read" });
      expect(result).toMatchObject({
        isError: true,
        ok: false,
        content: [{ type: "text", text: expect.stringContaining("INVALID_READ_ONLY_QUERY") }],
      });

      expect(query.requests).toHaveLength(1);
    });

    it("allows write SQL via dysflow_query_execute with mode write when writes enabled", async () => {
      const query = new FakeQueryService(successResult({ rows: [] }));
      const tools = createDysflowMcpTools(
        {
          vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
          queryService: query,
          diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
        },
        true,
      );

      await expect(
        tools
          .find((t) => t.name === "dysflow_query_execute")
          ?.handler({ sql: "DELETE FROM TbConfiguracion", mode: "write" }),
      ).resolves.toMatchObject({ isError: false });

      expect(query.requests).toHaveLength(1);
    });
  });

  describe("context props unification — single source of truth (#200)", () => {
    it("schemas that previously used CONTEXT_PROPERTIES still include projectId and contextId", () => {
      const tools = createDysflowMcpTools({
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: new FakeQueryService(successResult({ rows: [] })),
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      });
      const toolsWithCtx = [
        "query_sql",
        "exec_sql",
        "export_modules",
        "link_tables",
        "list_tables",
      ];
      for (const name of toolsWithCtx) {
        const tool = tools.find((t) => t.name === name);
        expect(tool?.inputSchema?.properties, `${name} must have projectId`).toHaveProperty(
          "projectId",
        );
        expect(tool?.inputSchema?.properties, `${name} must have contextId`).toHaveProperty(
          "contextId",
        );
      }
    });
  });
});

// PR2 (#621 F1 / #6a) — dysflow_query_execute write mode must pass allowTables/
// denyTables through to queryService. The modern handler spreads the validated
// input into AccessQueryRequest; the schema change in dysflow-schemas.ts is
// what makes the fields surface here.
describe("dysflow_query_execute — allowTables/denyTables pass-through (PR2 #621 F1 / #6a)", () => {
  it("write mode projects allowTables and denyTables from input into the core query request", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools(
      {
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: query,
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      },
      true,
    );

    const result = await tools
      .find((tool) => tool.name === "dysflow_query_execute")
      ?.handler({
        sql: "UPDATE People SET name='Ada'",
        mode: "write",
        apply: true,
        allowTables: ["People"],
        denyTables: ["Secrets"],
      });

    expect(result?.isError).toBe(false);
    expect(query.requests).toHaveLength(1);
    expect(query.requests[0]).toMatchObject({
      sql: "UPDATE People SET name='Ada'",
      mode: "write",
      dryRun: false,
      allowTables: ["People"],
      denyTables: ["Secrets"],
    });
  });

  it("write mode surfaces TABLE_DENIED from the core service as an MCP error", async () => {
    const query = new FakeQueryService(
      failureResult(
        createDysflowError("TABLE_DENIED", "Operation denied on table 'Secrets' by denyTables."),
      ),
    );
    const tools = createDysflowMcpTools(
      {
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: query,
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      },
      true,
    );

    const result = await tools
      .find((tool) => tool.name === "dysflow_query_execute")
      ?.handler({
        sql: "UPDATE Secrets SET x=1",
        mode: "write",
        apply: true,
        denyTables: ["Secrets"],
      });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toMatch(/TABLE_DENIED/);
  });

  it("read mode accepts allowTables/denyTables without failing (they are inert in read mode)", async () => {
    const query = new FakeQueryService(successResult({ rows: [{ id: 1, name: "Ada" }] }));
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    const result = await tools
      .find((tool) => tool.name === "dysflow_query_execute")
      ?.handler({
        sql: "SELECT * FROM People",
        mode: "read",
        allowTables: ["People"],
        denyTables: ["Secrets"],
      });

    // Behavioral contract: read mode must not trip the write gate and must
    // reach the query service. The legacy `query_sql` accepts these fields
    // harmlessly too — read mode ignores them at the PowerShell layer. The
    // exact shape of the request (whether allowTables is present) is an
    // implementation detail; what matters is that the call succeeds.
    expect(result?.isError).toBe(false);
    expect(query.requests).toHaveLength(1);
    expect(query.requests[0]).toMatchObject({
      sql: "SELECT * FROM People",
      mode: "read",
    });
  });

  it("rejects a non-string element in allowTables before reaching the runner", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools(
      {
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: query,
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      },
      true,
    );

    const result = await tools
      .find((tool) => tool.name === "dysflow_query_execute")
      ?.handler({
        sql: "UPDATE People SET x=1",
        mode: "write",
        apply: true,
        allowTables: ["People", 7],
      });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toMatch(/allowTables\[1\] must be a string/);
    expect(query.requests).toEqual([]);
  });
});

// PR2 (#621 F2 / #6b) — modern dysflow_access_cleanup must preserve the full
// surface (projectId, contextId, backendPath, destinationRoot, projectRoot,
// timeoutMs, strictContext, expectedAccessPath, expectedProjectRoot,
// expectedDestinationRoot) that the legacy cleanup_access_operation schema
// declares, instead of silently dropping every field except operationId /
// accessPath / force via the previous bare cast. The core service does not
// enforce strictContext today (deferred to a follow-up), but the modern
// surface must at least carry the param forward to the request.
describe("dysflow_access_cleanup — full-field pass-through (PR2 #621 F2 / #6b)", () => {
  function makeCleanupServices(cleanupRequests: unknown[]): DysflowMcpServices {
    return {
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: new FakeQueryService(successResult({ rows: [] })),
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      cleanupService: {
        cleanup: async (request) => {
          cleanupRequests.push(request);
          return successResult({
            operationId: "op-pr2-cleanup",
            accessPid: null,
            status: "cleaned" as const,
          });
        },
      },
    };
  }

  for (const toolName of ["dysflow_access_cleanup", "cleanup_access_operation"] as const) {
    it(`${toolName} preserves strictContext through to the cleanup service request`, async () => {
      const cleanupRequests: unknown[] = [];
      const tools = createDysflowMcpTools(makeCleanupServices(cleanupRequests), false);

      const cleanupTool = tools.find((t) => t.name === toolName);
      expect(cleanupTool).toBeDefined();

      const result = await cleanupTool?.handler({
        operationId: "op-pr2-cleanup",
        accessPath: "C:/data/app.accdb",
        strictContext: true,
      });

      // Non-force path: does NOT trip the write gate, must reach the cleanup service.
      expect(result?.isError).toBe(false);
      expect(cleanupRequests).toHaveLength(1);
      expect(cleanupRequests[0]).toMatchObject({
        operationId: "op-pr2-cleanup",
        accessPath: "C:/data/app.accdb",
        strictContext: true,
      });
    });

    it(`${toolName} preserves the full optional surface (projectId, backendPath, timeoutMs, expectedAccessPath) in the request`, async () => {
      const cleanupRequests: unknown[] = [];
      const tools = createDysflowMcpTools(makeCleanupServices(cleanupRequests), false);

      const cleanupTool = tools.find((t) => t.name === toolName);
      expect(cleanupTool).toBeDefined();

      const result = await cleanupTool?.handler({
        operationId: "op-pr2-cleanup",
        accessPath: "C:/data/app.accdb",
        projectId: "demo",
        contextId: "run-42",
        backendPath: "C:/data/backend.accdb",
        destinationRoot: "C:/data/dest",
        projectRoot: "C:/data/proj",
        timeoutMs: 5000,
        expectedAccessPath: "C:/data/app.accdb",
        expectedProjectRoot: "C:/data/proj",
        expectedDestinationRoot: "C:/data/dest",
      });

      expect(result?.isError).toBe(false);
      expect(cleanupRequests).toHaveLength(1);
      expect(cleanupRequests[0]).toMatchObject({
        operationId: "op-pr2-cleanup",
        accessPath: "C:/data/app.accdb",
        projectId: "demo",
        contextId: "run-42",
        backendPath: "C:/data/backend.accdb",
        destinationRoot: "C:/data/dest",
        projectRoot: "C:/data/proj",
        timeoutMs: 5000,
        expectedAccessPath: "C:/data/app.accdb",
        expectedProjectRoot: "C:/data/proj",
        expectedDestinationRoot: "C:/data/dest",
      });
    });
  }

  it("legacy and modern cleanup builders produce the SAME field set for the same input (parity)", async () => {
    const { buildCleanupRequest } = await import("../../../src/adapters/mcp/alias-tools.js");
    const input = {
      operationId: "op-pr2-cleanup",
      accessPath: "C:/data/app.accdb",
      projectId: "demo",
      backendPath: "C:/data/backend.accdb",
      strictContext: true,
      expectedAccessPath: "C:/data/app.accdb",
      timeoutMs: 5000,
    };

    const request = buildCleanupRequest(input);
    const definedKeys = Object.entries(request)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key)
      .sort();

    // The legacy alias handler spreads buildCleanupRequest into the request
    // it forwards to the cleanup service; the modern handler does the same
    // after PR2 (replacing the bare cast). Parity check: same field set.
    expect(definedKeys).toEqual(
      [
        "accessPath",
        "backendPath",
        "expectedAccessPath",
        "operationId",
        "projectId",
        "strictContext",
        "timeoutMs",
      ].sort(),
    );
  });
});

// #405: registration invariants — duplicate names throw
describe("registration invariants — duplicate names throw (#405)", () => {
  function makeTool(name: string) {
    return {
      name,
      description: `fake tool ${name}`,
      handler: async () => ({ content: [{ type: "text" as const, text: "ok" }], isError: false }),
    };
  }

  it("throws on two entries with the same name", () => {
    const a = makeTool("tool_alpha");
    const dupA = makeTool("tool_alpha");
    expect(() => registerMcpToolList([a, dupA])).toThrow(/Duplicate MCP tool/);
  });

  it("returns a list of the same length when all names are distinct", () => {
    const entries = [makeTool("tool_a"), makeTool("tool_b"), makeTool("tool_c")];
    const result = registerMcpToolList(entries);
    expect(result).toHaveLength(3);
    const names = result.map((t) => t.name);
    expect(names).toContain("tool_a");
    expect(names).toContain("tool_b");
    expect(names).toContain("tool_c");
  });
});

describe("AccessOperationRegistry explicit injection", () => {
  it("cleanup_access_operation rejects missing accessPath before reaching cleanup service", async () => {
    const cleanupRequests: unknown[] = [];
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: new FakeQueryService(successResult({ rows: [] })),
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      cleanupService: {
        cleanup: async (request) => {
          cleanupRequests.push(request);
          return successResult({
            operationId: "op-test-mcp",
            accessPid: null,
            status: "cleaned" as const,
          });
        },
      },
    });

    const aliasCleanupTool = tools.find((t) => t.name === "cleanup_access_operation");
    expect(aliasCleanupTool).toBeDefined();
    const result = await aliasCleanupTool?.handler({ operationId: "op-test-mcp" });

    expect(result).toMatchObject({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: accessPath is required." }],
      isError: true,
      ok: false,
      error: { code: "MCP_INPUT_INVALID", message: "accessPath is required." },
    });
    expect(cleanupRequests).toEqual([]);
  });

  function makeCleanupServices(cleanupRequests: unknown[]): DysflowMcpServices {
    return {
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: new FakeQueryService(successResult({ rows: [] })),
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      cleanupService: {
        cleanup: async (request) => {
          cleanupRequests.push(request);
          return successResult({
            operationId: "op-test-mcp",
            accessPid: null,
            status: "cleaned" as const,
          });
        },
      },
    };
  }

  for (const toolName of ["cleanup_access_operation", "dysflow_access_cleanup"] as const) {
    it(`${toolName} with force:true is refused when writes are disabled and does not reach cleanup service`, async () => {
      const cleanupRequests: unknown[] = [];
      const tools = createDysflowMcpTools(makeCleanupServices(cleanupRequests), false);

      const cleanupTool = tools.find((t) => t.name === toolName);
      expect(cleanupTool).toBeDefined();
      const result = await cleanupTool?.handler({
        operationId: "op-test-mcp",
        accessPath: "C:/data/app.accdb",
        force: true,
      });

      expect(result?.isError).toBe(true);
      expect(result?.content[0]?.text).toMatch(/^MCP_WRITES_DISABLED: /);
      expect(cleanupRequests).toEqual([]);
    });

    it(`${toolName} with force:true is refused when the write resolver returns false`, async () => {
      const cleanupRequests: unknown[] = [];
      const tools = createDysflowMcpTools(
        makeCleanupServices(cleanupRequests),
        false,
        async () => false,
      );

      const cleanupTool = tools.find((t) => t.name === toolName);
      const result = await cleanupTool?.handler({
        operationId: "op-test-mcp",
        accessPath: "C:/data/app.accdb",
        force: true,
      });

      expect(result?.isError).toBe(true);
      expect(result?.content[0]?.text).toMatch(/^MCP_WRITES_DISABLED: /);
      expect(cleanupRequests).toEqual([]);
    });

    it(`${toolName} with force:true proceeds to cleanup service when writes are enabled`, async () => {
      const cleanupRequests: unknown[] = [];
      const tools = createDysflowMcpTools(makeCleanupServices(cleanupRequests), true);

      const cleanupTool = tools.find((t) => t.name === toolName);
      const result = await cleanupTool?.handler({
        operationId: "op-test-mcp",
        accessPath: "C:/data/app.accdb",
        force: true,
      });

      expect(result?.isError).toBe(false);
      expect(cleanupRequests).toEqual([
        { operationId: "op-test-mcp", accessPath: "C:/data/app.accdb", force: true },
      ]);
    });

    it(`${toolName} with force:true proceeds when the write resolver returns true`, async () => {
      const cleanupRequests: unknown[] = [];
      const tools = createDysflowMcpTools(
        makeCleanupServices(cleanupRequests),
        false,
        async () => true,
      );

      const cleanupTool = tools.find((t) => t.name === toolName);
      const result = await cleanupTool?.handler({
        operationId: "op-test-mcp",
        accessPath: "C:/data/app.accdb",
        force: true,
      });

      expect(result?.isError).toBe(false);
      expect(cleanupRequests).toHaveLength(1);
    });

    it(`${toolName} without force proceeds even when writes are disabled (safe recovery path)`, async () => {
      const cleanupRequests: unknown[] = [];
      const tools = createDysflowMcpTools(makeCleanupServices(cleanupRequests), false);

      const cleanupTool = tools.find((t) => t.name === toolName);
      const result = await cleanupTool?.handler({
        operationId: "op-test-mcp",
        accessPath: "C:/data/app.accdb",
      });

      expect(result?.isError).toBe(false);
      expect(cleanupRequests).toEqual([
        { operationId: "op-test-mcp", accessPath: "C:/data/app.accdb", force: undefined },
      ]);
    });
  }

  it("dysflow_access_operations_list and list_access_operations list operations + registryHealth from the injected registry (#575)", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    await registry.create({
      operationId: "op-test-mcp",
      action: "run" as const,
      accessPath: "C:/data/app.accdb",
      projectRootAbs: "C:/repo/app",
      destinationRootAbs: "C:/repo/app/out",
      metadata: { procedureName: "Refresh" },
      status: "starting",
      accessPid: null,
      processStartTime: null,
      updatedAt: "2026-06-03T12:00:00.000Z",
    });

    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: new FakeQueryService(successResult({ rows: [] })),
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      operationRegistry: registry,
    });

    const listTool = tools.find((t) => t.name === "dysflow_access_operations_list");
    const aliasListTool = tools.find((t) => t.name === "list_access_operations");

    expect(listTool).toBeDefined();
    expect(aliasListTool).toBeDefined();

    if (listTool === undefined || aliasListTool === undefined) {
      throw new Error("Tools not found");
    }

    const result = await listTool.handler({});
    const aliasResult = await aliasListTool.handler({});

    // DELTA-001 (#575): the response now includes registryHealth so callers
    // can tell "no operations" from "registry was corrupt and is now empty".
    // The in-memory registry is always ok.
    const expectedContent = {
      content: [
        {
          type: "text",
          text: expect.stringMatching(/op-test-mcp[\s\S]*registryHealth[\s\S]*"status":\s*"ok"/),
        },
      ],
      isError: false,
      ok: true,
    };

    expect(result).toMatchObject(expectedContent);
    expect(aliasResult).toMatchObject(expectedContent);
  });
});
