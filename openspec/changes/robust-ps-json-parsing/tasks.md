# Tasks: Robust PowerShell→TS Result JSON Channel

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 260-380 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 parser contract → PR 2 PowerShell emitters |
| Delivery strategy | force-chained |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Strict TS sentinel parser + tests | PR 1 | Base = feature/tracker branch; no PS edits. |
| 2 | PS `Write-DysflowResult` conversion + tests | PR 2 | Base = PR 1 branch; grep audit included. |

## Phase 1: TS Parser Contract (TDD)

- [ ] 1.1 **RED**: Add failing sentinel tests in `test/core/runner/access-runner.test.ts` for valid, brace-noise before/after, missing, duplicate, and malformed `DYSFLOW_RESULT` output.
- [ ] 1.2 **RED**: Add failing vba-manager parsing tests in `test/adapters/vba-sync/vba-sync-adapter.test.ts` proving sentinel parsing and removal of `{ ok: true, stdout }` fallback.
- [ ] 1.3 **GREEN**: Add shared `RESULT_MARKER` / typed result-channel error in `src/core/runner/access-runner.ts` or a small shared marker module used by both parsers.
- [ ] 1.4 **GREEN**: Replace `parseRunnerData` brace slicing in `src/core/runner/access-runner.ts` with strict one-line sentinel extraction; keep runner object validation.
- [ ] 1.5 **GREEN**: Replace `parseOutput` brace/bracket slicing in `src/adapters/vba-sync/vba-sync-adapter.ts`; allow object or array payloads, but fail on missing/duplicate/malformed sentinel.
- [ ] 1.6 **REFACTOR**: Document the stdout `DYSFLOW_RESULT ` contract beside existing marker comments and run focused tests with `pnpm test`.

## Phase 2: PowerShell Result Emission (TDD)

- [ ] 2.1 **RED**: Update `scripts/tests/dysflow-vba-manager.Tests.ps1` expectations from `##MODULE_RESULTS:` to `DYSFLOW_RESULT `, including compact single-line JSON.
- [ ] 2.2 **GREEN**: Add identical `Write-DysflowResult` helpers to `scripts/dysflow-access-runner.ps1` and `scripts/dysflow-vba-manager.ps1`, preserving per-call `-Depth`.
- [ ] 2.3 **GREEN**: Convert terminal stdout result emits in `scripts/dysflow-access-runner.ps1` to `Write-DysflowResult`; do not touch stderr markers or file `Set-Content` JSON.
- [ ] 2.4 **GREEN**: Convert vba-manager `##MODULE_RESULTS:` and terminal result emits in `scripts/dysflow-vba-manager.ps1` to `Write-DysflowResult`.
- [ ] 2.5 **REFACTOR**: Grep-audit remaining `ConvertTo-Json` sites in both scripts and record every untouched site as non-stdout/file/telemetry.

## Phase 3: Verification / Handoff

- [ ] 3.1 Run `pnpm test` and confirm the strict TDD RED→GREEN evidence for both PR slices.
- [ ] 3.2 Update this file with implementation commits, task completion marks, test evidence, and Access sync status `N/A`.
