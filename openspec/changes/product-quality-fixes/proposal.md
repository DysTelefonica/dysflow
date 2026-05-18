# Proposal: Product Quality Fixes (v0.4.4 audit)

## Intent

The v0.4.4 product audit produced 8 fixable defects (GH #172-#179) spanning correctness bugs, agent-facing UX, adapter divergence, and a missing CI quality gate. Each is small in isolation, but together they erode trust: false cleanup mismatches, broken read-only SQL guard, dead MCP tools, divergent registries, untyped schemas, no coverage floor, and unnecessary lock contention. Ship them as one curated batch so the next release is materially cleaner.

## Scope

### In Scope
- #172 Convert WMI `CreationDate` to ISO inside `WindowsMsAccessProcessInspector` so the cleanup comparator stops emitting `CLEANUP_PROCESS_START_TIME_MISMATCH` against ISO-stored values
- #173 Fix `isReadOnlySql` to accept Jet SQL containing `;` inside string literals / subqueries (token-aware check, not raw substring)
- #174 Repair the e2e fixture assertion shape (`rows` is `readonly Record<string, unknown>[]`, not an object)
- #175 Stop advertising the 5 unimplemented legacy tools in `tools/list` until they are real
- #176 Make the HTTP adapter share the same `FileAccessOperationRegistry` instance/wiring used by MCP so `/access/operations` reflects MCP state
- #177 Replace the 60-property catch-all `legacySchemaForTool` with per-tool input schemas
- #178 Set real coverage thresholds in `vitest.config.ts` and assert numeric floors in the quality-gate test
- #179 Add a read path to `FileAccessOperationRegistry` that does not take the mutation lock (read snapshot, no `withFileLock`)

### Out of Scope
- #180 Spawner unification (Windows/POSIX) - separate architecture change
- #181 Async configuration loader migration - cross-cutting refactor
- #182 Windows CI runner adoption - infra change
- #183 Install script hash verification - distinct security change
- New legacy tool implementations (#175 only HIDES the stubs; implementing them is its own proposal)

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `access-core-services`: WMI inspector MUST emit ISO start times so cleanup comparator no longer reports false mismatches
- `http-api-adapter`: `/query/read` guard MUST accept valid read-only SQL containing semicolons in string literals/subqueries; HTTP adapter MUST share the persistent operation registry with MCP
- `mcp-stdio-adapter`: `tools/list` MUST NOT expose tools that always return `LEGACY_TOOL_NOT_IMPLEMENTED`; each legacy tool MUST expose its own typed input schema
- `registry-concurrency-safety`: `FileAccessOperationRegistry.get` MUST NOT block on the mutation lock
- `repo-quality-gates`: coverage thresholds MUST be non-zero and the quality-gate test MUST assert numeric floors

## Approach

Each fix is small and localised. Group them by file to keep diffs reviewable:

| # | Approach |
|---|----------|
| 172 | Parse `CreationDate` (WMI/CIM string `YYYYMMDDhhmmss.ffffff+ooo`) into `Date` and emit `.toISOString()`. Unit-test the parser. |
| 173 | Tokenize the normalized SQL (strip strings/comments first), then reject only top-level `;` followed by another statement; allow trailing `;`. |
| 174 | Re-type the assertion to `rows[0]` and remove the `skipIf` gate that hid the type error. |
| 175 | Filter the unimplemented set out of the `tools/list` projection (keep handlers so re-enabling is one-line). |
| 176 | Lift registry construction into the composition root and inject the same instance into both HTTP and MCP adapters; HTTP stops calling `getDefaultAccessOperationRegistry()`. |
| 177 | Replace `legacySchemaForTool` with a per-tool map keyed by tool name; each entry is a minimal JSON Schema derived from the handler's actual inputs. |
| 178 | Pick conservative initial floors from current measured coverage (lines/functions/branches/statements), set them in `vitest.config.ts`, and assert exact numbers in the quality-gate test. |
| 179 | Split `get` to read the snapshot directly (debounced read of the registry file) without taking `withFileLock`; mutations keep the lock. |

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/operations/windows-processes.ts` | Modified | ISO conversion of WMI start time (#172) |
| `src/adapters/http/server.ts` | Modified | Smarter `isReadOnlySql` + shared registry wiring (#173, #176) |
| `src/adapters/mcp/tools.ts` | Modified | Hide unimplemented tools + per-tool schemas (#175, #177) |
| `src/core/services/vba-sync-legacy-service.ts` | Touched | Keep handler stubs for hidden tools (#175) |
| `src/core/operations/access-operation-registry.ts` | Modified | Lock-free `get` read path (#179) |
| `vitest.config.ts` + `test/quality-gates/ci-workflow.test.ts` | Modified | Real coverage floors + assertions (#178) |
| `test/e2e/access-fixture.e2e.test.ts` | Modified | Fixture row-shape assertion (#174) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Per-tool schemas (#177) drift from handler reality | Med | Derive schemas from a single source of truth; add a contract test that round-trips schema -> handler example payload |
| Coverage floors (#178) too strict and block CI | Med | Calibrate from current coverage minus a small buffer; raise in follow-ups |
| Shared registry wiring (#176) changes startup order | Low | Keep `getDefaultAccessOperationRegistry()` as fallback for tests; cover with an integration test asserting same instance |
| WMI date parsing (#172) on locales/timezones | Low | Use the CIM datetime spec parser; unit-test edge cases (DST, negative offset, fractional) |
| Lock-free `get` (#179) sees torn writes | Low | Reads operate on the already-debounced snapshot; mutations still serialise through `withFileLock` |

## Rollback Plan

Each fix lives in 1-2 files and ships as its own commit (work-unit-commits). Rollback is per-commit `git revert`. The coverage-floor commit (#178) is the only one that can break CI on revert direction; setting thresholds back to 0 restores green.

## Dependencies

- None. All work is internal; no new prod deps (zero-prod-dep invariant preserved).

## Delivery

Estimated changed lines: ~350-450 total across 6-7 files, dominated by #177 (per-tool schemas, ~150-200 lines) and #178 (threshold calibration + assertions, ~60 lines).

**Recommendation**: borderline for the 400-line guard. Plan as **two chained PRs**:
- PR1 (correctness): #172, #173, #174, #179 - small surgical bug fixes, ~120 lines
- PR2 (MCP + gates): #175, #176, #177, #178 - schema work and quality gates, ~250-330 lines

If `sdd-tasks` measures the actual diff under 400 lines, collapse to a single PR.

## Success Criteria

- [ ] `pnpm test` green with new coverage thresholds enforced
- [ ] `tools/list` no longer advertises the 5 unimplemented legacy tools
- [ ] `GET /access/operations` returns the same records as MCP-created operations
- [ ] No `CLEANUP_PROCESS_START_TIME_MISMATCH` from ISO/WMI shape difference
- [ ] `/query/read` accepts valid Jet SQL with quoted semicolons; still rejects writes
- [ ] `FileAccessOperationRegistry.get` benchmarks show no contention with concurrent monitoring
- [ ] Each per-tool schema validates a known-good example payload for its tool
