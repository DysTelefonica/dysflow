/**
 * #1940 — `run_vba` argument marshaling failures surface as a typed code.
 *
 * Access's type library declares `Application.Run(Procedure, Arg1..Arg30)` with
 * every `Arg` as `[in,out] VARIANT*`, so PowerShell refuses a plain value with
 * "Argumento: '2' debe ser System.Management.Automation.PSReference. Use [ref]."
 * The runner now passes every argument as a reference; when binding still
 * fails it writes `RUN_ARGUMENT_MARSHALING_FAILED: ...` to stderr and exits 1.
 * The service must hand that to the caller as `RUN_ARGUMENT_MARSHALING_FAILED`,
 * never as `RUNNER_FAILED` and never as a VBA runtime error: the procedure was
 * not reached.
 */

import { describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { AccessVbaRequest, OperationResult } from "../../../src/core/contracts/index.js";
import type { AccessRunner } from "../../../src/core/runner/access-runner.js";
import {
  AccessVbaService,
  classifyVbaRunnerFailure,
} from "../../../src/core/services/vba-service.js";

const config: DysflowConfig = {
  configSource: "explicit-request",
  allowWrites: true,
  accessDbPath: "C:/data/proj.accdb",
  timeoutMs: 30_000,
};

const REQUEST: AccessVbaRequest = {
  moduleName: "",
  procedureName: "BuildReport",
  arguments: ["459", "C:\\dir"],
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

function runnerFailure(stderr: string): OperationResult<unknown> {
  return {
    ok: false,
    error: {
      code: "RUNNER_FAILED",
      message: `PowerShell runner failed with exit code 1: ${stderr}`,
      retryable: false,
    },
    diagnostics: [],
    durationMs: 5,
  };
}

async function execute(stderr: string) {
  const service = new AccessVbaService({ runner: new StubRunner(runnerFailure(stderr)), config });
  const result = await service.execute(REQUEST);
  if (result.ok) throw new Error("expected a failure result");
  return result;
}

const MARSHALING_STDERR =
  "RUN_ARGUMENT_MARSHALING_FAILED: Access.Application.Run could not receive " +
  "argument 2 (no signature metadata) of BuildReport.";

describe("#1940 — run_vba argument marshaling failures", () => {
  it("reports RUN_ARGUMENT_MARSHALING_FAILED with the runner's argument detail", async () => {
    const result = await execute(MARSHALING_STDERR);

    expect(result.error.code).toBe("RUN_ARGUMENT_MARSHALING_FAILED");
    expect(result.error.message).toContain("argument 2");
    expect(result.error.message).toContain("BuildReport");
    expect(result.error.retryable).toBe(false);
    expect(result.error.remediation).not.toMatch(/recompile/i);
    expect(result.error.details).toMatchObject({
      procedure: "BuildReport",
      runnerCode: "RUNNER_FAILED",
    });
  });

  it("classifies a raw PowerShell [ref] binding message the same way", async () => {
    const result = await execute(
      "Argumento: '2' debe ser System.Management.Automation.PSReference. Use [ref].",
    );

    expect(result.error.code).toBe("RUN_ARGUMENT_MARSHALING_FAILED");
  });

  it("does not mistake a wrapped binding failure for a VBA runtime error", async () => {
    const result = await execute(
      'Excepción al llamar a "Run" con los argumentos "3": "Argumento: \'3\' debe ser ' +
        'System.Management.Automation.PSReference. Use [ref]."',
    );

    expect(result.error.code).toBe("RUN_ARGUMENT_MARSHALING_FAILED");
  });

  it("leaves a genuine VBA runtime error classified as VBA_RUNTIME_ERROR", async () => {
    const result = await execute(
      'Excepción al llamar a "Run" con "2" argumento(s): "Error definido por la aplicación"',
    );

    expect(result.error.code).toBe("VBA_RUNTIME_ERROR");
  });

  it("gives test_vba the same classification for a failing procedure's error text", () => {
    expect(classifyVbaRunnerFailure(MARSHALING_STDERR)?.code).toBe(
      "RUN_ARGUMENT_MARSHALING_FAILED",
    );
  });
});
