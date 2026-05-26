# Design: Fix MCP Tool Call Hang

## Technical Approach

Keep #362 in the post-startup runtime path: MCP stdio dispatch and tool mapping stay thin, while the runner/executor boundary owns timeout diagnosis. The first fix should prove `initialize`/`tools/list` still work and that `tools/call` returns a tool result once core returns `RUNNER_TIMEOUT`; then tighten `AccessPowerShellRunner` / `spawnPowerShellProcess` behavior so a PowerShell/Access stall resolves with structured metadata. Do not add an adapter-only watchdog unless runner-level evidence shows the subprocess promise can remain pending after timeout.

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| Diagnose runner/core first | Finds the real hang boundary; may need one safe Windows probe | Chosen: aligns with core-first rule and avoids masking cleanup defects |
| Add MCP per-call timeout first | Bounds clients quickly but hides PowerShell/Access ownership failures | Deferred unless executor cannot guarantee resolution |
| Modify `scripts/dysflow-access-runner.ps1` immediately | Can add markers, but risks broad Access-script diff | Only if the diagnostic probe proves COM/open is the boundary |
| One PR vs chained PRs | First slice likely <400 changed lines; larger cleanup may exceed budget | First PR: runner/tool-call timeout proof. Later PRs stacked-to-main if needed |

## Data Flow

```text
JSON-RPC tools/call
  -> JsonLineMcpStdioRuntime.callTool
  -> createDysflowMcpTools handler
  -> AccessDiagnosticsService / AccessQueryService
  -> AccessPowerShellRunner.run
  -> spawnPowerShellProcess
  -> scripts/dysflow-access-runner.ps1
  -> OperationResult -> MCP text tool result
```

Timeout ownership remains in `AccessPowerShellRunner` and `powershell-executor`; MCP only translates resolved core failures to protocol-safe `isError: true` content.

## File Changes

| File | Action | Description |
|---|---|---|
| `test/adapters/mcp/stdio.test.ts` | Modify | RED test: a tool returning `RUNNER_TIMEOUT` through registered services produces a `tools/call` response, not JSON-RPC pending/internal error. |
| `test/adapters/mcp/tools.test.ts` | Modify | RED tests for `dysflow_doctor` and legacy `list_tables` routing and safe failure text. |
| `test/core/runner/access-runner.test.ts` | Modify | RED/GREEN tests for timeout result metadata, operation status, args/env, and diagnostics. |
| `test/core/runner/powershell-executor.test.ts` | Modify | RED/GREEN tests proving timeout/abort resolves even with no stdout/stderr and records duration. |
| `test/core/config/dysflow-config.test.ts` | Modify | If missing, add E2E-style cwd config fixture with env passwords and `timeoutMs: 90000`. |
| `src/core/runner/powershell-executor.ts` | Modify | Only if tests show child timeout can remain unresolved; make close/error/timeout settlement deterministic. |
| `src/core/runner/access-runner.ts` | Modify | Normalize timeout failure metadata and diagnostics; preserve separated args and minimal env. |
| `src/adapters/mcp/stdio.ts` | Modify | Only if needed to preserve resolved tool errors as tool results; avoid adapter watchdog in first slice. |
| `src/adapters/mcp/tools.ts` | Modify | Only if mapping/translation fails tests. |
| `scripts/dysflow-access-runner.ps1` | Modify | Conditional: add tiny stderr phase markers around COM create/open if probe proves needed. |

## Interfaces / Contracts

No public MCP tool names or schemas change. Core timeout contract remains:

```ts
failureResult({ code: "RUNNER_TIMEOUT", retryable: true }, { durationMs, diagnostics, operation })
```

MCP contract: core failures are returned as `{ isError: true, content: [{ type: "text", text: "CODE: message" }] }`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | MCP response emission for resolved runner failures | Vitest, in-memory streams/services |
| Unit | Tool mapping for `dysflow_doctor` and `list_tables` | Inject fake services returning `RUNNER_TIMEOUT` |
| Unit | Runner/executor timeout semantics | Fake executor and mocked `spawn` with timers/no output |
| Integration probe | PowerShell vs Access COM/open boundary | One 5-10s manual probe from `E2E_testing`; cleanup via Dysflow operation registry, no broad smoke |

Strict TDD: write failing tests before production edits; run focused Vitest tests first, then `pnpm test` and `pnpm build`.

## Migration / Rollout

No migration required. Roll back by reverting the #362 work-unit commit(s). If implementation exceeds 400 changed lines, split stacked-to-main: (1) runner/executor timeout contract, (2) optional MCP adapter watchdog or runner-script markers.

## Open Questions

- [ ] Does a direct 8-10s runner probe return `RUNNER_TIMEOUT`, or does the Node executor promise remain pending?
- [ ] Does Access COM creation/open emit any stderr marker before the observed stall?
