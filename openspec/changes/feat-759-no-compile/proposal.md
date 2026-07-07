# Proposal: feat-759-no-compile — Remove VBA compilation from dysflow

SDD: feat-759-no-compile
GitHub issue: https://github.com/DysTelefonica/dysflow/issues/759
Decisions: GH comment 4896478041 (hard break / v1.19.0 / no compile probe)
Strict TDD: ACTIVE
Target version: v1.19.0
Delivery: 2 chained PRs (force-chained) — Slice 1 first (PR-1), Slices 2+3+4 together (PR-2)
Branch: fix/mcp-friction-consolidation-v1.18

## Intent

Zero compilation anywhere in the dysflow runtime surface. Mutations persist via **save-only** — `RunCommand(280) = acCmdSaveAllModules` (save WITHOUT compile) — replacing the `RunCommand(126) = acCmdCompileAndSaveAllModules` coupling that is the structural root cause of the consumer-reported "Active lock detected" / `VBA_IMPORT_PHASE_FAILED` chain on broken projects. The human compiles in Access (`Debug ▸ Compile`); dysflow is a pure sync/import/export runtime. This removes the `compile_vba` MCP tool (so `toolsVisible` decreases by 1) and the `compile` / `rollbackOnCompileFail` parameters on `import_modules` / `import_all` (callers passing them are rejected by `additionalProperties:false` with `MCP_INPUT_INVALID`). The dead `params.compile` check in `vba-execution-adapter.ts:executeTestVba` is removed, `SCHEMA_PROPS.compile` is removed, and `VBA_COMPILE_ERROR` leaves the error taxonomy.

## Current State

Three compile mechanisms the epic removes:

1. **Direct tool** — `compile_vba` MCP tool, registered in `VBA_SYNC_TOOL_NAMES` (mcp-tool-registry.ts:11), routed via `dispatch-routes.ts:compile_vba` (`{ kind: "vba-sync", mutatesBinary: true }`), described in `tool-parity-registry.ts`, mapped via `EXECUTION_MAPPINGS.compile_vba = mapping("Compile", true)` in vba-execution-adapter.ts:25, handled by `vba-sync-adapter.ts:handles/execute`, with PowerShell `Invoke-CompileAction` (:4252) / `Invoke-CompileVbaProject` (:2848) / `New-CompileFailureResult` (:2821).
2. **Indirect parameters** — `compile` and `rollbackOnCompileFail` on `import_modules` (vba-sync-schemas.ts:89, 94–98) and `import_all` (vba-sync-schemas.ts:115); `COMPILE_MAPPING` + `rollbackOnCompileFail` block in vba-modules-adapter.ts:26–31; dead `truthy(params.compile)` check in `vba-execution-adapter.ts:executeTestVba`; `SCHEMA_PROPS.compile` in schema-props.ts:144.
3. **Internal compile-and-save coupling** — `RunCommand(126)` at four PowerShell sites: `:2205` (delete path, swallowed catch — the Active-lock bug), `:2247` (delete force/friction branch, swallowed catch), `:2662` (`Save-VbaProjectModules` first attempt, then `:2668` is the existing 280 fallback that becomes the standard), and the entire `Invoke-CompileVbaProject` body at `:2859` and `:2873` (disappears with the tool in Slice 3).

Inventory totals from `exploration.md`: **3 tool files + 2 schema files + 1 PS file + ~14 test files + 6 docs** verified; 0 drift; 2 `docs/archive/**` items to leave (historical record).

## Scope

