import { sanitizeConnectStrings, sanitizeSecrets } from "./index.js";

/**
 * Sanitizes an error message before exposing it at an MCP boundary.
 *
 * Order of operations (must be preserved — see #429):
 * 1. Secret redaction (sanitizeSecrets) — removes explicit known secret values verbatim
 *    while the string is still intact, matching HTTP adapter parity.
 * 2. Connect-string password stripping (sanitizeConnectStrings) — heuristic removal of
 *    ;PWD=... fragments even when the exact value is unknown.
 * 3. Path stripping — removes Windows drive paths, UNC paths, and POSIX paths.
 *
 * Each path alternative is applied sequentially to avoid nested unbounded quantifiers
 * in a single combined pattern (defense against catastrophic backtracking).
 */
export function sanitizeMcpErrorMessage(message: string, secrets?: readonly string[]): string {
  let result = secrets !== undefined ? sanitizeSecrets(message, secrets) : message;
  result = sanitizeConnectStrings(result);
  // UNC paths: \\server\share[\subdir...][\ ]
  result = result.replace(
    /\\\\[^\\\s"'<>|:*?]+\\[^\\\s"'<>|:*?]+(?:\\[^\\\s"'<>|:*?]+)*\\?/g,
    "[PATH]",
  );
  // Windows paths with database extension: C:\...\file.accdb
  result = result.replace(/[A-Za-z]:\\[^:\r\n]*?\.(?:accdb|mdb|accde|mde|laccdb)\b/gi, "[PATH]");
  // POSIX paths with database extension: /path/to/file.accdb
  result = result.replace(/(?<!\S)\/[^:\r\n]*?\.(?:accdb|mdb|accde|mde|laccdb)\b/gi, "[PATH]");
  // Windows drive root paths: C:\dir/...
  result = result.replace(/[A-Za-z]:\\(?:[^\\\s"'<>|:*?]+(?:\\[^\\\s"'<>|:*?]+)*\\?)?/g, "[PATH]");
  // POSIX directory paths: /dir/subdir/...
  result = result.replace(/(?<!\S)\/(?:[^/\s"'<>:]+\/)*[^/\s"'<>:]+/g, "[PATH]");
  return result;
}
