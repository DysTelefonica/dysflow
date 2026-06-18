# Proposal: MCP Override Validation Alignment

## Intent

Dynamically wrap MCP services in `stdio.ts` to respect per-call configuration/database overrides and align schemas for `run_vba`, `dysflow_doctor`, `relink_directory`, and `cleanup_access_operation`. This resolves the limitation where overrides are ignored due to static startup services, prevents operation leakage, and preserves Clean Architecture boundaries.

## Scope

### In Scope
- Dynamic wrapper `createDynamicServices` in `stdio.ts` replacing static service instances.
- Extend `run_vba`, `dysflow_doctor`, `relink_directory`, and `cleanup_access_operation` schemas with override and strict context properties.
- Update core contracts (`AccessVbaRequest`, `AccessDiagnosticsRequest`, `AccessQueryRequest`) and mappers to retain override fields.
- Wrap `cleanupService` and `orphanCleanupService` in dynamic resolution.
- Pass `timeoutMs` to config-loading options.
- Add unit/E2E tests for overrides.

### Out of Scope
- Leaking configuration/target resolution into core service implementations.
- Modifying non-MCP/HTTP adapters.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `mcp-stdio-adapter`: Exposes override parameters for vba execution, diagnostic checks, directory relinking, and operation cleanup, and resolves targets per-call.

## Approach

Refactor `createUnavailableServices` to `createDynamicServices`, which is always active. If no overrides are present, it yields cached startup services. If overrides are present, it dynamically loads config, instantiates, and caches services per-request configuration, preventing operation leakage using cache keys.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/contracts/index.ts` | Modified | Add optional override fields to request envelopes. |
| `src/core/runner/access-runner.ts` | Modified | Include optional overrides in diagnostics request. |
| `src/core/mapping/access-query-request-mapper.ts` | Modified | Forward overrides in request mappers. |
| `src/adapters/mcp/schemas/` | Modified | Update tool schemas to allow override parameters. |
| `src/adapters/mcp/alias-tools.ts` | Modified | Copy overrides into request envelopes. |
| `src/adapters/mcp/stdio.ts` | Modified | Refactor service initialization to always use dynamic wrapping. |
| `test/` | Modified | Add unit and E2E coverage for overrides. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Operation leakage | Low | Use hash-based cache keys of all resolved config fields. |
| Timeout overrides ignored | Med | Add `timeoutMs` explicitly to config-loading options. |

## Rollback Plan

Revert the git commit and restore the static service initialization path in `stdio.ts`.

## Dependencies

None

## Success Criteria

- [ ] Unit tests verify schemas allow override parameters.
- [ ] Unit/E2E tests verify that invoking MCP tools with overrides dynamically targets the correct database/root without leaking operations.
