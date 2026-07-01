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

### Requirement: Form Template Cloning Service

The system MUST provide a protocol-neutral service that clones an existing source form into a new target form by applying a caller-supplied token map to the source layout text. Token replacement scope MUST be limited to the source layout (`.form.txt`) content only (OQ1: code-behind `.cls` token replacement is a non-goal for this slice). The service MUST preserve the source form's opaque serialization data so the cloned target satisfies the `serializeFormTxt` round-trip property: a manual clone-and-replace on the same source MUST be byte-equivalent to the service result, with no metadata loss.

The service resolves source and target locations against the project's canonical form source location (OQ2: bench-cache-first vs project-root-first resolution is deferred to design).

#### Scenario: Clone preserves round-trip byte-equivalence
- GIVEN a source form and a token map whose keys all appear in the source
- WHEN the clone-from-template operation runs
- THEN the service MUST return a target form whose serialized layout is byte-equivalent to a manual clone-and-replace on the same source
- AND opaque serialization metadata (Checksum, PrtDevMode, Format bytes) MUST remain preserved

#### Scenario: Token replacement never touches preserved metadata
- GIVEN a source form where a token appears on a section that also holds `PrtDevMode`
- WHEN the operation applies the token map
- THEN replacement MUST occur only in user-modifiable layout strings
- AND the preserved metadata bytes MUST remain byte-equivalent

### Requirement: Token Map Application Policy

Tokens MUST use the `{{Token}}` syntax by default (OQ3). When a token is present in the source but absent from the token map, the service MUST leave the token verbatim, emit a structured per-token warning, and still return success — the `warn-pass-through` policy (OQ4). When the caller passes strict token-map enforcement, an unmapped source token MUST cause a typed error and MUST NOT write a target form. An invalid token map MUST fail with a typed, actionable error.

#### Scenario: All tokens mapped
- GIVEN a source form and a token map covering every source token
- WHEN the operation runs
- THEN every token MUST be replaced with its mapped value
- AND the result MUST report no missing-token warnings

#### Scenario: Missing token warns and passes through
- GIVEN a source token that has no entry in the token map
- WHEN the operation runs without strict enforcement
- THEN the token MUST be left verbatim in the target
- AND the result MUST include a structured warning naming the missing token
- AND the operation MUST still return success

#### Scenario: Strict enforcement rejects missing token
- GIVEN a source token absent from the token map
- WHEN the operation runs with strict token-map enforcement enabled
- THEN it MUST return a typed error
- AND no target form MUST be written

#### Scenario: Invalid token map is rejected
- GIVEN a token map with a non-string key or value, malformed token syntax, or an empty token key
- WHEN the operation validates the map
- THEN it MUST return a typed error with an actionable message
- AND no target form MUST be written

### Requirement: Target Form Existence Policy

When the target form already exists, the service MUST reject the operation by default (OQ5). The caller MAY request overwrite; when overwrite is requested, the service MUST replace the existing target through the gated restore path so a failed load restores prior state.

#### Scenario: Absent target is created
- GIVEN a target form that does not yet exist
- WHEN the clone operation runs
- THEN the service MUST create the target from the token-replaced source

#### Scenario: Existing target without overwrite is rejected
- GIVEN a target form that already exists
- WHEN the clone operation runs without an overwrite request
- THEN it MUST return a typed error
- AND it MUST NOT modify the existing target

