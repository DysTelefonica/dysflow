# Delta for access-core-services

## ADDED Requirements

### Requirement: Progress Callback Forwarding

`VbaService` and `QueryService` MUST accept an optional `onProgress` callback
from their caller context and MUST forward it unchanged to the underlying runner
call. Neither service MAY alter, wrap, or suppress the callback before
forwarding.

When the caller does not supply `onProgress`, the service MUST call the runner
without an `onProgress` option, preserving the original call contract.

#### Scenario: vba-service forwards onProgress to runner

- GIVEN a `vba-service` execute call with `onProgress` provided in the service options
- WHEN the service invokes the runner
- THEN the runner MUST receive the same `onProgress` reference
- AND progress callbacks fired by the runner MUST reach the original caller

#### Scenario: query-service forwards onProgress to runner

- GIVEN a `query-service` execute call with `onProgress` provided in the service options
- WHEN the service invokes the runner
- THEN the runner MUST receive the same `onProgress` reference
- AND progress callbacks fired by the runner MUST reach the original caller

#### Scenario: Service called without onProgress

- GIVEN a service execute call with no `onProgress` in options
- WHEN the service invokes the runner
- THEN the runner MUST be called without an `onProgress` option
- AND the service result MUST be identical to its pre-change behavior

## MODIFIED Requirements

### Requirement: Runner Boundary

The system MUST execute Access-related work only through a bounded runner
interface with timeouts and sanitized outputs. Services MUST also propagate
any optional `onProgress` callback from their caller to the runner without
modification.

(Previously: runner boundary had no provision for progress callback propagation)

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
