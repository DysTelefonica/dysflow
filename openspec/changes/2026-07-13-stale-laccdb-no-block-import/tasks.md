# Tasks: Stale `.laccdb` no longer blocks `import_modules`

> Order: strict TDD. Tasks 1-4 are RED-first; tasks 5-6 are GREEN; tasks 7-9 verify and ship. Each task's `verify:` line is a single deterministic check the writer must run.

## Phase 1 — RED (tests before code)

- [ ] **1. Read the helper end-to-end.** Re-read `scripts/lib/dysflow-access-com.ps1:258-430` and `scripts/tests/dysflow-vba-manager.Tests.ps1:1468-1565`. Confirm the line numbers in `design.md` are still current; fix drift if any.
  - verify: `codegraph_explore` (or `Read` for PS1 since not indexed) returns lines 258-430 unchanged.

- [ ] **2. Append the 4 RED tests to `scripts/tests/dysflow-vba-manager.Tests.ps1`** inside the "Close-TargetAccessDbIfOpen — ownership-safe blocking behavior" `Describe` block, AFTER the existing `It` blocks (current end: line 1565). Use the exact test names + bodies from `design.md` (`Tests 1-4`). Adjust the `BeforeEach` to also initialize `$script:StatusMessages` (a `[List[string]]`) when Test 2 or 3 are exercised.
  - verify: `pwsh -Command "Invoke-Pester scripts/tests/dysflow-vba-manager.Tests.ps1 -Output Detailed"` → reports the 3 new tests as FAILED, the regression test (#4) as PASSED (it covers an existing branch).

- [ ] **3. Confirm the RED.** The first three new tests must fail with messages like "expected `<.laccdb-path-not-removed>`, but `.laccdb` still present" or "expected Write-Status to contain 'LACCDB_STALE_DETECTED'". The fourth test should pass because the current code's branch flow already handles a non-matching process attribution — its purpose is a regression guard only.
  - verify: paste the pester output count into the apply-progress note: `Failed: 3, Passed (new): 1, Passed (existing): unchanged`.

## Phase 2 — GREEN (the fix)

- [ ] **4. Apply the `Close-TargetAccessDbIfOpen` edit** as specified in `design.md` (`scripts/lib/dysflow-access-com.ps1:394-421`). Specifically:
  - Between `Test-Path` and `Write-Warning`, wrap a `try/finally` block that calls `[System.IO.File]::Open($lockPath, Open, Read, None)`.
  - On success: `Remove-Item -LiteralPath $lockPath -Force`, `Write-Status` the `LACCDB_STALE_DETECTED` advisory, return success silently (no warning).
  - On `IOException`/`UnauthorizedAccessException`: close any open handle, fall through to the existing diagnostic enumeration. After the existing matching-PID branch, additionally `Write-Status` `LIVE_PROCESS_HOLDS_LACCDB: pid=<n>`.
  - Always `finally` disposes any open handle.
  - verify: `pwsh -Command "Invoke-Pester scripts/tests/dysflow-vba-manager.Tests.ps1 -Output Detailed"` → all 4 new tests + 4 existing tests PASSED.

- [ ] **5. Full vitest + lint gate.**
  - `pnpm test` — every spec green.
  - `pnpm run lint` — no new biome/lint errors.
  - verify: paste the two final lines (vitest summary + biome ok) into the apply-progress note.

## Phase 3 — Surface artifacts

- [ ] **6. CHANGELOG bullet** under the current unreleased section (find by `^## \[Unreleased\]` or equivalent header in `CHANGELOG.md`). Format consistent with existing entries; prefix `fix(import):`. Reference issue #844.
  - verify: `git diff CHANGELOG.md` shows exactly one new bullet under the unreleased section.

- [ ] **7. Version bump** in `package.json`: `2.9.0` → `2.9.1` (patch).
  - verify: `git diff package.json` shows exactly one version-field change.

- [ ] **8. Spec delta** at `openspec/specs/vba-manager-actions.md` (create the file or append to existing). Add a "DIFFERENTIAL CHANGE for #844" section documenting the two new diagnostic codes and the silent-cleanup behavior. Two paragraphs max.
  - verify: file exists; `openspec validate vba-manager-actions --strict` (if installed) or `openspec list --specs` (whichever is available) reports no error. Skip silently if `openspec` CLI is not installed in this env.

## Phase 4 — Review & ship

- [ ] **9. Conventional commit + branch + push + PR.**
  - Branch: `fix/stale-laccdb-should-not-block-import`.
  - Commit: `fix(import): stale .laccdb no longer blocks import when no live process holds the binary (#844)`.
  - Body references the issue, the new advisory codes, and the test names (RED → GREEN).
  - Push: `git push -u origin fix/stale-laccdb-should-not-block-import`.
  - PR opened with `gh pr create --title "fix(import): stale .laccdb no longer blocks import when no live process holds the binary (#844)" --body-file <(cat <<EOF ... EOF)` — body includes changelog bullet + acceptance link.
  - verify: `gh pr view --json url` returns the PR URL; user is the sole reviewer.

- [ ] **10. Run `sdd-verify`** (delegate to fresh-context `sdd-verify` sub-agent) against this tasks.md + proposal.md + design.md. Pass criteria:
  - All 4 Pester tests pass.
  - Vitest suite green.
  - Lint green.
  - CHANGELOG + version bump + spec delta present.
  - No scope drift vs issue #844.
  - verify: `sdd-verify` returns `verdict: PASS` with `apply-progress.md` linked.

## Work-units (commit segmentation if budget exceeded)

For this change (~80-120 net lines) the work fits a single PR. If `biome` reports >400 lines changed, split as:
- **WU1**: PS1 helper edit + tests (test+code together, atomic RED→GREEN).
- **WU2**: CHANGELOG + package.json + spec delta.

Apply phase MUST commit WU1 first, wait for green, then WU2. Do NOT batch the two work-units into one commit.

## Skills to load before work

Before starting, the apply sub-agent MUST read in full:

- `C:\Users\adm1\.config\opencode\skills\dysflow-usage\SKILL.md` — operational contract for the dysflow MCP envelope; relevant for understanding how `collectDiagnostics` parses `Write-Status` outputs.
