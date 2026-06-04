# Tech-Debt Remediation — Tracking Ledger

> **Single source of truth** for the multi-issue tech-debt cleanup campaigns in the dysflow MCP
> runtime. This ledger exists so that **any AI (or human) can resume the work exactly where it was
> left** if the active session runs out of tokens or is compacted. Keep it accurate — update it as
> the **first** action after any state change, before moving on.

---

## If you are resuming this work — READ THIS FIRST

1. Read this whole file. The **Status board** below tells you which issue is in flight and the
   **exact next action**.
2. For the issue currently in flight, open its GitHub issue (link in the board) — the issue body is
   the authoritative spec (context, problem with `file:line`, acceptance criteria, constraints).
3. Recover SDD state for the active change (see **Artifact store** section) before writing code.
4. Honor the **Workflow contract** below. Do not skip the close + archive steps.
5. After every meaningful step, update this ledger (status, branch, PR, next action) and the
   `Last updated` line.
6. Cross-check reality with `gh issue list --state open` and engram (`mem_search "tech-debt"`),
   which are the authoritative remote state if this file ever lags.

`Last updated`: 2026-06-04 — #414-#419 + #426 done (PRs #421-#425, #427 merged; #419 committed directly to main). **NEXT: Issue G (#420).**

> CI fact (verified): `runs a real diagnostics check` (access-runner.test.ts:860) NEVER runs in CI — Quality gates is ubuntu (test early-returns on non-win32); Windows smoke runs only the integration config, not `pnpm test`. Its local Windows failure is a dev-box live-Access issue, NOT a CI/release blocker.

