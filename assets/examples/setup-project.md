# setup_project

Use `setup_project` when `get_capabilities({})` reports
`projectConfig.status: "missing"` and the client cannot run the CLI.

```js
// Plan by default. This does not create .dysflow/project.json.
const plan = await tools.dysflow.setup_project({
  cwd: "C:/worktrees/my-project",
  frontendFile: "Frontend.accdb",
});

// Apply only after reviewing resolvedConfig.
const applied = await tools.dysflow.setup_project({
  cwd: "C:/worktrees/my-project",
  frontendFile: "Frontend.accdb",
  backendPath: "Backend.accdb",
  capabilities: {
    allowWrites: true,
    writeExecutionPolicy: "safe-by-default",
  },
  apply: true,
});
```

The apply path requires both the MCP process write gate and
`capabilities.allowWrites: true` in the candidate config. It validates the
candidate and publishes `.dysflow/project.json` with the same containment,
atomic rename, and rollback service used by `dysflow setup`.

If the candidate frontend does not exist, validation returns `TARGET_NOT_FOUND`
after accepting the identity and write policy. The error keeps both the planned
config path and the resolved candidate so the caller can correct the right input:

```json
{
  "ok": false,
  "error": {
    "code": "TARGET_NOT_FOUND",
    "configPath": "C:/worktrees/my-project/.dysflow/project.json",
    "resolvedConfig": {
      "id": "my-project",
      "frontendFile": "Frontend.accdb"
    }
  }
}
```

After applying, call `resolve_project({ cwd, projectId })` and then refresh
`get_capabilities({ cwd })`. The new config is available immediately through
the shared worktree cache; an MCP restart is neither required nor recommended.
Never bootstrap outside a Git worktree, and never pass
an absolute path as `frontendFile`; it must be the frontend basename at the
worktree root.
