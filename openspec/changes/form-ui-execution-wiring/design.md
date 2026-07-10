# Design: Form UI Execution Wiring (Epic #811 Phase 1 — #812 + #813)

## Technical Approach

Make `apply_form_design_plan` actually mutate `.form.txt` layout by reusing the existing
`mutateForm` guarded seam. Two slices: **#812** adds two pure FormIR primitives
(`setProperty`, `deleteControl`) as siblings of `addControl`/`moveControl`/`renameControl`;
**#813** extracts a shared write+import+rollback helper, threads `orchestrator`/`fileSystem`
into `applyPlan`, dispatches each operation to a primitive against ONE in-memory IR, and
reclassifies the route so the write-gate fires. Primitives operate on `.form.txt` layout/property
entries only, routed through `mutationResult()` → `assertMetadataPreserved`; `ir.codeBehind` is
never touched (code-behind is owned by the sibling `.cls`).

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Guarded write | Extract `applyGuardedFormWrite` (new `vba-forms-guarded-write.ts`), reused by `mutateForm` (1 op) AND apply-plan (N ops) | Copy the rollback block into applyPlan | One rollback contract, no drift; #813 loops the primitive in-memory then calls the helper ONCE |
| Atomicity | Single accumulated IR → serialize once → one `import_modules` gate → one rollback | Per-op write+import | Matches epic "guarded import" (singular); avoids N import cycles; whole-plan revert to byte-identical source |
| sourcePath | REQUIRED out-of-band via `params.sourcePath`/`path` — mirrors `mutateForm`'s hard guard (`vba-forms-mutation-tools.ts:31-39`): missing → hard `FORM_SPEC_MISSING` regardless of `projectId`. Resolved by `resolveManagedMutationSource` → #718 `resolveFormSourceCandidates`, called with `rawSourcePath` set to the caller-supplied `sourcePath`/`path` verbatim. `projectId` feeds `destinationRoot` resolution ONLY — never a substitute for `sourcePath`/`path` | Embed path in plan; derive path from `plan.formName` via the resolver's `identity` strategy | Plan is form-name-scoped and portable; path is an apply-time execution concern; passing `plan.formName` as the resolver's `formName` would derive the resolved path FROM the plan name, making the wrong-form guard below (`deriveFormName(resolvedPath) === plan.formName`) tautologically true — silently defeating it |
| Wrong-form guard | HARD-validate `plan.formName` is non-empty (reject empty/undefined before comparison — two empty names must never vacuously match), THEN `deriveFormName(resolvedPath).trim().toLowerCase() === plan.formName.trim().toLowerCase()` before any write; mismatch → `FORM_UI_PLAN_FORM_MISMATCH`, no write. Implementation note (optional): the comparison may reuse `source.data.moduleName` — already computed by `resolveManagedMutationSource` (`vba-forms-managed-source.ts:94`, itself `deriveFormName(sourcePath)`) — instead of re-deriving `deriveFormName(resolvedPath)` a second time, for a single source of truth | Trust the plan; case-sensitive exact match | Plan carries no path — silent wrong-form mutation is the CRITICAL risk; VBA identifiers are case-insensitive (AGENTS.md) so a case-sensitive compare would falsely refuse a legitimate apply |
| MCP exposure | Dual: `form_set_property`/`form_delete_control` as standalone tools AND plan kinds | Plan-only | Parity with `form_add_control`; single-shot changes without a full plan |
| Dropped kinds | `copy-pattern`/`group-controls` dropped (no destination/layout primitive this phase); `copyFormUiPattern` retargeted to emit `kind:"note"`. `rename-caption` is REMOVED and remapped to `set-property` (a caption is just the `Caption` layout property — no dedicated primitive needed). Unknown kinds fail closed at apply | Keep `copy-pattern`/`group-controls`; keep `rename-caption` as a distinct kind | No destination/layout primitive this phase → advisory, never a silent no-op; `rename-caption` collapses cleanly onto the generic property-set primitive |
| `targetPath` schema field | `apply_form_design_plan`'s shipped schema (`vba-sync-schemas.ts:653-656`) already declares an OPTIONAL `targetPath` property that current code never reads. This phase REMOVES `targetPath` from `apply_form_design_plan`'s schema (dead field, no known callers) — DECIDED, no hedge | Keep it unvalidated; OR validate it identically to `sourcePath` (containment check, runtime-dir refusal, formName gate) if a future caller needs a distinct write destination | An unvalidated `targetPath` would be an alternate, unguarded write destination bypassing every containment/formName check `sourcePath` gets — removing it closes that gap outright |

