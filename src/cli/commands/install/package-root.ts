import { accessSync, constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MAX_PACKAGE_ROOT_DEPTH = 12;

function hasPath(candidate: string): boolean {
  try {
    accessSync(candidate, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolvePackageRoot(options: { moduleUrl?: string; cwd?: string } = {}): string {
  const commandPath = fileURLToPath(options.moduleUrl ?? import.meta.url);
  let currentDir = path.dirname(commandPath);

  for (let depth = 0; depth < MAX_PACKAGE_ROOT_DEPTH; depth += 1) {
    const packageJson = path.join(currentDir, "package.json");
    const tsConfig = path.join(currentDir, "tsconfig.json");
    const distDir = path.join(currentDir, "dist");

    if (hasPath(packageJson) && (hasPath(tsConfig) || hasPath(distDir))) {
      return currentDir;
    }

    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }

  console.warn("WARNING: resolvePackageRoot: package.json not found in parent directories. Falling back to cwd.");
  return path.resolve(options.cwd ?? process.cwd());
}
