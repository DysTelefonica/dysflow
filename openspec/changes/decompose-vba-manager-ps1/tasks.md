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

- [ ] S2.1 **Baseline green** — confirm `pnpm test:ps1` and `pnpm test` pass on the PR 1 branch.
- [ ] S2.2 **RED Pester** — add `Describe 'Invoke-ListObjectsAction'` and `Describe 'Invoke-ExistsAction'` contexts; AST-extract each; stub `Get-FrontendInventory` and `Get-ExistsInfo` via `function script:`. Tests: (a) List-Objects JSON vs text routing, (b) Exists module-absent returns correct result without modifying the project. Both RED until S2.4.
- [ ] S2.3 **RED vitest** — add wiring change-detectors for `Invoke-ListObjectsAction` and `Invoke-ExistsAction` in `test/scripts-vba-manager.test.ts`. RED until S2.4.
- [ ] S2.4 **Extract** — add `Invoke-ListObjectsAction -Session [-Json]` and `Invoke-ExistsAction -Session -ModuleName [-Json]` to `scripts/dysflow-vba-manager.ps1`; replace their respective `elseif` arms with one-line calls.
- [ ] S2.5 **GREEN** — run `pnpm test:ps1` and `pnpm test`; all new + existing tests pass.
- [ ] S2.6 **Verify diff ≤ 400 lines**. Commit as `refactor(ps1): extract Invoke-ListObjectsAction + Invoke-ExistsAction — S2`. Open PR stacked to PR 1 branch.

---

## Slice 3 — `Invoke-GenerateErdAction` (PR 3, base: PR 2 branch)

**Spec refs:** Generate-ERD Behavior; P6 Test-Pattern Compliance.

- [ ] S3.1 **Baseline green** — confirm suite passes on PR 2 branch.
- [ ] S3.2 **RED Pester** — add `Describe 'Invoke-GenerateErdAction'`; AST-extract; stub `Export-DataStructure` via `function script:`. Tests: (a) `Open-AccessDatabase` is never called (track with `$script:ComOpened`), (b) `Export-DataStructure` receives resolved backend path. RED until S3.4.
- [ ] S3.3 **RED vitest** — add wiring change-detector for `Invoke-GenerateErdAction`. RED until S3.4.
- [ ] S3.4 **Extract** — add `Invoke-GenerateErdAction -BackendPath -DestinationRoot -ErdPath -Password [-Json]` (no COM session param); replace Generate-ERD `elseif` arm (lines 3204–3240) with one-line call.
- [ ] S3.5 **GREEN** — run `pnpm test:ps1` and `pnpm test`.
- [ ] S3.6 **Verify diff ≤ 400 lines**. Commit as `refactor(ps1): extract Invoke-GenerateErdAction — S3`. Open PR stacked to PR 2 branch.

---

## Slice 4 — `Invoke-DeleteAction` (PR 4, base: PR 3 branch)

**Spec refs:** Delete Action Behavior; P6 Test-Pattern Compliance.

- [ ] S4.1 **Baseline green** — confirm suite passes on PR 3 branch.
- [ ] S4.2 **RED Pester** — add `Describe 'Invoke-DeleteAction'`; AST-extract; stub `Remove-AccessObjectOrComponent` via `function script:`. Test: partial delete accumulates errors for failing module while succeeding for others. RED until S4.4.
- [ ] S4.3 **RED vitest** — add wiring change-detector for `Invoke-DeleteAction`. RED until S4.4.
- [ ] S4.4 **Extract** — add `Invoke-DeleteAction -Session -NormalizedModules [-Json]`; replace Delete `elseif` arm (lines 3099–3126).
- [ ] S4.5 **GREEN** — run `pnpm test:ps1` and `pnpm test`.
- [ ] S4.6 **Verify diff ≤ 400 lines**. Commit as `refactor(ps1): extract Invoke-DeleteAction — S4`. Open PR stacked to PR 3 branch.

---

## Slice 5 — `Invoke-CompileAction` + `Invoke-RunProcedureAction` (PR 5, base: PR 4 branch)

