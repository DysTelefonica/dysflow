# `form_align_controls`

> **Phase**: forms  ·  **Access**: conditional-write  ·  **Status**: preferred (_meta["dysflow/workflow"].status)

## What it does

Align several controls in one geometry operation.

## When to use

- Align several controls in one geometry operation.

## Required flags

- `sourcePath`
- `controlNames`
- `edge`

## All input properties (live `inputSchema.properties` keys)

    - `projectId`
    - `contextId`
    - `accessPath`
    - `backendPath`
    - `destinationRoot`
    - `projectRoot`
    - `strictContext`
    - `expectedAccessPath`
    - `expectedProjectRoot`
    - `expectedDestinationRoot`
    - `sourcePath`
    - `path`
    - `controlNames`
    - `edge`
    - `apply`
    - `diff`
    - `implements_check`
    - `confirmedRequiresConfirmation`
    - `timeoutMs`
    - `outputMode`
    - `cwd`
    - `projectChoiceReason`
    - `recoveryToken`


## Optional flags (most common)

- `apply`
- `sourcePath`
- `controlNames`
- `edge`

## Call shape

```json
{
  "tool": "form_align_controls",
  "arguments": {
    "sourcePath": "<sourcePath>",
    "controlNames": null,
    "edge": "left",
    "apply": false
  }
}
```

## Result shape (always schemaVersion: "dysflow.result/v1")

```json
{
  "ok": true,
  "schemaVersion": "dysflow.result/v1",
  "isError": false,
  "...": "see describe_tool({name:'form_align_controls'}) for the live result contract"
}
```
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


## Cross-reference

- Canonical contract: `../../SKILL.md` section 3 Decision Gates and section 4 Execution Steps.
- Full error taxonomy: `../../references/error-codes.md` (relative to the skill bundle).
- Write-flag semantics: `../write-flags-matrix.md`.
- Anti-patterns: `../anti-patterns.md`.
- Live schema: `schema({view:"full"})` or `describe_tool({name:'form_align_controls'})`.

## TODO before production use

Replace these placeholders with values from your worktree (HR-10, HR-11):

- `projectId`: TODO -- your resolved `<project-id>` (or the human-selected entry on ambiguity via `resolve_project({outcome:"ambiguous"})`).
- `cwd`: TODO -- worktree root, or omit for the startup worktree.
- `accessPath` / `backendPath`: TODO -- only if resolving a non-default frontend/backend.
- `apply`: TODO -- `false` to plan, `true` to commit (default plans in `safe-by-default`).
- For `query_execute`: `mode` is REQUIRED (`read` or `write`, never omitted).
- For confirmation flags: `implements_check` + `confirmedRequiresConfirmation:true` paired (NEVER legacy `dryRun:true` / `options.confirm:true` / `confirmPid:N` -- HR-9, migration map in `dysflow-usage` section 6).
- Other tool-specific runtime values per `describe_tool({name:'form_align_controls'})`.

The live `inputSchema.properties` (read once per session via `describe_tool`) is authoritative. This file is a scaffold, not a frozen contract.
