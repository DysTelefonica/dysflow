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

### Requirement: Run-Procedure and Compile Behavior

`Invoke-RunProcedureAction` MUST delegate to `Invoke-AccessProcedure` and return its result
unchanged. `Invoke-CompileAction` MUST invoke the compile helper and surface any compile error
in the result without throwing.

#### Scenario: Run-Procedure passes args through

- GIVEN a procedure name and JSON args
- WHEN `Invoke-RunProcedureAction` runs
- THEN `Invoke-AccessProcedure` is called with the same procedure name and converted args
- AND the return value is passed through to the caller

#### Scenario: Compile error surfaced

- GIVEN the VBA project contains a compile error
- WHEN `Invoke-CompileAction` runs
- THEN the result contains the error description
- AND no exception propagates to the dispatcher

---

### Requirement: Run-Tests Behavior

`Invoke-RunTestsAction` MUST read the procedures list from `ProceduresJsonFile`, delegate to
`Invoke-AccessProcedureBatch`, and return the batch result. If the file is missing the action
MUST return a failure result immediately without invoking the batch runner.

#### Scenario: Missing procedures file

- GIVEN `ProceduresJsonFile` does not exist
- WHEN `Invoke-RunTestsAction` runs
- THEN the action returns a failure result
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

`Invoke-FixEncodingAction` MUST apply encoding conversion to source files when `-Location Src`
is requested without requiring an open COM session. When `-Location Access` is requested it
MUST delegate to the Access-side encoding helper. Byte content of converted files MUST be
UTF-8 without BOM.

#### Scenario: Src-only encoding — no COM session

- GIVEN `-Location Src`
- WHEN `Invoke-FixEncodingAction` runs
- THEN `Fix-EncodingInSrc` is called and no COM session is opened

#### Scenario: Converted file is UTF-8 NoBom

- GIVEN a `.bas` fixture file encoded in ANSI
- WHEN `Invoke-FixEncodingAction` processes it with `-Location Src`
- THEN the output file MUST be UTF-8 without BOM

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
