import { randomUUID } from "node:crypto";
import {
  link,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import type { TestRunFileSystemPort } from "../../core/test-runs/test-run-ports.js";
import { lockErrorCode } from "../../core/utils/lock-errors.js";

/**
 * Windows reports a file that another process has open (an antivirus scan, a
 * reader mid-`readFile`, an indexer) as `EPERM`/`EBUSY`/`EACCES` on rename and
 * read. These clear within milliseconds, so they are retried a bounded number
 * of times; anything else, or a contention that outlives the budget, throws.
 */
const TRANSIENT_FILE_CODES: ReadonlySet<string> = new Set(["EPERM", "EBUSY", "EACCES"]);
const TRANSIENT_RETRY_ATTEMPTS = 8;
const TRANSIENT_RETRY_DELAY_MS = 25;

async function withTransientRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (err) {
      const code = lockErrorCode(err);
      if (code === undefined || !TRANSIENT_FILE_CODES.has(code)) throw err;
      if (attempt >= TRANSIENT_RETRY_ATTEMPTS) throw err;
      await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS * attempt));
    }
  }
}

function isMissing(err: unknown): boolean {
  return lockErrorCode(err) === "ENOENT";
}

async function readTextOrNull(path: string): Promise<string | null> {
  try {
    return await withTransientRetry(() => readFile(path, "utf8"));
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
}

/**
 * Node-backed {@link TestRunFileSystemPort} for the detached test-run store
 * (#1993). Every write goes through a temporary sibling and a rename, so a
 * reader polling `state.json` never sees a half-written file.
 */
export const nodeTestRunFileSystem: TestRunFileSystemPort = {
  async mkdir(path) {
    await mkdir(path, { recursive: true });
  },

  readText: readTextOrNull,

  async readTextTail(path, maxBytes) {
    let handle: Awaited<ReturnType<typeof open>>;
    try {
      handle = await withTransientRetry(() => open(path, "r"));
    } catch (err) {
      if (isMissing(err)) return null;
      throw err;
    }
    try {
      const { size } = await handle.stat();
      const length = Math.min(size, maxBytes);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, size - length);
      return buffer.toString("utf8");
    } finally {
      await handle.close();
    }
  },

  async writeAtomic(path, text) {
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, text, "utf8");
      await withTransientRetry(() => rename(temporary, path));
    } catch (err) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw err;
    }
  },

  async createExclusive(path, text) {
    // `link` publishes a fully written file under its final name atomically and
    // fails with EEXIST when the name is taken, unlike a `wx` write that a
    // reader can observe while it is still empty. The store tolerates that
    // window: a lock it cannot parse yet is waited on, never taken over at once.
    const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, text, "utf8");
    try {
      await link(temporary, path);
      return true;
    } catch (err) {
      if (lockErrorCode(err) === "EEXIST") return false;
      // A filesystem without hard links: fall back to an exclusive create.
      try {
        await writeFile(path, text, { encoding: "utf8", flag: "wx" });
        return true;
      } catch (fallbackErr) {
        if (lockErrorCode(fallbackErr) === "EEXIST") return false;
        throw fallbackErr;
      }
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  },

  async rename(from, to) {
    try {
      await withTransientRetry(() => rename(from, to));
      return true;
    } catch (err) {
      if (isMissing(err)) return false;
      throw err;
    }
  },

  async removeFile(path) {
    await withTransientRetry(() => rm(path, { force: true }));
  },

  async removeTree(path) {
    await withTransientRetry(() =>
      rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }),
    );
  },

  async listDirectories(path) {
    try {
      const entries = await readdir(path, { withFileTypes: true });
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (err) {
      if (isMissing(err)) return [];
      throw err;
    }
  },

  async listFiles(path) {
    try {
      const entries = await readdir(path, { withFileTypes: true });
      return entries.filter((entry) => entry.isFile()).map((entry) => entry.name);
    } catch (err) {
      if (isMissing(err)) return [];
      throw err;
    }
  },
};
