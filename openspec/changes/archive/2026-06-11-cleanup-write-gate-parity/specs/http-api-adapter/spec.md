# Delta for http-api-adapter

## ADDED Requirements

### Requirement: Cleanup Write-Gate Documentation

The system MUST document that cleanup write gating is force-only across HTTP and MCP adapters: non-force cleanup MAY run while writes are disabled, but `force: true` cleanup MUST require writes to be enabled.

#### Scenario: Docs state force-only gate
- GIVEN public or agent-facing docs describe Access cleanup
- WHEN cleanup write-gate behavior is documented
- THEN the docs MUST state that only `force: true` cleanup is write-gated
- AND MUST NOT imply that all cleanup requires writes.

## MODIFIED Requirements

### Requirement: Local Guarded HTTP API

The system MUST bind to `127.0.0.1` by default, disable writes by default, and expose documented routes over core contracts, rejecting requests with HTTP 401 if `httpToken` is configured and Bearer token is missing or invalid. The `/query/read` route MUST enforce that queries are read-only (allowing only single `SELECT` or CTE `WITH ... SELECT` queries) using a consolidated SQL heuristic, rejecting other statements with HTTP 400. The `/access/cleanup` route MUST match MCP cleanup write-gate behavior: non-force cleanup MUST remain allowed to reach core cleanup eligibility checks when writes are disabled, while `force: true` cleanup MUST be rejected before core cleanup execution unless writes are enabled.
(Previously: The HTTP API guarded writes and read SQL, but `/access/cleanup` did not enforce the MCP force-only cleanup write gate.)

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
- WHEN a read request is received with SQL containing write keywords or multiple statements
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

#### Scenario: Non-force cleanup remains allowed when writes are disabled
- GIVEN HTTP writes are disabled
- WHEN `/access/cleanup` is requested with `force` absent or `false`
- THEN the request MUST reach core cleanup eligibility checks
- AND MUST NOT be rejected solely by the write gate.

#### Scenario: Force cleanup blocked when writes are disabled
- GIVEN HTTP writes are disabled
- WHEN `/access/cleanup` is requested with `force: true`
- THEN the request MUST be rejected before core cleanup execution
- AND the result MUST communicate that writes are disabled.

#### Scenario: Force cleanup allowed when writes are enabled
- GIVEN HTTP writes are enabled
- WHEN `/access/cleanup` is requested with `force: true`
- THEN the request SHALL reach core cleanup eligibility checks.

#### Scenario: HTTP and MCP cleanup gates stay equivalent
- GIVEN equivalent cleanup requests are sent through HTTP and MCP
- WHEN writes are disabled
- THEN both adapters MUST allow non-force cleanup paths
- AND both adapters MUST reject `force: true` cleanup paths.
