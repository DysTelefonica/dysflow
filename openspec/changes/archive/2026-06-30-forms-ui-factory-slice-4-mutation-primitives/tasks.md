# Tasks: Forms UI Factory Slice 4 Mutation Primitives

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 420-650 |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Core mutation primitives + IR safety | PR 1 | Base all tests on pure FormIR fixtures. |
| 2 | MCP tool wiring + LoadFromText gate | PR 1 | Keep adapter coverage behind core behavior. |

## Phase 1: Foundation / RED

- [x] 1.1 Add failing Vitest cases for `addControl`, `moveControl`, and `renameControl` in `src/core/services/form-ir-service.test.ts`.
- [x] 1.2 Add failing fixture assertions for `Form_FormRiesgosGestionRiesgo` preserving `PrtDevMode`, `Checksum`, and format bytes in `test/**`.
- [x] 1.3 Add failing MCP registry/dispatch tests for `dysflow_form_add_control`, `dysflow_form_move_control`, and `dysflow_form_rename_control`.

## Phase 2: Core Implementation / GREEN

- [x] 2.1 Implement pure FormIR mutation methods in `src/core/services/form-ir-service.ts` with ordered-entry preservation and typed validation errors.
- [x] 2.2 Extend `src/core/models/form-ir.ts` only if shared request/result types are needed for mutation inputs or tests.
- [x] 2.3 Keep opaque metadata intact during serialize/mutate/serialize round-trips; reject destructive metadata loss in core.

## Phase 3: Adapter Wiring / GREEN

- [x] 3.1 Register the three public MCP tools in `src/adapters/mcp/**` with exact `dysflow_` names and write-gate semantics.
- [x] 3.2 Route tool handlers through the core mutation service in `src/adapters/vba-sync/vba-forms-adapter.ts` without leaking adapter policy into core.
- [x] 3.3 Add the LoadFromText-style gate by reusing the existing import path after writing the mutated `.form.txt`.

## Phase 4: Verification / REFACTOR

- [x] 4.1 Add passing integration coverage for the canonical benchmark form in `test/integration/**`, including gate success and safe failure cases.
- [x] 4.2 Update `README.md` MCP tools list with the three public mutation tool names and their behavior summary.
- [x] 4.3 Refactor shared helpers and remove temporary test scaffolding after the RED→GREEN path is stable.

