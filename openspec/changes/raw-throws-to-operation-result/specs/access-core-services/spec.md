# Delta for access-core-services

## MODIFIED Requirements

### Requirement: Runner Boundary

The system MUST execute Access-related work only through a bounded runner interface with timeouts and sanitized outputs. When processing a `test_vba` action, the system MUST also guard the test plan resolution path: a missing file, unparseable JSON, or structurally invalid plan MUST return a typed failure — never throw an unhandled exception.
(Previously: no clause covered test plan failures; the resolver could throw on bad input.)

#### Scenario: Service calls runner
- GIVEN a valid Access operation request
- WHEN a core service executes it
- THEN it SHALL call the runner boundary
- AND return a protocol-neutral result

#### Scenario: Runner timeout
- GIVEN a runner exceeds its timeout
- WHEN the service handles completion
- THEN it MUST return a timeout error

#### Scenario: test_vba with missing test plan file
- GIVEN the path referenced by the `test_vba` action does not exist on disk
- WHEN `VbaSyncLegacyService.execute` processes that action
- THEN it MUST return `failureResult` with error code `VBA_INVALID_TEST_PLAN`
- AND no exception MUST escape the service boundary

#### Scenario: test_vba with malformed JSON test plan
- GIVEN the test plan file exists but contains invalid JSON
- WHEN `VbaSyncLegacyService.execute` processes that action
- THEN it MUST return `failureResult` with error code `VBA_INVALID_TEST_PLAN`
- AND no exception MUST escape the service boundary

#### Scenario: test_vba with structurally invalid test plan
- GIVEN the test plan file exists and parses as valid JSON but is not an array or has the wrong shape
- WHEN `VbaSyncLegacyService.execute` processes that action
- THEN it MUST return `failureResult` with error code `VBA_INVALID_TEST_PLAN`
- AND no exception MUST escape the service boundary

#### Scenario: test_vba with valid test plan — success path unchanged
- GIVEN the test plan file exists, parses correctly, and has the expected structure
- WHEN `VbaSyncLegacyService.execute` processes that action
- THEN it MUST follow the existing success path without alteration
