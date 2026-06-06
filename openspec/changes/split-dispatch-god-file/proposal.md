# Proposal: Split Dispatch God File

## Intent

Issue #442 flags `src/adapters/mcp/dispatch.ts` as high-risk MCP technical debt: one 512-line adapter file mixes route data, alias handlers, dispatch factory logic, and registration. This is behavior-preserving decomposition, not feature work.

## Scope

### In Scope
- Split `dispatch.ts` into focused adapter modules: routes, alias tools, dispatch factory, and registration glue.
- Preserve public exports currently consumed through `src/adapters/mcp/tools.ts`.
- Use strict TDD approval/port coverage before production changes; runner: `pnpm test`.
- Keep clean architecture: adapters may depend on core; core must not depend on adapters.

### Out of Scope
- New MCP tools, schemas, route behavior, or feature work.
- Moving SQL guard/domain behavior to core; related audit debt, separate change.
- Production runtime, opencode config, or Access/VBA binary changes.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None. Internal adapter refactor only; no spec-level behavior change.

## Approach

First characterize observable MCP behavior through existing port-level tests and any missing approval coverage for tool registration/handler outcomes. Then move responsibilities into named modules while keeping exported contracts stable and avoiding test rewrites tied to file layout.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/mcp/dispatch.ts` | Modified | Thin facade/registration or focused compatibility barrel |
| `src/adapters/mcp/dispatch-routes.ts` | New | Routes, route types, query action map |
| `src/adapters/mcp/alias-tools.ts` | New | Alias handlers and alias-name set |
| `src/adapters/mcp/dispatch-factory.ts` | New | Generic dispatch tool factory and read-mode guard |
| `src/adapters/mcp/tools.ts` | Modified | Stable imports/re-exports and tool creation behavior |
| `test/adapters/mcp/*.test.ts` | Modified | Port tests only if current coverage has gaps |

## Open Design Forks

- Keep `dispatch.ts` as compatibility barrel vs delete it and update imports. Barrel is safer.
- Leave `rejectWriteSqlInReadMode` in adapter split vs extract separately. Keep in adapter for scope control.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Handler/schema drift | Med | Approval tests assert observable tool registration and outputs |
| Implementation-coupled tests | Med | Test MCP port behavior, not module internals |
| Review budget overrun | Low | Single structural slice; no feature edits |

## Rollback Plan

Revert the decomposition commit/PR. No migration, config, runtime install, or data changes expected.

## Dependencies

- Strict TDD; no Standard Mode fallback.
- Repo standards: clean architecture, behavior/port tests, `pnpm test`.

## Success Criteria

- [ ] `dispatch.ts` responsibilities are split into readable focused modules.
- [ ] MCP tool names, schemas, hidden flags, write gates, and handler results are unchanged.
- [ ] MCP dispatch tests stay green under `pnpm test`.
- [ ] Tests cover port behavior and do not couple to the file split.
