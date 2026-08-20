# `query_execute`

> **Phase**: sql  Â·  **Access**: read-write  Â·  **Status**: preferred (_meta["dysflow/workflow"].status)

## What it does

Execute the preferred unified read or write SQL contract.

## When to use

- Execute the preferred unified read or write SQL contract.

## Required flags

- `sql`
- `mode`

## All input properties (live `inputSchema.properties` keys)

    - `projectId`
    - `contextId`
    - `accessPath`
    - `backendPath`
    - `destinationRoot`
    - `projectRoot`
    - `sql`
    - `databasePath`
    - `sourcePath`
    - `target`
    - `timeoutMs`
    - `mode`
    - `apply`
    - `diff`
    - `implements_check`
    - `confirmedRequiresConfirmation`
    - `strictContext`
    - `expectedAccessPath`
    - `expectedProjectRoot`
    - `expectedDestinationRoot`
    - `allowTables`
    - `denyTables`
    - `cwd`
    - `projectChoiceReason`
    - `recoveryToken`


## Optional flags (most common)

- `apply`
- `mode`
- `sql`

## Call shape (HR-2: `apply:false` then review then `apply:true`)

`json
{
  "name": "query_execute",
  "arguments": {
    /* TODO: populate per live describe_tool({name:"query_execute"}) output. */
    /* Per HR-9: pass `apply:true|false` EXPLICITLY on every write-class call. */
    /* Per HR-3: `query_execute` requires `mode:"read"|"write"` -- `apply` alone never picks a path. */
    "apply": false
  }
}
`

## Result shape (always schemaVersion: "dysflow.result/v1")

`json
{
  "ok": true,
  "schemaVersion": "dysflow.result/v1",
  "isError": false,
  "...": "see describe_tool({name:"query_execute"}) for the live result contract"
}
`

On failure, `env.error.code` is one of the codes below; `error.remediation` and `error.toolName` are also present.

## Common errors

| Code | Description | Fix |
|---|---|---|
| `DESTINATION_ROOT_NOT_FOUND` | destinationRoot missing or unconfigured. | see `references/error-codes.md` |
| `OUTSIDE_PROJECT_ROOT` | Operation target outside configured project root. | see `references/error-codes.md` |
| `WRITE_LOCKED_BY_RUNNING_OP` | A concurrent dysflow operation holds the write lock. | see `references/error-codes.md` |
| `CAPABILITIES_DISALLOW_WRITE` | Project capabilities.allowWrites is false. | see `references/error-codes.md` |
| `PROJECT_ID_MISMATCH` | Caller-supplied projectId does not match the configured id. | see `references/error-codes.md` |
| `MCP_WRITES_DISABLED` | Process-level writes are disabled. | see `references/error-codes.md` |
| `MCP_INPUT_INVALID` | Input does not satisfy the tool's schema. | see `references/error-codes.md` |
| `INVALID_READ_ONLY_QUERY` | mode:"read" rejected SQL that can mutate. | see `references/error-codes.md` |


## Cross-reference

- Canonical contract: `../../../SKILL.md` section 3 Decision Gates and section 4 Execution Steps.
- Full error taxonomy: `../../references/error-codes.md` (relative to the skill bundle).
- Write-flag semantics: `../../write-flags-matrix.md`.
- Anti-patterns: `../../anti-patterns.md`.
- Live schema: `schema({view:"full"})` or `describe_tool({name:"query_execute"})`.

## TODO before production use

Replace these placeholders with values from your worktree (HR-10, HR-11):

- `projectId`: TODO -- your resolved `00-vba-toolkit-bench-develop` (or the human-selected entry on ambiguity via `resolve_project({outcome:"ambiguous"})`).
- `cwd`: TODO -- worktree root, or omit for the startup worktree.
- `accessPath` / `backendPath`: TODO -- only if resolving a non-default frontend/backend.
- `apply`: TODO -- `false` to plan, `true` to commit (default plans in `safe-by-default`).
- For `query_execute`: `mode` is REQUIRED (`read` or `write`, never omitted).
- For confirmation flags: `implements_check` + `confirmedRequiresConfirmation:true` paired (NEVER legacy `dryRun:true` / `options.confirm:true` / `confirmPid:N` -- HR-9, migration map in `dysflow-usage` section 6).
- Other tool-specific runtime values per `describe_tool({name:"query_execute"})`.

The live `inputSchema.properties` (read once per session via `describe_tool`) is authoritative. This file is a scaffold, not a frozen contract.
