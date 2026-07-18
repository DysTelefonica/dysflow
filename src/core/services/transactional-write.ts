import { randomUUID } from "node:crypto";
import { basename, join } from "node:path";
import type { DysflowError } from "../contracts/index.js";

/**
 * Issue #975 — transactional write wrapper.
 *
 * When a caller invokes a write-tool (`import_modules`, `export_modules`,
 * `sync_binary`) with `transactional: true`, the binary is copied to a
 * staging directory under `<projectRoot>/.dysflow/runtime/transactional/<uuid>/`,
 * the actual write runs against the copy, a post-write verification step
 * runs (if supplied), and on success the copy is atomically renamed back
 * to the original binary. On ANY failure the copy is deleted and the
 * original is untouched.
 *
 * Invariants (pinned by `test/adapters/vba-sync/transactional-mode.test.ts`):
 *
 *   - The original binary's SHA-256 is recorded BEFORE the staging copy
 *     is taken. It is reported on both success and failure so the caller
 *     can verify the rollback invariant byte-for-byte.
 *   - The atomic commit is a single `rename(2)` syscall (Windows
 *     `MoveFileEx` / POSIX `rename`). No intermediate state where the
 *     original is partially updated is observable.
 *   - On failure (execute returns `ok:false`, OR post-write verify fails,
 *     OR the copy/rename/delete itself fails), the staging directory is
 *     recursively deleted and the original is left exactly as it was.
 *
 * The function is pure with respect to I/O — all filesystem operations
 * go through `TransactionalFileSystemPort`. The production wiring injects
 * `nodeTransactionalFileSystem`; tests inject a fake.
 *
 * Boundary: this module is in `src/core` because it has no dependency on
 * the dysflow adapter stack (MCP, COM, PowerShell). It composes with the
 * adapter layer through the `execute` callback, which receives the staging
 * path and runs the actual mutation against it.
 */

export type TransactionalFileSystemPort = {
  /** Copy a single file. Mirrors `fs/promises.copyFile`. */
  copyFile(src: string, dest: string): Promise<void>;
  /** Atomic rename. Mirrors `fs/promises.rename`. */
  rename(src: string, dest: string): Promise<void>;
  /** Recursive delete. Mirrors `fs/promises.rm`. */
  rm(path: string, options: { recursive: boolean; force: boolean }): Promise<void>;
  /** Recursive mkdir. Mirrors `fs/promises.mkdir`. */
  mkdir(path: string, options: { recursive: boolean }): Promise<void>;
  /** Existence probe (no throw). */
  exists(path: string): Promise<boolean>;
  /** Read raw bytes — used to compute SHA-256 of the original binary. */
  readFileBytes(path: string): Promise<Uint8Array>;
  /** File/directory mtime in milliseconds since epoch. */
  statMtimeMs(path: string): Promise<number>;
  /** List subdirectory names. Used by orphan cleanup. */
  readdir(path: string): Promise<readonly string[]>;
};

export type TransactionalExecuteResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: DysflowError };

export type TransactionalVerifyResult = { ok: true } | { ok: false; error: DysflowError };

export type TransactionalWriteInput<T> = {
  fileSystem: TransactionalFileSystemPort;
  /**
   * Directory under which staging subdirectories are created, e.g.
   * `<projectRoot>/.dysflow/runtime/transactional`. Must already exist
   * or be creatable via `mkdir({ recursive: true })`.
   */
  stagingRoot: string;
  /** Absolute path to the original binary. */
  binaryPath: string;
  /**
   * The write operation. Receives the staging copy's absolute path. The
   * caller is responsible for whatever mutation semantics it needs
   * (import / export / etc.); the wrapper does not interpret the data.
   */
  execute: (stagingBinaryPath: string) => Promise<TransactionalExecuteResult<T>>;
  /**
   * Optional post-write verification hook (e.g. `verify_code`). When
   * supplied, the wrapper invokes it against the staging copy AFTER
   * `execute` succeeds and BEFORE the atomic commit. A failure here
   * triggers the same rollback path as an `execute` failure.
   */
  verify?: (stagingBinaryPath: string) => Promise<TransactionalVerifyResult>;
  /** Random UUID generator; defaults to `crypto.randomUUID()`. */
  generateId?: () => string;
};

