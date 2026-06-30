# Delta for access-core-services

## ADDED Requirements

### Requirement: Core Form Mutation Service

The system MUST provide protocol-neutral services for adding, moving, and renaming form controls. The service MUST accept parsed form source and MUST return mutated form source without leaking adapter concerns.

#### Scenario: Core add-control operation
- GIVEN a parsed form and a valid control payload
- WHEN add-control is executed
- THEN the service MUST return mutated form source
- AND it MUST preserve existing form semantics

#### Scenario: Core move-control operation
- GIVEN a parsed form and an existing control reference
- WHEN move-control is executed
- THEN the service MUST update only control position semantics
- AND it MUST preserve control identity and bindings

#### Scenario: Core rename-control operation
- GIVEN a parsed form and an existing control name
- WHEN rename-control is executed
- THEN the service MUST update only the control name
- AND it MUST preserve the rest of the control definition

### Requirement: Serialization Preservation Gate

The core service MUST preserve opaque Access form serialization data during supported mutations and MUST reject operations that would lose required bytes or metadata.

#### Scenario: Benchmark fixture remains stable
- GIVEN the canonical benchmark form source
- WHEN a supported mutation is applied
- THEN opaque serialization data MUST remain preserved
- AND the result MUST remain suitable for downstream import validation

#### Scenario: Unsafe mutation is rejected
- GIVEN a mutation would strip opaque metadata
- WHEN the service validates the operation
- THEN it MUST fail safely
- AND it MUST return a protocol-neutral validation error
