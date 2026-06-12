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

`Last updated`: 2026-06-12 — Campaign updated: **Concurrency & Telemetry Hardening** post-v1.2.43. Released **v1.2.44** (closes concurrent lock eviction race and chunk-boundary parser bugs). Refactored queryMode and documented VBA write-gate design decision in **v1.2.43**. See "Active campaign (2026-06-12)" below.

> CI fact (verified): `runs a real diagnostics check` (access-runner.test.ts:860) NEVER runs in CI — Quality gates is ubuntu (test early-returns on non-win32); Windows smoke runs only the integration config, not `pnpm test`. Its local Windows failure is a dev-box live-Access issue, NOT a CI/release blocker.

> **Process notes for remaining issues** (learned the hard way on #417):
> - Sub-agents do NOT run biome → CI `Quality gates` fails on format. Run `biome check --write` on ALL changed `.ts` files before pushing. Windows working tree is CRLF, so local `biome check` shows ~11 pre-existing false-positives; verify the real subset with `biome check <changed-files>`.
> - The live diagnostics test in `test/core/runner/access-runner.test.ts` spawns REAL Access on Windows (only early-returns on non-win32). A failure there is a genuine signal, NOT environmental noise — investigate before dismissing.

---

## Active campaign (2026-06-12) — Concurrency & Telemetry Hardening

> Source: deep code review and concurrency audit. Discovered a TOCTOU race in cross-process lock eviction on Windows (directory `rename` is not exclusive on Windows APIs) and a stream chunk fragmentation issue in real-time `onStderr` parsing (marker lines split across chunks).
>
> Deliverables:
> - eviction claim via `mkdir` (exclusive EEXIST on Windows)
> - stderr stream line buffering
> - queryMode single source of truth (#523) and VBA write-gate documentation (#522) from the previous pass

### Status board

| Order | Issue | Title | Severity | Status | Notes |
|-------|-------|-------|----------|--------|-------|
| 1 | [#522](https://github.com/DysTelefonica/dysflow/issues/522) | docs(security): document MCP vs HTTP VBA write-gate asymmetry | low | `done` ✅ | documented in `docs/security/adapter-write-gates.md` |
| 2 | [#523](https://github.com/DysTelefonica/dysflow/issues/523) | refactor(mcp): collapse queryMode to a single source of truth | medium | `done` ✅ | collapsed queryMode to `MCP_TOOL_ROUTES` |
| 3 | [Lock Race] | fix(core): evict stale lock atomically on Windows via mkdir claim | high | `done` ✅ | Eviction claims via `mkdir` to prevent double-eviction races |
| 4 | [Stream Chunk] | fix(runner): buffer stderr chunks to prevent partial marker JSON parse failures | medium | `done` ✅ | Line buffering in `default-executor.ts` |

### Progress log

- **2026-06-12**: Released **v1.2.44** containing the atomic lock eviction and stderr buffering fixes. All 1242 tests passing locally, linter clean, release published on GitHub.
- **2026-06-12**: Released **v1.2.43** containing the queryMode refactoring and VBA write-gate documentation changes.

---

## Active campaign (2026-06-09) — Clean-release tidy-up

> Source: post-v1.2.33 fresh code audit. Every remaining non-trivial item from the audit was
> verified against live code. Most of the v1.2.18 audit (4 criticals + much debt) is already
> CLOSED. What remains splits into 3 trivial chores (this campaign) and 2 deferred items.
>
> **Owner directive (2026-06-09)**: "dejar todo lo demás perfecto, lo que no es muy difícil...
> al final una release limpia solo a falta de reestructurar los mega scripts." One task per issue,
> all issues filed first, then closed one by one, ending in a clean release tag.

### Execution settings (decided 2026-06-09)

- **Execution mode**: `auto` — close the 3 chores back-to-back.
- **Delivery**: direct commits to `main` (standing directive across prior campaigns; only `main`
  exists). One commit per issue with `Closes #NNN`. Full local gate green before each push.
- **Strict TDD**: ON for #492 (test-only); #490/#491 are config/docs (no production logic).
- **Local testing**: build to `test-runtime/` only. NEVER touch `%LOCALAPPDATA%\dysflow`.
- **Release gate**: all 3 chores closed AND `pnpm test` + `tsc --noEmit` (both configs) + biome
  clean before the tag. Tag title MUST equal the tag name exactly.

### Status board

| Order | Issue | Title | Severity | Status | Notes |
|-------|-------|-------|----------|--------|-------|
| 1 | [#490](https://github.com/DysTelefonica/dysflow/issues/490) | chore(repo): ignore + remove local junk (`test-output-msg/`) | low | `done` ✅ | commit `aed4359` (`.gitignore` only) |
| 2 | [#492](https://github.com/DysTelefonica/dysflow/issues/492) | test(quality-gates): lock toolchain exact-pinning | low | `done` ✅ | commit `7c3c9fc` (`test/quality-gates/toolchain-pinning.test.ts`) |
| 3 | [#491](https://github.com/DysTelefonica/dysflow/issues/491) | chore(docs): resync `TRACKING.md` ledger with remote reality | low | `done` ✅ | this commit — finalizes this board |
| 4 | [#493](https://github.com/DysTelefonica/dysflow/issues/493) | refactor(core): collapse `processTimeoutMs` into single authoritative timeout | medium | `done` ✅ | collapsed processTimeoutMs into timeoutMs |

### Deferred (filed, documented, NOT in this campaign)

| Issue | Title | Why deferred |
|-------|-------|--------------|
| [#494](https://github.com/DysTelefonica/dysflow/issues/494) | refactor(scripts): split the two PowerShell mega-scripts (epic) | The deliberately-excluded epic (3272 + 1922 LOC); high blast radius on the TS↔PS contract |

### Progress log

- **2026-06-10**: #493 DONE. Collapsed `processTimeoutMs` into `timeoutMs` across all core and adapter layers, including `VbaSyncAdapter`, `resolveExecutionTarget`, and `DysflowConfig`, and updated the documentation.
- **2026-06-09**: Campaign opened from the post-v1.2.33 fresh audit. 5 issues filed (#490-#494):
  3 actionable chores + 2 deferred. Order to close: #490 → #492 → #491 (docs sync last so it
  captures the final state).
- **2026-06-09**: #490 DONE (commit `aed4359`). Removed the stray untracked `test-output-msg/`
  scratch dir and added a `.gitignore` rule. Commit staged `.gitignore` only.
- **2026-06-09**: #492 DONE (commit `7c3c9fc`). New CI guard
  `test/quality-gates/toolchain-pinning.test.ts` (3 tests) asserts every dependency/devDependency
  is exact-pinned, `@types/node` the only allowed tilde range. Green; biome + tsc (test config) clean.
- **2026-06-09**: #491 DONE (this commit). Reconciled the lagging ledger with remote reality: the
  2026-06-07 board now marks #481/#482/#483 `done` (all closed COMPLETED 2026-06-07); removed the
  duplicated/self-contradictory "HTTP → core-mapper" Dropped entry; fixed the stale "NEXT: #481"
  log line. **Campaign COMPLETE** — only the deferred mega-scripts epic (#494) and the deferred
  `processTimeoutMs` refactor (#493) remain. Ready for a clean release tag.
- **2026-06-09**: Released **v1.2.34** (title==tag; tarball + SHA256SUMS attached; CI green on ubuntu
  + Windows smoke).
- **2026-06-09**: Follow-up #495 DONE (commit `19fe5fb`, test-only, lands in the next tag). Release
  verification surfaced that `test/quality-gates/runtime-drift.test.ts` compared the dev vs installed
  runner by RAW bytes, false-failing on a Windows dev box (CRLF working tree vs LF CI tarball) even
  when content was byte-identical after normalization. Fixed to compare line-ending-normalized
  CONTENT; added a focused normalization test. Full suite now 1130 passed / 3 skipped / 0 failed on
  the dev box after `dysflow update` to v1.2.34.

---

## Active campaign (2026-06-05, phase 2) — MCP hardening follow-ups

> Lower-priority findings from the fresh MCP review (engram obs #10705), tackled after phase 1.
> Same rules: SDD + strict TDD, direct commits to `main`, one commit per issue. **Scope-checked
> against the live code** — a candidate is DROPPED if it isn't real debt.

### Status board

| Order | Issue | Title | Severity | Status | SDD change |
|-------|-------|-------|----------|--------|------------|
| 1 | [#432](https://github.com/DysTelefonica/dysflow/issues/432) | fix(mcp): input validator ignores numeric bounds (timeoutMs/limit/top) | medium | `done` ✅ (main) | `432-validator-numeric-bounds` |
| 2 | [#433](https://github.com/DysTelefonica/dysflow/issues/433) | refactor(mcp): parity-registry single source of truth (status vs HIDDEN_STUB_TOOL_NAMES) | low | `done` ✅ (main) | `433-parity-registry-sot` |

> The "HTTP → core-mapper convergence" Dropped entry that used to live here was a duplicate of the
> canonical one in the 2026-06-07 campaign below; removed during the #491 ledger resync (2026-06-09)
> to end the contradiction.

### Progress log

- **2026-06-05**: #432 DONE. `JsonSchemaProperty` gained `minimum`/`maximum`; the validator now enforces
  numeric bounds; `timeoutMs`/`limit`/`top` declare `minimum: 1`. RED-first
  (`test/adapters/mcp/validator.test.ts`, 19 behavior tests at the validator port). 925 passed, lint
  clean. Committed direct to main.
- **2026-06-05**: #433 DONE. Removed duplicate `HIDDEN_STUB_TOOL_NAMES` set from `dispatch.ts` and `tools.ts`.
  Derived hidden stub flag from parity registry using `isHiddenStubTool` helper. Added invariant test
  `test/adapters/mcp/stub-hidden-invariant.test.ts` to ensure consistency.
  Committed direct to main. All campaigns complete.

---

## Previous campaign (2026-06-05) — MCP hardening (fresh review) — CLOSED

> Source: fresh adversarial review of the MCP adapter (`src/adapters/mcp/*`), verified **live
> against code after #420 merged**. Full analysis in engram
> (`tech-debt/mcp-fresh-analysis-2026-06`, obs #10705). Issues ordered by severity:
> security → structural root → maintainability. The **Workflow contract**, **Hard constraints**,
> **Environment gotcha** and **Artifact store** sections below apply unchanged to this campaign.

### Execution settings (decided 2026-06-05)

- **Execution mode**: `auto` — phases run back-to-back.
- **Artifact store**: `hybrid` — `openspec/changes/<change>/` files + engram observations.
- **Delivery**: direct commits to `main` (user directive 2026-06-05), one commit per issue with
  `Closes #NNN`. The full local gate (`pnpm test` + `tsc --noEmit` + `biome check` on changed files)
  MUST be green before each push. Only `main` exists — no feature branches.
- **SDD weight**: `#429` lightweight (proposal + tasks) · `#430` **full SDD** (core boundary, real
  design decision) · `#431` lightweight, sequence **after #430**.
- **Strict TDD**: ON. Runner `pnpm test`. RED before GREEN, every issue.
- **Local testing**: build to `test-runtime/` only. **NEVER** touch the production runtime
  `%LOCALAPPDATA%\dysflow`. **Clean up `test-runtime/` when the campaign finishes.**

### Status board

| Order | Issue | Title | Severity | Status | Branch | PR | SDD change |
|-------|-------|-------|----------|--------|--------|----|------------|
| 1 | [#429](https://github.com/DysTelefonica/dysflow/issues/429) | fix(mcp): MCP error path leaks secrets (only paths redacted) | security/med | `done` ✅ | (main) | — | `429-mcp-secret-redaction` |
| 2 | [#430](https://github.com/DysTelefonica/dysflow/issues/430) | refactor(core): extract MCP request-shaping into a core mapper (+ typed action map) | medium | `done` ✅ | (main) | — | `430-mcp-request-shaping-core` |
| 3 | [#431](https://github.com/DysTelefonica/dysflow/issues/431) | refactor(mcp): split tools.ts god-file (811 LOC) | medium | `done` ✅ | (main) | — | `431-split-mcp-tools` |

Status legend: `todo` → `planning` → `in-progress` → `verifying` → `pr-open` → `done`.

### Per-issue summary (authoritative spec = the GitHub issue body)

- **#429 (security, FIRST)** — MCP errors run only `sanitizeMcpErrorMessage` (paths) at
  `tools.ts:773-792,794-810` + `stdio-wrappers.ts:41`; HTTP additionally runs `sanitizeSecrets`
  (`server.ts:319`). A secret in a core error (password resolved at `tools.ts:724-726`) leaks on
  MCP. **Fix**: route MCP errors through secret redaction; assert MCP↔HTTP parity at the port.
- **#430 (structural root)** — `toQueryRequest` / `toWriteFixtureRequest` / `toMaintenanceRequest`
  (`tools.ts:653-728`) map input→`AccessQueryRequest` in the adapter (hexagonal violation +
  MCP/HTTP/CLI drift); `name as action` casts (`:656,674,699`) unvalidated. **Fix**: move mapper
  to `src/core` (pure); replace casts with exhaustive `Record<DysflowMcpToolName, action>`.
- **#431 (maintainability, AFTER #430)** — `tools.ts` is an 811-line god-file (5 responsibilities);
  `sanitizeMcpErrorMessage` misplaced. **Fix**: split into cohesive modules; move sanitizer to
  `src/core/utils`. Behavior-preserving.

### Progress log

- **2026-06-05**: Campaign opened from a fresh MCP review. 3 issues filed (#429–#431), ordered by
  severity.
- **2026-06-05**: #429 (security) DONE. Secret redaction folded into the single MCP error sink
  `sanitizeMcpErrorMessage`: `sanitizeConnectStrings` (heuristic `;PWD=...`) applied at EVERY error
  boundary incl. the transport net, plus exact-value `sanitizeSecrets` at the `query-maintenance`
  sink for HTTP parity (new `resolveInScopeSecrets` helper passes the resolved `backendPassword`).
  RED test `test/adapters/mcp/sanitize-error-secrets.test.ts` (behavior at the port). 887 passed,
  tsc + biome clean. Committed direct to main. **NEXT: #430** — extract the input→`AccessQueryRequest`
  mapper to `src/core` (pure) + replace `name as action` casts with an exhaustive typed map.
- **2026-06-05**: #430 (structural root) DONE. Pure request-shaping mapper extracted to
  `src/core/mapping/access-query-request-mapper.ts` (imports only `core/contracts` + `core/utils`;
  secret lookup via injected `EnvAccessor` so core never touches `process.env`). The 3 unvalidated
  `name as AccessQueryRequest["action"]` casts replaced by `MCP_TOOL_QUERY_ACTIONS:
  Record<QueryToolName, AccessQueryAction>` (missing/extra key = compile error) + a runtime
  coverage test cross-checking `MCP_TOOL_ROUTES`. `getStr`/`resolveIsDryRun` moved to core with
  behavior tests. Behavior-preserving; `query.requests` port assertions stayed green. core-boundary
  GREEN, full `pnpm lint` clean (incl. tsconfig.test.json), 906 passed. NOTE: observed 1 intermittent
  flake of the known live-Access diagnostics test on the dev box (not in CI, unrelated to #430);
  green on re-run. HTTP still shapes inline — mapper designed HTTP-reusable, convergence is a clean
  future issue. Committed direct to main. **NEXT: #431** — split `tools.ts` god-file; move
  `sanitizeMcpErrorMessage` to `src/core/utils`.
- **2026-06-05**: #431 (maintainability) DONE — campaign COMPLETE. `tools.ts` god-file decomposed:
  thin facade (modern tool defs + `createDysflowMcpTools` + backward-compat re-exports) plus new
  `src/adapters/mcp/dispatch.ts` (routes, dispatch loop, alias builders, registration, read-mode SQL
  guard) and `src/adapters/mcp/result-translation.ts` (shared MCP types + `translateCoreResultToMcpContent`
  + `resolveInScopeSecrets`). `sanitizeMcpErrorMessage` relocated to `src/core/utils/sanitize-error.ts`
  (pure, no adapter imports; secrets→connect-strings→path order preserved byte-for-byte). Public
  exports preserved via re-export → zero test changes. core-boundary GREEN, 906 passed, `pnpm lint`
  clean. Behavior-preserving. Committed direct to main.
- **Remaining (future campaign, out of scope here)**: decorative `tool-parity-registry` status vs
  `HIDDEN_STUB_TOOL_NAMES` double source of truth; `validator.ts` lacks numeric `minimum`/`maximum`;
  HTTP still shapes its request inline (the #430 core mapper is HTTP-reusable). See engram obs #10705.

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

## Previous campaign (2026-06-04) — CLOSED

All 7 issues (#414–#420) + follow-up #426 shipped. #419 and #420 landed directly on `main`.

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
| 7 | [#420](https://github.com/DysTelefonica/dysflow/issues/420) | refactor: MCP/HTTP request-shaping and read-only SQL consolidation | low | `done` ✅ | (merged) | — | `420-mcp-http-request-shaping` |
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

---

## Active campaign (2026-06-07) — Tech-debt cleanup (v1.2.23 post-release review)

> Source: third-party code review of `dysflow@1.2.23` flagged 16 items (weaknesses / opportunities / debt).
> Every claim was verified adversarially against the live code by an `explore` sub-agent (engram obs
> for this campaign). Of 16 claims: 9 CONFIRMED, 3 REJECTED (stale pre-#430, blanket "43 silent catches"
> oversimplification, pre-commit hooks as release-blocker), 4 MODIFIED. 8 issues filed (#476-#483),
> ordered by severity.
>
> Same workflow contract, hard constraints, and environment gotcha as previous campaigns.
> **Release gate** (user directive 2026-06-07): all 8 closed AND the full E2E suite green before the
> next release tag.

### Execution settings (decided 2026-06-07)

- **Execution mode**: `auto` — phases run back-to-back without pausing. User explicitly said:
  "tienes que acabar todo el trabajo tú solo, sin mi intervención".
- **Artifact store**: `hybrid` — versioned files in `openspec/changes/<change-name>/` **and** engram.
- **Delivery**: direct commits to `main` (same as campaign 2026-06-05). One commit per issue with
  `Closes #NNN`. **No feature branches** — user directive: "que no quede ninguna rama nada más que main".
  Each sub-agent leaves the working tree dirty; orchestrator runs the local gate and commits/pushes.
- **SDD weight (right-sized)**: every issue gets a lightweight plan (proposal + tasks) in engram /
  openspec. Full SDD reserved for issues with real cross-cutting design decisions.
- **Strict TDD**: ON. Runner `pnpm test`. RED before GREEN, every issue.
- **Local testing**: build to `test-runtime/` only. **NEVER** touch the production runtime
  `%LOCALAPPDATA%\dysflow`. **Clean up `test-runtime/` when the campaign finishes.**

### Status board

| Order | Issue | Title | Severity | Status | SDD change |
|-------|-------|-------|----------|--------|------------|
| 1 | [#476](https://github.com/DysTelefonica/dysflow/issues/476) | fix(security): update trust boundary (gh fallback + --skip-checksum guard) | high | `done` ✅ | `476-update-trust-boundary` |
| 2 | [#477](https://github.com/DysTelefonica/dysflow/issues/477) | refactor(core): extract Access runner cross-process lock module | medium | `done` ✅ | `477-lock-extract` |
| 3 | [#478](https://github.com/DysTelefonica/dysflow/issues/478) | fix(core): surface swallowed state/config I/O errors in diagnostics | medium | `done` ✅ | `478-swallowed-io` |
| 4 | [#479](https://github.com/DysTelefonica/dysflow/issues/479) | refactor(vba-sync): document or extract cryptic executeMappedTool timeout formula | low | `done` ✅ | `479-timeout-formula` |
| 5 | [#480](https://github.com/DysTelefonica/dysflow/issues/480) | chore(docs): replace stale security doc line refs with symbol anchors | low | `done` ✅ | `480-docs-anchors` |
| 6 | [#481](https://github.com/DysTelefonica/dysflow/issues/481) | chore(docs): keep TRACKING.md in sync with live code (HTTP→mapper claim is stale) | low | `done` ✅ (closed COMPLETED 2026-06-07) | `481-tracking-sync` |
| 7 | [#482](https://github.com/DysTelefonica/dysflow/issues/482) | chore(deps): pin fresh-major toolchain (TS ^6, Vite ^6, Vitest ^4) or document policy | low/med | `done` ✅ (closed COMPLETED 2026-06-07; see `docs/dev/toolchain-pinning.md`) | `482-toolchain-pin` |
| 8 | [#483](https://github.com/DysTelefonica/dysflow/issues/483) | chore(repo): ignore and clean local root junk (NVIDIA Corporation/) | low | `done` ✅ (closed COMPLETED 2026-06-07; `.gitignore` has `/NVIDIA Corporation/`) | `483-nvidia-junk` |

> Board reconciled with remote on 2026-06-09 (#491): all three were already CLOSED as COMPLETED on
> GitHub on 2026-06-07; the ledger had lagged and still showed them `todo`.

Status legend: `todo` → `planning` → `in-progress` → `verifying` → `pr-open` → `done`.

### Dropped (verified, NOT real debt)

- **HTTP → core-mapper convergence** (claim 8 of the report): `#420` already converged HTTP query
  read/write onto `buildQueryReadRequest` / `buildWriteFixtureRequest` from
  `src/core/mapping/access-query-request-mapper.ts`. The report's claim was based on pre-#420 code.
  Evidence: `src/adapters/http/server.ts:12-15,232-234,265-267`. #481 (closed COMPLETED 2026-06-07)
  did the doc cleanup only; it did not reopen this code work.
- **"43 silent catch blocks" as a blanket issue**: the count (28 bare + 43 with binding + 25
  promise) is correct but the framing is wrong. Most are legitimate best-effort cleanup. The 7
  sites that hide real I/O errors are filed as **#478 (focussed)**.
- **Pre-commit hooks** (claim 9): CI already gates `pnpm lint` (Biome + tsc). Hooks are
  developer-experience, not release safety. The Biome format gate on the dev box is enforced by
  the `lint` script that `pnpm lint` runs.
- **Windows-only tests as a release blocker** (claim 13): 16 Access/DAO tests run only on Windows
  CI. Already documented (line 25 of this ledger, and `vitest.integration.config.ts` gates the
  Windows runner). The release gate is the full E2E suite, not the Linux `pnpm test` count.

### Progress log

- **2026-06-07**: Campaign opened from the v1.2.23 post-release review. 8 issues filed (#476-#483),
  ordered by severity. #476 (security) in flight. Verification engram obs for this campaign
  records the 9 CONFIRMED / 3 REJECTED / 4 MODIFIED breakdown.
- **2026-06-07**: #480 (docs anchors) DONE. The Callers table in
  `update-trust-model.md` referenced internal source by exact line numbers
  (`access-runner.ts:596-608`, `vba-sync-adapter.ts:524-531`); both were already
  stale (pointed at spawn wrappers, not arg construction). Replaced with
  symbol anchors: `buildPowerShellArguments` in access-runner.ts,
  `spawnVbaManager` in vba-sync-adapter.ts. New regression test
  `test/docs/security-doc-anchors.test.ts` asserts no `file:line` refs to
  internal TypeScript source positions remain in `docs/security/`. 1018
  passed, 3 skipped.
- **2026-06-07**: #481, #482, #483 closed COMPLETED (ledger updated retroactively on 2026-06-09
  during the #491 resync — see the 2026-06-09 campaign at the top of this file).
- **2026-06-07**: #479 (timeout formula) DONE. Extracted
  `derivePsTimeoutMs(effectiveTimeoutMs, preflightElapsedMs)` to module scope
  in `src/adapters/vba-sync/vba-sync-adapter.ts`. The `5_000` literal is now
  named `MIN_PS_TIMEOUT_MS` at module scope. The inline `Math.max/Math.min`
  expression in `executeMappedTool` is replaced by a single call; the
  `explicitTimeoutMs !== undefined` branch shape is preserved exactly. 5 new
  tests in `test/adapters/vba-sync/ps-timeout-formula.test.ts` cover the
  floor/over-budget/no-preflight/constant-pin scenarios. 1016 passed, 3
  skipped. **NEXT: #480** — replace stale security doc line refs.
- **2026-06-07**: #478 (swallowed I/O diagnostics) DONE. New helper
  `src/core/utils/log-swallowed-io-error.ts` exposes a single
  `logSwallowedIoError(site, err)` debug-level logger. All 7 known sites now
  log on real I/O / parse failures while preserving the empty-default return on
  the happy `ENOENT` path: `access-operation-registry.ts:280,293`,
  `vba-sync-adapter.ts:483,491`, `vba-form-service.ts:138-140,183-186`,
  `vba-source-comparison.ts:261`, `mcp-configurator.ts:14,63`,
  `windows-processes.ts:53-56`. 4 new tests cover the registry (corrupt file
  → log + empty) and the windows-processes JSON parse path (covers both V8
  error wordings, "Unexpected token" and "Expected property name"). 1011 passed,
  3 skipped; tsc + biome clean. **NEXT: #479** — extract/document the
  `executeMappedTool` timeout formula.
- **2026-06-07**: #477 (lock extraction) DONE. New module `src/core/runner/cross-process-lock.ts`
  owns the cross-process and in-process lock primitives (~155 LOC, no adapter imports). The
  in-process serialized queue map is now injectable as a 4th argument to
  `runWithAccessExecutionLock` for test isolation; default keeps the original module-level
  singleton behavior. `access-runner.ts` no longer declares the lock Map at module scope. The
  runner's `work` callback type was widened to `() => T | Promise<T>` (was `() => Promise<T>`)
  to accept sync results. 12 new tests in `test/core/runner/cross-process-lock.test.ts`
  cover path determinism, the in-process serialization contract (same key / different keys),
  timeout error, lockState cleanup, error-path release, and heartbeat API. One pre-existing
  detail: the test design initially used `Date.now()` in dbPath for cross-call contention
  but that is flaky on Windows (~1ms resolution); deterministic fixed paths are used instead.
  1007 passed, 3 skipped; tsc + biome clean. Behavior-preserving — existing
  access-runner.test.ts lock tests stayed green without modification. **NEXT: #478** — surface
  swallowed state/config I/O errors.
- **2026-06-07**: #476 (security, FIRST) DONE. `resolveLatestReleaseWithGh` removed from
  `src/cli/commands/install/downloader.ts`; HTTP errors are now surfaced verbatim with a hint about
  `GH_TOKEN` / `GITHUB_TOKEN`. `DYSFLOW_ALLOW_INSECURE_UPDATE=1` guard added to
  `--skip-checksum` in `updater.ts`; flag is refused without the env var, with a clear
  `WARN` printed on the actual skip path. 6 new focused tests cover the gh-fallback removal
  (403/429/503) and the env-guard (`'1'`, `'true'`, unset → refused). `update-trust-model.md`
  gained an explicit "No gh CLI fallback" row. `pnpm test` green (995 passed, 3 skipped);
  `tsc -p tsconfig.json --noEmit` and `tsc -p tsconfig.test.json --noEmit` clean; biome check on
  changed files clean. **NEXT: #477** — extract cross-process lock module.

