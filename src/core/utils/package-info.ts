import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_PACKAGE_ROOT_DEPTH = 12;

export function readPackageVersionNear(moduleUrl: string, fallback = "0.0.0"): string {
  let currentDir = dirname(fileURLToPath(moduleUrl));

  for (let depth = 0; depth < MAX_PACKAGE_ROOT_DEPTH; depth += 1) {
    const packagePath = join(currentDir, "package.json");
    if (existsSync(packagePath)) {
      try {
        const parsed = JSON.parse(readFileSync(packagePath, "utf8")) as {
          version?: unknown;
        };
        return typeof parsed.version === "string" ? parsed.version : fallback;
      } catch {
        return fallback;
      }
    }

    const parent = dirname(currentDir);
    if (parent === currentDir) break;
    currentDir = parent;
  }

  return fallback;
}
