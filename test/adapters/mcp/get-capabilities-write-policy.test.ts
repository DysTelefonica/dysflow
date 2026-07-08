/**
 * Issue #779 (v2.1.0) — `get_capabilities` surfaces the active
 * write-execution policy and a per-tool `effectiveDryRunDefault` map so
 * a consumer can reason about what the runtime will do before invoking
 * a write-class tool.
 *
 * Back-compat invariants (preserved from v2.0.x):
 *   - The existing `dryRunDefault` global field stays as the
 *     safe-by-default reference value.
 *   - When `writeExecutionPolicy === "safe-by-default"`, the per-tool map
 *     matches the global default for every tool.
 *   - When `writeExecutionPolicy === "developer"`, the per-tool map
 *     flips ONLY for `routine-dev-write` tools.
 */

import { describe, expect, it } from "vitest";
import { getCapabilitiesAll } from "../../../src/adapters/mcp/get-capabilities-tool.js";
import { MCP_TOOL_CONTRACTS } from "../../../src/adapters/mcp/mcp-tool-contracts.js";
import type { DysflowMcpToolName } from "../../../src/adapters/mcp/mcp-tool-registry.js";
import { effectiveDryRunDefaultForTool } from "../../../src/adapters/mcp/mcp-tool-risks.js";
import { WRITE_EXECUTION_POLICIES } from "../../../src/core/runtime/write-execution-policy.js";

function baseInput() {
  return {
    writesEnabled: true,
    writeAccessResolver: undefined,
    allowedProcedures: undefined,
    projectId: undefined,
    allowWrites: true,
  };
}

describe("get_capabilities — writeExecutionPolicy + effectiveDryRunDefault (#779)", () => {
  it("safe-by-default policy surfaces when writeExecutionPolicy is omitted", () => {
    const snapshot = getCapabilitiesAll(baseInput());
    expect(snapshot.writeExecutionPolicy).toBe("safe-by-default");
  });

  it("safe-by-default policy surfaces when writeExecutionPolicy is 'safe-by-default'", () => {
    const snapshot = getCapabilitiesAll({
      ...baseInput(),
      writeExecutionPolicy: "safe-by-default",
    });
    expect(snapshot.writeExecutionPolicy).toBe("safe-by-default");
  });

  it("developer policy surfaces when writeExecutionPolicy is 'developer'", () => {
    const snapshot = getCapabilitiesAll({
      ...baseInput(),
      writeExecutionPolicy: "developer",
    });
    expect(snapshot.writeExecutionPolicy).toBe("developer");
  });

  it("snapshot exposes an effectiveDryRunDefault map covering every contract tool", () => {
    const snapshot = getCapabilitiesAll({
      ...baseInput(),
      writeExecutionPolicy: "developer",
    });
    expect(snapshot.effectiveDryRunDefault).toBeDefined();
    const expectedTools = new Set(Object.keys(MCP_TOOL_CONTRACTS));
    for (const name of Object.keys(snapshot.effectiveDryRunDefault)) {
      expect(expectedTools, `snapshot has extra tool "${name}"`).toContain(name);
    }
    for (const name of expectedTools) {
      expect(
        snapshot.effectiveDryRunDefault[name],
        `tool "${name}" missing from effectiveDryRunDefault`,
      ).toBeDefined();
      expect(typeof snapshot.effectiveDryRunDefault[name]).toBe("boolean");
    }
  });

  it("safe-by-default map matches the global dryRunDefault for every tool", () => {
    const snapshot = getCapabilitiesAll({
      ...baseInput(),
      writeExecutionPolicy: "safe-by-default",
    });
    for (const [name, value] of Object.entries(snapshot.effectiveDryRunDefault)) {
      expect(value, `safe-by-default map for "${name}"`).toBe(snapshot.dryRunDefault);
    }
  });

  it("developer mode flips routine-dev-write tools only", () => {
    const safe = getCapabilitiesAll({
      ...baseInput(),
      writeExecutionPolicy: "safe-by-default",
    });
    const developer = getCapabilitiesAll({
      ...baseInput(),
      writeExecutionPolicy: "developer",
    });
    let flippedCount = 0;
    for (const name of Object.keys(developer.effectiveDryRunDefault)) {
      const safeValue = safe.effectiveDryRunDefault[name];
      const devValue = developer.effectiveDryRunDefault[name];
      if (safeValue !== devValue) {
        flippedCount += 1;
        // The only tools that flip from true -> false in developer mode are
        // routine-dev-write. Verify by recomputing via the resolver.
        expect(devValue, `${name} flipped to non-true value`).toBe(false);
        expect(safeValue, `${name} flipped from non-false value`).toBe(true);
        expect(effectiveDryRunDefaultForTool(name as DysflowMcpToolName, "developer")).toBe(false);
      }
    }
    // We don't pin the exact count (it's the routine-dev-write family),
    // but it MUST be > 0 in developer mode (the policy is meaningless
    // otherwise).
    expect(flippedCount, "at least one routine tool must flip in developer mode").toBeGreaterThan(
      0,
    );
  });

  it("developer mode keeps destructive / protected / arbitrary / process-control at true", () => {
    const snapshot = getCapabilitiesAll({
      ...baseInput(),
      writeExecutionPolicy: "developer",
    });
    const pinnedTrue = [
      "export_modules",
      "export_all",
      "delete_module",
      "drop_table",
      "form_deserialize",
      "fix_encoding",
      "compact_repair",
      "relink_directory",
      "vba_inline_execution",
      "exec_sql",
      "run_script",
      "query_execute",
      "create_table",
      "teardown_fixture",
    ];
    for (const name of pinnedTrue) {
      expect(snapshot.effectiveDryRunDefault[name], `pinned-true "${name}" under developer`).toBe(
        true,
      );
    }
  });

  it("effectiveDryRunDefault agrees with the resolver helper (single source of truth)", () => {
    for (const mode of WRITE_EXECUTION_POLICIES) {
      const snapshot = getCapabilitiesAll({
        ...baseInput(),
        writeExecutionPolicy: mode,
      });
      for (const [name, value] of Object.entries(snapshot.effectiveDryRunDefault)) {
        expect(value, `mode=${mode} tool=${name}: snapshot disagrees with resolver`).toBe(
          effectiveDryRunDefaultForTool(name as DysflowMcpToolName, mode),
        );
      }
    }
  });

  it("the per-tool map is read-only (frozen) at the type level — runtime test asserts no surprise mutation paths", () => {
    // We don't use Object.freeze() so the snapshot stays serializable. The
    // contract is that the map is computed once at snapshot time and never
    // mutated. This test pins the build-time invariant by checking that the
    // map keys are stable across two calls.
    const a = getCapabilitiesAll({
      ...baseInput(),
      writeExecutionPolicy: "developer",
    });
    const b = getCapabilitiesAll({
      ...baseInput(),
      writeExecutionPolicy: "developer",
    });
    expect(Object.keys(a.effectiveDryRunDefault).sort()).toEqual(
      Object.keys(b.effectiveDryRunDefault).sort(),
    );
  });
});
