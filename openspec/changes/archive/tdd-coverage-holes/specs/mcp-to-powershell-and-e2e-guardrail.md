# Delta for mcp-to-powershell-and-e2e-guardrail

`VbaSyncAdapter.execute()` ↔ `scripts/dysflow-vba-manager.ps1` contract for module-name forwarding, plus MCP E2E preflight / stop-on-fail / zombie guardrails. PS `Exists` (4148–4153) keeps its "exactly one name" check — the adapter MUST satisfy it.

## ADDED Requirements

### Requirement: Single-name `exists` MUST set `moduleNamesProvided: true`
Singular `moduleName`/`name` MUST forward as `moduleNames:["…"]` with `moduleNamesProvided:true`.

#### Scenario: singular `moduleName`
- **WHEN** `execute("exists", { moduleName:"Foo", projectCtx })` vs. fake `executor` returning `ok:true` → **THEN** `captured[0].moduleNamesProvided === true` AND `moduleNames === ["Foo"]`

#### Scenario: singular `name` alias
- **WHEN** `execute("exists", { name:"Foo", projectCtx })` → **THEN** `captured[0].moduleNamesProvided === true` AND `moduleNames === ["Foo"]`

#### Scenario: no name
- **WHEN** `execute("exists", { projectCtx })` → **THEN** `captured[0].moduleNamesProvided === false` AND `moduleNames === []`

### Requirement: Single-name `delete_module` MUST set `moduleNamesProvided: true`
Singular `moduleName`/plural `moduleNames` MUST forward as `moduleNames:["…"]` with `moduleNamesProvided:true`; `force:true` MUST reach `extra.force`.

#### Scenario: singular `moduleName` + force
- **WHEN** `execute("delete_module", { moduleName:"Foo", force:true, projectCtx })` → **THEN** `captured[0].moduleNamesProvided === true` AND `moduleNames === ["Foo"]` AND `extra.force === true`

#### Scenario: plural `moduleNames`
- **WHEN** `execute("delete_module", { moduleNames:["Foo","Bar"], projectCtx })` → **THEN** `captured[0].moduleNamesProvided === true` AND `moduleNames === ["Foo","Bar"]`

#### Scenario: no name
- **WHEN** `execute("delete_module", { projectCtx })` → **THEN** `captured[0].moduleNamesProvided === false` AND `moduleNames === []`

### Requirement: `record()` MUST STOP-ON-FAIL on `isError` disagreement
Extracted `record()` from `E2E_testing/_helpers/mcp-e2e-record.mjs` MUST throw when harness `isError` disagrees with `options.expected`.

#### Scenario: `expected:"error"` + `isError:false`
- **WHEN** `record(ctx, { area:"x", tool:"y", args:{}, options:{ expected:"error" } })` with mocked harness `{ childPid:42, isError:false, timedOut:false }` → **THEN** rejects with `mcp-e2e: STOP-ON-FAIL after y`

#### Scenario: `expected:"error"` + `isError:true`
- **WHEN** same call with `{ isError:true }` → **THEN** resolves and pushes a PASS row

#### Scenario: `expected:"success"` + `isError:true`
- **WHEN** `record(ctx, { ..., options:{ expected:"success" } })` with `{ isError:true }` → **THEN** rejects with `mcp-e2e: STOP-ON-FAIL after y`

### Requirement: Preflight MUST refuse to start when a real leaked child is alive
`record()` MUST run `waitForNoOwnPids(500,100)` before every tool (incl. first call of a battery) and throw `REFUSE-START` on any survivor.

#### Scenario: leaked child from prior run
- **WHEN** `spawn(process.execPath,["-e","setInterval(()=>{},1000)"])` runs, child PID pushed to `ctx.suiteOwnPids`, then `record(...)` runs → **THEN** rejects with `mcp-e2e: REFUSE-START` before any tool executes

### Requirement: Zombie detection MUST scope to suite-owned PIDs and document grandchild limitation
`isOwnPidAlive`/`waitForNoOwnPids` MUST only watch suite-owned PIDs. If portable Windows descendant-walk is infeasible, H5 DOCUMENTS the limitation (honest RED) — never fakes GREEN.

