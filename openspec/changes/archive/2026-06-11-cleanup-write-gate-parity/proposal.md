# Proposal: Cleanup Write-Gate Parity

## Intent

Problem: HTTP `/access/cleanup` can execute `force: true` cleanup while HTTP writes are disabled, unlike MCP. This weakens the explicit safety contract from issue #511.

Goal: make HTTP cleanup match MCP: non-force cleanup remains allowed for terminal/failed Dysflow-owned operations, while only `force: true` requires writes to be enabled.

## Scope

### In Scope
- Gate HTTP `/access/cleanup` only when `force: true` and writes are disabled.
- Preserve the core cleanup service ownership/status checks and the safe non-force recovery path.
- Add adapter-level parity tests for HTTP and keep MCP behavior as baseline.
- Document the explicit force-only write-gate contract.

### Out of Scope
- Changing core cleanup eligibility rules or ownership validation.
- Disabling all cleanup when writes are disabled.
- Changing unrelated HTTP/MCP write tools or Access process cleanup semantics.
- Release automation.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `http-api-adapter`: `/access/cleanup` must enforce the same force-only write gate as MCP.

## Approach

Use the shared-parity approach from exploration: keep cleanup safety rules in `AccessOperationCleanupService`, and make adapter entry points enforce one consistent `force: true` write gate before calling the service. Prefer a small shared adapter helper if it reduces drift without pulling HTTP concerns into core.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/http/server.ts` | Modified | Reject `force: true` cleanup when HTTP writes are disabled. |
| `src/adapters/mcp/canonical-handlers.ts` | Reference | Existing MCP behavior remains the parity baseline. |
| `test/adapters/http/server.test.ts` | Modified | Add force-blocked and non-force-allowed cleanup cases. |
| `test/adapters/mcp/tools.test.ts` | Modified/Reference | Preserve or clarify MCP parity tests. |
| `README.md`, `docs/api/http-api.md`, `AGENTS.md` | Modified | Document force-only cleanup write gate. |
| `openspec/specs/http-api-adapter/spec.md` | Modified | Formalize HTTP cleanup parity requirement. |

## Success Criteria

- [ ] HTTP rejects `/access/cleanup` with `force: true` when writes are disabled.
- [ ] HTTP still allows non-force cleanup requests to reach core cleanup checks when writes are disabled.
- [ ] MCP behavior remains unchanged and covered.
- [ ] Docs state: only `force: true` cleanup is write-gated.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Non-force cleanup becomes accidentally gated | Medium | Test non-force allowed path explicitly. |
| HTTP and MCP drift again | Medium | Share gate helper or mirror tests at both ports. |
| Docs imply “all cleanup requires writes” | Low | Update contract wording in all affected docs. |

## Expected Review Slice

Single focused PR under the 400-line review budget: one HTTP gate change, parity tests, docs, and delta spec. If shared-helper extraction grows beyond the budget, split helper extraction first and HTTP parity second.

## Rollback Plan

Revert the HTTP gate/tests/docs/spec delta. This restores prior HTTP behavior while leaving MCP and core cleanup logic unchanged.

## Dependencies

- Issue #511 contract decision: only `force: true` requires writes; non-force cleanup remains allowed.
