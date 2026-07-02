import type { Diagnostic } from "../contracts/index.js";
import { createDiagnostic } from "../contracts/index.js";
import { normalizePathForMatching, pathMatchesAccessPath } from "../utils/index.js";
import type {
  OsProcessInfo,
  ProcessInspector,
  ProcessKiller,
  ProcessScanner,
} from "./access-operation-cleanup.js";
import { sameProcessStartTime } from "./access-operation-cleanup.js";
import {
  type AccessOperationRecord,
  type AccessOperationRegistry,
  DEFAULT_STARTING_STALE_MS,
  INTERRUPTED_BEFORE_PID_REASON,
  isInterruptedStartingRecord,
} from "./access-operation-registry.js";
// #B.2 (hexagonal-tech-debt, #624): single-source ELIGIBLE_STATUSES.
// Imported locally for runtime use and re-exported so callers can
// `import { ELIGIBLE_STATUSES } from "..."` from either this module or the
// canonical `access-operation-status` and observe Object.is(...) strict identity.
import { ELIGIBLE_STATUSES } from "./access-operation-status.js";

export { ELIGIBLE_STATUSES };

export type AccessOperationPreflightCleanupRequest = {
  accessPath: string;
  projectRoot: string;
};

export type AccessOperationPreflightCleanupError = {
  operationId: string;
  message: string;
};

export type AccessOperationPreflightCleanupResult = {
  cleaned: string[];
  killed: number[];
  orphanedKilled: number[];
  errors: AccessOperationPreflightCleanupError[];
  /**
   * Operations transitioned out of a stuck state without any process action
   * (e.g. an interrupted "starting" record marked failed). Registry-only
   * bookkeeping — nothing was killed. Optional so existing preflight doubles
   * that predate this field still satisfy the contract.
   */
  transitioned?: string[];
};

export type AccessOperationPreflightCleanup = {
  cleanup(
    request: AccessOperationPreflightCleanupRequest,
  ): Promise<AccessOperationPreflightCleanupResult>;
};

const DEFAULT_OPERATION_TIMEOUT_MS = 3_000;

export class AccessOperationPreflightCleanupService implements AccessOperationPreflightCleanup {
  constructor(
    private readonly options: {
      registry: AccessOperationRegistry;
      processInspector: ProcessInspector;
      processKiller: ProcessKiller;
      processScanner?: ProcessScanner;
      operationTimeoutMs?: number;
      clock?: () => string;
      startingStaleMs?: number;
    },
  ) {}

  private nowMs(): number {
    return Date.parse((this.options.clock ?? (() => new Date().toISOString()))());
  }

  private get startingStaleMs(): number {
    return this.options.startingStaleMs ?? DEFAULT_STARTING_STALE_MS;
  }

  async cleanup(
    request: AccessOperationPreflightCleanupRequest,
  ): Promise<AccessOperationPreflightCleanupResult> {
    const result: AccessOperationPreflightCleanupResult = {
      cleaned: [],
      killed: [],
      orphanedKilled: [],
      errors: [],
      transitioned: [],
    };
    let records: AccessOperationRecord[];
    try {
      records = await this.options.registry.listRecent({ limit: 1000 });
    } catch (error) {
      result.errors.push({
        operationId: "registry",
        message: `Failed to list Access operations: ${formatError(error)}`,
      });
      return result;
    }

    const handledPids = new Set<number>();

    for (const record of records) {
      if (!this.matchesScope(record, request)) continue;

      // An interrupted "starting" record never owned a PID; once stale it is
      // transitioned to "failed" as registry-only bookkeeping. No process is
      // inspected or killed here — there is no owned PID to act on.
      if (isInterruptedStartingRecord(record, this.nowMs(), this.startingStaleMs)) {
        await this.markInterruptedStartingFailed(record, result);
        continue;
      }

      if (record.status === "running" && record.accessPid !== null) {
        await this.reconcileRunningRecord(record, result, handledPids);
        continue;
      }

      if (!ELIGIBLE_STATUSES.has(record.status)) continue;

      await this.cleanupRecord(record, result, handledPids);
    }

    if (this.options.processScanner) {
      await this.scanAndCleanOrphans(this.options.processScanner, request, result, handledPids);
    }

    return result;
  }

