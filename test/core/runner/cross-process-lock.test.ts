/**
 * Tests for the cross-process lock module (issue #477).
 *
 * Validates the injectability of the in-process serialized lock map.
 */
import { mkdir, rm, stat, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nodeLockFileSystem } from "../../../src/adapters/runner/node-lock-file-system.js";
import {
  acquireCrossProcessAccessLock,
  CROSS_PROCESS_LOCK_STALE_MS,
  canonicalizeAccessLockIdentity,
  evictStaleLock,
  getCrossProcessLockPath,
  type LockFileSystemPort,
  RunnerLockTimeoutError,
  runWithAccessExecutionLock,
  runWithAccessExecutionReadLock,
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

    it("uses one identity and lock directory for Windows separator and dot-segment aliases", () => {
      const aliases = [
        "C:\\data\\finance.accdb",
        "C:/data/finance.accdb",
        "c:/data/./finance.accdb",
      ];

      expect(new Set(aliases.map(canonicalizeAccessLockIdentity))).toHaveLength(1);
      expect(new Set(aliases.map(getCrossProcessLockPath))).toHaveLength(1);
    });

    it("normalizes UNC aliases without collapsing them into POSIX identity", () => {
      const backslashAlias = "\\\\Server\\Share\\archive\\..\\finance.accdb";
      const slashAlias = "//server/share/finance.accdb";
      const identity = canonicalizeAccessLockIdentity(backslashAlias);

      expect(identity).toBe(canonicalizeAccessLockIdentity(slashAlias));
      expect(identity).toBe("unc://server/share/finance.accdb");
      expect(identity).not.toBe(canonicalizeAccessLockIdentity("/server/share/finance.accdb"));
    });

    it("keeps relative paths in an explicit identity namespace", () => {
      expect(canonicalizeAccessLockIdentity("./data/../finance.accdb")).toBe(
        "relative:finance.accdb",
      );
      expect(canonicalizeAccessLockIdentity("finance.accdb")).not.toBe(
        canonicalizeAccessLockIdentity("/finance.accdb"),
      );
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
          nodeLockFileSystem,
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
            await new Promise((resolve) => setTimeout(resolve, 100));
            events.push(`end:${label}`);
            return label;
          },
          5_000,
          nodeLockFileSystem,
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

    it.each([
      {
        style: "Windows",
        readAlias: "C:\\data\\finance.accdb",
        writeAlias: "c:/data/archive/../finance.accdb",
      },
      {
        style: "POSIX",
        readAlias: "/data/finance.accdb",
        writeAlias: "/data/archive/../finance.accdb",
      },
    ])("shares one read/write in-memory queue for $style aliases", async ({
      readAlias,
      writeAlias,
    }) => {
      const events: string[] = [];
      const lockState = new Map<string, Promise<void>>();
      const fileSystem: LockFileSystemPort = {
        mkdir: async (path) => path,
        rm: async () => {},
        stat: async () => null,
        utimes: async () => {},
        writeFile: async () => {},
        readFile: async () => null,
        isProcessAlive: () => false,
        tmpdir: () => tmpdir(),
      };

      const [readResult, writeResult] = await Promise.all([
        runWithAccessExecutionReadLock(
          readAlias,
          async () => {
            events.push("start:read");
            await new Promise((resolve) => setTimeout(resolve, 10));
            events.push("end:read");
            return "read";
          },
          lockState,
        ),
        runWithAccessExecutionLock(
          writeAlias,
          async () => {
            events.push("start:write");
            events.push("end:write");
            return "write";
          },
          5_000,
          fileSystem,
          lockState,
        ),
      ]);

      expect(readResult).toBe("read");
      expect(writeResult).toBe("write");
      expect(events).toEqual(["start:read", "end:read", "start:write", "end:write"]);
    });

    it("accepts work that returns a non-promise value", async () => {
      const lockState = new Map<string, Promise<void>>();
      const dbPath = join(tmpdir(), "sync-result-deterministic.accdb");
      const result = await runWithAccessExecutionLock(
        dbPath,
        () => 42,
        5_000,
        nodeLockFileSystem,
        lockState,
      );
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
          runWithAccessExecutionLock(dbPath, async () => {}, 1, nodeLockFileSystem, lockState),
        ).rejects.toThrow(RunnerLockTimeoutError);
      } finally {
        const { rm } = await import("node:fs/promises");
        await rm(lockPath, { recursive: true, force: true }).catch(() => {});
      }
    });

    it("cleans up lockState map entry after work completes", async () => {
      const lockState = new Map<string, Promise<void>>();
      const dbPath = join(tmpdir(), "cleanup-test-deterministic.accdb");
      await runWithAccessExecutionLock(
        dbPath,
        async () => {},
        5_000,
        nodeLockFileSystem,
        lockState,
      );
      const key = canonicalizeAccessLockIdentity(dbPath);
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
          nodeLockFileSystem,
          lockState,
        ),
      ).rejects.toThrow("synthetic error");

      // The second call must succeed (lock was released).
      const result = await runWithAccessExecutionLock(
        dbPath,
        async () => "second-call-ok",
        5_000,
        nodeLockFileSystem,
        lockState,
      );
      expect(result).toBe("second-call-ok");
    });

    it("does NOT poison in-process lockState when cross-process acquire times out", async () => {
      const lockState = new Map<string, Promise<void>>();
      const dbPath = join(tmpdir(), "poison-test-deterministic.accdb");
      const lockPath = getCrossProcessLockPath(dbPath);
      const key = canonicalizeAccessLockIdentity(dbPath);
      // Pre-create the lock dir so acquireCrossProcessAccessLock sees EEXIST, enters the
      // wait loop, and (with a 1ms timeout) throws RunnerLockTimeoutError. That throw
      // happens BEFORE the try/finally that releases the in-process lock — so a regression
      // here leaves the lockState entry pending forever and deadlocks every later same-key call.
      await mkdir(lockPath, { recursive: false });
      try {
        await expect(
          runWithAccessExecutionLock(dbPath, async () => "never", 1, nodeLockFileSystem, lockState),
        ).rejects.toThrow(RunnerLockTimeoutError);

        // The in-process lock entry must be cleaned up even though acquire threw.
        expect(lockState.has(key)).toBe(false);
      } finally {
        await rm(lockPath, { recursive: true, force: true }).catch(() => {});
      }

      // A subsequent call on the SAME key + SAME lockState must not hang. With the bug
      // present this awaits a never-resolving promise and the test times out.
      const result = await runWithAccessExecutionLock(
        dbPath,
        async () => "recovered",
        5_000,
        nodeLockFileSystem,
        lockState,
      );
      expect(result).toBe("recovered");
    });

    it("startLockHeartbeat returns a NodeJS.Timeout handle", () => {
      const dbPath = join(tmpdir(), "heartbeat-test-deterministic.accdb");
      const handle = startLockHeartbeat(dbPath, nodeLockFileSystem);
      expect(typeof handle).toBe("object");
      expect(handle).not.toBeNull();
      clearInterval(handle);
    });

    it("startLockHeartbeat accepts an AbortSignal and auto-stops when it fires", () => {
      const dbPath = join(tmpdir(), "heartbeat-abort-test-deterministic.accdb");
      const ac = new AbortController();
      const handle = startLockHeartbeat(dbPath, nodeLockFileSystem, ac.signal);
      expect(typeof handle).toBe("object");
      ac.abort();
      clearInterval(handle);
    });
  });

  describe("startLockHeartbeat — failure observability", () => {
    const stubPort = (overrides: Partial<LockFileSystemPort>): LockFileSystemPort => ({
      mkdir: async () => undefined,
      rm: async () => {},
      stat: async () => null,
      utimes: async () => {},
      writeFile: async () => {},
      readFile: async () => null,
      isProcessAlive: () => false,
      tmpdir: () => tmpdir(),
      ...overrides,
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("surfaces a non-ENOENT utimes failure to the error sink", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      const errors: unknown[] = [];
      const fileSystem = stubPort({
        utimes: async () => {
          const err: NodeJS.ErrnoException = new Error("operation not permitted");
          err.code = "EPERM";
          throw err;
        },
      });
      const handle = startLockHeartbeat("/locks/x.lock", fileSystem, undefined, (error) =>
        errors.push(error),
      );
      try {
        await vi.advanceTimersByTimeAsync(CROSS_PROCESS_LOCK_STALE_MS / 2);
        await vi.waitFor(() => expect(errors.length).toBeGreaterThan(0));
      } finally {
        clearInterval(handle);
      }
      expect((errors[0] as NodeJS.ErrnoException).code).toBe("EPERM");
    });

    it("does NOT surface an ENOENT utimes failure (lock already released)", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      const errors: unknown[] = [];
      const fileSystem = stubPort({
        utimes: async () => {
          const err: NodeJS.ErrnoException = new Error("no such file");
          err.code = "ENOENT";
          throw err;
        },
      });
      const handle = startLockHeartbeat("/locks/x.lock", fileSystem, undefined, (error) =>
        errors.push(error),
      );
      try {
        await vi.advanceTimersByTimeAsync(CROSS_PROCESS_LOCK_STALE_MS / 2);
        // Flush any pending microtasks from the fire-and-forget catch handler.
        await Promise.resolve();
        await Promise.resolve();
      } finally {
        clearInterval(handle);
      }
      expect(errors).toHaveLength(0);
    });
  });

  // F3b (#620): heartbeat error propagation.
  // The lock API must accept an `onHeartbeatError` callback that the runner
  // supplies to surface non-ENOENT failures. The default (when the caller
  // omits the callback) MUST be a silent no-op — not the previous
  // `console.debug` sink that nobody reads.
  describe("heartbeat error propagation (F3b, #620)", () => {
    const stubPort = (overrides: Partial<LockFileSystemPort>): LockFileSystemPort => ({
      mkdir: async () => undefined,
      rm: async () => {},
      stat: async () => null,
      utimes: async () => {},
      writeFile: async () => {},
      readFile: async () => null,
      isProcessAlive: () => false,
      tmpdir: () => tmpdir(),
      ...overrides,
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("runWithAccessExecutionLock passes onHeartbeatError through to startLockHeartbeat (#620)", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      const errors: unknown[] = [];
      const fileSystem = stubPort({
        utimes: async () => {
          const err: NodeJS.ErrnoException = new Error("operation not permitted");
          err.code = "EPERM";
          throw err;
        },
      });
      const dbPath = join(tmpdir(), "f3b-callback-forward.accdb");
      const handle = await runWithAccessExecutionLock(
        dbPath,
        async () => {
          // Hold the lock long enough for the heartbeat to fire once while
          // the cross-process lock is held. Advance fake time past one
          // heartbeat interval (CROSS_PROCESS_LOCK_STALE_MS / 2).
          await vi.advanceTimersByTimeAsync(CROSS_PROCESS_LOCK_STALE_MS / 2 + 50);
          return "ok";
        },
        5_000,
        fileSystem,
        new Map(),
        (error) => errors.push(error),
      );
      try {
        expect(handle).toBe("ok");
        await vi.waitFor(() => expect(errors.length).toBeGreaterThan(0));
        expect((errors[0] as NodeJS.ErrnoException).code).toBe("EPERM");
      } finally {
        // Clean up any lock dirs created during the test.
        const lockPath = getCrossProcessLockPath(dbPath);
        await rm(lockPath, { recursive: true, force: true }).catch(() => {});
      }
    });

    it("startLockHeartbeat default callback is a no-op (#620)", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      // Spy on every console channel the previous default could have written
      // through (`logSwallowedIoError` → `console.debug`). The new default
      // must not touch any of them.
      const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const fileSystem = stubPort({
          utimes: async () => {
            const err: NodeJS.ErrnoException = new Error("operation not permitted");
            err.code = "EPERM";
            throw err;
          },
        });
        // F3b: call startLockHeartbeat WITHOUT supplying onHeartbeatError.
        // The default must be a silent no-op.
        const handle = startLockHeartbeat("/locks/x.lock", fileSystem);
        try {
          await vi.advanceTimersByTimeAsync(CROSS_PROCESS_LOCK_STALE_MS / 2);
          // Flush any pending microtasks from the fire-and-forget catch handler.
          await Promise.resolve();
          await Promise.resolve();
        } finally {
          clearInterval(handle);
        }
        expect(debugSpy).not.toHaveBeenCalled();
        expect(logSpy).not.toHaveBeenCalled();
        expect(errorSpy).not.toHaveBeenCalled();
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        debugSpy.mockRestore();
        logSpy.mockRestore();
        errorSpy.mockRestore();
        warnSpy.mockRestore();
      }
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
        evictStaleLock(lockPath, CROSS_PROCESS_LOCK_STALE_MS, nodeLockFileSystem),
        evictStaleLock(lockPath, CROSS_PROCESS_LOCK_STALE_MS, nodeLockFileSystem),
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

      const evicted = await evictStaleLock(
        lockPath,
        CROSS_PROCESS_LOCK_STALE_MS,
        nodeLockFileSystem,
      );

      expect(evicted).toBe(false);
      // The live lock must survive.
      await expect(stat(lockPath)).resolves.toBeDefined();
    });

    it("returns false when the lock directory does not exist", async () => {
      const lockPath = join(tmpdir(), "dysflow-locks-test", `absent-${process.pid}.lock`);
      await rm(lockPath, { recursive: true, force: true }).catch(() => {});

      await expect(
        evictStaleLock(lockPath, CROSS_PROCESS_LOCK_STALE_MS, nodeLockFileSystem),
      ).resolves.toBe(false);
    });

    it("returns false when the lock is refreshed after the eviction claim", async () => {
      const lockPath = "/locks/refreshed.lock";
      const staleMtimeMs = Date.now() - CROSS_PROCESS_LOCK_STALE_MS - 1;
      let statCalls = 0;
      const fileSystem: LockFileSystemPort = {
        mkdir: async (path) => path,
        rm: async () => {},
        stat: async () => {
          statCalls += 1;
          return { mtimeMs: statCalls === 1 ? staleMtimeMs : Date.now() };
        },
        utimes: async () => {},
        writeFile: async () => {},
        readFile: async () => null,
        isProcessAlive: () => false,
        tmpdir: () => tmpdir(),
      };

      await expect(evictStaleLock(lockPath, CROSS_PROCESS_LOCK_STALE_MS, fileSystem)).resolves.toBe(
        false,
      );
    });

    it("returns false when removing the stale lock fails", async () => {
      const lockPath = "/locks/removal-fails.lock";
      const staleMtimeMs = Date.now() - CROSS_PROCESS_LOCK_STALE_MS - 1;
      const fileSystem: LockFileSystemPort = {
        mkdir: async (path) => path,
        rm: async (path) => {
          if (path === lockPath) throw new Error("synthetic EPERM");
        },
        stat: async () => ({ mtimeMs: staleMtimeMs }),
        utimes: async () => {},
        writeFile: async () => {},
        readFile: async () => null,
        isProcessAlive: () => false,
        tmpdir: () => tmpdir(),
      };

      await expect(evictStaleLock(lockPath, CROSS_PROCESS_LOCK_STALE_MS, fileSystem)).resolves.toBe(
        false,
      );
    });
  });

  /**
   * Issue #1134 — a leaked `${lockPath}.evicting` claim used to disable stale-lock
   * eviction permanently and silently. The claim was released only by an `rm` whose
   * rejection was swallowed, and nothing ever aged it out, so a single failed cleanup
   * (Windows DELETE_PENDING surfacing as EACCES/EPERM is the documented case) meant
   * every later acquirer burned its full timeout and threw `RunnerLockTimeoutError`.
   *
   * The claim now carries an owner record and is recoverable: a claim past the stale
   * window whose owner process is gone is reclaimed, and a claim past the recovery
   * ceiling is reclaimed even when its pid appears alive, so a recycled pid cannot
   * wedge eviction forever.
   */
  describe("evictStaleLock — leaked eviction claim recovery (#1134)", () => {
    const STALE_MS = CROSS_PROCESS_LOCK_STALE_MS;

    /**
     * Keys are stored separator-normalized: production joins owner-record paths with
     * `node:path`, which emits backslashes on Windows, so a fake that keys on the raw
     * string silently misses every read there and passes for the wrong reason.
     */
    const normalize = (path: string): string => path.replace(/\\/g, "/");

    /** Mutable in-memory filesystem good enough to model the claim protocol. */
    const makeMemoryFs = (options: {
      entries: Map<string, { mtimeMs: number }>;
      files?: Map<string, string>;
      alivePids?: Set<number>;
      onRm?: (path: string) => void;
    }): LockFileSystemPort => {
      const files = options.files ?? new Map<string, string>();
      const alivePids = options.alivePids ?? new Set<number>();
      return {
        mkdir: async (path, mkdirOptions) => {
          const key = normalize(path);
          if (options.entries.has(key) && mkdirOptions?.recursive !== true) {
            const error = new Error(`EEXIST: ${key}`) as NodeJS.ErrnoException;
            error.code = "EEXIST";
            throw error;
          }
          options.entries.set(key, { mtimeMs: Date.now() });
          return path;
        },
        rm: async (path) => {
          const key = normalize(path);
          options.onRm?.(key);
          options.entries.delete(key);
          for (const fileKey of [...files.keys()]) {
            if (fileKey.startsWith(key)) files.delete(fileKey);
          }
        },
        stat: async (path) => options.entries.get(normalize(path)) ?? null,
        utimes: async () => {},
        writeFile: async (path, data) => {
          files.set(normalize(path), data);
        },
        readFile: async (path) => files.get(normalize(path)) ?? null,
        isProcessAlive: (pid) => alivePids.has(pid),
        tmpdir: () => tmpdir(),
      };
    };

    const ownerRecord = (pid: number): string =>
      JSON.stringify({ pid, startedAt: new Date(Date.now() - 120_000).toISOString() });

    it("recovers a leaked claim whose owner process is gone and evicts the stale lock", async () => {
      const lockPath = "/locks/leaked-dead-owner.lock";
      const claimPath = `${lockPath}.evicting`;
      const longAgo = Date.now() - STALE_MS - 60_000;
      const entries = new Map([
        [lockPath, { mtimeMs: longAgo }],
        [claimPath, { mtimeMs: longAgo }],
      ]);
      const files = new Map([[`${claimPath}/owner.json`, ownerRecord(424242)]]);
      // 424242 is deliberately absent from alivePids: the evictor that created the
      // claim died without releasing it.
      const fileSystem = makeMemoryFs({ entries, files, alivePids: new Set([process.pid]) });

      await expect(evictStaleLock(lockPath, STALE_MS, fileSystem)).resolves.toBe(true);
      expect(entries.has(lockPath)).toBe(false);
      expect(entries.has(claimPath)).toBe(false);
    });

    it("backs off when the claim is young, even if its owner is unknown", async () => {
      const lockPath = "/locks/claim-in-flight.lock";
      const claimPath = `${lockPath}.evicting`;
      const entries = new Map([
        [lockPath, { mtimeMs: Date.now() - STALE_MS - 60_000 }],
        // A claim created moments ago is a genuine concurrent eviction in flight.
        [claimPath, { mtimeMs: Date.now() - 10 }],
      ]);
      const fileSystem = makeMemoryFs({ entries });

      await expect(evictStaleLock(lockPath, STALE_MS, fileSystem)).resolves.toBe(false);
      // The other evictor's claim and its target must both survive.
      expect(entries.has(claimPath)).toBe(true);
      expect(entries.has(lockPath)).toBe(true);
    });

    it("backs off when an aged claim is still owned by a live process", async () => {
      const lockPath = "/locks/claim-live-owner.lock";
      const claimPath = `${lockPath}.evicting`;
      const aged = Date.now() - STALE_MS - 1_000;
      const entries = new Map([
        [lockPath, { mtimeMs: Date.now() - STALE_MS - 60_000 }],
        [claimPath, { mtimeMs: aged }],
      ]);
      const files = new Map([[`${claimPath}/owner.json`, ownerRecord(process.pid)]]);
      const fileSystem = makeMemoryFs({ entries, files, alivePids: new Set([process.pid]) });

      await expect(evictStaleLock(lockPath, STALE_MS, fileSystem)).resolves.toBe(false);
      expect(entries.has(claimPath)).toBe(true);
    });

    it("recovers a claim past the recovery ceiling even when its pid appears alive", async () => {
      const lockPath = "/locks/claim-recycled-pid.lock";
      const claimPath = `${lockPath}.evicting`;
      // Older than the ceiling: no legitimate eviction runs this long, so the pid
      // must have been recycled. Without this rule a recycled pid wedges eviction.
      const ancient = Date.now() - STALE_MS * 4;
      const entries = new Map([
        [lockPath, { mtimeMs: ancient }],
        [claimPath, { mtimeMs: ancient }],
      ]);
      const files = new Map([[`${claimPath}/owner.json`, ownerRecord(process.pid)]]);
      const fileSystem = makeMemoryFs({ entries, files, alivePids: new Set([process.pid]) });

      await expect(evictStaleLock(lockPath, STALE_MS, fileSystem)).resolves.toBe(true);
      expect(entries.has(lockPath)).toBe(false);
    });

    it("recovers a leaked claim that carries no owner record at all", async () => {
      const lockPath = "/locks/claim-unattributable.lock";
      const claimPath = `${lockPath}.evicting`;
      const longAgo = Date.now() - STALE_MS - 60_000;
      const entries = new Map([
        [lockPath, { mtimeMs: longAgo }],
        [claimPath, { mtimeMs: longAgo }],
      ]);
      const fileSystem = makeMemoryFs({ entries });

      await expect(evictStaleLock(lockPath, STALE_MS, fileSystem)).resolves.toBe(true);
      expect(entries.has(lockPath)).toBe(false);
    });

    it("refuses to delete a lock that was replaced after being observed as stale", async () => {
      // Defence in depth for the claim mutex: eviction is conditional on the lock
      // still being the same instance that was observed as stale. A different owner
      // record means a new acquirer already took the lock, so it must not be removed.
      const lockPath = "/locks/replaced-under-claim.lock";
      const staleMtimeMs = Date.now() - STALE_MS - 1_000;
      const removed: string[] = [];
      let ownerReads = 0;
      const fileSystem: LockFileSystemPort = {
        mkdir: async (path) => path,
        rm: async (path) => {
          removed.push(path);
        },
        stat: async () => ({ mtimeMs: staleMtimeMs }),
        utimes: async () => {},
        writeFile: async () => {},
        readFile: async (path) => {
          if (!path.replace(/\\/g, "/").startsWith(lockPath)) return null;
          ownerReads += 1;
          // First read: the stale owner we based the decision on. Second read: a
          // different process has since taken the lock.
          return JSON.stringify({
            pid: ownerReads === 1 ? 111 : 222,
            startedAt: new Date(staleMtimeMs).toISOString(),
          });
        },
        isProcessAlive: () => false,
        tmpdir: () => tmpdir(),
      };

      await expect(evictStaleLock(lockPath, STALE_MS, fileSystem)).resolves.toBe(false);
      expect(removed).not.toContain(lockPath);
    });

    it("still evicts legacy locks that carry no owner record on either read", async () => {
      const lockPath = "/locks/legacy-no-owner.lock";
      const staleMtimeMs = Date.now() - STALE_MS - 1_000;
      const removed: string[] = [];
      const fileSystem: LockFileSystemPort = {
        mkdir: async (path) => path,
        rm: async (path) => {
          removed.push(path);
        },
        stat: async () => ({ mtimeMs: staleMtimeMs }),
        utimes: async () => {},
        writeFile: async () => {},
        readFile: async () => null,
        isProcessAlive: () => false,
        tmpdir: () => tmpdir(),
      };

      await expect(evictStaleLock(lockPath, STALE_MS, fileSystem)).resolves.toBe(true);
      expect(removed).toContain(lockPath);
    });
  });

  describe("acquireCrossProcessAccessLock — stale-eviction backoff", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      "refreshed",
      "removal-failed",
    ] as const)("waits before retrying when stale eviction reports %s", async (outcome) => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
      vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
      const lockPath = "/locks/backoff.lock";
      const claimPath = `${lockPath}.evicting`;
      const staleMtimeMs = Date.now() - CROSS_PROCESS_LOCK_STALE_MS - 1;
      const sleepMs = 25;
      let lockMkdirCalls = 0;
      let statCalls = 0;
      const fileSystem: LockFileSystemPort = {
        mkdir: async (path) => {
          if (path === lockPath) {
            lockMkdirCalls += 1;
            if (lockMkdirCalls === 1) {
              const error: NodeJS.ErrnoException = new Error("lock exists");
              error.code = "EEXIST";
              throw error;
            }
          }
          return path;
        },
        rm: async (path) => {
          if (path === lockPath && outcome === "removal-failed") {
            throw new Error("synthetic EPERM");
          }
          expect(path === lockPath || path === claimPath).toBe(true);
        },
        stat: async () => {
          statCalls += 1;
          if (outcome === "refreshed" && statCalls === 2) {
            return { mtimeMs: Date.now() };
          }
          return { mtimeMs: staleMtimeMs };
        },
        utimes: async () => {},
        writeFile: async () => {},
        readFile: async () => null,
        isProcessAlive: () => false,
        tmpdir: () => tmpdir(),
      };

      const acquisition = acquireCrossProcessAccessLock(lockPath, 1_000, sleepMs, fileSystem);
      await vi.advanceTimersByTimeAsync(0);

      expect(lockMkdirCalls).toBe(1);

      await vi.advanceTimersByTimeAsync(sleepMs);
      const release = await acquisition;
      expect(lockMkdirCalls).toBe(2);
      await release();
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

  it("retries (not throws) when mkdir fails with EACCES from a DELETE_PENDING race, then acquires", async () => {
    let mkdirCalls = 0;
    const fileSystem: LockFileSystemPort = {
      mkdir: async (path) => {
        if (path.endsWith(".lock")) {
          mkdirCalls += 1;
          if (mkdirCalls === 1) {
            // Simulate the Windows DELETE_PENDING race: a concurrent release left the dir
            // mid-deletion, so the first mkdir gets EACCES instead of EEXIST.
            const err: NodeJS.ErrnoException = new Error("access denied");
            err.code = "EACCES";
            throw err;
          }
        }
        return path;
      },
      rm: async () => {},
      stat: async () => null,
      utimes: async () => {},
      writeFile: async () => {},
      readFile: async () => null,
      isProcessAlive: () => false,
      tmpdir: () => tmpdir(),
    };
    const lockPath = join(tmpdir(), "dysflow-transient-test", `eacces-${process.pid}.lock`);

    // Before the fix this rejects on the first EACCES; after it, it backs off and acquires.
    const release = await acquireCrossProcessAccessLock(lockPath, 2_000, 5, fileSystem);
    expect(mkdirCalls).toBeGreaterThanOrEqual(2);
    expect(typeof release).toBe("function");
    await release();
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
      readFile: async () => null,
      isProcessAlive: () => false,
      tmpdir: () => "vtmp",
    };

    const lockPath = getCrossProcessLockPath("virtual.accdb");
    const release = await acquireCrossProcessAccessLock(lockPath, 1000, 50, mockFs);
    expect(virtualFiles.has(lockPath)).toBe(true);

    await release();
    expect(virtualFiles.has(lockPath)).toBe(false);
  });
});
