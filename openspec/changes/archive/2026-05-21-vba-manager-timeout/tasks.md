# Tasks: VBA Manager Timeout and Non-Interactive Hardening

Closes #63 (timeout) and #69 (-NonInteractive). Single file pair touched:
`src/core/services/vba-sync-legacy-service.ts` + its test +
one call-site in `src/adapters/mcp/stdio.ts`.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 45–65 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception (not needed — well within budget) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | All fixes + tests | PR 1 (closes #63, #69) | ~45–65 lines, single commit |

---

## Phase 1: Type Signatures (Foundation)

- [x] 1.1 In `src/core/services/vba-sync-legacy-service.ts` add `timeoutMs: number` to `VbaManagerExecutionRequest` (line ~6 block).
- [x] 1.2 Add `timedOut: boolean` to `VbaManagerExecutionResult` (line ~17 block).
- [x] 1.3 Add `processTimeoutMs?: number` to `VbaSyncLegacyServiceOptions` (line ~26 block).
- [x] 1.4 Store `this.processTimeoutMs = options.processTimeoutMs ?? 30_000` in `VbaSyncLegacyService` constructor.

## Phase 2: Red — Failing Tests

- [x] 2.1 In `test/core/services/vba-sync-legacy-service.test.ts` add test **"timeout: executor that never exits resolves VBA_MANAGER_TIMEOUT"** — mock executor returns a promise that never resolves, set `processTimeoutMs: 50`, assert result is `failureResult` with code `VBA_MANAGER_TIMEOUT` and `retryable: true`. Run `pnpm test` — MUST be RED.
- [x] 2.2 Add test **"timeout: timedOut=true with exitCode=1 maps to VBA_MANAGER_TIMEOUT not VBA_MANAGER_FAILED"** — mock executor returns `{ timedOut: true, exitCode: 1, ... }`, assert error code is `VBA_MANAGER_TIMEOUT`. Run — MUST be RED.
- [x] 2.3 Add test **"-NonInteractive present in spawned args at correct position"** — capture args passed to executor mock, assert array includes `-NonInteractive` between `-NoProfile` and `-ExecutionPolicy`. Run — MUST be RED.

## Phase 3: Core Implementation (Green)

- [x] 3.1 In `executeMappedTool`: thread `timeoutMs: this.processTimeoutMs` into the `VbaManagerExecutionRequest` build (line ~100 block).
- [x] 3.2 In `executeMappedTool`: add `timedOut` branch BEFORE `exitCode !== 0` check — `if (result.timedOut) return failureResult(createDysflowError("VBA_MANAGER_TIMEOUT", \`${toolName} timed out after ${result.durationMs}ms\`, { retryable: true }), { durationMs: result.durationMs })`.
- [x] 3.3 In `spawnVbaManager`: change args array to `["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ...]` (insert after `-NoProfile`, before `-ExecutionPolicy`, line ~385).
- [x] 3.4 In `spawnVbaManager`: declare `let timedOut = false` before `spawn`. Add `const timer = setTimeout(() => { timedOut = true; child.kill(); }, request.timeoutMs)`. In the `close` handler, call `clearTimeout(timer)` BEFORE `resolve(...)`. Return `{ exitCode, stdout, stderr, durationMs, timedOut }`.

## Phase 4: Adapter Wiring

- [x] 4.1 In `src/adapters/mcp/stdio.ts` line ~148: change `new VbaSyncLegacyService()` to `new VbaSyncLegacyService({ processTimeoutMs: configResult.data.processTimeoutMs })`.

## Phase 5: Verification

- [x] 5.1 Run `pnpm test` — ALL tests must be GREEN (including 2.1, 2.2, 2.3 from Phase 2 and any pre-existing tests for success/exit-code paths).
- [x] 5.2 Manually verify no TypeScript errors: `pnpm tsc --noEmit`.
- [x] 5.3 Confirm spec scenarios covered: timeout fires (2.1), timedOut precedence (2.2), `-NonInteractive` position (2.3), success path regression guard (pre-existing test still GREEN).
