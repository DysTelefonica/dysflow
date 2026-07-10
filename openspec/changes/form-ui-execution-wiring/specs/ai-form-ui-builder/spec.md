# Delta for ai-form-ui-builder

No `openspec/specs/ai-form-ui-builder/spec.md` exists yet (capability shipped in #795 without a
formal spec). All requirements below are ADDED — they establish the first formal spec baseline for
this capability, replacing the informal stub behavior.

## ADDED Requirements

### Requirement: Operation Vocabulary

`FormUiDesignOperation.kind` MUST be restricted to `"add-control" | "move-control" |
"rename-control" | "set-property" | "delete-control" | "note"`. The apply dispatcher MUST reject any
other kind value with a fail-closed default branch, since plans are deserialized from JSON where
compile-time exhaustiveness does not protect against unknown values. `note` operations are
non-mutating but MUST be counted and surfaced in the result, never silently dropped.

#### Scenario: Known kind dispatches to its primitive

- GIVEN a plan operation with `kind: "set-property"`
- WHEN the plan is applied
- THEN the dispatcher routes it to the `setProperty` primitive

#### Scenario: Unknown or removed kind fails closed

- GIVEN a plan operation with a kind outside the supported union (e.g. a legacy `"group-controls"`
  deserialized from an old JSON plan)
- WHEN the plan is applied
- THEN the operation is rejected with `FORM_UI_UNSUPPORTED_OPERATION`
- AND no write occurs for that operation

#### Scenario: Note operation is counted, not skipped

- GIVEN a plan containing only `note` operations
- WHEN the plan is applied
- THEN the result reports the notes as advisories with a non-zero count
- AND the result MUST NOT report "nothing applied"

### Requirement: setProperty Primitive

`form-ir-service.ts` MUST provide a `setProperty` primitive that mutates a named control's layout
property entry in `FormIR`. It MUST refuse to mutate protected/metadata keys and MUST refuse to
change a control's `Name` through this primitive (identity changes belong to `rename-control`). When
the targeted property key already exists on the control but its existing entry is NOT scalar-kind
(e.g. a blob-kind entry such as `PrtMip`, `PrtDevNames`, `PrtDevModeW`, `PrtDevNamesW`, or
`FormatConditions`), the primitive MUST refuse the mutation with a typed error rather than pushing a
duplicate scalar entry alongside the existing blob entry. It MUST NOT touch `codeBehind`.

#### Scenario: Successful property mutation

- GIVEN a parsed `FormIR` with a control that has a `Caption` property
- WHEN `setProperty` is called with a new `Caption` value
- THEN the returned `FormMutationResult` reflects the updated value
- AND `codeBehind` is unchanged

#### Scenario: Protected/metadata key rejected

- GIVEN a parsed `FormIR`
- WHEN `setProperty` is called targeting a protected/metadata key
- THEN the primitive refuses the mutation and returns a typed error
- AND the `FormIR` is unchanged

#### Scenario: Refuses renaming via set-property

- GIVEN a parsed `FormIR` with a named control
- WHEN `setProperty` is called with `property: "Name"`
- THEN the primitive refuses the mutation and returns a typed error directing to `rename-control`

#### Scenario: Set-property on a blob-kind key is refused, zero writes

- GIVEN a parsed `FormIR` with a control whose existing entry for a given property key is
  blob-kind (not scalar-kind), and that key is not one of the protected/metadata keys
- WHEN `setProperty` is called targeting that property key
- THEN the primitive refuses the mutation with a typed error
- AND the `FormIR` is unchanged (no duplicate scalar entry is introduced)

### Requirement: deleteControl Primitive

`form-ir-service.ts` MUST provide a `deleteControl` primitive that removes a named control's layout
entry from `FormIR`. Deleting a control that does not exist MUST return a typed error without
partially mutating the tree. Deleting a control that (or whose descendant) carries an
`[Event Procedure]` binding, or that has named child controls, MUST fail closed with a typed error
and no mutation. This primitive protects only property-sheet-declared event-procedure bindings
visible to `FormIR` — it does not detect code-only references to the control (e.g. `WithEvents` in
the sibling `.cls`, `Me!ControlName`, `Controls("Name")`). It MUST NOT touch `codeBehind`.

#### Scenario: Successful control deletion

- GIVEN a parsed `FormIR` with an existing named control
- WHEN `deleteControl` is called with that control's name
- THEN the control's layout entry is removed from the returned `FormMutationResult`
- AND `codeBehind` is unchanged

#### Scenario: Deleting a nonexistent control

