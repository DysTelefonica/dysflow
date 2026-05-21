# Dysflow E2E testing boundary

`E2E_testing` is reserved for real Access fixture assets and thin harness notes.

Do not keep copied Dysflow TypeScript source under this directory. In particular:

- no `E2E_testing/src/adapters/mcp/*` shadow MCP adapter;
- no copied `src/cli/commands/mcp.ts`;
- no hardcoded MCP protocol/version/schema behavior.

E2E checks must exercise the production implementation instead:

1. subprocess E2E: run the installed/built `dysflow mcp` command;
2. in-process harnesses: import production modules from `src/**` directly.

Access database files remain ignored by `.gitignore` because they are local binary fixtures.

Run the smoke harnesses from any working directory with fixture passwords supplied by environment variables:

```powershell
$env:DYSFLOW_ACCESS_PASSWORD = "<fixture password>"
$env:DYSFLOW_BACKEND_PASSWORD = "<fixture password>"
$env:ACCESS_VBA_PASSWORD = "<fixture password>"
node E2E_testing/mcp-e2e-fast-smoke.mjs
node E2E_testing/mcp-e2e-smoke.mjs
```

Curated PR-safe E2E artifacts are limited to the reusable harness scripts, this README, safe `.dysflow/project.json` configuration, and intentionally exported `src/**` fixture source evidence. Generated runtime state, copied runner scripts, temporary query/report/export output, generated form specs, Access locks, and Access binaries are ignored.
