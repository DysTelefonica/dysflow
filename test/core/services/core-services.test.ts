import { describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import {
  failureResult,
  type OperationResult,
  successResult,
} from "../../../src/core/contracts/index.js";
import type {
  AccessRunner,
  AccessRunnerOperation,
} from "../../../src/core/runner/access-runner.js";
import { AccessDiagnosticsService } from "../../../src/core/services/diagnostics-service.js";
import { AccessQueryService } from "../../../src/core/services/query-service.js";
import { AccessVbaService } from "../../../src/core/services/vba-service.js";

// ---------------------------------------------------------------------------
// Shape validation — RED tests (must fail before Phase 3 wires the guards)
// ---------------------------------------------------------------------------

describe("runner output shape validation", () => {
  describe("DiagnosticsService", () => {
    it("rejects runner output that is not a record (returns RUNNER_INVALID_OUTPUT)", async () => {
      const runner = new FakeRunner(successResult(42 as unknown));
      const service = new AccessDiagnosticsService({ runner, config });

      const result = await service.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("RUNNER_INVALID_OUTPUT");
    });

    it("rejects record with non-array checks field (returns RUNNER_INVALID_OUTPUT)", async () => {
      const runner = new FakeRunner(successResult({ checks: "nope" } as unknown));
      const service = new AccessDiagnosticsService({ runner, config });

      const result = await service.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("RUNNER_INVALID_OUTPUT");
    });

    it("accepts empty record {} as valid (empty stdout case)", async () => {
      const runner = new FakeRunner(successResult({} as unknown, { durationMs: 1 }));
      const service = new AccessDiagnosticsService({ runner, config });

      const result = await service.run({});

      expect(result.ok).toBe(true);
    });

    it("passes through a runner failure (RUNNER_TIMEOUT) without extra wrapping", async () => {
      const runner = new FakeRunner(
        failureResult({ code: "RUNNER_TIMEOUT", message: "timed out", retryable: true }),
      );
      const service = new AccessDiagnosticsService({ runner, config });

      const result = await service.run({});

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("RUNNER_TIMEOUT");
    });
  });

  describe("QueryService", () => {
    it("rejects non-object runner output (null) with RUNNER_INVALID_OUTPUT", async () => {
      const runner = new FakeRunner(successResult(null as unknown));
      const service = new AccessQueryService({ runner, config });

      const result = await service.execute({ sql: "SELECT 1", mode: "read" });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("RUNNER_INVALID_OUTPUT");
    });

    it("accepts valid record output", async () => {
      const runner = new FakeRunner(successResult({ rows: [] } as unknown, { durationMs: 2 }));
      const service = new AccessQueryService({ runner, config });

      const result = await service.execute({ sql: "SELECT 1", mode: "read" });

      expect(result.ok).toBe(true);
    });
  });

  describe("VbaService", () => {
    it("rejects non-object runner output (string) with RUNNER_INVALID_OUTPUT", async () => {
      const runner = new FakeRunner(successResult("string-result" as unknown));
      const service = new AccessVbaService({ runner, config });

      const result = await service.execute({ moduleName: "M", procedureName: "P" });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.code).toBe("RUNNER_INVALID_OUTPUT");
    });

    it("accepts valid record output", async () => {
      const runner = new FakeRunner(
        successResult({ returnValue: 0 } as unknown, { durationMs: 3 }),
      );
      const service = new AccessVbaService({ runner, config });

      const result = await service.execute({ moduleName: "M", procedureName: "P" });

      expect(result.ok).toBe(true);
    });
  });
});

const config = {
  configSource: "explicit-request",
  allowWrites: false,
  accessDbPath: "C:/data/app.accdb",
  timeoutMs: 2_000,
} satisfies DysflowConfig;

class FakeRunner implements AccessRunner {
  public operations: AccessRunnerOperation[] = [];

  constructor(private readonly nextResult: OperationResult<unknown>) {}

  async run<TData>(operation: AccessRunnerOperation): Promise<OperationResult<TData>> {
    this.operations.push(operation);
    return this.nextResult as OperationResult<TData>;
  }

  // v1.20.0 (#763 + #764) — cross-DB table lookup seam. Not exercised by
  // the shape-validation tests in this file; the dedicated lookup tests
  // (`test/core/runtime/cross-db-table-lookup.test.ts`) cover the seam.
  async runProbe<TData>(
    _request: import("../../../src/core/contracts/index.js").AccessQueryRequest,
    _config: DysflowConfig,
  ): Promise<OperationResult<TData>> {
    throw new Error("FakeRunner.runProbe: not implemented for these shape-validation tests");
  }
}

describe("core services over AccessRunner", () => {
  it("executes VBA requests through the runner and returns protocol-neutral data", async () => {
    const runner = new FakeRunner(successResult({ returnValue: "done" }, { durationMs: 9 }));
    const service = new AccessVbaService({ runner, config });

    const result = await service.execute({
      moduleName: "Automation",
      procedureName: "Refresh",
      arguments: [2026],
    });

    expect(runner.operations).toEqual([
      {
        kind: "vba",
        request: { moduleName: "Automation", procedureName: "Refresh", arguments: [2026] },
      },
    ]);
    expect(result).toEqual({
      ok: true,
      data: { returnValue: "done" },
      diagnostics: [],
      durationMs: 9,
    });
  });

  it("returns runner timeout failures from VBA service without adapter translation", async () => {
    const runner = new FakeRunner(
      failureResult({
        code: "RUNNER_TIMEOUT",
        message: "Access operation timed out after 2000ms.",
        retryable: true,
      }),
    );
    const service = new AccessVbaService({ runner, config });

    const result = await service.execute({ moduleName: "Automation", procedureName: "Slow" });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "RUNNER_TIMEOUT",
        message: "Access operation timed out after 2000ms.",
        retryable: true,
      },
      diagnostics: [],
      durationMs: 0,
    });
  });

  it("executes read queries through the runner", async () => {
    const runner = new FakeRunner(
      successResult({ rows: [{ id: 1, name: "Ada" }] }, { durationMs: 5 }),
    );
    const service = new AccessQueryService({ runner, config });

    const result = await service.execute({ sql: "SELECT id, name FROM People", mode: "read" });

    expect(runner.operations).toEqual([
      { kind: "query", request: { sql: "SELECT id, name FROM People", mode: "read" } },
    ]);
    expect(result).toEqual({
      ok: true,
      data: { rows: [{ id: 1, name: "Ada" }] },
      diagnostics: [],
      durationMs: 5,
    });
  });

  it("executes diagnostics through the runner with environment checks requested", async () => {
    const runner = new FakeRunner(
      successResult(
        { checks: [{ name: "access-db-path", ok: true, message: "configured" }] },
        { durationMs: 3 },
      ),
    );
    const service = new AccessDiagnosticsService({ runner, config });

    const result = await service.run({ includeEnvironment: true });

    expect(runner.operations).toEqual([
      { kind: "diagnostics", request: { includeEnvironment: true } },
    ]);
    expect(result).toEqual({
      ok: true,
      data: { checks: [{ name: "access-db-path", ok: true, message: "configured" }] },
      diagnostics: [],
      durationMs: 3,
    });
  });
});
