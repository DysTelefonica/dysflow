# `bootstrap`

## What it does

Returns the minimal first-call runtime snapshot without resolving a project,
opening Access, spawning PowerShell, or mutating state.

## When to use

Call it once before diagnosis, static-file inspection, or any non-trivial
Dysflow sequence. Route from its workflow map into `schema({"view":"index"})`.

## Required flags

None. This tool is read-only and accepts only optional routing context.

## All input properties

Derive the current list from `schema({"view":"full","toolName":"bootstrap"})`.
The common call needs no input properties.

## Call shape

```json
{
  "tool": "bootstrap",
  "arguments": {}
}
```

## Result shape

Read `adapterVersion`, both write gates, `writeExecutionPolicy`,
`toolInventory`, `toolSurface`, `preferredAgentWorkflows`, and
`humanCompilePending`. Legacy `toolsVisible` is the advertised count here;
`toolInventory` states both callable and advertised counts explicitly.

## Common errors

| Code | Description | Fix |
|---|---|---|
| `MCP_INPUT_INVALID` | An unsupported property was supplied. | Retry with `{}` or inspect the full schema. |

## Cross-reference

- `../../SKILL.md` — progressive discovery contract.
- `schema.md` — bounded callable-tool index.

## TODO before production use

Do not pin the returned counts. Branch on `toolInventory` and the selected
workflow phase from the live candidate runtime.
