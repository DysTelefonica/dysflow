# Verify Report: hide-mcp-stubs

**Status**: APPROVE FOR MERGE (CRITICAL: 0, WARNING: 2, SUGGESTION: 2)
**Branch**: fix/hide-mcp-stubs (commit 7f54b0c)
**PR**: #299
**Closes**: #298

## Test Results

- Full suite: 35 files / 401 tests — ALL GREEN
- Release matrix gate live output: `Legacy=45, HiddenStubs=2, Modern=5, Visible=48` — matches spec exactly.

## Spec Scenarios Coverage

| Scenario | Status | Evidence |
|---|---|---|
| verify_binary/reconcile_binary NOT in tools/list | PASS | tools.ts:572 + projection filter; visibleCount=48 |
| Visible count is 48 | PASS | release-matrix-gate.test.ts:42 |
| stubCount === 2 | PASS | release-matrix-gate.test.ts:40 |
| Stub names have pending status | PASS | legacy-parity-registry.ts implementedToolNames no longer contains them |
| Parity biconditional holds | PASS | release-matrix-gate.test.ts:89-97 |
| Hidden stub tools callable returning LEGACY_TOOL_NOT_IMPLEMENTED | NOT COVERED — see WARNING W1+W2 |

## CRITICAL — none

## WARNING

### W1: Spec & design claim LEGACY_TOOL_NOT_IMPLEMENTED for tools/call — code does NOT do this
Both names ARE in LEGACY_VBA_SYNC_TOOL_NAMES. With legacyToolService configured, they actually delegate to vba-sync-legacy-service and may return success. The hiding mechanism is correct; only the response-shape claim in spec/design is inaccurate.

### W2: Last spec scenario is uncovered
The biconditional test block only asserts registry status field — does NOT invoke the handler nor assert any response text.

## SUGGESTION

### S1: Update spec to drop the LEGACY_TOOL_NOT_IMPLEMENTED claim
### S2: Commit message inaccuracy — only true when no service configured

## Verdict
APPROVE FOR MERGE. User-facing goal achieved. Warnings flag spec/design wording inaccuracies — follow-up issue recommended but non-blocking.
