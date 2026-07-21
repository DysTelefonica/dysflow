import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { VbaSourceResolver } from "../../core/services/vba-service.js";

/**
 * Node-backed {@link VbaSourceResolver} — default production adapter for
 * `AccessVbaService`'s #1045 procedure-existence preflight.
 *
 * Lives in `src/adapters/services/` (NOT `src/core/`) so the service stays
 * free of direct `node:fs/promises` imports and the surface can be exercised
 * at the port boundary by tests. Mirrors the
 * `nodeFormFileSystem` precedent (`node-form-file-system.ts`).
 *
 * Resolution mirrors the convention used by `resolveVbaSourceFile` /
 * `resolveAllProjectModules` in `src/adapters/mcp/tools.ts`:
 *
 *   - Single module lookup probes (in priority order)
 *     `<destinationRoot>/modules/<moduleName>.bas`,
 *     `<destinationRoot>/classes/<moduleName>.cls`,
 *     `<destinationRoot>/forms/<moduleName>.cls`,
 *     `<destinationRoot>/reports/<moduleName>.cls`,
 *     returning the first match's UTF-8 contents.
 *
 *   - Full-tree scan reads every `.bas`/`.cls` under each of those four
 *     subfolders and returns them keyed by module name (basename minus
 *     extension).
 *
 * Failure modes are intentionally non-fatal:
 *
 *   - A missing `destinationRoot` (empty string / undefined) returns
 *     `undefined` from `resolveModuleSource` and `{}` from
 *     `resolveAllModuleSources`. The preflight treats that as "cannot verify
 *     absence" and lets the runner proceed — preserving the legacy behavior
 *     for projects that have not wired a `destinationRoot`.
 *
 *   - Path-like module names (`.`, `..`, separators, NUL byte) are rejected
 *     by `isPathLikeModuleName` and short-circuit to `undefined` — a
 *     caller-supplied `moduleName` must never escape the project's source
 *     tree.
 */
export const nodeVbaSourceResolver: VbaSourceResolver = {
  async resolveModuleSource(moduleName) {
    return resolveModuleSourceImpl(moduleName, undefined);
  },
  async resolveAllModuleSources() {
    return resolveAllModuleSourcesImpl(undefined);
  },
};

/**
 * Factory variant bound to a specific `destinationRoot`. The MCP and HTTP
 * adapters wire this so the resolver closes over the project's resolved
 * `destinationRoot` rather than reading it lazily per call.
 */
export function createNodeVbaSourceResolver(
  destinationRoot: string | undefined,
): VbaSourceResolver {
  return {
    async resolveModuleSource(moduleName) {
      return resolveModuleSourceImpl(moduleName, destinationRoot);
    },
    async resolveAllModuleSources() {
      return resolveAllModuleSourcesImpl(destinationRoot);
    },
  };
}

const SOURCE_FOLDERS = ["modules", "classes", "forms", "reports"] as const;
const VBA_EXTENSIONS = [".bas", ".cls"] as const;

function isPathLikeModuleName(moduleName: string): boolean {
  return (
    moduleName === "." ||
    moduleName === ".." ||
    moduleName.includes("/") ||
    moduleName.includes("\\") ||
    moduleName.includes("\0")
  );
}

async function resolveModuleSourceImpl(
  moduleName: string,
  destinationRoot: string | undefined,
): Promise<string | undefined> {
  if (typeof moduleName !== "string" || moduleName.length === 0) return undefined;
  if (isPathLikeModuleName(moduleName)) return undefined;
  if (typeof destinationRoot !== "string" || destinationRoot.length === 0) return undefined;

  const candidates = [
    resolve(destinationRoot, "modules", `${moduleName}.bas`),
    resolve(destinationRoot, "classes", `${moduleName}.cls`),
    resolve(destinationRoot, "forms", `${moduleName}.cls`),
    resolve(destinationRoot, "reports", `${moduleName}.cls`),
  ];

  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch {
      // Not found at this path — try the next candidate.
    }
  }
  return undefined;
}

async function resolveAllModuleSourcesImpl(
  destinationRoot: string | undefined,
): Promise<Record<string, string>> {
  if (typeof destinationRoot !== "string" || destinationRoot.length === 0) return {};
  const modules: Record<string, string> = {};
  for (const folder of SOURCE_FOLDERS) {
    const folderPath = resolve(destinationRoot, folder);
    let entries: readonly string[];
    try {
      entries = await readdir(folderPath);
    } catch {
      // Folder missing or unreadable — skip and try the next one.
      continue;
    }
    for (const entry of entries) {
      const lower = entry.toLowerCase();
      if (!VBA_EXTENSIONS.some((ext) => lower.endsWith(ext))) continue;
      const moduleName = entry.slice(0, entry.length - 4); // strip .bas / .cls
      try {
        modules[moduleName] = await readFile(resolve(folderPath, entry), "utf8");
      } catch {
        // Skip unreadable files — the preflight needs best-effort coverage.
      }
    }
  }
  return modules;
}
