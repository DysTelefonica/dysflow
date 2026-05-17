# Proposal: Fix MCP projectId Worktree Resolution

## Issue

GitHub issue: #128

## Problem

When MCP calls include an explicit `projectId` / `contextId`, Dysflow still resolves `.dysflow/project.json` from the MCP process cwd. In multi-worktree usage, this can make a develop-targeted import run against staging paths.

## Goal

Make explicit project identity drive config resolution before cwd fallback.

## Resolution Priority

1. Explicit path/root overrides (`accessPath`, `backendPath`, `destinationRoot`, `projectRoot`).
2. Registered project matching explicit `projectId` / `contextId`.
3. Cwd `.dysflow/project.json` only when no explicit project identity was provided.

## Non-goals

- Replacing `.dysflow/project.json`.
- Requiring callers to pass absolute paths when a project is registered.

## Acceptance Criteria

- Multi-worktree regression test: cwd staging + explicit develop project resolves develop paths.
- Explicit unknown project id fails clearly; no silent cwd fallback.
- Doctor/import diagnostics include requested/resolved project identity and resolved paths.
- Strict TDD evidence is recorded.
