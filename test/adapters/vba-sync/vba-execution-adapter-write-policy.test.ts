/**
 * Issue #785 (v2.1.1) — `VbaExecutionAdapter` write-policy truth table.
 *
 * Capa 3 of `wire-write-policy-runtime-785`. Mirrors capa 2 for the
 * execution-side adapter. The dispatch seam (capa 1) is now the SINGLE
 * source of truth for the policy-driven `dryRun` default; the
 * execution-adapter only needs to honor EXPLICIT `dryRun` / `apply`
 * intent and the allowlist gate. The implicit absence-default is gone.
 *
 * The current code (post-Round-3 Item 5) already uses `dryRun === true`
 * as the explicit plan signal at the top level and the gate's
 * `params.dryRun !== true` is the inverse check. Neither needs a real
 * refactor; capa 3's contribution is the explicit test pin so a future
 * change reintroducing an implicit absence-default at this layer is a
 * deliberate PR.
 *
 * Truth table (`test_vba`):
 *
 *   `dryRun: true`                       → plan (allowlist gate consulted first,
 *                                          plan short-circuit returns).
 *   `dryRun: false`                      → runner invocation when allowlist permits;
 *                                          MCP_ALLOWLIST_NOT_CONFIGURED when missing.
 *   Apply legacy: `apply: true`           → commit (legacy contract).
 *
 * Truth table (`run_vba`):
 *
 *   Follow-up semantics preserved — the allowlist gate is the real safety
 *   boundary. No `dryRun` plan short-circuit in `run_vba`; the dispatch
 *   seam's policy default is observed (dryRun:false → execute path),
 *   dryRun:true → execute path (no short-circuit, original contract
 *   preserved).
 */

import { describe, expect, it, vi } from "vitest";
import type { AllowedProcedures } from "../../../src/adapters/mcp/allowed-procedures-resolver.js";
import {
  VbaExecutionAdapter,
  type VbaSyncOrchestrator,
} from "../../../src/adapters/vba-sync/vba-execution-adapter.js";
import { successResult } from "../../../src/core/contracts/index.js";

/**
 * Build a `VbaExecutionAdapter` with a stubbed orchestrator. The adapter
 * construction is the post-capa-3 wiring:
 *   `new VbaExecutionAdapter(orchestrator, fileSystem, allowedProcedures)`
 *
 * `fileSystem` is `undefined` (defaults to the real `node:fs` port) — the
 * capa-3 tests do not exercise `vba_inline_execution`, so the FS port is
 * inert for the test_vba/run_vba paths.
 */
function makeAdapter(opts: {
  allowedProcedures?: AllowedProcedures | null | "missing";
  executeMappedTool?: VbaSyncOrchestrator["executeMappedTool"];
}) {
  const executeMappedTool = opts.executeMappedTool ?? vi.fn();
  const orchestrator: VbaSyncOrchestrator = {
    executeMappedTool,
    cwd: "C:/repo",
  };
  // Distinguish "no allowlist at all" from the default [`Test_Alpha`]
  // allowlist — a fresh sentinel `"missing"` lets individual tests opt
  // into the refusal branch without the helper's fallback overriding them.
  const allowedProcedures: AllowedProcedures | undefined =
    opts.allowedProcedures === "missing"
      ? undefined
      : (opts.allowedProcedures ?? ["Test_Alpha"]);
  const adapter = new VbaExecutionAdapter(orchestrator, undefined, allowedProcedures);
  return { adapter, executeMappedTool };
}

/**
 * Build a `proceduresJson` payload that the adapter accepts. The schema
 * accepts either an array of `{procedure, args}` objects or a bare string
 * list (see `normalizeTestPlan` in vba-execution-adapter.ts). We use the
 * object form so the test pins the procedure name explicitly.
 */
function testPlanJson(procedure: string): string {
  return JSON.stringify([{ procedure, args: [] }]);
}

// ─── test_vba truth table ───────────────────────────────────────────────────

