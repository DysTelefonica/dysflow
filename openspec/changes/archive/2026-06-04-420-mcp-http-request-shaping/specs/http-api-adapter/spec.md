# Delta for http-api-adapter

## ADDED Requirements

None

## MODIFIED Requirements

### Requirement: Local Guarded HTTP API

The system MUST bind to `127.0.0.1` by default, disable writes by default, and expose documented routes over core contracts, rejecting requests with HTTP 401 if `httpToken` is configured and Bearer token is missing or invalid. Additionally, the `/query/read` route MUST enforce that queries are read-only (allowing only single `SELECT` or CTE `WITH ... SELECT` queries) using a consolidated SQL heuristic, rejecting other statements with HTTP 400.
(Previously: The system bound locally and guarded writes, requiring bearer token authentication, but did not support read-only CTE queries or consolidated SQL validation heuristics.)

#### Scenario: Read route succeeds with SELECT query
- GIVEN the HTTP server is running locally
- AND no HTTP token is configured
- WHEN a read request is received with a standard SELECT query
- THEN it SHALL call core services and return JSON

#### Scenario: Read route succeeds with CTE query
- GIVEN the HTTP server is running locally
- AND no HTTP token is configured
- WHEN a read request is received with a CTE query starting with `WITH ... SELECT`
- THEN it SHALL call core services and return JSON

#### Scenario: Read route rejects write SQL
- GIVEN the HTTP server is running locally
- WHEN a read request is received with SQL containing write keywords (e.g., `INSERT`, `UPDATE`, `DELETE`) or multiple statements
- THEN it MUST reject the request with HTTP 400 Bad Request
- AND the response MUST return failure code `HTTP_READ_ONLY_SQL_REQUIRED`

#### Scenario: Write blocked by default
- GIVEN writes are not enabled
- WHEN a write request is received
- THEN it MUST reject the request safely

#### Scenario: Request rejected with 401 Unauthorized
- GIVEN the HTTP server is running with `httpToken` configured
- WHEN a request is received with an invalid or missing `Authorization` header
- THEN it MUST reject the request with HTTP 401 Unauthorized

#### Scenario: Request authorized with valid Bearer token
- GIVEN the HTTP server is running with `httpToken` configured
- WHEN a request is received with `Authorization: Bearer <valid-token>`
- THEN it SHALL process the request and return the standard response

## REMOVED Requirements

None
