# Apply Progress: AI Form UI Builder

**Change**: ai-form-ui-builder  
**Mode**: Strict TDD  
**Artifact store**: hybrid/OpenSpec  
**Delivery strategy**: exception-ok  
**Chain strategy**: size-exception  
**Branch**: feat/ai-form-ui-builder

## Summary

Implemented all pending tasks for #795 and subissues #796-#801. The implementation adds the project skill, protocol-neutral core contracts/services, adapter boundary tools, MCP registry/schema/route wiring, docs, and focused tests.

## Completed Tasks

- [x] 1.1 Add `skills/access-form-ui-builder/SKILL.md` and `skills/access-form-ui-builder/references/golden-path.md` with #796 scope, decision gates, and CodeGraph-VBA boundary note.
- [x] 1.2 Update `AGENTS.md` and `docs/mcp-examples.md` with the new workflow entry and one concise example.
- [x] 2.1 Create `src/core/models/form-ui-builder.ts` with analysis, behavior-map, design-plan, pattern, and verification types.
- [x] 2.2 Write RED tests in `test/core/services/form-ui-analysis-service.test.ts` for semantic analysis from `FormIR`.
- [x] 2.3 Write RED tests in `test/core/services/form-ui-behavior-map-service.test.ts` for merging controls/events with adapter-supplied CodeGraph evidence payloads.
- [x] 2.4 Write RED tests in `test/core/services/form-ui-design-plan-service.test.ts` and `test/core/services/form-ui-pattern-copy-service.test.ts` for plan intent and reference-copy traceability.
- [x] 3.1 Implement GREEN paths in `src/core/services/form-ui-*.ts` for analysis, behavior-map merge, plan generation, pattern copy, and verification rules.
- [x] 3.2 Update `src/adapters/vba-sync/vba-forms-ai-tools.ts` and `src/adapters/vba-sync/vba-forms-adapter.ts` to route the new tool boundary without direct MCP-to-MCP calls.
- [x] 3.3 Extend `src/adapters/mcp/mcp-tool-registry.ts`, `src/adapters/mcp/dispatch-routes.ts`, and `src/adapters/mcp/schemas/vba-sync-schemas.ts` for the six new tool names and write gates.
- [x] 4.1 Add adapter tests in `test/adapters/vba-sync/vba-forms-ai-tools.test.ts` for dry-run/apply gating and CodeGraph evidence acceptance.
- [x] 4.2 Add MCP tests in `test/adapters/mcp/form-ui-tools.test.ts` for schemas, read-only routing, and in-memory apply/copy contract behavior.
- [x] 4.3 Add RED→GREEN→REFACTOR verification cases for #797-#801 covering semantic drift, plan alignment, reference copy, and actionable failure output.
- [x] 5.1 Polish comments and example payloads, then remove any temporary scaffolding after tests pass.
- [x] 5.2 Confirm no unrelated edits touch `openspec/changes/wire-write-policy-runtime-785/`.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1 | N/A | Skill/docs | N/A (new docs) | N/A — documentation/skill contract | N/A | N/A | Skill body kept concise; reference file holds details |
| 1.2 | N/A | Docs | N/A (docs only) | N/A — documentation | N/A | N/A | Examples kept progressive and concise |
| 2.1 | `test/core/services/form-ui-*.test.ts` | Unit | N/A (new model) | ✅ Model used by RED service tests before implementation | ✅ 12/12 core tests passed | ✅ Analysis/map/plan/pattern/verify variants | ✅ Shared types centralized in `form-ui-builder.ts` |
| 2.2 | `test/core/services/form-ui-analysis-service.test.ts` | Unit | N/A (new service) | ✅ Failed: missing `form-ui-analysis-service` | ✅ Included in 12/12 core tests passed | ✅ Semantic controls + empty-control warning | ✅ Role/binding extraction kept pure |
| 2.3 | `test/core/services/form-ui-behavior-map-service.test.ts` | Unit | N/A (new service) | ✅ Failed: missing `form-ui-behavior-map-service` | ✅ Included in 12/12 core tests passed | ✅ Matched and unmatched evidence paths | ✅ Caller-supplied CodeGraph evidence boundary explicit |
| 2.4 | `test/core/services/form-ui-design-plan-service.test.ts`, `test/core/services/form-ui-pattern-copy-service.test.ts` | Unit | N/A (new services) | ✅ Failed: missing plan/pattern services | ✅ Included in 12/12 core tests passed | ✅ Valid target, invalid target, dry-run apply, copy traceability | ✅ Plan generation and pattern copy separated |
| 3.1 | `test/core/services/form-ui-*.test.ts` | Unit | N/A (new services) | ✅ RED from missing services | ✅ `pnpm vitest run test/core/services/form-ui-*.test.ts` → 5 files, 12 tests passed | ✅ Drift, alignment, warnings, reference copy | ✅ Verification logic isolated from adapters |
| 3.2 | `test/adapters/vba-sync/vba-forms-ai-tools.test.ts` | Adapter | N/A (new adapter file) | ✅ Failed: adapter did not handle new tools | ✅ Adapter/MCP focused run → 2 files, 9 tests passed | ✅ Analyze, map evidence, dry-run/apply write path | ✅ Adapter remains thin; no MCP-to-MCP invocation |
| 3.3 | `test/adapters/mcp/form-ui-tools.test.ts` | MCP | N/A (new tool registrations) | ✅ Failed: names/routes/schemas absent | ✅ Adapter/MCP focused run → 2 files, 9 tests passed | ✅ Read-only routes, in-memory apply/copy contracts, schema discovery | ✅ Kept write-capable dispatch logic focused on actual write tools |
| 4.1 | `test/adapters/vba-sync/vba-forms-ai-tools.test.ts` | Adapter | N/A (new tests) | ✅ Failed before adapter implementation | ✅ 4 adapter tests passed | ✅ Dry-run no write, apply writes, CodeGraph evidence accepted | ✅ No direct discovery call asserted |
| 4.2 | `test/adapters/mcp/form-ui-tools.test.ts` | MCP | N/A (new tests) | ✅ Failed before MCP wiring | ✅ 5 MCP tests passed | ✅ Registration, routes, schemas, read/write gate behavior | ✅ Tool descriptions added for build parity |
| 4.3 | `test/core/services/form-ui-verification-service.test.ts` plus plan/pattern tests | Unit | N/A (new verification) | ✅ Failed before verification service | ✅ Included in 21/21 focused tests passed | ✅ Compatible pass + handler drift failure + plan alignment drift | ✅ Actionable finding codes surfaced |
| 5.1 | Focused tests + build | Verification | ✅ Focused suite green before cleanup | N/A | ✅ 21/21 focused tests passed; `pnpm build` passed | ✅ Full MCP surface pins and full suite rerun after global parity fixes | CodeGraph index refreshed |
| 5.2 | `git status --short` | Workspace guard | N/A | N/A | ✅ No tracked edit under `openspec/changes/wire-write-policy-runtime-785/` | N/A | Unrelated change folder left untouched |

