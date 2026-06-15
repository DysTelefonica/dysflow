import {
  createDiagnostic,
  createDysflowError,
  type Diagnostic,
  failureResult,
  type OperationResult,
  successResult,
} from "../contracts/index.js";
import { normalizePathForMatching, pathMatchesAccessPath } from "../utils/index.js";
import {
  type AccessOperationRegistry,
  DEFAULT_STARTING_STALE_MS,
  INTERRUPTED_BEFORE_PID_REASON,
  isInterruptedStartingRecord,
} from "./access-operation-registry.js";

export type OsProcessInfo = {
  pid: number;
  name: string;
  /** ISO 8601 string; may be undefined when the OS query returned partial data (e.g. Get-Process fallback). */
  startTime?: string;
  commandLine?: string;
  /**
   * OS-reported window handle for the process's main window.
   * `0` means the process has no visible window (headless / background-only).
   * `undefined` means the information is not available; the caller must treat
   * undefined as "unknown" and refuse to act on it as if it were headless.
   */
  mainWindowHandle?: number;
};

export type ProcessInspector = {
  getProcess(pid: number): Promise<OsProcessInfo | undefined>;
};

export type ProcessKiller = {
  kill(pid: number): Promise<void>;
};

export type ProcessScanner = {
  listProcesses(): Promise<OsProcessInfo[]>;
};

export type AccessCleanupResult = {
  operationId: string;
  accessPid: number | null;
  status: "cleaned";
};

const ELIGIBLE_STATUSES = new Set(["timed_out", "failed", "cleanup_pending"]);

export class AccessOperationCleanupService {
  constructor(
    private readonly options: {
      registry: AccessOperationRegistry;
      processInspector: ProcessInspector;
      processKiller: ProcessKiller;
      processScanner?: ProcessScanner;
      clock?: () => string;
      startingStaleMs?: number;
    },
  ) {}

  private now(): number {
    return Date.parse((this.options.clock ?? (() => new Date().toISOString()))());
  }

  private get startingStaleMs(): number {
    return this.options.startingStaleMs ?? DEFAULT_STARTING_STALE_MS;
  }

  async cleanup(request: {
    operationId: string;
    accessPath: string;
    force?: boolean;
  }): Promise<OperationResult<AccessCleanupResult>> {
    const record = await this.options.registry.get(request.operationId);
    if (record === undefined) {
      return failureResult(
        createDysflowError(
          "CLEANUP_OPERATION_NOT_FOUND",
          `Operation ${request.operationId} was not found.`,
        ),
      );
    }

    if (
      normalizePathForMatching(record.accessPath) !== normalizePathForMatching(request.accessPath)
    ) {
      return failureResult(
        createDysflowError(
          "CLEANUP_ACCESS_PATH_MISMATCH",
          "Cleanup refused because accessPath does not match the registered operation.",
        ),
      );
    }

    if (record.status === "running_untracked") {
      return failureResult(
        createDysflowError(
          "CLEANUP_PID_UNKNOWN",
          "Cleanup refused because the operation has no owned Access PID.",
        ),
      );
    }

    // An interrupted "starting" operation never owned an Access PID, so retiring
    // it kills nothing. Once stale (past the in-flight grace window) it is safe to
    // retire WITHOUT force. retireUnownedOperation still scans for a live MSACCESS
    // bound to THIS record's accessPath and refuses if one exists — it never kills,
    // and the scan is scoped to this accessPath, so other projects' Access
    // processes are never matched or touched.
    if (isInterruptedStartingRecord(record, this.now(), this.startingStaleMs)) {
      return this.retireUnownedOperation(
        record.operationId,
        record.accessPath,
        INTERRUPTED_BEFORE_PID_REASON,
      );
    }

    if (
      record.accessPid === null ||
      record.processStartTime === null ||
      record.status === "pid_unknown"
    ) {
      if (!request.force) {
        return failureResult(
          createDysflowError(
            "CLEANUP_PID_UNKNOWN",
            "Cleanup refused because the operation has no owned Access PID.",
          ),
        );
      }

      return this.retireUnownedOperation(record.operationId, record.accessPath);
    }

    if (!request.force && !ELIGIBLE_STATUSES.has(record.status)) {
      return failureResult(
        createDysflowError(
          "CLEANUP_STATUS_NOT_ELIGIBLE",
          `Cleanup refused for operation status ${record.status}.`,
        ),
      );
    }

    const process = await this.options.processInspector.getProcess(record.accessPid);
    if (process === undefined) {
      // PID is verifiably gone — goal is already met, no need to kill.
      await this.options.registry.update(record.operationId, {
        status: "cleaned",
        updatedAt: new Date().toISOString(),
      });
      return successResult({
        operationId: record.operationId,
        accessPid: record.accessPid,
        status: "cleaned",
      });
    }

    if (process.name.toUpperCase() !== "MSACCESS.EXE") {
      return failureResult(
        createDysflowError(
          "CLEANUP_PROCESS_NAME_MISMATCH",
          `Cleanup refused because PID ${record.accessPid} is ${process.name}.`,
        ),
      );
    }

    if (!sameProcessStartTime(process.startTime, record.processStartTime)) {
      return failureResult(
        createDysflowError(
          "CLEANUP_PROCESS_START_TIME_MISMATCH",
          "Cleanup refused because processStartTime differs from the registry.",
        ),
      );
    }

    const commandLine = process.commandLine ?? record.commandLine ?? "";
    if (commandLine.length > 0 && !pathMatchesAccessPath(commandLine, record.accessPath)) {
      return failureResult(
        createDysflowError(
          "CLEANUP_COMMAND_LINE_MISMATCH",
          "Cleanup refused because commandLine is not compatible with the registered Access path.",
        ),
      );
    }

    await this.options.processKiller.kill(record.accessPid);
    await this.options.registry.update(record.operationId, {
      status: "cleaned",
      updatedAt: new Date().toISOString(),
    });
    return successResult({
      operationId: record.operationId,
      accessPid: record.accessPid,
      status: "cleaned",
    });
  }

