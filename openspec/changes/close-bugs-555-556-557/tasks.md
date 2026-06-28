# Tasks — close-bugs-555-556-557

> **Delivery strategy**: `main-only`, one work-unit commit per issue, no PRs, no staging (explicit session instruction).
>
> **Strict TDD**: RED → GREEN → REFACTOR for each issue. Tests are committed with the behavior they prove.

## Review Workload Forecast

- 400-line budget risk: **Medium**. Three independent fixes may approach the review budget; stop if the working diff exceeds 400 changed lines before archive.
- Chained PRs recommended: **No** (session requires direct `main`, no PRs).
- Decision needed before apply: **No**. The user explicitly requested direct `main` work with one commit per issue.

---

## Slice 1: #555 — `import_all` replace/prune semantics

- [x] 1.1 Read `gh issue view 555` and confirm acceptance criteria.
- [x] 1.2 Use CodeGraph to inspect `import_all` mapping, orchestration, and runner behavior.
- [x] 1.3 RED: add a behavior test proving explicit prune/replace semantics are forwarded and reported while default merge remains compatible.
- [x] 1.4 GREEN: implement minimal explicit prune/replace support for `import_all`.
- [x] 1.5 REFACTOR: keep naming/API additive and update focused verification.
- [x] 1.6 Commit and push one conventional commit with SDD/Test/Ref body for #555.

## Slice 2: #556 — `delete_module` TempSccObj cleanup

- [x] 2.1 Read `gh issue view 556` and confirm acceptance criteria.
- [x] 2.2 Use CodeGraph to inspect delete flow and PowerShell object cleanup points.
- [x] 2.3 RED: add a runner/Pester behavior test that simulates `TempSccObj*` artifacts after delete.
- [x] 2.4 GREEN: clean `TempSccObj*` artifacts after successful delete without hiding target deletion failures.
- [x] 2.5 REFACTOR: report cleaned artifacts additively and keep no-temp behavior a no-op.
- [ ] 2.6 Commit and push one conventional commit with SDD/Test/Ref body for #556.

## Slice 3: #557 — `compile_vba` error context

- [ ] 3.1 Read `gh issue view 557` and confirm feasible best-effort contract.
- [ ] 3.2 Use CodeGraph to inspect compile action, result shape, and compile tests.
- [ ] 3.3 RED: add a behavior test for `VBA_COMPILE_ERROR` carrying first-error context when the runner can observe it.
- [ ] 3.4 GREEN: implement minimal best-effort compile context extraction and preserve generic fallback.
- [ ] 3.5 REFACTOR: keep error shape compatible and document unsupported/fallback behavior in tests.
- [ ] 3.6 Commit and push one conventional commit with SDD/Test/Ref body for #557.

## Slice 4: Verify, archive, and close

- [ ] 4.1 Run `pnpm test`.
- [ ] 4.2 Run `pnpm build`.
- [ ] 4.3 Run `pnpm lint`.
- [ ] 4.4 Run `pwsh -Command "Invoke-Pester scripts/tests/"`.
- [ ] 4.5 Confirm GitHub Actions success after pushed implementation commits.
- [ ] 4.6 Archive the change under `openspec/changes/archive/2026-06-28-close-bugs-555-556-557/` and add `archive-report.md`.
- [ ] 4.7 Commit and push the archive.
- [ ] 4.8 Close #555, #556, and #557 with evidence comments containing commit SHA(s) and test references.
- [ ] 4.9 Save Engram observation `sdd/close-bugs-555-556-557` with `capture_prompt: false`.

---

## TDD Cycle Evidence

| Issue | RED | GREEN | REFACTOR | Evidence |
|---|---|---|---|---|
| #555 | `pnpm vitest run test/adapters/vba-sync/vba-modules-adapter.test.ts -t "#555"` failed before implementation: observed only `Import`, expected `List-Objects`, `Delete`, `Import`. | Added `import_all prune:true` pre-import binary prune. Focused test passes. | Kept default merge behavior covered by a companion test. | `test/adapters/vba-sync/vba-modules-adapter.test.ts` |
| #556 | `Invoke-Pester scripts/tests/dysflow-vba-manager.Tests.ps1 -FullNameFilter '*#556*'` failed before implementation: cleanup was not called. | Added `Remove-TempSccObjects` and invoked it after successful deletes. Focused Pester test passes. | Cleanup is additive: result gets `tempSccObjectsCleaned`; target delete failures still remain in the existing catch path. | `scripts/tests/dysflow-vba-manager.Tests.ps1` |
| #557 | Pending | Pending | Pending | Pending |

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `8eff908` + `dd0dc53` | #555 import_all replace/prune semantics | 1.1–1.6 | `pnpm vitest run test/adapters/vba-sync/vba-modules-adapter.test.ts -t "#555"`; `pnpm lint`; CI `28337020840` green | N/A — runner-level/product code change |
| _pending_ | #556 delete_module TempSccObj cleanup | 2.1–2.6 | Pending | N/A — runner-level/product code change |
| _pending_ | #557 compile_vba error context | 3.1–3.6 | Pending | N/A — runner-level/product code change |
| _pending_ | Archive and closeout | 4.1–4.9 | Pending | N/A |
