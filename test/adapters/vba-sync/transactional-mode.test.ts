import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nodeTransactionalFileSystem } from "../../../src/adapters/vba-sync/node-transactional-file-system";
import {
  cleanupOrphanedTransactionalCopies,
  transactionalWrite,
} from "../../../src/core/services/transactional-write";

/**
 * Issue #975 — transactional mode for write-tools.
 *
 * Contract:
 *   1. `transactional: true` copies the binary to
 *      `<projectRoot>/.dysflow/runtime/transactional/<uuid>/<name>.accdb`,
 *      runs the write against the copy, and atomically renames the copy
 *      back to the original on success.
 *   2. On ANY failure (pre-flight, gate, post-write verify), the copy is
 *      deleted and the original is untouched. The pre/post SHA-256 of
 *      the original must match exactly.
 *   3. The atomic commit is a single filesystem rename operation.
 *      There is no intermediate state where the original is partially
 *      updated.
 *   4. Orphaned transactional copies (e.g. process killed mid-transaction)
 *      are cleaned on the next call by the `cleanupOrphanedTransactionalCopies`
 *      helper — directories older than the threshold are deleted.
 *   5. `transactional: false` (default) preserves current non-atomic
 *      behavior. The wrapper is a no-op when the flag is absent; the
 *      caller's `execute` runs directly against the original binary.
 */

async function sha256Of(path: string): Promise<string> {
  const buf = await readFile(path);
  return createHash("sha256").update(buf).digest("hex");
}

const NOW_MS = Date.parse("2026-07-18T12:00:00.000Z");

