import type { Diagnostic } from "../contracts/index.js";
import { createDiagnostic } from "../contracts/index.js";
import type {
  OsProcessInfo,
  ProcessInspector,
  ProcessKiller,
  ProcessScanner,
} from "./access-operation-cleanup.js";
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
]);

export class AccessOperationPreflightCleanupService implements AccessOperationPreflightCleanup {
  constructor(
    private readonly options: {
      registry: AccessOperationRegistry;
      processInspector: ProcessInspector;
      processKiller: ProcessKiller;
      processScanner?: ProcessScanner;
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
      normalizePath(record.accessPath) === normalizePath(request.accessPath) &&
      normalizePath(record.projectRootAbs ?? "") === normalizePath(request.projectRoot)
    );
  }

  private async cleanupRecord(
    record: AccessOperationRecord,
    result: AccessOperationPreflightCleanupResult,
    handledPids: Set<number>,
  ): Promise<void> {
    if (record.accessPid === null || record.processStartTime === null) {
      await this.markCleaned(record, result);
      return;
    }

    let process;
    try {
      process = await this.options.processInspector.getProcess(record.accessPid);
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

    if (process.startTime !== record.processStartTime) {
      result.errors.push({
        operationId: record.operationId,
        message: `Refused to kill PID ${record.accessPid} because processStartTime differs from the registry.`,
      });
      return;
    }

    handledPids.add(record.accessPid);

    try {
      await this.options.processKiller.kill(record.accessPid);
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

  private async scanAndCleanOrphans(
    scanner: ProcessScanner,
    request: AccessOperationPreflightCleanupRequest,
    result: AccessOperationPreflightCleanupResult,
    handledPids: Set<number>,
  ): Promise<void> {
    let processes: OsProcessInfo[];
    try {
      processes = await scanner.listProcesses();
    } catch (error) {
      result.errors.push({
        operationId: "orphan_scanner",
        message: `Failed to enumerate processes: ${formatError(error)}`,
      });
      return;
    }

    const normalizedAccessPath = normalizePathForMatching(request.accessPath);

    for (const process of processes) {
      if (process.name.toUpperCase() !== "MSACCESS.EXE") continue;
      if (handledPids.has(process.pid)) continue;

      if (process.commandLine === undefined) continue;
      if (!pathMatchesAccessPath(process.commandLine, normalizedAccessPath)) continue;

      try {
        await this.options.processKiller.kill(process.pid);
        result.orphanedKilled.push(process.pid);
      } catch (error) {
        result.errors.push({
          operationId: "orphan",
          message: `Failed to kill orphan PID ${process.pid}: ${formatError(error)}`,
        });
      }
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
}

export function diagnosticsFromPreflightCleanup(
  result: AccessOperationPreflightCleanupResult,
): Diagnostic[] {
  return result.errors.map((error) =>
    createDiagnostic("warning", "access.preflight", `${error.operationId}: ${error.message}`),
  );
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

function normalizePathForMatching(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

function pathMatchesAccessPath(commandLine: string, normalizedAccessPath: string): boolean {
  const normalizedAccessPathLower = normalizedAccessPath.toLowerCase();

  const tokenPattern = /"([^"]*)"|(\S+)/g;
  const tokens: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(commandLine)) !== null) {
    const token = match[1] ?? match[2] ?? "";
    if (token.length > 0) {
      tokens.push(token.replace(/\\/g, "/").toLowerCase());
    }
  }

  for (const token of tokens) {
    const normalizedToken = token.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (normalizedToken === normalizedAccessPathLower) {
      return true;
    }
  }

  return false;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
