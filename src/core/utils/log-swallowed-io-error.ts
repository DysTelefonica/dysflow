/**
 * Logs a swallowed I/O or parse error at debug level with a stable site identifier.
 *
 * Callers use this in catch blocks that intentionally return an empty default
 * (e.g. `Map()`, `{}`, `[]`) so that real failures are visible in diagnostics
 * without changing the empty-default behaviour.
 *
 * ENOENT errors are NOT logged — a missing file on first run is normal state,
 * not an error condition.
 *
 * @param site  Short stable identifier following the pattern `module/path:function`
 *              or `file:line`. Must be unique per swallow site.
 * @param err   The caught error from the I/O or parse operation.
 */
export function logSwallowedIoError(site: string, err: unknown): void {
  // eslint-disable-next-line no-console
  console.debug(
    `[dysflow:swallowed-io:${site}] ${err instanceof Error ? err.message : String(err)}`,
  );
}
