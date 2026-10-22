/**
 * #1823 — `run_vba` and `test_vba` share one not-callable diagnosis. When the
 * procedure is declared in a module carrying the SAME name, Access resolves the
 * name to the module and `Application.Run` cannot invoke the procedure; the
 * envelope must say so instead of sending the caller into a recompile loop.
 */

import { describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { OperationResult } from "../../../src/core/contracts/index.js";
import type { AccessRunner } from "../../../src/core/runner/access-runner.js";
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

const notFound = (name: string): OperationResult<unknown> => ({
  ok: false,
  error: {
    code: "RUNNER_FAILED",
    message:
      `PowerShell runner failed with exit code 1: Excepción al llamar a "Run" con los argumentos "1": ` +
      `"No Conformidades no encuentra el procedimiento '${name}'."`,
    retryable: false,
  },
  diagnostics: [],
  durationMs: 5,
});

const runnerReturning = (result: OperationResult<unknown>): AccessRunner => ({
  async run<TData>() {
    return result as OperationResult<TData>;
  },
  async runProbe<TData>(): Promise<OperationResult<TData>> {
    throw new Error("not used");
  },
});

const resolverFor = (modules: Record<string, string>): VbaSourceResolver => ({
  async resolveModuleSource(moduleName) {
    return modules[moduleName];
  },
  async resolveAllModuleSources() {
    return modules;
  },
});

const declaring = (moduleName: string, proc: string) =>
  [`Attribute VB_Name = "${moduleName}"`, `Public Function ${proc}()`, "End Function"].join("\n");

describe("#1823 — run_vba names a module/procedure name collision", () => {
  it("asks for a rename, not a recompile, when the procedure shares its module's name", async () => {
    const service = new AccessVbaService({
      runner: runnerReturning(notFound("Test_Backfill")),
      config,
      sourceResolver: resolverFor({ Test_Backfill: declaring("Test_Backfill", "Test_Backfill") }),
    });

    const result = await service.execute({ moduleName: "", procedureName: "Test_Backfill" });

    if (result.ok) throw new Error("expected PROCEDURE_NOT_CALLABLE");
    expect(result.error.code).toBe("PROCEDURE_NOT_CALLABLE");
    expect(result.error.retryable).toBe(false);
    expect(result.error.remediation).toMatch(/rename/i);
    expect(result.error.remediation).not.toMatch(/recompile/i);
    expect(result.error.message).not.toMatch(/recompile/i);
  });

  it("keeps the stale p-code remediation when the module name differs", async () => {
    const service = new AccessVbaService({
      runner: runnerReturning(notFound("Test_Backfill")),
      config,
      sourceResolver: resolverFor({ Suite: declaring("Suite", "Test_Backfill") }),
    });

    const result = await service.execute({ moduleName: "", procedureName: "Test_Backfill" });

    if (result.ok) throw new Error("expected PROCEDURE_NOT_CALLABLE");
    expect(result.error.code).toBe("PROCEDURE_NOT_CALLABLE");
    expect(result.error.retryable).toBe(true);
    expect(result.error.remediation).toBe("Recompile in Access VBE (Debug → Compile) and retry.");
  });
});
