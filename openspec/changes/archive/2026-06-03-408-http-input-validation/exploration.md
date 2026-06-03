## Exploration: 408-http-input-validation

### Current State
Today, the HTTP server adapter (`src/adapters/http/server.ts`) handles JSON request bodies for POST routes (`/access/cleanup`, `/query/read`, `/query/write`, `/vba/execute`) by reading the JSON body with `readJsonBody`, which returns an empty object `{}` on invalid JSON objects, and then using unsafe type coercion:
- `operationId: String(body.data.operationId ?? "")`
- `accessPath: String(body.data.accessPath ?? "")`
- `force: body.data.force === true`
- `sql: String(body.data.sql ?? "")`
- `moduleName: String(body.moduleName ?? "")`
- `procedureName: String(body.procedureName ?? "")`

This causes client bugs like wrong property names (e.g. `operation_id` or `sql_query`) or wrong types (e.g. `sql` as a number or boolean) to be silently accepted and coerced to empty strings or falsy values, leading to incorrect behavior or obscure core/database errors instead of a clean `400 Bad Request` validation error.
Furthermore, there is no validation for allowed property subsets on the JSON body, and error messages returned to HTTP clients are not sanitized of sensitive secrets (like database passwords or bearer tokens).

### Affected Areas
- `src/adapters/http/server.ts` — HTTP request routing and parameter mapping. Needs input schema validation using `validateInput` and secret sanitization on validation errors.
- `src/adapters/mcp/schemas/dysflow-schemas.ts` — Define new HTTP-specific schemas (`HTTP_QUERY_SCHEMA`, `HTTP_VBA_EXECUTE_SCHEMA`) to maintain single source of truth for adapter schemas.
- `test/adapters/http/server.test.ts` — HTTP adapter tests. Add test cases asserting that missing required fields, wrong field types, and extra properties return `400 Bad Request` with sanitized error messages.

### Approaches
#### Approach 1: Reuse MCP Validator with Dedicated HTTP Schemas
Re-use the custom validator `validateInput` from `src/adapters/mcp/validator.ts` by importing it in `src/adapters/http/server.ts`. We define two new dedicated schemas `HTTP_QUERY_SCHEMA` and `HTTP_VBA_EXECUTE_SCHEMA` in `src/adapters/mcp/schemas/dysflow-schemas.ts`, and reuse the existing `CLEANUP_SCHEMA`.
- **Pros:** Full parity with MCP input validation; leverages the existing robust validation logic (type, requirements, length, enum, additionalProperties); avoids duplicating validation code; keeps schemas centralized.
- **Cons:** Introduces a cross-adapter import between HTTP and MCP adapters (both are in the adapter layer `src/adapters`, so this is architecturally acceptable).
- **Effort:** Low.

#### Approach 2: Implement a Separate Zod/Custom Validator for HTTP
Introduce a library like Zod or write a separate validation helper inside the HTTP adapter.
- **Pros:** Decouples the HTTP adapter from the MCP adapter.
- **Cons:** Duplicates schema validation logic; increases package bundle size or adds maintenance overhead; diverges from the MCP validation style, risking boundary parity drift.
- **Effort:** Medium.

### Recommendation
Use **Approach 1**. Sharing the validator and schema definition formats guarantees input validation parity between the two entry ports (HTTP and MCP) and ensures that enhancements to the validator benefit both adapters. The cross-adapter import is entirely valid within the hexagonal architecture, as both adapters live at the outer layer and neither pollutes `src/core`.

### Risks
- If the HTTP token or database password is dynamically loaded or overridden, we must ensure the secrets array includes all active secrets (HTTP Bearer token, `DYSFLOW_ACCESS_PASSWORD`, `ACCESS_VBA_PASSWORD` from environment and configuration).
- Schema validation might reject extra fields that legacy clients passed. However, since HTTP is an internal protocol wrapper and MCP already enforces `additionalProperties: false`, this strict alignment is desirable and prevents client bugs.

### Ready for Proposal
Yes — the changes are very small, highly cohesive, and will reside comfortably under the 400-line change budget.

### Minimal TDD Anchors
- **Unit (HTTP Server Tests):**
  - Verify that a POST to `/access/cleanup` with a missing `operationId` or `accessPath` returns `400 Bad Request` with a clear message.
  - Verify that a POST to `/query/read` or `/query/write` with a missing or empty `sql` parameter, or wrong types/extra parameters, returns `400 Bad Request`.
  - Verify that a POST to `/vba/execute` with a missing `procedureName` or wrong arguments type/extra parameters returns `400 Bad Request`.
  - Verify that validation error messages containing the bearer token or access password are redacted via `sanitizeSecrets`.
