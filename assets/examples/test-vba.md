# test_vba — dysflow MCP

## When to use

Run a JSON manifest of VBA test atoms against the compiled project. Each atom is a public procedure that follows the project's TDD contract.

## Prerequisites

- The human has compiled the project in Access (Debug > Compile). Verified via `get_capabilities.humanCompilePending:false`.
- Every procedure in the manifest is declared in the `capabilities` block of `.dysflow/project.json` under `allowedProcedures`, or the manifest passes `dryRun:true` once for an opt-out.
- The manifest file exists and parses to a valid JSON array (see shape below).

## Call

```json
{
  "tool": "test_vba",
  "arguments": {
    "proceduresJson": "[{\"procedure\": \"Test_A\", \"args\": [\"fixture\", 1]}]"
  }
}
```

`proceduresJson` is a JSON-encoded **string**. Each entry is either:

- A bare procedure name — shorthand for no-args: `"Test_A"`
- An object — `{ "procedure": "Test_A", "args": [...], "tags": [...] }` (also accepts `proc` instead of `procedure`)

The same shapes apply to a `testsPath` manifest.

## Call — one-off opt-out via `dryRun:true`

When the manifest references a procedure that is not yet declared in `allowedProcedures`, pass `dryRun:true` once. The runtime validates the manifest shape without executing the atoms, and does not raise `MCP_PROCEDURE_NOT_ALLOWED` / `MCP_ALLOWLIST_NOT_CONFIGURED`.

```json
{
  "tool": "test_vba",
  "arguments": {
    "proceduresJson": "[{\"procedure\": \"Test_A\"}]",
    "dryRun": true
  }
}
```

Use this only as a temporary opt-out. To make the run stick across sessions, declare the procedure in the `capabilities` block of `.dysflow/project.json` (the runtime re-reads `allowedProcedures` per call).

## Anti-patterns for this call

- Don't `test_vba` against an uncompiled binary — runtime will run stale code and the failure will be opaque. Compile first.
- Don't construct a non-string `proceduresJson`. The argument is a JSON-encoded string of the array — it parses to the array; passing the array directly fails with `MCP_INPUT_INVALID`.
- Don't reuse a compiled binary that has had `import_modules` since the last compile without re-compiling. The runtime enforces this; you should too.
- Don't skip the failure-detail on RED. The envelope carries `error.details.failures[]` with per-procedure reports (`procedure`, `error`, `logs`, `durationMs`, `payload`) — read it, don't paraphrase the summary.

## Result shape (what the agent reads back)

Issue #1166 locks the failure envelope contract for `test_vba`. The same envelope shape is used by `verify_code`, `list_objects`, and other read-class tools — `test_vba` no longer throws on failure, it returns a normal result object.

### Failure path (`isError: true`, `ok: false`)

