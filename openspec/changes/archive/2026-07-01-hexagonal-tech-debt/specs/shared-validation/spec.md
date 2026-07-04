# Delta for shared-validation

Closed by **PR 5** (`[#624/5] #D JSON Schema validator: enforce schema-form
additionalProperties`). The boolean form of `additionalProperties` is
already enforced at `src/shared/validation/validator.ts:80-84`; the schema
form (`{ type: "string" }`, `{ enum: [...] }`, etc.) is accepted by the
type `src/shared/validation/schemas.ts:23` but treated as `true` by the
validator — the explicit gap documented at `schemas.ts:16-23`.

## ADDED Requirements

### Requirement: Schema-form additionalProperties is enforced

`validateInput` MUST enforce `additionalProperties` when the value is a
`JsonSchemaProperty` (the schema form, e.g.
`additionalProperties: { type: "string" }`) — in addition to the existing
boolean-form enforcement. When an object payload contains an extra key
whose value does NOT conform to the supplied schema, validation MUST fail
with a descriptive error that names the offending key, the expected type
(or enum), and the actual value's type.

The boolean form (`additionalProperties: false` / `true`) MUST remain
byte-equivalent to the pre-change behavior (regression-safe).

#### Scenario: schema form accepts a valid extra key (happy path)

- **GIVEN** a schema with
  `additionalProperties: { type: "string" }`
- **WHEN** the payload is `{ a: "hello", b: "world" }`
- **THEN** validation MUST succeed
- **AND** the validated payload MUST be returned to the caller

#### Scenario: schema form rejects extra key with wrong primitive type (sad path)

- **GIVEN** a schema with
  `additionalProperties: { type: "string" }`
- **WHEN** the payload contains `{ a: "hello", b: 42 }`
- **THEN** validation MUST fail
- **AND** the error MUST name the offending path (e.g. `b`)
- **AND** the error message MUST read approximately `expected string, got number`

#### Scenario: schema form rejects disallowed enum value (edge)

- **GIVEN** a schema with
  `additionalProperties: { enum: ["a", "b", "c"] }`
- **WHEN** the payload contains `{ x: "d" }`
- **THEN** validation MUST fail
- **AND** the error MUST name `d` as the disallowed value

#### Scenario: schema form enforces recursively in nested objects (adversarial)

- **GIVEN** a schema with nested `properties.nested.additionalProperties: { type: "number" }`
- **WHEN** the payload is
  `{ nested: { y: "not a number", z: 99 } }`
- **THEN** validation MUST fail
- **AND** the error MUST include the nested path (e.g. `nested.y`)
- **AND** the valid sibling `z` MUST NOT trigger its own error

#### Scenario: boolean `false` form still rejects extra keys (regression)

- **GIVEN** a schema with `additionalProperties: false`
- **WHEN** the payload contains any extra key
- **THEN** validation MUST fail
- **AND** the error message MUST be equivalent to the pre-change behavior
  (no wording drift)

#### Scenario: boolean `true` form still allows extra keys (regression)

- **GIVEN** a schema with `additionalProperties: true`
- **WHEN** the payload has extra keys of any type
- **THEN** validation MUST succeed
- **AND** this MUST be byte-equivalent to pre-change behavior

#### Scenario: object property's own properties still validate (regression)

- **GIVEN** a schema with
  `{ properties: { a: { type: "number" } }, additionalProperties: { type: "string" } }`
- **WHEN** the payload is `{ a: "not-a-number", b: "ok" }`
- **THEN** validation MUST fail on `a` (wrong type for a declared property)
- **AND** the validator MUST still continue (or report) on `b`'s allowed
  schema — both sites MUST be reached, in either order, before returning
  the first error

### Test surface

| Test file | New test name | Class |
|---|---|---|
| `test/shared/validation/validator.test.ts` | `additionalProperties: { type: "string" } accepts valid extra keys` | happy |
| `test/shared/validation/validator.test.ts` | `additionalProperties: { type: "string" } rejects extra key with wrong primitive type` | sad |
| `test/shared/validation/validator.test.ts` | `additionalProperties: { enum: [...] } rejects disallowed value` | edge |
| `test/shared/validation/validator.test.ts` | `additionalProperties schema form is enforced recursively in nested objects` | adversarial |
| `test/shared/validation/validator.test.ts` | `additionalProperties: false still rejects extra keys (regression)` | regression |
| `test/shared/validation/validator.test.ts` | `additionalProperties: true still allows extra keys (regression)` | regression |
