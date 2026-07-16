---
name: access-form-ui-builder
description: "Trigger: Access form UI builder, analyze form UI, behavior map, design plan, apply form design plan, form mutation primitives (form_set_property, form_delete_control, form_align_controls, form_distribute_controls), pattern copy, verify form UI, render form preview (geometric SVG/ASCII render from FormIR twips). Guide AI-safe form UI changes including real guarded apply writes."
license: Apache-2.0
metadata:
  author: "gentleman-programming"
  version: "1.3"
  last_updated: "2026-07-11"
  requires_dysflow: ">=2.6.0"
---

## Activation Contract

Use this skill when designing, reviewing, or applying AI-assisted Microsoft Access form UI changes via the dysflow MCP — analysis, behavior mapping, plan generation, **real guarded apply writes**, or verification of form-mutation results.

## Hard Rules

- Treat `FormIR`, sibling `.cls` code-behind, and CodeGraph-VBA evidence as the source of truth.
- Do not use screenshots as the sole source for behavior-sensitive decisions.
- Do not edit raw `.form.txt` directly in this slice unless routed through an existing mutation+import tool path.
- Keep behavior changes explicit: a UI plan must preserve mapped controls, event handlers, and bindings unless an approved operation says otherwise.
- **CodeGraph-VBA boundary (issues #830, #881)**: `map_form_behavior` accepts caller-supplied `codegraphEvidence` (default contract) OR accepts `autoFetchCodeGraph: true` to relax the boundary one-way (dysflow → codegraph-vba). Auto-fetch probes `.codegraph-vba/` first (fork), then `.codegraph/` (upstream), and reports the resolved absolute directory in `codegraphIndexPath`; without auto-fetch or a usable index it is `null`. The internal invoker is opt-in per call; the default still requires caller-supplied evidence. Any invoker failure falls back to `.form.txt`-declared events plus a warning — never throws.
- **Write gate respected**: every write-class call (`apply_form_design_plan` with `apply:true`, `form_set_property`, `form_delete_control`, `form_align_controls`, `form_distribute_controls`) must pass the live `MCP_WRITES_DISABLED` + `allowWrites` gate. If writes are disabled, these calls refuse with the standard safety-stop error before any adapter dispatch — do not retry, do not "work around" the gate. Cross-reference `dysflow-usage` skill for the live write-flags matrix.
- **Preserve contract**: a plan that would drop a preserved event/binding from `FormUiBehaviorMap.controls[*].events` / `.bindings` / `.codegraphEvidence[*].handler` is rejected with `FORM_UI_PRESERVES_VIOLATION` (typed). Surface the offending control + operation in the result.
- **Atomic apply**: the multi-op plan is folded onto a single in-memory `FormIR`, then committed through a single `applyGuardedFormWrite` seam call (one write + one `import_modules` + one rollback on failure). No partial writes.
- **Identity-preserving geometry (#816)**: `form_align_controls` and `form_distribute_controls` move only the relevant axis property (`Left` for horizontal verbs; `Top` for vertical verbs); Name, type, Width, Height, other layout properties, event bindings, and code-behind are preserved verbatim. Use these instead of N brittle `form_move_control` calls when batching geometric edits.

## Decision Gates

| Situation | Gate |
|---|---|
| Need to understand an existing form | Run semantic analysis before planning. |
| Need to *see* a form's layout without opening Access | Use `render_form_preview({ sourcePath })` — pure, offline SVG/ASCII render from FormIR twips (issue #814). The output shape is the single primitive the sibling `diff_form_preview` (#817) composes pairs of frames from. |
| Need a visual before/after diff of two form layouts | Use `diff_form_preview({ beforePath, afterPath })` — composes two `render_form_preview` outputs into a structured `{added, removed, moved, resized}` change report with diff overlays on the SVG (`data-diff="..."` on each rect) and ASCII (legend + per-cell markers). Read-only; offline. Issue #817. |
| Need to validate `ControlSource` + `RowSource` against the live database schema | Use `verify_form_bindings({ sourcePath, schema })` — fan out one `get_schema` per table upstream and pass the aggregate (or pass a single-table `get_schema` payload `{schema:[...], tableName:"..."}`). Returns `{ formName, controls, findings[] }` with typed codes (`FORM_BINDING_MISSING_TABLE` / `FORM_BINDING_MISSING_COLUMN` / `FORM_BINDING_EMPTY` / `FORM_BINDING_SQL_UNPARSEABLE` / `FORM_BINDING_TYPE_MISMATCH`); severity is always `warning` (informational; never gating). Read-only; offline. Issue #818. |
| Need behavior-sensitive changes | Require behavior map with CodeGraph-VBA evidence. Pass `autoFetchCodeGraph: true` to relax the no-MCP-to-MCP boundary and let dysflow query codegraph-vba internally (issue #830). Pass caller-supplied `codegraphEvidence` instead if you want the original explicit-boundary contract. |
| Copying another form's pattern | Record the reference pattern separately; never overwrite target behavior. |
| Applying a plan | Dry-run first to preview the resulting source. Confirm before passing `apply:true`. Apply writes through guarded `import_modules` and respects the write gate. |
| Single-property tweak on a form control | Use the standalone `form_set_property` tool (mutation primitive, not plan-based). It honors the same write gate and routes through the same seam. |
| Removing a single form control | Use the standalone `form_delete_control` tool. Same write-gate and seam as above. |
| Aligning N controls to a common edge | Use the standalone `form_align_controls` tool (issue #816, Phase 3 Ergonomic actions). Replaces N `form_move_control` calls with one batch geometry verb. Identity-preserving. |
| Distributing N controls evenly along an axis | Use the standalone `form_distribute_controls` tool (issue #816, Phase 3 Ergonomic actions). Defaults to bounding-box distribution; pass `spacing` for exact gaps. Identity-preserving. |
| Verifying output | Compare against the source contract and behavior map, then surface actionable drift. |

## Execution Steps

1. Analyze the target `.form.txt` into semantic controls, roles, events, and bindings.
2. Map behavior by merging form events with CodeGraph-VBA call-path evidence. Two equivalent paths:
   - **Explicit (default contract)** — supply `codegraphEvidence` arrays yourself: `map_form_behavior({ sourcePath, codegraphEvidence })`.
   - **Internal fetch (issue #830 opt-in)** — pass `autoFetchCodeGraph: true` and let dysflow invoke codegraph-vba internally (one-way: dysflow → codegraph-vba). The adapter merges any caller-supplied `codegraphEvidence` with the invoker's result. On any invoker failure, the `.form.txt`-declared events are still surfaced and a warning is appended — never throws.
3. Generate a design plan that references mapped behaviors and explicit operations. Vocabulary: `add-control | move-control | rename-control | set-property | delete-control | note`. `rename-caption` and `group-controls` are NOT executable kinds — collapse `rename-caption` into `set-property {property: "Caption"}`. `group-controls` is a plan-input concept only (handled by `copy_form_ui_pattern`).
4. Optionally copy reference pattern intent into the plan inputs without erasing the target map.
5. Dry-run first: `apply_form_design_plan({ plan, dryRun: true })` returns the would-be-written source + advisories + `appliedContract`. No filesystem write, no `import_modules` call.
6. When ready to commit: `apply_form_design_plan({ plan, dryRun: false })` writes through the guarded seam (single write + single import + single rollback). Result includes `filesystemApplied: true` and `importGate: "passed"`. With writes disabled, this call refuses before any adapter dispatch.
7. Verify applied output against the behavior map and source contract with `verify_form_ui`.

## Output Contract

Return analysis, behavior map, plan, application result, or verification report with traceable inputs, warnings, and actionable failures. `apply_form_design_plan` results carry: `operationsApplied`, `preservedControls`, `warnings`, `advisories`, `filesystemApplied`, `importGate`, `appliedContract`, and (on apply) `importResult`.

## Form mutation primitives (since dysflow 2.6.0)

For single-control changes that don't need a full plan:

- **`form_set_property({ sourcePath, controlName, property, value, commitScope?, dryRun?, apply? })`** — set one property on one control. `commitScope` defaults to `"source-and-binary"`, which routes through the guarded import seam. Use `commitScope: "source"` with `apply: true` to persist only the `.form.txt` mutation and explicitly skip the Access import gate when the binary must be reconciled later. Both commit scopes honor the write gate.
- **`form_delete_control({ sourcePath, controlName, dryRun?, apply? })`** — remove one control. Same seam + write gate.

Both refuse with the standard safety-stop error if `MCP_WRITES_DISABLED` is set. Both honor `dryRun` for preview without write. A source-only property mutation returns `importGate: "skipped"`; it does not claim the Access binary is synchronized. Prefer these for surgical changes; reach for `apply_form_design_plan` only when you need the multi-op coordination + preserve-contract validation.

## Batch geometry verbs (issue #816, Phase 3 Ergonomic actions)

When you would otherwise chain N `form_move_control` calls with hand-computed target coordinates, use the batch geometry verbs instead:

- **`form_align_controls({ sourcePath, controlNames, edge, dryRun?, apply? })`** — align N named controls to a common edge (`left` | `right` | `top` | `bottom` | `center-horizontal` | `center-vertical`) using the MEDIAN of the selection. Preserves the spread of off-median outliers; not min/max. Identity-preserving: only the moved axis property changes; everything else (Name, type, Width, Height, other layout properties, event bindings, code-behind) is preserved verbatim.
- **`form_distribute_controls({ sourcePath, controlNames, axis, spacing?, dryRun?, apply? })`** — distribute N named controls evenly along an axis (`horizontal` | `vertical`). Without `spacing`, distributes across the bounding box of the selection (first control stays at start, last at end). With `spacing` (twips), uses the exact gap between consecutive control edges. Identity-preserving. Refuses `<2` controls (`FORM_MUTATION_INVALID`).

Both share the same `applyGuardedFormWrite` seam as `form_set_property` / `form_delete_control` / `apply_form_design_plan`: default dry-run, single atomic write, single `import_modules` gate, single rollback on failure, write-gated. The adapter accepts `controlNames` as either `string[]` or a comma-separated string.

## References

- `references/golden-path.md`
- Import-gate error recovery: `docs/diagnostics/form-import-gate-failures.md`.
- For tool names, flags, error codes: `dysflow-usage` skill (single source of truth, runtime-verified).
