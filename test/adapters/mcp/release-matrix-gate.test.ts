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

    // #405 / #510 / form-ui-factory: these counts are the invariant for MCP tool registration.
    // Any edit that moves one of these numbers MUST justify the change in that PR.
    // Slice 3 (#616) added dysflow_form_serialize + dysflow_form_deserialize.
    // Slice 5 (#618) added dysflow_create_form_from_template.
    // PR-1 (#656) added dysflow_get_capabilities (read-only introspection).
    // #701 added dysflow_list_procedures + dysflow_get_procedure.
    // #705 added dysflow_detect_dead_code (read-only dead-code analysis).
    // #703 added dysflow_validate_manifest (read-only VBA test manifest validation).
    // #704 added dysflow_lint_module (read-only VBA module pre-import linting).
    // Expected breakdown: 54 dispatch names (DYSFLOW_MCP_TOOL_NAMES, including
    //   inspect_form/compare_form/lint_form_code, the three form mutation tools, the
    //   new serialize/deserialize pair, and dysflow_create_form_from_template)
    //   - 0 hidden stubs (zero-hidden-tools policy)
    //   + 14 modern core tools = 68 visible.
    expect(toolCount).toBe(54);
    expect(stubCount).toBe(0);
    expect(modernCount).toBe(14);
    expect(visibleCount).toBe(68);
  });

  it("verifies split-mode coverage explicitly", () => {
    // Read/Write split mode checks
    const queryExecute = tools.find((t) => t.name === "dysflow_query_execute");
    expect(queryExecute).toBeDefined();
    expect(queryExecute?.inputSchema?.properties?.mode?.enum).toEqual(["read", "write"]);
    expect(queryExecute?.inputSchema?.properties).toHaveProperty("backendPath");
    expect(queryExecute?.inputSchema?.properties).toHaveProperty("databasePath");
    expect(queryExecute?.inputSchema?.properties).toHaveProperty("sourcePath");
    expect(queryExecute?.inputSchema?.properties).toHaveProperty("dryRun");
    expect(queryExecute?.inputSchema?.properties).toHaveProperty("apply");

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