describe("VbaExecutionAdapter — test_vba write-policy truth table (#785, capa 3)", () => {
  it("test_vba with dryRun:false forwarded → runner invoked (allowlist permits)", async () => {
    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult([{ ok: true, procedure: "Test_Alpha" }]));
    const { adapter } = makeAdapter({ executeMappedTool });

    const result = await adapter.execute("test_vba", {
      proceduresJson: testPlanJson("Test_Alpha"),
      dryRun: false,
    });

    expect(result.ok).toBe(true);
    expect(executeMappedTool).toHaveBeenCalledTimes(1);
  });

  it("test_vba with dryRun:true → plan (no runner invocation)", async () => {
    const executeMappedTool = vi.fn();
    const { adapter } = makeAdapter({ executeMappedTool });

    const result = await adapter.execute("test_vba", {
      proceduresJson: testPlanJson("Test_Alpha"),
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected plan success");
    const data = result.data as { dryRun: boolean; willExecute: boolean; willModifyAccess: boolean };
    expect(data.dryRun).toBe(true);
    expect(data.willExecute).toBe(false);
    expect(data.willModifyAccess).toBe(false);
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("test_vba with dryRun:false forwarded + allowlist missing → MCP_ALLOWLIST_NOT_CONFIGURED", async () => {
    // The allowlist gate is consulted FIRST (before the dryRun
    // short-circuit), so an execute-mode call hits the gate regardless.
    // In developer mode + routine-dev-write tools the dispatcher injects
    // `dryRun:false`, so this is the observed contract for "developer
    // mode + test_vba + no allowlist".
    const executeMappedTool = vi.fn();
    const { adapter } = makeAdapter({ allowedProcedures: "missing", executeMappedTool });

    const result = await adapter.execute("test_vba", {
      proceduresJson: testPlanJson("Test_Alpha"),
      dryRun: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected gate refusal");
    expect(result.error.code).toBe("MCP_ALLOWLIST_NOT_CONFIGURED");
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("test_vba with dryRun:true + allowlist missing → plan (gate passes when caller plans)", async () => {
    // Plan mode bypasses the gate (the inner `params.dryRun !== true`
    // check skips the refusal when the caller plans; the short-circuit
    // then returns the plan shape).
    const executeMappedTool = vi.fn();
    const { adapter } = makeAdapter({ allowedProcedures: "missing", executeMappedTool });

    const result = await adapter.execute("test_vba", {
      proceduresJson: testPlanJson("Test_Alpha"),
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected plan success");
    const data = result.data as { dryRun: boolean };
    expect(data.dryRun).toBe(true);
    expect(executeMappedTool).not.toHaveBeenCalled();
  });

  it("test_vba with no dryRun + allowlist permits → execute path (simulating dispatch seam dryRun:false)", async () => {
    // Mirrors developer mode + routine-dev-write: the dispatcher would
    // inject `dryRun:false`. Direct adapter calls without flags
    // exercise the new "absence = execute" rule — direct callers MUST
    // opt in explicitly.
    const executeMappedTool = vi
      .fn()
      .mockResolvedValue(successResult([{ ok: true, procedure: "Test_Alpha" }]));
    const { adapter } = makeAdapter({ executeMappedTool });

    const result = await adapter.execute("test_vba", {
      proceduresJson: testPlanJson("Test_Alpha"),
    });

    expect(result.ok).toBe(true);
    expect(executeMappedTool).toHaveBeenCalledTimes(1);
  });

  it("test_vba with dryRun:false + procedure NOT in allowlist → PROCEDURE_NOT_ALLOWED", async () => {
    const executeMappedTool = vi.fn();
    const { adapter } = makeAdapter({
      allowedProcedures: ["Test_Alpha"],
      executeMappedTool,
    });

    const result = await adapter.execute("test_vba", {
      proceduresJson: testPlanJson("Test_NotInAllowlist"),
      dryRun: false,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected procedure refusal");
    expect(result.error.code).toBe("PROCEDURE_NOT_ALLOWED");
    expect(executeMappedTool).not.toHaveBeenCalled();
  });
});

// ─── run_vba follow-up semantics preserved ──────────────────────────────────

describe("VbaExecutionAdapter — run_vba legacy semantics preserved (#785, capa 3)", () => {
  it("run_vba does not consult the dryRun plan-shortcut (always executes via runOptions)", async () => {
    // `run_vba` uses `runOptions` (own internal semantics) rather than
    // the import/dryRun plan-shortcut. Capa 3 is a no-op for run_vba —
    // pin that the delegation runs regardless of the dispatch seam's
    // dryRun default. (run_vba has its own runner; we don't assert
    // detailed outcomes here, just that the delegation is invoked.)
    const executeMappedTool = vi.fn().mockResolvedValue(successResult({ procedure: "Test_Alpha" }));
    const { adapter } = makeAdapter({ executeMappedTool });

    await adapter.execute("run_vba", {
      procedureName: "Test_Alpha",
      moduleName: "Module_Test",
      dryRun: true,
    });

    // run_vba does NOT short-circuit on dryRun — it delegates through
    // executeMappedTool regardless of the dispatch seam's default. The
    // record of mocked invocations is therefore non-empty even when
    // the caller asked for a plan-shape result.
    expect(executeMappedTool).toHaveBeenCalledTimes(1);
  });
});