#### Scenario: grandchild outlives its Node parent
- **WHEN** `spawn(process.execPath,["-e","child_process.spawn(process.execPath,['-e','setInterval(()=>{},1000)'])"])` runs, outer PID in `suiteOwnPids`, outer exits, then `waitForNoOwnPids(2000,100)` → **THEN** if portable detector exists: `{ found:true, pids:[grandchildPid] }`; otherwise test DOCUMENTS limitation with `// KNOWN LIMITATION` and asserts `{ found:false }`

### Requirement: Final `lingering-access-check` row MUST be FAIL when a suite-owned PID lingers
Real `node E2E_testing/mcp-e2e.mjs` MUST, after 1s prudent delay, mark final `lingering-access-check` row `pass:false` and exit 1 on any suite-owned survivor.

#### Scenario: zombie survives the last tool
- **WHEN** `node E2E_testing/mcp-e2e.mjs` runs with harness whose last tool's child exits 2s after harness returns → **THEN** last report row has `tool === "lingering-access-check"` AND `pass === false` AND `process.exitCode === 1`

### Requirement: `record()` MUST push `${tool}:zombie-check` reflecting the per-tool child
After every tool, `record()` MUST run `waitForNoOwnPids(1000,100)` and push `${tool}:zombie-check` whose `pass` reflects whether `result.childPid` is alive.

#### Scenario: child exits cleanly
- **WHEN** harness `{ childPid:42, isError:false, timedOut:false }` and PID 42 dead before post-tool check → **THEN** row has `tool:"y:zombie-check"` AND `pass:true`

#### Scenario: child lingers
- **WHEN** harness `{ childPid:42, ... }` and PID 42 alive → **THEN** row has `tool:"y:zombie-check"` AND `pass:false` AND `record()` throws `STOP-ON-FAIL`

### Requirement: `import_modules` dry-run MUST return a plan without invoking the executor
`execute("import_modules", { moduleNames:[…], dryRun:true, projectCtx })` MUST return `ok:true` with `data.dryRun:true` and `data.plans[]`; fake `executor` MUST NOT be called.

#### Scenario: dryRun returns a plan
- **WHEN** `execute("import_modules", { moduleNames:["Foo"], dryRun:true, projectCtx })` vs. fake `executor` recording calls → **THEN** result `ok:true` with `data.dryRun === true` AND `Array.isArray(data.plans)` AND fake `executor` called 0 times

### Requirement: `import_modules` `compile:true` MUST surface untrustworthy doc-module results
When `compile:true` and executor returns `compileResult.verified === false` (form/report), MUST return `data.compileVerified:false` AND non-empty `data.documentModuleWarning`.

#### Scenario: form compile untrustworthy
- **WHEN** `execute("import_modules", { moduleNames:["Form_MyForm"], compile:true, projectCtx })` vs. fake executor returning `compileResult:{ verified:false }` → **THEN** `ok:true` with `data.compileVerified === false` AND `typeof data.documentModuleWarning === "string"` AND `length > 0`

### Requirement: `export_all` `prune:true` MUST refuse on warnings OR runtime-internal `exportPath`
`exportAllWithPrune()` MUST prune ONLY when (1) export has zero warnings AND (2) `exportPath` is NOT inside dysflow runtime.

#### Scenario: export had warnings
- **WHEN** `execute("export_all", { exportPath, prune:true, projectCtx })` vs. fake executor `{ exported:[...], warnings:["x failed"] }` → **THEN** captured prune decision `{ applied:false, reason:"export-had-warnings" }` AND no deletion occurred

#### Scenario: `exportPath` inside runtime
- **WHEN** `execute("export_all", { exportPath:"<LOCALAPPDATA>/dysflow/x", prune:true, projectCtx })` → **THEN** result `ok:false` with `error.code === "INVALID_INPUT"`

## MODIFIED Requirements

### Requirement: `Exists` action MUST require exactly one module name (PS contract anchor)
`scripts/dysflow-vba-manager.ps1:4148–4153` keeps `$normalizedModules.Count -ne 1 → throw "Exists requiere exactamente un nombre de módulo/objeto."` The adapter MUST satisfy this by forwarding singular inputs as non-empty `moduleNames` with `moduleNamesProvided:true` (per `Single-name exists` above). The script is the ground truth; this requirement binds the adapter to it.

(Previously: `moduleNamesProvided = Object.hasOwn(params, "moduleNames")` made singular `moduleName`/`name` invisible to PS — `$normalizedModules.Count` was 0 and the script threw even though the caller supplied a name.)