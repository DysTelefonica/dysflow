# `generate_form_design_plan`

> **Phase**: forms  Â·  **Access**: read-only  Â·  **Status**: preferred (_meta["dysflow/workflow"].status)

## What it does

Generate a guarded form design plan from analyzed behavior.

## When to use

- Generate a guarded form design plan from analyzed behavior.

## Required flags

- `behaviorMap`
- `plan`

## All input properties (live `inputSchema.properties` keys)

    - `projectId`
    - `contextId`
    - `behaviorMap`
    - `plan`
    - `outputMode`
    - `cwd`

## Call shape (HR-2: `apply:false` then review then `apply:true`)

`json
{
  "name": "generate_form_design_plan",
  "arguments": {
    /* TODO: populate per live describe_tool({name:"generate_form_design_plan"}) output. */
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
  "...": "see describe_tool({name:"generate_form_design_plan"}) for the live result contract"
}
`

On failure, `env.error.code` is one of the codes below; `error.remediation` and `error.toolName` are also present.

## Common errors

| Code | Description | Fix |
|---|---|---|
| `MCP_INPUT_INVALID` | Input does not satisfy the tool's schema. | see `references/error-codes.md` |


## Cross-reference

- Canonical contract: `../../../SKILL.md` section 3 Decision Gates and section 4 Execution Steps.
- Full error taxonomy: `../../references/error-codes.md` (relative to the skill bundle).
- Write-flag semantics: `../../write-flags-matrix.md`.
- Anti-patterns: `../../anti-patterns.md`.
- Live schema: `schema({view:"full"})` or `describe_tool({name:"generate_form_design_plan"})`.

## TODO before production use

Replace these placeholders with values from your worktree (HR-10, HR-11):

- `projectId`: TODO -- your resolved `00-vba-toolkit-bench-develop` (or the human-selected entry on ambiguity via `resolve_project({outcome:"ambiguous"})`).
- `cwd`: TODO -- worktree root, or omit for the startup worktree.
- `accessPath` / `backendPath`: TODO -- only if resolving a non-default frontend/backend.
- `apply`: TODO -- `false` to plan, `true` to commit (default plans in `safe-by-default`).
- For `query_execute`: `mode` is REQUIRED (`read` or `write`, never omitted).
- For confirmation flags: `implements_check` + `confirmedRequiresConfirmation:true` paired (NEVER legacy `dryRun:true` / `options.confirm:true` / `confirmPid:N` -- HR-9, migration map in `dysflow-usage` section 6).
- Other tool-specific runtime values per `describe_tool({name:"generate_form_design_plan"})`.

The live `inputSchema.properties` (read once per session via `describe_tool`) is authoritative. This file is a scaffold, not a frozen contract.
