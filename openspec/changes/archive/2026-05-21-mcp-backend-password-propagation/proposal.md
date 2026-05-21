# Proposal: MCP Backend Password Propagation

## Intent

Address issue #263 by ensuring `backendPassword` configured in Dysflow resolves through the core runner execution path and is applied by the PowerShell backend maintenance logic when opening backend `.accdb` files.

## Scope

### In Scope
- Propagate `backendPassword` from resolved config to the PowerShell runner environment, independent of `accessPassword` presence.
- Update `scripts/dysflow-access-runner.ps1` to consume backend credentials and apply backend password in the `OpenDatabase` calls used by compare/link maintenance actions.
- Add/adjust unit tests for env forwarding and secret redaction.
- Add/adjust test coverage for compare/link maintenance against backend-protected fixtures (or local equivalent), including `relink_tables` and `localize_backend_links` flows.

### Out of Scope
- Changing MCP or HTTP schema contracts to add backend password as a per-call input field in this phase.
- Any non-`backendPassword` Access credential model.
- Broad runner or PowerShell refactors beyond the backend-open call path.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `core-configuration`: Clarify and enforce backend password resolution/precedence and redaction handling for runner-bound operations.
- `access-core-services`: Ensure backend-path operations propagate and apply backend credentials through the runner boundary without leaking secrets.

## Approach

Keep external tool contracts unchanged and implement the minimal-risk path: propagate existing config values through environment variables and only augment backend database open calls with `;PWD=` when `backendPassword` is available.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/runner/access-runner.ts` | Modified | Include backend password in runner environment in `buildPowerShellEnvironment`, preserving existing access-password behavior and redaction flow.
| `src/core/config/dysflow-config.ts` | Verified | No new resolution logic expected; document expected precedence and redaction expectations in spec updates for spec-level contract clarity.
| `scripts/dysflow-access-runner.ps1` | Modified | Read backend password from explicit param/env fallback and apply it only for backend `OpenDatabase` opens.
| `test/core/runner/access-runner.test.ts` | Modified | Add unit tests for backend-only propagation and no-secret diagnostics.
| `test/scripts-access-runner.test.ts` | Modified | Add coverage that backend credentials are resolved via env and applied to backend open calls.
| `test/e2e/access-fixture.e2e.test.ts` | Modified | Add a password-protected backend maintenance flow for `compare_backends` and link maintenance.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Backend password not applied in every backend-open path (`compare_backends`, `relink_tables`, `localize_backend_links`). | Medium | Single helper for backend connection string and explicit review of both `OpenDatabase` callsites.
| Secret leakage in diagnostics/outputs. | Low | Keep existing `sanitizeSecrets` path and expand assertions around redaction for backend credentials.
| Unencrypted backends change behavior unexpectedly. | Low | Apply `;PWD=` only when backend password is actually provided.

## Rollback Plan

Revert `access-runner.ts` env changes and `dysflow-access-runner.ps1` backend open-string logic, then remove or revert related unit/E2E test adjustments.

## Dependencies

- Existing `pnpm test` and `pnpm build` scripts (strict TDD enabled).

## Success Criteria

- [ ] Comparison and link-maintenance operations succeed against encrypted backends when only `backendPassword` is set.
- [ ] `DYSFLOW_BACKEND_PASSWORD` / legacy alias continues to work when `accessPassword` is missing.
- [ ] Test assertions verify backend password never appears in stderr/stdout diagnostics.
- [ ] Unit + e2e tests cover the propagation path before production changes (RED → GREEN in strict TDD flow).
