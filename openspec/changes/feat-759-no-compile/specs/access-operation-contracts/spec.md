# Delta for `access-operation-contracts`

## REMOVED Requirements

None.

The four `"compile"` mentions in `openspec/specs/access-operation-contracts/spec.md` (lines 31,
93, 96, 158) all describe TypeScript compile-time validation, NOT VBA compilation:

- Line 31: `THEN TypeScript MUST reject the call at compile time`
- Line 93: `Scenario: Existing callers compile unchanged`
- Line 96: `THEN those imports MUST continue to compile without renamed or removed symbols`
- Line 158: `THEN the build MUST fail (no local redeclaration allowed) at compile time`

None of these bind the dysflow runtime to a project-wide VBA compile, and none of them are
affected by the v1.19.0 compile removal. They stay in the live spec untouched.

## ADDED Requirements

### Requirement: Mutation Operations Do Not Invoke Compile

The dysflow runtime MUST NOT invoke a project-wide compile as part of any mutation operation.
Mutation operations (`import_modules`, `import_all`, `delete_module`) complete via save-only
persistence (`acCmdSaveAllModules` = `RunCommand(280)`). The human compiles in Access.

#### Scenario: mutation operations complete without compile

- GIVEN any dysflow mutation operation
- WHEN the operation runs
- THEN it does not invoke `acCmdCompileAndSaveAllModules` (= `RunCommand(126)`) anywhere in
  the execution path
- AND it does not invoke `Invoke-CompileAction` or `Invoke-CompileVbaProject`

#### Scenario: mutation rejects compile parameter at the schema boundary

- GIVEN a v1.19.0+ runtime
- WHEN a caller invokes `import_modules` with `compile: true`
- THEN the operation does not run
- AND the call returns `MCP_INPUT_INVALID` (Zod `additionalProperties:false` rejection)

### Requirement: Error Taxonomy Excludes `VBA_COMPILE_ERROR`

The `VBA_COMPILE_ERROR` error code MUST NOT exist in the dysflow error taxonomy. It was removed
in v1.19.0 (hard break — a compile error from dysflow is no longer possible because the runtime
does not compile).

#### Scenario: VBA_COMPILE_ERROR is not a recognized error code

- GIVEN a v1.19.0+ runtime
- WHEN any caller iterates the error taxonomy
- THEN `VBA_COMPILE_ERROR` is not present

#### Scenario: a broken-project mutation does not surface a compile error

- GIVEN a project whose source contains a pre-existing compile error
- WHEN a mutation operation runs
- THEN it completes successfully via save-only persistence
- AND no error envelope carries `VBA_COMPILE_ERROR`