# Proposal: Unify Path Normalization with Portable isAbsolutePath

## Intent

Issue #437 tracks a portability bug and a minor code-consistency asymmetry in path resolution.

`node:path.isAbsolute()` is POSIX-only: on Linux it returns `false` for a Windows-style path
like `"C:/db/project.accdb"`, causing the code to incorrectly join it with the current working
directory (e.g. `"/tmp/.../C:/db/project.accdb"`). Because dysflow is primarily a Windows runtime
but is also tested on Linux CI, a project config with a Windows `accessPath` fails to round-trip
correctly in the Linux test environment.

A secondary asymmetry exists in `access-operation-cleanup.ts`, which uses the lower-level
`normalizePathForMatching(commandLine).includes(normalizePathForMatching(record.accessPath))`
instead of the higher-level `pathMatchesAccessPath` that `preflight.ts` already uses for the same
logical check.

## Scope

### In Scope

- Add `isAbsolutePath(value: string): boolean` to `src/core/utils/path-utils.ts`. This function
  recognizes POSIX (`/`), Windows drive-letter (`C:/`, `c:\`), and UNC (`\\server\share`) paths as
  absolute, regardless of the host platform.
- Export `isAbsolutePath` via `src/core/utils/index.ts` (already re-exports from `path-utils.ts`).
- Migrate the four call sites that currently use `node:path.isAbsolute` to use `isAbsolutePath`:
  - `src/core/config/dysflow-config.ts` (`resolveProjectPath`, `resolvePathMaybeRelative`)
  - `src/adapters/vba-sync/vba-execution-adapter.ts` (testsPath resolution)
  - `src/cli/commands/setup.ts` (`toPortableProjectPath`)
- Fix the cleanup asymmetry: replace the inline `normalizePathForMatching(...).includes(...)` in
  `src/core/operations/access-operation-cleanup.ts` with `pathMatchesAccessPath(...)`.

### Out of Scope

- Changing path-resolution semantics (absolute-relative logic is preserved, only the absolute
  detection becomes platform-agnostic).
- Moving any VBA runner, HTTP, or MCP logic.
- Production runtime install changes.

## Capabilities

### Modified Capabilities

- `core-configuration`: the path resolution functions now recognize Windows-style absolute paths
  when running on Linux CI, preserving the stored `accessPath` as-is instead of incorrectly
  joining it under cwd.

## Approach

Implement `isAbsolutePath` as a pure function using three ordered checks:

1. Starts with `/` → POSIX absolute.
2. Starts with `\\` → UNC absolute.
3. Matches `/^[A-Za-z]:[/\\]/` → Windows drive-letter absolute.

Replace `isAbsolute` from `node:path` with `isAbsolutePath` at each call site. No behavioral
change on Windows (where `node:path.isAbsolute` already handles all cases); the fix only
materializes on POSIX hosts (Linux CI) when a Windows-style path is encountered.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/utils/path-utils.ts` | Added | New `isAbsolutePath` pure function |
| `src/core/config/dysflow-config.ts` | Modified | Two `isAbsolute` usages replaced |
| `src/adapters/vba-sync/vba-execution-adapter.ts` | Modified | One `isAbsolute` usage replaced |
| `src/cli/commands/setup.ts` | Modified | One `isAbsolute` usage replaced |
| `src/core/operations/access-operation-cleanup.ts` | Modified | Asymmetry fixed: use `pathMatchesAccessPath` |
| `test/core/utils/path-utils.test.ts` | Added | Pure-function tests for `isAbsolutePath` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Behavior change on Windows | Very low | `node:path.isAbsolute` and the new function agree on all Windows path forms; tests run on Windows CI |
| Regex too permissive for drive-letter paths | Low | Regex requires the separator char after `:`; bare `C:` (no separator) returns false, which is correct |

## Rollback Plan

Revert the change. All four call sites can be reverted to `node:path.isAbsolute` with no data
or config migration required.

## Dependencies

- `src/core/utils/path-utils.ts` already exported from `src/core/utils/index.ts`.
- `pathMatchesAccessPath` already imported in `access-operation-cleanup.ts`.

## Success Criteria

- [ ] `isAbsolutePath("C:/db/project.accdb")` returns `true` on any platform.
- [ ] All call sites use `isAbsolutePath` instead of `node:path.isAbsolute`.
- [ ] The cleanup asymmetry is resolved using `pathMatchesAccessPath`.
- [ ] `pnpm test` passes (0 failed) and `pnpm build` produces no TypeScript errors.
