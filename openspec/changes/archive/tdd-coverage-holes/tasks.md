# Tasks: TDD Coverage Holes — MCP E2E + VBA Module Forwarding

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~365–425 |
| 400-line budget risk | Medium (425 if F is GREEN; 365 if F is docs-only) |
| Chained PRs recommended | Yes — 7 work units, one commit each |
| Suggested split | Seven sequential commits on `main` (dysflow is main-only) |
| Delivery strategy | `force-chained` |
| Chain strategy | `stacked-to-main` |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

> **Budget path note:** If F implements `walkDescendants` via WMIC, estimate is ~425 lines (over budget by ~25). If F documents the limitation, estimate is ~365 lines (within budget). The orchestrator should decide before WU-F begins; the task file flags the taken path.

---

## Work Unit A — RED: real forwarding tests for H1 + H2

- [ ] **A.1** `test/adapters/vba-sync/vba-sync-adapter-exists-forwarding.test.ts` — RED test: `VbaSyncAdapter.execute("exists", { moduleName:"Foo" })` captures `moduleNamesProvided === true` and `moduleNames === ["Foo"]` via injected fake executor. [RED] `pnpm exec vitest run vba-sync-adapter-exists-forwarding` ~40 lines
- [ ] **A.2** `test/adapters/vba-sync/vba-sync-adapter-delete-forwarding.test.ts` — RED test: `VbaSyncAdapter.execute("delete_module", { moduleName:"Foo", force:true })` captures `moduleNamesProvided === true`, `moduleNames === ["Foo"]`, `extra.force === true`. [RED] `pnpm exec vitest run vba-sync-adapter-delete-forwarding` ~40 lines

## Work Unit B — GREEN: fix `moduleNamesProvided` at `vba-sync-adapter.ts:251`

- [ ] **B.1** `src/adapters/vba-sync/vba-sync-adapter.ts:251` — GREEN: change `moduleNamesProvided` to `(import_all && Object.hasOwn(params, "moduleNames")) || moduleNames.length > 0`. Preserves R4 for `import_all` explicit-empty; makes H1/H2 GREEN. Do NOT add new imports. [GREEN] `pnpm exec vitest run vba-sync-adapter-exists-forwarding vba-sync-adapter-delete-forwarding` ~5 lines

## Work Unit C — RED: extract `record()` to helper + real stop-on-fail tests (H3, H7)

- [ ] **C.1** `E2E_testing/_helpers/mcp-e2e-record.mjs` — NEW: extract `record()` body from `E2E_testing/mcp-e2e.mjs:122-202` verbatim. Export `async function record(ctx, { area, tool, args, options })` where ctx = `{ callMcp, runMcpHarness, suiteOwnPids, waitForNoOwnPids, isOwnPidAlive, rows, log }`. All Node built-ins (`process.kill`, `setTimeout`, `console`) and `spawn` become explicit ctx parameters so tests can inject fakes. [RED] N/A (new file) ~100 lines
- [ ] **C.2** `test/quality-gates/mcp-e2e-record-stop-on-fail.test.ts` — REWRITE: import real `record()` from `E2E_testing/_helpers/mcp-e2e-record.mjs`. `vi.mock("../../../E2E_testing/_helpers/mcp-harness.mjs")`. Assert: (a) `expected:"error"` + `isError:false` → throws STOP-ON-FAIL; (b) `expected:"error"` + `isError:true` → PASS row; (c) `expected:"success"` + `isError:true` → throws STOP-ON-FAIL; (d) `${tool}:zombie-check` row with `pass:true` when child dead, `pass:false` + STOP-ON-FAIL when child alive. All four cases MUST FAIL against current in-memory simulation. [RED] `pnpm exec vitest run mcp-e2e-record-stop-on-fail` ~60 lines

## Work Unit D — GREEN: wire `mcp-e2e.mjs` through extracted `record()`

- [ ] **D.1** `E2E_testing/mcp-e2e.mjs` — GREEN: import `record` from `_helpers/mcp-e2e-record.mjs`, construct `ctx` from existing outer scope, call `record(ctx, ...)`. Behavior must be identical. [GREEN] `pnpm exec vitest run mcp-e2e-record-stop-on-fail` ~10 lines

## Work Unit E — RED: real subprocess tests for H4 + H5 + H6

- [ ] **E.1** `test/quality-gates/mcp-e2e-preflight-real-pid.test.ts` — NEW: spawn `node -e "setInterval(()=>{},1000)"`, push PID to `suiteOwnPids`, call `record(...)`. Assert throws `REFUSE-START` before any tool runs. Uses real Node `spawn`, not mocks. [RED] `pnpm exec vitest run mcp-e2e-preflight-real-pid` ~40 lines
- [ ] **E.2** `test/quality-gates/mcp-e2e-grandchild-zombie.test.ts` — NEW: spawn `node -e "child_process.spawn(process.execPath,['-e','setInterval(()=>{},1000)'])"`, push outer PID to `suiteOwnPids`, wait for outer to exit, then call `waitForNoOwnPids(2000,100)`. Assert `{ found:true, pids:[grandchildPid] }` if descendant detection works; assert `{ found:false }` with `// KNOWN LIMITATION` comment if it does not. [RED] `pnpm exec vitest run mcp-e2e-grandchild-zombie` ~40 lines
- [ ] **E.3** `test/quality-gates/mcp-e2e-final-lingering-check.test.ts` — NEW: drive `mcp-e2e.mjs` via a wrapper harness that leaves a zombie after the last tool. Assert `rows.at(-1).tool === "lingering-access-check"` AND `rows.at(-1).pass === false`. [RED] `pnpm exec vitest run mcp-e2e-final-lingering-check` ~40 lines

