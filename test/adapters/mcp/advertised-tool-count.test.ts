import { describe, expect, it } from "vitest";
import { buildHiddenToolRegistry } from "../../../src/adapters/mcp/stdio-wrappers.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

/**
 * Lightweight guard for the MCP `tools/list` surface, mirroring the `advertised-tool-count`
 * assertion in the heavy E2E_testing/mcp-e2e.mjs without spawning the server or touching Access.
 * `tools/list` returns the non-hidden tools (see startWithSdkServer), so this pins that count and
 * the exact set — any accidental tool add / removal / hide flips this before E2E.
 */
describe("advertised MCP tool surface", () => {
  const tools = createDysflowMcpTools({
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
  });
  const hidden = buildHiddenToolRegistry(tools);
  const advertised = tools.filter((tool) => !hidden.has(tool.name)).map((tool) => tool.name);

  it("advertises exactly 59 non-hidden tools (matches the MCP server tools/list)", () => {
    // Slice 3 (#616) added dysflow_form_serialize + dysflow_form_deserialize.
    expect(advertised).toHaveLength(59);
  });

  it("advertises a duplicate-free set", () => {
    expect(new Set(advertised).size).toBe(advertised.length);
  });
});
