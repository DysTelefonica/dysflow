# Proposal: 419-runner-output-parsing

## Intent

Fix robust process list parsing and distinguish empty stdout from valid empty-object query payloads to prevent runtime validator bypass.

## Scope

### In Scope
- Type-safe stdout parsing as `unknown` in `WindowsMsAccessProcessScanner` and `WindowsMsAccessProcessInspector` (`src/core/operations/windows-processes.ts`).
- Normalization of single objects / arrays to process lists in `windows-processes.ts`.
- Throwing `SyntaxError` on empty stdout in `parseRunnerData` (`src/core/runner/access-runner.ts`) to avoid returning `{}` and bypassing validation.
- Unit/integration tests to verify parsing behavior.

### Out of Scope
- Modifying production runtime at `%LOCALAPPDATA%\dysflow` or `~/.config/opencode/opencode.json`.
- Modifying core registry logic or process-killing logic.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `access-core-runner`: Tighten runner stdout parsing and differentiate empty stdout from a valid empty-object result. Ensure process list parsing safely types `JSON.parse` output as `unknown` and robustly normalizes it to an array.

## Approach

- Parse processes JSON as `unknown` first, then convert it to an array of objects. Map and filter valid processes to avoid parsing bugs.
- Throw a `SyntaxError` in `parseRunnerData` if `stdout` is empty, ensuring that `ensureResultShape` does not interpret empty output as a successful empty record.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/operations/windows-processes.ts` | Modified | Parse process JSON as `unknown` and normalize to process info array. |
| `src/core/runner/access-runner.ts` | Modified | Throw `SyntaxError` in `parseRunnerData` on empty output. |
| `test/core/runner/access-runner.test.ts` | Modified | Add test scenarios verifying empty stdout rejection. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Legitimate empty output could be rejected | Low | The runner script always returns structured JSON results or exits non-zero. |

## Rollback Plan

- Revert the git commits using standard `git revert` or restore files from git checkout.

## Dependencies

- None

## Success Criteria

- [ ] `pnpm test` passes successfully.
- [ ] Empty stdout from the runner throws a `SyntaxError` and is returned as `RUNNER_INVALID_JSON`.
- [ ] Process scanner parses single objects and arrays into process lists safely.
