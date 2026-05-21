# Tasks: Fix Runtime Launcher Home

## Strict TDD

- [x] RED: install with custom `--runtime-dir` generates a `.ps1` launcher pointing to the wrong default home.
- [x] GREEN: generated `.ps1` uses selected runtime dir.
- [x] GREEN: bump patch version and changelog.
- [x] Verify: `pnpm test && pnpm build`.
