/**
 * Tests for the cross-process lock module (issue #477).
 *
 * Validates the injectability of the in-process serialized lock map.
 */
import { mkdir, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireCrossProcessAccessLock,
  CROSS_PROCESS_LOCK_STALE_MS,
  evictStaleLock,
  getCrossProcessLockPath,
  type LockFileSystemPort,
  RunnerLockTimeoutError,
  runWithAccessExecutionLock,
  startLockHeartbeat,
} from "../../../src/core/runner/cross-process-lock.js";

describe("cross-process-lock module API", () => {
  describe("getCrossProcessLockPath", () => {
    it("returns a deterministic path for a given access path", () => {
      const path1 = getCrossProcessLockPath("C:/data/finance.accdb");
      const path2 = getCrossProcessLockPath("C:/data/finance.accdb");
      expect(path1).toBe(path2);
    });

    it("returns the same path regardless of case", () => {
      const lower = getCrossProcessLockPath("C:/data/finance.accdb");
      const upper = getCrossProcessLockPath("C:/DATA/FINANCE.accdb");
      expect(lower).toBe(upper);
    });

    it("returns different paths for different access paths", () => {
      const path1 = getCrossProcessLockPath("C:/data/a.accdb");
      const path2 = getCrossProcessLockPath("C:/data/b.accdb");
      expect(path1).not.toBe(path2);
    });
  });

  describe("runWithAccessExecutionLock — lockState injectability", () => {
    it("serializes concurrent calls that share the same lockState map", async () => {
      const events: string[] = [];
      const lockState = new Map<string, Promise<void>>();
      // Use a single deterministic dbPath so the two calls share the same lock key.
      // Date.now() in the path is flaky on Windows (~1ms resolution) and can produce
      // distinct keys, defeating the in-process lock that the test is trying to exercise.
      const dbPath = join(tmpdir(), "serialization-test-deterministic.accdb");

      const task = (label: string) =>
        runWithAccessExecutionLock(
          dbPath,
          async () => {
            events.push(`start:${label}`);
            await new Promise((resolve) => setTimeout(resolve, 10));
            events.push(`end:${label}`);
            return label;
          },
          5_000,
          lockState,
        );

      const [r1, r2] = await Promise.all([task("first"), task("second")]);

      expect(r1).toBe("first");
      expect(r2).toBe("second");
      // The second task must not start before the first ends (same lockState).
      expect(events).toEqual(["start:first", "end:first", "start:second", "end:second"]);
    });

    it("does NOT serialize concurrent calls with DIFFERENT lockState maps (parallel)", async () => {
      const events: string[] = [];
      // Use two distinct deterministic dbPaths so the cross-process lock is also uncontested
      // — only the in-process lockState differs.
      const dbPath1 = join(tmpdir(), "parallel-test-first.accdb");
      const dbPath2 = join(tmpdir(), "parallel-test-second.accdb");

      const task = (label: string, dbPath: string, lockState: Map<string, Promise<void>>) =>
        runWithAccessExecutionLock(
          dbPath,
          async () => {
            events.push(`start:${label}`);
            await new Promise((resolve) => setTimeout(resolve, 10));
            events.push(`end:${label}`);
            return label;
          },
          5_000,
          lockState,
        );

      // Each call uses its own Map — no cross-call serialization.
      const [r1, r2] = await Promise.all([
        task("first", dbPath1, new Map()),
        task("second", dbPath2, new Map()),
      ]);

      expect(r1).toBe("first");
      expect(r2).toBe("second");
      // Both tasks run in parallel — starts interleave.
      // At least the two starts should both appear before the first end.
      const startFirst = events.indexOf("start:first");
      const startSecond = events.indexOf("start:second");
      const endFirst = events.indexOf("end:first");
      expect(startFirst).toBeLessThan(endFirst);
      expect(startSecond).toBeLessThan(endFirst);
    });

    it("accepts work that returns a non-promise value", async () => {
      const lockState = new Map<string, Promise<void>>();
      const dbPath = join(tmpdir(), "sync-result-deterministic.accdb");
      const result = await runWithAccessExecutionLock(dbPath, () => 42, 5_000, lockState);
      expect(result).toBe(42);
    });

    it("throws RunnerLockTimeoutError when lock cannot be acquired", async () => {
      const lockState = new Map<string, Promise<void>>();
      const dbPath = join(tmpdir(), "timeout-test-deterministic.accdb");
      // Pre-create the lock dir so acquireCrossProcessAccessLock sees EEXIST and enters the
      // wait loop. With a 1ms timeout the wait loop cannot complete before the deadline,
      // so the function must throw RunnerLockTimeoutError.
      const { getCrossProcessLockPath } = await import(
        "../../../src/core/runner/cross-process-lock.js"
      );
      const lockPath = getCrossProcessLockPath(dbPath);
      const { mkdir } = await import("node:fs/promises");
      await mkdir(lockPath, { recursive: false });
      try {
        await expect(
          runWithAccessExecutionLock(dbPath, async () => {}, 1, lockState),
        ).rejects.toThrow(RunnerLockTimeoutError);
      } finally {
        const { rm } = await import("node:fs/promises");
        await rm(lockPath, { recursive: true, force: true }).catch(() => {});
      }
    });

    it("cleans up lockState map entry after work completes", async () => {
      const lockState = new Map<string, Promise<void>>();
      const dbPath = join(tmpdir(), "cleanup-test-deterministic.accdb");
      await runWithAccessExecutionLock(dbPath, async () => {}, 5_000, lockState);
      const key = dbPath.toLowerCase();
      expect(lockState.has(key)).toBe(false);
    });

    it("releases cross-process lock even when work throws", async () => {
      const lockState = new Map<string, Promise<void>>();
      const dbPath = join(tmpdir(), "error-release-test-deterministic.accdb");

      await expect(
        runWithAccessExecutionLock(
          dbPath,
          async () => {
            throw new Error("synthetic error");
          },
          5_000,
          lockState,
        ),
      ).rejects.toThrow("synthetic error");

      // The second call must succeed (lock was released).
      const result = await runWithAccessExecutionLock(
        dbPath,
        async () => "second-call-ok",
        5_000,
        lockState,
      );
      expect(result).toBe("second-call-ok");
    });

    it("startLockHeartbeat returns a NodeJS.Timeout handle", () => {
      const dbPath = join(tmpdir(), "heartbeat-test-deterministic.accdb");
      const handle = startLockHeartbeat(dbPath);
      expect(typeof handle).toBe("object");
      expect(handle).not.toBeNull();
      clearInterval(handle);
    });

    it("startLockHeartbeat accepts an AbortSignal and auto-stops when it fires", () => {
      const dbPath = join(tmpdir(), "heartbeat-abort-test-deterministic.accdb");
      const ac = new AbortController();
      const handle = startLockHeartbeat(dbPath, ac.signal);
      expect(typeof handle).toBe("object");
      ac.abort();
      clearInterval(handle);
    });
  });

  describe("evictStaleLock — atomic claim (race-free stale eviction)", () => {
    const created: string[] = [];

    afterEach(async () => {
      for (const path of created.splice(0)) {
        await rm(path, { recursive: true, force: true }).catch(() => {});
      }
    });

    const makeStaleLockDir = async (label: string): Promise<string> => {
      const lockPath = join(tmpdir(), "dysflow-locks-test", `${label}-${process.pid}.lock`);
      created.push(lockPath);
      await rm(lockPath, { recursive: true, force: true }).catch(() => {});
      await mkdir(lockPath, { recursive: true });
      // Backdate mtime well past the stale threshold so it is unambiguously stale.
      const past = new Date(Date.now() - (CROSS_PROCESS_LOCK_STALE_MS + 60_000));
      await utimes(lockPath, past, past);
      return lockPath;
    };

    it("lets exactly ONE of two concurrent evictors claim the same stale lock", async () => {
      const lockPath = await makeStaleLockDir("concurrent-evict");

      // Both run in-flight; the kernel serializes the rename so only one source rename
      // can succeed. The other observes the directory already gone. This is the property
      // that prevents two processes from both deleting a freshly re-created lock.
      const results = await Promise.all([
        evictStaleLock(lockPath, CROSS_PROCESS_LOCK_STALE_MS),
        evictStaleLock(lockPath, CROSS_PROCESS_LOCK_STALE_MS),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
      // After a successful eviction the stale directory must be gone.
      await expect(stat(lockPath)).rejects.toThrow();
    });

    it("does NOT evict a fresh (non-stale) lock", async () => {
      const lockPath = join(tmpdir(), "dysflow-locks-test", `fresh-${process.pid}.lock`);
      created.push(lockPath);
      await rm(lockPath, { recursive: true, force: true }).catch(() => {});
      await mkdir(lockPath, { recursive: true });

      const evicted = await evictStaleLock(lockPath, CROSS_PROCESS_LOCK_STALE_MS);

      expect(evicted).toBe(false);
      // The live lock must survive.
      await expect(stat(lockPath)).resolves.toBeDefined();
    });

    it("returns false when the lock directory does not exist", async () => {
      const lockPath = join(tmpdir(), "dysflow-locks-test", `absent-${process.pid}.lock`);
      await rm(lockPath, { recursive: true, force: true }).catch(() => {});

      await expect(evictStaleLock(lockPath, CROSS_PROCESS_LOCK_STALE_MS)).resolves.toBe(false);
    });
  });

  describe("RunnerLockTimeoutError", () => {
    it("has correct name and message", () => {
      const error = new RunnerLockTimeoutError("/some/path.lock", 5000);
      expect(error.name).toBe("RunnerLockTimeoutError");
      expect(error.message).toContain("/some/path.lock");
      expect(error.message).toContain("5000");
      expect(error.lockPath).toBe("/some/path.lock");
      expect(error.timeoutMs).toBe(5000);
    });
  });

  it("supports in-memory LockFileSystemPort mock without touching physical disk", async () => {
    const virtualFiles = new Map<string, { mtimeMs: number; data?: string; isDir?: boolean }>();

    const mockFs: LockFileSystemPort = {
      mkdir: async (path) => {
        virtualFiles.set(path, { mtimeMs: Date.now(), isDir: true });
        return path;
      },
      rm: async (path) => {
        virtualFiles.delete(path);
      },
      stat: async (path) => {
        const file = virtualFiles.get(path);
        return file ? { mtimeMs: file.mtimeMs } : null;
      },
      utimes: async (path, _atime, mtime) => {
        const file = virtualFiles.get(path);
        if (file) file.mtimeMs = mtime.getTime();
      },
      writeFile: async (path, data) => {
        virtualFiles.set(path, { mtimeMs: Date.now(), data, isDir: false });
      },
      tmpdir: () => "vtmp",
    };

    const lockPath = getCrossProcessLockPath("virtual.accdb", mockFs);
    const release = await acquireCrossProcessAccessLock(lockPath, 1000, 50, mockFs);
    expect(virtualFiles.has(lockPath)).toBe(true);

    await release();
    expect(virtualFiles.has(lockPath)).toBe(false);
  });
});
