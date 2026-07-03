import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VbaManagerExecutor } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { VbaSyncAdapter } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import type {
  AccessOperationRecord,
  AccessOperationRegistry,
} from "../../../src/core/operations/access-operation-registry";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry";

/**
 * Wrapper that records every `update` call and ALSO pre-fills the
 * PowerShell marker file during `create` so the registry record advances
 * to `status: "running"` the moment the orchestrator reads it.
 *
 * The marker file is written before `create` returns, which means it is
 * on disk by the time `transitionToRunning` is called (it runs AFTER
 * startTrackedOperation completes and BEFORE the executor is invoked).
 * This mirrors a real PowerShell process that has already spawned
 * MSACCESS.EXE and written its registration marker.
 *
 * NB: the orchestrator resolves `projectRoot` from `params.projectRoot ??
 * context.destinationRoot ?? context.cwd` (see execution-target.ts:104),
 * so the marker file lives under `<destinationRoot>/.dysflow/runtime/...`
 * in this test, not under `<cwd>/...`.
 */
function createRecordingRegistry(
  destinationRoot: string,
  testPid: number,
  testStartTime: string,
): {
  registry: AccessOperationRegistry;
  updates: Array<{ status: AccessOperationRecord["status"]; accessPid: number | null }>;
} {
  const inner = new InMemoryAccessOperationRegistry();
  const updates: Array<{ status: AccessOperationRecord["status"]; accessPid: number | null }> = [];
  const markersRoot = join(destinationRoot, ".dysflow", "runtime", "markers");
  const recording: AccessOperationRegistry = {
    create: async (record) => {
      // Pre-fill the marker file at the path the orchestrator will read.
      const markerPath = join(markersRoot, `${record.operationId}.json`);
      await mkdir(markersRoot, { recursive: true });
      await writeFile(
        markerPath,
        JSON.stringify({
          operationId: record.operationId,
          accessPid: testPid,
          processStartTime: testStartTime,
        }),
        "utf8",
      );
      return inner.create(record);
    },
    get: (id) => inner.get(id),
    listRecent: (options) => inner.listRecent(options),
    update: async (id, patch) => {
      updates.push({ status: patch.status, accessPid: patch.accessPid ?? null });
      return inner.update(id, patch);
    },
    getHealth: () => inner.getHealth(),
  };
  return { registry: recording, updates };
}

async function cleanMarkerDir(destinationRoot: string): Promise<void> {
  await rm(join(destinationRoot, ".dysflow"), { recursive: true, force: true }).catch(
    () => undefined,
  );
}

