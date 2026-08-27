# test_vba — dysflow MCP

`test_vba` runs a JSON manifest of VBA test atoms against the compiled
project. It has two contracts documented below:

1. **Canonical commit flag** (`apply: true`) — locked by issue #1167.
2. **Failure envelope shape** (`error.details.failures[]` accessible
   without parsing `error.message`) — locked by issue #1166.

Both contracts are honored by the same tool. Read the section that
matches the call you are making.

## Prerequisites

- The human has compiled the project in Access (Debug ▸ Compile).
  Verified via `get_capabilities.humanCompilePending:false`.
- `capabilities.allowWrites = true` in `.dysflow/project.json` AND
  `writesProcess.enabled = true` at the runtime level.
- The manifest file exists and parses to a valid JSON array.
- If the project declares a non-empty `allowedProcedures` list, every
  procedure in the manifest is included. Missing and empty lists impose no
  restriction on stdio `test_vba`.

## Canonical commit flag (issue #1167)

Before issue #1167 `test_vba` was the ONLY MCP tool whose canonical
commit signal was `dryRun: false` — every other write-class tool
committed with `apply: true`. The asymmetry forced every AI consumer to
memorize the per-tool rule or look it up via
`get_capabilities.tools[toolName].canonicalCommitFlag` per call.

After #1167 `test_vba` joins the homogenized single-flag design:

| Input                              | Result                                                |
| ---------------------------------- | ----------------------------------------------------- |
| `apply: true`                      | commit (canonical)                                    |
| `apply: false`                     | plan                                                  |
| `dryRun: true`                     | plan (legacy alias)                                   |
| `dryRun: false`                    | commit (legacy alias)                                 |
| `{ apply: true, dryRun: true }`    | rejected — `MCP_INPUT_INVALID: apply and dryRun are mutually exclusive` |
| neither                            | commit (developer mode) or plan (safe-by-default mode) |

`get_capabilities.tools.test_vba.canonicalCommitFlag` now reports
`"apply"` for every advertised MCP tool — the smoke test at
`test/adapters/mcp/get-capabilities-test-vba-canonical.test.ts` loops
`MCP_TOOL_CONTRACTS` and pins the unification at the registry layer.

### Commit a test_vba run (canonical)

```json
{
  "projectId": "my-project",
  "testsPath": "tests/tests.vba.json",
  "apply": true
}
```

`apply: true` is the canonical commit signal across the dysflow
toolset. The dispatch boundary honors it; the adapter routes it to the
runner; a non-empty `allowedProcedures` list is an opt-in whitelist and
refuses only plans containing a procedure outside that list.

### Plan a test_vba run (no PowerShell, no Access)

```json
{
  "projectId": "my-project",
  "testsPath": "tests/tests.vba.json",
  "apply": false
}
```

OR (legacy alias — kept for backward compatibility):

```json
{
  "projectId": "my-project",
  "testsPath": "tests/tests.vba.json",
  "dryRun": true
}
```

Both `apply: false` and `dryRun: true` short-circuit to a plan-shaped
result:

```json
{
  "dryRun": true,
  "willExecute": false,
  "willModifyAccess": false,
  "plan": {
    "procedureName": ["Test_Alpha", "Test_Beta"],
    "proceduresCount": 2,
    "warnings": [],
    "errors": []
  }
}
```

Plan mode never spawns Access and remains useful for reviewing the plan
shape before execution.

### Backward compatibility: `dryRun: false` still commits

```json
{
  "projectId": "my-project",
  "testsPath": "tests/tests.vba.json",
  "dryRun": false
}
```

`dryRun: false` is a legacy alias of `apply: true` (commit) and is
preserved for the pre-#1167 orchestrator briefs that hard-coded the
old contract. New code should use `apply: true`.

## Opt-in allowlist (#1556)

For stdio `test_vba`, missing or empty `allowedProcedures` means no
restriction. A non-empty list enables whitelist mode: every procedure in
the resolved plan must appear in the list, or the whole plan is rejected
before Access starts. HTTP `/vba/test` is a network surface and remains
default-deny when the list is missing or empty.

The stdio contract has two outcomes:

- `PROCEDURE_NOT_ALLOWED` — the allowlist is configured and the
  plan contains a procedure NOT in the list. Fix: add the procedure
  to the allowlist or test a procedure that is in the list.
- Missing/empty allowlist — execution proceeds, subject to the write,
  sandbox, manifest, and human-compile gates.

## Failure envelope (issue #1166)

