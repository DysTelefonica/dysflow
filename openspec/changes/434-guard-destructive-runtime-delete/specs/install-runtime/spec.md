# Delta for install-runtime

## ADDED Requirements

### Requirement: Destructive Runtime Delete Guarded

When the install/uninstall runtime resolves a directory for destructive recursive deletion, the CLI MUST refuse to recursively delete any path that is not a recognizably dysflow-owned subtree. The CLI MUST abort with a clear, actionable error and MUST leave the offending directory on disk.

#### Scenario: Uninstall aborts when resolved runtime is not dysflow-owned

- GIVEN `--runtime-dir` (or `DYSFLOW_HOME` or the system marker) resolves to a path that is not a dysflow-owned subtree
- WHEN `dysflow uninstall` runs
- THEN it MUST return a non-zero exit code
- AND it MUST write a clear `Aborted: Unsafe runtime directory path: <path>` message to stderr
- AND the offending directory MUST still exist on disk afterward

#### Scenario: Default dysflow runtime is accepted

- GIVEN the resolved runtime directory is the default `%LOCALAPPDATA%/dysflow` (or another path that contains a dysflow-owned marker)
- WHEN `dysflow uninstall` runs
- THEN the guard MUST permit the recursive delete
- AND the runtime directory MUST be removed as before

#### Scenario: Dev/test runtime is accepted

- GIVEN the resolved runtime directory is the dev/test runtime (path contains `test-runtime` or `test_runtime`)
- WHEN `dysflow uninstall` runs
- THEN the guard MUST permit the recursive delete
- AND the dev/test runtime directory MUST be removed as before

#### Scenario: System or user root is rejected even if a substring match exists

- GIVEN a path that incidentally contains a dysflow substring but matches a known system or user root (e.g. `SystemDrive`, `SystemRoot`, `ProgramData`, `ProgramFiles`, `USERPROFILE`, `LOCALAPPDATA`, `APPDATA`, `TEMP`, `TMP`, `tmpdir()`, `Users`, `/home`, `/`)
- WHEN the path-safety guard evaluates it
- THEN the guard MUST reject the path
- AND `dysflow uninstall` MUST abort with the clear error

#### Scenario: Guard is structured for reuse by future call sites

- GIVEN the install/copy path or any future destructive call site that needs the same protection
- WHEN that call site imports the safety predicate
- THEN the predicate MUST be importable as a single boolean function from the install-runtime module
- AND reusing it MUST NOT require duplicating the substring/system-root logic

### Requirement: Path-Safety Guard Tests Are Port-Level

The path-safety guard MUST be covered by tests that observe behavior through the CLI port, not by assertions on the predicate's internals, normalization details, or module layout. Tests MUST survive a future refactor that moves the guard to a different module or changes its private structure, per `docs/testing/testing-philosophy.md`.

#### Scenario: RED test precedes production guard

- GIVEN the rejection case for a non-dysflow-owned path is not yet protected by a port-level test
- WHEN implementation starts
- THEN a failing Vitest expectation in `test/cli/uninstall.test.ts` MUST be added first
- AND the production guard MUST NOT land until the RED failure proves the missing contract

#### Scenario: Test asserts observable port outcomes

- GIVEN the test creates an unrelated tmpdir and runs `handleUninstallCommand` with `--runtime-dir` pointing at it
- WHEN the test runs
- THEN it MUST assert only on observable outcomes: non-zero exit code, stderr contains the abort message, and the directory still exists
- AND it MUST NOT import `isSafeToDelete`, assert on its return value directly, or couple to normalization details

#### Scenario: Guard is reachable from both uninstall and a future install/copy reuse point

- GIVEN the safety predicate lives next to `resolveRuntimeDir` in the install-runtime module
- WHEN the uninstall command runs the destructive delete
- THEN the guard MUST be invoked at that call site
- AND a future install/copy call site MUST be able to import the same predicate without duplicating logic
