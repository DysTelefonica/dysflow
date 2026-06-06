/**
 * Returns true if `value` looks like an absolute path on any supported platform:
 * - POSIX:   leading "/"
 * - Windows: drive letter followed by ":" and "/" or "\" (e.g. "C:/", "c:\")
 * - UNC:     leading "\\" (e.g. "\\server\share")
 *
 * This is intentionally platform-agnostic so that Windows-style paths are
 * recognized as absolute even when running on Linux CI.
 */
export function isAbsolutePath(value: string): boolean {
  if (!value) return false;
  // POSIX absolute
  if (value.startsWith("/")) return true;
  // UNC (\\server\share)
  if (value.startsWith("\\\\")) return true;
  // Windows drive letter: C:/ or C:\
  return /^[A-Za-z]:[/\\]/.test(value);
}

export function normalizePathForMatching(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

export function pathMatchesAccessPath(commandLine: string, accessPath: string): boolean {
  const normalizedAccessPath = normalizePathForMatching(accessPath);
  if (!normalizedAccessPath) return false;

  const tokenPattern = /"([^"]*)"|(\S+)/g;
  let match = tokenPattern.exec(commandLine);
  while (match !== null) {
    const token = match[1] ?? match[2] ?? "";
    if (token && normalizePathForMatching(token) === normalizedAccessPath) {
      return true;
    }
    match = tokenPattern.exec(commandLine);
  }

  return false;
}
