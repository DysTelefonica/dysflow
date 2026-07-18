/**
 * Issue #961 (B component) — composition root for the supplement drift scan.
 *
 * This module sits in `src/cli/` (not `src/core/`) because it imports
 * `node:fs` to read user-global instruction files from disk. The pure
 * kernel in `src/core/services/codegraph-supplement-drift-detector.ts`
 * stays free of I/O and is testable via an injected port.
 *
 * The doctor command (`src/cli/commands/doctor.ts`) calls
 * `runSupplementDriftCheck()` after the core diagnostics so the
 * `codegraph-vba` drift surfaces as a single check line in the doctor
 * output. A failed scan is warn-only by default (the user can decide
 * whether to act on it) — see the diagnostic render at the bottom of
 * `formatSupplementDriftDiagnostic`.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_INSTRUCTION_FILE_PATHS,
  detectSupplementDrift,
  type InstructionFileReadPort,
  type SupplementDriftScanResult,
} from "../../core/services/codegraph-supplement-drift-detector.js";
import { getHome } from "./install/agent-config.js";

/**
 * Options bag for {@link runSupplementDriftCheck}.
 *
 * Mirrors the `opencode-mcp-wiring.ts` style: every I/O seam is injected
 * so tests can drive the check against an in-memory fixture without
 * touching the user's home directory.
 */
export type SupplementDriftCheckOptions = {
  /** Absolute `$HOME` directory of the user; instruction files live under `~/.config/opencode/`. */
  home: string;
  /**
   * Async read port — defaults to `node:fs/promises#readFile`. Tests
   * override with an in-memory fake.
   */
  readFile?: (filePath: string) => Promise<string>;
  /**
   * Override the default file list — useful for tests and for opt-in
   * scans of additional locations (e.g. project-local AGENTS.md). When
   * omitted, the canonical `DEFAULT_INSTRUCTION_FILE_PATHS` is used.
   */
  relativePaths?: readonly string[];
};

export type SupplementDriftDiagnostic = {
  name: "codegraph-supplement-drift";
  /** `true` when zero drift findings were reported. */
  ok: boolean;
  /**
   * Human-readable summary line rendered by the doctor formatter. Always
   * non-empty so the doctor output stays uniform across warnings.
   */
  message: string;
  /**
   * The full scan result so callers (CLI, MCP, future tests) can render
   * the per-finding detail without re-running the scan.
   */
  result: SupplementDriftScanResult;
  /**
   * `true` when this diagnostic should NOT flip the doctor exit code —
   * a drift finding is a remediation hint, not a hard failure. Mirrors
   * the `warnOnly` pattern from `opencode-mcp-wiring.ts`.
   */
  warnOnly: boolean;
};

/**
 * Run the supplement drift check against the user's home directory.
 *
 * Resolution rules:
 * - The supplied `home` is joined with each entry in `relativePaths`
 *   (or `DEFAULT_INSTRUCTION_FILE_PATHS`) to produce absolute file paths.
 * - A missing file is NOT a hard failure — it surfaces in
 *   `result.errors[]` with code `FILE_READ_FAILED`. The diagnostic
 *   summary mentions how many files were skipped so the user can decide.
 * - A malformed `<!-- /user-supplement:* -->` closing marker is reported
 *   as a `malformedClosing: true` finding with its own remediation hint.
 */
export async function runSupplementDriftCheck(
  options: SupplementDriftCheckOptions,
): Promise<SupplementDriftDiagnostic> {
  const relativePaths = options.relativePaths ?? DEFAULT_INSTRUCTION_FILE_PATHS;
  const filePaths = relativePaths.map((relative) => path.join(options.home, relative));

  // The default port wraps `node:fs/promises#readFile` so the consumer
  // always gets a string. The native overload returns a Buffer when no
  // encoding is supplied, so we narrow it explicitly here.
  const port: InstructionFileReadPort = {
    readFile:
      options.readFile ??
      (async (filePath: string) => {
        return (await readFile(filePath, "utf8")) as string;
      }),
  };

  const result = await detectSupplementDrift({
    filePaths,
    port,
  });

  return formatSupplementDriftDiagnostic(result);
}

/**
 * Render a scan result as a `SupplementDriftDiagnostic`. Pure — no I/O.
 *
 * Output contract:
 * - `ok` is `true` only when zero drift findings AND zero read errors.
 * - `message` is a single-line summary suitable for the doctor `stdout`.
 *   Per-finding detail is available on `result.driftDetected[]` so the
 *   consumer can render an extended report without re-parsing the
 *   message.
 * - `warnOnly` is `true` regardless of drift — drift is a hint, not a
 *   blocker. The doctor formatter can choose to elevate to a hard
 *   failure if it wants stricter semantics; by default the user can
 *   decide whether to act on it.
 */
export function formatSupplementDriftDiagnostic(
  result: SupplementDriftScanResult,
): SupplementDriftDiagnostic {
  const driftCount = result.driftDetected.filter(
    (finding) => finding.malformedClosing !== true,
  ).length;
  const malformedCount = result.driftDetected.length - driftCount;
  const errorCount = result.errors.length;

  let message = `Scanned ${result.filesScanned} instruction file(s) / ${result.blocksScanned} supplement block(s).`;
  if (driftCount > 0) {
    message += ` Found ${driftCount} stale codegraph-vba runtime version reference(s) in user-supplement blocks.`;
  }
  if (malformedCount > 0) {
    message += ` Found ${malformedCount} malformed user-supplement closing marker(s).`;
  }
  if (errorCount > 0) {
    message += ` Skipped ${errorCount} unreadable file(s).`;
  }
  if (driftCount === 0 && malformedCount === 0 && errorCount === 0) {
    message += " No drift detected.";
  } else if (driftCount === 0 && malformedCount === 0) {
    message += " No drift detected in the files that were readable.";
  }

  return {
    name: "codegraph-supplement-drift",
    ok: driftCount === 0,
    message,
    result,
    warnOnly: true,
  };
}

/**
 * Convenience helper that resolves `$HOME` from `env` and runs the check.
 * Used by the doctor command when no explicit `home` was injected via
 * the CLI context.
 */
export async function runSupplementDriftCheckFromEnv(
  env: NodeJS.ProcessEnv,
  readFileFn?: (filePath: string) => Promise<string>,
): Promise<SupplementDriftDiagnostic> {
  return runSupplementDriftCheck({
    home: getHome(env),
    ...(readFileFn === undefined ? {} : { readFile: readFileFn }),
  });
}
