# Exploration: mcp-vba-sync-frictions

### Current State
Today, several usability frictions exist in the MCP and VBA synchronization flows:
1. **Destructive removal fails on corrupt modules**: Deleting a module via `delete_module` relies on `VBComponents.Remove`, which fails under COM state corruption (HRESULT 0x800ADEB9) with no fallback or remediation advice.
2. **No orphan auditing**: There is no specialized tool to detect discrepancies between database objects and local disk files (orphans, placeholders, or duplicates).
3. **Inconsistent write-gating**: Write-gating via `MCP_WRITES_DISABLED` is missing on VBA write tools (`delete_module`, `import_modules`, `import_all`, `compile_vba`), and the error message does not name the attempted tool.
4. **Unstructured object list**: `list_objects` returns lists of string names without metadata, type categorization, or path matching.
5. **No inline execution**: Running custom or temporary VBA snippets requires manually creating, importing, running, and then deleting a module.
6. **Bilingual inconsistency**: CLI/PowerShell throws a mix of English and Spanish errors with inconsistent formats.
7. **Opaque HRESULT codes**: When COM/Access errors occur, raw hexadecimal codes are returned to the user without diagnosis or next steps.

---

### Affected Areas
- `scripts/dysflow-vba-manager.ps1` — Needs `-Force` switch on delete, DoCmd.DeleteObject(5) fallback, and error message standardization.
- `src/adapters/mcp/schemas/vba-sync-schemas.ts` — Define schemas for `audit_orphans`, `run_vba_inline`, and update `delete_module`.
- `src/adapters/mcp/dispatch-routes.ts` — Register routes for `audit_orphans` and `run_vba_inline`.
- `src/adapters/mcp/dispatch-factory.ts` — Apply write gate to VBA write tools.
- `src/adapters/mcp/dispatch-common.ts` — Include attempted tool name in `writesDisabled` error message.
- `src/adapters/mcp/tool-parity-registry.ts` — Register `audit_orphans` and `run_vba_inline` as implemented tools.
- `src/adapters/mcp/mcp-tool-registry.ts` — Register new tools in the VBA sync tools array.
- `src/adapters/vba-sync/vba-modules-adapter.ts` — Implement `list_objects` post-processing and `audit_orphans`.
- `src/adapters/vba-sync/vba-execution-adapter.ts` — Implement `run_vba_inline` temporary file creation, import, run, and finally delete flow.
- `src/core/utils/sanitize-error.ts` — Detect HRESULT patterns and append human-readable diagnostics and remediation steps.
- `docs/diagnostics/hresult-guide.md` — Document common HRESULT codes and general troubleshooting.

---

### Approaches

#### 1. Deleting Corrupt Modules (HRESULT 0x800ADEB9)
| Approach | Pros | Cons | Complexity |
|----------|------|------|------------|
| **Option A**: Implement `-Force` switch that falls back to `DoCmd.DeleteObject` and raises clear remediation on failure. | High reliability. Reuse existing Access COM engine. Custom advice on failure helps users recover. | Still runs inside the open session; does not automatically compact and repair the database. | Low |
| **Option B**: Automatically close the database, run `compact_repair`, reopen the database, and retry. | Fully automated recovery from corruption. | High execution time. Side effects on other parallel operations. Potential locks preventing compact. | High |

*Recommendation*: **Option A** is far safer and more standard. Let the user perform compact & repair manually if needed, guided by diagnostic instructions.

#### 2. Inline Execution (`run_vba_inline`)
| Approach | Pros | Cons | Complexity |
|----------|------|------|------------|
| **Option A**: TS-orchestrated temp file creation, import, run, and finally delete. | Leverages existing tested adapters. Decoupled from runner changes. Guarantees cleanup in a `finally` block. | Minor overhead of file writing/deleting. | Medium |
| **Option B**: Inject code dynamically using VBE CodeModule APIs directly in memory. | Avoids disk writes. | Highly unstable. Blocked if "Trust access to the VBA project object model" is disabled in Access. | High |

*Recommendation*: **Option A** is the only reliable option that works in standard locked-down enterprise environments.

---

### Risks
- **Cleanup leak**: If `run_vba_inline` crashes abruptly (e.g., node process killed), the temporary module might not be deleted.
- **Accidental writes**: VBA write-gating must not block dry-runs (`dryRun: true`) which act as read-only operations.

### Ready for Proposal
**Yes** — We can proceed to proposal.