- GIVEN a parsed `FormIR` with no control matching the given name
- WHEN `deleteControl` is called with that name
- THEN the primitive returns a typed error
- AND the `FormIR` is unchanged (no partial mutation)

#### Scenario: Delete refused when control or a descendant has an event binding

- GIVEN a parsed `FormIR` where the target control, or one of its descendants, has an
  `[Event Procedure]` binding
- WHEN `deleteControl` is called with that control's name
- THEN the primitive refuses with `FORM_CONTROL_HAS_EVENT_BINDING`
- AND the `FormIR` is unchanged (no write occurs)

#### Scenario: Delete refused when control has named child controls

- GIVEN a parsed `FormIR` where the target control has one or more named child controls
- WHEN `deleteControl` is called with that control's name
- THEN the primitive refuses with `FORM_CONTROL_HAS_CHILDREN`
- AND the `FormIR` is unchanged (no write occurs)

### Requirement: Apply Dry-Run vs Write

`apply_form_design_plan` MUST NOT write anything when `dryRun` is requested — it returns the planned
operations only. When `apply: true`, it MUST write through the existing guarded seam (single
accumulated write, one guarded `import_modules`, rollback on import failure), mirroring `mutateForm`.

#### Scenario: dryRun returns plan without writing

- GIVEN a valid plan and `dryRun: true`
- WHEN the plan is applied
- THEN the response lists the planned operations
- AND the source `.form.txt` file is unchanged on disk

#### Scenario: Apply writes and imports successfully

- GIVEN a valid plan and `apply: true`, writes enabled
- WHEN the plan is applied
- THEN the source is mutated once and `import_modules` is invoked once
- AND the response reports success

#### Scenario: Import failure rolls back

- GIVEN a valid plan and `apply: true`, and the guarded import fails
- WHEN the plan is applied
- THEN the source file is restored to its pre-apply byte-identical content
- AND the response reports `FORM_IMPORT_GATE_FAILED`

### Requirement: Write-Gate Enforcement (CRITICAL)

`apply_form_design_plan`, `form_set_property`, and `form_delete_control` MUST each be classified as
a filesystem/binary-mutating route so that `MCP_WRITES_DISABLED` refuses the call BEFORE any write
is attempted, for both `apply: true` and any write-capable dry-run path. This invariant applies
identically to the two standalone tools as to the plan-based tool — they share the same
guarded-write seam and the same three-hardcoded-list route/dry-run/policy-exempt pairing.

#### Scenario: Writes disabled refuses before any mutation (apply_form_design_plan)

- GIVEN `MCP_WRITES_DISABLED` is set and `apply: true`
- WHEN `apply_form_design_plan` is invoked
- THEN the call is refused with a write-gate error
- AND the source file on disk is unchanged

#### Scenario: Writes disabled refuses before any mutation (form_set_property)

- GIVEN `MCP_WRITES_DISABLED` is set and `apply: true`
- WHEN `form_set_property` is invoked
- THEN the call is refused with a write-gate error
- AND the source file on disk is unchanged

#### Scenario: Writes disabled refuses before any mutation (form_delete_control)

- GIVEN `MCP_WRITES_DISABLED` is set and `apply: true`
- WHEN `form_delete_control` is invoked
- THEN the call is refused with a write-gate error
- AND the source file on disk is unchanged

### Requirement: Form Identity Validation (CRITICAL)

Before any write, `apply_form_design_plan` MUST validate that `plan.formName` is a non-empty
string, refusing otherwise so two empty/undefined names can never vacuously satisfy the comparison
below. It MUST resolve the target source and hard-validate that the parsed `formName` equals
`plan.formName`, comparing both sides trimmed and case-insensitively — VBA identifiers are
case-insensitive, so a case-only difference MUST NOT refuse a legitimate apply. On mismatch, it
MUST refuse with a typed error and perform no write.

#### Scenario: Mismatched form is rejected before any write

- GIVEN a plan whose `formName` does not match the resolved source form's name
- WHEN `apply_form_design_plan` is invoked with `apply: true`
- THEN the call is refused with a typed mismatch error
- AND no write occurs

#### Scenario: Case-only difference is not treated as a mismatch

- GIVEN a plan with `formName: "frmCustomer"` and a resolved source whose parsed form name is
  `"FrmCustomer"`
- WHEN `apply_form_design_plan` is invoked with `apply: true`
- THEN the call proceeds (case-insensitive, trimmed comparison matches)
- AND no mismatch error is returned

#### Scenario: Empty formName is refused before the comparison runs

- GIVEN a plan whose `formName` is an empty string
- WHEN `apply_form_design_plan` is invoked with `apply: true`
- THEN the call is refused with a typed error
- AND no write occurs
