# Design: MCP Progress Notifications

## Technical Approach

Surface MCP `notifications/progress` frames for the modern tools `dysflow.vba.execute` and `dysflow.query.execute` by threading an `McpToolContext` (adapter-owned) into their handlers and a generic `onProgress` callback through `AccessRunner.run` into the existing `stderr` line parser. PowerShell emits `DYSFLOW_PROGRESS <json>` lines on stderr at coarse-grained milestones; the runner intercepts them next to the existing `DYSFLOW_ACCESS_PROCESS ` marker without changing PID parsing semantics. No public types change in core; `OperationResult<T>` is untouched.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|---|---|---|---|
| Where `McpToolContext` lives | `src/adapters/mcp/types.ts` (new) | Put it in `src/core/contracts` | Hexagonal boundary: MCP protocol concerns must not leak into core. Core only sees a generic `(percent, total?, message?) => void` callback. |
| How handlers receive context | New optional 2nd param `context?: McpToolContext` on `DysflowMcpTool.handler` | Pass via global / closure / singleton | Explicit, testable, backward-compatible with legacy handlers that ignore it. |
| Side channel for progress | `stderr` lines `DYSFLOW_PROGRESS <json>` (extending current marker pattern) | A second stdout JSON-RPC stream from PS, or a named pipe | Stdout is buffered + parsed as a single JSON payload at end (would corrupt result). stderr is already streamed line-by-line and the PID marker pattern is proven. |
| Wire-level frame format | JSON-RPC notification with `method:"notifications/progress"`, no `id` | Custom envelope | Required by MCP spec 2024-11-05. Absence of `id` is what makes it a notification. |
| Where token is extracted | `JsonLineMcpStdioRuntime.callTool` | In each tool handler | Single extraction point; handlers stay free of protocol details. |
| Token absent behaviour | `sendProgress` becomes a no-op closure (defined but does nothing) | Leave `sendProgress` undefined | Simpler call sites in handlers/services — no `?.()` cascade — and zero observable output when token is missing. |
| stderr parser ordering | Check `DYSFLOW_ACCESS_PROCESS ` first, then `DYSFLOW_PROGRESS ` (else-if) | Single regex multiplexer | Preserves byte-for-byte semantics of the existing PID branch; progress is purely additive. |
| Parse failure policy | Swallow malformed `DYSFLOW_PROGRESS` lines silently | Treat as stderr error text | Progress is best-effort telemetry; one bad line must never poison a long-running op. |

**Hexagonal confirmation**: `McpToolContext` and JSON-RPC framing live only under `src/adapters/mcp/`. `AccessRunnerOptions.onProgress`, `AccessVbaService.execute(request, onProgress?)`, and `AccessQueryService.execute(request, onProgress?)` use a primitive callback signature with no MCP types imported in core.

## Data Flow

    Client ──(_meta.progressToken)──▶ JsonLineMcpStdioRuntime.callTool
                                            │
                              builds McpToolContext { progressToken, sendProgress }
                                            │
                                            ▼
                          tool.handler(args, context)  ── (modern tools only)
                                            │
                                            ▼
                     vbaService.execute(req, onProgress)
                     queryService.execute(req, onProgress)
                                            │
                                            ▼
                     AccessPowerShellRunner.run(op, config, { onProgress })
                                            │
                                            ▼
                     spawnPowerShellProcess  ─ onStderr lines:
                       DYSFLOW_ACCESS_PROCESS {...} → existing PID capture
                       DYSFLOW_PROGRESS {...}       → options.onProgress(p,t,m)
                       (other lines)                → existing stderr buffer
                                            │
                                            ▼
                     stdio.sendProgress → output.write(JSON-RPC notification)
                                            │
                                            ▼
                                          Client

## File Changes

| File | Action | Description |
|---|---|---|
| `src/adapters/mcp/types.ts` | Create | Defines `McpToolContext` and `RuntimeProgressSender` (internal). |
| `src/adapters/mcp/stdio.ts` | Modify | Extract `_meta.progressToken` in `callTool`; build `McpToolContext` with a closure over `this.output`; pass it to `tool.handler`; add `writeNotification(method, params)` helper. |
| `src/adapters/mcp/tools.ts` | Modify | Extend `DysflowMcpTool.handler` to `(input, context?: McpToolContext) => Promise<McpToolResult>`. Wire context only into `dysflow.vba.execute` and `dysflow.query.execute` handlers; pass `context?.sendProgress` to the service `execute` calls. Legacy tools ignore context. |
| `src/core/runner/access-runner.ts` | Modify | Add `AccessRunnerProgressCallback` type and optional `onProgress` field on a new third parameter `RunOptions` (or extend signature to `run(op, config?, options?)`). In `spawnPowerShell.onStderr`, add an `else if (line.startsWith(PROGRESS_MARKER))` branch that JSON-parses the suffix in a try/catch and calls `onProgress(percent, total, message)`. |
| `src/core/services/vba-service.ts` | Modify | `execute(request, onProgress?)` forwards as `runner.run(op, config, { onProgress })`. |
| `src/core/services/query-service.ts` | Modify | Same shape as vba-service. |
| `scripts/dysflow-access-runner.ps1` | Modify | Add `Write-DysflowProgress -Percent -Message [-Total]` helper that writes `DYSFLOW_PROGRESS <compressed-json>` to `[Console]::Error`. Emit 3 milestones for `vba` and `query` operations: (1) after `OpenCurrentDatabase` succeeds: `{percent:10,message:"Opening database"}`, (2) just before invoking the operation: `{percent:40,message:"Executing operation"}`, (3) immediately after the operation returns and before serializing JSON: `{percent:90,message:"Finalizing"}`. No emission inside row loops. |