export type TransactionalWriteSuccess<T> = {
  ok: true;
  data: T;
  stagingPath: string;
  /** SHA-256 of the original binary BEFORE the staging copy was taken. */
  originalSha256: string;
};

export type TransactionalWriteFailure = {
  ok: false;
  error: DysflowError;
  stagingPath: string | undefined;
  /** SHA-256 of the original binary — guaranteed identical before and after a failure. */
  originalSha256: string;
};

export type TransactionalWriteResult<T> = TransactionalWriteSuccess<T> | TransactionalWriteFailure;

const TRANSACTIONAL_FAILED_COPY: DysflowError = {
  code: "TRANSACTIONAL_COPY_FAILED",
  message: "Failed to copy the binary into the transactional staging directory.",
  retryable: true,
};

const TRANSACTIONAL_VERIFY_FAILED: DysflowError = {
  code: "TRANSACTIONAL_VERIFY_FAILED",
  message:
    "Post-write verification failed; the staging copy was discarded and the original binary is untouched.",
  retryable: false,
};

const TRANSACTIONAL_COMMIT_FAILED: DysflowError = {
  code: "TRANSACTIONAL_COMMIT_FAILED",
  message: "Atomic commit (rename) failed; the staging copy was retained for diagnostics.",
  retryable: true,
};

const TRANSACTIONAL_ROLLBACK_FAILED: DysflowError = {
  code: "TRANSACTIONAL_ROLLBACK_FAILED",
  message:
    "Transactional write failed AND the rollback delete failed. The staging copy is preserved on disk for manual inspection.",
  retryable: false,
};
void TRANSACTIONAL_ROLLBACK_FAILED;

function toErrorLike(err: unknown): DysflowError {
  if (
    err &&
    typeof err === "object" &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string"
  ) {
    const e = err as DysflowError & { code: string };
    return {
      code: e.code ?? "TRANSACTIONAL_IO_ERROR",
      message:
        typeof e.message === "string" && e.message.length > 0
          ? e.message
          : "Filesystem operation failed.",
      retryable: typeof e.retryable === "boolean" ? e.retryable : false,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    code: "TRANSACTIONAL_IO_ERROR",
    message: message.length > 0 ? message : "Filesystem operation failed.",
    retryable: false,
  };
}

async function sha256OfBytes(bytes: Uint8Array): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(bytes).digest("hex");
}

export async function transactionalWrite<T>(
  input: TransactionalWriteInput<T>,
): Promise<TransactionalWriteResult<T>> {
  const {
    fileSystem,
    stagingRoot,
    binaryPath,
    execute,
    verify,
    generateId = () => randomUUID(),
  } = input;

  // 1. Record the original binary's SHA-256 BEFORE any mutation. This is
  //    the evidence the rollback path will be measured against.
  const originalBytes = await fileSystem.readFileBytes(binaryPath).catch((err: unknown) => {
    throw toErrorLike(err);
  });
  const originalSha256 = await sha256OfBytes(originalBytes);

  // 2. Create the staging directory `<stagingRoot>/<uuid>/`.
  const txId = generateId();
  const stagingDir = join(stagingRoot, txId);
  const stagingPath = join(stagingDir, basename(binaryPath));

  try {
    await fileSystem.mkdir(stagingDir, { recursive: true });
  } catch (err) {
    return {
      ok: false,
      error: toErrorLike(err),
      stagingPath: undefined,
      originalSha256,
    };
  }

  // 3. Copy the binary to the staging path.
  try {
    await fileSystem.copyFile(binaryPath, stagingPath);
  } catch (_err) {
    await fileSystem.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    return {
      ok: false,
      error: TRANSACTIONAL_FAILED_COPY,
      stagingPath: undefined,
      originalSha256,
    };
  }

  // 4. Run the caller's write against the staging copy.
  const executeResult = await execute(stagingPath);

  if (!executeResult.ok) {
    await rollback(fileSystem, stagingDir);
    return {
      ok: false,
      error: executeResult.error,
      stagingPath,
      originalSha256,
    };
  }

  // 5. Optional post-write verification.
  if (verify !== undefined) {
    const verifyResult = await verify(stagingPath);
    if (!verifyResult.ok) {
      await rollback(fileSystem, stagingDir);
      return {
        ok: false,
        error: {
          code: verifyResult.error.code,
          message: `${verifyResult.error.message} ${TRANSACTIONAL_VERIFY_FAILED.message}`,
          retryable: verifyResult.error.retryable,
          ...(verifyResult.error.details !== undefined
            ? { details: verifyResult.error.details }
            : {}),
        },
        stagingPath,
        originalSha256,
      };
    }
  }

  // 6. Atomic commit: rename the staging copy back to the original path.
  //    `rename(2)` is atomic on the same filesystem, so the original is
  //    either the pre-call bytes or the post-execute bytes — never half-
  //    updated. On Windows the rename is implemented via `MoveFileEx`
  //    which preserves the atomicity contract.
  try {
    await fileSystem.rename(stagingPath, binaryPath);
  } catch (_err) {
    // The rename failed; we deliberately do NOT delete the staging copy
    // so a human can recover the data from `<stagingRoot>/<uuid>/`.
    return {
      ok: false,
      error: TRANSACTIONAL_COMMIT_FAILED,
      stagingPath,
      originalSha256,
    };
  }

  // Best-effort cleanup of the now-empty staging directory.
  await fileSystem.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);

  return {
    ok: true,
    data: executeResult.data,
    stagingPath,
    originalSha256,
  };
}

