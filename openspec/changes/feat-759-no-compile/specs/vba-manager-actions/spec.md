# Delta for `vba-manager-actions`

## REMOVED Requirements

### Requirement: Run-Procedure and Compile Behavior

Verbatim from `openspec/specs/vba-manager-actions/spec.md:160-178`:

> `Invoke-RunProcedureAction` MUST delegate to `Invoke-AccessProcedure` and return its result
> unchanged. `Invoke-CompileAction` MUST invoke the compile helper and surface any compile error
> in the result without throwing.
>
> #### Scenario: Run-Procedure passes args through
>
> - GIVEN a procedure name and JSON args
> - WHEN `Invoke-RunProcedureAction` runs
> - THEN `Invoke-AccessProcedure` is called with the same procedure name and converted args
> - AND the return value is passed through to the caller
>
> #### Scenario: Compile error surfaced
>
> - GIVEN the VBA project contains a compile error
> - WHEN `Invoke-CompileAction` runs
> - THEN the result contains the error description
> - AND no exception propagates to the dispatcher

**Reason:** Hard break (GH #759 decision comment 4896478041). `Invoke-CompileAction`,
`Invoke-CompileVbaProject`, and `New-CompileFailureResult` are removed from
`scripts/dysflow-vba-manager.ps1`; `compile_vba` is removed from the MCP action surface; the
`VBA_COMPILE_ERROR` error code leaves the taxonomy. The Compile half of this bundled requirement
is no longer satisfiable.

**Migration:** `Invoke-RunProcedureAction` is unchanged — Run-Procedure scenario is preserved
verbatim under a new ADDED requirement. Compile-error-surfaced scenario has no replacement (no
runtime compile → no error to surface); consumers must compile manually in Access (`Debug ▸
Compile`).

## ADDED Requirements

### Requirement: Run-Procedure Action Behavior

`Invoke-RunProcedureAction` MUST delegate to `Invoke-AccessProcedure` and return its result
unchanged. Preserves the non-compile half of the previous bundled requirement.

#### Scenario: Run-Procedure passes args through

- GIVEN a procedure name and JSON args
- WHEN `Invoke-RunProcedureAction` runs
- THEN `Invoke-AccessProcedure` is called with the same procedure name and converted args
- AND the return value is passed through to the caller

### Requirement: Save-Only Persistence After a Mutation

The dysflow runtime MUST persist VBA mutations (`import_modules`, `import_all`, `delete_module`,
and any future mutation action) via **`RunCommand(280)` = `acCmdSaveAllModules`** (save WITHOUT
compile). Compilation MUST NOT be invoked anywhere in the persistence path. The human compiles
in Access.

#### Scenario: import_modules persists without compiling

- GIVEN a project config and a module source on disk
- WHEN `import_modules` is called
- THEN the binary persists the module via `RunCommand(280)`
- AND no compile step is invoked

#### Scenario: delete_module persists without compiling

- GIVEN a module exists in the project
- WHEN `delete_module(force:true)` is called
- THEN the binary persists the removal via `RunCommand(280)`
- AND no compile step is invoked

#### Scenario: mutation succeeds on a broken project (Active-lock regression)

- GIVEN a project whose source contains a pre-existing compile error (incomplete VBA syntax
  that prevents a project-wide compile)
- WHEN `delete_module(force:true)` and then `import_modules` are called in sequence
- THEN both succeed — no `Active lock detected: the VBA component 'X' remains in the project
  after deletion attempt.` error surfaces
- AND persistence completes via `RunCommand(280)` only

### Requirement: No `compile_vba` Action

The `compile_vba` action MUST NOT exist in the vba-manager-actions capability. Removed in
v1.19.0 (hard break).

#### Scenario: compile_vba absent from the action surface

- GIVEN a v1.19.0+ runtime
- WHEN a caller invokes a `compile_vba` action
- THEN the action is not present in the action surface
- AND no execution path returns `VBA_COMPILE_ERROR`

### Requirement: No `compile` Parameter on Mutation Imports

The `import_modules`, `import_all`, and `test_vba` actions MUST NOT accept a `compile`
parameter. `rollbackOnCompileFail` MUST NOT exist on `import_modules`. Removed in v1.19.0 (hard
break).

#### Scenario: import_modules schema rejects compile parameter

- GIVEN a v1.19.0+ runtime
- WHEN `import_modules` is called with `compile: true`
- THEN the schema validator (Zod `additionalProperties:false`) rejects the call with
  `MCP_INPUT_INVALID`

#### Scenario: import_modules schema rejects rollbackOnCompileFail parameter

- GIVEN a v1.19.0+ runtime
- WHEN `import_modules` is called with `rollbackOnCompileFail: true`
- THEN the schema validator rejects the call with `MCP_INPUT_INVALID`

#### Scenario: test_vba does not expose compile

- GIVEN a v1.19.0+ runtime
- WHEN the `test_vba` action schema is inspected
- THEN no `compile` property is exposed