`test_vba` no longer throws on failure. It returns a normal result
object with `isError: true` / `ok: false` and a structured
`error.details.failures[]` — the same envelope shape used by
`verify_code`, `list_objects`, and other read-class tools. The same
field contract applies to `run_vba` for parity.

### Failure path (`isError: true`, `ok: false`)

```json
{
  "content": [
    { "type": "text", "text": "VBA_TESTS_FAILED: 2 VBA test(s) failed: Test_B - Assert failed; Test_D - Timeout" }
  ],
  "isError": true,
  "ok": false,
  "error": {
    "code": "VBA_TESTS_FAILED",
    "errorCode": "VBA_TESTS_FAILED",
    "message": "2 VBA test(s) failed: Test_B - Assert failed; Test_D - Timeout",
    "errorMessage": "2 VBA test(s) failed: Test_B - Assert failed; Test_D - Timeout",
    "diagnostics": [
      {
        "code": "VBA_TESTS_FAILED",
        "severity": "error",
        "message": "2 VBA test(s) failed: Test_B - Assert failed; Test_D - Timeout"
      }
    ],
    "relatedIssueNumbers": ["#1166"],
    "details": {
      "failedCount": 2,
      "failures": [
        {
          "procedure": "Test_B",
          "error": "Assert failed",
          "logs": ["expected 1", "got 2"],
          "durationMs": 123,
          "payload": { "ok": false, "error": "Assert failed" }
        },
        {
          "procedure": "Test_D",
          "error": "Timeout",
          "logs": ["slow start"],
          "durationMs": 999,
          "payload": { "ok": false, "error": "Timeout" }
        }
      ],
      "results": [
        { "ok": true, "procedure": "Test_A", "durationMs": 4 },
        {
          "ok": false, "procedure": "Test_B", "error": "Assert failed",
          "logs": ["expected 1", "got 2"], "durationMs": 123,
          "payload": { "ok": false, "error": "Assert failed" }
        },
        { "ok": true, "procedure": "Test_C", "durationMs": 6 },
        {
          "ok": false, "procedure": "Test_D", "error": "Timeout",
          "logs": ["slow start"], "durationMs": 999,
          "payload": { "ok": false, "error": "Timeout" }
        }
      ]
    }
  }
}
```

Field contract — read each directly, do NOT regex-parse
`error.message`:

| Field                          | Type      | Meaning |
| ------------------------------ | --------- | ------- |
| `error.code`                   | string    | Always `"VBA_TESTS_FAILED"` for this tool's failure path. Branch on it. |
| `error.details.failedCount`    | integer   | Number of failing procedures. |
| `error.details.failures[]`     | array     | Per-procedure failure entries — each carries `procedure`, `error`, `logs`, `durationMs`, `payload`. Iterate this array to enumerate which atoms failed. |
| `error.details.results[]`      | array     | Full per-procedure report (passing + failing) — use it to correlate failures against the manifest. |
| `error.relatedIssueNumbers`    | string[]  | Includes `"#1166"` — the PR that introduced this contract. Grep `error.relatedIssueNumbers` to land on the contract docs from any tool envelope. |
| `content[0].text`              | string    | Legacy `<CODE>: <message>` body. Starts with `VBA_TESTS_FAILED:` for backward compatibility with regex consumers. |

Per-procedure failure entry:

