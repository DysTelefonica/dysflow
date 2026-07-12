/**
 * Issue #757 — per-tool commit-flag metadata. Single source of truth for
 * which write-side flag (`apply`, `dryRun`, `diff`) commits each tool, and
 * what alternate flag the consumer should pass to NOT write.
 *
 * Three consumers:
 *
 *   1. **`get_capabilities` snapshot** (C2) — exposes the metadata as
 *      `snapshot.tools[toolName]` so an AI agent can reason about the
 *      flag surface without reading schema docs.
 *
 *   2. **Schema-rejection remediation** (C4) — when a tool refuses a
 *      flag the caller passed (`MCP_INPUT_INVALID: <flag> is not
 *      allowed`), the rejection envelope can point at the correct flag
 *      for THAT tool (e.g. `apply` was rejected on `export_all`; the
 *      correct commit flag for `export_all` is `apply`, but here the
 *      caller is asking the wrong question — `apply` is wrong for
 *      `verify_code`, etc.).
 *
 *   3. **Adapter dispatch** (C1) — `export_all` historically had
 *      `diff:true` as its read-only alias. This registry is the
 *      authoritative "what does diff:true mean" map now consolidated
 *      under `apply`.
 *
 * The shape is intentionally narrow: a frozen `Record` keyed by tool
 * name with `{ commitFlag, noWriteAlias, defaultBehavior }`. Adding a
 * new tool requires an entry here OR the registry misses it (and tests
 * pin coverage at `test/core/runtime/commit-flag-registry.test.ts`).
 *
 * ## Vocabulary
 *
 * - **`commitFlag`** — the boolean the caller sets to `true` to commit
 *   a write. Today `apply` (post-#757). Pre-#757 some tools used
 *   `dryRun:false`; that path is preserved as an alias the dispatcher
 *   understands but the surface name stays `apply`.
 *
 * - **`noWriteAlias`** — the deprecated / historical flag callers may
 *   pass to suppress the write. `null` when there is no such flag (the
 *   tool simply has no plan/no-write mode — `verify_code` is the
 *   example: it never mutates).
 *
 * - **`defaultBehavior`** — what the tool does when the caller passes
 *   NEITHER `apply` nor `noWriteAlias` and there is no policy override:
 *
 *     - `"writes"` — legacy default-write tools (`export_all`,
 *       `export_modules`). After #757 they keep writing when neither
 *       flag is supplied, so existing orchestrator briefs that omit
 *       `apply` keep working unchanged.
 *
 *     - `"plan"` — `safe-by-default` family (`import_modules`,
 *       `import_all`, `delete_module`, `fix_encoding`, …). When the
 *       caller omits both flags AND the active policy does not inject
 *       a default, the tool plans instead of committing.
 *
 *     - `"noop"` — pure read tools (`verify_code`, `list_objects`, …).
 *       No flag, no mutation, no plan: the tool just runs.
 *
 * ## Deprecation policy
 *
 * `noWriteAlias` is the field the registry exposes when a tool still
 * accepts the legacy "don't write" flag (`diff:true` on `export_all`).
 * The adapter keeps the alias working for at least ONE minor version
 * and emits `metadata.deprecated` with `{ flag, since, use }` whenever
 * the alias is exercised. The registry is the contract — adapter
 * behavior must agree.
 */

export type CommitFlagName = "apply" | "dryRun" | "diff";
export type NoWriteAliasName = "dryRun" | "diff" | null;
export type DefaultBehavior = "writes" | "plan" | "noop";

export interface CommitFlagMetadata {
  /** The flag the caller sets to `true` to commit a write. */
  commitFlag: CommitFlagName;
  /**
   * Historical alias callers may pass to suppress a write. `null` when
   * the tool has no read-only / no-write mode. When present the
   * adapter keeps the alias working with a `metadata.deprecated`
   * warning.
   */
  noWriteAlias: NoWriteAliasName;
  /** What the tool does when neither flag is supplied and no policy overrides apply. */
  defaultBehavior: DefaultBehavior;
}

/**
 * The registry. One entry per tool that has commit semantics; tools
 * that never accept `apply` / `dryRun` / `diff` (pure read tools) live
 * here with `defaultBehavior: "noop"` so the snapshot stays uniform.
 *
 * Adding a tool → update this record AND the test that asserts
 * coverage at `test/core/runtime/commit-flag-registry.test.ts`.
 */
