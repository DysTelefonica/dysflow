/**
 * Issue #1912 (defect a) — `status:"ok"` must only describe a module whose
 * change Access was asked to persist, and a batch that hits the
 * exclusive-access lock must not report any module as ok.
 */
import { describe, expect, it } from "vitest";

import {
  orchestrateVbaImport,
  type VbaImportRawAttempt,
} from "../../../src/core/services/vba-import-orchestration";

const LOCK_MESSAGE =
  "No tiene acceso exclusivo a la base de datos en este momento. Si continúa haciendo cambios existe la posibilidad de que no pueda guardarlos.";

function scriptedPort(passes: VbaImportRawAttempt[][]) {
  const passRequests: string[][] = [];
  const saveRequests: string[][] = [];
  return {
    passRequests,
    saveRequests,
    port: {
      runPass: async (moduleNames: readonly string[]) => {
        passRequests.push([...moduleNames]);
        const next = passes.shift();
        if (next === undefined) throw new Error("no scripted pass left");
        return { attempts: next };
      },
      save: async (moduleNames: readonly string[]) => {
        saveRequests.push([...moduleNames]);
        return {};
      },
    },
  };
}

describe("import persistence under a lost exclusive access (#1912)", () => {
  it("fails every module of the batch when one module hits the lock", async () => {
    const { port, passRequests, saveRequests } = scriptedPort([
      [
        { module: "ModuleA", ok: true, durationMs: 1, modifiedComponentName: "ModuleA" },
        { module: "TestModuleB", ok: false, durationMs: 1, phase: "import", message: LOCK_MESSAGE },
      ],
    ]);

    const completion = await orchestrateVbaImport(["ModuleA", "TestModuleB"], port);

    expect(completion.exitCode).toBe(1);
    expect(passRequests).toEqual([["ModuleA", "TestModuleB"]]);
    expect(saveRequests).toEqual([]);
    if (Array.isArray(completion.result)) throw new Error("expected a failure envelope");
    expect(completion.result.modules.map((entry) => entry.status)).toEqual(["error", "error"]);
    expect(completion.result.modules.map((entry) => entry.error?.code)).toEqual([
      "ACCESS_DATABASE_LOCKED",
      "ACCESS_DATABASE_LOCKED",
    ]);
  });

  it("asks the port to save a modified existing component before reporting it ok", async () => {
    const { port, saveRequests } = scriptedPort([
      [{ module: "ModuleA", ok: true, durationMs: 1, modifiedComponentName: "ModuleA" }],
    ]);

    const completion = await orchestrateVbaImport(["ModuleA"], port);

    expect(saveRequests).toEqual([["ModuleA"]]);
    expect(completion.exitCode).toBe(0);
    expect(completion.result).toMatchObject([{ module: "ModuleA", status: "ok" }]);
  });
});
