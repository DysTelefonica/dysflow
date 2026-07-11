/**
 * Issue #779 (v2.1.0) — `MCP_TOOL_ROUTES` carries an additive `risk` field
 * per dispatch route. The risk classification is the input to the
 * write-execution-policy resolver that decides `effectiveDryRunDefault`
 * for each tool under each policy mode.
 *
 * Scope of this test:
 *   - `MCP_TOOL_ROUTES` covers the generated dispatch routes
 *     (`GeneratedDispatchToolName`). Modern / alias tools that are NOT
 *     generated routes (e.g. `list_procedures`, `get_procedure`,
 *     `find_references`, `detect_dead_code`, `validate_manifest`,
 *     `lint_module`) are classified separately in
 *     `MCP_TOOL_RISKS` (the unified risk registry), which is asserted in
 *     `mcp-tool-risks.test.ts`.
 *
 * Additive contract (preserved from v2.0.x):
 *   - `kind`, `mutatesBinary`, `mutatesFilesystem`, `queryMode` semantics
 *     are unchanged. `risk` is a parallel field.
 *   - No `mutatesBinary` / `mutatesFilesystem` value may flip to satisfy
 *     a risk assignment. The write-gate invariant is preserved.
 */

import { describe, expect, it } from "vitest";
import {
  type GeneratedDispatchToolName,
  MCP_TOOL_ROUTES,
} from "../../../src/adapters/mcp/dispatch-routes.js";
import type { ToolRisk } from "../../../src/core/runtime/write-execution-policy.js";

/**
 * Per-route risk blueprint. Only covers tools in `MCP_TOOL_ROUTES`.
 * The keys here MUST match `GeneratedDispatchToolName` exactly.
 */
const EXPECTED_ROUTE_RISK: Readonly<Partial<Record<GeneratedDispatchToolName, ToolRisk>>> = {
  // VBA sync — destructive family (3)
  export_modules: "destructive-write",
  export_all: "destructive-write",
  delete_module: "destructive-write",
  form_deserialize: "destructive-write",
  // Issue #813 phase 6 — atomic exposure of form_delete_control joins
  // the destructive family (irreversible content removal, mirroring
  // form_deserialize).
  form_delete_control: "destructive-write",
  // VBA sync — protected family (1)
  fix_encoding: "protected-write",
  // VBA sync — arbitrary family (1)
  vba_inline_execution: "arbitrary-write",
  // VBA sync — routine dev writes (8)
  import_modules: "routine-dev-write",
  import_all: "routine-dev-write",
  test_vba: "routine-dev-write",
  generate_form: "routine-dev-write",
  create_form_from_template: "routine-dev-write",
  form_add_control: "routine-dev-write",
  form_move_control: "routine-dev-write",
  form_rename_control: "routine-dev-write",
  // Issue #813 phase 6 — apply_form_design_plan + form_set_property
  // are routine-dev-write (mirrors the slice-4 form mutation family).
  apply_form_design_plan: "routine-dev-write",
  form_set_property: "routine-dev-write",
  catalog_add_control: "routine-dev-write",
  generate_erd: "routine-dev-write",
  // VBA sync — read-only (everything else, see auto-assert below)
};

/**
 * These routes are the read-only family by construction: they do not
 * mutate the binary AND do not mutate the filesystem AND risk is
 * `read-only`. Sanity-asserted as a closed set.
 */
const READ_ONLY_ROUTES: ReadonlySet<GeneratedDispatchToolName> = new Set<GeneratedDispatchToolName>(
  [
    // vba-sync read-only
    "list_objects",
    "list_vba_modules",
    "exists",
    "verify_code",
    "validate_form_spec",
    "harvest_form_catalog",
    "inspect_form",
    "compare_form",
    "lint_form_code",
    "form_serialize",
    "copy_form_ui_pattern",
    "analyze_form_ui",
    "map_form_behavior",
    "generate_form_design_plan",
    "verify_form_ui",
    // Issue #814 — Phase 2 Perception. Read-only, offline, pure.
    "render_form_preview",
    // Issue #815 — Phase 2 Perception. Read-only geometry lint, pure.
    "analyze_form_layout",
    // Issue #817 — Phase 2 Perception cont. Read-only diff composer.
    "diff_form_preview",
    // Issue #818 — Phase 2 Perception cont. Read-only schema-binding
    // validator (ControlSource + RowSource against caller-supplied schema).
    "verify_form_bindings",
    "vba_orphan_audit",
    // query-maintenance read-only
    "list_links",
    "export_queries",
    // query-read (all 8)
    "list_tables",
    "list_linked_tables",
    "get_schema",
    "count_rows",
    "distinct_values",
    "compare_backends",
    "list_access_files",
    "get_relationships",
  ],
);

