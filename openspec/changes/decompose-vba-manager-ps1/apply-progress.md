# Apply Progress: decompose-vba-manager-ps1 (through Slice 6)

**Change**: `decompose-vba-manager-ps1`  
**Mode**: Strict TDD  
**Status**: Slice 6 COMPLETE locally — commit/PR pending by instruction

## Summary

Cumulative apply progress through Slice 6 of the dispatcher decomposition. Slices 1-5 remain complete; Slice 6 extracted `Invoke-RunTestsAction` and `Invoke-FixEncodingAction`, then corrected verify findings while preserving observable behavior.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| **Slice 1** | | | | | | | |
| S1.1 | N/A (baseline) | Unit | ✅ Pass | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A |
| S1.2 | `scripts/tests/dysflow-vba-manager.Tests.ps1` | Unit | ✅ Pass | ✅ Written | ✅ Passed | ✅ 3 cases | ✅ Clean |
| S1.3 | `test/scripts-vba-manager.test.ts` | Integration | ✅ Pass | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean |
| S1.4 | `scripts/dysflow-vba-manager.ps1` | N/A (impl) | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A |
| S1.5 | N/A (execution) | Unit | ➖ N/A | ➖ N/A | ✅ Pass | ➖ N/A | ➖ N/A |
| S1.6 | N/A (budget) | N/A | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A |
| **Slice 2** | | | | | | | |
| S2.1 | N/A (baseline) | Unit | ✅ Pass | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A |
| S2.2 | `scripts/tests/dysflow-vba-manager.Tests.ps1` | Unit | ✅ Pass | ✅ Written | ✅ Passed | ✅ 2 cases (JSON / Text) | ✅ Clean |
| S2.3 | `test/scripts-vba-manager.test.ts` | Integration | ✅ Pass | ✅ Written | ✅ Passed | ✅ 2 cases (List / Exists) | ✅ Clean |
| S2.4 | `scripts/dysflow-vba-manager.ps1` | N/A (impl) | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A |
| S2.5 | N/A (execution) | Unit | ➖ N/A | ➖ N/A | ✅ Pass | ➖ N/A | ➖ N/A |
| S2.6 | N/A (budget) | N/A | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A |
| **Slice 3** | | | | | | | |
| S3.1 | N/A (baseline) | Unit | ✅ Pass | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A |
| S3.2 | `scripts/tests/dysflow-vba-manager.Tests.ps1` | Unit | ✅ Pass | ✅ Written | ✅ Passed | ✅ 3 cases (Happy / Missing / Throw) | ✅ Clean |
| S3.3 | `test/scripts-vba-manager.test.ts` | Integration | ✅ Pass | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean |
| S3.4 | `scripts/dysflow-vba-manager.ps1` | N/A (impl) | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A |
| S3.5 | N/A (execution) | Unit | ➖ N/A | ➖ N/A | ✅ Pass | ➖ N/A | ➖ N/A |
| S3.6 | N/A (budget) | N/A | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A |
| **Slice 4** | | | | | | | |
| S4.1 | N/A (baseline) | Unit | ✅ Pass | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A |
| S4.2 | `scripts/tests/dysflow-vba-manager.Tests.ps1` | Unit | ✅ Pass | ✅ Written | ✅ Passed | ✅ 3 cases (Happy / Empty / Partial Fail) | ✅ Clean |
| S4.3 | `test/scripts-vba-manager.test.ts` | Integration | ✅ Pass | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean |
| S4.4 | `scripts/dysflow-vba-manager.ps1` | N/A (impl) | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A |
| S4.5 | N/A (execution) | Unit | ➖ N/A | ➖ N/A | ✅ Pass | ➖ N/A | ➖ N/A |
| S4.6 | N/A (budget) | N/A | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A |
| **Slice 5** | | | | | | | |
| S5.1 | N/A (baseline) | Unit | ✅ Pass | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A |
| S5.2 | `scripts/tests/dysflow-vba-manager.Tests.ps1` | Unit | ✅ Pass | ✅ Written | ✅ Passed | ✅ Compile + Run cases | ✅ Clean |
| S5.3 | `test/scripts-vba-manager.test.ts` | Integration | ✅ Pass | ✅ Written | ✅ Passed | ✅ Compile + Run wiring | ✅ Clean |
| S5.4 | `scripts/dysflow-vba-manager.ps1` | N/A (impl) | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A |
| S5.5 | N/A (execution) | Unit | ➖ N/A | ➖ N/A | ✅ Pass | ➖ N/A | ➖ N/A |
| S5.6 | N/A (budget) | N/A | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A |

## Test Summary

- **Total tests written (S5)**: Pester + Vitest coverage for Compile and Run-Procedure actions.
- **Total tests passing (S5)**: all added S5 tests plus existing suite passed locally.
- **Layers used**: Unit (Pester), Integration (Vitest wiring change-detectors)
- **Approval tests**: None — no refactoring tests needed for existing functions (no logic modification).
- **Pure functions created**: 2 (`Invoke-CompileAction`, `Invoke-RunProcedureAction`)

## Verification Commands

| Command | Result |
|---------|--------|
| `pnpm test:ps1` | PASS (Slice 5 verification) |
| `pnpm test` | PASS (Slice 5 verification) |

## Files Changed

