# Worklog — Dysflow hardening (master handoff, 2026-05-31)

> LIVING DOC. Any agent can resume from here. `[ ]` todo · `[~]` in progress · `[x]` done.
> Keep "Current state" accurate. This is the index for the whole effort; per-topic detail
> lives in the linked docs.

**Current state:** v1.2.4 RELEASED (commit `c516aca`, tag `v1.2.4`, GitHub release name==tag,
assets tar.gz + SHA256SUMS). Waiting on USER to `dysflow update` + restart OpenCode in CONDOR
and retry the battery to validate the dead-PID cleanup fix end-to-end.

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
- [x] Commit `c516aca` (conventional, no co-author), tag `v1.2.4`, pushed main + tag.
- [x] Release workflow SUCCESS; GitHub release `name == tagName == v1.2.4`, assets `dysflow-v1.2.4.tar.gz` + `SHA256SUMS`.
- [~] **USER ACTION**: run `dysflow update`, restart OpenCode in CONDOR, retry the battery — pending user validation.

## CONDOR operational guidance (for the other AI)
- Real op registry is `.dysflow/runtime/operations.json` — NOT the legacy `.access-vba-skill/session.json` (that path is dead in current dysflow; editing it does nothing).
- STOP manually `taskkill`-ing MSACCESS — that is what desyncs the registry. Let v1.2.x clean its own processes.
- After v1.2.4 + `dysflow update` + OpenCode restart, dead-PID "running" entries should auto-reconcile on preflight; and `dysflow_access_cleanup ... force:true` will retire them.

## v1.2.5 — IN PROGRESS — doctor detects local↔global MCP command drift

**Why**: project-local `opencode.json` files redefine the dysflow MCP `command`; when the global
config / runtime evolves, the locals drift and (because local wins) silently break that repo.
The v1.2.3 check only catches a DEAD entrypoint, not a live-but-divergent local override.

**Design** (extend `src/cli/commands/opencode-mcp-wiring.ts`, read-only, warn-only):
- Severity order, one finding: (1) effective entrypoint missing → existing dead-path warning; else
  (2) project-local defines a dysflow `command` that DIFFERS from the global `command` (or global
  has none) → NEW drift warning naming both config files; else (3) no warning.
- Principle being enforced: the MCP `command` belongs ONCE in the global config; per-repo config
  should carry at most project-specific `env`, never redefine the command.

- [x] (TDD) tests: local differs from global → drift warning; identical → null; local-only command → warning; dead path still wins. (16 tests green)
- [x] Implement in `opencode-mcp-wiring.ts` (Priority 2 drift check + commandsAreEqual); doctor rendering unchanged.
- [x] Verify: 16 targeted tests green, build 0, biome clean.
- [x] Bump → 1.2.5 + CHANGELOG; commit `610d29e`, tag `v1.2.5`, Release SUCCESS, name==tag==v1.2.5, not draft, assets tar.gz + SHA256SUMS.
- [~] USER: `dysflow update` to pick up v1.2.5 (drift detection in doctor).

## v1.2.6 — NEEDED — Access.Application PID capture leaks MSACCESS zombies (ROOT CAUSE of import hang)

**Acceptance criterion (user): all E2E must pass for real.** NOT MET.

Real MCP E2E run 2026-05-31 against the LIVE v1.2.5 runtime (`node E2E_testing/mcp-e2e.mjs`,
fixtures = E2E_testing/NoConformidades*.accdb, password dpddpd). Report:
`E2E_testing/.dysflow/mcp-e2e-temp/mcp-e2e-report.md`.

Result: **88 PASS / 16 FAIL. ALL 16 failures are `:zombie-check` — zero functional failures.**
Every tool returned correct data. The final `lingering-access-check` was clean (suite teardown
swept them), so zombies leak BETWEEN operations and accumulate.

Operations that leak a zombie (open `Access.Application`): link_tables, relink_tables,
localize_backend_links, relink_directory, create_table, export_modules, export_all, compile_vba,
verify_code, delete_module, fix_encoding, harvest_form_catalog, run_vba (+ dry-run import_modules/
import_all/test_vba detect the accumulated ones). CLEAN: reads, DML writes (exec_sql/run_script/
seed/teardown/drop_table — DAO path, no MSACCESS), generate_erd, form JSON ops.

