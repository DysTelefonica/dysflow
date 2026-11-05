import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  createDysflowError,
  type DysflowError,
  TEST_RUN_ALREADY_ACTIVE,
} from "../contracts/index.js";
import { sameProcessStartTime } from "../operations/access-operation-cleanup.js";
import { createAccessOperationId } from "../operations/access-operation-registry.js";
import { canonicalizeAccessLockIdentity } from "../runner/cross-process-lock.js";
import {
  type ActiveDetachedRun,
  initialTestRunProgress,
  isValidTestRunOperationId,
  logTail,
  parseTestRunLockRecord,
  parseTestRunRequest,
  parseTestRunState,
  stripTestRunSecrets,
  TERMINAL_TEST_RUN_STATUSES,
  TEST_RUN_LOG_TAIL_BYTES,
  TEST_RUN_RETENTION,
  TEST_RUN_START_GRACE_MS,
  type TestRunError,
  type TestRunLockRecord,
  type TestRunProcessIdentity,
  type TestRunRequest,
  type TestRunState,
  type TestRunView,
} from "./test-run-model.js";
import type { RunnerProcessProbe, TestRunFileSystemPort } from "./test-run-ports.js";

export const TEST_RUN_FILES = {
  request: "request.json",
  state: "state.json",
  result: "result.json",
  log: "runner.log",
} as const;

/** `<projectRoot>/.dysflow/runtime/test-runs` — every run directory and lock lives here. */
export function resolveTestRunsRoot(projectRoot: string): string {
  return join(projectRoot, ".dysflow", "runtime", "test-runs");
}

export type TestRunStoreOptions = {
  runsRoot: string;
  fileSystem: TestRunFileSystemPort;
  processProbe: RunnerProcessProbe;
  clock?: () => Date;
  /** The PID of this process, recorded as the launcher of the runs it prepares. */
  selfPid?: number;
  createOperationId?: () => string;
  retention?: number;
  startGraceMs?: number;
};

export type PrepareTestRunInput = {
  input: Record<string, unknown>;
  accessPath: string;
  plannedTests: readonly string[];
};

export type PrepareTestRunResult =
  | { ok: true; operationId: string; runDir: string; prunedOperationIds: string[] }
  | { ok: false; error: DysflowError };

export type TestRunLockAcquisition =
  | { ok: true; record: TestRunLockRecord }
  | { ok: false; error: DysflowError; activeOperationId: string };

/** How many times a stale lock is taken over before giving up to a racing acquirer. */
const LOCK_ACQUIRE_ATTEMPTS = 4;

/**
 * Issue #1993 — the detached test-run store: run directories, their state,
 * the per-accessPath lock and retention.
 *
 * Reads never take the operation registry lock: a run is read from its own
 * files only, so a reader never waits on a running test. Every status that is
 * not terminal is re-derived on read, because only a live runner can keep a
 * run `running` (#1993 D5).
 */
export class TestRunStore {
  private readonly runsRoot: string;
  private readonly fileSystem: TestRunFileSystemPort;
  private readonly processProbe: RunnerProcessProbe;
  private readonly clock: () => Date;
  private readonly selfPid: number;
  private readonly createOperationId: () => string;
  private readonly retention: number;
  private readonly startGraceMs: number;

  constructor(options: TestRunStoreOptions) {
    this.runsRoot = options.runsRoot;
    this.fileSystem = options.fileSystem;
    this.processProbe = options.processProbe;
    this.clock = options.clock ?? (() => new Date());
    this.selfPid = options.selfPid ?? process.pid;
    this.createOperationId = options.createOperationId ?? createAccessOperationId;
    this.retention = Math.max(1, options.retention ?? TEST_RUN_RETENTION);
    this.startGraceMs = options.startGraceMs ?? TEST_RUN_START_GRACE_MS;
  }

  runDirectory(operationId: string): string {
    return join(this.runsRoot, operationId);
  }

  runFile(operationId: string, file: keyof typeof TEST_RUN_FILES): string {
    return join(this.runDirectory(operationId), TEST_RUN_FILES[file]);
  }

