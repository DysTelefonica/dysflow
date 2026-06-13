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
| Runner | installed runtime launcher: `%LOCALAPPDATA%\dysflow\bin\dysflow.cmd mcp` |
| Harness | `E2E_testing\mcp-e2e.mjs` |

The E2E harness performs JSON-RPC MCP handshakes and calls the advertised tools through the real stdio MCP server. It is intentionally closer to normal agent usage than direct TypeScript unit tests.

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
