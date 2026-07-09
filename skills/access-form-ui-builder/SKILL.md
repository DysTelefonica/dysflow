---
name: access-form-ui-builder
description: "Trigger: Access form UI builder, analyze form UI, behavior map, design plan, pattern copy, verify form UI. Guide AI-safe form UI changes."
license: Apache-2.0
metadata:
  author: "gentleman-programming"
  version: "1.0"
---

## Activation Contract

Use this skill when designing, reviewing, or applying AI-assisted Microsoft Access form UI changes.

## Hard Rules

- Treat `FormIR`, sibling `.cls` code-behind, and caller-supplied CodeGraph-VBA evidence as the source of truth.
- Do not use screenshots as the sole source for behavior-sensitive decisions.
- Do not edit raw `.form.txt` directly in this slice unless routed through an existing mutation+import tool path.
- Keep behavior changes explicit: a UI plan must preserve mapped controls, event handlers, and bindings unless an approved operation says otherwise.
- First implementation boundary: accept CodeGraph-VBA evidence payloads from the caller; do not invoke MCP-to-MCP discovery from inside Dysflow tools.

## Decision Gates

| Situation | Gate |
|---|---|
| Need to understand an existing form | Run semantic analysis before planning. |
| Need behavior-sensitive changes | Require behavior map with CodeGraph-VBA evidence. |
| Copying another form's pattern | Record the reference pattern separately; never overwrite target behavior. |
| Applying a plan | Dry-run first; this slice returns an in-memory application report and does not write form source/binary directly. |
| Verifying output | Compare against the source contract and behavior map, then surface actionable drift. |

## Execution Steps

1. Analyze the target `.form.txt` into semantic controls, roles, events, and bindings.
2. Map behavior by merging form events with caller-supplied CodeGraph-VBA call-path evidence.
3. Generate a design plan that references mapped behaviors and explicit operations.
4. Optionally copy reference pattern intent into the plan inputs without erasing the target map.
5. Surface the plan application report for human review; wire to guarded form tooling only in follow-up slices.
6. Verify applied output against the behavior map and source contract.

## Output Contract

Return analysis, behavior map, plan, application result, or verification report with traceable inputs, warnings, and actionable failures.

## References

- `references/golden-path.md`
