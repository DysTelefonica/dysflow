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

## Current version: v0.9.19

**48 MCP tools · 666 tests · Windows / Node 20+**

All Access, VBA, schema, and form tools are first-class API. No compatibility tiers.

See [CHANGELOG](./CHANGELOG.md) for full history.

## What Dysflow is (and is not)

### It is

- A local automation runtime for Microsoft Access (`.accdb/.mdb`) focused on **safety and ownership**.
- A **core-first platform** (`src/core`) with thin adapters (`src/adapters`) for MCP stdio and HTTP.
- A platform with 48 MCP tools covering VBA, SQL, schema, and form operations.

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

### 2) Cleanup is explicit and validated

`dysflow_access_cleanup`/`cleanup_access_operation` only succeeds when all safety checks pass.

Refusal examples include:

- `CLEANUP_OPERATION_NOT_FOUND`
- `CLEANUP_ACCESS_PATH_MISMATCH`
- `CLEANUP_PID_UNKNOWN`
- `CLEANUP_PROCESS_NOT_FOUND`
- `CLEANUP_PROCESS_NAME_MISMATCH`
- `CLEANUP_PROCESS_START_TIME_MISMATCH`
- `CLEANUP_STATUS_NOT_ELIGIBLE`

### 3) Writes are safer by construction

- Read tools are default/explicit `mode: "read"`.
- Write-like operations pass through guarded request paths.
- `dryRun`-style safety is preserved across all write-capable tools.

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

### Install directly from GitHub (recommended)

Use this when a teammate wants to install from GitHub on another machine, without cloning manually.

> Note: this repository is not published as an npm package yet, so Git URL install is the official remote path.

```bash
# Latest version from GitHub remote
pnpm add -g "git+https://github.com/DysTelefonica/dysflow.git#v0.9.19"
# or if you prefer the latest main branch
pnpm add -g git+https://github.com/DysTelefonica/dysflow.git
```

Then verify:

```powershell
dysflow setup
dysflow doctor
```

