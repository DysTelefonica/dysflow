/**
 * `dispatch-factory.test.ts` — created in #hexagonal-tech-debt PR 2.
 *
 * Pins the post-refactor contract for the dispatch factory:
 *
 *   1. The `McpToolRoute` union declared in `dispatch-routes.ts` no longer
 *      carries a `query-write-fixture` kind — that route was dead code (no
 *      live `MCP_TOOL_ROUTES` entry ever referenced it).
 *   2. The dispatcher's `switch (route.kind)` exhaustiveness check is
 *      tightened accordingly: a value with `kind: "query-write-fixture"`
 *      must be unassignable to the union (compile-time guarantee, surfaced
 *      via the type label here).
 *   3. Every existing tool still resolves to a documented handler — no
 *      regression in `MCP_TOOL_ROUTES` coverage.
 *
 * Before #hexagonal-tech-debt PR 2 this file did not exist (verified by
 * glob). The PR creates it as a regression guard for the dead-code removal.
 */

import { describe, expect, it } from "vitest";
import { MCP_TOOL_ROUTES, type McpToolRoute } from "../../../src/adapters/mcp/dispatch-routes.js";

// ---------------------------------------------------------------------------
// 1. Route table — no `query-write-fixture` left behind
// ---------------------------------------------------------------------------

describe("MCP_TOOL_ROUTES (#E query-write-fixture removal)", () => {
  it("contains NO route with kind === 'query-write-fixture' (runtime defensive check)", () => {
    // Cast through `unknown` so this runtime check is genuinely hunting for a
    // stray `query-write-fixture` value rather than being short-circuited by
    // the type system (which already excludes the kind at compile time).
    const deadRoutes = Object.entries(MCP_TOOL_ROUTES).filter(
      ([, route]) => (route as unknown as { kind: string }).kind === "query-write-fixture",
    );
    expect(deadRoutes).toEqual([]);
  });

  it("every route's kind is one of the documented live kinds", () => {
    const allowedKinds = new Set<McpToolRoute["kind"]>([
      "vba-sync",
      "query-read",
      "query-maintenance",
    ]);
    for (const [tool, route] of Object.entries(MCP_TOOL_ROUTES)) {
      expect(allowedKinds.has(route.kind), `${tool} must use a live kind, got ${route.kind}`).toBe(
        true,
      );
    }
  });

  it("the documented kinds are exactly the union members (regression pin)", () => {
    const observedKinds = new Set<McpToolRoute["kind"]>(
      Object.values(MCP_TOOL_ROUTES).map((route) => route.kind),
    );
    expect(observedKinds).toEqual(new Set(["vba-sync", "query-read", "query-maintenance"]));
  });
});

// ---------------------------------------------------------------------------
// 2. Dispatch switch — exhaustiveness narrows without a query-write-fixture arm
// ---------------------------------------------------------------------------