### In scope
- **Slice 1 (PR-1)**: replace `RunCommand(126)` with `RunCommand(280)` at the two delete paths (`:2205`, `:2247`) and standardise `Save-VbaProjectModules` on its existing 280 fallback (drop the `:2662` 126 attempt). Pester tests + real-Access E2E against a broken-project fixture. *Line-number note:* the existing 280 fallback in `Save-VbaProjectModules` is at `:2668` (`$AccessApplication.DoCmd.RunCommand(280)`), not `:2669` — minor drift from the issue comment, verified against `scripts/dysflow-vba-manager.ps1`. `Invoke-CompileVbaProject` lines: declaration at `:2848`, first 126 at `:2859`, retry 126 at `:2873`.
- **Slice 2 (PR-2)**: drop `compile` and `rollbackOnCompileFail` from `import_modules` / `import_all` schemas; drop `SCHEMA_PROPS.compile`; drop the dead `params.compile` check in `executeTestVba`; drop `COMPILE_MAPPING` and the post-import compile block + rollback in `vba-modules-adapter.ts`; update tests.
- **Slice 3 (PR-2)**: drop `compile_vba` end-to-end (registry, routes, schema, description, `EXECUTION_MAPPINGS.compile_vba`, `handles/execute` branch, `dispatch-factory.ts` mention); drop `Invoke-CompileAction` / `Invoke-CompileVbaProject` / `New-CompileFailureResult` from the PS file; drop `VBA_COMPILE_ERROR` from the error taxonomy (adapters + PS).
- **Slice 4 (PR-2)**: sweep README.md, AGENTS.md, docs/mcp-examples.md, docs/release-checklist.md, docs/testing/repo-quality-gates.md, docs/testing/e2e-battery.md, docs/tech-debt/TRACKING.md. Update live OpenSpec specs (`openspec/specs/vba-manager-actions/spec.md` — remove compile requirements, ADDED "Save-only persistence (no compile)"; `openspec/specs/access-operation-contracts/spec.md` — drop compile-after-mutation). Update `tool-parity-registry.ts` and `mcp-tool-contracts` error taxonomy. CHANGELOG.md gets the v1.19.0 entry as the explicit closure point.

### Out of scope
- `verify_code` (read-only source/binary diff stays).
- CHANGELOG.md historical entries (`compile_vba` mentions at lines 186, 193, 290–308, 366, 419, 459, 467, 514, 530, 592, 611, 743, 829, 1257, 1445, 1941 — record, not change).
- `docs/archive/**` (historical; stays).
- Bug 2 — MCP client caches old adapter version after `dysflow update` (separate concern, not a compile issue).
- `openspec/specs/vba-inline-execution/spec.md` (inline execution compiles a temp module internally — different concern).

## Capabilities

### Modified capabilities
- **vba-manager-actions** — save-only persistence (`acCmdSaveAllModules` = 280) becomes the canonical mutation path. Compile removed. Spec adds an ADDED Requirement: "Save-only persistence (no compile)" codifying that mutations persist via 280 and never invoke 126.
- **mcp-stdio-adapter** — `compile_vba` tool removed from `VBA_SYNC_TOOL_NAMES` and `MCP_TOOL_ROUTES`. `compile` and `rollbackOnCompileFail` removed from `import_modules` / `import_all` Zod schemas (`additionalProperties:false` rejects unknown params with `MCP_INPUT_INVALID`). `dysflow_get_capabilities.toolsVisible` decreases by 1.
- **mcp-tool-contracts** — `EXECUTION_MAPPINGS.compile_vba` removed; `tool-parity-registry.ts` `compile_vba` description removed; error taxonomy drops `VBA_COMPILE_ERROR`; `mcp-tool-action-map` and `mcp-tool-action-map-source` test fixtures drop the `compile_vba` action.
- **access-operation-contracts** — no requirement that mutations compile the project; the mutation contract is "persisted via save-only".

### New capabilities
None.

## Approach

Per-slice approach with strict-TDD discipline. Each task follows RED → GREEN.