## Work Unit F — GREEN or documented limitation for H5

- [ ] **F.1** *(GREEN path — taken only if `walkDescendants` is feasible in ≤80 lines)* — Implement `walkDescendants(pid)` via `wmic process get ProcessId,ParentProcessId /format:csv` in `E2E_testing/_helpers/mcp-e2e-record.mjs` or a new helper. Update `isOwnPidAlive` to return `true` if any descendant is alive. Update `waitForNoOwnPids` accordingly. Re-run E.2 and assert it goes GREEN. *(If GREEN path not taken, delete this task and activate F.2.)* [GREEN] `pnpm exec vitest run mcp-e2e-grandchild-zombie` ~80 lines
- [ ] **F.2** *(docs-only path — activate if F.1 is not feasible)* — Write `openspec/changes/tdd-coverage-holes/verify-report.md` section noting H5 grandchild detection is not implemented; create follow-up issue in GitHub. H5 test remains RED with `// KNOWN LIMITATION`. [REFACTOR] N/A (documentation) ~20 lines

## Work Unit G — Verify: full gate + orphan check + report

- [ ] **G.1** Run `pnpm test` and confirm 0 failures. [GREEN] `pnpm test` ~5 lines
- [ ] **G.2** Run `pnpm test:ps1` and confirm 0 failures. [GREEN] `pnpm test:ps1` ~5 lines
- [ ] **G.3** Run `pnpm build` and confirm 0 errors. [GREEN] `pnpm build` ~5 lines
- [ ] **G.4** Run `pnpm lint` and confirm 0 errors. [GREEN] `pnpm lint` ~5 lines
- [ ] **G.5** Run `pnpm test:e2e:mcp` end-to-end. Confirm exit code 0 and final `lingering-access-check` row is PASS. [GREEN] `pnpm test:e2e:mcp` ~5 lines
- [ ] **G.6** Run `Get-Process -Name MSACCESS` (or `dysflow_access_operations_list`) and confirm 0 `MSACCESS.EXE` orphans remain. [GREEN] `dysflow_access_operations_list` (or PowerShell) ~5 lines
- [ ] **G.7** Write `openspec/changes/tdd-coverage-holes/verify-report.md` with all command outputs, orphan count, and per-WU commit SHAs. [REFACTOR] N/A (new file) ~30 lines

---

## Task Summary

| Work Unit | Tasks | Phase | Est. Lines |
|-----------|-------|-------|-----------|
| A | A.1, A.2 | RED | 80 |
| B | B.1 | GREEN | 5 |
| C | C.1, C.2 | RED | 160 |
| D | D.1 | GREEN | 10 |
| E | E.1, E.2, E.3 | RED | 120 |
| F | F.1 (GREEN) or F.2 (docs) | GREEN/REFACTOR | 80 or 20 |
| G | G.1–G.7 | GREEN/REFACTOR | 60 |
| **Total (GREEN path)** | **18 tasks** | | **~425 lines** |
| **Total (docs path)** | **17 tasks** | | **~365 lines** |

---

## Commit Order (WU-A → WU-G, each on `main`)

| WU | Conventional commit | Notes |
|----|---------------------|-------|
| A | `test(adapter): real forwarding tests for exists/delete single-name` | Fails on current code (RED); WU-B makes it green |
| B | `fix(adapter): forward moduleNames from mapping output, not payload key presence` | One-line fix at `vba-sync-adapter.ts:251` |
| C | `test(e2e): extract record() to mcp-e2e-record helper` | C.1 fails (new file); C.2 fails (current is in-memory sim) |
| D | `refactor(e2e): wire mcp-e2e.mjs through extracted record()` | C.2 goes green |
| E | `test(e2e): real subprocess tests for preflight + final lingering check` | H4/H5/H6 all RED against current implementation |
| F | `fix(e2e): watch suite-owned descendant tree` OR `docs(e2e): document grandchild-survivor limitation` | GREEN or docs-only; H5 goes green or stays honest RED |
| G | `chore(sdd): verify-report for tdd-coverage-holes` | Final gate; orphan check included |

Each commit must leave `pnpm test` green. E2E suite (`pnpm test:e2e:mcp`) runs only after G.

---

## Implementation Commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|--------|-----------|-----------|--------------|-------------|
| `<sha>` | WU-A | A.1, A.2 | `pnpm exec vitest run vba-sync-adapter-exists-forwarding vba-sync-adapter-delete-forwarding` | N/A |
| `<sha>` | WU-B | B.1 | `pnpm test` | N/A |
| `<sha>` | WU-C | C.1, C.2 | `pnpm exec vitest run mcp-e2e-record-stop-on-fail` | N/A |
| `<sha>` | WU-D | D.1 | `pnpm exec vitest run mcp-e2e-record-stop-on-fail` (must be green) | N/A |
| `<sha>` | WU-E | E.1, E.2, E.3 | `pnpm exec vitest run mcp-e2e-preflight-real-pid mcp-e2e-grandchild-zombie mcp-e2e-final-lingering-check` | N/A |
| `<sha>` | WU-F | F.1 or F.2 | `pnpm exec vitest run mcp-e2e-grandchild-zombie` | N/A |
| `<sha>` | WU-G | G.1–G.7 | `pnpm test && pnpm test:ps1 && pnpm build && pnpm lint && pnpm test:e2e:mcp` | N/A |
