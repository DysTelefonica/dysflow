# Access Form UI Builder Golden Path

1. Start from source artifacts: target `.form.txt`, sibling `.cls`, and CodeGraph-VBA evidence (caller-supplied OR auto-fetched).
2. Run `analyze_form_ui` to identify semantic controls, roles, form events, bindings, and limitations.
3. Run `map_form_behavior` to merge FormIR with CodeGraph-VBA evidence. Two equivalent paths:
   - **Explicit (default)**: `map_form_behavior({ sourcePath, codegraphEvidence: [...] })` — caller supplies the call-path payloads.
   - **Internal fetch (issue #830 opt-in)**: `map_form_behavior({ sourcePath, autoFetchCodeGraph: true })` — dysflow invokes codegraph-vba internally (one-way boundary), probing `.codegraph-vba/` before `.codegraph/`, merging with any caller-supplied evidence, and returning the selected directory as `codegraphIndexPath`. Graceful fallback on any invoker failure.
4. Run `generate_form_design_plan` from the behavior map. Keep operations explicit and reversible.
5. Run `copy_form_ui_pattern` only when a reference pattern is needed; copied intent is a plan input, not a replacement for target behavior.
6. Run `apply_form_design_plan` in dry-run mode first. Use `apply: true` only after reviewing the preview and import gate plan.
7. Run `verify_form_ui` to compare the applied output against the behavior map and source contract.

## Ownership Notes

- Form layout lives in `forms/Form_<Name>.form.txt`.
- Code-behind behavior lives in `forms/<Name>.cls`.
- Verify behavior through the `.cls` and behavior map, not through duplicated `CodeBehindForm` serialization.
- The `autoFetchCodeGraph` flag is the only public surface where the no-MCP-to-MCP boundary is relaxed (dysflow → codegraph-vba, one-way only). When unset or false, the original caller-supplied contract is preserved exactly.
