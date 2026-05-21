# Delta for core-configuration

## MODIFIED Requirements

### Requirement: Safe Configuration Resolution

The system MUST resolve configuration from explicit inputs and environment without exposing secrets in logs or results. Backend credentials MUST follow a defined precedence and redaction policy when resolved for runner-bound operations.
(Previously: no clause explicitly covered backend password precedence and runner-bound redaction scenarios.)

#### Scenario: Backend password precedence

- GIVEN a project sets `backendPassword` and also sets `backendPasswordEnv`
- WHEN `loadDysflowConfig` is called
- THEN the resolved configuration MUST use the explicit `backendPassword` value
- AND `backendPasswordEnv` MUST remain documented for environment-based flows

#### Scenario: Backend password env fallback

- GIVEN `backendPassword` is not set and `backendPasswordEnv` is `DYSFLOW_BACKEND_PASSWORD`
- WHEN that environment variable is present at load time
- THEN the resolved config MUST expose `backendPassword` for downstream consumers
- AND the log/result view MUST redact it as `[REDACTED]`

#### Scenario: Legacy alias fallback

- GIVEN `backendPassword` is not set and `backendPasswordEnv` is not set
- WHEN `ACCESS_VBA_PASSWORD` exists in the environment
- THEN the resolved config MUST use `ACCESS_VBA_PASSWORD` as the backend password fallback
- AND any diagnostics SHALL redact the value.
