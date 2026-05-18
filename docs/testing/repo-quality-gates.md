# Repository Quality Gates

Owner: repo-engineering-hardening

## Current gates

- `pnpm test` runs the Vitest suite.
- `pnpm build` runs the TypeScript build.
- Lint currently uses TypeScript strict checking through `pnpm lint`
  (`tsc --noEmit`).
- `pnpm coverage` runs Vitest coverage for `src/**/*.ts`.

## Follow-up

Coverage starts at a 0% floor so the first CI slice is enforceable without
blocking unrelated hardening work. Raise the threshold after the baseline is
stable, and replace the TypeScript-only lint gate with a dedicated style linter
when the team chooses one.
