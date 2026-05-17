# Proposal: Dysflow TUI Installer Dashboard

## Issue

GitHub issue: #118 — `feat(tui): make dysflow open an installer dashboard by default`

## Summary

Make `dysflow` with no arguments open a first-class terminal dashboard inspired by Gentle-AI's TUI style. The dashboard will show a compact Dysflow ASCII logo, local/runtime version, latest repository version, update guidance when outdated, and an integrations installer screen where users can choose which agent/client configs should contain Dysflow MCP wiring.

## Goals

- `dysflow` with no args opens the TUI by default.
- Keep `dysflow --help` / `-h` as explicit help output.
- Render a small branded ASCII header with:
  - current local package/runtime version;
  - latest repository/release version when discoverable;
  - short update instructions when local is behind.
- Provide an Install / Integrations option below the header.
- Let users toggle agent/client IDs (`codex`, `opencode`, `claude`, `pi`) and apply the desired state.
- Install selected agents by writing Dysflow MCP config.
- Uninstall unselected agents by removing only Dysflow-owned MCP entries from their config files.
- Preserve unrelated user config.
- Keep non-interactive CLI install/update commands working.

## Non-goals

- Do not build a full Bubble Tea clone; Dysflow remains TypeScript/Node.
- Do not add an external TUI dependency unless a later slice proves it necessary.
- Do not manage non-Dysflow MCP servers.
- Do not publish PRs above reviewable size; use chained PRs.

## Delivery Strategy

Feature branch chain, review budget <=400 changed lines per child where possible:

```text
main
└─ feat/tui-dashboard-tracker        (SDD artifacts + tracker PR)
   └─ feat/tui-dashboard-config      (install/uninstall config helpers)
      └─ feat/tui-dashboard-render   (dashboard rendering + version status)
         └─ feat/tui-dashboard-flow  (default command + interactive apply + docs/version)
```

Version target: `0.2.0` because this is a feature.

## Strict TDD

Every implementation PR must show RED/GREEN evidence with Vitest before production code changes and finish with:

```powershell
pnpm test
pnpm build
```
