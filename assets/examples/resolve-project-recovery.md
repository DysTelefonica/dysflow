# Recover from ambiguous project resolution

Use this flow only after `resolve_project` reports `outcome: "ambiguous"`.
Dysflow never guesses which project the human intended.

1. Request a typed recovery envelope.

<!-- dysflow-example tool="resolve_project" -->
```json
{}
```

The response includes `availableProjects`, an opaque `recoveryToken`, and a
`recoveryInstruction`.

2. Ask the human to select one exact `availableProjects` entry. Never choose
   for them.

3. Commit that exact choice in process memory. This consumes the one-shot token
   and does not write files or open Access.

<!-- dysflow-example tool="resolve_project" -->
```json
{
  "projectId": "feature-b",
  "projectChoiceReason": "user_selected_after_ambiguous_project",
  "recoveryToken": "<opaque-process-local-token>"
}
```

A valid response has `outcome: "resolved"` and the selected `projectId`.

The same recovery trio may instead be sent to `setup_project`. In that mode,
`setup_project` only resolves and caches an existing project; it returns
`mode: "resolution"` and NEVER creates or overwrites
`.dysflow/project.json`. Bootstrap mode is separate and requires
`frontendFile`.

<!-- dysflow-example tool="setup_project" -->
```json
{
  "projectId": "feature-b",
  "projectChoiceReason": "user_selected_after_ambiguous_project",
  "recoveryToken": "<opaque-process-local-token>"
}
```

4. Later write-class calls can omit the trio while the cached choice is valid.

<!-- dysflow-example tool="import_modules" -->
```json
{
  "moduleNames": ["CustomerService"],
  "apply": false
}
```

5. Clear the choice explicitly when changing task or worktree intent.

<!-- dysflow-example tool="resolve_project" -->
```json
{
  "clearResolution": true
}
```

The token and cached choice expire after 10 minutes by default. Operators may set
`DYSFLOW_RESOLUTION_CACHE_TTL_MS` to an integer from `1000` through
`3600000` milliseconds, inclusive. Missing, non-integer, non-finite, or
out-of-range values fall back to `600000`.

Tokens and cached choices are scoped to one MCP process and are invalidated when
the selected config or Git worktree registry changes. Invalid, expired, replayed,
partial, or mismatched recovery inputs fail closed with `MCP_INPUT_INVALID`.
Duplicate selected ids preserve `PROJECT_ID_COLLISION`. Multiple frontend files
inside one project remain unresolved until `frontendFile` is configured; a
project-id choice cannot safely choose a file.
