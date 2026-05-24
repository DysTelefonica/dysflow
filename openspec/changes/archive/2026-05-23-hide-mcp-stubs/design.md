# Design: Hide Unimplemented Legacy MCP Tools from `tools/list`

## Summary

Reuse the pre-existing `HIDDEN_STUB_TOOL_NAMES` mechanism in `src/adapters/mcp/tools.ts` to flag `verify_binary` and `reconcile_binary` as `hidden: true`, and reclassify them from `implemented` to `pending` in `legacy-parity-registry.ts` so the parity invariant (`implemented` ↔ not hidden, `pending` ↔ hidden) holds. No new abstractions are introduced — the change is purely a data-membership flip in two `Set`s plus the corresponding test assertions.

## Goals and non-goals

### Goals

- `tools/list` MUST NOT advertise `verify_binary` or `reconcile_binary`.
- `tools/call` on either name MUST keep returning `LEGACY_TOOL_NOT_IMPLEMENTED` (clear contract, not a routing failure).
- The release-matrix gate test MUST stay the single source of truth for visible/stub/modern counts.
- The parity registry invariant enforced by `release-matrix-gate.test.ts` MUST hold for these two names after the change.

### Non-goals

- Implementing either tool.
- Re-auditing the broader parity registry beyond the two names cited in #298.
- Changing the MCP error code shape or the public tool schemas.
- Documentation or changelog work beyond what tests demand.

## Architecture decisions (ADR-style)

### ADR 1 — Hide, do not delete

**Decision**: Mark the two tools `hidden: true` via `HIDDEN_STUB_TOOL_NAMES` instead of removing them from `LEGACY_DYSFLOW_MCP_TOOL_NAMES` / the registry.

**Rationale**:

- The dispatch handler still answers `tools/call` with `LEGACY_TOOL_NOT_IMPLEMENTED` — a stable, documented error contract. Deleting the registration would replace that with an unknown-tool routing error, breaking any client that relied on the explicit code.
- `HIDDEN_STUB_TOOL_NAMES` was already designed (and documented at `tools.ts:566-571`) exactly for this scenario; it is currently an empty set waiting to be populated.
- The `createLegacyDispatchTool` function at `tools.ts:587` already wires `hidden: HIDDEN_STUB_TOOL_NAMES.has(name) ? true : undefined`. Zero code-path change is required — only data.

**Rejected alternatives**:

- *Delete from `LEGACY_DYSFLOW_MCP_TOOL_NAMES`*: breaks the `tools/call` error contract, forces touching multiple inventory files, and discards a deliberate design affordance.
- *Add a new `STUB_TOOL_NAMES` constant*: pure duplication. The existing mechanism is sufficient and self-documenting.
- *Filter at the `tools/list` projection layer only*: scatters the policy across server and registry, and leaves the registry self-contradictory (registry says `implemented`, projection lies).

### ADR 2 — Reclassify in the parity registry

**Decision**: Remove `verify_binary` and `reconcile_binary` from `implementedToolNames` in `legacy-parity-registry.ts` so `LEGACY_PARITY_REGISTRY` computes their `status` as `"pending"`.

**Rationale**:

- `release-matrix-gate.test.ts` (the third `it` block) enforces a biconditional invariant: `entry.status === "implemented" ⇔ !HIDDEN_STUB_TOOL_NAMES.has(entry.name)`. If we hide a tool but leave it `implemented`, the gate fails — and rightly so, because the registry would be lying.
- The names are not implemented (they always return `LEGACY_TOOL_NOT_IMPLEMENTED`); declaring them `implemented` was the original defect surfaced in #298.

**Rejected alternatives**:

- *Loosen the parity invariant test*: weakens the contract that prevents future regressions of exactly this kind.
- *Mark them `implemented` and exempt them in the test*: introduces a hard-coded exception list, more code, weaker semantics.

### ADR 3 — Strict TDD: assertion edits first

**Decision**: Edit `release-matrix-gate.test.ts` assertions and `tools.test.ts:313` BEFORE touching production code; confirm RED; then apply the two-line source edit; confirm GREEN.

**Rationale**:

