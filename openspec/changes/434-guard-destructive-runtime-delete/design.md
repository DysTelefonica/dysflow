# Design: Guard Destructive Runtime Delete With Path-Safety Check

## Technical Approach

Add a `isSafeToDelete` predicate in `src/cli/commands/install/runtime-dir.ts` (next to `resolveRuntimeDir`) that decides whether a resolved absolute path is safe for a recursive `rm`. The predicate normalizes the path, requires it to contain a dysflow-owned marker substring, and rejects empty/short paths or paths that match a known system/user root. `handleUninstallCommand` calls the guard immediately before its `rm`; on failure the command returns `exitCode: 1` with a clear stderr message and the target directory is left intact. The install/copy path (`extractor.ts:47-81`) is out of scope for this change; the audit concern is closed at the uninstall entry point and the predicate is structured for reuse by future call sites.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Guard location | Co-locate with `resolveRuntimeDir` in `src/cli/commands/install/runtime-dir.ts` | New `safety.ts` module or core utility | Keeps the safety contract adjacent to resolution; future call sites (install/copy) can import from the same module. No domain logic, so it stays in the adapter/CLI layer. |
| Predicate shape | `isSafeToDelete(dirPath, env) -> boolean` | Throw on unsafe | Boolean keeps the call site explicit and lets the command craft the abort message. Throwing would couple the predicate to CLI error formatting. |
| Acceptance rule (shipped) | Normalized path must contain `dysflow`, `test-runtime`, or `test_runtime` | Strict basename must be `dysflow` or contain a marker file | Substring closes the C1 attack (overriding `DYSFLOW_HOME` to a parent directory). Basename tightening is a follow-up; shipping a broader check now would block legitimate dev/test layouts. |
| System-root blacklist | Reject matches against `SystemDrive`, `SystemRoot`, `ProgramData`, `ProgramFiles`, `USERPROFILE`, `LOCALAPPDATA`, `APPDATA`, `TEMP`, `TMP`, `tmpdir()`, `Users`/`/home`/`/` | Skip this layer | Defense in depth: even if a substring check is fooled, the system-root comparison stops the destructive `rm` from targeting OS-protected locations. |
| Error message | `Aborted: Unsafe runtime directory path: <path>` to stderr, exit 1 | Generic `Unsafe path` | Issue acceptance criteria require a clear error; including the offending path helps the operator diagnose a misconfigured `DYSFLOW_HOME` or marker. |
| Test target | Exercise `handleUninstallCommand` at the port; assert exit code, stderr substring, and that the unrelated directory still exists | Unit-test `isSafeToDelete` directly | Matches `docs/testing/testing-philosophy.md`: tests must survive internal refactors. The rejection behavior is observable at the CLI port; the predicate is an implementation detail. |
| Apply to `extractor.ts:47-81` copy path | Defer; entry point already guarded | Guard the copy site now | The copy site targets `runtimePaths.appDir` derived from the resolved runtime, not a user-supplied subtree. Guarding it would be defense in depth but adds no user-visible safety beyond the entry point. Track as a follow-up. |

## Data Flow

```text
uninstall command
  ├─ parseUninstallArgs
  ├─ removeAgentConfig (per agent, best-effort)
  ├─ runtimeDir = resolveRuntimeDir(--runtime-dir, env)
  └─ if fileExists(runtimeDir):
        ├─ isSafeToDelete(runtimeDir, env)        // path-safety guard
        │     ├─ resolve + normalize path
        │     ├─ require substring "dysflow" | "test-runtime" | "test_runtime"
        │     └─ reject matches against system/user roots
        ├─ false -> exit 1, stderr = "Aborted: Unsafe runtime directory path: <path>"
        └─ true  -> rm(runtimeDir, { recursive: true, force: true })
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/cli/commands/install/runtime-dir.ts` | Modify | Add `isSafeToDelete(dirPath, env)` predicate. Normalize the resolved path, require dysflow/test-runtime substring, reject system/user roots, reject empty/short paths. |
| `src/cli/commands/uninstall.ts` | Modify | Import `isSafeToDelete`. Before the destructive `rm` inside the `if (await fileExists(runtimeDir))` block, call the guard; on `false` return `{ exitCode: 1, stdout: "", stderr: "Aborted: Unsafe runtime directory path: <path>" }`. |
| `test/cli/uninstall.test.ts` | Modify | Add a port-level test that creates an unrelated tmpdir, calls `handleUninstallCommand(["--runtime-dir", <tmpdir>], { env: {} })`, asserts `exitCode === 1`, stderr contains `Aborted: Unsafe runtime directory path`, and the directory still exists. |
| `openspec/changes/434-guard-destructive-runtime-delete/` | Create | Proposal, design, delta spec, tasks for this change. |

## Interfaces / Contracts

No public API surface changes. The only new export is the internal `isSafeToDelete` helper, intentionally limited to the install/uninstall command surface:

```ts
// src/cli/commands/install/runtime-dir.ts
export function isSafeToDelete(dirPath: string, env: NodeJS.ProcessEnv): boolean;
```

Behavioral contract for `isSafeToDelete`:

- Returns `false` for empty input, the filesystem root, and paths whose normalized absolute form is shorter than 5 characters.
- Returns `false` when the normalized path does not contain `dysflow`, `test-runtime`, or `test_runtime`.
- Returns `false` when the normalized path equals or is a parent of a known system/user root (`SystemDrive`, `SystemRoot`, `ProgramData`, `ProgramFiles`, `USERPROFILE`, `LOCALAPPDATA`, `APPDATA`, `TEMP`, `TMP`, `tmpdir()`, `Users`, `/home`, `/`).
- Returns `true` otherwise.

The default dysflow runtime (`%LOCALAPPDATA%/dysflow`) and the dev/test runtime (`test-runtime/`, `test_runtime/`) both pass; a hostile override such as `DYSFLOW_HOME=...\AppData\Local` is rejected.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Port/CLI | `handleUninstallCommand` rejects an unrelated `--runtime-dir` | `test/cli/uninstall.test.ts`: create `tmpdir/unrelated-dir-for-uninstall-test`, run handler with `--runtime-dir` pointing at it and `env: {}`, assert `exitCode === 1`, stderr contains `Aborted: Unsafe runtime directory path`, and the directory still exists. |
| Port/CLI | Happy path still works for legitimate dysflow-owned runtimes | Existing `uninstall.test.ts` cases already cover the success path (runtime under a tmpdir created via `mkdtemp`); they continue to pass without modification. |
| Full suite | Regression after the guard | `pnpm test`. |

No implementation-coupled assertions: tests do not import `isSafeToDelete` and do not assert on its internals. They observe behavior through the CLI port, so a future move of the predicate to a different module will not require test rewrites.

## Migration / Rollout

No data/config/runtime migration. The guard is additive: legitimate runtimes still pass; only misconfigured overrides or lookalike paths are rejected. The substring rule is conservative enough that the dev/test runtime at `test-runtime/` is accepted, so E2E and integration suites are unaffected.

Suggested single PR under the 400-line review budget. No chained split required.

## Open Questions

None for this change. The substring-vs-basename decision and the install/copy guard are tracked as explicit follow-ups in the proposal and design.
