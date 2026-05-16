# Dysflow

Dysflow is a local-first automation runtime for Microsoft Access/VBA projects. It gives AI agents and scripts a controlled way to inspect, run, query, diagnose, and safely clean up Access operations without guessing which `MSACCESS.EXE` process belongs to them.

The main production entrypoint is the MCP server:

```powershell
dysflow mcp
```

It is designed for OpenCode and other MCP clients, while also exposing a CLI and local HTTP API for scripts.

## What Dysflow can do today

| Capability | Interface | Status |
|---|---|---|
| Run as MCP stdio server | `dysflow mcp` | Available |
| Diagnose Access configuration | CLI, MCP, HTTP | Available |
| Execute Access read/write queries | MCP, HTTP, core services | Available |
| Execute VBA procedures | MCP, HTTP, core services | Available |
| List Access operations opened by Dysflow | MCP, HTTP | Available |
| Safely cleanup owned Access processes | MCP, HTTP | Available |
| Local HTTP API for scripts | `dysflow serve` | Available |
| Windows profile install | `AppData\Local\dysflow` | Available |
| TUI | `dysflow tui` | Planned |

## Why this exists

Access automation is dangerous when processes are not owned explicitly. A generic command like this is not acceptable:

```powershell
Stop-Process -Name MSACCESS -Force
```

It can kill a user's Access session, another project, or another automation run.

Dysflow solves that by treating every Access-opening call as an auditable operation. When Dysflow opens Access, it records:

- `operationId`
- action: `diagnostics`, `query`, `vba`, etc.
- Access database path
- exact `MSACCESS.EXE` PID
- OS process start time
- command line when available
- status lifecycle
- operation metadata

Cleanup is only allowed through Dysflow's cleanup tool, which validates the operation id, path, PID, process start time, process name, command line compatibility, and status before killing anything.

## Requirements

| Requirement | Notes |
|---|---|
| Windows | Target platform for Access automation |
| Microsoft Access / ACE | Required for `.accdb` automation |
| Windows PowerShell 5.1 | Required and supported; do not require PowerShell 7 |
| Node.js 20+ | Runtime for the Dysflow CLI/MCP server |
| MCP client | OpenCode is the current production target |

Dysflow's PowerShell runner is compatible with Windows PowerShell 5.1, including Windows Server 2016.

## Install layout

For a profile-local production install, Dysflow lives here:

```txt
C:\Users\<user>\AppData\Local\dysflow
├─ app
│  ├─ dist
│  └─ scripts
│     └─ dysflow-access-runner.ps1
└─ bin
   ├─ dysflow.cmd
   └─ dysflow.ps1
```

The `bin` directory should be on the user's `PATH`:

```txt
C:\Users\<user>\AppData\Local\dysflow\bin
```

Verify:

```powershell
Get-Command dysflow -All | Select-Object CommandType, Source
dysflow setup
```

The first `dysflow` should resolve from `AppData\Local\dysflow\bin`.

## Configuration

Dysflow reads configuration from environment variables.

| Variable | Required | Purpose |
|---|---:|---|
| `DYSFLOW_HOME` | Yes for installed runtime | Runtime root, e.g. `C:\Users\adm1\AppData\Local\dysflow` |
| `DYSFLOW_ACCESS_DB_PATH` | Yes | Frontend `.accdb/.mdb` opened by Dysflow |
| `DYSFLOW_ACCESS_PASSWORD` | If protected | Access password; never printed in clear text |
| `DYSFLOW_TIMEOUT_MS` | No | Operation timeout; default `30000` |
| `DYSFLOW_ACCESS_BACKEND_PATH` | No | Backend path used by external test tooling/context |

Example:

```powershell
[Environment]::SetEnvironmentVariable('DYSFLOW_HOME', "$env:LOCALAPPDATA\dysflow", 'User')
[Environment]::SetEnvironmentVariable('DYSFLOW_ACCESS_DB_PATH', 'C:\path\Front.accdb', 'User')
[Environment]::SetEnvironmentVariable('DYSFLOW_ACCESS_PASSWORD', '<secret>', 'User')
[Environment]::SetEnvironmentVariable('DYSFLOW_TIMEOUT_MS', '30000', 'User')
```

