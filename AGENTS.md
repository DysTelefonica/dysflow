# AGENTS.md — dysflow

Canonical guide for **any** agent working in this repo — Claude Code, OpenCode/Codex, or otherwise.
This file is authoritative. Claude Code loads it via `CLAUDE.md` (which imports this file). Read it
before working, and do not silently override it.

## What this is

dysflow — a TypeScript **MCP + CLI runtime** that drives Microsoft Access (VBA sync, query tools,
the Access runner) through PowerShell scripts. Architecture is **hexagonal / clean**:

- `src/core` — domain and use cases (no dependency on adapters).
- `src/adapters` — MCP, HTTP, vba-sync, and the I/O boundaries.
- `src/cli` — command surface.

## Testing — READ THIS BEFORE WRITING ANY TEST

The authoritative testing criterion lives in **[`docs/testing/testing-philosophy.md`](./docs/testing/testing-philosophy.md)**.
Read it. The essence:

- **North star: a test must survive any internal refactor that preserves observable behavior.**
  If a behavior-preserving refactor turns the suite red, the test is the defect — fix the test.
- The real axis is **behavior vs implementation**, not unit vs e2e.
- **Test at the ports.** Exercise real domain/use-case logic; mock ONLY the I/O adapters
  (Access COM / PowerShell spawn, filesystem, network). Never assert on internal call order,
  private collaborators, or internal data shape.
- **Coverage is a diagnostic floor, not a target** (see
  [`docs/testing/repo-quality-gates.md`](./docs/testing/repo-quality-gates.md)). Never add an
  implementation-coupled test just to move a coverage number.

Commands:
- Unit/spec: `pnpm test` (`vitest.config.ts`).
- Integration/E2E: `vitest.integration.config.ts` (`test/e2e/**`, `test/scripts-access-runner.test.ts`) — requires Windows + Access COM.
- Real MCP E2E: `node E2E_testing/mcp-e2e.mjs` (requires `ACCESS_VBA_PASSWORD`).

## Hard rules

- **Never** build/install to or modify the production runtime at `%LOCALAPPDATA%\dysflow` or
  `~/.config/opencode/opencode.json` during development/testing. Build to the throwaway
  `test-runtime/` and point E2E at it with `DYSFLOW_E2E_COMMAND`.
- Conventional commits. No AI co-author / attribution lines in commit messages.
- A GitHub release **title must equal its tag name exactly** (e.g. tag `v1.2.8` → title `v1.2.8`).
- Keep business logic in `src/core`; never let domain logic leak into adapters.
