# Dysflow MCP E2E validation

This directory contains the canonical real-world validation for Dysflow MCP. The acceptance criterion for changes is not only unit tests: `dysflow mcp` must work against a real Access frontend/backend pair.

## Quick path

From the repository root:

```powershell
$env:ACCESS_VBA_PASSWORD = "<fixture password>"
pnpm build
node .\dist\cli\index.js install --runtime-dir "$env:LOCALAPPDATA\dysflow" --agents opencode --no-tui
pnpm run test:e2e:mcp
```

Expected result: the script prints a PASS/FAIL table and writes a report to:

```text
E2E_testing\.dysflow\mcp-e2e-temp\mcp-e2e-report.md
```

## What this test uses

| Item | Canonical value |
|---|---|
| Frontend | `E2E_testing\NoConformidades.accdb` |
| Backend | `E2E_testing\NoConformidades_Datos.accdb` |
| Project config | `E2E_testing\.dysflow\project.json` |
| Runner | resolved by `resolveMcpE2eCommand` — see [MCP E2E — local test-runtime](#mcp-e2e--local-test-runtime) |
| Harness | `E2E_testing\mcp-e2e.mjs` |

The E2E harness performs JSON-RPC MCP handshakes and calls the advertised tools through the real stdio MCP server. It is intentionally closer to normal agent usage than direct TypeScript unit tests.

## MCP E2E — local test-runtime

The harness does **not** default to the production install at `%LOCALAPPDATA%\dysflow\bin\dysflow.cmd` — that install is the host's live runtime, and silently spawning it under E2E mixes the wrong scripts, the wrong `DYSFLOW_HOME`, and the wrong `Update` path into the test environment. The production install is refused by default; the harness aborts with `MCP_E2E_REFUSES_PRODUCTION_RUNTIME` if no explicit `DYSFLOW_E2E_COMMAND` is set and only the production install is on disk (#582).

Resolution priority (handled by `E2E_testing/_helpers/resolve-mcp-e2e-command.mjs`):

1. **`DYSFLOW_E2E_COMMAND` env var** (operator override, always honored). If set to a non-existent path the harness aborts with `MCP_E2E_OVERRIDE_NOT_FOUND`.
2. **`<repoRoot>/test-runtime/bin/dysflow.cmd`** (the local build produced by `pnpm build`). This is the preferred default and what the E2E suite expects.
3. **`%LOCALAPPDATA%\dysflow\bin\dysflow.cmd`** (the production install). Only reached if there is no override and no test-runtime; the harness then aborts with `MCP_E2E_REFUSES_PRODUCTION_RUNTIME` and lists the paths it searched. It never spawns the production install without an explicit override.
4. **Nothing on disk anywhere** → `MCP_E2E_NO_RUNTIME_AVAILABLE`.

Quick path to a green E2E run:

```powershell
# From the repo root.
$env:ACCESS_VBA_PASSWORD = "<fixture password>"
pnpm build                                       # produces test-runtime/bin/dysflow.cmd
pnpm run test:e2e:mcp                            # the harness auto-uses the test-runtime
```

If you need to point the E2E at a different runtime (e.g. a packaged build under test, or the production install for a debugging session), set `DYSFLOW_E2E_COMMAND` explicitly:

```powershell
$env:DYSFLOW_E2E_COMMAND = "C:\path\to\other\dysflow.cmd"
pnpm run test:e2e:mcp
```

If the harness ever aborts before any tool call, the message names the resolution code (`MCP_E2E_REFUSES_PRODUCTION_RUNTIME`, `MCP_E2E_NO_RUNTIME_AVAILABLE`, or `MCP_E2E_OVERRIDE_NOT_FOUND`) and the candidates it searched. Run `pnpm build` first or fix `DYSFLOW_E2E_COMMAND`.

## Rules for maintainers

- Keep **one** canonical MCP E2E harness: `mcp-e2e.mjs`.
- Do not reintroduce separate “fast smoke” scripts with a weaker acceptance criterion.
- Do not copy Dysflow TypeScript source into `E2E_testing`.
- Do not hardcode fixture passwords. Use `ACCESS_VBA_PASSWORD`.
- This fixture is allowed to be destructive: the backend/frontend are test assets.
- Generated reports, Access locks, temp files, and local binary fixtures are not PR artifacts unless explicitly needed for diagnosis.

## Optional knobs

```powershell
# Override the MCP command under test
$env:DYSFLOW_E2E_COMMAND = "C:\Users\adm.DEFENSA\AppData\Local\dysflow\bin\dysflow.cmd"

# Increase per-tool response timeout only when debugging a known slow operation.
# Normal runs use a short 30s guard and stop each MCP process as soon as it replies.
$env:DYSFLOW_E2E_TIMEOUT_MS = "30000"
```

## Boundary

`E2E_testing` is reserved for real Access fixture assets and thin harness notes. E2E checks must exercise production implementation by launching `dysflow mcp`; they must not validate a shadow adapter or copied protocol code.
