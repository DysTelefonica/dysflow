# Dysflow MCP E2E validation

Canonical real-world validation for `dysflow mcp`. Exercises the live stdio MCP server against a
real Microsoft Access frontend/backend pair. The acceptance criterion for changes is **not** unit
tests alone: `dysflow mcp` must work end-to-end against Access before a release ships.

## Testing strategy — when to run what

E2E is **expensive**: it spawns real `MSACCESS.EXE` processes, holds Access locks for several
minutes, and gates on `STOP-ON-FAIL` (one bad tool aborts the battery). Run cheap tests first;
pay the E2E cost only when you need it.

| Stage | What runs | Cost | When |
|---|---|---|---|
| Every change | `pnpm test` (Vitest unit) | seconds | always, on every edit |
| Per feature/bug | `pnpm test:integration -t <pattern>` (Vitest integration) | seconds–minute | every PR / branch |
| Per feature/bug | manual JSON-RPC smoke for the touched tool | seconds | when integration tests don't cover the change end-to-end |
| Pre-release | **full E2E battery** (`node E2E_testing/mcp-e2e.mjs`) | 5–15 minutes | **only** when cutting a release |

Targeted hotfix scripts:

- `node E2E_testing/mcp-e2e-import-grow-in-place.mjs` — F16 regression: imports a small module,
  then imports a larger source over the same component and fails if `IMPORT_TRUNCATED` resurfaces.
  Skips safely when the `NoConformidades.accdb` fixture is not present.

The full battery is the release gate. During feature or bug work, only exercise the parts of the
E2E that touch your change — do not pay the cost of the whole thing on every iteration.

### Maintenance rule

Whenever you **add a feature** or **fix a bug** that affects any MCP tool, update the E2E harness
in the same PR:

- New tool → add a `record(...)` call under the right `area`.
- New area of behavior → add at least one positive `record` plus one `expected: "error"` case if
  the failure path is user-visible.
- New advertised tool → update the hardcoded count in `mcp-e2e.mjs` (`advertised.length === N`)
  **and** `test/adapters/mcp/advertised-tool-count.test.ts`. The two are pinned together — keep
  them in sync or the protocol preflight flips red.
- Bug fix → add a regression record that exercises the previously-broken path.

If you skip this, the harness silently goes stale and the release gate stops catching real
regressions.

## What this E2E covers

The canonical harness `mcp-e2e.mjs` exercises every user-visible MCP tool against the
`NoConformidades` Access fixture (copied to a sandbox under `%TEMP%\dysflow-mcp-e2e-*` before
writes). Areas currently covered:

- **protocol** — `tools/list`, `advertised-tool-count`, `:zombie-check` per tool
- **diagnostics** — `dysflow_doctor`
- **query** — read-side tools (`query_sql`, `list_tables`, `get_schema`, `count_rows`, etc.)
- **security** — read-only guard against DROP/DELETE
- **vba** — `dysflow_vba_execute` allowlist enforcement
- **operations** — `dysflow_access_operations_list` / `cleanup` / `force_cleanup_orphaned`
- **capabilities** — `dysflow_get_capabilities` snapshot + toolsVisible-vs-advertised cross-check
- **maintenance** — `compact_repair` (dry-run + apply)
- **links** — `link_tables`, `relink_tables`, `localize_backend_links`, `unlink_table`, `relink_directory`
- **write** — `create_table`, `exec_sql`, `run_script`, `seed_fixture`, `teardown_fixture`, `drop_table`
- **vba-sync** — `export_modules`, `export_all` (incl. prune-report), `import_modules`, `import_all`,
  `compile_vba`

Baseline (v1.14.0): 91 passed / 0 failed. Anything below that is a regression or a harness/contract
drift — investigate before merging.

## How E2E tests should be written

Every assertion goes through `record(area, tool, args, options)` — never call `callMcp` directly.
The helper enforces three invariants that make the suite safe to run unattended:

1. **Preflight zombie check** before the tool starts: refuses to start if a previous tool left a
   suite-owned `MSACCESS.EXE` alive (REFUSE-START).
2. **Suite-owned PID tracking**: every tool's child PID is added to the watchlist so the post-tool
   zombie check knows what to look for.
3. **Post-tool `:zombie-check` row**: automatically appended after every record. Verifies the
   child process exited cleanly within 1 second.

If you bypass `record()`, you lose all three. Don't.

```javascript
// Correct — uses the suite helper, gets preflight + zombie check for free.
await record("capabilities", "dysflow_get_capabilities", { projectId });

// Wrong — bypasses the helper. You get raw output but lose all safety invariants.
const raw = await callMcp("tools/call", { name: "dysflow_get_capabilities", arguments: { projectId } });
```

