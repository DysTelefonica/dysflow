/**
 * #1045 — `run_vba` invokes the PowerShell runner when the requested procedure
 * is known to be absent from the Access binary, then flattens the known cause
 * into a generic `RUNNER_FAILED`. The fix is a pre-flight at the service layer:
 * when a `VbaSourceResolver` is wired, the service resolves the module's
 * source (or all modules when `moduleName` is empty), checks the procedure
 * against the parsed source via `listVbaProcedures`, and surfaces the typed
 * `PROCEDURE_NOT_FOUND` envelope before the runner is ever spawned.
 *
 * This file pins the four RED tests for the fix:
 *   - Test 1 — verified absence returns `PROCEDURE_NOT_FOUND`, runner not called
 *   - Test 2 — verified presence returns the runner result verbatim
 *   - Test 3 — empty `moduleName` falls back to all-modules scan
 *   - Test 4 — unresolved source is non-actionable (runner proceeds; no false
 *     positive). Genuine runner failures retain their taxonomy.
 *
 * The dry-run escape hatch (PR1a, #621) MUST be preserved: `dryRun: true`
 * returns the plan without preflight and without invoking the runner.
 *
 * Companion tests for the runner's UTF-8 preservation live in
 * `test/core/runner/access-runner-unicode-preservation.test.ts`. The PowerShell
 * `Set-ScriptOutputEncodingUtf8` pin lives in
 * `scripts/tests/dysflow-access-runner.Tests.ps1`.
 */

import { describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { OperationResult } from "../../../src/core/contracts/index.js";
import type {
  AccessRunner,
  AccessRunnerOperation,
} from "../../../src/core/runner/access-runner.js";
import {
  AccessVbaService,
  type VbaSourceResolver,
} from "../../../src/core/services/vba-service.js";

const config: DysflowConfig = {
  configSource: "explicit-request",
  allowWrites: true,
  accessDbPath: "C:/data/expedientes.accdb",
  accessPassword: "irrelevant-secret",
  backendPassword: "irrelevant-backend",
  timeoutMs: 30_000,
};

const expedienteSourceWithProcedureX = [
  'Attribute VB_Name = "EXPEDIENTES"',
  "Option Explicit",
  "",
  "Public Sub Procedure_X()",
  "End Sub",
  "",
  "Public Function Helper() As Long",
  "    Helper = 1",
  "End Function",
].join("\r\n");

const expedienteSourceWithDumpWhereForTest = [
  'Attribute VB_Name = "EXPEDIENTES"',
  "Option Explicit",
  "",
  "Public Sub DumpWhereForTest()",
  "End Sub",
].join("\r\n");

const allModulesSource = {
  ModuleA: ['Attribute VB_Name = "ModuleA"', "Public Sub Procedure_A()", "End Sub"].join("\r\n"),
  ModuleB: [
    'Attribute VB_Name = "ModuleB"',
    "Public Function Other() As Long",
    "    Other = 1",
    "End Function",
  ].join("\r\n"),
};

class RecordingRunner implements AccessRunner {
  public callCount = 0;
  public lastOperation: AccessRunnerOperation | undefined;

  constructor(private readonly nextResult: OperationResult<unknown> = defaultResult()) {}

  async run<TData>(operation: AccessRunnerOperation): Promise<OperationResult<TData>> {
    this.callCount += 1;
    this.lastOperation = operation;
    return this.nextResult as OperationResult<TData>;
  }

  async runProbe<TData>(): Promise<OperationResult<TData>> {
    throw new Error("RecordingRunner.runProbe: not used by these tests");
  }
}

function defaultResult(): OperationResult<unknown> {
  return {
    ok: true,
    data: { returnValue: 0 },
    diagnostics: [],
    durationMs: 5,
  };
}

describe("AccessVbaService — procedure-existence preflight (#1045)", () => {
  it("Test 1 — returns PROCEDURE_NOT_FOUND without invoking the runner when procedureName is absent from the resolved module source", async () => {
    const runner = new RecordingRunner();
    const resolver: VbaSourceResolver = {
      async resolveModuleSource(moduleName) {
        if (moduleName === "EXPEDIENTES") return expedienteSourceWithProcedureX;
        return undefined;
      },
      async resolveAllModuleSources() {
        return {};
      },
    };
    const service = new AccessVbaService({ runner, config, sourceResolver: resolver });

    const result = await service.execute({
      moduleName: "EXPEDIENTES",
      procedureName: "DumpWhereForTest",
      arguments: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected PROCEDURE_NOT_FOUND");
    expect(result.error.code).toBe("PROCEDURE_NOT_FOUND");
    expect(result.error.message).toContain("DumpWhereForTest");
    expect(result.error.message).toContain("EXPEDIENTES");
    expect(result.error.details).toMatchObject({
      procedure: "DumpWhereForTest",
      moduleName: "EXPEDIENTES",
    });
    expect(runner.callCount).toBe(0);
  });

  it("Test 2 — does not preflight-fail when the procedure IS declared in the resolved module — runner executes normally with argsJson:[]", async () => {
    const runner = new RecordingRunner({
      ok: true,
      data: { returnValue: 0 },
      diagnostics: [],
      durationMs: 7,
    });
    const resolver: VbaSourceResolver = {
      async resolveModuleSource(moduleName) {
        if (moduleName === "EXPEDIENTES") return expedienteSourceWithDumpWhereForTest;
        return undefined;
      },
      async resolveAllModuleSources() {
        return {};
      },
    };
    const service = new AccessVbaService({ runner, config, sourceResolver: resolver });

    const result = await service.execute({
      moduleName: "EXPEDIENTES",
      procedureName: "DumpWhereForTest",
      arguments: [],
    });

    expect(runner.callCount).toBe(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ returnValue: 0 });
    }
    expect(runner.lastOperation).toMatchObject({
      kind: "vba",
      request: {
        moduleName: "EXPEDIENTES",
        procedureName: "DumpWhereForTest",
        arguments: [],
      },
    });
  });

  it("Test 3 — falls back to all-modules scan when moduleName is empty, and surfaces PROCEDURE_NOT_FOUND when procedure is absent across all sources", async () => {
    const runner = new RecordingRunner();
    const resolver: VbaSourceResolver = {
      async resolveModuleSource() {
        return undefined;
      },
      async resolveAllModuleSources() {
        return allModulesSource;
      },
    };
    const service = new AccessVbaService({ runner, config, sourceResolver: resolver });

    const result = await service.execute({
      moduleName: "",
      procedureName: "DumpWhereForTest",
      arguments: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected PROCEDURE_NOT_FOUND");
    expect(result.error.code).toBe("PROCEDURE_NOT_FOUND");
    expect(result.error.message).toContain("DumpWhereForTest");
    expect(runner.callCount).toBe(0);
  });

  it("Test 3 (positive branch) — all-modules scan: when the procedure IS declared anywhere in the source tree, runner proceeds", async () => {
    const runner = new RecordingRunner({
      ok: true,
      data: { returnValue: 1 },
      diagnostics: [],
      durationMs: 3,
    });
    const resolver: VbaSourceResolver = {
      async resolveModuleSource() {
        return undefined;
      },
      async resolveAllModuleSources() {
        return {
          ModuleA: [
            'Attribute VB_Name = "ModuleA"',
            "Public Sub Procedure_A()",
            "End Sub",
            "",
            "Public Sub DumpWhereForTest()",
            "End Sub",
          ].join("\r\n"),
        };
      },
    };
    const service = new AccessVbaService({ runner, config, sourceResolver: resolver });

    const result = await service.execute({
      moduleName: "",
      procedureName: "DumpWhereForTest",
      arguments: [],
    });

    expect(runner.callCount).toBe(1);
    expect(result.ok).toBe(true);
  });

  it("Test 4 (no-regression) — does NOT preflight-fail when the source-resolver returns undefined (cannot verify absence) — runner proceeds", async () => {
    const runner = new RecordingRunner({
      ok: true,
      data: { returnValue: 42 },
      diagnostics: [],
      durationMs: 1,
    });
    const resolver: VbaSourceResolver = {
      async resolveModuleSource() {
        return undefined;
      },
      async resolveAllModuleSources() {
        return {};
      },
    };
    const service = new AccessVbaService({ runner, config, sourceResolver: resolver });

    const result = await service.execute({
      moduleName: "EXPEDIENTES",
      procedureName: "DumpWhereForTest",
      arguments: [],
    });

    expect(runner.callCount).toBe(1);
    expect(result.ok).toBe(true);
  });

  it("Test 4 (no-regression) — passes through genuine RUNNER_FAILED failures verbatim without trying to reclassify them as PROCEDURE_NOT_FOUND", async () => {
    const runner = new RecordingRunner({
      ok: false,
      error: {
        code: "RUNNER_FAILED",
        message:
          'PowerShell runner failed with exit code 1: Excepción al llamar a "Run" con los argumentos "31": "real Access engine failure".',
        retryable: false,
      },
      diagnostics: [],
      durationMs: 9,
    });
    const resolver: VbaSourceResolver = {
      async resolveModuleSource() {
        return expedienteSourceWithProcedureX;
      },
      async resolveAllModuleSources() {
        return {};
      },
    };
    const service = new AccessVbaService({ runner, config, sourceResolver: resolver });

    const result = await service.execute({
      moduleName: "EXPEDIENTES",
      procedureName: "Procedure_X",
      arguments: [],
    });

    expect(runner.callCount).toBe(1);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected RUNNER_FAILED to propagate");
    // Genuine runner failure taxonomy MUST NOT be flattened.
    expect(result.error.code).toBe("RUNNER_FAILED");
    expect(result.error.message).toContain("Excepción");
  });

  it("preserves the dry-run escape hatch: dryRun:true returns the plan without invoking runner or preflight", async () => {
    const runner = new RecordingRunner();
    const resolver: VbaSourceResolver = {
      async resolveModuleSource() {
        // Would otherwise preflight-fail — dry-run bypasses the gate.
        return expedienteSourceWithProcedureX;
      },
      async resolveAllModuleSources() {
        return {};
      },
    };
    const service = new AccessVbaService({ runner, config, sourceResolver: resolver });

    const result = await service.execute({
      moduleName: "EXPEDIENTES",
      procedureName: "DumpWhereForTest",
      arguments: [],
      dryRun: true,
    });

    expect(runner.callCount).toBe(0);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        dryRun: true,
        willExecute: false,
        willModifyAccess: false,
        procedureName: "DumpWhereForTest",
        moduleName: "EXPEDIENTES",
      });
    }
  });

  it("when no sourceResolver is wired (defensive default), the runner is invoked normally — no false-positive preflight", async () => {
    const runner = new RecordingRunner({
      ok: true,
      data: { returnValue: 0 },
      diagnostics: [],
      durationMs: 2,
    });
    const service = new AccessVbaService({ runner, config });

    const result = await service.execute({
      moduleName: "EXPEDIENTES",
      procedureName: "DumpWhereForTest",
      arguments: [],
    });

    expect(runner.callCount).toBe(1);
    expect(result.ok).toBe(true);
  });

  it("case-insensitive procedure lookup: a differently-cased call resolves to the canonical-cased declaration in source", async () => {
    const runner = new RecordingRunner({
      ok: true,
      data: { returnValue: 0 },
      diagnostics: [],
      durationMs: 1,
    });
    const resolver: VbaSourceResolver = {
      async resolveModuleSource() {
        return expedienteSourceWithDumpWhereForTest;
      },
      async resolveAllModuleSources() {
        return {};
      },
    };
    const service = new AccessVbaService({ runner, config, sourceResolver: resolver });

    const result = await service.execute({
      moduleName: "EXPEDIENTES",
      procedureName: "dumpwherefortest",
      arguments: [],
    });

    expect(runner.callCount).toBe(1);
    expect(result.ok).toBe(true);
  });
});
