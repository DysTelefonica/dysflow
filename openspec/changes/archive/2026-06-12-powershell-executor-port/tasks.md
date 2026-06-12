# Tasks: PowerShell Executor Port

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~260-340 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: core contract/executor move → PR 2: wiring/tests |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Formalize core port and relocate default executor | PR 1 | Base = main; core-only + adapter-owned executor |
| 2 | Wire composition roots and complete TDD/migration | PR 2 | Base = PR 1; tests and verification included |

## Phase 1: Foundation / Contracts

- [x] 1.1 Export `PowerShellExecutor`, `PowerShellExecutorOptions`, `PowerShellExecutionResult`, and `AccessProcessOwnership` from `src/core/contracts/index.ts`.
- [x] 1.2 Add `src/adapters/powershell/default-executor.ts` with `createDefaultPowerShellExecutor()` and the moved `POWERSHELL_EXE`/spawn/env/kill-tree logic.

## Phase 2: Core Refactor

- [x] 2.1 Refactor `src/core/runner/access-runner.ts` so `AccessPowerShellRunner` requires an injected executor and no longer imports `./powershell-executor.js`.
- [x] 2.2 Update `src/adapters/vba-sync/vba-sync-adapter.ts` to depend on the adapter-owned executor path, not the core helper.

## Phase 3: Wiring / Migration

- [x] 3.1 Pass `createDefaultPowerShellExecutor()` from `src/cli/commands/access.ts`, `src/cli/commands/doctor.ts`, `src/adapters/mcp/stdio.ts`, and `src/adapters/http/http-services-factory.ts`.
- [x] 3.2 Update any remaining production/test `new AccessPowerShellRunner()` call sites to inject the executor explicitly.

## Phase 4: Testing / Verification

- [x] 4.1 RED: extend `test/core/runner/access-runner.test.ts` with a fake executor and a source-boundary grep/read check that forbids concrete PowerShell imports in `src/core/runner/access-runner.ts`.
- [x] 4.2 GREEN: move `test/core/runner/powershell-executor.test.ts` to `test/adapters/powershell/default-executor.test.ts` and keep spawn/env/timeout/tree-kill coverage intact.
- [x] 4.3 Verify `test/adapters/vba-sync/vba-sync-adapter.test.ts`, `pnpm lint`, `pnpm test`, and `pnpm build` all stay green after the port extraction.

### Post-verify correction

- [x] Fix GH #513 verification failure: inject the default PowerShell executor into all `test/e2e/access-fixture.e2e.test.ts` `AccessPowerShellRunner` call sites and add a migration guard covering all runner construction sites.

## Phase 5: Cleanup

- [x] 5.1 Delete `src/core/runner/powershell-executor.ts` once all imports are gone, and remove any stale compatibility comments or aliases.
