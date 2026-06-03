# Proposal: Dry-Run Explicit Warning

## Intent

Make implicit dry-run behavior visible for write-capable MCP tools. Today, omitting both `apply` and `dryRun` safely defaults to dry-run, but the response does not tell callers that execution was skipped by default.

## Scope

### In Scope
- Add a visible `DRY_RUN_DEFAULT:` MCP content warning when write-capable tools default to dry-run because both flags were omitted.
- Preserve current safe behavior: omission remains dry-run, not a validation error.
- Add strict TDD coverage before implementation for affected MCP write paths.

### Out of Scope
- Changing core write semantics or Access service contracts.
- Requiring callers to provide `apply` or `dryRun`.
- Changing non-write tools or unrelated VBA sync dispatch behavior.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `mcp-stdio-adapter`: MCP write-capable tool responses must surface a visible warning when dry-run is selected by omitted flags.

## Approach

Extend MCP adapter dry-run resolution so call sites can distinguish `isDryRun` from `wasDefault`. For write-gated paths in `handleValidatedLegacyWrite` and `createLegacyDispatchTool`, keep the normal result content stable and append an additional text content item containing `DRY_RUN_DEFAULT:` only when both `apply` and `dryRun` were omitted.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/mcp/tools.ts` | Modified | Dry-run resolution metadata and warning content emission. |
| `test/adapters/mcp/tools.dry-run.test.ts` | Modified | RED tests for omitted flags warning on write-capable tools. |
| `test/adapters/mcp/tools.test.ts` | Modified | Integration coverage for MCP result content shape where needed. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Clients that iterate every content item may see new warning text. | Medium | Use a clear sentinel and keep `content[0]` unchanged. |
| Warning emitted for explicitly requested `dryRun:true`. | Low | Test omitted-flags condition separately from explicit dry-run. |
| Write-capable dispatch paths diverge. | Medium | Centralize helper logic and cover both direct and dispatched paths. |

## Rollback Plan

Remove the warning helper, `wasDefault` threading, and related tests. Existing `resolveIsDryRun()` behavior already preserves the safe dry-run default, so rollback restores only silent responses.

## Dependencies

- Strict TDD: write failing Vitest assertions before production changes; do not run tests during proposal phase.

## Success Criteria

- [ ] Omitted `apply` and `dryRun` on affected write-capable MCP tools returns dry-run plus a `DRY_RUN_DEFAULT:` content item.
- [ ] Explicit `apply:true`, `dryRun:false`, or `dryRun:true` does not emit the omitted-flags warning.
- [ ] Existing primary response payload remains available at `content[0]`.
