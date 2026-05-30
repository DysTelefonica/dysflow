# SDD Init — dysflow

Detected: 2026-05-30
Persistence mode: hybrid
Project root: C:\Proyectos\dysflow

## Repository State

- Fully structured TypeScript repository.
- `package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, and `vitest.integration.config.ts` are present and fully configured.
- The test suite is fully functional with 58 test files and 691 passing tests.
- Existing implementation reference is outside this repo at `C:\Proyectos\workflow\skills\dysflow`; it is stdio MCP-only and must remain untouched during productization.

## Stack Direction

- Runtime: Node.js (>=20.0.0)
- Package Manager: pnpm@10.17.1
- Language: TypeScript (tsconfig.json is configured, build is running `tsc -p tsconfig.json`)
- Framework/Runner: Vitest
- Linter: Biome (`@biomejs/biome`)
- Formatter: Biome
- Typechecker: tsc (`typescript`)
- Test layers:
  - Unit: Vitest (`test/core/**/*.test.ts`, `test/adapters/**/*.test.ts`, `test/cli/**/*.test.ts`, etc.)
  - Integration: Vitest (`test/integration/**/*.test.ts`)
  - E2E: Vitest (`test/e2e/**/*.test.ts`), plus MCP E2E test script (`E2E_testing/mcp-e2e.mjs`) and Pester PowerShell tests (`pwsh -Command "Invoke-Pester scripts/tests/"` via `pnpm test:ps1`)
  - Coverage: Vitest coverage-v8 (`pnpm coverage` or `vitest run --coverage`), thresholds are set in `vitest.config.ts`.
- Quality:
  - Biome checks and typescript checks are run as part of the `pnpm lint` command.

## Architecture Direction

- Productize from the inside out: protocol-neutral core services first, then adapters.
- HTTP is a final adapter over the tested Dysflow core, not the product core.
- Preserve compatibility with the existing workflow MCP until the new product adapter is proven.

## Existing Implementation Reference

- `C:\Proyectos\workflow\skills\dysflow\package.json` declares `skill-dysflow`, `mcp.js`, and `node --test test/*.test.js`.
- The old implementation combines `access-vba-sync` and `access-query` tools through MCP stdio.
- Old Codex config guidance says `startup_timeout_sec` and `tool_timeout_sec` belong under `[mcp_servers.dysflow]`, not under env.
