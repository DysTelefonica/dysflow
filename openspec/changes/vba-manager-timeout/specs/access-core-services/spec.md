# Delta for access-core-services

## MODIFIED Requirements

### Requirement: Runner Boundary

The system MUST execute Access-related work only through a bounded runner interface
with timeouts and sanitized outputs. This applies to ALL spawned PowerShell processes,
including `spawnVbaManager`. Each spawned process MUST carry a kill-timer sourced from
`DysflowConfig.processTimeoutMs`; when the timer fires the process MUST be killed and a
typed failure MUST be returned BEFORE any exit-code inspection.
(Previously: timeout requirement applied to runner boundary in general — VBA manager
executor was not explicitly covered and lacked a kill-timer.)

#### Scenario: Service calls runner

- GIVEN a valid Access operation request
- WHEN a core service executes it
- THEN it SHALL call the runner boundary
- AND return a protocol-neutral result

#### Scenario: Runner timeout (general)

- GIVEN a runner exceeds its timeout
- WHEN the service handles completion
- THEN it MUST return a timeout error

#### Scenario: VBA manager timeout fires

- GIVEN `spawnVbaManager` is invoked and the spawned process does not exit within `DysflowConfig.processTimeoutMs`
- WHEN the kill-timer elapses
- THEN the child process MUST be killed
- AND the executor MUST set `timedOut = true` before killing
- AND `execute` MUST return `failureResult(createDysflowError("VBA_MANAGER_TIMEOUT", ..., { retryable: true }))`
- AND the failure MUST be resolved BEFORE the exit-code branch

#### Scenario: VBA manager completes before timeout

- GIVEN `spawnVbaManager` is invoked and the process exits within the timeout window
- WHEN the process closes
- THEN the kill-timer MUST be cleared
- AND `execute` MUST follow the normal exit-code branch (success or non-timeout failure)

## ADDED Requirements

### Requirement: Non-Interactive PowerShell Args

Every PowerShell process spawned by `spawnVbaManager` MUST include `-NonInteractive`
in its argument list. The flag MUST appear after `-NoProfile` and before `-ExecutionPolicy`.

#### Scenario: Args include -NonInteractive

- GIVEN `spawnVbaManager` is about to spawn `powershell.exe`
- WHEN the args array is constructed
- THEN it MUST be `["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ...]`

#### Scenario: Unit test guards the flag

- GIVEN the test suite for `vba-sync-legacy-service`
- WHEN the service spawns the VBA manager
- THEN the test MUST assert that the spawned command includes `-NonInteractive`

### Requirement: Timeout Unit Test Coverage

The `vba-sync-legacy-service` test suite MUST include a test that verifies the timeout
failure path independently of the non-interactive and success paths.

#### Scenario: Timeout test — failure code returned

- GIVEN the executor mock is configured to simulate a process that never exits
- WHEN the kill-timer fires
- THEN `execute` MUST resolve with a failure result whose error code is `VBA_MANAGER_TIMEOUT`

#### Scenario: Regression guard — success path unaffected

- GIVEN the executor mock is configured to simulate a successful process exit
- WHEN `execute` is called with a valid request
- THEN it MUST return a success result (no regression from timeout wiring)