**Spec refs:** Run-Procedure and Compile Behavior; P6 Test-Pattern Compliance.

- [ ] S5.1 **Baseline green** — confirm suite passes on PR 4 branch.
- [ ] S5.2 **RED Pester** — add `Describe 'Invoke-CompileAction'` and `Describe 'Invoke-RunProcedureAction'`; AST-extract each; stub `Invoke-CompileVbaProject` and `Invoke-AccessProcedure` via `function script:`. Tests: (a) compile error surfaced in result without throwing, (b) Run-Procedure passes procedure name and converted args through to `Invoke-AccessProcedure` and returns its result unchanged. RED until S5.4.
- [ ] S5.3 **RED vitest** — add wiring change-detectors for `Invoke-CompileAction` and `Invoke-RunProcedureAction`. RED until S5.4.
- [ ] S5.4 **Extract** — add `Invoke-CompileAction -Session [-Json]` and `Invoke-RunProcedureAction -Session -ProcedureName -ProcedureArgsJson [-Json]`; replace their `elseif` arms (lines 3188–3202, 3160–3172).
- [ ] S5.5 **GREEN** — run `pnpm test:ps1` and `pnpm test`.
- [ ] S5.6 **Verify diff ≤ 400 lines**. Commit as `refactor(ps1): extract Invoke-CompileAction + Invoke-RunProcedureAction — S5`. Open PR stacked to PR 4 branch.

---

## Slice 6 — `Invoke-RunTestsAction` + `Invoke-FixEncodingAction` (PR 6, base: PR 5 branch)

**Spec refs:** Run-Tests Behavior; Fix-Encoding Behavior; P6 Test-Pattern Compliance.

> **Encoding risk guard**: create byte-content fixtures BEFORE writing any production code (steps S6.2–S6.3).

- [ ] S6.1 **Baseline green** — confirm suite passes on PR 5 branch.
- [ ] S6.2 **Encoding fixtures** — create `scripts/tests/fixtures/ansi-sample.bas` as a small ANSI-encoded `.bas` file and `scripts/tests/fixtures/utf8nobom-expected.bas` as its expected UTF-8 NoBom equivalent. Use `[System.Text.Encoding]::GetEncoding(1252).GetBytes(...)` / `Set-Content -Encoding Byte` in a helper script to write the ANSI fixture; commit both binary fixtures. These are the byte-level source-of-truth for encoding tests.
- [ ] S6.3 **RED Pester (encoding byte test)** — in `scripts/tests/dysflow-vba-manager.Tests.ps1` add a `Describe 'Invoke-FixEncodingAction encoding'` context using the fixtures from S6.2: load the ANSI fixture through `Invoke-FixEncodingAction` with `-Location Src`, capture output bytes, assert the BOM header is absent and content matches the UTF-8 NoBom fixture byte-for-byte. RED until S6.6.
- [ ] S6.4 **RED Pester (behavioral)** — add `Describe 'Invoke-RunTestsAction'` and `Describe 'Invoke-FixEncodingAction'` behavioral contexts; AST-extract each; stub `Invoke-AccessProcedureBatch`, `Get-Content`, `Fix-EncodingInSrc`, `Fix-EncodingInAccess` via `function script:`. Tests: (a) missing ProceduresJsonFile returns failure without calling `Invoke-AccessProcedureBatch`, (b) Src-only path calls `Fix-EncodingInSrc` and never opens a COM session, (c) Access path delegates to `Fix-EncodingInAccess`. RED until S6.6.
- [ ] S6.5 **RED vitest** — add wiring change-detectors for `Invoke-RunTestsAction` and `Invoke-FixEncodingAction`. RED until S6.6.
- [ ] S6.6 **Extract** — add `Invoke-RunTestsAction -Session -ProceduresJson -ProceduresJsonFile [-Json]` and `Invoke-FixEncodingAction -Session -ModulesPath -NormalizedModules -Location -AccessPath -Password -AllowStartupExecution [-Json]`; replace their `elseif`/`else` arms (lines 3174–3186, 3242–3258). For `Invoke-FixEncodingAction`, Src-only path must work with `$null` session (no COM open).
- [ ] S6.7 **Remove fragile source-text Pester assertions** — delete the `'COM cleanup — try/finally pattern in source text'` context (lines 78–128 in `dysflow-vba-manager.Tests.ps1`) that uses `$script:SourceText | Should -Match`. The behavioral tests from S6.4 and prior slices are the replacement coverage.
- [ ] S6.8 **GREEN** — run `pnpm test:ps1` and `pnpm test`.
- [ ] S6.9 **Verify diff ≤ 400 lines**. Commit as `refactor(ps1): extract Invoke-RunTestsAction + Invoke-FixEncodingAction — S6`. Open PR stacked to PR 5 branch.

