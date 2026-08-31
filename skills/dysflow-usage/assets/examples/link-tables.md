# link_tables — dysflow MCP

## When to use

Plan or apply backend TableDef linking in a frontend Access database. The default only refreshes
links that already exist. Creation is always an explicit opt-in.

## Plan missing and existing links

```json
{
  "tool": "link_tables",
  "arguments": {
    "mode": "create-or-relink",
    "tableNames": ["Customers", "Orders"],
    "apply": false
  }
}
```

- The mode field is `"relink-only"` by default; use `"create-or-relink"` to create missing linked
  TableDefs as well as refresh existing links.
- `tableNames` — optional backend-table filter. Omit it to target all existing frontend links in
  relink-only mode or all backend tables in create-or-relink mode.
- `apply` — `false` plans without writing and is the default; pass `true` explicitly to commit.
  The live runtime exposes no write-intent compatibility alias; use `apply`.

## Result shape

Read the per-table actions: **create-link**, **relink**, **skip**, **skip-local**, or **error**. A requested
name absent from the backend produces `BACKEND_TABLE_NOT_FOUND`. The batch uses partial-success
semantics, so one table failure does not abort unrelated tables. Re-applying is idempotent: an
already linked table is relinked, never duplicated. Connection credentials are never returned in
the plan or result.

## Anti-patterns

- Do not expect the default mode to create missing links.
- Do not apply before reviewing the dry-run actions.
- Use `apply:true` as the commit shape.

## Live verification

Run `get_capabilities` and confirm the effective dry-run default before applying.
