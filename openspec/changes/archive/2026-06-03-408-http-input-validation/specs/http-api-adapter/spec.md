# Delta for http-api-adapter

## ADDED Requirements

### Requirement: HTTP Request Body Validation

The system MUST validate the request body of all incoming POST requests to `/access/cleanup`, `/query/read`, `/query/write`, and `/vba/execute` using the existing schema validation mechanism before routing or execution.

The validation rules for each route are defined as:
1. **`/access/cleanup`**: MUST validate using the `cleanup_access_operation` schema structure. The `operationId` parameter MUST be a non-empty string.
2. **`/query/read`**: MUST validate that the body contains a `sql` property as a non-empty string. Additional properties MUST NOT be allowed.
3. **`/query/write`**: MUST validate that the body contains a `sql` property as a non-empty string. Additional properties MUST NOT be allowed.
4. **`/vba/execute`**: MUST validate that the body contains `moduleName` and `procedureName` as non-empty strings. An optional `arguments` property is allowed and MUST be an array if provided. Additional properties MUST NOT be allowed.

If validation fails:
- The system MUST reject the request with HTTP 400 Bad Request.
- The response MUST contain a failure result with code `HTTP_INVALID_INPUT` and a description of the validation failure.
- The returned error message MUST redact any configured secrets (including `httpToken`, `accessPassword`, and `backendPassword`) by replacing them with `[REDACTED]`.

#### Scenario: POST /access/cleanup validation failure
- GIVEN the HTTP server is running
- WHEN a POST request is received on `/access/cleanup` with a missing or empty `operationId`
- THEN it MUST reject the request with HTTP 400 Bad Request
- AND return code `HTTP_INVALID_INPUT` with validation details

#### Scenario: POST /query/read validation failure
- GIVEN the HTTP server is running
- WHEN a POST request is received on `/query/read` with a missing or empty `sql` parameter
- THEN it MUST reject the request with HTTP 400 Bad Request
- AND return code `HTTP_INVALID_INPUT` with validation details

#### Scenario: POST /query/write validation failure
- GIVEN the HTTP server is running
- WHEN a POST request is received on `/query/write` with an invalid body or additional properties
- THEN it MUST reject the request with HTTP 400 Bad Request
- AND return code `HTTP_INVALID_INPUT` with validation details

#### Scenario: POST /vba/execute validation failure
- GIVEN the HTTP server is running
- WHEN a POST request is received on `/vba/execute` with `arguments` not as an array
- THEN it MUST reject the request with HTTP 400 Bad Request
- AND return code `HTTP_INVALID_INPUT` with validation details

#### Scenario: Secret sanitization in validation errors
- GIVEN the HTTP server is running with `httpToken` configured
- WHEN a validation failure occurs for a request body containing the `httpToken` value
- THEN the returned error message MUST replace occurrences of the token value with `[REDACTED]`