export const COMMIT_FLAG_REGISTRY: Readonly<Record<string, CommitFlagMetadata>> = Object.freeze({
  // ── vba-sync write side (commitFlag = "apply") ─────────────────────────
  import_modules: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  import_all: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  delete_module: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "noop" },
  fix_encoding: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "plan" },
  vba_inline_execution: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  // #757 (C1): export_* now join the apply family. Historical `diff:true`
  // is preserved as the noWriteAlias; the adapter keeps it working with
  // a deprecation warning pointing at `apply`.
  export_modules: { commitFlag: "apply", noWriteAlias: "diff", defaultBehavior: "writes" },
  export_all: { commitFlag: "apply", noWriteAlias: "diff", defaultBehavior: "writes" },
  // Form / catalog mutation family (`applyGuardedFormWrite` seam).
  form_add_control: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  form_move_control: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  form_rename_control: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  form_deserialize: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  form_set_property: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  form_delete_control: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  form_align_controls: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  form_distribute_controls: {
    commitFlag: "apply",
    noWriteAlias: "dryRun",
    defaultBehavior: "plan",
  },
  create_form_from_template: {
    commitFlag: "apply",
    noWriteAlias: "dryRun",
    defaultBehavior: "plan",
  },
  catalog_add_control: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  generate_form: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  sync_binary: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  apply_form_design_plan: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  run_vba: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  // Query maintenance writes.
  compact_repair: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  link_tables: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  relink_tables: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  relink_directory: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  localize_backend_links: {
    commitFlag: "apply",
    noWriteAlias: "dryRun",
    defaultBehavior: "plan",
  },
  unlink_table: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  import_queries: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  // Query alias tools (write mode).
  query_sql: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  exec_sql: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  run_script: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  query_execute: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  create_table: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  drop_table: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  seed_fixture: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  teardown_fixture: { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },

  // ── read-only / no-write-default tools ────────────────────────────────
  // These accept `apply` in the schema defensively but never mutate;
  // they live here so the snapshot stays uniform. Callers passing
  // `apply:true` to them are typically misrouted (see C4 remediation).
  verify_code: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  list_objects: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  list_vba_modules: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  exists: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  vba_orphan_audit: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  generate_erd: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  validate_form_spec: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  form_serialize: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  inspect_form: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  compare_form: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  lint_form_code: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  analyze_form_ui: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  map_form_behavior: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  generate_form_design_plan: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  copy_form_ui_pattern: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  verify_form_ui: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  render_form_preview: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  analyze_form_layout: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  diff_form_preview: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  verify_form_bindings: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  harvest_form_catalog: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  test_vba: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  // Process-control tools — schema-rejection of `apply` lands here too.
  cleanup_access_operation: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  access_force_cleanup_orphaned: {
    commitFlag: "apply",
    noWriteAlias: null,
    defaultBehavior: "noop",
  },
  // Query read tools.
  list_tables: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  list_linked_tables: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  get_schema: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  count_rows: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  distinct_values: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  compare_backends: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  list_access_files: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  get_relationships: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  list_links: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  export_queries: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  list_access_operations: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  // Module / introspection.
  list_procedures: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  get_procedure: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  find_references: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  detect_dead_code: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  validate_manifest: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  resolve_project: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  get_capabilities: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  doctor: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  lint_module: { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" },
  // Alias tools.
  "dysflow.diagnose_query": {
    commitFlag: "apply",
    noWriteAlias: "dryRun",
    defaultBehavior: "plan",
  },
  "dysflow.hygiene_audit": { commitFlag: "apply", noWriteAlias: "dryRun", defaultBehavior: "plan" },
  "dysflow.diagnose_hygiene": {
    commitFlag: "apply",
    noWriteAlias: "dryRun",
    defaultBehavior: "plan",
  },
});

/**
 * Look up a tool's commit-flag metadata. Returns `undefined` when the
 * tool is unknown to the registry — callers that need a fallback
 * default should compose with `commitFlagMetadataFor` (below).
 */
export function commitFlagMetadataFor(toolName: string): CommitFlagMetadata | undefined {
  return COMMIT_FLAG_REGISTRY[toolName];
}

/**
 * Look up a tool's metadata, falling back to a uniform "noop" entry for
 * unknown / non-write tools. Used by `get_capabilities` so the snapshot
 * stays a complete map (no surprises when an old tool name sneaks in).
 */
export function commitFlagMetadataForOrNoop(toolName: string): CommitFlagMetadata {
  const entry = COMMIT_FLAG_REGISTRY[toolName];
  if (entry !== undefined) return entry;
  return { commitFlag: "apply", noWriteAlias: null, defaultBehavior: "noop" };
}

/**
 * Stable name of the registry's commit flag for the given tool (or
 * `"apply"` when the tool is unknown). Convenience helper for the
 * C4 remediation path: callers that hit `MCP_INPUT_INVALID: <flag> is
 * not allowed` on tool X need to know which flag X actually accepts,
 * not the one they passed.
 */
export function commitFlagFor(toolName: string): CommitFlagName {
  return commitFlagMetadataForOrNoop(toolName).commitFlag;
}

/**
 * Stable no-write alias for the given tool (or `null`). Used by the
 * `apply is not allowed` remediation to tell the caller which
 * alternative flag they should be passing.
 */
export function noWriteAliasFor(toolName: string): NoWriteAliasName {
  return commitFlagMetadataForOrNoop(toolName).noWriteAlias;
}