### Install from source (full control)

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
  "backendPasswordEnv": "PROJECTABC_BACKEND_PASSWORD"
}
```

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

Write-capable SQL tools are disabled by default on MCP, matching the HTTP safety model. Start MCP with `--enable-writes` only for trusted local maintenance sessions:

```powershell
dysflow mcp --enable-writes
```

Project-scoped override: when a call resolves a registered/repo `.dysflow/project.json` with `"allowWrites": true`, write tools are enabled for that project even if MCP was started without `--enable-writes`. `dryRun` operations remain allowed in all modes.

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
Execute a public VBA procedure via COM automation.
* **Parameters**:
  - `procedureName` (string, **required**): Public VBA procedure name to execute.
  - `moduleName` (string, optional): Target module containing the procedure.
  - `arguments` (array, optional): Positional arguments passed to the procedure.
  - `projectId`, `contextId` (optional)

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

#### `dysflow_access_operations_list`
Retrieve active and completed Access operation handles managed by Dysflow.
* **Parameters**: None.

#### `dysflow_access_cleanup`
Safely terminate stuck or left-over `MSACCESS.EXE` processes owned by Dysflow.
* **Parameters**:
  - `operationId` (string, **required**): Handle ID of the operation to clean.
  - `accessPath` (string, **required**): Database file path associated with the target operation.
  - `force` (boolean, optional): Terminate immediately.

---

### MCP Tools

#### 1. VBA Lifecycle & Testing
* **`export_modules`**: Export VBA source code modules to disk.
  - Parameters: `moduleNames` (array, optional), `filter` (string, optional), `destinationRoot` (string, optional), `timeoutMs` (number, optional), `strictContext` (boolean, optional), `expectedAccessPath`/`expectedProjectRoot`/`expectedDestinationRoot` (string, optional)
* **`export_all`**: Export all VBA modules from the database.
  - Parameters: `filter` (string, optional), `diff` (boolean, optional), `timeoutMs` (number, optional), `strictContext` (boolean, optional)
* **`import_modules`**: Import VBA source modules from disk.
  - Parameters: `moduleNames` (array, optional), `importMode` (string, optional), `dryRun` (boolean, optional), `compile` (boolean, optional), `timeoutMs` (number, optional), `strictContext` (boolean, optional)
* **`import_all`**: Bulk import all local modules into the Access project.
  - Parameters: `importMode` (string, optional), `dryRun` (boolean, optional), `compile` (boolean, optional), `timeoutMs` (number, optional), `strictContext` (boolean, optional)
* **`compile_vba`**: Trigger VBA compilation inside the Access database.
  - Parameters: `timeoutMs` (number, optional), `accessPath`/`backendPath`/`projectRoot`/`destinationRoot` (optional)
* **`test_vba`**: Execute VBA unit tests.
  - Parameters: `proceduresJson` (string, optional), `filter` (string, optional), `testsPath` (string, optional), `timeoutMs` (number, optional)
* **`verify_code` / `verify_binary`**: Perform structural checks comparing disk modules and database binaries.
  - Parameters: `moduleNames` (array, optional), `diff` (boolean, optional), `timeoutMs` (number, optional), `strictContext` (boolean, optional)
* **`reconcile_binary`**: Produce a reconciliation plan comparing binary state against disk source.
  - Parameters: `moduleNames` (array, optional), `diff` (boolean, optional), `timeoutMs` (number, optional), `strictContext` (boolean, optional)
* **`delete_module`**: Delete a module from the VBA project.
  - Parameters: `moduleName` (string, optional), `timeoutMs` (number, optional)
* **`list_objects`**: List all forms, reports, modules, and macros.
  - Parameters: `filter` (string, optional), `timeoutMs` (number, optional)
* **`exists`**: Verify if an object or module exists.
  - Parameters: `name` (string, optional), `moduleName` (string, optional), `timeoutMs` (number, optional)

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
* **`seed_fixture` / `teardown_fixture`**: Populates or clears mock rows in a table.
  - Parameters: `tableName` (string, optional), `rows` (array of objects, optional), `dryRun`, `apply`

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
* **`get_relationships`**: List foreign keys and relation constraints.
  - Parameters: `accessPath` (optional)
* **`list_access_files`**: Search for `.accdb` files recursively in a directory.
  - Parameters: `rootPath` (string, optional), `directory` (string, optional)
* **`list_links`**: Get target connections of all linked tables.
  - Parameters: `accessPath` (optional)
* **`link_tables` / `relink_tables`**: Link or rebind tables to a backend file.
  - Parameters: `accessPath`, `backendPath` (optional), `dryRun`
* **`localize_backend_links`**: Convert absolute linked paths to local relative links.
  - Parameters: `accessPath`, `backendPath` (optional), `dryRun`
* **`unlink_table`**: Delete a linked table definition.
  - Parameters: `tableName` (string, optional), `accessPath` (optional), `dryRun`
* **`export_queries` / `import_queries`**: Export or bulk import Access QueryDefs.
  - Parameters: `exportPath`/`path`/`queryDefinitions` (optional), `accessPath` (optional), `dryRun`
* **`compact_repair`**: Execute compact and repair operations.
  - Parameters: `accessPath`/`databasePath`/`sourcePath` (optional), `backupFirst` (boolean, optional), `dryRun`

#### 4. GUI & Forms
* **`validate_form_spec`**: Parse and lint a JSON specification for form generation.
  - Parameters: `specPath` (string, optional), `spec` (object, optional)
* **`generate_form`**: Compile a form spec into a live Access form.
  - Parameters: `specPath` (string, optional), `spec` (object, optional), `kind` (string, optional), `name` (string, optional), `replace` (boolean, optional), `dryRun`
* **`catalog_add_control`**: Insert controls into a UI catalog definition.
  - Parameters: `catalogPath` (string, optional), `controlName` (string, optional), `controlType` (string, optional)
* **`harvest_form_catalog`**: Index controls from existing forms into a catalog.
  - Parameters: `catalogPath` (string, optional), `filter` (string, optional)

### MCP protocol and maintenance

Initialize response uses a named protocol constant:

- `MCP_PROTOCOL_VERSION` (`2024-11-05`)
- See `docs/testing/mcp-protocol-maintenance.md` for update procedure and JSON-RPC guards.

Important behavior now explicitly covered in tests:

- `id: null` is treated as a valid request id and receives a response.
- notifications (no `id`) are intentionally ignored.

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

See the complete contract in [`docs/api/http-api.md`](docs/api/http-api.md).

---

## CLI

| Command           | Description                                   |
| ----------------- | --------------------------------------------- |
| `dysflow`         | Open the Dysflow TUI dashboard                |
| `dysflow mcp`     | Start MCP stdio adapter (`--enable-writes` enables guarded SQL writes) |
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

The updater builds the release source in a temporary workspace, so local `git`,
`pnpm`, and network access to GitHub must be available.

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
- The MCP standard adapter is intentionally small and controlled; protocol drift is tracked as a first-class maintenance item.

---

## Current roadmap

- Installer/update hardening
- richer MCP input schemas for complex domains
- expanded Access/VBA domain tooling
- broader E2E coverage for multi-project project-context flows

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
