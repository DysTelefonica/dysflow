/**
 * #1993 D1 / Q1 — `test_vba({ detach: true })` and the synchronous path.
 *
 * Driven through the real MCP `test_vba` tool, the real `VbaSyncAdapter` and
 * the real run store over a temporary project. Only Access (the PowerShell
 * executor), the detached spawn and process liveness are faked.
 */
import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnDetachedTestRunner } from "../../../src/adapters/test-runs/index";
import { nodeTestRunFileSystem } from "../../../src/adapters/test-runs/node-test-run-file-system";
import type { VbaManagerExecutor } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry";
import { resolveTestRunsRoot, TestRunStore } from "../../../src/core/test-runs/test-run-store";
import {
  callTool,
  DetachedRunHarness,
  exited,
  PLAN,
  PROCEDURES_JSON,
  RUNNER_PID,
  runnerStdout,
} from "../../_helpers/detached-test-runs-1993";

const APPLY = { proceduresJson: PROCEDURES_JSON, apply: true };
const DETACH = { ...APPLY, detach: true };

let harness: DetachedRunHarness;

beforeEach(() => {
  harness = new DetachedRunHarness();
});

afterEach(() => {
  harness.dispose();
});

/** An executor that counts its calls and returns the given outcomes. */
function countingExecutor(outcomes: readonly boolean[] = [true, true]) {
  const calls: number[] = [];
  const executor: VbaManagerExecutor = async () => {
    calls.push(Date.now());
    return exited(runnerStdout(outcomes));
  };
  return { executor, calls };
}

/** An Access run that never ends: a detached start must not wait for it. */
const neverEnding: VbaManagerExecutor = () => new Promise(() => undefined);

/** An Access run that holds until `release()` is called. */
function heldExecutor() {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started: () => void = () => undefined;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  const executor: VbaManagerExecutor = async () => {
    started();
    await released;
    return exited(runnerStdout([true, true]));
  };
  return { executor, running, release };
}

/** Re-read `read` until `done` holds, at most ~2 s. */
async function eventually<T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> {
  let value = await read();
  for (let attempt = 0; attempt < 200 && !done(value); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
    value = await read();
  }
  return value;
}

