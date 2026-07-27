# migrate legacy `.dysflow/project.json` — `accessPath` → `frontendFile`

## Problem

`dysflow` resolves the active frontend by reading `.dysflow/project.json`
from the worktree that owns the config. Issue #1092 (shipped in v2.23.1)
changed the canonical key from an absolute `accessPath` to a basename-only
`frontendFile`, and the runtime now joins `frontendFile` against the
worktree root that physically owns the config. Projects that still carry
the legacy absolute path trip `FRONTEND_PATH_NOT_BASENAME` (or a
`path-mismatch` diagnostic when the path resolves outside the active
worktree) and the agent has to infer the migration from the diagnostic
string — fine for a focused debug session, brittle for batch migrations.

This example captures the deterministic one-line migration the runtime
expects, and points at the tool that will do it for you once #1177 lands.

## Migration recipe

```diff
- "accessPath": "../../Users/.../frontend.accdb",
+ "frontendFile": "frontend.accdb",
```

That is the entire migration:

- `frontendFile` is a **basename** (no directory separators).
- The runtime joins it to the worktree root that owns `.dysflow/project.json`.
- The same config therefore works across every worktree without edits —
  no more absolute paths to keep in sync.
- A per-call override (`accessDbPath`) still wins when a genuinely
  different frontend is needed (for example, inspecting a binary that
  lives outside the worktree). Never bake a sibling path into the
  config to achieve that — keep the config portable and pass the
  override at call time.

## When to migrate

Migrate when the active project triggers any of:

- `FRONTEND_PATH_NOT_BASENAME` — the legacy `accessPath` carried an
  absolute or separator-containing value.
- `path-mismatch` / `projectRoot` drift in `get_capabilities.projectConfig.diagnostics[]`
  — the absolute path resolves outside the current worktree.
- `frontendFile` is missing AND a sibling `.accdb` exists in the worktree
  root — the runtime auto-selected a candidate and the config still
  records the old key.

## When *not* to migrate

- The project is intentionally pinned to a binary that lives outside the
  worktree (rare). Keep the legacy `accessPath` and pass `accessDbPath`
  on every call instead — but expect `FRONTEND_PATH_NOT_BASENAME` to
  keep firing until the config is updated.
- The worktree is a non-git scratch directory. Without a worktree root,
  the join is undefined; switch to a real worktree or pass an explicit
  `accessPath` per call.

## Driving the migration with `migrate_project_config` (#1177)

Once the MCP exposes it (issue #1177), prefer the tool over hand-editing:

```json
{
  "projectId": "00-gestion-riesgos-staging",
  "from": "accessPath",
  "to": "frontendFile"
}
```

The tool rewrites the config in place, validates that the basename-only
`frontendFile` resolves to the same binary the legacy `accessPath`
pointed at, and emits `PROJECT_CONFIG_MIGRATED` on success. Use this
for batch migrations across every worktree of a project so the audit
trail is consistent.

For the structured-diagnostic path that surfaces the same recipe from
the runtime side, see #1176.

## Verification

After the migration (hand-edited or tool-driven):

```json
{ "tool": "get_capabilities", "args": {} }
```

`projectConfig.frontendFile` must be a basename, `projectConfig.accessPath`
must equal `projectRoot + frontendFile` for the active worktree, and
`projectConfig.diagnostics[]` must be empty. A non-empty diagnostics list
means the basename does not resolve — double-check the spelling against
the binary in the worktree root.

## References

- Contract introduced in #1092.
- Shipped in release v2.23.1.
- Tool: `migrate_project_config` (#1177).
- Diagnostic path: structured remediation (#1176).