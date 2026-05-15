# Proposal: Dysflow HTTP API Foundation

## Intent

Turn Dysflow into a real product foundation for Access/VBA automation while keeping HTTP as the final adapter, not the core. The current implementation is an old stdio-only MCP skill at `C:\Proyectos\workflow\skills\dysflow`; this change builds a tested, protocol-neutral Dysflow core before exposing it through MCP, CLI flows, and finally HTTP for production scripts.

## Scope

### In Scope
- Create a Node.js/TypeScript product skeleton with `dysflow mcp`, `setup`, `doctor`, `tui`, and planned `serve`.
- Define protocol-neutral configuration, result envelopes, and Access/VBA/query contracts.
- Wrap existing PowerShell/Access behavior behind core services and a safe runner boundary.
- Add MCP stdio adapter over core services before HTTP.
- Add final local-first HTTP adapter with guarded read/write behavior.

### Out of Scope
- Rewriting the old workflow MCP skill in place.
- Making HTTP the first implementation phase.
- Implementing unsupported clients beyond documented placeholders.

## Capabilities

### New Capabilities
- `product-cli`: Dysflow CLI command surface and setup/doctor/tui behavior.
- `core-configuration`: Project, Access path, password redaction, and timeout resolution.
- `access-operation-contracts`: Protocol-neutral result and Access/VBA/query contracts.
- `access-core-services`: PowerShell runner boundary and Access services.
- `mcp-stdio-adapter`: MCP tool registration over core services.
- `http-api-adapter`: Local-first HTTP API contracts, routes, auth/write policy, and script examples.

### Modified Capabilities
- None. `openspec/specs/` currently has no existing capability specs.

## Approach

Build inside-out: skeleton and tests first, then configuration/contracts, then core services, then MCP adapter and product flows, and only then `dysflow serve`. Strict TDD is active; the first apply slice must establish the test runner before production code.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `package.json`, `tsconfig.json`, `src/cli/` | New | Product CLI and command dispatcher. |
| `src/core/` | New | Config, contracts, runtime boundary, and services. |
| `src/adapters/mcp/` | New | MCP stdio adapter over core. |
| `src/adapters/http/` | New | Final HTTP adapter over core. |
| `test/` | New | TDD coverage for CLI, core, MCP, and HTTP. |
| `docs/` | Modified/New | Architecture and HTTP API docs. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| HTTP leaks core/Access internals | Med | Enforce core-first contracts and adapter dependency direction. |
| Production Access files are touched in tests | Med | Use fake runners and smoke tests only against controlled processes. |
| PR becomes too large | High | Split by work units; chained PRs likely needed before apply. |

## Rollback Plan

Revert the change folder and implementation commits. The old stdio MCP skill remains untouched at `C:\Proyectos\workflow\skills\dysflow`, so existing workflows can continue using it.

## Dependencies

- Node.js, TypeScript, pnpm.
- `@modelcontextprotocol/sdk`.
- Windows PowerShell/Access runtime for real integration.

## Success Criteria

- [ ] Core contracts/services have tests and contain no MCP/HTTP concepts.
- [ ] `dysflow mcp` preserves stdio protocol safety.
- [ ] `dysflow serve` binds to `127.0.0.1` by default and disables writes by default.
- [ ] HTTP docs include stable script examples for production callers.
