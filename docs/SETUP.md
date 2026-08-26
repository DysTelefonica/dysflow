# Install and verify Dysflow

Dysflow runs locally on Windows and exposes Microsoft Access automation through
an MCP server. Install the CLI, wire one or more supported agents, restart the
client, and verify the live adapter with the read-only `get_capabilities` MCP
tool.

For the complete command and tool reference, see the
[Dysflow README](../README.md). To extend an agent integration, see the
[plugin author guide](./PLUGIN-AUTHORS.md).

## Prerequisites

| Requirement | Supported value |
| --- | --- |
| Operating system | Windows |
| Node.js | 26 |
| Microsoft Access | Required for Access/VBA operations, but not for installation |
| Git and pnpm | Required only when building from source |

## Install a published release

Install the CLI from npm, then let Dysflow install its managed runtime and MCP
integration:

```powershell
npm install --global dysflow
dysflow install --agents claude --no-tui
```

`--agents` accepts a comma-separated list:

```powershell
dysflow install --agents codex,opencode,claude,pi --no-tui
```

Use `--agent-all` instead when every supported integration should be installed.
Omit `--no-tui` to complete the same selection interactively.

> The canonical option is `--agents` (plural), and the Claude identifier is
> `claude`. `--agent claude-code` is not a supported installer form.

## Build and install from source

Use this route for Dysflow development:

```powershell
git clone https://github.com/DysTelefonica/dysflow.git
cd dysflow
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm install --global .
dysflow install --agents codex,opencode,claude,pi --no-tui
```

Do not leave an agent wired to a development checkout or `test-runtime`.
Before returning to normal work, install an official release or run
`dysflow update`, then verify the active runtime again.

## Where agent wiring is stored

The installer preserves unrelated configuration and adds the `dysflow` MCP
server to the selected clients.

| Agent identifier | Configuration destination |
| --- | --- |
| `codex` | `~/.codex/config.toml` |
| `opencode` | `~/.config/opencode/opencode.json` |
| `claude` | `~/.claude/settings.json`, or the Claude Desktop config when that file is absent |
| `pi` | `~/.pi/agent/mcp.json` |

Restart the selected client after installation so it reloads the MCP
configuration.

## Verify the installation

First verify the CLI and local environment:

```powershell
dysflow --version
dysflow doctor
```

Then open a fresh agent session and invoke the MCP tool:

```text
get_capabilities({})
```

Confirm that the response reports:

- the expected `adapterVersion`;
- the expected tools in `toolsVisible`;
- `writesProcess.enabled` and the per-project write posture you intended; and
- a healthy `projectConfig.status` for a configured Access project.

`get_capabilities` is an MCP tool, not a CLI subcommand. Do not run
`dysflow get_capabilities` in a terminal.

For OpenCode, the client-side connection can also be inspected with:

```powershell
opencode mcp list
```

## Configure an Access project

Agent installation and project configuration are separate. A working project
owns a `.dysflow/project.json` that identifies its frontend Access database and,
for split applications, its backend:

```powershell
dysflow setup --write-project --project-id my-project `
  --access-path C:\work\my-project\frontend.accdb `
  --backend-path C:\work\my-project\backend.accdb
dysflow doctor
```

Keep secrets in environment variables, not in the committed project file.

### Select the advertised MCP tool surface

The stdio server advertises the 71-tool core surface by default. It includes bootstrap,
recovery, test, source-sync, read-only SQL/form inspection, and the guarded `query_execute` entry point.

Write-capable SQL and form specialists remain callable by name and discoverable with
`schema({ view: "index" })`; they stay hidden from core `tools/list`.

Opt in to the complete surface per project:

```json
{
  "mcp": { "toolSurface": "full" }
}
```

Or override it for one process with `dysflow mcp --tool-surface full`. The CLI flag takes
precedence over project configuration.

The only accepted values are `"core"` and `"full"`. An invalid project value fails with
`CONFIG_UNKNOWN_TOOL_SURFACE` instead of silently falling back.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Agent cannot see Dysflow tools | Restart the client and inspect its MCP configuration destination above. |
| Reported version is stale | Compare `dysflow --version` with `get_capabilities({}).adapterVersion`, then run `dysflow update`. |
| OpenCode points at a checkout or `test-runtime` | Re-run `dysflow install --agents opencode --no-tui`. |
| Project diagnostics fail | Run `dysflow doctor` from the project root and repair `.dysflow/project.json`; do not bypass its path or write guards. |
