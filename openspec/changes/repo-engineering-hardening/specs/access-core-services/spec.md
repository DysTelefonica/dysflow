# Delta for access-core-services

## ADDED Requirements

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
