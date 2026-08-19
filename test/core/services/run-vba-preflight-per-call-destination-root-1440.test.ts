/**
 * #1440 — Bug A regression. `run_vba` returned `PROCEDURE_NOT_FOUND` for
 * procedures that exist because the preflight resolver was frozen at
 * service construction with the configured `config.destinationRoot`.
 * When the caller supplied a per-call `destinationRoot` override (or the
 * cached service's startup root was wrong), the preflight always rejected
 * — even when the caller's actual target root had the procedure.
 *
 * Reproduction confirmed live against the MCP server on v2.37.2: the same
 * `run_vba({procedureName: "modDiagnosticoMigracionTbCambiosParaPublicacion.DumpSchema"})`
 * call returned `PROCEDURE_NOT_FOUND` from the cached service but
 * `PROCEDURE_NOT_CALLABLE` (preflight accepted, p-code stale) when an
 * explicit `destinationRoot` was added to the request.
 *
 * Fix: the service now accepts an optional `createSourceResolver` factory.
 * When the request carries a non-empty `destinationRoot`, the service uses
 * the factory to build a fresh resolver around that root so the preflight
 * reads the source the caller actually targeted, not the startup root the
 * cached service captured.
 */

import { describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { OperationResult } from "../../../src/core/contracts/index.js";
import type {
  AccessRunner,
  AccessRunnerOperation,
} from "../../../src/core/runner/access-runner.js";
import { AccessVbaService } from "../../../src/core/services/vba-service.js";

const config: DysflowConfig = {
  configSource: "explicit-request",
  allowWrites: true,
  accessDbPath: "C:/data/procedural-import.accdb",
  accessPassword: "irrelevant-secret",
  backendPassword: "irrelevant-backend",
  destinationRoot: "C:/wrong/startup/root",
  timeoutMs: 30_000,
};

const freshModuleSource = [
  'Attribute VB_Name = "modDiagnosticoMigracionTbCambiosParaPublicacion"',
  "Option Compare Database",
  "Option Explicit",
  "",
  "Public Function DumpSchema() As String",
  '    DumpSchema = "ok"',
  "End Function",
].join("\r\n");

const freshModuleName = "modDiagnosticoMigracionTbCambiosParaPublicacion";
const correctDestinationRoot = "C:/correct/per-call/root";

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

describe("#1440 — preflight per-call destinationRoot override (Bug A)", () => {
  it("when the request carries an explicit destinationRoot, the preflight uses the factory-built resolver", async () => {
    // Static resolver returns EMPTY source — simulates a frozen, stale, or
    // wrong-path resolver that would trip the preflight on the wrong root.
    const staticResolver = {
      resolveModuleSource: async () => undefined as string | undefined,
      resolveAllModuleSources: async () => ({}),
    };
    // Factory builds a resolver that returns the actual source. When the
    // factory is called with the correct destinationRoot, the preflight
    // should accept the procedure.
    let factoryCalls = 0;
    const createSourceResolver = (destinationRoot: string) => {
      factoryCalls += 1;
      return {
        resolveModuleSource: async (moduleName: string) => {
          if (moduleName === freshModuleName && destinationRoot === correctDestinationRoot) {
            return freshModuleSource;
          }
          return undefined as string | undefined;
        },
        resolveAllModuleSources: async () => ({}),
      };
    };

    const runner = new RecordingRunner();
    const service = new AccessVbaService({
      runner,
      config,
      sourceResolver: staticResolver,
      createSourceResolver,
    });

    const result = await service.execute({
      moduleName: "",
      procedureName: `${freshModuleName}.DumpSchema`,
      destinationRoot: correctDestinationRoot,
    });

    expect(result.ok).toBe(true);
    expect(factoryCalls).toBe(1);
    expect(runner.callCount).toBe(1);
  });

  it("without destinationRoot override, the preflight uses the static resolver (backward compat)", async () => {
    // Static resolver returns the actual source — simulates a correctly
    // configured service. The preflight should accept it without ever
    // calling the factory.
    const staticResolver = {
      resolveModuleSource: async (moduleName: string) =>
        moduleName === freshModuleName ? freshModuleSource : (undefined as string | undefined),
      resolveAllModuleSources: async () => ({}),
    };
    let factoryCalls = 0;
    const createSourceResolver = (_destinationRoot: string) => {
      factoryCalls += 1;
      // Returning a resolver that would reject — to assert the factory is
      // never consulted when destinationRoot is absent.
      return {
        resolveModuleSource: async () => undefined as string | undefined,
        resolveAllModuleSources: async () => ({}),
      };
    };

    const runner = new RecordingRunner();
    const service = new AccessVbaService({
      runner,
      config,
      sourceResolver: staticResolver,
      createSourceResolver,
    });

    const result = await service.execute({
      moduleName: "",
      procedureName: `${freshModuleName}.DumpSchema`,
    });

    expect(result.ok).toBe(true);
    expect(factoryCalls).toBe(0);
    expect(runner.callCount).toBe(1);
  });

  it("the static resolver returns false positives when the per-call destinationRoot is the one it was built for", async () => {
    // Reproduces the user's bug: static resolver was built for path A
    // (the wrong path the MCP captured at startup); the request targets
    // path B. Without the factory, the preflight would resolve the module
    // through the wrong resolver and reject. With the factory, the
    // preflight accepts because the factory-built resolver reads path B.
    const staticResolver = {
      resolveModuleSource: async (moduleName: string) =>
        moduleName === freshModuleName ? "" : (undefined as string | undefined),
      resolveAllModuleSources: async () => ({}),
    };
    const createSourceResolver = (destinationRoot: string) => ({
      resolveModuleSource: async (moduleName: string) =>
        moduleName === freshModuleName && destinationRoot === correctDestinationRoot
          ? freshModuleSource
          : (undefined as string | undefined),
      resolveAllModuleSources: async () => ({}),
    });

    const runner = new RecordingRunner();
    const service = new AccessVbaService({
      runner,
      config,
      sourceResolver: staticResolver,
      createSourceResolver,
    });

    // No destinationRoot override: the static (wrong-path) resolver runs
    // and the preflight rejects.
    const wrongPath = await service.execute({
      moduleName: "",
      procedureName: `${freshModuleName}.DumpSchema`,
    });
    expect(wrongPath.ok).toBe(false);
    if (!wrongPath.ok) {
      expect(wrongPath.error.code).toBe("PROCEDURE_NOT_FOUND");
    }
    expect(runner.callCount).toBe(0);

    // With destinationRoot override: the factory-built resolver runs and
    // the preflight accepts.
    const correctPath = await service.execute({
      moduleName: "",
      procedureName: `${freshModuleName}.DumpSchema`,
      destinationRoot: correctDestinationRoot,
    });
    expect(correctPath.ok).toBe(true);
    expect(runner.callCount).toBe(1);
  });
});
