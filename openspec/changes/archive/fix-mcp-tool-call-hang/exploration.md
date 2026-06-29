## Exploration: fix-mcp-tool-call-hang

### Current State
MCP startup succeeds from `E2E_testing`: `handleMcpCommand` loads `.dysflow/project.json`, `startMcpStdioAdapter` registers tools, and `JsonLineMcpStdioRuntime` answers `initialize` and `tools/list`. Tool calls then await handlers synchronously in `JsonLineMcpStdioRuntime.callTool`; `dysflow_doctor` and `list_tables` both route into core services and then `AccessPowerShellRunner.run`, which spawns `powershell.exe -File <runner> ...` with the project timeout. Direct CLI `doctor` reaching `RUNNER_TIMEOUT: Access operation timed out after 90000ms` proves dispatch and config resolution are past the startup boundary; the hang is most likely inside the runner subprocess path, PowerShell script execution, or Access COM startup/open, not in MCP tool registration.

Short probes also showed `DYSFLOW_HOME=C:\Users\adm1\AppData\Local\dysflow`; therefore the runner script path is absolute via `resolveDefaultRunnerScriptPath`, not the missing relative `E2E_testing\scripts\...` path. Installed and repo runner script SHA256 hashes currently match, so this is not explained by a stale installed runner script.

### Affected Areas
- `src/adapters/mcp/stdio.ts` — MCP JSON-lines dispatch; `tools/call` awaits tool handlers and writes no response until the handler resolves.
- `src/adapters/mcp/tools.ts` — maps `dysflow_doctor` to `diagnosticsService.run` and `list_tables` to `queryService.execute({ action: "list_tables", mode: "read" })`.
- `src/core/services/diagnostics-service.ts` — thin wrapper around `runner.run({ kind: "diagnostics" })`.
- `src/core/services/query-service.ts` — thin wrapper around `runner.run({ kind: "query" })`.
- `src/core/runner/access-runner.ts` — applies per-access-path lock, preflight cleanup, operation registry, PowerShell spawn, timeout translation, and runner JSON parsing.
- `src/core/runner/powershell-executor.ts` — spawns `powershell.exe`, injects a minimal child environment, kills on timeout, and resolves on child `close`.
- `src/core/config/dysflow-config.ts` — resolves `E2E_testing/.dysflow/project.json`, env passwords, backend path, and 90000ms timeout.
- `scripts/dysflow-access-runner.ps1` — creates `Access.Application`, opens the frontend except for direct-target writes, emits Access PID marker after open, and handles diagnostics/list_tables.
- `test/adapters/mcp/stdio.test.ts` — adapter dispatch/progress/request-shape anchors.
- `test/adapters/mcp/tools.test.ts` — tool mapping/schema anchors including `dysflow_doctor` and `list_tables`.
- `test/core/runner/access-runner.test.ts` and `test/core/runner/powershell-executor.test.ts` — runner argument/env/timeout anchors.
- `test/core/config/dysflow-config.test.ts` — project config resolution anchors.

### Approaches
1. **Runner-boundary diagnosis first** — add focused tests and minimal instrumentation around runner command/env/timeout behavior before changing production flow.
   - Pros: keeps #362 small, separates runtime hang from #361 startup command shape, protects strict TDD.
   - Cons: may still require one manual Access probe to distinguish PowerShell startup from Access COM open.
   - Effort: Low

2. **Add MCP-level per-call timeout/fallback** — bound `tools/call` itself so MCP clients receive an error even if core hangs.
   - Pros: improves client UX for all tools.
   - Cons: does not fix the underlying Access/PowerShell hang and may hide runner cleanup problems; likely larger than 400 lines with tests/specs.
   - Effort: Medium

### Recommendation
Keep #362 as one small PR slice focused on the runtime/tool-call execution path after successful MCP startup. The first SDD change boundary should be: prove config and MCP dispatch are healthy, then constrain the runner/PowerShell/Access boundary with strict TDD and one or two manual probes. Do not mix in OpenCode startup command fixes from #361 or broad E2E smoke.

### Risks
- If the root cause is Access COM initialization under `-NonInteractive`, unit tests alone will not reproduce it; a single short manual probe remains necessary.
- The current MCP runtime has no independent tool-call timeout; any hung service call leaves the JSON-RPC response pending until the runner returns.
- `spawnPowerShellProcess` kills only the direct child and resolves on `close`; if PowerShell or COM child cleanup is abnormal, observed shell/client timeouts may differ from runner timeout semantics.

### Ready for Proposal
Yes — tell the orchestrator to propose `fix-mcp-tool-call-hang` as a focused runtime/tool-call slice under 400 changed lines, with strict TDD anchors in MCP dispatch, config resolution, runner spawn/env/timeout, and a single safe Access boundary probe before implementation.

### Safe Next Probes
1. **Direct runner diagnostics with tight shell timeout**: from `E2E_testing`, invoke the installed runner script directly with `-Operation diagnostics`, `-PayloadJson "{}"`, same password env, and an 8-10s shell timeout. Purpose: bypass MCP and CLI while exercising PowerShell + Access COM.
2. **Access COM creation-only probe with cleanup**: run a minimal 5-8s PowerShell command that creates `Access.Application`, writes a marker, calls `Quit()`, and releases COM. Purpose: distinguish PowerShell startup from Access COM activation/open. Do this only after checking no existing Access operations are active.

### Minimal TDD Anchors
- Unit: `JsonLineMcpStdioRuntime` returns a response for a tool whose handler resolves to a core error, proving adapter dispatch does not swallow `RUNNER_TIMEOUT`.
- Unit: `createDysflowMcpTools` routes `dysflow_doctor` and `list_tables` to injected services and preserves error translation.
- Unit: `loadDysflowConfigAsync` from an `E2E_testing`-style cwd resolves repo config, env passwords, backend path, and `timeoutMs: 90000` without global registry fallback.
- Unit: `AccessPowerShellRunner` builds `-File` runner args, passes minimal env passwords, and maps timed-out executor results to `RUNNER_TIMEOUT` with operation metadata.
- Unit: `spawnPowerShellProcess` timeout behavior remains bounded and documented; if changed, prove it resolves even when the child emits no stdout/stderr.

### Proposed Scope
Keep as one PR slice. Expected production changes should be small and localized to config/runner/MCP timeout/error propagation or diagnostics; tests should stay with the fix. Split only if implementation expands into both (a) MCP-level per-call cancellation and (b) Access runner/process cleanup redesign.
