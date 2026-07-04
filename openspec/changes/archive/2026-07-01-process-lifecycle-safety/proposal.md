# Proposal: Process Lifecycle Safety — Audit-Driven Hardening

## Intent

Close three related process-lifecycle holes from the 2026-07-01 full-repo
audit (filed as issue #620). AGENTS.md and the project's process-safety
contract forbid "killing an MSACCESS.EXE that is not ours / not terminal
/ not provably headless." The current code slips past that rule in three
spots:

1. Headless detection on the preflight **orphan kill** path is a substring
   scan (`-Embedding`) over the entire command line, including the file
   path. A project path that merely contains the string `-embedding` is
   enough to kill a real, visible Access window.
2. The `cleanup` API's "running operation" gate at line 138 is bypassed
   by `force: true`, so `dysflow_access_cleanup(force:true)` can kill an
   in-progress automation that the registry still shows as `running`.
3. Orphan kill paths race against OS process recycling (no re-validation
   between `listProcesses` and `kill`) AND the cross-process lock
   heartbeat's non-ENOENT errors are swallowed by a debug-only logger
   (production does not wire `onHeartbeatError`).

Strict TDD, force-chained, target `main` per the 2026-07-01 campaign
authorization. No E2E during this cycle.

## Scope

### In Scope

- **F1 (🔴)** Replace the `-embedding` substring check in
  `src/core/operations/access-operation-preflight.ts:272,372` with
  `process.mainWindowHandle === 0` (headless) — the same gate
  `access-orphan-cleanup.ts:95,151` already uses and that the typed
  `OsProcessInfo` already carries. `undefined` must be treated as
  "unknown" → refuse, mirroring the `cleanupOrphan` refusal at
  `access-orphan-cleanup.ts:151-161`.
- **F2 (🔴)** In `src/core/operations/access-operation-cleanup.ts:138`,
  `force: true` MUST NOT permit killing a `running` operation. The
  running record means an in-progress automation owns that PID. Define
  the precise contract: `force` already allows retired-PID and
  terminal-state records; a still-running operation is the
  explicitly-out-of-scope case (callers can `update` the record to a
  terminal state first or wait for it). Add an explicit refusal code
  distinct from `CLEANUP_STATUS_NOT_ELIGIBLE` so the MCP layer can
  surface it as actionable.
- **F3 (🟡)** Two coordinated fixes:
  - **F3a:** Preflight orphan-kill sites
    (`access-operation-preflight.ts:265-293` and `:364-394`) MUST
    re-validate the PID with `processInspector.getProcess(pid)` between
    scan and kill. Race window today: another actor kills the PID, our
    `kill()` either hits a recycled PID or throws and is logged as a
    warning.
  - **F3b:** `runWithAccessExecutionLock`
    (`src/core/runner/cross-process-lock.ts:193-237`) MUST accept an
    `onHeartbeatError` callback threaded from the runner, and the
    production wiring (`src/core/runner/access-runner.ts:226` →
    `AccessPowerShellRunner.run`) MUST surface non-ENOENT heartbeat
    failures as a warning diagnostic on the `OperationResult`. Default
    `logSwallowedIoError` becomes last-resort fallback only, not the
    production default.

### Out of Scope

- The orphan-list (`access-orphan-cleanup.ts:57-108`) gate — it already
  uses `mainWindowHandle === 0`. F1 only changes the preflight path.
- The registry-mutation lock 30s staleness asymmetry vs. a
  never-stale `running` record (observation #15169 also flagged this).
  Touching it would mix a state-machine fix into a process-kill fix;
  surface it as tech debt for the 2026-07-24 hexagonal-tech-debt
  pass, do not bundle here.
- A new MCP tool or surface change. The fix is a contract tightening.
- Refactors that move `OsProcessInfo` typing or split the runner.

## Capabilities

### New Capabilities

- **`process-lifecycle-safety`**: The Access process lifecycle gate.
  Covers headless detection, the "running operation cannot be force-killed"
  rule, and the orphan-kill race window. New
  `openspec/specs/process-lifecycle-safety/spec.md` is required.

### Modified Capabilities

None at the requirement level — current specs do not enumerate these
gates, so they are new rather than delta.

## Approach

Strict TDD: RED → GREEN → REFACTOR per finding. Every fix is a port-level
unit test in the same shape as the existing
`access-orphan-cleanup.test.ts` (process ports: `processScanner`,
`processInspector`, `processKiller` injected; no real Access COM).

Reference patterns to mirror:

- `src/core/operations/access-orphan-cleanup.ts:91-108` — the
  `mainWindowHandle === 0` candidate filter (F1 mirror).
- `src/core/operations/access-orphan-cleanup.ts:151-180` — the
  explicit re-validation gates (F1 + F3a mirror: refuse when
  `mainWindowHandle === undefined` or non-zero, when command line
  is missing or path mismatches).
- `src/core/operations/access-operation-cleanup.ts:138` — the status
  gate that F2 currently ignores when `force` is set.

NO E2E during this cycle (per 2026-07-01 cycle rule). Integration tests
in `test/integration/**` and unit tests in `test/core/**` cover all
three findings.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/operations/access-operation-preflight.ts` | Modified | F1 (lines 272, 372): drop `-Embedding` substring, use `mainWindowHandle === 0` (refuse when undefined). F3a (lines 265-293, 364-394): re-validate PID with `processInspector.getProcess(pid)` before `kill`. |
| `src/core/operations/access-operation-cleanup.ts` | Modified | F2 (line 138): `running` status must be refused even when `force: true`. Add a typed refusal code (`CLEANUP_RUNNING_FORCE_REFUSED`) distinct from `CLEANUP_STATUS_NOT_ELIGIBLE`. |
| `src/core/runner/cross-process-lock.ts` | Modified | F3b (lines 134-162, 193-237): `startLockHeartbeat` and `runWithAccessExecutionLock` accept an `onHeartbeatError` callback. Production default — when caller does NOT supply one — surfaces to a `Diagnostic` level, not `console.debug`. |
| `src/core/runner/access-runner.ts` | Modified | F3b (line 226): `run` collects heartbeat errors during the run and attaches them as warning diagnostics on the `OperationResult`. |
| `test/core/operations/access-operation-preflight.test.ts` | Modified | F1: flip the two pinned-by-bug tests at lines 707-740 and 742-782. New tests: `-Embedding` substring without `mainWindowHandle === 0` is refused; `mainWindowHandle === undefined` is refused; `mainWindowHandle === 0` is killed. F3a: PID disappears between scan and kill → kill suppressed + diagnostic. |
| `test/core/operations/access-operation-cleanup.test.ts` | Modified | F2: add the missing matrix test — `status: running`, `force: true`, alive PID → refused with `CLEANUP_RUNNING_FORCE_REFUSED`; and the kept test at line 137 (alive PID with status running, force:true, process gone) stays green because the new path also checks process liveness before any status check. |
| `test/core/runner/cross-process-lock.test.ts` | Modified | F3b: heartbeat error surfaces to the runner's `OperationResult` as a warning diagnostic; default-fallback behavior tested in production wiring. |
| `test/core/runner/access-runner-lock-heartbeat.test.ts` | Modified | F3b: heartbeat utimes fails non-ENOENT → warning diagnostic, not silent. |
| `openspec/specs/process-lifecycle-safety/spec.md` | New | New capability spec: headless detection contract, force-vs-running rule, race-window re-validation, heartbeat-propagation contract. |

## Chain Split (force-chained PRs, 400-line budget)

Estimated total: 360-480 changed lines across the three fixes. Each PR
stays inside the budget and has its own rollback boundary.

| # | PR | Goal | Likely Δ | TDD evidence | Verification | Rollback |
|---|---|---|---|---|---|---|
| **1** | `[#620/1] F1: replace substring headless detection with mainWindowHandle === 0` | Drop `-Embedding` scan; require `mainWindowHandle === 0`; refuse `undefined` | 130-180 | Flip 2 existing pinned-by-bug tests in `access-operation-preflight.test.ts`; add 3-4 new cases (substring-only, undefined, non-zero, zero) | `pnpm test` | Revert; substring scan restored |
| **2** | `[#620/2] F2: refuse force-kill of running operations` | Tighten `cleanup` status gate; add typed `CLEANUP_RUNNING_FORCE_REFUSED` | 80-120 | New unit tests in `access-operation-cleanup.test.ts` for the 4-cell matrix (force × alive/gone × running/non-running) | `pnpm test`; integration `test/integration/**` confirm MCP error envelope | Revert; existing tests stay green |
| **3** | `[#620/3] F3: orphan-kill race + heartbeat propagation` | F3a re-validate PID before kill in preflight; F3b propagate heartbeat errors through runner to `OperationResult` | 150-180 | New tests in `access-operation-preflight.test.ts` (race window) + `cross-process-lock.test.ts` + `access-runner-lock-heartbeat.test.ts` (heartbeat propagation) | `pnpm test` | Revert; heartbeat default falls back to `console.debug` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| F1: legitimate orphan (path contains `-embedding`) was being killed before; now needs operator confirmation | Med | This IS the bug the user reported — the fix IS the change. Document clearly that orphan-kill paths now require `mainWindowHandle === 0` AND operator confirmation via `dysflow_access_force_cleanup_orphaned`. |
| F1 flips 2 tests that pin the substring behavior → those tests must rewrite, not just patch | Med | Treat each flipped test as a paired GREEN for the new contract (zero-regression expected since the new contract is stricter). |
| F2 breaks a documented caller that uses `force: true` to break a runaway automation | Low | The audit calls out exact this category: that is the unsafe pattern being closed. Workaround: caller updates the record to `timed_out` first via `dysflow_vba_inline_execution` or waits. Document in changelog; UAT validates the new error is actionable. |
| F3a revalidation adds a `getProcess` round-trip to every preflight kill → latency regression on noisy machines | Low | Bound by `operationTimeoutMs` (default 3000ms); use the same timeout the rest of the preflight already uses. |
| F3b heartbeat diagnostic now surfaces to MCP → operator-visible noise on transient `EPERM` during teardown | Low | Keep ENOENT suppressed (lock already released — correct). Make all other errors a `Diagnostic warning` (not `error`) so the operation succeeds but the message is visible. |
| F3b change to `runWithAccessExecutionLock` API breaks a downstream caller | Low | `onHeartbeatError` is optional with a default; default behavior changes from `console.debug` to `() => undefined` (silent fallback that logs nothing) — strictly safer, no caller relying on the debugger. Production wiring is what we change, not the API contract. |

## Rollback Plan

Each PR is independently revertable. The fixes are additive corrections
to internal gates; reverting any single PR restores prior behavior
without data loss. PR 1 revert restores the substring scan (the bug
returns); PR 2 revert restores the bypassed status gate (the kill
returns); PR 3 revert restores the race window and silent heartbeat
default.

## Dependencies

- `OsProcessInfo.mainWindowHandle` field already typed in
  `src/core/operations/access-operation-cleanup.ts:17-30`.
- Existing port-level test pattern at
  `test/core/operations/access-orphan-cleanup.test.ts`.
- The orphan-list gate at `access-orphan-cleanup.ts:91-108` is the
  reference implementation F1 mirrors.
- Project conventions: strict TDD, force-chained PRs, 400-line budget,
  target branch `main` (no staging on origin), conventional commits
  with `SDD: process-lifecycle-safety` and `Issue: #620` in body.

## Success Criteria

- [ ] **F1**: `access-operation-preflight.ts` orphan-kill sites (lines
      272, 372) classify headlessness via `mainWindowHandle === 0` only.
      `process.commandLine.includes("-Embedding")` is no longer a kill
      signal. `mainWindowHandle === undefined` is refused, not killed.
      Pin via flip + new cases in
      `test/core/operations/access-operation-preflight.test.ts`.
- [ ] **F2**: `AccessOperationCleanupService.cleanup({ force: true })`
      with `record.status === "running"` and a live owned PID returns
      `CLEANUP_RUNNING_FORCE_REFUSED` and does NOT call
      `processKiller.kill`. The existing test at
      `access-operation-cleanup.test.ts:137` (status running, force:true,
      process gone) stays green because the new code checks process
      liveness before status. Pin via new matrix tests in the same file.
- [ ] **F3a**: orphan-kill at `access-operation-preflight.ts:265-293`
      and `:364-394` re-validates the PID with `processInspector.getProcess`
      immediately before `processKiller.kill`. Race window produces a
      warning diagnostic and suppresses the kill. Pin via new tests in
      `test/core/operations/access-operation-preflight.test.ts`.
- [ ] **F3b**: `runWithAccessExecutionLock` accepts and applies
      `onHeartbeatError`. `AccessPowerShellRunner.run` forwards
      heartbeat errors as warning diagnostics on the `OperationResult`.
      Default in production falls back to a `console.debug`-level logger
      ONLY when no caller provides a sink. Pin via new tests in
      `cross-process-lock.test.ts` and `access-runner-lock-heartbeat.test.ts`.
- [ ] `pnpm test`, `pnpm test:integration` (Windows only, where
      available), and `pnpm build` pass after each PR.
- [ ] Each PR's commit body carries `SDD: process-lifecycle-safety` and
      `Issue: #620` per `gentle-ai:sdd-commit-traceability`. No AI
      co-author attribution.

## Audit-precision notes

The user's launch-prompt text said the files live under
`src/adapters/mcp/`; the actual paths confirmed by reading the repo are:

- `src/core/operations/access-operation-preflight.ts` (not
  `src/adapters/mcp/`). Lines 272 and 372 of the audit's findings are
  correct.
- `src/core/operations/access-orphan-cleanup.ts` (not
  `src/adapters/mcp/`). Reference pattern at lines 95 and 151 is
  correct.
- `src/core/operations/access-operation-cleanup.ts` (not
  `src/adapters/mcp/`). Line 138 is correct.

Observation #15169 (`Orphan Access cleanup: unsafe headless-detection +
force-kill of running ops`) is the canonical fingerprint of finding
location. F2's "what does `force` mean" interpretation is open: the
audit frames `force: true` as a fail-safe that should never bypass the
running gate; this proposal encodes that interpretation directly. If
the user intended `force: true` as "kill at all costs even if the
operation is mid-flight," F2 needs a different shape (a separate
`hardKill: true` flag rather than reusing `force`). Surface this in the
spec phase.

The TOCTOU finding's framing covers two distinct surfaces
(`access-operation-preflight.ts` orphan kill paths vs.
`cross-process-lock.ts` heartbeat). This proposal treats them as one
finding (F3) because the call sites share an interface contract
("don't kill a process you cannot prove is still the one you saw").
The heartbeat-propagation part is more visible today; the
orphan-kill-race part is more dangerous but harder to reproduce.
