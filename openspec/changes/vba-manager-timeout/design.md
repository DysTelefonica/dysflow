# Design: VBA Manager Timeout and Non-Interactive Hardening

## Context

`spawnVbaManager` (`src/core/services/vba-sync-legacy-service.ts`, lines 382-404) is the executor that the legacy MCP tool service shells out to `dysflow-vba-manager.ps1` with. Today it:

1. Spawns `powershell.exe` with **no kill timer** — any blocked child (modal dialog, file lock, `Read-Host`, unhandled error) hangs the MCP server forever.
2. Omits `-NonInteractive` from the PowerShell args, so a stray prompt waits for stdin that never arrives.

The sibling executor `spawnPowerShell` (`src/core/runner/access-runner.ts`, lines 173-203) already solves both problems for the canonical Access runner. The design here is **intentionally a narrow mirror** of `spawnPowerShell` — same kill-timer shape, same `timedOut` flag, same args order — so that future cleanup can collapse them into a single helper without rework.

## Goals

- Bounded execution for every `spawnVbaManager` invocation, identical pattern to `spawnPowerShell`.
- Typed failure (`VBA_MANAGER_TIMEOUT`, `retryable: true`) the MCP adapter can surface and the caller can retry.
- `-NonInteractive` flag injected so any unexpected prompt fails fast instead of hanging.
- Zero behavioral change to the happy path (success/failure exit codes, stdout/stderr handling).
- Minimal blast radius: no new config fields, no MCP adapter rewrite, no script changes.

## Non-Goals

- Sharing a helper between `spawnVbaManager` and `spawnPowerShell` (deferred — they will diverge in transient ways during this fix and converging them prematurely couples two parallel migrations).
- Process-tree kill on Windows (`child.kill()` only kills the PowerShell host; child processes spawned by the script can orphan — same gap as `spawnPowerShell`).
- New config surface — `DysflowConfig.processTimeoutMs` already exists and is the right hook.
- Changes to `dysflow-vba-manager.ps1`.

## Architecture Approach

### Pattern

**Mirror existing bounded-runner pattern.** The `access-core-services` capability already defines "bounded PowerShell execution with kill timer, `timedOut` flag, and typed timeout error" as a contract. This change extends that contract to the legacy VBA manager executor. No new patterns introduced.

### Layering

```
┌────────────────────────────────────────────────────────────┐
│ MCP stdio adapter (src/adapters/mcp/stdio.ts)              │
│  - loads DysflowConfig once at startup                     │
│  - constructs VbaSyncLegacyService                         │
└──────────────────────┬─────────────────────────────────────┘
                       │ injects { processTimeoutMs }
                       ▼
┌────────────────────────────────────────────────────────────┐
│ VbaSyncLegacyService                                       │
│  - executeMappedTool() builds VbaManagerExecutionRequest   │
│  - includes timeoutMs from constructor option              │
│  - maps result.timedOut → VBA_MANAGER_TIMEOUT failure      │
└──────────────────────┬─────────────────────────────────────┘
                       │ VbaManagerExecutionRequest { timeoutMs, ... }
                       ▼
┌────────────────────────────────────────────────────────────┐
│ spawnVbaManager (executor)                                 │
│  - spawn powershell.exe (with -NonInteractive)             │
│  - setTimeout kill-timer @ request.timeoutMs               │
│  - returns { ..., timedOut: boolean }                      │
└────────────────────────────────────────────────────────────┘
```

### Boundaries

- **Service layer (`VbaSyncLegacyService`)** owns the policy: "what timeout do we use, and what error do we surface on timeout."
- **Executor layer (`spawnVbaManager`)** owns the mechanism: "spawn, watch the clock, kill on expiry, report `timedOut`."
- The executor is a function type (`VbaManagerExecutor`), already injectable in tests — so the kill-timer becomes unit-testable via the real executor, and the timeout-mapping logic becomes unit-testable via fake executors that return `timedOut: true`.

## Component Changes

### 1. `VbaManagerExecutionRequest` — add `timeoutMs`

