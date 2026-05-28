import { describe, expect, it } from "vitest";
import { LEGACY_DYSFLOW_MCP_TOOL_NAMES } from "../../../src/adapters/mcp/legacy-tool-inventory";
import { LEGACY_TOOL_SCHEMAS } from "../../../src/adapters/mcp/tools";

describe("LEGACY_TOOL_SCHEMAS parity (#200)", () => {
  it("every name in LEGACY_DYSFLOW_MCP_TOOL_NAMES has an entry in LEGACY_TOOL_SCHEMAS", () => {
    const missingEntries = LEGACY_DYSFLOW_MCP_TOOL_NAMES.filter(
      (name) => LEGACY_TOOL_SCHEMAS[name] === undefined,
    );
    expect(missingEntries).toEqual([]);
  });

  it("run_vba, query_sql, and cleanup_access_operation have entries in LEGACY_TOOL_SCHEMAS", () => {
    expect(LEGACY_TOOL_SCHEMAS.run_vba).toBeDefined();
    expect(LEGACY_TOOL_SCHEMAS.query_sql).toBeDefined();
    expect(LEGACY_TOOL_SCHEMAS.cleanup_access_operation).toBeDefined();
  });
});