describe("McpToolRoute exhaustiveness (#E)", () => {
  // If `query-write-fixture` leaked back into the union, this `switch` would
  // fail to compile (or, with `never`-based narrowing, would fire a type
  // error). The test below performs the same narrowing a real dispatcher
  // does — every branch returns a stable label so we can drive each route
  // kind through it and confirm the typing is closed.
  function label(route: McpToolRoute): string {
    switch (route.kind) {
      case "vba-sync":
        return "vba-sync";
      case "query-read":
        return "query-read";
      case "query-maintenance":
        return "query-maintenance";
    }
  }

  it("discriminates a vba-sync tool (compile-time narrowing check)", () => {
    // feat-759-no-compile (v1.19.0) — compile_vba was removed; pick another
    // stable vba-sync tool for the narrowing-check fixture.
    const route = MCP_TOOL_ROUTES.test_vba;
    expect(route.kind).toBe("vba-sync");
    expect(label(route)).toBe("vba-sync");
  });

  it("discriminates a query-read tool (compile-time narrowing check)", () => {
    const route = MCP_TOOL_ROUTES.list_tables;
    expect(route.kind).toBe("query-read");
    expect(label(route)).toBe("query-read");
  });

  it("discriminates a query-maintenance tool (compile-time narrowing check)", () => {
    const route = MCP_TOOL_ROUTES.compact_repair;
    expect(route.kind).toBe("query-maintenance");
    expect(label(route)).toBe("query-maintenance");
  });

  it("McpToolRoute union does NOT include 'query-write-fixture' (type-level)", () => {
    // Type-level pin: the union closed against `query-write-fixture` would
    // yield `false` here, and assigning `false` to a `true` type fails to
    // compile. Before #hexagonal-tech-debt PR 2 the dead member was still
    // in the union, so this test was genuinely RED. It is GREEN once the
    // member is removed (PR 2 source change).
    type AssertMissingKind<T extends { kind: string }, K extends string> = [K] extends [T["kind"]]
      ? false
      : true;
    const check: AssertMissingKind<McpToolRoute, "query-write-fixture"> = true;
    expect(check).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Coverage — every tool routed to a known kind
// ---------------------------------------------------------------------------

describe("MCP_TOOL_ROUTES coverage (regression pin)", () => {
  it("routes every required vba-sync tool correctly (mutatesBinary / mutatesFilesystem)", () => {
    const binaryWriters = Object.entries(MCP_TOOL_ROUTES)
      .filter(([, route]) => route.kind === "vba-sync" && route.mutatesBinary)
      .map(([tool]) => tool)
      .sort();
    // Mirrors dispatch-write-gate.test.ts so a future route-table drift
    // surfaces both here and in the live integration test.
    // #665 — fix_encoding was previously misdeclared mutatesBinary:false but
    // the PowerShell Fix-Encoding action rewrites modules inside the .accdb.
    expect(binaryWriters).toEqual(
      [
        // feat-759-no-compile (v1.19.0) — compile_vba was removed; it is
        // no longer a binary-writer. The remaining set is the union of
        // mutation tools that still write to the .accdb.
        // Issue #813 phase 6 — apply_form_design_plan + form_set_property +
        // form_delete_control join the binary-mutating family.
        // Issue #816 phase 3 — form_align_controls + form_distribute_controls
        // join the same family (same applyGuardedFormWrite seam).
        // Issue #809 — sync_binary joins the binary-mutating family
        // (apply:true with direction:'src-to-binary' -> import_modules writes
        // the .accdb).
        "delete_module",
        "fix_encoding",
        "import_all",
        "import_modules",
        "apply_form_design_plan",
        "create_form_from_template",
        "form_add_control",
        "form_align_controls",
        "form_delete_control",
        "form_deserialize",
        "form_distribute_controls",
        "form_move_control",
        "form_rename_control",
        "form_set_property",
        "sync_binary",
        "vba_inline_execution",
      ].sort(),
    );
  });

  it("routes every read-only query tool to `query-read` (no `query-write-fixture` leak)", () => {
    const queryReadRoutes = Object.entries(MCP_TOOL_ROUTES)
      .filter(([, route]) => route.kind === "query-read")
      .map(([tool]) => tool)
      .sort();
    expect(queryReadRoutes).toEqual(
      [
        "list_tables",
        "list_linked_tables",
        "get_schema",
        "count_rows",
        "distinct_values",
        "compare_backends",
        "list_access_files",
        "get_relationships",
      ].sort(),
    );
  });

  it("routes every query-maintenance tool with the documented queryMode", () => {
    const maintenanceReads = Object.entries(MCP_TOOL_ROUTES)
      .filter(([, route]) => route.kind === "query-maintenance" && route.queryMode === "read")
      .map(([tool]) => tool)
      .sort();
    const maintenanceWrites = Object.entries(MCP_TOOL_ROUTES)
      .filter(([, route]) => route.kind === "query-maintenance" && route.queryMode === "write")
      .map(([tool]) => tool)
      .sort();
    expect(maintenanceReads).toEqual(["export_queries", "list_links"].sort());
    expect(maintenanceWrites).toEqual(
      [
        "compact_repair",
        "import_queries",
        "link_tables",
        "localize_backend_links",
        "relink_directory",
        "relink_tables",
        "unlink_table",
      ].sort(),
    );
  });
});
