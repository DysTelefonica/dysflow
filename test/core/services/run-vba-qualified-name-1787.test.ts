/**
 * #1787 — `run_vba` must hand Access COM a name Access can actually resolve.
 *
 * `Access.Application.Run` resolves its `ProcedureName` argument by procedure
 * name, optionally qualified by the *project/database* name of a REFERENCED
 * database (`referencedProject.procedure`). It does NOT resolve a **module**
 * qualifier. Passing `MyModule.RunMe` for a local module therefore always
 * fails with "can't find the procedure" / "no encuentra el procedimiento",
 * which dysflow then reclassified as `PROCEDURE_NOT_CALLABLE` with a
 * "recompile" remediation that cannot possibly help. Consumers looped:
 * import → human compiles → run → same error.
 *
 * The contract these tests pin:
 *
 *   1. When the caller passes `<module>.<procedure>` AND the source preflight
 *      resolved that module and confirmed it declares the procedure, the
 *      runner receives the BARE procedure name.
 *   2. When the module does not resolve from source, or no resolver is wired,
 *      the name is forwarded verbatim — that preserves the legitimate
 *      `referencedProject.procedure` form.
 *   3. Unqualified names are never rewritten.
 *   4. The user-facing envelope keeps the ORIGINAL name; `error.details`
 *      additionally reports what actually went on the wire.
 *   5. `PROCEDURE_NOT_CALLABLE` raised for a name that was still qualified on
 *      the wire names qualification as the first suspect, instead of sending
 *      the caller into the recompile loop.
 */

import { describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { AccessVbaRequest, OperationResult } from "../../../src/core/contracts/index.js";
import type { AccessRunner } from "../../../src/core/runner/access-runner.js";
import type { AccessRunnerOperation } from "../../../src/core/runner/access-runner-operation.js";
import {
  AccessVbaService,
  type VbaSourceResolver,
} from "../../../src/core/services/vba-service.js";

const config: DysflowConfig = {
  configSource: "explicit-request",
  allowWrites: true,
  accessDbPath: "C:/data/proj.accdb",
  timeoutMs: 30_000,
};

const MODULE_SOURCE = [
  'Attribute VB_Name = "MyModule"',
  "Option Explicit",
  "",
  "Public Sub RunMe()",
  "End Sub",
].join("\n");

/**
 * Captures the operation the service hands the runner so the tests can assert
 * on the exact `procedureName` that would reach `$access.Run.Invoke(...)`.
 */
class CapturingRunner implements AccessRunner {
  public lastOperation: AccessRunnerOperation | undefined;

  constructor(private readonly nextResult: OperationResult<unknown>) {}

  async run<TData>(operation: AccessRunnerOperation): Promise<OperationResult<TData>> {
    this.lastOperation = operation;
    return this.nextResult as OperationResult<TData>;
  }

  async runProbe<TData>(): Promise<OperationResult<TData>> {
    throw new Error("CapturingRunner.runProbe: not used by these tests");
  }
}

function okResult(): OperationResult<unknown> {
  return { ok: true, data: { returnValue: 42 }, diagnostics: [], durationMs: 5 };
}

function notCallableResult(): OperationResult<unknown> {
  return {
    ok: false,
    error: {
      code: "RUNNER_FAILED",
      message:
        'PowerShell runner failed with exit code 1: Excepción al llamar a "Run" con los argumentos "31": ' +
        "\"EXPEDIENTES no encuentra el procedimiento 'MyModule.RunMe'.\"",
      retryable: false,
    },
    diagnostics: [],
    durationMs: 5,
  };
}

/** Resolver that knows `MyModule` and nothing else. */
const resolverWithModule: VbaSourceResolver = {
  async resolveModuleSource(moduleName: string): Promise<string | undefined> {
    return moduleName === "MyModule" ? MODULE_SOURCE : undefined;
  },
  async resolveAllModuleSources(): Promise<Record<string, string>> {
    return { MyModule: MODULE_SOURCE };
  },
};

function invokedProcedureName(runner: CapturingRunner): string {
  const operation = runner.lastOperation;
  if (operation === undefined) throw new Error("runner was never invoked");
  if (operation.kind !== "vba") throw new Error(`unexpected operation kind: ${operation.kind}`);
  return operation.request.procedureName;
}

describe("#1787 — run_vba sends Access a resolvable procedure name", () => {
  it("strips the module prefix when the preflight resolved that module from source", async () => {
    const runner = new CapturingRunner(okResult());
    const service = new AccessVbaService({
      runner,
      config,
      sourceResolver: resolverWithModule,
    });

    const result = await service.execute({
      moduleName: "MyModule",
      procedureName: "MyModule.RunMe",
    });

    expect(result.ok).toBe(true);
    expect(invokedProcedureName(runner)).toBe("RunMe");
  });

  it("forwards the name verbatim when the qualifier is not a local module", async () => {
    // `SharedLib.Helper` is the legitimate `referencedProject.procedure` form:
    // the qualifier names a REFERENCED database, not a module in this project.
    const runner = new CapturingRunner(okResult());
    const service = new AccessVbaService({
      runner,
      config,
      sourceResolver: {
        async resolveModuleSource(): Promise<string | undefined> {
          return undefined;
        },
        async resolveAllModuleSources(): Promise<Record<string, string>> {
          return {
            MyModule: ['Attribute VB_Name = "MyModule"', "Public Sub Helper()", "End Sub"].join(
              "\n",
            ),
          };
        },
      },
    });

    const result = await service.execute({
      moduleName: "SharedLib",
      procedureName: "SharedLib.Helper",
    });

    expect(result.ok).toBe(true);
    expect(invokedProcedureName(runner)).toBe("SharedLib.Helper");
  });

  it("forwards the name verbatim when no source resolver is wired", async () => {
    const runner = new CapturingRunner(okResult());
    const service = new AccessVbaService({ runner, config });

    await service.execute({ moduleName: "MyModule", procedureName: "MyModule.RunMe" });

    expect(invokedProcedureName(runner)).toBe("MyModule.RunMe");
  });

  it("leaves an unqualified procedure name untouched", async () => {
    const runner = new CapturingRunner(okResult());
    const service = new AccessVbaService({
      runner,
      config,
      sourceResolver: resolverWithModule,
    });

    await service.execute({ moduleName: "MyModule", procedureName: "RunMe" });

    expect(invokedProcedureName(runner)).toBe("RunMe");
  });

  it("keeps the caller's original name in the failure envelope and reports the invoked name", async () => {
    const runner = new CapturingRunner(notCallableResult());
    const service = new AccessVbaService({
      runner,
      config,
      sourceResolver: resolverWithModule,
    });

    const result = await service.execute({
      moduleName: "MyModule",
      procedureName: "MyModule.RunMe",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure envelope");
    expect(result.error.code).toBe("PROCEDURE_NOT_CALLABLE");
    expect(result.error.message).toContain("MyModule.RunMe");
    expect(result.error.details).toMatchObject({
      procedure: "MyModule.RunMe",
      invokedProcedureName: "RunMe",
    });
  });

  it("blames the module qualifier, not stale p-code, when the name was still qualified on the wire", async () => {
    const runner = new CapturingRunner(notCallableResult());
    // No resolver: the service cannot prove the qualifier is a local module,
    // so it forwards `MyModule.RunMe` — and Access cannot resolve it.
    const service = new AccessVbaService({ runner, config });

    const result = await service.execute({
      moduleName: "MyModule",
      procedureName: "MyModule.RunMe",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure envelope");
    expect(result.error.code).toBe("PROCEDURE_NOT_CALLABLE");
    expect(result.error.message).toContain("'RunMe'");
    expect(result.error.remediation).toContain("RunMe");
    // The recompile advice survives as the SECONDARY suspect, not the first.
    expect(result.error.remediation).toMatch(/recompile/i);
  });

  it("keeps the stale-p-code wording when the invoked name was already unqualified", async () => {
    const runner = new CapturingRunner(notCallableResult());
    const service = new AccessVbaService({
      runner,
      config,
      sourceResolver: resolverWithModule,
    });

    const result = await service.execute({
      moduleName: "MyModule",
      procedureName: "MyModule.RunMe",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a failure envelope");
    // The prefix was stripped, so qualification is ruled out and the
    // p-code remediation is the correct one again.
    expect(result.error.remediation).toMatch(/Recompile in Access VBE/i);
    expect(result.error.remediation).not.toMatch(/qualif/i);
  });

  it("keeps the dry-run plan echoing the caller's original qualified name", async () => {
    const runner = new CapturingRunner(okResult());
    const service = new AccessVbaService({
      runner,
      config,
      sourceResolver: resolverWithModule,
    });

    const result = await service.execute({
      moduleName: "MyModule",
      procedureName: "MyModule.RunMe",
      dryRun: true,
    } as AccessVbaRequest);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected a plan");
    expect(result.data).toMatchObject({
      dryRun: true,
      procedureName: "MyModule.RunMe",
      moduleName: "MyModule",
    });
  });
});
