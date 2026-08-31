# list_objects — dysflow MCP

## When to use

Inventory everything in the active Access binary: forms, reports, modules, class modules, tables (local), saved queries.

## Prerequisites

None. Read-only.

## Call

```json
{
  "tool": "list_objects",
  "arguments": {
    "filter": "form"
  }
}
```

- `filter` (optional) — restrict to one kind: `"form"`, `"report"`, `"module"`, `"class"`, `"table"`, `"query"`, `"macro"`.

## Anti-patterns for this call

- Don't assume `filter` is mandatory or that omitting it returns the same shape as a filtered call. Unfiltered returns every kind with a `kind` discriminator on each entry.
- Don't rely on `list_objects` for runtime-only state (form open instances, current users). It's a catalog of the binary; transient state is invisible to it.
- Don't pass a `filter` value you haven't first seen in the runtime's documented enum. Unknown filters return `MCP_INPUT_INVALID`.

## Result shape (what the agent reads back)

- `objects[]` — one entry per object: `{ name, kind, modified, size }`.
- `count` — total objects.
- `warnings[]` — non-fatal issues.

## Live verification

```bash
get_capabilities  # confirm the tool exists in writeClassToolsPermitted or its read-only counterparts
```

## Cross-reference

- Anti-patterns: `assets/anti-patterns.md#bootstrap-call-discipline`
- Error codes: `references/error-codes.md#MCP_INPUT_INVALID`
- Companion: `assets/examples/query-execute.md` for SQL-level inventory (`list_tables`, `list_links`).
