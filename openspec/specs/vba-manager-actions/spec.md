# vba-manager-actions Specification

## Purpose

Behavioral contract for the ten `Invoke-*` action handlers extracted from
`scripts/dysflow-vba-manager.ps1`. Each handler MUST honor these requirements after extraction;
the dispatcher thin-router and all callers (MCP, CLI) MUST see identical observable behavior
before and after every slice.

## Global Invariants

| Invariant | Requirement |
|-----------|-------------|
| CLI surface | The script's `-Action` values and param block MUST NOT change |
| MCP contract | Tool names, input schemas, and output shapes MUST NOT change |
| Access behavior | COM/DAO sequences, encoding pipeline, and retry semantics MUST be preserved exactly |
| Explicit params | Each `Invoke-*` function MUST NOT access script-scope globals; all state arrives via declared parameters |
| Wiring change-detector | `test/scripts-vba-manager.test.ts` MUST use function-existence checks, not `split("\n")` + `toContain` source-text assertions |

---

## Requirements

### Requirement: Export Action Behavior

`Invoke-ExportAction` MUST iterate only the modules in `NormalizedModules`. When a module filter
is supplied it MUST export only matching modules. This is a pure refactor of the original inline
Export arm: if `Export-VbaModule` raises an exception the action MUST propagate it immediately
(abort-on-first-error), preserving the original behavior exactly. No per-module error catch or
accumulation is added.

#### Scenario: Filtered export targets only matching modules

- GIVEN `NormalizedModules` contains modules A, B, C and a filter selects A and C
- WHEN `Invoke-ExportAction` runs with that filter
- THEN only modules A and C are passed to `Export-VbaModule`
- AND module B is not touched

#### Scenario: Exception from Export-VbaModule propagates — Export aborts

- GIVEN `Export-VbaModule` throws an exception for one module
- WHEN `Invoke-ExportAction` runs
- THEN the exception propagates to the caller (dispatcher)
- AND no remaining modules are attempted after the failure

---

### Requirement: Import Action Behavior

`Invoke-ImportAction` MUST retry each module according to the configured retry policy. When any
module is created new (did not previously exist) the action MUST signal `createdNewComponents`
in its return value so the caller can trigger `Save-VbaProjectModules`. This signal MUST NOT be
communicated via a script-scope variable.

