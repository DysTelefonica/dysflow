# http-api-adapter Specification

## Purpose

Expose a local-first HTTP API over core services for production scripts.

## Requirements

### Requirement: Local Guarded HTTP API

The system MUST bind to `127.0.0.1` by default, disable writes by default, and expose documented routes over core contracts.

#### Scenario: Read route succeeds
- GIVEN the HTTP server is running locally
- WHEN a read request is received
- THEN it SHALL call core services and return JSON

#### Scenario: Write blocked by default
- GIVEN writes are not enabled
- WHEN a write request is received
- THEN it MUST reject the request safely
