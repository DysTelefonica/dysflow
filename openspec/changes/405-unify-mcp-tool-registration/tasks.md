# Tasks — Unify MCP tool registration

- Change: `405-unify-mcp-tool-registration`
- Mode: STRICT TDD. Test runner: `pnpm test`. Gate: `tsc --noEmit && biome check src/ test/`.
- All edits confined to `src/adapters/mcp/tools.ts` and `test/adapters/mcp/*`. No `src/core` changes.

## Phase 0 — Baseline (safety net)

- [x] 0.1 Run `pnpm test` and confirm green BEFORE any change (record the pass as the behavior
  baseline these refactors must preserve).
- [x] 0.2 Run `pnpm test test/adapters/mcp/release-matrix-gate.test.ts` and confirm the count
  assertions (45 / 2 / 5 / 48) pass — this is the invariant we must not move.

## Phase 1 — Pin the counts as an explicit regression guard (test-first)

- [x] 1.1 In `release-matrix-gate.test.ts` (or a sibling guard test), confirm there is an assertion
  pinning `toolCount=45`, `stubCount=2`, `modernCount=5`, `visibleCount=48`. It already exists —
  verify it is present and add a short comment tying it to change #405 so a future edit that moves a
  count is forced to justify it. Do NOT change the expected numbers.
- [x] 1.2 Run `pnpm test test/adapters/mcp/release-matrix-gate.test.ts` — still green (no production
  change yet).

## Phase 2 — Hard duplicate check (test-first → implement)

- [x] 2.1 (RED) Add a test in `test/adapters/mcp/tools.test.ts` (new describe block, e.g.
  "registration invariants — duplicate names throw") that imports `registerMcpToolList` from
  `../../../src/adapters/mcp/tools` and asserts:
  - two entries with the SAME `name` → `expect(() => registerMcpToolList([a, dupA])).toThrow(/Duplicate MCP tool/)`;
  - distinct names → returns a list of the same length, preserving each `name` (behavioral, no order
    assertion beyond membership). Use minimal fake `DysflowMcpTool` objects (name + no-op async
    handler). Run `pnpm test` → this test FAILS (function does not exist yet).
- [x] 2.2 (GREEN) In `tools.ts`, add the exported pure function `registerMcpToolList(entries)` that
  pushes each entry and THROWS `new Error(\`Duplicate MCP tool registration: ${tool.name}\`)` on a
  repeated name. Run `pnpm test` → the new test passes.

## Phase 3 — Single registration list, alias/dispatch split (refactor under green)

- [x] 3.1 In `tools.ts`, add `const ALIAS_TOOL_NAMES = new Set<DysflowMcpToolName>([...the 10 alias
  names...])` (list_access_operations, cleanup_access_operation, run_vba, query_sql, exec_sql,
  run_script, create_table, drop_table, seed_fixture, teardown_fixture).
- [x] 3.2 Refactor the ten `add({...})` alias calls in `registerMcpTools` into an ordered
  `aliasTools: DysflowMcpTool[]` array. Copy the handler bodies VERBATIM (same schemas, same
  validation, same service calls) — zero behavior change.
- [x] 3.3 Replace the dispatch loop with a filtered build that SKIPS alias names:
  `const dispatchTools = DYSFLOW_MCP_TOOL_NAMES.filter((n) => !ALIAS_TOOL_NAMES.has(n)).map((n) => createDispatchTool(n, services, writesEnabled, writeAccessResolver, env))`.
- [x] 3.4 Rewrite `registerMcpTools` body to delegate to the pure helper:
  `return registerMcpToolList([...currentTools, ...aliasTools, ...dispatchTools])`. Remove the old
  `Set`-based silent `add` closure.
- [x] 3.5 Run `pnpm test` → full suite green. In particular `tools.test.ts` (all alias/dispatch
  behaviors) and `release-matrix-gate.test.ts` counts unchanged.

## Phase 4 — Gate & cleanup

- [x] 4.1 Run `tsc --noEmit` — clean (the typed `Set<DysflowMcpToolName>` catches any stale name).
- [x] 4.2 Run `biome check src/ test/` — clean (no `any`, no non-null `!`, no unused).
- [x] 4.3 Run `pnpm test` once more — full green.
- [x] 4.4 Self-review: confirm `registerMcpTools` now reads as ONE list (modern + alias + dispatch)
  feeding ONE pass, each `DysflowMcpToolName` owned by exactly one of alias/dispatch, and the
  duplicate check is a throw. No `src/core` import added (architecture boundary intact).

## Done criteria

- One source of truth: a name maps to exactly one registration entry; no insertion-order dedup.
- Duplicate tool name throws (proven by the Phase 2 test).
- Release-matrix counts unchanged: 45 dispatch + 2 stubs + 5 modern = 48 visible (Phase 1/3 guards).
- All pre-existing `tools.test.ts` behaviors pass unchanged; gate clean.
