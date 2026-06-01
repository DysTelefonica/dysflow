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
Current floors (set on PR2 of product-quality-fixes):

| Metric     | Floor |
|------------|-------|
| statements | 86%   |
| branches   | 75%   |
| functions  | 88%   |
| lines      | 86%   |

Raise the thresholds after significant coverage improvements.
