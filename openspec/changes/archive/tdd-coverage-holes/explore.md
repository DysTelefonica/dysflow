# Exploration: TDD Coverage Holes — MCP E2E + VBA Module Forwarding

**Change key**: `tdd-coverage-holes`
**Exploration date**: 2026-06-29
**Project**: dysflow
**Status**: EXPLORATION ONLY — no code modified

---

## 1. Contracts That Should Be Under TDD

### (a) MCP → PowerShell forwarding contract (MODULE_MAPPINGS)

Every `VbaModulesAdapter` tool maps to a PowerShell `dysflow-vba-manager.ps1` action. The forwarding logic lives in `VbaSyncAdapter.executeMappedTool()` (vba-sync-adapter.ts:228–377) which builds a `VbaManagerExecutionRequest` and calls `spawnVbaManager`.

**The critical bug**: `moduleNamesProvided` (the signal that tells PowerShell whether `-ModuleNamesJson` was passed) is set via:

```typescript
// vba-sync-adapter.ts:251
const moduleNamesProvided = Object.hasOwn(params, "moduleNames");
```

This is the **upstream payload key**, not the **mapping output**. For tools that accept singular `name`/`moduleName` (like `exists`, `delete_module`), `Object.hasOwn(params, "moduleNames")` is `false` even when the mapping correctly produces a non-empty array. PowerShell then receives no `-ModuleNamesJson`, `$normalizedModules` is derived from the positional `$ModuleName` array (which is also empty because no `-ModuleName` was passed), and the `Exists` action throws at line 4150: `"Exists requiere exactamente un nombre de módulo/objeto."`

**All MODULE_MAPPINGS entries**:

| Tool | Action | Input key(s) | `moduleNames()` output | `Object.hasOwn(params, "moduleNames")` | Bug reachable? |
|------|--------|--------------|------------------------|----------------------------------------|----------------|
| `export_modules` | Export | `moduleNames` (plural) | `stringArray(input.moduleNames)` | **TRUE** when plural key present | No — plural key alone gates correctly |
| `export_all` | Export | `filter` (optional) | `filter ? [filter] : []` | FALSE always (no moduleNames key) | No — export_all has no singular alias |
| `import_modules` | Import | `moduleNames` (plural) | `stringArray(input.moduleNames)` | **TRUE** when plural key present | No |
| `import_all` | Import | none | `[]` | FALSE | No — intentional empty for import-all |
| `list_objects` | List-Objects | none | `[]` | FALSE | No — no name input |
| **`exists`** | **Exists** | **`moduleName` OR `name` (singular)** | **`moduleName ? [moduleName] : []`** | **FALSE** — singular key | **YES — throws "requiere exactamente un nombre"** |
| `fix_encoding` | Fix-Encoding | `moduleNames` (plural) | `stringArray(input.moduleNames)` | **TRUE** when plural key present | No |
| **`delete_module`** | **Delete** | **`moduleName` (singular) OR `moduleNames` (plural)** | **`moduleNames.length > 0 ? moduleNames : moduleName ? [moduleName] : []`** | **TRUE only when plural key present** | **YES — singular `moduleName` reaches PS with no -ModuleNamesJson and no -ModuleName, causing "Count -ne 1" or wrong module deleted** |
| `vba_orphan_audit` | — | — | — (not a MODULE_MAPPING) | — | — |
| `verify_code` | — | — | — (not a MODULE_MAPPING) | — | — |

**PowerShell parameter binding for `-ModuleNamesJson`** (dysflow-vba-manager.ps1:22):
- `[Parameter()][string]$ModuleNamesJson` — optional, plain string
- `$PSBoundParameters.ContainsKey("ModuleNamesJson")` is the gate (line 4104)
- If absent, `$inputModules` falls through to `$ModuleName` array (line 4097)
- For `Exists` (line 4148–4153): requires `$normalizedModules.Count -eq 1`

