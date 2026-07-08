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

describe("get_procedure — default empty body", () => {
  it("returns module/procedure/startLine/endLine/body='' when the procedure has no statements", async () => {
    const sourceFixture = ["Sub DoNothing()", "", "End Sub", ""].join("\r\n");

    const tools = createDysflowMcpTools({ services: makeBaseServices() as DysflowMcpServices });
    const tool = tools.find((t) => t.name === "get_procedure");
    if (tool === undefined) throw new Error("get_procedure tool not found");

    const result = await tool.handler({
      module: "Mod",
      procedure: "DoNothing",
      source: sourceFixture,
    });

    expect(result).toMatchObject({
      isError: false,
      content: [
        {
          type: "text",
          text: JSON.stringify({
            module: "Mod",
            procedure: "DoNothing",
            startLine: 1,
            endLine: 3,
            body: "",
          }),
        },
      ],
    });
  });
});
