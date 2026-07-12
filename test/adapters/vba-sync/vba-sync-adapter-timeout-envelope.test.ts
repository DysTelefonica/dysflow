/**
 * Issue #757 (C3) — `VBA_MANAGER_TIMEOUT` envelope enrichment.
 *
 * Pre-#757 the timeout envelope carried the structured fields from F3
 * (#757, F3 already landed): `phase`, `wasApply`, `operationTimeoutMs`,
 * `reapedProcessPids`, `cleanupWarnings`, `expectedLockFile`. C3
 * ADDS to that surface with `lingeringProcesses` (with `pid`, `kind`,
 * `ageSeconds`, `headless`) AND `lingeringLockFiles` (an array, not a
 * single file).
 *
 * The fields inherited from F3 stay (additive — old consumers keep
 * reading `reapedProcessPids`, `cleanupWarnings`, `expectedLockFile`
 * unchanged) so the `VBA_MANAGER_TIMEOUT` envelope is a strict
 * superset.
 *
 * The remediation message is the canonical one from the issue text —
 * "Call dysflow_access_force_cleanup_orphaned with projectId and
 * accessPath. No confirmPid on first call (read-only list)." — so an
 * AI consumer grepping the envelope for `access_force_cleanup_orphaned`
 * finds the right next step without consulting the docs.
 */

import { describe, expect, it, vi } from "vitest";
import type { VbaManagerExecutor } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { VbaSyncAdapter } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import type { AccessOperationPreflightCleanup } from "../../../src/core/operations/access-operation-preflight";

function buildAdapterWithCleanup(
  preflightCleanup: AccessOperationPreflightCleanup,
  timeoutMs = 12_000,
): VbaSyncAdapter {
  const executor: VbaManagerExecutor = async (request) => ({
    exitCode: null,
    stdout: "",
    stderr: "",
    durationMs: request.timeoutMs,
    timedOut: true,
  });
  return new VbaSyncAdapter({
    executor,
    preflightCleanup,
    timeoutMs,
    accessPath: "C:/db/front.accdb",
    env: {},
  });
}

