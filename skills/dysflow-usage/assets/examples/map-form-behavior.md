# `map_form_behavior`

## When to use

Combine form analysis and CodeGraph evidence before a UI change so events and bindings can be preserved.

```json
{"tool":"map_form_behavior","arguments":{"sourcePath":"forms/Form_Example.form.txt","codegraphEvidence":[]}}
```

## Result shape

The returned `FormUiBehaviorMap` has `formName`, `controls`, `formEvents`, `unmappedEvidence`, and `warnings`.

## Safety

An empty evidence array is valid, but inspect warnings rather than claiming behavior was mapped.

## Live verification

Confirm this call shape with `describe_tool({name:'map_form_behavior'})` before using it against a real project.
