# Tasks: feat-759-no-compile

Strict TDD (RED → GREEN per `web-tdd-philosophy`). Two PRs: PR-1 = Slice 1 (Active-lock fix); PR-2 = Slices 2+3+4 (hard break + docs).

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | PR-1 ~145; PR-2 ~1110 |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | PR-1 → PR-2 |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium

## Phase 1: PR-1 — Slice 1 (PS, non-breaking)

- [x] 1.1 **RED E2E** (`test/e2e/import-modules-broken-project.e2e.test.ts`, new): fixture `.cls` `Sub Bad : End Sub`; `delete_module(force:true)` + `import_modules` succeed, `verify_code` returns `ok: true`. Locking test: this file RED. **Done — see `apply-progress-slice-1.md` for RED limitation note.**
- [x] 1.2 **RED Pester** (`dysflow-vba-manager.Tests.ps1`, new Describe): assert `Remove-AccessObjectOrComponent` uses `RunCommand(126)` at :2205 and :2247. Locking test: this atom RED. **Done — characterization RED (asserts current shape, flipped in GREEN).**
- [x] 1.3 **GREEN** (`dysflow-vba-manager.ps1`): :2205 + :2247 — `RunCommand(126)` → `RunCommand(280)`; drop :2662 first-attempt 126, keep :2668 280 fallback. Locking test: 1.1 E2E green; 1.2 Pester asserts 280. **Done.**
- [x] 1.4 **REFACTOR** (`dysflow-vba-manager.ps1`): extract `Save-VbaProjectModulesQuiet` if :2205/:2247 identical; skip if no duplication. Locking test: Pester + E2E green. **Done — skipped per spec's "negligible duplication" guidance (the two sites have slightly different catches).**

## Phase 2: PR-2, Commits 1-2 — Slice 2 (TS schemas)

- [ ] 2.1 **RED** (`vba-sync-schemas.test.ts`, new): `import_modules({ compile: true })` → `MCP_INPUT_INVALID`; `rollbackOnCompileFail: true` → `MCP_INPUT_INVALID`; `import_all({ compile: true })` → `MCP_INPUT_INVALID`; `test_vba` has no `compile` prop. Locking test: this file RED.
- [ ] 2.2 **GREEN**: `schema-props.ts:144` — delete `SCHEMA_PROPS.compile`; `vba-sync-schemas.ts:89,94-98,115` — drop `compile`/`rollbackOnCompileFail`; `vba-modules-adapter.ts:26-31+` — drop `COMPILE_MAPPING` + post-import compile + rollback; `vba-execution-adapter.ts` — drop dead `truthy(params.compile)`; `http-schemas.ts` + `server.ts` — drop HTTP `compile`. Locking test: 2.1 flips GREEN; all vitest green.

## Phase 3: PR-2, Commits 3-5 — Slice 3 (tool removal)

- [ ] 3.1 **RED** (6 test files): `mcp-tool-registry.test.ts` — `compile_vba` NOT in `toolsVisible`; `tools.test.ts` — dispatch → tool-not-found; `mcp-tool-action-map-source.test.ts` — no `compile_vba`; `vba-execution-adapter.test.ts` — `EXECUTION_MAPPINGS` no `compile_vba`; `vba-sync-adapter.test.ts` — `handles("compile_vba")` → false; Pester AST scan: `Invoke-Compile*`/`New-CompileFailureResult` gone. Locking test: all above RED.
- [ ] 3.2 **GREEN**: remove `compile_vba` from `mcp-tool-registry.ts:11,37`; `dispatch-routes.ts`; `dispatch-factory.ts`; `vba-sync-schemas.ts:161-165`; `tool-parity-registry.ts`; `vba-execution-adapter.ts:25`; `handles`/`execute` in both adapters. Locking test: 3.1 GREEN; all vitest green.
- [ ] 3.3 **GREEN PS** (`scripts/dysflow-vba-manager.ps1`): delete `Invoke-CompileAction` (:4252), `Invoke-CompileVbaProject` (:2848, incl. :2859+:2873), `New-CompileFailureResult` (:2821). Locking test: 3.1 Pester AST GREEN; all Pester green.
- [ ] 3.4 **GREEN errors**: `error-codes.ts` — remove `VBA_COMPILE_ERROR`; `vba-execution-adapter.ts` + PS runner — remove all surfaces; `dysflow-get-capabilities-tool.test.ts` — update capability test. Locking test: capability test green; all vitest + Pester green.

## Phase 4: PR-2, Commits 6-8 — Slice 4 (docs sweep)

- [ ] 4.1 **GREEN docs sweep**: `README.md:~666` — drop `compile_vba`; `AGENTS.md:~152,189,191` — drop from sync loop; `docs/mcp-examples.md:~44` — drop `compile:true`; `docs/release-checklist.md:~88,96` — drop `compile_vba expected:"error"`; `docs/testing/e2e-battery.md:~66,126,284,290`; `docs/testing/repo-quality-gates.md` + `docs/tech-debt/TRACKING.md` — grep+sweep; `openspec/specs/vba-manager-actions/spec.md` + `access-operation-contracts/spec.md` — apply deltas + archive. Locking test: `grep -rnE '\bcompile\b' README.md AGENTS.md docs/ src/ openspec/specs/` → 0 matches (excl. tsconfig compilerOptions, CHANGELOG historical, archive).
- [ ] 4.2 **GREEN version** (`package.json` + `CHANGELOG.md`): bump to 1.18.0; add `[v1.18.0]` entry with all removals + migration note + SHAs. Locking test: N/A.

OOS: `verify_code`, CHANGELOG history, `docs/archive/**`, Bug 2, `openspec/specs/vba-inline-execution/spec.md`.
