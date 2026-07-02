# Delta for `access-operation-contracts` — `2026-07-01-mcp-contract-safety`

Scope: Finding #6b — schema-vs-runtime parity for the cleanup path. The
legacy `cleanup_access_operation` handler drops the same fields the modern
handler drops; both advertise them via `CLEANUP_SCHEMA`
(`vba-sync-schemas.ts:14-26`). The proposal encodes "fix modern's surface
drop; defer core-service runtime enforcement." This delta pins the
**handler-level contract** only.

## ADDED Requirements

### Requirement: Cleanup Schema-vs-Runtime Field Parity

For every JSON-schema field advertised in `CLEANUP_SCHEMA`, the typed
request that reaches the MCP handler boundary (`buildCleanupRequest` in
`alias-tools.ts:88-108` AND its modern equivalent) MUST either:

(a) honor the field at runtime, OR

(b) mark the field `deprecated: true` in `CLEANUP_SCHEMA`.

Currently, (a) applies to `force`, `projectId`, `contextId`, `backendPath`,
`destinationRoot`, `projectRoot`, `timeoutMs`, `accessPath`. The fields
`strictContext`, `expectedAccessPath`, `expectedProjectRoot`,
`expectedDestinationRoot` are advertised but not consumed by the core
service. This requirement makes **handler-level pass-through** mandatory;
core-service enforcement remains out of scope.

#### Scenario: legacy pass-through is unchanged (regression guard)

- GIVEN a fake `cleanupService.cleanup` that records its input
- WHEN `cleanup_access_operation` is invoked with the full schema field set
- THEN `cleanupService.cleanup` MUST be called exactly once
- AND the captured input MUST include every schema-declared field
- (Pin: extend `test/adapters/mcp/alias-tools.test.ts` —
  `buildCleanupRequest passes through schema-declared fields`)

#### Scenario: modern `dysflow_access_cleanup` carries every schema field (NEW gate)

- GIVEN the same fake
- WHEN `dysflow_access_cleanup` is invoked with the full schema field set
- THEN the typed request MUST carry every schema-declared field
- AND the cast `validatedInput as {operationId, accessPath, force?}` MUST be replaced by a builder mirroring `buildCleanupRequest`
- (Pin: `test/adapters/mcp/tools.test.ts` — new
  `dysflow_access_cleanup modern pass-through mirrors buildCleanupRequest`)

#### Scenario: parity matrix — modern and legacy fields match

- GIVEN the same input to both builders
- THEN the field sets MUST be equal (ignoring `undefined`)
- AND no schema-declared field MAY be present in only one set
- (Pin: `test/adapters/mcp/alias-tools.test.ts` — new
  `legacy and modern pass-through field sets are equal`)

### Requirement: Documented Scope Split Between Handler and Core

This change fixes the modern handler's surface only. It does **NOT** make
`AccessOperationCleanupService.cleanup()` consume `strictContext` or the
`expected*` fields at runtime. A separate capability change is required
to make those fields enforceable; until then, the typed request carries
the values forward-compatibly and downstream services ignore what they
do not yet understand.

#### Scenario: deferred core-service enforcement is not silently added

- GIVEN the PR for this change is merged
- WHEN `dysflow_access_cleanup` is invoked with `strictContext: true` and
  a non-matching `expectedAccessPath`
- THEN `AccessOperationCleanupService.cleanup` executes its current
  path unchanged (it does NOT compare paths against `expectedAccessPath`)
- AND no contract in this PR claims otherwise
- (Pin: implicit; existing cleanup tests continue to pass; no new test
  asserts runtime enforcement of `strictContext` because that path is
  out of scope.)