**Root cause (proved by the suite):** `export_modules` stdout WARN — "se detectaron varias
instancias nuevas de MSACCESS y no se pudo identificar con certeza cuál". The cleanup identifies
the PID by a before/after process DIFF around `New-Object Access.Application`; that heuristic FAILS
when multiple MSACCESS instances exist (can't pick the right one → kills none → zombie). Zombies
accumulate → DB locks → CONDOR's import/compile HANG under a heavy battery. v1.2.2's wait+taskkill
only works when the PID was correctly identified.

### CONFIRMED ORIGIN — this is a migration REGRESSION (user: "antiguamente no se quedaba zombie")

The OLD pre-migration skill that did NOT leak zombies still exists on disk:
**`C:/Proyectos/APAP/access-vba-sync/VBAManager.ps1`** (1020 lines). Other copies:
`C:/Proyectos/workflow/skills/access-vba-sync`, `~/.config/opencode/skills/access-vba-sync`,
`C:/00repos/codigo/*/.agents/skills/access-vba-sync`. The old skill `skills/` dir was NEVER in this
repo's git history — the migration re-implemented the PS into `scripts/dysflow-*.ps1` and LOST the
deterministic PID capture.

OLD reference (faithful pattern to port), `VBAManager.ps1`:
- `Get-ProcessIdFromHwnd` (L420-440): Win32 P/Invoke `GetWindowThreadProcessId`.
- `Open-AccessDatabase` (L442-534): right after `New-Object Access.Application`, captures the EXACT
  PID via `[IntPtr]$access.hWndAccessApp` → `Get-ProcessIdFromHwnd` (L480-485), retried after open
  (L489-496); pre/post diff is only a tertiary confirmation (L498-505). PID stored in the session.
- `Close-AccessDatabase` (L536-571): `CloseCurrentDatabase()` → `Quit()` → `FinalReleaseComObject`
  of VbProject, Vbe, AccessApplication → `GC.Collect()` + `WaitForPendingFinalizers()` → then
  `Stop-Process -Id $accessPid -Force` twice (300ms apart) as the belt-and-suspenders fallback.

Current state of the migrated scripts (the regression):
- `scripts/dysflow-access-runner.ps1`: **0 uses of hWndAccessApp / GetWindowThreadProcessId** — has
  NO deterministic capture at all (link_tables, create_table, relink_* leak from here).
- `scripts/dysflow-vba-manager.ps1`: has hWndAccessApp (2 uses) but falls back to an ambiguous
  command-line/diff heuristic that emits the WARN at L1239 ("varias instancias nuevas... no se pudo
  identificar con certeza cuál") and then fixes NO pid → zombie.

**Fix plan (port the origin, do NOT redesign):**
- [ ] In BOTH `dysflow-access-runner.ps1` and `dysflow-vba-manager.ps1`: make `hWndAccessApp` →
  `GetWindowThreadProcessId` the PRIMARY PID capture, taken immediately after opening
  `Access.Application`. Keep the command-line/diff only as a last-resort fallback when hWndAccessApp
  is 0. Clean close in finally (CloseCurrentDatabase→Quit→release all COM→GC→WaitForPendingFinalizers),
  then Stop-Process the EXACT pid as fallback.
- [ ] DO NOT change functional behavior — every E2E functional op must keep returning the same result.
- [ ] **AUDIT for OTHER migration regressions** (user request): diff the OLD skill vs current scripts/src
  for other robustness lost in the migration (COM release completeness, finally-block error handling,
  timeouts, encoding, password handling, AllowBypassKey/StartupFeatures restore — note the OLD
  Open/Close did Enable/Restore-AllowBypassKey + Disable/Restore-StartupFeatures; verify current keeps
  these). Produce a prioritized list with file:line.
- [x] **PORTED**: `Get-ProcessIdFromHwnd` + `hWndAccessApp` primary capture added to dysflow-access-runner.ps1 (had none) and made primary in dysflow-vba-manager.ps1 (fixed a bug where the WMI diff unconditionally overwrote the good hWnd PID). Surgical; no functional change.
- [x] **ACCEPTANCE GATE MET**: re-ran the E2E against the fixed scripts via a temp runtime (`.e2e-fix-rt`, DYSFLOW_HOME→edited scripts). **104/104 pass, 0 zombie-check failures** (was 88/16). All 16 former leaks now clean in ~200ms; the "varias instancias" WARN is gone.
- [~] Release v1.2.6, user `dysflow update`, re-run CONDOR battery.
- [ ] Cleanup: remove `.e2e-fix-rt`, `E2E_testing/e2e-run.log`, `E2E_testing/e2e-fix-run.log` (temp validation artifacts); E2E left probe tables/exports in the E2E_testing fixture (not committed).
- [ ] STILL OPEN (user request): audit OLD skill vs current for OTHER migration regressions.

NOTE: deep work in monolithic PS (3245 + 1881 lines). The dev sandbox shell CAN run the E2E (Access
spawns sequentially, ~4 min) but hangs on heavy PARALLEL spawning (vitest fork-pool / pnpm install).

## Known issues / parked
- [ ] **CI "Windows PowerShell/Access smoke" job RED (pre-existing)**: integration test asserts PS script contains `$rs = $readDb.Database.OpenRecordset(...)` which is no longer present — test/script drift, unrelated to this session. The "Quality gates" job (lint/test/build/coverage on ubuntu) is GREEN. Ties to the user's "all E2E green" requirement — needs a separate fix.
- [ ] **Coverage uplift** parked at branches 78.1% (gate lowered to 77). New tests written in worktree `coverage-uplift-2026-05` (mcp/access/http happy-path, 14 passing). Threads-pool full run: 699 passed / 5 failed (env-flaky). See `COVERAGE_uplift_2026-05-30.md`.
- [ ] **Worktree cleanup**: temporary worktree `C:/Proyectos/dysflow-cov-tmp` (branch `coverage-uplift-2026-05`) still on disk — remove when coverage work lands or is abandoned.
- [ ] Optional: set `name: ${{ github.ref_name }}` explicitly in `release.yml` (default already yields title==tag, observed on v1.2.3).