## Vocabulary (locked)

`FormUiDesignOperation.kind` = `"add-control" | "move-control" | "rename-control" | "set-property" | "delete-control" | "note"`.
Dispatch table (`operation.target` = control name, `operation.params` = rest):
add-control→`addControl`, move-control→`moveControl`, rename-control→`renameControl`,
set-property→`setProperty`, delete-control→`deleteControl`, note→counted no-op,
default→`FORM_UI_UNSUPPORTED_OPERATION` (fail-closed; plans deserialize from JSON so runtime exhaustiveness is required).

Relative to the current (#795) vocabulary (`"move-control" | "rename-caption" | "group-controls" |
"copy-pattern" | "note"`):
- **ADDED**: `add-control`, `rename-control`, `set-property`, `delete-control` (net-new kinds this
  phase wires to real primitives).
- **DROPPED**: `rename-caption` (remapped to `set-property`), `copy-pattern`, `group-controls`
  (both remapped to `note`).
- **RETAINED**: `move-control`, `note`.

See Architecture Decisions → "Dropped kinds" and Migration/Rollout for why the drops are a breaking
generation-contract change, not just an apply-path change.

## Interfaces (#812)

```ts
// src/core/models/form-ir.ts
export type SetPropertyInput = { controlName: string; property: string; value: string | number | boolean };
export type DeleteControlInput = { controlName: string };
// src/core/services/form-ir-service.ts
export function setProperty(ir: FormIR, input: SetPropertyInput): FormMutationResult;
export function deleteControl(ir: FormIR, input: DeleteControlInput): FormMutationResult;
```

`setProperty`: clone → `findControlNode` (miss → `FORM_CONTROL_NOT_FOUND`) → reject when
`property` is `Name` or a preserved-metadata key (`Checksum`/`Format`/`PrtDevMode`, exact match via
the existing `isPreservedMetadataKey`) → **`FORM_PROPERTY_PROTECTED`** (pre-mutation; `Name` renames
belong to `renameControl`) → inspect the EXISTING entry's `kind` for `property` (if present) and
reject with **`FORM_PROPERTY_NOT_SCALAR`** when it is `"blob"` (e.g. `PrtMip`, `PrtDevNames`,
`PrtDevModeW`, `PrtDevNamesW`, `FormatConditions` — none of which are in the protected-key
exact-match list above) — `upsertScalar` (`form-ir-service.ts:532-541`) matches only
`candidate.kind === "scalar"`, so a blind call against a blob-kind key would push a DUPLICATE
scalar entry under the same key instead of replacing it, corrupting the serialized `.form.txt` —
→ `upsertScalar(control, property, normalizeMutationValue(value))` → `mutationResult`
(`assertMetadataPreserved` is the backstop). New codes for `setProperty`: `FORM_PROPERTY_PROTECTED`,
`FORM_PROPERTY_NOT_SCALAR`.

`deleteControl`: clone → find control + parent (new `findControlParent` helper; miss →
`FORM_CONTROL_NOT_FOUND`) → **fail-closed** if control OR any descendant has `[Event Procedure]`
bindings → **`FORM_CONTROL_HAS_EVENT_BINDING`** (event handlers live in the `.cls`; deleting would
orphan them) → **fail-closed** if it has named child controls → **`FORM_CONTROL_HAS_CHILDREN`**
(bias-to-safe: no silent subtree loss; delete children first) → splice from `parent.children` →
`mutationResult`. New codes: `FORM_PROPERTY_PROTECTED`, `FORM_CONTROL_HAS_CHILDREN`.

`hasEventProcedureBinding` (`form-ir-service.ts:494-498`) is NON-recursive today — it inspects only
`node.entries` of the single node it is called on, not descendants. `deleteControl` requires a NEW
recursive descendant-walk (checks the target control's own entries, then every descendant's,
invoking the existing per-node check at each level) for the "OR any descendant" clause — do not
assume the existing helper can be reused as-is.

**Accepted scope boundary**: this fail-closed check protects ONLY property-sheet-declared
`[Event Procedure]` bindings, visible to pure `FormIR` inspection. It does NOT detect code-only
references to the control — `WithEvents` declarations in the sibling `.cls`, `Me!ControlName`, or
`Controls("Name")` lookups — which are invisible to a FormIR-only walk (no cross-file/CodeGraph
evidence is consulted this phase; see Boundary invariant below). `form_delete_control`'s MCP tool
description MUST document this limitation.

## Data Flow (#813 apply)

    apply_form_design_plan ─→ resolveManagedMutationSource (#718 resolver, containment, runtime refusal)
        │  formName mismatch → FORM_UI_PLAN_FORM_MISMATCH (no write)
        ▼
    parse .form.txt → IR ──(loop ops → primitives, in memory)──→ IR' ─→ serialize
        │ dryRun → preview, NO write        apply → applyGuardedFormWrite
        ▼                                        writeFile → import_modules gate
    note ops counted as advisories           fail → rollback to originalSource + FORM_IMPORT_GATE_FAILED

`executeFormUiBuilderTool`/`applyPlan` gain `orchestrator` (threaded from `VbaFormsAdapter`
line 123, mirroring `mutateForm`). Result: the existing `FormUiPlanApplicationResult`
(`mode`, `formName`, `operationsApplied`, `preservedControls`, `warnings`) is PRESERVED as-is and
gains the additive `advisories`, `filesystemApplied`, `importGate`, `importResult?` fields — no
`sourcePath` field on this core-level result (the resolved source path is an adapter-level
execution concern; if the adapter response needs to surface it, that is a separate additive field
on the MCP tool response, not on `FormUiPlanApplicationResult` itself).

## Route + write-gate (change together as ONE unit — THREE hardcoded lists, not two)

Three separate hardcoded tool-name lists gate write behavior for these tools. ALL THREE must be
extended in the same change unit — missing any one is a functional regression (either a silent
real write on a preview-intended call, or a legitimate preview refused as if writes were disabled):

- `dispatch-routes.ts` `apply_form_design_plan` → `{ mutatesBinary: true, mutatesFilesystem: true, risk: "routine-dev-write" }`. Two of the three route-table changes for this epic (`form_set_property`, `form_delete_control`) are NET-NEW route insertions, not reclassifications — the tool names must first exist in `mcp-tool-registry.ts`'s `DysflowMcpToolName` union and `tool-parity-registry.ts` (`getToolDefinition` / hidden-stub entry) before either route entry compiles. Risk tier for the two net-new tools, stated explicitly (`mcp-tool-risks.ts`): `form_set_property` → `"routine-dev-write"` (same tier as `apply_form_design_plan`, a routine property edit); `form_delete_control` → `"destructive-write"` (irreversible content removal, mirroring its sibling `form_deserialize`, which is also `destructive-write` in `dispatch-routes.ts`). Interaction with `DEFAULT_DRY_RUN_TABLE` (`write-execution-policy.ts`): `destructive-write` defaults `dryRun: true` in BOTH `safe-by-default` and `developer` mode, whereas `routine-dev-write` defaults `dryRun: false` in `developer` mode — a real divergence between the two tiers' policy-driven default. In practice this divergence is inert for `form_delete_control` because it sits in `POLICY_EXEMPT_TOOLS` (below): exempt tools bypass the policy-driven default entirely and keep explicit plan-by-default semantics (caller must pass `apply: true`) regardless of tier. The `destructive-write` tier also normally triggers `requiresConfirmOverwriteSource` in `developer` mode, but `requiresExportSourceConfirmation` (`write-execution-dispatch.ts:162`) hardcodes that guard to `export_modules`/`export_all` only, so it will NOT fire for `form_delete_control` even though it shares the tier. Net consequence: the risk tier is correct classification/documentation for `form_delete_control`, and — as long as it stays in `POLICY_EXEMPT_TOOLS` — has no effect on its write-gate or dry-run-default behavior; if a future change ever removes it from that exempt set, the `destructive-write` tier's stricter default-`dryRun:true`-in-developer-mode behavior would then apply.
- `dispatch-factory.ts:137-142` `isDryRunCapableBinaryWrite` += `"apply_form_design_plan"`, `"form_set_property"`, `"form_delete_control"`.
- `dispatch-factory.ts:~224-233` — a SECOND, independent tool-name list inside the `isDryRun` computation gates whether `resolveIsDryRun(normalizedInput)` is even consulted. If the 3 tools are added to `isDryRunCapableBinaryWrite` (137-142) but NOT to this second list, `isDryRun` collapses to the hardcoded `false` branch and a legitimate `dryRun: true` preview call is refused by `MCP_WRITES_DISABLED` (fails closed — a distinct regression from the write-gate bypass below, equally serious). Add the same 3 tool names here too.
- `src/adapters/mcp/write-execution-dispatch.ts` `POLICY_EXEMPT_TOOLS` (~lines 52-60) += `"apply_form_design_plan"`, `"form_set_property"`, `"form_delete_control"`. `resolveEffectiveDryRunInput` runs BEFORE the write-gate check and, in `developer` write-execution-policy mode, injects `dryRun: false` for any `routine-dev-write` tool NOT in this exempt set when the caller passes neither `dryRun` nor `apply`. Without this addition, a preview-intended `apply_form_design_plan({ plan })` call (no `dryRun`/`apply` key) would silently perform a REAL write in developer mode — this exempt set is exactly the "form mutation family keeps its own plan-by-default semantics" contract the sibling `form_add_control`/`form_move_control`/`form_rename_control`/`form_deserialize`/`create_form_from_template` tools already rely on.

Recommendation for a follow-up (non-blocking this phase): these three lists — plus the risk
classification on the route table itself — all express the same "which tools are the form-mutation
family" fact in three separate hardcoded places. Consolidating them into one shared tool-name-set
registry would remove this whole class of "added to N-1 of N lists" regression.

Same three-list pairing applies to the two new standalone tools. Split classification = write-gate
bypass (`MCP_WRITES_DISABLED` never fires) — the CRITICAL invariant.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/models/form-ir.ts` | Modify | Add `SetPropertyInput`/`DeleteControlInput` |
| `src/core/services/form-ir-service.ts` | Modify | Add `setProperty`/`deleteControl` + `findControlParent`; new error codes |
| `src/core/models/form-ui-builder.ts` | Modify | Redesign `FormUiDesignOperation.kind` union; extend `FormUiPlanApplicationResult` with additive `advisories`/`filesystemApplied`/`importGate` fields — existing `mode`/`formName`/`operationsApplied`/`preservedControls`/`warnings` fields are PRESERVED, not replaced (see Open Questions) |
| `src/core/services/form-ui-design-plan-service.ts` | Modify | Add operation→primitive dispatch; `applyFormUiDesignPlan` returns dispatched mutation over IR (core stays pure; adapter does I/O) |
| `src/core/services/form-ui-pattern-copy-service.ts` | Modify | Emit `kind:"note"` instead of `copy-pattern` |
| `src/adapters/vba-sync/vba-forms-guarded-write.ts` | Create | Shared write+import+rollback helper |
| `src/adapters/vba-sync/vba-forms-mutation-tools.ts` | Modify | Add `form_set_property`/`form_delete_control`; use shared helper |
| `src/adapters/vba-sync/vba-forms-ai-tools.ts` | Modify | `applyPlan` async, gains ports, resolves+validates path, loops+guarded-writes |
| `src/adapters/vba-sync/vba-forms-adapter.ts` | Modify | Thread `orchestrator` into `executeFormUiBuilderTool` |
| `src/adapters/mcp/mcp-tool-registry.ts` | Modify | Add `form_set_property`/`form_delete_control` to the `DysflowMcpToolName` union (net-new tool names, required before the route table compiles) |
| `src/adapters/mcp/tool-parity-registry.ts` | Modify | Add `getToolDefinition` entries (parity/hidden-stub metadata) for the 2 new tools |
| `src/adapters/mcp/dispatch-routes.ts` | Modify | Reclassify `apply_form_design_plan` to mutating; add 2 net-new route entries for `form_set_property`/`form_delete_control` |
| `src/adapters/mcp/dispatch-factory.ts` | Modify | Extend BOTH the `isDryRunCapableBinaryWrite` list (137-142) AND the second `isDryRun`-gating tool-name list (~224-233) with the 3 tool names |
| `src/adapters/mcp/write-execution-dispatch.ts` | Modify | Add the 3 tool names to `POLICY_EXEMPT_TOOLS` (~52-60) so plan-by-default semantics survive the dispatch-seam dry-run injection |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` | Modify | Schemas for the 2 new standalone tools; remove `targetPath` from `apply_form_design_plan`'s schema (dead field, no known callers — see Architecture Decisions) |
| `test/adapters/mcp/dispatch-write-policy-overrides.test.ts` | Modify | Existing lock file — add scenarios pinning that the 3 new tools join `POLICY_EXEMPT_TOOLS` and keep plan-by-default behavior in `developer` mode, mirroring the existing `catalog_add_control` scenario |

## Boundary invariant

CodeGraph-VBA evidence stays caller-supplied (`map_form_behavior` input only). NO MCP-to-MCP inside
dysflow. The apply/write path never reads or touches CodeGraph evidence.

## Testing Strategy

Note on seam ownership: single-op write→import→rollback-on-failure is ALREADY covered end-to-end
(including rollback-on-import-failure, #692) by `test/adapters/vba-sync/vba-forms-adapter-mutation.test.ts`.
This phase does NOT re-test that seam. The genuinely-NEW untested surface is the **multi-op flow**:
N heterogeneous operations accumulated on ONE in-memory IR → single write → single import → single
rollback.

| Layer | What | Approach |
|---|---|---|
| Unit (`pnpm test`) | `setProperty`/`deleteControl` incl. protected-key/Name refusal, event-binding (NEW recursive descendant-walk — `hasEventProcedureBinding` is non-recursive today) + child-control fail-closed, metadata preservation; operation→primitive dispatch incl. unknown-kind fail-closed | Construct `FormIR`, assert `FormMutationResult`/thrown `FormMutationError` — pure, no I/O |
| Adapter-port (RED first, genuinely NEW surface) | (a) multi-op plan (N heterogeneous ops on ONE in-memory IR) → single write → single `import_modules` → single rollback; (b) one operation fails mid-plan → whole apply aborts, ZERO writes, error names the failing operation; (c) neither `sourcePath` nor `path` supplied → `FORM_SPEC_MISSING` (mirrors `mutateForm`'s guard, `vba-forms-mutation-tools.ts:31-39`); (d) dryRun writes nothing; (e) formName mismatch — case-insensitive compare, non-empty-checked — → no write; (f) note-only → applied/0 writes/N advisories | Mock `FormFileSystemPort` + stub `orchestrator.executeMappedTool` |
| Route regression (lockstep) | `dispatch-routes-risk`, `tool-parity-registry`, `mcp-tool-risks`, `get-capabilities-write-policy`, `test/adapters/mcp/dispatch-write-policy-overrides.test.ts` (existing lock file — add scenarios for the 3 new `POLICY_EXEMPT_TOOLS` entries) | Assert reclassification + write-gate + policy-exempt plan-by-default behavior |
| Vocabulary migration regression | Existing generation-contract tests/fixtures that construct operations with a now-removed `kind` | Update `test/core/services/form-ui-design-plan-service.test.ts` (`kind: "rename-caption"`), `test/core/services/form-ui-pattern-copy-service.test.ts` (`kind: "copy-pattern"`), `E2E_testing/mcp-e2e.mjs` (`kind: "rename-caption"` in the `generate_form_design_plan` fixture) to the new vocabulary |
| E2E (Windows+Access COM, optional) | Real `import_modules` round-trip against `.accdb` | `E2E_testing/mcp-e2e.mjs` |

## Migration / Rollout

No data migration. #812 is additive/safe alone. #813 reclassification + `applyPlan` signature
revert together; per-op rollback built in.

The "zero working consumers" claim below is scoped to the APPLY path only (`applyFormUiDesignPlan`
was a stub that echoed the plan without writing). Plan GENERATION is NOT zero-consumer — it has
been live and tested since #795 (`generateFormUiDesignPlan`, `copy_form_ui_pattern`). Dropping/
remapping `rename-caption` → `set-property` and `copy-pattern`/`group-controls` → `note` is a
BREAKING generation-contract change: any caller (or test) constructing a `FormUiDesignOperation`
with a now-removed `kind` fails to type-check, and a JSON-typed caller that bypasses the compiler
fails at runtime via the fail-closed `FORM_UI_UNSUPPORTED_OPERATION` branch. This phase MUST update
`test/core/services/form-ui-design-plan-service.test.ts`, `test/core/services/form-ui-pattern-copy-service.test.ts`,
and `E2E_testing/mcp-e2e.mjs` (all three currently construct operations with a dropped `kind`) as
part of the SAME change unit — they are required to keep the build/test suite green, not incidental
cleanup. `copyFormUiPattern` now emits `note` — advisory-only, and IS backward-safe on the apply
side (apply was a stub → zero working apply-side consumers).

## Open Questions

- None blocking. `FormUiPlanApplicationResult` PRESERVES its existing `mode`/`formName`/
  `operationsApplied`/`preservedControls`/`warnings` fields (an existing passing test,
  `test/core/services/form-ui-design-plan-service.test.ts:80`, asserts `preservedControls`) and
  GAINS `advisories`/`filesystemApplied`/`importGate`/`importResult?` (additive) — no `sourcePath`
  field on this core-level result (see Data Flow).
