# Toolchain pinning policy

The dev toolchain (TypeScript, Vite, Vitest, coverage-v8) is pinned to **exact versions**
in `package.json` instead of caret ranges. The production SDK
(`@modelcontextprotocol/sdk`) was already exact-pinned; this aligns the dev toolchain
with the same determinism. Rationale: caret ranges on fresh majors (`^6.0.0`,
`^4.0.0`) allow silent drift to any `6.x` / `4.x` minor on dependency refresh. Even
with `pnpm-lock.yaml` and `--frozen-lockfile` stabilising CI in practice, the
`package.json` declaration is the source of truth for any developer who runs
`pnpm install` without the lockfile (or for a future migration that drops the
lockfile). `@types/node` uses a tilde range (`~22.19.0`) to allow patch-only
updates on the Node typings.

## How to update

1. Bump the version in `package.json` and run `pnpm install --lockfile-only`.
2. Run `pnpm test` and `tsc --noEmit` (both tsconfig.json and tsconfig.test.json)
   to confirm the new toolchain is compatible.
3. Commit `package.json` and `pnpm-lock.yaml` together.
