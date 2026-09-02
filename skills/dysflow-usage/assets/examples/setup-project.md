# ``setup_project``

> **Phase**: bootstrap  ·  **Access**: conditional-write  ·  **Status**: preferred (`_meta["dysflow/workflow"].status`)

## What it does

Bootstrap a missing per-worktree project config through MCP when shell access is unavailable.

## When to use

- Bootstrap a missing per-worktree project config through MCP when shell access is unavailable.

## Required flags

- Bootstrap mode requires `frontendFile` and an explicit `projectId` unless a
  selected WorktreeContext already owns one. Recovery mode requires the full
  `projectId` / `projectChoiceReason` / `recoveryToken` trio.
- Pass explicit `apply:false` to preview and `apply:true` to commit.

## All input properties (live ``inputSchema.properties`` keys)

    - ``cwd``
    - ``fromCwd``
    - ``overrideProjectRoot``
    - ``frontendFile``
    - ``backendPath``
    - ``projectId``
    - ``projectChoiceReason``
    - ``recoveryToken``
    - ``destinationRoot``
    - ``capabilities``
    - ``timeoutMs``
    - ``apply``
    - ``diff``
    - ``implements_check``
    - ``confirmedRequiresConfirmation``


## Composition constraint

This tool's schema uses a ``anyOf`` constraint:

- alternative: {frontendFile}
- alternative: {fromCwd, overrideProjectRoot}
- alternative: {projectId, projectChoiceReason, recoveryToken}

Pick exactly one alternative per call.

## Call shape

```json
{
  "tool": "setup_project",
  "arguments": {
    "cwd": "<worktree>",
    "projectId": "<project-id>",
    "frontendFile": "frontend.accdb",
    "apply": false
  }
}
```

## Result shape (always `schemaVersion: "dysflow.result/v1"`)

```json
{
  "ok": true,
  "schemaVersion": "dysflow.result/v1",
  "isError": false,
  "...": "see describe_tool({name:'setup_project'}) for the live result contract"
}
```

On failure, ``env.error.code`` is one of the codes below; ``error.remediation`` and ``error.toolName`` are also present.

## Common errors

| Code | Description | Fix |
|---|---|---|
| ``DESTINATION_ROOT_NOT_FOUND`` | destinationRoot missing or unconfigured. | see ``references/error-codes.md`` |
| ``OUTSIDE_PROJECT_ROOT`` | Operation target outside configured project root. | see ``references/error-codes.md`` |
| ``WRITE_LOCKED_BY_RUNNING_OP`` | A concurrent dysflow operation holds the write lock. | see ``references/error-codes.md`` |
| ``CAPABILITIES_DISALLOW_WRITE`` | Project capabilities.allowWrites is false. | see ``references/error-codes.md`` |
| ``PROJECT_ID_MISMATCH`` | Caller-supplied projectId does not match the configured id. | see ``references/error-codes.md`` |
| ``MCP_WRITES_DISABLED`` | Process-level writes are disabled. | see ``references/error-codes.md`` |
| ``MCP_INPUT_INVALID`` | Input does not satisfy the tool's schema. | see ``references/error-codes.md`` |
| ``FROMCWD_NOT_FOUND`` | The source worktree config is absent. | see ``references/error-codes.md`` |
| ``FROMCWD_CONFIG_INVALID`` | The source worktree config is malformed or unsafe to import. | see ``references/error-codes.md`` |

## Allowlist at create

```json
{
  "tool": "setup_project",
  "arguments": {
    "cwd": "<target-worktree>",
    "projectId": "<project-id>",
    "frontendFile": "frontend.accdb",
    "capabilities": {
      "procedures": { "allow": ["Test_Create", "Test_Update"] }
    },
    "apply": false
  }
}
```

## Cross-WT import

```json
{
  "tool": "setup_project",
  "arguments": {
    "cwd": "<target-worktree>",
    "projectId": "<project-id>",
    "fromCwd": "<source-worktree>",
    "overrideProjectRoot": "<target-worktree>",
    "apply": false
  }
}
```

## Cross-reference

- Canonical contract: ``../../SKILL.md`` section 3 Decision Gates and section 4 Execution Steps.
- Full error taxonomy: ``../../references/error-codes.md`` (relative to the skill bundle).
- Write-flag semantics: ``../write-flags-matrix.md``.
- Anti-patterns: ``../anti-patterns.md``.
- Live schema: ``schema({view:"full"})`` or ``describe_tool({name:'setup_project'})``.

## TODO before production use

Replace these placeholders with values from your worktree (HR-10, HR-11):

- ``projectId``: TODO -- your resolved ``<project-id>`` (or the human-selected entry on ambiguity via ``resolve_project({outcome:"ambiguous"})``).
- ``cwd``: TODO -- worktree root, or omit for the startup worktree.
- ``accessPath`` / ``backendPath``: TODO -- only if resolving a non-default frontend/backend.
- ``apply``: TODO -- ``false`` to plan, ``true`` to commit (default plans in ``safe-by-default``).
- For ``query_execute``: ``mode`` is REQUIRED (``read`` or ``write``, never omitted).
- For confirmation flags: ``implements_check`` + ``confirmedRequiresConfirmation:true`` paired (NEVER legacy ``dryRun:true`` / ``options.confirm:true`` / ``confirmPid:N`` -- HR-9, migration map in ``dysflow-usage`` section 6).
- Other tool-specific runtime values per ``describe_tool({name:'setup_project'})``.

The live ``inputSchema.properties`` (read once per session via ``describe_tool``) is authoritative. This file is a scaffold, not a frozen contract.
## Choosing the right tool

This tool belongs to the preferred bootstrap path. Dysflow never blocks a specialized call solely because a preferred equivalent exists: applicable write-capable specialized calls succeed with an additive `PREFERRED_TOOL_AVAILABLE` warning. Intentional granular calls can pass `forceSpecialized:true`; legacy calls receive `LEGACY_TOOL_AVAILABLE` instead. Read-only specialized calls remain silent.
