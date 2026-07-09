/**
 * Issue #802 — `export_all({ diff: true })` / `export_modules({ diff: true })` contract.
 *
 * Background: the public docstring for `export_all` (src/adapters/mcp/tool-parity-registry.ts:109)
 * advertises `diff:true` as a strictly read-only mode ("Pass diff:true to NOT write — it only
 * reports per-file drift"). In reality the adapter silently ignored the flag: the
 * `MODULE_MAPPINGS.export_all` `extra` function only forwards `verbose`, the PowerShell runner
 * has no `$Diff` parameter, and `VbaModulesAdapter.execute` never inspects `params.diff`. On
 * timeout the partial writes remained on disk — silent corruption of consumer source trees.
 *
 * Fix (Option A): refuse `diff:true` at the dispatch seam with a typed error
 * `DIFF_MODE_REQUIRES_VERIFY_CODE` that points the caller at `verify_code({ strict,
 * moduleNames })` for a real read-only compare. This converts the doc-vs-runtime gap from
 * silent corruption into a typed refusal.
 *
 * These tests pin the contract from the OUTSIDE of `VbaModulesAdapter.execute`:
 *   1. `diff:true` on `export_all` returns the typed refusal and the orchestrator's
 *      `executeMappedTool` is NEVER invoked.
 *   2. `diff:true` on `export_modules` returns the same typed refusal.
 *   3. The guard does NOT block the normal export path — `export_all` without `diff`
 *      still reaches the runner (regression guard for the guard).
 *
 * The stubbing pattern reuses the orchestrator shape from
 * `test/adapters/vba-sync/vba-modules-adapter-write-policy.test.ts:359-417`. The
 * orchestrator's `executeMappedTool` is a spy — when the contract holds (diff:true rejected
 * before any side-effecting call), the spy is never called.
 */

import { describe, expect, it } from "vitest";
import type { VbaModulesOrchestrator } from "../../../src/adapters/vba-sync/vba-modules-adapter";
import { VbaModulesAdapter } from "../../../src/adapters/vba-sync/vba-modules-adapter";
import type { AccessOperationPreflightCleanupResult } from "../../../src/core/operations/access-operation-preflight.js";

/**
 * Build a `VbaModulesAdapter` with a spied orchestrator. The spy's `executeMappedTool`
 * throws if invoked — the diff:true contract REQUIRES that the rejection happens before
 * the orchestrator is touched (no projectRoot resolution, no executeMappedTool call).
 */
function buildAdapterWithSpy(): {
  adapter: VbaModulesAdapter;
  executeCalls: Array<{ toolName: string; params: Record<string, unknown> }>;
  resolveCalls: number;
} {
  const executeCalls: Array<{ toolName: string; params: Record<string, unknown> }> = [];
  let resolveCalls = 0;

  const orchestrator: VbaModulesOrchestrator = {
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    cwd: "C:/repo",
    env: {},
    executor: async () => ({
      exitCode: 0,
      stdout: 'DYSFLOW_RESULT {"ok":true}',
      stderr: "",
      durationMs: 1,
      timedOut: false,
    }),
    resolveExecutionTarget: async () => {
      resolveCalls += 1;
      return {
        ok: true,
        data: {
          configSource: "explicit-request",
          accessDbPath: "C:/db/front.accdb",
          accessPath: "C:/db/front.accdb",
          destinationRoot: "C:/repo/src",
          projectRoot: "C:/repo",
        },
        diagnostics: [],
        durationMs: 0,
      };
    },
    validateStrictContext: () => ({
      ok: true,
      data: undefined,
      diagnostics: [],
      durationMs: 0,
    }),
    runPreflightCleanup: async () =>
      ({
        cleaned: [],
        killed: [],
        orphanedKilled: [],
        errors: [],
      }) satisfies AccessOperationPreflightCleanupResult,
    executeMappedTool: async (toolName, params) => {
      executeCalls.push({ toolName, params: { ...params } });
      return {
        ok: true,
        data: { ok: true },
        diagnostics: [],
        durationMs: 0,
      };
    },
  };

  const adapter = new VbaModulesAdapter(orchestrator, {
    mkdtemp: async () => "C:/repo",
    readdir: async () => [],
    readFile: async () => "",
    readFileBytes: async () => new Uint8Array(),
    rm: async () => undefined,
    tmpdir: () => "/tmp",
  });

  return { adapter, executeCalls, resolveCalls };
}

describe("VbaModulesAdapter — diff:true read-only contract (#802)", () => {
  it("export_all(diff:true) is refused with DIFF_MODE_REQUIRES_VERIFY_CODE and does NOT invoke the runner", async () => {
    const { adapter, executeCalls, resolveCalls } = buildAdapterWithSpy();

    const result = await adapter.execute("export_all", {
      diff: true,
      destinationRoot: "/tmp/x",
      projectId: "test",
    });

    // The contract: typed refusal, NOT a successful export.
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected diff:true to be refused, got ok=true");
    expect(result.error.code).toBe("DIFF_MODE_REQUIRES_VERIFY_CODE");
    // Error message must be actionable: name the alternative, cite the issue.
    expect(result.error.message).toMatch(/verify_code/i);
    expect(result.error.message).toMatch(/#802/);

    // The contract: rejection happens BEFORE any side-effecting call.
    expect(executeCalls).toHaveLength(0);
    expect(resolveCalls).toBe(0);
  });

  it("export_modules(diff:true) is refused with DIFF_MODE_REQUIRES_VERIFY_CODE", async () => {
    const { adapter, executeCalls, resolveCalls } = buildAdapterWithSpy();

    const result = await adapter.execute("export_modules", {
      diff: true,
      destinationRoot: "/tmp/x",
      moduleNames: ["Module_Foo"],
      projectId: "test",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected diff:true to be refused, got ok=true");
    expect(result.error.code).toBe("DIFF_MODE_REQUIRES_VERIFY_CODE");
    expect(result.error.message).toMatch(/verify_code/i);
    expect(result.error.message).toMatch(/#802/);

    expect(executeCalls).toHaveLength(0);
    expect(resolveCalls).toBe(0);
  });

  it("export_all without diff is unchanged — runner is still invoked (regression guard for the guard)", async () => {
    // The diff guard must NOT block the normal export path. Without `diff:true`,
    // `export_all` reaches the orchestrator's executeMappedTool exactly once.
    const { adapter, executeCalls } = buildAdapterWithSpy();

    const result = await adapter.execute("export_all", {
      destinationRoot: "/tmp/x",
      projectId: "test",
    });

    expect(result.ok).toBe(true);
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]?.toolName).toBe("export_all");
  });
});
