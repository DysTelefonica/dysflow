# Tasks: verify-code-ergonomics (v2.4.0)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 200-350 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr-default |
| Chain strategy | N/A |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Phase 1: Type-level Additive Scaffolding

- [ ] 1.1 **Add `classification`/`reason` to `VbaSourceComparisonEntry`** — extend the type in `src/core/services/vba-source-comparison.ts` with two optional fields: `classification?: VbaSemanticCategory` and `reason?: string`. No existing field changed.

- [ ] 1.2 **Add `SummaryStructured` type export** — define next to `VbaSourceComparisonEntry` with nested `actionable` and `nonActionable` buckets and top-level `matched`, `different`, `missingInSource`, `missingInBinary`.

- [ ] 1.3 **Extend `VbaVerifyResult`** — add five optional fields: `summaryStructured?: SummaryStructured`, `bulkImportable?: readonly string[]`, `bulkImportableCount?: number`, `bulkExportable?: readonly string[]`, `bulkExportableCount?: number`.

**Work-unit**: `feat(types): add classification/reason to VbaSourceComparisonEntry and extend VbaVerifyResult for bulk fields`
**Files**: `src/core/services/vba-source-comparison.ts`
**Dependencies**: none
**Start**: Types absent
**Finish**: All three type extensions present; existing types byte-identical
**Verify**: `pnpm exec tsc --noEmit` (type-check only)
**Rollback**: `git checkout HEAD -- src/core/services/vba-source-comparison.ts`
**TDD step**: no-op (types; RED atoms are in the test file already)
**Spec requirement**: A (type scaffolding)

## Phase 2: Core Implementation

- [ ] 2.1 **Attach `classification`/`reason` to actionableDifferent and nonActionableDifferent** — at the two push sites in the main diff loop (lines 643-647 in `vba-source-comparison.ts`), attach `{ ...entry, classification: classification.classification, reason: classification.reason }` before pushing. Symmetric for both buckets.

**Work-unit**: `feat(vba-verify): attach classification+reason to both actionable and nonActionable entries in diff loop`
**Files**: `src/core/services/vba-source-comparison.ts`
**Dependencies**: 1.1, 1.3
**Start**: Push sites push bare entries
**Finish**: Both push sites spread `classification`/`reason`; entries in both arrays carry those fields
**Verify**: `pnpm exec vitest run test/core/services/vba-source-comparison.test.ts:1916` (REQ-2 happy)
**Rollback**: `git checkout HEAD~1 -- src/core/services/vba-source-comparison.ts`
**TDD step**: RED (:1916, :1940) already written → GREEN when spread pattern applied
**Spec requirement**: C (REQ-2)

- [ ] 2.2 **Compute `summaryStructured`** — after the main diff loop, project `semanticSummary` + array lengths into the `SummaryStructured` shape. `actionable.total = sourceNewer + binaryNewer + bothChanged`; `nonActionable.total = sum of five buckets`. Include in the semantic-mode return spread.

**Work-unit**: `feat(vba-verify): emit summaryStructured alongside flat summary in semantic mode`
**Files**: `src/core/services/vba-source-comparison.ts`
**Dependencies**: 1.2, 2.1
**Start**: `summaryStructured` absent from return
**Finish**: `summaryStructured` computed and spread in semantic-mode return; cross-check invariant in dev mode
**Verify**: `pnpm exec vitest run test/core/services/vba-source-comparison.test.ts:1814` (REQ-1 happy)
**Rollback**: `git checkout HEAD~1 -- src/core/services/vba-source-comparison.ts`
**TDD step**: RED (:1814, :1885) already written → GREEN when projection is in the spread
**Spec requirement**: B (REQ-1)

- [ ] 2.3 **Add `deriveBulkLists` and emit bulk fields** — add `deriveBulkLists(actionableDifferent, missingInBinary, missingInSource)` as a pure sibling of `aggregateRecommendation`. `Set`-based dedup, lexicographic sort, `bothChanged` excluded from both. Include four bulk fields in the semantic-mode return spread.

