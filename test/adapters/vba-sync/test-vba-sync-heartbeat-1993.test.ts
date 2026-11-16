/**
 * #1993 S2 (R3-null-pid-sync-window) — a synchronous `test_vba` whose Access
 * PID is not attributed yet keeps its registry record fresh while it runs, so
 * a detached start on the same database is refused for as long as the run
 * lives, even inside one test longer than the registry's start window. The
 * refresh stops with the run: nothing is written after its terminal update.
 *
 * Driven through the real MCP `test_vba` tool, the real `VbaSyncAdapter`, an
 * in-memory registry and the real run store over a temporary project. Only
 * Access (the PowerShell executor), the detached spawn, process liveness and
 * the wall clock are faked.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VbaManagerExecutor } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import {
  type AccessOperationRecord,
  DEFAULT_STARTING_STALE_MS,
  InMemoryAccessOperationRegistry,
} from "../../../src/core/operations/access-operation-registry";
import {
  callTool,
  DetachedRunHarness,
  exited,
  PROCEDURES_JSON,
  runnerStdout,
} from "../../_helpers/detached-test-runs-1993";

const APPLY = { proceduresJson: PROCEDURES_JSON, apply: true };
const DETACH = { ...APPLY, detach: true };

let harness: DetachedRunHarness;

beforeEach(() => {
  harness = new DetachedRunHarness();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-05T09:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  harness.dispose();
});

/** A sync run whose Access never reports its PID; it ends when `finish` is called. */
function blockedExecutor() {
  let started: () => void = () => undefined;
  const hasStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let finish: () => void = () => undefined;
  const executor: VbaManagerExecutor = () => {
    started();
    return new Promise((resolve) => {
      finish = () => resolve(exited(runnerStdout([true, true])));
    });
  };
  return { executor, hasStarted, finish: () => finish() };
}

/** Records every registry write, so a write after the terminal update is visible. */
class RecordingRegistry extends InMemoryAccessOperationRegistry {
  readonly writes: Array<Partial<AccessOperationRecord>> = [];

  override async update(operationId: string, patch: Partial<AccessOperationRecord>) {
    this.writes.push(patch);
    return super.update(operationId, patch);
  }
}

const realDelay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("a live synchronous run without an Access PID (R3-null-pid-sync-window)", () => {
  it("still refuses a detached start after one test outlasts the registry start window", async () => {
    const registry = new RecordingRegistry();
    const run = blockedExecutor();
    const tools = harness.tools(harness.adapter(run.executor, { operationRegistry: registry }));

    const synchronous = callTool(tools, "test_vba", APPLY);
    await run.hasStarted;
    // One test runs past the window: no progress and no PID reach the marker.
    vi.setSystemTime(Date.now() + DEFAULT_STARTING_STALE_MS + 10_000);
    await realDelay(100);

    const detached = await callTool(tools, "test_vba", DETACH);

    expect(detached.isError).toBe(true);
    expect(detached.structuredContent?.error).toMatchObject({
      code: "TEST_RUN_ALREADY_ACTIVE",
      details: { runKind: "synchronous" },
    });
    expect(harness.spawns).toEqual([]);
    run.finish();
    await synchronous;
  });

  it("writes nothing to the registry after the run's terminal update", async () => {
    const registry = new RecordingRegistry();
    const run = blockedExecutor();
    const tools = harness.tools(harness.adapter(run.executor, { operationRegistry: registry }));

    const synchronous = callTool(tools, "test_vba", APPLY);
    await run.hasStarted;
    vi.setSystemTime(Date.now() + DEFAULT_STARTING_STALE_MS + 10_000);
    await realDelay(50);
    run.finish();
    await synchronous;
    const writesAtEnd = registry.writes.length;
    vi.setSystemTime(Date.now() + DEFAULT_STARTING_STALE_MS + 10_000);
    await realDelay(100);

    expect(registry.writes.length).toBe(writesAtEnd);
    const [record] = await registry.listRecent();
    expect(record?.status).not.toBe("starting");
    expect(record?.status).not.toBe("running");
  });
});
