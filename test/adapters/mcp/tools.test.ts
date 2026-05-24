import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createDysflowMcpTools, translateCoreResultToMcpContent, LEGACY_TOOL_SCHEMAS, MODERN_TOOL_NAMES, type DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import { failureResult, successResult, type OperationResult } from "../../../src/core/contracts/index";
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
    const query = new FakeQueryService(successResult({ rows: [{ id: 1, name: "Ada" }] }, { durationMs: 5 }));
    const diagnostics = new FakeDiagnosticsService(
      successResult({ checks: [{ name: "access-db-path", ok: true, message: "configured" }] }, { durationMs: 3 }),
    );

    const tools = createDysflowMcpTools({ vbaService: vba, queryService: query, diagnosticsService: diagnostics });
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toEqual(expect.arrayContaining(["dysflow_vba_execute", "dysflow_query_execute", "dysflow_doctor", "dysflow_access_operations_list", "dysflow_access_cleanup"]));
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
    await expect(tools[0]?.handler({ moduleName: "Automation", procedureName: "Refresh", arguments: [2026] })).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ returnValue: "refreshed" }) }],
      isError: false,
    });
    await expect(tools[1]?.handler({ sql: "SELECT id, name FROM People", mode: "read" })).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ rows: [{ id: 1, name: "Ada" }] }) }],
      isError: false,
    });
    await expect(tools[2]?.handler({ includeEnvironment: true })).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ checks: [{ name: "access-db-path", ok: true, message: "configured" }] }) }],
      isError: false,
    });

    expect(vba.requests).toEqual([{ moduleName: "Automation", procedureName: "Refresh", arguments: [2026] }]);
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
    ];

    expect(toolNames).toEqual(expect.arrayContaining(expectedModernToolNames));
    expect(toolNames.filter((name) => name.startsWith("dysflow") && name.includes("."))).toEqual([]);
  });

  it("regression: MODERN_TOOL_NAMES are exactly the 5 underscore-only names and none contains a dot", () => {
    // This test is the authoritative contract for modern tool names.
    // It guards against accidental regression to dotted names (e.g. dysflow.vba.execute).
    const expectedNames = [
      "dysflow_vba_execute",
      "dysflow_query_execute",
      "dysflow_doctor",
      "dysflow_access_operations_list",
      "dysflow_access_cleanup",
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

    expect(schema?.properties.projectId.description).toContain("canonical project identity");
    expect(schema?.properties.projectId.description).toContain("Engram");
    expect(schema?.properties.contextId.description).toContain("run/context id");
    expect(schema?.properties.contextId.description).toContain("Do not duplicate projectId");
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

    await expect(tools.find((tool) => tool.name === "dysflow_doctor")?.handler({ contextId: "00-no-conformidades-staging-clean" })).resolves.toMatchObject({ isError: false });
    await expect(tools.find((tool) => tool.name === "dysflow_vba_execute")?.handler({ contextId: "00-no-conformidades-staging-clean", procedureName: "Smoke" })).resolves.toMatchObject({ isError: false });
    await expect(tools.find((tool) => tool.name === "dysflow_query_execute")?.handler({ contextId: "00-no-conformidades-staging-clean", sql: "SELECT 1", mode: "read" })).resolves.toMatchObject({ isError: false });

    expect(diagnostics.requests).toEqual([{ contextId: "00-no-conformidades-staging-clean" }]);
    expect(vba.requests).toEqual([{ contextId: "00-no-conformidades-staging-clean", procedureName: "Smoke" }]);
    expect(query.requests).toEqual([{ contextId: "00-no-conformidades-staging-clean", sql: "SELECT 1", mode: "read" }]);
  });

  it("rejects invalid MCP inputs before calling core services", async () => {
    const vba = new FakeVbaService(successResult({ returnValue: "ok" }));
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: vba,
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    }, true);

    await expect(tools.find((tool) => tool.name === "dysflow_vba_execute")?.handler({ moduleName: "Automation" })).resolves.toEqual({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: procedureName is required." }],
      isError: true,
    });
    await expect(tools.find((tool) => tool.name === "query_sql")?.handler({ sql: 42 })).resolves.toEqual({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: sql must be a string." }],
      isError: true,
    });
    await expect(tools.find((tool) => tool.name === "seed_fixture")?.handler({ tableName: "People", allowTable: "People", rows: [{ id: 1 }], dryRun: true })).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ rows: [] }) }],
      isError: false,
    });
    expect(tools.find((tool) => tool.name === "catalog_add_control")?.inputSchema?.properties).toHaveProperty("catalogPath");

    expect(vba.requests).toEqual([]);
    expect(query.requests).toEqual([expect.objectContaining({ action: "seed_fixture", tableName: "People", allowTables: ["People"] })]);
  });

  it("rejects invalid nested MCP inputs before calling core services", async () => {
    const vba = new FakeVbaService(successResult({ returnValue: "ok" }));
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: vba,
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });

    await expect(tools.find((tool) => tool.name === "dysflow_query_execute")?.handler({ sql: "SELECT 1", mode: "delete" })).resolves.toEqual({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: mode must be one of: read, write." }],
      isError: true,
    });
    await expect(tools.find((tool) => tool.name === "dysflow_query_execute")?.handler({ sql: "UPDATE People SET name='Ada'", mode: "write" })).resolves.toEqual({
      content: [{ type: "text", text: "MCP_WRITES_DISABLED: Write tools are disabled for this MCP adapter." }],
      isError: true,
    });
    await expect(tools.find((tool) => tool.name === "seed_fixture")?.handler({ tableName: "People", allowTables: ["People", 7], rows: [{ id: 1 }] })).resolves.toEqual({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: allowTables[1] must be a string." }],
      isError: true,
    });
    await expect(tools.find((tool) => tool.name === "import_queries")?.handler({ queryDefinitions: [{ name: "q_people", sql: 42 }] })).resolves.toEqual({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: queryDefinitions[0].sql must be a string." }],
      isError: true,
    });

    expect(vba.requests).toEqual([]);
    expect(query.requests).toEqual([]);
  });

  it("allows MCP write queries only when writes are explicitly enabled", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    }, true);

    await expect(tools.find((tool) => tool.name === "dysflow_query_execute")?.handler({ sql: "UPDATE People SET name='Ada'", mode: "write" })).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ rows: [] }) }],
      isError: false,
    });

    expect(query.requests).toEqual([{ sql: "UPDATE People SET name='Ada'", mode: "write" }]);
  });

  it("allows write tool when project-scoped allowWrites resolver grants access", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    }, false, async (input) => (input as { projectId?: string }).projectId === "lanzadera");

    await expect(tools.find((tool) => tool.name === "seed_fixture")?.handler({
      projectId: "lanzadera",
      tableName: "People",
      rows: [{ id: 1 }],
      apply: true,
    })).resolves.toEqual({
      content: [{ type: "text", text: JSON.stringify({ rows: [] }) }],
      isError: false,
    });

    expect(query.requests).toEqual([expect.objectContaining({ action: "seed_fixture", mode: "write", dryRun: false })]);
  });

  it("keeps blocking write tool when allowWrites resolver denies the project", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    }, false, async () => false);

    const result = await tools.find((tool) => tool.name === "seed_fixture")?.handler({
      projectId: "readonly-project",
      tableName: "People",
      rows: [{ id: 1 }],
      apply: true,
    });

    expect(result?.isError).toBe(true);
    expect(result?.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(query.requests).toEqual([]);
  });

  it("handles legacy run_vba argsJson as MCP input instead of raw JSON-RPC failures", async () => {
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
    await expect(runVba?.handler({ procedureName: "Array", argsJson: "[1,\"two\"]" })).resolves.toEqual({
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
      expect(tool.inputSchema, `${tool.name} should declare inputSchema`).toMatchObject({ type: "object", properties: expect.any(Object) });
      expect(tool.inputSchema).not.toEqual({ type: "object", additionalProperties: true });
    }
  });

  describe("stub tool visibility (#175)", () => {
    const IMPLEMENTED_VERIFY_TOOL_NAMES = ["verify_code"] as const;

    function makeServices() {
      return {
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: new FakeQueryService(successResult({ rows: [] })),
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      };
    }

    it("marks stub (not-implemented) tools as hidden so they are excluded from tools/list projection", () => {
      const tools = createDysflowMcpTools(makeServices());
      for (const implemented of IMPLEMENTED_VERIFY_TOOL_NAMES) {
        const tool = tools.find((t) => t.name === implemented);
        expect(tool, `${implemented} must be present in tool registry`).toBeDefined();
        expect(tool?.hidden, `${implemented} must be visible now that it is implemented`).toBeUndefined();
      }
    });

    it("visible VBA sync tools report service unavailability instead of legacy not-implemented when no legacy service is configured", async () => {
      const tools = createDysflowMcpTools(makeServices());
      for (const toolName of IMPLEMENTED_VERIFY_TOOL_NAMES) {
        const result = await tools.find((t) => t.name === toolName)?.handler({ diff: true });
        expect(result?.isError, `${toolName} should fail safely without the legacy service`).toBe(true);
        expect(result?.content[0]?.text).toContain("MCP_SERVICE_UNAVAILABLE");
        expect(result?.content[0]?.text).not.toContain("LEGACY_TOOL_NOT_IMPLEMENTED");
      }
    });

    it("verify/reconcile tools dispatch to the legacy service instead of the not-implemented fallback", async () => {
      const tools = createDysflowMcpTools({
        ...makeServices(),
        legacyToolService: {
          execute: async (toolName, input) => successResult({ toolName, input, ok: true }),
        },
      });

      for (const toolName of IMPLEMENTED_VERIFY_TOOL_NAMES) {
        const result = await tools.find((t) => t.name === toolName)?.handler({ diff: true });
        expect(result).toEqual({
          content: [{ type: "text", text: JSON.stringify({ toolName, input: { diff: true }, ok: true }) }],
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

    it("every registered legacy tool has an entry in LEGACY_TOOL_SCHEMAS", () => {
      const tools = createDysflowMcpTools(makeServices());
      // Legacy tools are those outside the modern 'dysflow_' namespace (they use legacySchemaForTool)
      const legacyTools = tools.filter((t) => !t.name.startsWith("dysflow_"));
      for (const tool of legacyTools) {
        expect(LEGACY_TOOL_SCHEMAS, `${tool.name} must have an entry in LEGACY_TOOL_SCHEMAS`).toHaveProperty(tool.name);
      }
    });

    it("list_tables schema does not include rows property", () => {
      const schema = LEGACY_TOOL_SCHEMAS["list_tables"];
      expect(schema).toBeDefined();
      expect(schema?.properties).not.toHaveProperty("rows");
    });

    it("seed_fixture schema does not include query property", () => {
      const schema = LEGACY_TOOL_SCHEMAS["seed_fixture"];
      expect(schema).toBeDefined();
      expect(schema?.properties).not.toHaveProperty("query");
    });

    it("exists schema accepts both public name and legacy moduleName aliases", () => {
      const schema = LEGACY_TOOL_SCHEMAS["exists"];
      expect(schema).toBeDefined();
      expect(schema?.properties).toHaveProperty("name");
      expect(schema?.properties).toHaveProperty("moduleName");
    });

    it("legacy VBA runner schemas expose per-call timeoutMs overrides", async () => {
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
        expect(LEGACY_TOOL_SCHEMAS[toolName]?.properties, `${toolName} should accept timeoutMs`).toHaveProperty("timeoutMs");
      }

      const tools = createDysflowMcpTools({
        ...makeServices(),
        legacyToolService: {
          execute: async (toolName, input) => successResult({ toolName, input, ok: true }),
        },
      });
      const compile = tools.find((t) => t.name === "compile_vba");
      const result = await compile?.handler({ timeoutMs: 120_000 });
      expect(result).toEqual({
        content: [{ type: "text", text: JSON.stringify({ toolName: "compile_vba", input: { timeoutMs: 120_000 }, ok: true }) }],
        isError: false,
      });
    });

    it("passing a property not in a tool-specific schema returns MCP_INPUT_INVALID", async () => {
      const tools = createDysflowMcpTools(makeServices());
      // list_tables should not accept rows — passing rows should produce a validation error
      const listTables = tools.find((t) => t.name === "list_tables");
      expect(listTables).toBeDefined();
      const result = await listTables!.handler({ rows: [{ id: 1 }] });
      expect(result.isError).toBe(true);
      expect(result.content[0]?.text).toContain("MCP_INPUT_INVALID");
    });
  });

  it("translates core failures to safe MCP errors without leaking diagnostics, protocol details, or local paths", () => {
    const result = failureResult(
      { code: "RUNNER_FAILED", message: "PowerShell runner failed for C:\\Users\\Jane Doe\\NoConformidades.accdb and /Users/Jane Doe/db.accdb: password=[REDACTED]", retryable: false },
      { diagnostics: [{ level: "error", source: "powershell.stderr", message: "raw internal stack" }], durationMs: 11 },
    );

    expect(translateCoreResultToMcpContent(result)).toEqual({
      content: [{ type: "text", text: "RUNNER_FAILED: PowerShell runner failed for [PATH] and [PATH]: password=[REDACTED]" }],
      isError: true,
    });
  });

  // Issue #184: dryRun:true must bypass the write guard for relink_tables
  it("allows relink_tables with dryRun:true even when writes are disabled (issue #184)", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    }, false);
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
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    }, false);
    const relinkTool = tools.find((tool) => tool.name === "relink_tables");

    // dryRun:false — must be blocked by write guard when writes are disabled
    const writeResult = await relinkTool?.handler({ dryRun: false });
    expect(writeResult?.isError).toBe(true);
    expect(writeResult?.content[0]?.text).toContain("MCP_WRITES_DISABLED");
    expect(query.requests).toEqual([]);
  });

  it("allows relink_tables with dryRun:false when writes are enabled (issue #184)", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    }, true);
    const relinkTool = tools.find((tool) => tool.name === "relink_tables");

    const writeResult = await relinkTool?.handler({ dryRun: false });
    expect(writeResult?.isError).toBe(false);
    expect(writeResult?.content[0]?.text).not.toContain("MCP_WRITES_DISABLED");
    expect(query.requests.length).toBeGreaterThan(0);
  });

  it("allows localize_backend_links with optional backendPath and dryRun", async () => {
    const query = new FakeQueryService(successResult({ rows: [] }));
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    }, true);

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
      const result = await seedFixture?.handler({ tableName: "People", rows: [{ id: 1 }], apply: true });
      expect(result?.isError).toBe(true);
      expect(result?.content[0]?.text).toContain("MCP_WRITES_DISABLED");
      expect(query.requests).toEqual([]);
    });

    it("write tool succeeds when writesEnabled=true is passed as explicit second parameter", async () => {
      const query = new FakeQueryService(successResult({ rows: [] }));
      const services = { ...makeServices(), queryService: query };
      const tools = createDysflowMcpTools(services, true);
      const seedFixture = tools.find((tool) => tool.name === "seed_fixture");
      const result = await seedFixture?.handler({ tableName: "People", rows: [{ id: 1 }], apply: true });
      expect(result?.isError).toBe(false);
    });
  });

  describe("McpToolContext wiring — modern tools forward sendProgress to services", () => {
    class ProgressCapturingVbaService {
      public capturedOnProgress: unknown[] = [];
      async execute(request: unknown, onProgress?: unknown): Promise<OperationResult<AccessVbaResult>> {
        this.capturedOnProgress.push(onProgress);
        return successResult({ returnValue: "ok" });
      }
    }

    class ProgressCapturingQueryService {
      public capturedOnProgress: unknown[] = [];
      async execute(request: unknown, onProgress?: unknown): Promise<OperationResult<AccessQueryResult>> {
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
      const tools = createDysflowMcpTools({
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: query as unknown as DysflowMcpServices["queryService"],
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      }, true);

      const sendProgress = () => {};
      const context = { progressToken: "tok-2", sendProgress };

      const tool = tools.find((t) => t.name === "dysflow_query_execute");
      await tool?.handler({ sql: "SELECT 1", mode: "read" }, context);

      expect(query.capturedOnProgress).toHaveLength(1);
      expect(query.capturedOnProgress[0]).toBe(sendProgress);
    });

    it("legacy handler called with a context does not throw", async () => {
      const vba = new FakeVbaService(successResult({ returnValue: "ok" }));
      const tools = createDysflowMcpTools({
        vbaService: vba,
        queryService: new FakeQueryService(successResult({ rows: [] })),
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      });

      const context = { progressToken: "tok-legacy", sendProgress: () => {} };
      const legacyTool = tools.find((t) => t.name === "run_vba");

      // Legacy handlers don't use context — calling with it must not throw
      await expect(
        legacyTool?.handler({ procedureName: "LegacyProc" }, context),
      ).resolves.toMatchObject({ isError: false });
    });
  });

  describe("context props unification — single source of truth (#200)", () => {
    it("does NOT declare CONTEXT_PROPERTIES or the standalone CTX alias in tools.ts (they were duplicates)", () => {
      const source = readFileSync("src/adapters/mcp/tools.ts", "utf8");
      expect(source).not.toContain("const CONTEXT_PROPERTIES");
      expect(source).not.toContain("const CTX =");
    });

    it("schemas that previously used CONTEXT_PROPERTIES still include projectId and contextId", () => {
      const tools = createDysflowMcpTools({
        vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
        queryService: new FakeQueryService(successResult({ rows: [] })),
        diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
      });
      const toolsWithCtx = ["query_sql", "exec_sql", "export_modules", "link_tables", "list_tables"];
      for (const name of toolsWithCtx) {
        const tool = tools.find((t) => t.name === name);
        expect(tool?.inputSchema?.properties, `${name} must have projectId`).toHaveProperty("projectId");
        expect(tool?.inputSchema?.properties, `${name} must have contextId`).toHaveProperty("contextId");
      }
    });
  });
});
