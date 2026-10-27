import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type VbaManagerExecutionRequest,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

/**
 * #1911 — test_vba compiles its temporary sandbox copy before it runs any
 * test. When the copy does not compile, the PowerShell runner emits a
 * VBA_COMPILE_ERROR envelope (with the failing component when Access names
 * it) and exits 1 without running a test.
 *
 * The VBA-manager executor is faked (it is the PowerShell/Access boundary);
 * the real adapter turns the envelope into the error the agent receives.
 */
async function testVbaWithRunnerEnvelope(envelope: Record<string, unknown>) {
  const root = await mkdtemp(join(tmpdir(), "dysflow-1911-compile-"));
  const adapter = new VbaSyncAdapter({
    accessPath: join(root, "front.accdb"),
    destinationRoot: root,
    preflightCleanup: noopPreflightCleanup(),
    env: {},
    executor: async (_request: VbaManagerExecutionRequest) => ({
      exitCode: 1,
      stdout: `DYSFLOW_RESULT ${JSON.stringify(envelope)}`,
      stderr: "",
      durationMs: 1,
      timedOut: false,
    }),
  });
  return adapter.execute("test_vba", {
    proceduresJson: JSON.stringify(["Test_Foo"]),
    apply: true,
  });
}

describe("test_vba reports a sandbox compile failure as VBA_COMPILE_ERROR (#1911)", () => {
  it("surfaces the typed code, the failing module and a compile remediation", async () => {
    const result = await testVbaWithRunnerEnvelope({
      ok: false,
      phase: "compile",
      error: {
        code: "VBA_COMPILE_ERROR",
        message: "The VBA project does not compile. No test was run.",
      },
      component: "modBroken",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("VBA_COMPILE_ERROR");
    expect(result.error.message).toMatch(/does not compile/);
    const details = (result.error.details ?? {}) as Record<string, unknown>;
    expect(details.firstError).toMatchObject({ module: "modBroken" });
    expect(result.error.remediation).toMatch(/Debug > Compile/);
  });

  it("keeps the envelope usable when Access does not name the module", async () => {
    const result = await testVbaWithRunnerEnvelope({
      ok: false,
      phase: "compile",
      error: { code: "VBA_COMPILE_ERROR", message: "Compile error: Sub or Function not defined" },
      component: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("VBA_COMPILE_ERROR");
    expect((result.error.details ?? {}) as Record<string, unknown>).not.toHaveProperty(
      "firstError",
    );
  });
});
