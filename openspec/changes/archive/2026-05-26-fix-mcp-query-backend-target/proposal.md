# Proposal: fix(mcp): query tools must honor backend database targets

## Intent

Fix issue #370: MCP SQL query tools currently lose backend target intent. `dysflow_query_execute` and legacy `query_sql` can query frontend/default databases while backend-only tables return table-not-found, even though list/schema tools already honor explicit backend/database targets.

## Scope

### In Scope
- Add target override support to modern and legacy MCP query tool contracts.
- Preserve `backendPath`, `databasePath`, and `sourcePath` through adapter mapping into query requests.
- Route generic SQL reads/writes through the same target-resolution helpers used by target-aware schema actions.
- Add strict TDD coverage before production edits: adapter contract tests, runner/script targeting characterization, and targeted regression proof.
- Plan stacked-to-main delivery slices under 400 changed lines per PR.

### Out of Scope
- New backend-specific SQL tool names.
- Changing Access SQL syntax, password resolution, or unrelated MCP tools.
- Broad frontend/backend targeting refactors outside issue #370.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `mcp-stdio-adapter`: query tools must accept and forward backend/database target overrides.
- `access-core-runner`: generic SQL execution must resolve the selected read/write database target before executing.

## Approach

Use the minimal target-propagation fix from exploration: expose target fields in query schemas, map them into `AccessQueryRequest`, and update the PowerShell runner path for generic SQL so target precedence stays `databasePath/sourcePath` > `backendPath` > CurrentDb.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/mcp/schemas.ts` | Modified | Expose target overrides. |
| `src/adapters/mcp/tools.ts` | Modified | Preserve target fields. |
| `scripts/dysflow-access-runner.ps1` | Modified | Resolve SQL targets. |
| `test/adapters/mcp/tools.test.ts` | Modified | Adapter RED tests. |
| `test/core/runner/access-runner.test.ts` | Modified | Runner characterization. |
| `openspec/specs/*` | Modified | Delta specs. |

## Acceptance Criteria

- [ ] `dysflow_query_execute` can target backend-only tables through explicit backend/database fields.
- [ ] `query_sql` accepts equivalent target fields and forwards them instead of dropping intent.
- [ ] Generic SQL read/write uses resolved database targets without regressing CurrentDb fallback.
- [ ] Existing list/schema target behavior remains unchanged.
- [ ] `pnpm test` and `pnpm build` pass.
- [ ] After implementation/verification/PR chain, prepare release title `fix(mcp): query tools must honor backend database targets`, unless repo convention requires version title plus notes.

## Delivery Plan

Stacked-to-main, force chained:
1. PR1 adapter target contract + tests, `<150` changed lines.
2. PR2 runner generic SQL targeting + tests, `<250` changed lines.
3. PR3 optional regression/docs/release prep, only if needed, `<200` changed lines.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Generic writes bypass existing safety | Medium | RED tests for write target and guard behavior. |
| Frontend-local callers regress | Medium | Preserve CurrentDb fallback tests. |
| Real Access regression is environment-sensitive | Low | Keep deterministic and skippable if added. |

## Rollback Plan

Revert the failing stacked PR slice. No new tool names or migrations are introduced, so rollback restores previous frontend/default SQL behavior.

## Dependencies

- Strict TDD: `pnpm test` before/after production edits; `pnpm build` for verification.
- Existing target-resolution helpers.

## Success Criteria

- [ ] Issue #370 scenario works for backend-only tables.
- [ ] Target precedence is specified and tested.
- [ ] Each PR stays below 400 changed lines and remains independently reviewable.
