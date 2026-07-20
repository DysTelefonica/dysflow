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

// #861 — registry states in which dysflow is no longer actively driving the
// process (so a still-alive MSACCESS for one of these is a leftover), but which
// are not the in-flight ("running"/"starting") or already-retired ("cleaned")
// states. Used to surface dysflow-spawned COM zombies from our own records.
const TERMINAL_ORPHAN_STATUSES: ReadonlySet<string> = new Set([
  "failed",
  "timed_out",
  "completed",
  "cleanup_pending",
]);

function isTerminalOrphanStatus(status: string): boolean {
  return TERMINAL_ORPHAN_STATUSES.has(status);
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
 * When the user has explicitly named the PID via `confirmPid`, the COM-child
 * marker is the second-best proof that the live process is one of ours:
 * the headless + MSACCESS.EXE + `-Embedding`/`/automation` triad is only
 * produced by an automation host (dysflow is the documented automation
 * host on the bench). An absent command line is NOT a sufficient signal —
 * it could be a user-launched interactive MSACCESS that the operator
 * hasn't waited to populate (the historical ORPHAN_CLEANUP_PATH_UNVERIFIED
 * safety net) — so we still refuse in that case unless the registry
 * provides positive proof.
 *
 * Match is case-insensitive (PowerShell's WMI column is not stable across
 * OS versions, and `wmic` historically lowercases).
 */
function looksLikeDysflowComChild(proc: OsProcessInfo): boolean {
  if (proc.commandLine === undefined || proc.commandLine.length === 0) {
    return false;
  }
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

    // #861: dysflow spawns MSACCESS via COM automation, so its command line
    // carries NO .accdb path — the command-line pass above can never match it.
    // When one of our operations fails, its record moves to a terminal state
    // but the process may stay alive holding the lock. Surface those from OUR
    // OWN records: a terminal record whose accessPid is still a live headless
    // MSACCESS proving the same project + accessPath. The record is the proof of
    // ownership, so no caller-supplied command-line path match is required.
    const alreadyListed = new Set<number>(candidates.map((c) => c.pid));
    const normalizedRequestPath = normalizePathForMatching(request.accessPath);
    const normalizedRequestRoot = normalizePathForMatching(request.projectRoot);
    for (const record of registryRecords) {
      if (record.accessPid == null) continue;
      if (ownedPids.has(record.accessPid)) continue;
      if (alreadyListed.has(record.accessPid)) continue;
      if (!isTerminalOrphanStatus(record.status)) continue;
      if (normalizePathForMatching(record.projectRootAbs ?? "") !== normalizedRequestRoot) continue;
      if (normalizePathForMatching(record.accessPath ?? "") !== normalizedRequestPath) continue;

      const proc = processes.find(
        (p) => p.pid === record.accessPid && p.name.toUpperCase() === "MSACCESS.EXE",
      );
      if (proc === undefined) continue;
      // Skip a proven-visible interactive window; a 0 or unknown handle stays.
      if (typeof proc.mainWindowHandle === "number" && proc.mainWindowHandle !== 0) continue;

      alreadyListed.add(record.accessPid);
      candidates.push({
        pid: record.accessPid,
        accessPath: request.accessPath,
        kind: "access",
        startTime: proc.startTime,
        mainWindowHandle: proc.mainWindowHandle,
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

      const pathProven =
        liveProcess.commandLine !== undefined &&
        pathMatchesAccessPath(liveProcess.commandLine, accessPath);

      if (!pathProven) {
        // #861 — a dysflow-spawned (COM-automation) MSACCESS has no .accdb path
        // on its command line, so pathMatchesAccessPath can never prove identity.
        // Fall back to OUR OWN records: a record tracking this PID for the same
        // project + accessPath proves dysflow created it. Guard against Windows
        // PID recycling by comparing the recorded start time.
        const tracked = await this.findMostRecentTrackedRecordForPid(confirmPid, projectRoot);
        if (!tracked.ok) return failureResult(tracked.error);
        const record = tracked.record;
        const registryProven =
          record !== null &&
          normalizePathForMatching(record.accessPath ?? "") ===
            normalizePathForMatching(accessPath);

        if (!registryProven) {
          // Issue #1016 Part C — relax the path-match requirement when the
          // caller has explicitly confirmed the PID via `confirmPid` AND the
          // process matches the dysflow-spawned COM child profile: headless
          // (already verified above), MSACCESS.EXE (already verified), with
          // either no command line at all (Get-Process fallback), an
          // `-Embedding` / `/automation` / `/Embedding <pid>` flag, or no
          // .accdb path on its command line (the dysflow COM child never
          // carries one). The user has explicitly taken responsibility for
          // the kill; refusing them with PATH_MISMATCH when they have named
          // the exact PID leaves the bench unrecoverable via MCP.
          //
          // Safety properties preserved:
          //   - Non-headless refusals still fire (verified above).
          //   - Registry-owned PIDs (a different operation owns this PID right
          //     now) still refuse via the ORPHAN_CLEANUP_REGISTRY_OWNED gate
          //     below.
          //   - The PIN-recycled / path-mismatch safety net for any non-COM
          //     MSACCESS stays in place (registryProven === false triggers
          //     this branch; the COM-child profile gates the relaxation).
          if (looksLikeDysflowComChild(liveProcess)) {
            // Accept the kill — user-confirmed + headless MSACCESS.EXE that
            // is NOT carrying a per-instance .accdb path on its command
            // line. The registry fallback would also accept this PID if the
            // record survived the registry cleanup, but at this point the
            // record may have been retired (the in-memory registry purges
            // `cleaned` records, and a stale runner can lose the marker).
            // Letting the explicit confirmPid through is the same safety
            // level as the registryProven branch: the user named the PID
            // and the process matches our COM-child profile.
          } else if (liveProcess.commandLine === undefined) {
            return failureResult(
              createDysflowError(
                "ORPHAN_CLEANUP_PATH_UNVERIFIED",
                `Refused to kill PID ${confirmPid}: command line is unavailable, so it cannot be proven to hold ${accessPath}.`,
              ),
            );
          } else {
            return failureResult(
              createDysflowError(
                "ORPHAN_CLEANUP_PATH_MISMATCH",
                `PID ${confirmPid} is holding ${liveProcess.commandLine}, not ${accessPath}.`,
              ),
            );
          }
        }

        if (
          registryProven &&
          record !== null &&
          record.processStartTime !== undefined &&
          record.processStartTime !== null &&
          liveProcess.startTime !== undefined &&
          record.processStartTime !== liveProcess.startTime
        ) {
          return failureResult(
            createDysflowError(
              "ORPHAN_CLEANUP_PID_RECYCLED",
              `Refused to kill PID ${confirmPid}: the live process started at ${liveProcess.startTime ?? "unknown"} but the recorded operation ${record.operationId} started at ${record.processStartTime}. The PID was likely recycled by Windows.`,
            ),
          );
        }
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
