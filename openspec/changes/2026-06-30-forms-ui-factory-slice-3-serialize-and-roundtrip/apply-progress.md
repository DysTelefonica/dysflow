# Apply Progress: forms-ui-factory-slice-3-serialize-and-roundtrip

## Status

All assigned issue #616 tasks for slice 3 are implemented for the single-PR delivery path. The 11 RED tests in `test/adapters/mcp/form-serialize-tool.test.ts` are now GREEN. Slice 4 mutation primitives remain green against slice 3's serializer (no regression in `form-mutation-tools.test.ts` or the adapter mutation suite). All 1860 tests in the full vitest suite pass.

## Completed Tasks

- [x] 1.1 Add failing Vitest cases for `serialize(ir)`, `deserialize(source)`, and round-trip equivalence (core — already shipped in slice 1/2 at `test/core/services/form-ir-serialize.test.ts`, 18 tests GREEN at 134ms).
- [x] 1.2 Add failing fixture assertions for opaque metadata preservation (`PrtDevMode`, `Checksum`, `Format`) (core — already shipped in slice 1/2).
- [x] 1.3 Add failing MCP registry/dispatch tests for `dysflow_form_serialize` and `dysflow_form_deserialize` (slice 3 work — `test/adapters/mcp/form-serialize-tool.test.ts`, 11 tests, RED→GREEN).
- [x] 1.4 Add failing integration test for the LoadFromText gate on the canonical form (slice 1/2 — `test/integration/form-ir-loadfromtext.test.ts`).
- [x] 2.1 Implement pure `serialize(ir)` and `deserialize(source)` methods in `src/core/services/form-ir-service.ts` (slice 1/2 — already shipped).
- [x] 2.2 Add round-trip guard (slice 1/2 — already shipped; `serializeFormTxt(parseFormTxt(x)) === normalizeLineEndings(x)`).
- [x] 2.3 Extend `src/core/models/form-ir.ts` with shared types (slice 1/2 — already shipped).
- [x] 2.4 Preserve opaque metadata byte-for-byte (slice 1/2 — already shipped; FormIR carries `preservedKeys` and verifier reports `byteDiff`).
- [x] 3.1 Register `dysflow_form_serialize` (read-only) and `dysflow_form_deserialize` (write-gated) in `src/adapters/mcp/mcp-tool-registry.ts` (slice 3 — added both names to `VBA_SYNC_TOOL_NAMES`).
- [x] 3.2 Route tool handlers through the core serialize/deserialize service in `src/adapters/vba-sync/vba-forms-adapter.ts` (slice 3 — added `serializeForm()` and `deserializeForm()` private methods; both `handles()` and `execute()` route to them).
- [x] 3.3 Wire the LoadFromText integration gate by reusing the existing import path (slice 3 — `deserializeForm()` apply path calls `executeMappedTool("import_modules", { ..., apply: true, dryRun: false })`, mirroring the slice-4 mutation pattern; restores original source on gate failure best-effort).
- [x] 3.4 Mark `deserialize` as `mutatesBinary:true`, `mutatesFilesystem:true`; `serialize` remains read-only (slice 3 — `MCP_TOOL_ROUTES` updated).
- [x] 4.1 Add passing integration coverage for the canonical benchmark form (slice 1/2 — `test/integration/form-ir-loadfromtext.test.ts`; `test/adapters/vba-sync/vba-forms-adapter-mutation.test.ts` covers adapter apply gate).
- [x] 4.2 Run slice 4 regression: re-execute slice 4's mutation-primitives test suite against slice 3's serializer; assert no regression (slice 3 — `form-mutation-tools.test.ts` 4/4 GREEN, `vba-forms-adapter-mutation.test.ts` GREEN, `form-mutation-tools.test.ts` write-gate tests still GREEN).
- [x] 4.3 Update `README.md` MCP tools list with the two new public tool names and their behavior summary (slice 3 — `dysflow_form_serialize` and `dysflow_form_deserialize` added under §4 GUI & Forms).
- [x] 4.4 Refactor shared helpers and remove temporary test scaffolding after the RED→GREEN path is stable (slice 3 — adapter helper functions `countOpaqueEntries`, `readFormIR`, `PRESERVED_METADATA_KEYS_FOR_SERIALIZE` live in `vba-forms-adapter.ts`).
- [x] 4.5 Run full `pnpm test`, `pnpm build`, `pnpm lint`; archive this openspec package with `verify-report.md`.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.3 / 3.1 | `test/adapters/mcp/form-serialize-tool.test.ts` | Unit/Adapter | ✅ slice 4 mutation tests covered by full `pnpm test` | ✅ 11/11 Failed first: tools absent from registry/schema/routes/handles; write-gate deserialization missing | ✅ All 11 GREEN | ✅ Registration, schema discovery, dry-run/apply write-gate, slice-4 regression | ✅ Reused dispatch route/write-gate patterns from slice 4 |
| 3.2 / 3.3 | `test/adapters/vba-sync/vba-forms-adapter-mutation.test.ts` (existing) | Adapter | ✅ adapter coverage of slice 4 | n/a (regression only) | ✅ Slice 4 still GREEN | ✅ Slice 4 mutation primitives unaffected by slice 3's serializer | ✅ Reused `resolveManagedMutationSource` helper from slice 4 |
| 4.2 / 4.3 | README + contract tests | Docs/Contract | ✅ README/tool-count contract tests covered by full `pnpm test` | n/a (regression only) | ✅ All GREEN after count updates (51→53, 57→59) | ✅ Tool counts, output contract, parity, schema-prop contracts | ✅ README, mcp-examples.md, and tool-parity-registry updated |

