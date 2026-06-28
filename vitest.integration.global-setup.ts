/**
 * Vitest globalSetup for the integration suite.
 *
 * Runs ONCE before the integration test files start. Sweeps stale
 * `dysflow-*` sandboxes under `os.tmpdir()` so a previous run's orphans do
 * not pile up (issue #562). Failures are non-fatal: a locked `.laccdb`
 * should never crash the suite.
 */
import { tmpdir } from "node:os";
import { sweepStaleDysflowTempDirs } from "./test/integration/_helpers/global-setup-temp-sweep.js";

export default async function globalSetup(): Promise<void> {
  const result = await sweepStaleDysflowTempDirs({
    tmpdir: tmpdir(),
    thresholdHours: 24,
  });
  // Surface the sweep outcome to the CI log so the operator can see what
  // happened. This is informational only — never throws.
  if (result.scanned > 0) {
    // eslint-disable-next-line no-console
    console.log(
      `[dysflow:integration:setup] swept ${result.removed}/${result.scanned} stale dysflow-* temp dirs (skipped=${result.skipped})`,
    );
  }
}