  private matchesScope(
    record: AccessOperationRecord,
    request: AccessOperationPreflightCleanupRequest,
  ): boolean {
    return (
      normalizePathForMatching(record.accessPath) ===
        normalizePathForMatching(request.accessPath) &&
      normalizePathForMatching(record.projectRootAbs ?? "") ===
        normalizePathForMatching(request.projectRoot)
    );
  }

  private async cleanupRecord(
    record: AccessOperationRecord,
    result: AccessOperationPreflightCleanupResult,
    handledPids: Set<number>,
  ): Promise<void> {
    if (record.accessPid === null || record.processStartTime === null) {
      await this.retireUnownedRecord(record, result, handledPids);
      return;
    }

    let process: OsProcessInfo | undefined;
    try {
      process = await withTimeout(
        this.options.processInspector.getProcess(record.accessPid),
        this.options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS,
      );
    } catch (error) {
      result.errors.push({
        operationId: record.operationId,
        message: `Failed to inspect process ${record.accessPid}: ${formatError(error)}`,
      });
      return;
    }

    if (process === undefined) {
      await this.markCleaned(record, result);
      return;
    }

    if (process.name.toUpperCase() !== "MSACCESS.EXE") {
      result.errors.push({
        operationId: record.operationId,
        message: `Refused to kill PID ${record.accessPid} because it is ${process.name}.`,
      });
      return;
    }

    if (!sameProcessStartTime(process.startTime, record.processStartTime)) {
      result.errors.push({
        operationId: record.operationId,
        message: `Refused to kill PID ${record.accessPid} because processStartTime differs from the registry.`,
      });
      return;
    }

    handledPids.add(record.accessPid);

    try {
      await withTimeout(
        this.options.processKiller.kill(record.accessPid),
        this.options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS,
      );
      result.killed.push(record.accessPid);
    } catch (error) {
      result.errors.push({
        operationId: record.operationId,
        message: `Failed to kill process ${record.accessPid}: ${formatError(error)}`,
      });
      return;
    }

    await this.markCleaned(record, result);
  }

  private async reconcileRunningRecord(
    record: AccessOperationRecord,
    result: AccessOperationPreflightCleanupResult,
    handledPids: Set<number>,
  ): Promise<void> {
    // record.accessPid is guaranteed non-null by the call site.
    const pid = record.accessPid as number;

    let process: OsProcessInfo | undefined;
    try {
      process = await withTimeout(
        this.options.processInspector.getProcess(pid),
        this.options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS,
      );
    } catch (error) {
      result.errors.push({
        operationId: record.operationId,
        message: `Failed to inspect process ${pid}: ${formatError(error)}`,
      });
      return;
    }

    const pidIsGone =
      process === undefined ||
      process.name.toUpperCase() !== "MSACCESS.EXE" ||
      !sameProcessStartTime(process.startTime, record.processStartTime);

    if (pidIsGone) {
      // Original process is verifiably gone (PID not found, reused, or different name).
      // Mark cleaned without killing anything.
      await this.markCleaned(record, result);
      return;
    }

    // Process is alive, correct name, correct startTime — a legitimately running operation.
    // Register active process PID
    handledPids.add(pid);
  }

