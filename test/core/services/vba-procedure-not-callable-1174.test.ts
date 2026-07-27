/**
 * #1174 — RED tests for the `PROCEDURE_NOT_CALLABLE` reclassifier. Pins the
 * contract that a runner failure whose underlying Access COM error matches
 * the "in binary but not callable" pattern is reclassified into the typed
 * envelope instead of propagating as a generic `RUNNER_FAILED`.
 *
 * Why this matters: the issue calls out that agents cannot tell the three
 * procedure-not-callable states apart:
 *
 *   - `MCP_PROCEDURE_NOT_ALLOWED` — allowlist gate (gate layer).
 *   - `PROCEDURE_NOT_FOUND` — procedure not in source/binary (preflight).
 *   - `PROCEDURE_NOT_CALLABLE` — procedure in binary but Access COM cannot
 *     invoke it. Remediation: "Recompile in Access VBE then retry."
 *
 * Until #1174, all COM-side failures bubbled up as `RUNNER_FAILED` and the
 * agent could only guess at the cause. These tests pin the three
 * discriminated branches (Spanish pattern, English pattern, non-matching)
 * so the reclassifier never false-positives a genuine runner failure.
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
  moduleName: "MyModule",
  procedureName: "MyModule.RunMe",
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

function runnerResult(message: string, code = "RUNNER_FAILED"): OperationResult<unknown> {
  return {
    ok: false,
    error: { code, message, retryable: false },
    diagnostics: [],
    durationMs: 5,
  };
}

describe("#1174 — PROCEDURE_NOT_CALLABLE reclassifier", () => {
  it("reclassifies Spanish-localized Access COM 'Excepción al llamar a Run' into PROCEDURE_NOT_CALLABLE", async () => {
    const runner = new StubRunner(
      runnerResult(
        'PowerShell runner failed: Excepción al llamar a "Run" con los argumentos "9": ' +
          '"La expresión que ha especificado se refiere a un objeto que está cerrado o que no existe."',
      ),
    );
    const service = new AccessVbaService({ runner, config });

    const result = await service.execute(REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected reclassified failure");
    expect(result.error.code).toBe("PROCEDURE_NOT_CALLABLE");
    expect(result.error.message).toContain("MyModule.RunMe");
    expect(result.error.message).toContain("recompile");
    expect(result.error.details).toMatchObject({
      procedure: "MyModule.RunMe",
      moduleName: "MyModule",
      runnerCode: "RUNNER_FAILED",
    });
    expect(result.error.retryable).toBe(true);
  });

  it("reclassifies English 'Cannot run the macro' into PROCEDURE_NOT_CALLABLE", async () => {
    const runner = new StubRunner(
      runnerResult("Cannot run the macro 'MyModule.RunMe'. The macro may not be available."),
    );
    const service = new AccessVbaService({ runner, config });

    const result = await service.execute(REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected reclassified failure");
    expect(result.error.code).toBe("PROCEDURE_NOT_CALLABLE");
  });

  it("does NOT reclassify an unrelated RUNNER_FAILED (preserves the generic envelope)", async () => {
    const runner = new StubRunner(
      runnerResult(
        "PowerShell runner failed with exit code 1: catalog not initialized for project",
      ),
    );
    const service = new AccessVbaService({ runner, config });

    const result = await service.execute(REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected runner failure to propagate");
    expect(result.error.code).toBe("RUNNER_FAILED");
    expect(result.error.message).toContain("catalog not initialized");
  });

  it("does NOT reclassify a successful runner result", async () => {
    const runner = new StubRunner({
      ok: true,
      data: { returnValue: "ok" },
      diagnostics: [],
      durationMs: 1,
    });
    const service = new AccessVbaService({ runner, config });

    const result = await service.execute(REQUEST);

    expect(result.ok).toBe(true);
  });

  it("does NOT reclassify a non-RUNNER_FAILED code (e.g. VBA_MANAGER_TIMEOUT)", async () => {
    const runner = new StubRunner(
      runnerResult(
        "Runner exceeded its timeout while waiting for the COM lifecycle",
        "VBA_MANAGER_TIMEOUT",
      ),
    );
    const service = new AccessVbaService({ runner, config });

    const result = await service.execute(REQUEST);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected timeout to propagate");
    expect(result.error.code).toBe("VBA_MANAGER_TIMEOUT");
  });
});
