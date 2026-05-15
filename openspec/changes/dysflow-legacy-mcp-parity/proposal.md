# Proposal: Dysflow Legacy MCP Parity

## Intent

Dysflow must fully replace the legacy `C:\Proyectos\workflow\skills\dysflow` MCP server before the old skill-based runtime can be retired. The current product runtime exposes a safer foundation, but only 5 MCP tools versus 46 legacy tools.

## Scope

### In Scope
- Port all 46 legacy MCP tools into the new Dysflow runtime without depending on old skill folders.
- Preserve the new Access operation registry, PID ownership, timeout metadata, safe cleanup, and secret redaction model.
- Keep Windows PowerShell 5.1 compatibility for every Access-opening path.
- Implement through strict TDD and chained PR slices mapped to GitHub issues #25-#29.

### Out of Scope
- Reusing `C:\Proyectos\workflow\skills\*` as production dependencies.
- Removing the legacy MCP before parity is verified.
- Adding unrelated UI flows beyond the MCP install/TUI work already tracked separately.

## Capabilities

### New Capabilities
- `mcp-legacy-parity`: Full MCP tool parity with the legacy Dysflow aggregator.

### Modified Capabilities
- `mcp-stdio-adapter`: Expand available tools from the current product subset to the full legacy-compatible surface.
- `access-core-services`: Add concrete domain services for VBA sync, query/schema/write/link/maintenance/form operations.

## Approach

Use the legacy MCP as the behavioral inventory, not as a runtime dependency. Build new typed Dysflow service modules behind the existing MCP adapter. Each slice adds failing tests first, then the minimal service/adapter implementation, then docs and E2E probes. PRs stay chained by capability area.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/mcp` | Modified | Register legacy-compatible tool names and map them to core services. |
| `src/core/services` | Modified/New | Add services for VBA sync, testing, query/schema/write/link/querydef/form/maintenance operations. |
| `scripts/` | Modified/New | Add PowerShell 5.1 runners where Access COM/DAO behavior needs process isolation. |
| `test/` | Modified/New | Add TDD coverage for every migrated tool and safety contract. |
| `README.md`, `docs/testing` | Modified | Document parity status and E2E verification. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Parity PR becomes unreviewable | High | Split into child issues #25-#29 and chained PRs. |
| Access process safety regresses | Medium | Require operation metadata tests for every Access-opening tool. |
| Old skill dependency leaks in | Medium | Add architecture tests forbidding production imports from legacy skill paths. |
| Write tools become unsafe | High | Preserve dry-run defaults, allowTable/denyTable guards, and explicit tests. |

## Rollback Plan

Each child PR is independently revertible. Do not remove or disable the legacy MCP until all child issues are closed and parity E2E passes. If a slice fails, revert only that slice and keep the previous Dysflow runtime operational.

## Dependencies

- Legacy inventory from `C:\Proyectos\workflow\skills\access-vba-sync\mcp.js` and `C:\Proyectos\workflow\skills\access-query\mcp.js`.
- Microsoft Access / ACE availability for live E2E probes.
- Windows PowerShell 5.1 compatibility.

## Success Criteria

- [ ] Dysflow MCP exposes every legacy tool name or a documented backwards-compatible alias.
- [ ] Every legacy tool has strict TDD coverage.
- [ ] Access-opening tools return operation metadata and are visible in `list_access_operations`.
- [ ] Cleanup remains possible only through validated `cleanup_access_operation` / Dysflow cleanup equivalent.
- [ ] `pnpm build` and `pnpm test` pass.
- [ ] E2E checklist against the provided frontend/backend passes.