  private async retireUnownedOperation(
    operationId: string,
    accessPath: string,
    reason?: string,
  ): Promise<OperationResult<AccessCleanupResult>> {
    const diagnostics: Diagnostic[] = [];
    if (reason !== undefined) {
      diagnostics.push(createDiagnostic("info", "access.cleanup", reason));
    }

    if (this.options.processScanner !== undefined) {
      let processes: OsProcessInfo[];
      let scanFailed = false;
      try {
        processes = await this.options.processScanner.listProcesses();
      } catch (error) {
        // Scanner failure: we cannot confirm ownership but we must not silently kill anything.
        // Retire the registry record and surface a warning so callers can audit.
        scanFailed = true;
        diagnostics.push(
          createDiagnostic(
            "warning",
            "access.cleanup",
            `Registry retired only; process ownership unknown because enumeration failed: ${formatError(error)}`,
          ),
        );
        processes = [];
      }

      if (!scanFailed) {
        const matchingProcess = processes.find(
          (process) =>
            process.name.toUpperCase() === "MSACCESS.EXE" &&
            process.commandLine !== undefined &&
            pathMatchesAccessPath(process.commandLine, accessPath),
        );
        if (matchingProcess !== undefined) {
          return failureResult(
            createDysflowError(
              "CLEANUP_UNOWNED_ACCESS_PROCESS",
              `Cleanup refused because PID ${matchingProcess.pid} is an unowned Access process for the registered accessPath.`,
            ),
          );
        }
      }
    } else {
      // No scanner at all — retire the registry record but flag that ownership could not be verified.
      diagnostics.push(
        createDiagnostic(
          "warning",
          "access.cleanup",
          "Registry retired only; process ownership unknown because no process scanner is configured.",
        ),
      );
    }

    await this.options.registry.update(operationId, {
      status: "cleaned",
      updatedAt: new Date().toISOString(),
    });
    return successResult({ operationId, accessPid: null, status: "cleaned" }, { diagnostics });
  }
}

/**
 * Compares two ISO 8601 process start-time strings at whole-second precision.
 *
 * Rationale: WMI/CIM writes CreationDate with microsecond precision (DMTF → 3-digit ms after
 * truncation) while Get-Process.StartTime emits full .NET DateTime ticks → the TS inspector
 * rounds to ms, but the registry entry may have been persisted from a different source with
 * different sub-second precision.  Treating them as equal when they agree at the second level
 * prevents false CLEANUP_PROCESS_START_TIME_MISMATCH errors for the same physical process.
 *
 * Null / empty / non-parseable values → returns false (caller falls through to existing null
 * handling without crashing).
 */
export function sameProcessStartTime(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  const tsA = Date.parse(a);
  const tsB = Date.parse(b);
  if (Number.isNaN(tsA) || Number.isNaN(tsB)) return false;
  return Math.floor(tsA / 1000) === Math.floor(tsB / 1000);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
