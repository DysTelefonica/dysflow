# Import Modules — Verify Functional Control Properties

## Problem

Access `SaveAsText` may omit functional ComboBox and ListBox properties when they hold their default value. A successful `import_modules` response therefore does not by itself prove that a control-property change is present in the binary. After an import that adds or changes a property, use `verify_code` and inspect `actionableDifferent` before treating the sync as complete.

## Verify control properties after import

```json
{
  "projectId": "my-project",
  "moduleNames": ["Form_Customer"],
  "importMode": "auto"
}
```

Then run the read-only verification:

```json
{
  "projectId": "my-project",
  "moduleNames": ["Form_Customer"]
}
```

A dropped property is reported in `actionableDifferent` with `category: "control-property-mismatch"`, the control and property names, and the source/binary values:

```json
{
  "category": "control-property-mismatch",
  "controlName": "cmbStatus",
  "propertyName": "BoundColumn",
  "sourceValue": "1",
  "binaryValue": null
}
```

Do not add `compile:true`. The human must compile the Access project manually in the VBE after a successful import and before running VBA tests.

## Curated default-value allow-list

For ComboBox and ListBox exports, Dysflow preserves these functional properties even when Access serializes their default value:

- `BoundColumn`
- `ColumnCount`
- `ColumnHeads`
- `RowSource`
- `ColumnWidths`
- `Format`
- `StatusBarText`
- `ListRows`
- `ListWidth`

Other control types and properties retain the existing SaveAsText behavior. Serialization noise such as `Checksum` remains non-actionable.