### Adding coverage for a new tool

```javascript
// Happy path
await record("<area>", "dysflow_new_tool", { projectId, ...args });

// Failure path (when the failure is a documented user-facing error)
await record("<area>", "dysflow_new_tool", { projectId, ...badArgs }, { expected: "error" });
```

Pick the right `area`. Existing areas: `protocol`, `diagnostics`, `query`, `security`, `vba`,
`operations`, `capabilities`, `maintenance`, `links`, `write`, `vba-sync`. If none fits, add a new
one — but check first that it isn't a duplicate of an existing tag.

### Cross-check rows

Cross-tool assertions (e.g. `snapshot.toolsVisible === advertised.length`) live as **separate
rows** keyed with a `<tool>:<cross-check-name>` suffix, not by mutating the primary record. That
keeps each assertion independent in the report and scannable for reviewers.

## How to run

### Prerequisites (Windows)

- **Node 20+**, **pnpm 10+** (matches `packageManager` in `package.json`).
- **Microsoft Access** installed (the dev machine — not GitHub-hosted CI runners).
- **`ACCESS_VBA_PASSWORD`** set in the user environment, matching the password of the
  `NoConformidades.accdb` fixture.
- **Never build/install to the production runtime at `%LOCALAPPDATA%\dysflow`** during
  development. The test harness refuses to spawn the production install by default
  (`MCP_E2E_REFUSES_PRODUCTION_RUNTIME` — see `resolve-mcp-e2e-command.mjs`).

### Pre-release — full battery

```powershell
# From the repo root.
$env:ACCESS_VBA_PASSWORD = "<fixture password>"

# 1. Pull latest and build.
git pull --ff-only origin main
pnpm build

# 2. Stage the build into the throwaway test-runtime. The launcher reads
#    test-runtime/bin/dist (NOT test-runtime/app/dist — that path is stale in the
#    memory of past Engram entries; the .cmd wrapper does %SCRIPT_DIR%dist\cli\index.js).
Remove-Item .\test-runtime\bin\dist -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item .\dist .\test-runtime\bin\dist -Recurse -Force

# 3. Run the harness. Auto-uses test-runtime/bin/dysflow.cmd.
node E2E_testing/mcp-e2e.mjs
```

Report lands at `%TEMP%\dysflow-mcp-e2e-*\mcp-e2e-report.md`. The battery's `STOP-ON-FAIL`
behavior means **one failure aborts the rest** — fix the root cause, don't patch around it.
On success the sandbox is auto-removed; on failure it is preserved (path printed at the end).
Set `DYSFLOW_E2E_PRESERVE_SANDBOX=1` to keep it on success too.

### Feature/bug work — targeted subset

```powershell
# Cheapest layer: unit tests, filterable.
pnpm test -- -t "<pattern>"

# Mid layer: integration tests against a fixture (vitest with the integration config).
pnpm test:integration -- -t "<pattern>"

# Top layer: a single MCP tool, manually, when the unit/integration layers can't cover it.
$env:DYSFLOW_E2E_COMMAND = "C:\Proyectos\dysflow\test-runtime\bin\dysflow.cmd"
$env:DYSFLOW_HOME        = "C:\Proyectos\dysflow\test-runtime"
node E2E_testing\mcp-e2e.mjs   # then read the report — or hand-craft a JSON-RPC script
```

**Do not run the full E2E during feature work** unless you have a specific reason. The cost is
5–15 minutes and it competes for Access locks with anything else on the dev box.

## Gotchas

- **The launcher reads `test-runtime/bin/dist/`, not `app/dist/`.** Earlier session memory says
  `app/dist/`; that is stale. The `dysflow.cmd` wrapper expands `%SCRIPT_DIR%` to the directory
  of the script (`bin/`), so it runs `bin\dist\cli\index.js`. If you sync the build to the wrong
  path, the harness will spawn an old binary and E2E will fail with "Tool not found" for tools
  added since the last sync — the unit test will pass (it loads `src/` directly) but E2E will
  catch the divergence.
- **Advertised tool count is hardcoded twice.** `mcp-e2e.mjs` and
  `test/adapters/mcp/advertised-tool-count.test.ts` must agree. When you add a visible tool,
  bump both, in the same PR, or the protocol preflight flips red.
- **STOP-ON-FAIL aborts on the first failing tool.** That is intentional — a leftover zombie
  means the suite's own PID tracking is corrupted, so continuing would orphan more processes.
  The fix is the tool that orphaned the child, not a workaround in the harness.