describe("VbaSyncAdapter lifecycle transitions", () => {
  it("transitions the registry record to 'running' between start and finish when the marker carries a PID", async () => {
    const destinationRoot = "C:/marker-test/a";
    await cleanMarkerDir(destinationRoot);
    const { registry, updates } = createRecordingRegistry(
      destinationRoot,
      9911,
      "2026-07-03T12:00:00.000Z",
    );
    const executor: VbaManagerExecutor = async () => ({
      exitCode: 0,
      stdout: 'DYSFLOW_RESULT {"ok":true}',
      stderr: "",
      durationMs: 1,
      timedOut: false,
    });

    const service = new VbaSyncAdapter({
      operationRegistry: registry,
      accessPath: "C:/db/front.accdb",
      destinationRoot,
      env: {},
      executor,
    });

    const result = await service.execute("delete_module", { moduleName: "TempModule" });
    await cleanMarkerDir(destinationRoot);

    expect(result.ok).toBe(true);
    // Issue #673: the registry MUST pass through "running" before reaching
    // the final terminal status. The preflight / orphan-ownership guards only
    // protect a record whose status is "running"; if we go straight from
    // "starting" to "completed", an in-flight import can be killed by a
    // confirmPid from a foreign session.
    const sawRunning = updates.some((entry) => entry.status === "running");
    const sawCompleted = updates.some((entry) => entry.status === "completed");
    expect(sawRunning).toBe(true);
    expect(sawCompleted).toBe(true);
  });

  it("records the PID captured at the 'running' transition (so orphan-ownership guards have a non-null PID)", async () => {
    const destinationRoot = "C:/marker-test/b";
    await cleanMarkerDir(destinationRoot);
    const { registry, updates } = createRecordingRegistry(
      destinationRoot,
      7711,
      "2026-07-03T13:00:00.000Z",
    );
    const executor: VbaManagerExecutor = async () => ({
      exitCode: 0,
      stdout: 'DYSFLOW_RESULT {"ok":true}',
      stderr: "",
      durationMs: 1,
      timedOut: false,
    });

    const service = new VbaSyncAdapter({
      operationRegistry: registry,
      accessPath: "C:/db/front.accdb",
      destinationRoot,
      env: {},
      executor,
    });

    const result = await service.execute("delete_module", { moduleName: "TempModule" });
    await cleanMarkerDir(destinationRoot);

    expect(result.ok).toBe(true);
    const runningEntry = updates.find((entry) => entry.status === "running");
    expect(runningEntry).toBeDefined();
    // When the transition fires, the PID MUST already be populated — otherwise
    // the preflight guard cannot identify which PID is owned by the operation.
    expect(runningEntry?.accessPid).toBe(7711);
  });

  it("still finishes cleanly to 'completed' when transitioning through 'running'", async () => {
    const destinationRoot = "C:/marker-test/c";
    await cleanMarkerDir(destinationRoot);
    const { registry, updates } = createRecordingRegistry(
      destinationRoot,
      5511,
      "2026-07-03T14:00:00.000Z",
    );
    const executor: VbaManagerExecutor = async () => ({
      exitCode: 0,
      stdout: 'DYSFLOW_RESULT {"ok":true}',
      stderr: "",
      durationMs: 1,
      timedOut: false,
    });

    const service = new VbaSyncAdapter({
      operationRegistry: registry,
      accessPath: "C:/db/front.accdb",
      destinationRoot,
      env: {},
      executor,
    });

    const result = await service.execute("delete_module", { moduleName: "TempModule" });
    await cleanMarkerDir(destinationRoot);

    expect(result.ok).toBe(true);
    // Terminal status must be reached AFTER the running transition.
    const transitionOrder = updates.map((entry) => entry.status);
    const runningIndex = transitionOrder.indexOf("running");
    const completedIndex = transitionOrder.indexOf("completed");
    expect(runningIndex).toBeGreaterThanOrEqual(0);
    expect(completedIndex).toBeGreaterThan(runningIndex);
    await expect(registry.listRecent()).resolves.toEqual([]);
  });

  it("does not transition to 'running' when the marker file is missing (PowerShell has not written it yet)", async () => {
    // Worst case: the executor's PowerShell process has not yet emitted the
    // marker file. transitionToRunning MUST no-op so it does not corrupt the
    // record; finishTrackedOperation will still produce the final terminal
    // status (with whatever PID is eventually recorded by the marker).
    const destinationRoot = "C:/marker-test/d";
    await cleanMarkerDir(destinationRoot);
    const inner = new InMemoryAccessOperationRegistry();
    const updates: Array<{ status: AccessOperationRecord["status"]; accessPid: number | null }> =
      [];
    const registry: AccessOperationRegistry = {
      create: (record) => inner.create(record),
      get: (id) => inner.get(id),
      listRecent: (options) => inner.listRecent(options),
      update: async (id, patch) => {
        updates.push({ status: patch.status, accessPid: patch.accessPid ?? null });
        return inner.update(id, patch);
      },
      getHealth: () => inner.getHealth(),
    };

    const executor: VbaManagerExecutor = async () => ({
      exitCode: 0,
      stdout: 'DYSFLOW_RESULT {"ok":true}',
      stderr: "",
      durationMs: 1,
      timedOut: false,
    });

    const service = new VbaSyncAdapter({
      operationRegistry: registry,
      accessPath: "C:/db/front.accdb",
      destinationRoot,
      env: {},
      executor,
    });

    const result = await service.execute("delete_module", { moduleName: "TempModule" });
    await cleanMarkerDir(destinationRoot);

    expect(result.ok).toBe(true);
    // No marker file = no running transition. Terminal status is still reached.
    const sawRunning = updates.some((entry) => entry.status === "running");
    const sawCompleted = updates.some((entry) => entry.status === "completed");
    expect(sawRunning).toBe(false);
    expect(sawCompleted).toBe(true);
  });
});