**Work-unit**: `feat(vba-verify): add deriveBulkLists and emit bulkImportable/bulkExportable fields`
**Files**: `src/core/services/vba-source-comparison.ts`
**Dependencies**: 2.1
**Start**: `bulkImportable`/`bulkExportable` absent from return
**Finish**: `deriveBulkLists` exists; four bulk fields spread in semantic-mode return
**Verify**: `pnpm exec vitest run test/core/services/vba-source-comparison.test.ts:1967` (REQ-3 happy)
**Rollback**: `git checkout HEAD~1 -- src/core/services/vba-source-comparison.ts`
**TDD step**: RED (:1967, :2007, :2029) already written → GREEN when deriveBulkLists + spread added
**Spec requirement**: D (REQ-3)

- [ ] 2.4 **Verify all 9 RED atoms turn GREEN** — run the full unit suite; all new atoms at lines 1811-2127 pass; all 30+ pre-existing tests keep passing.

**Work-unit**: `test(vba-verify): verify all 9 additive-field atoms pass and pre-existing suite is clean`
**Files**: `src/core/services/vba-source-comparison.ts`
**Dependencies**: 2.1, 2.2, 2.3
**Start**: 9 RED atoms in test file
**Finish**: All 9 GREEN; full suite passes
**Verify**: `pnpm test`
**Rollback**: `git checkout HEAD~1 -- src/core/services/vba-source-comparison.ts`
**TDD step**: full suite green
**Spec requirement**: B, C, D

## Phase 3: MCP Surface & Docs

- [ ] 3.1 **Add comment above `verify_code` schema** — in `src/adapters/mcp/schemas/vba-sync-schemas.ts:163`, add a one-line comment above the `verify_code` entry noting the new output fields. DO NOT touch `properties` block or `additionalProperties:false`.

**Work-unit**: `docs(mcp): annotate verify_code schema with new additive output fields`
**Files**: `src/adapters/mcp/schemas/vba-sync-schemas.ts`
**Dependencies**: 2.2, 2.3
**Start**: No comment above verify_code schema
**Finish**: Comment present; input schema unchanged
**Verify**: `pnpm build` succeeds
**Rollback**: `git checkout HEAD -- src/adapters/mcp/schemas/vba-sync-schemas.ts`
**Spec requirement**: E

- [ ] 3.2 **Append sentence to `verify_code` tool description** — in `src/adapters/mcp/tool-parity-registry.ts:132-133`, append one sentence describing the new output fields and noting `bulkImportable` is a drop-in for `import_modules({ moduleNames: bulkImportable })`. Dispatch route unchanged.

**Work-unit**: `docs(mcp): document bulkImportable drop-in shape in verify_code description`
**Files**: `src/adapters/mcp/tool-parity-registry.ts`
**Dependencies**: 2.3
**Start**: Tool description ends at existing text
**Finish**: One new sentence appended; dispatch route unchanged
**Verify**: `pnpm build` succeeds
**Rollback**: `git checkout HEAD -- src/adapters/mcp/tool-parity-registry.ts`
**Spec requirement**: E

- [ ] 3.3 **Add `verify_code → bulkImportable → import_modules` example** — in `docs/mcp-examples.md`, add a new section showing the full flow with concrete JSON payloads. Place after the existing `verify_code` sections.

**Work-unit**: `docs(examples): add verify_code bulkImportable import_modules example to mcp-examples`
**Files**: `docs/mcp-examples.md`
**Dependencies**: 2.3
**Start**: No bulkImportable example
**Finish**: New section present with working JSON shape
**Verify**: `pnpm build` succeeds
**Rollback**: `git checkout HEAD -- docs/mcp-examples.md`
**Spec requirement**: F

## Phase 4: Version & Release

- [ ] 4.1 **Bump `package.json` to `2.4.0`** — change `"version"` field from `"2.3.1"` to `"2.4.0"`. Atomic with changelog entry (single commit with both).

**Work-unit**: `release(v2.4.0): bump version to 2.4.0`
**Files**: `package.json`
**Dependencies**: 2.4 (tests green)
**Start**: `version: "2.3.1"`
**Finish**: `version: "2.4.0"`
**Verify**: `node -e "console.log(require('./package.json').version)"` → `2.4.0`
**Rollback**: `git checkout HEAD -- package.json`
**Risk note**: Atomic with CHANGELOG entry — never one without the other
**Spec requirement**: F

