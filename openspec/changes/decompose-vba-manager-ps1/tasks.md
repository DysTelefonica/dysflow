# Tasks: decompose-vba-manager-ps1

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1 750 total across 7 PRs (~180–400 per slice) |
| 400-line budget risk | Low–Medium per slice (Slice 7: High) |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → PR 2 → PR 3 → PR 4 → PR 5 → PR 6 → PR 7 (stacked-to-main) |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Est. lines | Notes |
|------|------|-----------|------------|-------|
| S1 | `Invoke-ExportAction` | PR 1 | ~250 | Base: main; lowest-risk leaf |
| S2 | `Invoke-ListObjectsAction` + `Invoke-ExistsAction` | PR 2 | ~200 | Base: PR 1 branch |
| S3 | `Invoke-GenerateErdAction` | PR 3 | ~200 | Base: PR 2 branch; no COM |
| S4 | `Invoke-DeleteAction` | PR 4 | ~200 | Base: PR 3 branch |
| S5 | `Invoke-CompileAction` + `Invoke-RunProcedureAction` | PR 5 | ~250 | Base: PR 4 branch |
| S6 | `Invoke-RunTestsAction` + `Invoke-FixEncodingAction` | PR 6 | ~300 | Base: PR 5 branch; encoding fixtures required first |
| S7 | `Invoke-ImportAction` | PR 7 | ~400 | Base: PR 6 branch; retry loop + created-components signal; highest risk, last |

---

## Slice 1 — `Invoke-ExportAction` (PR 1, base: main) ✓ DONE (corrected: behavior-preserving)

**Spec refs:** Export Action Behavior; P6 Test-Pattern Compliance.
**NOTE (2026-06-02)**: Original apply had spurious try/catch around Export-VbaModule. Corrected — pure refactor, abort-on-first-error preserved. Commits rewritten clean.

- [x] S1.1 **Baseline green** — run `pnpm test:ps1` and `pnpm test`; confirm zero failures before touching any file.
- [x] S1.2 **RED Pester** — add `Describe 'Invoke-ExportAction'`; AST-extract; stub `Export-VbaModule`. Tests: (a) filtered export targets only matching modules, (b) exception from Export-VbaModule propagates (Export aborts), (c) no remaining modules attempted after first failure.
- [x] S1.3 **RED vitest** — wiring change-detector `expect(script).toContain("Invoke-ExportAction")`. Added test/scripts-vba-manager.test.ts to vitest.config.ts include globs.
- [x] S1.4 **Extract** — add `function Invoke-ExportAction` (`-Session -NormalizedModules -ModulesPath [-Json]`); zero script-scope reads; NO per-module try/catch (behavior-preserving). Replace Export `if` arm with one-line call.
- [x] S1.5 **GREEN** — Pester 138 passed / vitest 833 passed; 0 failures.
- [x] S1.6 **Verify diff ≤ 400 lines** — 230 lines (4 files, 186+/44-). Commits: `33e12ec` test + `cc5262e` refactor. NOT pushed.

---

## Slice 2 — `Invoke-ListObjectsAction` + `Invoke-ExistsAction` (PR 2, base: PR 1 branch)

**Spec refs:** List-Objects and Exists Behavior; P6 Test-Pattern Compliance.

- [x] S2.1 **Baseline green** — confirm `pnpm test:ps1` and `pnpm test` pass on the PR 1 branch.
- [x] S2.2 **RED Pester** — add `Describe 'Invoke-ListObjectsAction'` and `Describe 'Invoke-ExistsAction'` contexts; AST-extract each; stub `Get-FrontendInventory` and `Get-ExistsInfo` via `function script:`. Tests: (a) List-Objects JSON vs text routing, (b) Exists module-absent returns correct result without modifying the project. Both RED until S2.4.
- [x] S2.3 **RED vitest** — add wiring change-detectors for `Invoke-ListObjectsAction` and `Invoke-ExistsAction` in `test/scripts-vba-manager.test.ts`. RED until S2.4.
- [x] S2.4 **Extract** — add `Invoke-ListObjectsAction -Session [-Json]` and `Invoke-ExistsAction -Session -ModuleName [-Json]` to `scripts/dysflow-vba-manager.ps1`; replace their respective `elseif` arms with one-line calls.
- [x] S2.5 **GREEN** — run `pnpm test:ps1` and `pnpm test`; all new + existing tests pass.
- [x] S2.6 **Verify diff ≤ 400 lines**. Commit as `refactor(ps1): extract Invoke-ListObjectsAction + Invoke-ExistsAction — S2`. Open PR stacked to PR 1 branch.

