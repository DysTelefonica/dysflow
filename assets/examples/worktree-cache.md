# Worktree cache

Every project-config-consuming tool accepts an optional `cwd`. Omit it to keep
the MCP startup worktree; pass it to target a sibling worktree without a
restart.

```js
const registration = await tools.dysflow.register_worktree({
  cwd: "C:/worktrees/my-project",
});

// registration.cache.status is "miss" on the first scan and "hit" while the
// canonical context remains valid. Telemetry includes hits, misses,
// invalidations, evictions, entries, watchers, maxEntries, and ttlMs.
const resolution = await tools.dysflow.resolve_project({
  cwd: "C:/worktrees/my-project",
});
// resolve_project uses this exact valid cache entry as its implicit target;
// it does not rediscover sibling worktrees under the same parent.
const capabilities = await tools.dysflow.get_capabilities({
  cwd: "C:/worktrees/my-project",
});

const modules = await tools.dysflow.list_vba_modules({
  cwd: "C:/worktrees/my-project",
});
```

The default cache bound is 32 worktrees and the fallback TTL is 300000 ms.
Changes or renames of `.dysflow/project.json` invalidate the matching entry.
Matching selectors such as `projectId`, `accessPath`, `backendPath`,
`destinationRoot`, or `projectRoot` reuse that same canonical context. A
selector that identifies a different target deliberately performs a fresh,
fail-closed resolution rather than borrowing a sibling's cache entry.
Force a scan after an external operation when necessary:

```js
await tools.dysflow.clear_worktree_cache({ cwd: "C:/worktrees/my-project" });
// Omit cwd to clear every process-local entry.
```

After `setup_project({ cwd, ..., apply: true })`, the runtime refreshes the
entry immediately. The next call with the same `cwd` uses the new config with
no MCP restart. Cache selection never bypasses path containment,
`writesProcess.enabled`, `capabilities.allowWrites`, or confirmation gates.
