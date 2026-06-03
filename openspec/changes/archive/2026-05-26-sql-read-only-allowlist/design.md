# Design: SQL Read-Only Allowlist (heuristic guard) — issue #349

## Technical Approach

Reframe the `/query/read` gate from an unbounded keyword denylist to a bounded
allowlist heuristic, per the proposal's Approach B (lowest-risk, near-zero
behavior change). The function keeps its existing pipeline (strip comments →
strip string literals → split on top-level `;` → require exactly one statement →
first token MUST be `select`), but the trailing keyword check shrinks to the
single `\binto\b` rule. It is renamed `looksLikeReadOnlySql` so the name signals
heuristic intent, and JSDoc states explicitly that `writesEnabled` is the
authoritative write boundary. Change is confined to one source file plus its
test file (and the spec, owned by sdd-spec).

## Architecture Decisions

| Decision | Choice | Alternatives rejected | Rationale |
|----------|--------|-----------------------|-----------|
| Gate model | Allowlist: single statement, first token `select`, only `into` denied | Keep 11-keyword denylist; add full SQL/AST parser | Denylists are unbounded — every new write verb is a silent gap. A parser is out of scope and overkill; `writesEnabled` is the real boundary. |
| Function name | `looksLikeReadOnlySql` | Keep `isReadOnlySql`; `assertReadOnlySql` | `looksLike` prefix + JSDoc communicate "heuristic, not guarantee". `is*` implies certainty the check cannot provide. |
| Keep `into` denied | Retain `\binto\b` only | Drop all keywords | Access `SELECT ... INTO` is a real write masquerading as a SELECT; dropping it would regress an existing rejection test. |
| Test `SELECT * FROM People DROP TABLE People` | Flip to accepted (200) | Keep rejecting it | First token is `select`, single statement, no `into` → it legitimately passes the heuristic. Documenting the limitation inline is honest; pretending to catch it is the fragile denylist behavior we are removing. |

## Data Flow

    POST /query/read ──→ readJsonBody ──→ looksLikeReadOnlySql(sql)
                                              │
                          false ─────────────┤────────────→ 400 HTTP_READ_ONLY_SQL_REQUIRED
                                              │ true
                                              ▼
                                   queryService.execute({ sql, mode: "read" })

`writesEnabled` is unchanged and remains the authoritative gate on the
`/query/write` and `/vba/execute` routes. The read heuristic never grants write
capability — read mode is enforced at the DB layer downstream.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/adapters/http/server.ts` | Modify | Rename `isReadOnlySql` → `looksLikeReadOnlySql` at definition (~line 223) and call site (~line 159); replace the 10-keyword denylist regex with `into`-only; add JSDoc. |
| `test/adapters/http/server.test.ts` | Modify | Remove `"SELECT * FROM People DROP TABLE People"` from the rejection `it.each` (line 232); add a new accept test asserting 200 + one query call, with an inline comment explaining the intentional heuristic limitation. |
| `openspec/specs/http-api-adapter/spec.md` | Modify (sdd-spec owns) | Reframe read-route gate wording as heuristic. Not edited by design/tasks. |

## Interfaces / Contracts

Signature is unchanged; only the name and internal predicate change:

```ts
/**
 * Heuristic check — not a security boundary.
 * Returns true if the SQL looks like a single SELECT statement with no INTO clause.
 * writesEnabled is the authoritative write gate.
 */
function looksLikeReadOnlySql(sql: string): boolean {
  // ...steps 1-4 unchanged (strip comments, strip string literals,
  //    split on top-level ';', require exactly one statement)...
  const firstToken = statements[0].match(/^[a-z]+/)?.[0];
  return firstToken === "select" && !/\binto\b/.test(tokenized);
}
```

The error code `HTTP_READ_ONLY_SQL_REQUIRED` and the 400 response shape are
unchanged (out of scope per proposal).

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit/Adapter | First-token allowlist still rejects `UPDATE`, `WITH ... DELETE`, `EXEC`, `selection FROM People` | Existing `it.each` rejection cases (minus the DROP case) keep asserting 400. |
| Unit/Adapter | `SELECT ... INTO` still rejected | Existing dedicated INTO test asserts 400 (the retained `\binto\b` rule). |
| Unit/Adapter | Multi-statement `SELECT 1; INSERT ...` and `INSERT ...; DELETE ...` still rejected | Existing top-level-semicolon tests assert 400 (statement-count rule). |
| Unit/Adapter | `SELECT * FROM People DROP TABLE People` now accepted | New accept test asserts 200 and `services.calls.queries` length 1, with inline comment documenting the heuristic limitation. |
| Suite | No `isReadOnlySql` remains in `src/` | Rename verified by full HTTP adapter suite passing under Strict TDD. |

Strict TDD: update the test expectations first (red), then apply the rename +
denylist reduction (green).

## Migration / Rollout

No migration required. Single-file logic change, no schema/config/packages.
Rollback = revert the commit (restore the 11-keyword denylist + `isReadOnlySql`
name and call site) and re-run `test/adapters/http/server.test.ts`.

## Open Questions

- [ ] None — proposal scope is fully resolved.
