import { isAbsolute, resolve, win32 } from "node:path";
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
  return win32.isAbsolute(path) || /^[A-Za-z]:[\\/]/.test(path);
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
    return isWindowsPath(basePath) ? win32.normalize(resolved) : resolve(resolved);
  }

  if (win32.isAbsolute(childPath)) return win32.normalize(childPath);
  if (isAbsolute(childPath)) return resolve(childPath);
  if (isWindowsPath(basePath)) return win32.normalize(win32.resolve(basePath, childPath));
  return resolve(basePath, childPath);
}

export function normalizePathForDetails(path: string): string {
  return isWindowsPath(path) ? win32.normalize(path) : resolve(path);
}
