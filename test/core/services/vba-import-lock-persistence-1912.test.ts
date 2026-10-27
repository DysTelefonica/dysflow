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

describe("import persistence after a partial failure (#1912 review)", () => {
  it("reports no module ok unless a save was issued for it", async () => {
    const parserFailure: VbaImportRawAttempt = {
      module: "ModA",
      ok: false,
      durationMs: 1,
      phase: "import",
      message: "Expected: end of statement",
    };
    const { port, saveRequests } = scriptedPort([
      [parserFailure, { module: "ModB", ok: true, durationMs: 1, modifiedComponentName: "ModB" }],
      [parserFailure],
    ]);

    const completion = await orchestrateVbaImport(["ModA", "ModB"], port);

    expect(completion.exitCode).toBe(1);
    if (Array.isArray(completion.result)) throw new Error("expected a failure envelope");
    const saved = saveRequests.flat();
    for (const entry of completion.result.modules) {
      if (entry.status === "ok") expect(saved).toContain(entry.module);
    }
    expect(completion.result.modules.find((entry) => entry.module === "ModB")?.status).toBe("ok");
  });
});

describe("lock classification is anchored to Access's message (#1912 review)", () => {
  it("keeps a compile error that quotes 'exclusive access' as a parser failure", async () => {
    const { port } = scriptedPort([
      [
        {
          module: "ModA",
          ok: false,
          durationMs: 1,
          phase: "import",
          message: "Compile error near 'exclusive access' text",
        },
      ],
    ]);

    const completion = await orchestrateVbaImport(["ModA"], port);

    if (Array.isArray(completion.result)) throw new Error("expected a failure envelope");
    expect(completion.result.modules[0]?.error?.code).toBe("VBA_IMPORT_PHASE_FAILED");
  });
});

describe("a batch failed by the lock rolls back what it imported (#1912 review)", () => {
  it("asks the port to roll back the imported modules and reports them as rolled back", async () => {
    const rollbackRequests: string[][] = [];
    const { port } = scriptedPort([
      [
        { module: "ModA", ok: true, durationMs: 1, modifiedComponentName: "ModA" },
        { module: "ModB", ok: false, durationMs: 1, phase: "import", message: LOCK_MESSAGE },
      ],
    ]);

    const completion = await orchestrateVbaImport(["ModA", "ModB"], {
      ...port,
      rollback: async (moduleNames: readonly string[]) => {
        rollbackRequests.push([...moduleNames]);
        return { outcomes: moduleNames.map((module) => ({ module, applied: true })) };
      },
    });

    expect(rollbackRequests).toEqual([["ModA"]]);
    if (Array.isArray(completion.result)) throw new Error("expected a failure envelope");
    expect(completion.result.modules[0]).toMatchObject({
      module: "ModA",
      status: "error",
      rollbackApplied: true,
      error: { code: "ACCESS_DATABASE_LOCKED", rollbackAttempted: true, rollbackApplied: true },
    });
  });

  it("fails every module with the lock when the save reports it", async () => {
    const rollbackRequests: string[][] = [];
    const { port } = scriptedPort([
      [{ module: "ModA", ok: true, durationMs: 1, modifiedComponentName: "ModA" }],
    ]);

    const completion = await orchestrateVbaImport(["ModA"], {
      ...port,
      save: async () => ({ error: LOCK_MESSAGE }),
      rollback: async (moduleNames: readonly string[]) => {
        rollbackRequests.push([...moduleNames]);
        return { outcomes: moduleNames.map((module) => ({ module, applied: true })) };
      },
    });

    expect(completion.exitCode).toBe(1);
    expect(rollbackRequests).toEqual([["ModA"]]);
    if (Array.isArray(completion.result)) throw new Error("expected a failure envelope");
    expect(completion.result.modules.map((entry) => entry.error?.code)).toEqual([
      "ACCESS_DATABASE_LOCKED",
    ]);
  });
});

describe("a failed save in a partial failure never leaves a module ok (#1912 review)", () => {
  it("reports the successful module as VBA_IMPORT_SAVE_FAILED when its save only warns", async () => {
    const parserFailure: VbaImportRawAttempt = {
      module: "ModA",
      ok: false,
      durationMs: 1,
      phase: "import",
      message: "Expected: end of statement",
    };
    const { port } = scriptedPort([
      [
        parserFailure,
        { module: "Form_B", ok: true, durationMs: 1, modifiedDocumentName: "Form_B" },
      ],
      [parserFailure],
    ]);

    const completion = await orchestrateVbaImport(["ModA", "Form_B"], {
      ...port,
      save: async () => ({ warning: "Form_B: RunCommand(280) failed" }),
    });

    if (Array.isArray(completion.result)) throw new Error("expected a failure envelope");
    expect(completion.result.modules[1]).toMatchObject({
      module: "Form_B",
      status: "error",
      error: { code: "VBA_IMPORT_SAVE_FAILED" },
    });
    expect(completion.result.modules[1]?.error?.remediation).toMatch(/not be in the database/);
  });
});
