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
      },
    });
    await expect(
      tools[0]?.handler({ moduleName: "Automation", procedureName: "Refresh", arguments: [2026] }),
    ).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ returnValue: "refreshed" }) }],
      isError: false,
    });
    await expect(
      tools[1]?.handler({ sql: "SELECT id, name FROM People", mode: "read" }),
    ).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ rows: [{ id: 1, name: "Ada" }] }) }],
      isError: false,
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
    });

    expect(vba.requests).toEqual([
      { moduleName: "Automation", procedureName: "Refresh", arguments: [2026] },
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

  it("regression: MODERN_TOOL_NAMES are exactly the 6 underscore-only names and none contains a dot", () => {
    // This test is the authoritative contract for modern tool names.
    // It guards against accidental regression to dotted names (e.g. dysflow.vba.execute).
    const expectedNames = [
      "dysflow_vba_execute",
      "dysflow_query_execute",
      "dysflow_doctor",
      "dysflow_access_operations_list",
      "dysflow_access_cleanup",
      "dysflow_access_force_cleanup_orphaned",
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
        ?.handler({ contextId: "00-no-conformidades-staging-clean", procedureName: "Smoke" }),
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
      { contextId: "00-no-conformidades-staging-clean", procedureName: "Smoke" },
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
    ).resolves.toEqual({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: procedureName is required." }],
      isError: true,
    });
    await expect(
      tools.find((tool) => tool.name === "query_sql")?.handler({ sql: 42 }),
    ).resolves.toEqual({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: sql must be a string." }],
      isError: true,
    });
    await expect(
      tools
        .find((tool) => tool.name === "seed_fixture")
        ?.handler({ tableName: "People", allowTable: "People", rows: [{ id: 1 }], dryRun: true }),
    ).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ rows: [] }) }],
      isError: false,
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
      content: [{ text: expect.stringContaining("sql") }],
    });
    await expect(
      tools.find((t) => t.name === "query_sql")?.handler({ sql: "" }),
    ).resolves.toMatchObject({ isError: true });
    await expect(tools.find((t) => t.name === "query_sql")?.handler({})).resolves.toMatchObject({
      isError: true,
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
    ).resolves.toEqual({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: mode must be one of: read, write." }],
      isError: true,
    });
    await expect(
      tools
        .find((tool) => tool.name === "dysflow_query_execute")
        ?.handler({ sql: "UPDATE People SET name='Ada'", mode: "write" }),
    ).resolves.toEqual({
      content: [
        {
          type: "text",
          text: "MCP_WRITES_DISABLED: Write tools are disabled for this MCP adapter.",
        },
      ],
      isError: true,
    });
    await expect(
      tools
        .find((tool) => tool.name === "seed_fixture")
        ?.handler({ tableName: "People", allowTables: ["People", 7], rows: [{ id: 1 }] }),
    ).resolves.toEqual({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: allowTables[1] must be a string." }],
      isError: true,
    });
    await expect(
      tools
        .find((tool) => tool.name === "import_queries")
        ?.handler({ queryDefinitions: [{ name: "q_people", sql: 42 }] }),
    ).resolves.toEqual({
      content: [
        { type: "text", text: "MCP_INPUT_INVALID: queryDefinitions[0].sql must be a string." },
      ],
      isError: true,
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
        ?.handler({ sql: "UPDATE People SET name='Ada'", mode: "write" }),
    ).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ rows: [] }) }],
      isError: false,
    });

    expect(query.requests).toEqual([{ sql: "UPDATE People SET name='Ada'", mode: "write" }]);
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

    await expect(runVba?.handler({ procedureName: "Broken", argsJson: "[1," })).resolves.toEqual({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: argsJson must be valid JSON." }],
      isError: true,
    });
    await expect(runVba?.handler({ procedureName: "Blank", argsJson: "   " })).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ returnValue: "ok" }) }],
      isError: false,
    });
    await expect(
      runVba?.handler({ procedureName: "Array", argsJson: '[1,"two"]' }),
    ).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ returnValue: "ok" }) }],
      isError: false,
    });
    await expect(runVba?.handler({ procedureName: "Single", argsJson: "42" })).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ returnValue: "ok" }) }],
      isError: false,
    });

    expect(vba.requests).toEqual([
      { moduleName: "", procedureName: "Blank", arguments: [] },
      { moduleName: "", procedureName: "Array", arguments: [1, "two"] },
      { moduleName: "", procedureName: "Single", arguments: [42] },
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
    const IMPLEMENTED_VERIFY_TOOL_NAMES = [
      "verify_code",
      "verify_binary",
      "reconcile_binary",
    ] as const;

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
      // Non-modern tools are those outside the 'dysflow_' namespace
      const nonModernTools = tools.filter((t) => !t.name.startsWith("dysflow_"));
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
        "compile_vba",
        "verify_code",
        "verify_binary",
        "reconcile_binary",
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

      const tools = createDysflowMcpTools({
        ...makeServices(),
        vbaSyncToolService: {
          execute: async (toolName, input) => successResult({ toolName, input, ok: true }),
        },
      });
      const compile = tools.find((t) => t.name === "compile_vba");
      const result = await compile?.handler({ timeoutMs: 120_000 });
      expect(result).toEqual({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              toolName: "compile_vba",
              input: { timeoutMs: 120_000 },
              ok: true,
            }),
          },
        ],
        isError: false,
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
      const tools = createDysflowMcpTools({
        ...makeServices(),
        vbaSyncToolService: {
          execute: async (toolName, input) => successResult({ toolName, input, ok: true }),
        },
      });
      const importModules = tools.find((tool) => tool.name === "import_modules");
      expect(importModules).toBeDefined();
      if (importModules === undefined) throw new Error("import_modules should be registered");

      const result = await importModules.handler({
        moduleNames: ["DysflowMcpE2EMissing"],
        importMode: "code",
        dryRun: true,
        compile: false,
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
                compile: false,
              },
              ok: true,
            }),
          },
        ],
        isError: false,
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
      await tool?.handler({ procedureName: "DoWork" }, context);

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

      // MCP tool handlers don't use context — calling with it must not throw
      await expect(mcpTool?.handler({ procedureName: "TestProc" }, context)).resolves.toMatchObject(
        { isError: false },
      );
    });
  });

  describe("allowedProcedures — procedureName allowlist for dysflow_vba_execute", () => {
    function makeTools(allowedProcedures: readonly string[]) {
      return createDysflowMcpTools(
        {
          vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
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

    it("allows any procedure when allowlist is empty (unconfigured)", async () => {
      const tools = makeTools([]);
      const result = await tools
        .find((t) => t.name === "dysflow_vba_execute")
        ?.handler({ procedureName: "DeleteAll" });
      expect(result?.isError).toBe(false);
    });

    it("allows any procedure when allowedProcedures is not passed", async () => {
      const tools = createDysflowMcpTools({
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: new FakeQueryService(successResult({ rows: [] })),
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      });
      const result = await tools
        .find((t) => t.name === "dysflow_vba_execute")
        ?.handler({ procedureName: "AnyProcedure" });
      expect(result?.isError).toBe(false);
    });
  });

  describe("allowedProcedures — procedureName allowlist for run_vba alias", () => {
    function makeTools(allowedProcedures: readonly string[]) {
      return createDysflowMcpTools(
        {
          vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
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

    it("allows any procedure when allowlist is empty (unconfigured)", async () => {
      const tools = makeTools([]);
      const result = await tools
        .find((t) => t.name === "run_vba")
        ?.handler({ procedureName: "DeleteAll" });
      expect(result?.isError).toBe(false);
    });

    it("allows any procedure when allowedProcedures is not passed", async () => {
      const tools = createDysflowMcpTools({
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: new FakeQueryService(successResult({ rows: [] })),
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      });
      const result = await tools
        .find((t) => t.name === "run_vba")
        ?.handler({ procedureName: "AnyProcedure" });
      expect(result?.isError).toBe(false);
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

    expect(result).toEqual({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: accessPath is required." }],
      isError: true,
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

  it("dysflow_access_operations_list and list_access_operations list operations from the injected registry", async () => {
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

    const expectedContent = {
      content: [{ type: "text", text: expect.stringContaining("op-test-mcp") }],
      isError: false,
    };

    expect(result).toMatchObject(expectedContent);
    expect(aliasResult).toMatchObject(expectedContent);
  });
});
