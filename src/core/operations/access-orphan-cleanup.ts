import {
  createDysflowError,
  failureResult,
  type OperationResult,
  successResult,
} from "../contracts/index.js";
import { normalizePathForMatching, pathMatchesAccessPath } from "../utils/index.js";
import {
  type OsProcessInfo,
  type ProcessInspector,
  type ProcessKiller,
  type ProcessScanner,
  sameProcessStartTime,
} from "./access-operation-cleanup.js";
import type {
  AccessOperationRecord,
  AccessOperationRegistry,
} from "./access-operation-registry.js";

// Issue #1991 — registry states in which an operation is still driving its
// process. A PID recorded by one of them is never an orphan, whatever project
// root the record carries: the registry file is already per project, so a
// missing or differently spelled root must not let a live run slip through.
// Every other state (failed, timed_out, cleanup_pending, ...) means dysflow no
// longer drives the process, so a still-alive PID it recorded is a leftover
// (#861).
const LIVE_OPERATION_STATUSES: ReadonlySet<string> = new Set([
  "starting",
  "running",
  "running_untracked",
]);

function isLiveOperationStatus(status: string): boolean {
  return LIVE_OPERATION_STATUSES.has(status);
}

/**
 * Issue #1016 Part C — recognise a dysflow-spawned COM child MSACCESS profile.
 *
 * The runtime spawns `Access.Application` via COM automation (#861); the
 * resulting `MSACCESS.EXE` carries an `-Embedding` flag (the canonical
 * COM-automation marker Access uses when launched without a per-instance
 * .accdb path), or a legacy `/automation` flag, or an `/Embedding <pid>`
 * form that names the parent PID but no database. Crucially, the COM child
 * NEVER carries a per-instance .accdb path on its command line, so
 * `pathMatchesAccessPath(liveProcess.commandLine, accessPath)` always
 * returns false for it.
 *
 * Issue #1991 — the profile is NOT proof of ownership. Every automation host
 * produces it, including another session's live test run, so it only decides
 * whether an unattributed process is reported in the listing's
 * `unattributed` section. A kill still needs a command line naming this
 * accessPath or a dysflow record of this project (see attributeAccessProcess).
 *
 * Match is case-insensitive (PowerShell's WMI column is not stable across
 * OS versions, and `wmic` historically lowercases).
 */
// Issue #1862 — a process that names any Access database on its command
// line is a user-opened instance, never the COM child: refuse it so the
// PATH_MISMATCH check decides instead of the -Embedding flag alone.
const ACCESS_DATABASE_ON_COMMAND_LINE = /\.(accdb|accde|mdb|mde)\b/i;

function looksLikeDysflowComChild(proc: OsProcessInfo): boolean {
  if (proc.commandLine === undefined || proc.commandLine.length === 0) {
    return false;
  }
  if (ACCESS_DATABASE_ON_COMMAND_LINE.test(proc.commandLine)) return false;
  const lower = proc.commandLine.toLowerCase();
  if (lower.includes("-embedding") || lower.includes("/embedding")) return true;
  if (lower.includes("/automation")) return true;
  return false;
}

export type AccessOrphanCandidate = {
  pid: number;
  accessPath: string;
  kind: "access" | "powershell-worker";
  startTime?: string;
  ageSeconds?: number;
  mainWindowHandle?: number;
};

/**
 * Issue #1991 — a headless COM-launched MSACCESS that no evidence ties to a
 * database: its command line names none and no dysflow operation of this
 * project recorded its PID. It may be another session's live run, so it is
 * reported with an unknown `accessPath` and is never a kill candidate.
 */
export type AccessUnattributedProcess = {
  pid: number;
  accessPath: null;
  kind: "access";
  startTime?: string;
  ageSeconds?: number;
  mainWindowHandle?: number;
};

export type AccessOrphanListing = {
  orphans: AccessOrphanCandidate[];
  unattributed: AccessUnattributedProcess[];
};

