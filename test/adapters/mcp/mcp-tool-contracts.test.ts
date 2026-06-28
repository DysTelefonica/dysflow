import { describe, expect, it } from "vitest";
import {
  getMcpToolContract,
  MCP_TOOL_CONTRACTS,
} from "../../../src/adapters/mcp/mcp-tool-contracts";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools";
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

  it("guards modern descriptions with shared safety wording", () => {
    const tools = createDysflowMcpTools({
      vbaService: new FakeVbaService(),
      queryService: new FakeQueryService(),
      diagnosticsService: new FakeDiagnosticsService(),
    });
    const queryExecute = tools.find((tool) => tool.name === "dysflow_query_execute");
    const cleanup = tools.find((tool) => tool.name === "dysflow_access_cleanup");

    expect(queryExecute?.description).toContain(MCP_TOOL_CONTRACTS.dysflow_query_execute.summary);
    expect(cleanup?.description).toContain(MCP_TOOL_CONTRACTS.dysflow_access_cleanup.summary);
  });
});
