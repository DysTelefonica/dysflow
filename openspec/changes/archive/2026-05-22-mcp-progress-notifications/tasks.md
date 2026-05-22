# Tasks: MCP Progress Notifications

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 280–360 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | stacked-to-main |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Medium

### Rationale

6 source files + 4 new test files. Largest diffs: `access-runner.ts` (~40 lines), `stdio.ts` (~35 lines), `tools.ts` (~25 lines), PowerShell script (~30 lines), 4 test files (~130 lines total). Estimated ~280–360 additions. Risk is Medium but below the 400-line hard boundary; a single PR is acceptable.

---

## Phase 1: Type Definitions (foundation — no tests needed)

- [x] 1.1 Create `src/adapters/mcp/types.ts` — export `McpToolContext { progressToken?: string | number; sendProgress(progress, total?, message?): void }`.
- [x] 1.2 Add to `src/core/runner/access-runner.ts` — export `AccessRunnerProgressCallback` type alias and `AccessRunnerRunOptions = { onProgress?: AccessRunnerProgressCallback }`. Do NOT change `AccessRunner` interface or `run` signatures yet.

## Phase 2: access-runner — progress parsing (RED → GREEN)

- [x] 2.1 **RED** — Create `test/core/runner/access-runner-progress.test.ts`. Inject a fake executor that feeds a mixed stderr buffer: one `DYSFLOW_ACCESS_PROCESS` PID line, two valid `DYSFLOW_PROGRESS` lines (`{percent:10}` and `{percent:50,message:"halfway"}`), one malformed `DYSFLOW_PROGRESS notjson`, one plain text line. Assert: PID captured once, `onProgress` called exactly twice with correct args, malformed line swallowed (no throw), plain text preserved in stderr diagnostic. Run `pnpm test` — expect RED.
- [x] 2.2 **GREEN** — Modify `src/core/runner/access-runner.ts`: add `PROGRESS_MARKER = "DYSFLOW_PROGRESS "` constant; extend `run(op, config?, options?: AccessRunnerRunOptions)` as 3rd positional arg (optional, defaults to `{}`); in `spawnPowerShell.onStderr` loop add `else if (line.startsWith(PROGRESS_MARKER))` branch with `try/catch` JSON.parse + `options.onProgress?.()`. Run `pnpm test` — expect GREEN.

## Phase 3: Services — onProgress forwarding (RED → GREEN)

- [x] 3.1 **RED** — Create `test/core/services/vba-service-progress.test.ts`. Stub `AccessRunner` to capture the 3rd arg; assert that when `vbaService.execute(req, onProgress)` is called, `runner.run` receives `{ onProgress }` as options. Run `pnpm test` — expect RED.
- [x] 3.2 **GREEN** — Modify `src/core/services/vba-service.ts`: change signature to `execute(request, onProgress?: AccessRunnerProgressCallback)` and forward as `runner.run({ kind:"vba", request }, this.config, { onProgress })`. Run `pnpm test` — expect GREEN.
- [x] 3.3 **RED** — Create `test/core/services/query-service-progress.test.ts`. Same pattern as 3.1 but for `AccessQueryService`. Run `pnpm test` — expect RED.
- [x] 3.4 **GREEN** — Modify `src/core/services/query-service.ts` with identical change to 3.2. Run `pnpm test` — expect GREEN.

## Phase 4: stdio.ts — notification frame (RED → GREEN)

- [x] 4.1 **RED** — Create `test/adapters/mcp/progress.test.ts`. Drive `JsonLineMcpStdioRuntime` via `PassThrough` streams. Fake tool that calls `context.sendProgress(40, 100, "Executing")`. Assert: `notifications/progress` frame written to output stream BEFORE the final `tools/call` result frame; frame has no `id` field; `params.progressToken` matches the token in `_meta`; `params.progress=40`, `total=100`, `message="Executing"`. Second test: request without `_meta.progressToken` → zero notification frames. Run `pnpm test` — expect RED.
- [x] 4.2 **GREEN** — Modify `src/adapters/mcp/stdio.ts`: in `callTool`, extract `progressToken` from `params._meta`; build `McpToolContext` with `sendProgress` closure writing a JSON-RPC notification (no `id`) to `this.output`; when token is absent, `sendProgress` is undefined; pass context as 2nd arg to `tool.handler`. Add private `writeNotification` helper. Run `pnpm test` — expect GREEN.

## Phase 5: tools.ts — wire McpToolContext (RED → GREEN)

- [x] 5.1 **RED** — Extend `test/adapters/mcp/tools.test.ts`: add tests asserting `dysflow.vba.execute` and `dysflow.query.execute` handlers forward the `sendProgress` function from `context` to `vbaService.execute` / `queryService.execute` (capture it in the FakeService). Add a test that a legacy handler called with a context does not throw. Run `pnpm test` — expect RED.
- [x] 5.2 **GREEN** — Modify `src/adapters/mcp/tools.ts`: update `DysflowMcpTool.handler` signature to `(input: unknown, context?: McpToolContext) => Promise<McpToolResult>`; import `McpToolContext` from `./types.js`; in `dysflow.vba.execute` and `dysflow.query.execute` handlers pass `context?.sendProgress` as `onProgress` to the respective service call. Legacy tool handlers keep their current signature and ignore context. Run `pnpm test` — expect GREEN.

## Phase 6: PowerShell — progress checkpoints

- [x] 6.1 Modify `scripts/dysflow-access-runner.ps1`: add `Write-DysflowProgress` helper function that writes `DYSFLOW_PROGRESS <compact-json>` to `[Console]::Error.WriteLine`. Emit checkpoint 1 after `OpenCurrentDatabase` succeeds (`percent:10, message:"Opening database"`), checkpoint 2 before invoking the main operation (`percent:40, message:"Executing operation"`), checkpoint 3 after the operation returns and before JSON serialization (`percent:90, message:"Finalizing"`). No emission inside any row loop.

## Phase 7: Final validation

- [x] 7.1 Run `pnpm test` — all suites green, including pre-existing `access-runner.test.ts`, `stdio.test.ts`, `tools.test.ts`, `core-services.test.ts`, and the new progress test files.
- [x] 7.2 Run `pnpm lint` (or equivalent type-check command) — zero errors. Confirm no `McpToolContext` import in any file under `src/core/`.