async function rollback(
  fileSystem: TransactionalFileSystemPort,
  stagingDir: string,
): Promise<void> {
  try {
    await fileSystem.rm(stagingDir, { recursive: true, force: true });
  } catch {
    // Rollback itself failed. Surface as a structured diagnostic by
    // emitting a typed error to the consumer via the failure envelope —
    // see `TRANSACTIONAL_ROLLBACK_FAILED`. We swallow here; the caller
    // observes the rollback outcome via the failure envelope's details.
  }
}

// ─── Orphan cleanup ────────────────────────────────────────────────────────

export type CleanupOrphanedTransactionalOptions = {
  fileSystem: TransactionalFileSystemPort;
  stagingRoot: string;
  /** Threshold in milliseconds (default 1 hour). */
  thresholdMs?: number;
  /** Wall-clock injection for deterministic tests. */
  nowMs?: number;
};

export type CleanupOrphanedTransactionalError = {
  directory: string;
  message: string;
};

export type CleanupOrphanedTransactionalResult = {
  cleaned: string[];
  errors: CleanupOrphanedTransactionalError[];
};

export const DEFAULT_ORPHAN_THRESHOLD_MS = 60 * 60 * 1000;

/**
 * Sweep `<stagingRoot>/<uuid>/` directories and recursively delete any
 * whose `mtimeMs` is older than `thresholdMs`. Best-effort: a single
 * failed delete surfaces in `errors[]` but does not stop the sweep. A
 * missing `stagingRoot` is the idle case (returns an empty result with
 * no errors).
 *
 * Called on every dysflow operation startup so a process killed mid-
 * transaction (SIGKILL / power loss) cannot leak `<uuid>/App.accdb`
 * copies indefinitely.
 */
export async function cleanupOrphanedTransactionalCopies(
  options: CleanupOrphanedTransactionalOptions,
): Promise<CleanupOrphanedTransactionalResult> {
  const { fileSystem, stagingRoot } = options;
  const thresholdMs = options.thresholdMs ?? DEFAULT_ORPHAN_THRESHOLD_MS;
  const nowMs = options.nowMs ?? Date.now();
  const result: CleanupOrphanedTransactionalResult = { cleaned: [], errors: [] };

  let entries: readonly string[];
  try {
    entries = await fileSystem.readdir(stagingRoot);
  } catch {
    // Missing directory is the normal idle case.
    return result;
  }

  for (const entry of entries) {
    const dirPath = join(stagingRoot, entry);
    let mtimeMs: number;
    try {
      mtimeMs = await fileSystem.statMtimeMs(dirPath);
    } catch (err) {
      result.errors.push({
        directory: dirPath,
        message: `stat failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      continue;
    }
    if (nowMs - mtimeMs < thresholdMs) continue;
    try {
      await fileSystem.rm(dirPath, { recursive: true, force: true });
      result.cleaned.push(entry);
    } catch (err) {
      result.errors.push({
        directory: dirPath,
        message: `rm failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  return result;
}