- Strict TDD mode is active for the dysflow project.
- The assertions are themselves the spec for visible/stub counts; landing them first makes the source diff trivially small and unambiguous.
- The full suite running green at the end (`pnpm test`) is the final gate.

## Component map

```
src/adapters/mcp/
├── tools.ts                       (modified — populate HIDDEN_STUB_TOOL_NAMES)
│   ├── HIDDEN_STUB_TOOL_NAMES     <-- data flip: [] -> [verify_binary, reconcile_binary]
│   └── createLegacyDispatchTool   <-- unchanged; already reads the Set
│
├── legacy-parity-registry.ts      (modified — remove two entries)
│   ├── implementedToolNames       <-- data flip: drop verify_binary, reconcile_binary
│   └── LEGACY_PARITY_REGISTRY     <-- derives status = "pending" automatically
│
└── legacy-tool-inventory.ts       (unchanged)

test/adapters/mcp/
├── release-matrix-gate.test.ts    (modified — stubCount 0→2, visibleCount 50→48)
└── tools.test.ts                  (modified — trim IMPLEMENTED_VERIFY_TOOL_NAMES)
```

## Data flow

```
tools/list request
    │
    ▼
createDysflowMcpTools(services, writesEnabled)
    │
    └─► createLegacyDispatchTool(name, ...)
            │
            ├─► HIDDEN_STUB_TOOL_NAMES.has(name) ? true : undefined
            │       │
            │       ▼
            └─► { name, description, inputSchema, hidden, handler }
                                                 │
                                                 ▼
                                  MCP server projects tools where !hidden
                                                 │
                                                 ▼
                              verify_binary / reconcile_binary EXCLUDED

tools/call verify_binary | reconcile_binary
    │
    ▼
createLegacyDispatchTool.handler(input)
    │
    ├─► validateInput → if invalid → invalidInput
    ├─► not a query/write/vba-sync slice path
    └─► fallthrough returns:
        { isError: true,
          content: [{ type: "text",
                      text: "LEGACY_TOOL_NOT_IMPLEMENTED: ..." }] }
```

The hidden flag affects ONLY the `tools/list` projection performed by the MCP server layer. Direct `tools/call` dispatch is keyed by `name` and continues to work — this is what preserves the documented error contract.

## Concrete file/line changes

### 1. `src/adapters/mcp/tools.ts:572`

Replace the empty initializer:

```typescript
export const HIDDEN_STUB_TOOL_NAMES = new Set<LegacyDysflowMcpToolName>([]);
```

with the populated set:

```typescript
export const HIDDEN_STUB_TOOL_NAMES = new Set<LegacyDysflowMcpToolName>([
  "verify_binary",
  "reconcile_binary",
]);
```

`createLegacyDispatchTool` at line 587 already consumes this set; no other change in this file.

### 2. `src/adapters/mcp/legacy-parity-registry.ts:55-56`

Inside the `implementedToolNames = new Set<LegacyDysflowMcpToolName>([...])` initializer, remove these two lines:

```typescript
  "verify_binary",
  "reconcile_binary",
```

`LEGACY_PARITY_REGISTRY` is derived at line 94 via `implementedToolNames.has(name) ? "implemented" : "pending"`, so both entries automatically downshift to `status: "pending"`. The `buildDescription` helper will likewise produce the "tracked for parity and not ported in this slice" suffix without further edits.

### 3. `test/adapters/mcp/release-matrix-gate.test.ts:35-42`

Inside the first `it` block ("documents and validates exact tool counts"):

- Line 35: `console.log` for hidden stubs — change expected from `0` to `2`.
- Line 37: `console.log` for visible tools — change expected from `50` to `48`.
- Line 40: `expect(stubCount).toBe(0)` → `expect(stubCount).toBe(2)`.
- Line 42: `expect(visibleCount).toBe(50)` → `expect(visibleCount).toBe(48)`.

The third `it` block ("guarantees parity registry matches implementation...") needs no edit — it iterates the registry and enforces the biconditional, which will now hold automatically.

### 4. `test/adapters/mcp/tools.test.ts:313`

Inside the `describe("stub tool visibility (#175)", ...)` block, trim the const:

```typescript
const IMPLEMENTED_VERIFY_TOOL_NAMES = ["verify_code", "verify_binary", "reconcile_binary"] as const;
```

