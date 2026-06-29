# Verification Report: fix-mcp-backend-ddl-targeting

**Change**: `fix-mcp-backend-ddl-targeting`  
**Mode**: OpenSpec + Engram | Strict TDD ACTIVE  
**Date**: 2026-05-26  
**Verdict**: FAIL - 1 CRITICAL, 2 WARNING, 1 SUGGESTION

## Executive Summary

The targeted TypeScript contract tests, script static test, Pester helper tests, build, and a rerun of the full Vitest suite passed. Static inspection confirms the narrow implementation preserves explicit write targets through MCP schemas/mapping and routes PowerShell write actions to `databasePath/sourcePath > backendPath > CurrentDb` with backend-password opening and helper-owned cleanup.

Strict verification cannot pass the change because the core Access-runner scenario requires runtime evidence that `create_table`/`drop_table` with an explicit backend target modifies only the backend and not the frontend. No real Access E2E/regression exists for that scenario, and this verify run did not execute destructive Access DDL because the session constraints explicitly prohibited destructive Access operations.

## Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 6 |
| Tasks complete in `tasks.md` | 6 |
| Tasks statically verified | 6 |
| Tasks with runtime/unit evidence | 5 |
| Tasks missing required real Access E2E evidence | 1 |

## Build & Tests Execution

| Command | Result | Evidence |
|---------|--------|----------|
| `pnpm test test/adapters/mcp/legacy-parity.test.ts test/core/runner/access-runner.test.ts` | Passed | 2 files, 26 tests passed |
| `pnpm vitest run --config vitest.integration.config.ts test/scripts-access-runner.test.ts` | Passed | 1 file, 4 tests passed |
| `pnpm test:ps1` | Passed | 98 passed, 4 skipped, 0 failed |
| `pnpm build` | Passed | `tsc -p tsconfig.json` exited 0 |
| `pnpm test` first run | Failed then investigated | 1 unrelated `test/cli/install-utils.test.ts` failure from `VirtualAlloc failed` while launching `node -e` |
| `pnpm vitest run test/cli/install-utils.test.ts` | Passed | 1 file, 5 tests passed |
| `pnpm test` rerun | Passed | 49 files passed, 590 tests passed, 3 skipped |
| `pnpm lint` | Failed | Biome format/check issues in existing files, including changed `src/core/runner/access-runner.ts`; no code changed during verify |

## Spec Compliance Matrix

| Requirement | Scenario | Evidence | Result |
|-------------|----------|----------|--------|
| Legacy MCP Write Target Mapping | Legacy tool forwards explicit backend target | `test/adapters/mcp/legacy-parity.test.ts` passed; `src/adapters/mcp/schemas.ts` includes `WRITE_TARGET_OVERRIDE`; `toLegacyWriteFixtureRequest` preserves `backendPath` and `databasePath/sourcePath` | COMPLIANT |
| Legacy MCP Write Target Mapping | Legacy tool without backend target remains compatible | Existing dispatch tests passed; runner fallback only injects config backend when neither `backendPath` nor `databasePath` exists | COMPLIANT |
| Legacy MCP Write Target Mapping | No Conformidades Issue 18 table classification | `docs/testing/mcp-access-e2e.md` documents `TbCacheIndicadoresProyectoHeader`, `TbCacheIndicadoresProyectoDetalle`, `TbConfiguracion` as backend/global and `TbConfiguracionBackends` as frontend/local | PARTIAL - documented but no automated assertion |
| Legacy MCP Write Target Mapping | Unsafe secret or cleanup input is rejected safely | Secret env propagation/redaction tests pass; docs require operation-owned cleanup and no process kill | PARTIAL - cleanup failure path not exercised for this change |
| Explicit Legacy Write Database Target | Explicit backend target receives DDL | Static/unit tests verify request mapping and script dispatch, but no real Access test proves backend-only table creation/drop and frontend absence | UNTESTED - CRITICAL |
| Explicit Legacy Write Database Target | No explicit write target preserves compatibility | `test/core/runner/access-runner.test.ts` fallback test passed; dry-run behavior preserved in mapping/script inspection | COMPLIANT |
| Explicit Legacy Write Database Target | Protected backend password source and diagnostics | Runner env/redaction tests passed; script uses `DYSFLOW_BACKEND_PASSWORD` through `Open-DatabaseWithBackendPassword` | COMPLIANT |
| Explicit Legacy Write Database Target | Owned cleanup after write failure | Operation ownership/cleanup infrastructure remains in runner; helper-owned DB close/final-release is present | PARTIAL - targeted backend write failure cleanup was not executed |

**Compliance summary**: 4 compliant, 3 partial, 1 untested. Strict TDD requires runtime coverage for every spec scenario, so the untested DDL scenario blocks PASS.

