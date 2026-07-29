/**
 * Round-14 regression fix — issue #1228 bug 4.
 *
 * `export_modules` with the legacy `exportPath` parameter previously
 * routed through a code path that still spawned PowerShell
 * (`spawn powershell.exe`) instead of the pure-runner path that the
 * rest of the export pipeline uses. The consumer reported
 * `POWERSHELL_SPAWN_FAILED` on `exportPath` even when the same
 * `destinationRoot` value worked.
 *
 * This helper is the single chokepoint the dispatch seam consults to
 * resolve the `exportPath` legacy alias. It returns a typed shape
 * that records:
 *
 *   - `resolvedDestinationRoot` — the destinationRoot the pure-runner
 *     path will use. The legacy `exportPath` alias collapses to the
 *     canonical `destinationRoot` here so the pure runner is the only
 *     writer on the export path.
 *   - `routesThrough` — the dispatch route. Always
 *     `"pure-runner"` for `exportPath` (the legacy PowerShell path is
 *     not exposed through this router; bug 4 was that it was).
 *   - `spawnsLegacyPowerShell` — false for `exportPath`; the pure
 *     runner uses the same Access COM import/export cycle as
 *     `destinationRoot` and never spawns the PowerShell worker.
 *
 * Precedence:
 *   1. `params.destinationRoot` (canonical) — wins when both supplied.
 *   2. `params.exportPath` (legacy alias) — collapsed into (1).
 *   3. `null` — when neither is supplied. The dispatch-seam
 *      `DESTINATION_ROOT_REQUIRED` gate (issue #1226) handles this
 *      case BEFORE the router is consulted.
 */
export type ExportPathResolution = {
  resolvedDestinationRoot: string;
  routesThrough: "pure-runner";
  spawnsLegacyPowerShell: false;
};

export type ExportPathOverrideInput = {
  toolName: "export_modules" | "export_all";
  exportPath: string | undefined;
  destinationRoot: string | undefined;
};

export function resolveExportPathOverride(
  input: ExportPathOverrideInput,
): ExportPathResolution | null {
  if (
    (input.toolName !== "export_modules" && input.toolName !== "export_all") ||
    (input.exportPath === undefined && input.destinationRoot === undefined)
  ) {
    return null;
  }
  const resolvedDestinationRoot = input.destinationRoot ?? input.exportPath;
  if (resolvedDestinationRoot === undefined || resolvedDestinationRoot.length === 0) {
    return null;
  }
  return {
    resolvedDestinationRoot,
    routesThrough: "pure-runner",
    spawnsLegacyPowerShell: false,
  };
}
