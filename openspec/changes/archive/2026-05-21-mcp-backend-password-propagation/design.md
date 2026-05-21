# Design: MCP Backend Password Propagation

## Approach

Implement backend credential propagation at the existing runner boundary only. Core/config already resolves `backendPassword` and redaction behavior; this design extends that resolved value into PowerShell execution context and updates backend `OpenDatabase` calls to consume it.

No adapter contracts change in this slice. MCP remains the same transport and request shape; only the existing core runner pipeline and script behavior change.

## Component Map

### Config-to-Runner Path

- `src/core/runner/access-runner.ts`
  - Keep the current runner request contract intact.
  - Extend `buildPowerShellEnvironment` to include `DYSFLOW_BACKEND_PASSWORD` (resolved from config/env fallback) while preserving existing `DYSFLOW_ACCESS_PASSWORD` behavior.
  - Keep redaction in result surfaces.

- `scripts/dysflow-access-runner.ps1`
  - Read backend password from `$env:DYSFLOW_BACKEND_PASSWORD` (or its current legacy equivalent where already used).
  - For backend `OpenDatabase` operations, append `;PWD=<password>` only when a backend password is present.
  - Leave frontend Access open path unchanged.

- `test/core/runner/access-runner.test.ts`
  - Add/adjust tests for env forwarding and redaction when `backendPassword` is present.

- `test/scripts-access-runner.test.ts`
  - Assert command script text contains the expected backend password consumption path and includes redaction-oriented expectations.

- `test/e2e/access-fixture.e2e.test.ts`
  - Add/adjust fixture case validating compare/relink/localize operations against password-protected backend data.

## Data Flow

1. Operation request enters access-core-service (e.g., `compare_backends`, `relink_tables`, `localize_backend_links`).
2. Core service resolves request config (including backend password, explicit or env-based).
3. Runner request is built from resolved config and command parameters.
4. PowerShell script receives backend password via `DYSFLOW_BACKEND_PASSWORD` env.
5. Backend `OpenDatabase` calls are formed with `;PWD=` only when a password exists.
6. On completion, runner output/errors pass through sanitizer/redaction.

## Risks

- We must touch all backend-open call sites used by backend maintenance operations; missing one yields intermittent failures for specific actions.
- Test assertions in `test/scripts-access-runner.test.ts` are sensitive to script string ordering; keep assertions narrow to avoid brittle snapshots.

## Out of Scope

- Adding new MCP tool arguments for backend password (transport-level changes) in this issue.
- Refactoring the PowerShell script beyond backend open-string handling for this flow.
- Changing credential storage strategy or introducing new secret types.

## Success Evidence

- Unit tests verify forwarding and redaction behavior for env construction.
- Script tests verify backend password is consumed from env and only used in backend open points.
- E2E fixture demonstrates encrypted-backend compare/link maintenance works with configured backend password.