  private async scanAndCleanOrphans(
    scanner: ProcessScanner,
    request: AccessOperationPreflightCleanupRequest,
    result: AccessOperationPreflightCleanupResult,
    handledPids: Set<number>,
  ): Promise<void> {
    let processes: OsProcessInfo[];
    try {
      processes = await withTimeout(
        scanner.listProcesses(),
        this.options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS,
      );
    } catch (error) {
      result.errors.push({
        operationId: "orphan_scanner",
        message: `Failed to enumerate processes: ${formatError(error)}`,
      });
      return;
    }

    for (const process of processes) {
      if (process.name.toUpperCase() !== "MSACCESS.EXE") continue;
      if (handledPids.has(process.pid)) continue;

      if (process.commandLine === undefined) continue;
      if (!pathMatchesAccessPath(process.commandLine, request.accessPath)) continue;

      // F1 (#620): gate headless detection on mainWindowHandle, not the `-embedding`
      // substring (which could match a project path). Mirrors access-orphan-cleanup.
      if (process.mainWindowHandle === undefined) {
        result.errors.push({
          operationId: "orphan",
          message: `Refused to kill PID ${process.pid}: mainWindowHandle is undefined (Get-Process fallback — cannot prove headless).`,
        });
        continue;
      }
      if (process.mainWindowHandle !== 0) {
        const handleHex = `0x${process.mainWindowHandle.toString(16).toUpperCase()}`;
        result.errors.push({
          operationId: "orphan",
          message: `Refused to kill PID ${process.pid}: mainWindowHandle is ${handleHex}, not 0 (visible Access window — not headless).`,
        });
        continue;
      }

      // F3a (#620): revalidate PID immediately before kill to close the TOCTOU race.
      // The PID may have been recycled between scan and kill (killing an unrelated
      // process) or the original process may have exited. Mirrors the
      // `access-orphan-cleanup.ts:124-141` pattern. Suppress kill on gone; refuse
      // with the `CLEANUP_RACE_PID_REUSED` diagnostic on mismatch.
      let revalidated: OsProcessInfo | undefined;
      try {
        revalidated = await withTimeout(
          this.options.processInspector.getProcess(process.pid),
          this.options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS,
        );
      } catch {
        // Timeout on revalidation: cannot prove the process is still the scanned
        // MSACCESS.EXE — suppress kill rather than risk killing a recycled PID.
        result.errors.push({
          operationId: "orphan",
          message: `Preflight kill suppressed for PID ${process.pid}: revalidation timed out.`,
        });
        continue;
      }
      if (revalidated === undefined) {
        result.errors.push({
          operationId: "orphan",
          message: `Preflight kill suppressed for PID ${process.pid}: process no longer exists.`,
        });
        continue;
      }
      if (
        revalidated.name.toUpperCase() !== "MSACCESS.EXE" ||
        !sameProcessStartTime(revalidated.startTime, process.startTime)
      ) {
        result.errors.push({
          operationId: "orphan",
          message: `CLEANUP_RACE_PID_REUSED: PID ${process.pid} is no longer the scanned MSACCESS.EXE (revalidation mismatch).`,
        });
        continue;
      }

      try {
        await withTimeout(
          this.options.processKiller.kill(process.pid),
          this.options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS,
        );
        result.orphanedKilled.push(process.pid);
        handledPids.add(process.pid);
      } catch (error) {
        result.errors.push({
          operationId: "orphan",
          message: `Failed to kill unattributed headless process ${process.pid}: ${formatError(error)}`,
        });
      }
    }
  }

  private async markInterruptedStartingFailed(
    record: AccessOperationRecord,
    result: AccessOperationPreflightCleanupResult,
  ): Promise<void> {
    try {
      await this.options.registry.update(record.operationId, {
        status: "failed",
        metadata: { ...record.metadata, interruptedReason: INTERRUPTED_BEFORE_PID_REASON },
        updatedAt: (this.options.clock ?? (() => new Date().toISOString()))(),
      });
      if (result.transitioned === undefined) {
        result.transitioned = [];
      }
      result.transitioned.push(record.operationId);
    } catch (error) {
      result.errors.push({
        operationId: record.operationId,
        message: `Failed to mark interrupted operation failed: ${formatError(error)}`,
      });
    }
  }

  private async markCleaned(
    record: AccessOperationRecord,
    result: AccessOperationPreflightCleanupResult,
  ): Promise<void> {
    try {
      await this.options.registry.update(record.operationId, {
        status: "cleaned",
        updatedAt: (this.options.clock ?? (() => new Date().toISOString()))(),
      });
      result.cleaned.push(record.operationId);
    } catch (error) {
      result.errors.push({
        operationId: record.operationId,
        message: `Failed to mark operation cleaned: ${formatError(error)}`,
      });
    }
  }

