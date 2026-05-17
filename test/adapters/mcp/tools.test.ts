import { describe, expect, it } from "vitest";
import { createDysflowMcpTools, translateCoreResultToMcpContent } from "../../../src/adapters/mcp/tools";
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

    expect(toolNames).toEqual(expect.arrayContaining(["dysflow.vba.execute", "dysflow.query.execute", "dysflow.doctor", "dysflow.access.operations.list", "dysflow.access.cleanup"]));
    expect(tools.find((tool) => tool.name === "dysflow.vba.execute")?.inputSchema).toMatchObject({
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

  it("describes projectId as canonical trace identity and contextId as optional run context", () => {
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(successResult({ returnValue: "ok" })),
      queryService: new FakeQueryService(successResult({ rows: [] })),
      diagnosticsService: new FakeDiagnosticsService(successResult({ checks: [] })),
    });
    const schema = tools.find((tool) => tool.name === "dysflow.vba.execute")?.inputSchema;

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

    await expect(tools.find((tool) => tool.name === "dysflow.doctor")?.handler({ contextId: "00-no-conformidades-staging-clean" })).resolves.toMatchObject({ isError: false });
    await expect(tools.find((tool) => tool.name === "dysflow.vba.execute")?.handler({ contextId: "00-no-conformidades-staging-clean", procedureName: "Smoke" })).resolves.toMatchObject({ isError: false });
    await expect(tools.find((tool) => tool.name === "dysflow.query.execute")?.handler({ contextId: "00-no-conformidades-staging-clean", sql: "SELECT 1", mode: "read" })).resolves.toMatchObject({ isError: false });

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
    });

    await expect(tools.find((tool) => tool.name === "dysflow.vba.execute")?.handler({ moduleName: "Automation" })).resolves.toEqual({
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

    await expect(tools.find((tool) => tool.name === "dysflow.query.execute")?.handler({ sql: "SELECT 1", mode: "delete" })).resolves.toEqual({
      content: [{ type: "text", text: "MCP_INPUT_INVALID: mode must be one of: read, write." }],
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
});
