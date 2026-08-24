# `copy_form_ui_pattern`

## When to use

Generate advisory UI-pattern operations from a `map_form_behavior` result; it does not import a form.

```json
{"tool":"copy_form_ui_pattern","arguments":{"behaviorMap":{"formName":"Form_Example","controls":[{"name":"cmdSave","type":"CommandButton","role":"action","events":["OnClick"],"bindings":[],"codegraphEvidence":[]}],"formEvents":[],"unmappedEvidence":[],"warnings":[]},"referencePattern":{"sourceForm":"Form_Reference","intent":"Keep the save action visually consistent","mappedControls":{"cmdSave":"cmdSave"}}}}
```

## Result shape

Read the generated operations and warnings; pass a reviewed plan to `apply_form_design_plan` separately.

## Safety

`behaviorMap` requires `formName`, `controls`, `formEvents`, `unmappedEvidence`, and `warnings`; the reference pattern requires `sourceForm`, `intent`, and `mappedControls`.

## Live verification

Confirm this call shape with `describe_tool({name:'copy_form_ui_pattern'})` before using it against a real project.
