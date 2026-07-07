import { describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { OperationResult } from "../../../src/core/contracts/index.js";
import type {
  AccessRunner,
  AccessRunnerOperation,
} from "../../../src/core/runner/access-runner.js";
import { AccessVbaService } from "../../../src/core/services/vba-service.js";

const config: DysflowConfig = {
  configSource: "explicit-request",
  allowWrites: false,
  accessDbPath: "C:/data/test.accdb",
  timeoutMs: 1_500,
};

/**
 * Stand-in for the real `AccessRunner` that records every operation it is
 * asked to run. Used by the tests below to assert that `AccessVbaService`
 * either invokes the runner (real execution path) or skips it entirely
 * (dry-run short-circuit path).
 *
 * If the service ever calls `run` while the test expected the short-circuit,
 * the asserted-empty `operations` array makes the failure loud and unambiguous
 * instead of leaking into a downstream assertion that no longer makes sense.
 */
class CapturingRunner implements AccessRunner {
  public operations: AccessRunnerOperation[] = [];

  async run<TData>(operation: AccessRunnerOperation): Promise<{ ok: true; data: TData } & never> {
    this.operations.push(operation);
    return {
      ok: true,
      data: { returnValue: "should-not-be-reached" } as unknown as TData,
      diagnostics: [],
      durationMs: 0,
    } as { ok: true; data: TData } & never;
  }

  // v1.20.0 (#763 + #764) — cross-DB lookup seam. Not exercised by
  // the dry-run tests in this file; the VBA dry-run short-circuits
  // before ever reaching the runner.
  async runProbe<TData>(): Promise<OperationResult<TData>> {
    throw new Error("CapturingRunner.runProbe: not exercised by dry-run tests");
  }
}

describe("AccessVbaService — dryRun:true short-circuits the runner", () => {
  it("does not invoke the runner when dryRun:true is supplied", async () => {
    const runner = new CapturingRunner();
    const service = new AccessVbaService({ runner, config });

    const result = await service.execute({
      moduleName: "HelperModule",
      procedureName: "Test_Helper_CacheHit_RegistersAndReusesEntry",
      arguments: [],
      dryRun: true,
    });

    expect(runner.operations).toEqual([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Pin the plan-shape contract. Callers (the MCP adapters and HTTP server)
    // rely on these fields to render an "I would have run X" preview. The
    // `AccessVbaResult` type is a discriminated union — narrowing on
    // `'dryRun' in data` is required so TypeScript walks into the plan
    // branch (`AccessVbaPlan`) instead of `AccessVbaExecutionResult`.
    expect("dryRun" in result.data).toBe(true);
    if (!("dryRun" in result.data)) return;
    expect(result.data.dryRun).toBe(true);
    expect(result.data.willExecute).toBe(false);
    expect(result.data.willModifyAccess).toBe(false);
    expect(result.data.procedureName).toBe("Test_Helper_CacheHit_RegistersAndReusesEntry");
    expect(result.data.moduleName).toBe("HelperModule");
  });

  it("invokes the runner when dryRun is undefined (real execution path)", async () => {
    const runner = new CapturingRunner();
    const service = new AccessVbaService({ runner, config });

    const result = await service.execute({
      moduleName: "HelperModule",
      procedureName: "Test_Helper_CacheHit_RegistersAndReusesEntry",
      arguments: [],
      // dryRun deliberately omitted
    });

    expect(runner.operations).toEqual([
      {
        kind: "vba",
        request: {
          moduleName: "HelperModule",
          procedureName: "Test_Helper_CacheHit_RegistersAndReusesEntry",
          arguments: [],
        },
      },
    ]);
    // The fake runner ignores the planned short-circuit shape and just hands
    // back its canned return — what matters is that `run` was actually called.
    expect(result.ok).toBe(true);
  });

  it("invokes the runner when dryRun is explicitly false (real execution path)", async () => {
    const runner = new CapturingRunner();
    const service = new AccessVbaService({ runner, config });

    const result = await service.execute({
      moduleName: "HelperModule",
      procedureName: "DoRealWork",
      arguments: [42],
      dryRun: false,
    });

    expect(runner.operations).toEqual([
      {
        kind: "vba",
        request: {
          moduleName: "HelperModule",
          procedureName: "DoRealWork",
          arguments: [42],
          dryRun: false,
        },
      },
    ]);
    expect(result.ok).toBe(true);
  });

  it("returns a plan-shaped result that is safe to render before Access is available", async () => {
    // The whole point of the fix: with `allowedProcedures` configured the
    // MCP adapter let `dryRun:true` calls pass the allowlist gate, then the
    // service spawned PowerShell, then `OpenCurrentDatabase failed`. The
    // short-circuit must return a plan WITHOUT touching Access — so a
    // runner that would explode on call is the strongest signal.
    const explodingRunner: AccessRunner = {
      // Using a method (not arrow) keeps `this`-binding safe if anyone ever
      // extends this fake; for now it just throws on the first call. The
      // generic is part of the AccessRunner contract; we don't read it
      // because the fake never resolves.
      async run<_TData = unknown>() {
        throw new Error("runner.run should not have been called");
      },
      // v1.20.0 (#763 + #764) — cross-DB lookup seam. Not exercised by
      // dry-run tests (the short-circuit never reaches the runner).
      async runProbe<_TData = unknown>(): Promise<OperationResult<_TData>> {
        throw new Error("runner.runProbe should not have been called");
      },
    };
    const service = new AccessVbaService({ runner: explodingRunner, config });

    const result = await service.execute({
      moduleName: "AnyModule",
      procedureName: "AnyProcedure",
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect("dryRun" in result.data).toBe(true);
    if (!("dryRun" in result.data)) return;
    expect(result.data.dryRun).toBe(true);
    expect(result.data.willExecute).toBe(false);
  });
});
