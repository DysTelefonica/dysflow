# Proposal: Fix MCP Tool Call Hang

## Intent

After MCP startup succeeds from `E2E_testing`, Access-backed tool calls must not hang silently. #362 will bound and diagnose failures in the tool-call/core runner path so clients receive structured errors instead of pending JSON-RPC responses.

## Scope

### In Scope
- Preserve successful MCP `initialize`/`tools/list` behavior while proving `tools/call` error propagation.
- Diagnose and bound `dysflow_doctor`/`list_tables` execution through core services, `AccessPowerShellRunner`, and `powershell.exe` runner execution.
- Add strict-TDD anchors plus one short, safe Access boundary probe plan for `E2E_testing`.

### Out of Scope
- #361 OpenCode startup command/config generation.
- Broad E2E smoke suites, release work, PR creation, or implementation in this phase.
- Full Access COM/process cleanup redesign unless required by the narrow timeout/error fix.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `mcp-stdio-adapter`: `tools/call` MUST surface bounded core/runner failures as JSON-RPC tool responses, not silently leave clients pending after startup succeeds.
- `access-core-runner`: runner subprocess execution MUST diagnose and return structured timeout/failure metadata when PowerShell/Access execution does not complete.

## Approach

Use a narrow runtime slice: first pin MCP dispatch and injected service error translation with unit tests; then pin runner args/env/timeout mapping around `AccessPowerShellRunner` and `spawnPowerShellProcess`. Use only targeted manual probes from `E2E_testing` to distinguish PowerShell startup from Access COM activation/open.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/mcp/stdio.ts` | Modified | Ensure tool-call responses are emitted for bounded failures. |
| `src/adapters/mcp/tools.ts` | Modified | Preserve `dysflow_doctor`/`list_tables` error translation. |
| `src/core/runner/access-runner.ts` | Modified | Bound runner timeout/failure metadata. |
| `src/core/runner/powershell-executor.ts` | Modified | Verify child timeout completion semantics. |
| `scripts/dysflow-access-runner.ps1` | Modified | Diagnose Access runner boundary only if needed. |
| `test/**` | Modified | Strict-TDD coverage for MCP, config, runner, executor. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Access COM only hangs under real Windows/Access execution | Med | One short direct runner/COM probe with cleanup. |
| Fix expands beyond 400 lines | Med | Use stacked-to-main slices; keep tests with each work unit. |
| MCP timeout masks runner cleanup defects | Med | Prefer runner-bound diagnosis before adapter-level fallback. |

## Rollback Plan

Revert the #362 work-unit commits. This restores current MCP/tool-call behavior without touching #361 startup config or unrelated adapters.

## Dependencies

- `E2E_testing` fixture and local Access/PowerShell environment.
- `pnpm test` and `pnpm build` for verification.

## Success Criteria

- [ ] Failing tests first reproduce the pending/error-boundary behavior.
- [ ] Access-backed MCP tool calls return structured failure/timeout responses instead of hanging silently.
- [ ] `E2E_testing` config resolution remains separate from #361 startup config.
- [ ] Final implementation remains reviewable under the 400-line budget or is sliced into stacked PRs.
