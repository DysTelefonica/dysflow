# Tasks: MCP Hardening and Parity Improvements

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~120 total |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: Yes
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | MCP Hardening fixes | PR 1 | All four fixes in a single PR under size exception |

## Phase 1: Red Tests

- [x] 1.1 In [vba-execution-adapter.test.ts](file:///C:/Proyectos/dysflow/test/adapters/vba-sync/vba-execution-adapter.test.ts), write failing tests asserting inline snippet validation blocks keywords (`Declare`, `Shell`, `CreateObject`, `GetObject`, `Lib`) case-insensitively while allowing concatenated words like `MyLib`.
- [x] 1.2 In [vba-modules-adapter.test.ts](file:///C:/Proyectos/dysflow/test/adapters/vba-sync/vba-modules-adapter.test.ts), write failing tests asserting `import_modules` and `import_all` default to `dryRun: true` when parameters are omitted.
- [x] 1.3 In [stdio-size-guard.test.ts](file:///C:/Proyectos/dysflow/test/adapters/mcp/stdio-size-guard.test.ts), write a failing test verifying that `SizeLimitTransform` is immediately destroyed via `this.destroy()` and emits `close` on size limit violation.
- [x] 1.4 In [access-orphan-cleanup.test.ts](file:///C:/Proyectos/dysflow/test/core/operations/access-orphan-cleanup.test.ts), write a failing test verifying `listOrphans` returns `PROCESS_SCAN_FAILED` as an `OperationResult` instead of empty arrays upon scanner errors.

## Phase 2: Green Implementation

- [x] 2.1 In [vba-execution-adapter.ts](file:///C:/Proyectos/dysflow/src/adapters/vba-sync/vba-execution-adapter.ts), implement blocklist regex validation `/\b(Declare|Shell|CreateObject|GetObject|Lib)\b/i` on inline snippets in `executeInline`. Return `INVALID_INPUT` on match.
- [x] 2.2 In [vba-modules-adapter.ts](file:///C:/Proyectos/dysflow/src/adapters/vba-sync/vba-modules-adapter.ts), resolve dryRun for `import_modules` and `import_all` using `params.apply === true ? false : params.dryRun !== false`.
- [x] 2.3 In [vba-form-service.ts](file:///C:/Proyectos/dysflow/src/core/services/vba-form-service.ts), resolve dryRun for `generateForm` with the same logic: `params.apply === true ? false : params.dryRun !== false`.
- [x] 2.4 In [stdio-size-guard.ts](file:///C:/Proyectos/dysflow/src/adapters/mcp/stdio-size-guard.ts), call `this.destroy()` immediately after writing the size-limit violation error frame inside `emitSizeError`.
- [x] 2.5 In [access-orphan-cleanup.ts](file:///C:/Proyectos/dysflow/src/core/operations/access-orphan-cleanup.ts), change `listOrphans` to return `Promise<OperationResult<AccessOrphanCandidate[]>>`. Return failureResult with `PROCESS_SCAN_FAILED` on scan error, or wrap candidates in successResult.
- [x] 2.6 Update signatures/types and logic in [result-translation.ts](file:///C:/Proyectos/dysflow/src/adapters/mcp/result-translation.ts), [stdio.ts](file:///C:/Proyectos/dysflow/src/adapters/mcp/stdio.ts), and [canonical-handlers.ts](file:///C:/Proyectos/dysflow/src/adapters/mcp/canonical-handlers.ts) to propagate the new `OperationResult` instead of manually wrapping or catching.

## Phase 3: Refactor/Verification

- [x] 3.1 Verify clean compilation by running `pnpm build`.
- [x] 3.2 Run the unit test suite via `pnpm test` and verify that all tests pass.
- [x] 3.3 Ensure code compliance and clean formatting by running `pnpm run lint` or `biome check`.

## Phase 4: Cleanup/Documentation

- [x] 4.1 Remove any unused imports, console statement residuals, or debug logging introduced during the changes.
- [x] 4.2 Commit all changes under conventional commits and record completion state in active artifact store.

