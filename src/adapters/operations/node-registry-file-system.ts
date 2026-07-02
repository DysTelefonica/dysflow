import {
  mkdir as nodeMkdir,
  readFile as nodeReadFile,
  rename as nodeRename,
  rm as nodeRm,
  rmdir as nodeRmdir,
  stat as nodeStat,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import type { RegistryFileSystemPort } from "../../core/operations/registry-file-system-port.js";

/**
 * Node-backed {@link RegistryFileSystemPort} — default production adapter
 * for `FileAccessOperationRegistry`.
 *
 * Lives in `src/adapters/operations/` (NOT `src/core/`) so the registry
 * code stays free of direct `node:fs/promises` imports and the surface
 * can be exercised at the port boundary by tests. Mirrors the
 * cross-process-lock precedent (`cross-process-lock.ts` +
 * `node-lock-file-system.ts`, commit `6ac0af1`).
 *
 * # `wx`-flag enforcement
 *
 * The atomic-lock primitive in `acquireRegistryMutationLock` passes
 * `{ flag: "wx" }` to make the write exclusive. This adapter is the
 * single place that maps the port's flag set onto `node:fs/promises`;
 * we narrow the allowed values to `"wx"` so a stray `"w"` / `"a"` /
 * `"r+"` flag that would change mutual-exclusion semantics fails loud
 * (`TypeError`) rather than silently doing the wrong thing.
 */
export const nodeRegistryFileSystem: RegistryFileSystemPort = {
  mkdir: (path, options) => nodeMkdir(path, options),
  readFile: (path, encoding) => nodeReadFile(path, encoding),
  writeFile: async (path, data, encoding, options) => {
    if (options?.flag !== undefined && options.flag !== "wx") {
      throw new TypeError(
        `Unsupported writeFile flag: ${options.flag}. RegistryFileSystemPort only allows "wx".`,
      );
    }
    await nodeWriteFile(path, data, { encoding, flag: options?.flag });
  },
  rename: (from, to) => nodeRename(from, to),
  rm: (path, options) => nodeRm(path, options),
  rmdir: (path) => nodeRmdir(path),
  stat: async (path) => {
    try {
      const s = await nodeStat(path);
      return { mtimeMs: s.mtimeMs };
    } catch (err) {
      if ((err as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return undefined;
      throw err;
    }
  },
};
