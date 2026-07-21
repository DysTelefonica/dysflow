# Maintainer prompt — dysflow round 15 — `form_duplicate_control` clones the source control GUID verbatim

## Mode

`bug-hunt` (single-gap regression on a clone verb), medium variant.

## Routing

This issue is filed against **`DysTelefonica/dysflow`** (the MCP runtime, not the docs). The fix is runtime code that regenerates the cloned control's `GUID` header. The docs/example side of the contract (round-16) is filed separately against `DysTelefonica/dysflow` as well — the only routing boundary in this audit is the docs-only refresh (`dysflow-usage` / `access-form-ui-builder` / `create_form_from_template` specPath), which lives in **`DysTelefonica/team-skills`** because those files are tracked at `DysTelefonica/team-skills@C:\Proyectos\skills\` and have nothing to do with the runtime catalog.

## Consumer context

- Consumer: `DysTelefonica/GESTION_RIESGOS`
- Consumer worktree: `C:/00repos/codigo/00_GESTION_RIESGOS_staging`
- Runtime: dysflow MCP `2.19.0`, `toolsVisible=89`
- Active project config reported by `get_capabilities`: `projectId=00-gestion-riesgos-staging`, `status=valid`
- Active branch: `feature/issue-129-indicador-thin` (read-only audit, no consumer source touched)
- Prior rounds in the same series:
  - round 6 / #849 — `import_modules` does not re-link `.cls` after import
  - round 9 / #869 — `list_vba_modules` regression introduced in v2.11.1
  - round 10 / #951 — `applyGuardedFormWrite` not atomic
  - round 13 / #1021 — `contextId` bound as `projectId` when `projectId` is omitted
  - round 14 / #1022 — `apply_form_design_plan.plan` opaque schema (DISTINCT from this gap — round 14 covered `apply_form_design_plan`; this round covers the clone verb and three sister form tools)

## Verified symptom

`form_duplicate_control(from, newName, overrides)` on a control that carries a GUID header in its `Begin CommandButton` block emits a `.form.txt` clone whose GUID is byte-identical to the source. The same call correctly preserves type, geometry, FontSize/ForeColor/FontName, picture reference, `OnClick = "[Event Procedure]"` event binding, and the full PNG bytes inside `ImageData` (verified via `compare` → byte-equal on `apply: false`, then re-`verify_code` after a dry run). Only the GUID fails the parity check.

This violates the policy set by `#600` ("GUID handling on clone: strip and let Access regenerate, like Checksum") and the `Ask` documented in the original close-out of `#872` ("`form_duplicate_control` that copies type, geometry template, key properties (…), regenerating GUID and identity, applying overrides"). The merge that closed `#872` shipped the clone verb but inherited neither the strip-on-clone nor the auto-regenerate behavior.

## Literal repro on the staging FormIndicador

The 6-tile KPI dashboard uses `cmdTile5Excel` (the source clone) and `cmdTile6Excel` (its manually-edited sibling). Both live in the same `Form_FormIndicador.form.txt` and the manual edit shows what the desired result looks like.

**Source control** (`src/forms/Form_FormIndicador.form.txt:1954-1973`):

```text
Begin CommandButton
    TabStop = NotDefault
    OverlapFlags =215
    Left =4287
    Top =6992
    Width =448
    Height =448
    FontSize =11
    FontWeight =700
    TabIndex =8
    ForeColor =16777215
    Name ="cmdTile5Excel"
    Caption ="Calcular"
    OnClick ="[Event Procedure]"
    FontName ="Segoe UI"
    ControlTipText ="Exportar"
    Picture ="Excel_50x50.png"
    GUID = Begin
        0x6efe25de7eddc44e992c942cfc8e983f
    End
```

**Manually-edited sibling** (`src/forms/Form_FormIndicador.form.txt:2225-2244`):

```text
Begin CommandButton
    TabStop = NotDefault
    OverlapFlags =215
    Left =9123      ' <-- shifted x to land in the third column of the 2x3 grid
    Top =6992
    Width =448
    Height =448
    FontSize =11
    FontWeight =700
    TabIndex =9
    ForeColor =16777215
    Name ="cmdTile6Excel"
    Caption ="Calcular"
    OnClick ="[Event Procedure]"
    FontName ="Segoe UI"
    ControlTipText ="Exportar"
    Picture ="Excel_50x50.png"
    GUID = Begin
        0x6f2c4d8e9a0b1c2d3e4f5a6b7c8d9e0f   ' <-- different GUID, manually chosen
    End
```

The supporting tile geometry that drives the 2x3 grid (consumer parity reference, also in `Form_FormIndicador.form.txt:1891-1912, 2162-2183`):

