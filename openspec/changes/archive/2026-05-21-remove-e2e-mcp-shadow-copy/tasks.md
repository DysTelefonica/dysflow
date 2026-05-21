# Tasks: remove-e2e-mcp-shadow-copy

## Review Workload Forecast

| Field | Value |
| --- | --- |
| Estimated changed lines | 80-160 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Delivery strategy | Single PR for GitHub issue #94 |

## Strict TDD

- [x] RED: added `test/architecture/e2e-mcp-boundary.test.ts`; `pnpm test` failed because `.gitignore` contained blanket `E2E_testing/`.
- [x] GREEN: replaced blanket ignore with targeted Access binary fixture ignores.
- [x] GREEN: documented the E2E boundary in `E2E_testing/README.md`.
- [x] GREEN: architecture test prevents future `E2E_testing/src/adapters/mcp` shadow copies and scans helper TS for known divergence signatures.
- [x] VERIFY: `pnpm test` passed — 20 test files / 120 tests.
- [x] VERIFY: `pnpm build` passed — `tsc -p tsconfig.json`.

## Non-goals

- Do not run real Access E2E in CI.
- Do not track local Access binary fixtures.
- Do not modify production MCP behavior for this issue.
