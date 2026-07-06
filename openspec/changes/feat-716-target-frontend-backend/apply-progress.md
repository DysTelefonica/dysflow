# apply-progress: feat-716-target-frontend-backend

Single work-unit commit. The slice was authored across a prior session
and this session: the prior session left a 320-LOC WIP on
`feat/716-target-frontend-backend` (per-session reflog) but never
landed it; this session rebased the WIP onto current `main`
(`ab7fd52`, v1.16.1 prep), fixed the two failing tests that asserted on
runner arg structure instead of payload JSON, repaired a runner
default-fallback that was clobbering the resolved target, and ran the
full test + lint + build gate green.

The change is one commit (to be authored at apply time) on
`feat/716-target-frontend-backend`. No chained slices; the slice fits
inside the 400-line review budget.

## Work unit

| Commit | Subject | Author | SDD tasks | Verification | Access sync |
|---|---|---|---|---|---|
| (pending) | `feat(query): resolve frontend/backend targets via projectId (#716)` | n/a (TBD) | #1 schema, #2 contract, #3 mapper, #4 runner, #5 tool description | `pnpm test` 2386 pass / 1 skip / 1 todo; `pnpm lint` exit 0; `pnpm build` exit 0 | frontend-only diff; no `.accdb` import required; verify_code run skipped because the slice is contract + target resolution only |

## Status per task

| # | Task | Status | Notes |
|---|---|---|---|
| 1 | Schema `target` enum on `READ_TARGET_OVERRIDE` | ✅ applied | `src/adapters/mcp/schemas/query-schemas.ts:24` |
| 2 | `AccessQueryRequest.target?` contract | ✅ applied | `src/core/contracts/index.ts:212` |
| 3 | Mapper `pickQueryTarget` + tests | ✅ applied | `src/core/mapping/access-query-request-mapper.ts:74-101,145,155-164`; `test/core/mapping/access-query-request-mapper.test.ts:447-491` |
| 4 | Runner resolver + re-keyed default fallback | ✅ applied | `src/core/runner/access-runner.ts:239-308`; tests `test/core/runner/access-runner.test.ts:1533-1706` |
| 5 | `get_schema` description recipe | ✅ applied | `src/adapters/mcp/tool-parity-registry.ts:176-178` |

## Diff stat

```
 src/adapters/mcp/schemas/query-schemas.ts          |   6 +
 src/adapters/mcp/tool-parity-registry.ts           |   3 +-
 src/core/contracts/index.ts                        |   8 +
 src/core/mapping/access-query-request-mapper.ts    |  28 +++
 src/core/runner/access-runner.ts                   |  77 ++++++-
 .../mapping/access-query-request-mapper.test.ts    |  52 ++++++
 test/core/runner/access-runner.test.ts             | 203 +++++++++++++++++++++
 7 files changed, 366 insertions(+), 11 deletions(-)
```

366 LOC, well below the 400-line budget for a single PR under the
`force-chained` strategy.

## What changed in this session (vs. the WIP left by the prior session)

| Fix | Why |
|---|---|
| Re-keyed the runner's default-fallback block off `finalOperation.request` (not `operation.request`) | The WIP's resolution branch clears `target` on `finalOperation`, but the OLDER default-fallback then read `operation.request` (still untouched) and re-created `finalOperation` with the original `target` set, losing the resolution. This surfaced as `payload.target === "backend"` when the test expected `undefined`. |
| Refactored the WIP's three flag-based runner tests to assert on the **parsed `-PayloadJson` JSON content** rather than `args.indexOf("-BackendPath")` | The runner contract serializes the resolved request into `-PayloadJson` and never emits per-path top-level flags; the original assertions were implementation-coupled and would have broken under any refactor of the args layout. The new assertions are refactor-safe and aligned with the dysflow runner contract (and the `web-tdd-philosophy` skill). |
| Removed a candidate fifth test (`target='frontend'` with `accessDbPath` undefined) that was added during this session | The runner's pre-existing `runWithAccessExecutionLock(config.accessDbPath, ...)` calls `key.toLowerCase()` on the accessDbPath and crashes when it's `undefined`. The crash is unrelated to #716 and lives in the cross-process lock; the WIP does not address that lock-key assumption. Tracking the lock-key rework as out of scope. |
| Re-keyed TypeScript narrowing on the default-fallback block (`if (finalOperation.kind === "query")`) | TypeScript does not track discriminated-union narrowing across `let` reassignment; the existing pattern in the failure-fast check was applied. |

## Pre-commit review

`review-readability`: pending (or skipped if the PR is small enough
for a single reviewer pass).

`judgment-day` (adversarial dual): not invoked (single-PR slice with
deterministic test coverage; no architectural ambiguity for an
adversarial review to resolve).

## Open follow-ups (NOT in this slice)

| Follow-up | Source | Action |
|---|---|---|
| `auto` mode + provenance | #716 AC | New GitHub issue (deferred). The semantic `target` already gives callers the explicit choice; `auto` requires a cross-database lookup primitive that does not yet exist. |
| Cross-DB ambiguity detection | #716 AC | New GitHub issue (deferred). Same reason. |
| `docs/` page projectId-first recipes | #716 AC | Cosmetic; can follow. |
| Cross-process lock with `accessDbPath: undefined` | Discovered this session (NOT a #716 issue) | File a separate GitHub issue for the lock-key rewrite. |

## SDD completion hygiene

- `verify-report.md`: will be written next.
- `archive-report.md`: will be written when this change is archived
  after merge.