describe("test_vba detach:true (#1993 D1)", () => {
  it("returns an operationId at once and leaves the run to the spawned runner", async () => {
    const tools = harness.tools(harness.adapter(neverEnding, { accessPassword: "s3cret" }));

    const started = Date.now();
    const result = await callTool(tools, "test_vba", DETACH);
    const elapsedMs = Date.now() - started;

    expect(result.isError).toBe(false);
    const data = result.structuredContent ?? {};
    expect(data).toMatchObject({
      status: "running",
      testsPlanned: PLAN.length,
      fetchWith: { tool: "get_test_run", operationId: data.operationId },
    });
    expect(typeof data.operationId).toBe("string");
    expect(elapsedMs).toBeLessThan(2_000);

    // The runner was spawned on the run directory, with the run's identity and
    // the password in its environment only.
    expect(harness.spawns).toHaveLength(1);
    const spawn = harness.spawns[0];
    expect(spawn?.runDir).toBe(
      join(harness.root, ".dysflow", "runtime", "test-runs", String(data.operationId)),
    );
    expect(spawn?.env.DYSFLOW_TEST_RUN_OPERATION_ID).toBe(data.operationId);
    expect(spawn?.env.DYSFLOW_ACCESS_PASSWORD).toBe("s3cret");

    // The stored request replays synchronously: no detach flag, no password.
    const request = readFileSync(join(spawn?.runDir ?? "", "request.json"), "utf8");
    expect(request).not.toContain("s3cret");
    expect(JSON.parse(request)).toMatchObject({
      accessPath: harness.accessPath,
      plannedTests: [...PLAN],
    });
    expect(JSON.parse(request).input.detach).toBeUndefined();

    await expect(harness.store().getActiveDetachedRun(harness.accessPath)).resolves.toMatchObject({
      operationId: data.operationId,
    });
  });

  it("is refused with TEST_RUN_ALREADY_ACTIVE while another detached run holds the database", async () => {
    const tools = harness.tools(harness.adapter(neverEnding));
    const first = await callTool(tools, "test_vba", DETACH);
    const activeOperationId = first.structuredContent?.operationId;

    const second = await callTool(tools, "test_vba", DETACH);

    expect(second.isError).toBe(true);
    expect(second.structuredContent?.error?.code).toBe("TEST_RUN_ALREADY_ACTIVE");
    expect(second.structuredContent?.error?.details?.activeOperationId).toBe(activeOperationId);
    expect(harness.spawns).toHaveLength(1);
  });

  it("stays a plan without apply:true and says it would detach", async () => {
    const tools = harness.tools(harness.adapter(neverEnding));

    const result = await callTool(tools, "test_vba", {
      proceduresJson: PROCEDURES_JSON,
      apply: false,
      detach: true,
    });

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({
      dryRun: true,
      willExecute: false,
      willDetach: true,
    });
    expect(harness.spawns).toEqual([]);
    expect(existsSync(join(harness.root, ".dysflow", "runtime", "test-runs"))).toBe(false);
  });

  it("returns input errors immediately without preparing or spawning a run", async () => {
    const tools = harness.tools(harness.adapter(neverEnding));

    const result = await callTool(tools, "test_vba", {
      proceduresJson: "not json",
      apply: true,
      detach: true,
    });

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error?.code).toBe("VBA_INVALID_TEST_PLAN");
    expect(harness.spawns).toEqual([]);
    expect(existsSync(join(harness.root, ".dysflow", "runtime", "test-runs"))).toBe(false);
  });

  it("reports a failed spawn and releases the database", async () => {
    harness.spawnFailure = new Error("spawn EACCES");
    const tools = harness.tools(harness.adapter(neverEnding));

    const result = await callTool(tools, "test_vba", DETACH);

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error?.code).toBe("TEST_RUN_SPAWN_FAILED");
    await expect(harness.store().getActiveDetachedRun(harness.accessPath)).resolves.toBeUndefined();
  });

  it("marks the run crashed and releases the database when the spawn fails asynchronously", async () => {
    // The real spawn over a child that got a PID, then reports 'error' (ENOENT).
    const child = Object.assign(new EventEmitter(), { pid: RUNNER_PID, unref: () => undefined });
    harness.spawnRunner = (runDir, env, onError) =>
      spawnDetachedTestRunner(runDir, env as NodeJS.ProcessEnv, {
        entryPoint: "missing-cli.js",
        spawnProcess: (() => child) as unknown as typeof spawn,
        onError,
      });
    const tools = harness.tools(harness.adapter(neverEnding));
    const started = await callTool(tools, "test_vba", DETACH);
    expect(started.isError).toBe(false);
    const operationId = String(started.structuredContent?.operationId);

    child.emit("error", Object.assign(new Error("spawn node ENOENT"), { code: "ENOENT" }));

    const view = await eventually(
      () => callTool(tools, "get_test_run", { operationId }),
      (current) => current.structuredContent?.status !== "running",
    );
    expect(view.structuredContent).toMatchObject({
      status: "crashed",
      error: { code: "TEST_RUN_SPAWN_FAILED", message: expect.stringContaining("ENOENT") },
    });
    await expect(harness.store().getActiveDetachedRun(harness.accessPath)).resolves.toBeUndefined();
  });

  it("does not crash a run whose runner already started when a late 'error' arrives", async () => {
    const tools = harness.tools(harness.adapter(neverEnding));
    const started = await callTool(tools, "test_vba", DETACH);
    const operationId = String(started.structuredContent?.operationId);
    await harness.store().updateState(operationId, (state) => ({
      ...state,
      runner: { pid: RUNNER_PID, startTime: null },
    }));

    harness.spawns[0]?.onError(new Error("late kill failure"));
    await new Promise((resolve) => setTimeout(resolve, 50));

    const view = await callTool(tools, "get_test_run", { operationId });
    expect(view.structuredContent?.status).toBe("running");
  });

  it("is refused with TEST_RUN_ALREADY_ACTIVE while a synchronous test_vba drives the database", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    const held = heldExecutor();
    const tools = harness.tools(harness.adapter(held.executor, { operationRegistry: registry }));
    const synchronous = callTool(tools, "test_vba", APPLY);
    await held.running;
    const [record] = await registry.listRecent();

    const detached = await callTool(tools, "test_vba", DETACH);

    expect(detached.isError).toBe(true);
    expect(detached.structuredContent?.error?.code).toBe("TEST_RUN_ALREADY_ACTIVE");
    expect(detached.structuredContent?.error?.details).toMatchObject({
      runKind: "synchronous",
      activeOperationId: record?.operationId,
    });
    expect(harness.spawns).toEqual([]);
    expect(existsSync(join(harness.root, ".dysflow", "runtime", "test-runs"))).toBe(false);

    held.release();
    expect((await synchronous).isError).toBe(false);
  });

  it("starts once the synchronous run's record is no longer live", async () => {
    const registry = new InMemoryAccessOperationRegistry();
    // A record left `running` by a server that died: its Access PID is gone.
    await registry.create({
      operationId: "dysflow-sync-orphan",
      action: "vba",
      accessPath: harness.accessPath,
      accessPid: 9_999,
      processStartTime: null,
      status: "running",
      metadata: { toolName: "test_vba" },
      updatedAt: new Date().toISOString(),
    });
    const tools = harness.tools(harness.adapter(neverEnding, { operationRegistry: registry }));

    const detached = await callTool(tools, "test_vba", DETACH);

    expect(detached.isError).toBe(false);
    expect(harness.spawns).toHaveLength(1);
  });
});

