import { describe, expect, it } from "vitest";
import { createDysflowMcpTools, type DysflowMcpServices } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

function makeBaseServices() {
  return {
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
  };
}

describe("dysflow_get_procedure — typed error when module does not exist", () => {
  it("returns isError:true with MODULE_NOT_FOUND in the error text", async () => {
    const tools = createDysflowMcpTools(makeBaseServices() as DysflowMcpServices);
    const tool = tools.find((t) => t.name === "dysflow_get_procedure");
    if (tool === undefined) throw new Error("dysflow_get_procedure tool not found");

    const result = await tool.handler({
      module: "modDoesNotExist",
      procedure: "Anything",
    });

    expect(result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: expect.stringContaining("MODULE_NOT_FOUND") }],
    });
  });
});
