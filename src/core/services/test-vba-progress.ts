import { isRecord, stringValue } from "../utils/index.js";

/**
 * Issue #1990 — per-test progress of a running `test_vba` plan.
 *
 * The PowerShell runner executes the whole plan in one Access session and
 * rewrites its operation marker after each test. This module turns that raw
 * marker block into the shape the operation registry stores under
 * `metadata.testProgress`, and decides which progress notifications a poll
 * still owes the caller. It is pure: reading the marker is the adapter's job.
 */
export type TestVbaProgressResult = {
  procedure: string;
  ok: boolean;
  durationMs?: number;
  error?: string;
};

export type TestVbaProgress = {
  total: number;
  completed: number;
  passed: number;
  failed: number;
  /** The test running now, or `null` once the plan finished. */
  currentTest: string | null;
  /** Compact result of every finished test, in plan order. */
  results: TestVbaProgressResult[];
};

export type TestVbaProgressNotification = {
  progress: number;
  total: number;
  message: string;
};

/** Upper bound of a per-test error kept in the registry, so a record stays small. */
const PROGRESS_ERROR_LIMIT = 500;

/**
 * Parse the marker's `progress` block. `requestedNames` are the caller's plan
 * names in order (#1823): the runner reports the name Access received, which
 * may differ, so a result at index `i` is reported under `requestedNames[i]`.
 * Returns `undefined` when the block is absent or malformed.
 */
export function parseTestVbaProgress(
  value: unknown,
  requestedNames: readonly string[] = [],
): TestVbaProgress | undefined {
  if (!isRecord(value)) return undefined;
  const total = nonNegativeInt(value.total);
  const completed = nonNegativeInt(value.completed);
  if (total === undefined || completed === undefined) return undefined;
  const rawResults = Array.isArray(value.results) ? value.results : [];
  const results: TestVbaProgressResult[] = [];
  for (const [index, entry] of rawResults.entries()) {
    if (!isRecord(entry) || typeof entry.ok !== "boolean") continue;
    const procedure = requestedNames[index] ?? stringValue(entry.procedure) ?? "(unknown)";
    const durationMs = nonNegativeInt(entry.durationMs);
    const error = stringValue(entry.error);
    results.push({
      procedure,
      ok: entry.ok,
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(error === undefined ? {} : { error: error.slice(0, PROGRESS_ERROR_LIMIT) }),
    });
  }
  const passed = results.filter((result) => result.ok).length;
  const currentIndex = completed < total ? completed : undefined;
  const currentTest =
    currentIndex === undefined
      ? null
      : (requestedNames[currentIndex] ?? stringValue(value.currentTest) ?? null);
  return {
    total,
    completed,
    passed,
    failed: results.length - passed,
    currentTest,
    results,
  };
}

/**
 * The notifications owed for tests that finished after `alreadyNotified`
 * results were reported: one per test, `progress` counting from 1. A poll
 * that observes several finished tests at once still emits one each.
 */
export function pendingTestVbaNotifications(
  progress: TestVbaProgress,
  alreadyNotified: number,
): TestVbaProgressNotification[] {
  return progress.results.slice(alreadyNotified).map((result, offset) => ({
    progress: alreadyNotified + offset + 1,
    total: progress.total,
    message: `${result.procedure} ${result.ok ? "passed" : "failed"}`,
  }));
}

function nonNegativeInt(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}
