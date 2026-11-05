import { isRecord } from "../utils/index.js";

/**
 * Issue #1993 — the on-disk model of a detached `test_vba` run.
 *
 * A detached run lives in its own process (the hidden `dysflow test-run`
 * command) and persists everything a later reader needs under
 * `<projectRoot>/.dysflow/runtime/test-runs/<operationId>/`:
 *
 * - `request.json` — the `test_vba` input to run, never carrying a password;
 * - `state.json`   — status, runner identity and per-test progress;
 * - `result.json`  — the final MCP tool result, exactly as the synchronous
 *                    `test_vba` returns it;
 * - `runner.log`   — the runner's stdout/stderr.
 *
 * Everything in this module is pure; the store reads and writes it.
 */
export type TestRunStatus = "running" | "passed" | "failed" | "cancelled" | "crashed";

export const TERMINAL_TEST_RUN_STATUSES: ReadonlySet<TestRunStatus> = new Set([
  "passed",
  "failed",
  "cancelled",
  "crashed",
]);

/** Identity of a process: its PID plus its OS start time, which survives PID recycling. */
export type TestRunProcessIdentity = {
  pid: number;
  /** ISO start time reported by the OS, or `null` when the probe could not read it. */
  startTime: string | null;
};

export type TestRunProgress = {
  completed: number;
  planned: number;
  /** The test running now, or `null` before the first and after the last. */
  currentTest: string | null;
  passed: number;
  failed: number;
};

export type TestRunRequest = {
  operationId: string;
  toolName: "test_vba";
  /** The `test_vba` input the runner replays, with every secret removed. */
  input: Record<string, unknown>;
  /** The binary the run drives; the per-accessPath lock is keyed by it. */
  accessPath: string;
  /** Plan procedure names in order; `currentTest` is read from it. */
  plannedTests: string[];
  createdAt: string;
};

export type TestRunError = { code: string; message: string };

export type TestRunState = {
  operationId: string;
  status: TestRunStatus;
  accessPath: string;
  /** The process that started the run, until the runner records itself. */
  launcher: TestRunProcessIdentity | null;
  /** The detached runner process, once it started. */
  runner: TestRunProcessIdentity | null;
  /** The inner tracked Access operation, when the result names it. */
  accessOperationId: string | null;
  progress: TestRunProgress;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  /** Set when the run ended without a result (the runner could not run it). */
  error?: TestRunError;
};

/** The per-accessPath lock record (#1993 D3). */
export type TestRunLockRecord = {
  operationId: string;
  accessPath: string;
  pid: number;
  startTime: string | null;
  acquiredAt: string;
};

/** What a reader learns about a run; `crashed` is derived, never trusted from disk alone. */
export type TestRunView = {
  operationId: string;
  status: TestRunStatus;
  accessPath: string;
  progress: TestRunProgress;
  runner: TestRunProcessIdentity | null;
  accessOperationId: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  /** The stored synchronous `test_vba` result, once the run is terminal. */
  result?: unknown;
  error?: TestRunError;
  /** Why the run reads as crashed, with the end of the runner log. */
  crash?: { reason: string; logTail: string[] };
};

export type ActiveDetachedRun = {
  operationId: string;
  accessPath: string;
  pid: number;
  startTime: string | null;
  acquiredAt: string;
};

/**
 * The environment variable naming the run a detached runner process executes.
 * The launcher sets it in the runner's environment; the synchronous
 * `test_vba` guard (#1993 Q1) lets that run's own in-process call through the
 * accessPath lock it holds, and refuses every other synchronous run.
 */
export const TEST_RUN_OPERATION_ID_ENV = "DYSFLOW_TEST_RUN_OPERATION_ID";

/** Longest `get_test_run` long-poll, so a 60 s client timeout is never hit (#1993 D4). */
export const TEST_RUN_MAX_WAIT_SECONDS = 50;

/** Interval at which `get_test_run` re-reads a run while it waits. */
export const TEST_RUN_WAIT_POLL_MS = 1_000;

/** Run directories kept per project; older ones are pruned when a run starts (#1993 D6). */
export const TEST_RUN_RETENTION = 20;

/** Lines of `runner.log` reported with a crashed run. */
export const TEST_RUN_LOG_TAIL_LINES = 40;

/** Bytes of `runner.log` read to build the tail, so a huge log stays cheap. */
export const TEST_RUN_LOG_TAIL_BYTES = 64 * 1024;

/**
 * How long a run may stay without a recorded runner before it reads as
 * crashed: the launcher spawned it, but the runner never wrote its PID.
 */
export const TEST_RUN_START_GRACE_MS = 60_000;

/** Operation ids become directory names; anything else is refused before touching disk. */
const OPERATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export function isValidTestRunOperationId(value: string): boolean {
  return OPERATION_ID_PATTERN.test(value);
}

export function initialTestRunProgress(plannedTests: readonly string[]): TestRunProgress {
  return {
    completed: 0,
    planned: plannedTests.length,
    currentTest: plannedTests[0] ?? null,
    passed: 0,
    failed: 0,
  };
}

