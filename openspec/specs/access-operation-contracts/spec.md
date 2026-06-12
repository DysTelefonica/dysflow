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
