# shared-validation Specification

## Purpose

Define a protocol-neutral validation capability that adapters can share without importing from each other. The capability owns JSON-schema-like validation contracts and reusable schema atoms for HTTP and MCP request validation while preserving existing adapter behavior.

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
