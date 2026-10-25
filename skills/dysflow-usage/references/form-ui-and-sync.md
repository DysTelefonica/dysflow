# Form UI and sync

Form UI tools and source and binary sync.

## Form UI tools — perceive → act → verify

The form-UI builder surface treats an Access form like a web page: perceive it, act with rich verbs, re-verify. All operate on `FormIR` (parsed `.form.txt`); the write tools go through the same guarded write + import gate. Full workflow in the **`access-form-ui-builder`** skill; canonical flags/errors stay here.

| Phase | Tools | Class |
|---|---|---|
| **Perceive** | `analyze_form_ui` (roles), `analyze_form_layout` (geometry lint: overlap/alignment/tab-order), `render_form_preview` (SVG/ASCII from twips), `map_form_behavior` (control→handler→callpath; consumes codegraph-vba evidence) | read |
| **Plan** | `generate_form_design_plan`, `copy_form_ui_pattern` | read |
| **Act** | `apply_form_design_plan` (execute plan — WRITE), `form_align_controls`, `form_distribute_controls` (batch geometry — WRITE) | write |
| **Verify** | `verify_form_ui` (contract + geometry/tab-order/property), `verify_form_bindings` (ControlSource/RowSource vs real schema), `diff_form_preview` (before/after visual) | read |

Write tools follow the live matrix: prefer `apply:false` to preview and `apply:true` to commit;
use `diff` only when reported as a compatibility alias. `apply_form_design_plan`'s
`mode`/`filesystemApplied` reflect the real write; the pure planning preview is always
`mode:"dry-run"`.

`form_set_properties` accepts a `properties` map and validates every property name and value before opening a guarded write. Every form mutation is transactional: when the import gate fails, dysflow restores the original source instead of leaving a partial filesystem mutation.

## Source and binary sync

A form's code lives in `forms/<Name>.cls`; a copy sits in the `CodeBehindForm` section of `forms/Form_<Name>.form.txt`. Importing the `.cls` overwrites a functional edit made only in the copy, so `import_modules` / `import_all` refuse that case with `FORM_CODE_BEHIND_DIVERGES` (see `error-codes.md`). Case, whitespace and encoding differences are not divergences. Pass `acknowledgeCodeBehindWins:true` only when the `.cls` must win. `lint_form_code` reports the same condition as the `code-behind-divergence` warning.

Use the three primitives directly. Do not script a whole-project round trip through a single workflow tool.

1. **Compare:** `verify_code({cwd})`. Gate on `actionableOk`. Read `bulkImportable` and `bulkExportable` for the module lists; read `actionableDifferent[]` only with `diagnostic:true`.
2. **Source to binary:** `import_modules({cwd, moduleNames, apply:false})` to plan, then the same call with `apply:true`. Pass `moduleNames` explicitly.
3. **Binary to source:** `export_modules({cwd, moduleNames, destinationRoot, mutateBinary:false, apply:true})` writes inside the project. For a folder outside the project, use `exportPath`: an external `destinationRoot` is refused with `OUTSIDE_PROJECT_ROOT`.

Read the committed `.form.txt` and `.cls` files as evidence, never the database hashes.
