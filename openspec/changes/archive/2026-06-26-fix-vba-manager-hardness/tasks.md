# Tasks: Fix VBA Manager Hardness

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 150-250 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | exception-ok |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Preflight, Execution, and VBA Manager robust cleanups | PR 1 | Base main branch; tests included |

## Phase 1: Foundation

- [x] 1.1 Add VBE visibility toggle to `Get-ActiveVbeLocation` in [scripts/dysflow-vba-manager.ps1](file:///C:/Proyectos/dysflow/worktrees/bugfix/scripts/dysflow-vba-manager.ps1).
- [x] 1.2 Implement `.Saved = $false` dirty check and comment-aware syntax fallback parser in `Get-ActiveVbeLocation` in [scripts/dysflow-vba-manager.ps1](file:///C:/Proyectos/dysflow/worktrees/bugfix/scripts/dysflow-vba-manager.ps1).
- [x] 1.3 Add active process PID registration to `reconcileRunningRecord` in [src/core/operations/access-operation-preflight.ts](file:///C:/Proyectos/dysflow/worktrees/bugfix/src/core/operations/access-operation-preflight.ts).
- [x] 1.4 Strip leading BOMs, whitespace, and markdown fences in `validateTestProceduresJson` in [src/adapters/vba-sync/vba-execution-adapter.ts](file:///C:/Proyectos/dysflow/worktrees/bugfix/src/adapters/vba-sync/vba-execution-adapter.ts).

## Phase 2: Core Implementation

- [x] 2.1 Implement post-deletion active-lock check in `Remove-AccessObjectOrComponent` in [scripts/dysflow-vba-manager.ps1](file:///C:/Proyectos/dysflow/worktrees/bugfix/scripts/dysflow-vba-manager.ps1).
- [x] 2.2 Add parameterless procedure guard in `Invoke-AccessProcedure` in [scripts/dysflow-vba-manager.ps1](file:///C:/Proyectos/dysflow/worktrees/bugfix/scripts/dysflow-vba-manager.ps1).
- [x] 2.3 Update inline execution to use stable `__dysflow_inline__` module, add compile step, and clean up in [src/adapters/vba-sync/vba-execution-adapter.ts](file:///C:/Proyectos/dysflow/worktrees/bugfix/src/adapters/vba-sync/vba-execution-adapter.ts).
- [x] 2.4 Update catch block in `executeMappedTool` to run timeout reap cleanup in [src/adapters/vba-sync/vba-sync-adapter.ts](file:///C:/Proyectos/dysflow/worktrees/bugfix/src/adapters/vba-sync/vba-sync-adapter.ts).
- [x] 2.5 Terminate headless unowned processes matching `accessPath` in `retireUnownedRecord` in [src/core/operations/access-operation-preflight.ts](file:///C:/Proyectos/dysflow/worktrees/bugfix/src/core/operations/access-operation-preflight.ts).
- [x] 2.6 Purge headless unowned processes in `scanAndCleanOrphans` in [src/core/operations/access-operation-preflight.ts](file:///C:/Proyectos/dysflow/worktrees/bugfix/src/core/operations/access-operation-preflight.ts).

## Phase 3: Testing

- [x] 3.1 Write unit tests for JSON parser sanitization (BOM, blocks) in `test/adapters/vba-execution-adapter.test.ts`.
- [x] 3.2 Write integration tests for active-lock deletion and parameterless run COM behavior.
- [x] 3.3 Verify process preflight cleanup with mock process listings ensuring headless matching processes are reaped.
