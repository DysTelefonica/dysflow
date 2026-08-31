# `verify_form_bindings`

## When to use

Validate form bindings after a layout or behavior change.

```json
{"tool":"verify_form_bindings","arguments":{"sourcePath":"forms/Form_Example.form.txt","schema":{"tables":[]}}}
```

## Result shape

Read binding findings and warnings.

## Safety

The source is read offline; `sourcePath` is canonical.

## Live verification

Confirm this call shape with `describe_tool({name:'verify_form_bindings'})` before using it against a real project.