/**
 * Issue #1991 — what the runtime knows about which database an MSACCESS
 * process holds. Only per-process evidence counts: a command line that names
 * the database, or a non-live dysflow operation of this project that recorded
 * the PID with the same start time. A start time unknown on either side
 * proves nothing, because Windows reuses PIDs: the process is then `unknown`.
 * The caller's resolved project path is never evidence.
 */
export type AccessProcessAttribution =
  | { kind: "command-line"; accessPath: string }
  | { kind: "operation-record"; accessPath: string; record: AccessOperationRecord }
  | { kind: "pid-recycled"; record: AccessOperationRecord }
  | { kind: "other-database"; evidence: string }
  | { kind: "unknown" };

function mostRecentRecordForPid(
  records: readonly AccessOperationRecord[],
  pid: number,
  projectRoot: string,
): AccessOperationRecord | null {
  const normalizedProjectRoot = normalizePathForMatching(projectRoot);
  let latest: AccessOperationRecord | null = null;
  for (const record of records) {
    if (record.accessPid !== pid) continue;
    if (normalizePathForMatching(record.projectRootAbs ?? "") !== normalizedProjectRoot) continue;
    if (
      latest === null ||
      (Date.parse(record.updatedAt ?? "") || 0) > (Date.parse(latest.updatedAt ?? "") || 0)
    ) {
      latest = record;
    }
  }
  return latest;
}

/** True when a live (starting/running) operation records this PID. */
export function isPidOwnedByLiveOperation(
  records: readonly AccessOperationRecord[],
  pid: number,
): boolean {
  return records.some(
    (record) =>
      isLiveOperationStatus(record.status) &&
      (record.accessPid === pid || record.powershellWorkerPid === pid),
  );
}

