import { describe, expect, it, vi } from "vitest";
import {
  VbaExecutionAdapter,
  type VbaSyncOrchestrator,
} from "../../../src/adapters/vba-sync/vba-execution-adapter";
import {
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { successResult } from "../../../src/core/contracts/index";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

const runnerSuccess = {
  exitCode: 0,
  stdout: 'DYSFLOW_RESULT {"ok":true}',
  stderr: "",
  durationMs: 1,
  timedOut: false,
} as const;

function makeInlineHarness() {
  const executeMappedTool = vi.fn().mockResolvedValue(successResult({ ok: true }));
  const resolveExecutionTarget = vi
    .fn()
    .mockResolvedValue(successResult({ destinationRoot: "C:/repo/src", projectRoot: "C:/repo" }));
  const orchestrator: VbaSyncOrchestrator = {
    executeMappedTool,
    resolveExecutionTarget,
    cwd: "C:/repo",
    env: {},
  };
  const fileSystem = {
    writeFile: vi.fn().mockResolvedValue(undefined),
    rm: vi.fn().mockResolvedValue(undefined),
  };
  return {
    adapter: new VbaExecutionAdapter(orchestrator, fileSystem),
    executeMappedTool,
    resolveExecutionTarget,
    fileSystem,
  };
}

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

  it("vba_inline_execution dryRun:true returns a plan without filesystem or runner activity", async () => {
    const { adapter, executeMappedTool, resolveExecutionTarget, fileSystem } = makeInlineHarness();

    const result = await adapter.execute("vba_inline_execution", {
      code: 'result = "OK"',
      dryRun: true,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        operation: "vba_inline_execution",
        dryRun: true,
        willExecute: false,
        willModifyAccess: false,
        codeLength: 13,
      },
    });
    expect(resolveExecutionTarget).not.toHaveBeenCalled();
    expect(fileSystem.writeFile).not.toHaveBeenCalled();
    expect(fileSystem.rm).not.toHaveBeenCalled();
    expect(executeMappedTool).not.toHaveBeenCalled();
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

  it.each([
    { diff: true },
    {},
  ])("vba_inline_execution plans for legacy diff or omitted intent: %j", async (intent) => {
    const { adapter, executeMappedTool, resolveExecutionTarget, fileSystem } = makeInlineHarness();

    const result = await adapter.execute("vba_inline_execution", {
      code: 'result = "OK"',
      ...intent,
    });

    expect(result).toMatchObject({
      ok: true,
      data: { operation: "vba_inline_execution", dryRun: true, willExecute: false },
    });
    expect(resolveExecutionTarget).not.toHaveBeenCalled();
    expect(fileSystem.writeFile).not.toHaveBeenCalled();
    expect(executeMappedTool).not.toHaveBeenCalled();
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

  it("vba_inline_execution apply:true overrides dryRun:true at the adapter boundary", async () => {
    const { adapter, executeMappedTool, fileSystem } = makeInlineHarness();

    const result = await adapter.execute("vba_inline_execution", {
      code: 'result = "OK"',
      apply: true,
      dryRun: true,
    });

    expect(result.ok).toBe(true);
    expect(fileSystem.writeFile).toHaveBeenCalledTimes(1);
    expect(executeMappedTool).toHaveBeenCalledWith(
      "run_vba",
      expect.objectContaining({ procedureName: "ExecuteInline" }),
      expect.any(Object),
    );
  });
});
