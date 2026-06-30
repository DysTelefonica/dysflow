# Proposal: Fix Codebehind Duplication

## Intent

Fix MS Access document property corruption and duplicated VBA/form headers during import by correctly positioning the CodeBehind marker when normalizing documents with missing markers.

## Scope

### In Scope
- Implement nesting-aware (stack-based) root `End` detection in `Normalize-AccessDocumentOrphanCodeBehindSection` inside `scripts/dysflow-vba-manager.ps1`.
- Add Pester unit tests verifying normalization of orphan code-behind sections containing nested layout blocks to `scripts/tests/dysflow-vba-manager.Tests.ps1`.
- Verify the parser handles malformed nested blocks gracefully without crashing.

### Out of Scope
- Modifying general VBA parser, module compilation, or layout serializations unrelated to orphan normalization.

## Capabilities

> This section is the CONTRACT between proposal and specs phases.
> The sdd-spec agent reads this to know exactly which spec files to create or update.
> Research `openspec/specs/` before filling this in.

### New Capabilities
None

### Modified Capabilities
None

## Approach

Adopt Approach D: Nesting-aware (stack-based) root `End` detection.
- In `Normalize-AccessDocumentOrphanCodeBehindSection`, track layout block nesting by incrementing on `Begin` and decrementing on `End`.
- Insert the CodeBehind marker immediately after the true outer-level `End` (nesting level returns to 0).
- If nesting is malformed, log a warning and fall back to the first `End`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/dysflow-vba-manager.ps1` | Modified | Update `Normalize-AccessDocumentOrphanCodeBehindSection` to use stack-based scan. |
| `scripts/tests/dysflow-vba-manager.Tests.ps1` | Modified | Add Pester test cases for nested control layout block parsing. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Incorrect nesting resolution in malformed layout files | Low | Fall back to first `End` line if nesting becomes mismatched. |

## Rollback Plan

Revert changes to `scripts/dysflow-vba-manager.ps1` and `scripts/tests/dysflow-vba-manager.Tests.ps1` using `git checkout`.

## Dependencies

None

## Success Criteria

- [x] Orphan code-behind normalization correctly places marker after root `End` on files with nested blocks.
- [x] Merge logic generates valid headers without duplicates.
- [x] Pester test suite for normalizer passes.
