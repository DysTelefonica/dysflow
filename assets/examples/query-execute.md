# query_execute — Required `mode` Parameter

## Problem

`query_execute` is the canonical read/write SQL tool. Its input schema
(`QUERY_EXECUTE_SCHEMA` in `src/adapters/mcp/schemas/dysflow-schemas.ts`)
declares `mode: "read" | "write"` as a **required** field. When a caller
omits `mode` — typically because the legacy `apply: true` flag looked
sufficient — the validator rejects the request, but the error envelope
used to be opaque and an AI consumer running inside OpenCode Code Mode
saw it as `Error { str: "[object Object]" }`, losing the
`rejectedFlag` / `remediation` fields needed to self-correct.

Issue #1164 makes the rejection structured so any consumer can recover
in one round-trip.

## Always pass `mode` explicitly

Pick the mode that matches the SQL semantics:

| SQL kind | `mode` | `apply` | Behavior |
| --- | --- | --- | --- |
| `SELECT` | `"read"` | n/a (read-only, no `apply` honored) | Read-only, no write gate |
| `INSERT` / `UPDATE` / `DELETE` / DDL | `"write"` | `true` (commit) | Performs the write, gated by `allowWrites` |
| `INSERT` / `UPDATE` / `DELETE` / DDL | `"write"` | `false` or omitted | Plans; never touches the binary |

`dryRun: true` is the legacy alias for `apply: false` and is accepted
on the same path; prefer `apply: true` / `apply: false` for new code.

## Read example

```json
{
  "projectId": "00-gestion-riesgos-staging",
  "sql": "SELECT TOP 10 * FROM TbConfiguracionBackends",
  "mode": "read"
}
```

The response carries the read-only rows envelope (no `affectedRows`).

## Write example (commit)

```json
{
  "projectId": "00-gestion-riesgos-staging",
  "sql": "UPDATE TbConfiguracionBackends SET BackendSandbox = 'C:/sandbox.accdb' WHERE IDAplicacion = 1",
  "mode": "write",
  "apply": true
}
```

The response carries `{ "affectedRows": 1, "dryRun": false }`. When
writes are disabled at the server, the response is `MCP_WRITES_DISABLED`
instead of a mutation.

## Write example (plan-only)

```json
{
  "projectId": "00-gestion-riesgos-staging",
  "sql": "UPDATE TbConfiguracionBackends SET BackendSandbox = 'C:/sandbox.accdb' WHERE IDAplicacion = 1",
  "mode": "write",
  "dryRun": true
}
```

The response carries `{ "dryRun": true, "plan": { ... } }` and never
touches the binary.

## Missing-`mode` envelope (issue #1164)

```json
{
  "sql": "UPDATE TbConfiguracionBackends SET BackendSandbox = 'C:/sandbox.accdb' WHERE IDAplicacion = 1",
  "apply": true
}
```

returns:

```json
{
  "content": [
    {
      "type": "text",
      "text": "MCP_INPUT_INVALID: Required parameter 'mode' is missing."
    }
  ],
  "isError": true,
  "ok": false,
  "error": {
    "code": "MCP_INPUT_INVALID",
    "errorCode": "MCP_INPUT_INVALID",
    "message": "Required parameter 'mode' is missing.",
    "errorMessage": "Required parameter 'mode' is missing.",
    "rejectedFlag": "mode",
    "remediation": "Pass mode: 'read' for SELECT or mode: 'write' for INSERT/UPDATE/DELETE/DDL.",
    "toolCommitFlag": "apply",
    "diagnostics": [
      {
        "code": "MCP_INPUT_INVALID",
        "severity": "error",
        "message": "Required parameter 'mode' is missing.",
        "remediation": "Pass mode: 'read' for SELECT or mode: 'write' for INSERT/UPDATE/DELETE/DDL."
      }
    ]
  }
}
```

The structured `error.rejectedFlag: "mode"` lets a consumer branch
without regex-parsing the text body, and `error.remediation` names the
literal fix.

## External read-only target

Use `allowExternalAccessPath:true` only with `mode:"read"` and an absolute
`.accdb` or `.mdb` `accessPath`. Write mode rejects this opt-in before query
execution; it never authorizes mutation outside the managed project.

## Anti-patterns

- Omitting `mode` and relying on `apply: true` to pick a write path —
  `apply` only commits; it never selects the read/write mode.
- Passing `mode: "read"` together with `INSERT` / `UPDATE` / `DELETE` —
  the request fails with `INVALID_READ_ONLY_QUERY` from the query
  service. Switch `mode` to `"write"` (or use a dedicated
  `query_sql` / `exec_sql` alias).
- Forgetting `apply: true` on a `mode: "write"` commit — the request
  silently plans (dry-run is the default in `safe-by-default` policy).
  See `dysflow-usage` § "Write-execution-policy" for the truth table.
