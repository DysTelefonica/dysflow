/**
 * Sweep helper for stale `dysflow-*` temp sandboxes.
 *
 * Background (issue #562): Access COM E2E tests create per-run workspaces
 * under `os.tmpdir()` named `dysflow-*-<pid>-<timestamp>`. The `try/finally`
 * cleanup can race with a still-held `.laccdb` lock and leave the directory
 * behind. Over time `%TEMP%` accumulates thousands of these orphans, which
 * degrades filesystem scan performance and worsens COM contention.
 *
 * The sweep runs at vitest startup (`globalSetup`) and removes any
 * `dysflow-*` directory older than `thresholdHours` whose removal succeeds.
 * If `rm` throws (EBUSY/EACCES — Windows .laccdb lock still held), the
 * directory is counted as `skipped` and left to the OS reaper. The sweep
 * NEVER throws.
 *
 * Pure function: no Access, no PowerShell, no network. Easy to unit test.
 */
import { readdir, rm, stat } from "node:fs/promises";

export type SweepResult = {
  scanned: number;
  removed: number;
  skipped: number;
};

export type SweepOptions = {
  /** Directory to scan (typically `os.tmpdir()`). */
  tmpdir: string;
  /** Age threshold in hours. Directories with mtime older than this are removed. */
  thresholdHours: number;
  /** Override for the test surface; defaults to `node:fs/promises` rm. */
  rmImpl?: (path: string) => Promise<void>;
};

const DYSFLOW_PREFIX = "dysflow-";
const ONE_HOUR_MS = 60 * 60 * 1000;

async function defaultRm(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true });
}

export async function sweepStaleDysflowTempDirs(options: SweepOptions): Promise<SweepResult> {
  const { tmpdir, thresholdHours, rmImpl = defaultRm } = options;
  const cutoffMs = Date.now() - thresholdHours * ONE_HOUR_MS;
  const remove = rmImpl;

  let entries: string[];
  try {
    entries = await readdir(tmpdir);
  } catch {
    // tmpdir may be unreadable in sandboxed contexts; surface as a zero-result
    // sweep rather than crashing the test suite.
    return { scanned: 0, removed: 0, skipped: 0 };
  }

  let scanned = 0;
  let removed = 0;
  let skipped = 0;

  for (const entry of entries) {
    if (!entry.startsWith(DYSFLOW_PREFIX)) continue;
    scanned += 1;

    const fullPath = `${tmpdir}/${entry}`;
    try {
      const stats = await stat(fullPath);
      if (!stats.isDirectory()) continue;
      if (stats.mtimeMs > cutoffMs) continue;

      try {
        await remove(fullPath);
        removed += 1;
      } catch {
        // Lock contention: `.laccdb` still held by a zombie Access instance.
        // Leave the directory to the OS reaper; do NOT propagate.
        skipped += 1;
      }
    } catch {
      // Entry disappeared between readdir and stat; skip silently.
      skipped += 1;
    }
  }

  return { scanned, removed, skipped };
}