- **Slice 1 (PS, Pester + real-Access E2E)**:
  1. **RED**: write a Pester test in `scripts/tests/dysflow-vba-manager.Tests.ps1` that calls `delete_module` (mocked COM) against a broken-project fixture and asserts it succeeds without throwing; add a real-Access E2E in `test/e2e/import-modules-broken-project.e2e.test.ts` that creates a `.cls` with intentionally incomplete syntax (e.g. `Sub Bad : End Sub` — `Sub` with no `()` and no body) and runs `delete_module(force:true)` + `import_modules` + `verify_code`; expect `ok: true` end-to-end.
  2. **GREEN**: replace `RunCommand(126)` at `:2205` and `:2247` with bare `RunCommand(280)`; remove the `:2662` attempt in `Save-VbaProjectModules` (keep only the `:2668` 280 fallback). Add a small private helper `Save-ProjectModulesQuiet` to make the three save-only call sites uniform and audit-friendly.
  3. Verify the canonical Access Open workflow downstream (human opens Access, Debug ▸ Compile, fixes, runs tests) still works for the broken-project fixture.

- **Slice 2 (TS, vitest)**:
  1. **RED**: vitest tests asserting `import_modules` schema rejects `compile: true` with `MCP_INPUT_INVALID` (Zod `additionalProperties:false`); rejects `rollbackOnCompileFail: true`; `test_vba` schema does not expose `compile`; `SCHEMA_PROPS.compile` is `undefined` after import.
  2. **GREEN**: remove `SCHEMA_PROPS.compile` from `schema-props.ts:144–148`; drop `compile` and `rollbackOnCompileFail` from `import_modules` / `import_all` schemas in `vba-sync-schemas.ts:89,94–98,115`; drop the `truthy(params.compile)` check in `vba-execution-adapter.ts:executeTestVba`; drop `COMPILE_MAPPING` and the post-import compile block from `vba-modules-adapter.ts:26–31`; drop the HTTP mirror in `http-schemas.ts` + `http/server.ts`.

- **Slice 3 (TS, vitest + E2E)**:
  1. **RED**: vitest tests asserting `dysflow_get_capabilities.toolsVisible` (current: 68) drops to 67; `compile_vba` is not in `VBA_SYNC_TOOL_NAMES`; not in `MCP_TOOL_ROUTES`; not in `EXECUTION_MAPPINGS`; not in `tool-parity-registry.ts`; calling it via dispatch returns tool-not-found; `VBA_COMPILE_ERROR` is unreachable.
  2. **GREEN**: remove `compile_vba` from `mcp-tool-registry.ts:11`; remove the route from `dispatch-routes.ts`; remove the schema from `vba-sync-schemas.ts:161–165`; remove the description from `tool-parity-registry.ts`; remove `EXECUTION_MAPPINGS.compile_vba` from `vba-execution-adapter.ts:25`; remove `handles()` / `execute()` branches from `vba-sync-adapter.ts`; remove the `dispatch-factory.ts` mention; remove `Invoke-CompileAction`, `Invoke-CompileVbaProject`, `New-CompileFailureResult` from `scripts/dysflow-vba-manager.ps1`; remove `VBA_COMPILE_ERROR` from error taxonomy (adapters + PS). Delete the obsolete test files: `test/e2e/compile-error-capture.e2e.test.ts`, `test/quality-gates/mcp-e2e-compile-vba-mojibake-pin.test.ts`. Update `E2E_testing/mcp-e2e.mjs` (drop `compile:false` and the `compile_vba` call at `:280`).

- **Slice 4 (docs sweep)**:
  1. Grep-and-replace `compile` references in working docs (NOT CHANGELOG, NOT `docs/archive/**`, NOT `openspec/changes/archive/**`). Acceptable: the v1.19.0 CHANGELOG entry that closes the loop.
  2. Update `openspec/specs/vba-manager-actions/spec.md`: remove the "compile" requirements/scenarios hard-coding the compile surface (lines 163, 175 noted in exploration). ADDED Requirement: "Save-only persistence (no compile)" — `acCmdSaveAllModules` (RunCommand 280) is the canonical mutation persistence path; compile is never invoked.
  3. Update `openspec/specs/access-operation-contracts/spec.md`: drop the compile references at lines 31, 93, 96, 158 (safe — these are TypeScript-side; spec language just needs the "compiles" verbs removed).
  4. CHANGELOG.md: v1.19.0 entry — `removed: compile_vba tool; removed: compile and rollbackOnCompileFail parameters on import_modules/import_all; removed: internal compile-and-save coupling; mutations persist via save-only (acCmdSaveAllModules).`