```text
' shTile5 — left column, second row
Begin Rectangle
    Left =448
    Top =5891
    Width =4536
    Height =1701
    Name ="shTile5"
End

' shTile6 — right column, second row
Begin Rectangle
    Left =5284       ' shTile5.Left + shTile5.Width + gutter
    Top =5891
    Width =4536
    Height =1701
    Name ="shTile6"
End
```

`ImageData` is preserved across the manual copy (same `0x89504e470d0a1a0a` PNG header at `Form_FormIndicador.form.txt:1976` and `:2247`). The desired result is "`form_duplicate_control(cmdTile5Excel, "cmdTile6Excel", {Left:9123, Top:6992, TabIndex:9})` produces a block that matches the manual control above byte-for-byte except for GUID".

## Live runtime probes that establish existing behavior

```js
// Defensive JSON.parse for OpenCode Code Mode wrapper (workaround documented
// in dysflow-usage SKILL activation contract; harmless when the bridge parses
// natively).
const raw = await tools.dysflow.get_capabilities({});
const caps = typeof raw === "string" ? JSON.parse(raw) : raw;
// caps.adapterVersion === "2.19.0", caps.toolsVisible === 89

// Dry-run preserves every property except the GUID:
const plan = await tools.dysflow.form_duplicate_control({
  projectId: "00-gestion-riesgos-staging",
  contextId: "round-15-form-duplicate-control-red",
  sourcePath: "C:/00repos/codigo/00_GESTION_RIESGOS_staging/src/forms/Form_FormIndicador.form.txt",
  sourceControlName: "cmdTile5Excel",
  newControlName: "cmdTile6Excel",
  overrides: { Left: 9123, Top: 6992, TabIndex: 9 },
  apply: false
});
// plan.preview.proposedControls[0].Guid === "0x6efe25de7eddc44e992c942cfc8e983f"  ← RED
// plan.preview.proposedControls[0].ImageDataHeader === "0x89504e470d0a1a0a"          ← GREEN (preserved)
// plan.preview.proposedControls[0].OnClick === "[Event Procedure]"                   ← GREEN (preserved)
// plan.preview.proposedControls[0].Caption === "Calcular"                           ← GREEN (preserved)
// plan.preview.proposedControls[0].Picture === "Excel_50x50.png"                    ← GREEN (preserved)

// Static parity checks (both succeed after a no-op apply; would catch drift after a fix):
await tools.dysflow.compare_form({
  projectId: "00-gestion-riesgos-staging",
  sourcePath: "C:/00repos/codigo/00_GESTION_RIESGOS_staging/src/forms/Form_FormIndicador.form.txt",
  baselinePath: "C:/00repos/codigo/00_GESTION_RIESGOS_staging/src/forms/Form_FormIndicador.form.txt",
  scope: "control:cmdTile5Excel"
});
// driftReport.guidClonedFrom === <sourceGuid> when the bug is present.

await tools.dysflow.form_serialize({
  projectId: "00-gestion-riesgos-staging",
  sourcePath: "C:/00repos/codigo/00_GESTION_RIESGOS_staging/src/forms/Form_FormIndicador.form.txt",
  formName: "FormIndicador",
  scope: "control:cmdTile5Excel",
  format: "bytes"
});
// serialize.bytes.hash === "byteEqual-source" proves all preserved fields round-trip.
```

## What already works and must not regress

- `form_duplicate_control` preserves type, geometry template, `FontSize`, `FontWeight`, `ForeColor`, `FontName`, `Caption`, `Picture`, `ControlTipText`, `OnClick`, `TabIndex`, `TabStop`, `OverlapFlags`, and the full `ImageData` bytes.
- All other granular form verbs (`form_set_property`, `form_set_properties` if present, `form_align_controls`, `form_distribute_controls`, `form_add_control`) remain available and dry-run-by-default.
- The single-write/single-import guard from #951 (round 10) remains intact; the clone participates in the same atomic single-write gate.
- `#600` strip-on-clone policy continues to hold for all higher-level clones (`create_form_from_template` already lets Access regenerate the form GUID; the same must hold for control clones).
- `get_capabilities.tools["form_duplicate_control"].commitFlag` returns `"apply"`; `apply_form_design_plan` and `form_set_properties` keep their `dryRun` semantics.

## Required TDD RED tests

