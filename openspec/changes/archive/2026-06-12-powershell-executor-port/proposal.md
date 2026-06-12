# Proposal: PowerShell Executor Port

## Problem

Core runner code still imports concrete PowerShell spawn/executable details. This weakens the clean architecture boundary and makes adapters share a core-owned implementation detail, even though Issue #513 requires a formal `PowerShellExecutor` port with no behavior change.

## Goals
- Define the `PowerShellExecutor` port in `src/core/contracts`.
- Make core depend on the port, not the concrete PowerShell process implementation.
- Move/default concrete spawn wiring to adapter or composition-root ownership.
- Preserve existing runner, timeout, env, stderr progress, and result parsing behavior.

## Non-Goals
- No CLI, MCP, HTTP, or Access runtime behavior change.
- No runner protocol, PowerShell script, or JSON result format change.
- No production runtime install/update work.

## Scope

### In Scope
- Extract/export `PowerShellExecutor` contract from core contracts.
- Replace direct core concrete imports in `AccessPowerShellRunner` with injected port usage.
- Rehome the default PowerShell executor and wire it through composition roots.
- Update tests to verify the port boundary and unchanged behavior.

### Out of Scope
- Broader runner redesign or process lifecycle changes.
- Changing PowerShell executable resolution semantics.
- Refactoring unrelated Access/VBA manager actions.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `access-core-runner`: core runner dependency boundary changes so execution goes through a formal `PowerShellExecutor` port while preserving observable runner behavior.

## Approach

Use the recommended exploration approach: define the port in `src/core/contracts/index.ts`, move concrete `powershell.exe`/spawn implementation out of core ownership, and inject the default executor from CLI/MCP/HTTP/VBA-sync composition sites.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/contracts/index.ts` | Modified | Export formal port/types. |
| `src/core/runner/access-runner.ts` | Modified | Consume injected executor only. |
| `src/core/runner/powershell-executor.ts` | Moved/Removed | Stop owning concrete spawn in core. |
| `src/adapters/**`, `src/cli/**` | Modified | Own default executor wiring. |
| `test/**` | Modified | Port-boundary and behavior-preservation coverage. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Hidden imports keep concrete executor in core | Medium | Search imports and add boundary-focused tests. |
| Behavior drift in env/timeout/progress | Medium | Characterize existing behavior before moving code. |
| Review slice grows beyond budget | Low | Keep to one small refactor PR; split tests only if needed. |

## Expected Review Slice

Single PR under the 400-line review budget: contract extraction, concrete executor relocation, composition wiring, and focused tests.

## Rollback Plan

Revert the PR to restore the existing core helper/import path. No data migration or external configuration rollback is required.

## Dependencies

- GH #513 acceptance criteria.
- Existing Vitest suite and `pnpm build`.

## Success Criteria

- [ ] `PowerShellExecutor` is exported from core contracts.
- [ ] Core no longer imports the concrete PowerShell spawn implementation.
- [ ] Composition roots provide the default executor explicitly.
- [ ] Existing runner behavior remains unchanged under `pnpm test` and `pnpm build`.
