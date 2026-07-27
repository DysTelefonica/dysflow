# Tasks: AI Form UI Builder

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700-1100 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Single branch with issue slices #796→#801 under size:exception |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | #796 skill + analysis contract | PR 1 | Base: feat/ai-form-ui-builder; skill/docs only. |
| 2 | #797 behavior map core | PR 2 | Depends on PR 1; add CodeGraph evidence payload merge. |
| 3 | #798/#799 plan/apply contracts | PR 3 | Base previous slice; plan generation + guarded application. |
| 4 | #800 pattern copy | PR 4 | Can ride with PR 3 if scope stays small. |
| 5 | #801 verification | PR 5 | Final drift detection and adapter wiring checks. |

## Phase 1: Foundation
- [x] 1.1 Add `skills/access-form-ui-builder/SKILL.md` and `skills/access-form-ui-builder/references/golden-path.md` with #796 scope, decision gates, and CodeGraph-VBA boundary note.
- [x] 1.2 Update `AGENTS.md` and `docs/mcp-examples.md` with the new workflow entry and one concise example.

## Phase 2: Core Contracts
- [x] 2.1 Create `src/core/models/form-ui-builder.ts` with analysis, behavior-map, design-plan, pattern, and verification types.
- [x] 2.2 Write RED tests in `test/core/services/form-ui-analysis-service.test.ts` for semantic analysis from `FormIR`.
- [x] 2.3 Write RED tests in `test/core/services/form-ui-behavior-map-service.test.ts` for merging controls/events with adapter-supplied CodeGraph evidence payloads.
- [x] 2.4 Write RED tests in `test/core/services/form-ui-design-plan-service.test.ts` and `test/core/services/form-ui-pattern-copy-service.test.ts` for plan intent and reference-copy traceability.

## Phase 3: Apply + Verify Wiring
- [x] 3.1 Implement GREEN paths in `src/core/services/form-ui-*.ts` for analysis, behavior-map merge, plan generation, pattern copy, and verification rules.
- [x] 3.2 Update `src/adapters/vba-sync/vba-forms-ai-tools.ts` and `src/adapters/vba-sync/vba-forms-adapter.ts` to route the new tool boundary without direct MCP-to-MCP calls.
- [x] 3.3 Extend `src/adapters/mcp/mcp-tool-registry.ts`, `src/adapters/mcp/dispatch-routes.ts`, and `src/adapters/mcp/schemas/vba-sync-schemas.ts` for the six new tool names and read-only route metadata.

## Phase 4: TDD Verification
- [x] 4.1 Add adapter tests in `test/adapters/vba-sync/vba-forms-ai-tools.test.ts` for dry-run/apply gating and CodeGraph evidence acceptance.
- [x] 4.2 Add MCP tests in `test/adapters/mcp/*form-ui*.test.ts` for schemas, read-only routing, and in-memory apply/copy contract behavior.
- [x] 4.3 Add RED→GREEN→REFACTOR verification cases for #797-#801 covering semantic drift, plan alignment, reference copy, and actionable failure output.

## Phase 5: Cleanup
- [x] 5.1 Polish comments and example payloads, then remove any temporary scaffolding after tests pass.
- [x] 5.2 Confirm no unrelated edits touch `openspec/changes/wire-write-policy-runtime-785/`.
