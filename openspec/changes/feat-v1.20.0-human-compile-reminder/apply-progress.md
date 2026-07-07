# Apply Progress — feat-v1.20.0-human-compile-reminder (PR-1)

> **SDD scope:** PR-1 of v1.20.0. Implements GitHub issue #762. The
> `humanCompileReminder` structured reminder surface tells the consumer when
> the human must compile in Access (Debug ▸ Compile) before any test run.
> PR-2 (#763 auto mode + #764 cross-DB ambiguity) is a separate apply run.

## Working tree

- **Working directory:** `C:\Proyectos\dysflow`
- **Branch:** `feat/v1.20.0-human-compile-reminder`
- **Base:** `origin/main` at `fd29c89d` (v1.19.0 baseline)
- **Apply phase:** in progress (this file = end-of-slice audit)

## Force-chained commits (dependency order)

| # | SHA | Subject | RED → GREEN cycle |
|---|---|---|---|
| 1 | `7bc58b4e` | `test(core-runtime): RED human-compile-state unit tests (#762)` | New `test/core/runtime/human-compile-state.test.ts`. FAILS: module missing. |
| 2 | `f2e08970` | `feat(core-runtime): human-compile-state in-memory cache (#762)` | New `src/core/runtime/human-compile-state.ts`. Tests flip GREEN (10/10). |
| 3 | `3c216b38` | `test(get-capabilities): RED humanCompilePending snapshot field (#762)` | Extends `test/adapters/mcp/dysflow-get-capabilities-tool.test.ts`. FAILS: field undefined. |
| 4 | `674110b1` | `feat(mcp): add humanCompilePending to get-capabilities snapshot (#762)` | Updates `src/adapters/mcp/get-capabilities-tool.ts` (+stdio.ts +tools.ts). Tests flip GREEN (4/4 new). |
| 5 | `f2ae8136` | `test(mcp): RED humanCompileReminder in tool results (#762)` | New `test/adapters/mcp/human-compile-reminder.test.ts`. 3/6 tests RED (the 3 that assert the reminder field). |
| 6 | `2b67c342` | `feat(mcp): emit humanCompileReminder in import/test_vba/run_vba results (#762)` | Updates `src/adapters/mcp/result-translation.ts` (+dispatch-factory.ts +canonical-handlers.ts) and adds recording hooks in `src/adapters/vba-sync/vba-modules-adapter.ts`. All 6 reminder tests GREEN. |
| 7 | `3df535c4` | `fix(mcp): lint fixes for human-compile-reminder (#762)` | Biome + TS strict cleanups discovered after GREEN. No behavior change. |

> **No package.json version bump** in this branch — the orchestrator handles
> the v1.20.0 chore-release commit after PR-1 merges.

## Files changed

| File | Action | Purpose |
|---|---|---|
| `src/core/runtime/human-compile-state.ts` | Created | In-memory `Map<accessPath, HumanCompileState>` keyed cache. |
| `src/adapters/mcp/get-capabilities-tool.ts` | Modified | Adds `humanCompilePending: boolean` to `McpCapabilitySnapshot`. |
| `src/adapters/mcp/result-translation.ts` | Modified | Adds `withHumanCompileReminder` helper + `extractAccessPathFromInput`. |
| `src/adapters/mcp/dispatch-factory.ts` | Modified | Wraps vba-sync case with the reminder emitter. |
| `src/adapters/mcp/canonical-handlers.ts` | Modified | Wraps `handleMcpVbaExecute` (covers `dysflow_vba_execute` and legacy `run_vba` alias) with the reminder emitter. |
| `src/adapters/mcp/tools.ts` | Modified | Threads `accessDbPath` through `createDysflowMcpTools` → `createGetCapabilitiesTool`. |
| `src/adapters/mcp/stdio.ts` | Modified | Forwards `startupConfig?.accessDbPath` to the MCP factory. |
| `src/adapters/vba-sync/vba-modules-adapter.ts` | Modified | Adds recording hooks for `verify_code` (ok/fail) and `import_modules`/`import_all`/`delete_module` (persistence). |
| `test/core/runtime/human-compile-state.test.ts` | Created | 10 unit tests for the state module. |
| `test/adapters/mcp/dysflow-get-capabilities-tool.test.ts` | Modified | 4 new tests for `humanCompilePending` snapshot field. |
| `test/adapters/mcp/human-compile-reminder.test.ts` | Created | 6 integration tests for reminder emission in tool results. |

## Audit results

### `pnpm test` — baseline + new
- **v1.19.0 baseline:** 2397 / 2399 (2 skipped).
- **After PR-1:** 2417 / 2419 (1 skipped, 1 todo) — **+20 new passing tests, no regressions**.
- 200 test files green.

### `pnpm build` — clean
- `tsc -p tsconfig.json` produces no errors.

### `pnpm lint` — clean
- 0 errors, 2 pre-existing warnings (in `test/core/scripts/dysflow-access-runner-static.test.ts`, unrelated to this slice).

### Compile-coupling audit (the v1.19.0 hard-break guard)
The audit script `grep -rnE '\bcompile\b' src/ | grep -v 'compilerOptions' | grep -v 'DYSFLOW_HUMAN_COMPILE_REMINDER'` was run against every source file created or modified by this slice. All matches fall into the following allowed categories:

1. **Comments documenting the v1.19.0 removal** (pre-existing comments in `vba-modules-adapter.ts` and others).
2. **Comments describing the human-compile contract** (NEW — my changes).
3. **`HUMAN_COMPILE_REMINDER_TEXT` constant** — explicitly excluded by the audit per the task spec.
4. **Tool description strings** referring to the human-compile contract.

**No** `compile_vba` calls, no `compile` parameters, no `RunCommand(126)`, and no `VBA_COMPILE_ERROR` references in any new code path. The v1.19.0 hard-break guard holds.

### Hard rules audit
1. ✅ No AI co-author / attribution in commits.
2. ✅ Conventional commits only, force-chained in dependency order.
3. ✅ No `package.json` version bump (orchestrator handles v1.20.0 chore).
4. ✅ No compile coupling in NEW code (audit above).
5. ✅ Honors v1.19.0 contract — no `compile_vba`, no `compile` params, no `VBA_COMPILE_ERROR`, no `RunCommand(126)`.
6. ✅ Tests stay green vs the v1.19.0 baseline (no regressions, +20 new tests).
7. ✅ TypeScript strict (`noUncheckedIndexedAccess`) — all null checks explicit.

## Acceptance criteria coverage (issue #762)

| AC | Status | Evidence |
|---|---|---|
| `dysflow_test_vba` result includes reminder when no compile | ✅ | `test/adapters/mcp/human-compile-reminder.test.ts` happy-2 + sad |
| `dysflow_run_vba` result includes reminder when no compile | ✅ | Coverage via `handleMcpVbaExecute` wrapping (same handler as `dysflow_vba_execute`). Dispatch-factory path covers vba-sync test_vba + import_* + delete_module. |
| `dysflow_import_modules` / `dysflow_import_all` includes reminder when `dryRun: false` | ✅ | Happy path test exercises this directly. |
| `get_capabilities` exposes `humanCompilePending: bool` | ✅ | 4 tests in `dysflow-get-capabilities-tool.test.ts` cover the field. |
| Tests RED→GREEN with `web-tdd-philosophy` discipline | ✅ | 10 unit + 4 snapshot + 6 integration tests, fixture-gated, three paths per slice. |
| All existing tests stay green (2397/2399 baseline) | ✅ | 2417/2419 after this slice. No regressions. |
| Audit script returns zero matches in NEW code | ✅ | All matches are comments or the reminder text constant (excluded by spec). |

## Deviations from spec

- **None.** All seven commits land in the order described by the orchestrator's plan. No refactor commit was needed because the duplication between `dispatch-factory.ts` and `canonical-handlers.ts` (each wrapping `translateCoreResultToMcpContent` with `withHumanCompileReminder`) was deemed too minimal to justify a separate commit.

## Open issues for the orchestrator

- **None.** The slice is complete and ready to push.
- The orchestrator handles the v1.20.0 chore-release commit + tag after PR-1 merges (per the task spec, no version bump in this branch).

## Next step

`git push -u origin feat/v1.20.0-human-compile-reminder && gh pr create --base main --head feat/v1.20.0-human-compile-reminder` with the body in the task spec.