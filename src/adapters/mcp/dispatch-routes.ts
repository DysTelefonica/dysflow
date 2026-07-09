import type { AccessQueryAction } from "../../core/mapping/access-query-request-mapper.js";
import type { ToolRisk } from "../../core/runtime/write-execution-policy.js";
import type { AliasToolName } from "./alias-tools.js";
import type { DysflowMcpToolName, QueryToolName } from "./mcp-tool-registry.js";

// ─── Route table ─────────────────────────────────────────────────────────────

/**
 * Closed union of dispatch route kinds.
 *
 * - `vba-sync` — VBA module sync tools (`mutatesBinary` / `mutatesFilesystem`
 *   are the single source of truth for whether the write-gate fires; both
 *   flags are REQUIRED so omitting either is a compile error, never a
 *   silently un-gated write).
 * - `query-read` — read-only query tools; never write-gated.
 * - `query-maintenance` — table/query maintenance tools; `queryMode` decides
 *   the write-gate.
 *
 * ## Re-introduction note (#E — `query-write-fixture` removal)
 *
 * The prior `query-write-fixture` member was removed in #hexagonal-tech-debt
 * PR 2 (2026-07-01). No `MCP_TOOL_ROUTES` entry ever routed to it (verified by
 * grep), so removal is a no-op at runtime but tightens the type so the
 * dispatcher `switch` is exhaustively typed.
 *
 * Re-introduction requires a deliberate type-widening PR (add the union
 * member, add a `case` to the dispatcher `switch`, and add an `MCP_TOOL_ROUTES`
 * entry). No consumer should smuggle it back via an `as McpToolRoute` cast.
 *
 * ## `risk` field (issue #779, v2.1.0)
 *
 * Additive metadata consumed by `resolveWriteExecutionPolicy()` to decide
 * `effectiveDryRunDefault` per tool under the active policy mode. The risk
 * field is orthogonal to `mutatesBinary` / `mutatesFilesystem`: a tool can
 * be high-risk AND mutatesBinary:true (the destructive family) or
 * low-risk AND mutatesBinary:true (the routine-dev-write family). The
 * write-gate keeps using the existing mutates flags; risk only governs
 * whether the *default* is `dryRun: true`.
 *
 * `process-control` risk lives behind the alias layer
 * (`cleanup_access_operation`, `access_force_cleanup_orphaned`), NOT in
 * `MCP_TOOL_ROUTES`.
 */
export type McpToolRoute =
  | { kind: "vba-sync"; mutatesBinary: boolean; mutatesFilesystem: boolean; risk: ToolRisk }
  | { kind: "query-read"; risk: ToolRisk }
  | { kind: "query-maintenance"; queryMode: "read" | "write"; risk: ToolRisk };

export type GeneratedDispatchToolName = Exclude<DysflowMcpToolName, AliasToolName>;

