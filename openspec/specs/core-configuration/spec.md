# core-configuration Specification

## Purpose

Resolve project, Access, secret-redaction, and timeout settings for core services.

## Requirements

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

### Requirement: Single-Implementation Config Loading

Core routing logic for configuration loading MUST reside in exactly one function. The synchronous variant MUST be a thin wrapper that adapts the async implementation (or vice versa). No routing logic SHALL be duplicated between sync and async paths.
(Previously: `loadDysflowConfig` and `loadDysflowConfigAsync` each contained independent routing logic.)

#### Scenario: Sync result matches async result
- GIVEN identical inputs
- WHEN both `loadDysflowConfig` and `loadDysflowConfigAsync` are called
- THEN both MUST return the same resolved configuration

#### Scenario: No routing duplication
- GIVEN the source module `dysflow-config.ts`
- WHEN a routing condition is updated
- THEN exactly one code site requires the change

### Requirement: ExecutionTarget Override Precedence

`resolveExecutionTarget` MUST honor every caller-supplied override that the `ExecutionTarget` type declares, in every branch. Specifically: when branch 2 fires (`context.accessPath` is provided and no explicit config override was requested), the returned target MUST include the caller-supplied `backendPath` if one was provided (and was non-empty). The result MUST remain stable across all three branches of `resolveExecutionTarget`: branch 0 (explicit config override), branch 1 (repo config loaded), and branch 2 (runtime default).

#### Scenario: Branch 2 with caller-supplied backendPath — caller's path wins

- GIVEN `resolveExecutionTarget` is invoked with branch 2 active (`context.accessPath` defined and no explicit config override requested)
- AND `params.backendPath` is a non-empty string `"C:/worktrees/feature/backend.accdb"`
- WHEN the call resolves
- THEN the returned `ExecutionTarget.data.backendPath` MUST equal `"C:/worktrees/feature/backend.accdb"`
- AND it MUST NOT be `undefined` while `params.backendPath` was provided

#### Scenario: Branch 2 with no backendPath override — backendPath is undefined

- GIVEN `resolveExecutionTarget` is invoked with branch 2 active
- AND `params.backendPath` is `undefined` or empty
- WHEN the call resolves
- THEN the returned `ExecutionTarget.data.backendPath` MUST be `undefined`
- AND other fields (`destinationRoot`, `projectRoot`, `timeoutMs`) MUST still resolve normally from params/context/cwd

#### Scenario: Branch 2 with empty-string backendPath — treated as no override

- GIVEN `resolveExecutionTarget` is invoked with branch 2 active
- AND `params.backendPath` is `""` or whitespace-only
- WHEN the call resolves
- THEN the returned `ExecutionTarget.data.backendPath` MUST be `undefined`
- AND the empty string MUST NOT be passed through to the result

#### Scenario: Branches 0/1 backendPath parity — caller's path still wins

- GIVEN `resolveExecutionTarget` is invoked with branch 0 (explicit config override) or branch 1 (repo config loaded)
- AND `params.backendPath` is a non-empty string
- WHEN the call resolves
- THEN the returned `ExecutionTarget.data.backendPath` MUST equal `params.backendPath`
- AND the result MUST remain stable across all three branches

#### Scenario: Branch 2 preserves caller accessPath override alongside runtime-default

- GIVEN `resolveExecutionTarget` is invoked with branch 2 active (`context.accessPath = "C:/runtime/default.accdb"`)
- AND `params.backendPath = "C:/worktrees/feature/backend.accdb"`
- AND no other overrides are present
- WHEN the call resolves
- THEN the returned target's `accessDbPath` MUST equal `context.accessPath` ("C:/runtime/default.accdb")
- AND the returned target's `backendPath` MUST equal the caller's `"C:/worktrees/feature/backend.accdb"`
- AND both fields MUST be populated independently (no silent drop)

### Requirement: Empty-String Override Normalization

`buildProjectConfig` MUST normalize empty-string caller overrides to `undefined` for the four path fields (`accessDbPath`, `backendPath`, `destinationRoot`, `projectRoot`) BEFORE the precedence resolution (`??` against repo-config defaults). This MUST mirror the symmetry already present in `buildExplicitConfig` (lines 222-225). An empty string MUST NOT silently win the precedence test and overwrite a real repo-config value.

#### Scenario: Empty-string destinationRoot override is treated as no override

- GIVEN a repo `.dysflow/project.json` defines `destinationRoot: "src"` and `accessPath: "front.accdb"`
- AND the caller invokes `loadDysflowConfigAsync` (or `loadDysflowConfig`) with `destinationRoot: ""`
- WHEN the config resolves
- THEN the returned `destinationRoot` MUST be the repo-config-resolved value (its projectRoot-resolved absolute form)
- AND it MUST NOT be the empty string

#### Scenario: Empty-string backendPath override is treated as no override

- GIVEN a repo `.dysflow/project.json` defines `backendPath: "backend.accdb"`
- AND the caller invokes `loadDysflowConfigAsync` with `backendPath: ""`
- WHEN the config resolves
- THEN the returned `backendPath` MUST be the repo-config-resolved `"backend.accdb"`
- AND it MUST NOT be `undefined` (which is what silently happens today via `resolveProjectPath("")`)

#### Scenario: Whitespace-only destinationRoot override is treated as no override

- GIVEN a repo `.dysflow/project.json` defines `destinationRoot: "src"`
- AND the caller invokes `loadDysflowConfigAsync` with `destinationRoot: "   "`
- WHEN the config resolves
- THEN the returned `destinationRoot` MUST be the repo-config-resolved `"src"`
- AND whitespace MUST be trimmed before the precedence test

#### Scenario: Empty-string accessDbPath override — repo config wins, no CONFIG_MISSING_ACCESS_PATH

- GIVEN a repo `.dysflow/project.json` defines `accessPath: "front.accdb"`
- AND the caller invokes `loadDysflowConfigAsync` with `accessDbPath: ""`
- WHEN the config resolves
- THEN the returned `accessDbPath` MUST be the repo-config-resolved `"front.accdb"`
- AND it MUST NOT return `CONFIG_MISSING_ACCESS_PATH`
- AND the empty-string override MUST be normalized before the precedence test

#### Scenario: Non-empty caller override still wins after normalization

- GIVEN a repo `.dysflow/project.json` defines `destinationRoot: "src"`
- AND the caller invokes `loadDysflowConfigAsync` with `destinationRoot: "C:/worktrees/feature/src"`
- WHEN the config resolves
- THEN the returned `destinationRoot` MUST be `"C:/worktrees/feature/src"` (or its projectRoot-resolved form)
- AND the caller override MUST still win after the normalization step
