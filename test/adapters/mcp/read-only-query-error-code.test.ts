import { describe, expect, it, vi } from "vitest";
import { buildToolSchemaCatalog } from "../../../src/adapters/mcp/schema-tool.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";
import { AccessQueryService } from "../../../src/core/services/query-service.js";

describe("INVALID_READ_ONLY_QUERY is a documented typed code", () => {
  it("query_execute mode:read plus write SQL returns the registered code", async () => {
    const runner = { run: vi.fn() };
    const queryService = new AccessQueryService({
      runner: runner as never,
      config: {} as never,
    });
    const tools = createDysflowMcpTools({
      services: {
        vbaService: { execute: async () => successResult({}) },
        diagnosticsService: { run: async () => successResult({ checks: [] }) },
        queryService,
      },
    });
    const queryExecute = tools.find((tool) => tool.name === "query_execute");
    if (queryExecute === undefined) throw new Error("query_execute is not registered");

    const result = await queryExecute.handler({
      mode: "read",
      sql: "DROP TABLE test",
    });
    const catalog = buildToolSchemaCatalog({ toolName: "query_execute" });

    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe("INVALID_READ_ONLY_QUERY");
    expect(result.error?.remediation).toBeDefined();
    expect(catalog.tools[0]?.errorCodes.map((entry) => entry.code)).toContain(
      "INVALID_READ_ONLY_QUERY",
    );
    expect(runner.run).not.toHaveBeenCalled();
  });
});
