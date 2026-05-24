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