**PowerShell parameter binding for `-ModuleName`** (dysflow-vba-manager.ps1:18–19):
- `[Parameter(Position=100)][string[]]$ModuleName` — positional, string array
- When the TS adapter calls `spawnVbaManager` it only passes `-ModuleNamesJson` when `moduleNamesProvided` is true (vba-sync-adapter.ts:747–749)
- `-ModuleName` is **never passed** by the TS adapter — the adapter only sets `moduleNames` in the request object, never `moduleName` as a separate PS argument

**Root cause confirmed**: For `exists` with `moduleName="Foo"`, the adapter sends no `-ModuleNamesJson` and no `-ModuleName` to PowerShell. The PS script receives `$ModuleName = @()` (empty, no bound argument), `$normalizedModules = @()` (empty after filter), and throws at line 4150.

For `delete_module` with `moduleName="Foo"` (singular), same failure mode: the PS script receives `$normalizedModules = @()`, `Invoke-DeleteAction` is called with an empty array, and either no module is deleted or the wrong one is (if other modules happen to be present in the project).

### (b) E2E suite `record()` abort-on-fail contract

**Location**: `E2E_testing/mcp-e2e.mjs:122–202`

Contract:
1. Before every tool: run `waitForNoOwnPids(500, 100)` preflight. If any suite-owned PID is alive, push a FAIL row and `process.exit(1)` / throw — **do not start the tool**.
2. Execute the MCP tool via `callMcp`.
3. Track the child's PID (`result.childPid`) as suite-owned.
4. After the tool: run `waitForNoOwnPids(1000, 100)` post-tool zombie check. Push a row. If the tool's own child is still alive, mark `zombiePass = false`.
5. **Stop-on-fail**: if `!pass || !zombiePass`, set exit code 1 and throw immediately.

**The `pass` variable computation** (line 160):
```javascript
const pass = result.timedOut ? false : expectedError ? result.isError : !result.isError;
```

This means:
- `expected: "error"` + `result.isError: true` → `pass = true`
- `expected: "error"` + `result.isError: false` (i.e., tool returned `ok: true` unexpectedly) → `pass = false` → **STOP**
- `expected: "error"` + `result.timedOut: true` → `pass = false` → **STOP**

**Critical gap**: The `pass` computation only looks at `timedOut` and `isError`. It does NOT look at the actual result content. If a tool is marked `expected: "error"` but the tool returns `ok: true` with a result that contains an error *inside* the payload (e.g., `{ ok: true, data: { isError: true } }`), the harness marks it PASS. This would require a structured `isError` at the MCP response level (JSON-RPC `error` field or `result.isError`), which the harness correctly detects at line 129.

**Second critical gap**: The preflight at line 129 runs `waitForNoOwnPids(500, 100)` — a 500ms total budget. However, this is BEFORE the first tool call too. The first `record()` call has no "previous tool" to have leaked a PID, but if a prior aborted run left zombies from tools that completed before the abort, those would be caught. This is correct behavior.

### (c) E2E suite preflight (refuse-start) contract

**Location**: `E2E_testing/mcp-e2e.mjs:129–147`

- Polls `suiteOwnPids` (Set of child PIDs this E2E spawned) for up to 500ms at 100ms intervals.
- Only suite-owned PIDs are checked — "theirs" (other Dysflow consumers) are out of scope.
- On any survivor found: FAIL row, console.error, `process.exitCode = 1`, throw.

**Scope contract**: `suiteOwnPids` is populated ONLY from `result.childPid` returned by `runMcpHarness` (line 157). The harness sets `childPid: child.pid` (mcp-harness.mjs:94) — the Node child process PID, NOT the MSACCESS.EXE PID. The MSACCESS.EXE `-Embedding` PID is a grandchild of the Node process. The E2E cannot directly observe the MSACCESS.EXE PID — it only observes the Node process that launched PowerShell, which launched MSACCESS.EXE. If the Node process exits but MSACCESS.EXE survives, `waitForNoOwnPids` watching `childPid` would NOT detect the zombie (the Node child is dead). The E2E actually watches the **Node child PID**, not the Access PID directly.

### (d) E2E suite final lingering-access-check contract

**Location**: `E2E_testing/mcp-e2e.mjs:352–377`

