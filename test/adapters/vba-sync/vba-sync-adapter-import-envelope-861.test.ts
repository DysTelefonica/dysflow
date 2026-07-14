import { describe, expect, it } from "vitest";
import {
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";

/**
 * issue #861 — `import_modules` must return a SINGLE, consistent envelope.
 *
 * Reproducer B: importing a form (`Form_FormRiesgoBiblioteca`) succeeds
 * per-module (the PowerShell runner emits `DYSFLOW_RESULT` with every module at
 * `status:"ok"`), but a post-import `Save-VbaProjectModules` failure made the
 * script exit non-zero. The adapter then wrapped a fully-successful import in an
 * outer `VBA_MANAGER_FAILED exit code 1` error — a different envelope shape than
 * the clean success case (`Form_frmSplash`), so consumers could not tell success
 * from failure without parsing the nested result.
 *
 * The per-module structured result is the source of truth: when every module
 * reports `status:"ok"`, the call is a success regardless of the process exit
 * code.
 */
function buildAdapter(executor: VbaManagerExecutor) {
  return new VbaSyncAdapter({
    executor,
    scriptPath: "scripts/dysflow-vba-manager.ps1",
    accessPath: "C:/db/front.accdb",
    destinationRoot: "C:/repo/src",
    env: {},
  });
}

const OK_MODULE = {
  module: "Form_FormRiesgoBiblioteca",
  status: "ok",
  phase: null,
  error: null,
  durationMs: 903,
  rollbackApplied: false,
  fallbackUsed: false,
  fallbackReason: null,
};

describe("import_modules envelope consistency (#861)", () => {
  it("import_modules_envelope_consistent_on_success — non-zero exit with an ok module is a success", async () => {
    // PowerShell unwraps a single-element array on ConvertTo-Json, so a
    // single-module import emits a bare object (exactly reproducer B's log).
    const executor: VbaManagerExecutor = async () => ({
      // Post-import Save-VbaProjectModules threw AFTER the per-module import
      // already succeeded and emitted its DYSFLOW_RESULT line.
      exitCode: 1,
      stdout: `Accion: Import\n[1/1] Importando: Form_FormRiesgoBiblioteca\nDYSFLOW_RESULT ${JSON.stringify(OK_MODULE)}`,
      stderr: "",
      durationMs: 903,
      timedOut: false,
    });
    const adapter = buildAdapter(executor);

    const result = await adapter.execute("import_modules", {
      moduleNames: ["Form_FormRiesgoBiblioteca"],
      apply: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const data = result.data as { result: unknown; operation?: string };
    expect(data.operation).toBe("import_modules");
    expect(data.result).toEqual(OK_MODULE);
  });

  it("treats a multi-module all-ok array with non-zero exit as success", async () => {
    const executor: VbaManagerExecutor = async () => ({
      exitCode: 1,
      stdout: `DYSFLOW_RESULT ${JSON.stringify([OK_MODULE, { ...OK_MODULE, module: "Form_Other" }])}`,
      stderr: "",
      durationMs: 20,
      timedOut: false,
    });
    const adapter = buildAdapter(executor);

    const result = await adapter.execute("import_modules", {
      moduleNames: ["Form_FormRiesgoBiblioteca", "Form_Other"],
      apply: true,
    });

    expect(result.ok).toBe(true);
  });

  it("keeps a genuine per-module failure as a failure envelope", async () => {
    const executor: VbaManagerExecutor = async () => ({
      exitCode: 1,
      stdout: `DYSFLOW_RESULT ${JSON.stringify({
        ok: false,
        error: { code: "VBA_IMPORT_FAILED", message: "Import no pudo completar algunos modulos" },
        modules: [{ module: "ModBroken", status: "error" }],
      })}`,
      stderr: "",
      durationMs: 10,
      timedOut: false,
    });
    const adapter = buildAdapter(executor);

    const result = await adapter.execute("import_modules", {
      moduleNames: ["ModBroken"],
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VBA_IMPORT_FAILED");
  });
});
