# Proposal: Resolve MCP and VBA Synchronization Frictions

## Intent

Resolve key synchronization and usability frictions in the MCP/VBA flows. This includes improving resilience during COM corruption, auditing orphan/duplicate database components, enforcing consistent write-gating, structuring object list output, and supporting inline VBA execution.

## Scope

### In Scope
- Safe module deletion fallback/remediation advice for HRESULT 0x800ADEB9.
- A new VBA orphan audit capability to detect disk vs. database mismatches.
- Consistent write-gating on VBA write tools (`delete_module`, `import_modules`, `import_all`, `compile_vba`) naming the target tool.
- Rich structured metadata and categorization for `list_objects`.
- Inline execution wrapper for temporary VBA snippets.
- Uniform bilingual error logging and user-friendly translation of COM HRESULT codes.

### Out of Scope
- Automated auto-repair of corrupt Access databases.
- Execution of non-VBA script snippets (e.g. VBScript) via inline execution.

## Capabilities

### New Capabilities
- `vba-orphan-audit`: Audits discrepancies (orphans, duplicates, placeholders) between VBA database objects and local source files.
- `vba-inline-execution`: Compiles and runs temporary/custom VBA snippets on the fly.

### Modified Capabilities
- `vba-manager-actions`: Supports corrupt module deletion fallback, structured list metadata, and error translation.
- `mcp-stdio-adapter`: Enforces consistent write-gating with tool-specific messaging and exposes new tool endpoints.

## Approach

1. **Error/HRESULT Translation**: Implement a map of common Access/COM HRESULT codes to actionable messages. Provide remediation guidance on HRESULT 0x800ADEB9.
2. **Consistent Write-Gating**: Update MCP adapter write check decorator to check all VBA modifying tools and report the attempted tool name.
3. **Structured list_objects**: Return object types, paths, and metadata instead of a flat string list.
4. **Orphan Audit & Snippet Run**:
   - Audit: Scan file systems and compare against VBE/DAO catalogs to identify orphans.
   - Inline run: Wrap snippets in a temporary standard module, execute, and guarantee cleanup.
5. **Strict TDD & E2E Verification**: Apply strict Test-Driven Development (TDD) by writing Vitest tests prior to coding. Verify runtime capabilities with new E2E tests inside the integration test suite.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/services/` | Modified | Add orphan audit service, snippet runner, HRESULT mapper. |
| `src/adapters/mcp/` | Modified | Update write-gating, schema mappings, `list_objects` structure, and add new tools. |
| `scripts/dysflow-vba-manager.ps1` | Modified | Add helper functions for fallback delete and snippet runner wrapper. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Snippet execution leaves residual modules | Medium | Wrap execution in try-finally block in core to guarantee deletion. |
| COM corruption prevents VBE cleanup | High | Provide clear instructions to restart Access or repair DB. |

## Rollback Plan

Revert git changes using `git revert` and re-run standard test suites to verify system restores to baseline behavior.

## Dependencies

- Windows and Access COM presence for E2E tests.

## Success Criteria

- [ ] All new capabilities are implemented using strict TDD, writing Vitest unit tests before code implementation.
- [ ] E2E integration tests verify the correct operation of snippet execution and orphan auditing.
- [ ] Write-gating blocks write commands with tool name in the error message.
- [ ] CORRUPT delete failure returns diagnostic remediation instructions.
