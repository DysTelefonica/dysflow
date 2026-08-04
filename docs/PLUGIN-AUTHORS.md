# Dysflow plugin author guide

Dysflow plugins are thin agent-specific adapters around one shared MCP runtime
and one shared operating skill. Keep the runtime contract in Dysflow; use
plugin manifests and hooks only for host integration.

Start with the [setup guide](./SETUP.md) for installation and verification.
See the [skill authoring guide](./skills-authoring.md) for skill metadata conventions.
The [Dysflow README](../README.md) remains the canonical CLI and MCP tool
reference.

## Repository layout

```text
plugin/
├── claude-code/
│   ├── .claude-plugin/plugin.json
│   ├── .mcp.json
│   ├── hooks/hooks.json
│   └── scripts/
├── codex/
│   ├── .codex-plugin/codex.json
│   ├── .mcp.json
│   ├── hooks/hooks.json
│   └── scripts/
└── opencode/
    ├── dysflow.ts
    └── .mcp.json
skills/
└── dysflow-protocol/
    └── SKILL.md
```

Claude Code and Codex use JSON manifests plus shell hooks. OpenCode uses a
TypeScript adapter. All three connect to the same `dysflow` MCP server and
share `skills/dysflow-protocol/SKILL.md`.

## Manifest and namespace conventions

Use these stable identities:

| Field | Convention |
| --- | --- |
| Plugin name / MCP server key | `dysflow` |
| Plugin namespace | `dysflow-plugin` |
| Ownership fields | Prefix private metadata with `_dysflow_` |

Bundled manifests and MCP configuration use:

- `_dysflow_marker` or `_dysflow_marker_root` to identify managed content;
- `_dysflow_owner` to identify Dysflow as the owner; and
- `_dysflow_collaboration` for collaboration metadata.

These keys distinguish Dysflow-owned entries from host or third-party
configuration. Do not overwrite another plugin's namespace, and do not claim a
foreign entry by adding Dysflow ownership markers.

## MCP configuration

Bundled plugins launch the agent-facing tool profile through npm:

```json
{
  "mcpServers": {
    "dysflow": {
      "_dysflow_marker": "dysflow-plugin",
      "command": "npx",
      "args": ["-y", "dysflow", "mcp", "--tools=agent"]
    }
  },
  "_dysflow_marker_root": "dysflow-plugin"
}
```

Keep the server key stable so clients do not create duplicate Dysflow
connections. The CLI installer may instead write the managed `dysflow.cmd`
launcher with `args = ["mcp"]`; both forms target the same runtime. Use the
installer-owned form for machine setup and the bundled `npx` form inside a
portable plugin.

## Hook events

The Claude Code and Codex bundles currently wire the same lifecycle:

| Event | Matcher | Script | Timeout | Async |
| --- | --- | --- | --- | --- |
| `SessionStart` | `startup\|clear` | `session-start.sh` | 10 s | No |
| `SessionStart` | `compact` | `post-compaction.sh` | 10 s | No |
| `UserPromptSubmit` | any | `user-prompt-submit.sh` | 5 s | No |
| `SubagentStop` | any | `subagent-stop.sh` | 5 s | Yes |
| `Stop` | any | `session-stop.sh` | 10 s | Yes |

The hooks re-emit the operating workflow, inspect project state, and run safe
health checks. `SubagentStop` is intentionally a no-op integration point.

### Hook payload contract

The host may provide an event JSON object on standard input, but Dysflow does
not define or parse a private payload schema. The bundled scripts consume:

- the current working directory as project context;
- `CLAUDE_PLUGIN_ROOT` or `CODEX_PLUGIN_ROOT` as the plugin root;
- process exit status for success or failure; and
- standard output for concise context injected into the host session.

If an extension needs host event fields, validate them against that host's
published schema and tolerate unknown fields. Do not make a Dysflow hook depend
on an undocumented payload shape.

## Skill format

Put reusable agent instructions in `skills/<skill-name>/SKILL.md`. Use YAML
frontmatter followed by Markdown:

```markdown
---
name: dysflow-protocol
description: Safe operating protocol for Dysflow MCP and Access/VBA work.
triggers:
  - calling a Dysflow MCP tool
  - working with Access or VBA artifacts
---

# Dysflow protocol

Instructions begin here.
```

Keep tool names, flags, defaults, and error codes discoverable from the live
runtime. The skill should require `get_capabilities({})` before a non-trivial
tool sequence rather than copying a registry that can become stale.

## Installation and updates

Released plugin bundles are mirrored to:

| Bundle | Install destination |
| --- | --- |
| Claude Code | `~/.claude/plugins/dysflow` |
| Codex | `~/.codex/plugins/dysflow` |
| OpenCode | `~/.config/opencode/plugins/dysflow` |

`dysflow update` refreshes bundled plugin files atomically and preserves the
agent's `skills/dysflow-protocol` link. Keep generated or user-owned state
outside the mirrored plugin directory.

## Author checklist

- Keep agent adapters thin; business rules belong in `src/core`.
- Keep the MCP server key `dysflow` and private metadata under `_dysflow_*`.
- Point portable bundles at `npx -y dysflow mcp --tools=agent`.
- Treat hook input as host-owned and validate any fields you consume.
- Keep the canonical operating guidance in `skills/dysflow-protocol/SKILL.md`.
- Restart the host, invoke `get_capabilities({})`, and verify the expected
  `adapterVersion` and `toolsVisible`.
- Run the repository checks before publishing:

```powershell
pnpm build
pnpm test
pnpm lint
```
