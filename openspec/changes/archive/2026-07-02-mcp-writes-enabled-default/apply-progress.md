# Apply Progress: MCP stdio writes-enabled by default

## Status
19/19 tasks complete. All Success Criteria in `proposal.md` checked. Ready for verify.

## Mode
Strict TDD

## Completed Tasks

### Phase 1: RED — Failing Tests (`test/cli/commands.test.ts`)
- [x] 1.1 Pinned bare `runCli(["mcp"], ...)`: injected `startMcpAdapter` receives `{ writesEnabled: true }`.
- [x] 1.2 Added test: `runCli(["mcp", "--disable-writes"], ...)` → `{ writesEnabled: false }`.
- [x] 1.3 Added test: `runCli(["mcp", "--enable-writes"], ...)` → `writesEnabled: true`, `exitCode: 0`, `stderr: ""` (no-op).
- [x] 1.4 Added test: both flags together → `exitCode: 1`, mutual-exclusion message + `MCP_USAGE` on stderr, adapter not started.
- [x] 1.5 Confirmed RED: 1.1, 1.2, 1.4 failed as expected; 1.3 already passed (back-compat behavior unchanged).

### Phase 2: GREEN — Implementation
- [x] 2.1 `src/cli/commands/mcp.ts`: parse `enableWrites`/`disableWrites`; `const writesEnabled = !disableWrites;`; unknown-arg rejection extended to accept both flags.
- [x] 2.2 Mutual-exclusion check added before unknown-arg check: both flags → exit 1, stderr message + usage, no adapter start.
- [x] 2.3 `MCP_USAGE` updated to `"Usage: dysflow mcp [--disable-writes | --enable-writes]"`.
- [x] 2.4 `src/adapters/mcp/stdio.ts:96`: `options?.writesEnabled ?? false` → `?? true`.
- [x] 2.5 Confirmed GREEN: 26/26 tests in `commands.test.ts` pass, no regression.

### Phase 3: Regression Guard
- [x] 3.1 `test/cli/subcommand-help.test.ts` (7/7) and serve/HTTP tests unaffected — pass unchanged.
- [x] 3.2 `pnpm test` full suite green (161 files / 2022 tests).

### Phase 4: Docs
- [x] 4.1 `README.md`: rewrote the MCP write-tools paragraph (~476-493) — stdio enabled by default, `--disable-writes` opt-out, per-repo `allowWrites: false` option; updated CLI table row (~760).
- [x] 4.2 `AGENTS.md` "Safe write enablement" section and `docs/architecture/dysflow-core-and-adapters.md:35` updated to state stdio defaults to writes-enabled; HTTP unchanged.
- [x] 4.3 `docs/security/adapter-write-gates.md`: inserted new `## Process-wide write default` section after the exposure table (before "What each adapter gates"); did not touch the existing "Decision" section.
- [x] 4.4 `CHANGELOG.md`: added prominent `[Unreleased]` entry for the trust-posture change, migration note included.

