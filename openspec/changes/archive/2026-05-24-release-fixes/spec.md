# Specification: Release Fixes

## Requirements

### REQ-1: relink-directory Password Propagation
- When the `relink_directory` action is invoked with `backendPassword`, the connection string of any modified table link (`$tdW.Connect`) MUST be updated to include `;PWD=<backendPassword>` if the backend password is not empty.
- If no backend password is set, the connection string MUST NOT include the `;PWD=` parameter.

### REQ-2: Safe Database Opening in PowerShell
- All database opens (`$dbEngine.OpenDatabase`) for files scanned/applied under `--root` MUST use the `$AccessPassword` (frontend password) if set.
- All database opens for link chains (`Resolve-LinkChain`) MUST attempt to open using `$BackendPassword` first, and if that fails (in case the file is another frontend database or does not use the backend password), fall back to `$AccessPassword`.

### REQ-3: Integration Test Chain Link Resolution
- The integration tests testing `chain A→B→C` (specifically, `test/e2e/access-relink-directory.test.ts` and `test/e2e/access-relink-directory-apply.test.ts`) MUST NOT fail during database setup.
- Since DAO throws an error when attempting to append a TableDef pointing to a database whose table is already linked (because it cannot fetch the schema), the test setup MUST construct the middle database as a native table database first, link the frontend to it, and only then recreate/re-link the middle database's table to the final backend database.

### REQ-4: DEP0190 Elimination on Windows
- Command execution of `.cmd` files (specifically `pnpm` and `npm`) on Windows MUST NOT set `shell: true` with an array of arguments, preventing Node's security deprecation warning `DEP0190`.
- Instead, the command MUST be routed through `cmd.exe` explicitly using `["/d", "/s", "/c", "<command>.cmd", ...args]` with `shell: false` (default).
