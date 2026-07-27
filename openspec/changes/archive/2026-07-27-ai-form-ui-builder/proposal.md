# Proposal: AI Form UI Builder

## Intent

Add an AI-first workflow for designing and validating Microsoft Access form UIs so contributors can analyze an existing form, map behavior, generate/apply a design plan, copy reference UI patterns, and verify the result without hand-waving.

## Scope

### In Scope
- Define the AI form UI builder workflow end to end.
- Add form analysis and behavior-map capabilities.
- Add design-plan generation/application and reference-pattern copy flows.
- Add AI-focused verification so proposed UI changes stay aligned with the source form behavior.

### Out of Scope
- Runtime product changes unrelated to form UI workflow.
- New Access form business logic or data-layer refactors.
- Broad UI framework changes outside the form-builder path.

## Capabilities

### New Capabilities
- `ai-form-ui-builder`: workflow for analyzing a form, mapping behavior, drafting an implementation plan, applying the plan, copying reference UI patterns, and verifying the result.

### Modified Capabilities
- None

## Approach

- Keep protocol-neutral planning in core/specs; let adapters handle Access/VBA-specific extraction and verification.
- Use the existing form model and behavior-diff foundations as the source of truth for analysis and verification.
- Make the workflow stepwise so each phase can be tested independently under strict TDD.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/specs/` | New | Add specs for the new workflow capability and its sub-capabilities. |
| `src/core/**` | Modified | Add/extend use cases and form-analysis primitives as needed. |
| `src/adapters/vba-sync/**` | Modified | Wire Access form inspection, design-plan application, and verification boundaries. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Overfitting the workflow to one form shape | Med | Base behavior on form model + diffs, not screenshots or one-off heuristics. |
| Accidentally changing form behavior while improving UI flow | Med | Keep verification behavior-driven and gated by TDD. |
| Scope creep into general UI redesign | Low | Limit first slice to form UI builder workflow only. |

## Rollback Plan

Remove the new change folder and revert any spec/core/adapter deltas that depend on `ai-form-ui-builder`. Existing form sync behavior remains intact because the workflow is additive.

## Dependencies

- Existing form IR, compare, and VBA sync foundations.
- Access form exports/imports available in the repo.

## Success Criteria

- [ ] The workflow is fully specified in OpenSpec.
- [ ] Analysis, planning, application, and verification can be reasoned about as separate slices.
- [ ] Existing form sync behavior stays compatible.
