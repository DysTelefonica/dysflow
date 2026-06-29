# core-configuration Specification (delta — change #437)

## Change Summary

Adds a new requirement for platform-agnostic absolute-path detection to fix a portability bug
where Windows-style absolute paths (`C:/db/project.accdb`) were incorrectly treated as relative
on Linux CI, causing them to be joined under cwd.

## New Requirements

### Requirement: Platform-Agnostic Absolute-Path Detection

The system MUST recognize Windows drive-letter paths (`C:/`, `c:\`) and UNC paths (`\\server\share`)
as absolute regardless of the host operating system.
(Previously: `node:path.isAbsolute` was used directly, which is POSIX-only and returns `false`
for Windows-style paths on Linux.)

#### Scenario: Windows accessPath preserved on POSIX host

- GIVEN a project config with `accessPath` set to a Windows drive-letter path such as `"C:/db/project.accdb"`
- AND the runtime is executing on a POSIX host (Linux CI)
- WHEN the configuration is loaded
- THEN the resolved `accessPath` SHALL equal the original Windows path (`"C:/db/project.accdb"`)
- AND the path SHALL NOT be joined under the current working directory

#### Scenario: Relative accessPath resolved against projectRoot on any host

- GIVEN a project config with `accessPath` set to a relative path such as `"db/project.accdb"`
- WHEN the configuration is loaded with a known `projectRoot`
- THEN the resolved `accessPath` SHALL equal `resolve(projectRoot, "db/project.accdb")`

#### Scenario: POSIX absolute path recognized

- GIVEN a project config with `accessPath` set to a POSIX absolute path such as `"/var/data/project.accdb"`
- WHEN the configuration is loaded
- THEN the resolved `accessPath` SHALL equal `"/var/data/project.accdb"`
- AND the path SHALL NOT be joined under the current working directory

### Requirement: Shared Path Utility

A single exported function `isAbsolutePath(value: string): boolean` in `src/core/utils/path-utils.ts`
MUST be the authoritative implementation for absolute-path detection. No call site within
`src/core/**` or `src/adapters/**` or `src/cli/**` SHALL use `node:path.isAbsolute` for paths that
may originate from a different platform (e.g. Windows config paths read on Linux).
