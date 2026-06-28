# Proposal: Close #584, #586, #587 — Access smoke evidence, MCP E2E sandboxing, and tool contract metadata

## Intent

Close three approved reliability/architecture issues in `main` with formal SDD and strict TDD. The change makes Windows Access smoke evidence explicit, prevents the real MCP E2E harness from mutating repository fixtures, and reduces contract drift between modern `dysflow_*` tools and legacy/generated MCP tool surfaces.

## Scope

### #584 — Windows Access smoke evidence

In scope:
- Add CI-visible Access smoke evidence that distinguishes executed tests from skipped Access-dependent tests.
- Fail the Windows smoke job when Access E2E test files are all skipped while the job claims to provide Access evidence.
- Identify the release-grade Access gate separately from best-effort Windows smoke.

Out of scope:
- Requiring Access COM or fixture databases on every Windows CI runner.
- Changing the Pester baseline or Linux quality job behavior.

### #586 — MCP E2E fixture isolation

In scope:
- Ensure `E2E_testing/mcp-e2e.mjs` copies frontend/backend databases and source fixtures into a temp sandbox before tool execution.
- Route all write/relink/export/import operations to sandbox paths, never repository fixture paths.
- Document cleanup and preserve-on-failure behavior for the sandbox.

Out of scope:
- Changing the external fixture files in `E2E_testing/`.
- Reworking the MCP protocol harness beyond the paths needed for isolation.

### #587 — Modern/legacy MCP contract convergence

In scope:
- Introduce shared MCP tool contract metadata for write/safety/read-only classification where practical.
- Guard modern and legacy/generated descriptions against divergence from shared metadata.
- Add parity tests that cover overlapping capabilities and contract safety metadata.

Out of scope:
- Renaming public MCP tools.
- Removing legacy aliases.
- Changing runtime behavior of query/VBA services beyond metadata and descriptions.

## Approach

Use one reviewable work unit per issue, direct commits to `main` per the repo-specific `dysflow main-only` policy, and strict TDD for every unit:

1. Write a RED test for the issue-specific contract.
2. Implement the minimum GREEN fix.
3. Triangulate when the spec has multiple scenarios.
4. Run focused tests, then relevant broader tests.
5. Commit and push each issue fix separately with SDD and issue traceability.
6. After all fixes are green locally and in GitHub Actions, archive the SDD change and close issues with evidence comments.

## Affected Capabilities

- `windows-access-smoke-evidence` — CI reporting and skip/execute evidence for Access-dependent Windows tests.
- `mcp-e2e-fixture-isolation` — real MCP E2E harness fixture copy/sandbox policy.
- `mcp-tool-contract-surface` — shared MCP tool safety/write metadata and parity tests.

## Compatibility and Rollback

- CI evidence changes are additive and can be rolled back by reverting the #584 commit.
- E2E sandboxing changes affect only test harness paths and can be rolled back without changing runtime code.
- Tool contract metadata must preserve all existing public tool names and schemas; rollback is a single metadata/test commit revert.