## Test Commands Run

| Command | Result |
|---|---|
| `pnpm vitest run test/core/services/form-ui-analysis-service.test.ts test/core/services/form-ui-behavior-map-service.test.ts test/core/services/form-ui-design-plan-service.test.ts test/core/services/form-ui-pattern-copy-service.test.ts test/core/services/form-ui-verification-service.test.ts` | RED: failed because service modules did not exist. |
| Same core command after implementation | GREEN: 5 files, 12 tests passed. |
| `pnpm vitest run test/adapters/vba-sync/vba-forms-ai-tools.test.ts test/adapters/mcp/form-ui-tools.test.ts` | RED: failed because adapter/MCP tools were not wired. |
| Same adapter/MCP command after implementation | GREEN: 2 files, 9 tests passed. |
| Combined focused command for all new tests | GREEN: 7 files, 21 tests passed. |
| `pnpm build` | Initially failed on missing tool parity descriptions; after fix passed. |
| `pnpm test` | Initially failed because the global MCP surface pins still expected the pre-change 64 visible tools/53 user tools/29 VBA-sync tools and because local untracked `.dysflow/project.json` contaminated config tests. |
| `pnpm vitest run test/adapters/mcp/tool-parity.test.ts test/adapters/mcp/mcp-tool-output-contracts.test.ts test/adapters/mcp/dispatch-write-gate.test.ts test/adapters/mcp/dispatch-routes-risk.test.ts test/adapters/mcp/dispatch-factory.test.ts test/adapters/mcp/release-matrix-gate.test.ts test/adapters/mcp/advertised-tool-count.test.ts test/adapters/mcp/compile-vba-tool-removal.test.ts test/docs/mcp-readme-tool-surface.test.ts` | GREEN after updating MCP surface pins: 9 files, 69 tests passed. |
| `pnpm test` with local `.dysflow/project.json` temporarily moved aside and restored afterward | GREEN: 226 files, 2813 tests passed, 1 skipped, 1 todo. |
| `pnpm build` after full-suite remediation | GREEN. |
| `codegraph index C:\Proyectos\dysflow` | Passed; refreshed index after code changes. |

## Files Changed

