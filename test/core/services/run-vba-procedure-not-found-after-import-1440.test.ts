/**
 * #1440 — `run_vba` returns `PROCEDURE_NOT_FOUND` immediately after
 * `import_modules` succeeds for procedures that exist in both the source
 * tree and the Access binary. Reproduction (consumer reported on `v2.37.2`):
 *
 *   1. Write a fresh `Module.bas` with a known procedure on disk.
 *   2. `import_modules({moduleNames: ["Module"], apply: true})` → returns ok.
 *   3. `list_procedures({module: "Module"})` → returns the procedure.
 *   4. `run_vba({procedureName: "Module.Proc", apply: true})` → returns
 *      `PROCEDURE_NOT_FOUND` with the message
 *      "Procedure 'Proc' was not found in the project's VBA source modules
 *       (scanned module: 'Module')."
 *
 * The legitimate cross-check (step 3) sees the procedure; the preflight
 * (step 4) does not, even though both invoke the same `listVbaProcedures`
 * pure parser on the on-disk source.
 *
 * This file is the red-team gate at the **service** boundary. The
 * resolver-layer pin lives in
 * `test/adapters/services/node-vba-source-resolver-after-import-1448.test.ts`;
 * the full Access roundtrip lives in
 * `test/e2e/run-vba-procedure-exists-after-import-1448.e2e.test.ts`.
 *
 * Tests use the in-memory `VbaSourceResolver` port so the underlying
 * file-system adapter is irrelevant to the assertion — the bug is in
 * the service's preflight logic, not in the resolver's I/O.
 */

import { describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { OperationResult } from "../../../src/core/contracts/index.js";
import type {
  AccessRunner,
  AccessRunnerOperation,
} from "../../../src/core/runner/access-runner.js";
import { listVbaProcedures } from "../../../src/core/services/vba-procedure-service.js";
import { AccessVbaService } from "../../../src/core/services/vba-service.js";

const config: DysflowConfig = {
  configSource: "explicit-request",
  allowWrites: true,
  accessDbPath: "C:/data/procedural-import.accdb",
  accessPassword: "irrelevant-secret",
  backendPassword: "irrelevant-backend",
  timeoutMs: 30_000,
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

const freshModuleSource = [
  'Attribute VB_Name = "modDiagnosticoMigracionTbCambiosParaPublicacion"',
  "Option Compare Database",
  "Option Explicit",
  "",
  "Public Function DumpSchema() As String",
  '    DumpSchema = "ok"',
  "End Function",
  "",
  "Public Function RunAll() As String",
  '    RunAll = "ok"',
  "End Function",
].join("\r\n");

const freshModuleName = "modDiagnosticoMigracionTbCambiosParaPublicacion";

describe("#1440 — run_vba preflight accepts a freshly-imported procedure", () => {
  it("does not trip PROCEDURE_NOT_FOUND when the procedure is declared in source", async () => {
    const runner = new RecordingRunner();
    const resolver = {
      resolveModuleSource: async (moduleName: string) =>
        moduleName === freshModuleName ? freshModuleSource : undefined,
      resolveAllModuleSources: async () => ({}),
    };
    const service = new AccessVbaService({ runner, config, sourceResolver: resolver });

    const result = await service.execute({
      moduleName: "",
      procedureName: `${freshModuleName}.DumpSchema`,
    });

    expect(result.ok).toBe(true);
    expect(runner.callCount).toBe(1);
  });

  it("cross-check: listVbaProcedures accepts the procedure and the preflight agrees", async () => {
    // The consumer's bug report quotes both tools reading the same
    // source with the same parser and arriving at different answers.
    // Both use `listVbaProcedures` here so the only layer that can
    // produce divergent answers is the preflight service — the bug
    // is in the preflight, not the parser.
    const runner = new RecordingRunner();
    const resolver = {
      resolveModuleSource: async (moduleName: string) =>
        moduleName === freshModuleName ? freshModuleSource : undefined,
      resolveAllModuleSources: async () => ({}),
    };
    const service = new AccessVbaService({ runner, config, sourceResolver: resolver });

    const declared = listVbaProcedures(freshModuleSource).map((p) => p.name);
    expect(declared).toContain("DumpSchema");

    const result = await service.execute({
      moduleName: "",
      procedureName: `${freshModuleName}.DumpSchema`,
    });
    expect(result.ok).toBe(true);
    expect(runner.callCount).toBe(1);
  });

  it("the parsed moduleName populates the runner request (apply path matches the dry-run plan)", async () => {
    // The reproduction invokes `run_vba` with a `<module>.<proc>`
    // procedureName and the runner must receive the parsed moduleName
    // so the runner's downstream AccessApplication.Run() can resolve
    // the procedure. The dry-run plan (#1174) already does this; the
    // apply path has to match.
    const runner = new RecordingRunner();
    const resolver = {
      resolveModuleSource: async (moduleName: string) =>
        moduleName === freshModuleName ? freshModuleSource : undefined,
      resolveAllModuleSources: async () => ({}),
    };
    const service = new AccessVbaService({ runner, config, sourceResolver: resolver });

    const result = await service.execute({
      moduleName: "",
      procedureName: `${freshModuleName}.RunAll`,
    });

    expect(result.ok).toBe(true);
    expect(runner.callCount).toBe(1);
    expect(runner.lastOperation).toMatchObject({
      kind: "vba",
      request: {
        moduleName: freshModuleName,
        procedureName: `${freshModuleName}.RunAll`,
      },
    });
  });
});
