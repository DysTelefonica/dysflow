import { describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import { failureResult, successResult, type OperationResult } from "../../../src/core/contracts/index.js";
import { AccessDiagnosticsService } from "../../../src/core/services/diagnostics-service.js";
import { AccessQueryService } from "../../../src/core/services/query-service.js";
import { AccessVbaService } from "../../../src/core/services/vba-service.js";
import type { AccessRunner, AccessRunnerOperation } from "../../../src/core/runner/access-runner.js";

const config: DysflowConfig = { accessDbPath: "C:/data/app.accdb", timeoutMs: 2_000 };

class FakeRunner implements AccessRunner {
  public operations: AccessRunnerOperation[] = [];

  constructor(private readonly nextResult: OperationResult<unknown>) {}

  async run<TData>(operation: AccessRunnerOperation): Promise<OperationResult<TData>> {
    this.operations.push(operation);
    return this.nextResult as OperationResult<TData>;
  }
}

describe("core services over AccessRunner", () => {
  it("executes VBA requests through the runner and returns protocol-neutral data", async () => {
    const runner = new FakeRunner(successResult({ returnValue: "done" }, { durationMs: 9 }));
    const service = new AccessVbaService({ runner, config });

    const result = await service.execute({ moduleName: "Automation", procedureName: "Refresh", arguments: [2026] });

    expect(runner.operations).toEqual([
      { kind: "vba", request: { moduleName: "Automation", procedureName: "Refresh", arguments: [2026] } },
    ]);
    expect(result).toEqual({ ok: true, data: { returnValue: "done" }, diagnostics: [], durationMs: 9 });
  });

  it("returns runner timeout failures from VBA service without adapter translation", async () => {
    const runner = new FakeRunner(
      failureResult({ code: "RUNNER_TIMEOUT", message: "Access operation timed out after 2000ms.", retryable: true }),
    );
    const service = new AccessVbaService({ runner, config });

    const result = await service.execute({ moduleName: "Automation", procedureName: "Slow" });

    expect(result).toEqual({
      ok: false,
      error: { code: "RUNNER_TIMEOUT", message: "Access operation timed out after 2000ms.", retryable: true },
      diagnostics: [],
      durationMs: 0,
    });
  });

  it("executes read queries through the runner", async () => {
    const runner = new FakeRunner(successResult({ rows: [{ id: 1, name: "Ada" }] }, { durationMs: 5 }));
    const service = new AccessQueryService({ runner, config });

    const result = await service.execute({ sql: "SELECT id, name FROM People", mode: "read" });

    expect(runner.operations).toEqual([{ kind: "query", request: { sql: "SELECT id, name FROM People", mode: "read" } }]);
    expect(result).toEqual({ ok: true, data: { rows: [{ id: 1, name: "Ada" }] }, diagnostics: [], durationMs: 5 });
  });

  it("executes diagnostics through the runner with environment checks requested", async () => {
    const runner = new FakeRunner(
      successResult({ checks: [{ name: "access-db-path", ok: true, message: "configured" }] }, { durationMs: 3 }),
    );
    const service = new AccessDiagnosticsService({ runner, config });

    const result = await service.run({ includeEnvironment: true });

    expect(runner.operations).toEqual([{ kind: "diagnostics", request: { includeEnvironment: true } }]);
    expect(result).toEqual({
      ok: true,
      data: { checks: [{ name: "access-db-path", ok: true, message: "configured" }] },
      diagnostics: [],
      durationMs: 3,
    });
  });
});
