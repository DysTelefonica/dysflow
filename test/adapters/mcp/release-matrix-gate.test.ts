import { describe, expect, it } from "vitest";
import { LEGACY_PARITY_REGISTRY } from "../../../src/adapters/mcp/legacy-parity-registry";
import {
  LEGACY_DYSFLOW_MCP_TOOL_NAMES,
  type LegacyDysflowMcpToolName,
} from "../../../src/adapters/mcp/legacy-tool-inventory";
import { createDysflowMcpTools, HIDDEN_STUB_TOOL_NAMES } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

class FakeVbaService {
  async execute() {
    return successResult({ returnValue: "ok" });
  }
}
class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}
class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

describe("MCP Release Matrix Gate & Coverage Report", () => {
  const services = {
    vbaService: new FakeVbaService(),
    queryService: new FakeQueryService(),
    diagnosticsService: new FakeDiagnosticsService(),
  };

  const tools = createDysflowMcpTools(services, true);

  it("documents and validates exact tool counts", () => {
    const legacyCount = LEGACY_DYSFLOW_MCP_TOOL_NAMES.length;
    const stubCount = HIDDEN_STUB_TOOL_NAMES.size;
    const modernCount = tools.filter(
      (t) => !LEGACY_DYSFLOW_MCP_TOOL_NAMES.includes(t.name as LegacyDysflowMcpToolName),
    ).length;
    const visibleCount = tools.filter((t) => !t.hidden).length;

    expect(legacyCount).toBe(45);
    expect(stubCount).toBe(2);
    expect(modernCount).toBe(5);
    expect(visibleCount).toBe(48);
  });

  it("verifies split-mode coverage explicitly", () => {
    // Read/Write split mode checks
    const queryExecute = tools.find((t) => t.name === "dysflow_query_execute");
    expect(queryExecute).toBeDefined();
    expect(queryExecute?.inputSchema?.properties?.mode?.enum).toEqual(["read", "write"]);

    // Verify read-only legacy sql query
    const querySql = tools.find((t) => t.name === "query_sql");
    expect(querySql).toBeDefined();
    expect(querySql?.inputSchema?.properties?.sql).toBeDefined();

    // Verify write legacy sql exec
    const execSql = tools.find((t) => t.name === "exec_sql");
    expect(execSql).toBeDefined();
    expect(execSql?.inputSchema?.properties?.dryRun).toBeDefined();

    // Dry-run vs Apply checks across maintenance/write tools
    const dryRunApplyTools = [
      "link_tables",
      "relink_tables",
      "localize_backend_links",
      "unlink_table",
      "import_queries",
      "compact_repair",
      "exec_sql",
      "run_script",
      "create_table",
      "drop_table",
      "seed_fixture",
      "teardown_fixture",
    ];

    for (const toolName of dryRunApplyTools) {
      const tool = tools.find((t) => t.name === toolName);
      expect(tool, `Tool ${toolName} must be registered and implemented`).toBeDefined();

      const properties = tool?.inputSchema?.properties ?? {};
      const hasDryRun = "dryRun" in properties;
      const hasApply = "apply" in properties;

      expect(
        hasDryRun || hasApply,
        `Tool ${toolName} must support split mode (dryRun or apply)`,
      ).toBe(true);
    }
  });

  it("guarantees parity registry matches implementation and no stubs are marked implemented", () => {
    for (const entry of LEGACY_PARITY_REGISTRY) {
      if (entry.status === "implemented") {
        expect(HIDDEN_STUB_TOOL_NAMES.has(entry.name)).toBe(false);
      } else {
        expect(HIDDEN_STUB_TOOL_NAMES.has(entry.name)).toBe(true);
      }
    }
  });
});