## Affected Areas

| Area | Slice | Impact |
|---|---|---|
| `scripts/dysflow-vba-manager.ps1` — `:2205`, `:2247` | 1 | **Modified** — `RunCommand(126)` → `RunCommand(280)` |
| `scripts/dysflow-vba-manager.ps1` — `:2662` | 1 | **Removed** — drop the 126 attempt in `Save-VbaProjectModules`; keep the `:2668` 280 fallback |
| `scripts/dysflow-vba-manager.ps1` — `:2821` `New-CompileFailureResult` | 3 | **Removed** — entire function |
| `scripts/dysflow-vba-manager.ps1` — `:2848` `Invoke-CompileVbaProject` | 3 | **Removed** — entire function (incl. `:2859`, `:2873` 126 sites) |
| `scripts/dysflow-vba-manager.ps1` — `:4252` `Invoke-CompileAction` | 3 | **Removed** — top-level compile dispatcher |
| `src/shared/validation/schema-props.ts:144` `SCHEMA_PROPS.compile` | 2 | **Removed** |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts:89,94–98,115` | 2 | **Modified** — drop `compile` and `rollbackOnCompileFail` |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts:161–165` `compile_vba` | 3 | **Removed** |
| `src/adapters/vba-sync/vba-modules-adapter.ts:26–31` `COMPILE_MAPPING` + post-import compile | 2 | **Removed** |
| `src/adapters/vba-sync/vba-execution-adapter.ts:25` `EXECUTION_MAPPINGS.compile_vba` | 3 | **Removed** |
| `src/adapters/vba-sync/vba-execution-adapter.ts:executeTestVba` `truthy(params.compile)` | 2 | **Removed** (dead path) |
| `src/adapters/vba-sync/vba-sync-adapter.ts` `handles/execute` | 3 | **Modified** — drop `compile_vba` branch |
| `src/adapters/mcp/mcp-tool-registry.ts:11` `compile_vba` | 3 | **Removed** |
| `src/adapters/mcp/dispatch-routes.ts` `compile_vba` | 3 | **Removed** |
| `src/adapters/mcp/dispatch-factory.ts` `compile_vba` mention | 3 | **Removed** |
| `src/adapters/mcp/tool-parity-registry.ts` | 3, 4 | **Modified** — drop `compile_vba` description |
| `src/shared/validation/http-schemas.ts` + `src/adapters/http/server.ts` | 2 | **Modified** — drop `compile` from HTTP surface |
| `test/e2e/compile-error-capture.e2e.test.ts` | 3 | **Deleted** |
| `test/quality-gates/mcp-e2e-compile-vba-mojibake-pin.test.ts` | 3 | **Deleted** |
| `test/e2e/import-modules-*.e2e.test.ts`, `form-codebehind-stale-import.e2e.test.ts` | 2, 3 | **Modified** — drop `compile:true` / `compile:false` / `compile_vba` calls |
| `test/adapters/vba-sync/*.test.ts`, `test/adapters/mcp/*.test.ts`, `test/shared/validation/*.test.ts`, `test/core/contracts/vba-sync-port.test.ts`, `test/quality-gates/{mcp-e2e-tool-existence,mcp-e2e-suite-contracts}.test.ts`, `test/docs/agents-mcp-workflow-recipes.test.ts` | 2, 3 | **Modified** — drop `compile_vba` + `compile:true` test cases |
| `scripts/tests/dysflow-vba-manager.Tests.ps1`, `dysflow-vba-manager-import-lists.Tests.ps1`, `dysflow-access-runner-result-coverage.Tests.ps1` | 1, 3 | **Modified** — PS-side test updates |
| `E2E_testing/mcp-e2e.mjs` `:268–280` | 3 | **Modified** — drop `compile:false`, drop `compile_vba` call |
| `test/e2e/import-modules-broken-project.e2e.test.ts` (new) | 1 | **Added** — broken-project fixture E2E |
| `README.md` (tool list line 666; import schema lines 663, 665) | 4 | **Modified** — drop compile references |
| `AGENTS.md` (sync loop line 152; form/report sync lines 189, 191) | 4 | **Modified** — drop compile references |
| `docs/mcp-examples.md` (~line 44+) | 4 | **Modified** — drop `compile:true` examples |
| `docs/release-checklist.md` (lines 88, 96) | 4 | **Modified** — drop `compile_vba expected:"error"` |
| `docs/testing/e2e-battery.md` (lines 66, 126–127, 284, 290) | 4 | **Modified** — drop / update compile references |
| `docs/testing/repo-quality-gates.md`, `docs/tech-debt/TRACKING.md` | 4 | **Modified** — sweep compile references |
| `openspec/specs/vba-manager-actions/spec.md` | 4 | **Modified** — drop compile reqs; ADDED save-only persistence requirement |
| `openspec/specs/access-operation-contracts/spec.md` | 4 | **Modified** — drop compile-after-mutation language |
| `CHANGELOG.md` (v1.19.0 entry) | 4 | **Added** — closure note for the removal |

