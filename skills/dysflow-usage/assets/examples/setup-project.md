# `setup_project`

Use `setup_project` to plan and atomically publish `.dysflow/project.json` in a
Git worktree. A fresh bootstrap requires a human-provided `projectId`.

## Fresh bootstrap

Preview first:

```json
{
  "cwd": "C:/work/project",
  "projectId": "project-stable-id",
  "frontendFile": "Frontend.accdb",
  "backendPath": "Backend.accdb",
  "destinationRoot": "src",
  "capabilities": { "allowWrites": true },
  "apply": false
}
```

Review `resolvedConfig`, then repeat the same call with `apply:true`. Omitting
`projectId` in a worktree with no configured id returns
`MCP_INPUT_INVALID: projectId is required`; the runtime never invents an id
from the cwd basename.

## Existing-config reuse

When the selected WorktreeContext already has an id, `projectId` may be
omitted. The plan or apply response includes an explicit warning similar to:

```text
projectId was omitted; reused existing WorktreeContext projectId "project-stable-id".
```

Treat that warning as audit evidence. If it names an unexpected project, stop
and resolve the intended worktree before any apply call.

## Ambiguity recovery

Do not confuse existing-config reuse with ambiguity recovery. When
`resolve_project` returns `outcome:"ambiguous"`, retry with the complete
`projectId` + `projectChoiceReason` + `recoveryToken` trio. Never guess a
project id and never replay a consumed one-shot token.