Then restart the terminal or MCP client so it inherits the variables.

## OpenCode MCP configuration

OpenCode should point to the profile-installed runtime, not to any old skill path.

`C:\Users\<user>\.config\opencode\opencode.json`:

```json
{
  "mcp": {
    "dysflow": {
      "command": [
        "C:/Users/<user>/AppData/Local/dysflow/bin/dysflow.cmd",
        "mcp"
      ],
      "type": "local"
    }
  }
}
```

Verify:

```powershell
opencode mcp list
```

Expected:

```txt
✓ dysflow connected
C:/Users/<user>/AppData/Local/dysflow/bin/dysflow.cmd mcp
```

## MCP tools

Dysflow exposes these MCP tools.

| Tool | Purpose | Typical input |
|---|---|---|
| `dysflow.doctor` | Run Access diagnostics | `{ "includeEnvironment": true }` |
| `dysflow.query.execute` | Execute Access SQL | `{ "sql": "SELECT ...", "mode": "read" }` |
| `dysflow.vba.execute` | Execute a VBA procedure | `{ "moduleName": "...", "procedureName": "...", "arguments": [] }` |
| `dysflow.access.operations.list` | List recent Access operations | `{}` |
| `dysflow.access.cleanup` | Safely cleanup a registered operation | `{ "operationId": "...", "accessPath": "...", "force": true }` |

Legacy-compatible read-only query aliases are also exposed for agents migrating from the previous MCP:

| Tool | Purpose | Typical input |
|---|---|---|
| `query_sql` | Execute a read-only SQL query | `{ "sql": "SELECT ..." }` |
| `list_tables` | List local user tables | `{}` |
| `list_linked_tables` | List linked tables and connection metadata | `{}` |
| `get_schema` | Read fields for a table | `{ "tableName": "Customers" }` |
| `count_rows` | Count rows in a table | `{ "tableName": "Customers" }` |
| `distinct_values` | List distinct values for a column | `{ "tableName": "Customers", "columnName": "Country" }` |
| `compare_backends` | Compare table names with another backend | `{ "backendPath": "C:\\data\\Other.accdb" }` |
| `list_access_files` | Find `.accdb` and `.mdb` files below a root | `{ "rootPath": "C:\\data" }` |
| `get_relationships` | List Access relationships | `{}` |

### `dysflow.doctor`

Checks that Dysflow can resolve configuration and open Access.

Example MCP call:

```json
{
  "name": "dysflow.doctor",
  "arguments": { "includeEnvironment": true }
}
```

Expected result includes checks like:

```json
{
  "checks": [
    { "name": "access-db-path", "ok": true, "message": "configured" },
    { "name": "access-open", "ok": true, "message": "opened" }
  ]
}
```

### `dysflow.query.execute`

Executes SQL through the Access runner.

Read example:

```json
{
  "name": "dysflow.query.execute",
  "arguments": {
    "sql": "SELECT TOP 5 Name FROM MSysObjects WHERE Type=1 AND Flags=0",
    "mode": "read"
  }
}
```

Write example:

```json
{
  "name": "dysflow.query.execute",
  "arguments": {
    "sql": "UPDATE SomeTable SET SomeField = 'value' WHERE ID = 1",
    "mode": "write"
  }
}
```

Use write mode only in controlled tests or approved automations.

### `dysflow.vba.execute`

Runs a public VBA procedure through Access.

```json
{
  "name": "dysflow.vba.execute",
  "arguments": {
    "moduleName": "Automation",
    "procedureName": "Refresh",
    "arguments": [2026]
  }
}
```

The `moduleName` is metadata for callers and operation tracking. The runner invokes the procedure name through Access automation.

### `dysflow.access.operations.list`

Shows recent operations, including completed, failed, timed out, cleanup pending, and PID-unknown records.

```json
{
  "name": "dysflow.access.operations.list",
  "arguments": {}
}
```

Example operation record:

