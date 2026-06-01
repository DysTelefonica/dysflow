# Issue #380 — Industrial-quality test safety net (P6 + P7) — WORK & PROGRESS

> **Living handoff doc.** If you are an AI picking this up: READ THIS WHOLE FILE FIRST, then check the
> Progress Log at the bottom for the latest state. Update the Progress Log and the task checkboxes as
> you work. Do not delete history — append.

- **Issue:** https://github.com/DysTelefonica/dysflow/issues/380
- **Status:** P6 COMPLETE & MERGED (PR #383). P7 = run E2E on this Windows box. **PENDING: a fresh-state (post-reboot) E2E run to get a trustworthy zombie number — see the ⚠️ CRITICAL section.** Also pending: correct the v1.2.10 CHANGELOG E2E claim (it was made on STALE scripts).
- **Last updated:** 2026-06-01
- **Working branch:** `test/380-p6-p7` (create from `main` if it doesn't exist)
- **Prereq shipped:** v1.2.9 (the WMI-hang/zombie fix) and v1.2.10 (P1/P3/P4/P5 behavioral tests) are already released. This doc covers only the remaining **P6** and **P7**.

---

## Background (why this exists)

An audit found the Access WMI-hang/zombie test layer was a *partial* safety net: the TypeScript domain
is industrial quality, but the PowerShell layer (where the fix lives) was only string-asserted.
P1/P3/P4/P5 (shipped in v1.2.10) added behavioral coverage. **P6** and **P7** remain:

- **P6** — Remove / fix the *false-confidence* redundant tests (brittle PS-script-name string assertions).
- **P7** — Wire the real `mcp-e2e.mjs` zombie check into CI (the only end-to-end zombie regression guard).

Full audit memory in engram: search `Test-quality audit Access-lifecycle` (project dysflow).

---

## Environment & conventions (MUST follow)

- **OS/shell:** Windows. The Bash tool is POSIX bash (cygwin), NOT PowerShell. A trailing
  `/c/Users/.../claude-XXXX-cwd: No such file or directory` line is **harmless harness noise** — judge by the
  real command output, not the exit code.
- **No AI attribution** in commits. **Conventional commits.** Reference `#380`.
- **main is protected** → land changes via PR (branch → PR → wait CI green → merge). Do NOT push to main.
- **Fresh adversarial review** of the diff before opening the PR (delegate to a fresh-context reviewer).
- **Release title == tag** (AGENTS.md). P6/P7 are test/CI only → likely fold into a future `vX` "no runtime change" release; do not cut a release unless asked.
- **ACCESS_VBA_PASSWORD** is available as an env var locally (len 6) — do not ask the user for it.

### Commands
- Unit (TS): `pnpm test`  (excludes `test/scripts-*.test.ts`)
- Pester (PS behavioral): `pnpm test:ps1`  (runs `pwsh -Command "Invoke-Pester scripts/tests/"`)
- PS content/integration tests: `pnpm exec vitest run --config vitest.integration.config.ts test/scripts-access-runner.test.ts test/scripts-vba-manager.test.ts`
- Lint: `pnpm lint`  (tsc + biome; biome forbids non-null `!` → use `?.`)  · auto-fix: `pnpm lint:fix`
- Build: `pnpm build`
- Real MCP E2E (local): from `E2E_testing/`, set `DYSFLOW_E2E_COMMAND='node C:\Proyectos\dysflow\dist\cli\index.js'`
  and `DYSFLOW_HOME='C:\Proyectos\dysflow\test-runtime'` (throwaway home — never touch the prod runtime), then `node mcp-e2e.mjs`.
  Needs fixtures `E2E_testing/NoConformidades.accdb` + `NoConformidades_Datos.accdb` (gitignored, present locally) + `ACCESS_VBA_PASSWORD`.

### Gotcha: CI test wiring is duplicated
- `.github/workflows/ci.yml` "Windows PowerShell/Access smoke" job runs an **explicit file list** for integration tests.
- `test/quality-gates/ci-workflow.test.ts` asserts that exact command string. **If you change the ci.yml integration command, update that meta-test too**, or Quality gates fails.

---

## P6 — Remove/fix false-confidence redundant tests

**Target:** the `readFileSync`-based PS-script-name string assertions in `test/core/runner/access-runner.test.ts`
(e.g. asserting the script text contains `Resolve-WriteActionDatabase`, `Invoke-ListTablesAction`,
`Invoke-GetSchemaAction`, `Invoke-GetRelationshipsAction`, `Invoke-QuerySqlReadAction`, `$writeDb.Database.Execute(...)`).
They break on behavior-preserving renames and assert text, not behavior.

> **CRITICAL NUANCE — do NOT blindly delete.** The audit was internally ambiguous about whether Pester
> actually covers the higher-level SQL **dispatch/routing** logic or only `Open-DatabaseWithPassword`.
> **Verify first.** For each content assertion, determine whether an executing test (Pester or TS port-level)
> already guards the same behavior.
>   - If genuinely redundant → delete.
>   - If it is the *only* guard for real routing behavior → replace it with a behavioral test (Pester that
>     executes the router), do NOT just delete.
>   - If it guards a structural invariant with no behavioral equivalent and low rename-risk → keep but move into a
>     clearly-labelled `describe("script structure — change-detector only", ...)` block with a comment explaining why.

### P6 tasks
- [ ] List every `readFileSync`/script-text assertion in `test/core/runner/access-runner.test.ts` (and note any similar in `test/scripts-*.test.ts` that are pure name-presence, distinct from the no-bare-CIM / ms-format guards which MUST stay).
- [ ] For each, check Pester (`scripts/tests/dysflow-access-runner.Tests.ps1`) and TS port tests for an executing equivalent.
- [ ] Classify each: DELETE / REPLACE-WITH-BEHAVIORAL / KEEP-AS-CHANGE-DETECTOR (relabel).
- [ ] Apply the classification (TDD where adding/replacing behavioral tests).
- [ ] Keep the no-bare-`Get-CimInstance` and ms-format content guards — they are the sole automated guard for those properties.
- [ ] Run `pnpm test`, `pnpm test:ps1`, integration tests, `pnpm lint` — all green.
- [ ] Fresh adversarial review → fix nits → PR referencing #380.

---

## P7 — Real `mcp-e2e.mjs` zombie check in CI

> **BLOCKER (infra):** GitHub-hosted `windows-latest` runners do **NOT** have Microsoft Access installed.
> `mcp-e2e.mjs` and `access-fixture.e2e.test.ts` need real Access COM, so they **cannot** run on GitHub-hosted
> runners — this is exactly why `access-fixture.e2e.test.ts` currently skips in CI. P7 therefore requires a
> **self-hosted Windows runner with MS Access + the ACE/COM stack installed**. Without that, P7 cannot truly run in CI.
>
> **Decision needed from the user before implementing P7:** does a self-hosted Windows+Access runner exist (or can one
> be provisioned)? If not, P7 is not feasible as "run in CI"; the realistic fallback is to keep `mcp-e2e.mjs` as a
> documented pre-release manual gate (it already validated v1.2.9 at 104/0).

### P7 tasks (only if a self-hosted Access runner is available)
- [ ] Confirm self-hosted runner availability + labels with the user.
- [ ] Create sanitized, committable fixtures (current `.accdb` are gitignored; `access-fixture.e2e.test.ts` expects
      sanitized fixtures with a hardcoded backend password, not the password-protected production copies).
- [ ] Add `ACCESS_VBA_PASSWORD` as a CI **secret**.
- [ ] Add a `release-gate` / `e2e-access` job (runs-on: the self-hosted label) that builds to a throwaway runtime,
      sets `DYSFLOW_E2E_COMMAND` + `DYSFLOW_HOME`, and runs `node E2E_testing/mcp-e2e.mjs`; fail the job on any FAIL or zombie.
- [ ] Make it gate cleanly (skip with a clear message) when Access COM is absent, so non-self-hosted forks aren't broken.
- [ ] Update `test/quality-gates/ci-workflow.test.ts` if the workflow command surface changes.
- [ ] Fresh review → PR referencing #380.

---

## P6 — investigation findings & decision (2026-06-01)

**Verified:** Pester (`scripts/tests/dysflow-access-runner.Tests.ps1`) covers only `Open-DatabaseWithPassword`,
`Resolve-SandboxedPath`, `Format-SqlLiteral`, `Split-SqlStatements`, `Invoke-SeedFixtureDryRun` — it does **NOT**
execute the SQL **dispatch/routing** functions. So the brittle text assertions in `access-runner.test.ts` are today the
**only** guard for routing → deleting them outright would open a gap. (Also noted: the Pester top-of-file *re-defines copies*
of pure helpers — a separate weak pattern; the P1/P3 tests use AST extraction of the real bodies, which is better.)

**Good news — routing functions are easily stubable** (read from `scripts/dysflow-access-runner.ps1`):
- `Resolve-WriteActionDatabase($DbEngine,$CurrentDb,$Payload)` (L176): pure branching on `$Payload` (dryRun, databasePath→sourcePath→backendPath). dryRun/no-path → `{Database=CurrentDb; Owned=$false}`; else calls `Open-DatabaseWithBackendPassword` → `{Owned=$true; TargetPath=...}`.
- `Resolve-ReadActionDatabase` (L194): same shape, ReadOnly.
- `Invoke-QuerySqlReadAction($Database,$Sql)` (L424): `$Database.OpenRecordset($Sql)` → `Convert-RecordsetRows`.
- `Invoke-ListTablesAction`/`Invoke-GetSchemaAction`/`Invoke-GetRelationshipsAction` (L435+): thin delegations to `Get-TableNames`/`Get-TableSchema`/`Get-Relationships`.

**Decision (industrial-quality path): REPLACE-WITH-BEHAVIORAL.** AST-extract the routing functions, mock their deps
(`Open-DatabaseWithBackendPassword`, `Get-TableNames`, etc.), assert the routing *behavior*; THEN delete the redundant
text assertions (`access-runner.test.ts` blocks ~L292, ~L307, ~L330). KEEP: the no-bare-`Get-CimInstance` / ms-format
content guards (sole guard for those) and the process-lifecycle block (~L824: `$script:exitCode`, `$script:accessPid`,
`Stop-Process`) unless a behavioral equivalent is added.

### P6 task status
- [x] Inventory the text assertions + confirm Pester does not cover routing.
- [x] Confirm routing functions are stubable; choose REPLACE-WITH-BEHAVIORAL.
- [x] Add behavioral Pester for `Resolve-WriteActionDatabase` + `Resolve-ReadActionDatabase` (dryRun, path precedence, Owned/ReadOnly), via AST extraction + mocked `Open-DatabaseWithBackendPassword`.
- [x] Add behavioral Pester for `Invoke-QuerySqlReadAction` + `Invoke-ListTablesAction` (stub `$Database`/`Get-TableNames`/`Convert-RecordsetRows`) — prove the wrapper dispatches correctly.
- [x] Delete the now-redundant text assertions in `access-runner.test.ts` (routing blocks only).
- [x] Verify: `pnpm test`, `pnpm test:ps1`, integration tests, `pnpm lint` green (pre-existing CRLF format failures on 4 unmodified files — pre-existing, not introduced here; `access-runner.test.ts` now passes biome).
- [x] Fresh review → APPROVE (no CRITICAL/WARNING; deletions dropped no real guarantee; negative guards retained). → PR (#380).

### P6 kept assertions and why

The three `it(...)` routing blocks in `access-runner.test.ts` were collapsed into a single
`it("main loop wires routers and action helpers correctly — structural change-detector")` block
that retains only the wiring assertions NOT covered by the new Pester tests:

- `Resolve-WriteActionDatabase -DbEngine` call site in main loop
- `Invoke-WriteAction -Database $writeDb.Database` (main loop uses resolved db, not $db)
- `not.toContain("Invoke-WriteAction -Database $db ...")` (regression guard)
- `Resolve-ReadActionDatabase -DbEngine $access.DBEngine ...` call site
- `Invoke-ListTablesAction/GetSchemaAction/GetRelationshipsAction -Database $readDb.Database`
- `Get-TableSchema -Database $db` / `Get-Relationships -Database $db` negative guards
- `Invoke-QuerySqlReadAction -Database $readDb.Database` call site
- `$writeDb.Database.Execute(...)` SQL write dispatch
- `$rs = $db.OpenRecordset(...)` / `$db.Execute(...)` negative regression guards

Dropped (now proven behaviorally by Pester):
- `function Resolve-WriteActionDatabase` name presence
- `function Resolve-ReadActionDatabase` name presence
- `function Invoke-ListTablesAction` / `Invoke-QuerySqlReadAction` name presence
- `Open-DatabaseWithBackendPassword -DbEngine ... -DatabasePath $targetPath` text assertion
- `Open-DatabaseWithBackendPassword ... -ReadOnly $true` text assertion
- `$isDirectTargetQuery = $Operation -eq 'query'` (internal variable name — not a behavioral guarantee)
- `if ($readDb.Owned)` (internal branch — behavior covered by Pester Owned= tests)

## Progress Log (append-only, newest at bottom)

- **2026-06-01** — Doc created. v1.2.9 + v1.2.10 already shipped (P1/P3/P4/P5 done). Starting P6 investigation.
  Flagged P7 infra blocker (GitHub-hosted Windows has no MS Access → needs self-hosted runner). Working branch `test/380-p6-p7` created.
- **2026-06-01** — P6 investigated: Pester does NOT cover routing; routing fns are stubable → decided REPLACE-WITH-BEHAVIORAL. Delegating implementation with TDD next.
- **2026-06-01** — P6 implemented (TDD):
  - Added 4 new Pester `Describe` blocks in `scripts/tests/dysflow-access-runner.Tests.ps1` via AST extraction (production source, not hand-copies): `Resolve-WriteActionDatabase` (11 tests), `Resolve-ReadActionDatabase` (10 tests), `Invoke-QuerySqlReadAction` (4 tests), `Invoke-ListTablesAction` (3 tests). Total new: 28 Pester tests.
  - Replaced 3 brittle `it()` blocks in `test/core/runner/access-runner.test.ts` with 1 single labeled "structural change-detector" block retaining only wiring assertions not covered by Pester.
  - Ran biome format on `access-runner.test.ts` (fixed pre-existing CRLF issue on that file).
  - Test counts: TS unit 827 passed / 3 skipped; Pester 135 passed / 4 skipped; integration 13 passed.
  - 4 pre-existing biome format failures on unmodified files (`access-operation-cleanup.test.ts`, `windows-processes.test.ts`, `scripts-access-runner.test.ts`, `scripts-vba-manager.test.ts`) — NOT introduced by this change.
- **2026-06-01** — Verified the local biome "format" failures are a **working-tree CRLF artifact only**: `git ls-files --eol` shows the changed files committed as `i/lf` (working tree `w/crlf`), and `git status` shows those 4 files UNMODIFIED. The committed blobs are LF — exactly what Linux CI lints — so CI lint passes (Linux is authoritative). Do NOT run `pnpm lint:fix` and commit just to silence local CRLF; it would churn line endings. Fresh adversarial review of the P6 diff: **APPROVE** (no CRITICAL/WARNING; confirmed no deleted assertion dropped a real guarantee — the `not.toContain` negative guards were retained in the change-detector block; new Pester tests load the real bodies via AST, mocks are real stubs that assert called/not-called, no trivially-passing tests). Two non-blocking SUGGESTIONs noted for a future pass: (a) the top-of-file pure-helper bootstrap still hand-copies `Resolve-SandboxedPath`/`Format-SqlLiteral`/`Split-SqlStatements`/`Invoke-SeedFixtureDryRun` (convert to AST extraction for consistency); (b) trivial doc/test label mismatch. Opening the P6 PR next.
- **2026-06-01 (P6 merged)** — P6 PR #383 merged to main (CI green; Quality gates 39s confirmed the CRLF was a local artifact). Behavioral routing coverage in, brittle text assertions out. P6 DONE.

---

## ⚠️ CRITICAL — E2E methodology error found 2026-06-01 (READ BEFORE RUNNING THE E2E)

P7 was reframed: **the user said run `mcp-e2e.mjs` DIRECTLY on this Windows dev box (it has Access)**, not a CI job. While doing that, a serious methodology bug was found in HOW the E2E was being run all session:

- `resolveDefaultRunnerScriptPath(env)` (`src/core/runner/access-runner.ts:485-490`): **when `DYSFLOW_HOME` is set, the PowerShell script path = `$DYSFLOW_HOME/app/scripts/dysflow-access-runner.ps1`.**
- All session E2E runs used `DYSFLOW_HOME='C:\Proyectos\dysflow\test-runtime'`, whose `app/scripts/` held **STALE scripts (May 31, 80493 bytes)** — NOT today's repo scripts (`scripts/dysflow-access-runner.ps1`, Jun 1, 82374 bytes). So **every E2E run before the fix tested STALE PowerShell**, including the earlier "v1.2.9 validated 104/0". **The v1.2.10 CHANGELOG line "validated by real MCP E2E: 104 pass / 0 fail" is therefore INACCURATE and must be corrected.**
- **Correct way to run the E2E against current code:** sync `test-runtime/app/scripts/` with the repo (`cp scripts/*.ps1 test-runtime/app/scripts/`) AND keep `test-runtime/app/dist` current (or point `DYSFLOW_E2E_COMMAND` at the repo `dist`). Clean baseline each run: kill stray MSACCESS + `rm -rf test-runtime/.dysflow` (registry). Do NOT point `DYSFLOW_HOME` at an empty dir (the runner fails with `-File [PATH] does not exist`).

### Honest E2E findings (same dist code across runs; machine progressively degrading)
- run1 (stale scripts, fresh-ish): **104/0**. run2 (stale): 97/7. run3 (stale, quiet): 85/19. clean-home: invalid (`[PATH]`). **current-scripts + clean baseline + fresh registry: 75/29.**
- ALL failures are `:zombie-check` (a new MSACCESS lingered >5s). **No FUNCTIONAL failures with current scripts** (scripts found, ops succeeded). **No PERMANENT zombies — MSACCESS count returns to 0 after every run.** So this is **slow COM release (>5s)**, NOT the #376 permanent-hang bug.
- **Cannot separate "today's code regressed cleanup latency" from "the machine's COM/WMI/RPC subsystem degraded over ~5 sustained runs".** A clean baseline of *processes* does NOT reset the deeper COM/WMI state. Sequential runs on a degrading machine are a moving target.

### NEXT SESSION — do this first (the only reliable discriminator)
1. **REBOOT Windows** (resets COM/WMI/RPC), then run the E2E ONCE with CURRENT scripts (sync them first, clean baseline). 
   - ~104/0 → fix is good; today's leaks were accumulated machine degradation. Then **fix the v1.2.10 CHANGELOG claim** (soften to "validated functionally; zombie-check clean on a fresh-state run").
   - still leaking `:zombie-check` → REAL slow-release regression. Open a GH issue; investigate the COM Quit/release timing and the mcp-e2e per-call `node mcp` spawn/kill interaction (killing the per-call MCP server may orphan its Access COM child before a clean Quit). Compare against pre-#376 scripts on equal fresh state.
2. **Correct the v1.2.10 CHANGELOG** regardless (the 104/0 claim was stale-script-based).
3. Consider whether the mcp-e2e 5s zombie-check window is realistic, or whether "dies within ~20s" is acceptable (no permanent zombie).

### P7 status
- [x] Reframed: run on this Windows box (not CI). [x] Confirmed it runs here. 
- [ ] Get a trustworthy fresh-state number (needs reboot — next session).
- [ ] Decide: formalize as `pnpm e2e:zombies` manual pre-release gate + document; and/or investigate slow-release if it reproduces fresh.
