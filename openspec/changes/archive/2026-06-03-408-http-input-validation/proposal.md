# Proposal: HTTP Adapter Input Validation

## Intent

Prevent client request bugs, invalid parameters, and silent type coercions from causing obscure database or core errors by strictly validating HTTP POST request bodies at the adapter boundary, and ensure sensitive secrets (such as bearer tokens and database passwords) are redacted from validation error messages.

## Scope

### In Scope
- Strictly validate POST request bodies for `/access/cleanup`, `/query/read`, `/query/write`, and `/vba/execute` against JSON schemas.
- Import and reuse `validateInput` from `src/adapters/mcp/validator.ts`.
- Define dedicated schemas `HTTP_QUERY_SCHEMA` and `HTTP_VBA_EXECUTE_SCHEMA` in `src/adapters/mcp/schemas/dysflow-schemas.ts`, and reuse the existing `CLEANUP_SCHEMA`.
- Sanitize HTTP validation error messages using `sanitizeSecrets` before returning them to clients.
- Add comprehensive Vitest test coverage for valid, invalid, missing, and malformed inputs, as well as secret redaction in error messages.

### Out of Scope
- Validating query parameters or URL paths (outside the JSON body).
- Modifying core services logic or contracts.
- Adding input validation to HTTP routes other than the four POST routes.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `http-api-adapter`: Validate POST request bodies against strict schemas and sanitize secrets in validation error messages.

## Approach

Re-use the custom JSON schema validator (`validateInput` from `src/adapters/mcp/validator.ts`) inside the HTTP request routing logic in `src/adapters/http/server.ts`. Request bodies for POST routes will be validated against their respective schemas:
- `/access/cleanup` validates against `CLEANUP_SCHEMA`.
- `/query/read` and `/query/write` validate against `HTTP_QUERY_SCHEMA`.
- `/vba/execute` validates against `HTTP_VBA_EXECUTE_SCHEMA`.

If validation fails, return HTTP `400 Bad Request` with an operation failure result. The error message will run through `sanitizeSecrets` to redact active secrets (httpToken, environment-defined passwords).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/mcp/schemas/dysflow-schemas.ts` | Modified | Define `HTTP_QUERY_SCHEMA` and `HTTP_VBA_EXECUTE_SCHEMA`. |
| `src/adapters/http/server.ts` | Modified | Integrate `validateInput` and `sanitizeSecrets` in POST routing handlers. |
| `test/adapters/http/server.test.ts` | Modified | Add validation failure, bad type, extra parameter, and secret sanitization test scenarios. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Strict schema validation (`additionalProperties: false`) rejects valid legacy/undocumented client fields. | Low | Acceptable since HTTP is an internal interface and must align with strict MCP expectations. |
| Secret leak in validation error messages. | Low | Explicitly pass active secrets (`httpToken`, `DYSFLOW_ACCESS_PASSWORD`, `ACCESS_VBA_PASSWORD`) to `sanitizeSecrets`. |

## Rollback Plan

Revert git changes to `src/adapters/http/server.ts`, `src/adapters/mcp/schemas/dysflow-schemas.ts`, and `test/adapters/http/server.test.ts`.

## Dependencies

None

## Success Criteria

- [ ] HTTP POST routes reject request bodies with missing, extra, or wrong-typed properties with `400 Bad Request`.
- [ ] Valid request bodies continue to be processed and succeed.
- [ ] Active secrets are successfully redacted from validation error messages.
- [ ] All Vitest unit tests pass.