  /**
   * Create a run directory with its request and initial state, take the
   * accessPath lock for it on behalf of this (launcher) process, and prune
   * old runs. Refused with `TEST_RUN_ALREADY_ACTIVE` while another run holds
   * the lock; the refused run leaves nothing on disk.
   */
  async prepareRun(prepare: PrepareTestRunInput): Promise<PrepareTestRunResult> {
    const operationId = this.createOperationId();
    if (!isValidTestRunOperationId(operationId)) {
      return {
        ok: false,
        error: createDysflowError("INVALID_INPUT", `Invalid test run id: ${operationId}`),
      };
    }
    const now = this.now();
    const request: TestRunRequest = {
      operationId,
      toolName: "test_vba",
      input: stripTestRunSecrets(prepare.input) as Record<string, unknown>,
      accessPath: prepare.accessPath,
      plannedTests: [...prepare.plannedTests],
      createdAt: now,
    };
    const launcher = await this.identify(this.selfPid);
    const state: TestRunState = {
      operationId,
      status: "running",
      accessPath: prepare.accessPath,
      launcher,
      runner: null,
      accessOperationId: null,
      progress: initialTestRunProgress(request.plannedTests),
      createdAt: now,
      updatedAt: now,
      finishedAt: null,
    };
    const runDir = this.runDirectory(operationId);
    await this.fileSystem.mkdir(runDir);
    await this.writeJson(this.runFile(operationId, "request"), request);
    await this.writeJson(this.runFile(operationId, "state"), state);

    const lock = await this.acquireLock(prepare.accessPath, { operationId, ...launcher });
    if (!lock.ok) {
      await this.fileSystem.removeTree(runDir);
      return { ok: false, error: lock.error };
    }
    const prunedOperationIds = await this.pruneRuns(operationId);
    return { ok: true, operationId, runDir, prunedOperationIds };
  }

  async readRequest(operationId: string): Promise<TestRunRequest | undefined> {
    if (!isValidTestRunOperationId(operationId)) return undefined;
    return parseTestRunRequest(await this.readJson(this.runFile(operationId, "request")));
  }

  async readState(operationId: string): Promise<TestRunState | undefined> {
    if (!isValidTestRunOperationId(operationId)) return undefined;
    return parseTestRunState(await this.readJson(this.runFile(operationId, "state")));
  }

  /** Read-modify-write of `state.json`; only the run's own runner writes it while it runs. */
  async updateState(
    operationId: string,
    update: (state: TestRunState) => TestRunState,
  ): Promise<TestRunState | undefined> {
    const current = await this.readState(operationId);
    if (current === undefined) return undefined;
    const next = { ...update(current), updatedAt: this.now() };
    await this.writeJson(this.runFile(operationId, "state"), next);
    return next;
  }

  async writeResult(operationId: string, result: unknown): Promise<void> {
    await this.writeJson(this.runFile(operationId, "result"), result);
  }

  async readResult(operationId: string): Promise<unknown> {
    if (!isValidTestRunOperationId(operationId)) return undefined;
    return this.readJson(this.runFile(operationId, "result"));
  }

  /**
   * End a run that never reached its runner (for example a failed spawn):
   * it reads as `crashed` with the reason, and its lock is released.
   */
  async abandonRun(operationId: string, error: TestRunError): Promise<void> {
    const state = await this.updateState(operationId, (current) => ({
      ...current,
      status: "crashed",
      finishedAt: this.now(),
      error,
    }));
    if (state !== undefined) await this.releaseLock(state.accessPath, operationId);
  }

