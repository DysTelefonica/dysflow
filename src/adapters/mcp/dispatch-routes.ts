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
  // Issue #807 (Feature 1) — list_vba_modules is the read-only sibling of
  // list_objects: it walks VBProject.VBComponents to enumerate every component
  // with its type and a binary-side path. The cross-reference against the
  // source tree is filesystem-only and never opens Access; the call does
  // not mutate either side.
  list_vba_modules: {
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
  // Issue #813 phase 6 — `apply_form_design_plan` is now an atomic
  // exposure of the Phase 5.1 execution internals (multi-op plan fold,
  // single write, single import_modules gate, single rollback).
  // Risk is routine-dev-write (mirrors form_add_control / form_move_control
  // / form_rename_control — a routine property/control edit gated through
  // the same applyGuardedFormWrite seam). Both mutates flags must be true
  // so MCP_WRITES_DISABLED refuses with apply:true (issue #813 acceptance
  // criterion #5) and the dispatch-factory's atomic-dryRun gating list
  // routes the input through resolveIsDryRun (not the hardcoded false
  // branch reserved for raw binary writers).
  apply_form_design_plan: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: true,
    risk: "routine-dev-write",
  },
  copy_form_ui_pattern: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  // Issue #813 phase 6 — net-new standalone tools sharing the same
  // applyGuardedFormWrite seam as `apply_form_design_plan`. Both must
  // join the three-list trio (route table + isDryRunCapableBinaryWrite +
  // POLICY_EXEMPT_TOOLS) in lockstep or the write-gate either bypasses
  // (route.mutatesBinary stays false) or refuses legitimate dry-run
  // previews (the second isDryRun-gating list is not extended).
  //
  // Risk tier rationale (design.md):
  //   - form_set_property: routine-dev-write — a routine property edit
  //     mirroring `form_move_control` (same risk family, same seam).
  //   - form_delete_control: destructive-write — irreversible content
  //     removal mirroring `form_deserialize` (which is also
  //     destructive-write in this table).
  form_set_property: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: true,
    risk: "routine-dev-write",
  },
  form_delete_control: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: true,
    risk: "destructive-write",
  },
  // Issue #872 F1 + F2 — `form_set_properties` + `form_duplicate_control`
  // share the applyGuardedFormWrite seam with form_set_property /
  // form_delete_control. Both MUST join the three-list trio (route table
  // + isDryRunCapableBinaryWrite + POLICY_EXEMPT_TOOLS) in lockstep —
  // see dispatch-factory.ts + write-execution-dispatch.ts. Both are
  // routine-dev-write (a routine property / clone edit gated through the
  // same seam, not destructive).
  form_set_properties: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: true,
    risk: "routine-dev-write",
  },
  form_duplicate_control: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: true,
    risk: "routine-dev-write",
  },
  // Issue #816 — Phase 3 (Ergonomic actions). Two batch geometry tools
  // (`form_align_controls` + `form_distribute_controls`) sharing the
  // applyGuardedFormWrite seam. Both route through the same single-write
  // + single-guarded-import + single-rollback block as `form_set_property`
  // / `form_delete_control`. Risk tier rationale:
  //   - Both are routine-dev-write (same family as `form_move_control` —
  //     a routine position edit, not a destructive removal).
  //   - They MUST join the three-list trio (route table +
  //     isDryRunCapableBinaryWrite + POLICY_EXEMPT_TOOLS) in lockstep,
  //     otherwise `MCP_WRITES_DISABLED` either bypasses the gate (route
  //     stays read-only) or refuses a legitimate `dryRun: true` preview
  //     (the second atomic-dryRun gating list is not extended).
  form_align_controls: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: true,
    risk: "routine-dev-write",
  },
  form_distribute_controls: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: true,
    risk: "routine-dev-write",
  },
  verify_form_ui: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  // Issue #814 — `render_form_preview` is a pure read-class tool: it walks
  // the FormIR tree and emits an SVG / ASCII layout artifact. It never
  // opens Access, never writes to disk, and never mutates the binary — so
  // both mutates flags stay false and the write-gate never fires. The route
  // mirrors `analyze_form_ui` / `map_form_behavior` / `verify_form_ui`
  // exactly: read-only, risk:read-only, no write seam.
  render_form_preview: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  // Issue #815 — `analyze_form_layout` is the geometry-lint sibling of
  // `render_form_preview`. The lint runs purely over an in-memory
  // `FormUiBehaviorMap` derived from the .form.txt (no Access, no COM, no
  // filesystem mutation). Both mutates flags stay false and risk is
  // read-only, mirroring `render_form_preview` exactly. Every emitted
  // finding carries severity `warning` (informational; never gating).
  analyze_form_layout: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  // Issue #817 — `diff_form_preview` is the before/after visual diff
  // composer. It reads TWO .form.txt files, parses both through FormIR,
  // and emits a structured `{added, removed, moved, resized}` change
  // report with diff overlays on the SVG / ASCII frames. Pure read-class:
  // never opens Access, never writes to disk. Both mutates flags stay
  // false; risk is read-only — the write-gate must never fire for this
  // tool.
  diff_form_preview: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  // Issue #818 — `verify_form_bindings` validates a form's ControlSource +
  // RowSource bindings against a caller-supplied schema aggregate
  // (typically pre-aggregated from dysflow `get_schema` MCP calls). It
  // reads ONE .form.txt, parses to FormIR, and delegates to the pure
  // `validateBindings` core service. Pure read-class — never opens
  // Access, never writes to disk, never fetches the schema itself.
  // Both mutates flags stay false; risk is read-only — the write-gate
  // must never fire for this tool. Mirrors `analyze_form_layout`'s
  // read-only contract exactly.
  verify_form_bindings: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  // Issue #872 F5 — `form_get_geometry` + `form_list_controls` are pure
  // read-class helpers. They parse the .form.txt through FormIR and emit
  // a geometry summary (one control) or a flat inventory (every named
  // control in the form, with hasEventBinding). Both never open Access,
  // never write to disk, never call the binary, never fetch anything.
  // Both mutates flags stay false; risk is read-only — the write-gate
  // MUST NEVER fire for these tools. They mirror `render_form_preview` /
  // `analyze_form_layout` / `inspect_form`'s read-only contract exactly.
  form_get_geometry: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  form_list_controls: {
    kind: "vba-sync",
    mutatesBinary: false,
    mutatesFilesystem: false,
    risk: "read-only",
  },
  // Issue #809 — `sync_binary` workflow tool. Composes verify_code +
  // import_modules + export_modules into a single round-trip. Write-class
  // because `apply:true` can mutate EITHER side of the sync boundary:
  //   - `direction: 'src-to-binary'` -> import_modules -> mutatesBinary
  //   - `direction: 'binary-to-src'` -> export_modules -> mutatesFilesystem
  //   - `direction: 'both'` -> either or both
  // Both mutates flags stay true so the dispatch write-gate fires for any
  // direction. Risk is routine-dev-write (same family as apply_form_design_plan
  // / form_set_property / import_modules); POLICY_EXEMPT_TOOLS keeps the
  // developer-mode policy helper from injecting dryRun:false on plan-intended
  // calls. Both mutates flags must be true so the dispatch consults
  // resolveIsDryRun (not the hardcoded false branch reserved for raw binary
  // writers) — the second atomic-dryRun gating list in dispatch-factory.ts
  // mirrors this. Accepts dryRun:true (preview path) AND apply:true
  // (commit signal) with the same semantic the form mutation family uses.
  sync_binary: {
    kind: "vba-sync",
    mutatesBinary: true,
    mutatesFilesystem: true,
    risk: "routine-dev-write",
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
