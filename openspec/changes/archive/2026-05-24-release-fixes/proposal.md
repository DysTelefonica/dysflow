# Proposal: Release Fixes

## Intent

Resolve blockers preventing a clean release, specifically fixing failing integration tests for `relink-directory`, correctly integrating `DYSFLOW_BACKEND_PASSWORD` in the PowerShell Access runner's relink operations, and eliminating the Node `DEP0190` deprecation warning on Windows during `dysflow update` and `install`. GitHub issues #293 and #294.

## Scope

### In Scope
- Correct connection string reconstruction in `scripts/dysflow-access-runner.ps1` to include `;PWD=<password>` when `DYSFLOW_BACKEND_PASSWORD` is present.
- Safe database opening in `Invoke-RelinkDirectory` and `Resolve-LinkChain` in `scripts/dysflow-access-runner.ps1` using `AccessPassword` and `BackendPassword`.
- Fix the E2E test setup for `chain A→B→C` in `test/e2e/access-relink-directory.test.ts` and `test/e2e/access-relink-directory-apply.test.ts` to allow testing link chains without hitting COM database validation errors (creating intermediate DBs with local tables before converting to links).
- Eliminate `DEP0190` warnings in `src/cli/commands/install.ts` by spawning `cmd.exe` directly on Windows with arguments instead of triggering `shell: true` with an array.

### Out of Scope
- Architectural changes to the CLI or runner infrastructure.
- Modifying other database engines or adapters.

## Approach

1. **PowerShell Runner Password Propagation & Connection Strings**:
   - Create a robust `Open-DatabaseWithPassword` helper in `scripts/dysflow-access-runner.ps1` that takes exclusive, read-only, and password arguments.
   - Update `Invoke-RelinkDirectory` to open scanned/applied databases with `$AccessPassword`.
   - Update `Resolve-LinkChain` to open linked databases using `$BackendPassword` (falling back to `$AccessPassword` if the database might be another frontend file).
   - In the relink loop, when setting `$tdW.Connect`, append `;PWD=$BackendPassword` if `$BackendPassword` is set.
   - Avoid setting `$tdW.SourceTableName` if the source table name is already equal to `$chain.resolvedTable`, avoiding COMExceptions.

2. **Integration Test Fixes**:
   - In E2E tests, the DAO engine throws when appending a linked table whose target is a link itself because DAO cannot verify the table schema.
   - Fix this by creating the link while the target database has a native table, then replacing the target database table with a linked table.

3. **DEP0190 Warning**:
   - In `src/cli/commands/install.ts`, detect if running on Windows and executing a `.cmd` command.
   - Instead of setting `shell: true` (which triggers DEP0190 in Node 22+ when passing an array of args), spawn `process.env.ComSpec || "cmd.exe"` with `/d /s /c` and `shell: false`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/dysflow-access-runner.ps1` | Modified | Add password handling to OpenDatabase, connection string reconstruction, and conditional SourceTableName assignment. |
| `test/e2e/access-relink-directory.test.ts` | Modified | Adjust E2E `chain A→B→C` test setup. |
| `test/e2e/access-relink-directory-apply.test.ts` | Modified | Adjust E2E `chain A→B→C` test setup. |
| `src/cli/commands/install.ts` | Modified | Execute Windows command files via `cmd.exe` explicitly, removing `shell: true`. |

## Success Criteria

- [ ] All integration tests pass via `pnpm exec vitest run --config vitest.integration.config.ts`.
- [ ] Relink directory operations correctly preserve the backend password when writing connection strings.
- [ ] No `DEP0190` warnings are produced on Windows during `install` or `update` operations.
