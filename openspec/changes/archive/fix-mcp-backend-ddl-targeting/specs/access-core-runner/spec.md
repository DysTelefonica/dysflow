# Delta for access-core-runner

## ADDED Requirements

### Requirement: Explicit Legacy Write Database Target

Legacy write and DDL operations MUST execute against an explicit write database target when supplied. The frontend MAY remain the Access automation context, but the write database MUST be selected from `backendPath` or `databasePath` before executing SQL, scripts, DDL, fixtures, or teardown. When no explicit write target is supplied, existing frontend/current-database behavior MUST remain compatible.

#### Scenario: Explicit backend target receives DDL

- GIVEN a frontend database and a distinct backend database
- WHEN `create_table` or `drop_table` runs with an explicit `backendPath` or `databasePath`
- THEN the DDL MUST execute only against that backend database
- AND the frontend MUST NOT contain the created or dropped test table

#### Scenario: No explicit write target preserves compatibility

- GIVEN a legacy write or DDL request without `backendPath` or `databasePath`
- WHEN the runner executes the request
- THEN it MUST use the existing frontend/current database target behavior
- AND dry-run and allow/deny guard behavior MUST remain unchanged

#### Scenario: Protected backend password source and diagnostics

- GIVEN the explicit backend requires a password
- WHEN the runner opens the write database
- THEN it MUST obtain the password only from project configuration or environment variables
- AND diagnostics MUST redact passwords, connection strings, and sensitive paths

#### Scenario: Owned cleanup after write failure

- GIVEN a targeted backend write fails after the runner creates an Access operation record
- WHEN cleanup is required
- THEN cleanup MUST use Dysflow operation ownership and cleanup by operation id
- AND the system MUST NOT use generic Access process kills
