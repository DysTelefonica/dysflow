# Delta for access-core-services

## ADDED Requirements

### Requirement: Runner Password Forwarding for Backend Access Operations

The system MUST forward `backendPassword` to backend-access maintenance operations through the runner boundary and apply it only when opening a backend database from Action requests.

#### Scenario: Backend compare passes backend credentials

- GIVEN a `compare_backends` request includes a protected backend path and the resolved config has a backend password
- WHEN the access-core service executes the comparison
- THEN runner environment MUST include `DYSFLOW_BACKEND_PASSWORD` (or legacy `ACCESS_VBA_PASSWORD` when that is the configured backend alias) with a redacted diagnostic representation
- AND backend-open logic MUST use that secret when calling `OpenDatabase` for the backend file.

#### Scenario: Backend link maintenance passes backend credentials

- GIVEN `relink_tables` or `localize_backend_links` is requested against a protected backend
- WHEN the service executes the operation
- THEN runner execution input MUST include backend credentials in the same forwarding path used by compare operations
- AND success/failure behavior SHALL remain protocol-neutral.

#### Scenario: Backend secrets do not leak through runner output

- GIVEN a backend-open failure includes database credential context in stderr/stdout
- WHEN the runner result is returned by `access-core-services`
- THEN secret values MUST be masked as `[REDACTED]` in exposed output.