describe("MCP_TOOL_ROUTES — risk classification (#779)", () => {
  it("every GeneratedDispatchToolName has a risk field", () => {
    for (const [name, route] of Object.entries(MCP_TOOL_ROUTES) as Array<
      [GeneratedDispatchToolName, (typeof MCP_TOOL_ROUTES)[GeneratedDispatchToolName]]
    >) {
      // `risk` is additive metadata. It must exist on every route.
      expect(
        (route as { risk?: unknown }).risk,
        `route "${name}" must declare a risk field`,
      ).toBeDefined();
    }
  });

  it("risk is one of the closed union values", () => {
    const valid: readonly string[] = [
      "read-only",
      "routine-dev-write",
      "protected-write",
      "destructive-write",
      "arbitrary-write",
      "process-control",
    ];
    for (const [name, route] of Object.entries(MCP_TOOL_ROUTES) as Array<
      [GeneratedDispatchToolName, (typeof MCP_TOOL_ROUTES)[GeneratedDispatchToolName]]
    >) {
      const risk = (route as { risk?: string }).risk;
      expect(valid, `route "${name}" risk="${risk}" must be in the closed union`).toContain(risk);
    }
  });

  it("per-route blueprint matches expected risk for explicit entries", () => {
    for (const [name, expectedRisk] of Object.entries(EXPECTED_ROUTE_RISK) as Array<
      [GeneratedDispatchToolName, ToolRisk]
    >) {
      const route = MCP_TOOL_ROUTES[name];
      expect(route, `route "${name}" must exist in MCP_TOOL_ROUTES`).toBeDefined();
      expect((route as { risk?: unknown }).risk, `route "${name}" risk classification`).toBe(
        expectedRisk,
      );
    }
  });

  it("the read-only family is closed (no mutations, no risk field flips)", () => {
    for (const name of READ_ONLY_ROUTES) {
      const route = MCP_TOOL_ROUTES[name];
      expect(route, `route "${name}" must exist in MCP_TOOL_ROUTES`).toBeDefined();
      // Per-kind assertion: vba-sync must have mutatesBinary:false + mutatesFilesystem:false;
      // query-maintenance must have queryMode:"read"; query-read carries no mutation flag
      // (the route kind is the only discriminator).
      if ((route as { kind: string }).kind === "vba-sync") {
        expect(
          (route as { mutatesBinary: boolean }).mutatesBinary,
          `vba-sync route "${name}" mutatesBinary must be false`,
        ).toBe(false);
        expect(
          (route as { mutatesFilesystem: boolean }).mutatesFilesystem,
          `vba-sync route "${name}" mutatesFilesystem must be false`,
        ).toBe(false);
      } else if ((route as { kind: string }).kind === "query-maintenance") {
        expect(
          (route as { queryMode: string }).queryMode,
          `query-maintenance route "${name}" queryMode must be "read"`,
        ).toBe("read");
      } else {
        // query-read — only the kind tag proves it's read-only.
        expect(
          (route as { kind: string }).kind,
          `query-read route "${name}" must be kind=query-read`,
        ).toBe("query-read");
      }
      expect((route as { risk?: unknown }).risk, `route "${name}" risk classification`).toBe(
        "read-only",
      );
    }
  });

  it("the read-only family is exhaustive (every other route is NOT read-only)", () => {
    for (const [name, route] of Object.entries(MCP_TOOL_ROUTES) as Array<
      [GeneratedDispatchToolName, (typeof MCP_TOOL_ROUTES)[GeneratedDispatchToolName]]
    >) {
      const risk = (route as { risk?: string }).risk;
      if (risk === "read-only") {
        expect(
          READ_ONLY_ROUTES,
          `route "${name}" is risk="read-only" but not in READ_ONLY_ROUTES`,
        ).toContain(name);
      } else {
        expect(
          READ_ONLY_ROUTES.has(name),
          `route "${name}" should be in READ_ONLY_ROUTES (it's risk="${risk}", non-read-only)`,
        ).toBe(false);
      }
    }
  });

  it("destructive family = exports + delete + form_deserialize + form_delete_control", () => {
    // Issue #813 phase 6 — form_delete_control joins the destructive
    // family (irreversible content removal). Same pattern as
    // form_deserialize.
    const destructive = (
      Object.entries(MCP_TOOL_ROUTES) as Array<
        [GeneratedDispatchToolName, (typeof MCP_TOOL_ROUTES)[GeneratedDispatchToolName]]
      >
    )
      .filter(([, r]) => (r as { risk?: string }).risk === "destructive-write")
      .map(([n]) => n)
      .sort();
    expect(destructive).toEqual([
      "delete_module",
      "export_all",
      "export_modules",
      "form_delete_control",
      "form_deserialize",
    ]);
  });

  it("protected family = fix_encoding + compact_repair + relink_directory", () => {
    const protectedRoutes = (
      Object.entries(MCP_TOOL_ROUTES) as Array<
        [GeneratedDispatchToolName, (typeof MCP_TOOL_ROUTES)[GeneratedDispatchToolName]]
      >
    )
      .filter(([, r]) => (r as { risk?: string }).risk === "protected-write")
      .map(([n]) => n)
      .sort();
    expect(protectedRoutes).toEqual(["compact_repair", "fix_encoding", "relink_directory"]);
  });

  it("arbitrary family = vba_inline_execution (no other generated route is arbitrary)", () => {
    const arbitrary = (
      Object.entries(MCP_TOOL_ROUTES) as Array<
        [GeneratedDispatchToolName, (typeof MCP_TOOL_ROUTES)[GeneratedDispatchToolName]]
      >
    )
      .filter(([, r]) => (r as { risk?: string }).risk === "arbitrary-write")
      .map(([n]) => n)
      .sort();
    expect(arbitrary).toEqual(["vba_inline_execution"]);
  });

  it("process-control lives behind aliases, NEVER in generated routes", () => {
    const processControl = (
      Object.entries(MCP_TOOL_ROUTES) as Array<
        [GeneratedDispatchToolName, (typeof MCP_TOOL_ROUTES)[GeneratedDispatchToolName]]
      >
    )
      .filter(([, r]) => (r as { risk?: string }).risk === "process-control")
      .map(([n]) => n);
    expect(processControl).toEqual([]);
  });
});
