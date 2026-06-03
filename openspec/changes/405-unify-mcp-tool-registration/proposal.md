# Proposal — Unify MCP tool registration under a single source of truth

- Change: `405-unify-mcp-tool-registration`
- Issue: #405
- Type: tech-debt / internal refactor (no observable-contract change)

## Intent

Make MCP tool registration in `src/adapters/mcp/tools.ts` legible: given a tool name, there must
be **exactly one** place to look up how it is registered and which handler runs. Convert the silent
duplicate-skip guard into a **hard error** so an accidental double registration fails loudly at
build/registration time instead of being silently absorbed.

## Why (the problem)

Today `createDysflowMcpTools` builds the tool list through **two** disjoint mechanisms:

1. **Explicit inline alias handlers** in `registerMcpTools` (~lines 272–431) for ten tools:
   `list_access_operations`, `cleanup_access_operation`, `run_vba`, `query_sql`, `exec_sql`,
   `run_script`, `create_table`, `drop_table`, `seed_fixture`, `teardown_fixture`.
2. **Generated dispatch handlers** produced by iterating `DYSFLOW_MCP_TOOL_NAMES` and routing
   through `MCP_TOOL_ROUTES` via `createDispatchTool` (~lines 433–435, 517–579).

All ten alias names ALSO appear in `DYSFLOW_MCP_TOOL_NAMES`, so each is eligible for **both** paths.
A `Set`-based dedup `add` helper (lines 264–269) silently drops the second registration. Because the
aliases are added first, the alias handler wins and the dispatch handler for those ten names is
silently discarded. Consequences:

- A reader cannot answer "which handler runs for `run_vba`?" without reading both paths AND knowing
  the insertion order resolves the collision.
- The silent guard hides the overlap: removing an alias would *silently* switch the tool to the
  dispatch handler with no failing test to flag the behavior change.
- Adding a genuinely duplicate name is absorbed silently rather than rejected.

## Goal

- **Single source of truth.** One ordered list of registration entries (modern tools + the per-name
  dispatch/alias entries) feeds one registration pass. Looking up a tool's handler means reading one
  place.
- **Hard duplicate check.** The `add` helper throws on a duplicate name instead of skipping it.
  Duplicate registration becomes a startup/registration failure, not silent data loss.
- **Behavior preserved exactly.** Same 48 visible tools, same per-tool handler behavior, same
  schemas, same write-gating, same hidden stubs. The ten alias tools keep their current (alias)
  behavior — the unification makes that the *explicit, only* registration for those names.

## Scope

In scope (adapter layer only — `src/adapters/mcp/tools.ts` and its tests):

- Restructure `registerMcpTools` so there is one registration list and one `add` pass.
- Make the ten alias handlers the canonical per-name entry for those names (they are NOT re-added by
  the dispatch loop), so each name is registered exactly once with no reliance on insertion-order
  dedup.
- Change the `add` helper to throw on a duplicate name.
- Add a behavioral test asserting that a duplicate tool name throws.
- Add/keep a guard test pinning the release-matrix counts (45 dispatch + 2 hidden stubs + 5 modern =
  48 visible).

## Non-goals

- No change to the MCP wire contract: tool names, descriptions, input schemas, and handler outputs
  stay identical.
- No change to `MCP_TOOL_SCHEMAS`, `tool-parity-registry.ts`, `mcp-tool-registry.ts`, or
  `MCP_TOOL_ROUTES` semantics.
- No change to routing kinds, write-gating, dry-run resolution, or stub-hiding behavior.
- No change to `src/core` (hexagonal boundary respected — this is purely an adapter-layer cleanup).
- Not merging the modern `currentTools` array into the same structure as dispatch entries beyond what
  is needed for one legible registration pass; the five modern tools keep their bespoke handlers.

## Success criteria

- `pnpm test` green; `tsc --noEmit` and `biome check src/ test/` clean (no `any`, no non-null `!`).
- `release-matrix-gate.test.ts` counts unchanged (45 / 2 / 5 / 48).
- All existing `tools.test.ts` behaviors pass unchanged.
- A new test proves a duplicate tool name throws at registration.
- Reading `registerMcpTools` reveals one registration list and one place per name.
