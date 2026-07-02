# Delta for `mcp-stdio-adapter` — `2026-07-01-mcp-contract-safety`

Scope: Finding #5 (VBA default-deny + honest contract), #6b (modern
`dysflow_access_cleanup` field pass-through), #7 (CI release
`title == tag_name`).

## ADDED Requirements

### Requirement: VBA Execution Default-Deny at the MCP Adapter

`run_vba`, `dysflow_vba_execute`, and their aliases MUST refuse to call
`services.vbaService.execute(...)` unless EITHER (1) the project config
declares a non-empty `allowedProcedures` AND `procedureName` is in that
list, OR (2) the caller passes `dryRun: true`. Refusal MUST be observable
as `isError: true` with text matching `/allowedProcedures/`.

#### Scenario: procedure not in allowlist (modern)

- GIVEN `allowedProcedures=["Refresh"]`
- WHEN `dysflow_vba_execute` is invoked with `{ procedureName: "DeleteAll" }`
- THEN result MUST have `isError: true` and text matching `/allowedProcedures/`
- AND `vbaService.execute` MUST NOT be invoked
- (Pin: `test/adapters/mcp/tools.test.ts` — new
  `dysflow_vba_execute default-deny when no allowlist match and no dryRun`)

#### Scenario: procedure not in allowlist (legacy `run_vba`)

- GIVEN `allowedProcedures=["Refresh"]`
- WHEN `run_vba` is invoked with `{ procedureName: "DeleteAll" }`
- THEN result MUST have `isError: true` and text matching `/allowedProcedures/`
- (Pin: same file — new `run_vba default-deny when no allowlist match`)

#### Scenario: allowlist unconfigured, no dryRun — closed by default

- GIVEN no allowlist configured
- WHEN `dysflow_vba_execute` is invoked with `{ procedureName: "Anything" }`
- THEN result MUST have `isError: true` and text mentioning `allowedProcedures` OR `dryRun`
- (Pin: same file — new `default-deny when allowlist is unconfigured and no dryRun`)

#### Scenario: dryRun is the explicit escape hatch

- GIVEN no allowlist configured
- WHEN `dysflow_vba_execute` is invoked with `{ procedureName: "Anything", dryRun: true }`
- THEN `vbaService.execute` MUST be invoked exactly once
- (Pin: same file — new `accepts dryRun:true as escape hatch`)

### Requirement: Tool Contract Truth

`MCP_TOOL_CONTRACTS[name].{access, writeGate, summary}` for `run_vba`,
`dysflow_vba_execute`, `test_vba` MUST match the gate the handler enforces.
After this change those three MUST classify `writeGate: "conditional"` and
their summaries MUST mention `allowlist` AND `dryRun`. The
`dispatch-routes.ts:test_vba` route (`mutatesBinary:false`) stays.

#### Scenario: reclassified contract metadata for the VBA trio

- WHEN `getMcpToolContract("dysflow_vba_execute")` is called
- THEN it MUST return `{ writeGate: "conditional" }`
- AND `summary` MUST contain `"allowlist"` AND `"dryRun"`
- (Pin: `test/adapters/mcp/mcp-tool-contracts.test.ts:36-67` — extend)

#### Scenario: description carries the contract string

- WHEN the modern handler is registered and its `description` is read
- THEN it MUST include literal `allowlist` AND `dryRun`
- (Pin: `test/adapters/mcp/mcp-tool-contracts.test.ts:69-99`)

### Requirement: Modern/Legacy Cleanup Field Pass-Through

`dysflow_access_cleanup` MUST pass through every `CLEANUP_SCHEMA` field
(via a typed builder mirroring `buildCleanupRequest`). The
`validatedInput as { operationId, accessPath, force? }` cast at
`tools.ts:151-153` MUST be replaced.

> **Open scope decision (deferred).** Core
> `AccessOperationCleanupService.cleanup()` at
> `core/operations/access-operation-cleanup.ts:72-76` accepts only
> `{operationId, accessPath, force}`. This requirement pins **handler
> pass-through** only; core-service enforcement of `strictContext` is a
> separate capability change.

#### Scenario: every schema field reaches the typed request

- WHEN `dysflow_access_cleanup` is invoked with the full schema field set
- THEN the typed request MUST carry every schema-declared field (set
  equality w/ `buildCleanupRequest`)
- (Pin: `test/adapters/mcp/tools.test.ts` — new
  `dysflow_access_cleanup modern pass-through mirrors buildCleanupRequest`)

#### Scenario: parity matrix — modern and legacy fields match

- GIVEN the same input fed through both builders
- THEN the field sets MUST be equal (ignoring `undefined`)
- (Pin: `test/adapters/mcp/alias-tools.test.ts` — new
  `legacy and modern pass-through field sets are equal`)

### Requirement: Release Pipeline Title-Match Invariant

The release pipeline MUST publish with `event.release.title ==
event.release.tag_name`. Drift MUST fail the job.

#### Scenario: release.yml sets the release name from the ref

- GIVEN `.github/workflows/release.yml`
- WHEN the `Create GitHub Release` step runs
- THEN it MUST pass `name: ${{ github.ref_name }}` (or equivalent)
- (Pin: new test in `test/quality-gates/ci-workflow.test.ts`)

#### Scenario: drift fails the release guard job

- GIVEN a `release: [created, edited]` workflow receiving a fixture
  where names differ
- THEN exit MUST be non-zero AND error MUST include both names
- (Pin: new `test/quality-gates/release-title-guard.test.ts`)
