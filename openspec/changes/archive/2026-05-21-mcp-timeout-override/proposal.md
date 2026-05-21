# Proposal: mcp-timeout-override

## Intent

Fix #254 by exposing `timeoutMs` in MCP input schemas for legacy VBA tools that execute Access/VBA runner work, so callers can override long-running VBA operations per request instead of relying only on project defaults.

## Scope

### In Scope
- Add `timeoutMs` schema support to legacy VBA MCP tools that invoke `VbaSyncLegacyService` runner paths.
- Preserve existing `VbaSyncLegacyService` timeout precedence: per-call `params.timeoutMs` > project config/process timeout.
- Add unit/schema tests proving `timeoutMs` is accepted and passed through.

### Out of Scope
- E2E fixture updates or unrelated Access fixture changes.
- New timeout semantics for query/core tools outside legacy VBA runner work.
- PRs over the 400-line review budget; use a chained slice if scope grows.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `mcp-stdio-adapter`: legacy VBA tool schemas accept `timeoutMs` where runner-backed work supports it.
- `access-core-services`: `VbaSyncLegacyService` preserves per-call timeout pass-through to the VBA manager executor.

## Approach

Add a shared `timeoutMs` schema property, include it on runner-backed legacy VBA schemas, and lock behavior with focused tests in MCP schema/unit coverage. First verify the service pass-through tests already cover `params.timeoutMs`; only change service code if a gap appears.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/mcp/tools.ts` | Modified | Add `timeoutMs` to relevant legacy VBA tool schemas. |
| `src/core/services/vba-sync-legacy-service.ts` | Verify/Maybe Modified | Confirm or preserve per-call timeout precedence. |
| `test/adapters/mcp/*schema*.test.ts` | Modified | Assert schema exposes `timeoutMs` for targeted tools. |
| `test/core/services/vba-sync-legacy-service.test.ts` | Verify/Maybe Modified | Ensure timeout override is passed to executor. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Exposing timeout on non-runner legacy tools | Medium | Limit schema additions to tools handled by `VbaSyncLegacyService`. |
| Review slice grows past 400 lines | Low | Keep tests focused; defer E2E/fixture churn. |

## Rollback Plan

Revert the schema additions and focused tests. No data migration or runtime configuration rollback is required.

## Dependencies

- Existing Vitest suite: `pnpm test`.
- Build/type check: `pnpm build`.

## Success Criteria

- [ ] MCP schemas accept `timeoutMs` for legacy VBA runner-backed tools.
- [ ] Unit tests prove explicit `timeoutMs` reaches the VBA manager executor.
- [ ] No unrelated E2E fixture changes are included.
