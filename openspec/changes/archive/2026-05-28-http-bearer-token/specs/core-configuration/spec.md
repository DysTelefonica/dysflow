# Delta for core-configuration

## MODIFIED Requirements

### Requirement: Safe Configuration Resolution

The system MUST resolve configuration from explicit inputs and environment without exposing secrets in logs or results.
(Previously: The system resolved database path and redacted passwords, but did not support httpToken config or its redaction.)

#### Scenario: Access path resolved
- GIVEN a configured Access database path
- WHEN configuration is loaded
- THEN the resolved config SHALL include the database path
- AND redact configured passwords

#### Scenario: Missing required path
- GIVEN no Access database path
- WHEN configuration is validated
- THEN the system MUST return a typed configuration error

#### Scenario: HTTP token resolved and redacted
- GIVEN an HTTP token configured in environment `DYSFLOW_HTTP_TOKEN` or explicit inputs
- WHEN configuration is resolved
- THEN it SHALL resolve the token in `httpToken`
- AND the system MUST redact the `httpToken` value in config log outputs
