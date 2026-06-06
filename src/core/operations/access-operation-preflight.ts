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
import type {
  AccessOperationRecord,
  AccessOperationRegistry,
  AccessOperationStatus,
} from "./access-operation-registry.js";

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
};

export type AccessOperationPreflightCleanup = {
  cleanup(
    request: AccessOperationPreflightCleanupRequest,
  ): Promise<AccessOperationPreflightCleanupResult>;
};

const ELIGIBLE_STATUSES = new Set<AccessOperationStatus>([
  "timed_out",
  "failed",
  "cleanup_pending",
  "pid_unknown",
]);
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
    },
  ) {}

  async cleanup(
    request: AccessOperationPreflightCleanupRequest,
  ): Promise<AccessOperationPreflightCleanupResult> {
    const result: AccessOperationPreflightCleanupResult = {
      cleaned: [],
      killed: [],
      orphanedKilled: [],
      errors: [],
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

      if (record.status === "running" && record.accessPid !== null) {
        await this.reconcileRunningRecord(record, result);
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
    // Leave it completely untouched.
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

      result.errors.push({
        operationId: "orphan",
        message: `Blocked cleanup because PID ${process.pid} is an unattributed MSACCESS process for the requested accessPath.`,
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
      result.errors.push({
        operationId: record.operationId,
        message: `Refused to mark operation cleaned because PID ${matchingProcess.pid} is an unowned Access process for the registered accessPath.`,
      });
      return;
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
