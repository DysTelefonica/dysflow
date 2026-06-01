# Repository Quality Gates

Owner: repo-engineering-hardening

## Current gates

- `pnpm test` runs the Vitest suite.
- `pnpm build` runs the TypeScript build.
- Lint uses TypeScript strict checking and Biome (lint + format check) through `pnpm lint`
  (`tsc --noEmit && biome check`). Use `pnpm format` to auto-format, `pnpm format:check` to verify.
- `pnpm coverage` runs Vitest coverage for `src/**/*.ts`.

## Coverage thresholds

> Coverage is a **regression floor and a diagnostic, not a target.** See
> [`testing-philosophy.md`](./testing-philosophy.md) for what a good test is. Never add an
> implementation-coupled test just to raise a number.

Thresholds are set at measured baseline minus 2 percentage points (ADR-6).
Current floors (raised in GH #372 — branch coverage improvement):

| Metric     | Floor |
|------------|-------|
| statements | 82%   |
| branches   | 80%   |
| functions  | 85%   |
| lines      | 84%   |

> The CI quality gate runs `pnpm coverage` on Linux (ubuntu), where
> Windows/PowerShell-specific branches do not execute. CI branch coverage
> (~81.15%) is therefore slightly below a local Windows run (~82.08%). **CI is the
> authoritative gate — floors must stay at or below the CI measurement.** The
> branch floor is 80% (≈1pp margin under CI).

Raise the thresholds after significant coverage improvements.