`Invoke-ImportAction`'s text normalization step (`Normalize-VbaImportText`) MUST preserve the
`Attribute VB_Name` line verbatim so its value reaches the compiled binary via `AddFromFile`.
Normalization MUST still strip every other `Attribute VB_*` line (e.g. `VB_GlobalNameSpace`,
`VB_Creatable`, `VB_PredeclaredId`, `VB_Exposed`) exactly as before; recognizing and keeping
`VB_Name` MUST NOT prevent later droppable attribute lines in the same directive block from being
stripped.
(Previously: `Normalize-VbaImportText` stripped every `Attribute VB_*` line including
`Attribute VB_Name`, silently dropping the module's identity before every `AddFromFile` write.)

#### Scenario: Retry on transient failure

- GIVEN `Import-VbaModule` fails on the first attempt for a module
- WHEN the retry count has not been exhausted
- THEN `Invoke-ImportAction` retries the import for that module

#### Scenario: New-component signal returned

- GIVEN an import creates at least one new VBA component
- WHEN `Invoke-ImportAction` returns
- THEN its return object carries `createdNewComponents = $true`
- AND no script-scope variable is set to communicate this

#### Scenario: All-failure result

- GIVEN all module imports fail
- WHEN `Invoke-ImportAction` returns
- THEN the result indicates failure with per-module error detail

#### Scenario: VB_Name reaches the compiled binary unchanged

- GIVEN a `.cls` source file whose first line is `Attribute VB_Name = "Form_X"`
- WHEN `Invoke-ImportAction` imports it via `Normalize-VbaImportText` and `AddFromFile`
- THEN the compiled binary's `Attribute VB_Name` value is `"Form_X"`, unchanged from the source

#### Scenario: VB_Name preserved while sibling VB_* attributes are still stripped

- GIVEN a `.cls` source file with `Attribute VB_Name = "Form_X"` followed by
  `Attribute VB_GlobalNameSpace = False`, `Attribute VB_Creatable = True`, and
  `Attribute VB_PredeclaredId = True`
- WHEN `Normalize-VbaImportText` processes the directive block
- THEN the `Attribute VB_Name` line is kept verbatim
- AND `Attribute VB_GlobalNameSpace`, `Attribute VB_Creatable`, and `Attribute VB_PredeclaredId`
  are all stripped
- AND processing continues correctly for any directive lines after `Attribute VB_Name` (no
  loop-control regression that skips or mis-handles later lines)

---

### Requirement: Header Merge Path VB_Name Handling Is Unaffected

`Split-VbaHeaderAndBody` and `Merge-AccessDocumentWithCanonicalHeader` MUST continue to treat
`Attribute VB_Name` as droppable header noise, exactly as before this change. The new
`Attribute VB_Name`-preserving behavior is scoped exclusively to `Normalize-VbaImportText`'s
import-normalization call sites; it MUST NOT be applied to the header/body split-and-merge path,
because the merge path re-injects a canonical header that already carries its own `VB_Name` line
— preserving the body's original line as well would produce a duplicate `Attribute VB_Name`
declaration and a compile error in `LoadFromText`.

#### Scenario: Merging a canonical header with local code does not duplicate VB_Name

- GIVEN a canonical header text containing `Attribute VB_Name = "Form_X"`
- AND a local document body whose original text (pre-split) also contained
  `Attribute VB_Name = "Form_X"`
- WHEN `Split-VbaHeaderAndBody` splits the body and `Merge-AccessDocumentWithCanonicalHeader`
  recombines it with the canonical header
- THEN the merged output contains exactly one `Attribute VB_Name` line
- AND no duplicate-declaration error condition is introduced

---

### Requirement: Delete Action Behavior

`Invoke-DeleteAction` MUST attempt deletion for every module in `NormalizedModules` and
accumulate errors without aborting early. The result MUST report which modules succeeded and
which failed.

#### Scenario: Partial delete accumulates errors

- GIVEN two modules to delete and the second raises an error
- WHEN `Invoke-DeleteAction` runs
- THEN the first module is deleted
- AND the result contains an error entry for the second module

---

### Requirement: List-Objects and Exists Behavior

`Invoke-ListObjectsAction` MUST return the full frontend inventory in the requested output
format (JSON or text). `Invoke-ExistsAction` MUST return a boolean presence result for the
named module; it MUST NOT modify the project.

#### Scenario: List-Objects JSON output

- GIVEN `-Json` is requested
- WHEN `Invoke-ListObjectsAction` runs
- THEN the result is valid JSON containing the inventory

#### Scenario: Exists — module absent

- GIVEN the named module is not in the VBE project
- WHEN `Invoke-ExistsAction` runs
- THEN the result indicates absence and no write to the project occurs

---

### Requirement: Run-Procedure Action Behavior

`Invoke-RunProcedureAction` MUST delegate to `Invoke-AccessProcedure` and return its result
unchanged.

#### Scenario: Run-Procedure passes args through

- GIVEN a procedure name and JSON args
- WHEN `Invoke-RunProcedureAction` runs
- THEN `Invoke-AccessProcedure` is called with the same procedure name and converted args
- AND the return value is passed through to the caller

---

### Requirement: Run-Tests Behavior

`Invoke-RunTestsAction` MUST read the procedures list from `ProceduresJsonFile`, delegate to
`Invoke-AccessProcedureBatch`, and return the batch result. If `ProceduresJsonFile` is non-empty
the action MUST attempt `Get-Content` before considering inline `ProceduresJson`; a missing file
therefore fails through the existing file-read error path and MUST NOT silently fall back to inline
JSON or invoke the batch runner.

#### Scenario: Missing procedures file attempts file read

- GIVEN `ProceduresJsonFile` is non-empty and does not exist
- AND inline `ProceduresJson` is also provided
- WHEN `Invoke-RunTestsAction` runs
- THEN the action attempts to read `ProceduresJsonFile`
- AND the file-read failure propagates
- AND `Invoke-AccessProcedureBatch` is not called

---

### Requirement: Generate-ERD Behavior

`Invoke-GenerateErdAction` MUST operate exclusively via DAO on the backend database path. It
MUST NOT open an Access COM session. The generated ERD file MUST be written to the resolved
destination path.

#### Scenario: No COM session opened

- GIVEN a valid backend path and destination root
- WHEN `Invoke-GenerateErdAction` runs
- THEN `Open-AccessDatabase` is never called
- AND `Export-DataStructure` is called with the resolved backend path

---

### Requirement: Fix-Encoding Behavior

`Invoke-FixEncodingAction` MUST apply the existing source encoding fix when `-Location Src`
is requested without requiring an open COM session. The preserved source-side behavior is to
rewrite UTF-8 BOM files as UTF-8 without BOM. ANSI-to-UTF-8 conversion remains covered by the
existing `Convert-AnsiToUtf8NoBom` helper, not by changing `Invoke-FixEncodingAction` behavior.
When `-Location Access` is requested it MUST delegate to the Access-side encoding helper.

#### Scenario: Src-only encoding — no COM session

- GIVEN `-Location Src`
- WHEN `Invoke-FixEncodingAction` runs
- THEN `Fix-EncodingInSrc` is called and no COM session is opened

#### Scenario: UTF-8 BOM source file is rewritten as UTF-8 NoBom

- GIVEN a `.bas` fixture file encoded as UTF-8 with BOM
- WHEN `Invoke-FixEncodingAction` processes it with `-Location Src`
- THEN the output file MUST be UTF-8 without BOM

#### Scenario: ANSI codec helper converts to UTF-8 NoBom

- GIVEN a `.bas` fixture file encoded in Windows-1252 ANSI
- WHEN `Convert-AnsiToUtf8NoBom` processes it
- THEN the output file MUST match the UTF-8 NoBom fixture byte-for-byte

---

### Requirement: P6 Test-Pattern Compliance

Every `Invoke-*` function MUST be testable via AST extraction (`[Parser]::ParseFile` +
`Invoke-Expression`) with I/O seams overridden through `function script:` overrides. No
behavioral Pester test MAY assert on raw source text (`Should -Match` on `$SourceText`) or
on internal call order.

#### Scenario: AST extraction finds the function

- GIVEN `dysflow-vba-manager.ps1` has been updated with an extracted `Invoke-*` function
- WHEN a Pester test calls `[Parser]::ParseFile` on the script
- THEN the AST contains exactly one `FunctionDefinitionAst` with the expected `Invoke-*` name

#### Scenario: Brittle source-text assertion absent

- GIVEN the final state of `dysflow-vba-manager.Tests.ps1`
- WHEN the file is searched for `Should -Match` used against `$SourceText`
- THEN no such assertion exists

#### Scenario: vitest wiring change-detector replaces split assertions

- GIVEN the final state of `test/scripts-vba-manager.test.ts`
- WHEN the file is searched for `split("\n")` used to navigate function bodies
- THEN no such pattern exists
- AND function-existence wiring checks are present instead

### Requirement: CLI Invoke-RunProcedureAction Honors the Same Allowlist as MCP `run_vba`

`Invoke-RunProcedureAction` MUST refuse to call `Invoke-AccessProcedure`
when the project config declares a non-empty `allowedProcedures` list AND
the requested procedure is not in that list. This mirrors the MCP adapter's
default-deny gate so consumers observe identical gate behavior across CLI
and MCP. **This is a forward-looking requirement; no PowerShell code is
changed in PR1.** A separate capability change is required to bring the
PowerShell layer to parity; until then, the MCP adapter gate is the only
enforcement point.

#### Scenario: CLI with allowlist configured — procedure outside the list is refused

- GIVEN `.dysflow/project.json` declares `allowedProcedures: ["Refresh"]`
- WHEN `Invoke-RunProcedureAction` runs with `-ProcedureName "DeleteAll"`
- THEN the action MUST return an error result whose message contains
  the literal substring `allowedProcedures`
- AND `Invoke-AccessProcedure` MUST NOT be invoked
- (Pin: a future Pester test in `test/scripts-vba-manager.Tests.ps1` —
  `Invoke-RunProcedureAction refuses procedure outside allowedProcedures`.
  This test does NOT exist yet; PR1 does not write it. The scenario
  documents the contract for the eventual follow-up PR.)

#### Scenario: CLI with allowlist configured — procedure inside the list is honored

- GIVEN the same `allowedProcedures: ["Refresh"]`
- WHEN `Invoke-RunProcedureAction` runs with `-ProcedureName "Refresh"`
- THEN `Invoke-AccessProcedure` MUST be called exactly once with the
  same procedure name and converted args
- AND the action MUST pass the return value through unchanged
- (Pin: future test mirror; covered for the **MCP** path by
  `test/adapters/mcp/tools.test.ts` `allowedProcedures — procedureName
  allowlist for run_vba alias`.)

#### Scenario: CLI with no allowlist — explicit dryRun is recognized (forward-looking)

- GIVEN `.dysflow/project.json` does NOT declare `allowedProcedures`
- WHEN `Invoke-RunProcedureAction` runs with `-ProcedureName "Anything"`
- THEN the action MUST proceed (today: it always proceeds; the future
  contract asserts that any default-deny introduced for parity offers a
  dry-run-class escape hatch consistent with the MCP adapter)
- (Pin: future test; PR1 does not write it.)

### Requirement: Runtime-Safe Export Write

`export_modules` and `export_all` MUST refuse any invocation whose **resolved** `destinationRoot` falls inside the dysflow production runtime directory, BEFORE the runner is invoked. The runner MUST NOT be invoked and the call MUST return `{ ok: false, error.code: "INVALID_INPUT" }`. The check MUST be applied uniformly whether `destinationRoot` is supplied explicitly as `exportPath`, as a parameter, or resolved from a project config or context. This MUST hold for both `export_modules` and `export_all`, including the `export_all prune:true` path.

#### Scenario: Explicit exportPath inside the production runtime — refused before runner

- GIVEN a caller passes `exportPath` whose absolute path falls inside the dysflow production runtime directory
- WHEN `export_modules` (or `export_all`) is invoked
- THEN the operation MUST return `{ ok: false, error.code: "INVALID_INPUT" }`
- AND the error message MUST mention the production runtime
- AND the runner MUST NOT be invoked

#### Scenario: Resolved destinationRoot inside the production runtime (no exportPath) — refused before runner

- GIVEN a caller does not pass `exportPath`
- AND the resolved `target.data.destinationRoot` (from `resolveExecutionTarget`) falls inside the dysflow production runtime directory
- WHEN `export_modules` (or `export_all`) is invoked
- THEN the operation MUST return `{ ok: false, error.code: "INVALID_INPUT" }`
- AND the runner MUST NOT be invoked
- AND no file system write under the resolved `destinationRoot` MAY occur

#### Scenario: destinationRoot outside the production runtime — runner invoked normally

- GIVEN a caller passes `exportPath` (or `destinationRoot`) that resolves outside the dysflow production runtime directory
- WHEN `export_modules` (or `export_all`) is invoked
- THEN the guard MUST NOT block
- AND the runner MUST be invoked

#### Scenario: test-runtime workdir is allowed (boundary case)

- GIVEN the resolved `destinationRoot` is inside a `test-runtime/` directory that itself lives OUTSIDE the resolved production runtime path
- WHEN `export_modules` (or `export_all`) is invoked
- THEN the guard MUST NOT block
- AND the runner MUST be invoked

#### Scenario: export_all prune refuses runtime destinationRoot pre-write

- GIVEN `export_all` is invoked with `prune: true`
- AND the resolved `destinationRoot` falls inside the dysflow production runtime directory
- WHEN the call resolves
- THEN the operation MUST return `{ ok: false, error.code: "INVALID_INPUT" }`
- AND the destructive `rm` loop MUST NOT execute
- AND the runner's `executeMappedTool` MUST NOT be invoked for the export step

### Requirement: Prune Allow-List Parity

The set of disk-file extensions that `export_all prune` and `import_all prune` are allowed to delete MUST equal the AGENTS.md documented allow-list (`.bas`, `.cls`, `.form.txt`, `.report.txt`). Files with any other extension — including the legacy `.frm` binary form format — MUST NOT be deleted by prune, regardless of whether they match a module name in the live VBE inventory.

#### Scenario: Legacy .frm orphan file is preserved by prune

- GIVEN an on-disk `LegacyForm.frm` orphan file exists under the resolved `destinationRoot`
- WHEN `export_all prune:true` runs after a clean export
- THEN the legacy `.frm` file MUST NOT be deleted
- AND the prune report MUST NOT list it under `deleted`

#### Scenario: .bas orphan file is pruned normally

- GIVEN an on-disk `Ghost.bas` orphan file exists under the resolved `destinationRoot`
- WHEN `export_all prune:true` runs after a clean export
- THEN the `.bas` file MUST be deleted
- AND the prune report MUST list it under `deleted`

#### Scenario: .cls orphan file is pruned normally

- GIVEN an on-disk `OrphanClass.cls` orphan file exists under the resolved `destinationRoot`
- WHEN `export_all prune:true` runs after a clean export
- THEN the `.cls` file MUST be deleted
- AND the prune report MUST list it under `deleted`

#### Scenario: Non-allow-listed file (e.g. .txt) is preserved

- GIVEN an on-disk `notes.txt` file exists under the resolved `destinationRoot`
- WHEN `export_all prune:true` runs after a clean export
- THEN the `.txt` file MUST NOT be deleted
- AND no file system write that removes it MAY occur

#### Scenario: Adversarial .frm masquerade attempt

- GIVEN an on-disk `ImportantModule.frm` orphan file exists under the resolved `destinationRoot`
- AND no module named `ImportantModule` exists in the live VBE inventory
- WHEN `export_all prune:true` runs after a clean export
- THEN the `.frm` file MUST NOT be deleted
- AND the prune report MUST NOT list it under `deleted`

---

### Requirement: Save-Only Persistence After a Mutation

The dysflow runtime MUST persist every VBA mutation via **cCmdSaveAllModules (RunCommand 280)**
and MUST NOT invoke any project-wide compile as part of the mutation path. The human compiles in
Access (Debug ▸ Compile) before re-running tests or trusting the binary.

#### Scenario: import_modules persists via save-only

- GIVEN a project config and a module source on disk
- WHEN import_modules is called
- THEN the binary persists the module via RunCommand(280) (cCmdSaveAllModules)
- AND no RunCommand(126) (cCmdCompileAndSaveAllModules) is invoked

#### Scenario: delete_module persists via save-only

- GIVEN a module exists in the project
- WHEN delete_module(force:true) is called
- THEN the binary persists the removal via RunCommand(280)
- AND no compile step is invoked

#### Scenario: mutation succeeds on a broken project (Active-lock regression anchor)

- GIVEN a project whose source contains a pre-existing compile error (incomplete VBA syntax that
  prevents a project-wide compile)
- WHEN delete_module(force:true) is followed by import_modules on the same binary
- THEN both operations succeed
- AND the Active lock detected: the VBA component 'X' remains in the project after deletion
  attempt. error NEVER surfaces
- AND persistence completes via RunCommand(280) only

### Requirement: No compile_vba Action

The compile_vba action MUST NOT exist in the ba-manager-actions capability surface. Removed
in v1.19.0 (feat-759-no-compile hard break).

#### Scenario: compile_vba absent from the action surface

- GIVEN a v1.19.0+ runtime
- WHEN a caller invokes a compile_vba action
- THEN the action is not present in the action surface
- AND no execution path returns VBA_COMPILE_ERROR

### Requirement: No compile Parameter on Mutation Imports

The import_modules, import_all, and 	est_vba actions MUST NOT accept a compile parameter.
ollbackOnCompileFail MUST NOT exist on import_modules. Removed in v1.19.0 (feat-759-no-compile
hard break).

#### Scenario: import_modules schema rejects compile

- GIVEN a v1.19.0+ runtime
- WHEN import_modules is called with compile: true
- THEN the schema validator (Zod dditionalProperties:false) rejects the call with
  MCP_INPUT_INVALID

#### Scenario: import_modules schema rejects ollbackOnCompileFail

- GIVEN a v1.19.0+ runtime
- WHEN import_modules is called with ollbackOnCompileFail: true
- THEN the schema validator rejects the call with MCP_INPUT_INVALID

#### Scenario: test_vba does not expose compile

- GIVEN a v1.19.0+ runtime
- WHEN the 	est_vba action schema is inspected
- THEN no compile property is exposed
