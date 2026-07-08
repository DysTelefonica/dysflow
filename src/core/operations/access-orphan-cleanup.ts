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
  kind: "access" | "powershell-worker";
  startTime?: string;
  mainWindowHandle?: number;
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

  async listOrphans(
    request: AccessOrphanCleanupRequest,
  ): Promise<OperationResult<AccessOrphanCandidate[]>> {
    let processes: OsProcessInfo[];
    try {
      processes = await this.options.processScanner.listProcesses();
    } catch (error) {
      return failureResult(
        createDysflowError(
          "PROCESS_SCAN_FAILED",
          `Failed to scan processes: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
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
        kind: "access",
        startTime: proc.startTime,
        mainWindowHandle: proc.mainWindowHandle,
      });
    }

    // #735: scan for orphaned PowerShell workers. A pwsh worker is a
    // process spawned by the runner that holds the Access session alive. When
    // the worker gets stuck it prevents cleanup because the existing orphan
    // detection only covers MSACCESS.EXE. Workers are tracked in the registry
    // via `powershellWorkerPid`; we surface any still-alive worker that is NOT
    // owned by a running operation's accessPid or powershellWorkerPid.
    const workerPids = new Set<number>();
    for (const record of registryRecords) {
      if (record.status !== "running") continue;
      if (
        normalizePathForMatching(record.projectRootAbs ?? "") !==
        normalizePathForMatching(request.projectRoot)
      )
        continue;
      if (record.powershellWorkerPid == null) continue;
      // Skip if this worker PID is already the accessPid of a running record
      if (ownedPids.has(record.powershellWorkerPid)) continue;
      // Skip if another running record already owns this worker PID
      if (workerPids.has(record.powershellWorkerPid)) continue;

      const workerProc = processes.find(
        (p) => p.pid === record.powershellWorkerPid && p.name.toUpperCase() === "PWSH.EXE",
      );
      if (workerProc === undefined) continue;

      workerPids.add(record.powershellWorkerPid);
      candidates.push({
        pid: record.powershellWorkerPid,
        accessPath: request.accessPath,
        kind: "powershell-worker",
        startTime: workerProc.startTime,
        mainWindowHandle: workerProc.mainWindowHandle,
      });
    }

    return successResult(candidates);
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

    const processName = liveProcess.name.toUpperCase();
    const isMsAccess = processName === "MSACCESS.EXE";
    const isPowerShellWorker = processName === "PWSH.EXE";

    if (!isMsAccess && !isPowerShellWorker) {
      return failureResult(
        createDysflowError(
          "ORPHAN_CLEANUP_NOT_MSACCESS",
          `PID ${confirmPid} is ${liveProcess.name}, not MSACCESS.EXE or pwsh.exe.`,
        ),
      );
    }

    // MSACCESS-specific safety checks: headless, command-line path match.
    // pwsh workers are always headless background processes; the path match is
    // verified through registry ownership below instead.
    if (isMsAccess) {
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
    }

    // MSACCESS path uses "currently owned" as the kill-prevention gate (with
    // path-match proving identity). The pwsh worker path instead needs
    // POSITIVE ownership proof — a running record alone is not enough
    // because Windows may have recycled the PID to a different pwsh after
    // our worker exited. See the dedicated pwsh branch below.

    if (isMsAccess) {
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
    }

    if (isPowerShellWorker) {
      // #T16 inspector fix: the previous logic only proved "the PID is
      // NOT currently owned" (negative proof). It never proved "this PID
      // WAS our worker and the live process matches what we recorded". A
      // pwsh worker can exit cleanly, Windows reuses the PID for an innocent
      // pwsh, and the next cleanupOrphan call would kill the innocent.
      // Require positive ownership proof by locating the historical
      // registry record for this PID + projectRoot, then compare the live
      // process's identity against it.
      const trackedRecord = await this.findMostRecentTrackedRecordForPid(confirmPid, projectRoot);
      if (!trackedRecord.ok) return failureResult(trackedRecord.error);
      if (trackedRecord.record === null) {
        return failureResult(
          createDysflowError(
            "ORPHAN_CLEANUP_PID_NOT_TRACKED",
            `Refused to kill PID ${confirmPid}: it is not (and was never) tracked as a Dysflow Access operation or powershell worker for project ${projectRoot}. Cannot prove the live process is one of ours.`,
          ),
        );
      }
      if (
        trackedRecord.record.processStartTime !== undefined &&
        trackedRecord.record.processStartTime !== null &&
        liveProcess.startTime !== undefined &&
        trackedRecord.record.processStartTime !== liveProcess.startTime
      ) {
        return failureResult(
          createDysflowError(
            "ORPHAN_CLEANUP_PID_RECYCLED",
            `Refused to kill PID ${confirmPid}: the live process started at ${liveProcess.startTime ?? "unknown"} but the recorded worker for op ${trackedRecord.record.operationId} started at ${trackedRecord.record.processStartTime}. The PID was likely recycled by Windows after our worker exited.`,
          ),
        );
      }
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
        (record.accessPid === pid || record.powershellWorkerPid === pid) &&
        normalizePathForMatching(record.projectRootAbs ?? "") === normalizedProjectRoot,
    );
    return { ok: true, owned };
  }

  // Positive ownership proof for #T16: locate the most recent record (any
  // status, not just `running`) that ever tracked this PID for this project.
  // Returns null when there is no historical record at all — the caller
  // then refuses with ORPHAN_CLEANUP_PID_NOT_TRACKED because we have zero
  // proof the live process is one of ours. Sorted by `updatedAt` descending
  // so the freshest known attributes are what the live process is compared
  // against — this is what catches Windows PID recycling.
  private async findMostRecentTrackedRecordForPid(
    pid: number,
    projectRoot: string,
  ): Promise<
    | { ok: true; record: AccessOperationRecord | null }
    | { ok: false; error: ReturnType<typeof createDysflowError> }
  > {
    let registryRecords: AccessOperationRecord[];
    try {
      registryRecords = await this.options.registry.listRecent({ limit: 1000 });
    } catch (error) {
      return {
        ok: false,
        error: createDysflowError(
          "ORPHAN_CLEANUP_REGISTRY_READ_FAILED",
          `Failed to query registry for tracked record of PID ${pid}: ${error instanceof Error ? error.message : String(error)}`,
        ),
      };
    }

    const normalizedProjectRoot = normalizePathForMatching(projectRoot);
    const candidates = registryRecords.filter(
      (record) =>
        (record.accessPid === pid || record.powershellWorkerPid === pid) &&
        normalizePathForMatching(record.projectRootAbs ?? "") === normalizedProjectRoot,
    );
    if (candidates.length === 0) return { ok: true, record: null };

    const sorted = [...candidates].sort((a, b) => {
      const aUpdated = Date.parse(a.updatedAt ?? "") || 0;
      const bUpdated = Date.parse(b.updatedAt ?? "") || 0;
      return bUpdated - aUpdated;
    });
    return { ok: true, record: sorted[0] ?? null };
  }
}
