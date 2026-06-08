import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../contracts/index.js";
import { normalizePathForMatching, pathMatchesAccessPath } from "../utils/index.js";
import type {
  OsProcessInfo,
  ProcessInspector,
  ProcessKiller,
  ProcessScanner,
} from "./access-operation-cleanup.js";
import type {
  AccessOperationRecord,
  AccessOperationRegistry,
} from "./access-operation-registry.js";

export type AccessOrphanCandidate = {
  pid: number;
  accessPath: string;
  startTime?: string;
  mainWindowHandle: number;
};

export type AccessOrphanCleanupRequest = {
  accessPath: string;
  projectRoot: string;
};

export type AccessOrphanCleanupConfirmRequest = AccessOrphanCleanupRequest & {
  confirmPid: number;
};

export type AccessOrphanCleanupResult = {
  killed: number[];
  refused: { pid: number; reason: string }[];
  syntheticOperationId?: string;
  errors: { code: string; message: string }[];
};

export interface AccessOrphanCleanupServiceOptions {
  processScanner: ProcessScanner;
  processKiller: ProcessKiller;
  processInspector: ProcessInspector;
  registry: AccessOperationRegistry;
  clock?: () => Date;
}

export class AccessOrphanCleanupService {
  private readonly clock: () => Date;

  constructor(private readonly options: AccessOrphanCleanupServiceOptions) {
    this.clock = options.clock ?? (() => new Date());
  }

  async listOrphans(request: AccessOrphanCleanupRequest): Promise<AccessOrphanCandidate[]> {
    let processes: OsProcessInfo[];
    try {
      processes = await this.options.processScanner.listProcesses();
    } catch {
      return [];
    }

    let registryRecords: AccessOperationRecord[];
    try {
      registryRecords = await this.options.registry.listRecent({ limit: 1000 });
    } catch {
      registryRecords = [];
    }

    const ownedPids = new Set<number>();
    for (const record of registryRecords) {
      if (
        record.status === "running" &&
        record.accessPid !== null &&
        normalizePathForMatching(record.projectRootAbs ?? "") ===
          normalizePathForMatching(request.projectRoot)
      ) {
        ownedPids.add(record.accessPid);
      }
    }

    const candidates: AccessOrphanCandidate[] = [];
    for (const proc of processes) {
      if (proc.name.toUpperCase() !== "MSACCESS.EXE") continue;
      if (ownedPids.has(proc.pid)) continue;
      if (proc.mainWindowHandle !== 0) continue;
      if (proc.commandLine === undefined) continue;
      if (!pathMatchesAccessPath(proc.commandLine, request.accessPath)) continue;

      candidates.push({
        pid: proc.pid,
        accessPath: request.accessPath,
        startTime: proc.startTime,
        mainWindowHandle: proc.mainWindowHandle,
      });
    }

    return candidates;
  }

