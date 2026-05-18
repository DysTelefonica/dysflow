# Repository Quality Gates

Owner: repo-engineering-hardening

## Current gates

- `pnpm test` runs the Vitest suite.
- `pnpm build` runs the TypeScript build.
- Lint currently uses TypeScript strict checking through `pnpm lint`
  (`tsc --noEmit`).
- `pnpm coverage` runs Vitest coverage for `src/**/*.ts`.

## Coverage thresholds

Thresholds are set at measured baseline minus 2 percentage points (ADR-6).
Current floors (set on PR2 of product-quality-fixes):

| Metric     | Floor |
|------------|-------|
| statements | 86%   |
| branches   | 75%   |
| functions  | 88%   |
| lines      | 86%   |

Raise the thresholds after significant coverage improvements, and replace the
TypeScript-only lint gate with a dedicated style linter when the team chooses one.