---

## Slice 3 — `Invoke-GenerateErdAction` (PR 3, base: PR 2 branch)

**Spec refs:** Generate-ERD Behavior; P6 Test-Pattern Compliance.

- [x] S3.1 **Baseline green** — confirm suite passes on PR 2 branch.
- [x] S3.2 **RED Pester** — add `Describe 'Invoke-GenerateErdAction'`; AST-extract; stub `Export-DataStructure` via `function script:`. Tests: (a) `Open-AccessDatabase` is never called (track with `$script:ComOpened`), (b) `Export-DataStructure` receives resolved backend path. RED until S3.4.
- [x] S3.3 **RED vitest** — add wiring change-detector for `Invoke-GenerateErdAction`. RED until S3.4.
- [x] S3.4 **Extract** — add `Invoke-GenerateErdAction -BackendPath -DestinationRoot -ErdPath -Password [-Json]` (no COM session param); replace Generate-ERD `elseif` arm (lines 3204–3240) with one-line call.
- [x] S3.5 **GREEN** — run `pnpm test:ps1` and `pnpm test`.
- [x] S3.6 **Verify diff ≤ 400 lines**. Commit as `refactor(ps1): extract Invoke-GenerateErdAction — S3`. Open PR stacked to PR 2 branch.

---

## Slice 4 — `Invoke-DeleteAction` (PR 4, base: PR 3 branch)

**Spec refs:** Delete Action Behavior; P6 Test-Pattern Compliance.

- [x] S4.1 **Baseline green** — confirm suite passes on PR 3 branch.
- [x] S4.2 **RED Pester** — add `Describe 'Invoke-DeleteAction'`; AST-extract; stub `Remove-AccessObjectOrComponent` via `function script:`. Test: partial delete accumulates errors for failing module while succeeding for others. RED until S4.4.
- [x] S4.3 **RED vitest** — add wiring change-detector for `Invoke-DeleteAction`. RED until S4.4.
- [x] S4.4 **Extract** — add `Invoke-DeleteAction -Session -NormalizedModules [-Json]`; replace Delete `elseif` arm (lines 3099–3126).
- [x] S4.5 **GREEN** — run `pnpm test:ps1` and `pnpm test`.
- [x] S4.6 **Verify diff ≤ 400 lines**. Commit as `refactor(ps1): extract Invoke-DeleteAction — S4`. Open PR stacked to PR 3 branch.

---

## Slice 5 — `Invoke-CompileAction` + `Invoke-RunProcedureAction` (PR 5, base: PR 4 branch)

**Spec refs:** Run-Procedure and Compile Behavior; P6 Test-Pattern Compliance.

- [x] S5.1 **Baseline green** — confirm suite passes on PR 4 branch.
- [x] S5.2 **RED Pester** — add `Describe 'Invoke-CompileAction'` and `Describe 'Invoke-RunProcedureAction'`; AST-extract each; stub `Invoke-CompileVbaProject` and `Invoke-AccessProcedure` via `function script:`. Tests: (a) compile error surfaced in result without throwing, (b) Run-Procedure passes procedure name and converted args through to `Invoke-AccessProcedure` and returns its result unchanged. RED until S5.4.
- [x] S5.3 **RED vitest** — add wiring change-detectors for `Invoke-CompileAction` and `Invoke-RunProcedureAction`. RED until S5.4.
- [x] S5.4 **Extract** — add `Invoke-CompileAction -Session [-Json]` and `Invoke-RunProcedureAction -Session -ProcedureName -ProcedureArgsJson [-Json]`; replace their `elseif` arms (lines 3188–3202, 3160–3172).
- [x] S5.5 **GREEN** — run `pnpm test:ps1` and `pnpm test`.
- [x] S5.6 **Verify diff ≤ 400 lines**. Commit as `refactor(ps1): extract Invoke-CompileAction + Invoke-RunProcedureAction — S5`. PR stacked to PR 4 branch pending.