describe("VbaSyncAdapter — VBA_MANAGER_TIMEOUT envelope (#757 C3)", () => {
  it("happy: timeout envelope carries the new lingeringProcesses + lingeringLockFiles + canonical remediation (#757 C3)", async () => {
    // The preflight emits a refused kill and a timeout cleanup error.
    // Both map to "this PID MAY still be lingering" — so the new
    // envelope must surface them in `lingeringProcesses` so a consumer
    // can act without re-auditing the OS.
    const refusedKillMessage =
      "Refused to kill PID 3333: mainWindowHandle is 0x1F, not 0 (visible window).";
    const preflight: AccessOperationPreflightCleanup = {
      cleanup: vi
        .fn()
        .mockResolvedValueOnce({ cleaned: [], killed: [], orphanedKilled: [], errors: [] })
        .mockResolvedValueOnce({
          cleaned: ["op-1"],
          killed: [1111],
          orphanedKilled: [2222],
          errors: [{ operationId: "orphan", message: refusedKillMessage }],
        }),
    };

    const service = buildAdapterWithCleanup(preflight);
    const result = await service.execute("export_all", {
      accessPath: "C:/db/front.accdb",
      projectRoot: "C:/repo",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected timeout failure");
    expect(result.error.code).toBe("VBA_MANAGER_TIMEOUT");
    const details = result.error.details as Record<string, unknown>;

    // ── #757 (C3) NEW surface ───────────────────────────────────────────
    // lingeringProcesses is an array of { pid, kind, ageSeconds, headless }
    // objects describing PIDs the cleanup COULD NOT reap. The refused
    // kill surfaces here (default ageSeconds / headless via the
    // helper).
    expect(Array.isArray(details.lingeringProcesses)).toBe(true);
    const lingering = details.lingeringProcesses as Array<{
      pid?: number;
      kind?: string;
      ageSeconds?: number;
      headless?: boolean;
    }>;
    expect(lingering.length).toBeGreaterThan(0);
    const firstLingering = lingering[0] as {
      pid?: number;
      kind?: string;
      ageSeconds?: number;
      headless?: boolean;
    };
    expect(typeof firstLingering.pid).toBe("number");
    expect(firstLingering.kind).toBe("MSACCESS.EXE");
    expect(typeof firstLingering.ageSeconds).toBe("number");
    expect(typeof firstLingering.headless).toBe("boolean");

    // lingeringLockFiles is an ARRAY. Pre-F3 we had `expectedLockFile`
    // (a single string). Both surfaces stay — additive.
    expect(Array.isArray(details.lingeringLockFiles)).toBe(true);
    const lockFiles = details.lingeringLockFiles as string[];
    expect(lockFiles).toContain("C:/db/front.laccdb");

    // Canonical remediation message.
    expect(typeof result.error.remediation).toBe("string");
    expect(result.error.remediation).toContain("access_force_cleanup_orphaned");
    expect(result.error.remediation).toContain("No confirmPid");
  });

  it("#757 (C3) — export-phase envelope uses phase='export' and wasApply:true", async () => {
    const preflight: AccessOperationPreflightCleanup = {
      cleanup: vi
        .fn()
        .mockResolvedValueOnce({ cleaned: [], killed: [], orphanedKilled: [], errors: [] })
        .mockResolvedValueOnce({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
    };
    const service = buildAdapterWithCleanup(preflight);
    const result = await service.execute("export_all", {
      accessPath: "C:/db/front.accdb",
      projectRoot: "C:/repo",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected timeout failure");
    const details = result.error.details as Record<string, unknown>;
    expect(details.phase).toBe("export");
    // wasApply is true for export_all in default-write mode (no
    // explicit apply:false / diff:true was passed).
    expect(details.wasApply).toBe(true);
  });

  it("#757 (C3) — import-phase envelope uses phase='import' and wasApply:true when apply:true was passed", async () => {
    const preflight: AccessOperationPreflightCleanup = {
      cleanup: vi
        .fn()
        .mockResolvedValueOnce({ cleaned: [], killed: [], orphanedKilled: [], errors: [] })
        .mockResolvedValueOnce({ cleaned: [], killed: [], orphanedKilled: [], errors: [] }),
    };
    const service = buildAdapterWithCleanup(preflight);
    // import_modules is a binary-writing tool (mutates the .accdb).
    // When the caller passes apply:true, wasApply:true on the
    // timeout envelope tells the consumer "a partial commit is on
    // the binary".
    const result = await service.execute("import_modules", {
      accessPath: "C:/db/front.accdb",
      projectRoot: "C:/repo",
      moduleNames: ["Module_Foo"],
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected timeout failure");
    const details = result.error.details as Record<string, unknown>;
    expect(details.phase).toBe("import");
    expect(details.wasApply).toBe(true);
  });

  it("#757 (C3) — preset F3 fields are preserved (reapedProcessPids, cleanupWarnings, expectedLockFile) for backward compatibility", async () => {
    // The pre-F3 fields (reapedProcessPids, cleanupWarnings,
    // expectedLockFile) MUST stay — C3 is additive, not a replacement.
    // Old consumers continue to work.
    const preflight: AccessOperationPreflightCleanup = {
      cleanup: vi
        .fn()
        .mockResolvedValueOnce({ cleaned: [], killed: [], orphanedKilled: [], errors: [] })
        .mockResolvedValueOnce({
          cleaned: ["op-1"],
          killed: [1111],
          orphanedKilled: [2222],
          errors: [
            {
              operationId: "orphan",
              message: "Refused to kill PID 3333: window visible.",
            },
          ],
        }),
    };
    const service = buildAdapterWithCleanup(preflight);
    const result = await service.execute("export_all", {
      accessPath: "C:/db/front.accdb",
      projectRoot: "C:/repo",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected timeout failure");
    const details = result.error.details as Record<string, unknown>;
    expect(details.reapedProcessPids).toEqual([1111, 2222]);
    expect(details.cleanupWarnings).toEqual(["orphan: Refused to kill PID 3333: window visible."]);
    expect(details.expectedLockFile).toBe("C:/db/front.laccdb");
  });
});

// Vitest `vi` imported above.