to:

```typescript
const IMPLEMENTED_VERIFY_TOOL_NAMES = ["verify_code"] as const;
```

This is correct for all three child `it` blocks (lines 323, 332, 342): each one asserts the listed names are visible and callable against either the legacy service or the unavailable-service path. Hidden stubs that always return `LEGACY_TOOL_NOT_IMPLEMENTED` no longer belong here. The describe block's title remains accurate — the const name now matches reality (only `verify_code` is implemented).

## TDD sequence (strict mode)

1. **RED — edit test assertions first**
   - Apply changes (3) and (4) above to `release-matrix-gate.test.ts` and `tools.test.ts`.
   - Run `pnpm vitest test/adapters/mcp/release-matrix-gate.test.ts test/adapters/mcp/tools.test.ts`.
   - Expected: `stubCount` count assertion fails; `visibleCount` count assertion fails; visibility assertion for `verify_binary`/`reconcile_binary` no longer runs against them (so passes for `verify_code` alone). The matrix-gate test fails because the source still says `stubCount === 0` and `visibleCount === 50`.

2. **GREEN — populate the hidden set and reclassify**
   - Apply change (1): populate `HIDDEN_STUB_TOOL_NAMES`.
   - Apply change (2): drop the two names from `implementedToolNames`.
   - Re-run the same vitest invocation. Both gate assertions go green, and the parity-registry biconditional (`release-matrix-gate.test.ts` third `it`) continues to hold.

3. **VERIFY — full suite**
   - Run `pnpm test`.
   - Expected: green across the whole suite. No other test depends on these two names being visible or `implemented`.

## Integration points

- **MCP server projection layer**: consumes the `hidden` flag on `DysflowMcpTool`. Already wired; no change needed.
- **`legacyToolService` dispatch**: not in the code path for `verify_binary` / `reconcile_binary` because they are NOT in `LEGACY_VBA_SYNC_TOOL_NAMES`. The handler falls through to the `LEGACY_TOOL_NOT_IMPLEMENTED` return statement. (This is also why the `tools.test.ts:342` "dispatches to legacy service" test currently passes for them but should not — they were never actually dispatched to the legacy service; the assertion happened to align because the test mocks `legacyToolService.execute` to succeed for ANY name. Removing them from `IMPLEMENTED_VERIFY_TOOL_NAMES` fixes this latent mismatch.)
- **Release matrix gate**: tightens visible/stub counts; the gate continues to enforce parity invariants.

## Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------:|-------:|------------|
| External clients enumerated `tools/list` and registered handlers for `verify_binary`/`reconcile_binary` | Low | Low | Any such client was already broken — every call returned `LEGACY_TOOL_NOT_IMPLEMENTED`. The contract holds for direct `tools/call`. |
| The `tools.test.ts:342` block silently lost coverage of legitimate behaviour | Low | Low | The block tests `IMPLEMENTED_VERIFY_TOOL_NAMES`; with `verify_code` remaining, the dispatch-to-legacy-service path is still asserted. |
| Other legacy tools also need hiding | Low | Low | Out of scope for #298. A follow-up audit can populate the set further without code changes. |
| TDD ordering violated, source edited before tests fail | Low | Low | The execution plan is explicit; `sdd-apply` will run the failing tests first and capture the failure before applying source edits. |

## Assumptions

- The hidden flag is honored by the MCP server layer responsible for `tools/list` projection. (Validated by the existing `release-matrix-gate.test.ts` "visibleCount" assertion, which counts `!t.hidden`.)
- No code path outside the MCP adapter relies on `verify_binary` / `reconcile_binary` being reported as `implemented` in `LEGACY_PARITY_REGISTRY`. (A grep at apply time should confirm — but the registry's only consumer in tests is the gate, which now expects `pending`.)
- The diff stays within the single-PR 400-line budget (forecast ~10 lines).

## Rollback

Single PR, single conceptual change. `git revert <sha>` restores the previous behaviour: both tools visible in `tools/list`, declared `implemented`, returning `LEGACY_TOOL_NOT_IMPLEMENTED` on call. No data migration, no config change, no schema change.
