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

## Release milestone

### Dysflow v0.1.0 — Initial Release: MCP Safety Baseline

**Release date:** 2026-05-16  
**Type:** Initial production release (first stable milestone)

#### Highlights

- **Core-safe MCP/CLI runtime** with controlled Access automation lifecycle.
- **Operation-owned cleanup** with strict ownership validation before any process termination.
- **JSON-RPC MCP protocol hardening** with explicit protocol version (`MCP_PROTOCOL_VERSION = 2024-11-05`) and null-id request behavior.
- **Deterministic legacy write safety** (`dryRun`/`apply`) and timeout cancellation path in the legacy write stack.
- **Legacy compatibility surface** preserved for legacy Dysflow MCP tools while routing through new core services.
- **Public docs and maintenance playbooks** for protocol drift and MCP e2e/HTTP usage.

#### Known boundaries in v0.1.0

- HTTP support is implemented for local use-cases with writes disabled by default.
- `dysflow tui` is defined as planned and not yet implemented.
- Windows PowerShell 5.1 and local Access automation are required.

## What Dysflow is (and is not)

### It is

- A local automation runtime for Microsoft Access (`.accdb/.mdb`) focused on **safety and ownership**.
- A **core-first platform** (`src/core`) with thin adapters (`src/adapters`) for MCP stdio and HTTP.
- A replacement path for legacy Dysflow MCP behavior with a compatibility layer for older tool names.

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

`dysflow.access.cleanup`/`cleanup_access_operation` only succeeds when all safety checks pass.

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
- `dryRun`-style safety is preserved in legacy compatibility paths where applicable.

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
pnpm add -g "git+https://github.com/DysTelefonica/dysflow.git#v0.1.0"
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

### Runtime profile install

Recommended production/runtime install remains profile-local on Windows (`%LOCALAPPDATA%\\dysflow`) for MCP tooling.

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

Dysflow resolves configuration in priority order:

1. explicit input (`accessDbPath` / config object)
2. `projectId` / `contextId` registry resolution
3. explicit `projectConfigPath`
4. worktree config files (`.dysflow/project.json` or `dysflow.project.json`)
5. legacy `DYSFLOW_ACCESS_DB_PATH`

### Environment variables

| Variable                                           | Purpose                                                          |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| `DYSFLOW_HOME`                                     | Runtime root (e.g., `C:\Users\\<user>\\AppData\\Local\\dysflow`) |
| `DYSFLOW_ACCESS_DB_PATH`                           | Legacy/global Access DB path                                     |
| `DYSFLOW_PROJECT_ID` / `DYSFLOW_CONTEXT_ID`        | Select project from registry                                     |
| `DYSFLOW_PROJECT_CONFIG_PATH`                      | Direct project config path                                       |
| `DYSFLOW_PROJECTS_REGISTRY_PATH`                   | Custom registry path                                             |
| `DYSFLOW_PROJECT_ROOT`                             | Override resolved project root                                   |
| `DYSFLOW_DESTINATION_ROOT`                         | Base export/import root                                          |
| `DYSFLOW_TIMEOUT_MS`                               | Operation timeout (ms, default 30000)                            |
| `DYSFLOW_ACCESS_PASSWORD` / `DYSFLOW_ACCESS_PWD`   | Access DB password fallback                                      |
| `DYSFLOW_BACKEND_PASSWORD`                         | Backend DB password fallback                                     |
| `DYSFLOW_BACKEND_PATH` / `DYSFLOW_BACKEND_DB_PATH` | Backend DB path                                                  |
| `ACCESS_VBA_PASSWORD`                              | Legacy fallback password env                                     |

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
  "timeoutMs": 120000,
  "passwordEnv": "PROJECTABC_ACCESS_PASSWORD",
  "backendPasswordEnv": "PROJECTABC_BACKEND_PASSWORD"
}
```

`projects.json`:

```json
{
  "projects": {
    "project-abc": "C:\\repos\\ProjectABC\\.dysflow\\project.json"
  }
}
```

---

## MCP (stdlib-style stdio)

The main production entrypoint is:

```powershell
dysflow mcp
```

### Core MCP tools

| Tool                             | Purpose                                            |
| -------------------------------- | -------------------------------------------------- |
| `dysflow.vba.execute`            | Execute a public VBA procedure                     |
| `dysflow.query.execute`          | Execute Access SQL in `read` or `write` mode       |
| `dysflow.doctor`                 | Run diagnostics                                    |
| `dysflow.access.operations.list` | List recent tracked operations                     |
| `dysflow.access.cleanup`         | Validate and cleanup a single owned Access process |

### Compatibility tools (legacy)

Dysflow also exposes a compatibility surface with legacy Dysflow MCP tool names and behaviors:

- `list_access_operations` / `cleanup_access_operation`
- `run_vba`
- `query_sql`
- `exec_sql`, `run_script`, `create_table`, `drop_table`, `seed_fixture`, `teardown_fixture`
- `list_tables`, `get_schema`, `count_rows`, `distinct_values`, `compare_backends`, `get_relationships`, `list_access_files`
- `list_links`, `link_tables`, `relink_tables`, `localize_backend_links`, `unlink_table`
- `export_queries`, `import_queries`, `compact_repair`
- `validate_form_spec`, `generate_form`, `catalog_add_control`, `harvest_form_catalog`
- `list_linked_tables`

Compatibility entries are documented and tracked in `src/adapters/mcp/legacy-parity-registry.ts`.

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

| Command          | Description                                   |
| ---------------- | --------------------------------------------- |
| `dysflow mcp`    | Start MCP stdio adapter                       |
| `dysflow doctor` | Run config + environment diagnostics          |
| `dysflow setup`  | Print resolved config (with redacted secrets) |
| `dysflow serve`  | Start local HTTP API                          |
| `dysflow tui`    | Planned terminal UI                           |

### Common flow

1. Validate config: `dysflow setup` or `dysflow doctor`
2. Start MCP: `dysflow mcp`
3. Run MCP client session (OpenCode, etc.)
4. On automation error/timeouts, inspect `dysflow.access.operations.list`
5. Clean up owned operation explicitly via `dysflow.access.cleanup`

---

## OpenCode MCP config

Point OpenCode to the installed runtime binary, e.g.:

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
- Legacy parity additions are additive by default; implemented and pending tool surface is tracked in `src/adapters/mcp/legacy-parity-registry.ts`.
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
- **Deterministic compatibility layer** for legacy tools
- **TDD-first changes** with strict `pnpm test` / `pnpm build` verification

---

## Relevant docs

- [`CHANGELOG.md`](CHANGELOG.md)
- [`docs/architecture/dysflow-core-and-adapters.md`](docs/architecture/dysflow-core-and-adapters.md)
- [`docs/api/http-api.md`](docs/api/http-api.md)
- [`docs/testing/mcp-access-e2e.md`](docs/testing/mcp-access-e2e.md)
- [`docs/testing/mcp-protocol-maintenance.md`](docs/testing/mcp-protocol-maintenance.md)
