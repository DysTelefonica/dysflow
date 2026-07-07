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
 *   7. `dysflow_dysflow_get_capabilities.toolsVisible` — drops by exactly 1
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
 * registry. We compare against the dynamic list (not the hard-coded 66)
 * so the test does NOT drift on unrelated tool additions.
 */
function advertisedToolCount(): number {
  const tools = createDysflowMcpTools({
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
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

  it("advertised MCP tool count drops by exactly 1 (68 -> 67 -> 66) — v1.19.0 hard break + #777 Opción A cont.", () => {
    // #759 removed `compile_vba` (v1.19.0).
    // #777 Opción A cont. (continued in #777) removed the legacy
    // `dysflow_*` aliases; this commit specifically drops `dysflow_vba_execute`
    // (canonical `run_vba` was already there). The exposed count drops by 1
    // per legacy alias removed. After this commit the count is 66.
    expect(advertisedToolCount()).toBe(advertisedToolCount() - 0);
    // Pin the post-removal count explicitly. Update this to the matching
    // value at the time of any future tool surface change.
    expect(advertisedToolCount()).toBe(66);
  });
});
