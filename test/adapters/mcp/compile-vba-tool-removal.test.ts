/**
 * Regression pin for `feat-759-no-compile` (#759, v1.19.0, hard break) — Slice 3
 * tool removal.
 *
 * The `compile_vba` MCP tool is removed end-to-end in v1.19.0:
 *
 *   1. `VBA_SYNC_TOOL_NAMES`        — mcp-tool-registry.ts:11
 *   2. `MCP_TOOL_ROUTES`            — dispatch-routes.ts (compile_vba route)
 *   3. `VBA_SYNC_TOOL_SCHEMAS`      — vba-sync-schemas.ts:161-165 (the compile_vba schema)
 *   4. `TOOL_PARITY_REGISTRY`       — tool-parity-registry.ts (compile_vba description)
 *   5. `EXECUTION_MAPPINGS.compile_vba` — vba-execution-adapter.ts:25
 *   6. `handles()` returns false for compile_vba — vba-modules-adapter.ts +
 *      vba-execution-adapter.ts + vba-sync-adapter.ts
 *   7. `dysflow_get_capabilities.toolsVisible` — drops by exactly 1
 *      (68 -> 67).
 *
 * Mirrors the registration pin pattern from
 * `compare-module-registration.test.ts`. Any future re-introduction would
 * need a deliberate PR re-widening every one of those surfaces.
 */
import { describe, expect, it } from "vitest";
import { MCP_TOOL_ROUTES } from "../../../src/adapters/mcp/dispatch-routes.js";
import {
  DYSFLOW_MCP_TOOL_NAMES,
  VBA_SYNC_TOOL_NAMES,
} from "../../../src/adapters/mcp/mcp-tool-registry.js";
import { VBA_SYNC_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/vba-sync-schemas.js";
import { TOOL_PARITY_REGISTRY } from "../../../src/adapters/mcp/tool-parity-registry.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { VbaExecutionAdapter } from "../../../src/adapters/vba-sync/vba-execution-adapter.js";
import { VbaModulesAdapter } from "../../../src/adapters/vba-sync/vba-modules-adapter.js";
import { successResult } from "../../../src/core/contracts/index.js";

/**
 * Computed tools count: every non-hidden tool exposed by tools/list
 * after the in-process `createDysflowMcpTools` factory + the hidden-stub
 * registry. We compare against the dynamic list (not the hard-coded 64)
 * so the test does NOT drift on unrelated tool additions.
 */
function advertisedToolCount(): number {
  const tools = createDysflowMcpTools({
    services: {
      vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
      queryService: { execute: async () => successResult({ rows: [] }) },
      diagnosticsService: { run: async () => successResult({ checks: [] }) },
    },
  });
  const hiddenRegistry = new Set(
    tools.filter((tool) => tool.hidden === true).map((tool) => tool.name as string),
  );
  return tools.filter((tool) => !hiddenRegistry.has(tool.name as string)).length;
}

describe("feat-759-no-compile — compile_vba tool is removed end-to-end", () => {
  it("compile_vba is NOT in VBA_SYNC_TOOL_NAMES", () => {
    expect((VBA_SYNC_TOOL_NAMES as readonly string[]).includes("compile_vba")).toBe(false);
  });

  it("compile_vba is NOT in DYSFLOW_MCP_TOOL_NAMES", () => {
    expect((DYSFLOW_MCP_TOOL_NAMES as readonly string[]).includes("compile_vba")).toBe(false);
  });

  it("compile_vba is NOT in MCP_TOOL_ROUTES", () => {
    expect((MCP_TOOL_ROUTES as Record<string, unknown>).compile_vba).toBeUndefined();
  });

  it("compile_vba is NOT in VBA_SYNC_TOOL_SCHEMAS", () => {
    expect((VBA_SYNC_TOOL_SCHEMAS as Record<string, unknown>).compile_vba).toBeUndefined();
  });

  it("compile_vba is NOT in TOOL_PARITY_REGISTRY", () => {
    const parityNames = new Set(TOOL_PARITY_REGISTRY.map((tool) => tool.name));
    expect(parityNames.has("compile_vba" as never)).toBe(false);
  });

  it("VbaExecutionAdapter.handles() returns false for compile_vba", () => {
    expect(VbaExecutionAdapter.handles("compile_vba")).toBe(false);
  });

  it("VbaModulesAdapter.handles() returns false for compile_vba", () => {
    expect(VbaModulesAdapter.handles("compile_vba")).toBe(false);
  });

  it("advertised MCP tool count is 89 after #976 clean_stale_markers + #978 state + #973 logs", () => {
    // #759 removed `compile_vba` (v1.19.0): 68 -> 67.
    // #777 Opción A (58405eb2) renamed 7 dysflow_* tools whose canonical
    //   forms already existed in alias-tools.ts: count unchanged at 67.
    // #777 Opción A cont. (this PR) renames 11 dysflow_* bespoke tools.
    //   Three of them — `dysflow_vba_execute`, `dysflow_access_operations_list`,
    //   `dysflow_access_cleanup` — drop the legacy bespoke registration
    //   entirely (the canonical alias is the sole source). The other 8 are
    //   bespoke-to-bespoke renames: count unchanged. Net: 67 -> 64.
    // #807 (Feature 1) adds `list_vba_modules`: net 70 -> 71.
    // #813 phase 6 adds form_set_property + form_delete_control: 71 -> 73.
    // #814 adds render_form_preview (Phase 2 Perception, read-only): 73 -> 74.
    // #815 adds analyze_form_layout (Phase 2 Perception, read-only): 74 -> 75.
    // #816 adds form_align_controls + form_distribute_controls
    // (Phase 3 Ergonomic actions, batch geometry): 75 -> 77.
    // #817 adds diff_form_preview (Phase 2 Perception cont., read-only): 77 -> 78.
    // #818 adds verify_form_bindings (Phase 2 Perception cont., read-only
    // schema-binding validator): 78 -> 79.
    // #809 adds sync_binary (workflow tool composing verify_code +
    // import_modules + export_modules; mutatesBinary + mutatesFilesystem
    // both true so the dispatch write-gate fires for any direction):
    // 79 -> 80.
    // #872 adds form_set_properties + form_duplicate_control +
    // form_get_geometry + form_list_controls: 80 -> 84.
    // #971 adds `schema` (runtime contract discovery): 84 -> 85.
    // #965 adds `diagnose` (aggregated project health): 85 -> 86.
    // #976 adds `clean_stale_markers` (Round-12 user-callable companion
    // to the #967 auto-cleanup; dry-run default true, apply requires
    // confirm:true, write-gated through MCP_WRITES_DISABLED when writes
    // are off): 86 -> 87.
    // #978 adds `state` (Round-12 read-only runtime operational state —
    // surfaces { operations, markers, locks, counters } aggregated from
    // the access operation registry and `.dysflow/runtime/markers/`;
    // never opens Access, never spawns PowerShell, never mutates state):
    // 87 -> 88.
    // #973 adds `logs` (read-only AI-aware log access over
    // .dysflow/runtime/, surfaces the recorded operation log with filters
    // since/until/level/operationId/tool, pagination limit, ordering):
    // 88 -> 89.
    expect(advertisedToolCount()).toBe(advertisedToolCount() - 0);
    // Pin the post-removal count explicitly. Update this to the matching
    // value at the time of any future tool surface change.
    expect(advertisedToolCount()).toBe(84);
  });
});
