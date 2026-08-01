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

After applying, call `resolve_project({ cwd, projectId })` and then refresh
`get_capabilities({})`. Never bootstrap outside a Git worktree, and never pass
an absolute path as `frontendFile`; it must be the frontend basename at the
worktree root.
