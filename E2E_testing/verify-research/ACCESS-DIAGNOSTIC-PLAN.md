# Disposable Access import diagnostic plan

Status: **executed exactly once after approval**. The result is in `results/import-class-diagnostic.json`; no follow-on Access operation or retry was run.

## Single question

Capture the complete sanitized failure envelope returned by the one disposable `TempVerifyClass` import that failed in `test/integration/vba-source-comparison-real-fixture.test.ts:226`.

The harness will not continue into attribute, form, or functional-difference scenarios. It will make no claim about the cause before capturing the envelope.

## Source imports

A standalone file under `E2E_testing/verify-research/` will import only:

- `access`, `cp`, `mkdir`, `mkdtemp`, `rm`, `writeFile` from `node:fs/promises`;
- `platform`, `tmpdir` from `node:os`;
- `join`, `resolve` from `node:path`;
- Vitest `describe`, `expect`, `it`;
- `VbaSyncAdapter` from `src/adapters/vba-sync/vba-sync-adapter.ts`;
- `noopPreflightCleanup` from `test/_helpers/noop-preflight-cleanup.ts`.

It will not import or call compilation, `run_vba`, test-runner, installer, production-runtime, process-kill, or form-mutation helpers.

## Exact execution steps

1. Re-run live `bootstrap({phase:"sync"})`, schema discovery for the selected tools, the bounded capability/write-policy view, and `list_access_operations`.
2. Stop if runtime version/gates differ, an Access operation is active, Windows/PowerShell is unavailable, or neither supported password environment variable is present. Check password presence only; never print its value.
3. Confirm the two golden files exist:
   - `E2E_testing/NoConformidades.accdb`
   - `E2E_testing/NoConformidades_Datos.accdb`
4. Create `%TEMP%/dysflow-verify-import-diagnostic-<random>/` with `mkdtemp`.
5. Copy both golden databases into that directory. All Access calls target only the copied frontend. Keeping the backend beside it does **not** prove linked tables were relinked away from their original absolute targets, so no sandbox-topology isolation claim is made.
6. Create only `%TEMP%/.../src/modules/TempVerifyClass.cls`, using the exact `classContentV1` text from lines 199–217 of the existing integration test.
7. Construct `VbaSyncAdapter` with the copied frontend, temporary source root, repository `cwd`, `noopPreflightCleanup`, password passed directly from the environment, and a 90-second timeout.
8. Call `list_objects` once. If it fails, capture that sanitized envelope and stop; do not attempt the import.
9. Call exactly one `import_modules` operation with `{ moduleNames:["TempVerifyClass"], importMode:"Code", apply:true }` against the copied database.
10. Sanitize the complete result recursively before persistence: replace the temporary root, repository root, user profile, and absolute fixture paths with stable placeholders. Do not serialize environment variables or adapter construction options.
11. Write one bounded JSON artifact under `E2E_testing/verify-research/results/import-class-diagnostic.json` containing runtime/source versions, operation name, elapsed time, sanitized `ok/data/error/warnings`, and cleanup status.
12. In `finally`, remove the entire temporary directory with `rm(...,{recursive:true,force:true})`.
13. Re-run `list_access_operations`; report any live operation without killing it generically.
14. Compare Git status and golden-file hashes captured immediately before and after the run. Stop if either golden hash changes.

## Safety invariants

- Golden databases and `E2E_testing/src/**` are read-only inputs.
- The only write to an Access database is the one class import into the unique temporary frontend copy.
- No retry: an ambiguous timeout or result is recorded once and never replayed.
- No compile, VBA execution, tests inside Access, production install, or generic `MSACCESS.EXE` kill.
- No continuation into other mutations regardless of import success.
- The result is diagnostic evidence only; it does not authorize a production fix.

## Observed one-run outcome

- Pre-run and post-run operation registry: empty and healthy.
- Live runtime reported adapter `4.3.2`, process/project writes enabled, safe-by-default policy, and `humanCompilePending=false`. Repository-root project config discovery was missing/write-not-ready, so no MCP write was attempted. The explicitly authorized existing integration seam used only explicit temporary `accessPath`/`destinationRoot`; no external-path or write-gate bypass flag was supplied.
- Diagnostic Vitest command: exit 0; one test passed in 28.10 seconds.
- `list_objects` succeeded, then the one `import_modules` call succeeded for `TempVerifyClass` in the copied frontend.
- The original failure was therefore **not reproduced**. No cause is inferred and no retry was attempted.
- Both golden SHA-256 hashes were byte-identical before and after.
- Temporary workspace removal succeeded.
- The command selection requested object inventory and code import only; it requested no query/table/form opening, startup execution, `run_vba`, test execution, or compilation.
- Static runner evidence shows `Disable-StartupFeatures` runs unless the unpassed `AllowStartupExecution` switch is set, and canonical Access open sets `AutomationSecurity=1` plus hidden/non-user-controlled mode before `OpenCurrentDatabase`.
- This does not prove linked-table topology isolation and does not prove that no external backend could ever be touched by arbitrary Access startup behavior; the startup suppression and narrow command selection are the actual safety controls used here.
