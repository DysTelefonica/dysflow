# AI agent onboarding — 5-minute "what can go wrong" guide

> **Who this is for.** You are an AI agent about to drive a Microsoft Access / VBA project through the Dysflow MCP. The README `## Quickstart (AI agent)` section got you wired up; this guide is the second half: the things that go wrong **even after the wiring is correct**, and how to recover without re-reading the source.

Time budget: 5 minutes. Read once; reference forever.

## 1. The contract you should know cold

Every Dysflow call returns an envelope. Read the envelope, not the prose:

```json
{
  "ok": false,
  "error": {
    "code": "WRITE_LOCKED_BY_RUNNING_OP",
    "message": "...",
    "remediation": "..."
  }
}
```

- `ok: true` → trust the payload.
- `ok: false` → the `error.code` is the **single source of truth** for what failed. The `remediation` field is the next action. Do **not** re-derive the cause from the `message` string.
- If `error.code` is missing, the call hung or crashed before returning — treat it as `RUNNER_INVALID_JSON` and proceed to step 4.

## 2. The first 30 seconds after a failure

| Error code prefix | Category | First action |
| --- | --- | --- |
| `MCP_*` (e.g. `MCP_WRITES_DISABLED`, `MCP_ALLOWLIST_NOT_CONFIGURED`, `MCP_PROCEDURE_NOT_ALLOWED`) | Configuration / gate | `dysflow doctor` → read `get_capabilities.writesProcess.enabled` and `.dysflow/project.json.capabilities`. |
| `PROJECT_CONFIG_*` (`PROJECT_CONFIG_NOT_WRITE_READY`, `ACCESS_PATH_NOT_FOUND`, `BACKEND_PATH_NOT_FOUND`, `DESTINATION_ROOT_NOT_FOUND`, `OUTSIDE_PROJECT_ROOT`, `PROJECT_ID_MISMATCH`) | Project unwired | `dysflow resolve_project` → read `diagnostics[]` → re-run `dysflow setup --write-project` if needed. |
| `*_LOCKED_BY_RUNNING_OP` / `OPERATION_ALREADY_RUNNING` / `LACCDB_*` | Runtime contention | `list_access_operations` → `cleanup_access_operation` on the specific `operationId`. For stale markers: `clean_stale_markers` with `confirm: true`. |
| `RUNNER_INVALID_JSON` / `CONFIG_TARGET_NOT_FOUND` / `VBA_MANAGER_TIMEOUT` | PowerShell runner | `dysflow doctor` → verify Access install + runner binary path. |
| `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` / `INVALID_INPUT` (prune + filter) | Export-source guard | Re-target export to a sibling directory or pass `confirmOverwriteSource: true` explicitly. |
| `FORM_SOURCE_MALFORMED` / `VBA_SOURCE_MALFORMED` | Source lint | `lint_module` first; then `vba-form-metadata-repair` for form files. |

The full taxonomy is mirrored in the README `## Common pitfalls cheat-sheet` and lives canonically in `references/error-codes.md` of the `dysflow-usage` skill.

## 3. The three recurring footguns

### 3.1 The "I trusted my `pwd`" footgun — `OUTSIDE_PROJECT_ROOT`, `PROJECT_ID_MISMATCH`, `DESTINATION_ROOT_NOT_FOUND` (#966, #962)

Symptoms: write tools refuse with `OUTSIDE_PROJECT_ROOT` even though the file exists. The agent passed a path that the runtime resolved against `destinationRoot`, and the file is outside that root.

Fix:

1. Run `dysflow resolve_project` and read `projectRoot` and `destinationRoot`.
2. Either move the file under `destinationRoot` or pass an explicit `projectRoot` override (one-off, intentional).
3. Never **bend the path** by changing `.dysflow/project.json` to match a stale `pwd`.

### 3.2 The "stale marker" footgun — `WRITE_LOCKED_BY_RUNNING_OP`, `LACCDB_STALE_DETECTED`, `LIVE_PROCESS_HOLDS_LACCDB` (#967, #976)

Symptoms: after a timeout or hard kill, every Dysflow write returns `WRITE_LOCKED_BY_RUNNING_OP` for minutes.

Fix:

