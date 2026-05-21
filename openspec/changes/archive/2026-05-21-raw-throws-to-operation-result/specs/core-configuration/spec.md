# Delta for core-configuration

## MODIFIED Requirements

### Requirement: Safe Configuration Resolution

The system MUST resolve configuration from explicit inputs and environment without exposing secrets in logs or results. When multiple project config files are detected in the same worktree directory, the system MUST return a typed failure — never throw an unhandled exception.
(Previously: no clause covered the ambiguous-config case; the helper threw a raw Error.)

#### Scenario: Access path resolved
- GIVEN a configured Access database path
- WHEN configuration is loaded
- THEN the resolved config SHALL include the database path
- AND redact configured passwords

#### Scenario: Missing required path
- GIVEN no Access database path
- WHEN configuration is validated
- THEN the system MUST return a typed configuration error

#### Scenario: Ambiguous project config — both filenames present
- GIVEN both `.dysflow/project.json` and `dysflow.project.json` exist in the same worktree directory and point to different paths
- WHEN `loadDysflowConfig` is called
- THEN it MUST return `failureResult` with error code `CONFIG_AMBIGUOUS_PROJECT_FILE`
- AND the error message MUST include both conflicting file paths
- AND no exception MUST escape the function boundary

#### Scenario: Ambiguous project config does not affect success path
- GIVEN exactly one project config file exists in the worktree directory
- WHEN `loadDysflowConfig` is called
- THEN it MUST return the existing success result unchanged