- Runs ONLY if `!abortedDueToFailure` (suite completed without early abort).
- Waits `PRUDENT_ZOMBIE_DELAY_MS = 1000` before checking.
- Polls `suiteOwnPids` for up to 2000ms at 100ms intervals.
- Checks ONLY suite-owned PIDs.
- Pushes a FAIL row if any survive.

---

## 2. Public Entry Points — Verification

### For (a): `VbaModulesAdapter` / `VbaSyncAdapter` public API surface

**`VbaModulesAdapter`** (vba-modules-adapter.ts:147):
- Constructor: `new VbaModulesAdapter(orchestrator: VbaModulesOrchestrator)`
- `static handles(toolName: string): boolean`
- `async execute(toolName: string, params: Record<string, unknown>): Promise<OperationResult<unknown>>`
- `VbaModulesOrchestrator` interface (lines 94–115): `scriptPath`, `accessPassword`, `cwd`, `env`, `resolveExecutionTarget`, `validateStrictContext`, `runPreflightCleanup`, `executor`, `executeMappedTool`

**`VbaSyncAdapter`** (vba-sync-adapter.ts:141):
- Constructor: `new VbaSyncAdapter(options: VbaSyncAdapterOptions)`
- `async execute(toolName: string, input: unknown): Promise<OperationResult<unknown>>`
- The internal `executeMappedTool` is private and not directly accessible.

**Key finding**: `exists-single-name-forwarding.test.ts` tries to call `modules.handle(...)` (line 125) — **this method does not exist on `VbaModulesAdapter`**. The public API is `execute(toolName, params)`. The test's entire premise is invalid. The orchestrator interface requires `resolveExecutionTarget`, `validateStrictContext`, `runPreflightCleanup`, and `executor` to be provided, making unit testing difficult without heavy mocking.

**Real test sketch**: Create a `VbaSyncAdapter` with a fake `executor` and minimal config, call `execute("exists", { moduleName: "Foo", accessPath: "...", destinationRoot: "...", projectRoot: "..." })`, and assert the captured request has `moduleNamesProvided: true` and `moduleNames: ["Foo"]`.

### For (b, c, d): `record()` extraction

**Finding**: `record()` is a **local function** inside `mcp-e2e.mjs` (line 122). It is NOT exported. There is no `_helpers/mcp-e2e-record.mjs`. The three helper files that exist are:
- `mcp-e2e-sandbox.mjs`
- `resolve-mcp-e2e-command.mjs`
- `mcp-harness.mjs`

To unit test `record()` in isolation, it would need to be extracted to a separate module and re-exported. The E2E suite's `suiteOwnPids` Set, `waitForNoOwnPids`, and `isOwnPidAlive` are also local to the module.

---

## 3. TDD Coverage Holes

