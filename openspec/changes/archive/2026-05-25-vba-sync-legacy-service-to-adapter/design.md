# Design: Extract VbaSyncLegacyService to the adapters layer

> Source proposal artifact (`sdd/vba-sync-legacy-service-to-adapter/proposal`) was NOT found in Engram or openspec at design time. This design was derived from the orchestrator brief (issue #314) and direct code inspection. Treat the proposal absence as an open risk.

## Technical Approach

`src/core/services/vba-sync-legacy-service.ts` is an adapter wearing a service costume: it owns `spawnVbaManager` (calls `spawnPowerShellProcess`), `executeWithTimeout`, and `runPreflightCleanup` (Windows process killers). We invert the dependency: core declares a `LegacyVbaSyncPort` (the seam the MCP adapter already injects via `legacyToolService`), and the concrete `VbaSyncLegacyAdapter` moves to `src/adapters/vba-sync/`. The composition root (`stdio.ts`) already constructs it, so wiring stays in adapters. Done in three behavior-preserving slices, each gated by `pnpm test` + `pnpm build` and the existing `core-boundary.test.ts`.

## Architecture Decisions

### Decision: Port shape — reuse the existing injection contract

| Option | Tradeoff | Decision |
|--------|----------|----------|
| New rich `IVbaSyncLegacyService` mirroring the class | Leaks impl detail (options, executor) into core | Rejected |
| Reuse the minimal `legacyToolService` shape already in `DysflowMcpServices` | Single method `execute(toolName, input)`; matches `core-boundary.test.ts` mock | **Chosen** |

**Rationale**: The seam already exists and is tested. Core only needs `execute(toolName: LegacyDysflowMcpToolName, input: unknown): Promise<OperationResult<unknown>>`. Promote that to a named `LegacyVbaSyncPort` type in `src/core/contracts/index.ts`; `DysflowMcpServices.legacyToolService` references it. `LegacyDysflowMcpToolName` lives in the adapter — core port uses `string` to avoid an adapter import (boundary rule).

### Decision: Where the adapter lives and what it wraps

**Choice**: Move the class verbatim to `src/adapters/vba-sync/vba-sync-legacy-adapter.ts`, keeping it as the orchestrator that calls `PowerShellExecutor` indirectly through `spawnVbaManager`.
**Alternatives considered**: Refactor to route through `AccessPowerShellRunner` (the abstraction the rest of core uses). Rejected for THIS change — that is a behavior/contract change, out of scope; tracked as a follow-up. We only move layers here.
**Rationale**: Smallest correct move. Behavior preservation is the contract; the boundary fix is the goal.

### Decision: What stays in core (pure logic)

| Module | Nature | Destination |
|--------|--------|-------------|
| `vba-source-comparison.ts` | Uses `mkdtemp` + executor via injected `VbaComparisonContext` | Stays in core — already abstracted behind a context object |
| `vba-form-service.ts` | Form-spec validation + JSON file write (no PS/process) | Stays in core (form JSON I/O is a domain file concern, not OS process spawning) |
| `buildImportPlanResult`, `parseArgsJson`, test-plan normalizers | Pure | Stays in core (re-export from a core util/service module) |
| `VbaSyncLegacyService` orchestrator + `spawnVbaManager` + preflight | Process spawning | Moves to adapter |

**Rationale**: The expensive coupling is OS process spawning and the `node:os` temp dir for the manager. The comparison/form modules are already injectable and PS-free, so moving them would be churn without boundary benefit.

## Data Flow

    MCP stdio (adapter)
      └─ createConfiguredServices()  [composition root]
           └─ new VbaSyncLegacyAdapter(...)   ← was core, now adapter
                 implements LegacyVbaSyncPort  ← declared in core/contracts
      createDysflowMcpTools(services)
           └─ legacyToolService.execute(name, input)  [core sees PORT only]
                 └─ adapter → spawnVbaManager → spawnPowerShellProcess

Core/contracts ◄──── adapter depends on core (allowed)
Core ──X──► adapter   (forbidden; enforced by core-boundary.test.ts)

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/contracts/index.ts` | Modify | Add `LegacyVbaSyncPort` type (`execute(toolName: string, input: unknown): Promise<OperationResult<unknown>>`) |
| `src/adapters/mcp/tools.ts` | Modify | `DysflowMcpServices.legacyToolService?` references `LegacyVbaSyncPort` |
| `src/adapters/vba-sync/vba-sync-legacy-adapter.ts` | Create | Moved orchestrator class + `spawnVbaManager` + `resolveDefaultVbaManagerScriptPath` |
| `src/core/services/vba-sync-legacy-service.ts` | Delete (PR3) | Class removed; pure exports relocated |
| `src/core/services/vba-form-service.ts` | Keep | Pure; no move |
| `src/core/services/vba-source-comparison.ts` | Keep | Pure (injected context); no move |
| `src/adapters/mcp/stdio.ts` | Modify | Import adapter from `../vba-sync/` instead of core |
| `test/core/services/vba-sync-legacy-service.test.ts` | Move | → `test/adapters/vba-sync/vba-sync-legacy-adapter.test.ts` |

## Interfaces / Contracts

```ts
// src/core/contracts/index.ts
export type LegacyVbaSyncPort = {
  execute(toolName: string, input: unknown): Promise<OperationResult<unknown>>;
};
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Architecture | core imports no adapter | Existing `core-boundary.test.ts` MUST stay green after each PR |
| Unit (adapter) | tool dispatch, timeout, preflight, output parsing | Existing tests move as-is; they already mock the executor — no behavior change |
| Unit (core) | comparison + form + plan builders | Stay in core test dirs; unaffected |
| Integration | MCP `legacyToolService` injection | `core-boundary.test.ts` already exercises the injected port mock |

Existing tests mock the PowerShell executor (`spawnMock` on `node:child_process`), so the move is import-path-only — no assertion changes.

## Migration / Rollout

No data migration. No public behavior change — MCP tool names, schemas, and outputs are identical. Compatibility with the existing workflow MCP is preserved because the port surface (`execute(toolName, input)`) and all tool dispatch logic are moved verbatim, not rewritten. Rollback = revert the slice PR.

## Open Questions

- [ ] Proposal artifact missing — confirm scope matches before tasks/apply.
- [ ] Follow-up (out of scope): route `spawnVbaManager` through `AccessPowerShellRunner` to unify the PS abstraction.