export function attributeAccessProcess(
  proc: OsProcessInfo,
  records: readonly AccessOperationRecord[],
  request: AccessOrphanCleanupRequest,
): AccessProcessAttribution {
  const commandLine = proc.commandLine;
  if (commandLine !== undefined && pathMatchesAccessPath(commandLine, request.accessPath)) {
    return { kind: "command-line", accessPath: request.accessPath };
  }
  if (commandLine !== undefined && ACCESS_DATABASE_ON_COMMAND_LINE.test(commandLine)) {
    return { kind: "other-database", evidence: commandLine };
  }

  const record = mostRecentRecordForPid(records, proc.pid, request.projectRoot);
  if (record === null || isLiveOperationStatus(record.status)) {
    return { kind: "unknown" };
  }
  if (
    normalizePathForMatching(record.accessPath ?? "") !==
    normalizePathForMatching(request.accessPath)
  ) {
    return {
      kind: "other-database",
      evidence: `operation ${record.operationId} recorded ${record.accessPath}`,
    };
  }
  // A record is evidence only for the process it saw. Without both start
  // times the live process may be whatever got the recycled PID, for example
  // another session's live -Embedding run, so fail closed.
  if (!record.processStartTime || proc.startTime === undefined) {
    return { kind: "unknown" };
  }
  if (!sameProcessStartTime(record.processStartTime, proc.startTime)) {
    return { kind: "pid-recycled", record };
  }
  return { kind: "operation-record", accessPath: record.accessPath, record };
}

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

  private ageSeconds(startTime: string | undefined): number | undefined {
    if (startTime === undefined) return undefined;
    const startedAtMs = Date.parse(startTime);
    if (!Number.isFinite(startedAtMs)) return undefined;
    return Math.max(0, Math.floor((this.clock().getTime() - startedAtMs) / 1000));
  }

  async listOrphans(
    request: AccessOrphanCleanupRequest,
  ): Promise<OperationResult<AccessOrphanCandidate[]>> {
    const listing = await this.listCandidates(request);
    if (!listing.ok) return listing;
    return successResult(listing.data.orphans);
  }

  /**
   * Issue #1991 — every listed orphan carries the accessPath its own evidence
   * proves (see {@link attributeAccessProcess}); a headless COM child nothing
   * ties to a database is reported separately as `unattributed`, and a PID a
   * live operation records is never listed at all.
   */
  async listCandidates(
    request: AccessOrphanCleanupRequest,
  ): Promise<OperationResult<AccessOrphanListing>> {
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

    const candidates: AccessOrphanCandidate[] = [];
    const unattributed: AccessUnattributedProcess[] = [];
    for (const proc of processes) {
      if (proc.name.toUpperCase() !== "MSACCESS.EXE") continue;
      if (isPidOwnedByLiveOperation(registryRecords, proc.pid)) continue;
      // Skip a proven-visible interactive window. Only a dysflow record (#861)
      // tolerates an unknown handle; a command-line match needs a proven 0.
      if (typeof proc.mainWindowHandle === "number" && proc.mainWindowHandle !== 0) continue;

      const attribution = attributeAccessProcess(proc, registryRecords, request);
      const entry = {
        pid: proc.pid,
        kind: "access" as const,
        startTime: proc.startTime,
        ageSeconds: this.ageSeconds(proc.startTime),
        mainWindowHandle: proc.mainWindowHandle,
      };
      if (attribution.kind === "operation-record") {
        candidates.push({ ...entry, accessPath: attribution.accessPath });
      } else if (attribution.kind === "command-line") {
        if (proc.mainWindowHandle === 0)
          candidates.push({ ...entry, accessPath: attribution.accessPath });
      } else if (
        attribution.kind === "unknown" &&
        proc.mainWindowHandle === 0 &&
        looksLikeDysflowComChild(proc)
      ) {
        unattributed.push({ ...entry, accessPath: null });
      }
    }

    // #735: scan for orphaned PowerShell workers. A pwsh worker is a
    // process spawned by the runner that holds the Access session alive. When
    // the worker gets stuck it prevents cleanup because the existing orphan
    // detection only covers MSACCESS.EXE. Workers are tracked in the registry
    // via `powershellWorkerPid`.
    //
    // Issue #1991 — a worker is listed exactly when cleanupOrphan would kill
    // it: no live operation records the PID, the most recent record of this
    // project that tracked it is finished, and the start times do not prove a
    // recycled PID. The worker of a live operation is never an orphan.
    const workerPids = new Set<number>();
    for (const record of registryRecords) {
      const workerPid = record.powershellWorkerPid;
      if (workerPid == null || workerPids.has(workerPid)) continue;
      if (isPidOwnedByLiveOperation(registryRecords, workerPid)) continue;
      const tracked = mostRecentTrackedRecordForPid(
        registryRecords,
        workerPid,
        request.projectRoot,
      );
      if (tracked === null) continue;

      const workerProc = processes.find(
        (p) => p.pid === workerPid && p.name.toUpperCase() === "PWSH.EXE",
      );
      if (workerProc === undefined) continue;
      if (isRecycledWorkerPid(tracked, workerProc)) continue;

      workerPids.add(workerPid);
      candidates.push({
        pid: workerPid,
        accessPath: tracked.accessPath,
        kind: "powershell-worker",
        startTime: workerProc.startTime,
        ageSeconds: this.ageSeconds(workerProc.startTime),
        mainWindowHandle: workerProc.mainWindowHandle,
      });
    }

    return successResult({ orphans: candidates, unattributed });
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

    // MSACCESS-specific safety checks: headless, not owned by a live
    // operation, and positive evidence that it holds this project's
    // accessPath. pwsh workers are always headless background processes; their
    // ownership is verified through the registry below instead.
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

      let registryRecords: AccessOperationRecord[];
      try {
        registryRecords = await this.options.registry.listRecent({ limit: 1000 });
      } catch (error) {
        return failureResult(
          createDysflowError(
            "ORPHAN_CLEANUP_REGISTRY_READ_FAILED",
            `Failed to verify registry ownership for PID ${confirmPid}: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      }

      if (isPidOwnedByLiveOperation(registryRecords, confirmPid)) {
        return failureResult(
          createDysflowError(
            "ORPHAN_CLEANUP_REGISTRY_OWNED",
            `Refused to kill PID ${confirmPid}: it is currently owned by a running Dysflow Access operation.`,
          ),
        );
      }

      // Issue #1991 — fail closed. The kill needs per-process evidence: the
      // command line names this accessPath, or a non-live dysflow operation of
      // this project recorded the PID (#861, a COM child never names its
      // database). The COM-child profile alone (#1016 Part C) is not proof: a
      // live test run of another session has exactly the same profile.
      const attribution = attributeAccessProcess(liveProcess, registryRecords, {
        accessPath,
        projectRoot,
      });
      if (attribution.kind === "pid-recycled") {
        return failureResult(
          createDysflowError(
            "ORPHAN_CLEANUP_PID_RECYCLED",
            `Refused to kill PID ${confirmPid}: the live process started at ${liveProcess.startTime ?? "unknown"} but the recorded operation ${attribution.record.operationId} started at ${attribution.record.processStartTime}. The PID was likely recycled by Windows.`,
          ),
        );
      }
      if (attribution.kind === "other-database") {
        return failureResult(
          createDysflowError(
            "ORPHAN_CLEANUP_PATH_MISMATCH",
            `PID ${confirmPid} is holding ${attribution.evidence}, not ${accessPath}.`,
          ),
        );
      }
      if (attribution.kind === "unknown") {
        const evidence =
          liveProcess.commandLine === undefined
            ? "its command line is unavailable"
            : "its command line names no database";
        return failureResult(
          createDysflowError(
            "ORPHAN_CLEANUP_PATH_UNVERIFIED",
            `Refused to kill PID ${confirmPid}: ${evidence} and no finished Dysflow operation of this project recorded it, so it cannot be proven to hold ${accessPath}.`,
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
      // Issue #1991 — the worker of a live operation is still driving its
      // Access session; killing it would abort that run.
      if (isPidOwnedByLiveOperation(trackedRecord.records, confirmPid)) {
        return failureResult(
          createDysflowError(
            "ORPHAN_CLEANUP_REGISTRY_OWNED",
            `Refused to kill PID ${confirmPid}: it is the PowerShell worker of a running Dysflow Access operation.`,
          ),
        );
      }
      if (trackedRecord.record === null) {
        return failureResult(
          createDysflowError(
            "ORPHAN_CLEANUP_PID_NOT_TRACKED",
            `Refused to kill PID ${confirmPid}: it is not (and was never) tracked as a Dysflow Access operation or powershell worker for project ${projectRoot}. Cannot prove the live process is one of ours.`,
          ),
        );
      }
      if (isRecycledWorkerPid(trackedRecord.record, liveProcess)) {
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
    | { ok: true; record: AccessOperationRecord | null; records: AccessOperationRecord[] }
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

    return {
      ok: true,
      record: mostRecentTrackedRecordForPid(registryRecords, pid, projectRoot),
      records: registryRecords,
    };
  }
}

function mostRecentTrackedRecordForPid(
  records: readonly AccessOperationRecord[],
  pid: number,
  projectRoot: string,
): AccessOperationRecord | null {
  const normalizedProjectRoot = normalizePathForMatching(projectRoot);
  const candidates = records.filter(
    (record) =>
      (record.accessPid === pid || record.powershellWorkerPid === pid) &&
      normalizePathForMatching(record.projectRootAbs ?? "") === normalizedProjectRoot,
  );
  const sorted = [...candidates].sort((a, b) => {
    const aUpdated = Date.parse(a.updatedAt ?? "") || 0;
    const bUpdated = Date.parse(b.updatedAt ?? "") || 0;
    return bUpdated - aUpdated;
  });
  return sorted[0] ?? null;
}

// #T16 — the live pwsh started at a different time than the record says, so
// Windows recycled the PID after our worker exited.
function isRecycledWorkerPid(record: AccessOperationRecord, proc: OsProcessInfo): boolean {
  return (
    record.processStartTime !== undefined &&
    record.processStartTime !== null &&
    proc.startTime !== undefined &&
    record.processStartTime !== proc.startTime
  );
}
