# `render_form_preview`

## When to use

Render an offline form source for visual inspection without opening Access.

```json
{"tool":"render_form_preview","arguments":{"sourcePath":"forms/Form_Example.form.txt","outputMode":"summary","viewportScale":1}}
```

## Result shape

Read the preview payload and compare renders with `diff_form_preview`.

## Safety

This tool is read-only.

## Live verification

Confirm this call shape with `describe_tool({name:'render_form_preview'})` before using it against a real project.