| File | Action | What changed |
|---|---|---|
| `skills/access-form-ui-builder/SKILL.md` | Created | Project skill for AI-safe Access form UI workflow. |
| `skills/access-form-ui-builder/references/golden-path.md` | Created | Golden path and ownership notes. |
| `src/core/models/form-ui-builder.ts` | Created | Shared protocol-neutral AI form UI builder types. |
| `src/core/services/form-ui-analysis-service.ts` | Created | Pure FormIR semantic analysis. |
| `src/core/services/form-ui-behavior-map-service.ts` | Created | Pure merge of controls/events with caller-supplied CodeGraph evidence. |
| `src/core/services/form-ui-design-plan-service.ts` | Created | Plan generation, dry-run application, and alignment checks. |
| `src/core/services/form-ui-pattern-copy-service.ts` | Created | Traceable reference pattern copy. |
| `src/core/services/form-ui-verification-service.ts` | Created | Behavior-map drift verification. |
| `src/adapters/vba-sync/vba-forms-ai-tools.ts` | Created | Adapter boundary for six AI form UI builder tools. |
| `src/adapters/vba-sync/vba-forms-adapter.ts` | Modified | Routed AI builder tools. |
| `src/adapters/mcp/mcp-tool-registry.ts` | Modified | Registered six public MCP tool names. |
| `src/adapters/mcp/dispatch-routes.ts` | Modified | Added read-only/write-gated route metadata. |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` | Modified | Added strict schemas for new tools. |
| `src/adapters/mcp/dispatch-factory.ts` | Modified | Kept apply/copy as read-only contract-only tools and preserved write-gate exceptions for actual write-capable tools only. |
| `src/adapters/mcp/tool-parity-registry.ts` | Modified | Added implemented status and tool descriptions. |
| `E2E_testing/_helpers/advertised-tool-count.mjs` | Modified | Updated visible MCP tool-count pin from 64 to 70. |
| `README.md` | Modified | Updated MCP visible tool count and GUI/forms inventory for the six new tools. |
| `test/adapters/mcp/tool-parity.test.ts` | Modified | Updated public tool-count and category pins for the expanded MCP surface. |
| `test/adapters/mcp/release-matrix-gate.test.ts` | Modified | Updated release-matrix expected counts and VBA sync inventory. |
| `test/adapters/mcp/compile-vba-tool-removal.test.ts` | Modified | Updated default-visible tool count after adding the form UI workflow tools. |
| `test/adapters/mcp/mcp-tool-output-contracts.test.ts` | Modified | Added the six new tools to the Dysflow operation-result output contract group. |
| `test/adapters/mcp/dispatch-routes-risk.test.ts` | Modified | Added new read-only and write-route risk classifications. |
| `test/adapters/mcp/dispatch-write-gate.test.ts` | Modified | Confirmed apply/copy form UI tools no longer appear as write-capable and therefore bypass the write-gate. |
| `test/adapters/mcp/dispatch-factory.test.ts` | Modified | Removed apply/copy form UI tools from binary-writer and dry-run-capable write expectations. |
| `test/core/services/form-ui-analysis-service.test.ts` | Created | Semantic analysis tests. |
| `test/core/services/form-ui-behavior-map-service.test.ts` | Created | CodeGraph evidence merge tests. |
| `test/core/services/form-ui-design-plan-service.test.ts` | Created | Plan generation/application/alignment tests. |
| `test/core/services/form-ui-pattern-copy-service.test.ts` | Created | Reference-copy traceability tests. |
| `test/core/services/form-ui-verification-service.test.ts` | Created | Verification drift tests. |
| `test/adapters/vba-sync/vba-forms-ai-tools.test.ts` | Created | Adapter boundary tests. |
| `test/adapters/mcp/form-ui-tools.test.ts` | Created | MCP registration/schema/write-gate tests. |
| `AGENTS.md` | Modified | Added AI form UI builder workflow guidance. |
| `docs/mcp-examples.md` | Modified | Added concise AI form UI builder examples. |
| `openspec/changes/ai-form-ui-builder/tasks.md` | Modified | Marked all tasks complete. |
| `openspec/changes/ai-form-ui-builder/apply-progress.md` | Created | This progress/evidence artifact. |

## Deviations / Risks

- The first-iteration CodeGraph boundary intentionally accepts caller-supplied evidence payloads only; no direct MCP-to-MCP invocation was added.
- `apply_form_design_plan` currently returns an in-memory application report; deeper FormIR mutation semantics should evolve in later slices if richer operations are approved.
- The repo already has an untracked `openspec/changes/wire-write-policy-runtime-785/` folder; it was not modified by this apply work.

## Next Recommended

Run `sdd-verify` for `ai-form-ui-builder`.