---

## Slice 6 — `Invoke-RunTestsAction` + `Invoke-FixEncodingAction` (PR 6, base: PR 5 branch)

**Spec refs:** Run-Tests Behavior; Fix-Encoding Behavior; P6 Test-Pattern Compliance.

> **Encoding risk guard**: create byte-content fixtures BEFORE writing any production code (steps S6.2–S6.3).

- [x] S6.1 **Baseline green** — confirmed on PR 5 branch: `pnpm test:ps1` PASS (155 passed / 4 skipped) and `pnpm test` PASS (839 passed / 3 skipped).
- [x] S6.2 **Encoding fixtures** — created `scripts/tests/fixtures/ansi-sample.bas`, `utf8bom-original.bas`, and `utf8nobom-expected.bas` as byte-level fixtures for encoding assertions.
- [x] S6.3 **RED Pester (encoding byte test)** — added `Describe 'Invoke-FixEncodingAction encoding'`; RED before extraction because `Invoke-FixEncodingAction` did not exist. Corrective follow-up exercised `ansi-sample.bas` through `Convert-AnsiToUtf8NoBom` while preserving the real Fix-Encoding Src contract: UTF-8 BOM → UTF-8 NoBOM.
- [x] S6.4 **RED Pester (behavioral)** — added `Describe 'Invoke-RunTestsAction'` and `Describe 'Invoke-FixEncodingAction'`; RED before extraction because both functions did not exist. Corrective follow-up added the missing `ProceduresJsonFile` read behavior: a non-empty missing file is attempted via `Get-Content` and does not fall back to inline JSON.
- [x] S6.5 **RED vitest** — added wiring change-detectors for `Invoke-RunTestsAction` and `Invoke-FixEncodingAction`; RED before extraction.
- [x] S6.6 **Extract** — added `Invoke-RunTestsAction` and `Invoke-FixEncodingAction` with explicit parameters, including session refs so the router `finally` still closes COM sessions opened inside these arms. Src-only Fix-Encoding works without opening COM.
- [x] S6.7 **Remove fragile source-text Pester assertions** — deleted the `'COM cleanup — try/finally pattern in source text'` context that used `$script:SourceText | Should -Match`; remaining `Should -Match` assertions are against behavior outputs, not raw source text.
- [x] S6.8 **GREEN** — initial S6: `pnpm test:ps1` PASS (153 passed / 4 skipped) and `pnpm test` PASS (841 passed / 3 skipped). Corrective follow-up: targeted Pester PASS (155 passed / 4 skipped) and targeted Vitest PASS (14 passed).
- [ ] S6.9 **Verify diff ≤ 400 lines / commit / PR** — diff budget check PASS locally before corrective follow-up (`3 files changed, 248 insertions, 78 deletions`, plus three small untracked fixtures). Commit/PR intentionally not done in this apply run per instruction.

---

## Slice 7 — `Invoke-ImportAction` (PR 7, base: PR 6 branch)

**Spec refs:** Import Action Behavior; P6 Test-Pattern Compliance.

> **Encoding risk guard**: verify that `Convert-Utf8ToAnsiTempFile` call inside the extracted function matches the current inline call site byte-for-byte before committing. Use the encoding fixtures from S6.2 to assert the temp-ANSI file produced by the stub path is equivalent.

> **created-components signal**: `Invoke-ImportAction` MUST return `[pscustomobject]@{CreatedComponentNames=[string[]]; Total=int}`. The router MUST call `Save-VbaProjectModules` when `$importResult.CreatedComponentNames.Count -gt 0`. This replaces the current `$importCreatedNewComponents` script-scope flag. Verify semantic equivalence before commit.

