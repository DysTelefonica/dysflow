import { describe, expect, it } from "vitest";
import {
  type VbaManagerExecutor,
  VbaSyncAdapter,
} from "../../../src/adapters/vba-sync/vba-sync-adapter";

/**
 * issue #951 — an import whose process exits 0 but whose structured
 * `DYSFLOW_RESULT` payload carries per-module failures must be a FAILURE
 * envelope, identical in shape to the exit≠0 structured-failure path.
 *
 * Consumer evidence: the PowerShell runner completed with exit 0 while the
 * payload was the `{ok:false, error:{code:"VBA_IMPORT_FAILED"}, modules:[...]}`
 * failure envelope (a `remove-existing` phase failure). The adapter wrapped it
 * as success, so `applyGuardedFormWrite` skipped its rollback and the consumer
 * received a `mode:"apply"` success with the error buried in the payload.
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

function executorEmitting(payload: unknown): VbaManagerExecutor {
  return async () => ({
    exitCode: 0,
    stdout: `Accion: Import\nDYSFLOW_RESULT ${JSON.stringify(payload)}`,
    stderr: "",
    durationMs: 10,
    timedOut: false,
  });
}

describe("import exit-0 per-module failure detection (#951)", () => {
  it("import_modules with exit 0 and an ok:false failure envelope is a failure with the payload's error code", async () => {
    const adapter = buildAdapter(
      executorEmitting({
        ok: false,
        error: { code: "VBA_IMPORT_FAILED", message: "Import no pudo completar algunos modulos" },
        modules: [{ module: "Form_X", status: "error", phase: "remove-existing" }],
      }),
    );

    const result = await adapter.execute("import_modules", {
      moduleNames: ["Form_X"],
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("VBA_IMPORT_FAILED");
    expect(result.error.message).toContain("Import no pudo completar algunos modulos");
  });

  it("import_modules with exit 0 and an array containing an error entry is a failure with a sensible message", async () => {
    const adapter = buildAdapter(
      executorEmitting([
        { module: "ModOk", status: "ok" },
        { module: "ModBroken", status: "error", phase: "import" },
      ]),
    );

    const result = await adapter.execute("import_modules", {
      moduleNames: ["ModOk", "ModBroken"],
      apply: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The generic structured-failure branch must not blame a process exit
    // that did not fail — "failed with exit code 0" reads as a contradiction.
    expect(result.error.message).not.toContain("exit code 0");
  });

  it("import_all with an explicit empty moduleNames plan and an empty-array payload stays a success (no-op contract)", async () => {
    const adapter = buildAdapter(executorEmitting([]));

    const result = await adapter.execute("import_all", {
      moduleNames: [],
      apply: true,
    });

    expect(result.ok).toBe(true);
  });

  it("import_modules with exit 0 and an all-ok module array stays a success", async () => {
    const adapter = buildAdapter(
      executorEmitting([
        { module: "ModA", status: "ok" },
        { module: "ModB", status: "ok" },
      ]),
    );

    const result = await adapter.execute("import_modules", {
      moduleNames: ["ModA", "ModB"],
      apply: true,
    });

    expect(result.ok).toBe(true);
  });
});
