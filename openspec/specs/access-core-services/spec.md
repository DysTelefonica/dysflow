# access-core-services Specification

## Purpose

Provide Access/VBA/query services behind a safe PowerShell runner boundary.

## Requirements

### Requirement: Runner Boundary

The system MUST execute Access-related work only through a bounded runner interface with timeouts and sanitized outputs.

#### Scenario: Service calls runner
- GIVEN a valid Access operation request
- WHEN a core service executes it
- THEN it SHALL call the runner boundary
- AND return a protocol-neutral result

#### Scenario: Runner timeout
- GIVEN a runner exceeds its timeout
- WHEN the service handles completion
- THEN it MUST return a timeout error