- [ ] 4.2 **Add `v2.4.0` entry to `CHANGELOG.md`** — prepend the new release block naming the three enhancements: `summaryStructured`, per-entry `classification`/`reason`, `bulkImportable`/`bulkExportable`. Follow existing entry format.

**Work-unit**: `release(v2.4.0): add CHANGELOG entry for verify-code-ergonomics`
**Files**: `CHANGELOG.md`
**Dependencies**: 4.1
**Start**: Latest entry is v2.3.1
**Finish**: New `[v2.4.0]` entry at top with three enhancement bullets
**Verify**: `git diff HEAD CHANGELOG.md` shows new block
**Rollback**: `git checkout HEAD -- CHANGELOG.md`
**Spec requirement**: F

## Phase 5: Pre-Merge Verification

- [ ] 5.1 **Run `pnpm build`** — full TypeScript compile must succeed.

**Work-unit**: `build: confirm pnpm build succeeds`
**Files**: `src/`
**Dependencies**: all implementation tasks
**Start**: Source compiled to previous version
**Finish**: `pnpm build` exits 0 with no errors
**Verify**: `pnpm build`
**Rollback**: revert implementation commits
**Spec requirement**: none

- [ ] 5.2 **Run `pnpm test` — full unit suite** — all tests pass including the 9 new atoms.

**Work-unit**: `test: full unit suite green`
**Files**: `test/`
**Dependencies**: 5.1
**Start**: Suite run with new atoms RED or pre-existing broken
**Finish**: Suite exits 0; all 9 atoms GREEN; no regressions
**Verify**: `pnpm test`
**Rollback**: revert implementation commits
**Spec requirement**: G

- [ ] 5.3 **Round 4 coordination check** — before opening the PR, confirm `git log origin/main` shows the round 4 release (v2.3.2) on `main`. If round 4 has not yet shipped, hold this PR until round 4 is on `main`. This is a human-verified step.

**Work-unit**: `chore: confirm round 4 shipped on main before opening PR`
**Files**: none
**Dependencies**: 5.2
**Start**: Unverified ordering
**Finish**: Confirmed round 4 v2.3.2 is on `main`; PR ready to open
**Verify**: `git log origin/main --oneline | head -5` (human)
**Rollback**: N/A (human gate)
**Spec requirement**: G
**Risk note**: Human must verify — cannot be automated by the agent

- [ ] 5.4 **Reindex CodeGraph** — run `codegraph index C:\Proyectos\dysflow-r5` so the index reflects the new type exports and function signatures. Small, fast.

**Work-unit**: `chore: reindex codegraph after implementation`
**Files**: `.codegraph/`
**Dependencies**: 5.2
**Start**: Index stale from before new fields
**Finish**: Index updated with new types and exports
**Verify**: `codegraph index C:\Proyectos\dysflow-r5` exits 0
**Rollback**: N/A (index refreshed, not removed)
**Spec requirement**: I

## Phase 6: E2E (Non-Gating, Separate Commit in Same PR)

- [ ] 6.1 **Add E2E test: `verify_code → bulkImportable → import_modules`** — in `E2E_testing/mcp-e2e.mjs`, add a new test case that exercises the full consumer-real flow: call `verify_code` on a multi-module scenario, read `bulkImportable`, pass it to `import_modules`. Mark as a separate task; may be deferred if real Access not available.

**Work-unit**: `test(e2e): add verify_code bulkImportable import_modules flow test`
**Files**: `E2E_testing/mcp-e2e.mjs`
**Dependencies**: 5.2
**Start**: No E2E coverage for bulkImportable flow
**Finish**: New E2E test present; shippable without it (deferral allowed)
**Verify**: `node E2E_testing/mcp-e2e.mjs` (requires Access; skip if unavailable)
**Rollback**: `git checkout HEAD -- E2E_testing/mcp-e2e.mjs`
**Risk note**: Non-gating for unit PR; may be deferred if no real Access
**Spec requirement**: H
