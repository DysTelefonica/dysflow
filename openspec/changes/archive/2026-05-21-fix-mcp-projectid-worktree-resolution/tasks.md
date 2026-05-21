# Tasks: Fix MCP projectId Worktree Resolution

## Strict TDD

- [x] RED: cwd staging + explicit develop project resolves staging today.
- [x] RED: unknown explicit project id silently falls back to cwd today.
- [x] GREEN: add project registry lookup and priority order.
- [x] GREEN: add diagnostics fields for requested/resolved config.
- [x] Verify: `pnpm test && pnpm build`.