  async cleanupOrphan(
    request: AccessOrphanCleanupConfirmRequest,
  ): Promise<OperationResult<AccessOrphanCleanupResult>> {
    const { confirmPid, accessPath, projectRoot } = request;

    if (!Number.isSafeInteger(confirmPid) || confirmPid <= 0) {
      return failureResult(
        createDysflowError(
          "ORPHAN_CLEANUP_INVALID_PID",
          `Refused to clean up orphan: PID must be a positive safe integer, got ${confirmPid}.`,
        ),
      );
    }

    let liveProcess: OsProcessInfo | undefined;
    try {
      liveProcess = await this.options.processInspector.getProcess(confirmPid);
    } catch (error) {
      return failureResult(
        createDysflowError(
          "ORPHAN_CLEANUP_INSPECTION_FAILED",
          `Failed to inspect PID ${confirmPid}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    if (liveProcess === undefined) {
      return failureResult(
        createDysflowError("ORPHAN_CLEANUP_PID_GONE", `PID ${confirmPid} is no longer running.`),
      );
    }

    if (liveProcess.name.toUpperCase() !== "MSACCESS.EXE") {
      return failureResult(
        createDysflowError(
          "ORPHAN_CLEANUP_NOT_MSACCESS",
          `PID ${confirmPid} is ${liveProcess.name}, not MSACCESS.EXE.`,
        ),
      );
    }

    if (liveProcess.mainWindowHandle !== 0) {
      const handle =
        liveProcess.mainWindowHandle === undefined
          ? "undefined (Get-Process fallback — cannot prove headless)"
          : `0x${liveProcess.mainWindowHandle.toString(16).toUpperCase()}`;
      return failureResult(
        createDysflowError(
          "ORPHAN_CLEANUP_NOT_HEADLESS",
          `Refused to kill PID ${confirmPid}: window handle is ${handle}, expected 0 (headless).`,
        ),
      );
    }

    if (liveProcess.commandLine === undefined) {
      return failureResult(
        createDysflowError(
          "ORPHAN_CLEANUP_PATH_UNVERIFIED",
          `Refused to kill PID ${confirmPid}: command line is unavailable, so it cannot be proven to hold ${accessPath}.`,
        ),
      );
    }

    if (!pathMatchesAccessPath(liveProcess.commandLine, accessPath)) {
      return failureResult(
        createDysflowError(
          "ORPHAN_CLEANUP_PATH_MISMATCH",
          `PID ${confirmPid} is holding ${liveProcess.commandLine}, not ${accessPath}.`,
        ),
      );
    }

    const ownershipResult = await this.isOwnedRunningPid(confirmPid, projectRoot);
    if (!ownershipResult.ok) return failureResult(ownershipResult.error);
    if (ownershipResult.owned) {
      return failureResult(
        createDysflowError(
          "ORPHAN_CLEANUP_REGISTRY_OWNED",
          `Refused to kill PID ${confirmPid}: it is currently owned by a running Dysflow Access operation.`,
        ),
      );
    }

    const syntheticId = `orphan-${confirmPid}-${Date.now()}`;
    const now = this.clock().toISOString();
    try {
      await this.options.registry.create({
        operationId: syntheticId,
        action: "run",
        accessPath,
        projectRootAbs: projectRoot,
        accessPid: confirmPid,
        processStartTime: liveProcess.startTime ?? null,
        commandLine: liveProcess.commandLine,
        status: "cleanup_pending",
        metadata: { _synthetic: true, _orphan: true },
        updatedAt: now,
      });
    } catch (error) {
      return failureResult(
        createDysflowError(
          "ORPHAN_CLEANUP_REGISTRY_WRITE_FAILED",
          `Failed to write synthetic operation record for PID ${confirmPid}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    try {
      await this.options.processKiller.kill(confirmPid);
    } catch (error) {
      return failureResult(
        createDysflowError(
          "ORPHAN_CLEANUP_KILL_FAILED",
          `Failed to kill PID ${confirmPid}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }

    try {
      await this.options.registry.update(syntheticId, {
        status: "cleaned",
        updatedAt: this.clock().toISOString(),
      });
    } catch {
      // non-fatal
    }

    return successResult({
      killed: [confirmPid],
      refused: [],
      syntheticOperationId: syntheticId,
      errors: [],
    });
  }

  private async isOwnedRunningPid(
    pid: number,
    projectRoot: string,
  ): Promise<
    { ok: true; owned: boolean } | { ok: false; error: ReturnType<typeof createDysflowError> }
  > {
    let registryRecords: AccessOperationRecord[];
    try {
      registryRecords = await this.options.registry.listRecent({ limit: 1000 });
    } catch (error) {
      return {
        ok: false,
        error: createDysflowError(
          "ORPHAN_CLEANUP_REGISTRY_READ_FAILED",
          `Failed to verify registry ownership for PID ${pid}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      };
    }

    const normalizedProjectRoot = normalizePathForMatching(projectRoot);
    const owned = registryRecords.some(
      (record) =>
        record.status === "running" &&
        record.accessPid === pid &&
        normalizePathForMatching(record.projectRootAbs ?? "") === normalizedProjectRoot,
    );
    return { ok: true, owned };
  }
}
