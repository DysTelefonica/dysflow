# Design: Dysflow TUI Installer Dashboard

## Context

Dysflow is a Node/TypeScript CLI with command handlers under `src/cli/commands`. The existing `tui` command delegates to `install`, so there is no real dashboard yet. Gentle-AI uses a Bubble Tea/Lipgloss TUI with reusable render functions, Rose Pine-like colors, a branded logo header, checkbox/radio option renderers, and separate screens for selection/installing/completion.

Dysflow will replicate the appearance pattern, not the Go implementation: reusable pure rendering functions first, then a small Node readline-driven flow for interaction.

## Architecture

### Slice 1 — Config state and install/uninstall helpers

Add explicit install/uninstall primitives around existing config writers:

- expose supported agent list;
- detect whether each agent currently has a Dysflow MCP entry;
- install selected agents using existing config functions;
- remove Dysflow entries for unselected agents while preserving other entries;
- keep non-interactive `dysflow install --agents ...` behavior unchanged.

This slice is protocol/config logic only, no TUI rendering.

### Slice 2 — Dashboard rendering and version status

Add pure TUI rendering helpers:

- compact ASCII Dysflow logo;
- dashboard frame inspired by Gentle-AI style;
- local version from package/runtime package.json;
- latest version provider interface;
- update guidance when latest > local;
- checkbox-style integration list rendering.

Default latest provider may use GitHub releases when available, but tests must inject fake providers.

### Slice 3 — Default command and interactive flow

Wire:

- no-arg `dysflow` -> TUI handler;
- `--help` / `-h` remains help;
- interactive dashboard option `Install / Integrations`;
- checkbox toggles and apply;
- selected agents installed, unselected agents uninstalled;
- version bump to `0.2.0` and README/docs updates.

## TUI visual pattern

Use a small ASCII header instead of Gentle-AI's large rose:

```text
╔════════════════════════════════════╗
║  ____            __ _              ║
║ |  _ \ _   _ ___/ _| | _____      ║
║ | | | | | | / __| |_| |/ _ \     ║
║ | |_| | |_| \__ \  _| | (_) |    ║
║ |____/ \__, |___/_| |_|\___/     ║
║        |___/                       ║
╚════════════════════════════════════╝
local: 0.2.0   latest: 0.2.1
update: pnpm add -g git+https://github.com/DysTelefonica/dysflow.git#v0.2.1

▸ Install / Integrations
  Doctor
  Exit
```

Checkbox screen:

```text
Select Dysflow MCP integrations
Use ↑/↓ to move, space to toggle, enter to apply.

▸ [x] opencode
  [x] pi
  [ ] codex
  [ ] claude

enter: apply • esc: back
```

## Chained PR plan

```text
Tracker PR: SDD artifacts and delivery map
PR 1: Config state + uninstall helpers
PR 2: TUI render/version status helpers
PR 3: Interactive flow + default entrypoint + docs/version 0.2.0
```

## Risks

- Terminal raw-mode differences on Windows. Mitigate by keeping first flow readline/simple key handling and testing pure functions.
- Latest release network calls can slow startup. Mitigate with timeout and non-fatal `unknown` latest status.
- Config uninstall must not remove non-Dysflow entries. Mitigate with fixture tests per agent config shape.
