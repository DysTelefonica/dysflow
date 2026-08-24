/**
 * Issue #1167 — adapter-level behavior pin for the `test_vba`
 * `apply: true` unification.
 *
 * Before #1167 the `VbaExecutionAdapter.executeTestVba` short-circuit
 * only honored `params.dryRun === true` (plan). `apply: true` was
 * schema-rejected as `MCP_INPUT_INVALID: apply is not allowed`.
 *
 * After #1167 the adapter honors BOTH the canonical `apply: true`
 * (commit) and the legacy `dryRun: false` (commit alias), as well as
 * `apply: false` (plan) and `dryRun: true` (plan alias). The truth
 * table:
 *
 *   `apply: true`                  → runner invoked (commit)
 *   `apply: false`                 → plan short-circuit (no runner)
 *   `dryRun: true`                 → plan short-circuit (no runner) — legacy alias
 *   `dryRun: false`                → runner invoked (commit) — legacy alias
 *   both absent                    → runner invoked (commit; direct adapter call,
 *                                          the dispatch seam injects dryRun:false
 *                                          in developer mode for routine-dev-write
 *                                          tools per the existing #785 contract).
 *
 * The accept-criterion #2 and #3 of issue #1167 are pinned by the
 * first two tests below.
 */

import { describe, expect, it, vi } from "vitest";
import {
  VbaExecutionAdapter,
  type VbaSyncOrchestrator,
} from "../../../src/adapters/vba-sync/vba-execution-adapter";
import { successResult } from "../../../src/core/contracts";

function testPlanJson(procedure: string): string {
  return JSON.stringify([{ procedure, args: [] }]);
}

function makeAdapter(allowedProcedures: readonly string[] = ["Test_Alpha"]) {
  const executeMappedTool = vi
    .fn()
    .mockResolvedValue(successResult([{ ok: true, procedure: "Test_Alpha" }]));
  const orchestrator: VbaSyncOrchestrator = { executeMappedTool, cwd: "C:/repo" };
  const adapter = new VbaExecutionAdapter(orchestrator, allowedProcedures);
  return { adapter, executeMappedTool };
}

describe("VbaExecutionAdapter — test_vba apply:true unification (#1167)", () => {
  it("apply:true commits a test_vba run (acceptance criterion #2)", async () => {
    // The canonical commit signal after #1167 is `apply: true`. The
    // adapter must invoke the runner exactly once (allowlist permits).
    const { adapter, executeMappedTool } = makeAdapter();
    const result = await adapter.execute("test_vba", {
      proceduresJson: testPlanJson("Test_Alpha"),
      apply: true,
    });
    expect(result.ok).toBe(true);
    expect(executeMappedTool).toHaveBeenCalledTimes(1);
  });

  it("dryRun:false continues to work as a backward-compatible alias (acceptance criterion #3)", async () => {
    const { adapter, executeMappedTool } = makeAdapter();
    const result = await adapter.execute("test_vba", {
      proceduresJson: testPlanJson("Test_Alpha"),
      dryRun: false,
    });
    expect(result.ok).toBe(true);
    expect(executeMappedTool).toHaveBeenCalledTimes(1);
  });

  it("dryRun:true still short-circuits to a plan (no runner invocation)", async () => {
    // Backward-compatible: the legacy no-write signal is honored.
    const { adapter, executeMappedTool } = makeAdapter();
    const result = await adapter.execute("test_vba", {
      proceduresJson: testPlanJson("Test_Alpha"),
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected plan success");
    const data = result.data as { dryRun: boolean; willExecute: boolean };
    expect(data.dryRun).toBe(true);
    expect(data.willExecute).toBe(false);
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("apply:false is also a plan signal (canonical, no runner invocation)", async () => {
    // The new canonical no-write signal. Mirrors dryRun:true semantics
    // — keeps the consumer from having to translate the polarity.
    const { adapter, executeMappedTool } = makeAdapter();
    const result = await adapter.execute("test_vba", {
      proceduresJson: testPlanJson("Test_Alpha"),
      apply: false,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected plan success");
    const data = result.data as { dryRun: boolean; willExecute: boolean };
    expect(data.dryRun).toBe(true);
    expect(data.willExecute).toBe(false);
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("contradictory apply:true + dryRun:true is rejected up-front (F8 #1057) — boundary is the dispatch validator, not the adapter", async () => {
    // The validator's apply/dryRun contradiction check lives at the
    // dispatch boundary (`validateInput` → `validateApplyDryRunConsistency`).
    // The adapter itself does not refuse contradictory payloads — when
    // called DIRECTLY (no dispatch seam), `dryRun === true` wins (plan
    // short-circuit) because that is the explicit plan signal. The
    // dispatch boundary is the one that surfaces `MCP_INPUT_INVALID:
    // apply and dryRun are mutually exclusive` for the bad combination.
    // This test pins the adapter's "explicit dryRun wins" precedence so
    // a future refactor that flips the order (e.g. `apply:true` winning
    // over `dryRun:true`) is a deliberate PR.
    const { adapter, executeMappedTool } = makeAdapter();
    const result = await adapter.execute("test_vba", {
      proceduresJson: testPlanJson("Test_Alpha"),
      apply: true,
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected plan success (dryRun:true wins precedence)");
    const data = result.data as { dryRun: boolean; willExecute: boolean };
    expect(data.dryRun).toBe(true);
    expect(data.willExecute).toBe(false);
    expect(executeMappedTool).not.toHaveBeenCalled();
  });
});
