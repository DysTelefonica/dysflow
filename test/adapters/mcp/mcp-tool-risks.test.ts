/**
 * Issue #779 (v2.1.0) — unified risk registry and effective-dry-run-default
 * computation for every contract tool (generated routes + modern + alias).
 *
 * Contract:
 *   - `MCP_TOOL_RISKS` is the single source of truth for risk across the
 *     64 tools in `MCP_TOOL_CONTRACTS`. Generated routes source from
 *     `MCP_TOOL_ROUTES[name].risk`; modern + alias tools declare explicit
 *     risk entries.
 *   - `effectiveDryRunDefaultForTool(name, mode)` computes the effective
 *     default per the policy:
 *       safe-by-default  -> always true
 *       developer        -> false ONLY for routine-dev-write tools
 *
 * This file is the source of truth that the dispatch layer and the
 * capabilities snapshot consult. There must NOT be any other place in the
 * codebase that hardcodes the per-tool default.
 */

import { describe, expect, it } from "vitest";
import { MCP_TOOL_CONTRACTS } from "../../../src/adapters/mcp/mcp-tool-contracts.js";
import type { DysflowMcpToolName } from "../../../src/adapters/mcp/mcp-tool-registry.js";
import {
  effectiveDryRunDefaultForTool,
  MCP_TOOL_RISKS,
  resolveRiskForTool,
} from "../../../src/adapters/mcp/mcp-tool-risks.js";
import { WRITE_EXECUTION_POLICIES } from "../../../src/core/runtime/write-execution-policy.js";

describe("MCP_TOOL_RISKS — unified risk registry (#779)", () => {
  it("every contract tool has a risk entry", () => {
    const expected = new Set<string>([...Object.keys(MCP_TOOL_CONTRACTS)]);
    expect(MCP_TOOL_RISKS).toBeDefined();
    expect(Object.keys(MCP_TOOL_RISKS).sort()).toEqual([...expected].sort());
  });

  it("every risk entry is from the closed union", () => {
    const valid = new Set<string>([
      "read-only",
      "routine-dev-write",
      "protected-write",
      "destructive-write",
      "arbitrary-write",
      "process-control",
    ]);
    for (const [name, risk] of Object.entries(MCP_TOOL_RISKS)) {
      expect(valid, `tool "${name}" risk="${risk}"`).toContain(risk);
    }
  });

  it("the read-only family matches the MCP_TOOL_CONTRACTS read-only list", () => {
    const readOnlyFromRegistry = (Object.entries(MCP_TOOL_RISKS) as Array<[string, string]>)
      .filter(([, r]) => r === "read-only")
      .map(([n]) => n)
      .sort();
    const readOnlyFromContracts = (
      Object.entries(MCP_TOOL_CONTRACTS) as Array<[string, { access: string }]>
    )
      .filter(([, c]) => c.access === "read-only")
      .map(([n]) => n)
      .sort();
    expect(readOnlyFromRegistry).toEqual(readOnlyFromContracts);
  });

  it("the process-control family = cleanup_access_operation + access_force_cleanup_orphaned", () => {
    const processControl = (Object.entries(MCP_TOOL_RISKS) as Array<[string, string]>)
      .filter(([, r]) => r === "process-control")
      .map(([n]) => n)
      .sort();
    // Both alias tools are process-control. Per-call gating (force / confirmPid)
    // distinguishes the read-only vs. write sides; the risk at the tool level
    // is process-control for both.
    expect(processControl).toEqual(["access_force_cleanup_orphaned", "cleanup_access_operation"]);
  });
});

describe("resolveRiskForTool (#779)", () => {
  it("returns the registered risk for every contract tool", () => {
    for (const name of Object.keys(MCP_TOOL_CONTRACTS)) {
      const risk = resolveRiskForTool(name as DysflowMcpToolName);
      expect(risk, `tool "${name}" must resolve a risk`).toBeDefined();
      expect(MCP_TOOL_RISKS[name]).toBe(risk);
    }
  });

  it("returns undefined for tools that are not in the registry", () => {
    // Cast to bypass the type system: we want to know what happens with
    // an unknown tool name. The resolver must NOT throw.
    const risk = resolveRiskForTool("totally-unknown-tool-name" as unknown as DysflowMcpToolName);
    expect(risk).toBeUndefined();
  });
});

