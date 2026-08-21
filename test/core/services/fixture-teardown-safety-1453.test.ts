import { describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { AccessQueryRequest, OperationResult } from "../../../src/core/contracts/index.js";
import { buildWriteFixtureRequest } from "../../../src/core/mapping/access-query-request-mapper.js";
import type {
  AccessRunner,
  AccessRunnerOperation,
} from "../../../src/core/runner/access-runner.js";
import { AccessQueryService } from "../../../src/core/services/query-service.js";

const config: DysflowConfig = {
  configSource: "explicit-request",
  allowWrites: true,
  accessDbPath: "C:/sandbox/frontend.accdb",
  timeoutMs: 30_000,
};

class RecordingRunner implements AccessRunner {
  public operations: AccessRunnerOperation[] = [];

  async run<TData>(operation: AccessRunnerOperation): Promise<OperationResult<TData>> {
    this.operations.push(operation);
    return {
      ok: true,
      data: { affectedRows: 3 } as TData,
      diagnostics: [],
      durationMs: 1,
    };
  }

  async runProbe<TData>(): Promise<OperationResult<TData>> {
    throw new Error("RecordingRunner.runProbe: not used by fixture teardown tests");
  }
}

function teardownRequest(overrides: Partial<AccessQueryRequest> = {}): AccessQueryRequest {
  return {
    action: "teardown_fixture",
    mode: "write",
    sql: "",
    tableName: "FixtureRows",
    ...overrides,
  };
}

describe("#1453 bounded fixture teardown", () => {
  it("rejects apply without a structured predicate before spawning the Access runner", async () => {
    const runner = new RecordingRunner();
    const service = new AccessQueryService({ runner, config });

    const result = await service.execute(teardownRequest({ dryRun: false }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unbounded teardown must fail");
    expect(result.error.code).toBe("FIXTURE_TEARDOWN_UNBOUNDED");
    expect(runner.operations).toEqual([]);
  });

  it.each([
    [{ column: "bad-column", min: 900_000, max: 900_010 }, "column"],
    [{ column: "TestId", min: 0, max: 900_010 }, "900000"],
    [{ column: "TestId", min: 900_010, max: 900_000 }, "range"],
    [{ column: "TestId", min: 900_000.5, max: 900_010 }, "integer"],
  ])("rejects an invalid predicate (%s) before spawning Access", async (predicate, message) => {
    const runner = new RecordingRunner();
    const service = new AccessQueryService({ runner, config });

    const result = await service.execute(teardownRequest({ predicate, dryRun: false }));

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("invalid teardown predicate must fail");
    expect(result.error.code).toBe("FIXTURE_TEARDOWN_PREDICATE_INVALID");
    expect(result.error.message).toMatch(new RegExp(message, "i"));
    expect(runner.operations).toEqual([]);
  });

  it("returns the exact bounded DELETE plan without spawning Access", async () => {
    const runner = new RecordingRunner();
    const service = new AccessQueryService({ runner, config });
    const predicate = { column: "TestId", min: 900_000, max: 900_010 } as const;

    const result = await service.execute(teardownRequest({ predicate, dryRun: true }));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("bounded teardown preview must succeed");
    expect(result.data).toMatchObject({
      dryRun: true,
      willExecute: false,
      willModifyAccess: false,
      action: "teardown_fixture",
      sql: "DELETE FROM [FixtureRows] WHERE [TestId] BETWEEN 900000 AND 900010",
      plan: {
        tableName: "FixtureRows",
        predicate,
        sql: "DELETE FROM [FixtureRows] WHERE [TestId] BETWEEN 900000 AND 900010",
      },
    });
    expect(runner.operations).toEqual([]);
  });

  it("forwards a validated bounded predicate on apply", async () => {
    const runner = new RecordingRunner();
    const service = new AccessQueryService({ runner, config });
    const predicate = { column: "TestId", min: 900_000, max: 900_010 } as const;

    const result = await service.execute(teardownRequest({ predicate, dryRun: false }));

    expect(result.ok).toBe(true);
    expect(runner.operations).toEqual([
      expect.objectContaining({
        kind: "query",
        request: expect.objectContaining({ action: "teardown_fixture", predicate }),
      }),
    ]);
  });

  it("maps the structured predicate independently from table allow/deny gates", () => {
    const predicate = { column: "TestId", min: 900_000, max: 900_010 } as const;

    const request = buildWriteFixtureRequest("teardown_fixture", {
      tableName: "FixtureRows",
      predicate,
      allowTables: ["FixtureRows"],
      denyTables: ["ProductionRows"],
      apply: true,
    });

    expect(request).toMatchObject({
      action: "teardown_fixture",
      predicate,
      allowTables: ["FixtureRows"],
      denyTables: ["ProductionRows"],
      dryRun: false,
    });
  });
});