```json
{
  "operationId": "dysflow-...",
  "action": "query",
  "accessPath": "C:\\path\\Front.accdb",
  "accessPid": 12345,
  "processStartTime": "2026-05-15T14:04:56.4567720Z",
  "status": "completed",
  "metadata": { "sql": "SELECT TOP 5 ...", "mode": "read" },
  "commandLine": "\"C:\\Program Files\\Microsoft Office\\Root\\Office16\\MSACCESS.EXE\" -Embedding"
}
```

### `dysflow.access.cleanup`

Cleans up only a process that Dysflow can prove it owns.

```json
{
  "name": "dysflow.access.cleanup",
  "arguments": {
    "operationId": "dysflow-...",
    "accessPath": "C:\\path\\Front.accdb",
    "force": true
  }
}
```

Cleanup refuses when any safety check fails:

| Check | Refusal example |
|---|---|
| Unknown operation | `CLEANUP_OPERATION_NOT_FOUND` |
| Path mismatch | `CLEANUP_ACCESS_PATH_MISMATCH` |
| PID missing | `CLEANUP_PID_UNKNOWN` |
| Process gone | `CLEANUP_PROCESS_NOT_FOUND` |
| Process name mismatch | `CLEANUP_PROCESS_NAME_MISMATCH` |
| Start time mismatch | `CLEANUP_PROCESS_START_TIME_MISMATCH` |
| Command line mismatch | `CLEANUP_COMMAND_LINE_MISMATCH` |
| Unsafe status | `CLEANUP_STATUS_NOT_ELIGIBLE` |

## Local HTTP API

Dysflow can also run a local HTTP server for scripts:

```powershell
dysflow serve --host 127.0.0.1 --port 17321
```

Default bind:

```txt
127.0.0.1:17321
```

Routes:

| Route | Purpose |
|---|---|
| `GET /health` | Health check |
| `GET /diagnostics` | Run diagnostics |
| `POST /query/read` | Read-only SQL |
| `POST /query/write` | Write SQL; disabled unless `--enable-writes` |
| `POST /vba/execute` | VBA execution; disabled unless `--enable-writes` |
| `GET /access/operations` | List operation registry |
| `POST /access/cleanup` | Safe cleanup |

Writes are disabled by default.

## CLI commands

| Command | Purpose |
|---|---|
| `dysflow setup` | Resolve and print redacted configuration |
| `dysflow doctor` | Open Access and run diagnostics |
| `dysflow mcp` | Start MCP stdio server |
| `dysflow serve` | Start local HTTP API |
| `dysflow tui` | Planned TUI placeholder |

## Testing against a real Access front/backend

The E2E checklist lives here:

```txt
docs/testing/mcp-access-e2e.md
```

It covers:

- OpenCode MCP connectivity
- MCP stdio protocol smoke tests
- Access diagnostics
- read query against the front
- backend validation through auxiliary Access query tooling
- operation registry inspection
- PID ownership validation
- cleanup refusal cases
- controlled cleanup of owned PIDs
- Windows PowerShell 5.1 compatibility

## Development

Install dependencies:

```powershell
pnpm install
```

Run tests:

```powershell
pnpm test
```

Build:

```powershell
pnpm build
```

Current test baseline:

```txt
48 passing tests
```

## Safety contract for AI agents

Agents using Dysflow must follow these rules:

1. Use `dysflow.access.operations.list` to discover operations.
2. Use `dysflow.access.cleanup(operationId, accessPath)` for cleanup.
3. Never kill `MSACCESS.EXE` by process name.
4. Never claim cleanup is safe for `pid_unknown` operations.
5. Preserve operation metadata in error reports.
6. Treat write SQL and VBA execution as controlled, explicit operations.

## Project status

Dysflow is now operational as a local MCP runtime for Access automation. The current production target is a Windows user-profile install under `AppData\Local\dysflow`, with OpenCode consuming it through MCP stdio.

Planned next steps:

- harden installer/update workflow
- add richer schemas for MCP tool inputs
- add more Access/VBA domain-specific tools
- expand E2E coverage for project-specific VBA test procedures
