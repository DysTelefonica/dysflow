# Proposal: MCP Verify Tools

## Intent

Close the first chained slice of legacy MCP parity by making `verify_code`, `verify_binary`, and `reconcile_binary` real, safe tools. They must compare disk VBA source with a temporary Access binary export without modifying the project source or Access database.

## Scope

### In Scope
- Implement `verify_code` and `verify_binary` as non-mutating comparisons from disk source to temporary binary export.
- Implement `reconcile_binary` as a dry-run reconciliation plan with `willModifyAccess:false`.
- Keep selective `moduleNames` and optional `diff` output.
- Include the already-coded `exists` compatibility fix accepting both `name` and `moduleName` if it remains within PR #1.
- Include README guidance and `E2E_testing/**` artifacts used to prove the local MCP E2E workflow, by explicit maintainer decision.

### Out of Scope
- `init_project` and `normalize_documents` implementation.
- Any Access writes, imports, or automatic reconciliation.
- Changing HTTP adapter behavior.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `mcp-stdio-adapter`: advertised legacy MCP tools gain implemented behavior and compatible schemas.
- `access-core-services`: VBA sync legacy service gains safe verify/reconcile comparison contracts.

## Approach

Route the three legacy tool names through `VbaSyncLegacyService`. Export the Access binary to a temporary directory, compare exported module files against configured disk source, return matched/different/missing summaries, and include snippets only when `diff:true`. `reconcile_binary` returns the same comparison shape plus a reconciliation plan and never applies it. Include repo-local `projectId` config resolution in this first slice because MCP calls normally pass only `projectId` and must resolve `.dysflow/project.json` before verify/import/export flows can run. Keep this as chained PR #1 for issues #256-#258, with #255 as tracker.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/services/vba-sync-legacy-service.ts` | Modified | Implement safe verify/reconcile comparison flow. |
| `src/core/config/dysflow-config.ts` | Modified | Resolve matching repo-local `projectId` from `.dysflow/project.json` and reject mismatches. |
| `src/adapters/mcp/tools.ts` | Modified | Expose schemas for verify/reconcile and `exists` aliases. |
| `test/core/services/vba-sync-legacy-service.test.ts` | Modified | Cover non-mutating compare/plan behavior. |
| `test/core/config/dysflow-config.test.ts` | Modified | Cover matching and mismatched repo-local `projectId` behavior. |
| `test/adapters/mcp/tools.test.ts` | Modified | Cover MCP schema/tool registration. |
| `README.md` | Modified | Document AI provisioning and operation cleanup guidance. |
| `E2E_testing/**` | Added | Preserve local E2E MCP harness, exported source, reports, and project config used to validate real Access workflows. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Access export side effects or leaked temp files | Med | Use temporary export roots and assert no source overwrite. |
| Diff output exposes excessive content | Low | Return concise snippets only behind `diff:true`. |
| Slice exceeds review budget | High | Maintainer explicitly requested including README and full E2E artifacts in PR #1; mark as size exception and keep later functionality in chained PRs. |

## Rollback Plan

Revert this chained PR. Tool names remain advertised by prior parity work, but implemented verify/reconcile behavior returns to the previous unimplemented path without data migration.

## Dependencies

- Existing Access/VBA runner and export infrastructure.
- Strict TDD: `pnpm test` and `pnpm build`.

## Success Criteria

- [ ] `verify_code` and `verify_binary` compare disk source with temp binary export and do not mutate source or Access.
- [ ] `reconcile_binary` returns `willModifyAccess:false` with a dry-run plan.
- [ ] `exists` accepts `name` and `moduleName` when included in the slice.
- [ ] E2E/local verification artifacts are included for PR #1; #259 and #260 remain deferred.
