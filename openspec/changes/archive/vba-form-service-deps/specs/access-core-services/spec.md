# Delta for access-core-services

## MODIFIED Requirements

### Requirement: VBA Form Service Module

`src/core/services/vba-form-service.ts` MUST own the operations `validateFormSpec`, `generateForm`, `catalogAddControl`, `harvestFormCatalog`, and `resolveFormSpec`. These functions MUST be exported from this module.

The form service MUST expose only dependencies that are used by its observable behavior. Any dependency accepted by the service MUST be typed as a protocol-neutral port and MUST participate in at least one form-service operation; otherwise the dependency MUST be removed from the public construction surface. The service MUST preserve existing protocol-neutral result shapes and filesystem/runner-port effects for `validate_form_spec`, `generate_form`, `catalog_add_control`, and `harvest_form_catalog`.

Form-service tests MUST exercise behavior through public service/adapter ports, MUST mock only filesystem or runner I/O seams, and MUST NOT assert private fields, constructor storage, internal call order, or source-text structure.
(Previously: the module only had to own and export form operations; it did not specify real dependency seams or prohibit unused constructor dependencies.)

#### Scenario: Form operations importable from vba-form-service

- GIVEN a consumer that needs `validateFormSpec` or `generateForm`
- WHEN they import
- THEN the symbol MUST be resolvable from `vba-form-service.ts`

#### Scenario: Not duplicated in vba-sync-adapter

- GIVEN `vba-sync-adapter.ts`
- WHEN it needs a form operation
- THEN it MUST import from `vba-form-service.ts`, not reimplement it

#### Scenario: Unused dependencies are not accepted

- GIVEN a consumer constructs the form service
- WHEN the consumer supplies dependencies for execution target resolution or strict-context validation that no form operation uses
- THEN TypeScript MUST reject those dependency options or the service MUST ignore no accepted dependency
- AND all existing form operation result shapes MUST remain unchanged

#### Scenario: Used I/O dependencies are observable through behavior

- GIVEN the form service is constructed with a filesystem or runner port used by a form operation
- WHEN that operation reads, writes, or runs through the port
- THEN the returned result and observable port effects MUST match the operation contract
- AND the test MUST NOT inspect private service internals

#### Scenario: Adapter-visible form behavior is preserved

- GIVEN callers invoke `validate_form_spec`, `generate_form`, `catalog_add_control`, or `harvest_form_catalog` through the adapter boundary
- WHEN service dependency handling is refactored
- THEN public tool names, accepted parameters, errors, and success payload shapes MUST remain compatible
- AND characterization coverage MUST be written before production changes
