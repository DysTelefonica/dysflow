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

### Requirement: Legacy Service Characterization
The system MUST characterize `VbaSyncLegacyService` behavior before introducing seams or decomposition.

#### Scenario: Seam refactor preserves behavior
- GIVEN characterization coverage exists for a legacy sync path
- WHEN a seam refactor is applied
- THEN observable runner calls and protocol-neutral results MUST remain equivalent

#### Scenario: Untested path blocks refactor
- GIVEN a legacy sync path lacks characterization coverage
- WHEN decomposition is proposed
- THEN implementation MUST add coverage before changing the path
