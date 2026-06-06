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
