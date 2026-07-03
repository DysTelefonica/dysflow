/**
 * Path containment helper — exports the isPathInside primitive used by the
 * forms tools (#675). Lives in core/utils so the vba-form-service (also
 * in core) and the vba-forms-adapter (in adapters) share the same logic.
 *
 * Semantics: a path `child` is inside `parent` if resolving them and taking
 * the relative path produces either "" (equal) or a non-empty, non-`..`-
 * starting, non-absolute path. The implementation handles both POSIX and
 * Windows paths (case-insensitive on Windows). It rejects `..` traversal in
 * any segment, including the value-only case where the relative path is
 * ".." (e.g. child === parent/..) — this is a sibling, not a child.
 */

import { isAbsolute, relative, resolve, win32 } from "node:path";

function isWindowsPath(path: string): boolean {
  return win32.isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path);
}

function resolveAny(childPath: string, parentPath: string): string {
  if (isWindowsPath(childPath) || isWindowsPath(parentPath)) {
    return win32.resolve(parentPath, childPath);
  }
  return resolve(parentPath, childPath);
}

export function isPathInside(childPath: string, parentPath: string): boolean {
  if (isWindowsPath(childPath) || isWindowsPath(parentPath)) {
    const rel = win32.relative(win32.resolve(parentPath), win32.resolve(childPath));
    return rel === "" || (rel.length > 0 && !rel.startsWith("..") && !win32.isAbsolute(rel));
  }
  const rel = relative(resolve(parentPath), resolve(childPath));
  return rel === "" || (rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel));
}

// Re-export so consumers don't need to import from both modules.
export { resolveAny as resolvePathForContainment };
