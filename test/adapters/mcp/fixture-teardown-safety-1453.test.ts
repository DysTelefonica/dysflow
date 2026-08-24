import { describe, expect, it } from "vitest";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools.js";
import type { DysflowConfig } from "../../../src/core/config/dysflow-config.js";
import { successResult } from "../../../src/core/contracts/index.js";
import type { AccessRunner } from "../../../src/core/runner/access-runner.js";
import { AccessQueryService } from "../../../src/core/services/query-service.js";

function fixture() {
  const requests: unknown[] = [];
  const execute = async (request: unknown) => {
    requests.push(request);
    return successResult({ affectedRows: 1 });
  };
  const tools = createDysflowMcpTools({
    services: {
      vbaService: { execute },
      queryService: { execute },
      diagnosticsService: { run: execute },
      vbaSyncToolService: { execute },
    } as unknown as DysflowMcpServices,
    writes: true,
  });
  const tool = tools.find((candidate) => candidate.name === "teardown_fixture");
  if (tool === undefined) throw new Error("teardown_fixture is not registered");
  return { requests, tool };
}

describe("#1453 teardown_fixture MCP contract", () => {
  it("rejects an unbounded apply call before dispatching to the query service", async () => {
    const { requests, tool } = fixture();

    const result = await tool.handler({ tableName: "FixtureRows", apply: true });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("MCP_INPUT_INVALID");
    expect(result.error?.message).toMatch(/predicate is required/i);
    expect(requests).toEqual([]);
  });

  it("dispatches Access-compatible identifier fields", async () => {
    const { requests, tool } = fixture();

    const result = await tool.handler({
      tableName: "2026 Fixture-Rows",
      predicate: { column: "Test Id", min: 900_000, max: 900_010 },
      apply: true,
      implements_check: "teardown_fixture_precheck",
      confirmedRequiresConfirmation: true,
    });

    expect(result.ok).toBe(true);
    expect(requests).toEqual([
      expect.objectContaining({
        tableName: "2026 Fixture-Rows",
        predicate: { column: "Test Id", min: 900_000, max: 900_010 },
      }),
    ]);
  });

  it("rejects a range below TEST_ID_BASE before dispatch", async () => {
    const { requests, tool } = fixture();

    const result = await tool.handler({
      tableName: "FixtureRows",
      predicate: { column: "TestId", min: 0, max: 900_010 },
      apply: true,
    });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("MCP_INPUT_INVALID");
    expect(result.error?.message).toMatch(/predicate\.min must be at least 900000/i);
    expect(requests).toEqual([]);
  });

  it("dispatches the exact structured predicate while preserving allow/deny gates", async () => {
    const { requests, tool } = fixture();
    const predicate = { column: "TestId", min: 900_000, max: 900_010 };

    const result = await tool.handler({
      tableName: "FixtureRows",
      predicate,
      allowTables: ["FixtureRows"],
      denyTables: ["ProductionRows"],
      apply: true,
      implements_check: "teardown_fixture_precheck",
      confirmedRequiresConfirmation: true,
    });

    expect(result.ok).toBe(true);
    expect(requests).toEqual([
      expect.objectContaining({
        action: "teardown_fixture",
        predicate,
        allowTables: ["FixtureRows"],
        denyTables: ["ProductionRows"],
        dryRun: false,
      }),
    ]);
  });

  it("returns the exact bounded SQL through the MCP preview without spawning Access", async () => {
    const runner: AccessRunner = {
      async run() {
        throw new Error("bounded teardown preview must not spawn Access");
      },
      async runProbe() {
        throw new Error("bounded teardown preview must not probe Access");
      },
    };
    const config: DysflowConfig = {
      configSource: "explicit-request",
      allowWrites: true,
      accessDbPath: "C:/sandbox/frontend.accdb",
      timeoutMs: 30_000,
    };
    const execute = async () => successResult({});
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute },
        queryService: new AccessQueryService({ runner, config }),
        diagnosticsService: { run: execute },
        vbaSyncToolService: { execute },
      } as unknown as DysflowMcpServices,
      writes: false,
    });
    const tool = tools.find((candidate) => candidate.name === "teardown_fixture");
    if (tool === undefined) throw new Error("teardown_fixture is not registered");

    const result = await tool.handler({
      tableName: "2026 Fixture-Rows",
      predicate: { column: "Test Id", min: 900_000, max: 900_010 },
      apply: false,
    });

    expect(result.ok).toBe(true);
    const payload = JSON.parse(result.content[0]?.text ?? "{}") as Record<string, unknown>;
    expect(payload).toMatchObject({
      dryRun: true,
      willExecute: false,
      willModifyAccess: false,
      sql: "DELETE FROM [2026 Fixture-Rows] WHERE [Test Id] BETWEEN 900000 AND 900010",
      plan: {
        tableName: "2026 Fixture-Rows",
        predicate: { column: "Test Id", min: 900_000, max: 900_010 },
        sql: "DELETE FROM [2026 Fixture-Rows] WHERE [Test Id] BETWEEN 900000 AND 900010",
      },
    });
  });
});