## Acceptance criteria

Each AC is verifiable by a test, a grep audit, or a structured tool result.

**Slice 1:**
- `delete_module(force:true)` succeeds against a broken-project fixture (module that does not compile). Asserted in `test/e2e/import-modules-broken-project.e2e.test.ts`.
- `import_modules` succeeds against a broken-project fixture. Same E2E.
- The `Active lock detected: the VBA component 'X' remains in the project after deletion attempt.` error is no longer reproducible from the runner path (regression test asserts the new error never surfaces).
- All Pester tests in `scripts/tests/` pass (`Invoke-Pester ./scripts/tests/`).
- `grep -nE 'RunCommand\(126\)' scripts/dysflow-vba-manager.ps1` returns no matches in the persistence paths (only inside `Invoke-CompileVbaProject`, which is removed in Slice 3).
- Real-Access E2E suite (`pnpm test:e2e`) green for the broken-project fixture.

**Slice 2:**
- `import_modules` schema with `compile: true` → `MCP_INPUT_INVALID` (Zod `additionalProperties:false` rejection). Vitest unit test.
- `import_modules` schema with `rollbackOnCompileFail: true` → `MCP_INPUT_INVALID`. Vitest unit test.
- `test_vba` schema does not expose `compile` property. Vitest unit test.
- `SCHEMA_PROPS.compile` is `undefined`. Vitest unit test on `schema-props.ts`.
- `vba-modules-adapter.ts` no longer has a post-import compile block (no `truthy(params.compile)` path). Grep audit.
- The `:2252` Pester test of "delete force/friction branch compiles" no longer references 126. Grep audit on `scripts/tests/`.

**Slice 3:**
- `toolsVisible` from `dysflow_get_capabilities` does not include `compile_vba`; total count drops by 1 (current 68 → 67). Vitest unit test on `dysflow-get-capabilities-tool.test.ts` and a real-MCP smoke test.
- `VBA_SYNC_TOOL_NAMES` does not contain `compile_vba`. Vitest unit test.
- `MCP_TOOL_ROUTES` has no `compile_vba` key (TypeScript compile enforces this).
- `vba-sync-schemas.ts` has no `compile_vba` schema. Grep audit.
- `tool-parity-registry.ts` has no `compile_vba` description. Grep audit.
- `vba-execution-adapter.ts` has no `EXECUTION_MAPPINGS.compile_vba`. Grep audit.
- `vba-sync-adapter.ts` has no `compile_vba` handler. Grep audit.
- `scripts/dysflow-vba-manager.ps1` has no `Invoke-CompileAction`, `Invoke-CompileVbaProject`, or `New-CompileFailureResult`. Grep audit.
- `VBA_COMPILE_ERROR` is not returned anywhere. Grep audit across `src/`, `scripts/`, and live OpenSpec specs.
- `mcp-tool-action-map` and `mcp-tool-action-map-source` test fixtures reflect the removal. Vitest.
- `E2E_testing/mcp-e2e.mjs` no longer references `compile_vba` or `compile:false`. Grep audit.

