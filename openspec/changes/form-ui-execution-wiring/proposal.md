# Proposal: Form UI Execution Wiring (Epic #811 Phase 1 — #812 + #813)

## Intent

The shipped #795 AI form-UI pipeline (`analyze → map → plan → apply → verify`) has a fake tail:
`applyFormUiDesignPlan` is a stub that returns the plan echoed back and writes NOTHING, so
`apply:true` behaves identically to `dryRun`. #799's acceptance ("apply writes only through managed
source + guarded import") was never met. Additionally the operation vocabulary
(`move-control|rename-caption|group-controls|copy-pattern|note`) does not map to real primitives.
This change makes apply actually mutate `.form.txt` layout through the existing guarded seam, and
corrects the vocabulary — turning the pipeline from advisory into executable.

## Scope

### In Scope
- **#812 (pure core, no adapter):** add `setProperty` + `deleteControl` primitives to
  `form-ir-service.ts` (siblings of `addControl`/`moveControl`/`renameControl`), plus
  `SetPropertyInput`/`DeleteControlInput` in `form-ir.ts`, routed through the existing
  `mutationResult()`/`assertMetadataPreserved` wrapper. Layout/property entries only — never
  `codeBehind`. Standalone MCP tools `form_set_property`/`form_delete_control` (dual exposure).
- **#813 (adapter wiring):** thread `fileSystem`/`orchestrator` into `applyPlan`; dispatch each
  operation to its primitive; honor `dryRun`/`apply`; resolve+validate `sourcePath` via the #718
  resolver; extract a shared **write + guarded-import + rollback** helper reused by both `mutateForm`
  and apply-plan (single accumulated write, single `import_modules`, single rollback).
- Redesign `FormUiDesignOperation.kind` (see Decision).

