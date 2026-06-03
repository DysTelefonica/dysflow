# Delta for access-core-services

## ADDED Requirements

### Requirement: Runner Output Shape Validation

After `runner.run()` returns, each service MUST validate the shape of the result before using it. A result that does not satisfy the service's minimum structural contract MUST cause the service to return a failure with error code `RUNNER_INVALID_OUTPUT` without propagating the malformed data. The `isRecord()` utility from `src/core/utils/index.ts` MUST be used for loose object-shape checks in `query-service` and `vba-service`. `diagnostics-service` MUST additionally verify that `data.checks` is an array.

Empty stdout parsed as `{}` MUST be treated as valid by all three services because all fields in `TData` are optional.

#### Scenario: DiagnosticsService — valid output with checks array

- GIVEN `diagnostics-service` calls `runner.run()` successfully
- WHEN the parsed result is a record AND `data.checks` is an array
- THEN the service MUST return a success result with that data

#### Scenario: DiagnosticsService — missing checks field

- GIVEN `diagnostics-service` calls `runner.run()` successfully
- WHEN the parsed result does not contain `checks` or `checks` is not an array
- THEN the service MUST return a failure with error code `RUNNER_INVALID_OUTPUT`
- AND the malformed data MUST NOT be propagated to the caller

#### Scenario: DiagnosticsService — null or undefined result

- GIVEN `diagnostics-service` calls `runner.run()` successfully
- WHEN the parsed result is `null` or `undefined`
- THEN the service MUST return a failure with error code `RUNNER_INVALID_OUTPUT`

#### Scenario: DiagnosticsService — empty stdout

- GIVEN `diagnostics-service` calls `runner.run()` returning empty stdout (`{}`)
- WHEN the parsed result is an empty record
- THEN the service MUST treat it as valid and continue normal processing

#### Scenario: VbaService — valid record output

- GIVEN `vba-service` calls `runner.run()` successfully
- WHEN `isRecord(data)` returns `true`
- THEN the service MUST return a success result with that data

#### Scenario: VbaService — non-object output

- GIVEN `vba-service` calls `runner.run()` successfully
- WHEN the parsed result is not an object (e.g., a string, array, or null)
- THEN the service MUST return a failure with error code `RUNNER_INVALID_OUTPUT`

#### Scenario: VbaService — empty stdout

- GIVEN `vba-service` calls `runner.run()` returning empty stdout (`{}`)
- WHEN `isRecord({})` returns `true`
- THEN the service MUST treat it as valid

#### Scenario: QueryService — valid record output

- GIVEN `query-service` calls `runner.run()` successfully
- WHEN `isRecord(data)` returns `true`
- THEN the service MUST return a success result with that data

#### Scenario: QueryService — non-object output

- GIVEN `query-service` calls `runner.run()` successfully
- WHEN the parsed result is not an object
- THEN the service MUST return a failure with error code `RUNNER_INVALID_OUTPUT`

#### Scenario: QueryService — empty stdout

- GIVEN `query-service` calls `runner.run()` returning empty stdout (`{}`)
- WHEN `isRecord({})` returns `true`
- THEN the service MUST treat it as valid

### Requirement: RUNNER_INVALID_OUTPUT Error Code

The string literal `RUNNER_INVALID_OUTPUT` MUST exist as a recognized error code returned via `failureResult`. No new npm dependency MAY be introduced. The `AccessRunner` interface, `AccessPowerShellRunner`, and `parseRunnerData` signatures MUST NOT be modified.

#### Scenario: Error code surfaced to caller

- GIVEN any service fails shape validation after `runner.run()`
- WHEN the service returns a failure result
- THEN the failure MUST carry error code `RUNNER_INVALID_OUTPUT`

## MODIFIED Requirements

### Requirement: Runner Boundary

The system MUST execute Access-related work only through a bounded runner interface with timeouts and sanitized outputs. Services MUST also propagate any optional `onProgress` callback from their caller to the runner without modification. After `runner.run()` returns, services MUST validate the shape of the result before returning it to callers, failing with `RUNNER_INVALID_OUTPUT` on mismatch.
(Previously: services accepted `runner.run()` output with zero runtime shape validation — phantom casts passed silently.)

#### Scenario: Service calls runner

- GIVEN a valid Access operation request
- WHEN a core service executes it
- THEN it SHALL call the runner boundary
- AND return a protocol-neutral result

#### Scenario: Runner timeout

- GIVEN a runner exceeds its timeout
- WHEN the service handles completion
- THEN it MUST return a timeout error

#### Scenario: Seam refactor preserves behavior

- GIVEN characterization coverage exists for a legacy sync path
- WHEN a seam refactor is applied
- THEN observable runner calls and protocol-neutral results MUST remain equivalent

#### Scenario: Untested path blocks refactor

- GIVEN a legacy sync path lacks characterization coverage
- WHEN decomposition is proposed
- THEN implementation MUST add coverage before changing the path

#### Scenario: Shape mismatch after runner returns

- GIVEN a service receives a result from `runner.run()` that fails shape validation
- WHEN the service processes the result
- THEN it MUST NOT return the malformed data
- AND MUST return a failure with error code `RUNNER_INVALID_OUTPUT`
