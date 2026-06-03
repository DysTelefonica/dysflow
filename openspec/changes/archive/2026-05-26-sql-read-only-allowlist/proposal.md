# Proposal: SQL Read-Only Allowlist (heuristic guard)

## Intent

The `/query/read` route gate is named `isReadOnlySql()`, implying certainty, but it is a fragile denylist of 11 SQL keywords (`alter`, `create`, `delete`, `drop`, `exec`, `execute`, `insert`, `into`, `parameters`, `transform`, `update`). Denylists are unbounded — every new write verb is a silent gap. The real safety boundary is `writesEnabled` (the `/query/write` and `/vba/execute` routes already reject when writes are off). Issue #349 asks to flip this to an allowlist and stop pretending the check is authoritative.

## Scope

### In Scope
- Rename `isReadOnlySql()` → `looksLikeReadOnlySql()` at definition (lines 223-251) and the only call site (line 159) in `src/adapters/http/server.ts`.
- Keep current structure: strip comments → strip string literals → split on `;` → require exactly one statement → first token MUST be `select`.
- Reduce denylist to a single entry: `\binto\b` (Access `SELECT INTO` is a real write).
- Remove the other 10 denylist keywords.
- Add JSDoc stating it is a HEURISTIC guard; `writesEnabled` is the real security boundary.
- Update the `SELECT * FROM People DROP TABLE People` test: it now PASSES the heuristic (documented intentional behavior change).

### Out of Scope
- A real SQL parser or AST validation.
- Changing the `writesEnabled` security model or any route auth.
- Renaming the public error code `HTTP_READ_ONLY_SQL_REQUIRED`.
- Updating archived spec docs that name `isReadOnlySql` (stale-by-design).

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `http-api-adapter`: the read-route gate is reframed as a heuristic allowlist (single-statement SELECT, `INTO` blocked) rather than an authoritative denylist; `writesEnabled` is the true write boundary.

## Approach

Approach B from exploration (lowest-risk, near-zero behavior change). Allowlist = single statement whose first token is `select`, with `\binto\b` retained as the only denied keyword so Access `SELECT INTO` writes stay rejected. JSDoc documents that the function only signals intent, not safety. One test expectation flips (`DROP` without a semicolon now passes the heuristic) and is documented inline.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/http/server.ts` | Modified | Rename function + call site; replace 10-keyword denylist with `into`-only; add JSDoc |
| `test/adapters/http/server.test.ts` | Modified | Update `SELECT ... DROP TABLE` case to expect accept; adjust naming-driven assertions |
| `openspec/specs/http-api-adapter/spec.md` | Modified | Reframe read-route gate as heuristic (handled by sdd-spec) |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Looser gate accepts a malformed SELECT that mutates data | Low | `writesEnabled=false` blocks all write routes; read mode is the DB-level boundary |
| `SELECT INTO` regression if `into` is dropped | Low | Retain `\binto\b`; existing test still asserts rejection |
| Confusion over a non-`is*` predicate name | Low | JSDoc + `looksLike` prefix deliberately signal heuristic intent |

## Rollback Plan

Single-file logic change with no migrations. Revert the commit (or restore the 11-keyword denylist and the `isReadOnlySql` name + call site) and re-run `test/adapters/http/server.test.ts`. No data or config to undo.

## Dependencies

- None (no new packages, no schema or config changes).

## Success Criteria

- [ ] `looksLikeReadOnlySql()` replaces `isReadOnlySql()` at definition and call site; no `isReadOnlySql` references remain in `src/`.
- [ ] Denylist contains only `\binto\b`; the other 10 keywords are removed.
- [ ] JSDoc documents heuristic nature and points to `writesEnabled` as the real boundary.
- [ ] `SELECT INTO` still rejected; `SELECT 1; INSERT ...` (two statements) still rejected.
- [ ] `SELECT * FROM People DROP TABLE People` test updated to expect accept, with an inline comment explaining the heuristic limitation.
- [ ] Full HTTP adapter test suite passes.
