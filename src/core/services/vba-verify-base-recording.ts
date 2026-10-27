/**
 * Write-side bookkeeping for the `verify_code` last-synced base (#1890).
 *
 * Every write that can change a module on either side invalidates that
 * module's base. This decides the scope from the caller's request, before any
 * staging copy replaces `accessPath`, so the invalidation is keyed on the binary
 * the caller named.
 */

/** Tools whose writes invalidate the verify base. */
const BASE_INVALIDATING_TOOLS: ReadonlySet<string> = new Set([
  "import_modules",
  "import_all",
  "delete_module",
  "export_modules",
  "export_all",
]);

/**
 * Returns the modules whose base a call invalidates: their names, `"all"` when
 * the call cannot name them (whole-project writes, directory imports), or
 * `undefined` when the call does not write. Over-invalidating is always safe.
 */
export function verifyBaseWriteScope(
  toolName: string,
  params: Record<string, unknown>,
): readonly string[] | "all" | undefined {
  if (!BASE_INVALIDATING_TOOLS.has(toolName)) return undefined;
  if (params.dryRun === true || params.apply === false) return undefined;
  const isExport = toolName === "export_modules" || toolName === "export_all";
  // Exports are plan-only unless the caller commits (#1250).
  if (isExport && params.apply !== true && params.dryRun !== false) return undefined;
  if (toolName === "import_all" || toolName === "export_all") return "all";
  const names = [
    ...stringList(params.moduleNames),
    ...stringList(params.moduleName === undefined ? [] : [params.moduleName]),
  ];
  return names.length > 0 ? names : "all";
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.length > 0)
    : [];
}
