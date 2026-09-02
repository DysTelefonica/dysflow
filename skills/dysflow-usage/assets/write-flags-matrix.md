# Dysflow MCP Write-Flag Matrix

> **Source of truth**: candidate-runtime `bootstrap`, full capabilities, schema index/full, and selective `describe_tool` captures verified for the v4.3.1 release on 2026-09-02. The runtime is authoritative; this file is the human-readable mirror.
>
> **Companion to** `dysflow-usage/SKILL.md` §2 Hard Rules (HR-2), §3 Decision Gates (resolve `apply:true` vs `apply:false`), §6 Anti-patterns.
>
> **Re-generate**: re-run `describe_tool({name:"X"})` for one tool per preferredAgentWorkflows phase, aggregate the union into the table below, run `dysflow-usage/assets/scripts/verify-examples-vs-runtime.ps1`.

## Header (canonical flags per runtime contract)

| Field | Value | Why |
|---|---|---|
| `canonicalCommitFlag` | `"apply"` (for every callable tool, including `test_vba`) | Unified in [issue #1167](https://github.com/DysTelefonica/dysflow/issues/1167). Read-only tools report noop behavior. |
| `legacyAliases` | mostly empty; **only** `["diff"]` on `export_modules` and `export_all` | Compatibility alias from the pre-#1167 days. Never treat as canonical. |
| `noWriteAlias` | `"diff"` on `export_modules` and `export_all`; `null` elsewhere | Plan-shape alias for the two tools that historically had it. Prefer `apply:false`. |
| `defaultBehavior` | `"plan"` for write-class tools; `"noop"` for read-only tools | Omitted intent on a write-class tool always plans. See `dysflow-usage` §3 Decision Gates. |
| `commitFlag` | same as `canonicalCommitFlag` for the dispatch seam | The actual property the dispatch reads. Always pass `apply` explicitly. |
| `_meta["dysflow/workflow"].status` | `"preferred"` / `"specialized"` / `"legacy"` | `preferred` tools are the recommended set; `specialized` are fine for niche cases; `legacy` (`query_sql`, `exec_sql`) prefer the `preferred` alternative. |

## Per-write-class-tool matrix (44 tools)

> The dispatch reads `apply` (canonical) and accepts `diff` as a plan alias **only** on the two `export_*` tools. Every row below commits via `apply:true`.

### export / source ⇄ binary (5 tools)

| Tool | Default behavior | Legacy aliases | Risk class | Notes |
|---|---|---|---|---|
| `export_modules` | `plan` | `["diff"]` | `routine-dev-write` | Plan with `apply:false` (or `diff:true`). Source-guard fires `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` if destination overlaps source. |
| `export_all` | `plan` | `["diff"]` | `destructive-write` | Same as `export_modules`, with full-project scope. Same source-guard. Pair with `prune:true` only after explicit human approval. |
| `import_modules` | `plan` | `[]` | `routine-dev-write` | List-shape `moduleNames:[...]` batches multiple modules in one call. NEVER pass `compile:true` (HR-1 of `dysflow-arnes`). |
| `import_all` | `plan` | `[]` | `destructive-write` | Same as `import_modules` but full-project. NEVER pass `compile:true`. |
| `delete_module` | `plan` | `[]` | `destructive-write` | Removes one VBA module from the binary after a plan confirms the destructive target. |

### sync orchestration (1 tool)

| Tool | Default behavior | Legacy aliases | Risk class | Notes |
|---|---|---|---|---|
| `sync_binary` | `plan` | `[]` | `destructive-write` | Composes `verify_code` + `import_modules`/`export_modules` + re-verify + recommend in one call. `direction:"both"` is plan-only even with `apply:true`. Pair `acceptBothChanged:true` ONLY with a one-way `direction`. |

### tests (1 tool)

| Tool | Default behavior | Legacy aliases | Risk class | Notes |
|---|---|---|---|---|
| `test_vba` | `plan` | `[]` | `critical-write` | Executes the validated test manifest. **Block on `humanCompilePending === true`** before invoking (HR-1 of `dysflow-arnes`). `apply:true` commits and runs; `apply:false` is the documented opt-out when `allowedProcedures` is empty. |

> **`test_vba` filter shape (post #1442):** the legacy `filter` (typed `string`) is preserved as substring match. For object-shape filtering (e.g. `{tag: "issue-82"}`) use the dedicated `testFilter` parameter (untyped at the boundary; shape handed to `parseTestFilter`). Both are optional.

### forms (12 tools)

| Tool | Default behavior | Legacy aliases | Risk class | Notes |
|---|---|---|---|---|
| `validate_form_spec` | `noop` | `[]` | `read-only` | Pure JSON validation, no Access target. |
| `generate_form` | `plan` | `[]` | `routine-dev-write` | Offline form-spec generation. |
| `catalog_add_control` | `plan` | `[]` | `routine-dev-write` | Offline catalog mutation. |
| `harvest_form_catalog` | `noop` | `[]` | `read-only` | Reads offline form sources. |
| `inspect_form` | `noop` | `[]` | `read-only` | Reads one offline form source. |
| `compare_form` | `noop` | `[]` | `read-only` | Pure offline form-source comparison. |
| `lint_form_code` | `noop` | `[]` | `read-only` | Pure source linting. |
| `form_add_control` | `plan` | `[]` | `routine-dev-write` | Adds a control to a `.form.txt`. |
| `form_move_control` | `plan` | `[]` | `routine-dev-write` | Moves a control to an exact coordinate. |
| `form_rename_control` | `plan` | `[]` | `routine-dev-write` | Renames a control; safe-rename via `access-form-ui-builder` skill's blast-radius check. |
| `form_serialize` | `noop` | `[]` | `read-only` | Offline form serialization. |
| `form_deserialize` | `plan` | `[]` | `routine-dev-write` | Inverse of `form_serialize`. |
| `create_form_from_template` | `plan` | `[]` | `routine-dev-write` | Scaffold a form from a spec. |
| `analyze_form_ui` | `noop` | `[]` | `read-only` | `preferred` tool. Pure offline FormIR analysis; no child process. |
| `map_form_behavior` | `noop` | `[]` | `read-only` | `control -> handler -> callpath` via codegraph-vba. |
| `generate_form_design_plan` | `noop` | `[]` | `read-only` | `preferred` tool. Generates a guarded plan from analyzed behavior. |
| `apply_form_design_plan` | `plan` | `[]` | `destructive-write` | `preferred` tool. Apply a plan through the guarded write seam. Pair `mode:"dry-run"` to preview — the returned `mode` / `filesystemApplied` reflects the real write. |
| `copy_form_ui_pattern` | `noop` | `[]` | `read-only` | Pure offline FormIR planning. |
| `form_delete_control` | `plan` | `[]` | `destructive-write` | Removes a control. |
| `form_set_properties` | `plan` | `[]` | `routine-dev-write` | `preferred` tool. Update several properties on one control atomically. |
| `form_duplicate_control` | `plan` | `[]` | `routine-dev-write` | Duplicate an existing control. |
| `form_align_controls` | `plan` | `[]` | `routine-dev-write` | `preferred` tool. Align several controls in one geometry operation. |
| `form_distribute_controls` | `plan` | `[]` | `routine-dev-write` | `preferred` tool. Distribute several controls evenly in one geometry operation. |
| `verify_form_ui` | `noop` | `[]` | `read-only` | `preferred` tool. Contract + geometry verification. |
| `render_form_preview` | `noop` | `[]` | `read-only` | Pure offline preview rendering. |
| `analyze_form_layout` | `noop` | `[]` | `read-only` | Pure offline FormIR / layout analysis (overlap, alignment, tab order). |
| `diff_form_preview` | `noop` | `[]` | `read-only` | Pure offline preview comparison. |
| `verify_form_bindings` | `noop` | `[]` | `read-only` | Runtime-assigned bindings vs real schema. Critical for `HR-14` (unattended forms). |
| `form_get_geometry` | `noop` | `[]` | `read-only` | Pure offline form-source read. |
| `form_list_controls` | `noop` | `[]` | `read-only` | Pure offline form-source read. |

> Note: the forms phase is dense. The `preferred` set is `analyze_form_ui`, `generate_form_design_plan`, `apply_form_design_plan`, `form_set_properties`, `form_align_controls`, `form_distribute_controls`, `verify_form_ui`. Prefer these 7 over their `specialized` neighbors.

### SQL / data (10 tools)

| Tool | Default behavior | Legacy aliases | Risk class | Notes |
|---|---|---|---|---|
| `link_tables` | `plan` | `[]` | `destructive-write` | Plan or create/relink backend `TableDefs`. |
| `relink_tables` | `plan` | `[]` | `destructive-write` | Re-link by path. |
| `localize_backend_links` | `plan` | `[]` | `destructive-write` | Convert remote links to local. |
| `unlink_table` | `plan` | `[]` | `destructive-write` | Drop one linked `TableDef`. |
| `import_queries` | `plan` | `[]` | `destructive-write` | Import saved-query set. |
| `compact_repair` | `plan` | `[]` | `destructive-write` | Defaults to the frontend. Pair explicit `accessPath` only when the target is the backend. |
| `relink_directory` | `plan` | `[]` | `destructive-write` | Re-link a directory. |
| `cleanup_access_operation` | `noop` | `[]` | `conditional-write` | `preferred` tool. Retire one Dysflow-owned operation through ownership-safe cleanup. `force:true` requires explicit human confirmation regardless of mode. |
| `query_execute` | `plan` | `[]` | `read-write` | `preferred` tool. **`mode:"read"|"write"` is REQUIRED** — `apply:true` alone never picks a write path (HR-3 of `dysflow-usage`). |
| `run_vba` | `plan` | `[]` | `critical-write` | Invoke a public VBA procedure. Plan/apply must agree on `procedureName`. If apply fails with `PROCEDURE_NOT_FOUND` / `PROCEDURE_NOT_CALLABLE`, force a manual VBE recompile (HR-7 of `dysflow-arnes`). |

### Project bootstrap & lifecycle

| Tool | Default behavior | Legacy aliases | Risk class | Notes |
|---|---|---|---|---|
| `migrate_project_config` | `plan` | `[]` | `routine-dev-write` | Rewrite `.dysflow/project.json` atomically (e.g. legacy `accessPath` -> `frontendFile`). |
| `access_force_cleanup_orphaned` | `noop` | `[]` | `read-only` (despite the name) | Lists orphan candidates OR retires one verified orphan PID. `pid:<positive>` requires `implements_check:"orphans_msaccess"` + `confirmedRequiresConfirmation:true` AFTER explicit human approval. |
| `clean_stale_markers` | `plan` | `[]` | `routine-dev-write` | Marker-file maintenance for the dispatch seam. |
| `setup_project` | `plan` | `[]` | `conditional-write` | Bootstrap a missing per-worktree project config. Plan + apply form a 2-call sequence. `projectId` is REQUIRED and the trio `projectId` + `projectChoiceReason` + `recoveryToken` is the ambiguity-recovery contract. |

> The 4 write-class tools listed here are the ones with `access` of `conditional-write` or `destructive-write` AND that participate in workflow orchestration. They are not exhaustive; see `get_capabilities.writeClassToolsPermitted` (44 in total) for the runtime-mandated list.

## Read-only tools (50 tools) — only listed for completeness

These never commit. `apply` is a no-op for them. Pattern:

| Tool | Notes |
|---|---|
| `get_capabilities` | Bootstrap. Captures the entire snapshot this file indexes. |
| `schema` | Catalog discover via `view:"compact"` (preferred) / `view:"full"` (catalog-wide). |
| `describe_tool` | One-tool on-demand introspection. |
| `resolve_project` | Per-call `projectId` + recovery-token trio receiver. |
| `register_worktree` | Pre-warm a sibling worktree context. |
| `clear_worktree_cache` | Force rescan. |
| `validate_manifest` | `preferred` tool. Pre-flight for `test_vba`. |
| `state` | Inspect operation, marker, lock, counter state during recovery. |
| `logs` | `preferred` tool. Filtered operation timeline after `diagnose` flags a failure. |
| `diagnose` | `preferred` tool. Start recovery with one aggregated health snapshot. |
| ... | see `get_capabilities.tools` keys for the runtime-mandated list. |

## Choosing between `apply:true` and `apply:false`

Decision rule per `dysflow-usage` §3 Decision Gates:

| Mode + tool class | Omitted `apply` resolves to | Recommended path |
|---|---|---|
| `"developer"` + `routine-dev-write` | commit | Confirm intent before invoking; pass `apply:true` explicit. |
| `"developer"` + `destructive-write` / `critical-write` | plan | Pass `apply:true` explicit to commit. |
| `"safe-by-default"` (default) + any write | plan | Pass `apply:true` explicit to commit. |
| Any mode + `read-only` / `noop` | no-op | `apply` is ignored. Never pass `diff:true` for read-only tools. |

The per-call write-gate is AUTHORITATIVE and is never bypassed, independent of mode:

- `writesProject.allowWrites === false` -> stop, regardless of mode (see `MCP_WRITES_DISABLED` / `CAPABILITIES_DISALLOW_WRITE`).
- `humanCompilePending === true` before `test_vba` / `run_vba` -> stop, ask the human.
- `cleanup_access_operation({force:true})` -> require explicit human confirmation.
- `access_force_cleanup_orphaned({pid:positive})` -> require `implements_check:"orphans_msaccess"` + `confirmedRequiresConfirmation:true`.

## When this file gets stale

If schema index/full adds a write-capable tool or changes its canonical intent,
this matrix goes stale. Re-capture the candidate runtime and run
`assets/scripts/verify-examples-vs-runtime.ps1`; never enumerate only the core
advertised `tools/list` surface.
