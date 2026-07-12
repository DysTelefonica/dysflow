/**
 * Issue #802 -> superseded by #757 (C1).
 *
 * Original #802 contract: `export_all(diff:true)` / `export_modules(diff:true)` was
 * refused outright with a typed `DIFF_MODE_REQUIRES_VERIFY_CODE` error pointing
 * callers at `verify_code({ strict, moduleNames })`. That refusal was the right
 * behavior at the time: the adapter silently ignored `diff:true` and wrote to
 * disk on a timeout.
 *
 * #757 (C1) supersedes the refusal with a unification: `apply:true` is the new
 * commit signal and `diff:true` becomes a DEPRECATED no-write alias. The
 * rejection is removed. The call still does NOT write (the runner receives
 * `readOnly:true`) — but the adapter now propagates `metadata.deprecated` so
 * an AI consumer can migrate to `apply` without a manual source-tree audit.
 *
 * These tests pin the NEW contract from the OUTSIDE of `VbaModulesAdapter.execute`:
 *   1. `diff:true` on `export_all` is honored (no refusal), routes as
 *      `readOnly:true`, and emits `metadata.deprecated`.
 *   2. `diff:true` on `export_modules` honors the same shape.
 *   3. The legacy guard does NOT block the normal export path — `export_all`
 *      without `diff` still reaches the runner.
 *   4. The `DIFF_MODE_REQUIRES_VERIFY_CODE` error code is REMOVED from the
 *      surface (legacy consumers can no longer receive it; #757 supersedes
 *      #802's documented contract).
 *
 * The stubbing pattern reuses the orchestrator shape from
 * `test/adapters/vba-sync/vba-modules-adapter-write-policy.test.ts:359-417`. The
 * orchestrator's `executeMappedTool` is a spy — when the contract holds,
 * the runner IS invoked with `readOnly:true` (the deprecation alias routes
 * through the runner instead of refusing) so the spy is called exactly once.
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

describe("VbaModulesAdapter — diff:true deprecation contract (#802 -> #757 C1)", () => {
  it("export_all(diff:true) is HONORED (not refused) and routes as readOnly:true (#757 supersedes #802)", async () => {
    const { adapter, executeCalls } = buildAdapterWithSpy();

    const result = await adapter.execute("export_all", {
      diff: true,
      destinationRoot: "/tmp/x",
      projectId: "test",
    });

    // New contract: diff:true is the deprecated no-write alias. The call
    // succeeds, surfaces `metadata.deprecated`, and routes through the
    // runner with readOnly:true (so the consumer can audit what WOULD
    // have been exported).
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
    // The runner IS called — once.
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]?.toolName).toBe("export_all");
    // And the call MUST be no-write — readOnly:true is the alias
    // semantic that #802 originally promised.
    expect(executeCalls[0]?.params.readOnly).toBe(true);
    // Migration hint: the deprecated flag note.
    const metadata = result.metadata as
      | { deprecated?: { flag?: string; use?: string } }
      | undefined;
    expect(metadata?.deprecated?.flag).toBe("diff");
    expect(metadata?.deprecated?.use).toBe("apply");
  });

  it("export_modules(diff:true) honors the deprecated alias surface", async () => {
    const { adapter, executeCalls } = buildAdapterWithSpy();

    const result = await adapter.execute("export_modules", {
      diff: true,
      destinationRoot: "/tmp/x",
      moduleNames: ["Module_Foo"],
      projectId: "test",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]?.params.readOnly).toBe(true);
    const metadata = result.metadata as { deprecated?: { flag?: string } } | undefined;
    expect(metadata?.deprecated?.flag).toBe("diff");
  });

  it("export_all(diff:true) NEVER returns the legacy DIFF_MODE_REQUIRES_VERIFY_CODE error code", async () => {
    const { adapter } = buildAdapterWithSpy();
    const result = await adapter.execute("export_all", {
      diff: true,
      destinationRoot: "/tmp/x",
      projectId: "test",
    });

    // Regression guard: #757 removed the #802 refusal. A consumer that
    // greps for `DIFF_MODE_REQUIRES_VERIFY_CODE` must not see it on the
    // new path. (The code may still exist as documentation — but the
    // adapter never returns it.)
    if (!result.ok) {
      expect(result.error.code).not.toBe("DIFF_MODE_REQUIRES_VERIFY_CODE");
    }
  });

  it("export_all without diff is unchanged — runner is still invoked (regression guard for the alias path)", async () => {
    // The diff alias must NOT block the normal export path. Without `diff:true`,
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