```ts
export type VbaManagerExecutionRequest = {
  scriptPath: string;
  action: string;
  accessPath?: string;
  destinationRoot: string;
  moduleNames: readonly string[];
  password?: string;
  json: boolean;
  extra: Record<string, string | boolean | number | undefined>;
  timeoutMs: number;                  // NEW — process budget in ms
};
```

### 2. `VbaManagerExecutionResult` — add `timedOut`

```ts
export type VbaManagerExecutionResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;                  // NEW — true if killed by timer
};
```

### 3. `VbaSyncLegacyServiceOptions` — add `processTimeoutMs`

```ts
export type VbaSyncLegacyServiceOptions = {
  executor?: VbaManagerExecutor;
  scriptPath?: string;
  env?: Record<string, string | undefined>;
  cwd?: string;
  processTimeoutMs?: number;          // NEW — defaults to 30_000
};
```

The service stores it as `private readonly processTimeoutMs: number`, defaulting to `30_000` (matches `DEFAULT_TIMEOUT_MS` in `dysflow-config.ts`).

### 4. `executeMappedTool` — thread timeout into request, map timeout to typed error

```ts
const request: VbaManagerExecutionRequest = {
  // ... existing fields
  timeoutMs: this.processTimeoutMs,
};

const result = await this.executor(request);

if (result.timedOut) {
  return failureResult(
    createDysflowError(
      "VBA_MANAGER_TIMEOUT",
      `${toolName} timed out after ${this.processTimeoutMs}ms`,
      { retryable: true },
    ),
    { durationMs: result.durationMs },
  );
}

if (result.exitCode !== 0) { /* existing branch */ }
```

The timeout branch MUST come **before** the exit-code branch — a killed child often emits exit code 1 from PowerShell, and we want to report the timeout (not a generic exit-code failure) because it changes operator response (retry vs. investigate script bug).

### 5. `spawnVbaManager` — kill-timer + `-NonInteractive`

```ts
const spawnVbaManager: VbaManagerExecutor = (request) => {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const args = [
      "-NoProfile",
      "-NonInteractive",                              // NEW
      "-ExecutionPolicy", "Bypass",
      "-File", request.scriptPath,
      "-Action", request.action,
      "-DestinationRoot", request.destinationRoot,
    ];
    // ... existing arg-building loop

    const child = spawn("powershell.exe", args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;                                                       // NEW
    const timer = setTimeout(() => { timedOut = true; child.kill(); },          // NEW
                             request.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
    child.on("error", (error: Error) => { stderr += error.message; });
    child.on("close", (exitCode) => {
      clearTimeout(timer);                                                      // NEW
      resolve({ exitCode, stdout, stderr, durationMs: Date.now() - startedAt, timedOut });
    });
  });
};
```

Arg order matches `spawnPowerShell` line 143 verbatim (`-NoProfile`, `-NonInteractive`, `-ExecutionPolicy`, `Bypass`, `-File`, ...) — this consistency is what lets a future PR collapse both executors into one helper.

### 6. `src/adapters/mcp/stdio.ts` — wire `processTimeoutMs`

```ts
legacyToolService: new VbaSyncLegacyService({
  processTimeoutMs: configResult.data.processTimeoutMs,
}),
```

This is the **only** call-site change outside the service module. `configResult` is already in scope at line 132.

## Data Flow

1. **Startup** — `startMcpStdioAdapter` calls `loadDysflowConfig()`, which sets `processTimeoutMs = timeoutMs` (currently identical values, see `dysflow-config.ts` lines 140, 156, 234).
2. **Construction** — Adapter constructs `VbaSyncLegacyService({ processTimeoutMs: config.processTimeoutMs })`. Service caches the value.
3. **Tool invocation** — MCP calls `service.execute(toolName, input)`. `executeMappedTool` builds a `VbaManagerExecutionRequest` that includes `timeoutMs: this.processTimeoutMs`.
4. **Executor** — `spawnVbaManager` arms `setTimeout(..., request.timeoutMs)`. If the child closes first, `clearTimeout` cancels the kill. If the timer fires first, `child.kill()` triggers `close`, and `timedOut === true` is returned.
5. **Result mapping** — Service checks `result.timedOut` BEFORE `result.exitCode`. On timeout, returns `VBA_MANAGER_TIMEOUT` with `retryable: true`. On non-zero exit, returns existing `VBA_MANAGER_FAILED`. On success, returns parsed payload.

