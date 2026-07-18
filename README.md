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

**88 visible MCP tools · Windows / Node 20+**

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
- A platform with 88 visible MCP tools covering VBA, SQL, schema, form
  operations, AI-assisted form UI workflows, source-level VBA procedure
  introspection, dead-code detection, VBA test manifest validation, pre-import
  module linting, geometric form layout rendering (`render_form_preview`),
  before/after form layout diff (`diff_form_preview`),
  form-binding validation against a database schema (`verify_form_bindings`),
  batch geometry ergonomics (`form_align_controls`, `form_distribute_controls`),
  atomic batch property updates (`form_set_properties`),
  control cloning (`form_duplicate_control`),
  read-only geometry + control inventory (`form_get_geometry`, `form_list_controls`),
  and project-config resolution.

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

`cleanup_access_operation`/`cleanup_access_operation` only succeeds when all safety checks pass.
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

#### 3a) Risk-based write execution policy (v2.1.0, issue #779)

For routine local development, the blanket `dryRun: true` default on every write-class tool is friction in the wrong place: the `import_modules → test_vba → verify_code` loop should not require `dryRun:false` boilerplate. Operators can opt into a developer mode that flips the dry-run default for routine dev tools, while **keeping hard protection** on destructive, arbitrary, and process-control operations.

Configure the policy in `.dysflow/project.json`:

```json
{
  "capabilities": {
    "writeExecutionPolicy": "developer"
  }
}
```

Supported modes:

- `"safe-by-default"` (default) — every write-class tool defaults to `dryRun: true`. The historical contract; explicit `dryRun: false` or `apply: true` commits.
- `"developer"` — routine dev tools (`import_modules`, `test_vba`, `link_tables`, `generate_form`, `catalog_add_control`, etc.) execute by default. Destructive / arbitrary / process-control operations still require explicit confirmation.

Inspect the active policy and per-tool effective defaults via `get_capabilities`:

```text
writeExecutionPolicy: "developer"
effectiveDryRunDefault: {
  import_modules:   false,    // routine-dev-write — flipped to false in developer mode
  test_vba:        false,    // routine-dev-write — allowedProcedures gate is still authoritative
  export_modules:   true,     // destructive-write — always plan unless explicit
  delete_module:    true,     // destructive-write — always plan unless explicit
  query_execute:    true,     // arbitrary-write — always plan unless explicit
  // ... etc.
}
```

Risk classification (v2.1.0):

- `read-only` — never writes (e.g. `verify_code`, `list_procedures`, `find_references`).
- `routine-dev-write` — flips in developer mode (e.g. `import_modules`, `test_vba`, `link_tables`, `generate_form`).
- `protected-write` — always requires explicit apply (e.g. `fix_encoding`, `compact_repair`, `relink_directory`).
- `destructive-write` — always requires explicit apply; export tools also require `confirmOverwriteSource: true` when the destination overlaps the active source root (see §3b below).
- `arbitrary-write` — always requires explicit apply (e.g. `exec_sql`, `run_script`, `query_execute`).
- `process-control` — alias layer (`cleanup_access_operation`, `access_force_cleanup_orphaned`); per-call gating decides.

The write-gate (`writesProcess.enabled`, `writesProject.allowWrites`, `allowedProcedures`) is **authoritative** — the new policy does NOT bypass any existing gate. In particular:

- A project with `allowWrites: false` still blocks every write, regardless of policy.
- A `test_vba` / `run_vba` call without the procedure in `allowedProcedures` is still rejected with `MCP_ALLOWLIST_NOT_CONFIGURED` or `MCP_PROCEDURE_NOT_ALLOWED`.

#### 3b) Export-source guard (v2.1.0, issue #779)

Exporting the binary source tree (`export_modules`, `export_all`) is destructive — if the destination overlaps the active source root, the export silently overwrites the developer's working tree. The export-source guard replaces the blanket `dryRun: true` posture with a context-specific confirmation:

- If the export destination is **outside** the active source root / managed source tree, developer mode may execute directly (subject to the existing write-gate).
- If the export destination **overlaps** the active source root or any managed subfolder (`modules/`, `classes/`, `forms/`, `reports/`), the operator must pass `confirmOverwriteSource: true` explicitly. Case-insensitive on Windows; nested paths count as overlap.

Missing confirmation returns a structured, actionable error:

```text
EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION
  resolved export destination: C:\repo\src\forms\Form_Main.form.txt
  active source root:          C:\repo\src
  reason:                       destination is inside the managed source tree;
                                 export would silently overwrite the developer's
                                 working copy.
  remediation:                  pass `confirmOverwriteSource: true` or choose a
                                 separate export path.
```

The check is implemented in `src/core/utils/path-overlap.ts` (`pathOverlapsSourceRoot`); see `test/core/utils/path-overlap.test.ts` for the truth table (exact match, nested managed folder, external path, Windows case-insensitive).

