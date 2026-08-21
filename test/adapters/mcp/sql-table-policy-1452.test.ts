import { describe, expect, it, vi } from "vitest";
import { buildToolSchemaCatalog } from "../../../src/adapters/mcp/schema-tool.js";
import { QUERY_EXECUTE_SCHEMA } from "../../../src/adapters/mcp/schemas/dysflow-schemas.js";
import { QUERY_TOOL_SCHEMAS } from "../../../src/adapters/mcp/schemas/query-schemas.js";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools.js";
import { type AccessQueryRequest, successResult } from "../../../src/core/contracts/index.js";

function buildHarness() {
  const requests: AccessQueryRequest[] = [];
  const services = {
    vbaService: { execute: vi.fn() },
    queryService: {
      execute: vi.fn(async (request: AccessQueryRequest) => {
        requests.push(request);
        return successResult({ dryRun: request.dryRun ?? false, affectedRows: 0 });
      }),
    },
    diagnosticsService: { run: vi.fn() },
  } as unknown as DysflowMcpServices;

  return {
    requests,
    tools: createDysflowMcpTools({ services, writes: true }),
  };
}

const ARBITRARY_SQL_CALLS = [
  ["exec_sql", { sql: "UPDATE People SET active=True", apply: false }],
  ["run_script", { scriptPath: "fixtures.sql", apply: false }],
  ["query_execute", { sql: "UPDATE People SET active=True", mode: "write", apply: false }],
] as const;

describe("arbitrary SQL table policy rejection (#1452)", () => {
  for (const [policyName, policyValue] of [
    ["allowTables", ["People"]],
    ["denyTables", ["Secrets"]],
  ] as const) {
    it.each(
      ARBITRARY_SQL_CALLS,
    )(`%s rejects ${policyName} with actionable MCP_INPUT_INVALID before mapper/service dispatch`, async (toolName, input) => {
      const { requests, tools } = buildHarness();
      const result = await tools
        .find((tool) => tool.name === toolName)
        ?.handler({ ...input, [policyName]: policyValue });

      expect(result).toMatchObject({
        isError: true,
        error: { code: "MCP_INPUT_INVALID", rejectedFlag: policyName },
      });
      expect(result?.error?.remediation).toMatch(
        new RegExp(`omit.*${policyName}.*structured table action`, "i"),
      );
      expect(requests).toEqual([]);
    });
  }

  it("keeps the existing write-gated path when table-policy parameters are omitted", async () => {
    const { requests, tools } = buildHarness();

    for (const [toolName, input] of ARBITRARY_SQL_CALLS) {
      const result = await tools.find((tool) => tool.name === toolName)?.handler(input);
      expect(result?.isError, toolName).toBe(false);
    }

    expect(requests.map((request) => request.action ?? "query_execute")).toEqual([
      "exec_sql",
      "run_script",
      "query_execute",
    ]);
    expect(requests.every((request) => request.dryRun === true)).toBe(true);
  });

  it("removes the unsupported parameters from runtime schemas and full introspection", () => {
    for (const schema of [
      QUERY_TOOL_SCHEMAS.exec_sql,
      QUERY_TOOL_SCHEMAS.run_script,
      QUERY_EXECUTE_SCHEMA,
    ]) {
      for (const policyName of ["allowTables", "allowTable", "denyTables", "denyTable"]) {
        expect(schema.properties).not.toHaveProperty(policyName);
      }
    }

    const catalog = buildToolSchemaCatalog({ view: "full" });
    for (const toolName of ["exec_sql", "run_script", "query_execute"]) {
      const tool = catalog.tools.find((entry) => entry.name === toolName);
      expect(tool).toBeDefined();
      for (const policyName of ["allowTables", "allowTable", "denyTables", "denyTable"]) {
        expect(tool?.parameters).not.toHaveProperty(policyName);
      }
    }
  });
});
