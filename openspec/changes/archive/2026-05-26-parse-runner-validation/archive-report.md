# Archive Report: parse-runner-validation

**Change**: parse-runner-validation
**Status**: CLOSED — Merged to main via PR #357
**Verdict**: PASS
**Completed**: 2026-05-26

## Executive Summary

Runtime shape validation for runner output in dysflow has been successfully implemented, tested, verified, and merged. GitHub issue #348 is resolved. All 13 tasks across Phases 1–4 are complete. Build, tests, and type-check all pass cleanly with zero regressions.

## Artifacts Integrated (Traceability)

| Artifact | ID | Topic Key | Status |
|----------|----|-----------|---------| 
| Proposal | #9335 | sdd/parse-runner-validation/proposal | Read |
| Spec (Delta) | #9336 | sdd/parse-runner-validation/spec | Read |
| Design | #9337 | sdd/parse-runner-validation/design | Read |
| Tasks | #9338 | sdd/parse-runner-validation/tasks | Read |
| Verify Report | #9357 | sdd/parse-runner-validation/verify-report | Read |

## Solution Summary

### Problem Identified (Issue #348)
`parseRunnerData<TData>()` in `src/core/runner/access-runner.ts` returned phantom casts (`{} as TData` and `JSON.parse(stdout) as TData`) with zero runtime validation. Malformed PowerShell payloads that were valid JSON but wrong shape passed silently into three service callers (diagnostics, query, vba), causing field-access failures downstream.

### Solution Implemented
Added post-`runner.run()` shape validation in each of the three service callers via a shared `ensureResultShape<TData>()` helper. Validation guards are colocated with each service's expected type:
- **diagnostics-service**: strict — `isRecord(data) && Array.isArray(data.checks)` (allows `checks === undefined` as per empty-stdout requirement)
- **query-service**: loose — `isRecord(data)` (catches non-object payloads; per-field validation deferred)
- **vba-service**: loose — `isRecord(data)` (same)

On shape mismatch, services return `failureResult(RUNNER_INVALID_OUTPUT)` while preserving `diagnostics`, `durationMs`, and `operation` metadata for caller visibility.

### Changes Deployed
| File | Change | LOC Impact |
|------|--------|-----------|
| src/core/runner/access-runner.ts | Added `RUNNER_INVALID_OUTPUT` const + `ensureResultShape<TData>()` helper | +21 |
| src/core/services/diagnostics-service.ts | Guard after `runner.run()`; import `ensureResultShape`, `isRecord` | +5 |
| src/core/services/query-service.ts | Guard after `runner.run()`; import `ensureResultShape`, `isRecord` | +5 |
| src/core/services/vba-service.ts | Guard after `runner.run()`; import `ensureResultShape`, `isRecord` | +5 |
| test/core/services/core-services.test.ts | 8 new tests: mismatch rejection + pass-through behavior | +88 |

**Total**: 5 files, 158 insertions / 11 deletions (~169 lines net). Within Low budget (forecast 120–160).

## Verification Evidence (from verify-report #9357)

### Test Results
```
pnpm test: 48 files passed, 584 passed | 3 skipped (587 total), 0 failures, ~3.1s
npx tsc --noEmit: TSC_EXIT=0 (zero type errors)
pnpm build: BUILD_EXIT=0 (clean)
```

### Spec Compliance (12 scenarios, all PASS)
- DiagnosticsService: valid output w/ checks array → PASS
- DiagnosticsService: missing/non-array checks → RUNNER_INVALID_OUTPUT → PASS
- DiagnosticsService: null/undefined result → RUNNER_INVALID_OUTPUT → PASS
- DiagnosticsService: empty stdout {} → accepted → PASS
- VbaService: valid record → PASS
- VbaService: non-object output → RUNNER_INVALID_OUTPUT → PASS
- VbaService: empty stdout {} → accepted → PASS
- QueryService: valid record → PASS
- QueryService: non-object output → RUNNER_INVALID_OUTPUT → PASS
- QueryService: empty stdout {} → accepted → PASS
- Error code `RUNNER_INVALID_OUTPUT` surfaced to caller → PASS
- Failure pass-through (RUNNER_TIMEOUT) without wrapping → PASS

### Task Completion
All 13 tasks marked complete and verified:
- Phase 1: 2 foundation tasks (error code + helper)
- Phase 2: 4 RED tests (rejects + pass-through)
- Phase 3: 3 GREEN service guards
- Phase 4: 4 verification tasks (tests, interface stability, deps, types)

### Design Coherence
All architecture decisions from design artifact matched implementation:
- Option B: validate in each service ✓
- Bare string const for error code ✓
- Shared `ensureResultShape` helper with per-service predicates ✓
- Preserve diagnostics/durationMs/operation on reject ✓
- Intentional deviation in diagnostics guard (`checks === undefined` allowed) documented and spec-compliant ✓

## Issues

### CRITICAL (0)
None.

### WARNING (0)
None.

### SUGGESTION (1)
Query/Vba guards use loose `isRecord()`, accepting any object including malformed payloads. Proposal/design explicitly accepted this tradeoff (catches the real failure: non-object payloads). No action required; noted for potential per-field hardening in future if stricter validation becomes valuable.

## Scope Closure

### In Scope ✓
- Post-`runner.run()` shape guards in three service callers
- New `RUNNER_INVALID_OUTPUT` error code
- One mismatch test per service
- Zero new npm dependencies

### Out of Scope (Deferred)
- Changing `AccessRunner` interface, `AccessPowerShellRunner`, or `parseRunnerData` signatures
- Adding validation library (Zod/ajv)
- Per-action deep validation of `AccessQueryResult`
- Empty-stdout `{} as TData` strictness

## Rollback

No special rollback needed. Revert the commit fully restores prior behavior — no interface, migration, or data changes. All three services have clear undo points.

## Dependencies Resolved

- None introduced; project remains zero-runtime-deps
- Reused existing `isRecord()` from `src/core/utils/index.ts`
- Reused existing `failureResult()` and `createDysflowError()` from core error handling

## Git State

- **PR**: #357 (merged to main)
- **GitHub Issue**: #348 (resolved)
- **Branch**: merged into main
- **Commit**: included in current HEAD

## Final Verdict

**PASS — ARCHIVED** 

The change is complete, verified, merged, and ready for production. All test suites pass cleanly with zero regressions. The runtime validation layer now prevents malformed runner outputs from propagating silently into service logic. The implementation fully matches proposal, spec, design, and task requirements.