**Slice 4 (audit script — `grep -rnE '\bcompile\b' $WORKING_DOCS`, where `$WORKING_DOCS = {README,AGENTS,docs/mcp-examples,docs/release-checklist,docs/testing/repo-quality-gates,docs/testing/e2e-battery,docs/tech-debt/TRACKING}.md`):**
- 0 matches in any working doc.
- 0 matches in `src/` (excluding `compilerOptions` from tsconfig, which is in a different file).
- 0 matches in `src/adapters/mcp/tool-parity-registry.ts` (compile_vba entry gone).
- 0 matches in `src/adapters/mcp/mcp-tool-contracts` (VBA_COMPILE_ERROR gone).
- 0 matches in `openspec/specs/vba-manager-actions/spec.md` compile verbs; 1 ADDED Requirement "Save-only persistence (no compile)" present.
- 0 matches in `openspec/specs/access-operation-contracts/spec.md` compile verbs.
- `CHANGELOG.md` has the v1.19.0 entry explicitly closing the loop (single new entry referencing the removal).
- `docs/archive/**` and historical CHANGELOG entries retain `compile` references as record.

## Delivery plan

**PR-1 (Slice 1)** — non-breaking, fixes the Active-lock bug at the root.
- Branch: `fix/mcp-friction-consolidation-v1.18`
- Commit 1: `test(ps): add broken-project fixture E2E for delete + import (RED)` — `test/e2e/import-modules-broken-project.e2e.test.ts`, new Pester case in `scripts/tests/dysflow-vba-manager.Tests.ps1`.
- Commit 2: `fix(ps): persist mutations via save-only (RunCommand 280) in delete paths (GREEN)` — `scripts/dysflow-vba-manager.ps1:2205,2247,2662`.
- Commit 3: `test(ps): drop `:2252` Pester assertion that referenced 126` — test cleanup.
- File budget: ~3 files, ≤120 changed lines.
- Review budget: 400 lines default.
- Ships immediately on `staging`.

