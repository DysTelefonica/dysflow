# Archive Report: fix-mcp-tool-name-underscores

| Field | Value |
|-------|-------|
| Change Name | `fix-mcp-tool-name-underscores` |
| Status | CLOSED |
| Archive Date | 2026-05-24 |
| Delivery | 1 PR |

## Summary

Renamed modern Dysflow MCP tool names from dotted (`dysflow.vba`, `dysflow.query`, `dysflow.doctor`, `dysflow.access`) to underscore-separated (`dysflow_vba`, `dysflow_query`, `dysflow_doctor`, `dysflow_access`) for compatibility with MCP clients that require underscore separators. Updated unit tests, architecture tests, smoke runners, and all documentation references. Added a regression test asserting that no modern tool name contains a dot.

## PRs

| PR | Title | Status |
|----|-------|--------|
| PR1 | Assert and enforce underscore naming for modern MCP tools | Merged → PR #321 |

## Key Artifacts

- `src/adapters/mcp/tools.ts` — renamed modern tool identifiers
- `test/adapters/mcp/tools.test.ts` — new regression test (no dots in modern names)
- `test/adapters/mcp/*.ts` — updated assertions
- `test/architecture/core-boundary.test.ts` — boundary tests use underscore names
- `E2E_testing/*.mjs` — smoke calls updated
- `README.md`, `docs/**`, `CHANGELOG.md` — documentation updated
