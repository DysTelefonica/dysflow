# Worktrees and destinations

Per-call targets across worktrees, `destinationRoot` redirection and legacy config migration. The project-context order is in `context-resolution.md`.

## Multi-worktree operation — explicit target per call

Git creates worktrees; Dysflow resolves targets safely. The current Git worktree is always the
implicit/default context. Its `.dysflow/project.json` stores `frontendFile` as a filename only
(or accepts a basename-only legacy `accessPath`), derives `projectRoot` from the config's physical
owner, and keeps `destinationRoot` relative/local. An absolute or shared `backendPath` remains
unchanged and is never rebased with the frontend.

To operate on another worktree, select it explicitly in that individual call with a unique
`projectId`, absolute `accessPath`, `backendPath`, or supported `cwd`. Successful explicit
resolution returns target provenance such as `explicit-project-id` or `explicit-access-path`;
that provenance is for the call only and MUST NOT be written into the current worktree's config.
Duplicate sibling ids fail with `PROJECT_ID_COLLISION` rather than first-match behavior.

When no frontend filename is configured, only one root `.accdb` may be auto-selected. Zero
candidates returns `FRONTEND_TARGET_MISSING`; multiple candidates return
`FRONTEND_TARGET_AMBIGUOUS`. Absolute or separator-containing legacy `accessPath` values return
`FRONTEND_PATH_NOT_BASENAME`; inherited sibling paths without an explicit target cannot authorize
writes and may return `INHERITED_WORKTREE_MISMATCH`.

Use `resolve_project({cwd:"<absolute-worktree>", projectId:"<id>"})` to inspect a sibling and
require `outcome:"resolved"`. If the outcome is `ambiguous`, ask the human to choose one
`availableProjects` entry and retry with that exact `projectId`,
`projectChoiceReason:"user_selected_after_ambiguous_project"`, and the opaque
`recoveryToken`. The dispatch seam consumes the complete trio before any fresh
collision check and routes through the cached chosen project root. This applies
equally to `setup_project`, `resolve_project`, `migrate_project_config`,
`test_vba`, and `access_force_cleanup_orphaned`. The token is one-shot and
process-local; a consumed or absent token fails closed, and the cached choice
expires or invalidates when config/worktree evidence changes. Clear it with
`resolve_project({clearResolution:true})`. Confirm each target parameter with
`describe_tool({name:"<tool>"})`. Never restart MCP or edit one worktree's config to
point at another. See `assets/examples/resolve-project.md` and
`assets/examples/resolve-project-recovery.md`.

For one-tool introspection, call `describe_tool({name:"<tool>"})` before inventing a
parameter. The canonical parameter is `name`; `toolName` is only an alias.

### Redirecting where a write lands — `destinationRoot` (#1169, #1226)

Every write-class tool accepts a `destinationRoot` override, and the project
root follows it, so the path-containment guards accept the override as the
authoritative root instead of rejecting a `sourcePath` that sits inside it.
Use it to write into a scratch tree without touching the configured source
root. Precedence is `projectRoot` (explicit) → `destinationRoot` (this
override) → the configured value → `cwd`; omitting the override leaves the
configured contract exactly as before.

**Issue #1226 (`export_modules` / `export_all`) — pre-resolve destinationRoot
gate.** The two export tools require an EXPLICIT declaration of where bytes
land before the dispatch seam engages the runner. Pass ONE of:

- `destinationRoot: "<path>"` — explicit override (preferred).
- `exportPath: "<path>"` — legacy alias. Forwarded to `destinationRoot` by
  the adapter; both reach the post-resolve export-source guard (#785).
- `allowConfiguredDestinationRoot: true` — opt-in to the configured value
  in `.dysflow/project.json` when the caller wants the historical
  silent-config-fallback behavior. Default is `false`.

If the call passes NONE of these three, the dispatch seam short-circuits
with the typed error code `DESTINATION_ROOT_REQUIRED` (`error.missingFields`
enumerates what to set; `error.toolName` names the offending tool). The
post-resolve #785 guard then fires normally once the destination IS
declared — after explicit approval, use `implements_check:"export_overwrites_source_precheck"` with `confirmedRequiresConfirmation:true` to bypass an overlap refusal.

**Export readiness (v4.4.12, #1814).** `export_all` and `export_modules`
refresh destination filesystem diagnostics before their write gate for all three
explicit destination forms above. Creating or removing the effective directory
is visible on the next export; no MCP restart or configuration rewrite is needed.

On `DESTINATION_ROOT_NOT_FOUND`, repair the exact directory named by the error,
fetch `get_capabilities({view:"full"})` to inspect `projectConfig.status` and
`projectConfig.writeReady`, then retry the same target. Process write gates alone
are insufficient. Use `setup_project` for missing/invalid configuration, not as
an authorship reset for a valid config. Other cached snapshots are not covered.

Evidence: `src/adapters/config/worktree-context-cache.ts` and
`test/adapters/mcp/issue-1814-destination-root-coherence.test.ts`.

`destinationRoot` chooses **where bytes land**, not which database is opened —
that is still `projectId` / `accessPath` / `backendPath`. Confirm the
parameter is accepted with `describe_tool({name:"<tool>"})` before relying on
it for a given tool.

### Migrating a legacy project config — `migrate_project_config`

The default call is a read-only diff preview of what the migration would
rewrite. Committing it is write-gated like any other write-class tool, and it
rewrites `.dysflow/project.json` atomically. Reach for it instead of
hand-editing a config that predates the current contract; see
`assets/examples/migrate-project-config.md`.
