# Tasks — close-batch-562-580-591

> **Delivery strategy**: `main-only`, `single batch`, target branch `main`. No PRs, no staging (per `dysflow/release-policy/main-only`, Engram #14611). One commit per issue + one `tasks.md` update commit + one archive commit = 5 commits total.
>
> **Strict TDD**: RED → GREEN → TRIANGULATE → REFACTOR for each task. Triangulation mandatory when the spec defines more than one scenario.

## Review Workload Forecast

- 400-line budget risk: **Low**. Estimated diff is ~200 lines across 3 fixes + quality gates.
- Chained PRs recommended: **No** (release policy is main-only direct, no PRs).
- Decision needed before apply: **No**.

---

## Slice 1: #562 — Integration Serial + Temp Cleanup

- **Issue**: #562
- **Spec**: `openspec/changes/close-batch-562-580-591/specs/integration-serial-e2e.md`
- **Strategy E2E**: ports involved = `vitest.config.ts` (filesystem + process spawn via fork pool), `os.tmpdir()` sweep (filesystem). Quality gate test reads config as text + filesystem stat — no process spawn.

### Task 1.1 — RED: quality gate for integration serialization

- Write `test/quality-gates/integration-config.test.ts` that reads `vitest.integration.config.ts` as text and asserts:
  - contains `pool: "forks"`
  - contains `singleFork: true`
  - contains `fileParallelism: false`
- Current config has only `pool: "forks"` + `maxWorkers: 1` — assertions on `singleFork` and `fileParallelism` will FAIL (RED).
- Run: `pnpm vitest run test/quality-gates/integration-config.test.ts` → expect failure.

### Task 1.2 — GREEN: pin serialization in `vitest.integration.config.ts`

- Add `singleFork: true` under `poolOptions.forks`.
- Add `fileParallelism: false` under `test`.
- Re-run quality gate → GREEN.

### Task 1.3 — RED: temp sandbox sweep helper

- Add `test/integration/global-setup-temp-sweep.test.ts` that:
  - Creates `tmpdir/dysflow-stale-X` with mtime > threshold (artificially aged via `utimes`).
  - Creates `tmpdir/dysflow-fresh-X` with mtime within threshold.
  - Calls `sweepStaleDysflowTempDirs({ tmpdir: tmpdir, thresholdHours: 24 })`.
  - Asserts stale is removed, fresh remains.
- Reference a sweep helper at `test/integration/_helpers/global-setup-temp-sweep.ts` that does NOT yet exist → RED on import.

### Task 1.4 — GREEN: implement sweep helper + wire into globalSetup

- Implement `sweepStaleDysflowTempDirs` with `readdir` + `stat` + `utimes` tolerance + best-effort `rm`.
- Create `vitest.integration.global-setup.ts` that calls the sweep at startup.
- Reference it from `vitest.integration.config.ts` via `globalSetup: "./vitest.integration.global-setup.ts"`.
- Re-run sweep test → GREEN.

### Task 1.5 — TRIANGULATE: sweep tolerates locked `.laccdb`

- Add a third scenario to `global-setup-temp-sweep.test.ts`: a `dysflow-locked-X` dir containing a `.laccdb` whose removal throws `EBUSY` (simulate by pre-creating a file and using `chmod`/Windows read-only + a mock `rmSync`).
- Run → expect sweep returns without throwing.

### Task 1.6 — REFACTOR + final verification

- Run `pnpm test`, `pnpm build`, `pnpm lint` — no regressions vs baseline (1674/1674).
- Re-read `vitest.integration.config.ts` — confirm config is clean and documented.

---

## Slice 2: #580 — CI Test File References

- **Issue**: #580
- **Spec**: `openspec/changes/close-batch-562-580-591/specs/ci-test-refs.md`
- **Strategy E2E**: no I/O ports involved. Pure config edits + quality gate text scan.

### Task 2.1 — RED: existing quality gate pins the broken command

- Read `test/quality-gates/ci-workflow.test.ts` line 35-37: it contains a verbatim `expect(commands).toContain("pnpm vitest run ... test/scripts-access-runner.test.ts test/scripts-vba-manager.test.ts")`. The current CI workflow has this command, so this assertion PASSES today. RED for the new requirement: there is no structural assertion that referenced paths exist.

### Task 2.2 — GREEN (spec partial): add structural assertion to quality gate

- Extend `test/quality-gates/ci-workflow.test.ts` with a new `it()` that:
  - Reads `vitest.config.ts`, `vitest.integration.config.ts`, `.github/workflows/ci.yml`.
  - Extracts every `*.test.ts` path mentioned in `include` arrays and in any `run:` step.
  - Asserts each path exists via `fs.existsSync`.
- Run the new test alone with current (broken) configs → FAILS because the phantom files don't exist (RED).

### Task 2.3 — GREEN (spec complete): remove phantom references

- Remove `test/scripts-vba-manager.test.ts` from `vitest.config.ts` include (line 19).
- Remove `test/scripts-access-runner.test.ts` from `vitest.config.ts` exclude (line 23).
- Remove both phantom files from `vitest.integration.config.ts` include (lines 10-11).
- Remove both phantom files from `.github/workflows/ci.yml` line 85-86.
- Update the existing verbatim assertion in `test/quality-gates/ci-workflow.test.ts` line 36 to NOT mention the phantom files (keep the structural assertion as the source of truth).
- Re-run quality gate → GREEN.

### Task 2.4 — TRIANGULATE: introduce a phantom file, confirm gate fails, then remove

- Temporarily add `test/phantom.test.ts` to `vitest.config.ts` include.
- Re-run quality gate → expect FAIL with the new test naming the phantom path.
- Remove the phantom reference, restore original.
- Re-run → expect PASS.

### Task 2.5 — REFACTOR + final verification

- Run `pnpm test`, `pnpm build`, `pnpm lint`.
- Confirm `pnpm test` baseline (1674/1674) still passes.

---

## Slice 3: #591 — CLI --help Consistency

- **Issue**: #591
- **Spec**: `openspec/changes/close-batch-562-580-591/specs/cli-help-consistency.md`
- **Strategy E2E**: no I/O ports involved. Pure handler logic + mock injection via `CliCommandContext`.

### Task 3.1 — RED: `dysflow mcp --help` exits 0 with no side effects

- Add `test/cli/subcommand-help.test.ts`.
- First scenario: `await runCli(["mcp", "--help"])` expects `exitCode === 0`, `stdout` non-empty and contains `mcp`, `stderr === ""`.
- Inject a mock `startMcpAdapter` via `CliCommandContext.startMcpAdapter` and assert it is NOT called.
- Run → currently FAILS because `mcp.ts` rejects `--help` with exit 1 and stderr (RED).

### Task 3.2 — GREEN: dispatch help at `runCli` level

- Update `src/cli/index.ts` to detect `--help` / `-h` in `commandArgs` AFTER the command is dispatched, return `{ exitCode: 0, stdout: HELP_TEXT, stderr: "" }` before invoking the handler.
- Defense in depth: also add `--help` / `-h` short-circuit at the top of `handleMcpCommand` returning the same shape.
- Re-run scenario → GREEN.

### Task 3.3 — TRIANGULATE: `dysflow doctor --help` exits 0 with no side effects

- Add second scenario to `subcommand-help.test.ts`:
  - `await runCli(["doctor", "--help"])` expects exit 0, stdout non-empty, stderr empty.
  - Inject mock `diagnosticsService` and `checkMcpWiring`; assert neither is called.
- Run → currently FAILS because `doctor.ts` runs the service (RED).
- GREEN: defense in depth at top of `handleDoctorCommand` returning help without invoking the service. Run → GREEN.

### Task 3.4 — TRIANGULATE: `dysflow access --help` exits 0 with no side effects

- Add third scenario:
  - `await runCli(["access", "--help"])` expects exit 0, stdout non-empty, stderr empty.
  - Inject mock `accessQueryService`; assert not used.
- Run → currently FAILS because `access.ts` returns "Unknown access subcommand: --help" with exit 1 (RED).
- GREEN: defense in depth at top of `handleAccessCommand` returning help. Run → GREEN.

### Task 3.5 — TRIANGULATE: `-h` is equivalent to `--help`

- Add parameterized scenario covering all three subcommands × `["--help", "-h"]`.
- Run → all pass.

### Task 3.6 — REFACTOR + final verification

- Centralize the help constant (`SUB_HELP_TEXT`) if useful, or keep HELP_TEXT as the single source.
- Run `pnpm test`, `pnpm build`, `pnpm lint`.

---

## Slice 4: Final Verification + Archive

### Task 4.1 — Full suite + Pester + build

- `pnpm test --run` — expect 1674/1674 baseline + new tests, 0 failing.
- `pnpm build` — expect success.
- `pnpm lint` — expect success (biome + tsc).
- `pwsh -Command "Invoke-Pester scripts/tests"` — expect 374 passed / 0 failed / 4 skipped baseline preserved.

### Task 4.2 — GitHub Actions CI green

- `git push origin main` after each commit.
- Confirm via `gh run list --branch main --limit 1` that the final run is green.

### Task 4.3 — Archive

- Move `openspec/changes/close-batch-562-580-591/` to `openspec/changes/archive/2026-06-28-close-batch-562-580-591/`.
- Write `archive-report.md`.
- Commit + push.

### Task 4.4 — Close issues with traceability

- `gh issue close 562 --comment "Re-cierre con evidencia (2026-06-28): commit <sha> ..."
- Same for #580 and #591.
- Use `--body-file` with a UTF-8 file to avoid PowerShell accent parsing issues (lesson from #14727).

---

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `a2f032d` | DELTA-001 (#562) serialization + sweep | 1.1–1.6 | `test/quality-gates/integration-config.test.ts` (2 tests) + `test/integration/global-setup-temp-sweep.test.ts` (3 tests) pass; baseline 1674 → 1679 | N/A |
| `43df22c` | DELTA-002 (#580) remove phantom refs | 2.1–2.5 | `test/quality-gates/ci-workflow.test.ts` extended (8 → 9 tests); structural gate triangulated with phantom-temp.test.ts; baseline 1679 → 1680 | N/A |
| `3df8a08` | DELTA-003 (#591) --help consistency | 3.1–3.6 | `test/cli/subcommand-help.test.ts` (7 tests, 3 subcommands × {--help,-h} + mocks) pass; baseline 1680 → 1687 | N/A |
| _pending_ | tasks.md traceability update | 4.0 | — | N/A |
| _pending_ | archive + close | 4.1–4.4 | CI green | N/A |

(Commit SHAs filled in during apply.)