## Integration Points

| Touchpoint | Change | Owner |
|------------|--------|-------|
| `DysflowConfig.processTimeoutMs` | Read-only consumer | already exists |
| MCP adapter constructor call | Pass `processTimeoutMs` option | this PR |
| `VbaSyncLegacyService` callers in tests | Optionally pass `processTimeoutMs` | this PR (test updates) |
| `dysflow-vba-manager.ps1` | None | n/a |
| `access-runner.ts` `spawnPowerShell` | None (reference only) | n/a |

## Architectural Decisions (ADRs)

### ADR-1: Pass `processTimeoutMs` via constructor option, not via `DysflowConfig`

**Decision:** Add `processTimeoutMs?: number` to `VbaSyncLegacyServiceOptions`. The MCP adapter destructures it from `configResult.data` at construction time.

**Considered alternatives:**

1. **Pass `DysflowConfig` to `spawnVbaManager` directly** — REJECTED. Couples the executor to the full config object, leaks unrelated fields (passwords, paths) into a layer that only needs a number, and breaks the existing `VbaManagerExecutor` function type.
2. **Pass the whole `DysflowConfig` to `VbaSyncLegacyService` constructor** — REJECTED. Larger blast radius (every test would need to construct or stub a full config), and the service already has a working `env`-based wiring pattern. We can adopt full-config injection later as a separate refactor.
3. **Re-load `DysflowConfig` inside the service** — REJECTED. The service has no way to know which project context it was constructed for; reloading would race against config changes and contradict the "config loaded once at startup" pattern already in `stdio.ts`.
4. **Read `DYSFLOW_TIMEOUT_MS` from `this.env`** — REJECTED. Bypasses the config layer's validation, normalization, and default handling. The point of `DysflowConfig` is to centralize that logic.

**Rationale:** Option 1 (constructor option) has the smallest blast radius and the cleanest test surface. The service receives a primitive `number` it can default trivially. The MCP adapter — the single production call-site — already has `DysflowConfig` in scope and extracts one field. This mirrors how `AccessPowerShellRunner` consumes `config.timeoutMs` per-call: the runner doesn't hold the config, the caller threads the relevant scalar through.

**Tradeoff accepted:** The service caches a snapshot of `processTimeoutMs` at construction. If the operator changes `DYSFLOW_TIMEOUT_MS` mid-session, the legacy service won't pick it up until the MCP adapter restarts. This is acceptable because (a) the same is true for every other config-derived field in the adapter, and (b) the MCP server is a single long-running process that gets restarted on config changes anyway.

### ADR-2: Use `processTimeoutMs`, not `timeoutMs`

**Decision:** Read `DysflowConfig.processTimeoutMs` (not `timeoutMs`).

**Why:** Both fields currently hold the same value (see `dysflow-config.ts` lines 140, 156, 234). But semantically:
- `timeoutMs` is the **overall operation budget** (includes registry writes, post-processing, etc.).
- `processTimeoutMs` is the **child process execution budget**.

`spawnVbaManager` is a process executor — using `processTimeoutMs` is semantically correct and future-proofs the design for the day these values diverge (e.g., if a future config splits "process budget" from "operation budget" to allow a longer wait for slow Access exports while still bounding overall MCP request time).

**Rejected alternative:** "Just use `timeoutMs` since they're identical today" — naming carries intent. The next person to add a separate operation-level timeout will look for `processTimeoutMs` here and find the wrong field if we used `timeoutMs`.

### ADR-3: Timeout branch before exit-code branch

**Decision:** In `executeMappedTool`, check `result.timedOut` BEFORE `result.exitCode !== 0`.

