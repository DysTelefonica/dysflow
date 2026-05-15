# SDD Init — dysflow

Detected: 2026-05-15
Persistence mode: hybrid
Project root: C:\Proyectos\dysflow

## Repository State

- Early productization repository with `README.md` and planning docs only.
- No `package.json`, `tsconfig.json`, source tree, test directory, CI config, linter config, or formatter config exists in this repo yet.
- Existing implementation reference is outside this repo at `C:\Proyectos\workflow\skills\dysflow`; it is stdio MCP-only and must remain untouched during productization.

## Stack Direction

- Target stack from repo docs/plan: Node.js + TypeScript + pnpm.
- Planned runtime adapters: CLI (`mcp`, `setup`, `doctor`, `tui`, later `serve`), MCP stdio adapter, final HTTP API adapter.
- Planned dependencies: `@modelcontextprotocol/sdk`, PowerShell integration for Access/VBA, and Vitest or Node test runner.

## Architecture Direction

- Productize from the inside out: protocol-neutral core services first, then adapters.
- HTTP is a final adapter over the tested Dysflow core, not the product core.
- Preserve compatibility with the existing workflow MCP until the new product adapter is proven.

## Existing Implementation Reference

- `C:\Proyectos\workflow\skills\dysflow\package.json` declares `skill-dysflow`, `mcp.js`, and `node --test test/*.test.js`.
- The old implementation combines `access-vba-sync` and `access-query` tools through MCP stdio.
- Old Codex config guidance says `startup_timeout_sec` and `tool_timeout_sec` belong under `[mcp_servers.dysflow]`, not under env.
