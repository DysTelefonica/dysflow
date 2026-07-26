# shared-validation Specification

## Purpose

Define a protocol-neutral validation capability that adapters can share without importing from each other. The capability owns JSON-schema-like validation contracts and reusable schema atoms for HTTP and MCP request validation while preserving existing adapter behavior.

Define validation and response behavior for the three output modes (`"summary"`, `"file"`, `"full"`) across the six Access form tools, allowing clients to optimize payload sizes.

## Requirements

### Requirement: Protocol-Neutral Input Validation

The system MUST provide shared input validation that accepts a request payload and a JSON object schema, returning the same observable success and validation-error semantics currently used by adapter request guards.

#### Scenario: Valid payload passes validation

- GIVEN a schema with required string fields and no additional properties
- WHEN a payload satisfies the schema
- THEN validation MUST succeed
- AND the validated input MUST be available to the caller without adapter-specific coupling

#### Scenario: Invalid payload returns validation details

- GIVEN a schema with a required non-empty string field
- WHEN a payload omits the field or provides an empty value
- THEN validation MUST fail with a descriptive validation error
- AND the caller MUST be able to convert that error into its protocol-specific response

### Requirement: Shared Schema Type Contracts

The system MUST expose reusable schema type contracts for object schemas, primitive property types, arrays, enums, required fields, length limits, numeric bounds, and additional-property restrictions.

#### Scenario: Schema contracts describe request shape

- GIVEN an adapter defines a request schema using the shared contracts
- WHEN TypeScript checks the schema definition
- THEN the schema MUST be accepted without importing adapter-owned schema types

#### Scenario: Unsupported property shape is rejected at validation time

- GIVEN a request schema limits a property to an enum or primitive type
- WHEN a payload provides a value outside that contract
- THEN validation MUST fail before the adapter executes the request

### Requirement: Shared Request Schema Atoms

The system MUST expose shared request schema atoms and HTTP request schemas so repeated fields such as project context, Access path overrides, SQL query bodies, VBA execution bodies, and cleanup bodies remain consistent across adapters.

#### Scenario: Adapter reuses shared request fields

- GIVEN an adapter needs project context or Access override fields
- WHEN it builds a request schema
- THEN it MUST reuse the shared schema atoms instead of duplicating incompatible definitions

#### Scenario: HTTP request body schemas remain strict

- GIVEN an HTTP POST route validates a request body
- WHEN the body contains missing required fields, invalid field types, or additional properties
- THEN validation MUST reject the body before routing to core services

### Requirement: Adapter Boundary Preservation

The system MUST NOT require an adapter to import validation code or HTTP schemas from another adapter. Existing MCP import paths that are part of the public adapter surface SHOULD remain backward compatible through re-exports.

#### Scenario: HTTP adapter avoids MCP dependency

- GIVEN the HTTP adapter validates incoming requests
- WHEN it imports validation functions or schemas
- THEN it MUST import them from the shared validation capability, not from the MCP adapter

#### Scenario: MCP compatibility import still works

- GIVEN existing MCP code imports validation contracts from established MCP schema modules
- WHEN the shared validation extraction is applied
- THEN those imports SHOULD continue to resolve to the same validation behavior

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

### Requirement: Output Mode Parameter Schema Validation

The system MUST validate the optional `outputMode` parameter on the schemas for `form_serialize`, `form_deserialize`, `form_add_control`, `form_move_control`, `form_rename_control`, and `create_form_from_template`.

#### Scenario: Valid outputMode parameter is accepted

- GIVEN a form tool schema
- WHEN the request contains `outputMode` with value `"summary"`, `"file"`, or `"full"`
- THEN validation MUST succeed

#### Scenario: Invalid outputMode parameter is rejected

- GIVEN a form tool schema
- WHEN the request contains `outputMode` with an unsupported string value
- THEN validation MUST fail

### Requirement: Form Serialization Output Modes

The `form_serialize` tool MUST support response filtering based on `outputMode` while maintaining backward compatibility with `includeSerialized`.

#### Scenario: Serialize summary mode

- GIVEN a `form_serialize` request with `outputMode: "summary"`
- WHEN the tool executes successfully
- THEN the response MUST omit `serialized`
- AND the response MUST include `name`, `kind`, `byteEqual`, `byteDiff`, and `metadataReport`

#### Scenario: Serialize file mode

- GIVEN a `form_serialize` request with `outputMode: "file"`
- WHEN the tool executes successfully
- THEN the response MUST include `serialized`
- AND the response MUST omit `metadataReport`, `byteEqual`, and `byteDiff`

#### Scenario: Serialize full mode

- GIVEN a `form_serialize` request with `outputMode: "full"`
- WHEN the tool executes successfully
- THEN the response MUST include both metadata fields and `serialized`

#### Scenario: Serialize default fallback

- GIVEN a `form_serialize` request with no `outputMode`
- WHEN `includeSerialized` is true
- THEN the output mode MUST default to `"full"`
- WHEN `includeSerialized` is false or omitted
- THEN the output mode MUST default to `"summary"`

### Requirement: Form Deserialization Output Modes

The dry-run form deserialization (`form_deserialize` with `apply: false` / `dryRun: true`) MUST filter response payload size based on `outputMode`.

#### Scenario: Deserialize dry-run summary mode

- GIVEN a dry-run `form_deserialize` request with `outputMode: "summary"`
- WHEN the tool executes successfully
- THEN the response MUST omit `preview`

#### Scenario: Deserialize dry-run file mode

- GIVEN a dry-run `form_deserialize` request with `outputMode: "file"`
- WHEN the tool executes successfully
- THEN the response MUST include `preview`
- AND the response MUST omit gate status details

### Requirement: Form Mutation Output Modes

Form mutation tools (`form_add_control`, `form_move_control`, `form_rename_control`) and clone tools (`create_form_from_template`) MUST respect `outputMode` for dry-run and clone results.

#### Scenario: Mutation dry-run summary mode

- GIVEN a dry-run form mutation request with `outputMode: "summary"`
- WHEN the tool executes successfully
- THEN the response MUST omit `source`

#### Scenario: Clone summary mode

- GIVEN a form clone request with `outputMode: "summary"`
- WHEN the tool executes successfully
- THEN the response MUST omit `targetSource`

#### Scenario: Default mutation and clone behavior

- GIVEN a form mutation or clone request with no `outputMode`
- WHEN the tool executes successfully
- THEN the output mode MUST default to `"full"`
- AND the response MUST include the complete source code (`source` or `targetSource`)