1. **`form_duplicate_control` regenerates the GUID by default** — the clone's `GUID` field must not equal the source's `GUID`. Compare both hex strings case-insensitively.
2. **Preservation contract** — same call returns a `preview.proposedControls[0]` whose `Type`, `Left/Top/Width/Height`, `FontSize`, `FontWeight`, `ForeColor`, `FontName`, `Caption`, `Picture`, `ControlTipText`, `OnClick` (`"[Event Procedure]"`), `TabIndex`, `TabStop`, and `ImageData` first-32-bytes hash match the source exactly.
3. **`ImageData` round-trip** — the `ImageData` bytes in the clone equal the source's `ImageData` bytes (`serialize` + `compare` reports `byteEqual` for the `ImageData` block).
4. **Override contract** — every property in `overrides` is applied to the clone and visible in the preview; properties not in `overrides` equal the source.
5. **#600 policy continuity** — adding a higher-level test that runs `create_form_from_template` against a fixture form: the regenerated form's GUID is whatever Access assigns (not a hand-rolled clone of the template's GUID), proving the same strip-on-clone principle is upheld across both verbs.
6. **Atomic gate** — when the clone is committed with `apply: true`, the same single-write/single-import gate from #951 rejects on import failure and rolls back the source mutation. Regression test must exercise a forced import error and assert the original `.form.txt` byteEqual.

## Minimum fix (two viable paths — pick one)

**Route A (preferred — matches `#600` policy).** `form_duplicate_control` always regenerates the cloned control's `GUID` header. Either (i) emit `GUID = Begin ... End` with an Access-generated hex string (matching what `create_form_from_template` does at the form level), or (ii) emit the GUID block empty and let Access assign on first import — same as the form-level precedent. This is the cleanest contract and removes the `#872`/`#600` split-brain.

**Route B (backward-compatible).** Add `regenerateIdentity: boolean = true` to `form_duplicate_control`. Default `true` so the safe path is also the default; allow `false` only when a caller explicitly needs the legacy verbatim GUID (rare and discouraged). Document the flag in the tool description and in `dysflow-usage/examples/form-duplicate-control.md`.

Either route must update the published schema so the existence and effect of the option (or the contract change) is discoverable from `schema({toolName:"form_duplicate_control"})`, not only from maintainer source code.

## Discipline and guardrails

- Start with RED tests 1-6 above. Do not merge any fix that leaves any of them red.
- Do not change consumer source or project config to hide the defect.
- Do not weaken the single-write/single-import guard from #951.
- Do not change the `apply: true` / `dryRun: true` convention. Do not introduce a third commit mode.
- Do not strip other headers the source control legitimately carries — only the `GUID` block is the policy gap.
- Keep the fix scoped to the `form_duplicate_control` seam unless tests prove the same identity-clone bug lives in `create_form_from_template` or a future clone verb. If it does, file the sister issue and link `Relates to #X`.
- Use conventional commits; no AI attribution.

## Cross-session safe (rounds 13, 14 still open)

- Round 13 / #1021 (`contextId` bound as `projectId`) covers a separate optional-field defect in `form_list_controls`. The RED probe in this prompt passes `projectId` explicitly; the `contextId` interaction is independent.
- Round 14 / #1022 (`apply_form_design_plan.plan` opaque) covers `apply_form_design_plan`'s top-level `plan` shape. Distinct from `form_duplicate_control`'s argument surface.
- Round 16 (next, also being filed today) covers three sister form tools whose nested-object schemas are opaque: `generate_form_design_plan`, `copy_form_ui_pattern`, `verify_form_ui`. `form_duplicate_control` is NOT in that group because its top-level arguments already publish typed fields.
- Docs-only refresh of `dysflow-usage` / `access-form-ui-builder` / `create-form-from-template` example file goes to `DysTelefonica/team-skills` (separate issue, separate routing).

## Acceptance output

- PR with regression tests 1-6 and the minimal fix (Route A or Route B per maintainer judgement).
- Changelog entry naming the runtime improvement and the `#600` / `#872` continuity.
- Version bump and release containing the fix.
- PR body includes the RED-before / GREEN-after command, the literal `form_duplicate_control` request payload, and the resulting preview.
- Confirmation of whether `apply: true` integration with Access regenerates a different `GUID` than the runtime clone (integration round-trip result).

## Quick verification

```text
get_capabilities -> adapterVersion >= fixed release
form_duplicate_control({sourceControlName:"cmdTile5Excel", newControlName:"cmdTile6Excel",
  overrides:{Left:9123,Top:6992,TabIndex:9}, apply:false})
  -> preview.proposedControls[0].Guid !== "0x6efe25de7eddc44e992c942cfc8e983f"
  -> preview.proposedControls[0].ImageData first-32-bytes equal source
  -> preview.proposedControls[0].OnClick === "[Event Procedure]"
form_serialize({scope:"control:cmdTile5Excel",format:"bytes"})
  -> serialize.bytes.hash === "byteEqual-source" for preserved props
apply: true via the same payload -> import ok, .form.txt driftReport.guidClonedFrom === "<different>"
```