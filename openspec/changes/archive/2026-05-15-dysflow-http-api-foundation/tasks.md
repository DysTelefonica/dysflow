# Tasks: Dysflow HTTP API Foundation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 900-1,300 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 test/tooling -> PR 2 CLI+core contracts/config -> PR 3 runner+services -> PR 4 MCP+docs -> PR 5 HTTP final |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Test/tooling foundation | PR 1 | Creates runner before production code. |
| 2 | CLI + core config/contracts | PR 2 | Depends on PR 1; no adapters. |
| 3 | Access runner/services | PR 3 | Depends on PR 2; fake-runner tests. |
| 4 | MCP stdio + architecture docs | PR 4 | Depends on PR 3; preserve stdout safety. |
| 5 | HTTP local API + docs | PR 5 | Final phase only; choose server library first. |

### Approved Issue Chain

| PR | Issue | Branch intent | Base |
|----|-------|---------------|------|
| Tracker | #1 | `feat/dysflow-http-api-foundation` | `main` |
| PR 1 | #2 | `feat/strict-tdd-foundation` | tracker branch |
| PR 2 | #3 | `feat/cli-config-contracts` | PR 1 branch |
| PR 3 | #4 | `feat/access-runner-services` | PR 2 branch |
| PR 4 | #5 | `feat/mcp-adapter-docs` | PR 3 branch |
| PR 5 | #6 | `feat/http-api-adapter` | PR 4 branch |

## Phase 1: Test Tooling Foundation

- [x] 1.1 RED: create `C:\Proyectos\dysflow\test\cli\help.test.ts` proving `dysflow --help` dispatch shape before CLI exists.
- [x] 1.2 GREEN: create `package.json`, `tsconfig.json`, `vitest.config.ts`, and minimal `src\cli\index.ts` so `pnpm test` runs.
- [x] 1.3 REFACTOR: add `pnpm build` and keep test fixtures fake-only; do not touch `C:\Proyectos\workflow\skills\dysflow`.

## Phase 2: CLI, Configuration, Contracts

- [x] 2.1 RED/GREEN: test and implement `src\cli\commands\*.ts` for `mcp`, `setup`, `doctor`, `tui`, and planned `serve` usage/errors.
- [x] 2.2 RED/GREEN: test and implement `src\core\config\dysflow-config.ts` for Access path, timeout, env input, and password redaction.
- [x] 2.3 RED/GREEN: test and implement `src\core\contracts\*.ts` for `OperationResult`, diagnostics, typed errors, VBA/query requests.

## Phase 3: Access Runner and Core Services

- [x] 3.1 RED/GREEN: test and implement `src\core\runner\access-runner.ts` with timeout and sanitized PowerShell output mapping.
- [x] 3.2 RED/GREEN: test and implement `src\core\services\*.ts` using fake runners for VBA, query, and diagnostics scenarios.
- [x] 3.3 REFACTOR: enforce `src\core\**` imports no MCP/HTTP modules.

## Phase 4: MCP Adapter and Product Docs

- [x] 4.1 RED/GREEN: test and implement `src\adapters\mcp\*` tool registration over core services with safe error translation.
- [x] 4.2 RED/GREEN: wire `dysflow mcp`, `setup`, and `doctor` to core without stdout pollution.
- [x] 4.3 Create `docs\architecture\dysflow-core-and-adapters.md` documenting dependency direction and legacy compatibility.

## Phase 5: HTTP Adapter Final

- [x] 5.1 Decide HTTP server library, then RED/GREEN `src\adapters\http\*` for `127.0.0.1` default bind and JSON read routes.
- [x] 5.2 RED/GREEN: implement write routes blocked by default unless explicitly enabled.
- [x] 5.3 Create `docs\api\http-api.md` with route schemas and script examples.
