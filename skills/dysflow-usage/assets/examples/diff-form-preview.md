# `diff_form_preview`

## When to use

Compare two offline form sources or previews before changing a layout.

```json
{"tool":"diff_form_preview","arguments":{"beforePath":"forms/Form_Example.before.form.txt","afterPath":"forms/Form_Example.after.form.txt","outputMode":"summary"}}
```

## Result shape

Read the returned difference summary.

## Safety

This is read-only; invalid aliases fail with `MCP_INPUT_INVALID`.

## Live verification

Confirm this call shape with `describe_tool({name:'diff_form_preview'})` before using it against a real project.
