import { describe, expect, it } from "vitest";
import {
  EXPECTED_ADVERTISED_TOOL_COUNT,
  EXPECTED_ADVERTISED_TOOL_COUNT_LABEL,
} from "../../../E2E_testing/_helpers/advertised-tool-count.mjs";
import { buildHiddenToolRegistry } from "../../../src/adapters/mcp/stdio-wrappers.js";
import { createDysflowMcpTools } from "../../../src/adapters/mcp/tools.js";
import { successResult } from "../../../src/core/contracts/index.js";

/**
 * Lightweight guard for the MCP `tools/list` surface, mirroring the `advertised-tool-count`
 * assertion in the heavy E2E_testing/mcp-e2e.mjs without spawning the server or touching Access.
 * `tools/list` returns the non-hidden tools (see startWithSdkServer), so this pins that count and
 * the exact set — any accidental tool add / removal / hide flips this before E2E.
 *
 * The expected count is imported from `E2E_testing/_helpers/advertised-tool-count.mjs`
 * so the live e2e gate (`E2E_testing/mcp-e2e.mjs`) and the suite-contracts pin
 * (`test/quality-gates/mcp-e2e-suite-contracts.test.ts`) cannot drift from this unit pin.
 */
const ISSUE_713_REQUIRED_TOOLS = [
  "dysflow_list_procedures",
  "dysflow_get_procedure",
  "dysflow_find_references",
  "dysflow_detect_dead_code",
  "dysflow_validate_manifest",
] as const;

describe("advertised MCP tool surface", () => {
  const tools = createDysflowMcpTools({
    vbaService: { execute: async () => successResult({ returnValue: "ok" }) },
    queryService: { execute: async () => successResult({ rows: [] }) },
    diagnosticsService: { run: async () => successResult({ checks: [] }) },
  });
  const hidden = buildHiddenToolRegistry(tools);
  const advertised = tools.filter((tool) => !hidden.has(tool.name)).map((tool) => tool.name);

  it(`advertises exactly ${EXPECTED_ADVERTISED_TOOL_COUNT} non-hidden tools (matches the MCP server tools/list)`, () => {
    // Slice 3 (#616) added dysflow_form_serialize + dysflow_form_deserialize.
    // Slice 5 (#618) added dysflow_create_form_from_template.
    // PR-1 (#656) added dysflow_get_capabilities.
    // #701 added dysflow_list_procedures + dysflow_get_procedure.
    // #705 added dysflow_detect_dead_code.
    // #703 added dysflow_validate_manifest.
    // #704 added dysflow_lint_module.
    expect(advertised).toHaveLength(EXPECTED_ADVERTISED_TOOL_COUNT);
    // Guard the label format too — the e2e suite-contracts pin asserts on this string.
    expect(EXPECTED_ADVERTISED_TOOL_COUNT_LABEL).toBe(`${EXPECTED_ADVERTISED_TOOL_COUNT} tools`);
  });

  it("advertises all #713 merged VBA tools by name", () => {
    expect(advertised).toEqual(expect.arrayContaining([...ISSUE_713_REQUIRED_TOOLS]));
  });

  it("advertises a duplicate-free set", () => {
    expect(new Set(advertised).size).toBe(advertised.length);
  });
});