**Runtime enforcement live in v2.1.1** (issue #785). v2.1.0 shipped the surface — `get_capabilities.effectiveDryRunDefault` and the `(mode, risk)` truth table — but the dispatch layer did not yet consult the resolved policy. v2.1.1 wires `writeExecutionPolicy` from `createDysflowMcpTools` through `registerMcpTools` and `createDispatchTool`, and the new helper `resolveEffectiveDryRunInput(name, mode, input)` runs at the dispatch boundary. With `capabilities.writeExecutionPolicy: "developer"` set, `import_modules` and `test_vba` now reach the runner without explicit flags; `safe-by-default` projects keep the historical `dryRun: true` default byte-for-byte. The v2.1.0 promise of `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` is finally live: in developer mode, `export_modules` / `export_all` whose destination overlaps the active source root is refused at the dispatch seam with the structured envelope shown above; `confirmOverwriteSource: true` bypasses the guard. The hard gates (`allowWrites`, `allowedProcedures`, explicit `dryRun`/`apply`) continue to win — explicit caller intent always wins over the policy default. See `openspec/changes/wire-write-policy-runtime-785/` for the full SDD change.

### 4) VBA procedure allowlist

Set `allowedProcedures` in `.dysflow/project.json` to restrict which VBA procedures can be called. This enforcement applies to all three execution entry points:

- MCP `run_vba`
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
   list_access_operations { "projectId": "my-access-project" }
   ```

   Alias:

   ```text
   list_access_operations { "projectId": "my-access-project" }
   ```

2. Cleanup a specific operation id returned by the list call:

   ```text
   cleanup_access_operation {
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
doctor { "projectId": "00-no-conformidades-staging-clean" }
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

#### `capabilities` consolidated block (preferred — v1.14.0+)

The `capabilities` block is the **canonical home** for the write gate and the procedure allowlist/denylist. The top-level `allowWrites` and `allowedProcedures` fields above are kept as **deprecated read-through aliases** and emit a single warning when both forms are present in the same file. Removal of the aliases is scheduled for **v1.15.0**.

```json
{
  "id": "project-abc",
  "accessPath": "src/ProjectABC.accdb",
  "capabilities": {
    "allowWrites": false,
    "procedures": {
      "allow": ["Refresh", "ExportReport", "RunMigration"]
    }
  }
}
```

The four-case precedence (`top-level × capabilities`):

| Top-level fields | `capabilities` block | Effective `allowWrites` | Effective `allowedProcedures` | Warning |
|------------------|-----------------------|-------------------------|------------------------------|---------|
| none             | none                  | `false` (default)       | `undefined`                  | none    |
| present          | absent                | top-level               | top-level                    | none    |
| absent           | present               | `capabilities`          | `capabilities.procedures.allow` | none |
| present          | present               | `capabilities`          | `capabilities.procedures.allow` | 1     |

`procedures.deny` is reserved for a future advisory signal — the runtime allowlist stays `procedures.allow` only. See [`docs/security/adapter-write-gates.md`](./docs/security/adapter-write-gates.md) for the full write-gate contract.

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

`operations.json` is created when MCP launches Access operations. Completed and cleaned operations are purged; failed or timed-out operations remain so `cleanup_access_operation` can validate `operationId`, `accessPath`, PID, process start time, and command line before killing a stuck `MSACCESS.EXE` process.

---

## MCP (stdlib-style stdio)

The main production entrypoint is:

```powershell
dysflow mcp
```

**Write tools are enabled by default on MCP stdio.** The stdio adapter is process-ownership-trusted (the parent process is the operator), so bare `dysflow mcp` starts with writes on — unlike `dysflow serve` (HTTP), which stays writes-disabled by default because it is a network surface. This covers every write-capable tool — `delete_module`, `import_modules`/`import_all`, write-mode SQL, cleanup with `force: true`, `vba_inline_execution`, and so on. Calling one while writes are off returns `MCP_WRITES_DISABLED`. There are two ways to run read-only or to scope writes per repo:

**Option 1 — per-repo.** Set `"allowWrites": false` in the repo's `.dysflow/project.json` to keep a specific project read-only even when the MCP process default is enabled:

```json
{
  "accessDbPath": "path/to/database.accdb",
  "allowWrites": false
}
```

**Option 2 — process-wide.** Start MCP with `--disable-writes` to run the whole session read-only, regardless of per-repo settings:

```powershell
dysflow mcp --disable-writes
```

`--enable-writes` is still accepted as a no-op (writes are already enabled by default); passing both `--enable-writes` and `--disable-writes` together is rejected with a usage error.

`dryRun` operations remain allowed in all modes regardless of either setting.

### Common Input Parameters

Many MCP tools share common context and override parameters:
* **Context / Identity**:
  - `projectId` (string, optional): Canonical project identity for traceability. Best matched to the Engram project name when available.
  - `contextId` (string, optional): Optional run/context id for distinct executions.
* **Access Database Path Overrides**:
  - `accessPath` / `databasePath` / `sourcePath` (string, optional): Paths to the frontend Access database. Overrides `.dysflow/project.json` settings.
  - `backendPath` / `comparePath` (string, optional): Paths to the backend database.
  - `target` selects a semantic database role for project-aware DAO tools. Database-wide reads (`query_sql`, `list_tables`, `get_relationships`) accept `frontend | backend`; table-aware reads (`get_schema`, `count_rows`, `distinct_values`) also accept `auto`, which probes both configured databases by `tableName` and rejects missing or ambiguous matches. Frontend-only linked-table and QueryDef tools accept only `frontend` and default to the configured `accessPath`. Explicit `databasePath` / `sourcePath` overrides the role for general reads. Unresolvable roles surface as `CONFIG_MISSING_TARGET_PATH` before execution.
* **Workspace Overrides**:
  - `destinationRoot` (string, optional): Directory for VBA module source exports (usually `src`).
  - `projectRoot` (string, optional): Root directory of the repository/worktree.
* **Operation Safeguards**:
  - `timeoutMs` (number, optional): Operation timeout override in milliseconds.
  - `dryRun` (boolean, optional): Evaluate operations (like writes or imports) without applying changes.
  - `apply` (boolean, optional): Explicitly apply write actions (mutually exclusive with `dryRun` mode).

---

### Core MCP Tools

#### `run_vba`
Execute a public VBA procedure via COM automation. Enforces `allowedProcedures` when configured.
* **Parameters**:
  - `procedureName` (string, **required**): Public VBA procedure name to execute.
  - `moduleName` (string, optional): Target module containing the procedure.
  - `arguments` (array, optional): Positional arguments passed to the procedure.
  - `projectId`, `contextId` (optional)
  - `accessPath`, `backendPath`, `destinationRoot`, `projectRoot`, `timeoutMs` (optional overrides)

#### `query_execute`
Run arbitrary SQL statements. Writes are guarded by the write-safety model.
* **Parameters**:
  - `sql` (string, **required**): SQL query to run.
  - `mode` (string, **required**): Execution mode (`read` or `write`).
  - `projectId`, `contextId` (optional)

#### `doctor`
Run diagnostics on the MCP connection, Access installation, and configuration.
* **Parameters**:
  - `includeEnvironment` (boolean, optional): True to query environment settings and logs.
  - `projectId`, `contextId` (optional)
  - `accessPath`, `backendPath`, `destinationRoot`, `projectRoot`, `timeoutMs` (optional overrides)

#### `list_access_operations`
Retrieve active and completed Access operation handles managed by Dysflow.
* **Parameters**: None.

#### `cleanup_access_operation`
Safely terminate stuck or left-over `MSACCESS.EXE` processes owned by Dysflow.
* **Parameters**:
  - `operationId` (string, **required**): Handle ID of the operation to clean.
  - `accessPath` (string, **required**): Database file path associated with the target operation.
  - `force` (boolean, optional): Terminate immediately. Requires writes to be enabled (`MCP_WRITES_DISABLED` is returned when writes are off); non-force cleanup is always allowed.

#### `access_force_cleanup_orphaned`
List orphaned headless `MSACCESS.EXE` processes holding the project's `accessPath`, or kill exactly one verified orphan only when `confirmPid` is explicitly provided.
* **Parameters**:
  - `projectId` / `accessPath` (optional): Resolve the frontend database whose lock holders should be inspected.
  - `confirmPid` (number, optional): When omitted, the tool lists candidates only. When provided, killing is write-gated and still refuses non-headless, wrong-path, or Dysflow-owned processes.

#### `get_capabilities`
Return the aggregated capabilities snapshot for the live Dysflow MCP adapter. Read-only — does not open Access, does not spawn PowerShell, does not mutate state. The snapshot surfaces the running adapter version, MCP surface, process- and project-level write flags, projectId resolution outcome, the `allowedProcedures` allowlist, the global `dryRun` default, the count of tools visible in `tools/list`, and the list of write-class tools currently permitted.
* **Parameters**: none. The tool accepts an empty `{}` body and returns a structured JSON snapshot.

#### `list_procedures`
List VBA procedures in a source module without opening Access. The tool parses inline `source` when supplied, otherwise it resolves `module` from the configured source root (`modules/`, `classes/`, `forms/`, or `reports/`). Read-only.
* **Parameters**:
  - `module` (string, **required**): VBA module name without extension.
  - `filter` (string, optional): Substring filter for procedure names.
  - `kind` (string, optional): `Sub`, `Function`, `Property`, or `both`.
  - `source` (string, optional): Inline VBA source text.
  - `projectId`, `contextId`, `destinationRoot`, `projectRoot` (optional context/overrides)

#### `get_procedure`
Retrieve one VBA procedure body from a source module without opening Access. The tool parses inline `source` when supplied, otherwise it resolves `module` from the configured source root. Read-only.
* **Parameters**:
  - `module` (string, **required**): VBA module name without extension.
  - `procedure` (string, **required**): Procedure name to retrieve.
  - `source` (string, optional): Inline VBA source text.
  - `projectId`, `contextId`, `destinationRoot`, `projectRoot` (optional context/overrides)

#### `find_references`
Find all references to a given symbol across a set of modules. The tool parses inline `modules` when supplied, otherwise it resolves modules from the configured source root and/or exports them from the binary. Read-only.
* **Parameters**:
  - `symbol` (string, **required**): Symbol name to find references for.
  - `scope` (string, optional): `module`, `binary`, `source`, or `all` (default).
  - `module` (string, optional): Search only in this specific module.
  - `modules` (object, optional): Key-value pair of module names to their inline VBA source code.
  - `projectId`, `contextId`, `destinationRoot`, `projectRoot` (optional context/overrides)

#### `detect_dead_code`
Find VBA procedures and module-level declarations defined but never referenced. Pure string-in / string-out analysis over the supplied `modules` map — never opens Access, never spawns PowerShell, never mutates the filesystem. Read-only.
* **Parameters**:
  - `scope` (string, **required**): `binary`, `source`, or `module`. Echoed back on the report for caller introspection.
  - `modules` (object, optional): Key-value pair of module names to their inline VBA source code. When omitted, the tool resolves modules from the configured source root.
  - `module` (string, optional): Module-name constraint; restricts the analysis to a single module and elevates risk for surviving private-procedure findings.
  - `projectId`, `contextId`, `destinationRoot`, `projectRoot` (optional context/overrides)

#### `validate_manifest`
Validate a VBA test manifest before running `test_vba`. The tool parses an inline `manifest` or reads `testsPath`/`path`, resolves VBA source modules from the configured source root unless inline `modules` are supplied, and returns `valid`, separate `errors`/`warnings`, and a `summary`. Read-only.
* **Parameters**:
  - `testsPath` / `path` (string, optional): VBA test manifest path. Relative paths resolve against the project root.
  - `manifest` (object or array, optional): Inline test manifest object with a `tests` array, or an array of test entries.
  - `modules` (object, optional): Key-value pair of module names to inline VBA source code.
  - `projectId`, `contextId`, `destinationRoot`, `projectRoot` (optional context/overrides)

#### `lint_module`
Lint one `.bas`/`.cls` VBA module before importing it into Access. The tool parses inline `source` when supplied, otherwise it resolves `module` from the configured source root (`modules/`, `classes/`, `forms/`, or `reports/`). It never opens Access, never spawns PowerShell, and never mutates files. Read-only.
* **Parameters**:
  - `module` (string, **required**): VBA module name without extension.
  - `source` (string, optional): Inline VBA source text.
  - `rules` (array, optional): Filter to any of `option-declaration`, `identifier-safety`, `declaration-order`, `arg-type-match`, `forbidden-name` (F22 — flags identifiers that shadow VBA / Access / DAO globals).
  - `projectId`, `contextId`, `destinationRoot`, `projectRoot` (optional context/overrides)
* **Returns**: `{ module, rules, isClean, diagnostics, flatDiagnostics, summary }`, where `diagnostics` groups findings by rule name, `flatDiagnostics` is a flat array for backward compatibility, and `summary` counts `errors` and `warnings`.

#### `resolve_project`
Read `.dysflow/project.json` from the supplied `cwd` and return a structured diagnosis of how a hypothetical `projectId` would resolve. Companion to `get_capabilities`: the snapshot tool reports the `projectId` captured at factory construction; this tool re-checks the `project.json` on disk. Read-only — does not open Access, does not spawn PowerShell, does not mutate state.
* **Parameters**:
  - `projectId` (string, optional): The projectId to test for an explicit match.
  - `cwd` (string, optional): Working directory to resolve from. Defaults to the current working directory.
* **Returns**: `{ projectId, outcome, reason, accessPath, projectRoot, sourceRoot }`, where `outcome` is `resolved` or `unresolved`, and `reason` is one of: `explicit id match`, `single project config found`, `project.json not found`, `id mismatch`, `unknown`.

#### `clean_stale_markers`
Sweep `<projectRoot>/.dysflow/runtime/markers/` and either plan or apply transitions of stale `status: "running"` markers (and, when `keepFailed` is false, stale `status: "failed"` markers) to `status: "abandoned"`. User-callable companion to the #967 auto-cleanup. Safe-by-default: dry-run is the default; any apply call requires `options.confirm: true` AND writes enabled (returns `MCP_WRITES_DISABLED` when writes are off).
* **Parameters**:
  - `projectId` (optional): Trace identity; `accessPath` resolves from `.dysflow/project.json` when omitted.
  - `options.olderThanMinutes` (number, optional, default `30`): Stale cutoff in minutes. Markers with `updatedAt` older than this are reap candidates.
  - `options.dryRun` (boolean, optional, default `true`): When true (default), return the plan without writing. When false, perform real transitions (requires `confirm: true`).
  - `options.keepFailed` (boolean, optional, default `true`): When true, markers from failed operations are NEVER transitioned regardless of age. Set false to also reap stale failed markers.
  - `options.confirm` (boolean, optional): Required for any non-dry-run call. Literal `true` is the only acceptable value; omitting it or passing false leaves the tool in dry-run mode.
* **Returns**: `{ ok, scanned, removed, kept, removedMarkerIds, keptMarkerIds, errors }`. `scanned` counts every `*.json` file inspected; `removed` + `kept` partition successful decisions; `errors[]` carries per-file failures that did not abort the sweep.

#### `schema`
Return the runtime contract for every tool in the consumer's dysflow installation: parameters (typed + required + description + enumValues + default), returns (JSON Schema fragment), errorCodes (with recoverable flag), crossReferences (issue numbers), requiredCapabilities, safeByDefault. Read-only — never opens Access, never spawns PowerShell, never mutates state. Pairs with `get_capabilities` (which reports live state) and `diagnose` (which surfaces diagnostic verdicts): `schema` reports the static contract every other tool advertises.
* **Parameters**:
  - `projectId` (string, optional): Reserved for a future per-project scoping extension. The current catalog is global.
  - `toolName` (string, optional): Optional tool name to filter the catalog to a single entry. Omit for the full catalog.
* **Returns**: `{ projectId, tools: [{ name, description, parameters, returns, errorCodes, crossReferences, requiredCapabilities, safeByDefault }] }`.

#### `diagnose`
Return aggregated project health (`projectConfig` + `filesystem` + `runtime`) in a single call. Replaces the 4-5 round-trip pattern (`get_capabilities` + `resolve_project` + `list_access_operations` + `access_force_cleanup_orphaned` listing + filesystem stat). Read-only — does not open Access, does not spawn PowerShell, does not mutate state. Pairs with `get_capabilities` (live adapter state) and `schema` (static contract): `diagnose` surfaces the unified "is this project healthy?" verdict every consumer wants.
* **Parameters**:
  - `projectId` (string, optional): ProjectId to verify against `.dysflow/project.json`. Mirrors `resolve_project` semantics.
  - `accessPath` (string, optional): Explicit Access target override. Reserved for v2.16.x.
  - `contextId` (string, optional): Reserved for a future per-context scoping extension (#966 follow-up).
  - `verbose` (boolean, optional): Reserved for v2.16.x — currently always reports the default stale-marker threshold (5 minutes).
* **Returns**: `{ projectConfig: { status, projectId, writeReady, diagnostics[], owningWorktree }, filesystem: { accessPath, backendPath, destinationRoot, projectRoot }, runtime: { staleMarkers, activeOps, orphans, dysflowVersion, writeExecutionPolicy } }`. Each `filesystem.X` block carries `{ path, exists, hint? }` so the consumer can detect missing-directory footguns (the `destinationRoot.hint` includes the `git rm -r` remediation).

#### `state`
Return the runtime operational state of a dysflow project as `{ operations, markers, locks, counters }`. `operations` lists every persisted record from the access operation registry (cross-ref `list_access_operations`) normalized to `{ operationId, tool, status, startedAt, updatedAt, metadata }`. `markers` enumerates `<cwd>/.dysflow/runtime/markers/*.json` with `ageMinutes` computed against the wall clock. `counters` reports `totalOperations` plus `succeededLast24h` / `failedLast24h` / `abandonedLast24h` slices over the registry's persisted records. `locks` is reserved for a future lock-registry split (#967 follow-up); today it is an empty array. Read-only — never opens Access, never spawns PowerShell, never mutates state. Pairs with `resolve_project` (config), `diagnose` (current health), and `logs` (event timeline): `state` is the structured complement that answers "what is happening right now?".
* **Parameters**:
  - `projectId` (string, optional): Reserved for a future per-project scoping extension. The current snapshot is global.
* **Returns**: `{ operations, markers, locks, counters }`. Each `operations[]` entry carries `operationId`, `tool` (= action), `status`, `startedAt`, `updatedAt`, and `metadata`. Each `markers[]` entry carries `operationId`, `action`, `status`, `updatedAt`, and `ageMinutes`. `counters.totalOperations` is the registry's full cardinality; `*Last24h` slices the registry's persisted records (terminal `completed` / `cleaned` records are ephemeral by design — see `logs` for the full audit trail).

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
  - Parameters: `moduleNames` (array, optional), `importMode` (string, optional), `dryRun` (boolean, optional), `timeoutMs` (number, optional), `strictContext` (boolean, optional)
* **`import_all`**: Bulk import all local modules into the Access project.
  - Parameters: `importMode` (string, optional), `dryRun` (boolean, optional), `timeoutMs` (number, optional), `strictContext` (boolean, optional)
* **`fix_encoding`**: Normalize leading UTF-8 BOM artifacts in source files and round-trip affected module encoding in the binary. It does not restore lossy mojibake characters.
  - Parameters: `location` (string, optional), `timeoutMs` (number, optional)
* **`test_vba`**: Execute VBA unit tests.
  - Parameters: `proceduresJson` (string, optional), `filter` (string, optional), `testsPath` (string, optional), `timeoutMs` (number, optional)
  - `proceduresJson` is a JSON-encoded **string** that parses to an array of tests (or an object with a `tests` array). Each test is either a procedure-name string — shorthand for no args — or an object `{ "procedure": "Test_Name", "args": [...], "tags": [...] }` (`proc` is accepted as an alias for `procedure`). Both forms are equivalent: `"[\"Test_A\",\"Test_B\"]"` and `"[{\"procedure\":\"Test_A\",\"args\":[\"fixture\",1]}]"`. The same shapes apply to a `testsPath` manifest file.
  - On failure the result is `ok: false` with code `VBA_TESTS_FAILED`. The message names the failing procedures, and `error.details` carries the structured per-procedure report: `{ failedCount, failures[], results[] }`, where each failure keeps `procedure`, `error`, `logs`, `durationMs`, and `payload`.
  - Limitation: when a single procedure is an aggregate entry point (e.g. a VBA `RunAll`), Dysflow can only identify the inner failures if `RunAll` itself returns them in its JSON payload (`ok: false` plus `error`/`logs`). Dysflow does not parse VBA assertion output on its own.
* **`validate_manifest`**: Pre-validate a VBA test manifest before `test_vba`.
  - Parameters: `testsPath`/`path` (string, optional), `manifest` (object or array, optional), `modules` (object, optional), `destinationRoot`/`projectRoot` (optional)
  - Relative `testsPath` values resolve from the project root, matching `test_vba` manifest resolution.
  - Returns a validation report with `valid`, separate `errors` and `warnings` arrays, and a `summary` containing test and diagnostic counts.
* **`lint_module`**: Lint a `.bas`/`.cls` source module before import.
  - Parameters: `module` (string, required), `source` (string, optional), `rules` (array, optional), `destinationRoot`/`projectRoot` (optional)
  - Rules: `option-declaration`, `identifier-safety`, `declaration-order`, `arg-type-match` (same-module signatures only; detects clear literal-argument / declared-type mismatches only; no cross-module type inference or variable-flow analysis), and `forbidden-name` (F22 — flags identifiers that shadow VBA / Access / DAO / Scripting globals such as `Err`, `Date`, `Name`, `Form`, `DoCmd` — case-insensitive — on `Dim` / `Const` / `Type` / `Enum` / `Sub` / `Function` / `Property` / parameter declarations, with a project-convention recommendation like `errMsg` / `fechaAlta` / `db` / `rs` / `qdf`).
  - Returns `{ module, rules, isClean, diagnostics, flatDiagnostics, summary }` — diagnostics grouped by rule name, flatDiagnostics for backward compatibility, `isClean` true when no findings, and `summary` with error/warning counts.
* **`verify_code`**: The single dry-run tool that compares exported VBA/Form source against the disk tree. It NEVER mutates Access. One tool covers every comparison scope:
  - **Whole project** — omit `moduleNames`.
  - **A subset or a single module** — pass `moduleNames`. The filter is sent to the export phase, so the Access export targets only the requested modules (plus their normal form/report/code-behind artifacts), then the disk comparison is filtered to the same module names. It is not a broad whole-project export followed only by a filtered compare. If `moduleNames` is explicitly provided as an empty list, the request is rejected with `INVALID_INPUT`; omit `moduleNames` for a whole-project verify. If a non-empty `moduleNames` filter matches nothing in either side, it returns `MODULE_NOT_FOUND`.

  By default it classifies each differing module semantically (see [Semantic diff classification](#semantic-diff-classification)) — separating non-functional noise (line endings/whitespace, `Attribute VB_*` headers, `.form.txt` serialization metadata, encoding/mojibake) from actionable functional differences. It reports a per-category `summary`, structured counts in `summaryStructured`, `actionableDifferent`/`nonActionableDifferent` lists, `bulkImportable[]`/`bulkExportable[]` module lists for direct sync planning, a `hasFunctionalDifferences` / `actionableOk` signal, per-diff `classification`/`reason`/`recommendation`, and an aggregated, whole-comparison `recommendation` plus a machine `recommendedAction` (`no_action`, `import_to_binary`, `export_to_src`, or `manual_merge`) so a consumer reads the sync direction in one shot. Backward-compatible: still reports `matched`, `different`, and missing modules with optional diffs.
  - Parameters: `moduleNames` (array, optional), `diff` (boolean, optional), `strict` (boolean, optional — restore byte/text-exact comparison), `timeoutMs` (number, optional), `strictContext` (boolean, optional)
  - Timeout contract: `timeoutMs` is the overall operation budget. `verify_code` keeps a small reserve before that deadline so preflight/export/compare stalls fail with a typed Dysflow error instead of falling through to the outer MCP request timeout. Export stalls return `VBA_MANAGER_TIMEOUT`; preflight and compare stalls return `VERIFY_CODE_PHASE_TIMEOUT`. All typed errors include `error.details` with `tool: "verify_code"`, `phase`, `moduleName`/`moduleNames`, `operationTimeoutMs`, and `phaseTimeoutMs`. Export-phase errors additionally carry `error.details.durationMs` (how long PowerShell had been running before the stall). Post-timeout Access orphan cleanup and temporary-directory cleanup are each bounded; if either exceeds its bound, the result returns promptly with a warning diagnostic instead of waiting indefinitely, and an export-phase stall where post-timeout cleanup also stalled additionally sets `error.details.cleanupTimedOut: true` and `error.details.cleanupTimeoutMs` so consumers can distinguish "the export stalled" from "the export stalled AND we could not reap the orphan within the bound".

  > **Migration note:** `verify_binary`, `reconcile_binary`, and `compare_module` were four names over this one engine and have been **removed**. Use `verify_code` for all of them: omit `moduleNames` for the whole project (old `verify_binary`), pass a single module for the old `compare_module`, and read `recommendation`/`recommendedAction` for the old `reconcile_binary` plan.
* **`delete_module`**: Delete one or more modules from the VBA project. Pass `moduleNames` (array) to delete a batch in a single Access session — this avoids the COM collisions that arise from issuing many parallel single-module calls; `moduleName` (singular) is still accepted for one module. The result reports per-module outcomes. When deletion fails with the corruption HRESULT `0x800ADEB9`, pass `force: true` to attempt a fallback (compact + retry / `DoCmd.DeleteObject`); otherwise the error returns bilingual remediation steps (see [`docs/diagnostics/hresult-guide.md`](./docs/diagnostics/hresult-guide.md)). Write-gated.

Typed error envelopes expose a top-level `error.remediation` when the runtime has a canonical next
action. This field is independent of `get_capabilities.projectConfig.remediation`, whose existing
diagnostic contract is unchanged. See the shipped [`references/error-codes.md`](./references/error-codes.md)
for the canonical catalog.
  - Parameters: `moduleNames` (array, optional), `moduleName` (string, optional — single-module shorthand), `force` (boolean, optional — applies to the whole batch), `timeoutMs` (number, optional)
* **`list_objects`**: List all forms, reports, modules, and macros.
  - Parameters: `filter` (string, optional), `timeoutMs` (number, optional)
* **`list_vba_modules`** (issue #807 Feature 1): Enumerate every VBA project component with a binary-vs-source cross-reference. The runner walks `VBProject.VBComponents` once and releases every COM reference in `finally { FinalReleaseComObject }`; the TS side walks the source tree once to pair each binary row with its on-disk counterpart. The result is `{modules: [{name, type, fileType, sourcePath, binaryPath, sourceExists, binaryExists, contentMatch?}], summary: {total, inBinaryOnly, inSourceOnly, inBoth}}`. Read-only. Filters: `typeFilter` (one of `standard`, `class`, `form`, `report`, `document`), `namePattern` (single `*` wildcard at either end — `Test_*` matches any prefix, `*Issue*` matches any substring).
  - Parameters: `typeFilter` (string, optional), `namePattern` (string, optional), `timeoutMs` (number, optional)
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
* **`vba_inline_execution`**: Run a throwaway VBA procedure-body snippet in one call — writes a temporary module, imports it, executes its public entry point, and cleans up both the binary component and temp file. Return values are explicit: write `result = "OK"`; the adapter result contains `data.returnValue`, while MCP carries `{ "returnValue": "OK" }` in `content[0].text` as JSON. A final bare literal such as `"OK"` is not an implicit return (it is invalid VBA) and is rejected before any import. Write-gated.
  - Parameters: `code` (string, required), `timeoutMs` (number, optional)

#### Semantic diff classification

`verify_code` compares exported VBA/Form source against the disk tree. By default it runs in **semantic mode**: each differing module is classified so that non-functional noise does not drown out the changes that actually need action. This avoids the common false-positive flood where dozens of modules report as "different" but only a handful require any work.

Each differing module is assigned one `classification`:

| Category | Meaning | Actionable |
| --- | --- | --- |
| `matched` | No functional difference | No |
| `whitespaceOnly` | Only line endings (CRLF/LF), trailing whitespace, trailing blank lines, or trivial indentation | No |
| `attributeOnly` | Only module/class header boilerplate differs — `Attribute VB_*` lines (in code modules and a form's embedded `CodeBehindForm`) or the `VERSION x.x CLASS` + `BEGIN…END` instancing block that an Access export may emit on one side only. `VB_Name` is functional whenever the two sides disagree — a real rename (both name it, values differ) OR one side omitting it entirely (a dropped-identity import defect, #646); non-functional only when both sides carry the same name or both omit it | No |
| `caseOnly` | Only identifier/keyword casing differs (`Me.Name` vs `Me.name`). VBA is case-insensitive and the VBE re-cases identifiers project-wide on import. String-literal and comment bodies are compared **case-sensitively**, so a runtime-visible text change is NOT absorbed here | No |
| `formSerializationOnly` | Only `.form.txt` serialization metadata differs (`Checksum`, `PrtDevMode*`, `PrtDevNames*`, `PrtMip`, `RecSrcDt`, `LayoutCached*`, `PublishOption`, `NoSaveCTIWhenDisabled`), **or** a toggle property uses an equivalent serialization (`Visible =0` ≡ `Visible = NotDefault`). Access only writes a property when it differs from its default, so a written toggle value is always the same non-default — only the `NotDefault`/`0`/`-1` representation varies. A real change shows up as a line being present vs absent, which stays functional | No |
| `encodingOnly` | Difference disappears after normalizing encoding/mojibake artifacts — a leading BOM or its mojibake remnant (`?Attribute VB_Name…`, U+FEFF, U+FFFD) on one side only, or lossy out-of-codepage glyphs that Access export replaced with `?` (e.g. `►` → `?`). Lossy/case normalization is applied **outside string literals only**, so a glyph or casing change inside a quoted string stays functional | No |
| `sourceNewer` | Functional lines unique to disk source | Yes → `import_to_binary` |
| `binaryNewer` | Functional lines unique to the Access binary | Yes → `export_to_src` |
| `bothChanged` | Both sides have unique functional lines | Yes → `manual_merge` |

A form's **code-behind is verified through its `forms/*.cls`, not its `.form.txt`.** The code lives canonically in the `.cls` (dysflow's export writes it from `CodeModule.Lines`, and import syncs it back into the document module); the same code is also serialized — via `SaveAsText` — into the `.form.txt` `CodeBehindForm` section. The classifier strips everything from the `CodeBehindForm` marker onward and compares a `.form.txt` for its **UI/layout only**, so a real form change (control/property/layout) stays actionable while code-behind churn in the `.form.txt` is non-actionable (the `.cls` owns it). Casing and encoding normalization never collapse a genuine content change: identifier casing is folded only outside string literals/comments, so any runtime-visible difference still surfaces as functional.

The result adds a flat `summary` (count per category), `summaryStructured` (nested actionable/non-actionable counts), `actionableDifferent` / `nonActionableDifferent` lists, `bulkImportable[]` and `bulkExportable[]` module-name lists, and a `hasFunctionalDifferences` / `actionableOk` signal so an automated consumer can decide what to act on without re-exporting and diffing the binary by hand. Agents should build sync calls from the bulk lists (`bulkImportable` → `import_modules.moduleNames`, `bulkExportable` → `export_modules.moduleNames`) instead of parsing raw `different[]`; reserve `manual_merge` / `bothChanged` entries for human conflict resolution. It also carries `dysflowVersion` (the runtime package version that produced the result) and `classifierRules` (a fingerprint of the active rule set) so a consumer can tell *which* version classified a diff — distinguishing "fix not loaded into the running MCP" from "fix loaded but does not cover this case". When `diff: true`, each per-module entry in both `actionableDifferent[]` and `nonActionableDifferent[]` carries `classification`, `reason`, `isActionable`, `recommendedAction` (mirrors `recommendation`), and the unique-line counts. Pass `strict: true` to disable classification and fall back to byte/text-exact comparison.

#### 2. SQL Maintenance
* **`query_sql`**: Read-only SQL query execution.
  - Parameters: `sql` (string, optional), `query` (string, optional), `projectId`, `contextId`, `accessPath`, `databasePath`, `sourcePath`, `target` (`frontend | backend`)
  - Resolution priority: an explicit `accessPath` is executed as the query database; otherwise an explicit `databasePath`/`sourcePath` wins, then `target` resolves through project config, and calls without an override keep the configured default. Raw SQL is not parsed to infer a table or database. Successful responses include `resolvedAccessPath` so callers can audit the selected database.
  - For a conservative simple `SELECT` against one table, Dysflow verifies the resolved database schema and returns `TABLE_NOT_IN_DATABASE` or `COLUMN_NOT_IN_TABLE` with `resolvedAccessPath` in `error.details`. Joins, subqueries, expressions, wildcards, and other complex SQL retain the database engine's existing generic error classification rather than guessing.
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
* **`list_tables`**: List tables in one selected database. Use `projectId` plus `target="frontend"` or `target="backend"`; `auto` is intentionally invalid because the operation has no `tableName` to drive lookup.
  - Parameters: `accessPath`, `backendPath`, `databasePath`, `sourcePath`, `target` (optional) — see [`target`](#common-input-parameters) for the projectId-first path
* **`list_linked_tables`**: List only frontend linked tables. The role is explicitly frontend-only; omit `target` or pass `target="frontend"`.
  - Parameters: `accessPath`, `backendPath`, `target` (optional)
* **`get_schema`**: Retrieve column types, sizes, and properties for a table.
  - Parameters: `tableName` (string, optional), explicit path aliases, and `target="frontend" | "backend" | "auto"`. With `projectId`/`contextId`, `auto` probes backend then frontend by table identity and fails on ambiguity instead of guessing.
* **`count_rows`**: Get row count for a table or SQL query.
  - Parameters: `tableName` (string, optional), `sql`/`query` (string, optional), `accessPath` (optional), `target` (optional)
* **`distinct_values`**: List distinct values of a column.
  - Parameters: `tableName` (string, optional), `columnName` (string, optional), `sql`/`query` (string, optional), `accessPath` (optional), `target` (optional)
* **`compare_backends`**: Compare structural differences between two backends.
  - Parameters: `accessPath`, `backendPath`, `comparePath` (string, optional), `target` (optional)
* **`generate_erd`**: Generate an entity-relationship document for the database schema.
  - Parameters: `erdPath` (string, optional), `accessPath`/`backendPath`/`destinationRoot`/`projectRoot` (optional)
* **`get_relationships`**: List foreign keys and relation constraints.
  - Parameters: `accessPath` (optional), `target` (optional)
* **`list_access_files`**: Search for `.accdb` files recursively in a directory.
  - Parameters: `rootPath` (string, optional), `directory` (string, optional)
* **`list_links`**: Get target connections of all linked tables.
  - Parameters: `accessPath` (optional), `target` (optional)
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
* **`compact_repair`**: Execute compact and repair operations. `target` defaults to `frontend`; use `target: "backend"` for the configured backend. Explicit paths override the semantic target with deterministic precedence: `databasePath`, then its `sourcePath` alias, then `accessPath`.
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
* **`form_add_control`**: Add one control to a version-controlled `.form.txt` through FormIR. Defaults to dry-run; `apply:true` writes the source and requires the `import_modules` LoadFromText gate to pass.
  - Parameters: `sourcePath`, `controlName`, `controlType`, `properties` (optional), `targetSectionName` (optional), `dryRun`, `apply`
* **`form_move_control`**: Move one existing control by updating `Left` and/or `Top` only. Defaults to dry-run; `apply:true` writes and validates through the import_modules/LoadFromText gate.
  - Parameters: `sourcePath`, `controlName`, `left` (optional), `top` (optional), `dryRun`, `apply`
* **`form_rename_control`**: Rename one existing control while preserving its type, properties, and opaque metadata. Controls with `[Event Procedure]` bindings are rejected rather than silently breaking Access event procedure names. Defaults to dry-run; `apply:true` writes and validates through the import_modules/LoadFromText gate.
  - Parameters: `sourcePath`, `controlName`, `newName`, `dryRun`, `apply`
* **`form_set_property`** (#813 phase 6): Set one named layout/property entry on a control in a version-controlled `.form.txt` through the FormIR `setProperty` primitive. Refuses to mutate protected/metadata keys (`Checksum`, `PrtDevMode*`, `Format`) and refuses to change a control's `Name` (identity changes belong to `form_rename_control`). When the existing entry for the target property is blob-kind (e.g. `PrtMip`, `PrtDevNamesW`, `FormatConditions`), the primitive refuses with `FORM_PROPERTY_NOT_SCALAR` rather than pushing a duplicate scalar entry. Defaults to dry-run; `apply:true` writes and validates through the import_modules/LoadFromText gate. Never touches code-behind (the sibling `.cls` owns code-behind). Write-gated.
  - Parameters: `sourcePath`, `controlName`, `property`, `value` (string|number|boolean), `dryRun`, `apply`
* **`form_delete_control`** (#813 phase 6): Delete one named control from a version-controlled `.form.txt` through the FormIR `deleteControl` primitive. Fail-closed when the control (or any descendant) has an `[Event Procedure]` binding (`FORM_CONTROL_HAS_EVENT_BINDING` — handlers live in the sibling `.cls`) or when it has named child controls (`FORM_CONTROL_HAS_CHILDREN` — delete children first). This primitive protects ONLY property-sheet-declared event bindings visible to FormIR — it does not detect code-only references such as `WithEvents` in the `.cls` or `Me!ControlName`. Defaults to dry-run; `apply:true` writes and validates through the import_modules/LoadFromText gate. Destructive — Write-gated.
  - Parameters: `sourcePath`, `controlName`, `dryRun`, `apply`
* **`form_align_controls`** (#816, Phase 3 — Ergonomic actions): Align N named controls in a version-controlled `.form.txt` to a common edge using the MEDIAN of the selection (preserves the spread of off-median outliers; not min/max). Edges: `left` | `right` | `top` | `bottom` | `center-horizontal` | `center-vertical`. Identity-preserving: only the moved axis property (`Left` for horizontal verbs; `Top` for vertical verbs) changes; Name, type, Width, Height, other layout properties, event bindings, and code-behind are preserved verbatim. Refuses unknown control names (`FORM_CONTROL_NOT_FOUND`) and missing geometry (`FORM_MUTATION_INVALID`). Routes through the `applyGuardedFormWrite` seam. Defaults to dry-run; `apply:true` writes and validates through the import_modules/LoadFromText gate. Write-gated.
  - Parameters: `sourcePath`/`path` (string, required), `controlNames` (string[] | comma-separated string, required), `edge` (enum, required), `dryRun`, `apply`, `outputMode`
* **`form_distribute_controls`** (#816, Phase 3 — Ergonomic actions): Distribute N named controls in a version-controlled `.form.txt` evenly along an axis. Without `spacing`, distributes across the bounding box of the selection (first control stays at start, last at end, middle ones spaced evenly). With `spacing` (twips) provided, uses the exact gap between consecutive control edges. Identity-preserving: only the moved axis property changes; everything else is preserved. Refuses `<2` controls (`FORM_MUTATION_INVALID` — issue acceptance criterion), unknown control names (`FORM_CONTROL_NOT_FOUND`), and missing geometry (`FORM_MUTATION_INVALID`). Routes through the `applyGuardedFormWrite` seam. Defaults to dry-run; `apply:true` writes and validates through the import_modules/LoadFromText gate. Write-gated.
  - Parameters: `sourcePath`/`path` (string, required), `controlNames` (string[] | comma-separated string, required), `axis` (`"horizontal"` | `"vertical"`, required), `spacing` (number, optional), `dryRun`, `apply`, `outputMode`
* **`form_serialize`** *(slice 3, #616)*: Read-only round-trip serializer. Parses a `.form.txt` at `sourcePath`, runs it through `parseFormTxt` → `serializeFormTxt`, and returns the serialized text with `byteEqual` + `metadataReport` (preservedKeys, byteDiff, opaqueCount). Use it to verify that a form has round-trip-safe serialization before any mutation or clone attempt. Access is never opened. `apply` is ignored — this tool is intentionally read-only.
  - Parameters: `sourcePath` (string, required), `formName` (string, optional; derived from filename when omitted), `dryRun`/`apply` (ignored)
* **`form_deserialize`** *(slice 3, #616)*: Write a `FormIR` to `sourcePath` after re-serializing it, then invoke the `import_modules` LoadFromText gate. Defaults to dry-run (no write, no import). `apply:true` writes the `.form.txt` and requires the LoadFromText gate to pass; if the gate fails the original source is restored best-effort. Write-gated.
  - Parameters: `sourcePath` (string, required), `ir` (object, required — the slice-1 FormIR), `formName` (string, optional), `dryRun`/`apply`
* **`create_form_from_template`** *(slice 5, #618)*: Clone a source `.form.txt` into a new target form by applying a `{{Token}}` token map (e.g. `{{FormName}}` → `Form_FormNuevaAuditoria`). Resolves `sourceForm`/`targetForm` via bench-cache first, then `projectRoot`. Defaults to dry-run — returns the post-replacement preview plus the applied/missing token summary; `apply:true` writes the target and routes through the `import_modules` LoadFromText gate, restoring the original target on gate failure. Use `overwrite:true` to replace an existing target. `missingTokenPolicy` accepts `warn-pass-through` (default) or `strict`. Write-gated.
  - Parameters: `sourceForm` (string, required — form name without `.form.txt`), `targetForm` (string, required — target form name), `tokenMap` (object, required — `{ Token: replacement }`), `missingTokenPolicy` (string, optional — `warn-pass-through` | `strict`), `strictMissingTokens` (boolean, optional), `overwrite` (boolean, optional — default `false`), `dryRun`/`apply`
* **`analyze_form_ui`**: Analyze a version-controlled `.form.txt` into an AI-oriented semantic UI report: controls, roles, captions, bindings, events, and warnings. Read-only; Access is not opened.
  - Parameters: `sourcePath`/`path` (string, `.form.txt` source), `outputMode` (optional)
* **`map_form_behavior`** *(#830)*: Merge `analyze_form_ui` output with CodeGraph-VBA evidence so agents can connect controls/events to handlers, call paths, and table effects. Read-only. Two equivalent paths:
  - **Explicit (default contract)**: pass `codegraphEvidence` (array) yourself. The legacy contract — every entry keyed by `handler` + `callPath` (optional `tables`/`effects`) is bucketed onto its matching control by `${controlName}_` prefix (case-insensitive); unmatched entries land in `unmappedEvidence`.
  - **Internal fetch (opt-in, issue #830)**: pass `autoFetchCodeGraph: true` to relax the no-MCP-to-MCP boundary one-way (dysflow → codegraph-vba). The adapter invokes codegraph-vba internally and merges the result with any caller-supplied `codegraphEvidence`. On any invoker failure (no `.codegraph/` index, codegraph-vba CLI missing, parse error), the adapter falls back to the `.form.txt`-declared events alone and appends a warning — never throws.
  - Parameters: `sourcePath`/`path` (string, required), `codegraphEvidence` (array, **optional** since #830), `autoFetchCodeGraph` (boolean, optional, default `false` — opt-in to the internal-fetch path), `outputMode` (optional)
* **`generate_form_design_plan`**: Generate a traceable form UI design plan from a behavior map and proposed operations/reference pattern. Read-only.
  - Parameters: `behaviorMap` (object, required), `plan` (object, optional), `outputMode` (optional)
* **`apply_form_design_plan`** (#813 phase 6): Apply or preview an AI form UI design plan against a version-controlled `.form.txt` through the `applyGuardedFormWrite` seam (single accumulated write, single `import_modules` LoadFromText gate, single rollback on import failure). Defaults to dry-run and returns the would-be-written source plus advisories without writing; `apply:true` writes the source and requires the LoadFromText gate to pass. Source path resolved out-of-band via `sourcePath`/`path` (mirrors `form_add_control`). `plan.formName` is non-empty-checked and matched case-insensitively against the parsed form name; mismatch returns `FORM_UI_PLAN_FORM_MISMATCH` with no write. `note` operations are counted as advisories, never silently dropped; unknown kinds fail closed with `FORM_UI_UNSUPPORTED_OPERATION`. Write-gated.
  - Parameters: `plan` (object, required), `sourcePath`/`path` (string, required for `apply:true`), `dryRun`, `apply`, `outputMode`
* **`copy_form_ui_pattern`**: Convert a reference form UI pattern into explicit design-plan intent without erasing target behavior. Read-only preview.
  - Parameters: `behaviorMap` (object, required), `referencePattern` (object, required), `outputMode` (optional)
* **`verify_form_ui`**: Verify an applied form UI contract against the source behavior map and return actionable drift findings. Read-only.
  - Parameters: `sourceContract` (object, required), `appliedContract` (object, required), `outputMode` (optional)
* **`render_form_preview`** (#814, Phase 2 — Perception): Compute a geometric layout from a `.form.txt` and emit a deterministic, byte-stable artifact — SVG (primary, browser-friendly) and an ASCII grid (terminal/agent fallback) — without opening Access. The output shape `{ svg, ascii, viewport, warnings }` is the single primitive the sibling `diff_form_preview` (#817) composes pairs of frames from. Honors role taxonomy (action/input/display/container) for color coding. Read-only and offline — pure renderer, no Access, no COM, no filesystem mutation.
  - Parameters: `sourcePath`/`path` (string, required), `output` (`"svg"` | `"ascii"` | `"both"`, default `"svg"`), `viewportScale` (number, default `0.05`), `outputMode` (optional)
* **`analyze_form_layout`** (#815, Phase 2 — Perception): Run a geometry lint over a single `.form.txt` and report overlap, alignment (visual rows), off-section, tab-order vs visual order, and missing-geometry smells. Pure read-class — parses the `.form.txt` through FormIR, builds a behavior map, and delegates to the pure `lintFormLayout` core service. No Access, no COM, no filesystem mutation. Returns `{ findings, controls, sections }` where every finding carries severity `warning` (informational; never gating). The default `alignmentThresholdTwips` is 50; pass a smaller value to tighten the alignment net. Supply `sectionBounds` + `controlSection` together to enable the off-section check.
  - Parameters: `sourcePath`/`path` (string, required), `alignmentThresholdTwips` (number, optional, default `50`), `sectionBounds` (object, optional), `controlSection` (object, optional), `outputMode` (optional)
* **`diff_form_preview`** (#817, Phase 2 — Perception cont.): Compose a before/after visual diff of two `.form.txt` files. Pure read-class — reads both files through the fileSystem port, parses both through FormIR, and delegates to the pure `diffFormPreview` core service. Returns `{ changes: { added, removed, moved, resized }, warnings, beforeForm, afterForm, svg?, ascii? }` where each `added`/`removed` entry carries a `box` BoundingBox and each `moved`/`resized` entry carries `before` + `after` BoundingBoxes. The SVG frame is the same `render_form_preview` artifact with `data-diff="added|removed|moved|resized|same"` on every control rect and a `<g data-section="removed">` group of dashed-stroke ghost rects for removed controls. The ASCII frame prepends a diff-marker legend (`+` added, `-` removed, `*` moved/resized) and annotates per-cell markers in the grid. `output` selects the payload (`"svg"` | `"ascii"` | `"both"`); the structured envelope is always returned. `epsilon` (twips) loosens the moved/resized classifier. Read-only and offline — no Access, no COM, no filesystem mutation.
* **`verify_form_bindings`** (#818, Phase 2 — Perception cont.): Validate every `ControlSource` + `RowSource` binding in a `.form.txt` against a caller-supplied database schema. Pure read-class — reads the file through the fileSystem port, parses to FormIR, and delegates to the pure `validateBindings` core service. Returns `{ formName, controls, findings[] }` where each finding carries a typed `code` (`FORM_BINDING_MISSING_TABLE` / `FORM_BINDING_MISSING_COLUMN` / `FORM_BINDING_EMPTY` / `FORM_BINDING_SQL_UNPARSEABLE` / `FORM_BINDING_TYPE_MISMATCH`), `severity:"warning"` (informational; never gating), `controlName`, and structured `data` (table, column, binding). The `schema` parameter accepts either a multi-table `Record<tableName, ColumnSchema[]>` aggregate (fan out one `get_schema` per table upstream) or a single-table `get_schema` payload `{schema:[{name,type,nullable}], tableName:"..."}` — the adapter normalizes both. The adapter itself never fetches the schema; the caller owns the upstream `get_schema` calls. Read-only and offline — no Access, no COM, no filesystem mutation, no schema fetch.
  - Parameters: `beforePath`/`before` (string, required unless `projectId`+`beforeName`), `afterPath`/`after` (string, required unless `projectId`+`afterName`), `output` (`"svg"` | `"ascii"` | `"both"`, default `"both"`), `viewportScale` (number, default `0.05`), `ascii` (object, default `{cellWidth:80, cellHeight:24}`), `epsilon` (number, default `0`), `outputMode` (optional)
* **`sync_binary`** (#809, workflow tool): Compose the three existing primitives `verify_code` + `import_modules` + `export_modules` into a single round-trip: `verify -> plan -> execute -> re-verify -> recommend`. `dryRun: true` (default) populates `plan.toImport` / `plan.toExport` / `plan.skipped` and skips execute; `apply: true` performs the chunked import / export and re-runs `verify_code`. `direction` is `"src-to-binary"` (import), `"binary-to-src"` (export), or `"both"` (default). `scope.actionableOnly: true` (default) excludes nonActionable noise; `scope.includeBothChanged: true` surfaces bothChanged in `plan.skipped` with `reason: "bothChanged_acknowledged"`. `batchSize` (default 10) slices `toImport` / `toExport` before each inner sub-call so a single chunk failure never aborts the whole sync; `onChunkError: "abort"` short-circuits on the first failed chunk. `moduleNames` / `directoryPath` narrow the verify scope (mirrors `import_modules` #807 semantics). Both `mutatesBinary: true` AND `mutatesFilesystem: true` so the dispatch write-gate fires for any direction; `apply: true` requires writes-enabled (MCP_WRITES_DISABLED on the standard write-gate path). The runtime does NOT compile — the human compiles in Access (Debug > Compile) before re-running tests, exactly like the three primitives it composes. Returns the full `SyncBinaryResult` envelope: `{ ok, dryRun, preSync, plan: { toImport, toExport, skipped, totalActionable }, execution: { startedAt, finishedAt, durationMs, importResult, exportResult, chunksExecuted } | null, postSync: <verify_summary> | null, recommendation: "no_action" | "import_to_binary" | "export_to_source" | "manual_merge" }`. `returnFullDiff: true` opts in to the full verify_code `diffs` array on `preSync` / `postSync`.
  - Parameters: `direction` (`"src-to-binary"` | `"binary-to-src"` | `"both"`, default `"both"`), `scope` (`{ actionableOnly: bool, includeBothChanged: bool }`, default `{ actionableOnly: true, includeBothChanged: false }`), `moduleNames` (array), `directoryPath` (string), `recursive` (boolean, default true), `includeTests` (boolean, default true), `includeForms` (boolean, default true), `dryRun` (boolean), `apply` (boolean), `batchSize` (1..200, default 10), `onChunkError` (`"continue"` | `"abort"`, default `"continue"`), `parallelChunks` (1..8, default 1), `returnFullDiff` (boolean), `timeoutMs` (number), plus all CTX_PROPS / ACCESS_OVERRIDE / STRICT_CTX surfaces (`projectId`, `contextId`, `accessPath`, `strictContext`, `expectedAccessPath`, etc.)
* **`form_set_properties`** (#872 F1 — Form UX frictions): Atomically write a map of properties (`{ Left: 100, Top: 200, Width: 4536, Height: 500, Caption: '"Tile 1"' }`) against one named control in a version-controlled `.form.txt`. Collapses N `form_set_property` calls into one IR mutation — the typical full-geometry case (Left+Top+Width+Height) drops from 4 round trips to 1. LayoutCached* keys are silently dropped (#872 F3 — Access IDE serialisation noise; never written, regenerated on next save). All other per-key guards carry over: `Name` is refused (use `form_rename_control`), protected/metadata keys (`Checksum`, `Format`, `PrtDevMode*`) throw `FORM_PROPERTY_PROTECTED`, blob-kind entries refuse scalar replacement with `FORM_PROPERTY_NOT_SCALAR`. The batch is atomic — any per-key throw aborts the whole operation before any IR mutation lands. Refuses unknown controls with `FORM_CONTROL_NOT_FOUND`. Routes through the `applyGuardedFormWrite` seam — defaults to dry-run; `apply:true` writes the source and validates through the `import_modules` LoadFromText gate. Write-gated.
  - Parameters: `sourcePath` (string, required), `controlName` (string, required), `properties` (object, required — `{ key: string|number|boolean, ... }`), `dryRun` (boolean), `apply` (boolean), `outputMode` (optional)
* **`form_duplicate_control`** (#872 F2 — Form UX frictions): Deep-clone an existing control under a new name in a version-controlled `.form.txt`. The source control's type, entries, children, event bindings (`[Event Procedure]`), tab order, GUID, and metadata are copied verbatim — a duplicated control is pre-wired with the source's behaviour. Caller can override any scalar on top via the `overrides` map (`Caption`, `Left`, `Top`, `Width`, `Height`, …). `Name` is always ignored in overrides (identity wins via `newName`); protected/metadata keys throw `FORM_PROPERTY_PROTECTED`; blob-kind entries refuse scalar replacement; LayoutCached* keys are silently dropped (#872 F3). Optional `targetSectionName` pushes the clone into a different section (mirrors `form_add_control`'s section resolution). Refuses unknown source controls (`FORM_DUPLICATE_SOURCE_MISSING`) and name collisions (`FORM_DUPLICATE_CONTROL`) — both before any IR mutation lands. Routes through the `applyGuardedFormWrite` seam — defaults to dry-run; `apply:true` writes the source and validates through the `import_modules` LoadFromText gate. Write-gated.
  - Parameters: `sourcePath` (string, required), `sourceControlName` (string, required), `newName` (string, required), `targetSectionName` (string, optional), `overrides` (object, optional — `{ key: string|number|boolean, ... }`), `dryRun` (boolean), `apply` (boolean), `outputMode` (optional)
* **`form_get_geometry`** (#872 F5 — Form UX frictions): Read-only geometry helper. Returns the `Left`/`Top`/`Width`/`Height` box (twips) of one named control in a version-controlled `.form.txt`, plus the `LayoutCached*` values for symmetry with the source artifact. Refuses unknown controls with `FORM_CONTROL_NOT_FOUND`; refuses missing `sourcePath` with `FORM_SPEC_MISSING`. Pure read-class — never opens Access, never writes to disk. Path resolution mirrors the Phase 2 Perception siblings (`sourcePath`/`path` or `projectId`+`formName`). Stops agents from parsing `.form.txt` by hand — this is the canonical "where is this control on the canvas?" verb.
  - Parameters: `sourcePath`/`path` (string, required unless `projectId`+`formName`), `controlName` (string, required), `formName`/`name` (string, optional, used with `projectId`), `projectId` (string, optional)
* **`form_list_controls`** (#872 F5 — Form UX frictions): Read-only inventory helper. Returns the flat list of every named control in a version-controlled `.form.txt` (optionally scoped to one section via `section`), with each control's name, type, geometry box, and `hasEventBinding` bit (reflects whether the control carries any `OnXxx = [Event Procedure]` entry verbatim). Pure read-class — never opens Access, never writes to disk. Path resolution mirrors the Phase 2 Perception siblings. Stops agents from parsing `.form.txt` by hand — this is the canonical "what controls does this form have?" verb.
  - Parameters: `sourcePath`/`path` (string, required unless `projectId`+`formName`), `section` (string, optional), `formName`/`name` (string, optional, used with `projectId`), `projectId` (string, optional)

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
| `dysflow mcp`     | Start MCP stdio adapter (writes enabled by default; `--disable-writes` opts out) |
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
6. On automation error/timeouts, inspect `list_access_operations`
7. Clean up owned operation explicitly via `cleanup_access_operation`

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

## Companion Tool: CodeGraph VBA

To run static analysis, call graph explorations, and database/SQL impact tracing on your VBA codebase, configure the **`codegraph-vba`** MCP companion server.

Add the following to your OpenCode MCP config:

```json
{
  "mcp": {
    "codegraph-vba": {
      "enabled": true,
      "type": "local",
      "command": [
        "codegraph-vba",
        "serve",
        "--mcp"
      ]
    }
  }
}
```

### Available Custom Agent Skills
`codegraph-vba` comes with custom agent skills designed to support agents working in this repository:
- **`vba-event-tracer`**: Traces event declarations, raise sites, and custom `WithEvents` event handlers.
- **`vba-handler-backtrace`**: Traces control click/change event handlers back to the control, parses custom UDT parameter types, and reconstructs multiline SQL queries.
- **`vba-sql-impact`**: Traces database tables/columns touched by saved queries, extracts `RecordSource` and `RowSource` layout properties, and resolves SQL table aliases.

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
