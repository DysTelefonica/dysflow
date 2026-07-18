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
  // Issue #957 P1 — the original regex required the first path component
  // to be 1+ non-special chars, which failed when the JSON-serialized path
  // started with an escaped backslash (e.g. `C:\\Proyectos\\...`). The
  // `+` couldn't match the leading `\\`, the engine backtracked, and the
  // whole optional group matched 0 chars — leaving the rest of the path
  // in the output. That produced a half-sanitized string that downstream
  // `JSON.parse` rejected with "Bad escaped character". Simplified to
  // `[^\\s"',]*` (zero or more non-special chars) which reliably matches
  // both the bare drive root `C:\` and full paths like `C:\dir\sub\file`,
  // and prevents the partial-replacement JSON corruption.
  result = result.replace(/[A-Za-z]:\\[^\s"',]*/g, "[PATH]");
  // POSIX directory paths: /dir/subdir/...
  result = result.replace(/(?<!\S)\/(?:[^/\s"'<>:]+\/)*[^/\s"'<>:]+/g, "[PATH]");

  const upperMsg = message.toUpperCase();
  if (
    upperMsg.includes("0X800ADEB9") ||
    upperMsg.includes("800ADEB9") ||
    upperMsg.includes("-2146771271")
  ) {
    result +=
      "\n[Remediation Advice / Consejo de remediación]\n" +
      "English: Access object cannot be deleted/modified. Ensure the object is not open in Design View, close the VBA Editor, or run a database compact & repair.\n" +
      "Spanish: No se puede eliminar/modificar el objeto de Access. Asegúrese de que el objeto no esté abierto en Vista Diseño, cierre el Editor de VBA o ejecute Compactar y reparar base de datos.";
  }
  if (
    upperMsg.includes("0X800A09D5") ||
    upperMsg.includes("800A09D5") ||
    upperMsg.includes("-2146823723")
  ) {
    result +=
      "\n[Remediation Advice / Consejo de remediación]\n" +
      "English: Name conflicts with an existing module, project, or object library. Access is case-insensitive for identifiers; ensure module names do not duplicate existing identifiers.\n" +
      "Spanish: El nombre entra en conflicto con un módulo, proyecto o biblioteca de objetos existente. Access no distingue mayúsculas de minúsculas para los identificadores; asegúrese de que los nombres de los módulos no dupliquen identificadores existentes.";
  }

  return result;
}
