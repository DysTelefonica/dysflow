# Archive Report: sql-read-only-allowlist

**Change**: sql-read-only-allowlist (issue #349)  
**Verdict**: PASS  
**Date Archived**: 2026-05-26  
**Status**: Closed and archived

## Executive Summary
The SQL read-only allowlist heuristic guard change has been fully implemented, verified, and is ready for production. All 10 tasks completed with TDD discipline, spec verified, and PR #358 merged to main. Issue #349 closed.

## Implementation Details
- **PR Merged**: #358 (merged to main)
- **Issue Closed**: #349
- **Delivery**: Single PR, stacked-to-main
- **Lines Changed**: ~30–50 (low-risk, under 400-line budget)
- **Verdict**: PASS (0 CRITICAL, 0 WARNING, 1 SUGGESTION)

## Artifact Traceability
All SDD artifacts recorded with observation IDs for future recovery:

| Artifact | Topic Key | Observation ID | Created |
|----------|-----------|----------------|---------|
| Proposal | sdd/sql-read-only-allowlist/proposal | #9369 | 2026-05-26 06:20:36 |
| Spec | sdd/sql-read-only-allowlist/spec | #9370 | 2026-05-26 06:22:04 |
| Design | sdd/sql-read-only-allowlist/design | #9372 | 2026-05-26 06:22:13 |
| Tasks | sdd/sql-read-only-allowlist/tasks | #9374 | 2026-05-26 06:23:44 |
| Verify Report | sdd/sql-read-only-allowlist/verify-report | #9381 | 2026-05-26 06:27:44 |

## Change Summary
Renamed `isReadOnlySql()` → `looksLikeReadOnlySql()`, converted 11-keyword denylist to allowlist with ONLY `\binto\b` denial, and added JSDoc documenting heuristic nature and `writesEnabled` as the authoritative security boundary. One test expectation flipped: `SELECT * FROM People DROP TABLE People` now correctly passes the heuristic (no semicolon separator, first token select, no into) and returns 200. Real write safety is `writesEnabled=false`, not the heuristic gate.

## Files Modified
- `src/adapters/http/server.ts`: function rename, denylist → into-only, JSDoc
- `test/adapters/http/server.test.ts`: updated test expectations

## Verification Evidence
- Pnpm test: 584 passed, 0 failed
- TypeScript: clean (tsc --noEmit passed)
- All 10 tasks confirmed against code state
- Spec scenarios: 11/11 passing
- No `isReadOnlySql` in src/
- Design decisions coherent with implementation

## Risks Addressed
- Looser gate with looser name (`looksLike` + JSDoc) signals heuristic intent
- `writesEnabled=false` is the real security boundary, documented
- `SELECT INTO` still rejected (retained `\binto\b`)
- No new npm dependencies

## Rollback Capability
Single-file logic change, no migrations, no schema changes. Rollback = revert commit and re-run test suite.

## Conclusion
Change is complete, tested, verified, and ready for production. All SDD artifacts are archived in engram with full traceability via observation IDs.
