import { describe, expect, it } from "vitest";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
import { LEGACY_DYSFLOW_MCP_TOOL_NAMES, LEGACY_QUERY_TOOL_NAMES, LEGACY_VBA_SYNC_TOOL_NAMES } from "../../../src/adapters/mcp/legacy-tool-inventory";
import { successResult, type OperationResult } from "../../../src/core/contracts/index";
import type { AccessDiagnosticsResult } from "../../../src/core/services/diagnostics-service";
import type { AccessQueryResult } from "../../../src/core/services/query-service";
import type { AccessVbaResult } from "../../../src/core/services/vba-service";

class FakeVbaService {
  public requests: unknown[] = [];
  async execute(request: unknown): Promise<OperationResult<AccessVbaResult>> {
    this.requests.push(request);
    return successResult({ returnValue: "ok" });
  }
}

class FakeQueryService {
  public requests: unknown[] = [];
  async execute(request: unknown): Promise<OperationResult<AccessQueryResult>> {
    this.requests.push(request);
    return successResult({ rows: [{ ok: true }] });
  }
}

class FakeDiagnosticsService {
  async run(): Promise<OperationResult<AccessDiagnosticsResult>> {
    return successResult({ checks: [] });
  }
}

describe("legacy Dysflow MCP parity inventory", () => {
  it("declares the complete 46-tool legacy inventory", () => {
    expect(LEGACY_VBA_SYNC_TOOL_NAMES).toHaveLength(23);
    expect(LEGACY_QUERY_TOOL_NAMES).toHaveLength(23);
    expect(LEGACY_DYSFLOW_MCP_TOOL_NAMES).toHaveLength(46);
    expect(new Set(LEGACY_DYSFLOW_MCP_TOOL_NAMES).size).toBe(46);
    expect(LEGACY_DYSFLOW_MCP_TOOL_NAMES).toContain("export_modules");
    expect(LEGACY_DYSFLOW_MCP_TOOL_NAMES).toContain("test_vba");
    expect(LEGACY_DYSFLOW_MCP_TOOL_NAMES).toContain("query_sql");
    expect(LEGACY_DYSFLOW_MCP_TOOL_NAMES).toContain("compact_repair");
  });

  it("exposes legacy-compatible names for already implemented Dysflow operations", async () => {
    const vba = new FakeVbaService();
    const query = new FakeQueryService();
    const tools = createDysflowMcpTools({
      vbaService: vba,
      queryService: query,
      diagnosticsService: new FakeDiagnosticsService(),
      cleanupService: { cleanup: async () => successResult({ killed: false, diagnostics: [] }) },
    });
    const byName = new Map(tools.map((tool) => [tool.name, tool]));

    for (const name of ["list_access_operations", "cleanup_access_operation", "run_vba", "query_sql"] as const) {
      expect(byName.has(name), `${name} should be registered`).toBe(true);
    }

    await byName.get("run_vba")?.handler({ procedureName: "Smoke", argsJson: "[1,2]", accessPath: "C:/data/app.accdb" });
    await byName.get("query_sql")?.handler({ sql: "SELECT 1" });

    expect(vba.requests).toEqual([{ moduleName: "", procedureName: "Smoke", arguments: [1, 2], accessPath: "C:/data/app.accdb", projectRoot: undefined, destinationRoot: undefined }]);
    expect(query.requests).toEqual([{ sql: "SELECT 1", mode: "read" }]);
  });

  it("returns explicit not-implemented errors for legacy tools whose slice is not ported yet", async () => {
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(),
      queryService: new FakeQueryService(),
      diagnosticsService: new FakeDiagnosticsService(),
    });
    const exportModules = tools.find((tool) => tool.name === "export_modules");

    await expect(exportModules?.handler({ moduleNames: ["Module1"] })).resolves.toEqual({
      isError: true,
      content: [{ type: "text", text: "LEGACY_TOOL_NOT_IMPLEMENTED: export_modules is tracked for legacy parity but not ported in this slice." }],
    });
  });

  it("dispatches VBA sync legacy tools to the configured product service", async () => {
    const legacyCalls: unknown[] = [];
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(),
      queryService: new FakeQueryService(),
      diagnosticsService: new FakeDiagnosticsService(),
      legacyToolService: {
        execute: async (toolName, input) => {
          legacyCalls.push({ toolName, input });
          return successResult({ ok: true, toolName });
        },
      },
    });

    await expect(tools.find((tool) => tool.name === "export_modules")?.handler({ moduleNames: ["Module1"], accessPath: "C:/db.accdb" })).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ ok: true, toolName: "export_modules" }) }],
    });
    await expect(tools.find((tool) => tool.name === "verify_binary")?.handler({ moduleNames: ["Form_Main"], diff: true })).resolves.toEqual({
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ ok: true, toolName: "verify_binary" }) }],
    });

    expect(legacyCalls).toEqual([
      { toolName: "export_modules", input: { moduleNames: ["Module1"], accessPath: "C:/db.accdb" } },
      { toolName: "verify_binary", input: { moduleNames: ["Form_Main"], diff: true } },
    ]);
  });

});