- **`record()` is mandatory**, not optional. Direct `callMcp()` bypasses preflight, PID
  tracking, and the `:zombie-check` row. A user-facing IA agent calling tools in production
  goes through the same wiring the harness tests — keep the suite close to that reality.
- **Never kill `MSACCESS.EXE` by process name.** The harness's PID tracking only works if you
  let suite-owned children exit on their own. If you must force-kill, go through
  `dysflow_access_force_cleanup_orphaned` (or `dysflow_access_cleanup` with the recorded
  `operationId` + `accessPath`). `Stop-Process -Name MSACCESS -Force` is a hard ban.
- **The fixtures are destructive by design.** `E2E_testing/NoConformidades.accdb` and
  `NoConformidades_Datos.accdb` are test assets. The harness copies them to a temp sandbox
  before writes — destructive calls always run against the sandbox copy, never against the
  repository fixtures directly.
- **`tools/list` advertised count is sensitive to the live registry.** If a tool is hidden via
  `buildHiddenToolRegistry`, it doesn't count. Cross-checks like
  `snapshot.toolsVisible === advertised.length` will surface drift between the unit pin and
  the live MCP server immediately.

## What lives where

| Path | Role |
|---|---|
| `E2E_testing/mcp-e2e.mjs` | Canonical harness. The only place that runs the full battery. |
| `E2E_testing/_helpers/mcp-e2e-record.mjs` | `record()` implementation (preflight + callMcp + `:zombie-check`). Reused by the unit test that exercises this helper with fakes. |
| `E2E_testing/_helpers/resolve-mcp-e2e-command.mjs` | Runtime resolution (`DYSFLOW_E2E_COMMAND` → `test-runtime/bin/dysflow.cmd` → `%LOCALAPPDATA%\dysflow` → refuse). |
| `E2E_testing/.dysflow/project.json` | Project config consumed by the harness: `projectId: noconformidades-e2e`, `accessPath`, `backendPath`, `passwordEnv: ACCESS_VBA_PASSWORD`. |
| `E2E_testing/NoConformidades.accdb` | Frontend fixture (copied to sandbox before writes). |
| `E2E_testing/NoConformidades_Datos.accdb` | Backend fixture (same). |
| `E2E_testing/src/` | Read-only source fixture tree (VBA modules the harness imports/exports). |
| `E2E_testing/tests/`, `E2E_testing/forms/` | Auxiliary fixture assets. |
| `test-runtime/bin/dysflow.cmd` | Throwaway launcher. **What the harness spawns.** Built from `pnpm build` + sync step above. |
| `test-runtime/bin/dist/` | Throwaway CLI dist. **What gets refreshed on every release-gate run.** |
| `%TEMP%/dysflow-mcp-e2e-*/` | Per-run sandbox (frontend copy, backend copy, exports, report). Auto-removed on success; preserved on failure. |

## Rules for maintainers

- Keep **one** canonical MCP E2E harness: `mcp-e2e.mjs`.
- Do not reintroduce separate "fast smoke" scripts with a weaker acceptance criterion.
- Do not copy Dysflow TypeScript source into `E2E_testing/`.
- Do not hardcode fixture passwords. Use `ACCESS_VBA_PASSWORD`.
- Destructive tool calls must run against the temp sandbox copies, never the repository
  fixtures directly.
- Generated reports, Access locks, temp files, and local binary fixtures are not PR artifacts
  unless explicitly needed for diagnosis.

## Optional knobs

```powershell
# Override the MCP command under test.
$env:DYSFLOW_E2E_COMMAND = "C:\path\to\other\dysflow.cmd"

# Per-tool response timeout. Default 30s.
$env:DYSFLOW_E2E_TIMEOUT_MS = "30000"

# Preserve the copied sandbox for post-run inspection (even on success).
$env:DYSFLOW_E2E_PRESERVE_SANDBOX = "1"

# Deterministic sandbox parent (the harness always creates a fresh child under it).
$env:DYSFLOW_E2E_SANDBOX_ROOT = "D:\diagnostics"
```

If the harness aborts before any tool call, the message names the resolution code
(`MCP_E2E_REFUSES_PRODUCTION_RUNTIME`, `MCP_E2E_NO_RUNTIME_AVAILABLE`, or
`MCP_E2E_OVERRIDE_NOT_FOUND`) and the candidates it searched. Run `pnpm build` and re-sync the
test-runtime, or fix `DYSFLOW_E2E_COMMAND`.

## Boundary

`E2E_testing` is reserved for real Access fixture assets and thin harness notes. E2E checks
must exercise production implementation by launching `dysflow mcp`; they must not validate a
shadow adapter or copied protocol code.
