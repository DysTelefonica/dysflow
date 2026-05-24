# Proposal: Address v0.7.5 Technical Debt

## Intent

GitHub issue #295 reported v0.7.5 technical debt across the MCP adapter, install CLI, legacy VBA service, and access-operation core. A validation pass against v0.7.6 confirmed 10 concrete issues — including a WRITE GUARD BUG (`dryRun` parsing inconsistency that lets writes bypass guard logic), a `process.env` bypass that breaks env injection in `toLegacyMaintenanceRequest`, two files over 900 lines with mixed responsibilities, and several lower-severity quality issues. We address them now, before more code accretes on top of these foundations.

## Scope

### In Scope
- Fix `process.env` bypass in `toLegacyMaintenanceRequest` (use injected `env`)
- Extract canonical `resolveDryRun(apply, dryRun)` helper and apply to all 4 sites in `tools.ts`
- Unify `CONTEXT_PROPERTIES` and `CTX` definitions in `tools.ts`
- Harden `sanitizeErrorMessage` UNC-path regex against nested repetition
- Clean test quality issues in `release-matrix-gate.test.ts` (`as any`, ungated `console.log`)
- Remove non-null assertion in `access-operation-preflight.ts`
- Make `InMemoryRegistry` purge `completed`/`cleaned` like `FileRegistry`
- Deduplicate sync/async routing in `dysflow-config.ts`
- Split `vba-sync-legacy-service.ts` (979L) into `vba-form-service.ts` + `vba-source-comparison.ts`
- Extract `cli/install-utils.ts` from `install.ts` (1140L); fix install↔uninstall coupling

### Out of Scope
- Public API or MCP tool surface changes
- New features or behavior changes
- Spec-level requirement changes (this is a pure refactor)
- Deeper architectural reshape of legacy VBA flow (deferred)
- Migration of registry storage format (deferred)

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None. This change is internal refactoring and bug fixes. No spec-level requirements change. Behavior remains identical (with the exception of the `dryRun` write-guard fix, which restores the documented behavior to the dispatch tool).

## Approach

Land the work as **4 stacked PRs to main** under the 400-line budget, in dependency order from smallest/highest-impact to largest:

- **PR 1 — Quick wins** (~71L): items 1, 2, 5, 6, 7, 8, 9. Lowest risk, highest leverage; the `dryRun` fix closes a real write-guard bug.
- **PR 2 — Config dedup** (~50L): item 10. Touches `dysflow-config.ts` only.
- **PR 3 — VBA service split** (~200L): item 3. Extract `vba-form-service.ts` and `vba-source-comparison.ts`; keep public exports stable.
- **PR 4 — Install utils extraction** (~80L): item 4. Extract `cli/install-utils.ts`; uninstall imports from it (not from install).

Each PR follows strict TDD: red test demonstrating the issue (or pinning current behavior), then refactor green. No behavior change outside the documented `dryRun` fix.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/mcp/tools.ts` | Modified | env injection, `resolveDryRun` helper, CTX unification, sanitizer regex |
| `src/adapters/mcp/release-matrix-gate.test.ts` | Modified | Remove `as any`, gate console output |
| `src/core/access-operation-preflight.ts` | Modified | Remove non-null assertion |
| `src/core/access-operation-registry.ts` | Modified | InMemoryRegistry purge parity |
| `src/core/dysflow-config.ts` | Modified | Sync/async routing dedup |
| `src/services/vba-sync-legacy-service.ts` | Modified | Slim down to orchestration |
| `src/services/vba-form-service.ts` | New | Form spec/catalog (~150L) |
| `src/services/vba-source-comparison.ts` | New | Binary comparison (~130L) |
| `src/cli/install.ts` | Modified | Slim down; import from install-utils |
| `src/cli/uninstall.ts` | Modified | Import from install-utils, not install |
| `src/cli/install-utils.ts` | New | Shared FS + command helpers |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `dryRun` fix changes observed behavior for callers relying on broken semantics | Low | Document in PR1 description; the broken path silently allowed writes — fixing it restores documented contract |
| VBA service split breaks downstream imports | Medium | Re-export from `vba-sync-legacy-service.ts` to preserve public surface; run full Vitest suite |
| Install/uninstall coupling change breaks Windows install path | Medium | Strict TDD on install-utils; manual smoke test of install + uninstall on Windows before PR4 merges |
| Stacked PRs land out of order | Low | Each PR independently mergeable to main; conflicts resolved at rebase time |
| Scope creep into "while we're here" refactors | Medium | Tasks phase enforces 400-line budget per slice; reject additions in review |

## Rollback Plan

Each PR is independently revertable via `git revert <merge-commit>` on main. Stacked-to-main order means later PRs do not depend on earlier ones at the file level beyond import paths:
- PR4 revert: restore `install.ts` exports, drop `install-utils.ts`
- PR3 revert: re-inline `vba-form-service.ts` + `vba-source-comparison.ts` into `vba-sync-legacy-service.ts`
- PR2 revert: restore duplicated sync/async routing
- PR1 revert: per-item — each fix is < 20 lines and isolated

No data migration, no config schema change, no public API impact.

## Dependencies

- Strict TDD must remain active (Vitest, `pnpm test`)
- GitHub issue #295 stays open until PR4 merges, then closes with summary

## Success Criteria

- [ ] All 10 confirmed issues resolved with passing tests
- [ ] Each PR lands under 400 changed lines (additions + deletions)
- [ ] `dryRun` write-guard bug closed with a regression test in PR1
- [ ] `vba-sync-legacy-service.ts` under 700 lines after PR3
- [ ] `install.ts` under 900 lines after PR4; `uninstall.ts` no longer imports from `install.ts`
- [ ] Full Vitest suite passes after each PR
- [ ] GitHub issue #295 closes with link to the 4 merged PRs
