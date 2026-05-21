# Delta for access-core-services

## ADDED Requirements

### Requirement: verify_code and verify_binary Must be Non-mutating Compare Operations

`VbaSyncLegacyService` MUST compare disk source modules against a fresh temporary export from Access, MUST keep both source and Access non-mutating, and MUST return deterministic comparison summaries.

- `verify_code` and `verify_binary` MUST run export using a temporary directory, never the configured `destinationRoot`.
- Returned payload MUST include `matched`, `different`, `missingInSource`, `missingInBinary`, `dryRun: true`, and `willModifyAccess: false`.
- `diff: true` MAY include `diffs`; when absent, `diffs` MUST be omitted.

#### Scenario: Verify summarizes matching and mismatched modules

- GIVEN two disk modules, one identical and one different, and one binary-only module
- WHEN `verify_code` runs with `diff: true`
- THEN result MUST be `ok: false`
- AND include correct counts in `matched`, `different`, and `missingInBinary`
- AND source files must remain unchanged on disk

#### Scenario: Verify with module filter

- GIVEN multiple source modules exist but one is requested via `moduleNames`
- WHEN `verify_binary` runs with `moduleNames: ["Module1"]`
- THEN compare only that module
- AND the result MUST NOT report unrelated modules

### Requirement: reconcile_binary Must Produce a Safe Dry-Run Plan

`reconcile_binary` MUST reuse the same source-vs-binary comparison contract as verify tools and return a non-applying plan.

#### Scenario: Reconcile only proposes changes

- GIVEN compare detects differences between source and exported binary modules
- WHEN `reconcile_binary` is invoked
- THEN result MUST include `operation: "reconcile_binary"`, `willModifyAccess: false`, `dryRun: true`
- AND return a `recommendation` that instructs users to review and apply reconciliation explicitly outside this tool

#### Scenario: Reconcile when no differences exist

- GIVEN source and binary are already aligned
- WHEN `reconcile_binary` runs
- THEN `ok` MUST be true and recommendation MUST state that no reconciliation is needed

### Requirement: exists Alias Compatibility

For legacy `exists`, the service MUST accept both `moduleName` and `name` keys as equivalent aliases.

#### Scenario: `name` and `moduleName` map to the same module input

- GIVEN a call to `exists` with `moduleName: "Form_Main"`
- WHEN service builds the manager request
- THEN it MUST request `moduleNames: ["Form_Main"]`

#### Scenario: Legacy alias path remains supported

- GIVEN a call to `exists` with `name: "Form_Secondary"`
- WHEN legacy mapping executes
- THEN request module list MUST include `"Form_Secondary"`

### Requirement: Repo-local projectId Resolution

MCP calls that provide `projectId` MUST be able to resolve the current repository's `.dysflow/project.json` when the requested project id matches the config id, and MUST reject mismatched ids before Access operations run.

#### Scenario: Matching projectId loads repo-local config

- GIVEN `.dysflow/project.json` contains `id: "access-project"`
- WHEN config is loaded with `projectId: "access-project"`
- THEN the repo-local config MUST load successfully
- AND write policy such as `allowWrites` MUST come from that repo-local config

#### Scenario: Mismatched projectId is rejected

- GIVEN `.dysflow/project.json` contains `id: "configured-project"`
- WHEN config is loaded with `projectId: "other-project"`
- THEN loading MUST fail with `CONFIG_PROJECT_ID_MISMATCH`
