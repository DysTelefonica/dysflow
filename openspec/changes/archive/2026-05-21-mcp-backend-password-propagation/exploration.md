# Exploration: MCP backendPassword propagation (Issue #263)

## 1) Current behavior (confirmed)

- `dysflow-config.ts` already supports backend credentials through `backendPassword`:
  - Reads `backendPasswordEnv` from project config and from environment aliases `DYSFLOW_BACKEND_PASSWORD` and `ACCESS_VBA_PASSWORD`.
  - Redacts secrets in logs via `REDACTED_SECRET`.
- `scripts/dysflow-access-runner.ps1` currently accepts only `AccessPassword` explicitly and reads `DYSFLOW_ACCESS_PASSWORD` / `ACCESS_VBA_PASSWORD` from environment.
- The PowerShell runner currently opens backend DBs only in two places and both use `OpenDatabase(...)` without `;PWD=...` currently:
  - `scripts/dysflow-access-runner.ps1:294` (`$backendPath`)
  - `scripts/dysflow-access-runner.ps1:443` (`$BackendPath`)
- The MCP adapter (`src/adapters/mcp/tools.ts`) maps MCP tool input into legacy request envelopes through `toLegacy*Request`, and many operations call `comparePath`/`backendPath` aliases as part of localize/link operations.
- In `src/core/runner/access-runner.ts`, PowerShell environment is built only from `accessPassword`; if only `backendPassword` exists, it is not forwarded automatically.

## 2) Problem statement

The effective flow for encrypted backend `.accdb` operations can fail because backend credentials are not consistently conveyed to the Access runner layer. Even though config can hold `backendPassword`, that value is not guaranteed to reach `dysflow-access-runner.ps1` when no `accessPassword` is configured, and even when passed, the script currently does not apply it to backend `OpenDatabase` calls.

## 3) Recommended minimal approach (least risky)

### A) Always propagate backendPassword to the runner execution environment
- Extend `src/core/runner/access-runner.ts` to include `backendPassword` in the PowerShell env (separate from access password), while preserving existing sanitization and redaction behavior.
- Keep env population robust when only backend password exists.

### B) Add backend password consumption in `scripts/dysflow-access-runner.ps1`
- Read backend password from:
  1) explicit parameter (if added), or
  2) environment variable `DYSFLOW_BACKEND_PASSWORD` (fallback), and optionally legacy `ACCESS_VBA_PASSWORD` for compatibility.
- Build backend DAO connect string only for backend opens: `";PWD=$BackendPassword"`.
- Apply connect string to each backend `OpenDatabase` path used by compare/relink/localize/link flows.

### C) Keep public MCP contracts unchanged first
- Favor this environment-driven implementation before any schema-level input extension to minimize downstream breakage with `additionalProperties: false` MCP contracts.

### D) Add/adjust tests
- `test/core/runner/access-runner.test.ts`: ensure backend password is passed through even when access password is absent.
- `test/scripts-access-runner.test.ts`: assert backend open calls are made with `;PWD=` where protected backend is expected.
- Add/extend MCP adapter tests if a direct request passthrough path is required later.

## 4) Alternative considered

- **Schema-level propagation via MCP tool input (`backendPassword` in query/service request objects)**
  - Pros: explicit, per-call override.
  - Cons: wider contract changes, stricter validation with `additionalProperties: false`, and larger test impact.

For this phase, the environment-forwarding + runner-apply strategy is preferred.

## 5) Risk log

- Backend open calls are spread across multiple operations; a partial patch may leave a path unprotected.
- Some scripts currently open backend DBs implicitly for operations that might not need writes; adding a password should not change behavior for unprotected DBs (empty password path remains default `OpenDatabase(path)`).
- Legacy compatibility: existing behavior for unencrypted backends must stay unchanged.

## 6) Hypothesis vs evidence

- **Hypothesis:** encrypted backend failures in issue #263 are caused by not forwarding/using backend credentials in compare/link/relocalization flows.
- **Evidence:** confirmed that config has backend support, but runner env and PowerShell open path do not reliably carry/apply that value.

## 7) Next-step actions (implementation-ready)

1. Patch `src/core/runner/access-runner.ts` to always include backend password in env when present.
2. Patch `scripts/dysflow-access-runner.ps1` to read backend password and apply `;PWD` to backend `OpenDatabase` calls.
3. Run tests around runner + scripts; then add targeted regression test for missing access password + present backend password.
4. Re-scan for all backend `OpenDatabase` invocations before merge.