## Correctness (Static Evidence)

| Area | Status | Notes |
|------|--------|-------|
| MCP schemas | Implemented | `exec_sql`, `run_script`, `create_table`, `drop_table`, `seed_fixture`, and `teardown_fixture` use `WRITE_TARGET_OVERRIDE` with `backendPath`, `databasePath`, and `sourcePath`. |
| MCP mapping | Implemented | `toLegacyWriteFixtureRequest` maps `backendPath` and `databasePath: databasePath ?? sourcePath`. |
| Runner fallback | Implemented | `AccessPowerShellRunner` only applies `config.backendPath` when request has neither `backendPath` nor `databasePath`. |
| PowerShell target selection | Implemented | `Resolve-WriteActionDatabase` and direct-target path route writes to explicit database targets before falling back to `CurrentDb`. |
| Script comment stripping | Implemented | `Split-SqlStatements` strips `--` comments outside single-quoted strings; Pester tests cover the behavior. |
| No Conformidades guidance | Implemented | Backend/global vs frontend/local table guidance exists in `docs/testing/mcp-access-e2e.md`. |

## Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Target precedence: `databasePath/sourcePath > backendPath > CurrentDb` | Yes | Confirmed in TypeScript mapping and PowerShell helper/direct-target path. |
| Preserve adapter contract without new public tool names | Yes | No public tool-name change found. |
| Use backend env password flow | Yes | `DYSFLOW_BACKEND_PASSWORD` is used; raw passwords are not added to tool payload contracts for this change. |
| Avoid generic process killing | Yes | No `Stop-Process -Name MSACCESS -Force` pattern found in implementation/docs for this change. |
| Real Access regression where practical | Not completed | Existing artifacts explicitly note no real Access E2E was added. This is the blocking verification gap. |

## TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD evidence reported | Yes | `apply-progress.md` contains a TDD Cycle Evidence table. |
| All implementation tasks have tests | Partial | PR1/PR2 have unit/static tests; PR3 docs/artifacts have no behavioral test, acceptable for docs but not for DDL scenario coverage. |
| RED confirmed | Partial | Apply-progress reports RED failures; current verify can confirm test files exist, not historical failure execution. |
| GREEN confirmed | Yes | Targeted tests passed 26/26; script static test passed 4/4; Pester passed 98 with 4 skipped. |
| Triangulation adequate | Partial | Mapping aliases and precedence are triangulated; real backend-vs-frontend DDL effect is not. |
| Safety net for modified files | Yes | Narrow and broad suites were executed. |

**TDD Compliance**: 4/6 checks passed, 2 partial.

## Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit/contract | 26 | 2 | Vitest |
| Static script/integration config | 4 | 1 | Vitest integration config |
| PowerShell helper/unit | 98 passed, 4 skipped | 2 | Pester |
| Real Access E2E | 0 | 0 | Not executed |

## Changed File Coverage

Coverage analysis skipped. `pnpm coverage` is available, but this verification was constrained to write only `verify-report.md` as an artifact; running coverage would create/update coverage output outside this change's verification artifact.

## Assertion Quality

Relevant change tests use production calls or script-content checks with concrete value assertions. No tautology assertions such as `expect(true).toBe(true)` were found in the inspected relevant test files.

**Assertion quality**: 0 CRITICAL, 0 WARNING for relevant tests.

## Quality Metrics

**Build/type check**: Passed via `pnpm build`.  
**Linter/format**: Failed via `pnpm lint`; Biome reports formatting/check issues across multiple files. This verify task did not fix formatting because code edits were prohibited.  
**Full tests**: Passed on rerun; first full run had a transient unrelated `VirtualAlloc failed` child-process allocation failure, then the isolated failing test and full suite both passed.

## Issues Found

### CRITICAL

- `UNTESTED`: No runtime Access E2E proves `create_table`/`drop_table` with explicit `backendPath`/`databasePath` changes only the backend and leaves the frontend without the test table. This directly maps to `access-core-runner` scenario "Explicit backend target receives DDL".

### WARNING

- `PARTIAL`: No Conformidades table classification is documented but not asserted by an automated docs/spec test.
- `QUALITY`: `pnpm lint` fails on formatting/check diagnostics, including changed files. Build and tests pass, but lint is not clean.

### SUGGESTION

- Add a guarded, opt-in real Access E2E that creates and drops a deterministic `ZZZ_DYSFLOW_BACKEND_TARGET_*` table against a disposable/backend fixture, then asserts the table exists only in backend and never in frontend. Keep it skipped unless required env/config is present.

## Final Verdict

FAIL.

The implementation is likely correct based on static and unit evidence, and non-destructive verification passed after retry. However, strict SDD verification cannot certify this change without a passing runtime test for the backend-only DDL behavior required by the spec.
