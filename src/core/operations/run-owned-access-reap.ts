import {
  type ProcessInspector,
  type ProcessKiller,
  sameProcessStartTime,
} from "./access-operation-cleanup.js";

/**
 * The Access process a single run recorded in its operation marker: the PID
 * Open-AccessDatabase captured and that process's start time.
 */
export type RunOwnedAccess = {
  accessPid?: number;
  processStartTime?: string;
};

export type RunOwnedAccessReapResult =
  | { outcome: "not_recorded" }
  | { outcome: "exited"; pid: number }
  | { outcome: "killed"; pid: number }
  | { outcome: "refused"; pid: number; reason: string }
  | { outcome: "inspect_failed"; pid: number; reason: string }
  | { outcome: "kill_failed"; pid: number; reason: string };

/**
 * Issue #1911: a run that ends without closing its Access (a timeout kills the
 * PowerShell tree, but a COM-activated MSACCESS.EXE is a DCOM child that survives
 * it) must not leave that Access behind.
 *
 * Kills ONLY the PID the run recorded, and only while it is provably the same
 * process: still MSACCESS.EXE with the recorded start time. A PID that is gone or
 * was reused by another process is reported as `exited` and left alone. Without a
 * recorded start time ownership cannot be proven, so the kill is refused. Never
 * throws: every failure is an outcome the caller records.
 */
export async function reapRunOwnedAccess(
  owned: RunOwnedAccess,
  ports: { processInspector: ProcessInspector; processKiller: ProcessKiller },
): Promise<RunOwnedAccessReapResult> {
  const pid = owned.accessPid;
  if (pid === undefined) return { outcome: "not_recorded" };

  let process: Awaited<ReturnType<ProcessInspector["getProcess"]>>;
  try {
    process = await ports.processInspector.getProcess(pid);
  } catch (error) {
    return { outcome: "inspect_failed", pid, reason: formatError(error) };
  }

  if (
    process === undefined ||
    process.name.toUpperCase() !== "MSACCESS.EXE" ||
    (owned.processStartTime !== undefined &&
      !sameProcessStartTime(process.startTime, owned.processStartTime))
  ) {
    return { outcome: "exited", pid };
  }

  if (owned.processStartTime === undefined) {
    return {
      outcome: "refused",
      pid,
      reason: "the run recorded no process start time, so ownership of the PID cannot be proven",
    };
  }

  try {
    await ports.processKiller.kill(pid);
  } catch (error) {
    return { outcome: "kill_failed", pid, reason: formatError(error) };
  }
  return { outcome: "killed", pid };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
