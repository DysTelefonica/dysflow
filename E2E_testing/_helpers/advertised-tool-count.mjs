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

/** @type {number} Number of MCP tools exposed by `tools/list` after the hidden-stub filter.
 * #777 (Opción A cont.) — drops by 3 (one per legacy alias removed:
 * `dysflow_vba_execute`, `dysflow_access_operations_list`, `dysflow_access_cleanup`).
 * #795 adds six AI form UI builder tools: analyze/map/plan/apply/copy/verify.
 * #807 (Feature 1) adds `list_vba_modules` (read-only sibling of `list_objects`).
 * #813 phase 6 adds `form_set_property` + `form_delete_control` (atomic
 * exposure of the apply_form_design_plan family): 71 -> 73.
 * #814 (Phase 2 Perception) adds `render_form_preview` (pure read-class
 * geometric SVG/ASCII render): 73 -> 74.
 * #815 (Phase 2 Perception) adds `analyze_form_layout` (pure read-class
 * geometry lint, sibling of render_form_preview): 74 -> 75.
 * #816 (Phase 3 Ergonomic actions) adds `form_align_controls` +
 * `form_distribute_controls` (batch geometry verbs sharing the same
 * applyGuardedFormWrite seam as the form_set_property /
 * form_delete_control family): 75 -> 77.
 * #817 (Phase 2 Perception cont.) adds `diff_form_preview` (before/after
 * visual diff composer, pure read-class sibling of render_form_preview): 77 -> 78.
 * #818 (Phase 2 Perception cont.) adds `verify_form_bindings` (pure
 * read-class schema-binding validator - ControlSource + RowSource against a
 * caller-supplied schema aggregate, no Access, no COM, no filesystem
 * mutation): 78 -> 79.
 * #809 adds `sync_binary` (composes verify_code + import_modules +
 * export_modules into a single round-trip; mutatesBinary + mutatesFilesystem
 * both true so the dispatch write-gate fires for any direction;
 * dryRun-capable so a legitimate dryRun:true preview is not collapsed to
 * isDryRun===false; POLICY_EXEMPT_TOOLS keeps developer-mode from injecting
 * dryRun:false on plan-intended calls): 79 -> 80.
 * #872 adds form_set_properties + form_duplicate_control (write-gated
 * atomic batch property updates + control duplication, same
 * applyGuardedFormWrite seam as form_set_property / form_delete_control)
 * + form_get_geometry + form_list_controls (pure read-class geometry +
 * inventory helpers, never open Access, never write to disk): 80 -> 84.
 * #971 adds `schema` (pure read-class runtime contract discovery —
 * surfaces the documented parameter / return / error-code /
 * cross-reference surface for every advertised MCP tool, never opens
 * Access, never spawns PowerShell, never mutates state): 84 -> 85.
 * #965 adds `diagnose` (pure read-class aggregated project health
 * surface that replaces the 4-5 round-trip pattern AI consumers hit
 * today; never opens Access, never spawns PowerShell, never writes to
 * disk; same risk family as `schema` / `resolve_project` /
 * `get_capabilities`): 85 -> 86.
 * #976 adds `clean_stale_markers` (Round-12 user-callable companion to
 * the #967 auto-cleanup; dry-run default true, apply requires
 * `confirm: true`, write-gated through MCP_WRITES_DISABLED when writes
 * are off): 86 -> 87.
 * #973 adds `logs` (pure read-class AI-aware log access — structured
 * view of `.dysflow/runtime/` (operations.json + markers/*.json) with
 * filters since/until/level/operationId/tool, pagination limit
 * (default 100, max 1000), ordering (default desc). Never opens Access,
 * never spawns PowerShell, never mutates state): 87 -> 88.
 * #978 adds `state` (Round-12 read-only runtime operational state —
 * surfaces `{ operations, markers, locks, counters }` aggregated from
 * the access operation registry and `.dysflow/runtime/markers/`; never
 * opens Access, never spawns PowerShell, never mutates state): 88 -> 89. */
export const EXPECTED_ADVERTISED_TOOL_COUNT = 84;

/** @type {string} Human-readable label rendered in the e2e report's `expected` column. */
export const EXPECTED_ADVERTISED_TOOL_COUNT_LABEL = `${EXPECTED_ADVERTISED_TOOL_COUNT} tools`;

/**
 * #713: required merged VBA tools that must be present in every advertised
 * MCP/runtime surface, not just implemented behind the factory.
 * @type {readonly string[]}
 */
export const ISSUE_713_REQUIRED_TOOLS = Object.freeze([
  "list_procedures",
  "get_procedure",
  "find_references",
  "detect_dead_code",
  "validate_manifest",
]);