| # | Hole | Current test | Why insufficient | Proposed real test sketch |
|---|------|--------------|------------------|--------------------------|
| H1 | **`exists` single-name forwarding** (`moduleName` → `-ModuleNamesJson`) | `exists-single-name-forwarding.test.ts` | **The `modules.handle()` method does not exist** — test crashes at runtime. Test also uses a hand-rolled orchestrator that bypasses `VbaSyncAdapter.executeMappedTool` entirely, so it never exercises the real `moduleNamesProvided = Object.hasOwn(params, "moduleNames")` logic. | Import `VbaSyncAdapter`, construct with a fake `executor` that captures the `VbaManagerExecutionRequest`, call `execute("exists", { moduleName: "Foo", accessPath, destinationRoot, projectRoot })`, assert `captured[0].moduleNamesProvided === true` and `captured[0].moduleNames === ["Foo"]`. Use a real `nodeConfigFileSystem` stub or `vi.mock()` for file system. |
| H2 | **`delete_module` single-name forwarding** (`moduleName` → `-ModuleNamesJson`) | None | No test exists. Same `Object.hasOwn(params, "moduleNames")` bug is reachable via `delete_module` with singular `moduleName`. If the mapping produces `["Foo"]` but `moduleNamesProvided = false`, PowerShell receives no name and deletes nothing (or wrong module). | Same pattern as H1 but for `delete_module`. Call `execute("delete_module", { moduleName: "Foo", accessPath, destinationRoot, projectRoot, force: true })` and assert the captured request. |
| H3 | E2E `record()` stop-on-fail with **unexpected `isError` on `expected: "error"` row** | `mcp-e2e-stop-on-fail.test.ts` | **The test does not import the real `record()`** — it re-implements the stop-on-fail loop in-line (lines 133–144). This is a comment-visible divergence risk: if the real `record()` logic changes, this test keeps passing. The test also only covers `timedOut: true` as a failure mode, not the `result.isError: false` when `expected: "error"` case. | Extract `record()` to `E2E_testing/_helpers/mcp-e2e-record.mjs` and re-export. Then `vi.mock()` the harness and call the real `record()` directly. Test: (1) `expected: "error"` + `isError: false` → aborts, (2) `expected: "error"` + `isError: true` → continues, (3) `expected: "success"` + `isError: true` → aborts. |
| H4 | E2E preflight catches zombies from a **prior aborted run** | `mcp-e2e-stop-on-fail.test.ts` | The in-memory simulation (H3) tests preflight with manually maintained `live` array. Does not test the actual `waitForNoOwnPids` function with a real process. The first `record()` call's preflight is the scenario where a prior run's zombie survives. | Create a real subprocess that spawns an MSACCESS-like process, kill it leaving the grandchild alive, then start the E2E harness and verify the first `record()` preflight aborts. |
| H5 | E2E **zombie detection watches Node child PID, not MSACCESS.EXE PID** | `mcp-e2e-zombie-recheck.test.ts` | **The probe script is a Node subprocess (`node -e`), not MSACCESS.EXE**. The E2E's `isOwnPidAlive(pid)` calls `process.kill(pid, 0)` on the Node child PID. A Node subprocess that spawns MSACCESS.EXE and exits immediately leaves MSACCESS.EXE orphaned, but `isOwnPidAlive(NodeChildPid)` returns false because the Node child is dead. The E2E would NOT catch this zombie. | Write a probe that spawns a real subprocess pattern: `powershell -Command "Start-Process msaccess.exe -ArgumentList '-Embedding','$accdb' -PassThru | Select-Object -ExpandProperty Id"` and verify the E2E's `waitForNoOwnPids` correctly detects the grandchild Access PID (not just the PowerShell/Node parent). |
| H6 | E2E final lingering-access-check with **1s prudent delay** | `mcp-e2e-zombie-recheck.test.ts` | The probe (`zombie-probe.mjs`) simulates the 1s delay internally but the probe itself is a Node script, not the real E2E `mcp-e2e.mjs`. The probe tests timing behavior in isolation but does NOT test the integration of the final check with the `suiteOwnPids` Set management, the `abortedDueToFailure` gate, or the report generation. | Run the real `mcp-e2e.mjs` with a test that leaves a zombie at the end (use a harness that delays the child exit by 2s after the last tool), and assert the final `lingering-access-check` row is FAIL. |
| H7 | E2E `record()` **post-tool zombie check** for the specific tool's child PID | `mcp-e2e-stop-on-fail.test.ts` | The in-memory simulation does not test the actual per-tool `waitForNoOwnPids(1000, 100)` logic against `result.childPid`. The simulation uses a synthetic `live` array and `preflight()` function that doesn't connect to the real `waitForNoOwnPids` + `isOwnPidAlive` + `suiteOwnPids` Set machinery. | Real integration test: mock `runMcpHarness` to return a specific `childPid`, then after the `record()` call verify the zombie check row. |
| H8 | `VbaModulesAdapter.execute()` **dry-run path** for `import_modules` / `import_all` | None | `VbaModulesAdapter.execute()` has a dry-run branch (line 179–182) that calls `planImport()`. No TDD test exercises this path. If `planImport()` breaks, the dry-run for imports silently returns wrong data. | Call `execute("import_modules", { moduleNames: ["Foo"], dryRun: true, ... })` and assert the returned `ImportPlanResult` structure. |
| H9 | `VbaModulesAdapter.execute()` **compile:true post-import path** | None | Lines 256–299 handle the `compile:true` post-import hook. If the compile result is `untrustworthy` (document module), the code returns `compileVerified: false` in the data. No TDD test covers this. | Call `execute("import_modules", { moduleNames: ["MyForm"], compile: true, ... })` with a fake executor that returns a `VBA_COMPILE_ERROR` and verify the untrustworthy document-module path. |
| H10 | `VbaModulesAdapter.execute()` **export_all with prune** safety guards | None | `exportAllWithPrune()` (lines 438–502) has guardrails: (1) skip prune if export had warnings, (2) refuse if `destinationRoot` is inside the dysflow runtime. No TDD tests for either guardrail. | Test: (1) mock executor to return `{ exported: [...], warnings: ["some module failed"] }` and assert prune is `{ applied: false, reason: "export-had-warnings" }`. (2) Call with `exportPath` inside the runtime and assert `INVALID_INPUT` error. |

