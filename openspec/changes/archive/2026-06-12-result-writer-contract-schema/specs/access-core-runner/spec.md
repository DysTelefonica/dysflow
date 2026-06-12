# Delta for access-core-runner

## ADDED Requirements

### Requirement: Declarative Result Envelope Boundary

The system MUST expose a declarative schema for the final stdout result envelope after the `DYSFLOW_RESULT ` marker is stripped. The schema MUST describe the current bounded contract surface only and MUST NOT introduce a runtime validation gate in this change.

#### Scenario: Current final result validates externally

- GIVEN stdout contains `DYSFLOW_RESULT ` followed by a current valid result JSON object
- WHEN a contract test strips the marker and validates the JSON with the result envelope schema
- THEN validation MUST succeed
- AND runner parsing and emitted stdout MUST remain unchanged

#### Scenario: Result drift is rejected by schema

- GIVEN stripped result JSON no longer matches the declared envelope boundary
- WHEN the result envelope schema validates it in tests or future CI checks
- THEN validation MUST fail with schema-level evidence
- AND the runner MUST NOT change its current error handling because of this schema

#### Scenario: No runtime behavior change

- GIVEN any existing runner success, error, timeout, or invalid-JSON scenario
- WHEN this change is present
- THEN stdout marker parsing, normalized errors, diagnostics, and caller-visible results MUST match existing behavior
