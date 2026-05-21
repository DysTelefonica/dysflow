# Tasks: redact-mcp-error-paths

## Review Workload Forecast

| Field | Value |
| --- | --- |
| Estimated changed lines | 50-120 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Delivery strategy | Single PR for GitHub issue #95 |

## Strict TDD

- [x] RED: updated MCP error translation test; `pnpm test` failed because `C:\Proyectos\dysflow\NoConformidades.accdb` was exposed.
- [x] GREEN: added adapter-level `sanitizeErrorMessage` path redaction while preserving code and `[REDACTED]`.
- [x] GREEN: removed stale GitHub issue-number references from production-facing legacy service messages.
- [x] VERIFY: `pnpm test` passed — 19 test files / 117 tests.
- [x] VERIFY: `pnpm build` passed — `tsc -p tsconfig.json`.