### Out of Scope (non-goals)
- Phase 2+ perception/verify tools (#814 render preview, #815 layout lint, #816 align/distribute,
  #817 diff preview, #818 verify bindings, #819 skill/docs). No `group-controls` layout engine.
- No MCP-to-MCP calls. **Boundary invariant:** CodeGraph-VBA evidence stays caller-supplied; the
  write path never touches evidence.

## Decision (approve / adjust): `FormUiDesignOperation.kind`

**Recommended union:** `"add-control" | "move-control" | "rename-control" | "set-property" | "delete-control" | "note"`.

| Current kind | Verdict | Rationale |
|---|---|---|
| `move-control` | keep | direct → `moveControl`. |
| `rename-caption` | **replace with `set-property`** | `renameControl` renames the Access control IDENTIFIER (breaks `Me.ctl` refs + `[Event Procedure]` bindings). Caption is a PROPERTY. Map to `setProperty{property:"Caption"}`. |
| `group-controls` | **drop** | no destination primitive this phase; belongs to #816. |
| `copy-pattern` | **drop** | redundant with `referencePattern` + `copy_form_ui_pattern`, which already emit standard ops. |
| `note` | keep | non-mutating advisory; apply MUST count/report it, never silently skip. |
| — | **add `rename-control`** | primitive already exists, was never in the vocabulary. |
| — | **add `add-control`** | `addControl` exists; make plans expressible. |

**Why drop vs fail-closed:** apply was always a stub → zero working consumers → backward-compat cost
is ~zero. A variant that can only error is a lie in the type. So drop from the type, AND keep a
runtime fail-closed default branch (`FORM_UI_UNSUPPORTED_OPERATION`) because plans can be
deserialized from JSON where compile-time exhaustiveness does not protect. If the plan generator
currently emits dropped kinds, retarget those emissions to standard ops or `note`.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `ai-form-ui-builder`: `apply_form_design_plan` now performs guarded writes (was contract-only);
  operation vocabulary redesigned; two new mutation primitives/tools added.

## Approach

Reuse `mutateForm`'s guarded seam (exploration "Approach 1"): resolve managed source → parse
`FormIR` → apply primitives in memory → on `apply`, write once + one guarded `import_modules` +
rollback on failure. #812 lands first (pure, unit-tested), #813 consumes it.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `src/core/services/form-ir-service.ts` | Modified | add `setProperty`/`deleteControl`. |
| `src/core/models/form-ir.ts` | Modified | new input types. |
| `src/core/models/form-ui-builder.ts` | Modified | `kind` union redesign. |
| `src/core/services/form-ui-design-plan-service.ts` | Modified | replace stub; operation→primitive dispatch. |
| `src/adapters/vba-sync/vba-forms-ai-tools.ts` | Modified | `applyPlan` gains `fileSystem`/`orchestrator`. |
| `src/adapters/vba-sync/vba-forms-mutation-tools.ts` | Modified | extract shared write/import/rollback helper. |
| `src/adapters/vba-sync/vba-forms-adapter.ts` | Modified | thread ports at dispatch site. |
| `src/adapters/mcp/dispatch-routes.ts` | Modified | reclassify `apply_form_design_plan` (see Risk 1). |
| `src/adapters/mcp/dispatch-factory.ts` | Modified | add to `isDryRunCapableBinaryWrite` (Risk 1). |

## Risks

| Risk | Likelihood | Mitigation (REQUIREMENT) |
|---|---|---|
| **CRITICAL — write-gate bypass.** Route stays `mutatesBinary:false` → `MCP_WRITES_DISABLED` never fires after writes wired. | High if forgotten | **Required, together:** set `mutatesBinary:true`/`mutatesFilesystem:true` on the route AND add `apply_form_design_plan` to `isDryRunCapableBinaryWrite` (dispatch-factory.ts:137-142). Lock with route/write-gate regression tests. |
| **CRITICAL — wrong-form mutation.** `FormUiDesignPlan` carries no path. | High if unvalidated | Apply receives path/`projectId` out-of-band via #718 resolver; **hard-validate** parsed `formName` equals `plan.formName` before any write; mismatch → typed error, no write. |
| HIGH — `mutateForm` seam has no adapter-level test today. | Med | Strict TDD: RED port tests (mock `FormFileSystemPort` + stub orchestrator) before extension. |
| MED — helper duplication / partial-apply atomicity. | Med | Single accumulated write + single import + single rollback; extract shared helper. |

## Testability

- **#812 (unit at ports, `pnpm test`):** construct `FormIR`, assert `FormMutationResult` for
  `setProperty`/`deleteControl` incl. metadata-preservation refusals and new error codes.
- **#813 (adapter-port RED tests):** dryRun preview writes nothing; apply → write→import→success;
  import failure → rollback + `FORM_IMPORT_GATE_FAILED`; formName mismatch → no write; `note`-only
  plan reports "applied, 0 writes, N advisories"; unknown kind → fail-closed.
- **Route regression:** `dispatch-routes-risk`, `tool-parity-registry`, `mcp-tool-risks`,
  `get-capabilities-write-policy` updated in lockstep with reclassification.
- **E2E (optional, Windows+Access COM):** real `import_modules` round-trip.

## Rollback Plan

Revert the change branch. #812 is additive (new primitives/types) — safe to keep independently.
#813's route reclassification and `applyPlan` signature revert together; per-operation rollback is
built into the apply path (write original source back on import failure).

## Dependencies

- #813 depends on #812 (primitives must exist first).
- Reuses #718 form-source resolver and the existing `mutateForm` guarded import gate.

## Success Criteria

- [ ] `apply:true` on a real plan mutates `.form.txt` and re-imports; `dryRun` writes nothing.
- [ ] Import failure leaves the source file byte-identical to pre-apply (rollback verified).
- [ ] `MCP_WRITES_DISABLED` blocks `apply_form_design_plan` when writes disabled.
- [ ] A plan targeting a mismatched form is rejected before any write.
- [ ] `kind` union is `add/move/rename/set-property/delete-control/note`; unknown kinds fail closed.
- [ ] `note`-only plans report advisories, not "nothing applied".
- [ ] New primitives never touch `codeBehind`; metadata-preservation guard holds.