### Phase 5: Final Verification Gate
- [x] 5.1 `pnpm test` full suite green (161 files / 2022 tests, second run after fixing a pre-existing doc-pinning test).
- [x] 5.2 `pnpm build` (`tsc -p tsconfig.json`) succeeds, no type errors.
- [x] 5.3 All Success Criteria in `proposal.md` checked.

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `src/cli/commands/mcp.ts` | Modified | `writesEnabled = !disableWrites`; mutual-exclusion check for both flags; updated `MCP_USAGE`. |
| `src/adapters/mcp/stdio.ts` | Modified | Line 96 fallback `?? false` → `?? true`. |
| `test/cli/commands.test.ts` | Modified | Pinned bare-`mcp` default; added `--disable-writes`, `--enable-writes` no-op, and both-flags-rejected tests. |
| `test/docs/mcp-readme-tool-surface.test.ts` | Modified | Updated stale pinned assertion (`"enables guarded MCP writes"` → `"writes enabled by default"` + `"--disable-writes"`) to match the new README wording — this test encoded the old opt-in default and needed to change with the intentional behavior change. |
| `README.md` | Modified | MCP write-tools section (~476-493) and CLI table (~760) rewritten for the new default. |
| `AGENTS.md` | Modified | "Safe write enablement" section (~138-144) updated. |
| `docs/architecture/dysflow-core-and-adapters.md` | Modified | Line 35 CLI wiring note updated. |
| `docs/security/adapter-write-gates.md` | Modified | New `## Process-wide write default` section inserted. |
| `CHANGELOG.md` | Modified | New `[Unreleased]` entry for `mcp-writes-enabled-default (#645)`. |
| `openspec/changes/2026-07-02-mcp-writes-enabled-default/proposal.md` | Modified | Success Criteria checked. |
| `openspec/changes/2026-07-02-mcp-writes-enabled-default/tasks.md` | Modified | All 19 tasks marked `[x]`. |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1-2.5 (bare `mcp` default) | `test/cli/commands.test.ts` | Unit (CLI) | ✅ 23/23 baseline | ✅ Written | ✅ Passed | ➖ Single scenario (existing test extended) | ➖ None needed |
| 1.2/2.1-2.4 (`--disable-writes`) | `test/cli/commands.test.ts` | Unit (CLI) | ✅ 23/23 baseline | ✅ Written | ✅ Passed | ✅ Covered alongside enable/both-flags cases | ➖ None needed |
| 1.3 (`--enable-writes` no-op) | `test/cli/commands.test.ts` | Unit (CLI) | ✅ 23/23 baseline | ✅ Written (already GREEN — pins unchanged back-compat behavior) | ✅ Passed | ➖ Single scenario | ➖ None needed |
| 1.4/2.2 (both flags rejected) | `test/cli/commands.test.ts` | Unit (CLI) | ✅ 23/23 baseline | ✅ Written | ✅ Passed | ➖ Single scenario (spec has one) | ➖ None needed |

### Test Summary
- **Total tests written**: 4 new (`commands.test.ts`), 1 updated (`mcp-readme-tool-surface.test.ts`)
- **Total tests passing**: 2022/2022 (full suite)
- **Layers used**: Unit (CLI) x4
- **Approval tests** (refactoring): None — no refactoring tasks; `mcp-readme-tool-surface.test.ts` update reflects an intentional behavior/doc change, not a refactor
- **Pure functions created**: 0 (boolean derivation `!disableWrites` inline; no extraction needed)

## Deviations from Design
None — implementation matches design exactly: `writesEnabled = !disableWrites`, mutual-exclusion message text verbatim from design, `MCP_USAGE` string verbatim, `stdio.ts:96` fallback flip verbatim.

One necessary addition beyond the tasks.md list: `test/docs/mcp-readme-tool-surface.test.ts` had a pre-existing doc-pinning assertion (`"enables guarded MCP writes"`) that encoded the OLD default-off behavior. Updating README.md per Phase 4 made this assertion fail; the test was updated (not the production code) since it was testing stale wording that the design intentionally supersedes.

## Issues Found
None blocking. The full-suite run is occasionally flaky on Windows due to an unrelated pre-existing `EPERM: operation not permitted, rename ...operations.json` race in a lockfree-concurrency test (`access-operation-registry.ts`) — reproduced once, passed on retry, confirmed pre-existing and unrelated to this change (previously logged in project memory as "Flaky full-suite tests").

## Remaining Tasks
None — all 19 tasks complete.

## Workload / PR Boundary
- Mode: single PR (delivery strategy: `single-pr`, no chaining)
- Current work unit: Unit 1 — Default flip + tests + docs (only unit)
- Boundary: this batch starts from proposal/design/tasks read and ends with all 19 tasks done, full suite green, build green
- Estimated review budget impact: ~156 changed lines (141 insertions + 15 deletions across 9 files) — well within the 400-line budget; no `size:exception` needed