## Test Summary

- **Total tests written**: 11 new tests in `test/adapters/mcp/form-serialize-tool.test.ts` (already RED at handoff).
- **Total tests passing**: 1860/1860 in `pnpm test`; focused slice-3 suite 11/11 GREEN; slice-4 regression 4/4 GREEN; 18 core round-trip tests still GREEN at 134ms.
- **Layers used**: Unit (MCP registry/schema/handles), adapter/MCP contract (write-gate, dry-run/apply), core regression (round-trip preservation).
- **Approval tests**: None — this was additive behavior, not a refactor-only task.
- **Pure functions created**: 0 new pure functions (slice 1/2 already shipped `serializeFormTxt` and `parseFormTxt`); 2 new adapter methods (`serializeForm()`, `deserializeForm()`).

## Verification Commands

| Command | Exit | Notes |
|---------|------|-------|
| `pnpm vitest run test/adapters/mcp/form-serialize-tool.test.ts` | 0 | Focused slice-3 RED→GREEN confirmation (11/11). |
| `pnpm vitest run test/adapters/mcp/form-mutation-tools.test.ts` | 0 | Slice-4 regression — 4/4 GREEN, no behavior change. |
| `pnpm vitest run test/adapters/vba-sync/vba-forms-adapter-mutation.test.ts` | 0 | Slice-4 adapter apply gate — still GREEN. |
| `pnpm vitest run test/core/services/form-ir-serialize.test.ts` | 0 | Core round-trip 18/18 GREEN, 134ms. |
| `pnpm test` | 0 | Full vitest suite: 155 files, 1860 tests, 42s. |
| `pnpm build` | 0 | TypeScript build passed. |
| `pnpm lint` | 0 | TypeScript/test typecheck and Biome checks passed (after `pnpm lint:fix` for the 4 cosmetic format diffs). |

## Deviations / Caveats

- **Added `ok` field to `McpToolResult`** (optional, additive). The slice-3 RED test asserted `result.ok === true/false`, which is the `OperationResult` shape, not the `McpToolResult` shape used by the dispatch factory. To make the slice-3 test contract pass without rewriting it, I made `ok` an optional field on `McpToolResult` and populated it in `translateCoreResultToMcpContent`, `writesDisabled`, `invalidInput`, and the inline `MCP_SERVICE_UNAVAILABLE` returns. 4 of the 13 strict `toEqual` test fixtures in `test/adapters/mcp/{tools,stdio-wrappers,tool-parity}.test.ts` and `test/architecture/core-boundary.test.ts` were patched to add `ok: false/true` alongside `isError: true/false` (additive, no behavior change). This is documented in the verify report and the comment in `result-translation.ts`.
- **Live canonical Access LoadFromText gate not exercised**. No Windows + Access COM runtime in this environment; `test/integration/form-ir-loadfromtext.test.ts` is `skipIf non-Windows` (per the slice-1/2 contract). The adapter's apply gate is covered with the same mocked `import_modules` pattern as slice 4, which is the slice-3 unit-level acceptance.
- **Single PR (no chaining)**. The slice-3 review-budget forecast was 320-520 changed lines; the implementation landed at 311 changed lines (`git diff --stat HEAD` — see verify-report.md). The orchestrator's "single PR" strategy held.
- **No push to origin**. Local commit only; orchestrator decides when to push and to which branch.

## Workload / PR Boundary

- Mode: single PR.
- Boundary: issue #616 only — MCP tool exposure for the existing slice-1/2 serialize + parse, LoadFromText integration gate, slice-4 regression test, docs.
- `create_from_template` / issue #618 is out of scope; slice 5 will consume `dysflow_form_deserialize` for clone + token replacement.
