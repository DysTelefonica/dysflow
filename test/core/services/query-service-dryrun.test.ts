import { describe, expect, it } from "vitest";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import type { OperationResult } from "../../../src/core/contracts/index.js";
import { buildWriteFixtureRequest } from "../../../src/core/mapping/access-query-request-mapper.js";
import type {
  AccessRunner,
  AccessRunnerOperation,
} from "../../../src/core/runner/access-runner.js";
import { AccessQueryService } from "../../../src/core/services/query-service.js";

const config: DysflowConfig = {
  configSource: "explicit-request",
  allowWrites: true,
  accessDbPath: "C:/data/test.accdb",
  timeoutMs: 1_500,
};

class CapturingRunner implements AccessRunner {
  public operations: AccessRunnerOperation[] = [];

  async run<TData>(operation: AccessRunnerOperation): Promise<OperationResult<TData>> {
    this.operations.push(operation);
    return {
      ok: true,
      data: { affectedRows: 1 } as TData,
      diagnostics: [],
      durationMs: 0,
    };
  }

  async runProbe<TData>(): Promise<OperationResult<TData>> {
    throw new Error("CapturingRunner.runProbe: not exercised by query execution tests");
  }
}

describe("AccessQueryService — write plan intent", () => {
  it("returns explicit plan evidence without invoking the runner when apply is omitted", async () => {
    const runner = new CapturingRunner();
    const service = new AccessQueryService({ runner, config });
    const request = buildWriteFixtureRequest("exec_sql", {
      sql: "UPDATE test SET x = 1",
    });

    const result = await service.execute(request);

    expect(runner.operations).toEqual([]);
    expect(result).toMatchObject({
      ok: true,
      data: {
        dryRun: true,
        willExecute: false,
        willModifyAccess: false,
        action: "exec_sql",
        mode: "write",
        sql: "UPDATE test SET x = 1",
      },
    });
  });

  it("returns the same safe plan when dryRun:true is explicit", async () => {
    const runner = new CapturingRunner();
    const service = new AccessQueryService({ runner, config });
    const request = buildWriteFixtureRequest("exec_sql", {
      sql: "DELETE FROM test",
      dryRun: true,
    });

    const result = await service.execute(request);

    expect(runner.operations).toEqual([]);
    expect(result).toMatchObject({
      ok: true,
      data: { dryRun: true, willExecute: false, willModifyAccess: false },
    });
  });

  it("invokes the runner when apply:true explicitly commits the write", async () => {
    const runner = new CapturingRunner();
    const service = new AccessQueryService({ runner, config });
    const request = buildWriteFixtureRequest("exec_sql", {
      sql: "UPDATE test SET x = 1",
      apply: true,
    });

    const result = await service.execute(request);

    expect(request.dryRun).toBe(false);
    expect(runner.operations).toEqual([{ kind: "query", request }]);
    expect(result).toMatchObject({ ok: true, data: { affectedRows: 1 } });
  });
});
