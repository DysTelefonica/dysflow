/**
 * Issue #2017 — `cleanup_access_operation` must be able to terminate the
 * hidden Access that a timed-out dysflow operation launched.
 *
 * The inspector here feeds the cleanup service exactly what the Windows
 * process probe prints for such a process (observed on Windows 11 / Office 16,
 * PowerShell 5.1): the CIM query runs inside `Start-Job`, so `CreationDate`
 * comes back through `Receive-Job` as a deserialized DateTime and
 * `ConvertTo-Json` writes it as `"\/Date(<ms>)\/"`; an automation instance
 * started by `New-Object -ComObject Access.Application` has the command line
 * `MSACCESS.EXE -Embedding`, which names no database.
 */
import { describe, expect, it } from "vitest";
import type {
  ProcessInspector,
  ProcessKiller,
} from "../../../src/core/operations/access-operation-cleanup.js";
import { AccessOperationCleanupService } from "../../../src/core/operations/access-operation-cleanup.js";
import {
  type AccessOperationRecord,
  InMemoryAccessOperationRegistry,
} from "../../../src/core/operations/access-operation-registry.js";
import { normalizeProcessList } from "../../../src/core/operations/windows-processes.js";

const CREATION_MS = 1795606461735;
const CREATION_ISO = new Date(CREATION_MS).toISOString();

/** The probe's stdout for a live dysflow-launched Access, byte for byte in shape. */
function probeStdout(pid: number, creationMs: number, commandLine: string): string {
  return (
    `{"ProcessId":${pid},"Name":"MSACCESS.EXE","CreationDate":"\\/Date(${creationMs})\\/",` +
    `"CommandLine":${JSON.stringify(commandLine)},"MainWindowHandle":0}`
  );
}

const EMBEDDING = '"C:\\Program Files\\Microsoft Office\\Root\\Office16\\MSACCESS.EXE" -Embedding';

/** Alive until killed, then gone — reads through the real probe parser. */
function probeInspector(stdout: string, killed: number[]): ProcessInspector {
  return {
    getProcess: async (pid) => (killed.includes(pid) ? undefined : normalizeProcessList(stdout)[0]),
  };
}

function recordingKiller(): { killer: ProcessKiller; killed: number[] } {
  const killed: number[] = [];
  return { killer: { kill: async (pid) => void killed.push(pid) }, killed };
}

const TIMED_OUT_RECORD: AccessOperationRecord = {
  operationId: "op-2017",
  action: "query",
  accessPath: "C:\\apps\\CONDOR.accdb",
  projectRootAbs: "C:/apps",
  destinationRootAbs: "C:/apps/src",
  accessPid: 4516,
  // The runner records the start time as ISO and no command line.
  processStartTime: CREATION_ISO,
  commandLine: undefined,
  status: "timed_out",
  metadata: {},
  updatedAt: CREATION_ISO,
};

async function cleanupWith(
  record: AccessOperationRecord,
  inspector: ProcessInspector,
  killer: ProcessKiller,
) {
  const registry = new InMemoryAccessOperationRegistry();
  await registry.create(record);
  const service = new AccessOperationCleanupService({
    registry,
    processInspector: inspector,
    processKiller: killer,
  });
  const result = await service.cleanup({
    operationId: record.operationId,
    accessPath: record.accessPath,
    force: true,
  });
  return { result, stored: await registry.get(record.operationId) };
}

describe("Issue #2017 — the process probe's start time", () => {
  it("reads the \\/Date(ms)\\/ form the probe prints as the process start time", () => {
    const [process] = normalizeProcessList(probeStdout(4516, CREATION_MS, EMBEDDING));
    expect(process?.startTime).toBe(CREATION_ISO);
  });
});

describe("Issue #2017 — cleanup_access_operation force:true on the Access dysflow launched", () => {
  it("kills the timed-out operation's Access and marks the operation cleaned", async () => {
    const { killer, killed } = recordingKiller();
    const inspector = probeInspector(probeStdout(4516, CREATION_MS, EMBEDDING), killed);

    const { result, stored } = await cleanupWith(TIMED_OUT_RECORD, inspector, killer);

    expect(result.ok, JSON.stringify(result)).toBe(true);
    expect(result.ok ? result.data : undefined).toEqual({
      operationId: "op-2017",
      accessPid: 4516,
      status: "cleaned",
    });
    expect(killed).toEqual([4516]);
    // A cleaned operation leaves the registry (cleaned records are purged).
    expect(stored).toBeUndefined();
  });

  it("still refuses an Access whose command line opens a different database", async () => {
    const { killer, killed } = recordingKiller();
    const otherDb =
      '"C:\\Program Files\\Microsoft Office\\Root\\Office16\\MSACCESS.EXE" "C:\\other\\Ventas.accdb"';
    const inspector = probeInspector(probeStdout(4516, CREATION_MS, otherDb), killed);

    const { result, stored } = await cleanupWith(TIMED_OUT_RECORD, inspector, killer);

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.code).toBe("CLEANUP_COMMAND_LINE_MISMATCH");
    expect(killed).toEqual([]);
    expect(stored?.status).toBe("timed_out");
  });

  it("refuses an -Embedding command line that also names a different database", async () => {
    const { killer, killed } = recordingKiller();
    const otherDbEmbedding =
      '"C:\\Program Files\\Microsoft Office\\Root\\Office16\\MSACCESS.EXE" "C:\\other\\Other.accdb" /Embedding';
    const inspector = probeInspector(probeStdout(4516, CREATION_MS, otherDbEmbedding), killed);

    const { result } = await cleanupWith(TIMED_OUT_RECORD, inspector, killer);

    expect(result.ok ? undefined : result.error.code).toBe("CLEANUP_COMMAND_LINE_MISMATCH");
    expect(killed).toEqual([]);
  });

  it("still refuses a process started at another time under the same PID", async () => {
    const { killer, killed } = recordingKiller();
    const inspector = probeInspector(probeStdout(4516, CREATION_MS + 60_000, EMBEDDING), killed);

    const { result } = await cleanupWith(TIMED_OUT_RECORD, inspector, killer);

    expect(result.ok ? undefined : result.error.code).toBe("CLEANUP_PROCESS_START_TIME_MISMATCH");
    expect(killed).toEqual([]);
  });

  it("returns a typed error, not a thrown one, when the process probe itself fails", async () => {
    const { killer, killed } = recordingKiller();
    const inspector: ProcessInspector = {
      getProcess: async () => {
        throw new Error("Command failed: powershell.exe -NoProfile -NonInteractive -Command ...");
      },
    };

    const { result, stored } = await cleanupWith(TIMED_OUT_RECORD, inspector, killer);

    expect(result.ok).toBe(false);
    expect(result.ok ? undefined : result.error.code).toBe("CLEANUP_INSPECTION_FAILED");
    expect(killed).toEqual([]);
    expect(stored?.status).toBe("timed_out");
  });
});