/**
 * Fold one #1990 progress notification into the run progress. `test_vba`
 * emits one notification per finished test, `progress` counting from 1 and
 * `message` reading `"<procedure> passed"` or `"<procedure> failed"`.
 */
export function applyTestVbaNotification(
  current: TestRunProgress,
  plannedTests: readonly string[],
  notification: { progress: number; total?: number; message?: string },
): TestRunProgress {
  const completed = Math.max(current.completed, Math.floor(notification.progress));
  const planned = notification.total ?? current.planned;
  const newlyFinished = completed - current.completed;
  const outcome = /\b(passed|failed)$/.exec(notification.message ?? "")?.[1];
  return {
    completed,
    planned,
    currentTest: completed < planned ? (plannedTests[completed] ?? null) : null,
    passed: current.passed + (outcome === "passed" ? newlyFinished : 0),
    failed: current.failed + (outcome === "failed" ? newlyFinished : 0),
  };
}

/** A tool result whose `isError` is set is a failed run; any other result passed. */
export function terminalStatusForResult(result: unknown): "passed" | "failed" {
  return isRecord(result) && result.isError === true ? "failed" : "passed";
}

/**
 * The progress a finished run reports: the counts of its stored result, so
 * the final progress never lags it (the last #1990 notification may not have
 * arrived). An all-green result counts `tests[]`; a `VBA_TESTS_FAILED`
 * result counts `error.details.results[]` and `failedCount`. A result that
 * counts no tests (a configuration error, say) keeps the received progress.
 * `currentTest` is always `null`: nothing runs any more.
 */
export function finalProgressForResult(current: TestRunProgress, result: unknown): TestRunProgress {
  const counted = countResultTests(result);
  if (counted === undefined) return { ...current, currentTest: null };
  return {
    completed: counted.passed + counted.failed,
    planned: Math.max(current.planned, counted.passed + counted.failed),
    currentTest: null,
    passed: counted.passed,
    failed: counted.failed,
  };
}

function countResultTests(result: unknown): { passed: number; failed: number } | undefined {
  if (!isRecord(result)) return undefined;
  const content = isRecord(result.structuredContent) ? result.structuredContent : result;
  const error = content.error;
  if (isRecord(error)) {
    if (error.code !== "VBA_TESTS_FAILED" || !isRecord(error.details)) return undefined;
    const results = error.details.results;
    if (!Array.isArray(results)) return undefined;
    const failed =
      typeof error.details.failedCount === "number"
        ? error.details.failedCount
        : results.filter((test) => isRecord(test) && test.ok === false).length;
    return { passed: Math.max(0, results.length - failed), failed };
  }
  if (!Array.isArray(content.tests)) return undefined;
  const failed = content.tests.filter((test) => isRecord(test) && test.ok === false).length;
  return { passed: content.tests.length - failed, failed };
}

/**
 * The tracked Access operation a `test_vba` result names, when it names one:
 * the response envelope carries it as `operation.operationId`.
 */
export function innerAccessOperationId(result: unknown): string | null {
  if (!isRecord(result)) return null;
  for (const candidate of [result.structuredContent, result]) {
    if (!isRecord(candidate)) continue;
    const operation = candidate.operation;
    if (isRecord(operation) && typeof operation.operationId === "string") {
      return operation.operationId;
    }
  }
  return null;
}

const SECRET_KEY_PATTERN = /(password|passwd|pwd|secret|token)/i;

/**
 * Remove every secret-bearing key from a request before it reaches disk.
 * A key naming the environment variable that holds a secret (`passwordEnv`)
 * is not itself a secret and is kept.
 */
export function stripTestRunSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripTestRunSecrets);
  if (!isRecord(value)) return value;
  const kept: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key) && !/Env$/.test(key)) continue;
    kept[key] = stripTestRunSecrets(entry);
  }
  return kept;
}

/** The last `maxLines` non-empty lines of a log. */
export function logTail(text: string, maxLines = TEST_RUN_LOG_TAIL_LINES): string[] {
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  return lines.slice(-maxLines);
}

export function parseTestRunState(value: unknown): TestRunState | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.operationId !== "string" || typeof value.status !== "string") return undefined;
  if (!isRecord(value.progress)) return undefined;
  return value as unknown as TestRunState;
}

export function parseTestRunRequest(value: unknown): TestRunRequest | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.operationId !== "string" || typeof value.accessPath !== "string") {
    return undefined;
  }
  if (!isRecord(value.input)) return undefined;
  return {
    ...(value as unknown as TestRunRequest),
    plannedTests: Array.isArray(value.plannedTests)
      ? value.plannedTests.filter((name): name is string => typeof name === "string")
      : [],
  };
}

export function parseTestRunLockRecord(value: unknown): TestRunLockRecord | undefined {
  if (!isRecord(value)) return undefined;
  const { operationId, accessPath, pid, startTime, acquiredAt } = value;
  if (typeof operationId !== "string" || typeof accessPath !== "string") return undefined;
  if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) return undefined;
  return {
    operationId,
    accessPath,
    pid,
    startTime: typeof startTime === "string" ? startTime : null,
    acquiredAt: typeof acquiredAt === "string" ? acquiredAt : "",
  };
}
