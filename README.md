# Dysflow

Dysflow is a professional Access/VBA automation product for AI-assisted development workflows.

It is intended to become a single installable tool that can run as:

```bash
dysflow mcp
dysflow setup
dysflow tui
dysflow doctor
```

## Vision

Dysflow will consolidate the current Access/VBA synchronization, testing, backend query, diagnostics, and agent setup workflows into one product-oriented distribution.

The target experience is:

```bash
pnpm dlx @dystelefonica/dysflow setup
```

or:

```bash
pnpm add -g @dystelefonica/dysflow
dysflow setup
```

## Goals

- Provide a single canonical MCP server for Access/VBA projects.
- Offer a TUI-guided setup for Codex, OpenCode, Claude Code, and other MCP clients.
- Configure frontend/backend Access paths, passwords, timeouts, and diagnostics safely.
- Preserve compatibility with the existing Dysflow MCP while the product is migrated.
- Support strict TDD workflows for Access/VBA test suites.

## Non-goals for the first migration

- Do not break the currently working MCP in `workflow`.
- Do not rewrite all runtime logic at once.
- Do not remove compatibility wrappers until the new product is proven.

## Architecture direction

Inspired by Engram, Dysflow should evolve toward a CLI-first product with multiple modes:

- `dysflow mcp` — MCP stdio server.
- `dysflow setup` — agent/client configuration.
- `dysflow tui` — interactive terminal UI.
- `dysflow doctor` — diagnostics for Access, COM, PowerShell, bitness, locks, and MCP configuration.

The existing Node/PowerShell implementation will be migrated behind a stable product interface before any deeper runtime rewrite is considered.

## Status

Early productization repository. The initial work must follow SDD and strict TDD, while keeping the current production MCP untouched.