export const MCP_TOOL_ROUTES: Record<GeneratedDispatchToolName, McpToolRoute> = {
  // VBA sync — mutatesBinary:true tools always pass the write-gate (they mutate the .accdb).
  export_modules: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: true,
    risk: "destructive-write",
  },
  export_all: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: true,
    risk: "destructive-write",
  },
  import_modules: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: false,
    risk: "routine-dev-write",
  },
  import_all: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: false,
    risk: "routine-dev-write",
  },
  list_objects: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  exists: { kind: "vba-sync", mutatesBinary: false, mutatesFilesystem: false, risk: "read-only" },
  test_vba: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "routine-dev-write",
  },
  // verify_code is the single source/binary compare tool (read-only dry-run): it
  // does whole-project AND single-module comparison and only RECOMMENDS an
  // explicit import/export — it never mutates the .accdb. Keep mutatesBinary:false.
  // See src/core/services/vba-source-comparison.ts (compareSourceAgainstBinary).
  verify_code: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  delete_module: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: false,
    risk: "destructive-write",
  },
  generate_erd: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: true,
    risk: "routine-dev-write",
  },
  fix_encoding: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: true,
    risk: "protected-write",
  },
  validate_form_spec: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  generate_form: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: true,
    risk: "routine-dev-write",
  },
  catalog_add_control: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: true,
    risk: "routine-dev-write",
  },
  harvest_form_catalog: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  // inspect_form reads from the version-controlled source tree; no binary or filesystem mutation.
  inspect_form: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  // compare_form reads two version-controlled source trees and runs a pure IR-level
  // diff; no binary, no filesystem mutation. The write-gate must never fire.
  compare_form: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  // lint_form_code is a static analyzer over the source tree. It opens no
  // .accdb, spawns no Access process, and writes nothing. Mutations are
  // explicitly false so the write-gate never fires for this tool.
  lint_form_code: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  form_add_control: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: true,
    risk: "routine-dev-write",
  },
  form_move_control: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: true,
    risk: "routine-dev-write",
  },
  form_rename_control: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: true,
    risk: "routine-dev-write",
  },
  // slice 3 — serialize (read-only) + deserialize (write-gated with LoadFromText gate).
  // Deserialize reuses the slice-4 import_modules gate via vbaSyncToolService so the
  // binary is the single source of truth for the apply check (#616).
  form_serialize: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  form_deserialize: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: true,
    risk: "destructive-write",
  },
  // slice 5 (#618) — clone a form from a template, apply `{{Token}}` placeholders, write
  // the cloned form to a target path, route through the import_modules LoadFromText gate.
  // Default dry-run is the safe semantic; a real binary mutation requires apply:true.
  create_form_from_template: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: true,
    risk: "routine-dev-write",
  },
  analyze_form_ui: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  map_form_behavior: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  generate_form_design_plan: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  // First-slice AI form UI builder plan tools are contract-only: they produce
  // analysis/plans/application reports but do not mutate form source or binary.
  // When concrete FormIR mutations are added, reclassify only that operation
  // through the same guarded import path as form_add_control/form_move_control.
  apply_form_design_plan: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  copy_form_ui_pattern: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  verify_form_ui: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  vba_orphan_audit: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  vba_inline_execution: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: false,
    risk: "arbitrary-write",
  },
  // query maintenance (9)
  list_links: { kind: "query-maintenance", queryMode: "read", risk: "read-only" },
  export_queries: { kind: "query-maintenance", queryMode: "read", risk: "read-only" },
  link_tables: { kind: "query-maintenance", queryMode: "write", risk: "routine-dev-write" },
  relink_tables: { kind: "query-maintenance", queryMode: "write", risk: "routine-dev-write" },
  localize_backend_links: {
    kind: "query-maintenance",
    queryMode: "write",
    risk: "routine-dev-write",
  },
  unlink_table: { kind: "query-maintenance", queryMode: "write", risk: "routine-dev-write" },
  import_queries: { kind: "query-maintenance", queryMode: "write", risk: "routine-dev-write" },
  compact_repair: { kind: "query-maintenance", queryMode: "write", risk: "protected-write" },
  relink_directory: { kind: "query-maintenance", queryMode: "write", risk: "protected-write" },
  // query read (8)
  list_tables: { kind: "query-read", risk: "read-only" },
  list_linked_tables: { kind: "query-read", risk: "read-only" },
  get_schema: { kind: "query-read", risk: "read-only" },
  count_rows: { kind: "query-read", risk: "read-only" },
  distinct_values: { kind: "query-read", risk: "read-only" },
  compare_backends: { kind: "query-read", risk: "read-only" },
  list_access_files: { kind: "query-read", risk: "read-only" },
  get_relationships: { kind: "query-read", risk: "read-only" },
};

/**
 * Typed binding of MCP query tool names to their domain `AccessQueryRequest`
 * action. This REPLACES the former `name as AccessQueryRequest["action"]` cast:
 * the `satisfies Record<QueryToolName, AccessQueryAction>` annotation (DELTA-003
 * / #578) keeps the literal type narrow so each key is checked individually
 * AND the whole object is verified to be assignable to the Record — a missing
 * `QUERY_TOOL_NAMES` entry becomes a TS2322/TS2741 COMPILE error, not a silent
 * drift hidden behind an `as Record<...>` cast.
 *
 * The binding is an identity map (tool name === action) but is written
 * explicitly rather than derived, so the type checker — not a runtime cast —
 * guarantees coverage. The companion tests assert coverage at runtime:
 *   - test/adapters/mcp/mcp-tool-action-map.test.ts (coverage of every
 *     query-routed tool AND no vba-sync leak)
 *   - test/adapters/mcp/mcp-tool-action-map-source.test.ts (the construction
 *     uses `satisfies`, not `as Record<...>`).
 */
export const MCP_TOOL_QUERY_ACTIONS = {
  // query alias tools (7) — routed via alias-tools.ts
  query_sql: "query_sql",
  exec_sql: "exec_sql",
  run_script: "run_script",
  create_table: "create_table",
  drop_table: "drop_table",
  seed_fixture: "seed_fixture",
  teardown_fixture: "teardown_fixture",
  // query maintenance (9) — routed via dispatch.ts
  list_links: "list_links",
  export_queries: "export_queries",
  link_tables: "link_tables",
  relink_tables: "relink_tables",
  localize_backend_links: "localize_backend_links",
  unlink_table: "unlink_table",
  import_queries: "import_queries",
  compact_repair: "compact_repair",
  relink_directory: "relink_directory",
  // query read (8)
  list_tables: "list_tables",
  list_linked_tables: "list_linked_tables",
  get_schema: "get_schema",
  count_rows: "count_rows",
  distinct_values: "distinct_values",
  compare_backends: "compare_backends",
  list_access_files: "list_access_files",
  get_relationships: "get_relationships",
} as const satisfies Record<QueryToolName, AccessQueryAction>;

export function queryActionFor(name: DysflowMcpToolName): AccessQueryAction {
  const action = MCP_TOOL_QUERY_ACTIONS[name as QueryToolName];
  if (action === undefined) {
    throw new Error(`No AccessQueryRequest action registered for MCP tool: ${name}`);
  }
  return action;
}
