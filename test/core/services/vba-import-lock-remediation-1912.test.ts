/**
 * Issue #1912 (defect b) — an import that fails because Access has no
 * exclusive access to the database is a lock condition, not a parser
 * rejection. Access raises the condition in the UI language of the host
 * ("No tiene acceso exclusivo a la base de datos en este momento..." on a
 * Spanish install), so the mapping must not depend on the runner having
 * tagged the attempt as `databaseLocked`.
 */
import { describe, expect, it } from "vitest";

import { VbaSyncAdapter } from "../../../src/adapters/vba-sync/vba-sync-adapter";
import {
  orchestrateVbaImport,
  type VbaImportRawAttempt,
} from "../../../src/core/services/vba-import-orchestration";
import { noopPreflightCleanup } from "../../_helpers/noop-preflight-cleanup.js";

const SPANISH_EXCLUSIVE_ACCESS =
  "No tiene acceso exclusivo a la base de datos en este momento. Si continúa haciendo cambios existe la posibilidad de que no pueda guardarlos.";
const ENGLISH_EXCLUSIVE_ACCESS =
  "You do not have exclusive access to the database at this time. If you proceed to make changes, you may not be able to save them later.";

function failedAttempt(module: string, message: string): VbaImportRawAttempt {
  return { module, ok: false, durationMs: 1, phase: "import", message };
}

async function importSingleFailure(message: string) {
  const completion = await orchestrateVbaImport(["ModA"], {
    runPass: async () => ({ attempts: [failedAttempt("ModA", message)] }),
    save: async () => ({}),
  });
  const result = completion.result;
  if (Array.isArray(result)) throw new Error("expected a failure envelope");
  const [moduleResult] = result.modules;
  if (moduleResult?.error === null || moduleResult?.error === undefined) {
    throw new Error("expected a per-module error");
  }
  return moduleResult.error;
}

describe("import lock remediation (#1912)", () => {
  it.each([
    ["Spanish", SPANISH_EXCLUSIVE_ACCESS],
    ["English", ENGLISH_EXCLUSIVE_ACCESS],
  ])(
    "maps the %s exclusive-access message to a lock error, not to the parser",
    async (_label, message) => {
      const error = await importSingleFailure(message);

      expect(error.code).toBe("ACCESS_DATABASE_LOCKED");
      expect(error.remediation).not.toMatch(/parser/i);
      expect(error.remediation).toMatch(/exclusive access/i);
      expect(error.remediation).toMatch(/access_force_cleanup_orphaned/);
    },
  );

  it("keeps the parser remediation for a genuine module rejection", async () => {
    const error = await importSingleFailure("Expected: end of statement");

    expect(error.code).toBe("VBA_IMPORT_PHASE_FAILED");
    expect(error.remediation).toMatch(/parser/i);
  });

  it("gives a runner-level ACCESS_DATABASE_LOCKED failure the lock remediation at the MCP port", async () => {
    const adapter = new VbaSyncAdapter({
      preflightCleanup: noopPreflightCleanup(),
      executor: async () => ({
        exitCode: 1,
        stdout: `DYSFLOW_RESULT ${JSON.stringify({
          ok: false,
          error: { code: "ACCESS_DATABASE_LOCKED", message: SPANISH_EXCLUSIVE_ACCESS },
        })}`,
        stderr: "",
        durationMs: 1,
        timedOut: false,
      }),
      scriptPath: "scripts/dysflow-vba-manager.ps1",
      accessPath: "front.accdb",
      destinationRoot: "src",
      env: {},
    });

    const result = await adapter.execute("import_modules", { moduleNames: ["ModA"], apply: true });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error.code).toBe("ACCESS_DATABASE_LOCKED");
    expect(result.error.remediation).not.toMatch(/parser/i);
    expect(result.error.remediation).toMatch(/access_force_cleanup_orphaned/);
  });
});
