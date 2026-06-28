# Archive Report — close-batch-562-580-591

**Change**: `close-batch-562-580-591`
**Archived**: 2026-06-28
**Branch**: `main` (release policy: main-only, no staging)
**Delivery strategy**: direct commits, no PRs (Engram #14611)
**Strict TDD**: RED → GREEN → TRIANGULATE → REFACTOR per slice

## Issues closed

| Issue | Title | Commit | Acceptance evidence |
|---|---|---|---|
| #562 | test(integration): run Access COM E2E serially + clean temp sandboxes | `a2f032d` | `test/quality-gates/integration-config.test.ts` (2 tests, pins `singleFork` + `fileParallelism: false` + `globalSetup`) + `test/integration/global-setup-temp-sweep.test.ts` (3 tests, stale/fresh/empty/locked scenarios) |
| #580 | fix(ci): remove or correct references to nonexistent script test files | `43df22c` | `test/quality-gates/ci-workflow.test.ts` extended (9 tests) with structural existence gate + triangulation pass proving the gate catches phantom refs; 4 phantom refs removed from vitest configs + ci.yml |
| #591 | fix(cli): make --help consistent and side-effect free across subcommands | `3df8a08` | `test/cli/subcommand-help.test.ts` (7 tests covering mcp/doctor/access × {--help,-h}) + mock injection proving no PowerShell/Access/diagnostics/runner invocation |

## Commits

| SHA | Subject | Files |
|---|---|---|
| `a2f032d` | test(integration): serialize Access COM suite + sweep stale temp sandboxes (#562) | 6 files, +266 -1 |
| `43df22c` | fix(ci): remove phantom test references + add structural existence gate (#580) | 4 files, +144 -94 |
| `3df8a08` | fix(cli): --help is side-effect-free for mcp, doctor, access (#591) | 5 files, +134 -1 |
| `801c540` | chore(sdd): update tasks.md traceability for close-batch-562-580-591 | 1 file, +190 |

## Test summary

| Layer | Before | After | Delta |
|---|---|---|---|
| Vitest (unit + integration pool test) | 1674 / 1674 | 1687 / 1687 | +13 tests |
| Pester (PowerShell scripts) | 374 / 0 / 4 | 374 / 0 / 4 | unchanged |
| Branches coverage | ≥ 78% | 80.32% | preserved (above threshold) |

## What changed

### #562 — Integration Serial + Temp Cleanup
- `vitest.integration.config.ts` now pins `poolOptions.forks.singleFork: true` and `fileParallelism: false` so only one fork process is alive at a time and only one test file runs inside it. `maxWorkers: 1` alone was insufficient because Vitest may still schedule multiple files within a single worker.
- New `vitest.integration.global-setup.ts` sweeps `dysflow-*` directories in `os.tmpdir()` older than 24 hours before the integration suite starts. Tolerates `EBUSY` from a held `.laccdb` lock — sweep NEVER throws.
- New helper `test/integration/_helpers/global-setup-temp-sweep.ts` is a pure filesystem function with no Access / PowerShell / COM dependency, unit-tested in the fast suite.

### #580 — CI Test File References
- Removed phantom references `test/scripts-access-runner.test.ts` and `test/scripts-vba-manager.test.ts` from `vitest.config.ts` (include + exclude), `vitest.integration.config.ts` (include), and `.github/workflows/ci.yml` (Windows integration command).
- Replaced the verbatim command pin in `test/quality-gates/ci-workflow.test.ts` with a structural assertion that walks every `*.test.ts` path mentioned in the three config files and verifies each one exists on disk. Globs are filtered out so `test/e2e/**/*.test.ts` is not mistaken for a missing file.
- Triangulated the new gate by introducing `test/phantom-temp.test.ts` and confirming the gate fails with a clear error, then removing the phantom.

### #591 — CLI --help Consistency
- `src/cli/index.ts` short-circuits `--help` / `-h` BEFORE invoking the handler, scoped to the three subcommands named in the issue (`mcp`, `doctor`, `access`). Other subcommands like `install` and `update` keep their existing per-subcommand usage path, preserving their existing tests.
- Defense in depth added to each handler (`mcp.ts`, `doctor.ts`, `access.ts`) so a direct handler call with `--help` also returns side-effect-free usage.

## Outstanding items

None — all three issues have been closed with passing tests, green CI, and traceability comments.

## Verification URLs

- CI run for #562: https://github.com/DysTelefonica/dysflow/actions/runs/28329884776
- CI run for #580: https://github.com/DysTelefonica/dysflow/actions/runs/28329961649
- CI run for #591: https://github.com/DysTelefonica/dysflow/actions/runs/28330121912
- CI run for tasks.md: https://github.com/DysTelefonica/dysflow/actions/runs/28330130283

## Lessons

1. **Scope the dispatcher change to the issue**: my first cut of #591 made `--help` short-circuit ALL subcommands, breaking 3 existing tests that expected `install --help` and `update --help` to produce subcommand-specific usage. Scoping the short-circuit to `{mcp, doctor, access}` resolved it without affecting other subcommands.
2. **Filter globs in structural assertions**: my first cut of the #580 gate flagged `test/cli/**/*.test.ts` as a missing file because the regex didn't distinguish concrete paths from globs. Filtering out entries containing `*` makes the assertion reflect what operators actually care about (concrete files that must exist).
3. **Per-handler defense in depth**: even though `runCli` short-circuits `--help` for the three subcommands, adding the same short-circuit at the top of each handler means the contract holds regardless of how the handler is invoked (directly from tests or future callers).
