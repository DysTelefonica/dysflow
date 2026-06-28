# Archive Report — close-bugs-555-556-557

## Summary

Archived after implementing and verifying three bug/reliability fixes:

- #555: `import_all` now supports explicit `prune:true` replacement semantics that delete binary-only modules before importing source, while default merge behavior remains unchanged.
- #556: `delete_module` now removes Access-generated `TempSccObj*` form/report/component artifacts after successful target deletion and reports the cleaned objects.
- #557: `compile_vba` now forwards structured compile context from the runner into `error.details.firstError` when module/line/source context is available, while preserving the generic fallback when Access exposes no context.

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `8eff908` + `dd0dc53` | #555 import_all replace/prune semantics + formatting follow-up | 1.1–1.6 | `pnpm vitest run test/adapters/vba-sync/vba-modules-adapter.test.ts -t "#555"`; `pnpm lint`; CI `28337020840` green | N/A — runner-level/product code change |
| `62a4096` | #556 delete_module TempSccObj cleanup | 2.1–2.6 | `Invoke-Pester scripts/tests/dysflow-vba-manager.Tests.ps1 -FullNameFilter 'Invoke-DeleteAction*'`; `pnpm lint`; CI `28337173160` green | N/A — runner-level/product code change |
| `62b946b` | #557 compile_vba error context | 3.1–3.6 | `pnpm vitest run test/adapters/vba-sync/vba-modules-adapter.test.ts -t "#557"`; `pnpm lint`; CI `28337306063` green | N/A — runner-level/product code change |
| `eb6d042` + `f4490f9` + `f49b387` | Archive and closeout traceability | 4.1–4.9 | `pnpm test`; `pnpm build`; `pnpm lint`; `Invoke-Pester scripts/tests/`; CI `28337548849` and `28337612052` green; issues #555/#556/#557 closed with evidence comments; Engram #14823 updated | N/A — documentation/traceability |
| `4eecf29` | Fresh-review blocker follow-up: import prune safety, TempScc snapshot cleanup, Vitest `forbidOnly`, trace seed | A–E | RED evidence: focused Vitest/Pester blocker tests failed first; GREEN: `pnpm test`; `pnpm build`; `pnpm lint`; `Invoke-Pester scripts/tests/`; CI `28338286641` green | N/A — runner-level/product code change |
| `ccf2254` | Residual #555 blocker follow-up: fail `import_all prune:true` when a managed source subfolder is unreadable | F | RED: `pnpm vitest run test/adapters/vba-sync/vba-modules-adapter.test.ts --testNamePattern "managed subfolder cannot be read"` failed before implementation; GREEN: focused test, `pnpm test`; `pnpm build`; `pnpm lint`; `Invoke-Pester scripts/tests/`; CI `28338833804` green | N/A — runner-level/product code change |

## Final verification

- `pnpm test` — passed, 137 files / 1746 tests.
- `pnpm build` — passed.
- `pnpm lint` — passed.
- `pwsh -Command "Invoke-Pester scripts/tests/"` — passed, 379 passed / 0 failed / 4 skipped.
- Latest follow-up CI: `28338833804` — success.

## Fresh-review blocker follow-up

- A/B: `import_all prune:true` now refuses destructive deletion when the source root is missing, unreadable, or contains no managed source files, and source form/report aliases protect both Access object names (`Main`, `Invoice`) and document modules (`Form_Main`, `Report_Invoice`).
- C: `delete_module` snapshots `TempSccObj*` artifacts before target deletion and removes only newly-created after-state artifacts.
- D: both Vitest configs set `forbidOnly: true`; `test/quality-gates/ci-workflow.test.ts` guards against regression.
- E: this archive now records final closeout commit `f49b387` / CI `28337612052` and follow-up commit `4eecf29` / CI `28338286641`.
- F: residual #555 review found incomplete source discovery could still proceed when one managed subfolder was unreadable. Commit `ccf2254` makes prune discovery all-or-fail for unreadable managed folders while preserving missing-folder compatibility; CI `28338833804` is green.

## Scope and compatibility notes

- `import_all` destructive replacement remains explicit via `prune:true`; existing callers without `prune` keep merge behavior.
- `delete_module` temp cleanup is best-effort for `TempSccObj*` artifacts and does not convert target deletion failures into success.
- `compile_vba` does not fabricate module/line data. It forwards `firstError` only when the runner's structured output contains compile context.

## Archive status

All planned implementation tasks and verification gates are complete. Issues #555, #556, and #557 can be closed with the commit/test evidence above after this archive commit is pushed and CI is green.
