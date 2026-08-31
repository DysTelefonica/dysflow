# `count_rows`

## What it does

Counts records in one Access table without returning the table contents. Use `target:"auto"` when
the configured frontend/backend pair should be probed by table name; an ambiguous match fails
instead of choosing silently.

## Call

```json
{
  "tool": "count_rows",
  "arguments": {
    "target": "auto",
    "tableName": "Orders"
  }
}
```

## Result shape

The structured payload contains `rows`, normally one record with `RowCount`. Read the value as
`rows[0].RowCount`; keep the top-level `dysflow.result/v1` envelope check separate from the tool
payload.

## Anti-patterns

- Do not add `apply`: `count_rows` is read-only.
- Do not use the deprecated `table` alias in new calls; use `tableName`.
- Do not replace this bounded count with `query_sql` that selects every row.

## Live verification

Call `bootstrap({phase:"sql"})`, route through `schema({view:"index"})`, then confirm the current
parameters with `describe_tool({name:"count_rows"})`. Run the read and compare `RowCount` with a
known fixture or an independently bounded `SELECT COUNT(*)` only when the target is unambiguous.

## Cross-reference

See [`distinct_values`](./distinct-values.md) for column sampling and the
[query family map](../../references/agent-friction-map.md#query-and-schema-reads) for tool choice.
