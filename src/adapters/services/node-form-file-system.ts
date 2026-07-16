import {
  mkdir as nodeMkdir,
  readdir as nodeReaddir,
  readFile as nodeReadFile,
  writeFile as nodeWriteFile,
} from "node:fs/promises";
import type { FormFileSystemPort } from "../../core/services/vba-form-service.js";

/**
 * Node-backed {@link FormFileSystemPort} — default production adapter
 * for `VbaFormService`.
 *
 * Lives in `src/adapters/services/` (NOT `src/core/`) so the form service
 * code stays free of direct `node:fs/promises` imports and the surface
 * can be exercised at the port boundary by tests. Mirrors the
 * cross-process-lock precedent (`cross-process-lock.ts` +
 * `node-lock-file-system.ts`, commit `6ac0af1`).
 *
 * The interface declaration stays in `src/core/services/vba-form-service.ts`
 * — port surfaces live with the domain code that owns them. This file is
 * only the implementation.
 */
export const nodeFormFileSystem: FormFileSystemPort = {
  mkdir: (path, options) => nodeMkdir(path, options),
  readdir: (path) => nodeReaddir(path),
  readFile: (path) => nodeReadFile(path, "utf8"),
  readBytes: (path) => nodeReadFile(path),
  readJson: async <T>(path: string): Promise<T> => {
    const raw = await nodeReadFile(path, "utf8");
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new Error(`Invalid JSON file: ${path}`);
    }
  },
  writeFile: (path, data, encoding) => nodeWriteFile(path, data, encoding),
  writeBytes: (path, data) => nodeWriteFile(path, data),
};
