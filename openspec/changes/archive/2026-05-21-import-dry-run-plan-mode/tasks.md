# Tasks: Import Dry-run Plan Mode

## Strict TDD

- [x] RED: multi-worktree dry-run with cwd staging + projectId develop must resolve develop and not touch Access.
- [x] RED: unknown explicit project id must fail without cwd fallback.
- [x] RED: explicit overrides win and report `explicit-overrides`.
- [x] RED: `import_modules` dry-run returns only requested modules.
- [x] RED: `import_all` dry-run detects all modules and count from destination root.
- [x] GREEN: implement dry-run plan service/path without Access open or operation registration.
- [x] GREEN: implement strictContext expected-path checks for real runs.
- [x] GREEN: include target diagnostics on dry-run plan.
- [x] Verify: `pnpm test && pnpm build`.
