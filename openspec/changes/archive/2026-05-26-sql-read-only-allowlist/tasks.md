# Tasks: SQL Read-Only Allowlist (heuristic guard) — issue #349

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~30–50 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Red tests → green impl → rename | PR 1 to main | All changes in one atomic commit set |

---

## Phase 1: Red Tests (TDD — write failing tests first)

- [ ] 1.1 In `test/adapters/http/server.test.ts` — remove `"SELECT * FROM People DROP TABLE People"` from the `it.each` rejection array (lines ~227–232) so the suite no longer asserts a 400 for that input.
- [ ] 1.2 In `test/adapters/http/server.test.ts` — add a new standalone `it` test asserting that `POST /query/read` with `"SELECT * FROM People DROP TABLE People"` returns 200 and `services.calls.queries` has length 1. Include an inline comment: `// heuristic limit: writesEnabled is the authoritative write gate`.
- [ ] 1.3 Run `vitest run test/adapters/http/server.test.ts` — confirm the new acceptance test FAILS (red) because `isReadOnlySql` still has the 10-keyword denylist that rejects `DROP`.

## Phase 2: Core Implementation (make tests green)

- [ ] 2.1 In `src/adapters/http/server.ts` around L223 — rename function declaration `isReadOnlySql` → `looksLikeReadOnlySql`.
- [ ] 2.2 In `src/adapters/http/server.ts` around L159 — update the call site from `isReadOnlySql(sql)` → `looksLikeReadOnlySql(sql)`.
- [ ] 2.3 In `src/adapters/http/server.ts` — remove the 10-keyword denylist regex (`alter|create|delete|drop|exec|execute|insert|parameters|transform|update`), keeping ONLY the `\binto\b` check already present on the line above it. The return expression must be: `firstToken === "select" && !/\binto\b/.test(tokenized)`.
- [ ] 2.4 In `src/adapters/http/server.ts` — add a JSDoc block immediately above the function declaration documenting: (a) it is a heuristic guard, not a security boundary; (b) `writesEnabled` is the authoritative write gate.

## Phase 3: Verify & Cleanup

- [ ] 3.1 Run `vitest run test/adapters/http/server.test.ts` — all tests must be green. Verify: existing rejections for `UPDATE`, `WITH...DELETE`, `EXEC`, `selection FROM`, `SELECT * INTO`, and multi-statement still return 400; new acceptance test returns 200.
- [ ] 3.2 Run `rg "isReadOnlySql" src/` — must return zero results.
- [ ] 3.3 Run full suite (`vitest run`) — confirm no regressions outside the HTTP adapter.
