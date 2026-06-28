import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type SweepResult, sweepStaleDysflowTempDirs } from "./_helpers/global-setup-temp-sweep.js";

/**
 * Unit test for the temp-dir sweep helper. Excluded from the integration
 * pool (vitest.integration.config.ts) and kept in the fast unit run. The
 * helper itself is a pure filesystem function: no Access, no PowerShell,
 * no COM.
 */
describe("sweepStaleDysflowTempDirs (#562)", () => {
  let tmpRoot: string;

  beforeAll(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), "dysflow-sweep-unit-"));
  });

  afterAll(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("removes dysflow-* dirs older than the threshold and keeps fresh ones", async () => {
    const stale = join(tmpRoot, "dysflow-stale-A");
    const fresh = join(tmpRoot, "dysflow-fresh-B");
    const other = join(tmpRoot, "not-dysflow-prefix");

    await mkdir(stale, { recursive: true });
    await writeFile(join(stale, "marker.txt"), "stale");
    await mkdir(fresh, { recursive: true });
    await writeFile(join(fresh, "marker.txt"), "fresh");
    await mkdir(other, { recursive: true });
    await writeFile(join(other, "marker.txt"), "untouched");

    // Age the stale dir 48h into the past.
    const longAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await utimes(stale, longAgo, longAgo);

    const result = await sweepStaleDysflowTempDirs({
      tmpdir: tmpRoot,
      thresholdHours: 24,
    });

    expect(result).toEqual<SweepResult>({
      scanned: expect.any(Number),
      removed: expect.any(Number),
      skipped: expect.any(Number),
    });
    expect(result.removed).toBeGreaterThanOrEqual(1);
    // Stale gone, fresh + unrelated preserved.
    const { existsSync } = await import("node:fs");
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
    expect(existsSync(other)).toBe(true);
  });

  it("returns removed=0 and skipped=0 when nothing matches", async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), "dysflow-sweep-empty-"));
    try {
      const result = await sweepStaleDysflowTempDirs({
        tmpdir: emptyRoot,
        thresholdHours: 24,
      });
      expect(result.scanned).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.skipped).toBe(0);
    } finally {
      await rm(emptyRoot, { recursive: true, force: true });
    }
  });

  it("tolerates a locked .laccdb without throwing", async () => {
    const lockedRoot = await mkdtemp(join(tmpdir(), "dysflow-sweep-locked-"));
    try {
      const lockedDir = join(lockedRoot, "dysflow-locked-C");
      await mkdir(lockedDir, { recursive: true });
      // Create a file that simulates a still-held .laccdb lock. The sweep is
      // best-effort: if rm fails (EBUSY/EACCES on Windows), it MUST NOT throw.
      await writeFile(join(lockedDir, "NoConformidades.laccdb"), "lock");
      const longAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await utimes(lockedDir, longAgo, longAgo);

      await expect(
        sweepStaleDysflowTempDirs({ tmpdir: lockedRoot, thresholdHours: 24 }),
      ).resolves.toEqual(
        expect.objectContaining({
          scanned: expect.any(Number),
          // either removed or skipped, but never throws
          removed: expect.any(Number),
          skipped: expect.any(Number),
        }),
      );
    } finally {
      // Best-effort cleanup of the locked root itself.
      await rm(lockedRoot, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
