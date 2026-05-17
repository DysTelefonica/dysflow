# Archive Report: Dysflow TUI Installer Dashboard

## Status

Completed and merged through chained PRs.

## GitHub Trace

- Issue: #118 `feat(tui): make dysflow open an installer dashboard by default`
- PR #119: `docs: track TUI installer dashboard feature`
- PR #120: `feat: add Dysflow MCP config state helpers`
- PR #123: `feat: add TUI dashboard render helpers`
- PR #124: `feat: wire TUI dashboard flow`

## Verification

- `pnpm test` — 22 files / 161 tests passed
- `pnpm build` — passed

## Released Surface

- No-arg `dysflow` opens the TUI dashboard.
- `--help` and `-h` remain explicit help paths.
- Dashboard render helpers show local/latest versions and update guidance.
- Integration selection apply installs selected agents and removes unselected Dysflow MCP config entries.
- Version bumped to `0.2.0`.
