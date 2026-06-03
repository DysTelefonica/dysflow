# Tasks — HTTP Input Validation

- Change: `408-http-input-validation`
- Mode: STRICT TDD. Test runner: `pnpm test`.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | < 150 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | None (Single PR) |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Phase 1: Foundation/Schemas

- [x] 1.1 **RED**: Add a unit test in `test/adapters/mcp/tool-schemas-parity.test.ts` (or a dedicated test file) verifying:
  - `CLEANUP_SCHEMA.properties.operationId` has `minLength: 1`.
  - `HTTP_QUERY_SCHEMA` and `HTTP_VBA_EXECUTE_SCHEMA` are defined and exported correctly according to specs (validating parameter types, strict fields, allowed/required keys).
  Run `pnpm test` -> confirms failures.
- [x] 1.2 **GREEN**: In `src/adapters/mcp/schemas/dysflow-schemas.ts`:
  - Add `minLength: 1` to `operationId` under `CLEANUP_SCHEMA`.
  - Define and export `HTTP_QUERY_SCHEMA` and `HTTP_VBA_EXECUTE_SCHEMA`.
  Run tests -> passes.
- [x] 1.3 **REFACTOR**: Ensure schemas are properly exported from `src/adapters/mcp/schemas.ts`. Ensure clean formatting and export patterns.


## Phase 2: HTTP Route Validation

- [x] 2.1 **RED**: In `test/adapters/http/server.test.ts`, add test cases for input validation failures. Send invalid request bodies to POST endpoints: `/access/cleanup` (missing `operationId`), `/query/read` (missing `sql`, extra fields), `/query/write` (missing `sql`), and `/vba/execute` (arguments not an array). Assert HTTP 400 response with error code `HTTP_INVALID_INPUT`. Run `pnpm test` -> confirms new tests fail.
- [x] 2.2 **GREEN**: In `src/adapters/http/server.ts`:
  - Import `validateInput`, `sanitizeSecrets`, `HTTP_QUERY_SCHEMA`, `HTTP_VBA_EXECUTE_SCHEMA`, and `CLEANUP_SCHEMA`.
  - Update `RouteContext` type to optionally hold `accessPassword?: string` and `backendPassword?: string`.
  - In `startDysflowHttpServer`, load `accessPassword` and `backendPassword` via `loadDysflowConfigAsync` and propagate them to `RouteContext`.
  - In POST endpoints, perform `validateInput` check. If it fails, return HTTP 400 Bad Request with code `HTTP_INVALID_INPUT` and the validation error message sanitized via `sanitizeSecrets` using active secrets (`httpToken`, `accessPassword`, `backendPassword`).
  Run tests -> passes.
- [x] 2.3 **REFACTOR**: Remove redundant manual payload checks from the router handlers. Ensure imports are cleanly organized.

## Phase 3: Testing/Verification

- [x] 3.1 **RED**: In `test/adapters/http/server.test.ts`, write a failing test for secret sanitization in validation errors. Start a server with configured dummy secrets. Send an invalid request containing a secret value in a bad key (e.g. `{ "sql": "select 1", "secret": "dummy-token-val" }`). Assert that the returned error message has the secret value replaced with `[REDACTED]`. Run test -> fails.
- [x] 3.2 **GREEN**: Verify that sanitization replaces all secrets in validation messages. Run tests -> passes.
- [x] 3.3 **REFACTOR**: Run quality gates: `tsc --noEmit` and `biome check src/ test/` to verify types and style. Run full test suite.