| Field         | Type      | Required | Notes |
| ------------- | --------- | -------- | ----- |
| `procedure`   | string    | yes      | Public VBA procedure name as the manifest declared it. |
| `error`       | string    | yes      | Short failure reason (assertion mismatch, timeout, etc.). |
| `logs`        | unknown[] | yes      | Per-procedure log lines the runner captured. Empty array when the runner emitted none. |
| `durationMs`  | number    | no       | Wall-clock duration. `undefined` when the runner did not measure it. |
| `payload`     | unknown   | no       | Runner-reported structured payload (often the procedure's own return value). `undefined` when absent. |

### Success path (`isError: false`, `ok: true`)

```json
{
  "content": [
    {
      "type": "text",
      "text": "{\"mode\":\"apply\",\"passed\":2,\"failed\":0,\"tests\":[{\"ok\":true,\"procedure\":\"Test_A\",\"durationMs\":4},{\"ok\":true,\"procedure\":\"Test_B\",\"durationMs\":5}]}"
    }
  ],
  "isError": false,
  "ok": true
}
```

`test_vba` returning a passing manifest emits `isError: false`,
`ok: true`, and an apply summary in `content[0].text`. The `tests[]`
array contains one independently serialized result per procedure; use
`passed` and `failed` for aggregate counts. The PowerShell runner also
keeps the batch behind a named `tests` property before the adapter
normalizes this public shape, so host wrappers never have to interpret
concatenated procedure output or a top-level result array (#1657).
The success path does NOT carry `error` / `error.details`.

### Structured access path (Code Mode consumers)

The `dysflow-usage` skill § "Code Mode JSON-wrapping workaround"
explains why OpenCode Code Mode can deliver MCP results as
JSON-encoded `string` literals instead of parsed objects. For
`test_vba` failures specifically:

1. `try/catch` is NOT the right surface — `test_vba` returns a normal
   result object on failure, it does NOT throw.
2. After the call, read `result.isError === true` (or
   `result.ok === false`) and branch on
   `result.error.code === "VBA_TESTS_FAILED"`.
3. Iterate `result.error.details.failures[]` directly. Each entry is
   a structured object — do NOT regex-parse `result.error.message`
   to recover the procedure name or per-atom logs.
4. If your host wraps the MCP result as a JSON string (Code Mode
   F14 bug), `JSON.parse` it first, then access
   `parsed.error.details.failures[]`.

```js
const raw = await tools.dysflow.test_vba({ testsPath: "tests/some-manifest.json", apply: true });
const result = typeof raw === "string" ? JSON.parse(raw) : raw;
if (result?.isError === true && result?.error?.code === "VBA_TESTS_FAILED") {
  for (const failure of result.error.details.failures) {
    // failure.procedure, failure.error, failure.logs, failure.durationMs, failure.payload
  }
}
```

### Aggregation caveat

Aggregate entry points (e.g. `RunAll` helpers) surface their inner
failures only if `RunAll` itself returns them in its own payload —
dysflow does not parse VBA assertion output. If you see
`failedCount: 1` with one `failures[]` entry for a `RunAll`
aggregator, check that entry's `procedure` and `payload` — the runner
returned one structured record, not a per-atom expansion.

## Anti-patterns

- `compile: true` — the runtime no longer compiles. The human
  compiles in Access (Debug ▸ Compile) before re-running tests.
  See `assets/examples/import-modules.md`.
- `dryRun: true` + `apply: true` — rejected up-front as
  `MCP_INPUT_INVALID: apply and dryRun are mutually exclusive`.
  Pick one signal.
- A non-empty `allowedProcedures` list is an opt-in whitelist. Keep it in
  sync with the manifest, or omit/empty it when the project does not want
  this extra restriction.
- Don't `test_vba` against an uncompiled binary — runtime will run
  stale code and the failure will be opaque. Compile first.
- Don't construct a non-string `proceduresJson`. The argument is a
  JSON-encoded string of the array — it parses to the array; passing
  the array directly fails with `MCP_INPUT_INVALID`.
- Don't reuse a compiled binary that has had `import_modules` since
  the last compile without re-compiling. The runtime enforces this;
  you should too.
- Don't skip the failure-detail on RED. The envelope carries
  `error.details.failures[]` with per-procedure reports — read it,
  don't paraphrase the summary.

## Live verification

```bash
get_capabilities  # confirm humanCompilePending:false before the manifest run
```

## Cross-reference

- Issue #1166 — failure envelope contract.
- Issue #1167 — canonical commit flag (`apply`).
- Companion: `assets/examples/run-vba.md` (single-procedure path —
  same envelope family; out of scope for #1166/#1167 but documented
  for parity).
- Skill pointer: `dysflow-usage` § "Code Mode JSON-wrapping
  workaround" — explains the JSON-string defensive parse and points
  at the structured `error.details.failures[]` access path this
  contract exposes.
- Regression locks:
  `test/adapters/mcp/test-vba-failure-envelope-1166.test.ts`,
  `test/adapters/mcp/get-capabilities-test-vba-canonical.test.ts`,
  `test/adapters/vba-sync/vba-execution-adapter-apply-flag.test.ts`,
  `test/adapters/vba-sync/vba-test-vba-coherence-1046.test.ts`,
  `test/adapters/mcp/contradictory-write-flags-1078.test.ts`.
- Error codes: `references/error-codes.md#VBA_TESTS_FAILED`,
  `references/error-codes.md#PROCEDURE_NOT_ALLOWED`,
  `references/error-codes.md#VBA_MANAGER_TIMEOUT`,
  `references/error-codes.md#VBA_MANAGER_FAILED`.