1. `list_access_operations` → look for a record with `status: "starting"` and `accessPid: null`, or `status: "running"` with `updatedAt` older than 30 minutes.
2. Call `cleanup_access_operation` (no `force`) — for `starting` records this is registry-only bookkeeping, never a kill.
3. If `clean_stale_markers` is available, call it with `olderThanMinutes: 30` and `confirm: true` to retire stale `running` markers in bulk.
4. Only if `access_force_cleanup_orphaned` lists an actual headless `MSACCESS.EXE` bound to **your** `accessPath`, pass `confirmPid` — **never** call `Stop-Process -Name MSACCESS`.

### 3.3 The "silent overwrite" footgun — `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` (#779)

Symptoms: in `developer` mode, `export_modules` refuses to write because the destination overlaps the active source root.

Fix:

1. Re-target the export to a sibling directory: `<repo>/export/<session-id>/`.
2. Or, if overwriting is intentional, pass `confirmOverwriteSource: true` explicitly. The runtime always logs when this branch is taken.
3. `prune: true` + `filter: ...` is **always** rejected with `INVALID_INPUT` — a filtered export would make every non-matching file look orphaned. Drop the filter or drop the prune.

## 4. The recovery scripts

### When the runner is silent (`RUNNER_INVALID_JSON`)

```powershell
dysflow doctor                       # surfaces runner path + Access install
$cfg = Get-Content "$env:USERPROFILE\.config\opencode\opencode.json" -Raw | ConvertFrom-Json
$cfg.mcp.dysflow.command             # confirm it points at %LOCALAPPDATA%\dysflow\bin\dysflow.cmd
# If the command points at a worktree path:
dysflow install --agents opencode --no-tui
```

### When the project is half-wired

```powershell
dysflow resolve_project              # reads .dysflow/project.json
# If 'unresolved':
dysflow setup --write-project `
  --project-id   <project-id> `
  --access-path  <frontend.accdb> `
  --backend-path <backend.accdb>
dysflow doctor
```

### When a stale marker is wedged

```powershell
# List first — never blindly delete.
dysflow state                          # operations + markers + counters, all in one call
# Targeted cleanup of one record (no force, registry-only):
dysflow cleanup_access_operation --operation-id <id> --access-path <frontend.accdb>
# Bulk retirement of stale markers (requires confirm: true):
dysflow clean_stale_markers --older-than-minutes 30 --confirm
```

## 5. The "don't do this" list

- **Don't** call `Stop-Process -Name MSACCESS -Force`. It terminates unrelated user sessions. Use `access_force_cleanup_orphaned` with explicit `confirmPid`.
- **Don't** repeat `accessPath` / `backendPath` / `destinationRoot` / `projectRoot` on every call when they already live in `.dysflow/project.json`. Repeated overrides are a footgun — they win over the canonical config and can mask a stale `pwd`.
- **Don't** edit a `.form.txt` and a `.cls` in the same change. The `.cls` is the behavior; the `.form.txt` is the layout. Drift between them is the most common cause of "Access imported my form as a different module name".
- **Don't** commit a `.dysflow/project.json` with `httpToken` inline. Use `DYSFLOW_HTTP_TOKEN` env var.
- **Don't** assume the same `projectId` is wired across worktrees. Each worktree should own its `.dysflow/project.json` (see the dysflow MCP project-config convention in `AGENTS.md`).

## 6. Where to look next

| You need | Read |
| --- | --- |
| Tool names, write-flags, error codes | `dysflow-usage` skill (`references/error-codes.md`) |
| The full hard-rule harness | `dysflow-arnes` skill |
| TDD loop for VBA tests | `access-vba-tdd` skill + sub-skills |
| Sync source ⇄ binary | `vba-binary-drift` → `vba-binary-sync` skills |
| Form changes | `access-form-ui-builder` skill |
| SQL / schema impact | `vba-sql-impact` skill |
| Diagnose "is this project healthy?" | `dysflow.diagnose` tool — one call returns `projectConfig + filesystem + runtime` |
| Snapshot runtime state | `dysflow.state` tool — `{ operations, markers, locks, counters }` |

If you finish this guide and the next call still refuses, the bug is almost always one of:

1. The `projectId` you passed does not match `.dysflow/project.json` (`PROJECT_ID_MISMATCH`).
2. The session is read-only and you forgot (`MCP_WRITES_DISABLED`).
3. A stale `MSACCESS.EXE` from a teammate's session holds the `.accdb` (`LIVE_PROCESS_HOLDS_LACCDB`).

In all three, the `dysflow.diagnose` tool returns the structured verdict — use it before re-reading the source.