describe("synchronous test_vba around a detached run (#1993 Q1, S6)", () => {
  it("runs exactly as before when no detached run is active", async () => {
    const { executor, calls } = countingExecutor();
    const tools = harness.tools(harness.adapter(executor));

    const result = await callTool(tools, "test_vba", APPLY);

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({ mode: "apply", passed: 2, failed: 0 });
    expect(calls).toHaveLength(1);
    expect(existsSync(join(harness.root, ".dysflow", "runtime", "test-runs"))).toBe(false);
  });

  it("is refused with TEST_RUN_ALREADY_ACTIVE while a detached run holds the database", async () => {
    const { executor, calls } = countingExecutor();
    const tools = harness.tools(harness.adapter(executor));
    const detached = await callTool(tools, "test_vba", DETACH);

    const result = await callTool(tools, "test_vba", APPLY);

    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error?.code).toBe("TEST_RUN_ALREADY_ACTIVE");
    expect(result.structuredContent?.error?.details?.activeOperationId).toBe(
      detached.structuredContent?.operationId,
    );
    expect(calls).toEqual([]);
  });

  it("still runs when the detached-run guard cannot read its lock (S6)", async () => {
    const { executor, calls } = countingExecutor();
    const unreadable = new TestRunStore({
      runsRoot: resolveTestRunsRoot(harness.root),
      fileSystem: {
        ...nodeTestRunFileSystem,
        readText: async () => {
          throw Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" });
        },
      },
      processProbe: harness.processes,
    });
    const tools = harness.tools(harness.adapter(executor, { store: () => unreadable }));

    const result = await callTool(tools, "test_vba", APPLY);

    expect(result.isError).toBe(false);
    expect(result.structuredContent).toMatchObject({ mode: "apply", passed: 2, failed: 0 });
    expect(calls).toHaveLength(1);
  });

  it("runs again once the detached run's runner is gone", async () => {
    const { executor, calls } = countingExecutor();
    const tools = harness.tools(harness.adapter(executor));
    await callTool(tools, "test_vba", DETACH);
    harness.processes.alive.clear();

    const result = await callTool(tools, "test_vba", APPLY);

    expect(result.isError).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("still lets the detached run's own runner drive the database it holds", async () => {
    const tools = harness.tools(harness.adapter(neverEnding));
    const detached = await callTool(tools, "test_vba", DETACH);
    const spawn = harness.spawns[0];
    if (spawn === undefined) throw new Error("the runner was not spawned");
    const { executor, calls } = countingExecutor([true, false]);

    const cli = await harness.runRunner(spawn, executor);

    expect(calls).toHaveLength(1);
    expect(cli.exitCode).toBe(1);
    const view = await harness.store().readTestRun(String(detached.structuredContent?.operationId));
    expect(view).toMatchObject({
      status: "failed",
      progress: { planned: 2 },
      result: { structuredContent: { error: { code: "VBA_TESTS_FAILED" } } },
    });
    await expect(harness.store().getActiveDetachedRun(harness.accessPath)).resolves.toBeUndefined();
  });
});