  /** The run as a reader sees it, or `undefined` when no such run exists. */
  async readTestRun(operationId: string): Promise<TestRunView | undefined> {
    const state = await this.readState(operationId);
    if (state === undefined) return undefined;
    const view: TestRunView = {
      operationId: state.operationId,
      status: state.status,
      accessPath: state.accessPath,
      progress: state.progress,
      runner: state.runner,
      accessOperationId: state.accessOperationId ?? null,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt,
      finishedAt: state.finishedAt ?? null,
      ...(state.error === undefined ? {} : { error: state.error }),
    };
    if (TERMINAL_TEST_RUN_STATUSES.has(state.status)) {
      const result = await this.readResult(operationId);
      if (result !== undefined) view.result = result;
      if (state.status === "crashed") {
        view.crash = {
          reason: state.error?.message ?? "The test run crashed.",
          logTail: await this.readLogTail(operationId),
        };
      }
      return view;
    }
    const crashReason = await this.crashReason(state);
    if (crashReason === undefined) return view;
    return {
      ...view,
      status: "crashed",
      crash: { reason: crashReason, logTail: await this.readLogTail(operationId) },
    };
  }

  /**
   * The detached run driving `accessPath` now, or `undefined`. A lock whose
   * holder died, whose PID was recycled, or whose run is no longer running is
   * stale and reads as no active run.
   */
  async getActiveDetachedRun(accessPath: string): Promise<ActiveDetachedRun | undefined> {
    const lock = parseTestRunLockRecord(await this.readJson(this.lockPath(accessPath)));
    if (lock === undefined) return undefined;
    if (!(await this.isLive(lock))) return undefined;
    return {
      operationId: lock.operationId,
      accessPath: lock.accessPath,
      pid: lock.pid,
      startTime: lock.startTime,
      acquiredAt: lock.acquiredAt,
    };
  }

  /**
   * Take the accessPath lock for `owner.operationId`. The run that already
   * holds it may re-take it under a new identity (the runner adopting the
   * launcher's lock). Another live run's lock refuses with
   * `TEST_RUN_ALREADY_ACTIVE`; a stale one is taken over.
   */
  async acquireLock(
    accessPath: string,
    owner: { operationId: string } & TestRunProcessIdentity,
  ): Promise<TestRunLockAcquisition> {
    const lockPath = this.lockPath(accessPath);
    const record: TestRunLockRecord = {
      operationId: owner.operationId,
      accessPath,
      pid: owner.pid,
      startTime: owner.startTime,
      acquiredAt: this.now(),
    };
    const text = `${JSON.stringify(record, null, 2)}\n`;
    await this.fileSystem.mkdir(this.runsRoot);
    for (let attempt = 0; attempt < LOCK_ACQUIRE_ATTEMPTS; attempt += 1) {
      if (await this.fileSystem.createExclusive(lockPath, text)) return { ok: true, record };
      const raw = await this.fileSystem.readText(lockPath);
      if (raw === null) continue;
      const held = parseTestRunLockRecord(parseJson(raw));
      if (held?.operationId === owner.operationId) {
        await this.fileSystem.writeAtomic(lockPath, text);
        return { ok: true, record };
      }
      if (held !== undefined && (await this.isLive(held))) {
        return { ok: false, error: alreadyActiveError(held), activeOperationId: held.operationId };
      }
      await this.takeOverStaleLock(lockPath, raw);
    }
    const held = parseTestRunLockRecord(await this.readJson(lockPath));
    const activeOperationId = held?.operationId ?? "unknown";
    return {
      ok: false,
      error: alreadyActiveError(
        held ?? { ...record, operationId: activeOperationId, pid: 0, startTime: null },
      ),
      activeOperationId,
    };
  }

  /** Release the accessPath lock, but only while `operationId` still holds it. */
  async releaseLock(accessPath: string, operationId: string): Promise<void> {
    const lockPath = this.lockPath(accessPath);
    const held = parseTestRunLockRecord(await this.readJson(lockPath));
    if (held?.operationId !== operationId) return;
    await this.fileSystem.removeFile(lockPath);
  }