## Interfaces / Contracts

```typescript
// src/adapters/mcp/types.ts
export interface McpToolContext {
  progressToken?: string | number;
  /** No-op when progressToken is absent. */
  sendProgress(progress: number, total?: number, message?: string): void;
}
```

```typescript
// src/adapters/mcp/tools.ts (signature change)
export type DysflowMcpTool = {
  name: string;
  description: string;
  inputSchema?: JsonObjectSchema;
  hidden?: boolean;
  handler(input: unknown, context?: McpToolContext): Promise<McpToolResult>;
};
```

```typescript
// src/core/runner/access-runner.ts (additive)
export type AccessRunnerProgressCallback = (percent: number, total?: number, message?: string) => void;
export type AccessRunnerRunOptions = { onProgress?: AccessRunnerProgressCallback };
export interface AccessRunner {
  run<TData = unknown>(operation: AccessRunnerOperation, config?: DysflowConfig, options?: AccessRunnerRunOptions): Promise<OperationResult<TData>>;
}
```

Stderr parser (drop-in for the existing loop):

```typescript
for (const line of text.split(/\r?\n/)) {
  if (line.startsWith(ACCESS_PROCESS_MARKER)) { /* existing PID branch */ continue; }
  if (line.startsWith(PROGRESS_MARKER)) {
    try {
      const data = JSON.parse(line.slice(PROGRESS_MARKER.length)) as { percent: number; total?: number; message?: string };
      options.onProgress?.(data.percent, data.total, data.message);
    } catch { /* swallow malformed progress lines */ }
    continue;
  }
  nonMarkerLines.push(line);
}
```

JSON-RPC frame written to stdout (no `id`):

```json
{"jsonrpc":"2.0","method":"notifications/progress","params":{"progressToken":"...","progress":40,"total":100,"message":"Executing operation"}}
```

## Testing Strategy (Strict TDD — vitest)

| Layer | What | Approach |
|---|---|---|
| Unit | `McpToolContext.sendProgress` writes a valid JSON-RPC notification frame to the runtime's writable when `progressToken` is set; writes nothing when absent | `test/adapters/mcp/progress.test.ts`: construct `JsonLineMcpStdioRuntime` with a `PassThrough` output, register a fake tool that asserts `context` shape and calls `sendProgress(50, 100, "hi")`, feed a `tools/call` line with `_meta.progressToken: "tok-1"`, assert the output stream contains `notifications/progress` frame before the final `result` frame and that no `id` field is on the notification |
| Unit | stderr parser separates `DYSFLOW_ACCESS_PROCESS` and `DYSFLOW_PROGRESS` correctly | `test/core/runner/access-runner-progress.test.ts`: inject a fake `PowerShellExecutor` that synchronously calls the supplied `onStderr` with a mixed buffer containing one PID marker, two progress markers, one malformed progress marker, and plain stderr text; assert (a) `onAccessProcessCaptured` invoked once with parsed PID, (b) `onProgress` invoked exactly twice with the parsed values, (c) malformed line does NOT throw and does NOT call `onProgress`, (d) plain stderr is preserved in the result |
| Unit | Services forward `onProgress` | `test/core/services/vba-service-progress.test.ts` and `query-service-progress.test.ts`: stub `AccessRunner.run` capturing its third arg; call `service.execute(req, cb)`; assert `runner.run` was invoked with `{ onProgress: cb }` |
| Unit | Tools wire context only into modern tools | Extend `tools.test.ts`: assert that calling the `dysflow.vba.execute` handler with a `context` invokes `services.vbaService.execute` with the same `sendProgress` reference; assert legacy tools ignore `context` (no throw, no propagation) |

No integration or E2E tests for this slice — the proposal's success criteria are reachable via the four unit suites above.

## Migration / Rollout

No migration required. All public types are extended with optional fields; clients that do not send `_meta.progressToken` observe identical behaviour. Rollback = revert the listed files.

## Open Questions

- [ ] None blocking. Final percent values (10/40/90) are illustrative; PowerShell implementer may tune within the same checkpoint set.
