# Verification Report: AI Form UI Builder

**Change**: ai-form-ui-builder  
**Mode**: Strict TDD  
**Status**: failed

## Executive Summary

Verification failed. The branch has passing focused tests, passing full `pnpm test`, and passing `pnpm build`, but `apply_form_design_plan` can overwrite a target `.form.txt` with a synthetic status string instead of applying a valid FormIR/form mutation. That violates the spec/design application contract and is a write-safety blocker. `pnpm lint` also fails on formatting/import-order/style issues.

## Artifacts Checked

- `openspec/changes/ai-form-ui-builder/proposal.md`
- `openspec/changes/ai-form-ui-builder/specs/ai-form-ui-builder/spec.md`
- `openspec/changes/ai-form-ui-builder/design.md`
- `openspec/changes/ai-form-ui-builder/tasks.md`
- `openspec/changes/ai-form-ui-builder/apply-progress.md`
- Current branch/worktree diff on `feat/ai-form-ui-builder`
- New skill/docs, core services, adapter/MCP wiring, and focused tests

## Commands Run and Results

| Command | Result |
|---|---|
| `pnpm vitest run test/core/services/form-ui-analysis-service.test.ts test/core/services/form-ui-behavior-map-service.test.ts test/core/services/form-ui-design-plan-service.test.ts test/core/services/form-ui-pattern-copy-service.test.ts test/core/services/form-ui-verification-service.test.ts test/adapters/vba-sync/vba-forms-ai-tools.test.ts test/adapters/mcp/form-ui-tools.test.ts` | Passed: 7 files, 21 tests. |
| Same focused command with `--coverage` | Tests passed, command failed global coverage thresholds due focused subset: line 7.43% vs threshold 84%. Changed-file coverage captured below. |
| `pnpm build` | Passed. |
| `pnpm test` with `.dysflow/project.json` temporarily moved aside and restored | Passed: 226 files, 2813 passed, 1 skipped, 1 todo. |
| `pnpm lint` | Failed: 20 Biome/format/style errors. No TypeScript boundary/type failure was reported before Biome failed. |
| `git status --short` and wire-policy path checks | No tracked diff under `openspec/changes/wire-write-policy-runtime-785/`; existing untracked folder remains present. |

## Completeness

| Metric | Value |
|---|---:|
| Tasks total | 13 |
| Tasks complete | 13 |
| Tasks incomplete | 0 |
| Focused tests | 21/21 passing |
| Full suite | 2813/2815 passing, 1 skipped, 1 todo |

## TDD Compliance

| Check | Result | Details |
|---|---|---|
| TDD Evidence reported | ✅ | `apply-progress.md` includes a TDD Cycle Evidence table. |
| All implementation tasks have tests | ✅ | Core, adapter, and MCP test files exist and pass. Docs-only tasks correctly marked N/A. |
| RED confirmed | ⚠️ | RED history is reported in apply-progress; current verification can confirm test files exist, not historical failure state. |
| GREEN confirmed | ✅ | Focused tests and full suite pass. |
| Triangulation adequate | ⚠️ | Core scenarios are triangulated, but application semantics are tested against placeholder write behavior instead of valid form mutation. |
| Safety net | ✅ | Full suite passed after isolating `.dysflow/project.json`. |

## Changed File Coverage Snapshot

| File | Line % | Branch % | Rating |
|---|---:|---:|---|
| `src/core/services/form-ui-analysis-service.ts` | 84.21 | 48.15 | ⚠️ Acceptable |
| `src/core/services/form-ui-behavior-map-service.ts` | 100.00 | 75.00 | ✅ Excellent |
| `src/core/services/form-ui-design-plan-service.ts` | 100.00 | 85.71 | ✅ Excellent |
| `src/core/services/form-ui-pattern-copy-service.ts` | 100.00 | 100.00 | ✅ Excellent |
| `src/core/services/form-ui-verification-service.ts` | 73.33 | 50.00 | ⚠️ Low |
| `src/adapters/vba-sync/vba-forms-ai-tools.ts` | 53.19 | 42.86 | ⚠️ Low |
| `src/adapters/vba-sync/vba-forms-adapter.ts` | 75.00 | 71.19 | ⚠️ Low |
| MCP route/schema/registry files | 33.33-100.00 | 0.00-100.00 | Mixed |

## Spec Compliance Matrix

| Requirement / Scenario | Result | Evidence |
|---|---|---|
| Workflow slices stay separate | ✅ COMPLIANT | Six distinct tools registered/routed/tested. |
| Coverage is required | ✅ COMPLIANT | Strict TDD evidence plus focused/full tests. |
| Semantic UI analysis | ✅ COMPLIANT | `analyzeFormUi` tests pass. |
| Screenshot alone insufficient | ⚠️ PARTIAL | Public schema requires `sourcePath`; no direct screenshot-only regression test found. |
| Behavior map produced | ✅ COMPLIANT | Behavior-map tests pass with caller-supplied evidence. |
| CodeGraph-VBA required | ⚠️ PARTIAL | MCP schema requires `codegraphEvidence`; adapter/core still tolerate empty evidence with warning. |
| Plan derives from map | ✅ COMPLIANT | Design-plan tests pass and preserve mapped behavior references. |
| Application preserves alignment | ❌ FAILING | `apply:true` writes a placeholder string to target file, not a valid aligned form artifact. |
| Pattern copy traceable and non-erasing | ✅ COMPLIANT | Pattern-copy tests pass. |
| Verification compatible/drift cases | ✅ COMPLIANT | Verification tests pass for success and handler drift failure. |

## Issues Found

### CRITICAL

1. `src/adapters/vba-sync/vba-forms-ai-tools.ts:117-129` — `apply_form_design_plan` with `apply:true` writes ``AI Form UI Builder plan applied: ${JSON.stringify(result)}`` directly to `targetPath`/`sourcePath`. This can corrupt a `.form.txt` source and does not apply through FormIR or existing guarded mutation/import paths. Remediation: make this tool dry-run/plan-only until real FormIR operations exist, or route valid operations through existing form mutation/serialization tooling with validation and rollback; never overwrite form source with a status string.

### WARNING

1. `pnpm lint` fails with 20 Biome/format/style errors, including import order/formatting in new form UI files and `test/core/services/form-ui-verification-service.test.ts:26` forbidden non-null assertion.
2. Focused coverage command exits non-zero because global coverage thresholds are applied to a focused subset.
3. `README.md` says `codegraphEvidence` is optional for `map_form_behavior`, while the MCP schema requires it.
4. `openspec/changes/wire-write-policy-runtime-785/` remains as an unrelated untracked folder; no tracked diff was detected there.

### SUGGESTION

1. Add a negative test proving screenshot-only / no-source analysis cannot become a behavior source.
2. Add an adapter-level test that `map_form_behavior` rejects missing/empty CodeGraph evidence if the public contract intends it to be mandatory below the MCP schema too.

## Next Recommended

Remediate the critical apply-path defect and lint failures, then rerun `sdd-verify`.

## skill_resolution

paths-injected
