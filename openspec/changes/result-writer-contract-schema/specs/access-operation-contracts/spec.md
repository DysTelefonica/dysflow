# Delta for access-operation-contracts

## ADDED Requirements

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
