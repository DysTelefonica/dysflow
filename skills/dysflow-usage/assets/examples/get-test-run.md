# `get_test_run`

> **Phase**: tests  ·  **Access**: read-only  ·  **Status**: preferred (_meta["dysflow/workflow"].status)

## What it does

Read a detached `test_vba` run's progress and, once it ends, its synchronous result.

## When to use

- After `test_vba({ ..., apply: true, detach: true })` returned an `operationId`: read where the run is, or wait for it to end.
- After a client timeout, a reconnect or a new session: the run and its result stay on disk under `.dysflow/runtime/test-runs/<operationId>/`.

## Required flags

- `operationId`

## All input properties (live `inputSchema.properties` keys)

    - `projectId`
    - `operationId`
    - `wait`
    - `cwd`


## Optional flags (most common)

- `wait` — seconds to wait for the run to end, re-reading it once a second; capped at 50 so a 60 s client timeout is never reached. Omit it to read once.
- `projectId` / `cwd` — the project that started the run, when it is not the session project.

## Call shape

```json
{
  "tool": "get_test_run",
  "arguments": {
    "operationId": "<operationId from test_vba detach>",
    "wait": 45
  }
}
```

## Result shape (always schemaVersion: "dysflow.result/v1")

```json
{
  "ok": true,
  "schemaVersion": "dysflow.result/v1",
  "isError": false,
  "operationId": "<operationId>",
  "status": "running | passed | failed | cancelled | crashed",
  "progress": { "completed": 3, "planned": 12, "currentTest": "Test_Four", "passed": 3, "failed": 0 },
  "createdAt": "<ISO>",
  "updatedAt": "<ISO>",
  "finishedAt": null,
  "result": "once the run ended: the structuredContent the synchronous test_vba returned"
}
```

A `passed` run's `result` carries `mode`, `passed`, `failed` and `tests[]`. A `failed` run's `result` is the `VBA_TESTS_FAILED` envelope with `error.details` `{ failedCount, failures[], results[] }`. A `crashed` run carries `crash.reason` and `crash.logTail` instead. `cancelled` is reserved and not produced today.

On failure, `env.error.code` is one of the codes below; `error.remediation` and `error.toolName` are also present.

## Common errors

| Code | Description | Fix |
|---|---|---|
| `TEST_RUN_NOT_FOUND` | The project has no run with that id (never started, or pruned). | see `references/error-codes.md` |
| `MCP_INPUT_INVALID` | Input does not satisfy the tool's schema, or `operationId` is not a run id. | see `references/error-codes.md` |


## Cross-reference

- Canonical contract: `../../SKILL.md` section 3 Decision Gates and section 4 Execution Steps.
- Full error taxonomy: `../../references/error-codes.md` (relative to the skill bundle).
- Detached runs: `../../references/test-runs.md` and `test-vba.md`.
- Live schema: `schema({view:"full"})` or `describe_tool({name:'get_test_run'})`.

## TODO before production use

Replace these placeholders with values from your worktree (HR-10, HR-11):

- `operationId`: TODO -- the `operationId` `test_vba` returned with `detach:true`.
- `projectId`: TODO -- your resolved `<project-id>`, when it is not the session project.
- `cwd`: TODO -- worktree root, or omit for the startup worktree.
- Other tool-specific runtime values per `describe_tool({name:'get_test_run'})`.

The live `inputSchema.properties` (read once per session via `describe_tool`) is authoritative. This file is a scaffold, not a frozen contract.
