# Adding an MCP tool

The registration surface for a canonical MCP tool is deliberately distributed. This page is the map.

[Issue #1120](https://github.com/DysTelefonica/dysflow/issues/1120) examined the distribution and kept it:

> Contracts and risks for generated routes are already derived; workflow metadata has defaults and selective curation; schema, routing and descriptions are genuinely different concerns and should remain separate.
>
> Do not create a universal mega-registry or code generator.

That decision stands. What was missing was the map, so contributors discovered the touchpoints by grep and by CI failure. This is that map.

`test/docs/add-a-tool-checklist-1493.test.ts` anchors it: every registry named here is compared against the live advertised surface, so a tool registered in one place and forgotten in another fails the suite rather than shipping half-wired.

## Hand-maintained registration points

Four registries need an entry for every new canonical tool. Each owns one concern.

| Order | File | What it owns |
|---|---|---|
| 1 | `src/adapters/mcp/mcp-tool-registry.ts` (VBA-sync and query slices) or `src/adapters/mcp/modern-tool-registry.ts` (modern slice) | **The name.** Being in one of these is what makes a tool exist. |
| 2 | `src/adapters/mcp/mcp-tool-contracts.ts` | **The result contract** — what the caller gets back, and the summary text that reaches `tools/list`. |
| 3 | `src/core/runtime/commit-flag-registry.ts` | **The write flag.** Which flag commits (`apply`) and which previews. Lives in `core` because `get_capabilities`, schema-rejection remediation, and adapter dispatch all read it. |
| 4 | `src/adapters/mcp/mcp-tool-risks.ts` | **The risk classification** — write class, strict-context and timeout requirements. Most entries derive from defaults; a tool that departs from them needs an explicit exception. |

Pick the registry in step 1 by slice, not by preference. `mcp-tool-registry.ts` carries the VBA-sync and query tools that map to a PowerShell action; `modern-tool-registry.ts` carries tools composed in TypeScript.

## Derived — do not hand-edit

These read from the registries above. Adding a tool name here by hand means the derivation is wrong; fix the derivation instead.

| File | Derives from |
|---|---|
| `src/adapters/mcp/dispatch-routes.ts` | Built with `Object.fromEntries` over the declared names. |
| `src/adapters/mcp/tool-parity-registry.ts` | Derives parity state from `DYSFLOW_MCP_TOOL_NAMES` (this was the point of #1120). |
| `src/adapters/mcp/mcp-tool-risks.ts` defaults | `buildRiskRegistry()` fills the common case; only exceptions are explicit. |

## Also required, but not a registry

- **The input schema** — under `src/adapters/mcp/schemas/`. Keep it small: every property is paid on every `tools/list`, by every client, on every connection. See [#1492](https://github.com/DysTelefonica/dysflow/issues/1492) for the measured cost.
- **The handler** — a tool module in `src/adapters/mcp/`, or an adapter branch for a mapped tool.
- **Workflow metadata** — `src/adapters/mcp/agent-workflow-registry.ts`, when the tool belongs to a phase an agent routes through. Tools inherit sensible defaults, so this is curation rather than a required entry.
- **Focused tests** — behavior at the port, per [the testing philosophy](../testing/testing-philosophy.md). Unit tests must not spawn PowerShell; inject the fake executor and the preflight cleanup.

## Before opening the PR

- `pnpm test` — the anchor test above fails if a registration point was missed.
- `pnpm mcp:context-budget` — the budget gate is shrink-only. A new tool grows `tools/list`; if the baseline moves, that is a deliberate choice to record, not a number to bump quietly.
- Update [the MCP tool reference](./mcp-tools.md). Per `AGENTS.md`, docs ship with the change that makes them true.
