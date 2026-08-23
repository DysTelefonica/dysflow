# `form_set_property`

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
