import { describe, expect, it } from "vitest";
import {
  getMcpToolContract,
  MCP_TOOL_CONTRACTS,
} from "../../../src/adapters/mcp/mcp-tool-contracts";
import { createDysflowMcpTools, MODERN_TOOL_NAMES } from "../../../src/adapters/mcp/tools";
import { successResult } from "../../../src/core/contracts/index";

class FakeVbaService {
  async execute() {
    return successResult({ returnValue: "ok" });
  }
}
class FakeQueryService {
  async execute() {
    return successResult({ rows: [] });
  }
}
class FakeDiagnosticsService {
  async run() {
    return successResult({ checks: [] });
  }
}

describe("MCP tool contract metadata", () => {
  it("centralizes modern and legacy cleanup write-gate metadata", () => {
    expect(getMcpToolContract("dysflow_access_cleanup")).toMatchObject({
      access: "conditional-write",
      writeGate: "conditional",
    });
    expect(getMcpToolContract("cleanup_access_operation")).toMatchObject(
      getMcpToolContract("dysflow_access_cleanup"),
    );
  });

  it("classifies modern query execution as read/write with dry-run protection", () => {
    expect(getMcpToolContract("dysflow_query_execute")).toMatchObject({
      access: "read-write",
      writeGate: "conditional",
      dryRunDefault: true,
    });
  });

  it("defines contract metadata for every modern tool", () => {
    for (const toolName of MODERN_TOOL_NAMES) {
      expect(getMcpToolContract(toolName), `${toolName} contract`).toMatchObject({
        access: expect.any(String),
        writeGate: expect.any(String),
        summary: expect.stringContaining("MCP contract"),
      });
    }
  });

  it("advertises each modern tool contract in its description", () => {
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(),
      queryService: new FakeQueryService(),
      diagnosticsService: new FakeDiagnosticsService(),
    });

    for (const toolName of MODERN_TOOL_NAMES) {
      const advertised = tools.find((tool) => tool.name === toolName);
      expect(advertised?.description, `${toolName} description`).toContain(
        MCP_TOOL_CONTRACTS[toolName].summary,
      );
    }
  });
});
