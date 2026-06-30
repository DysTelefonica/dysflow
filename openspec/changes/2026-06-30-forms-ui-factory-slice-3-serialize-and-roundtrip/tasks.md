# Tasks: Forms UI Factory Slice 3 Serialize and Round-Trip

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 320-520 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | within-budget |
| Decision needed before apply | No |

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Core serialize/deserialize + round-trip guard | PR 1 | Pure IR fixtures; byte-equal assertions. |
| 2 | MCP tool wiring + LoadFromText gate + slice-4 regression | PR 1 | Keep adapter coverage behind core behavior. |

## Phase 1: Foundation / RED

- [ ] 1.1 Add failing Vitest cases for `serialize(ir)`, `deserialize(source)`, and round-trip equivalence in `src/core/services/form-ir-service.test.ts`.
- [ ] 1.2 Add failing fixture assertions for opaque metadata preservation (`PrtDevMode`, `Checksum`, `Format`, `[Event Procedure]` names) in `test/**`.
- [ ] 1.3 Add failing MCP registry/dispatch tests for `dysflow_form_serialize` and `dysflow_form_deserialize`.
- [ ] 1.4 Add failing integration test for the LoadFromText gate on `Form_FormRiesgosGestionRiesgo`.

## Phase 2: Core Implementation / GREEN

- [ ] 2.1 Implement pure `serialize(ir)` and `deserialize(source)` methods in `src/core/services/form-ir-service.ts`.
- [ ] 2.2 Add round-trip guard: `serialize(parse(source)) !== source` → typed `SERDE_ROUND_TRIP_FAILED` with byte diff snippet.
- [ ] 2.3 Extend `src/core/models/form-ir.ts` if shared `SerializeResult`/`DeserializeResult` types are needed.
- [ ] 2.4 Preserve opaque metadata (`PrtDevMode`, `Checksum`, `Format`, layout scalars, event-bound `[Event Procedure]` names) byte-for-byte; reject destructive metadata loss in core.

## Phase 3: Adapter Wiring / GREEN

- [ ] 3.1 Register `dysflow_form_serialize` (read-only) and `dysflow_form_deserialize` (write-gated) in `src/adapters/mcp/mcp-tool-registry.ts`.
- [ ] 3.2 Route tool handlers through the core serialize/deserialize service in `src/adapters/vba-sync/vba-forms-adapter.ts` without leaking adapter policy into core.
- [ ] 3.3 Wire the LoadFromText integration gate by reusing the existing import path after writing the deserialized `.form.txt`.
- [ ] 3.4 Mark `deserialize` as `mutatesBinary:true`, `mutatesFilesystem:true` in `src/adapters/mcp/dispatch-routes.ts`; `serialize` remains read-only.

## Phase 4: Verification / REFACTOR

- [ ] 4.1 Add passing integration coverage for the canonical benchmark form (`Form_FormRiesgosGestionRiesgo`), including LoadFromText gate success and safe failure cases.
- [ ] 4.2 Run slice 4 regression: re-execute slice 4's mutation-primitives test suite against slice 3's serializer; assert no regression.
- [ ] 4.3 Update `README.md` MCP tools list with the two new public tool names and their behavior summary.
- [ ] 4.4 Refactor shared helpers and remove temporary test scaffolding after the RED→GREEN path is stable.
- [ ] 4.5 Run full `pnpm test`, `pnpm build`, `pnpm lint`; archive this openspec package with `verify-report.md`.
