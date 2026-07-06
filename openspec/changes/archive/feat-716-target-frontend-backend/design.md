# Design: feat-716-target-frontend-backend

## Why a design for a small slice

The slice is small (~366 / 11 LOC, well below the 400-line budget), but
the runner path it touches is **shared** with the existing default
fallback — and pre-bug versions of the resolver were clobbering the
already-resolved state in the second block. The design captures the
interaction explicitly so a future refactor preserves the invariant.

## Module layout

```
src/
  adapters/mcp/
    schemas/query-schemas.ts        # add `target` to READ_TARGET_OVERRIDE
    tool-parity-registry.ts         # one-sentence recipe on get_schema
  core/
    contracts/index.ts              # AccessQueryRequest.target?
    mapping/access-query-request-mapper.ts
                                    # QueryTarget / isValidQueryTarget /
                                    # pickQueryTarget / pickOverrides.target /
                                    # buildQueryReadRequest passes target through
    runner/access-runner.ts         # resolve-target branch + re-keyed default
  test/
    core/mapping/access-query-request-mapper.test.ts  # unit tests for picker
    core/runner/access-runner.test.ts                 # characterization on
                                                      # injected PowerShellExecutor
```

## Data flow

```
MCP caller
  │  { projectId, target: "frontend", table: "TbConfiguracionBackends" }
  ▼
MCP tool contract (Zod)
  │  schema accepts target ∈ {"frontend","backend"}
  ▼
Adapter (caller boundary)
  │  builds AccessQueryRequest with target field
  ▼
access-query-request-mapper
  │  pickOverrides surfaces target; buildQueryReadRequest passes it through
  ▼
AccessPowerShellRunner.runLockedOperation
  │  block A: target resolution (NEW, #716)
  │  ├─ target=backend + config.backendPath → set request.backendPath, clear target
  │  ├─ target=frontend + config.accessDbPath → set request.databasePath, clear target
  │  ├─ target=frontend + !config.accessDbPath + config.backendPath → CONFIG_MISSING_TARGET_PATH
  │  └─ target=backend + !config.backendPath → CONFIG_MISSING_TARGET_PATH
  │
  │  block B: default fallback (RE-KEYED off finalOperation.request)
  │  └─ if neither backendPath nor databasePath set, prefer config.backendPath then config.accessDbPath
  │
  │  failure-fast check
  │  └─ if finalOperation has no path, return CONFIG_MISSING_TARGET_PATH with "Pass databasePath..."
  ▼
buildPowerShellArguments
  │  emits -PayloadJson '<JSON>' where JSON contains the resolved request
  │  (target cleared in resolution branch; preserved if explicit path won)
  ▼
PowerShell script
  reads backendPath/databasePath from -PayloadJson, ignores target
```

## Error model

`CONFIG_MISSING_TARGET_PATH` (existing typed error code) with two
distinct messages chosen by the missing role:

| Condition | Message |
|-----------|---------|
| `target="backend"` + no `config.backendPath` | `Cannot resolve backend target: project config does not declare backendPath. Pass backendPath explicitly or set backendPath in .dysflow/project.json.` |
| `target="frontend"` + no `config.accessDbPath` but `config.backendPath` exists | `Cannot resolve frontend target: project config does not declare accessPath. Pass databasePath explicitly or set accessPath in .dysflow/project.json.` |

The error is returned from the runner BEFORE the executor is called, so
diagnostics end up clean (no PowerShell invocation, no orphan PID, no
half-written operation registry entry that needs cleanup).

## Test discipline (web-tdd-philosophy applied)

- **Fixture gate**: each runner test creates its own tempdir with
  empty `.accdb` placeholders so `existsSync` passes; never touches a
  real Access database.
- **Dependency injection**: every runner test injects a
  `PowerShellExecutor` capturing its `args` and returning a
  `DYSFLOW_RESULT` sentinel — no real PowerShell, no real MSACCESS.EXE.
- **Cardinality before/after**: each test asserts the captured-args
  array length is exactly 1 (or 0 for the error case).
- **No humo**: assertions are concrete values — exact paths, exact
  `error.code`, exact string match on a substring of the message.
- **Three paths per slice**:
  - **Happy**: `target="frontend"` resolves; `target="backend"` resolves.
  - **Sad**: `target="backend"` + no `config.backendPath` →
    `CONFIG_MISSING_TARGET_PATH`.
  - **Edge**: explicit `databasePath` wins; `target` is preserved as
    caller's intent in the payload.
- **Refactor-safety**: assertions are on the **parsed `-PayloadJson`
  content** (what the PowerShell script actually sees), not on the
  runner's argument structure. Any future change to the args layout
  that preserves the JSON semantics will keep these tests green.
- **Single harness form**: all four #716 runner tests share the same
  scaffolding (tempdir + executor + runner construction +
  `runner.run(...)` + `readPayloadFromArgs(...)`).
- **Helper signature parity**: `pickQueryTarget` takes the same
  shape as the other `pick*` helpers in the same file, so every
  override key flows through the same null-or-value contract.

## Invariants preserved

1. Explicit `databasePath` / `backendPath` / `accessPath` / `sourcePath`
   always win over `target` — the resolver branch only fires when
   `!operation.request.databasePath && !operation.request.backendPath`.
2. The default-fallback block (existing before #716) is **not**
   weakened: it still fires when neither path is set, it still
   prefers `backendPath` over `accessDbPath`. The only change is
   that it now reads `finalOperation.request` instead of
   `operation.request` so a resolved target does not get clobbered.
3. The mapped `request.target` is preserved verbatim when the
   resolution branch is skipped (explicit-path wins). The runner does
   not silently rewrite or drop caller intent.
4. `web-tdd-philosophy` rules hold: tests survive any refactor of
   the PowerShell invocation that preserves the data sent to the
   script.

## Refactor-safety check

Walk-through: if a future commit moves `target` resolution into a
helper like `resolveSemanticTarget(request, config): Outcome<request, error>`
and inlines it into the runner:

- The payload assertions continue to work because they assert on the
  final JSON content, not on the JavaScript object identity.
- The error-path assertion (`CONFIG_MISSING_TARGET_PATH` is returned
  and `calls.toEqual([])` is empty) continues to work because the
  helper still returns before invoking the executor.
- The explicit-wins assertion (`payload.databasePath === explicitPath`)
  continues to work because the helper would still see
  `request.databasePath !== undefined` and short-circuit.

A test that broke under such a refactor would be a test asserting on
implementation detail — for example, the original WIP tests that
asserted `args.indexOf("-BackendPath") >= 0` would have broken
because the runner never emits a top-level `-BackendPath` flag (it
serializes everything into `-PayloadJson`). Those assertions were
replaced in this slice with payload-content assertions, which are the
canonical refactor-safe surface for the dysflow runner contract.
