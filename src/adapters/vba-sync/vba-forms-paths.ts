import { posix, resolve, win32 } from "node:path";
import { resolveFormSourceCandidates } from "../../core/config/form-source-resolver.js";

/**
 * Derive the canonical form/report name from a source path by stripping
 * `Form_` / `Report_` prefix and `.form.txt` / `.report.txt` suffix.
 * Mirrors the slice-1 `inspect_form` rule so the consumer-facing names
 * stay consistent across both tools.
 */
export function deriveFormName(sourcePath: string): string {
  const fileName = sourcePath.replace(/\\/g, "/").split("/").pop() ?? "";
  return fileName
    .replace(/^Form_/, "")
    .replace(/^Report_/, "")
    .replace(/\.form\.txt$/i, "")
    .replace(/\.report\.txt$/i, "");
}

export function hasManagedFormExtension(sourcePath: string): boolean {
  return /\.form\.txt$/i.test(sourcePath) || /\.report\.txt$/i.test(sourcePath);
}

function isWindowsPath(path: string): boolean {
  // `win32.isAbsolute("/tmp")` is true because Windows accepts a rooted path
  // without a drive. That must not reclassify an explicit POSIX path and turn
  // it into `\\tmp`; only backslash-rooted, drive-letter, and UNC paths use
  // Windows normalization here.
  return path.startsWith("\\") || path.startsWith("//") || /^[A-Za-z]:[\\/]/.test(path);
}

export function resolveMutationPath(
  basePath: string,
  childPath: string,
  projectRoot?: string,
): string {
  const candidates = resolveFormSourceCandidates({
    sourceRoot: basePath,
    projectRoot,
    sourcePath: childPath,
  });

  const firstCandidate = candidates[0];
  if (firstCandidate !== undefined) {
    const resolved = firstCandidate.absolutePath;
    if (isWindowsPath(resolved)) return win32.normalize(resolved);
    if (posix.isAbsolute(resolved)) return posix.normalize(resolved);
    return isWindowsPath(basePath) ? win32.resolve(basePath, resolved) : resolve(resolved);
  }

  if (isWindowsPath(childPath)) return win32.normalize(childPath);
  if (posix.isAbsolute(childPath)) return posix.normalize(childPath);
  if (isWindowsPath(basePath)) return win32.normalize(win32.resolve(basePath, childPath));
  if (posix.isAbsolute(basePath)) return posix.resolve(basePath, childPath);
  return resolve(basePath, childPath);
}

export function normalizePathForDetails(path: string): string {
  if (isWindowsPath(path)) return win32.normalize(path);
  if (posix.isAbsolute(path)) return posix.normalize(path);
  return resolve(path);
}
