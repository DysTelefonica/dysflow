# http-api-adapter Specification

## Purpose

Expose a local-first HTTP API over core services for production scripts.

## Requirements

### Requirement: Local Guarded HTTP API

The system MUST bind to `127.0.0.1` by default, disable writes by default, and expose documented routes over core contracts, rejecting requests with HTTP 401 if `httpToken` is configured and Bearer token is missing or invalid.
(Previously: The system bound locally and guarded writes, but did not require bearer token authentication.)

#### Scenario: Read route succeeds
- GIVEN the HTTP server is running locally
- AND no HTTP token is configured
- WHEN a read request is received
- THEN it SHALL call core services and return JSON

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
