# Tasks: Fix MCP Backend DDL Targeting

## Review Workload Forecast

- Delivery strategy: auto-chain
- Chain strategy: stacked-to-main
- 400-line budget risk: High
- Chained PRs recommended: Yes
- Decision needed before apply: No — orchestrator selected forced chained PRs.

## PR1 — RED regression tests

- [x] Add adapter/runner tests proving explicit backend/database write targets are preserved.

## PR2 — GREEN production fix

- [x] Preserve `backendPath`, `databasePath`, and `sourcePath` through legacy MCP write mapping.
- [x] Route PowerShell write actions to `databasePath/sourcePath > backendPath > CurrentDb` with helper-owned cleanup.

## PR3 — Docs, artifacts, and broad verification

- [x] Reconstruct this missing OpenSpec task artifact from proposal/spec/design/apply progress.
- [x] Document No Conformidades backend/global vs frontend/local targeting guidance.
- [x] Run broader verification (`pnpm test`, `pnpm build`, `pnpm test:ps1` when reasonable) and merge apply progress.
