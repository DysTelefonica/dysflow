# Proposal: Windows Process Adapters

## Problem

`src/core/operations/windows-processes.ts` owns concrete `node:child_process`-backed Windows process implementations. This violates the core/adapters dependency boundary: core should define ports and parsing contracts, while adapters own OS process spawning. GH #514 requires moving the implementations with no observable cleanup behavior change.

## Goals

- Move Windows process inspector, killer, scanner, and PowerShell process helpers into `src/adapters/process/`.
- Keep process-related ports in core, especially `src/core/operations/access-operation-cleanup.ts`.
- Preserve existing MSACCESS scan, inspect, cleanup, parsing, fallback, and error behavior.
- Keep the review slice under the 400-line budget if practical.

## Non-Goals

- No new cleanup features, CLI flags, MCP tools, or HTTP behavior.
- No Access/VBA binary sync changes.
- No broad runner or PowerShell executor redesign beyond process adapter ownership.

## Scope

### In Scope
- Add adapter-owned Windows process module and update composition roots.
- Remove concrete `child_process` imports from core process code.
- Relocate/update focused tests so behavior remains covered at the adapter boundary.

### Out of Scope
- Changing port names or public cleanup tool contracts.
- Altering PowerShell script text except as required by relocation.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `access-core-runner`: clarify that Windows process scan/inspect/kill implementations are adapter-owned while core retains ports and observable normalization requirements.

## Approach

Use the exploration-recommended direct module move: create `src/adapters/process/windows-processes.ts`, move the concrete classes and helpers there, delete the core implementation module, and repoint `access-runner`, HTTP, MCP stdio, and VBA-sync preflight wiring.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `src/core/operations/windows-processes.ts` | Removed | Concrete implementation leaves core. |
| `src/adapters/process/windows-processes.ts` | New | Adapter-owned Windows process implementation. |
| `src/core/runner/access-runner.ts` | Modified | Composition import switches to adapter. |
| `src/adapters/http/http-services-factory.ts` | Modified | Wiring uses adapter module. |
| `src/adapters/mcp/stdio.ts` | Modified | MCP wiring uses adapter module. |
| `src/adapters/vba-sync/vba-operations-adapter.ts` | Modified | Preflight dynamic import moves. |
| `test/**/windows-processes.test.ts` | Modified | Tests follow adapter ownership. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Hidden core imports remain | Med | Add/keep dependency-boundary checks. |
| Behavior drift in PowerShell fallback | Med | Preserve strings and assert existing cases. |
| Review slice grows from import churn | Low | Keep to relocation/wiring only; defer unrelated cleanup. |

## Expected Review Slice

One PR, target `main`, expected ~250-380 changed lines; chained PR only if tests/specs push the diff above 400 lines.

## Rollback Plan

Revert the relocation commit to restore the core module and original imports. No data migration, config migration, or Access binary rollback is required.

## Dependencies

- GH #514 context and existing `access-core-runner` spec.

## Success Criteria

- [ ] Core has no `node:child_process` dependency for Windows process implementations.
- [ ] All affected composition roots use the adapter module.
- [ ] Focused process tests, `pnpm test`, and `pnpm build` pass without behavior changes.
