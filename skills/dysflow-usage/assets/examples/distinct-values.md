# `distinct_values`

## What it does

Returns the distinct observed values for one table column. It is a data-inspection tool, not proof
of the column's declared type or allowed domain.

## Call

```json
{
  "tool": "distinct_values",
  "arguments": {
    "target": "auto",
    "tableName": "Orders",
    "columnName": "Status"
  }
}
```

## Result shape

The structured payload contains `rows`; each record exposes the selected value as `Value`. Empty
`rows` means no values were returned, while a record whose `Value` is null represents an observed
null and must not be collapsed into the empty case.

## Anti-patterns

- Do not add `apply`: `distinct_values` is read-only.
- Do not use deprecated `table` or `column` aliases in new calls.
- Do not infer constraints from observed values; use `get_schema` for declared metadata.

## Live verification

Call `bootstrap({phase:"sql"})`, inspect `schema({view:"index"})`, and refresh
`describe_tool({name:"distinct_values"})`. Verify the returned set against a controlled fixture;
do not treat production observations as an exhaustive enumeration of future values.

## Cross-reference

See [`get_schema`](./get-schema.md) for declared column metadata and the
[query family map](../../references/agent-friction-map.md#query-and-schema-reads) for routing.
