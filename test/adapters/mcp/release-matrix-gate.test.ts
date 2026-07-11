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

  const tools = createDysflowMcpTools({
    services: services,
    writes: true,
  });

  it("documents and validates exact tool counts", () => {
    const toolCount = DYSFLOW_MCP_TOOL_NAMES.length;
    const stubCount = pendingToolNames().size;
    const modernCount = tools.filter(
      (t) => !DYSFLOW_MCP_TOOL_NAMES.includes(t.name as DysflowMcpToolName),
    ).length;
    const visibleCount = tools.filter((t) => !t.hidden).length;

    // #405 / #510 / form-ui-factory: these counts are the invariant for MCP tool registration.
    // Any edit that moves one of these numbers MUST justify the change in that PR.
    // Slice 3 (#616) added form_serialize + form_deserialize.
    // Slice 5 (#618) added create_form_from_template.
    // PR-1 (#656) added get_capabilities (read-only introspection).
    // #701 added list_procedures + get_procedure.
    // #705 added detect_dead_code (read-only dead-code analysis).
    // #703 added validate_manifest (read-only VBA test manifest validation).
    // #704 added lint_module (read-only VBA module pre-import linting).
    // feat-759-no-compile (v1.19.0) — compile_vba was removed.
    // #777 Opción A (2026-07-07) renamed 7 `dysflow_*` names to canonical in #58405eb2.
    // #777 Opción A cont. (this PR) continues the rename for 11 bespoke
    //   tools in `tools.ts`. Three of them (run_vba, list_access_operations,
    //   cleanup_access_operation) were previously registered as BOTH a
    //   bespoke tool AND an alias — the bespoke registration is REMOVED
    //   and the alias is the sole source. The other 8 are bespoke-to-bespoke
    //   renames. Visible count drops by 3 (one per alias-removed).
    // #807 (Feature 1) — `list_vba_modules` added as a read-only vba-sync tool.
    //   Net: dispatch 59 -> 60, visible 70 -> 71.
    // #813 phase 6 — `form_set_property` + `form_delete_control` added
    //   (atomic exposure of the apply_form_design_plan family).
    //   Net: dispatch 60 -> 62, visible 71 -> 73. No modern tools added.
    // #814 (Phase 2 Perception) — `render_form_preview` added (read-only
    //   geometric SVG/ASCII render). Net: dispatch 62 -> 63, visible
    //   73 -> 74.
    // #815 (Phase 2 Perception) — `analyze_form_layout` added (read-only
    //   geometry lint, sibling of render_form_preview). Net: dispatch
    //   63 -> 64, visible 74 -> 75. No modern tools added.
    // #816 (Phase 3 Ergonomic actions) — `form_align_controls` +
    //   `form_distribute_controls` added (batch geometry ergonomics;
    //   same applyGuardedFormWrite seam as the Phase 6 form mutation
    //   family). Net: dispatch 64 -> 66, visible 75 -> 77.
    //   Expected breakdown:
    //     66 dispatch names (DYSFLOW_MCP_TOOL_NAMES)
    //     - 0 hidden stubs (zero-hidden-tools policy)
    //     + 11 modern core tools (was 14, lost 3 aliases)
    //     = 77 visible (was 64 before #795).
    expect(toolCount).toBe(66);
    expect(stubCount).toBe(0);
    expect(modernCount).toBe(11);
    expect(visibleCount).toBe(77);
  });

  it("verifies split-mode coverage explicitly", () => {
    // Read/Write split mode checks
    const queryExecute = tools.find((t) => t.name === "query_execute");
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
