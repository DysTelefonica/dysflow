import {
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
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
  readFile: async (path) => {
    try {
      return await nodeReadFile(path, "utf8");
    } catch {
      return null;
    }
  },
  /**
   * Signal 0 performs the permission and existence checks without delivering a signal,
   * so this probes liveness without touching the target process. `EPERM` means the
   * process exists under a different account — still alive for our purposes; any other
   * error (`ESRCH`) means it is gone.
   */
  isProcessAlive: (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      return (err as NodeJS.ErrnoException | undefined)?.code === "EPERM";
    }
  },
  tmpdir: () => nodeTmpdir(),
};
