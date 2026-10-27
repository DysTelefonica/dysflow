/**
 * Issue #1945 — when Access opens the database without exposing a VBA project,
 * the runner refuses before touching any module with VBA_PROJECT_UNAVAILABLE.
 * At the MCP port that refusal must stay classified, carry its own remediation
 * (nothing changed, retry is safe) and never fall back to the raw PowerShell
 * parameter-binding text the issue reported.
 */
import { describe, expect, it } from "vitest";

import { VbaSyncAdapter } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

const REFUSAL =
  "VBA_PROJECT_UNAVAILABLE: Access opened 'front.accdb' but exposed no VBA project for it (VBE.ActiveVBProject is empty and no VBProjects entry matches the file). Nothing was changed.";

function adapterReturning(envelope: unknown): VbaSyncAdapter {
  return new VbaSyncAdapter({
    preflightCleanup: noopPreflightCleanup(),
    executor: async () => ({
      exitCode: 1,
      stdout: `DYSFLOW_RESULT ${JSON.stringify(envelope)}`,
      stderr: "",
      durationMs: 1,
      timedOut: false,
    }),
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    accessPath: "front.accdb",
    destinationRoot: "src",
    env: {},
  });
}

describe("VBA project unavailable (#1945)", () => {
  it("reports the runner refusal as a classified, retryable error with remediation", async () => {
    const adapter = adapterReturning({
      ok: false,
      error: { code: "VBA_PROJECT_UNAVAILABLE", message: REFUSAL },
    });

    const result = await adapter.execute("import_modules", { moduleNames: ["TmpB"], apply: true });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("VBA_PROJECT_UNAVAILABLE");
    expect(result.error.message).not.toMatch(/No se puede enlazar|Cannot bind argument/);
    expect(result.error.retryable).toBe(true);
    expect(result.error.remediation).toMatch(/safe to retry/i);
    expect(result.error.remediation).toMatch(/list_access_operations/);
    expect(result.error.remediation).not.toMatch(/MSACCESS\.EXE/);
  });
});