  private async retireUnownedRecord(
    record: AccessOperationRecord,
    result: AccessOperationPreflightCleanupResult,
    handledPids: Set<number>,
  ): Promise<void> {
    if (this.options.processScanner === undefined) {
      result.errors.push({
        operationId: record.operationId,
        message:
          "Refused to mark operation cleaned because it has no owned Access PID and processes cannot be scanned.",
      });
      return;
    }

    let processes: OsProcessInfo[];
    try {
      processes = await withTimeout(
        this.options.processScanner.listProcesses(),
        this.options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS,
      );
    } catch (error) {
      result.errors.push({
        operationId: record.operationId,
        message: `Failed to enumerate processes: ${formatError(error)}`,
      });
      return;
    }

    const matchingProcess = processes.find(
      (process) =>
        process.name.toUpperCase() === "MSACCESS.EXE" &&
        process.commandLine !== undefined &&
        pathMatchesAccessPath(process.commandLine, record.accessPath),
    );
    if (matchingProcess !== undefined) {
      handledPids.add(matchingProcess.pid);
      // F1 (#620): see mirror in scanAndCleanOrphans above.
      if (matchingProcess.mainWindowHandle === undefined) {
        result.errors.push({
          operationId: record.operationId,
          message: `Refused to kill PID ${matchingProcess.pid}: mainWindowHandle is undefined (Get-Process fallback — cannot prove headless).`,
        });
        return;
      }
      if (matchingProcess.mainWindowHandle !== 0) {
        const handleHex = `0x${matchingProcess.mainWindowHandle.toString(16).toUpperCase()}`;
        result.errors.push({
          operationId: record.operationId,
          message: `Refused to kill PID ${matchingProcess.pid}: mainWindowHandle is ${handleHex}, not 0 (visible Access window — not headless).`,
        });
        return;
      }
      // F3a (#620): see mirror in scanAndCleanOrphans above — revalidate PID
      // immediately before kill to close the TOCTOU race.
      let revalidated: OsProcessInfo | undefined;
      try {
        revalidated = await withTimeout(
          this.options.processInspector.getProcess(matchingProcess.pid),
          this.options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS,
        );
      } catch {
        result.errors.push({
          operationId: record.operationId,
          message: `Preflight kill suppressed for PID ${matchingProcess.pid}: revalidation timed out.`,
        });
        return;
      }
      if (revalidated === undefined) {
        result.errors.push({
          operationId: record.operationId,
          message: `Preflight kill suppressed for PID ${matchingProcess.pid}: process no longer exists.`,
        });
        return;
      }
      if (
        revalidated.name.toUpperCase() !== "MSACCESS.EXE" ||
        !sameProcessStartTime(revalidated.startTime, matchingProcess.startTime)
      ) {
        result.errors.push({
          operationId: record.operationId,
          message: `CLEANUP_RACE_PID_REUSED: PID ${matchingProcess.pid} is no longer the scanned MSACCESS.EXE (revalidation mismatch).`,
        });
        return;
      }
      try {
        await withTimeout(
          this.options.processKiller.kill(matchingProcess.pid),
          this.options.operationTimeoutMs ?? DEFAULT_OPERATION_TIMEOUT_MS,
        );
        result.killed.push(matchingProcess.pid);
      } catch (error) {
        result.errors.push({
          operationId: record.operationId,
          message: `Failed to kill unowned headless process ${matchingProcess.pid}: ${formatError(error)}`,
        });
        return;
      }
    }

    await this.markCleaned(record, result);
  }
}

export function diagnosticsFromPreflightCleanup(
  result: AccessOperationPreflightCleanupResult,
): Diagnostic[] {
  return result.errors.map((error) =>
    createDiagnostic("warning", "access.preflight", `${error.operationId}: ${error.message}`),
  );
}

/**
 * Reaps the Access COM process orphaned by a killed PowerShell run on a timeout
 * path, returning the cleanup's diagnostics. Defensive by design: a timeout is
 * already a failure path, so if the cleanup itself throws we degrade to a warning
 * diagnostic rather than masking the original timeout with the cleanup error.
 */
export async function reapOrphanedAccessOnTimeout(
  cleanup: () => Promise<AccessOperationPreflightCleanupResult>,
): Promise<Diagnostic[]> {
  try {
    return diagnosticsFromPreflightCleanup(await cleanup());
  } catch (error) {
    return [
      createDiagnostic(
        "warning",
        "access.preflight",
        `orphan cleanup after timeout failed: ${formatError(error)}`,
      ),
    ];
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number | undefined): Promise<T> {
  if (timeoutMs === undefined || timeoutMs <= 0) return promise;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`operation timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
