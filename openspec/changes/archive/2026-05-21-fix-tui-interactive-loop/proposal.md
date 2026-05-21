# Proposal: Fix TUI Interactive Loop

## Issue

GitHub issue: #125

## Problem

After v0.2.0, `dysflow` renders the TUI dashboard but exits immediately to the shell prompt. Users cannot move through the menu with arrow keys.

## Goal

Keep the dashboard open in interactive terminals until the user exits, while preserving non-TTY safe output for tests/pipes.

## Non-goals

- Full terminal UI framework adoption.
- Complete integrations screen navigation beyond the current minimal dashboard loop.

## Acceptance Criteria

- In TTY mode, no-arg `dysflow` enters a key loop and redraws on navigation.
- `q`, `Esc`, `Ctrl+C`, or selecting Exit returns to shell cleanly.
- Raw mode and stdin flow state are restored on exit.
- Non-TTY mode still prints a single dashboard and exits.
- Patch release bump to `0.2.1`.
