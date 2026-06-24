import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_PACKAGE_ROOT_DEPTH = 12;

/**
 * Walks up from `moduleUrl` to the nearest directory containing a `package.json` and returns
 * it, or `undefined` if none is found within {@link MAX_PACKAGE_ROOT_DEPTH} levels. Used to
 * resolve bundled `scripts/*.ps1` to an absolute, cwd-independent path.
 */
export function findPackageRootNear(moduleUrl: string): string | undefined {
  let currentDir = dirname(fileURLToPath(moduleUrl));
  for (let depth = 0; depth < MAX_PACKAGE_ROOT_DEPTH; depth += 1) {
    if (existsSync(join(currentDir, "package.json"))) return currentDir;
    const parent = dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }
  return undefined;
}

export function readPackageVersionNear(moduleUrl: string, fallback = "0.0.0"): string {
  let currentDir = dirname(fileURLToPath(moduleUrl));

  for (let depth = 0; depth < MAX_PACKAGE_ROOT_DEPTH; depth += 1) {
    const packagePath = join(currentDir, "package.json");
    if (existsSync(packagePath)) {
      try {
        const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as {
          version?: unknown;
        };
        if (typeof parsed.version === "string") {
          return parsed.version;
        }
        console.warn(`WARNING: package.json at ${packagePath} lacks a version string.`);
        return fallback;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`WARNING: Failed to parse package.json at ${packagePath}: ${message}`);
        return fallback;
      }
    }

    const parent = dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  console.warn(`WARNING: package.json not found near ${moduleUrl}.`);
  return fallback;
}
