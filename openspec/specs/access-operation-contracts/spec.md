# access-operation-contracts Specification

## Purpose

Define protocol-neutral Access/VBA/query request and result contracts.

## Requirements

### Requirement: Protocol-Neutral Results

The system MUST represent operations with typed success, error, diagnostics, and duration fields without MCP or HTTP concepts.

#### Scenario: Successful operation
- GIVEN a completed Access operation
- WHEN the result is created
- THEN it SHALL include success data and diagnostics

#### Scenario: Failed operation
- GIVEN a runner failure
- WHEN the result is created
- THEN it MUST include a typed error and safe message

### Requirement: Explicit Scanner Parameter

`scanAndCleanOrphans` MUST declare `processScanner` as an explicit typed parameter. It MUST NOT use a non-null assertion to access it.
(Previously: accessed `processScanner` via non-null assertion `!`.)

#### Scenario: Parameter required
- GIVEN a call to `scanAndCleanOrphans`
- WHEN `processScanner` is omitted
- THEN TypeScript MUST reject the call at compile time

#### Scenario: No runtime non-null assertion
- GIVEN `processScanner` is passed
- WHEN the function executes
- THEN it MUST not use `!` to assert the value is non-null

### Requirement: InMemory Registry Purge Parity

`InMemoryAccessOperationRegistry.create()` and `update()` MUST call `records.delete(operationId)` when the resulting status is in `PURGED_PERSISTENT_STATUSES`, matching `FileRegistry` behavior.
(Previously: InMemory registry retained completed/cleaned records indefinitely, diverging from FileRegistry.)

#### Scenario: Completed status purges record
- GIVEN an operation that transitions to a status in `PURGED_PERSISTENT_STATUSES`
- WHEN `create` or `update` completes
- THEN the record MUST be removed from the in-memory store

#### Scenario: Active status retains record
- GIVEN an operation with an active (non-purged) status
- WHEN `create` or `update` completes
- THEN the record MUST remain in the in-memory store

#### Scenario: Parity with FileRegistry
- GIVEN both registries receive the same sequence of operations
- WHEN the final status is in `PURGED_PERSISTENT_STATUSES`
- THEN both registries MUST have deleted the record

### Requirement: Payload Type Whitelist Schema

The system MUST provide a declarative schema for result-writer payload type names that accepts exactly the existing `PAYLOAD_TYPE_WHITELIST` entries. Existing helper validation MUST remain the compatibility oracle for JavaScript values.

#### Scenario: Whitelist schema matches public list
- GIVEN every entry in `PAYLOAD_TYPE_WHITELIST`
- WHEN the payload type schema validates each entry
- THEN every entry MUST be accepted
- AND no additional payload type names MAY be accepted without an explicit contract change

#### Scenario: Helper compatibility is preserved
- GIVEN representative allowed and rejected JavaScript payload values
- WHEN `whyPayloadTypeIsNotWhitelisted()` evaluates them after schemas are added
- THEN its accepted/rejected outcomes and reason semantics MUST remain unchanged

### Requirement: Serialization Failure Envelope Schema

The system MUST provide a declarative schema for serialization-failed fallback envelopes that accepts the object shape produced by `buildSerializationFailedEnvelope()`: `ok: false`, an error object with a serialization-failed code family, and a non-empty diagnostics array.

#### Scenario: Built fallback envelope validates
- GIVEN `buildSerializationFailedEnvelope()` returns an envelope with a script-specific serialization code
- WHEN the serialization failure schema validates the envelope
- THEN validation MUST succeed
- AND the diagnostics first entry MUST remain present for operator troubleshooting

#### Scenario: Invalid fallback envelope is rejected
- GIVEN an envelope with missing diagnostics, `ok` not false, or a non-serialization error code
- WHEN the serialization failure schema validates it
- THEN validation MUST fail
- AND no PowerShell writer output format MUST change in this slice

### Requirement: Schema Exports Are Additive

The system MUST export result-writer schemas from the core contracts surface as additive contract artifacts. Existing validators, constants, helper names, marker strings, fallback fields, and JSON emitted by PowerShell writers MUST remain backward compatible.

#### Scenario: Existing callers compile unchanged
- GIVEN callers import existing result-writer constants, types, or helpers
- WHEN schema exports are added
- THEN those imports MUST continue to compile without renamed or removed symbols

#### Scenario: Emitted payloads are unchanged
- GIVEN existing PowerShell writer success and serialization-failure cases
- WHEN schemas are available in TypeScript
- THEN emitted JSON and sentinel lines MUST remain byte-for-byte compatible except for unrelated formatting already outside this change

### Requirement: Canonical ELIGIBLE_STATUSES membership is single-source

