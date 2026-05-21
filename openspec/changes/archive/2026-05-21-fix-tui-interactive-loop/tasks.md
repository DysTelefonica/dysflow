# Tasks: Fix TUI Interactive Loop

## Strict TDD

- [x] RED: no-arg TUI interactive mode stays open until exit and redraws after a down key.
- [x] RED: reviewer identified resumed stdin could keep process alive after exit.
- [x] GREEN: implement minimal dashboard key loop.
- [x] GREEN: restore stdin flow/raw state during cleanup.
- [x] GREEN: bump patch version to `0.2.1` and update changelog.
- [x] Verify: `pnpm test && pnpm build`.
