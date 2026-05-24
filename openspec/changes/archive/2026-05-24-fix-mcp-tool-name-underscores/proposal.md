# Proposal: Underscore Modern MCP Tool Names

## Intent

Make Dysflow's modern MCP tool names compatible with clients that expect action identifiers to use `_` separators. MCP allows dots, but the target Dysflow client contract requires underscores.

## Scope

### In Scope
- Rename modern MCP tools from dotted to underscore-separated names.
- Update unit tests, release matrix checks, smoke runners, and user-facing docs.
- Add a regression test that rejects dots in modern Dysflow tool names.

### Out of Scope
- Renaming legacy MCP tools; they already use underscores.
- Changing MCP protocol version or JSON-RPC method names.
- Adding temporary aliases for dotted modern names.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `mcp-tooling`: Modern Dysflow MCP tools use underscore-separated canonical names.

## Approach

Change the adapter registry source of truth in `src/adapters/mcp/tools.ts`, then update every test, smoke runner, and document reference. Treat this as a compatibility fix, not a protocol compliance fix.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/mcp/tools.ts` | Modified | Modern tool names become `dysflow_*`. |
| `test/adapters/mcp/*` | Modified | Assertions use underscore names and guard against dots. |
| `test/architecture/core-boundary.test.ts` | Modified | Boundary tests call canonical names. |
| `E2E_testing/*.mjs` | Modified | Smoke calls use canonical names. |
| `README.md`, `docs/**`, `CHANGELOG.md` | Modified | Documentation reflects canonical names. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Users calling dotted names break | Medium | Document as compatibility fix and avoid hidden divergent aliases. |
| Missed string references | Medium | Use `rg` regression search. |

## Rollback Plan

Revert the single PR branch; no data migration is involved.

## Success Criteria

- [ ] `tools/list` advertises underscore modern tool names.
- [ ] No modern `dysflow.*` tool name remains in source, tests, smoke runners, or docs.
- [ ] `pnpm test` passes.
