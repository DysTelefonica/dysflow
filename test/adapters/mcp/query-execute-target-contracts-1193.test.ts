import { describe, expect, it, vi } from "vitest";
import { QUERY_EXECUTE_SCHEMA } from "../../../src/adapters/mcp/schemas/dysflow-schemas.js";
import { QUERY_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/query-schemas.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools.js";
import { type AccessQueryRequest, successResult } from "../../../src/core/contracts/index.js";
import { validateInput } from "../../../src/shared/validation/validator.js";

const TARGET_PARAMETERS = [
  "accessPath",
  "backendPath",
  "databasePath",
  "sourcePath",
  "target",
] as const;

function buildTools(): {
  requests: AccessQueryRequest[];
  tools: ReturnType<typeof createDysflowMcpTools>;
} {
  const requests: AccessQueryRequest[] = [];
  const services = {
    vbaService: { execute: vi.fn() },
    queryService: {
      execute: vi.fn(async (request: AccessQueryRequest) => {
        requests.push(request);
        return successResult({ rows: [] });
      }),
    },
    diagnosticsService: { run: vi.fn() },
  } as unknown as DysflowMcpServices;

  return {
    requests,
    tools: createDysflowMcpTools({ services, writes: true }),
  };
}

describe("query_execute target contract (issue #1193)", () => {
  it("shares query_sql's complete target parameter surface", () => {
    const querySqlProperties = QUERY_TOOL_SCHEMAS.query_sql.properties;
    const queryExecuteProperties = QUERY_EXECUTE_SCHEMA.properties;

    expect(
      Object.keys(queryExecuteProperties).filter((key) => TARGET_PARAMETERS.includes(key as never)),
    ).toEqual(TARGET_PARAMETERS);
    for (const parameter of TARGET_PARAMETERS) {
      expect(queryExecuteProperties[parameter]).toBe(querySqlProperties[parameter]);
    }
  });

  it("accepts the semantic frontend role and forwards it like query_sql", async () => {
    const { requests, tools } = buildTools();
    const queryExecute = tools.find((tool) => tool.name === "query_execute");
    const querySql = tools.find((tool) => tool.name === "query_sql");
    const common = {
      sql: "SELECT 1",
      projectId: "split",
      accessPath: "C:\\db\\frontend.accdb",
      backendPath: "C:\\db\\backend.accdb",
      target: "frontend",
    } as const;

    await queryExecute?.handler({ ...common, mode: "read" });
    await querySql?.handler(common);

    expect(requests).toHaveLength(2);
    expect(requests[0]).toMatchObject({
      accessPath: common.accessPath,
      backendPath: common.backendPath,
      databasePath: common.accessPath,
      target: "frontend",
    });
    expect(requests[0]).toMatchObject({
      accessPath: requests[1]?.accessPath,
      backendPath: requests[1]?.backendPath,
      databasePath: requests[1]?.databasePath,
      target: requests[1]?.target,
    });
  });

  it("gives explicit databasePath precedence over accessPath and target", async () => {
    const { requests, tools } = buildTools();
    const queryExecute = tools.find((tool) => tool.name === "query_execute");
    const querySql = tools.find((tool) => tool.name === "query_sql");
    const common = {
      sql: "SELECT 1",
      projectId: "split",
      accessPath: "C:\\db\\frontend.accdb",
      backendPath: "C:\\db\\backend.accdb",
      databasePath: "C:\\db\\explicit.accdb",
      target: "backend",
    } as const;

    await queryExecute?.handler({ ...common, mode: "read" });
    await querySql?.handler(common);

    expect(requests).toHaveLength(2);
    expect(requests[0]?.databasePath).toBe(common.databasePath);
    expect(requests[0]?.databasePath).toBe(requests[1]?.databasePath);
    expect(requests[0]?.target).toBe(requests[1]?.target);
  });

  it("rejects unsupported target roles before dispatch", async () => {
    const { requests, tools } = buildTools();
    const queryExecute = tools.find((tool) => tool.name === "query_execute");

    expect(
      validateInput(
        { sql: "SELECT 1", mode: "read", projectId: "split", target: "auto" },
        QUERY_EXECUTE_SCHEMA,
      ),
    ).toContain("frontend, backend");
    const result = await queryExecute?.handler({
      sql: "SELECT 1",
      mode: "read",
      projectId: "split",
      target: "auto",
    });
    expect(result?.error?.code).toBe("MCP_INPUT_INVALID");
    expect(requests).toHaveLength(0);
  });
});
