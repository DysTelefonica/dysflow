/**
 * #1681 — RED tests for the `run_vba` failure reclassifier.
 *
 * The defect: `run_vba` with `apply:true` reported `PROCEDURE_NOT_CALLABLE`
 * ("the binary's p-code is stale — recompile in Access VBE") for a procedure
 * that was perfectly callable and that had actually executed. The reporter
 * recompiled three times, closed and reopened Access each time, and the code
 * never changed — because recompiling cannot fix a procedure that runs and
 * then raises its own error.
 *
 * Why it happened: the VBA dispatch in `scripts/dysflow-access-runner.ps1`
 * calls `$access.Run.Invoke($runArgs)` without a `try`/`catch`. A VBA
 * `Err.Raise` inside the invoked procedure therefore escapes to the script's
 * global catch, which writes the PowerShell method-invocation wrapper to
 * stderr and exits 1:
 *
 *   Excepción al llamar a "Run" con "1" argumento(s): "<the real VBA error>"
 *
 * `CALLABLE_FAILURE_PATTERNS` matched that OUTER wrapper, which is present on
 * every exception the procedure can throw. The reclassifier therefore could
 * not distinguish "Access COM refused to invoke the procedure" from "the
 * procedure ran and raised", and reported the former for both.
 *
 * The contract these tests pin:
 *
 *   - The discriminator is the INNER Access message, never the PowerShell
 *     wrapper. Only Access's own "cannot invoke this procedure" messages
 *     produce `PROCEDURE_NOT_CALLABLE`.
 *   - A procedure that ran and raised produces `VBA_RUNTIME_ERROR`, carrying
 *     the VBA error text the procedure itself emitted.
 *   - The three `#1174` branches keep their behavior.
 */

import { describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { AccessVbaRequest, OperationResult } from "../../../src/core/contracts/index.js";
import type { AccessRunner } from "../../../src/core/runner/access-runner.js";
import { AccessVbaService } from "../../../src/core/services/vba-service.js";

const config: DysflowConfig = {
  configSource: "explicit-request",
  allowWrites: true,
  accessDbPath: "C:/data/proj.accdb",
  timeoutMs: 30_000,
};

const REQUEST: AccessVbaRequest = {
  moduleName: "Test_ControlPanel",
  procedureName: "Test_ControlPanel.SeedControlPanelFixturePublic",
};

class StubRunner implements AccessRunner {
  constructor(private readonly nextResult: OperationResult<unknown>) {}

  async run<TData>(): Promise<OperationResult<TData>> {
    return this.nextResult as OperationResult<TData>;
  }

  async runProbe<TData>(): Promise<OperationResult<TData>> {
    throw new Error("StubRunner.runProbe: not used by these tests");
  }
}

function runnerFailure(message: string, code = "RUNNER_FAILED"): OperationResult<unknown> {
  return {
    ok: false,
    error: { code, message, retryable: false },
    diagnostics: [],
    durationMs: 5,
  };
}

/** The exact stderr shape the runner produces for a raising procedure. */
function raisedInVba(vbaMessage: string): OperationResult<unknown> {
  return runnerFailure(
    `PowerShell runner failed with exit code 1: Excepción al llamar a "Run" ` +
      `con "1" argumento(s): "${vbaMessage}"`,
  );
}

async function execute(runnerResult: OperationResult<unknown>) {
  const service = new AccessVbaService({ runner: new StubRunner(runnerResult), config });
  const result = await service.execute(REQUEST);
  if (result.ok) throw new Error("expected a failure result");
  return result;
}

describe("#1681 — a procedure that ran and raised is not 'not callable'", () => {
  it("reports VBA_RUNTIME_ERROR, not PROCEDURE_NOT_CALLABLE, for an Err.Raise from the procedure", async () => {
    const result = await execute(
      raisedInVba("SeedControlPanelFixturePublic: getdb: backend de sandbox no disponible"),
    );

    expect(result.error.code).toBe("VBA_RUNTIME_ERROR");
    expect(result.error.code).not.toBe("PROCEDURE_NOT_CALLABLE");
  });

  it("surfaces the VBA error text the procedure raised instead of a recompile instruction", async () => {
    const result = await execute(
      raisedInVba("SeedControlPanelFixturePublic: esperado 81 filas en rango CP, obtuve 0"),
    );

    expect(result.error.message).toContain("esperado 81 filas en rango CP, obtuve 0");
    expect(result.error.message).not.toMatch(/recompile/i);
    expect(result.error.details).toMatchObject({
      procedure: "Test_ControlPanel.SeedControlPanelFixturePublic",
      moduleName: "Test_ControlPanel",
      vbaMessage: "SeedControlPanelFixturePublic: esperado 81 filas en rango CP, obtuve 0",
    });
  });

  it("does not advertise the failure as retryable — re-running repeats the same raise", async () => {
    const result = await execute(raisedInVba("Error 3021: no hay registro actual"));

    expect(result.error.retryable).toBe(false);
    expect(result.error.remediation).not.toMatch(/recompile/i);
  });

  it("unwraps the English-locale PowerShell wrapper the same way", async () => {
    const result = await execute(
      runnerFailure(
        'PowerShell runner failed with exit code 1: Exception calling "Run" ' +
          'with "1" argument(s): "Seed failed: expected 81 rows, got 0"',
      ),
    );

    expect(result.error.code).toBe("VBA_RUNTIME_ERROR");
    expect(result.error.message).toContain("Seed failed: expected 81 rows, got 0");
  });

  it("keeps the whole runner message when the wrapper carries no quoted inner text", async () => {
    const result = await execute(
      runnerFailure('PowerShell runner failed with exit code 1: Excepción al llamar a "Run".'),
    );

    expect(result.error.code).toBe("VBA_RUNTIME_ERROR");
    expect(result.error.details).toMatchObject({ runnerCode: "RUNNER_FAILED" });
  });
});

describe("#1681 — PROCEDURE_NOT_CALLABLE still fires for genuinely non-callable procedures", () => {
  it("classifies the Spanish 'objeto cerrado o que no existe' inner message (#1174 branch 1)", async () => {
    const result = await execute(
      raisedInVba(
        "La expresión que ha especificado se refiere a un objeto que está cerrado o que no existe.",
      ),
    );

    expect(result.error.code).toBe("PROCEDURE_NOT_CALLABLE");
    expect(result.error.message).toContain("Test_ControlPanel.SeedControlPanelFixturePublic");
    expect(result.error.message).toMatch(/recompile/i);
    expect(result.error.retryable).toBe(true);
  });

  it("classifies the English 'Cannot run the macro' message (#1174 branch 2)", async () => {
    const result = await execute(
      runnerFailure(
        "Cannot run the macro 'Test_ControlPanel.SeedControlPanelFixturePublic'. " +
          "The macro may not be available.",
      ),
    );

    expect(result.error.code).toBe("PROCEDURE_NOT_CALLABLE");
  });

  it("classifies the Spanish 'no se puede ejecutar la macro' message", async () => {
    const result = await execute(
      raisedInVba(
        "No se puede ejecutar la macro o la función de devolución de llamada " +
          "'Test_ControlPanel.SeedControlPanelFixturePublic'.",
      ),
    );

    expect(result.error.code).toBe("PROCEDURE_NOT_CALLABLE");
  });

  it("classifies the Spanish 'no encuentra el procedimiento' message", async () => {
    const result = await execute(
      raisedInVba(
        "Microsoft Access no encuentra el procedimiento 'SeedControlPanelFixturePublic'.",
      ),
    );

    expect(result.error.code).toBe("PROCEDURE_NOT_CALLABLE");
  });

  it('classifies the English "can\'t find the procedure" message', async () => {
    const result = await execute(
      runnerFailure("Microsoft Access can't find the procedure 'SeedControlPanelFixturePublic'."),
    );

    expect(result.error.code).toBe("PROCEDURE_NOT_CALLABLE");
  });
});

describe("#1681 — unrelated failures keep propagating verbatim (#1174 branch 3)", () => {
  it("leaves a runner failure with no Access invocation wrapper untouched", async () => {
    const result = await execute(
      runnerFailure("PowerShell runner failed with exit code 1: catalog not initialized"),
    );

    expect(result.error.code).toBe("RUNNER_FAILED");
    expect(result.error.message).toContain("catalog not initialized");
  });

  it("leaves a typed non-runner failure untouched", async () => {
    const result = await execute(
      runnerFailure("Access operation timed out after 30000ms.", "RUNNER_TIMEOUT"),
    );

    expect(result.error.code).toBe("RUNNER_TIMEOUT");
  });
});

describe("#1681 — the plan path is unaffected", () => {
  it("returns the plan shape for apply:false without consulting the runner", async () => {
    const service = new AccessVbaService({
      runner: new StubRunner(raisedInVba("must never be reached on the plan path")),
      config,
    });

    const result = await service.execute({ ...REQUEST, dryRun: true });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected the plan shape");
    expect(result.data).toMatchObject({
      dryRun: true,
      willExecute: false,
      willModifyAccess: false,
      moduleName: "Test_ControlPanel",
      procedureName: "Test_ControlPanel.SeedControlPanelFixturePublic",
    });
  });
});
