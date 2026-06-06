import { sanitizeSecrets } from "../utils/index.js";

/**
 * TS↔PowerShell marker contract for RESULT lines (issue #440).
 *
 * The PowerShell child script emits exactly one line of the form:
 *   DYSFLOW_RESULT <compact-single-line-json>
 *
 * Rules:
 * - Exactly one DYSFLOW_RESULT line per successful operation.
 * - Payload: single-line compact JSON (ConvertTo-Json -Compress).
 * - Any diagnostic stdout (lines not starting with this prefix) is ignored
 *   for result extraction and must not corrupt parsing.
 * - Zero result lines → RunnerResultChannelError (no silent fallback).
 * - More than one result line → RunnerResultChannelError.
 * - Non-JSON payload → propagates as SyntaxError (loud).
 */
export const RESULT_MARKER = "DYSFLOW_RESULT ";

export class RunnerResultChannelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunnerResultChannelError";
  }
}

/**
 * Strict sentinel extractor — shared by parseRunnerData (access-runner.ts)
 * and parseOutput (vba-sync-adapter.ts).
 * Applies sanitizeSecrets before scanning, so callers can pass raw stdout safely.
 */
export function extractResultPayload(stdout: string, secrets: readonly string[]): unknown {
  const safe = sanitizeSecrets(stdout, secrets);
  const lines = safe.split(/\r?\n/).filter((l) => l.startsWith(RESULT_MARKER));
  if (lines.length === 0)
    throw new RunnerResultChannelError("No DYSFLOW_RESULT line in runner output");
  if (lines.length > 1)
    throw new RunnerResultChannelError(
      `Expected exactly 1 DYSFLOW_RESULT line, got ${lines.length}`,
    );
  // JSON.parse propagates SyntaxError as-is on malformed payload (loud)
  return JSON.parse(lines[0].slice(RESULT_MARKER.length));
}
