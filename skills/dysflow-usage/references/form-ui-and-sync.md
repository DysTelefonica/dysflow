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

Import lint gate (#1863): `import_modules` / `import_all` lint each module they would load with the default rules. `apply:true` is refused with `LINT_FINDINGS_ERROR` only for a NEW error-severity finding; a finding the committed version (`HEAD`) already had is inherited and reported as a warning. The previous version is `HEAD` because the binary cannot be read without Access. `apply:false` lists every finding, marked new or inherited. The `p_Error` rules (`error-param-last`, `error-propagation-check`, `error-handler-writes-perror`, `test-ignores-perror`) apply only to methods that declare `p_Error`; `error-param-last` is an error.

A form's code lives in `forms/<Name>.cls`; a copy sits in the `CodeBehindForm` section of `forms/Form_<Name>.form.txt`. Importing the `.cls` overwrites a functional edit made only in the copy, so `import_modules` / `import_all` refuse that case with `FORM_CODE_BEHIND_DIVERGES` (see `error-codes.md`). Case, whitespace and encoding differences are not divergences. Pass `acknowledgeCodeBehindWins:true` only when the `.cls` must win. `lint_form_code` reports the same condition as the `code-behind-divergence` warning.

Use the three primitives directly. Do not script a whole-project round trip through a single workflow tool.

1. **Compare:** `verify_code({cwd})`. Gate on `actionableOk`. Read `bulkImportable` and `bulkExportable` for the module lists; read `actionableDifferent[]` only with `diagnostic:true`.
2. **Source to binary:** `import_modules({cwd, moduleNames, apply:false})` to plan, then the same call with `apply:true`. Pass `moduleNames` explicitly.
3. **Binary to source:** `export_modules({cwd, moduleNames, destinationRoot, mutateBinary:false, apply:true})` writes inside the project. For a folder outside the project, use `exportPath`: an external `destinationRoot` is refused with `OUTSIDE_PROJECT_ROOT`.

Read the committed `.form.txt` and `.cls` files as evidence, never the database hashes.

## `Tag` values in `.form.txt`

`Tag` is an ordinary Access property. FormIR keeps it like any other property (`src/core/services/form-ir-property-types.ts`), and `lint_form_code` accepts `Me.Tag`. No dysflow tool reads a `Tag` value: the runner takes no marker such as `dryRun`, category or priority from it. The older team-skills `vba-access` partial said otherwise; that claim is stale (#1859). Test metadata lives in the manifest (`tests/*.json`), and `test_vba` selects by it through `filter`.

The one place dysflow edits a JSON-looking `Tag` is the `dysflow migrate-dryrun --cwd <repo> (--dry-run | --apply | --undo <manifest>)` command. It rewrites the removed `dryRun` key to `apply` with the inverted value in `.bas`, `.cls` and `.form.txt` files (`src/core/services/dryrun-migration.ts`):

```text
Tag ="{""dryRun"": shouldPlan}"   ->   Tag ="{""apply"": Not (shouldPlan)}"
```

Inside a `.form.txt` string, `""` is the SaveAsText escape for one `"`.

## Import orchestration contract

`import_modules` and `import_all` follow one contract. The TypeScript core decides the passes, retries and saves (`src/core/services/vba-import-orchestration.ts`); PowerShell runs them against Access (`scripts/lib/dysflow-vba-import-transport.psm1`). The case matrix is `docs/architecture/vba-import-orchestration.md`.

1. **Caller order is kept.** `modules[]` lists one entry per requested module, in the order of `moduleNames`.
2. **Partial retry only after progress.** Only a multi-module import retries, only its failed modules, and only when the previous pass imported at least one module, up to `max(2, n)` passes. A single module, or a pass that imports nothing, ends at once with no retry.
3. **Save-only persistence, never a compile.** The save runs once, after every module succeeds; a failed import saves nothing. A new standard or class module is saved by name with `DoCmd.Save`. A re-imported form or report is saved with `RunCommand(280)` (`acCmdSaveAllModules`), with a per-module `DoCmd.Save` fallback (`Save-VbaProjectModules` in `scripts/dysflow-vba-manager.ps1`). Stale: the old partial said `RunCommand(280)` also runs after a new module.
4. **A save failure after a fully successful import does not demote an `ok` module.** When the form or report save fails, every module keeps `status:"ok"` and `error:null`. Two exceptions since #1912: when the batch also had failed modules, a module whose save only warned is `VBA_IMPORT_SAVE_FAILED`; and a save that reports missing exclusive access fails every module with `ACCESS_DATABASE_LOCKED`. The warning appears only as a runner status line; the MCP result has no field for it. Exception: when the named save of a new module fails, the whole call fails with `VBA_MANAGER_FAILED` and the `VBA_CREATED_MODULE_SAVE_FAILED:` prefix in `error.message`. Stale: the old partial said an `ok` module with a non-null `error` signals a save failure.
5. **Typed codes at two levels.** A failed import returns `VBA_IMPORT_FAILED` as `error.code`. Each failed module carries its own code, such as `VB_NAME_MISMATCH` or the default `VBA_IMPORT_PHASE_FAILED`, with `phase` and `remediation`. Over MCP, the per-module entries are in the runner's `DYSFLOW_RESULT` line inside `error.details.stdout`. The codes are in `error-codes.md`.
6. **Exit codes `0` and `1` only.** The runner exits `0` when the import succeeds and `1` when it fails; `error.details.exitCode` carries the value. Stale: the old partial also listed `2` (environment error) and `>2` (wrapper fault); the import path emits neither. Branch on `error.code`, not on the exit code.

On success the result is `{ok:true, modules:[...]}`; `moduleNames:[]` returns an empty `modules` array.