---

## 4. Non-Obvious Risks

**R1 — `Object.hasOwn(params, "moduleNames")` bug affects ALL singular-alias tools, not just `exists`**
The mapping for `delete_module` (lines 75–78) correctly resolves both singular and plural inputs to an array, but the presence check at line 251 only looks at the plural key. Any caller using `delete_module` with `moduleName: "Foo"` (singular) triggers the same failure mode as `exists`: PowerShell gets no `-ModuleNamesJson`, `$normalizedModules` is empty, and `Invoke-DeleteAction` receives an empty module list. This is a latent bug for `delete_module` — the E2E happens to use `moduleName: "DysflowMcpE2EMissing"` but the tool call is `expected: "error"`, so the "no module deleted" behavior is indistinguishable from "correct error on missing module" and the bug is masked.

**R2 — The E2E's `suiteOwnPids` Set tracks the Node child PID, not the MSACCESS.EXE PID**
The MSACCESS.EXE `-Embedding` process is a grandchild of the Node process that spawns PowerShell. `runMcpHarness` sets `childPid = child.pid` (mcp-harness.mjs:94) where `child` is the Node `spawn()` process. If that Node process exits but MSACCESS.EXE survives (e.g., Node crashes, PowerShell outlives its Access child), `isOwnPidAlive(childPid)` returns false (the Node process is dead) even though the MSACCESS.EXE is still running. The E2E's zombie guardrails are blind to this class of orphan. The `lingering-access-check` at the end of the suite would also miss it.

**R3 — Stop-on-fail does NOT abort on a "expected: error" row whose underlying tool returned `ok: true` unexpectedly**
The `pass` variable (line 160) checks `expectedError ? result.isError : !result.isError`. If a tool is called with `expected: "error"` and returns `isError: false` (so `pass = false`), the suite aborts. But the harness only sets `isError` at line 129: `Boolean(response?.error || response?.result?.isError)`. This means the harness correctly detects structured `isError` in the MCP response. However, if the tool returns `ok: true` (no `isError` flag) with an error-like result in the content, the harness marks it `isError: false` and `expected: "error"` → `pass = false` → aborts correctly. The risk is a tool that returns `isError: true` when it shouldn't, or a tool that returns a structured error for a "success" case — neither of which is tested.

**R4 — Preflight must run BEFORE the first MCP call to catch prior-run zombies**
The `record()` function's preflight (line 129) runs on every call, including the first `record("diagnostics", "dysflow_doctor", ...)`. If a prior run aborted after `compile_vba` left a zombie, the first `record()` of a new run would catch it. This is correct but tested only in the in-memory simulation, not with a real process lifecycle.

**R5 — The `VbaModulesOrchestrator.executeMappedTool` interface requires all 5 fields**
`exists-single-name-forwarding.test.ts` builds an orchestrator with all 5 required methods (lines 87–118) but then tries to call `modules.handle(...)` which doesn't exist. Even if the test used `execute()`, the `resolveExecutionTarget` must return a fully-formed `VbaModulesExecutionTarget` including `accessDbPath`, `backendPath`, `configSource`, `projectId`, and `timeoutMs` — the test's stub (lines 92–99) only provides a partial object, which would cause a runtime error if `execute()` were called.

---

## 5. OpenSpec Artifact Path

`openspec/changes/tdd-coverage-holes/explore.md`