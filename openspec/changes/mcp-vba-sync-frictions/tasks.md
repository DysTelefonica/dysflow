# Tasks: Resolve MCP and VBA Synchronization Frictions

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 450-650 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Split into Foundation, Core, and Test layers |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units
| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| Foundation | Set up schemas, write-gating, and error translation stub | PR 1 | Base infrastructure |
| Core Implementation | Implement delete fallback, orphan audit, and inline exec | PR 2 | Main functionality |
| Testing & Verification | Pester fixes, integration & E2E tests, documentation | PR 3 | Validation |

## Phase 1: Foundation / Infrastructure
- [x] 1.1 Update `vba-sync-schemas.ts` to define inputs/outputs for `vba_orphan_audit` and `vba_inline_execution`.
- [x] 1.2 Register tools in `dispatch-routes.ts`, `tool-parity-registry.ts`, and `mcp-tool-registry.ts`.
- [x] 1.3 Gate `delete_module`, `import_modules`, `import_all`, `compile_vba` in `dispatch-factory.ts`.
- [x] 1.4 Update `writesDisabled` in `dispatch-common.ts` to accept and include the blocked tool name.
- [x] 1.5 Add bilingual HRESULT translation lookup structure in `src/core/utils/sanitize-error.ts`.

## Phase 2: Core Implementation
- [x] 2.1 Catch HRESULT 0x800ADEB9 in `Remove-AccessObjectOrComponent` and fallback to `DoCmd.DeleteObject` when `Force` is enabled in `dysflow-vba-manager.ps1`.
- [x] 2.1a Expose `force` through the MCP `delete_module` tool so the fallback is reachable: add `force` to the `delete_module` schema, pass it through the mapping, and serialize boolean `extra` values as bare PowerShell switches (`-Force`, never `-Force true`).
- [x] 2.2 Revert `Invoke-ExportAction` try/catch regression in `dysflow-vba-manager.ps1` to propagate exceptions.
- [x] 2.3 Implement `audit_orphans` inside `src/adapters/vba-sync/vba-modules-adapter.ts`.
- [x] 2.4 Implement `vba_inline_execution` with guaranteed cleanup try-finally blocks in `src/adapters/vba-sync/vba-execution-adapter.ts`.

## Phase 3: Testing / Verification
- [x] 3.1 Stub `Get-AccessObjectNames` and `Resolve-AccessObjectInfo` in `dysflow-vba-manager.Tests.ps1` to fix existing Pester tests.
- [x] 3.2 Write Pester tests for error accumulation in `Invoke-DeleteAction` and non-mutation in `Invoke-ExistsAction`.
- [x] 3.3 Write Vitest unit tests for write-gating, HRESULT translations, orphan auditing, and `delete_module` force serialization.
- [x] 3.4 Write E2E integration tests compiling and executing a temporary VBA snippet, ensuring proper cleanup. (`test/e2e/vba-inline-execution.e2e.test.ts` — runs under the integration config; requires Windows + Access COM.)

## Phase 4: Documentation / Cleanup
- [x] 4.1 Document HRESULT details and general troubleshooting steps in `docs/diagnostics/hresult-guide.md`.
- [x] 4.2 Verify clean linting and formatting across all modified TypeScript files. (One pre-existing, unrelated Biome warning remains in `access-operation-preflight.ts:287`, outside this change — left untouched.)

## Phase 5: Fresh-context review fixes (pre-PR)
- [x] 5.1 **Security**: close write-gate bypass — `import_modules`/`import_all` were gated only when `dryRun:false` was explicitly passed, but the PS manager has no import dry-run so omitting `dryRun` (default `true`) bypassed the gate while still writing. Moved both into `vbaWriteToolsAlwaysWrite` so the gate always fires. (`dispatch-factory.ts`, RED test in `vba-sync-frictions-infra.test.ts`).
- [x] 5.2 Fix wrong signed-decimal for HRESULT `0x800ADEB9` in `sanitize-error.ts` (`-2146824519` → `-2146771271`); the bilingual remediation was silently dropped when .NET rendered the COMException as decimal. RED test added.
- [x] 5.3 `executeInline` cleanup now passes `force:true` to `delete_module` so a temp `_inline_*` module that hits `0x800ADEB9` during cleanup does not leak into the binary.
- [x] 5.4 `auditOrphans` now cross-references VBE names and disk files case-insensitively (VBA identifiers are case-insensitive); previously a VBE re-cased name vs disk file produced two false orphans. RED test added.
- [ ] 5.5 (Follow-up issue) `run_vba_inline` guardrails: 1KB code cap + 30s timeout ceiling. Also note: inline `${code}` injection breaks multi-procedure snippets containing `End Sub`; `destinationRoot` is caller-overridable (path-containment); PS `RunCommand(4)` compact-mid-session needs E2E validation on real Access.
