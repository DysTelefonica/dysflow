# Proposal: Guard Destructive Runtime Delete

## Intent

Issue #434 (audit C1): `rm(runtimeDir, { recursive: true, force: true })` in `uninstall.ts:72` runs over whatever `resolveRuntimeDir` returns, taking `DYSFLOW_HOME` / `--runtime-dir` / marker verbatim. Default `localAppData/dysflow` is safe; `DYSFLOW_HOME=...\AppData\Local` would recursively delete the whole `Local` directory. Same concern in `install/copyRuntime` (`extractor.ts:47-81`).

Add a path-safety guard before destructive recursive delete and abort with a clear error when the resolved path is not dysflow-owned.

## Scope

### In Scope
- `isSafeToDelete` guard in `src/cli/commands/install/runtime-dir.ts` that refuses paths whose normalized absolute form does not contain a dysflow-owned marker.
- Wire the guard into `handleUninstallCommand`: skip the destructive `rm` and abort with a clear stderr message.
- Port-level test proving the guard fires for unrelated paths and the directory survives untouched.

### Out of Scope
- Basename tightening and `install/copyRuntime` (`extractor.ts:47-81`) guard reuse. Substring closes C1; both are follow-ups.
- New MCP tools, schema changes, or CLI surface changes.

## Capabilities

### New Capabilities
None. The guard is an internal safety property of the install/uninstall runtime.

### Modified Capabilities
- `install-runtime` (new delta target): adds "Destructive Runtime Delete Guarded" requirement.

## Approach

Co-locate `isSafeToDelete` with `resolveRuntimeDir`. The check normalizes the resolved absolute path (lowercase, forward slashes) and requires it to contain `dysflow`, `test-runtime`, or `test_runtime`. Empty/short paths and system/user-root matches are rejected. Uninstall calls the guard immediately before `rm`; failure returns `exitCode: 1` with `stderr: "Aborted: Unsafe runtime directory path: <path>"` and leaves the target directory on disk. Substring is the shipped contract; basename tightening is a follow-up.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/cli/commands/install/runtime-dir.ts` | Modified | Adds `isSafeToDelete` path guard |
| `src/cli/commands/uninstall.ts` | Modified | Calls guard before destructive `rm`; aborts with clear error |
| `test/cli/uninstall.test.ts` | Modified | Port-level test for the guard |
| `openspec/changes/434-guard-destructive-runtime-delete/` | New | SDD proposal, design, delta spec, tasks |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Substring check accepts lookalike paths (e.g. `C:/dysflow-clone`) | Low | Acceptable for C1; basename tightening is the follow-up |
| Test couples to `isSafeToDelete` internals | Low | Test exercises `handleUninstallCommand` at the port |
| Future refactor breaks guard invariant | Low | Co-locate with `resolveRuntimeDir`; future call sites reuse it |

## Rollback Plan

Revert the change. Guard is additive: removing it restores prior behavior.

## Dependencies

Strict TDD; port-level test precedes production change. Repo standards: clean architecture, behavior/port tests, `pnpm test`.

## Success Criteria

- [ ] `isSafeToDelete` refuses any path that is not a dysflow-owned subtree.
- [ ] `handleUninstallCommand` aborts with `Aborted: Unsafe runtime directory path: <path>` and leaves the directory on disk.
- [ ] Guard is structured for reuse (install/copy deferred to a follow-up).
- [ ] Port-level test in `test/cli/uninstall.test.ts` covers the rejection case without coupling to predicate internals.
- [ ] Substring-vs-basename scope is documented in design and tracked as a follow-up.
