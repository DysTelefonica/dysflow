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
