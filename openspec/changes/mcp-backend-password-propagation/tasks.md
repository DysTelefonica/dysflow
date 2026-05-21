# Tasks: MCP Backend Password Propagation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 180–260 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked-to-main
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Add spec/proposal/design artifacts + focused tests + implementation path for backend password propagation | PR 1 | End-to-end for issue #263 |

---

## Phase 1: Baseline and Test-First Failures (Red)

- [x] 1.1 In `test/core/runner/access-runner.test.ts`, add a test that asserts backend password is forwarded in `PowerShellRunnerRequest.environment` as `DYSFLOW_BACKEND_PASSWORD` even when `accessPassword` is absent.
- [x] 1.2 In `test/core/runner/access-runner.test.ts`, add/extend redaction assertion for backend password in runner diagnostics failures.
- [x] 1.3 In `test/scripts-access-runner.test.ts`, add a test that verifies backend password is sourced from `DYSFLOW_BACKEND_PASSWORD` (or legacy `ACCESS_VBA_PASSWORD` alias) and applied to backend `OpenDatabase` connect strings.

## Phase 2: Runner Environment Propagation

- [x] 2.1 In `src/core/runner/access-runner.ts`, update `buildPowerShellEnvironment` / request builder to include `DYSFLOW_BACKEND_PASSWORD` from resolved config.
- [x] 2.2 Ensure precedence remains: explicit resolved config value wins; explicit `accessPassword` and backend password are independent values and passed on separately.
- [x] 2.3 Ensure existing sanitize/redaction flow still masks both access and backend secrets in error/detail output.

## Phase 3: Script OpenDatabase Wiring

- [x] 3.1 In `scripts/dysflow-access-runner.ps1`, add backend password resolution (`$env:DYSFLOW_BACKEND_PASSWORD` and legacy `ACCESS_VBA_PASSWORD` fallback) into local variable.
- [x] 3.2 In backend `OpenDatabase` invocation(s), apply `;PWD=<resolvedBackendPassword>` only when the backend password is available.
- [x] 3.3 Leave frontend/primary DB open path unchanged unless explicitly part of existing access password flow.

## Phase 4: Coverage Across Backend Maintenance Operations

- [x] 4.1 In `test/core/runner/access-runner.test.ts`, add/verify per-operation coverage for `compare_backends` with backend-protected fixture and valid backend password.
- [x] 4.2 In `test/e2e/access-fixture.e2e.test.ts`, add an e2e case for `compare_backends` against password-protected backend fixture driven by backend password env.
- [x] 4.3 Add/extend e2e coverage for one of `relink_tables` or `localize_backend_links` on a protected backend.

## Phase 5: Verification

- [x] 5.1 Run `pnpm test` (or targeted suite first, then full `pnpm test`).
- [x] 5.2 Run `pnpm build`.
- [x] 5.3 Check acceptance: encrypted backend compare/relink/localize operations succeed and secrets are still shown as `[REDACTED]` in diagnostics (blocked in CI without Access/fixture).