```json
{
  "content": [
    { "type": "text", "text": "VBA_TESTS_FAILED: 2 VBA test(s) failed: Test_B — Assert failed; Test_D — Timeout" }
  ],
  "isError": true,
  "ok": false,
  "error": {
    "code": "VBA_TESTS_FAILED",
    "errorCode": "VBA_TESTS_FAILED",
    "message": "2 VBA test(s) failed: Test_B — Assert failed; Test_D — Timeout",
    "errorMessage": "2 VBA test(s) failed: Test_B — Assert failed; Test_D — Timeout",
    "diagnostics": [
      {
        "code": "VBA_TESTS_FAILED",
        "severity": "error",
        "message": "2 VBA test(s) failed: Test_B — Assert failed; Test_D — Timeout"
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

Field contract — read each directly, do NOT regex-parse `error.message`:

| Field | Type | Meaning |
|---|---|---|
| `error.code` | string | Always `"VBA_TESTS_FAILED"` for this tool's failure path. Branch on it. |
| `error.details.failedCount` | integer | Number of failing procedures. |
| `error.details.failures[]` | array | Per-procedure failure entries — each carries `procedure`, `error`, `logs`, `durationMs`, `payload`. Use this array to enumerate which atoms failed. |
| `error.details.results[]` | array | Full per-procedure report (passing + failing) — use it to correlate failures against the manifest. |
| `error.relatedIssueNumbers` | string[] | Includes `"#1166"` — the PR that introduced this contract. Grep `error.relatedIssueNumbers` to land on the contract docs from any tool envelope. |
| `content[0].text` | string | Legacy `<CODE>: <message>` body. Starts with `VBA_TESTS_FAILED:` for backward compatibility with regex consumers. |

Per-procedure failure entry:

| Field | Type | Required | Notes |
|---|---|---|---|
| `procedure` | string | yes | Public VBA procedure name as the manifest declared it. |
| `error` | string | yes | Short failure reason (assertion mismatch, timeout, etc.). |
| `logs` | unknown[] | yes | Per-procedure log lines the runner captured. Empty array when the runner emitted none. |
| `durationMs` | number | no | Wall-clock duration. `undefined` when the runner did not measure it. |
| `payload` | unknown | no | Runner-reported structured payload (often the procedure's own return value). `undefined` when absent. |

### Success path (`isError: false`, `ok: true`)

```json
{
  "content": [
    {
      "type": "text",
      "text": "[{\"ok\":true,\"procedure\":\"Test_A\",\"durationMs\":4},{\"ok\":true,\"procedure\":\"Test_B\",\"durationMs\":5}]"
    }
  ],
  "isError": false,
  "ok": true
}
```

The success path is unchanged from earlier releases — `test_vba` returning a passing manifest still emits `isError: false`, `ok: true`, and the structured per-procedure data lives in `content[0].text` as a JSON-encoded array. The success path does NOT carry `error` / `error.details`.

### Structured access path (Code Mode consumers)

The `dysflow-usage` skill § "Code Mode JSON-wrapping workaround" explains why OpenCode Code Mode can deliver MCP results as JSON-encoded `string` literals instead of parsed objects. For `test_vba` failures specifically:

1. `try/catch` is NOT the right surface — `test_vba` returns a normal result object on failure, it does NOT throw.
2. After the call, read `result.isError === true` (or `result.ok === false`) and branch on `result.error.code === "VBA_TESTS_FAILED"`.
3. Iterate `result.error.details.failures[]` directly. Each entry is a structured object — do NOT regex-parse `result.error.message` to recover the procedure name or per-atom logs.
4. If your host wraps the MCP result as a JSON string (Code Mode F14 bug), `JSON.parse` it first, then access `parsed.error.details.failures[]`.

```js
const raw = await tools.dysflow.test_vba({ testsPath: "tests/some-manifest.json", dryRun: false });
const result = typeof raw === "string" ? JSON.parse(raw) : raw;
if (result?.isError === true && result?.error?.code === "VBA_TESTS_FAILED") {
  for (const failure of result.error.details.failures) {
    // failure.procedure, failure.error, failure.logs, failure.durationMs, failure.payload
  }
}
```

### Aggregation caveat

Aggregate entry points (e.g. `RunAll` helpers) surface their inner failures only if `RunAll` itself returns them in its own payload — dysflow does not parse VBA assertion output. If you see `failedCount: 1` with one `failures[]` entry for a `RunAll` aggregator, check that entry's `procedure` and `payload` — the runner returned one structured record, not a per-atom expansion.

## Live verification

```bash
get_capabilities  # confirm humanCompilePending:false before the manifest run
```

## Cross-reference

- Issue #1166 — original enhancement request and acceptance criteria.
- Companion: `assets/examples/run-vba.md` (single-procedure path — same envelope family; out of scope for #1166 but documented for parity).
- Skill pointer: `dysflow-usage` § "Code Mode JSON-wrapping workaround" — explains the JSON-string defensive parse and points at the structured `error.details.failures[]` access path this contract exposes.
- Regression-lock: `test/adapters/mcp/test-vba-failure-envelope-1166.test.ts`.
- Error codes: `references/error-codes.md#VBA_TESTS_FAILED`, `references/error-codes.md#MCP_ALLOWLIST_NOT_CONFIGURED`, `references/error-codes.md#MCP_PROCEDURE_NOT_ALLOWED`, `references/error-codes.md#VBA_MANAGER_TIMEOUT`, `references/error-codes.md#VBA_MANAGER_FAILED`.