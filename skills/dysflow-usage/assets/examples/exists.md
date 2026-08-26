# `exists`

## What it does

Inspects how a named VBA component appears in Access and in the VBE. This is more informative than
a single boolean because forms and reports can have both an Access object and a document module.

## Call

```json
{
  "tool": "exists",
  "arguments": {
    "moduleName": "Form_Customers"
  }
}
```

## Result shape

The structured payload reports `moduleName`, `accessObjectExists`, `accessObjectKind`,
`accessObjectName`, `vbComponentExists`, `vbComponentName`, `isDocumentModule`, and
`suggestedImportMode`. Evaluate the paired fields together instead of reducing them to one
existence flag.

## Anti-patterns

- Do not add `apply`: `exists` is read-only.
- Do not assume an Access object and its VBE document module share the same display name.
- Do not choose an import mode from the filename alone; use `suggestedImportMode` as evidence.

## Live verification

Call `bootstrap({phase:"sync"})`, inspect `schema({view:"index"})`, and refresh
`describe_tool({name:"exists"})`. Cross-check positive results with `list_vba_modules` when the
next action depends on actual binary source bytes.

## Cross-reference

See [`list_vba_modules`](./list-vba-modules.md) for binary inventory and the
[source/binary family map](../../references/agent-friction-map.md#source-and-binary-investigation).
