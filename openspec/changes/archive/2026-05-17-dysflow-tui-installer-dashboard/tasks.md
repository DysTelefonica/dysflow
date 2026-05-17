# Tasks: Dysflow TUI Installer Dashboard

## Review Workload Forecast

- Chained PRs recommended: Yes
- 400-line budget risk: High if implemented in one PR
- Decision needed before apply: No — user explicitly requested SDD hybrid automatic, strict TDD, and chained PRs
- Chain strategy: feature-branch-chain
- Version target: 0.2.0

## Tracker PR — SDD artifacts

- [x] Create GitHub issue #118
- [x] Create proposal/spec/design/tasks artifacts
- [ ] Open draft tracker PR from `feat/tui-dashboard-tracker` to `main`

## PR 1 — Config state + uninstall helpers

Goal: make install/uninstall behavior safe and testable before UI.

Strict TDD:

- [ ] RED: tests prove each agent config can detect a Dysflow MCP entry.
- [ ] RED: tests prove unselected agents remove only Dysflow-owned MCP entries and preserve unrelated config.
- [ ] GREEN: implement detection helpers.
- [ ] GREEN: implement uninstall helpers for Codex, OpenCode, Claude, and Pi.
- [ ] REFACTOR: keep existing install code paths calling shared helpers.
- [ ] Verify: `pnpm test && pnpm build`.

Expected branch: `feat/tui-dashboard-config`
Base: `feat/tui-dashboard-tracker`

## PR 2 — Dashboard rendering + version status

Goal: pure rendering and version comparison with injectable latest-version provider.

Strict TDD:

- [ ] RED: dashboard render includes ASCII logo, local version, latest version, and menu options.
- [ ] RED: outdated render includes update command.
- [ ] RED: unknown latest version is non-fatal.
- [ ] RED: integration list render shows checkbox state and cursor.
- [ ] GREEN: implement pure render helpers.
- [ ] GREEN: implement version status helper/provider interface.
- [ ] Verify: `pnpm test && pnpm build`.

Expected branch: `feat/tui-dashboard-render`
Base: `feat/tui-dashboard-config`

## PR 3 — Default TUI flow + docs + release version

Goal: wire the feature end-to-end.

Strict TDD:

- [x] RED: no-arg `runCli([])` dispatches TUI instead of help.
- [x] RED: explicit `--help` still prints help.
- [x] RED: applying integration selection installs selected and uninstalls unselected agents.
- [x] GREEN: implement dashboard entry flow.
- [x] GREEN: update docs and bump version to `0.2.0`.
- [x] Verify: `pnpm test && pnpm build`.

Expected branch: `feat/tui-dashboard-flow`
Base: `feat/tui-dashboard-render`

## Archive

- [ ] After all child PRs merge through the chain, archive OpenSpec change and publish `v0.2.0` release.