describe("effectiveDryRunDefaultForTool — truth table (#779)", () => {
  // Per-tool expected effective defaults per mode. This table is the v2.1.0
  // contract. Any change here must update both the implementation and the
  // CHANGELOG entry.
  const EXPECTED: Readonly<Record<string, Readonly<Record<string, boolean>>>> = {
    // routine-dev-write flips in developer mode
    import_modules: { "safe-by-default": true, developer: false },
    import_all: { "safe-by-default": true, developer: false },
    test_vba: { "safe-by-default": true, developer: false },
    import_queries: { "safe-by-default": true, developer: false },
    link_tables: { "safe-by-default": true, developer: false },
    relink_tables: { "safe-by-default": true, developer: false },
    localize_backend_links: { "safe-by-default": true, developer: false },
    unlink_table: { "safe-by-default": true, developer: false },
    generate_form: { "safe-by-default": true, developer: false },
    create_form_from_template: { "safe-by-default": true, developer: false },
    form_add_control: { "safe-by-default": true, developer: false },
    form_move_control: { "safe-by-default": true, developer: false },
    form_rename_control: { "safe-by-default": true, developer: false },
    catalog_add_control: { "safe-by-default": true, developer: false },
    generate_erd: { "safe-by-default": true, developer: false },
    seed_fixture: { "safe-by-default": true, developer: false },
    // destructive / protected / arbitrary stay true even in developer mode
    export_modules: { "safe-by-default": true, developer: true },
    export_all: { "safe-by-default": true, developer: true },
    delete_module: { "safe-by-default": true, developer: true },
    drop_table: { "safe-by-default": true, developer: true },
    form_deserialize: { "safe-by-default": true, developer: true },
    fix_encoding: { "safe-by-default": true, developer: true },
    compact_repair: { "safe-by-default": true, developer: true },
    relink_directory: { "safe-by-default": true, developer: true },
    vba_inline_execution: { "safe-by-default": true, developer: true },
    // arbitrary SQL/CLI surface
    exec_sql: { "safe-by-default": true, developer: true },
    run_script: { "safe-by-default": true, developer: true },
    query_execute: { "safe-by-default": true, developer: true },
    create_table: { "safe-by-default": true, developer: true },
    teardown_fixture: { "safe-by-default": true, developer: true },
    // process-control — write-side still requires explicit apply in developer
    cleanup_access_operation: { "safe-by-default": true, developer: true },
    access_force_cleanup_orphaned: { "safe-by-default": true, developer: true },
  };

  for (const [toolName, expectations] of Object.entries(EXPECTED)) {
    for (const mode of WRITE_EXECUTION_POLICIES) {
      it(`${toolName} under "${mode}" -> effectiveDryRunDefault=${expectations[mode]}`, () => {
        const result = effectiveDryRunDefaultForTool(toolName as DysflowMcpToolName, mode);
        expect(result).toBe(expectations[mode]);
      });
    }
  }

  it("read-only tools always return true (effective default is moot, but consistent)", () => {
    // read-only tools don't write, so dry-run semantics don't matter.
    // The resolver returns true to preserve the historical contract.
    const readOnlyTools = Object.entries(MCP_TOOL_RISKS)
      .filter(([, r]) => r === "read-only")
      .map(([n]) => n);
    expect(readOnlyTools.length).toBeGreaterThan(0); // sanity
    for (const name of readOnlyTools) {
      expect(
        effectiveDryRunDefaultForTool(name as DysflowMcpToolName, "safe-by-default"),
        `read-only "${name}" safe-by-default`,
      ).toBe(true);
      expect(
        effectiveDryRunDefaultForTool(name as DysflowMcpToolName, "developer"),
        `read-only "${name}" developer`,
      ).toBe(true);
    }
  });
});