**PR-2 (Slices 2 + 3 + 4)** — hard break, breaking surface + docs sweep.
- Commit 1: `feat(mcp): remove compile + rollbackOnCompileFail params from import schemas (BREAKING)`.
- Commit 2: `feat(mcp): drop SCHEMA_PROPS.compile and dead params.compile check`.
- Commit 3: `feat(mcp): remove compile_vba tool end-to-end (BREAKING)`.
- Commit 4: `feat(mcp): drop VBA_COMPILE_ERROR from error taxonomy`.
- Commit 5: `chore(ps): remove Invoke-Compile* and New-CompileFailureResult from dysflow-vba-manager.ps1`.
- Commit 6: `test: drop compile_vba + compile:true test cases; delete compile-error-capture and mcp-e2e-compile-vba-mojibake-pin tests`.
- Commit 7: `chore(e2e): drop compile:false and compile_vba from mcp-e2e.mjs`.
- Commit 8: `docs: sweep compile references from README, AGENTS, mcp-examples, release-checklist, e2e-battery, repo-quality-gates, TRACKING, tool-parity-registry, mcp-tool-contracts`.
- Commit 9: `docs(openspec): drop compile requirements from vba-manager-actions and access-operation-contracts specs; add Save-only persistence requirement`.
- Commit 10: `docs(changelog): add v1.19.0 entry closing the compile surface loop`.
- Commit 11 (separate push per maintainer's "ya lo sacaremos en otro push"): tag `v1.19.0` + GitHub release.
- File budget: ~30 files, ≤700 changed lines (across 11 commits; per-commit ≤400 lines).
- Review budget: 400 lines per commit, force-chained.

PR boundary keeps Slice 1 reviewable as a focused bug fix and prevents consumers from sitting on a release that already removed the tool but still had the parameter (or vice versa).

## Risks

- **Loss of `rollbackOnCompileFail` (#732)** — imports no longer auto-rollback on a project-wide compile failure. Accepted: the human compiles and validates manually. Documented in the CHANGELOG migration note.
- **Breaking for consumers** calling `compile_vba` or passing `compile: true` / `rollbackOnCompileFail: true` — they get `MCP_INPUT_INVALID` (Zod schema rejection). Mitigated by the hard-break decision + clear CHANGELOG migration note. The error message names the rejected property.
- **`test_vba` against an uncompiled project** may behave differently than when dysflow force-compiled first. This is the intended workflow (human compiles first). If a real regression surfaces during UAT, it would be filed as a follow-up.
- **PowerShell helper `RunCommand(126)` call site audit** — `:2859` and `:2873` are inside `Invoke-CompileVbaProject` (removed in Slice 3). `:2205`, `:2247`, `:2662` are the only persistence sites; verified via direct file read. No other persistence paths use 126.

## Rollback plan

- **PR-1 (Slice 1)**: revert the PowerShell changes. The persistence paths fall back to `RunCommand(126)`. The Active-lock bug regresses for broken-project fixtures, but no consumer breaks (no schema change). Safe to revert.
- **PR-2 (Slices 2+3+4)**: revert the TS schema/tool changes. `compile_vba` reappears in `tools/list`; `compile` and `rollbackOnCompileFail` are accepted again; `VBA_COMPILE_ERROR` returns. Consumers restored, but Slice 1's bug fix is unaffected (it lives in PR-1, which is already merged and could be independently reverted).

## Dependencies

- **Strict TDD**: `pnpm test` (vitest), `pnpm test:e2e` (integration), `pnpm build`, `pnpm lint` before/after each slice.
- **Pester**: `Invoke-Pester ./scripts/tests/` for PS-side changes.
- **Real-Access E2E**: `pnpm test:e2e -- --run test/e2e/import-modules-broken-project.e2e.test.ts` (requires `ACCESS_VBA_PASSWORD` and a broken-project fixture).
- **Existing fixtures**: `E2E_testing/` harness for MCP E2E.
- **OpenSpec**: change folder `openspec/changes/feat-759-no-compile/` (this proposal → specs → design → tasks → apply → verify → archive).

## Success criteria

- All four slices green in CI (`pnpm test`, `pnpm test:e2e`, `Invoke-Pester`, `pnpm build`, `pnpm lint`).
- Audit script `grep -rnE '\bcompile\b' $WORKING_DOCS` returns **zero matches** in working docs and **zero matches** in `src/`, `scripts/`, live `openspec/specs/**`, `tool-parity-registry.ts`, and `mcp-tool-contracts`.
- `dysflow_get_capabilities.toolsVisible` = 67 (was 68).
- `VBA_COMPILE_ERROR` is unreachable from any code path.
- `RunCommand(126)` is gone from `scripts/dysflow-vba-manager.ps1` (the only call sites were inside `Invoke-CompileVbaProject` and the three persistence paths, all of which are removed or changed to 280).
- Adversarial review judges (loaded via `judgment-day` skill after PR-2 lands) confirm no residual compile surface — in code, in tests, in docs, in error taxonomy, in OpenSpec specs, in tool-parity-registry descriptions.
- `v1.19.0` published on GitHub with explicit CHANGELOG entry closing the loop; consumers have a single, unambiguous migration note.
