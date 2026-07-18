import {
  readdir as nodeReaddir,
  readFile as nodeReadFile,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import type { StaleMarkerFileSystemPort } from "../../core/operations/stale-marker-file-system-port.js";

/**
 * Node-backed {@link StaleMarkerFileSystemPort} — default production adapter
 * for `cleanupStaleMarkers` (#967).
 *
 * Lives in `src/adapters/operations/` (NOT `src/core/`) so the cleanup
 * logic stays free of direct `node:fs/promises` imports and the surface
 * can be exercised at the port boundary by tests.
 *
 * `readdir` swallows `ENOENT` and returns `[]` so the cleanup can treat
 * a missing `.dysflow/runtime/markers` directory as the empty idle case
 * without catching the error itself.
 */
export const nodeStaleMarkerFileSystem: StaleMarkerFileSystemPort = {
  readdir: async (path) => {
    try {
      return await nodeReaddir(path);
    } catch (err) {
      if ((err as NodeJS.ErrnoException | undefined)?.code === "ENOENT") return [];
      throw err;
    }
  },
  readFile: (path) => nodeReadFile(path, "utf8"),
  writeFile: (path, data) => nodeWriteFile(path, data, "utf8"),
};
