# Proposal: MCP Hardening and Parity Improvements

## Intent
Address four key security, parity, and robustness issues identified in the MCP adapter audit under the campaign name `mcp-hardening` to ensure the platform is secure, robust, and matches its design specification.

## Scope

### In Scope
- Inline Execution Sanitization: Validate the input code parameter in the `vba_inline_execution` tool using regex blocklisting (checking for declare, shell, createobject, getobject, lib).
- dryRun Defaults Parity: Align tool handlers (`import_modules`, `import_all`, `generate_form`) to default to plan mode (dryRun: true) unless apply is true or dryRun is false.
- SizeLimitTransform Connection Hangs: Refactor `SizeLimitTransform` to destroy/close the stream immediately after emitting a payload size violation error, preventing client hangs.
- listOrphans Signature Alignment: Refactor `listOrphans` to return standard OperationResult instead of throwing raw errors, propagating errors safely.

### Out of Scope
- Refactoring the VBA sync CLI commands beyond the parameters mapping.
- Performance profiling of VBA execution.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- mcp-core: Update stdio size guard and core/adapter error handling contracts.
- vba-sync: Add regex validation for inline execution and adjust dryRun/apply defaults.

## Approach
- Add a regex blocklist validation step in `executeInline` inside `src/adapters/vba-sync/vba-execution-adapter.ts`.
- Update `dryRun` evaluation in handlers/services to explicitly check for `params.apply === true ? false : params.dryRun !== false`.
- Call `this.destroy()` inside `SizeLimitTransform._transform` or `_flush` after pushing the null-id error frame.
- Change the `AccessOrphanCleanupService.listOrphans` return type and update the stdio handler to check the operation result.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/vba-sync/vba-execution-adapter.ts` | Modified | Add code sanitization regex check |
| `src/adapters/vba-sync/vba-modules-adapter.ts` | Modified | Update dryRun default check |
| `src/core/services/vba-form-service.ts` | Modified | Update dryRun default check |
| `src/adapters/mcp/stdio-size-guard.ts` | Modified | Call this.destroy() on limit violation |
| `src/core/operations/access-orphan-cleanup.ts` | Modified | Return OperationResult |
| `src/adapters/mcp/stdio.ts` | Modified | Standardize listOrphans handling |
| `src/adapters/mcp/canonical-handlers.ts` | Modified | Map listOrphans to OperationResult |
| `src/adapters/mcp/result-translation.ts` | Modified | Adjust interface and mappings |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| False positives in VBA validation | Low | Use strict word boundary (`\\b`) checks for blocklisted terms. |
| Client disconnects abruptly | Medium | Disconnect is the correct response to protocol violations like oversize payloads. |

## Rollback Plan
Revert code changes using git revert on the commit.

## Dependencies
None

## Success Criteria
- [ ] VBA inline execution with blocked keywords (Declare, Shell, CreateObject, GetObject, Lib) fails validation.
- [ ] Omitting dryRun and apply flags defaults to plan/dryRun mode.
- [ ] Size guard violation closes the connection rather than leaving it hanging.
- [ ] orphanCleanupService does not throw raw errors and returns OperationResult.
