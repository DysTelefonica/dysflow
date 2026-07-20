import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { VbaManagerExecutor } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { VbaSyncAdapter } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import type {
  ProcessInspector,
  ProcessKiller,
} from "../../../src/core/operations/access-operation-cleanup";
import type {
  AccessOperationPreflightCleanup,
  AccessOperationPreflightCleanupResult,
} from "../../../src/core/operations/access-operation-preflight";
import type {
  AccessOperationRecord,
  AccessOperationRegistry,
} from "../../../src/core/operations/access-operation-registry";
import { InMemoryAccessOperationRegistry } from "../../../src/core/operations/access-operation-registry";

/**
 * Issue #1016 Part A — the import-gate failure path leaks MSACCESS
 * instances alive when the PowerShell runner's `finally` block runs
 * `Close-AccessDatabase` but `Stop-AccessPidAndWait` returns `false`
 * (process still alive). The fix is at the vba-sync-adapter level:
 * after a non-timeout failure for a binary-mutating tool, drive the
 * orphan-killer against the operation's recorded accessPid so the
 * runtime ALWAYS releases the spawned MSACCESS before propagating
 * the error envelope.
 *
 * This is the contract the issue's Recommended Implementation Direction
 * Part A is pinning: even when the runner-level teardown is best-effort
 * and may fail silently, the vba-sync-adapter MUST guarantee the
 * accessPid is reaped on the failure path.
 *
 * The mirror case (success path) MUST NOT issue a redundant kill — the
 * runner's `finally` already closed the MSACCESS, and the adapter must
 * not double-kill a process it does not own.
 */

const ACCESS_PATH = "C:/db/front.accdb";
const DESTINATION_ROOT = "C:/repo/src";

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
      // Pre-fill the marker file at the path the orchestrator will read,
      // mirroring a real PowerShell process that has spawned MSACCESS
      // and written its registration marker.
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
      if (patch.status !== undefined) {
        updates.push({ status: patch.status, accessPid: patch.accessPid ?? null });
      }
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

function buildAdapter(options: {
  registry: AccessOperationRegistry;
  executor: VbaManagerExecutor;
  processInspector?: ProcessInspector;
  processKiller?: ProcessKiller;
  preflightCleanup?: AccessOperationPreflightCleanup;
}): VbaSyncAdapter {
  return new VbaSyncAdapter({
    operationRegistry: options.registry,
    accessPath: ACCESS_PATH,
    destinationRoot: DESTINATION_ROOT,
    env: {},
    executor: options.executor,
    ...(options.processInspector !== undefined
      ? { processInspector: options.processInspector }
      : {}),
    ...(options.processKiller !== undefined ? { processKiller: options.processKiller } : {}),
    ...(options.preflightCleanup !== undefined
      ? { preflightCleanup: options.preflightCleanup }
      : {}),
  });
}

describe("vba-sync-adapter — #1016 Part A reaps the spawned MSACCESS on a non-timeout failure", () => {
  it("import_modules failure path drives the orphan-killer against the tracked accessPid", async () => {
    const destinationRoot = DESTINATION_ROOT;
    await cleanMarkerDir(destinationRoot);
    const trackedPid = 16224;
    const trackedStartTime = "2026-07-20T13:05:56.000Z";
    const { registry, updates } = createRecordingRegistry(
      destinationRoot,
      trackedPid,
      trackedStartTime,
    );
    const killed: number[] = [];
    const preflightCleanup: AccessOperationPreflightCleanup = {
      cleanup: async () => {
        killed.push(trackedPid);
        const result: AccessOperationPreflightCleanupResult = {
          cleaned: [],
          killed: [trackedPid],
          orphanedKilled: [],
          errors: [],
          transitioned: [],
        };
        return result;
      },
    };

    const executor: VbaManagerExecutor = async () => ({
      exitCode: 1,
      stdout: `DYSFLOW_RESULT {"ok":false,"error":{"code":"VBA_IMPORT_FAILED","message":"LoadFromText conflict"}}`,
      stderr: "active lock detected",
      durationMs: 250,
      timedOut: false,
    });

    const adapter = buildAdapter({ registry, executor, preflightCleanup });

    const result = await adapter.execute("import_modules", {
      moduleNames: ["FormGestionRiesgos"],
      apply: true,
    });

    await cleanMarkerDir(destinationRoot);

    expect(result.ok).toBe(false);
    expect(killed).toContain(trackedPid);
    const failedEntry = updates.find((entry) => entry.status === "failed");
    expect(failedEntry).toBeDefined();
    expect(failedEntry?.accessPid).toBe(trackedPid);
  });
});

// (Other describe block follows.)

describe("vba-sync-adapter — #1016 Part A does NOT reap on the success path", () => {
  it("does NOT reap when the import_modules operation succeeded (no leak when nothing failed)", async () => {
    const destinationRoot = DESTINATION_ROOT;
    await cleanMarkerDir(destinationRoot);
    const trackedPid = 7777;
    const trackedStartTime = "2026-07-20T13:05:56.000Z";
    const { registry } = createRecordingRegistry(destinationRoot, trackedPid, trackedStartTime);
    const killed: number[] = [];
    const killer: ProcessKiller = {
      kill: async (pid: number) => {
        killed.push(pid);
      },
    };
    const executor: VbaManagerExecutor = async () => ({
      exitCode: 0,
      stdout: `DYSFLOW_RESULT ${JSON.stringify([
        {
          module: "FormCustomer",
          status: "ok",
          phase: null,
          error: null,
          durationMs: 5,
          rollbackApplied: false,
          fallbackUsed: false,
          fallbackReason: null,
        },
      ])}`,
      stderr: "",
      durationMs: 5,
      timedOut: false,
    });

    const adapter = buildAdapter({ registry, executor, processKiller: killer });

    const result = await adapter.execute("import_modules", {
      moduleNames: ["FormCustomer"],
      apply: true,
    });

    await cleanMarkerDir(destinationRoot);

    expect(result.ok).toBe(true);
    // On success, the runner already closed its MSACCESS via the
    // finally block — the adapter MUST NOT issue a redundant kill.
    expect(killed).toEqual([]);
  });
});
