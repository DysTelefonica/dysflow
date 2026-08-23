# Dysflow

**Status:** Production-ready MCP/CLI runtime for safe Microsoft Access automation on Windows.

<p align="center">
  <a href="https://github.com/DysTelefonica/dysflow/releases">
    <img src="https://img.shields.io/github/v/release/DysTelefonica/dysflow" alt="Release" />
  </a>
  <img src="https://img.shields.io/badge/Platform-Windows-lightgrey" alt="Platform: Windows" />
  <img src="https://img.shields.io/badge/Node-26-339933?logo=node.js&logoColor=white" alt="Node 26" />
</p>

Dysflow gives agents and scripts a **controlled, auditable execution surface** for Access/VBA tasks: query execution, procedure calls, diagnostics, operation tracking, and safe cleanup.

New installation? Follow [Install and verify Dysflow](./docs/SETUP.md).
Building an agent integration? Read the
[Dysflow plugin author guide](./docs/PLUGIN-AUTHORS.md).

## Quick Navigation

- [Documentation by task](./DOCS.md)
- [Codebase guide for contributors](./CODEBASE-GUIDE.md)
- [Install and verify Dysflow](./docs/SETUP.md)
- [API and MCP references](./DOCS.md#quick-navigation)

---

## Versioning

The installed version is reported by `dysflow --version` and the MCP `serverInfo.version`.
See the [CHANGELOG](./CHANGELOG.md) for the full release history.

**95 visible MCP tools · Windows / Node 26**

All Access, VBA, schema, and form tools are first-class API. No compatibility tiers.

## Releases

Dysflow releases are cut from `main` via `scripts/release-prepare.ps1`, which wraps
the full workflow (bump version, update CHANGELOG, push, **wait for CI green on
the release commit's SHA**, tag, push tag) and refuses to tag unless CI concludes
`success`. The release workflow then builds the tarball, signs `SHA256SUMS` with
Ed25519, and publishes the GitHub Release.

The full pre-release checklist lives in [`docs/release-checklist.md`](./docs/release-checklist.md).
Heavy MCP E2E (`pnpm test:e2e:mcp:release`) is run by humans only at the very end
of a release — it is NOT run by CI — and its structural contracts are pinned by
cheap vitest tests in `test/quality-gates/mcp-e2e-*` so the 30-minute battery
rarely surprises you.

MCP invocation telemetry is local to the selected project at
`.dysflow/runtime/invocations.jsonl`. It records only tool and parameter names;
argument values are never persisted. Set `capabilities.telemetry.invocations` to
`false` in `.dysflow/project.json` to opt out, and use the read-only `logs` tool
for exact `tool` or coarse `action` filters and `groupBy: "tool"` aggregation.

The same opt-out covers `.dysflow/runtime/schema-advertisements.jsonl`, which counts
what each `tools/list` costs the client.

Analyze a collected window with `dysflow telemetry-evidence`. See
[surface-profile evidence](./docs/architecture/surface-profile-evidence.md).

Operator commands:

```powershell
pwsh -File scripts/release-prepare.ps1 -Bump patch    # v1.10.3 → v1.10.4
pwsh -File scripts/release-prepare.ps1 -Bump minor    # v1.10.x → v1.11.0
pwsh -File scripts/release-prepare.ps1 -Version 1.11.2 # explicit override
```

## What Dysflow is (and is not)

### It is

| It is | Evidence in this repo |
|---|---|
| A local automation runtime for Microsoft Access (`.accdb`/`.mdb`) focused on safety and ownership | `src/adapters/vba-sync/`, `src/core/runtime/` |
| A core-first platform with thin protocol adapters | `src/core/`, with `src/adapters/mcp/` and `src/adapters/http/` |
| A platform with 95 visible MCP tools covering VBA, SQL, schema, forms, and project-config resolution | [MCP tool reference](./docs/api/mcp-tools.md) |
| An AI-assisted form UI surface, from layout rendering to binding validation | `src/adapters/vba-sync/vba-forms-ai-tools.ts` |

### It is not

| It is not | Use this boundary |
|---|---|
| A full Access UI replacement | Access stays the editor and the compiler. |
| A compiler | `compile_vba` was removed in v1.19.0; the human compiles. See [Absent by design](./docs/architecture/absent-by-design.md). |
| A tool for arbitrary system-level process management | Only PID-verified Access orphans are reaped, and only after an explicit `confirmPid`. |
| A web-hosted service | The HTTP adapter binds to `127.0.0.1` and starts writes-disabled. |

---

## Why this exists

Access automation is risky when ownership is implicit. For example, this is unsafe:

```powershell
Stop-Process -Name MSACCESS -Force
```

It can terminate unrelated user sessions.

Dysflow records every Access launch (operation id, action, db path, PID, process metadata, lifecycle) and gates destructive actions so cleanup can only happen on verified operations.

The same principle governs distribution. The signed GitHub Release is the default install path and the only one that establishes authenticity.

A gated development channel sits alongside it for testing unreleased changes. It is opt-in, unverified, and never the default — see [installation channels](./docs/installation-channels.md).

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

MCP invocations are recorded locally in the owning project's
`.dysflow/runtime/invocations.jsonl`. The sink contains tool/parameter names
and typed outcomes. The sole argument-value exception is the canonical
`projectId`, retained so multi-project calls can be attributed; SQL, passwords,
paths, and every other value are never recorded. Appends and rotation share a
cross-process lock, and the sink rotates automatically. To opt out for a project:

```json
{
  "capabilities": {
    "telemetry": {
      "invocations": false
    }
  }
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
| Runtime      | Node.js 26                          |
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

The release also owns five Dysflow agent skills under `skills/`. Install and
update copy only to detected adapter `SkillsDir` locations and publish all five
skills as one transaction. Use `--only=opencode,codex` to opt in explicit
adapters (and create their canonical skill directories), or
`--exclude=claude,pi` to leave selected detected adapters untouched. `dysflow
doctor` compares each detected adapter's installed hashes and harness version
against the running product release.

### Channels

`dysflow install` and `dysflow update` accept `--channel {stable|beta|main}`. The default is `stable`, and omitting the flag keeps the existing behaviour.

| Channel | Purpose | Verification | Prerequisite gate |
|---|---|---|---|
| `stable` | Production and everyday installs. | Ed25519 signature over `SHA256SUMS`, then SHA-256. | None |
| `beta` | Validating a release candidate. | SHA-256 against the published `SHA256SUMS`. | `DYSFLOW_ALLOW_INSECURE_UPDATE=1` |
| `main` | Testing changes that have not shipped. | None. Unverified by design. | `DYSFLOW_ALLOW_INSECURE_UPDATE=1` |

On `stable`, `dysflow install` does not download. It installs the package the invoked CLI was started from, which is unchanged behaviour; `dysflow update` is the command that fetches.

Only `beta` and `main` reach the network on `install`.

Stable needs no flag, but naming it is worth doing in scripts:

```text
dysflow install --channel stable
```

The `beta` channel resolves the newest prerelease tag and verifies the archive against its published checksum manifest. It is not signed, so it is gated:

```text
$env:DYSFLOW_ALLOW_INSECURE_UPDATE = "1"
dysflow install --channel beta
```

**Unreleased development channel — use only to test changes that are not part of a release.**

The `main` channel downloads the branch archive and builds the runtime locally. It has no cryptographic verification of any kind, so treat it as running unreviewed code:

```text
$env:DYSFLOW_ALLOW_INSECURE_UPDATE = "1"
dysflow install --channel main
```

Switching an installed runtime between channels requires `--force` on `dysflow update`; without it the command fails with `DYSFLOW_CHANNEL_PIN_REQUIRES_FORCE` and changes nothing.

Full per-channel recipes, error codes, and rollback steps live in [installation channels](./docs/installation-channels.md).

The guarantees behind each channel are in the [update trust model](./docs/security/update-trust-model.md).

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
3. Write repo-local config with `dysflow setup --write-project --project-id <id> --access-path <frontend.accdb>`.
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
  "frontendFile": "Frontend.accdb",
  "backendPath": "Backend.accdb",
  "destinationRoot": "src",
  "passwordEnv": "DYSFLOW_ACCESS_PASSWORD",
  "backendPasswordEnv": "DYSFLOW_BACKEND_PASSWORD"
}
```

Use a filename-only `frontendFile`; Dysflow joins it to the worktree that physically owns the
config. `destinationRoot` must remain relative/local. An absolute shared `backendPath` is supported
and is never rebased. Git creates worktrees; Dysflow resolves targets safely: the current worktree
is the default, and another worktree requires an explicit per-call `projectId`, absolute
`accessPath`, `backendPath`, or supported `cwd`. Explicit target provenance is call-local and never
persisted.

A basename-only legacy `accessPath` migrates losslessly. Absolute or separator-containing legacy
values fail with `FRONTEND_PATH_NOT_BASENAME`; zero/multiple root frontends fail with
`FRONTEND_TARGET_MISSING` / `FRONTEND_TARGET_AMBIGUOUS`; duplicate sibling ids fail with
`PROJECT_ID_COLLISION`.

Use portable paths whenever possible so the same config works for `adm`, `adm.DEFENSA`, and teammates with different Windows profile names.

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

This writes `.dysflow/project.json` with a filename-only frontend and default `destinationRoot: "src"`:

```json
{
  "id": "00-no-conformidades-staging-clean",
  "frontendFile": "NoConformidades.accdb",
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
| `accessPath`              | Explicit call-level frontend override only; persistent config uses `frontendFile`                 |
| `backendPath`             | `.dysflow/project.json` → `backendPath` (absolute/shared is allowed)                               |
| `destinationRoot`         | `.dysflow/project.json` → relative/local `destinationRoot` (usually `src`)                          |
| `projectRoot`             | Derived from the worktree that physically owns `.dysflow/project.json`; normally omit              |
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
| `DYSFLOW_RESOLUTION_CACHE_TTL_MS`                | Integer TTL from `1000` through `3600000` milliseconds for process-local project recovery tokens and cached choices; invalid values fall back to `600000` |

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

## Quickstart (AI agent)

> **Who this is for.** You are an AI agent (Claude Code, OpenCode, Codex, or any MCP-aware assistant) and you have just been handed an Access/VBA project. Do these steps **once per project/worktree** before calling any Dysflow tool — they take 3 minutes and replace 30 minutes of trial-and-error.

### 3-command hello world

The minimum viable agent loop — verify the project is wired, list its modules, plan an export. All three calls are read-only and never open Access.

```powershell
# 1. Confirm dysflow is installed and reachable.
dysflow --version
```

```powershell
# 2. Resolve the project the agent is sitting in. Returns the canonical
#    projectId plus the resolved accessPath / backendPath / destinationRoot.
dysflow resolve_project
```

```powershell
# 3. List every VBA module the project owns (read-only, no Access spawned).
dysflow list_vba_modules
```

If step 2 returns `unresolved`, you are not inside a project worktree — run `dysflow setup --write-project --project-id <id> --access-path <frontend.accdb>` and retry. The `Primer proyecto` recipe below shows the canonical copy-paste-ready command.

### Primer proyecto (copy-paste-ready recipe)

Run once per Access project/worktree. Replace `<project-id>`, `<frontend.accdb>`, and `<backend.accdb>` with your project's values. Use the **same `projectId`** as your memory/Engram project so traces line up:

```powershell
cd C:\Projects\<your-access-project>

dysflow setup --write-project `
  --project-id   <project-id> `
  --access-path  <frontend.accdb> `
  --backend-path <backend.accdb>

$env:ACCESS_VBA_PASSWORD   = "<access-password>"   # never commit
$env:DYSFLOW_BACKEND_PASSWORD = "<backend-password>"

dysflow doctor            # gate before any write tool
```

After that, every MCP call should be short and traceable:

```json
{ "projectId": "<project-id>" }
```

Do **not** repeat `accessPath`, `backendPath`, `destinationRoot`, or `projectRoot` on every tool call when they already live in `.dysflow/project.json` — repeated overrides are for deliberate one-off exceptions only.

### Skill cross-references

Load the canonical skills before touching VBA, Access state, or write-class tools. Each skill is an `agent-instructions` file the runtime will inject on demand:

| Task | Load skill | Why |
| --- | --- | --- |
| Operating dysflow MCP (write-flags, error codes, preflight) | `dysflow-usage` | Tool/flag/error reference; pre-flight checklist before any dysflow call. |
| Operating harness (HR-1..HR-8, anti-patterns, 8-step loop) | `dysflow-arnes` | Hard rules every dysflow session must follow. |
| TDD loop for VBA tests (manifest, fixtures, isolation) | `access-vba-tdd` + sub-skill | Pre-flight the manifest, write the atom, run the runner. |
| Diagnose source ⇄ binary drift (`.cls` = behavior, `.form.txt` = UI) | `vba-binary-drift` | Read first, then sync; never edit both sides blind. |
| Author forms (perceive → act → verify) | `access-form-ui-builder` | Generate / verify a `.form.txt` plan without opening Access. |
| Sync source ⇄ binary in one shot | `vba-binary-sync` | `verify_code` → `import_modules` → `export_modules` → re-verify pipeline. |
| SQL impact / table change | `vba-sql-impact` | Tables, saved queries, RecordSource/RowSource lineage. |

Onboarding companion: see [`docs/ai-agent-onboarding.md`](./docs/ai-agent-onboarding.md) for the 5-minute "what can go wrong" guide.

### Quick checklist

- [ ] You are inside the Access project repo/worktree, not the dysflow repo.
- [ ] `.dysflow/project.json` exists with repo-relative `accessPath` and `backendPath`.
- [ ] `projectId` matches the Engram project name when Engram is available.
- [ ] Secrets live in env vars (`ACCESS_VBA_PASSWORD`, `DYSFLOW_BACKEND_PASSWORD`) — never in the config.
- [ ] You pass `projectId` on every MCP call and never repeat `accessPath`.
- [ ] After any timeout or crash, you call `list_access_operations` and `cleanup_access_operation` against the specific `operationId` — never `Stop-Process -Name MSACCESS`.

---

## Common pitfalls cheat-sheet

When a Dysflow call returns an error envelope, the first 30 seconds should be spent on this table, not on reading stack traces. Every entry maps an error code to the fastest path back to a green build, and cross-references the Round-11/12 issue that introduced or hardened the behavior.

| Symptom (error code) | What it really means | Fastest fix | See |
| --- | --- | --- | --- |
| `MCP_WRITES_DISABLED` | The MCP session started with `--disable-writes`, or this repo's `.dysflow/project.json` has `allowWrites: false`. | Confirm the session posture first (`get_capabilities.writesProcess.enabled`). If the repo is intentionally read-only, use `dryRun: true` or work in a different worktree; otherwise flip `allowWrites: true` and reload. | #962 |
| `PROJECT_CONFIG_NOT_WRITE_READY` (and its 5 split children: `ACCESS_PATH_NOT_FOUND`, `BACKEND_PATH_NOT_FOUND`, `DESTINATION_ROOT_NOT_FOUND`, `OUTSIDE_PROJECT_ROOT`, `PROJECT_ID_MISMATCH`) | The project is unwired, the `destinationRoot` is missing, or the requested `projectId` does not match `.dysflow/project.json`. Each child code tells you exactly which invariant broke. | Run `dysflow resolve_project` first to read the resolved config and `diagnostics[]`; then `dysflow doctor`; then re-run `dysflow setup --write-project --project-id <id> --access-path <frontend.accdb>` if config is missing. For `OUTSIDE_PROJECT_ROOT`, copy the file into `destinationRoot` or pass an explicit `projectRoot` override — do not bend the path gate. | #962, #966, #968 |
| `WRITE_LOCKED_BY_RUNNING_OP` / `OPERATION_ALREADY_RUNNING` | A prior Dysflow-owned Access operation is still holding the marker file in `.dysflow/runtime/markers/`. | List the operations with `list_access_operations`, then either wait for completion or call `cleanup_access_operation` on the specific `operationId`. For stale `status:"running"` markers (no PID, idle past the grace window), call `clean_stale_markers` with explicit `confirm: true`. | #967, #976 |
| `LACCDB_STALE_DETECTED` / `LIVE_PROCESS_HOLDS_LACCDB` | Dysflow found a `*.laccdb` lock file when launching Access. The first means no live Access process holds the lock — it removes the stale lock and continues; the second means a real `MSACCESS.EXE` is bound to the same `accessPath` and refuses to start. | For `LACCDB_STALE_DETECTED`, no action needed (Dysflow removed it). For `LIVE_PROCESS_HOLDS_LACCDB`, identify the holder PID with `access_force_cleanup_orphaned`, verify it is **headless** and bound to **the same** `accessPath`, then pass `confirmPid` explicitly. Never `Stop-Process -Name MSACCESS`. | #967, #976 |
| `MCP_ALLOWLIST_NOT_CONFIGURED` / `MCP_PROCEDURE_NOT_ALLOWED` | You tried to call a VBA procedure but the project's `allowedProcedures` (or `capabilities.procedures.allow`) does not list it. | Add the procedure name to `.dysflow/project.json` under `capabilities.procedures.allow` and reload. An empty list means *all procedures are allowed* — that is rarely what production wants. | #962, Round-3 |
| `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` | An `export_modules` / `export_all` call in developer mode is about to overwrite the active source tree. | Re-target the export to a sibling directory (`<repo>/export/`) or pass `confirmOverwriteSource: true` after confirming the destination is intentional. `prune:true` + `filter:...` is always rejected (`INVALID_INPUT`). | #779, #619 |
| `RUNNER_INVALID_JSON` / `CONFIG_TARGET_NOT_FOUND` | Dysflow launched PowerShell but the runner did not return structured JSON, or the target `.accdb` is missing. | Run `dysflow doctor` — it surfaces both the runner binary path and the Access install. Then verify `accessPath` resolves against `.dysflow/project.json` (do **not** assume a fresh `pwd` if you are inside a worktree). | #594, #962 |
| `FORM_SOURCE_MALFORMED` / `VBA_SOURCE_MALFORMED` | The `.form.txt`/`.report.txt`/`.bas`/`.cls` source the agent tried to import does not parse. | Run `lint_module` (or the form import gate's structural pre-flight) before re-importing; repair the metadata with the `vba-form-metadata-repair` skill. | #958 |

### Failure patterns that have nothing to do with the error code

- **"My doctor says green but the write tool still refuses."** Check `get_capabilities.writesProcess.enabled` — `dysflow serve` (HTTP) starts writes-disabled by default; pass `--enable-writes` explicitly or switch to `dysflow mcp` (stdio, writes on).
- **"I see two different `projectId`s for the same repo."** One is in `.dysflow/project.json` and the other is the Engram/memory project name. Pick one canonical name with `dysflow setup --set-project-id <id>` and use it everywhere — the agent-side `projectId` field on every MCP call is the trace identity, not the trace content.
- **"My changes keep colliding with a teammate's working tree."** You are likely running two Dysflow writers against the same `.accdb` from different worktrees. Check `.dysflow/project.json.owningWorktree` (when present) or pick one worktree to own the binary; the other worktree should only run read-only tools.

See [`docs/ai-agent-onboarding.md`](./docs/ai-agent-onboarding.md) for the 5-minute guided tour of the same pitfalls with concrete fixes.

### Read tools and the `.accdb` LSN (round-trip noise) — #1057 F2

Read-class tools that open the binary through Access COM (`list_vba_modules`, `validate_manifest`, `verify_code`, `list_objects`, …) may update the Jet/ACE internal LSN when Access closes the file. The observable effect: `git status` reports the `.accdb` as modified after every dysflow run even when zero project content changed (`git diff --stat` shows `Bin N -> N bytes` — identical size).

Rules of thumb for a consumer:

- **Never `git add` the `.accdb` blindly after a dysflow run.** An LSN-only change is noise; committing it churns the repository for nothing.
- **Verify real changes before staging**: `git diff --stat <file>.accdb` with an identical byte size is almost always LSN-only; when in doubt, `verify_code` is the authoritative content-drift check (read its `moduleCounts` — module units, not presence counts).
- **Distinguish the two summaries**: `list_vba_modules.summary.modulesInBinaryOnly` counts module *presence*; `verify_code.moduleCounts.sourceNewerModules` counts *content drift*. "All presence counts 0" does not mean "no drift".

An LSN-free read path (opening without the COM lock) is a deeper Access-runner change and is intentionally not attempted here; this section is the documented contract.

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

### Tool reference

The complete tool inventory lives in [MCP tool reference](./docs/api/mcp-tools.md): every visible tool, its parameters, and its result contract.

| If you need to... | Read |
|---|---|
| Look up a tool's parameters or result shape | [MCP tool reference](./docs/api/mcp-tools.md) |
| Copy a working request payload | [MCP examples](./docs/mcp-examples.md) |
| Understand the transport and SDK strategy | [MCP protocol](./docs/mcp-protocol.md) |
| Share context parameters across tools | [Common input parameters](./docs/api/mcp-tools.md#common-input-parameters) |

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
It refreshes bundled Dysflow skills even when the runtime version is already
current, so repaired or newly discovered adapter targets converge without a
manual file copy. The same `--only` and `--exclude` filters accepted by install
are available on update.
Use `--force` to reinstall the latest release even when versions match:

```powershell
dysflow update --force
```

The updater downloads the production GitHub Release archive (`tar.gz`) directly from GitHub, verifies the Ed25519 signature over the release checksum manifest, verifies the archive against the signed SHA-256 checksum, and extracts it.

On `stable` and `beta` there is no source-build or git-clone fallback: a failed download never degrades into a source build, which is what protects the update path from supply-chain risks.

The `main` channel is the one deliberate exception. It builds from a downloaded branch archive, is unreachable unless `DYSFLOW_ALLOW_INSECURE_UPDATE=1` is set, and verifies nothing it downloads.

See [installation channels](./docs/installation-channels.md) for what that costs the operator.

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

- [`DOCS.md`](DOCS.md)
- [`CODEBASE-GUIDE.md`](CODEBASE-GUIDE.md)
- [`CHANGELOG.md`](CHANGELOG.md)
- [`docs/architecture/dysflow-core-and-adapters.md`](docs/architecture/dysflow-core-and-adapters.md)
