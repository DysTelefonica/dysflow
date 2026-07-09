# Access Form UI Builder Golden Path

1. Start from source artifacts: target `.form.txt`, sibling `.cls`, and caller-supplied CodeGraph-VBA evidence.
2. Run `analyze_form_ui` to identify semantic controls, roles, form events, bindings, and limitations.
3. Run `map_form_behavior` with CodeGraph evidence such as `{ handler, callPath, tables }`.
4. Run `generate_form_design_plan` from the behavior map. Keep operations explicit and reversible.
5. Run `copy_form_ui_pattern` only when a reference pattern is needed; copied intent is a plan input, not a replacement for target behavior.
6. Run `apply_form_design_plan` in dry-run mode first. Use `apply: true` only after reviewing the preview and import gate plan.
7. Run `verify_form_ui` to compare the applied output against the behavior map and source contract.

## Ownership Notes

- Form layout lives in `forms/Form_<Name>.form.txt`.
- Code-behind behavior lives in `forms/<Name>.cls`.
- Verify behavior through the `.cls` and behavior map, not through duplicated `CodeBehindForm` serialization.
- The first implementation accepts CodeGraph evidence payloads supplied by the caller; it does not call another MCP server internally.
