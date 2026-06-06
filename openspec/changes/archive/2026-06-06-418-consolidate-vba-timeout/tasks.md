# Tasks: Consolidate VBA Timeout (#418)

## TDD Checklist

### Phase 1: Characterize (RED → GREEN with existing code)

- [x] Write characterization test: `"timeout: slow executor resolves VBA_MANAGER_TIMEOUT — authoritative timeout is the executor's own timer"` in `test/adapters/vba-sync/vba-sync-adapter.test.ts`
  - Mocks executor to return `{ timedOut: true, durationMs: timeoutMs }`
  - Asserts `VBA_MANAGER_TIMEOUT`, `retryable: true`, message contains `"timed out after 50ms"`
  - Passes with existing code (behavioral, not implementation-coupled)

### Phase 2: Refactor (remove redundant layer)

- [x] Remove `executeWithTimeout` method from `VbaSyncAdapter`
  - Was: `Promise.race([executor(signal), setTimeout → synthetic result])`
  - Now: direct `this.executor(request)` call in `executeMappedTool`

- [x] Remove `executeWithTimeout` from `VbaModulesOrchestrator` interface in `vba-modules-adapter.ts`
  - Replace with `executor: VbaManagerExecutor` field

- [x] Update `VbaModulesAdapter.getComparisonContext()` to bind `runVbaManager` via `this.orchestrator.executor`

- [x] Rename `executeWithTimeout` → `runVbaManager` in `VbaComparisonContext` type in `src/core/services/vba-source-comparison.ts`

- [x] Update call site in `compareSourceAgainstBinary`: `ctx.executeWithTimeout` → `ctx.runVbaManager`

### Phase 3: Update tests

- [x] Replace old implementation-coupled test `"timeout: executor receives a cancellation signal and resolves VBA_MANAGER_TIMEOUT"` with behavioral characterization test
  - Old test asserted on `capturedSignal?.aborted` (internal mechanism, now gone)
  - New test asserts on observable result shape only

- [x] Rename all `executeWithTimeout` → `runVbaManager` in `test/core/services/vba-source-comparison.test.ts` mock objects

### Phase 4: Lint and full suite

- [x] `pnpm exec biome check --write` on changed files — clean
- [x] `pnpm lint` — clean (pre-existing CRLF issues on untouched files are expected)
- [x] `pnpm test` — 65 files, 872 tests pass

## Files changed

- `src/adapters/vba-sync/vba-sync-adapter.ts` — removed `executeWithTimeout`, call executor directly
- `src/adapters/vba-sync/vba-modules-adapter.ts` — replaced `executeWithTimeout` with `executor` in interface, updated context binding
- `src/core/services/vba-source-comparison.ts` — renamed `executeWithTimeout` → `runVbaManager` in port type and call site
- `test/adapters/vba-sync/vba-sync-adapter.test.ts` — replaced signal test with behavioral timeout test
- `test/core/services/vba-source-comparison.test.ts` — renamed all mock `executeWithTimeout` → `runVbaManager`
