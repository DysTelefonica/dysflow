import {
  mkdir as nodeMkdir,
  rm as nodeRm,
  stat as nodeStat,
  utimes as nodeUtimes,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import { tmpdir as nodeTmpdir } from "node:os";
import type { LockFileSystemPort } from "../../core/runner/cross-process-lock.js";

/**
 * Node-backed {@link LockFileSystemPort}. This is the production filesystem adapter for the
 * cross-process Access execution lock. It lives in the adapter layer (not `src/core`) so the
 * domain lock logic stays free of direct `node:fs` imports and is testable purely at the port
 * — the composition roots inject this into `AccessPowerShellRunner`. Mirrors the config
 * migration (`dysflow-config-node.ts`).
 */
export const nodeLockFileSystem: LockFileSystemPort = {
  mkdir: (path, options) => nodeMkdir(path, options),
  rm: (path, options) => nodeRm(path, options),
  stat: async (path) => {
    try {
      const s = await nodeStat(path);
      return { mtimeMs: s.mtimeMs };
    } catch {
      return null;
    }
  },
  utimes: (path, atime, mtime) => nodeUtimes(path, atime, mtime),
  writeFile: (path, data, encoding) => nodeWriteFile(path, data, encoding),
  tmpdir: () => nodeTmpdir(),
};
