import { copyFile, mkdir, readdir, readFile, rename, rm, stat } from "node:fs/promises";
import type { TransactionalFileSystemPort } from "../../core/services/transactional-write.js";

/**
 * Node `fs/promises` adapter for the transactional write port.
 *
 * Production wiring for `transactionalWrite` and
 * `cleanupOrphanedTransactionalCopies`. Tests inject a fake to keep
 * the seams synchronous and deterministic. Mirrors the port verbatim —
 * no extra surface, no omitted methods.
 */
export const nodeTransactionalFileSystem: TransactionalFileSystemPort = {
  copyFile: (src, dest) => copyFile(src, dest),
  rename: (src, dest) => rename(src, dest),
  rm: (path, options) => rm(path, options),
  mkdir: (path, options) => mkdir(path, options).then(() => undefined),
  exists: async (path) =>
    await stat(path)
      .then(() => true)
      .catch(() => false),
  readFileBytes: async (path) => {
    const buf = await readFile(path);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  },
  statMtimeMs: async (path) => {
    const stats = await stat(path);
    return stats.mtimeMs;
  },
  readdir: async (path) => {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  },
};