---

## Slice 7 — `Invoke-ImportAction` (PR 7, base: PR 6 branch)

**Spec refs:** Import Action Behavior; P6 Test-Pattern Compliance.

> **Encoding risk guard**: verify that `Convert-Utf8ToAnsiTempFile` call inside the extracted function matches the current inline call site byte-for-byte before committing. Use the encoding fixtures from S6.2 to assert the temp-ANSI file produced by the stub path is equivalent.

> **created-components signal**: `Invoke-ImportAction` MUST return `[pscustomobject]@{CreatedComponentNames=[string[]]; Total=int}`. The router MUST call `Save-VbaProjectModules` when `$importResult.CreatedComponentNames.Count -gt 0`. This replaces the current `$importCreatedNewComponents` script-scope flag. Verify semantic equivalence before commit.

- [ ] S7.1 **Baseline green** — confirm suite passes on PR 6 branch.
- [ ] S7.2 **Encoding fixture check** — confirm the ANSI fixture from S6.2 is readable and the byte-content assertion pattern applies to the Import path (ANSI temp file). No new fixture needed if S6.2 fixture covers the codec; add a `.cls` variant if `.bas` encoding differs.
- [ ] S7.3 **RED Pester (retry loop)** — add `Describe 'Invoke-ImportAction'` context; AST-extract; stub `Import-VbaModule` and `Resolve-ExistingComponentName` via `function script:`. Tests: (a) retry on transient failure — stub fails on first call, succeeds on second; assert the module was attempted twice, (b) all-failure result reports per-module error detail, (c) `createdNewComponents = $true` returned when at least one component is new, (d) no script-scope variable set to communicate the new-component signal (`Get-Variable -Scope Script -Name importCreatedNewComponents` must throw or be `$null`). RED until S7.5.
- [ ] S7.4 **RED vitest** — add wiring change-detector: router arm for Import must call `Invoke-ImportAction` and must call `Save-VbaProjectModules` when `CreatedComponentNames.Count -gt 0` (check `expect(script).toContain("Invoke-ImportAction")` and `expect(script).toContain("CreatedComponentNames")`). RED until S7.5.
- [ ] S7.5 **Extract** — add `Invoke-ImportAction -Session -NormalizedModules -ModulesPath -ImportMode [-Json]`; move Import arm body (lines 3008–3097) including retry loop and `$lastErrors` tracking into it; return `[pscustomobject]@{CreatedComponentNames=[string[]]; Total=int}`. In the router, replace the Import `elseif` arm with: one-line call to `Invoke-ImportAction`, capture result, call `Save-VbaProjectModules` if `$importResult.CreatedComponentNames.Count -gt 0`. Remove `$importCreatedNewComponents` script-scope flag.
- [ ] S7.6 **GREEN** — run `pnpm test:ps1` and `pnpm test`.
- [ ] S7.7 **Final cleanup** — in `test/scripts-vba-manager.test.ts` confirm zero remaining `script.split("\n")` body-navigation patterns; all wiring change-detectors must reference `Invoke-*Action` names. Run `pnpm test` final time.
- [ ] S7.8 **Verify diff ≤ 400 lines**. Commit as `refactor(ps1): extract Invoke-ImportAction — S7`. Open PR stacked to PR 6 branch.

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