describe("transactional mode for write-tools (Round-12 #975)", () => {
  let workdir: string;
  let binaryPath: string;
  let stagingRoot: string;

  beforeEach(async () => {
    workdir = await mkdtemp(join(tmpdir(), "dysflow-tx-"));
    binaryPath = join(workdir, "App.accdb");
    stagingRoot = join(workdir, ".dysflow", "runtime", "transactional");
    // Synthetic 4 KiB binary.
    const seed = Buffer.alloc(4096);
    for (let i = 0; i < seed.length; i += 1) seed[i] = i & 0xff;
    await writeFile(binaryPath, seed);
  });

  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await rm(workdir, { recursive: true, force: true });
  });

  it("transactional:true copies to staging, runs against copy, and commits atomically on success", async () => {
    const originalSha = await sha256Of(binaryPath);
    const seenStaging: string[] = [];

    const result = await transactionalWrite({
      fileSystem: nodeTransactionalFileSystem,
      stagingRoot,
      binaryPath,
      generateId: () => "uuid-success",
      execute: async (stagingPath) => {
        seenStaging.push(stagingPath);
        const mutated = Buffer.from("mutation-success-marker");
        await writeFile(stagingPath, mutated);
        return { ok: true, data: { imported: 1 } };
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data).toEqual({ imported: 1 });
    expect(seenStaging).toHaveLength(1);
    expect(seenStaging[0]).toBe(join(stagingRoot, "uuid-success", "App.accdb"));
    const afterContent = await readFile(binaryPath);
    expect(afterContent.toString("utf8")).toBe("mutation-success-marker");
    expect(result.originalSha256).toBe(originalSha);
    const { stat } = await import("node:fs/promises");
    const stagingAfter = await stat(seenStaging[0] as string).catch(() => null);
    expect(stagingAfter).toBeNull();
  });

  it("transactional:true leaves original SHA-256 untouched on execute failure", async () => {
    const originalSha = await sha256Of(binaryPath);

    const result = await transactionalWrite({
      fileSystem: nodeTransactionalFileSystem,
      stagingRoot,
      binaryPath,
      generateId: () => "uuid-exec-fail",
      execute: async (stagingPath) => {
        await writeFile(stagingPath, "would-have-corrupted-the-binary");
        return {
          ok: false,
          error: {
            code: "VBA_IMPORT_FAILED",
            message: "synthetic import failure",
            retryable: false,
          },
        };
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("VBA_IMPORT_FAILED");
    const afterSha = await sha256Of(binaryPath);
    expect(afterSha).toBe(originalSha);
    expect(result.originalSha256).toBe(originalSha);
    const { stat } = await import("node:fs/promises");
    const stagingFile = join(stagingRoot, "uuid-exec-fail", "App.accdb");
    expect(await stat(stagingFile).catch(() => null)).toBeNull();
    const stagingDir = join(stagingRoot, "uuid-exec-fail");
    expect(await stat(stagingDir).catch(() => null)).toBeNull();
    const originalAfter = await readFile(binaryPath);
    expect(originalAfter.toString("utf8")).not.toBe("would-have-corrupted-the-binary");
  });

  it("transactional:true leaves original SHA-256 untouched on post-write verify failure", async () => {
    const originalSha = await sha256Of(binaryPath);

    const result = await transactionalWrite({
      fileSystem: nodeTransactionalFileSystem,
      stagingRoot,
      binaryPath,
      generateId: () => "uuid-verify-fail",
      execute: async (stagingPath) => {
        await writeFile(stagingPath, "post-write-verify-failed");
        return { ok: true, data: { imported: 1 } };
      },
      verify: async () => ({
        ok: false,
        error: {
          code: "VERIFY_FAILED",
          message: "synthetic verify failure",
          retryable: false,
        },
      }),
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("VERIFY_FAILED");
    const afterSha = await sha256Of(binaryPath);
    expect(afterSha).toBe(originalSha);
    const { stat } = await import("node:fs/promises");
    const stagingDir = join(stagingRoot, "uuid-verify-fail");
    expect(await stat(stagingDir).catch(() => null)).toBeNull();
  });

  it("atomic commit is a single filesystem rename — no intermediate half-updated state", async () => {
    const originalSha = await sha256Of(binaryPath);
    const observations: Array<{ phase: string; sha: string }> = [];

    const result = await transactionalWrite({
      fileSystem: nodeTransactionalFileSystem,
      stagingRoot,
      binaryPath,
      generateId: () => "uuid-atomic",
      execute: async (stagingPath) => {
        observations.push({ phase: "during-execute", sha: await sha256Of(binaryPath) });
        await writeFile(stagingPath, "new-content");
        return { ok: true, data: { ok: true } };
      },
    });

    expect(result.ok).toBe(true);
    expect(observations).toEqual([{ phase: "during-execute", sha: originalSha }]);
    const afterContent = await readFile(binaryPath);
    expect(afterContent.toString("utf8")).toBe("new-content");
  });

  it("orphaned transactional copies older than the threshold are cleaned", async () => {
    const { mkdir, stat, utimes } = await import("node:fs/promises");

    const staleDir = join(stagingRoot, "uuid-stale");
    const freshDir = join(stagingRoot, "uuid-fresh");
    await mkdir(staleDir, { recursive: true });
    await mkdir(freshDir, { recursive: true });
    await writeFile(join(staleDir, "App.accdb"), "stale");
    await writeFile(join(freshDir, "App.accdb"), "fresh");
    const twoHoursAgo = new Date(NOW_MS - 2 * 60 * 60 * 1000);
    await utimes(staleDir, twoHoursAgo, twoHoursAgo);

    const result = await cleanupOrphanedTransactionalCopies({
      fileSystem: nodeTransactionalFileSystem,
      stagingRoot,
      thresholdMs: 60 * 60 * 1000,
      nowMs: NOW_MS,
    });

    expect(result.cleaned).toEqual(["uuid-stale"]);
    expect(result.errors).toEqual([]);
    expect(await stat(staleDir).catch(() => null)).toBeNull();
    expect(await stat(freshDir)).not.toBeNull();
  });

  it("orphaned transactional copies: missing stagingRoot is a no-op (idle case)", async () => {
    const missingRoot = join(workdir, "never-created");

    const result = await cleanupOrphanedTransactionalCopies({
      fileSystem: nodeTransactionalFileSystem,
      stagingRoot: missingRoot,
      thresholdMs: 60 * 60 * 1000,
      nowMs: NOW_MS,
    });

    expect(result.cleaned).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("transactional:false / omitted flag preserves current non-atomic behavior (the wrapper is opt-in)", async () => {
    const { stat } = await import("node:fs/promises");

    const execute = async (target: string) => {
      await writeFile(target, "legacy-direct-mutation");
      return { ok: true as const, data: { ok: true } };
    };

    const shimTransactional = (params: { transactional?: boolean }) =>
      params.transactional === true
        ? transactionalWrite({
            fileSystem: nodeTransactionalFileSystem,
            stagingRoot,
            binaryPath,
            execute: (stagingPath) => execute(stagingPath),
          })
        : execute(binaryPath);

    const result = await shimTransactional({});
    expect(result.ok).toBe(true);
    const afterContent = await readFile(binaryPath);
    expect(afterContent.toString("utf8")).toBe("legacy-direct-mutation");
    expect(await stat(stagingRoot).catch(() => null)).toBeNull();
  });
});
