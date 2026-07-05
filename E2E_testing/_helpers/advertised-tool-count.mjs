// P3 (#670, item 5): the advertised (non-hidden) MCP tool count is
// pinned by three sites that MUST move together:
//
//   1. E2E_testing/mcp-e2e.mjs              — live runtime gate (this file's runtime home)
//   2. test/adapters/mcp/advertised-tool-count.test.ts — unit pin
//   3. test/quality-gates/mcp-e2e-suite-contracts.test.ts — source-text pin
//
// Each site imported its own literal tool count. Extracting it here
// means a future add/remove flips one number and the next test run
// surfaces every dependent pin in one cycle. The label is derived from
// the count so the e2e expected column and the literal-string source
// match the unit pin by construction.
//
// Bumping this number? Update every site listed above AND bump the
// corresponding `README.md` / `docs/` mentions.

/** @type {number} Number of MCP tools exposed by `tools/list` after the hidden-stub filter. */
export const EXPECTED_ADVERTISED_TOOL_COUNT = 66;

/** @type {string} Human-readable label rendered in the e2e report's `expected` column. */
export const EXPECTED_ADVERTISED_TOOL_COUNT_LABEL = `${EXPECTED_ADVERTISED_TOOL_COUNT} tools`;

/**
 * #713: required merged VBA tools that must be present in every advertised
 * MCP/runtime surface, not just implemented behind the factory.
 * @type {readonly string[]}
 */
export const ISSUE_713_REQUIRED_TOOLS = Object.freeze([
  "dysflow_list_procedures",
  "dysflow_get_procedure",
  "dysflow_find_references",
  "dysflow_detect_dead_code",
  "dysflow_validate_manifest",
]);