**Why:** A `child.kill()` on Windows typically resolves `close` with a non-zero exit code (often 1 or null). If we checked exit code first, every timeout would be misreported as `VBA_MANAGER_FAILED` with a generic "exit code 1" message — losing the actionable `retryable: true` signal and giving operators the wrong remediation path (debug script vs. retry/extend timeout).

This matches `AccessPowerShellRunner.run()` lines 102-107 verbatim.

### ADR-4: `-NonInteractive` after `-NoProfile`, before `-ExecutionPolicy`

**Decision:** Arg order is `["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", ...]`.

**Why:** Identical to `spawnPowerShell` (access-runner.ts line 143). The order doesn't affect PowerShell behavior (these are independent flags), but identical ordering is a prerequisite for the future "single helper" refactor and makes side-by-side diffs trivially readable.

### ADR-5: Default `processTimeoutMs` to `30_000` when option is absent

**Decision:** `this.processTimeoutMs = options.processTimeoutMs ?? 30_000`.

**Why:** Tests that construct `new VbaSyncLegacyService()` without passing the option must still work and must still get a finite timeout. `30_000` matches `DEFAULT_TIMEOUT_MS` in `dysflow-config.ts` — using the same constant value (not importing the constant, to avoid a circular dependency between services and config) preserves the invariant that "uninitialized timeout" means "30 seconds" everywhere in the codebase.

**Rejected alternative:** Make `processTimeoutMs` required. REJECTED because it breaks every existing test that constructs the service without options, for no real safety win — the MCP adapter always passes it in production, and tests that care about timeout behavior will pass it explicitly.

## Risks and Open Questions

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| 30s default too short for legitimate long Export | Medium | Operator sees spurious timeouts | `DYSFLOW_TIMEOUT_MS` env override and project-config `timeoutMs` already work; error message includes the millisecond budget so the operator knows what to bump. |
| `child.kill()` orphans child processes spawned by PS script | Low | Zombie processes on long-running MCP server | Same gap as `spawnPowerShell` — accepted as parity. Tracked separately for process-tree-kill follow-up. |
| `-NonInteractive` breaks a script path that legitimately prompts | Very Low | Tool fails instead of hanging | The script is designed to be non-interactive; any prompt is a bug. Failing fast is the correct behavior. |
| Caching `processTimeoutMs` at construction means runtime config changes are ignored | Low | Stale timeout after env mutation | Matches existing pattern for all `DysflowConfig`-derived adapter state; MCP restart picks up new value. |

## Validation Plan

Spec scenarios (covered in `openspec/specs/access-core-services/spec.md`) and unit tests must demonstrate:

1. **Timeout fires** — Construct service with `processTimeoutMs: 50`, executor that never resolves. Assert: result is `VBA_MANAGER_TIMEOUT`, `retryable: true`, message mentions `50ms`.
2. **`-NonInteractive` present** — Construct service, capture args passed to a fake executor. Assert: args array contains `-NonInteractive` immediately after `-NoProfile`.
3. **Success path unchanged** — Existing happy-path tests (e.g. `export_modules`) still pass with `processTimeoutMs` defaulted or explicit.
4. **Exit-code path unchanged** — Existing failure tests (non-zero exit) still resolve to `VBA_MANAGER_FAILED`, not `VBA_MANAGER_TIMEOUT`.
5. **Timeout precedence** — Executor returns `{ timedOut: true, exitCode: 1 }`. Assert: service maps to `VBA_MANAGER_TIMEOUT`, not `VBA_MANAGER_FAILED`.
6. **Real `spawnVbaManager` kill-timer** — Integration-style test (or skipped on non-Windows) that spawns a real PowerShell command sleeping longer than the timeout, asserts `timedOut: true` and bounded duration.

## Rollback

Single-commit revert restores prior `spawnVbaManager` and `VbaSyncLegacyServiceOptions`. No data migration, no config migration, no script changes. The `processTimeoutMs` field on `DysflowConfig` predates this change and remains untouched.

## Artifacts

- `openspec/changes/vba-manager-timeout/design.md` (this file)
- Engram `sdd/vba-manager-timeout/design`
