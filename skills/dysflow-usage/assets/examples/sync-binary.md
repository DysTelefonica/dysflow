# `sync_binary`

> **Phase**: sync  ·  **Access**: conditional-write  ·  **Status**: preferred (_meta["dysflow/workflow"].status)

## What it does

Run the preferred source-to-binary or binary-to-source verify, plan, apply, and re-verify workflow.

## When to use

- Run the preferred source-to-binary or binary-to-source verify, plan, apply, and re-verify workflow.

## Required flags

- `direction`

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
    - `moduleNames`
    - `directoryPath`
    - `recursive`
    - `includeTests`
    - `includeForms`
    - `strict`
    - `direction`
    - `acceptBothChanged`
    - `scope`
    - `apply`
    - `diff`
    - `implements_check`
    - `confirmedRequiresConfirmation`
    - `batchSize`
    - `onChunkError`
    - `parallelChunks`
    - `returnFullDiff`
    - `transactional`
    - `dryRunWithPreflight`
    - `timeoutMs`
    - `cwd`
    - `projectChoiceReason`
    - `recoveryToken`


## Optional flags (most common)

- `direction`
- `apply`
- `moduleNames`
- `destinationRoot`

## Pre-flight checks

destinationRoot must exist before `apply:true`. If `git rm -r src/` removed the
directory itself, recreate it before the call; Dysflow fails closed rather than
silently choosing another destination.

## Call shape

```json
{
  "tool": "sync_binary",
  "arguments": {
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
  "...": "see describe_tool({name:'sync_binary'}) for the live result contract"
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
- Live schema: `schema({view:"full"})` or `describe_tool({name:'sync_binary'})`.

## TODO before production use

Replace these placeholders with values from your worktree (HR-10, HR-11):

- `projectId`: TODO -- your resolved `<project-id>` (or the human-selected entry on ambiguity via `resolve_project({outcome:"ambiguous"})`).
- `cwd`: TODO -- worktree root, or omit for the startup worktree.
- `accessPath` / `backendPath`: TODO -- only if resolving a non-default frontend/backend.
- `apply`: TODO -- `false` to plan, `true` to commit (default plans in `safe-by-default`).
- For `query_execute`: `mode` is REQUIRED (`read` or `write`, never omitted).
- For confirmation flags: `implements_check` + `confirmedRequiresConfirmation:true` paired (NEVER legacy `dryRun:true` / `options.confirm:true` / `confirmPid:N` -- HR-9, migration map in `dysflow-usage` section 6).
- Other tool-specific runtime values per `describe_tool({name:'sync_binary'})`.

The live `inputSchema.properties` (read once per session via `describe_tool`) is authoritative. This file is a scaffold, not a frozen contract.
## Choosing the right tool

This is a preferred workflow tool. When a write-capable `specialized` tool covers the same runtime phases, Dysflow keeps that call successful and appends an informational `PREFERRED_TOOL_AVAILABLE` item to `warnings[]` pointing here. Intentional granular calls can pass `forceSpecialized:true`; the dispatcher consumes that flag and suppresses only this guidance. Legacy calls instead receive the escalated `LEGACY_TOOL_AVAILABLE` warning. Warning counts are observable through `logs({options:{groupBy:"tool"}}).aggregate.warnings.byCode`.
