# `form_set_property`

> **Compatibility-only, non-advertised tool.** Prefer `form_set_properties`, which is advertised on the core surface and can update one or several properties atomically. Keep this example only when maintaining an existing singular-tool integration.

## When to use

Preview a scalar layout or display-property change on a control.

```json
{"tool":"form_set_property","arguments":{"sourcePath":"forms/Form_Example.form.txt","controlName":"cmdSave","propertyName":"Caption","value":"Save","apply":false}}
```

## Result shape

Read the dry-run result before `apply:true`.

## Safety

`propertyName` is canonical; do not set `Name` or protected serialization metadata.

## Live verification

Confirm this call shape with `describe_tool({name:'form_set_property'})` before using it against a real project.