> **Process notes for remaining issues** (learned the hard way on #417):
> - Sub-agents do NOT run biome → CI `Quality gates` fails on format. Run `biome check --write` on ALL changed `.ts` files before pushing. Windows working tree is CRLF, so local `biome check` shows ~11 pre-existing false-positives; verify the real subset with `biome check <changed-files>`.
> - The live diagnostics test in `test/core/runner/access-runner.test.ts` spawns REAL Access on Windows (only early-returns on non-win32). A failure there is a genuine signal, NOT environmental noise — investigate before dismissing.

---

## Previous campaign (2026-06-03) — CLOSED

All 5 issues shipped in v1.2.15. No open work remaining from this campaign.

| Issue | Title | PR | Result |
|-------|-------|----|--------|
| [#410](https://github.com/DysTelefonica/dysflow/issues/410) | Make Windows-coupled CI tests platform-aware | [#411](https://github.com/DysTelefonica/dysflow/pull/411) | done ✅ |
| [#405](https://github.com/DysTelefonica/dysflow/issues/405) | Unify bifurcated MCP tool registration | [#409](https://github.com/DysTelefonica/dysflow/pull/409) | done ✅ |
| [#406](https://github.com/DysTelefonica/dysflow/issues/406) | Remove duplicated VBA comparison types | [#412](https://github.com/DysTelefonica/dysflow/pull/412) | done ✅ |
| [#407](https://github.com/DysTelefonica/dysflow/issues/407) | Make AccessOperationRegistry ownership explicit | [#413](https://github.com/DysTelefonica/dysflow/pull/413) | done ✅ |
| [#408](https://github.com/DysTelefonica/dysflow/issues/408) | HTTP adapter input validation parity | [#413](https://github.com/DysTelefonica/dysflow/pull/413) | done ✅ |

---

## Active campaign (opened 2026-06-04)

### Progress log

- **2026-06-04**: Architecture review complete. 7 issues filed (#414–#420). Campaign opened.
- **2026-06-04**: #414 (high) done — heartbeat keeps cross-process Access lock fresh. PR #421 merged, CI green, SDD archived (engram `sdd/414-.../archive-report`). D4 (injectable lock Map) de-scoped as non-essential.
- **2026-06-04**: #415 (med) done — release cross-process lock before in-process waiter; md5→sha256 lock path. PR #422 merged, CI green, SDD archived. Behavior-preserving (verified inline).
- **2026-06-04**: #416 (med) done — constant-time bearer token compare (timingSafeEqual + length guard). PR #423 merged, CI green, SDD archived.
- **2026-06-04**: #417 (med) done — sanitize marker commandLine before registry + typed marker guards. PR #424 merged, CI green, SDD archived. Caught & fixed a real regression: the typed guard must accept null processStartTime/commandLine (PS emits both as JSON null). Added marker-contract test.
- **2026-06-04**: #418 (med) done — single authoritative timeout in vba-sync (removed adapter Promise.race wrapper; executor timer wins). PR #425 merged, CI green, SDD archived. Fresh verify flagged a flaky #414 test → tracked as follow-up issue H below.
- **2026-06-04**: #426 (H, med) done — de-flaked the #414 lock-heartbeat test (vi.waitFor poll vs fire-and-forget utimes race). PR #427 merged, CI green, SDD archived. Test-only.

---

## Environment gotcha (READ if bash commands look broken)

The Bash tool spawns **Git Bash**, which mounts `C:` only at `/cygdrive/c`, but the Claude Code
harness writes its cwd-tracking marker under `/c/...`. Result: **every bash command exits `1` with a
trailing `…/Temp/claude-XXXX-cwd: No such file or directory`** even though the command itself ran and
its output is valid. This also makes the **Skill tool fail** (its `!command` substitution treats the
non-zero exit as fatal).

- **Per-command workaround (works now)**: prefix any bash command with `mount C:/ /c 2>/dev/null;`.
- **Durable fix (already applied, needs a Claude Code restart to activate)**: `BASH_ENV` is set in
  `HKCU\Environment` to `C:/Users/adm1/.claude-bash-env.sh`, which runs `mount C:/ /c` for every
  non-interactive bash.
- Could not create `/etc/fstab` (Program Files ACL blocks writes even though `test -w /etc` lies).
- **Judge `gh` success by the printed issue URL, not the exit code.**

---

## Workflow contract (per issue)

Each issue is handled as its own SDD change and follows this lifecycle:

1. **SDD plan** → proposal → (spec/design as right-sized) → tasks.
2. **Implement** on a dedicated branch (`fix/<issue>-<slug>` or `refactor/`), STRICT TDD.
3. **Verify** → fresh-context adversarial review + `pnpm test` green + `tsc --noEmit && biome check`
   clean. No assertion edits made solely to fit a refactor.
4. **PR** → one PR per issue, linking the issue (`Closes #NNN`). Branch off the latest `main`.
5. **CI green** → merge (`gh pr merge --merge --delete-branch`). Merging closes the issue.
6. **Archive** the SDD change → save an engram archive-report; openspec files remain on `main`.
7. **Update this ledger** → mark the issue `done`, record PR link, advance to the next issue.

### Hard constraints (apply to every issue)

- Hexagonal boundary: `src/core` must NOT import from `src/adapters`. Enforced by
  `test/architecture/core-boundary.test.ts` — it must stay green.
- Tests assert **behavior at the ports**. Mock only I/O adapters. Never assert internal call order
  or private collaborators.
- Biome strict: no `any`, no non-null assertions.
- Conventional commits. **No** AI co-author / attribution lines.
- Never touch the production runtime (`%LOCALAPPDATA%\dysflow`). Build to `test-runtime/` for E2E.
- A GitHub release **title must equal its tag name exactly** (e.g. tag `v1.2.16` → title `v1.2.16`).

---

## Status board

| Order | Issue | Title | Severity | Status | Branch | PR | SDD change |
|-------|-------|-------|----------|--------|--------|----|------------|
| 1 | [#414](https://github.com/DysTelefonica/dysflow/issues/414) | fix(core): cross-process Access lock can be declared stale while still held | high | `done` ✅ | (merged) | [#421](https://github.com/DysTelefonica/dysflow/pull/421) | `414-access-lock-stale-heartbeat` |
| 2 | [#415](https://github.com/DysTelefonica/dysflow/issues/415) | refactor(core): harden Access lock release ordering and hashing | medium | `done` ✅ | (merged) | [#422](https://github.com/DysTelefonica/dysflow/pull/422) | `415-lock-release-ordering-hash` |
| 3 | [#416](https://github.com/DysTelefonica/dysflow/issues/416) | fix(http): use constant-time comparison for bearer token | medium | `done` ✅ | (merged) | [#423](https://github.com/DysTelefonica/dysflow/pull/423) | `416-timing-safe-bearer-token` |
| 4 | [#417](https://github.com/DysTelefonica/dysflow/issues/417) | fix(core): sanitize PID/progress marker payloads before they reach the registry | medium | `done` ✅ | (merged) | [#424](https://github.com/DysTelefonica/dysflow/pull/424) | `417-sanitize-marker-payloads` |
| 5 | [#418](https://github.com/DysTelefonica/dysflow/issues/418) | refactor(core): consolidate the triple timeout machinery in the vba-sync path | medium | `done` ✅ | (merged) | [#425](https://github.com/DysTelefonica/dysflow/pull/425) | `418-consolidate-vba-timeout` |
| 6 | [#419](https://github.com/DysTelefonica/dysflow/issues/419) | fix(core): runner output parsing robustness | low | `done` ✅ | (merged) | — | `419-runner-output-parsing` |
| 7 | [#420](https://github.com/DysTelefonica/dysflow/issues/420) | refactor: MCP/HTTP request-shaping and read-only SQL consolidation | low | `todo` | — | — | `420-mcp-http-request-shaping` |
| H | [#426](https://github.com/DysTelefonica/dysflow/issues/426) | test(core): de-flake lock-heartbeat test (fake timers vs real utimes) | medium | `done` ✅ | (merged) | [#427](https://github.com/DysTelefonica/dysflow/pull/427) | `426-deflake-lock-heartbeat` |

> Issue H (#426) is a campaign follow-up surfaced by the #418 fresh verify: the #414 heartbeat test is genuinely flaky (~1/3) and **must be fixed before the release** to keep CI deterministic.

Status legend: `todo` → `planning` → `in-progress` → `verifying` → `pr-open` → `done`.

---

## Per-issue working notes

### #414 — fix(core): cross-process Access lock stale-heartbeat (TODO)

**Evidence**
- `src/core/runner/access-runner.ts:357` — `acquireCrossProcessAccessLock`: evicts lock dir after `CROSS_PROCESS_LOCK_STALE_MS` (30 s) mtime age; owner never heartbeats.
- `src/core/runner/access-runner.ts:118` — `accessExecutionLocks`: module-level mutable `Map` (not injectable).

**Fix direction**: heartbeat the lock dir mtime during long ops (e.g. `setInterval(touch, STALE_MS/2)`), OR derive staleness from owner-PID liveness. Also make `accessExecutionLocks` injectable. Full SDD recommended.

---

### #415 — refactor(core): Access lock release ordering and hashing (TODO)

**Evidence**
- `src/core/runner/access-runner.ts:393–399` — `finally` calls `releaseCurrent()` before `await releaseCrossProcessAccessLock(lockPath)`.
- `src/core/runner/access-runner.ts:343` — `getCrossProcessLockPath` uses `createHash("md5")`.

**Fix direction**: swap the release order; replace `md5` with `sha256` (truncated to 16 hex chars). Lightweight SDD.

---

### #416 — fix(http): constant-time bearer token comparison (TODO)

**Evidence**
- `src/adapters/http/server.ts:157` — `if (token !== context.httpToken)`: timing oracle.

**Fix direction**: `crypto.timingSafeEqual` over equal-length `Buffer` instances; handle length mismatch without early-return. Lightweight SDD.

---

### #417 — fix(core): sanitize marker payloads before registry storage (TODO)

**Evidence**
- `src/core/runner/access-runner.ts:499–530` — marker JSON parsed from raw stderr before `sanitizeSecrets` runs; `commandLine` stored un-redacted.

**Fix direction**: run `sanitizeSecrets` on marker payload fields (especially `commandLine`) before storing. Document the TS↔PS marker contract inline. Lightweight SDD.

---

### #418 — refactor(core): consolidate vba-sync triple timeout (TODO)

**Evidence**
- `src/adapters/vba-sync/vba-sync-adapter.ts:445–467` — `executeWithTimeout`: own `Promise.race`.
- `src/core/runner/powershell-executor.ts:115` — independent kill timer.
- `src/adapters/vba-sync/vba-sync-adapter.ts:203–211` — `psTimeoutMs` recomputed in `executeMappedTool`.

**Fix direction**: propagate a single authoritative timeout; remove or delegate the redundant layers. Full SDD recommended (touches core boundary carefully).

---

### #419 — fix(core): runner output parsing robustness (TODO)

**Evidence**
- `src/adapters/.../windows-processes.ts:141–152` — `JSON.parse(stdout) as Array<…>` contradicts runtime `Array.isArray` guard for single-result PS output.
- `src/core/runner/access-runner.ts:472` — `parseRunnerData` returns `{}` for empty stdout; accepted as success by `ensureResultShape(isRecord)` at `src/core/services/query-service.ts:51`.

**Fix direction**: type parse result as `unknown`, normalize to array; distinguish empty stdout from valid empty-object payload. Lightweight SDD.

---

### #420 — refactor: MCP/HTTP request-shaping and read-only SQL consolidation (TODO)

**Evidence**
- `src/adapters/http/server.ts:194,195,219,256,358,359` — `body.data.x as string` unsafe casts.
- `src/adapters/mcp/tools.ts:651–730` — `toQueryRequest`/`toWriteFixtureRequest`/`toMaintenanceRequest` duplicate alias-fallback logic (~80 lines).
- `src/adapters/mcp/tools.ts:102–109` + `src/adapters/http/server.ts:310–332` — two divergent read-only SQL heuristics.
- `src/adapters/http/server.ts:330–331` — `looksLikeReadOnlySql` rejects valid `WITH … SELECT` CTEs.
- `src/adapters/vba-sync/vba-sync-adapter.ts:409` — `validateStrictContext`, `resolveExecutionTarget`, `executeWithTimeout`, `executeMappedTool`, `runPreflightCleanup` are `public` only for tests.

**Fix direction**: typed extraction helpers for HTTP body fields; declarative field-mapping table; canonical read-only SQL heuristic in core (CTE-aware); reduce method visibility + rewrite tests at port. Lightweight SDD.

---

## Execution settings (decided 2026-06-04)

- **Execution mode**: `auto` — phases run back-to-back without pausing.
- **Artifact store**: `hybrid` — versioned files in `openspec/changes/<change-name>/` **and** engram observations.
- **Delivery**: one PR per issue (issues are independent). Branch off latest `main`.
- **SDD weight (right-sized)**:
  - `#414` (Issue A), `#418` (Issue E) → **full SDD** (real design decisions, cross-cutting concerns).
  - `#415`, `#416`, `#417`, `#419`, `#420` (Issues B, C, D, F, G) → **lightweight** (proposal + tasks → apply → verify).
- **Final goal**: ship a new release with all 7 implemented. The release title must equal the tag name exactly.

## Artifact store

SDD artifacts (proposal/spec/design/tasks/progress/verify/archive-report) for each change are persisted in:

- **Backend**: `hybrid` — versioned files in `openspec/changes/<change-name>/` **and** engram observations.
- **How to recover**:
  - engram → `mem_search(query: "sdd/<change-name>/<phase>", project: "dysflow")` then `mem_get_observation(id)`.
  - openspec → read `openspec/changes/<change-name>/`.

This ledger is the human-readable index; the artifact store holds the detailed phase content.