`ELIGIBLE_STATUSES` for Access-operation cleanup eligibility MUST be a single
canonical set, exported exactly once from
`src/core/operations/access-operation-status.ts`. Its membership MUST be
`{timed_out, failed, cleanup_pending, pid_unknown}` — the union of historic
preflight and cleanup statuses (preflight's 4-status set is the superset).

Both `src/core/operations/access-operation-preflight.ts` AND
`src/core/operations/access-operation-cleanup.ts` MUST import the constant from
this single module and MUST NOT redeclare a local `ELIGIBLE_STATUSES` array
or `Set`. TypeScript MUST fail compilation if either module declares a local
constant with the same name.

#### Scenario: Both modules resolve the same Set identity

- **GIVEN** `src/core/operations/access-operation-status.ts` exports
  `ELIGIBLE_STATUSES`
- **WHEN** `preflight.ELIGIBLE_STATUSES` and `cleanup.ELIGIBLE_STATUSES` are
  read at runtime
- **THEN** `Object.is(preflight.ELIGIBLE_STATUSES, cleanup.ELIGIBLE_STATUSES)`
  MUST be `true` (strict reference equality)
- **AND** neither module MUST declare a local `const ELIGIBLE_STATUSES` —
  TypeScript MUST fail the build if either file does

#### Scenario: Membership is the canonical union

- **GIVEN** the exported constant
- **WHEN** its membership is enumerated
- **THEN** it MUST contain exactly `timed_out`, `failed`, `cleanup_pending`,
  AND `pid_unknown` — and no other status names

#### Scenario: preflight accepts a `pid_unknown` record (happy path post-fix)

- **GIVEN** a record whose `status === "pid_unknown"` and whose PID is
  unknown to the OS
- **WHEN** `AccessOperationPreflightCleanupService.cleanup(...)` runs
- **THEN** the record MUST be considered eligible for cleanup
- **AND** the service MUST NOT raise `STATUS_NOT_ELIGIBLE` for this record

#### Scenario: cleanup refuses `pid_unknown` with `CLEANUP_PID_UNKNOWN` (sad path)

- **GIVEN** a record whose `status === "pid_unknown"` and whose PID is unknown
- **WHEN** `AccessOperationCleanupService.reconcile(operationId)` runs
- **THEN** it MUST return an error envelope whose
  `error.code === "CLEANUP_PID_UNKNOWN"`
- **AND** it MUST NOT attempt to kill a process (no PID to target)
- **AND** the error message MUST be a stable, structured string an operator
  can recognize

#### Scenario: divergence is closed at the source (adversarial)

- **GIVEN** the bug fix is in place
- **WHEN** a future contributor copies a 3-status list into cleanup "for
  convenience"
- **THEN** the build MUST fail (no local redeclaration allowed) at compile
  time, surfacing the regression before runtime

#### Scenario: existing pre-`pid_unknown` flows still eligible (regression)

- **GIVEN** records whose `status` is `timed_out` or `failed` or
  `cleanup_pending`
- **WHEN** preflight or cleanup runs
- **THEN** both services MUST continue to treat these records as eligible
  (no regression from the membership expansion)

### Requirement: Cleanup Schema-vs-Runtime Field Parity

For every JSON-schema field advertised in `CLEANUP_SCHEMA`, the typed
request that reaches the MCP handler boundary (`buildCleanupRequest` in
`alias-tools.ts:88-108` AND its modern equivalent) MUST either:

(a) honor the field at runtime, OR

(b) mark the field `deprecated: true` in `CLEANUP_SCHEMA`.

Currently, (a) applies to `force`, `projectId`, `contextId`, `backendPath`,
`destinationRoot`, `projectRoot`, `timeoutMs`, `accessPath`. The fields
`strictContext`, `expectedAccessPath`, `expectedProjectRoot`,
`expectedDestinationRoot` are advertised but not consumed by the core
service. This requirement makes **handler-level pass-through** mandatory;
core-service enforcement remains out of scope.

#### Scenario: legacy pass-through is unchanged (regression guard)

- GIVEN a fake `cleanupService.cleanup` that records its input
- WHEN `cleanup_access_operation` is invoked with the full schema field set
- THEN `cleanupService.cleanup` MUST be called exactly once
- AND the captured input MUST include every schema-declared field
- (Pin: extend `test/adapters/mcp/alias-tools.test.ts` —
  `buildCleanupRequest passes through schema-declared fields`)

#### Scenario: modern `dysflow_access_cleanup` carries every schema field (NEW gate)

- GIVEN the same fake
- WHEN `dysflow_access_cleanup` is invoked with the full schema field set
- THEN the typed request MUST carry every schema-declared field
- AND the cast `validatedInput as {operationId, accessPath, force?}` MUST be replaced by a builder mirroring `buildCleanupRequest`
- (Pin: `test/adapters/mcp/tools.test.ts` — new
  `dysflow_access_cleanup modern pass-through mirrors buildCleanupRequest`)

#### Scenario: parity matrix — modern and legacy fields match

- GIVEN the same input to both builders
- THEN the field sets MUST be equal (ignoring `undefined`)
- AND no schema-declared field MAY be present in only one set
- (Pin: `test/adapters/mcp/alias-tools.test.ts` — new
  `legacy and modern pass-through field sets are equal`)

### Requirement: Documented Scope Split Between Handler and Core

This change fixes the modern handler's surface only. It does **NOT** make
`AccessOperationCleanupService.cleanup()` consume `strictContext` or the
`expected*` fields at runtime. A separate capability change is required
to make those fields enforceable; until then, the typed request carries
the values forward-compatibly and downstream services ignore what they
do not yet understand.

#### Scenario: deferred core-service enforcement is not silently added

- GIVEN the PR for this change is merged
- WHEN `dysflow_access_cleanup` is invoked with `strictContext: true` and
  a non-matching `expectedAccessPath`
- THEN `AccessOperationCleanupService.cleanup` executes its current
  path unchanged (it does NOT compare paths against `expectedAccessPath`)
- AND no contract in this PR claims otherwise
- (Pin: implicit; existing cleanup tests continue to pass; no new test
  asserts runtime enforcement of `strictContext` because that path is
  out of scope.)
