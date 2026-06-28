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
- [x] 2.6 Commit and push one conventional commit with SDD/Test/Ref body for #556.

## Slice 3: #557 — `compile_vba` error context

- [x] 3.1 Read `gh issue view 557` and confirm feasible best-effort contract.
- [x] 3.2 Use CodeGraph to inspect compile action, result shape, and compile tests.
- [x] 3.3 RED: add a behavior test for `VBA_COMPILE_ERROR` carrying first-error context when the runner can observe it.
- [x] 3.4 GREEN: implement minimal best-effort compile context extraction and preserve generic fallback.
- [x] 3.5 REFACTOR: keep error shape compatible and document unsupported/fallback behavior in tests.
- [x] 3.6 Commit and push one conventional commit with SDD/Test/Ref body for #557.

## Slice 4: Verify, archive, and close

- [x] 4.1 Run `pnpm test`.
- [x] 4.2 Run `pnpm build`.
- [x] 4.3 Run `pnpm lint`.
- [x] 4.4 Run `pwsh -Command "Invoke-Pester scripts/tests/"`.
- [x] 4.5 Confirm GitHub Actions success after pushed implementation commits.
- [x] 4.6 Archive the change under `openspec/changes/archive/2026-06-28-close-bugs-555-556-557/` and add `archive-report.md`.
- [x] 4.7 Commit and push the archive.
- [x] 4.8 Close #555, #556, and #557 with evidence comments containing commit SHA(s) and test references.
- [x] 4.9 Save Engram observation `sdd/close-bugs-555-556-557` with `capture_prompt: false`.

---

## TDD Cycle Evidence

| Issue | RED | GREEN | REFACTOR | Evidence |
|---|---|---|---|---|
| #555 | `pnpm vitest run test/adapters/vba-sync/vba-modules-adapter.test.ts -t "#555"` failed before implementation: observed only `Import`, expected `List-Objects`, `Delete`, `Import`. | Added `import_all prune:true` pre-import binary prune. Focused test passes. | Kept default merge behavior covered by a companion test. | `test/adapters/vba-sync/vba-modules-adapter.test.ts` |
| #556 | `Invoke-Pester scripts/tests/dysflow-vba-manager.Tests.ps1 -FullNameFilter '*#556*'` failed before implementation: cleanup was not called. | Added `Remove-TempSccObjects` and invoked it after successful deletes. Focused Pester test passes. | Cleanup is additive: result gets `tempSccObjectsCleaned`; target delete failures still remain in the existing catch path. | `scripts/tests/dysflow-vba-manager.Tests.ps1` |
| #557 | `pnpm vitest run test/adapters/vba-sync/vba-modules-adapter.test.ts -t "#557"` failed before implementation: `details.firstError` was missing even when runner output had component/line/sourceLine. | Added adapter mapping from structured compile runner output to `error.details.firstError`. Focused test passes. | Preserved fallback: details stay limited to runner output when context fields are absent; no fabricated module/line. | `test/adapters/vba-sync/vba-modules-adapter.test.ts` |

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `8eff908` + `dd0dc53` | #555 import_all replace/prune semantics | 1.1–1.6 | `pnpm vitest run test/adapters/vba-sync/vba-modules-adapter.test.ts -t "#555"`; `pnpm lint`; CI `28337020840` green | N/A — runner-level/product code change |
| `62a4096` | #556 delete_module TempSccObj cleanup | 2.1–2.6 | `Invoke-Pester scripts/tests/dysflow-vba-manager.Tests.ps1 -FullNameFilter 'Invoke-DeleteAction*'`; `pnpm lint`; CI `28337173160` green | N/A — runner-level/product code change |
| `62b946b` | #557 compile_vba error context | 3.1–3.6 | `pnpm vitest run test/adapters/vba-sync/vba-modules-adapter.test.ts -t "#557"`; `pnpm lint`; CI `28337306063` green | N/A — runner-level/product code change |
| `eb6d042` + `f4490f9` + `f49b387` | Archive and closeout traceability | 4.1–4.9 | `pnpm test`; `pnpm build`; `pnpm lint`; `Invoke-Pester scripts/tests/`; CI `28337548849` and `28337612052` green; issues #555/#556/#557 closed with evidence comments; Engram #14823 updated | N/A |
| `4eecf29` | Fresh-review blocker follow-up: import prune safety, TempScc snapshot cleanup, Vitest `forbidOnly`, trace seed | A–E | RED evidence: focused Vitest/Pester blockers failed first; GREEN: `pnpm test`; `pnpm build`; `pnpm lint`; `Invoke-Pester scripts/tests/`; CI `28338286641` green | N/A — runner-level/product code change |

## Follow-up Review Blockers — 2026-06-29

| Blocker | RED | GREEN / Verification | Status |
|---|---|---|---|
| A — `import_all prune:true` unsafe empty/missing discovery | `pnpm vitest run test/adapters/vba-sync/vba-modules-adapter.test.ts -t "import_all prune:true"` failed on missing/empty/discovery-failure guard tests before implementation. | Added pre-delete source-root validation and safe `IMPORT_PRUNE_SOURCE_UNSAFE` failure. `pnpm test`; CI `28338286641`. | Fixed |
| B — form/report alias false positives | Same focused Vitest run failed because `Main` / `Invoice` were selected for deletion despite `Form_Main.form.txt` / `Report_Invoice.report.txt` source. | Added source alias protection for `Form_`/`Report_` document objects and modules. `pnpm test`; CI `28338286641`. | Fixed |
| C — TempScc pre-existing artifact deletion | `Invoke-Pester scripts/tests/dysflow-vba-manager.Tests.ps1 -FullNameFilter '*Remove-TempSccObjects*'` failed before implementation because `-ExistingNames` snapshot protection was absent. | Snapshot before target deletion; cleanup removes only after-state TempScc artifacts. `Invoke-Pester scripts/tests/`; CI `28338286641`. | Fixed |
| D — `test.only` CI escape | `pnpm vitest run test/quality-gates/ci-workflow.test.ts -t "forbids committed"` failed before implementation because Vitest configs lacked `forbidOnly`. | Added `forbidOnly: true` to unit and integration configs plus quality-gate evidence. `pnpm lint`; CI `28338286641`. | Fixed |
| E — traceability omission | Archive trace omitted `f49b387` / CI `28337612052`. | Added `f49b387`, CI `28337612052`, and follow-up commit/CI trace in this artifact. | Fixed |
