# access-core-services Specification

## Purpose

Provide Access/VBA/query services behind a safe PowerShell runner boundary and propagate real-time progress.

## Requirements

### Requirement: Runner Boundary

The system MUST execute Access-related work only through a bounded runner interface with timeouts and sanitized outputs. Services MUST also propagate any optional `onProgress` callback from their caller to the runner without modification.

#### Scenario: Service calls runner
- GIVEN a valid Access operation request
- WHEN a core service executes it
- THEN it SHALL call the runner boundary
- AND return a protocol-neutral result

#### Scenario: Runner timeout
- GIVEN a runner exceeds its timeout
- WHEN the service handles completion
- THEN it MUST return a timeout error

#### Scenario: Seam refactor preserves behavior
- GIVEN characterization coverage exists for a sync path
- WHEN a seam refactor is applied
- THEN observable runner calls and protocol-neutral results MUST remain equivalent

#### Scenario: Untested path blocks refactor
- GIVEN a sync path lacks characterization coverage
- WHEN decomposition is proposed
- THEN implementation MUST add coverage before changing the path

### Requirement: VBA Sync Adapter Characterization

The system MUST characterize `VbaSyncAdapter` behavior before introducing seams or decomposition.

### Requirement: Progress Callback Forwarding

`VbaService` and `QueryService` MUST accept an optional `onProgress` callback from their caller context and MUST forward it unchanged to the underlying runner call. Neither service MAY alter, wrap, or suppress the callback before forwarding.

When the caller does not supply `onProgress`, the service MUST call the runner without an `onProgress` option, preserving the original call contract.

#### Scenario: vba-service forwards onProgress to runner
- GIVEN a `vba-service` execute call with `onProgress` provided in the service options
- WHEN the service invokes the runner
- THEN the runner MUST receive the same `onProgress` reference
- AND progress callbacks fired by the runner MUST reach the original caller

#### Scenario: query-service forwards onProgress to runner
- GIVEN a `query-service` execute call with `onProgress` provided in the service options
- WHEN the service invokes the runner
- THEN the runner MUST receive the same `onProgress` reference
- AND progress callbacks fired by the runner MUST reach the original caller

#### Scenario: Service called without onProgress
- GIVEN a service execute call with no `onProgress` in options
- WHEN the service invokes the runner
- THEN the runner MUST be called without an `onProgress` option
- AND the service result MUST be identical to its pre-change behavior

### Requirement: VBA Form Service Module

`src/core/services/vba-form-service.ts` MUST own the operations `validateFormSpec`, `generateForm`, `catalogAddControl`, `harvestFormCatalog`, and `resolveFormSpec`. These functions MUST be exported from this module.

#### Scenario: Form operations importable from vba-form-service
- GIVEN a consumer that needs `validateFormSpec` or `generateForm`
- WHEN they import
- THEN the symbol MUST be resolvable from `vba-form-service.ts`

#### Scenario: Not duplicated in vba-sync-adapter
- GIVEN `vba-sync-adapter.ts`
- WHEN it needs a form operation
- THEN it MUST import from `vba-form-service.ts`, not reimplement it

### Requirement: VBA Source Comparison Module

`src/core/services/vba-source-comparison.ts` MUST own the operations `compareSourceAgainstBinary`, `compareVbaSourceTrees`, and `collectVbaSourceFiles`. These functions MUST be exported from this module.

#### Scenario: Comparison operations importable from vba-source-comparison
- GIVEN a consumer that needs `compareSourceAgainstBinary`
- WHEN they import
- THEN the symbol MUST be resolvable from `vba-source-comparison.ts`

### Requirement: VBA Sync Adapter Public API Preserved

`VbaSyncAdapter` MUST retain its existing public API. Callers MUST require no import path or signature changes after the split.
(Previously: the service contained all form and comparison logic inline; now it delegates.)

#### Scenario: Public API unchanged
- GIVEN existing call sites for `VbaSyncAdapter`
- WHEN the split lands
- THEN all call sites MUST compile and pass tests without modification

#### Scenario: Delegation to sub-modules
- GIVEN the service receives a form-related operation
- WHEN it executes
- THEN it MUST delegate to `vba-form-service.ts` — not contain inline form logic

