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
    // #817 (Phase 2 Perception cont.) — `diff_form_preview` added
    //   (before/after visual diff composer, pure read-class sibling of
    //   render_form_preview + analyze_form_layout). Net: dispatch 66 -> 67,
    //   visible 77 -> 78. No modern tools added.
    // #818 (Phase 2 Perception cont.) — `verify_form_bindings` added
    //   (ControlSource + RowSource schema-binding validator, pure read-class
    //   sibling of analyze_form_layout + diff_form_preview). Net:
    //   dispatch 67 -> 68, visible 78 -> 79. No modern tools added.
    // #809 (sync_binary workflow tool) — `sync_binary` added (composes
    // verify_code + import_modules + export_modules; mutatesBinary +
    // mutatesFilesystem both true). Net: dispatch 68 -> 69,
    // visible 79 -> 80. No modern tools added.
    // #872 — `form_set_properties` + `form_duplicate_control` (write-gated
    // atomic batch property updates + control duplication, same
    // applyGuardedFormWrite seam as the rest of the form mutation family)
    // + `form_get_geometry` + `form_list_controls` (pure read-class
    // geometry + inventory helpers). Net: dispatch 69 -> 73,
    // visible 80 -> 84. No modern tools added.
    // #976 — `clean_stale_markers` (Round-12 user-callable companion to
    // the #967 auto-cleanup; dry-run default true, apply requires
    // `confirm: true`, write-gated through MCP_WRITES_DISABLED when writes
    // are off). Net: dispatch unchanged (it bypasses MCP_TOOL_ROUTES and
    // is registered directly in tools.ts), modern 11 -> 12, visible
    // 84 -> 85.
    // #971 adds `schema` (pure read-class runtime contract discovery):
    // modern 12 -> 13, visible 85 -> 86.
    // #978 adds `state` (Round-12 read-only runtime operational state):
    // modern 13 -> 14, visible 86 -> 87.
    // #973 adds `logs` (read-only AI-aware log access over
    // .dysflow/runtime/). Net: dispatch unchanged (read-only tool,
    // bypasses MCP_TOOL_ROUTES), modern 14 -> 15, visible 87 -> 88.
    //   Expected breakdown:
    //     73 dispatch names (DYSFLOW_MCP_TOOL_NAMES)
    //     - 0 hidden stubs (zero-hidden-tools policy)
    // + 15 modern core tools (was 14, lost 3 aliases; +1 for #971 schema,
    // +1 for #965 diagnose, +1 for #976 clean_stale_markers, +1 for #978 state,
    // +1 for #973 logs)
    //     = 88 visible (was 64 before #795).
    expect(toolCount).toBe(73);
    expect(stubCount).toBe(0);
    expect(modernCount).toBe(15);
    expect(visibleCount).toBe(88);
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
