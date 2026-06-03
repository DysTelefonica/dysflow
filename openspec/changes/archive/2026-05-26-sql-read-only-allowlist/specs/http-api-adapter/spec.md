# Delta for http-api-adapter

## MODIFIED Requirements

### Requirement: Read Route SQL Guard

The system MUST apply a heuristic allowlist check (`looksLikeReadOnlySql`) before executing any query on the `/query/read` route. The check is a best-effort guard, NOT an authoritative security boundary. The true write-safety boundary is `writesEnabled`.

The function MUST:
1. Strip line and block comments from the input SQL.
2. Strip string literals to avoid misinterpreting delimiters inside quoted values.
3. Split the remaining text on `;`; if more than one non-empty statement is produced, reject the input.
4. Require that the first token of the single remaining statement is `select` (case-insensitive).
5. Reject the statement if it contains the word boundary pattern `\binto\b` (case-insensitive), to block Access SELECT INTO write operations.
6. Accept the statement otherwise.

The function MUST be named `looksLikeReadOnlySql`. The identifier `isReadOnlySql` MUST NOT appear anywhere in `src/`.

A JSDoc comment MUST document: (a) the function is a heuristic guard, not authoritative; (b) `writesEnabled` is the real security boundary.

Zero new npm dependencies are permitted.

(Previously: gate was an 11-keyword denylist named `isReadOnlySql` with no JSDoc, implying authoritative enforcement)

#### Scenario: Simple SELECT accepted

- GIVEN a SQL string `SELECT id, name FROM People`
- WHEN `looksLikeReadOnlySql` is called
- THEN it MUST return `true`

#### Scenario: Leading whitespace accepted

- GIVEN a SQL string `  SELECT * FROM t` with leading whitespace
- WHEN `looksLikeReadOnlySql` is called
- THEN it MUST return `true`

#### Scenario: Lowercase select accepted

- GIVEN a SQL string `select * from t`
- WHEN `looksLikeReadOnlySql` is called
- THEN it MUST return `true`

#### Scenario: Block comment stripped before evaluation

- GIVEN a SQL string `/* comment */ SELECT * FROM t`
- WHEN `looksLikeReadOnlySql` is called
- THEN it MUST return `true`

#### Scenario: Semicolons inside string literals ignored

- GIVEN a SQL string `SELECT * FROM T WHERE name = 'val;with;semis'`
- WHEN `looksLikeReadOnlySql` is called
- THEN it MUST return `true` (semicolons within quoted strings do not constitute statement boundaries)

#### Scenario: Non-SELECT first token rejected

- GIVEN a SQL string `UPDATE People SET name='Ada' WHERE id=1`
- WHEN `looksLikeReadOnlySql` is called
- THEN it MUST return `false`

#### Scenario: SELECT INTO rejected

- GIVEN a SQL string `SELECT * INTO ArchivedPeople FROM People`
- WHEN `looksLikeReadOnlySql` is called
- THEN it MUST return `false` (INTO pattern signals Access write operation)

#### Scenario: Multiple statements rejected

- GIVEN a SQL string `SELECT 1; DELETE FROM x`
- WHEN `looksLikeReadOnlySql` is called
- THEN it MUST return `false`

#### Scenario: EXEC rejected

- GIVEN a SQL string `EXEC procedure`
- WHEN `looksLikeReadOnlySql` is called
- THEN it MUST return `false`

#### Scenario: Access TRANSFORM rejected

- GIVEN a SQL string `TRANSFORM ... SELECT ...` (first token is TRANSFORM, not SELECT)
- WHEN `looksLikeReadOnlySql` is called
- THEN it MUST return `false`

#### Scenario: SELECT without semicolon followed by DDL keyword accepted (heuristic limit)

- GIVEN a SQL string `SELECT * FROM People DROP TABLE People` (no semicolon separator)
- WHEN `looksLikeReadOnlySql` is called
- THEN it MUST return `true`
- AND a code comment at the test site MUST document that real write-safety is enforced by `writesEnabled`, not this heuristic
