# Dysflow

**Status:** Production-ready MCP/CLI runtime for safe Microsoft Access automation on Windows.

<p align="center">
  <a href="https://github.com/DysTelefonica/dysflow/releases">
    <img src="https://img.shields.io/github/v/release/DysTelefonica/dysflow" alt="Release" />
  </a>
  <img src="https://img.shields.io/badge/Platform-Windows-lightgrey" alt="Platform: Windows" />
  <img src="https://img.shields.io/badge/Node-20%2B-339933?logo=node.js&logoColor=white" alt="Node 20+" />
</p>

Dysflow gives agents and scripts a **controlled, auditable execution surface** for Access/VBA tasks: query execution, procedure calls, diagnostics, operation tracking, and safe cleanup.

---

## Versioning

The installed version is reported by `dysflow --version` and the MCP `serverInfo.version`.
See the [CHANGELOG](./CHANGELOG.md) for the full release history.

**54 visible MCP tools · Windows / Node 20+**

All Access, VBA, schema, and form tools are first-class API. No compatibility tiers.

## Releases

Dysflow releases are cut from `main` via `scripts/release-prepare.ps1`, which wraps
the full workflow (bump version, update CHANGELOG, push, **wait for CI green on
the release commit's SHA**, tag, push tag) and refuses to tag unless CI concludes
`success`. The release workflow then builds the tarball, signs `SHA256SUMS` with
Ed25519, and publishes the GitHub Release.

The full pre-release checklist lives in [`docs/release-checklist.md`](./docs/release-checklist.md).
Heavy MCP E2E (`node E2E_testing/mcp-e2e.mjs`) is run by humans only at the very end
of a release — it is NOT run by CI — and its structural contracts are pinned by
cheap vitest tests in `test/quality-gates/mcp-e2e-*` so the 30-minute battery
rarely surprises you.

Operator commands:

```powershell
pwsh -File scripts/release-prepare.ps1 -Bump patch    # v1.10.3 → v1.10.4
pwsh -File scripts/release-prepare.ps1 -Bump minor    # v1.10.x → v1.11.0
pwsh -File scripts/release-prepare.ps1 -Version 1.11.2 # explicit override
```

## What Dysflow is (and is not)

### It is

- A local automation runtime for Microsoft Access (`.accdb/.mdb`) focused on **safety and ownership**.
- A **core-first platform** (`src/core`) with thin adapters (`src/adapters`) for MCP stdio and HTTP.
- A platform with 54 visible MCP tools covering VBA, SQL, schema, and form operations.

### It is not

- A full Access UI replacement.
- A tool to run arbitrary system-level process management.
- A web-hosted service (defaults to local-only execution).

---

## Why this exists

Access automation is risky when ownership is implicit. For example, this is unsafe:

```powershell
Stop-Process -Name MSACCESS -Force
```

It can terminate unrelated user sessions.

Dysflow records every Access launch (operation id, action, db path, PID, process metadata, lifecycle) and gates destructive actions so cleanup can only happen on verified operations.

---

## Architectural model

Dysflow follows a strict one-way dependency model:

```text
CLI / MCP stdio / HTTP
  -> src/adapters/*
     -> src/core/services/*
        -> src/core/runner/access-runner.ts
           -> PowerShell / MSACCESS
```

`src/core` owns domain logic and returns typed `OperationResult` values. Adapters only translate results to protocol-specific responses.

---

## Safety model (mandatory)

### 1) Operation registry is the source of truth

Every `dysflow` invocation that starts Access records an operation with:

- `operationId`
- action (`diagnostics`, `query`, `vba`, ...)
- target `accessPath`
- Access `PID`
- process start time
- command line (when available)
- status lifecycle

### 2) Cleanup is explicit, owned, and validated

`dysflow_access_cleanup`/`cleanup_access_operation` only succeeds when all safety checks pass.
Cleanup targets **only Dysflow-owned Access processes** with attribution through an operation id, marker file, PID record, and process start time. Matching by process name, database path, or command line alone is diagnostic only; it is not ownership and must report/block instead of terminating Access.

Refusal examples include:

- `CLEANUP_OPERATION_NOT_FOUND`
- `CLEANUP_ACCESS_PATH_MISMATCH`
- `CLEANUP_PID_UNKNOWN`
- `CLEANUP_PROCESS_NOT_FOUND`
- `CLEANUP_PROCESS_NAME_MISMATCH`
- `CLEANUP_PROCESS_START_TIME_MISMATCH`
- `CLEANUP_STATUS_NOT_ELIGIBLE`

**Interrupted `starting` operations.** An operation is registered as `starting` (with `accessPid: null`) *before* the Access process is spawned. If the runtime is interrupted in that window (client abort, hard kill), the record is orphaned in `starting` with no PID because the finalizing transition never runs. Such records are handled safely:

- The pre-flight cleanup that runs before every Access operation transitions a *stale* `starting` record (no PID, idle past the in-flight grace window) to `failed` and stamps `metadata.interruptedReason`. This is **registry-only bookkeeping — it inspects and kills nothing**, because no PID was ever owned.
- `cleanup_access_operation` may retire a stale `starting`/no-PID record **without `force`**, since there is no owned process to kill. It still refuses (never kills) if a live `MSACCESS.EXE` bound to *that record's* `accessPath` is found, and the scan is scoped to that `accessPath` — Access processes of other projects (different `.accdb`) are never matched or touched.
- A `starting` record that is still within the grace window is treated as possibly in-flight and is left alone (cleanup without `force` is refused with `CLEANUP_PID_UNKNOWN`).

### 3) Writes are safer by construction

- Read tools are default/explicit `mode: "read"`.
- Write-like operations pass through guarded request paths.
- `dryRun`-style safety is preserved across all write-capable tools.
- Access cleanup is write-gated only for `force: true`; non-force cleanup remains allowed so terminal or failed Dysflow-owned operations can pass through the normal eligibility checks even when writes are disabled.

### 4) VBA procedure allowlist

Set `allowedProcedures` in `.dysflow/project.json` to restrict which VBA procedures can be called. This enforcement applies to all three execution entry points:

- MCP `dysflow_vba_execute`
- MCP `run_vba`
- HTTP `POST /vba/execute`

A call to a procedure not in the list is rejected before any COM automation is started. An empty list or absent field means all procedures are allowed (default).

---

## Requirements

| Requirement  | Notes                                |
| ------------ | ------------------------------------ |
| OS           | Windows                              |
| Runtime      | Node.js 20+                          |
| Access stack | Microsoft Access / ACE               |
| Shell        | Windows PowerShell 5.1               |
| MCP client   | OpenCode (current production target) |

---

## Installation (remote-ready)

### Install from the current GitHub Release (recommended)

Use the current release asset from https://github.com/DysTelefonica/dysflow/releases/latest for production/runtime installs. The release page carries the versioned `dysflow-<tag>.tar.gz` asset and `SHA256SUMS`; avoid README-pinned "latest" tags because they drift after every release.

After installing or updating the runtime, verify:

```powershell
dysflow setup
dysflow doctor
```

### Developer source checkout

Use a source checkout only for local development, tests, and preparing releases. It is not the production update path.

```powershell
pnpm install
pnpm build
pnpm install -g .
```

### Runtime install

Recommended production/runtime install remains profile-local on Windows (`%LOCALAPPDATA%\\dysflow`) for MCP tooling.

If you use different Windows profiles and want updates to keep targeting a fixed runtime location, install with an explicit runtime directory. For true cross-user use on the same machine, choose a shared path that all intended users can read/write, such as `C:\Dysflow` or an ACL-managed `C:\ProgramData\dysflow\runtime`:

```powershell
dysflow install --runtime-dir C:\Dysflow --agents opencode --no-tui
```

`dysflow install` persists the resolved runtime directory in a machine-level marker so future `dysflow update` calls can reuse the same installed runtime instead of falling back to the current user's `%LOCALAPPDATA%` path.

### Layout (profile install)

```text
C:\Users\<user>\AppData\Local\dysflow
├─ app
│  ├─ dist
│  └─ scripts
│     └─ dysflow-vba-manager.ps1
└─ bin
   ├─ dysflow.cmd
   └─ dysflow.ps1
```

Expose the `bin` path:

```text
C:\Users\<user>\AppData\Local\dysflow\bin
```

### After install: verify the MCP wiring

This is the part most teammates miss. `dysflow install` writes the runtime to `%LOCALAPPDATA%\dysflow`, but **opencode's MCP wiring is a separate file** and it can silently keep pointing at a stale in-tree binary, a `test-runtime`, or a path that no longer exists. Run these three checks the first time you set up a new machine, and re-run them if a Dysflow tool starts returning `RUNNER_INVALID_JSON`, `CONFIG_TARGET_NOT_FOUND`, or a single-tenant result that looks like the wrong database.

```powershell
# 1. Confirm the installed runtime is the one opencode is actually calling.
dysflow --version                              # should print e.g. 1.2.34
$runtime = "$env:LOCALAPPDATA\dysflow\bin\dysflow.cmd"
Test-Path $runtime                             # must be True
Get-FileHash $runtime -Algorithm SHA256         # pin this; if it ever changes, something rewrote your install

# 2. Confirm ~/.config/opencode/opencode.json points the dysflow MCP at the installed runtime,
#    NOT at <repo>/test-runtime/bin/dysflow.cmd or any path inside a dev worktree.
$cfg = Get-Content "$env:USERPROFILE\.config\opencode\opencode.json" -Raw | ConvertFrom-Json
$cmd = $cfg.mcp.dysflow.command[0]
if ($cmd -like "*\test-runtime\*" -or $cmd -like "*\Proyectos\dysflow\bin\*") {
  Write-Warning "opencode is wired to a dev/test runtime: $cmd"
  Write-Warning "Re-run: dysflow install --agents opencode --no-tui  (it will rewrite the wiring for you)"
}

# 3. Force opencode to reconnect to the MCP server, then sanity-check with one read-only tool.
#    In opencode, type /mcp and confirm the dysflow server is listed and connected.
#    Then call:
#       dysflow_list_tables  (with projectId matching your .dysflow/project.json id)
#    You should see the full backend table list, NOT a 2-table frontend stub.
```

If step 2 reports a warning, run `dysflow install --agents opencode --no-tui` once and re-run the three checks. The `--no-tui` flag is the same installer used by `dysflow update` for OpenCode wiring, so it is safe to re-run on a working install; it only rewrites the `opencode.json` `mcp.dysflow.command` entry and the `C:\Users\<user>\AppData\Local\dysflow` install path.

> Common failure mode: a teammate keeps the dev repo at `C:\Proyectos\dysflow` open in another tab, runs `pnpm install -g .` from there "to test a fix", and the global dysflow command on `PATH` starts pointing at a binary inside the dev worktree. After committing the fix, run `dysflow update` (or reinstall from the release tarball) and re-verify step 2.

---

## Configuration

### AI agent quick start: provision one repo before calling tools

If you are an AI agent, do this **once per Access project/worktree** before using Dysflow tools. Do not guess paths on every call.

#### Quick path

1. Open the Access project repository/worktree.
2. Choose a stable `projectId`. **Recommended:** use the same name your memory system/Engram uses for this project.
3. Write repo-local config with `dysflow setup --write-project`.
4. Put passwords in project-level environment variables, not in prompts or command arguments.
5. Validate with `dysflow doctor`.
6. Before the next Dysflow command after a timeout/crash, list and clean only operations owned by this project.

```powershell
cd C:\Projects\my-access-project

# Use the same project id as Engram/memory when available.
dysflow setup --write-project --project-id my-access-project `
  --access-path .\Frontend.accdb `
  --backend-path .\Backend.accdb

# Set secrets at project/session level. Do not hardcode them in .dysflow/project.json.
$env:DYSFLOW_ACCESS_PASSWORD = "<access-password>"
$env:DYSFLOW_BACKEND_PASSWORD = "<backend-password>"

dysflow doctor
```

After that, normal MCP calls should be short and traceable:

```json
{ "projectId": "my-access-project" }
```

Do not repeat `accessPath`, `backendPath`, `destinationRoot`, or `projectRoot` on every tool call when they already live in `.dysflow/project.json`. Repeated path overrides are for deliberate one-off exceptions only.

#### What the AI should create

`.dysflow/project.json` belongs in the Access project repo/worktree, not inside the Dysflow runtime install directory:

```json
{
  "id": "my-access-project",
  "accessPath": "Frontend.accdb",
  "backendPath": "Backend.accdb",
  "destinationRoot": "src",
  "passwordEnv": "DYSFLOW_ACCESS_PASSWORD",
  "backendPasswordEnv": "DYSFLOW_BACKEND_PASSWORD"
}
```

Use repo-relative paths whenever possible so the same config works for `adm`, `adm.DEFENSA`, and teammates with different Windows profile names.

#### Cleanup before retrying

Dysflow tracks Access processes it opens under `.dysflow/runtime/operations.json`. If a command times out, fails, or leaves Access open, the AI may clean **only its own tracked operation** before launching the next command.

1. List operations:

   ```text
   dysflow_access_operations_list { "projectId": "my-access-project" }
   ```

   Alias:

   ```text
   list_access_operations { "projectId": "my-access-project" }
   ```

2. Cleanup a specific operation id returned by the list call:

   ```text
   dysflow_access_cleanup {
     "accessPath": "C:\\data\\mydb.accdb",
     "operationId": "<operation-id>"
   }
   ```

   Alias:

   ```text
   cleanup_access_operation {
     "accessPath": "C:\\data\\mydb.accdb",
     "operationId": "<operation-id>"
   }
   ```

Never run broad process cleanup such as `Stop-Process -Name MSACCESS -Force`. Dysflow validates `operationId`, database path, PID, start time, process name, and status before terminating anything.

#### AI checklist

- [ ] I am in the Access project repo/worktree, not the Dysflow repo unless I am developing Dysflow itself.
- [ ] `.dysflow/project.json` exists and uses repo-relative paths.
- [ ] `projectId` matches the Engram/memory project name when available.
- [ ] Secrets are in environment variables or a local ignored secret store, never in git.
- [ ] I pass `projectId` on MCP calls for traceability.
- [ ] After timeout/crash, I list operations and cleanup only the exact tracked `operationId` before retrying.

---

Dysflow resolves functional project configuration from the current repository:

1. explicit programmatic input (`accessDbPath` / config object)
2. repo-local `.dysflow/project.json`

The runtime installation directory is only for executable code (`DYSFLOW_HOME`). It must not contain the active `.dysflow` project configuration.

Environment variables do not select projects, Access database paths, backend paths, destination roots, or timeouts. This keeps parallel AI sessions from accidentally sharing global state. Only secrets may come from environment variables.

Secrets can also be supplied through a local `.secrets.json` for VBA manager workflows. Keep that file outside git, restrict its ACL to the current user, and prefer environment variables (`DYSFLOW_ACCESS_PASSWORD` / `ACCESS_VBA_PASSWORD`) for automated runs so passwords do not appear in command-line process listings.

### Local project setup

Create the repo-local config once from the target project root:

```powershell
cd C:\00repos\codigo\00_NO_CONFORMIDADES_staging
dysflow setup --write-project --project-id 00-no-conformidades-staging-clean `
  --access-path .\NoConformidades.accdb `
  --backend-path .\NoConformidades_Datos.accdb
```

This writes `.dysflow/project.json` with repo-relative paths and default `destinationRoot: "src"`:

```json
{
  "id": "00-no-conformidades-staging-clean",
  "accessPath": "NoConformidades.accdb",
  "backendPath": "NoConformidades_Datos.accdb",
  "destinationRoot": "src"
}
```

Normal calls should stay short and use the active repo/worktree config. `projectId` is the canonical trace identity and should match the Engram project name when Engram is available. `contextId` is only for a distinct run/context id; do not duplicate `projectId` and `contextId` with the same value.

```text
dysflow_doctor { "projectId": "00-no-conformidades-staging-clean" }
```

To align an existing repo config with the Engram project name, run:

```powershell
dysflow setup --set-project-id 00-no-conformidades-staging-clean
```

Do not inject these on every call when they are already in `.dysflow/project.json`:

| Repeated call field       | Put it in                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------- |
| `accessPath`              | `.dysflow/project.json` → `accessPath`                                                              |
| `backendPath`             | `.dysflow/project.json` → `backendPath`                                                             |
| `destinationRoot`         | `.dysflow/project.json` → `destinationRoot` (usually `src`)                                         |
| `projectRoot`             | active repo/worktree; optional `.dysflow/project.json` → `projectRoot` only for non-standard layout |
| `projectId`               | `.dysflow/project.json` → `id`; should match the Engram project name when available                 |
| `contextId`               | call-level run/context id only; omit it when it would duplicate `projectId`                         |
| password                  | environment secret named by `passwordEnv`, or `DYSFLOW_ACCESS_PASSWORD`                             |

Call-level path/root fields are still supported as explicit one-off overrides, and when provided they take precedence over `.dysflow/project.json`. Use them only for deliberate cross-project or exceptional operations.

### Environment variables

| Variable                                         | Purpose                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| `DYSFLOW_HOME`                                   | Runtime root override (e.g., `C:\Users\\<user>\\AppData\\Local\\dysflow`) |
| `DYSFLOW_ACCESS_PASSWORD` / `DYSFLOW_ACCESS_PWD` | Access DB password fallback                                      |
| `DYSFLOW_BACKEND_PASSWORD`                       | Backend DB password fallback                                     |
| `ACCESS_VBA_PASSWORD`                            | Alternative Access password env (alias for VBA runner scripts)   |

Runtime directory resolution order:

1. `--runtime-dir <dir>`
2. `DYSFLOW_HOME`
3. persisted machine-level runtime marker
4. `%LOCALAPPDATA%\\dysflow`

### Project config examples

`project.json`:

```json
{
  "id": "project-abc",
  "name": "Project ABC",
  "accessPath": "src/ProjectABC.accdb",
  "backendPath": "src/ProjectABC_Datos.accdb",
  "destinationRoot": "src",
  "projectRoot": ".",
  "allowWrites": false,
  "timeoutMs": 120000,
  "passwordEnv": "PROJECTABC_ACCESS_PASSWORD",
  "backendPasswordEnv": "PROJECTABC_BACKEND_PASSWORD",
  "allowedProcedures": ["Refresh", "ExportReport", "RunMigration"],
  "httpTokenEnv": "DYSFLOW_HTTP_TOKEN"
}
```

HTTP auth is env-first: set `DYSFLOW_HTTP_TOKEN` in the runtime environment and keep `.dysflow/project.json` free of secrets. The inline `httpToken` is local-only for uncommitted scratch configs and must not be committed.

Bootstrap a repo-local config explicitly:

```powershell
dysflow setup --write-project --project-id project-abc --access-path .\src\ProjectABC.accdb --backend-path .\src\ProjectABC_Datos.accdb
```

### Runtime operation state

Dysflow keeps Access PID ownership state separate from stable project configuration:

```text
.dysflow/
├─ project.json                  # stable project config
└─ runtime/
   └─ operations.json            # volatile Access operation registry, git-ignored
```

`operations.json` is created when MCP launches Access operations. Completed and cleaned operations are purged; failed or timed-out operations remain so `dysflow_access_cleanup` can validate `operationId`, `accessPath`, PID, process start time, and command line before killing a stuck `MSACCESS.EXE` process.

---

## MCP (stdlib-style stdio)

The main production entrypoint is:

```powershell
dysflow mcp
```

**Write tools are disabled by default on MCP**, matching the HTTP safety model. This covers every write-capable tool — `delete_module`, `import_modules`/`import_all`, write-mode SQL, cleanup with `force: true`, `vba_inline_execution`, and so on. Calling one while writes are off returns `MCP_WRITES_DISABLED`. There are two ways to enable writes:

**Option 1 — per-repo (recommended).** Set `"allowWrites": true` in the repo's `.dysflow/project.json`. Writes are then enabled for that project even if MCP was started without `--enable-writes`, and the setting travels with the repo:

```json
{
  "accessDbPath": "path/to/database.accdb",
  "allowWrites": true
}
```

**Option 2 — process-wide.** Start MCP with `--enable-writes`. This enables writes for every project that server instance touches, so use it only for trusted local maintenance sessions:

```powershell
dysflow mcp --enable-writes
```

`dryRun` operations remain allowed in all modes regardless of either setting.

### Common Input Parameters

Many MCP tools share common context and override parameters:
* **Context / Identity**:
  - `projectId` (string, optional): Canonical project identity for traceability. Best matched to the Engram project name when available.
  - `contextId` (string, optional): Optional run/context id for distinct executions.
* **Access Database Path Overrides**:
  - `accessPath` / `databasePath` / `sourcePath` (string, optional): Paths to the frontend Access database. Overrides `.dysflow/project.json` settings.
  - `backendPath` / `comparePath` (string, optional): Paths to the backend database.
* **Workspace Overrides**:
  - `destinationRoot` (string, optional): Directory for VBA module source exports (usually `src`).
  - `projectRoot` (string, optional): Root directory of the repository/worktree.
* **Operation Safeguards**:
  - `timeoutMs` (number, optional): Operation timeout override in milliseconds.
  - `dryRun` (boolean, optional): Evaluate operations (like writes or imports) without applying changes.
  - `apply` (boolean, optional): Explicitly apply write actions (mutually exclusive with `dryRun` mode).

---

### Core MCP Tools

#### `dysflow_vba_execute`
Execute a public VBA procedure via COM automation. Enforces `allowedProcedures` when configured.
* **Parameters**:
  - `procedureName` (string, **required**): Public VBA procedure name to execute.
  - `moduleName` (string, optional): Target module containing the procedure.
  - `arguments` (array, optional): Positional arguments passed to the procedure.
  - `projectId`, `contextId` (optional)
  - `accessPath`, `backendPath`, `destinationRoot`, `projectRoot`, `timeoutMs` (optional overrides)

#### `dysflow_query_execute`
Run arbitrary SQL statements. Writes are guarded by the write-safety model.
* **Parameters**:
  - `sql` (string, **required**): SQL query to run.
  - `mode` (string, **required**): Execution mode (`read` or `write`).
  - `projectId`, `contextId` (optional)

#### `dysflow_doctor`
Run diagnostics on the MCP connection, Access installation, and configuration.
* **Parameters**:
  - `includeEnvironment` (boolean, optional): True to query environment settings and logs.
  - `projectId`, `contextId` (optional)
  - `accessPath`, `backendPath`, `destinationRoot`, `projectRoot`, `timeoutMs` (optional overrides)

#### `dysflow_access_operations_list`
Retrieve active and completed Access operation handles managed by Dysflow.
* **Parameters**: None.

#### `dysflow_access_cleanup`
Safely terminate stuck or left-over `MSACCESS.EXE` processes owned by Dysflow.
* **Parameters**:
  - `operationId` (string, **required**): Handle ID of the operation to clean.
  - `accessPath` (string, **required**): Database file path associated with the target operation.
  - `force` (boolean, optional): Terminate immediately. Requires writes to be enabled (`MCP_WRITES_DISABLED` is returned when writes are off); non-force cleanup is always allowed.

#### `dysflow_access_force_cleanup_orphaned`
List orphaned headless `MSACCESS.EXE` processes holding the project's `accessPath`, or kill exactly one verified orphan only when `confirmPid` is explicitly provided.
* **Parameters**:
  - `projectId` / `accessPath` (optional): Resolve the frontend database whose lock holders should be inspected.
  - `confirmPid` (number, optional): When omitted, the tool lists candidates only. When provided, killing is write-gated and still refuses non-headless, wrong-path, or Dysflow-owned processes.

---

### MCP Tools

#### 1. VBA Lifecycle & Testing
* **`export_modules`**: Export VBA source code modules to disk.
  - Parameters: `moduleNames` (array, optional), `filter` (string, optional), `destinationRoot` (string, optional), `timeoutMs` (number, optional), `strictContext` (boolean, optional), `expectedAccessPath`/`expectedProjectRoot`/`expectedDestinationRoot` (string, optional)
* **`export_all`**: Export all VBA modules (including code-less forms and reports visual layouts) and saved queries from the database.
  - Parameters: `filter` (string, optional), `diff` (boolean, optional), `prune` (boolean, optional), `timeoutMs` (number, optional), `strictContext` (boolean, optional)
  - **`prune`**: when `true`, after a **fully clean** export, deletes on-disk source files (`.bas`/`.cls`/`.form.txt`/`.report.txt`) whose module no longer exists in the binary, so the destination mirrors the binary. It deletes directly and lists the removed paths under `prune.deleted`. Guarantees:
    - **Never prunes after a warning.** If any module failed to serialize (e.g. a form open in design view) it is still live, so its file is kept; the response is `prune: { applied: false, reason: "export-had-warnings", deleted: [] }`.
    - **Incompatible with `filter`.** A filtered export only lists the matching modules, so pruning would delete every other on-disk file — this combination is rejected with `INVALID_INPUT`.
    - **Saved queries are never pruned.** Only the managed module/class/form/report folders are scanned.
* **`import_modules`**: Import VBA source modules from disk.
  - Parameters: `moduleNames` (array, optional), `importMode` (string, optional), `dryRun` (boolean, optional), `compile` (boolean, optional), `timeoutMs` (number, optional), `strictContext` (boolean, optional)
* **`import_all`**: Bulk import all local modules into the Access project.
  - Parameters: `importMode` (string, optional), `dryRun` (boolean, optional), `compile` (boolean, optional), `timeoutMs` (number, optional), `strictContext` (boolean, optional)
* **`compile_vba`**: Trigger VBA compilation inside the Access database.
  - Parameters: `timeoutMs` (number, optional), `accessPath`/`backendPath`/`projectRoot`/`destinationRoot` (optional)
* **`fix_encoding`**: Normalize leading UTF-8 BOM artifacts in source files and round-trip affected module encoding in the binary. It does not restore lossy mojibake characters.
  - Parameters: `location` (string, optional), `timeoutMs` (number, optional)
* **`test_vba`**: Execute VBA unit tests.
  - Parameters: `proceduresJson` (string, optional), `filter` (string, optional), `testsPath` (string, optional), `timeoutMs` (number, optional)
  - `proceduresJson` is a JSON-encoded **string** that parses to an array of tests (or an object with a `tests` array). Each test is either a procedure-name string — shorthand for no args — or an object `{ "procedure": "Test_Name", "args": [...], "tags": [...] }` (`proc` is accepted as an alias for `procedure`). Both forms are equivalent: `"[\"Test_A\",\"Test_B\"]"` and `"[{\"procedure\":\"Test_A\",\"args\":[\"fixture\",1]}]"`. The same shapes apply to a `testsPath` manifest file.
  - On failure the result is `ok: false` with code `VBA_TESTS_FAILED`. The message names the failing procedures, and `error.details` carries the structured per-procedure report: `{ failedCount, failures[], results[] }`, where each failure keeps `procedure`, `error`, `logs`, `durationMs`, and `payload`.
  - Limitation: when a single procedure is an aggregate entry point (e.g. a VBA `RunAll`), Dysflow can only identify the inner failures if `RunAll` itself returns them in its JSON payload (`ok: false` plus `error`/`logs`). Dysflow does not parse VBA assertion output on its own.
* **`verify_code`**: The single dry-run tool that compares exported VBA/Form source against the disk tree. It NEVER mutates Access. One tool covers every comparison scope:
  - **Whole project** — omit `moduleNames`.
  - **A subset or a single module** — pass `moduleNames`. If a `moduleNames` filter matches nothing in either side, it returns `MODULE_NOT_FOUND`.

  By default it classifies each differing module semantically (see [Semantic diff classification](#semantic-diff-classification)) — separating non-functional noise (line endings/whitespace, `Attribute VB_*` headers, `.form.txt` serialization metadata, encoding/mojibake) from actionable functional differences. It reports a per-category `summary`, `actionableDifferent`/`nonActionableDifferent` lists, a `hasFunctionalDifferences` / `actionableOk` signal, per-diff `classification`/`reason`/`recommendation`, and — new — an aggregated, whole-comparison `recommendation` plus a machine `recommendedAction` (`no_action`, `import_to_binary`, `export_to_src`, or `manual_merge`) so a consumer reads the sync direction in one shot. Backward-compatible: still reports `matched`, `different`, and missing modules with optional diffs.
  - Parameters: `moduleNames` (array, optional), `diff` (boolean, optional), `strict` (boolean, optional — restore byte/text-exact comparison), `timeoutMs` (number, optional), `strictContext` (boolean, optional)

  > **Migration note:** `verify_binary`, `reconcile_binary`, and `compare_module` were four names over this one engine and have been **removed**. Use `verify_code` for all of them: omit `moduleNames` for the whole project (old `verify_binary`), pass a single module for the old `compare_module`, and read `recommendation`/`recommendedAction` for the old `reconcile_binary` plan.
* **`delete_module`**: Delete one or more modules from the VBA project. Pass `moduleNames` (array) to delete a batch in a single Access session — this avoids the COM collisions that arise from issuing many parallel single-module calls; `moduleName` (singular) is still accepted for one module. The result reports per-module outcomes. When deletion fails with the corruption HRESULT `0x800ADEB9`, pass `force: true` to attempt a fallback (compact + retry / `DoCmd.DeleteObject`); otherwise the error returns bilingual remediation steps (see [`docs/diagnostics/hresult-guide.md`](./docs/diagnostics/hresult-guide.md)). Write-gated.
  - Parameters: `moduleNames` (array, optional), `moduleName` (string, optional — single-module shorthand), `force` (boolean, optional — applies to the whole batch), `timeoutMs` (number, optional)
* **`list_objects`**: List all forms, reports, modules, and macros.
  - Parameters: `filter` (string, optional), `timeoutMs` (number, optional)
* **`list_access_operations`**: Alias for listing tracked Access operations and their current registry status.
  - Parameters: none
* **`cleanup_access_operation`**: Alias for safely reconciling or force-cleaning a tracked Access operation.
  - Parameters: `operationId` (string, required), `force` (boolean, optional), `accessPath`/`backendPath`/`projectRoot`/`destinationRoot` (optional)
* **`exists`**: Verify if an object or module exists.
  - Parameters: `name` (string, optional), `moduleName` (string, optional), `timeoutMs` (number, optional)
* **`run_vba`**: Alias for executing a public VBA procedure in an already compiled project.
  - Parameters: `procedureName` (string, required), `argsJson` (string, optional), `accessPath`/`backendPath`/`projectRoot`/`destinationRoot` (optional)
* **`vba_orphan_audit`**: Audit the VBA project for orphan/placeholder modules — modules with no on-disk source counterpart and modules whose names match the Access placeholder pattern (`Módulo1`, `Module1`, `Class1`, `Form1`, …). Each entry carries `isSuspicious` and `sourcePath` (or `null` for orphans). Read-only.
  - Parameters: none (uses the active project context)
* **`vba_inline_execution`**: Run a throwaway VBA snippet in one call — writes a temporary module, imports it, executes its public entry point, captures the result, and guarantees cleanup of both the binary component and the temp file. Write-gated.
  - Parameters: `code` (string, required), `timeoutMs` (number, optional)

#### Semantic diff classification

`verify_code` compares exported VBA/Form source against the disk tree. By default it runs in **semantic mode**: each differing module is classified so that non-functional noise does not drown out the changes that actually need action. This avoids the common false-positive flood where dozens of modules report as "different" but only a handful require any work.

Each differing module is assigned one `classification`:

| Category | Meaning | Actionable |
| --- | --- | --- |
| `matched` | No functional difference | No |
| `whitespaceOnly` | Only line endings (CRLF/LF), trailing whitespace, trailing blank lines, or trivial indentation | No |
| `attributeOnly` | Only module/class header boilerplate differs — `Attribute VB_*` lines (in code modules and a form's embedded `CodeBehindForm`) or the `VERSION x.x CLASS` + `BEGIN…END` instancing block that an Access export may emit on one side only. `VB_Name` is kept functional only when **both** sides name the module and the names differ (a real rename); a one-sided header is non-functional | No |
| `caseOnly` | Only identifier/keyword casing differs (`Me.Name` vs `Me.name`). VBA is case-insensitive and the VBE re-cases identifiers project-wide on import. String-literal and comment bodies are compared **case-sensitively**, so a runtime-visible text change is NOT absorbed here | No |
| `formSerializationOnly` | Only `.form.txt` serialization metadata differs (`Checksum`, `PrtDevMode*`, `PrtDevNames*`, `PrtMip`, `RecSrcDt`, `LayoutCached*`, `PublishOption`, `NoSaveCTIWhenDisabled`), **or** a toggle property uses an equivalent serialization (`Visible =0` ≡ `Visible = NotDefault`). Access only writes a property when it differs from its default, so a written toggle value is always the same non-default — only the `NotDefault`/`0`/`-1` representation varies. A real change shows up as a line being present vs absent, which stays functional | No |
| `encodingOnly` | Difference disappears after normalizing encoding/mojibake artifacts — a leading BOM or its mojibake remnant (`?Attribute VB_Name…`, U+FEFF, U+FFFD) on one side only, or lossy out-of-codepage glyphs that Access export replaced with `?` (e.g. `►` → `?`). Lossy/case normalization is applied **outside string literals only**, so a glyph or casing change inside a quoted string stays functional | No |
| `sourceNewer` | Functional lines unique to disk source | Yes → `import_to_binary` |
| `binaryNewer` | Functional lines unique to the Access binary | Yes → `export_to_src` |
| `bothChanged` | Both sides have unique functional lines | Yes → `manual_merge` |

A form's **code-behind is verified through its `forms/*.cls`, not its `.form.txt`.** The code lives canonically in the `.cls` (dysflow's export writes it from `CodeModule.Lines`, and import syncs it back into the document module); the same code is also serialized — via `SaveAsText` — into the `.form.txt` `CodeBehindForm` section. The classifier strips everything from the `CodeBehindForm` marker onward and compares a `.form.txt` for its **UI/layout only**, so a real form change (control/property/layout) stays actionable while code-behind churn in the `.form.txt` is non-actionable (the `.cls` owns it). Casing and encoding normalization never collapse a genuine content change: identifier casing is folded only outside string literals/comments, so any runtime-visible difference still surfaces as functional.

The result adds a `summary` (count per category), `actionableDifferent` / `nonActionableDifferent` lists, and a `hasFunctionalDifferences` / `actionableOk` signal so an automated consumer can decide what to act on without re-exporting and diffing the binary by hand. It also carries `dysflowVersion` (the runtime package version that produced the result) and `classifierRules` (a fingerprint of the active rule set) so a consumer can tell *which* version classified a diff — distinguishing "fix not loaded into the running MCP" from "fix loaded but does not cover this case". When `diff: true`, each per-module entry also carries `classification`, `reason`, `isActionable`, `recommendedAction` (mirrors `recommendation`), and the unique-line counts. Pass `strict: true` to disable classification and fall back to byte/text-exact comparison.

#### 2. SQL Maintenance
* **`query_sql`**: Read-only SQL query execution.
  - Parameters: `sql` (string, optional), `query` (string, optional), `projectId`, `contextId`
* **`exec_sql`**: Modify-capable SQL execution.
  - Parameters: `sql` (string, optional), `query` (string, optional), `dryRun`, `apply`, `allowTables`/`denyTables` (array, optional), `accessPath`/`backendPath` (optional)
* **`run_script`**: Execute SQL statements from a disk script file.
  - Parameters: `scriptPath` (string, optional), `path` (string, optional), `dryRun`, `apply`, `allowTables`/`denyTables` (optional)
* **`create_table`**: Programmatically create a table in the database.
  - Parameters: `tableName` (string, optional), `definition` (string, optional), `dryRun`, `apply`
* **`drop_table`**: Drop a table.
  - Parameters: `tableName` (string, optional), `dryRun`, `apply`
* **`seed_fixture`**: Populates mock rows in a table.
  - Parameters: `tableName` (string, optional), `rows` (array of objects, optional), `dryRun`, `apply`
* **`teardown_fixture`**: Clears fixture rows from a table.
  - Parameters: `tableName` (string, optional), `dryRun`, `apply`

#### 3. Database Schema & Links
* **`list_tables`**: List all tables in the active databases.
  - Parameters: `accessPath`, `backendPath`, `databasePath`, `sourcePath` (optional)
* **`list_linked_tables`**: List only linked tables.
  - Parameters: `accessPath`, `backendPath` (optional)
* **`get_schema`**: Retrieve column types, sizes, and properties for a table.
  - Parameters: `tableName` (string, optional), `accessPath` (optional)
* **`count_rows`**: Get row count for a table or SQL query.
  - Parameters: `tableName` (string, optional), `sql`/`query` (string, optional), `accessPath` (optional)
* **`distinct_values`**: List distinct values of a column.
  - Parameters: `tableName` (string, optional), `columnName` (string, optional), `sql`/`query` (string, optional), `accessPath` (optional)
* **`compare_backends`**: Compare structural differences between two backends.
  - Parameters: `accessPath`, `backendPath`, `comparePath` (string, optional)
* **`generate_erd`**: Generate an entity-relationship document for the database schema.
  - Parameters: `erdPath` (string, optional), `accessPath`/`backendPath`/`destinationRoot`/`projectRoot` (optional)
* **`get_relationships`**: List foreign keys and relation constraints.
  - Parameters: `accessPath` (optional)
* **`list_access_files`**: Search for `.accdb` files recursively in a directory.
  - Parameters: `rootPath` (string, optional), `directory` (string, optional)
* **`list_links`**: Get target connections of all linked tables.
  - Parameters: `accessPath` (optional)
* **`link_tables`**: Link tables to a backend file.
  - Parameters: `accessPath`, `backendPath` (optional), `dryRun`
* **`relink_tables`**: Rebind existing linked tables to a backend file.
  - Parameters: `accessPath`, `backendPath` (optional), `dryRun`
* **`localize_backend_links`**: Convert absolute linked paths to local relative links.
  - Parameters: `accessPath`, `backendPath` (optional), `dryRun`
* **`unlink_table`**: Delete a linked table definition.
  - Parameters: `tableName` (string, optional), `accessPath` (optional), `dryRun`
* **`export_queries`**: Export Access QueryDefs.
  - Parameters: `exportPath`/`path`/`queryDefinitions` (optional), `accessPath` (optional), `dryRun`
* **`import_queries`**: Bulk import Access QueryDefs.
  - Parameters: `queryDefinitions`/`queries` (optional), `accessPath` (optional), `dryRun`
* **`compact_repair`**: Execute compact and repair operations.
  - Parameters: `accessPath`/`databasePath`/`sourcePath` (optional), `backupFirst` (boolean, optional), `dryRun`
* **`relink_directory`**: Bulk relink table references recursively under a directory root.
  - Parameters: `rootPath` (string, required), `dryRun`, `apply`, `backup` (boolean, optional), `recursive` (boolean, optional), `maps` (array, optional), `denyPrefixes` (array, optional), `strictLocal` (boolean, optional), `removeUnresolved` (boolean, optional), `timeoutMs` (number, optional), `accessPath`/`backendPath`/`destinationRoot`/`projectRoot` (optional overrides)

#### 4. GUI & Forms
* **`validate_form_spec`**: Parse and lint a JSON specification for form generation.
  - Parameters: `specPath` (string, optional), `spec` (object, optional)
* **`generate_form`**: Write a `.form.json` stub from a form spec. Does not create or compile a live Access form.
  - Parameters: `specPath` (string, optional), `spec` (object, optional), `kind` (string, optional), `name` (string, optional), `replace` (boolean, optional), `dryRun`
* **`catalog_add_control`**: Insert controls into a UI catalog definition.
  - Parameters: `catalogPath` (string, optional), `controlName` (string, optional), `controlType` (string, optional)
* **`harvest_form_catalog`**: Index controls from existing forms into a catalog.
  - Parameters: `catalogPath` (string, optional), `filter` (string, optional)
* **`inspect_form`**: Parse a version-controlled `.form.txt` (SaveAsText format) and return its control tree and form-level events as structured JSON. Works offline — Access is not required. Read-only.
  - Parameters: `sourcePath` (string, path to the `.form.txt` file), `path` (string, alias for `sourcePath`)
* **`compare_form`**: Compare two version-controlled `.form.txt` files and return a structured drift report (added/removed controls, changed properties, layout-bound changes), each classified as actionable or noise against the FORM_NOISE_KEYS floor (Checksum, PrtDevMode*, PrtDevNames*, PrtMip, RecSrcDt, LayoutCached*, PublishOption, NoSaveCTIWhenDisabled, NameMap). Works offline — Access is not required. Read-only.
  - Parameters: `sourcePath`/`path` (string, left `.form.txt` file), `targetPath`/`target` (string, right `.form.txt` file)
* **`lint_form_code`**: Static-analyze a form/report `.cls` against its parsed `.form.txt` without opening Access.
  - Parameters: `formName` or `moduleNames` (optional), `rules` (array, optional), `strict` (boolean, optional), `destinationRoot`/`sourceRoot` (optional)

### MCP protocol and maintenance

The MCP stdio adapter uses `@modelcontextprotocol/sdk` v1.29.0. Protocol version negotiation, framing, and spec compliance are handled by the SDK. The server currently derives its default negotiated protocol version from the SDK (`2025-03-26` with this pinned SDK), and the SDK supports up to `2025-11-25`.

Custom behaviors layered on top of the SDK (preserved from the previous hand-rolled adapter):

- Tool handler exceptions are absorbed into `{ isError: true }` results — they never propagate as JSON-RPC `-32603` internal errors.
- Error messages have Windows/UNC/POSIX paths scrubbed before reaching the client.
- A 1 MiB per-line size guard (`SizeLimitTransform`) sits between `process.stdin` and the SDK transport.

---

## HTTP API (local)

Start local HTTP adapter for scripts:

```powershell
dysflow serve --host 127.0.0.1 --port 17321
```

Defaults:

- host: `127.0.0.1`
- port: `17321`
- writes: disabled by default

**Bearer token auth**: prefer the env-first `httpTokenEnv` path in `.dysflow/project.json` and set `DYSFLOW_HTTP_TOKEN` in the runtime environment to require `Authorization: Bearer <token>` on every request:

```json
{
  "httpTokenEnv": "DYSFLOW_HTTP_TOKEN"
}
```

Keeping the token in the environment avoids committing secrets. The inline `httpToken` is local-only for uncommitted scratch configs and must not be committed. Requests without a valid token return `401`. When neither `httpTokenEnv` nor a local-only inline token resolves a token, all requests pass through (default).

**Procedure allowlist**: `allowedProcedures` is enforced on `POST /vba/execute`. Calls to unlisted procedures return `403 HTTP_PROCEDURE_NOT_ALLOWED`.

**Cleanup write gate**: `POST /access/cleanup` matches MCP behavior. Only `force: true` requires `--enable-writes`; non-force cleanup is still allowed to reach core eligibility checks while writes are disabled.

See the complete contract in [`docs/api/http-api.md`](docs/api/http-api.md).

---

## CLI

| Command           | Description                                   |
| ----------------- | --------------------------------------------- |
| `dysflow`         | Open the Dysflow TUI dashboard                |
| `dysflow mcp`     | Start MCP stdio adapter (`--enable-writes` enables guarded MCP writes) |
| `dysflow setup`   | Print resolved config (with redacted secrets) |
| `dysflow doctor`  | Run config + environment diagnostics          |
| `dysflow install` | Install runtime + auto-wire MCP integrations  |
| `dysflow --version` | Print the installed Dysflow CLI version       |
| `dysflow update`  | Update runtime from the latest GitHub release |
| `dysflow tui`     | Open the Dysflow TUI dashboard                |
| `dysflow serve`   | Start local HTTP API                          |

### Common flow

1. Open the dashboard:
   - `dysflow`
2. Install runtime + MCP integrations:
   - `dysflow install --agent-all`
3. Validate config: `dysflow setup` or `dysflow doctor`
4. Start MCP: `dysflow mcp`
5. Run MCP client session (OpenCode, etc.)
6. On automation error/timeouts, inspect `dysflow_access_operations_list`
7. Clean up owned operation explicitly via `dysflow_access_cleanup`

### Updating Dysflow

Use the installed CLI to update itself from the latest published GitHub release:

```powershell
dysflow update
```

`dysflow update` checks the latest GitHub release, skips reinstall when the
installed runtime is current, and installs the newer release when available.
Use `--force` to reinstall the latest release even when versions match:

```powershell
dysflow update --force
```

The updater downloads the production GitHub Release archive (`tar.gz`) directly from GitHub, verifies the Ed25519 signature over the release checksum manifest, verifies the archive against the signed SHA-256 checksum, and extracts it. There is no source-build or git-clone fallback, protecting the update path from supply-chain risks.

If the release asset is missing, the signature is missing/invalid, or the SHA-256 checksum does not match, the update aborts. Retry later or report the release asset/checksum problem; do not build from source as an update fallback.

`dysflow update` uses the same runtime directory resolution as install:

1. `--runtime-dir <dir>`
2. `DYSFLOW_HOME`
3. persisted machine-level runtime marker
4. `%LOCALAPPDATA%\\dysflow`

Use `--runtime-dir` once during install when you want future updates to reuse that exact runtime location:

```powershell
dysflow install --runtime-dir C:\Dysflow --agents opencode --no-tui
dysflow update
```

---

## OpenCode MCP config

Point OpenCode to the installed runtime entrypoint with Node, e.g.:

```json
{
  "mcp": {
    "dysflow": {
      "enabled": true,
      "type": "local",
      "command": [
        "node",
        "C:/Users/<user>/AppData/Local/dysflow/app/dist/cli/index.js",
        "mcp"
      ]
    }
  }
}
```

If you installed with `--runtime-dir`, replace the runtime prefix with that directory, for example `C:/Dysflow/app/dist/cli/index.js`.

Validate:

```powershell
opencode mcp list
```

---

## Error handling and diagnostics

All command/tool responses expose structured error codes and diagnostics. In CLI mode, `dysflow doctor` prints check-by-check status (`✓`/`✗`).

For MCP, errors are returned as standard MCP content or JSON-RPC errors depending on adapter route.

---

## Testing

Development workflow:

```powershell
pnpm test
pnpm build
```

Current test baseline includes strict coverage for MCP compatibility behavior, protocol constants, and write-safety semantics.

Useful references:

- `test/adapters/mcp/*.test.ts`
- `test/core/services/*.test.ts`
- `docs/testing/mcp-access-e2e.md`

---

## Development notes

- `src/core/**` remains protocol-agnostic and returns normalized `OperationResult`.
- Adapters translate protocol-specific formats at boundaries only.
- Tool parity is tracked in `src/adapters/mcp/tool-parity-registry.ts`; the tool registry lives in `src/adapters/mcp/mcp-tool-registry.ts`.
- The MCP adapter uses `@modelcontextprotocol/sdk` — protocol mechanics are SDK-managed. Custom behaviors (error absorption, path sanitization, size guard) live in `stdio-wrappers.ts` and `stdio-size-guard.ts`.

---

## Current roadmap

- Split `install-utils.ts` into focused utility files (Q5)
- Broader E2E coverage for multi-project project-context flows
- Richer MCP input schemas for complex domains

---

## Open-source quality posture

- **Clear safety contracts** before destructive operations
- **Structured error semantics** with explicit codes
- **Deterministic compatibility layer** for named MCP tool aliases
- **TDD-first changes** with strict `pnpm test` / `pnpm build` verification

---

## Relevant docs

- [`CHANGELOG.md`](CHANGELOG.md)
- [`docs/architecture/dysflow-core-and-adapters.md`](docs/architecture/dysflow-core-and-adapters.md)
- [`docs/api/http-api.md`](docs/api/http-api.md)
- [`docs/testing/mcp-access-e2e.md`](docs/testing/mcp-access-e2e.md)
- [`docs/testing/mcp-protocol-maintenance.md`](docs/testing/mcp-protocol-maintenance.md)
