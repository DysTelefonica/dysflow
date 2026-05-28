import { describe, expect, it } from "vitest";
import { DYSFLOW_MCP_TOOL_NAMES } from "../../../src/adapters/mcp/mcp-tool-registry";
import { MCP_TOOL_SCHEMAS } from "../../../src/adapters/mcp/tools";

describe("MCP_TOOL_SCHEMAS parity (#200)", () => {
  it("every name in DYSFLOW_MCP_TOOL_NAMES has an entry in MCP_TOOL_SCHEMAS", () => {
    const missingEntries = DYSFLOW_MCP_TOOL_NAMES.filter(
      (name) => MCP_TOOL_SCHEMAS[name] === undefined,
    );
    expect(missingEntries).toEqual([]);
  });

  it("run_vba, query_sql, and cleanup_access_operation have entries in MCP_TOOL_SCHEMAS", () => {
    expect(MCP_TOOL_SCHEMAS.run_vba).toBeDefined();
    expect(MCP_TOOL_SCHEMAS.query_sql).toBeDefined();
    expect(MCP_TOOL_SCHEMAS.cleanup_access_operation).toBeDefined();
  });
});
