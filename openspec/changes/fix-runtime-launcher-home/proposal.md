# Proposal: Fix Runtime Launcher Home

## Issue

GitHub issue: #131

## Problem

The generated PowerShell launcher hardcodes `$env:LOCALAPPDATA\dysflow` as `DYSFLOW_HOME`, ignoring `dysflow install --runtime-dir <dir>`.

## Goal

Make generated launchers consistently use the selected runtime directory.

## Acceptance Criteria

- `dysflow.ps1` sets `DYSFLOW_HOME` to the selected runtime dir.
- Existing `dysflow.cmd` and MCP config command behavior remains compatible.
- Patch release bump and changelog entry.