  /**
   * Keep the newest `retention` runs (counting `keepOperationId`) and remove
   * the older ones, never one that is still running. Returns the removed ids.
   */
  async pruneRuns(keepOperationId: string): Promise<string[]> {
    const names = (await this.fileSystem.listDirectories(this.runsRoot)).filter(
      isValidTestRunOperationId,
    );
    const runs: { operationId: string; createdAt: string }[] = [];
    for (const name of names) {
      if (name === keepOperationId) continue;
      const state = await this.readState(name);
      // A directory without a readable state may be a run being created right now.
      if (state === undefined) continue;
      runs.push({ operationId: name, createdAt: state.createdAt });
    }
    runs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
    const pruned: string[] = [];
    for (const run of runs.slice(this.retention - 1)) {
      const view = await this.readTestRun(run.operationId);
      if (view?.status === "running") continue;
      await this.fileSystem.removeTree(this.runDirectory(run.operationId));
      pruned.push(run.operationId);
    }
    return pruned;
  }

  /** This process's identity as the OS reports it. */
  async identify(pid: number): Promise<TestRunProcessIdentity> {
    const probe = await this.processProbe.inspect(pid);
    return { pid, startTime: probe.alive ? probe.startTime : null };
  }

  private lockPath(accessPath: string): string {
    const hash = createHash("sha256")
      .update(canonicalizeAccessLockIdentity(accessPath))
      .digest("hex")
      .slice(0, 16);
    return join(this.runsRoot, `access-${hash}.lock.json`);
  }

  private async isLive(lock: TestRunLockRecord): Promise<boolean> {
    if (!(await this.isSameProcessAlive({ pid: lock.pid, startTime: lock.startTime }))) {
      return false;
    }
    const view = await this.readTestRun(lock.operationId);
    return view?.status === "running";
  }

  /**
   * Move a stale lock aside and remove it. When the file moved aside is no
   * longer the stale lock that was observed (another acquirer replaced it in
   * between), it is put back so that acquirer keeps its lock.
   */
  private async takeOverStaleLock(lockPath: string, observed: string): Promise<void> {
    const tombstone = `${lockPath}.stale-${randomUUID()}`;
    if (!(await this.fileSystem.rename(lockPath, tombstone))) return;
    const moved = await this.fileSystem.readText(tombstone);
    if (moved !== null && moved !== observed) {
      await this.fileSystem.createExclusive(lockPath, moved);
    }
    await this.fileSystem.removeFile(tombstone);
  }

  private async crashReason(state: TestRunState): Promise<string | undefined> {
    if (state.runner !== null) {
      if (await this.isSameProcessAlive(state.runner)) return undefined;
      return `The test runner process ${state.runner.pid} is no longer running; the run ended without a result.`;
    }
    const ageMs = this.clock().getTime() - Date.parse(state.createdAt);
    if (Number.isNaN(ageMs) || ageMs <= this.startGraceMs) return undefined;
    return `The test runner never started within ${Math.round(this.startGraceMs / 1000)} s.`;
  }

  /** `false` when the PID is gone or now belongs to another process (its start time differs). */
  private async isSameProcessAlive(identity: TestRunProcessIdentity): Promise<boolean> {
    const probe = await this.processProbe.inspect(identity.pid);
    if (!probe.alive) return false;
    if (identity.startTime === null || probe.startTime === null) return true;
    return sameProcessStartTime(identity.startTime, probe.startTime);
  }

  private async readLogTail(operationId: string): Promise<string[]> {
    const text = await this.fileSystem.readTextTail(
      this.runFile(operationId, "log"),
      TEST_RUN_LOG_TAIL_BYTES,
    );
    return text === null ? [] : logTail(text);
  }

  private async readJson(path: string): Promise<unknown> {
    const raw = await this.fileSystem.readText(path);
    return raw === null ? undefined : parseJson(raw);
  }

  private async writeJson(path: string, value: unknown): Promise<void> {
    await this.fileSystem.writeAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
  }

  private now(): string {
    return this.clock().toISOString();
  }
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
  } catch {
    return undefined;
  }
}

function alreadyActiveError(held: TestRunLockRecord): DysflowError {
  return createDysflowError(
    TEST_RUN_ALREADY_ACTIVE,
    `A detached test run (${held.operationId}) is already running against ${held.accessPath}. Tests run one Access at a time.`,
    {
      details: {
        activeOperationId: held.operationId,
        accessPath: held.accessPath,
        runnerPid: held.pid,
      },
    },
  );
}
