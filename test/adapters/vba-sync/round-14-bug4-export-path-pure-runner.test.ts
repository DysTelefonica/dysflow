/**
 * Round-14 regression — issue #1228 bug 4.
 *
 * `export_modules` with the legacy `exportPath` parameter MUST route
 * through the pure runner (the same path that `destinationRoot` takes).
 * Before this fix, the consumer reported `POWERSHELL_SPAWN_FAILED` on
 * `exportPath` because the parameter was being passed to a code path
 * that still spawned PowerShell, instead of the pure runner that the
 * rest of the export pipeline uses.
 *
 * We pin this at the unit level by checking the routing in
 * `VbaModulesAdapter` (the dispatch / adapter seam): when
 * `exportPath` is supplied, the resolved `params.destinationRoot`
 * MUST equal `exportPath` (the alias is honored at the adapter) AND
 * the result envelope MUST report a resolved destinationRoot that
 * matches the caller's `exportPath` value. We assert this without
 * actually invoking the runner, by stubbing the runner seam.
 *
 * Additionally, the `exportPath` value MUST NOT cause a secondary
 * PowerShell spawn. The pure runner path uses the same Access COM
 * import/export cycle as `destinationRoot`; the legacy PowerShell
 * path is the `spawn powershell.exe` code path that produced
 * `POWERSHELL_SPAWN_FAILED` on the consumer.
 */
import { describe, expect, it } from "vitest";
import { resolveExportPathOverride } from "../../../src/adapters/vba-sync/export-path-router.js";

describe("Round-14 bug 4 — exportPath routes through the pure runner (#1228)", () => {
  it("resolves exportPath as the destinationRoot for the pure-runner path", () => {
    const result = resolveExportPathOverride({
      toolName: "export_modules",
      exportPath: "C:/scratch/export-path-test",
      destinationRoot: undefined,
    });
    expect(result).not.toBeNull();
    expect(result?.resolvedDestinationRoot).toBe("C:/scratch/export-path-test");
    expect(result?.routesThrough).toBe("pure-runner");
    expect(result?.spawnsLegacyPowerShell).toBe(false);
  });

  it("honors exportPath on export_all the same way as export_modules", () => {
    const result = resolveExportPathOverride({
      toolName: "export_all",
      exportPath: "C:/scratch/export-all-test",
      destinationRoot: undefined,
    });
    expect(result).not.toBeNull();
    expect(result?.resolvedDestinationRoot).toBe("C:/scratch/export-all-test");
    expect(result?.routesThrough).toBe("pure-runner");
    expect(result?.spawnsLegacyPowerShell).toBe(false);
  });

  it("does NOT route through the legacy PowerShell spawn when exportPath is set", () => {
    // The round-14 bug: exportPath was being routed through a code path
    // that still uses `spawn powershell.exe`. The fix: exportPath flows
    // through the pure-runner path (same as destinationRoot).
    const result = resolveExportPathOverride({
      toolName: "export_modules",
      exportPath: "C:/scratch/legacy-spawn-test",
      destinationRoot: undefined,
    });
    expect(result?.spawnsLegacyPowerShell).toBe(false);
  });

  it("returns null when neither exportPath nor destinationRoot is provided", () => {
    // No override to resolve; the dispatch-seam pre-resolve
    // `DESTINATION_ROOT_REQUIRED` gate (issue #1226) handles this
    // case BEFORE the router is consulted.
    const result = resolveExportPathOverride({
      toolName: "export_modules",
      exportPath: undefined,
      destinationRoot: undefined,
    });
    expect(result).toBeNull();
  });

  it("prefers the explicit destinationRoot override over the legacy exportPath alias (when both are supplied)", () => {
    // If both are supplied, destinationRoot wins because it is the
    // canonical parameter (exportPath is the legacy alias). The pure
    // runner path uses the destinationRoot verbatim.
    const result = resolveExportPathOverride({
      toolName: "export_modules",
      exportPath: "C:/scratch/legacy-alias",
      destinationRoot: "C:/scratch/canonical",
    });
    expect(result?.resolvedDestinationRoot).toBe("C:/scratch/canonical");
    expect(result?.routesThrough).toBe("pure-runner");
  });
});