- [x] S7.1 **Baseline green** — confirmed on `main` after PR #396 merge: `pnpm test:ps1` PASS (155 passed / 4 skipped) and `pnpm test` PASS (841 passed / 3 skipped).
- [x] S7.2 **Encoding fixture check** — added byte-level Pester check that `Convert-Utf8ToAnsiTempFile` converts `utf8nobom-expected.bas` to the expected `ansi-sample.bas` bytes for the Import path.
- [x] S7.3 **RED Pester (retry loop)** — added `Describe 'Invoke-ImportAction'` context with AST extraction and `function script:` stubs. RED confirmed before extraction (`Invoke-ImportAction not found`). Tests cover transient retry, all-failure module detail, created-component return signal, and no `$script:importCreatedNewComponents` communication.
- [x] S7.4 **RED vitest** — added Import dispatcher wiring detector requiring `Invoke-ImportAction`, `CreatedComponentNames`, and `Save-VbaProjectModules`. RED confirmed before extraction.
- [x] S7.5 **Extract** — added `Invoke-ImportAction -Session -NormalizedModules -ModulesPath -ImportMode [-Json]`; moved retry loop, `$lastErrors`, and module-results output into it; return object is `[pscustomobject]@{CreatedComponentNames=[string[]]; Total=int}`. Router now delegates to `Invoke-ImportAction`, calls `Save-VbaProjectModules` from `CreatedComponentNames`, and emits final OK only after that save succeeds; `$importCreatedNewComponents` removed.
- [x] S7.6 **GREEN** — `pnpm test:ps1` PASS after implementation (160 passed / 4 skipped); targeted Vitest PASS (15 passed); final full Vitest PASS (842 passed / 3 skipped).
- [x] S7.7 **Final cleanup** — `test/scripts-vba-manager.test.ts` now has zero `script.split("\n")` body-navigation patterns and includes all S1-S7 wiring detectors. Final `pnpm test` PASS.
- [x] S7.8 **Verify diff budget / commit / PR** — size exception applies per launch context; current focused S7 diff is above 400 changed lines because it includes final cleanup plus behavior tests. Corrective apply after verify FAIL restored save-before-OK behavior; full verify is still required before closeout. Commit/PR intentionally not done per instruction; leave verified changes uncommitted for orchestrator closeout.

---

## Cross-Cutting Rules (apply to every slice)

- Each slice starts with a confirmed green baseline (`pnpm test:ps1` + `pnpm test`).
- Tests are written and confirmed RED before any production code is touched (strict TDD).
- Extracted function signatures MUST match the design table exactly — no deviations.
- No `$script:`-scope reads inside any `Invoke-*` function body.
- No `Should -Match` against raw `$SourceText` in any new or retained Pester test.
- No `script.split("\n")` body navigation in `test/scripts-vba-manager.test.ts` after the final slice.
- Dispatcher `try/finally` block (Close-AccessDatabase, pre-dispatch Resolve-* setup) stays in the router — do NOT move it into any `Invoke-*` function.
- RotManager C# class (`Add-Type`, lines 970–1153) is OUT of scope — do NOT touch it.

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `fd25418` | RED Pester/Vitest coverage for Compile + Run-Procedure | S5.2, S5.3 | TDD cycle verified locally | N/A |
| `43d22be` | Extract `Invoke-CompileAction` + `Invoke-RunProcedureAction` | S5.4, S5.5, S5.6 | Local Pester/Vitest PASS; SDD verify Slice 5 PASS | N/A |
| _uncommitted_ | Extract `Invoke-RunTestsAction` + `Invoke-FixEncodingAction`; corrective verify fixes | S6.1-S6.8 | `pnpm test:ps1` PASS; `pnpm test` PASS; corrective targeted Pester/Vitest PASS; final full Pester/Vitest PASS | N/A |
| _uncommitted_ | Extract `Invoke-ImportAction`; final wiring cleanup; corrective save-before-OK fix | S7.1-S7.8 + corrective verify FAIL fix | Baseline Pester/Vitest PASS; RED Pester/Vitest confirmed; corrective RED reproduced; targeted GREEN `pnpm test:ps1` PASS (161/0/4) and Vitest PASS (16/0); required final `pnpm test:ps1`, `pnpm test`, and `git diff --check` PASS; formal SDD verify pending | N/A |
