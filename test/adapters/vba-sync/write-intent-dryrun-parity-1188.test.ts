import { describe, expect, it, vi } from "vitest";
import {
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

const runnerSuccess = {
  exitCode: 0,
  stdout: 'DYSFLOW_RESULT {"ok":true}',
  stderr: "",
  durationMs: 1,
  timedOut: false,
} as const;

describe("write-intent dryRun parity (#1188)", () => {
  it("fix_encoding dryRun:true returns a plan without invoking the runner", async () => {
    const executor = vi.fn<VbaManagerExecutor>().mockResolvedValue(runnerSuccess);
    const adapter = new VbaSyncAdapter({
      preflightCleanup: noopPreflightCleanup(),
      executor,
      accessPath: "C:/repo/front.accdb",
      destinationRoot: "C:/repo/src",
      env: {},
    });

    const result = await adapter.execute("fix_encoding", {
      location: "module",
      moduleNames: ["Module_A"],
      dryRun: true,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        operation: "fix_encoding",
        dryRun: true,
        willExecute: false,
        willModifyAccess: false,
        location: "module",
        moduleNames: ["Module_A"],
      },
    });
    expect(executor).not.toHaveBeenCalled();
  });

  it.each([
    { diff: true },
    {},
  ])("fix_encoding plans for legacy diff or omitted intent: %j", async (intent) => {
    const executor = vi.fn<VbaManagerExecutor>().mockResolvedValue(runnerSuccess);
    const adapter = new VbaSyncAdapter({
      preflightCleanup: noopPreflightCleanup(),
      executor,
      accessPath: "C:/repo/front.accdb",
      destinationRoot: "C:/repo/src",
      env: {},
    });

    const result = await adapter.execute("fix_encoding", {
      location: "module",
      ...intent,
    });

    expect(result).toMatchObject({
      ok: true,
      data: { operation: "fix_encoding", dryRun: true, willExecute: false },
    });
    expect(executor).not.toHaveBeenCalled();
  });

  it("fix_encoding apply:true overrides dryRun:true at the adapter boundary", async () => {
    const executor = vi.fn<VbaManagerExecutor>().mockResolvedValue(runnerSuccess);
    const adapter = new VbaSyncAdapter({
      preflightCleanup: noopPreflightCleanup(),
      executor,
      accessPath: "C:/repo/front.accdb",
      destinationRoot: "C:/repo/src",
      env: {},
    });

    await adapter.execute("fix_encoding", {
      location: "module",
      apply: true,
      dryRun: true,
    });

    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "Fix-Encoding",
      }),
    );
  });
});
