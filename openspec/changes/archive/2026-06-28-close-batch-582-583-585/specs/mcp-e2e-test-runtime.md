# Spec — mcp-e2e-test-runtime (#582)

> Behavior contract for `E2E_testing/mcp-e2e.mjs` command resolution. The E2E must
> refuse to accidentally use the production runtime at `%LOCALAPPDATA%\dysflow`
> when no explicit override is set, and must default to the repo-local
> `test-runtime` build when available.

## Requirement R1 — explicit test-runtime command is the preferred path

The harness reads the runtime command from `DYSFLOW_E2E_COMMAND` when set. This
is the operator's explicit override and is always honored.

#### Scenario: explicit override is honored

- **Given** `DYSFLOW_E2E_COMMAND=C:\custom\bin\dysflow.cmd` and the file exists
- **And** the repo `test-runtime/bin/dysflow.cmd` also exists
- **When** the harness resolves the CLI command
- **Then** the resolved command is `C:\custom\bin\dysflow.cmd`
- **And** the resolution log includes `source=env-override`

#### Scenario: explicit override is honored even when path looks like production

- **Given** `DYSFLOW_E2E_COMMAND=%LOCALAPPDATA%\dysflow\bin\dysflow.cmd` and the file exists
- **When** the harness resolves the CLI command
- **Then** the resolved command is the override path
- **And** no `MCP_E2E_REFUSES_PRODUCTION_RUNTIME` error is raised
- **Because** explicit operator override is a deliberate choice; the guard only fires when no override is set.

## Requirement R2 — production runtime at `%LOCALAPPDATA%` is refused by default

When no `DYSFLOW_E2E_COMMAND` is set, the harness must not silently default to
the production runtime, even if it is the only `dysflow.cmd` on the host.

#### Scenario: default would be the production runtime and no test-runtime exists

- **Given** `DYSFLOW_E2E_COMMAND` is unset
- **And** `DYSFLOW_HOME` is unset (or not the repo `test-runtime`)
- **And** `<repoRoot>/test-runtime/bin/dysflow.cmd` does NOT exist
- **And** the legacy default `%LOCALAPPDATA%\dysflow\bin\dysflow.cmd` exists
- **When** the harness resolves the CLI command
- **Then** resolution aborts with `MCP_E2E_REFUSES_PRODUCTION_RUNTIME`
- **And** the error message names both the rejected path and the missing test-runtime path
- **And** the harness exits with code 1 before any `spawn` call

#### Scenario: default would be the production runtime but test-runtime exists

- **Given** `DYSFLOW_E2E_COMMAND` is unset
- **And** `<repoRoot>/test-runtime/bin/dysflow.cmd` exists
- **When** the harness resolves the CLI command
- **Then** the resolved command is `<repoRoot>/test-runtime/bin/dysflow.cmd`
- **And** no error is raised
- **And** `DYSFLOW_HOME` is set to `<repoRoot>/test-runtime` (unchanged behavior)

## Requirement R3 — no runtime available at all

When neither the explicit override, the repo `test-runtime`, nor the production
runtime yields a usable command, the harness aborts with a clear diagnostic
that names every path it tried.

#### Scenario: no runtime under any path

- **Given** `DYSFLOW_E2E_COMMAND` is unset
- **And** `<repoRoot>/test-runtime/bin/dysflow.cmd` does NOT exist
- **And** `%LOCALAPPDATA%\dysflow\bin\dysflow.cmd` does NOT exist
- **When** the harness resolves the CLI command
- **Then** resolution aborts with `MCP_E2E_NO_RUNTIME_AVAILABLE`
- **And** the error message lists every candidate path it searched
- **And** the harness exits with code 1

## Requirement R4 — README documents safe setup

The README must explain how to produce the test-runtime build, what env vars
override resolution, and which paths the harness refuses by default.

#### Scenario: README has an "MCP E2E — local test-runtime" section

- **Given** the repo README at the current main HEAD
- **When** the documentation check runs
- **Then** the README contains a section titled "MCP E2E — local test-runtime"
- **And** the section names the `pnpm build` step that produces `test-runtime/bin/dysflow.cmd`
- **And** the section names the `DYSFLOW_E2E_COMMAND` env var as the explicit override
- **And** the section names `%LOCALAPPDATA%\dysflow` as the path the harness refuses by default

## Out of scope

- Other E2E scripts (`e2e-cli`, etc.) are not modified.
- The runner script (`scripts/dysflow-access-runner.ps1`) is not modified.
- The dysflow install flow is not modified.
