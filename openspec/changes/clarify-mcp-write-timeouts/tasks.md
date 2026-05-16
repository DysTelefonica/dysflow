# Tasks: clarify-mcp-write-timeouts

- [x] RED: added timeout cancellation-signal assertion; test failed because executor received no signal.
- [x] RED/GREEN: added write alias coverage for `apply: true` and `dryRun: false` while preserving default dry-run.
- [x] GREEN: added `AbortSignal` to manager requests and made `executeWithTimeout` own timer/cancellation.
- [x] GREEN: made `spawnVbaManager` kill only on abort signal.
- [x] VERIFY: `pnpm test` passed — 20 files / 124 tests.
- [x] VERIFY: `pnpm build` passed — `tsc -p tsconfig.json`.