- `scripts/dysflow-vba-manager.ps1` — Extracted `Invoke-CompileAction` and `Invoke-RunProcedureAction`; replaced dispatcher arms.
- `scripts/tests/dysflow-vba-manager.Tests.ps1` — Added AST-extracted behavioral tests with stubs for the new actions.
- `test/scripts-vba-manager.test.ts` — Added wiring change-detectors for both dispatcher arms.
- `openspec/changes/decompose-vba-manager-ps1/tasks.md` — Marked Slice 5 tasks as complete.
- `openspec/changes/decompose-vba-manager-ps1/HANDOFF.md` — Updated tables, bitácora, and implementation commits.

## Budget Check (Verify diff <= 400 lines)

Slice 5 implementation commits:

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `fd25418` | RED Pester/Vitest coverage for Compile + Run-Procedure | S5.2, S5.3 | TDD cycle verified locally | N/A |
| `43d22be` | Extract `Invoke-CompileAction` + `Invoke-RunProcedureAction` | S5.4, S5.5, S5.6 | Local Pester/Vitest PASS; SDD verify Slice 5 PASS | N/A |

Implementation diff for Slice 5 is 338 changed lines across the test/refactor commits, under the 400-line review budget.

---

## Slice 6 Update — Run-Tests + Fix-Encoding

Implemented Slice 6 only. Extracted `Invoke-RunTestsAction` and `Invoke-FixEncodingAction` into explicit-parameter functions and replaced their dispatcher arms with delegated calls. The new functions use `[ref]$session` for paths that open Access so the router-level `finally` still performs the existing `Close-AccessDatabase` cleanup; `Fix-Encoding -Location Src` opens no COM session.

### S6 TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| S6.1 | N/A | Unit/Integration | ✅ `pnpm test:ps1` 155/0/4; `pnpm test` 839/0/3 | ➖ N/A | ➖ N/A | ➖ N/A | ➖ N/A |
| S6.2 | `scripts/tests/fixtures/*` | Fixture | ✅ Baseline green | ✅ Fixtures created before prod | ✅ Used by byte test | ✅ ANSI/BOM/NoBOM fixtures | ✅ Small fixtures |
| S6.3 | `scripts/tests/dysflow-vba-manager.Tests.ps1` | Byte/unit | ✅ Baseline green | ✅ Missing `Invoke-FixEncodingAction`; corrective ANSI fixture test added first | ✅ PASS | ✅ BOM fixture via action + ANSI fixture via codec helper | ✅ Real helper path; spec aligned to preserved behavior |
| S6.4 | `scripts/tests/dysflow-vba-manager.Tests.ps1` | Unit | ✅ Baseline green | ✅ Missing S6 actions; corrective missing-file fallback regression test failed first | ✅ PASS | ✅ Missing procedures, file read, Src, Access | ✅ Explicit session refs |
| S6.5 | `test/scripts-vba-manager.test.ts` | Wiring | ✅ Baseline green | ✅ Missing S6 action names; corrective arm-body detector strengthened | ✅ PASS | ✅ Dispatcher arm checks avoid function-definition matches | ✅ Minimal detector helper |
| S6.6-S6.8 | `scripts/dysflow-vba-manager.ps1` + full suite | Refactor/verification | ✅ Baseline green | ✅ Tests first | ✅ Initial full suites passed; corrective targeted Pester 155/0/4 + targeted Vitest 14/0 | ✅ Src vs Access branches | ✅ Raw `$SourceText` context removed |
| S6.9 | Git diff | Budget | ✅ Checked | ➖ N/A | ✅ Tracked code/test diff under budget | ➖ N/A | ⏳ Commit/PR pending |

### S6 Files Changed

- `scripts/dysflow-vba-manager.ps1` — Added `Invoke-RunTestsAction` and `Invoke-FixEncodingAction`; dispatcher delegates.
- `scripts/tests/dysflow-vba-manager.Tests.ps1` — Added S6 behavioral and byte-level tests; removed raw-source Pester context.
- `test/scripts-vba-manager.test.ts` — Added S6 wiring change-detectors.
- `scripts/tests/fixtures/ansi-sample.bas`, `utf8bom-original.bas`, `utf8nobom-expected.bas` — Encoding fixtures.
- `openspec/changes/decompose-vba-manager-ps1/specs/vba-manager-actions/spec.md`, `tasks.md`, `HANDOFF.md` — Updated S6 state and aligned Run-Tests/Fix-Encoding contracts to preserved behavior.

### S6 Verification

| Command | Result |
|---|---|
| `pnpm test:ps1` | PASS — 153 passed / 0 failed / 4 skipped |
| `pnpm test` | PASS — 841 passed / 0 failed / 3 skipped |
| `pnpm test:ps1` (corrective follow-up targeted/full Pester) | PASS — 155 passed / 0 failed / 4 skipped |
| `pnpm exec vitest run test/scripts-vba-manager.test.ts` | PASS — 14 passed / 0 failed |

### S6 Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| _uncommitted_ | Extract `Invoke-RunTestsAction` + `Invoke-FixEncodingAction`; corrective verify fixes | S6.1-S6.8 | `pnpm test:ps1` PASS; `pnpm test` PASS; corrective targeted Pester/Vitest PASS; final full Pester/Vitest PASS | N/A |
