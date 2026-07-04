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

describe("dysflow_find_references — typed error when symbol does not exist (NOT empty array)", () => {
  it("returns isError:true with SYMBOL_NOT_FOUND rather than a silent empty references array", async () => {
    const tools = createDysflowMcpTools(makeBaseServices() as DysflowMcpServices);
    const tool = tools.find((t) => t.name === "dysflow_find_references");
    expect(tool).toBeDefined();

    const result = (await tool?.handler({
      symbol: "SymbolThatDoesNotExist",
    })) ?? { content: [], isError: false };

    expect(result).toMatchObject({
      isError: true,
      content: [{ type: "text", text: expect.stringContaining("SYMBOL_NOT_FOUND") }],
    });

    const text = result.content[0]?.text ?? "";
    expect(text).not.toContain('"references":[]');
  });
});
