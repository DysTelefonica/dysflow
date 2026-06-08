import { describe, expect, it } from "vitest";
import {
  DYSFLOW_MCP_TOOL_NAMES,
  type DysflowMcpToolName,
} from "../../../src/adapters/mcp/mcp-tool-registry";
import {
  pendingToolNames,
  TOOL_PARITY_REGISTRY,
} from "../../../src/adapters/mcp/tool-parity-registry";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
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
    const toolCount = DYSFLOW_MCP_TOOL_NAMES.length;
    const stubCount = pendingToolNames().size;
    const modernCount = tools.filter(
      (t) => !DYSFLOW_MCP_TOOL_NAMES.includes(t.name as DysflowMcpToolName),
    ).length;
    const visibleCount = tools.filter((t) => !t.hidden).length;

    // #405: these counts are the invariant for change 405-unify-mcp-tool-registration.
    // Any edit that moves one of these numbers MUST justify the change in that PR.
    // Expected breakdown: 45 dispatch names (DYSFLOW_MCP_TOOL_NAMES) -
    //   2 hidden stubs (verify_binary, reconcile_binary) + 6 modern (dysflow_*) = 49 visible.
    expect(toolCount).toBe(45);
    expect(stubCount).toBe(2);
    expect(modernCount).toBe(6);
    expect(visibleCount).toBe(49);
  });

  it("verifies split-mode coverage explicitly", () => {
    // Read/Write split mode checks
    const queryExecute = tools.find((t) => t.name === "dysflow_query_execute");
    expect(queryExecute).toBeDefined();
    expect(queryExecute?.inputSchema?.properties?.mode?.enum).toEqual(["read", "write"]);
    expect(queryExecute?.inputSchema?.properties).toHaveProperty("backendPath");
    expect(queryExecute?.inputSchema?.properties).toHaveProperty("databasePath");
    expect(queryExecute?.inputSchema?.properties).toHaveProperty("sourcePath");

    // Verify read-only sql query
    const querySql = tools.find((t) => t.name === "query_sql");
    expect(querySql).toBeDefined();
    expect(querySql?.inputSchema?.properties?.sql).toBeDefined();
    expect(querySql?.inputSchema?.properties).toHaveProperty("backendPath");
    expect(querySql?.inputSchema?.properties).toHaveProperty("databasePath");
    expect(querySql?.inputSchema?.properties).toHaveProperty("sourcePath");

    // Verify write sql exec
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
    const pending = pendingToolNames();
    for (const entry of TOOL_PARITY_REGISTRY) {
      if (entry.status === "implemented") {
        expect(pending.has(entry.name)).toBe(false);
      } else {
        expect(pending.has(entry.name)).toBe(true);
      }
    }
  });
});
