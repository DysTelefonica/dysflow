# `analyze_form_layout`

## When to use

Inspect offline layout geometry, alignment signals, and section bounds.

```json
{"tool":"analyze_form_layout","arguments":{"sourcePath":"forms/Form_Example.form.txt","alignmentThresholdTwips":60}}
```

## Result shape

Read layout findings before selecting an alignment or movement operation.

## Safety

This tool is offline and read-only.

## Live verification

Confirm this call shape with `describe_tool({name:'analyze_form_layout'})` before using it against a real project.
