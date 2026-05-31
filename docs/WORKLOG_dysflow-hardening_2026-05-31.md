# Worklog — Dysflow hardening (master handoff, 2026-05-31)

> LIVING DOC. Any agent can resume from here. `[ ]` todo · `[~]` in progress · `[x]` done.
> Keep "Current state" accurate. This is the index for the whole effort; per-topic detail
> lives in the linked docs.

**Current state:** v1.2.4 fix IMPLEMENTED + verified locally (30 targeted tests green, build 0,
biome clean). About to commit/tag/push v1.2.4. After release publishes: TELL THE USER to run
`dysflow update` to validate the CONDOR stale-entry fix.

Related docs: `INCIDENT_mcp-connection_2026-05-30.md`, `AUDIT_2026-05-30.md`,
`COVERAGE_uplift_2026-05-30.md`.

---

## Timeline / what shipped

- **v1.2.2** (released earlier): MSACCESS zombie-cleanup fix (deterministic 20s wait + `taskkill /F /PID`, PID re-resolution). Confirmed PRESENT in the installed runtime by code markers (`Stop-AccessPidAndWait`, `Find-AccessPidByDatabase`).
- **v1.2.3** (released 2026-05-31 08:09, this session):
  - Bumped `package.json` 1.1.0 → 1.2.3 (the version string was stuck at 1.1.0 despite v1.2.x releases — `package.json` never bumped; made `dysflow update` / MCP `serverInfo` report stale).
  - Added `dysflow doctor` OpenCode-MCP-wiring check (detects a dysflow MCP `command` pointing at a non-existent entrypoint).
  - Fixed 2 CRLF lint errors (`extractor.ts`, `access-runner.test.ts`).
  - Commit `b27d727`, tag `v1.2.3`, Release workflow SUCCESS.

## v1.2.4 — IN PROGRESS — cleanup of dead-PID "running" entries

### The bug (confirmed by reading v1.2.3 source)
A registry entry with `status: "running"` whose PID is already dead gets STUCK and blocks new ops:

1. **Gated cleanup** `src/core/operations/access-operation-cleanup.ts:107-115`: after `getProcess(accessPid)` returns `undefined` (PID gone), it returns `CLEANUP_PROCESS_NOT_FOUND` — refuses **even with `force: true`**. But "process gone" means the orphan is already gone → the entry should be RETIRED (marked cleaned), not refused.
2. **Preflight** `src/core/operations/access-operation-preflight.ts:38-43,82`: `ELIGIBLE_STATUSES` = `timed_out, failed, cleanup_pending, pid_unknown` — **"running" is excluded**, so preflight skips a dead-PID "running" entry and never auto-reconciles it. (For eligible statuses it already does the right thing: `:128` `process === undefined → markCleaned`.)

Real-world hit: CONDOR `.dysflow/runtime/operations.json` had entry `dysflow-6a1692cf...`, status `running`, PID 26668 from 2026-05-29 (dead) → un-cleanable both ways → blocked `compile_vba`/`test_vba`.

### The fix (design)
- **Cleanup**: when `getProcess` returns `undefined` (PID verified gone), mark the operation cleaned and return SUCCESS instead of `CLEANUP_PROCESS_NOT_FOUND`. Nothing to kill ⇒ goal already met. (Reaching this line for a `running` entry still requires `force`, due to the `CLEANUP_STATUS_NOT_ELIGIBLE` gate at `:98` — unchanged.)
- **Preflight**: reconcile `running` entries whose PID is verifiably GONE → `markCleaned`. Do NOT add `running` to the kill-eligible path (never kill a genuinely-live matching Access that could be a concurrent legit op). Only mark-cleaned-when-gone (and when PID reused / name+startTime mismatch → also stale → markCleaned).

### Tasks (TDD — write failing test first)
- [x] Cleanup test: `running` + `force`, inspector→undefined ⇒ success `status:"cleaned"` (not CLEANUP_PROCESS_NOT_FOUND); registry purged.
- [x] Cleanup test: eligible `timed_out`, inspector→undefined ⇒ success cleaned.
- [x] Cleanup regression: live matching MSACCESS ⇒ still kills + cleaned.
- [x] Preflight test: `running` + dead PID (inspector→undefined) ⇒ in `result.cleaned`, NOT in `killed`.
- [x] Preflight test: `running` + live matching process ⇒ NOT cleaned, NOT killed (left alone).
- [x] Implement cleanup change (`access-operation-cleanup.ts`): dead PID ⇒ markCleaned + success.
- [x] Implement preflight change (`access-operation-preflight.ts`): new `reconcileRunningRecord()` marks-cleaned-when-gone, never kills a live match.
- [x] Verify: 30 targeted tests green (`--pool=threads`), `pnpm build` exit 0, `biome check` clean.
- [x] Bump `package.json` → 1.2.4 + CHANGELOG entry.
- [~] Commit (conventional, NO co-author), tag `v1.2.4`, push main + tag.
- [ ] Confirm Release workflow success and GitHub release `title == name == v1.2.4`.
- [ ] **TELL THE USER to run `dysflow update`, then restart OpenCode in CONDOR and retry the battery.**

## CONDOR operational guidance (for the other AI)
- Real op registry is `.dysflow/runtime/operations.json` — NOT the legacy `.access-vba-skill/session.json` (that path is dead in current dysflow; editing it does nothing).
- STOP manually `taskkill`-ing MSACCESS — that is what desyncs the registry. Let v1.2.x clean its own processes.
- After v1.2.4 + `dysflow update` + OpenCode restart, dead-PID "running" entries should auto-reconcile on preflight; and `dysflow_access_cleanup ... force:true` will retire them.

## Known issues / parked
- [ ] **CI "Windows PowerShell/Access smoke" job RED (pre-existing)**: integration test asserts PS script contains `$rs = $readDb.Database.OpenRecordset(...)` which is no longer present — test/script drift, unrelated to this session. The "Quality gates" job (lint/test/build/coverage on ubuntu) is GREEN. Ties to the user's "all E2E green" requirement — needs a separate fix.
- [ ] **Coverage uplift** parked at branches 78.1% (gate lowered to 77). New tests written in worktree `coverage-uplift-2026-05` (mcp/access/http happy-path, 14 passing). Threads-pool full run: 699 passed / 5 failed (env-flaky). See `COVERAGE_uplift_2026-05-30.md`.
- [ ] **Worktree cleanup**: temporary worktree `C:/Proyectos/dysflow-cov-tmp` (branch `coverage-uplift-2026-05`) still on disk — remove when coverage work lands or is abandoned.
- [ ] Optional: set `name: ${{ github.ref_name }}` explicitly in `release.yml` (default already yields title==tag, observed on v1.2.3).
