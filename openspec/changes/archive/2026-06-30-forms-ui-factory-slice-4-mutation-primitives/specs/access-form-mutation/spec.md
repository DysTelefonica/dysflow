# access-form-mutation Specification

## Purpose

Provide safe, protocol-neutral form UI mutation primitives for Access forms.

## Requirements

### Requirement: Form UI Mutation Primitives

The system MUST expose add, move, and rename control mutations over parsed form UI source. These mutations MUST preserve existing event bindings, control ordering semantics, and opaque serialization data.

#### Scenario: Add control preserves existing form data
- GIVEN a valid parsed form source and a new control definition
- WHEN add-control is applied
- THEN the resulting form source MUST include the new control
- AND existing bindings and opaque serialization data MUST remain intact

#### Scenario: Move control changes position only
- GIVEN a form source with an existing control
- WHEN move-control is applied
- THEN the control MUST appear at the new position
- AND its identity, bindings, and serialization data MUST remain unchanged

#### Scenario: Rename control changes name only
- GIVEN a form source with an existing control name
- WHEN rename-control is applied
- THEN the control MUST use the new name
- AND its type, bindings, and serialization data MUST remain unchanged

### Requirement: Round-Trip Safety for Form Serialization

The system MUST preserve opaque Access form bytes and metadata when mutating form UI through the form source pipeline. This includes `PrtDevMode`, `Checksum`, and form format bytes.

#### Scenario: Mutation preserves serialization payloads
- GIVEN a benchmark form with serialization metadata
- WHEN any supported mutation is applied and the form is round-tripped
- THEN `PrtDevMode` MUST remain unchanged
- AND `Checksum` MUST remain unchanged
- AND format bytes MUST remain unchanged unless the mutation legitimately changes layout content

#### Scenario: Unsupported destructive rewrite is rejected
- GIVEN a mutation request would discard opaque serialization data
- WHEN the mutation is validated
- THEN the system MUST reject the request
- AND it MUST report a safe validation failure
