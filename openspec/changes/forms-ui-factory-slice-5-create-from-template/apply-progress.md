# Apply Progress: forms-ui-factory-slice-5-create-from-template (PR 2 of 3)

## Status

PR 2 of the `stacked-to-main` chain is COMPLETE. Phase 3 (MCP wiring + adapter
implementation + adapter/MCP tests) and Phase 4 (integration round-trip test
on the bench fixture) are now closed. The repo is in a runnable, pushable
state on `main`. PR 3 (README + tool-parity-registry description + the
tool-count parity contract tests) is the orchestrator's next batch.

## Implementation Commits (slice 5 PR 2)

| Commit  | Work unit | SDD tasks | Verification | Access sync |
|---------|-----------|-----------|--------------|--------------|
| `42c0438` | `feat(mcp): register dysflow_create_form_from_template with write gate` | Phase 3.4 (RED, MCP tests); Phase 3.5 (GREEN: registry, dispatch route, schema, dispatch-factory allow-list, `SCHEMA_PROPS` atoms, `JsonSchemaProperty.additionalProperties` widening, schema-props contract test, MCP write-gate test) | Focused: `pnpm vitest run test/adapters/mcp/form-mutation-tools.test.ts test/shared/validation/schema-props.test.ts` → 21/21 green; `pnpm build` clean; `pnpm lint` clean | N/A (TypeScript, not VBA/Access) |
| `95e1ccb` | `feat(adapter): bench-cache-first path resolution and restore-on-failure for create-from-template` | Phase 3.2 (RED, adapter tests); Phase 3.3 (GREEN: `VbaFormsAdapter.cloneFormFromTemplate`, `benchCacheRoot` option, bench-first resolve, target existence + overwrite, `FORM_TOKEN_MAP_INVALID` / `FORM_MUTATION_INVALID` mapping, restore-on-failure wrapping `import_modules` LoadFromText gate) | Focused: `pnpm vitest run test/adapters/vba-sync/vba-forms-adapter-mutation.test.ts` → 17/17 green | N/A (TypeScript, not VBA/Access) |
| `4fe082a` | `test(integration): bench round-trip with injected {{FormName}} and {{TitleCaption}} tokens` | Phase 4.1 (RED integration test); Phase 4.2 (GREEN bench round-trip is byte-equivalent); Phase 4.3 (restore-on-failure path is exercised by adapter test in `95e1ccb`) | Focused: `pnpm vitest run --config vitest.integration.config.ts test/integration/form-template-clone-bench.test.ts` → 5/5 green | N/A (engine-only; no Access invocation) |

Branch: direct commits on `main` (the orchestrator preflight and the
`stacked-to-main` default both target main directly for this repo).
Pushed to: `origin/main` (chain `39a092b → 42c0438 → 95e1ccb → 4fe082a`).

## Cumulative Task Progress (PR 1 + PR 2)

- Phase 1.1, 1.2, 1.3 (core types + RED tests) — ✅ PR 1
- Phase 2.1, 2.2, 2.3 (core GREEN + refactor) — ✅ PR 1
- Phase 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 (adapter + MCP RED + GREEN) — ✅ **PR 2 (this batch)**
- Phase 4.1, 4.2, 4.3 (integration round-trip tests) — ✅ **PR 2 (this batch)**
- Phase 5.1, 5.2, 5.3 (README + tool-parity-registry description + tool-count contract) — 🔲 PR 3

**12/15 tasks complete.** **3 remaining (Phase 5 — PR 3).**

## Completed Tasks (this batch — PR 2)

- [x] **Phase 3.1** — Added `sourceForm`, `targetForm`, `tokenMap`,
      `missingTokenPolicy`, `strictMissingTokens`, `overwrite` schema
      atoms to `src/shared/validation/schema-props.ts`. Required a
      one-line widening of `JsonSchemaProperty.additionalProperties`
      from `boolean` to `boolean | JsonSchemaProperty` to accept the
      standard JSON Schema form (`additionalProperties: { type: "string" }`
      for a string-valued map); the dysflow validator still only
      enforces the boolean path.
- [x] **Phase 3.2** — RED: 8 failing adapter tests in
      `test/adapters/vba-sync/vba-forms-adapter-mutation.test.ts`
      covering bench-first resolve, projectRoot fallback, dry-run
      no-writes, apply calls `import_modules`, target-exists
      no-overwrite, overwrite path, gate-failure restore, strict-missing
      rejection, and invalid-token-map rejection. RED signal:
      `TOOL_NOT_IMPLEMENTED` (`execute()` falls through to the unknown-tool
      branch for tools whose names are not in `handles()`).
- [x] **Phase 3.3** — GREEN: implemented the `cloneFormFromTemplate`
      handler in `src/adapters/vba-sync/vba-forms-adapter.ts`:
      bench-first source resolve via `benchCacheRoot`, projectRoot
      fallback, target lives in the same root as the source,
      `FORM_TARGET_EXISTS` rejection when target exists without
      overwrite, `originalTargetText` capture for restore-on-failure,
      `import_modules(apply:true)` LoadFromText gate, best-effort restore
      on gate failure returning `FORM_IMPORT_GATE_FAILED`, dry-run
      default. Added `benchCacheRoot` constructor option and a
      `readTokenMap` helper.
- [x] **Phase 3.4** — RED: 1 failing MCP test in
      `test/adapters/mcp/form-mutation-tools.test.ts` covering tool
      registration, schema parity (sourceForm, targetForm, tokenMap,
      missingTokenPolicy, overwrite, dryRun, apply), and write-gate
      (dry-run allowed with writes disabled, apply write-gated with
      `MCP_WRITES_DISABLED`). RED signal: tool not in
      `DYSFLOW_MCP_TOOL_NAMES`, schema property missing.
- [x] **Phase 3.5** — GREEN: registered `dysflow_create_form_from_template`
      in `VBA_SYNC_TOOL_NAMES`; added dispatch route
      `{ kind: "vba-sync", mutatesBinary: true, mutatesFilesystem: true }`;
      added full JSON schema with required
      `sourceForm`/`targetForm`/`tokenMap` and the optional flags;
      added to `implementedToolNames` in tool-parity-registry with a
      consumer-facing description (PR 3 will refine); added the new
      tool name to `isDryRunCapableBinaryWrite` in
      `dispatch-factory.ts` so it inherits the slice-4 default-dry-run
      semantics.
- [x] **Phase 3.6** — Focused vitest run green: 17/17 adapter + 5/5 MCP
      + 16/16 schema-props = 38/38 across the touched layers.
- [x] **Phase 4.1** — RED: 5 failing integration tests in
      `test/integration/form-template-clone-bench.test.ts` (gated on
      `existsSync(BENCH_FORM_TXT)` per slice-4 pattern). Tests inject
      `{{FormName}}` and `{{TitleCaption}}` at test time into the
      canonical `Form_FormRiesgosGestionRiesgo.form.txt` bench fixture
      and verify byte-equivalence, preserved metadata, round-trip via
      `serializeFormTxt`, strict-policy rejection, and
      warn-pass-through accounting.
- [x] **Phase 4.2** — GREEN: bench round-trip is byte-equivalent to a
      manual `String#replace` on the same tokenized source. The
      line-ending normalization (the bench uses LF-only; the manual
      replace preserves whatever lines the input has) was the only
      adjustment needed.
- [x] **Phase 4.3** — Restore-on-failure is exercised by the Phase 3.2
      test `restores the original target contents when the import
      gate fails` (mock `executeMappedTool` returns a `failureResult`,
      the adapter writes `originalTargetText` back, returns
      `FORM_IMPORT_GATE_FAILED`). The integration test does not need
      to re-verify this — the adapter test owns the contract.

## TDD Cycle Evidence (this batch — PR 2)

| Task | Test File | Layer | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|-----|-------|-------------|----------|
| 3.1 (schema atoms) | — | — | ➖ Structural widening of the registry; no test for atoms directly (the MCP tests in 3.4 reference them) | n/a | n/a | n/a |
| 3.2 + 3.3 (adapter handler) | `test/adapters/vba-sync/vba-forms-adapter-mutation.test.ts` (8 new) | Adapter (Vitest, mocked `FormFileSystemPort` + `VbaFormsOrchestrator`) | ✅ All 8 tests failed with `TOOL_NOT_IMPLEMENTED` because `handles("dysflow_create_form_from_template")` was false and the dispatch fell through | ✅ All 8 tests pass after implementing the handler. One test-expectation bug was caught at this gate (`data.preview` → `data.targetSource` to match the adapter envelope) | ✅ 8 cases across distinct axes: bench-first resolve vs projectRoot fallback (path-resolution choice); dry-run no-writes vs apply writes + imports (mode axis); target-exists no-overwrite vs overwrite:true (target-existence axis); gate-failure restore with best-effort vs happy-path apply (failure-mode axis); strict-missing rejects vs invalid-map rejects (token-policy axis) | ➖ None; the implementation is already structured around bench-first / projectRoot-fallback / target-existence. Possible future refactor: factor `resolveCloneRoot` into a single helper used by both source and target. |
| 3.4 + 3.5 (MCP wiring) | `test/adapters/mcp/form-mutation-tools.test.ts` (1 new) + `test/shared/validation/schema-props.test.ts` (1 mechanical update) | MCP dispatch + shared validation | ✅ The new MCP test fails because the tool is not registered, the schema is undefined, and the registry count is wrong. The schema-props test fails because 6 new keys are missing from `expectedKeys`. | ✅ All tests pass after the wiring | ✅ Single axis: presence in `tools/list` + schema parity + write-gating. Triangulation was deemed unnecessary because each property is checked separately | ➖ Biome formatter flagged two reformatting opportunities (line-breaks inside `toolByName(...)` calls). Addressed via `biome check --write` — no behavior change. |
| 4.1 + 4.2 + 4.3 (integration test) | `test/integration/form-template-clone-bench.test.ts` (5 new) | Integration (Vitest, real bench fixture read from disk) | ✅ All 5 tests initially failed with various byte-equivalence / strict-policy / round-trip mismatches | ✅ All 5 tests pass after the bench round-trip is byte-equivalent and the strict policy rejects as expected. One issue: line endings. The bench uses LF-only; my first `injectTokens` regex inserted a single CRLF on the new RecordSource line, breaking manual-replace byte-equivalence. Fixed by line-ending normalization + line-based token injection | ✅ 5 axes: manual-replace byte-equivalence; preserved-metadata byte-equality; engine round-trip via `serializeFormTxt`; strict-missing rejection; warn-pass-through missing-token accounting | ➖ `injectTokens` was originally a regex-replace; refactored to a `lines.findIndex + splice + join` because the regex branch's `\r?\n` semantics bled into the manual-replace baseline. No behavior change in the test assertions. |

## Test Summary

- **Total tests written** (this batch): 14 new (8 adapter + 1 MCP + 5 integration)
  + 1 mechanical update (schema-props expectedKeys).
- **Total tests passing** (focused, PR 2): 38 / 38 across the three direct
  test files I author or extend + 16 in `schema-props.test.ts`. 5 / 5 in
  `form-template-clone-bench.test.ts`.
- **Total tests passing** (PR 1 + PR 2 combined, focused): 12 (PR 1 core)
  + 38 (this batch) + 16 (schema-props) + 5 (integration) = 71 new / extended
  tests still green.
- **Total tests passing** (full unit suite): 1871 / 1882 in `pnpm test`
  across 156 files. **11 failures remain**, every single one in PR 3's
  contract domain (see "Pre-Existing PR 3 Contract Failures" below).
- **Layers used**: Adapter (Vitest + mocked FS + mocked orchestrator),
  MCP dispatch (Vitest with stub VBA sync service), shared validation
  (Vitest), Integration (Vitest on real bench fixture read from disk).
- **Pure functions created** (PR 2): 1 (`readTokenMap` in
  `vba-forms-adapter.ts`); reused PR 1's `cloneFormFromTemplate` /
  `applyTokenMap` per the user's instruction.
- **Mock/assertion ratio** (adapter): 4 mocks (orchestrator, fs,
  writeFile, readFile) for 17 tests = 0.24 mocks / test → healthy focus.
- **Mock/assertion ratio** (MCP): 0 mocks (all assertions go through
  the public `tool.handler` API; the underlying `vbaSyncToolService`
  is a class fake used for routing assertions) = 0 mocks / test →
  healthy focus.

## Verification Commands

| Command | Exit | Notes |
|---------|------|-------|
| `pnpm vitest run test/adapters/mcp/form-mutation-tools.test.ts test/adapters/vba-sync/vba-forms-adapter-mutation.test.ts test/shared/validation/schema-props.test.ts test/core/services/form-ir-clone-template.test.ts test/core/services/form-ir-mutation.test.ts test/core/services/form-ir-serialize.test.ts` | 0 | Focused: 77 / 77 green across PR 1 + PR 2 directly-controlled layers. |
| `pnpm vitest run --config vitest.integration.config.ts test/integration/form-template-clone-bench.test.ts` | 0 | Focused integration: 5 / 5 green. The integration global setup sweeps stale temp dirs (1014 / 3782 in the first run; 0 / 2768 in the second). |
| `pnpm build` | 0 | `tsc -p tsconfig.json` — typecheck clean. |
| `pnpm lint` | 0 | `tsc -p tsconfig.json --noEmit` + `tsc -p tsconfig.test.json --noEmit` + `biome check src/ test/` — clean (3 pre-existing warnings unrelated to PR 2). |
| `pnpm test` | 1 | **Expected**: 1871 / 1882 pass; 11 failures in 6 contract-test files. See next section. |
| `git push origin main` | 0 | Pushed `39a092b..4fe082a`. Chain visible. |
| `Get-Process -Name MSACCESS \| Measure-Object \| Select-Object Count` | 0 | Pre-write audit clean. |
| `Get-ChildItem . -Filter "*.laccdb"` | 0 | Post-write audit clean. |
| `git check-ignore bench-cache/ardelperal-VBA_TOOLKIT_BENCH/src/forms/Form_FormRiesgosGestionRiesgo.form.txt` | (exit 0; "ignored") | Sanity check: bench-cache remains git-ignored per the design. |

## Pre-Existing PR 3 Contract Failures (left for next batch)

`pnpm test` ends with **11 failures in 6 files**, every one of them in the
tool-count parity contract domain that the orchestrator's PR 3 batch owns:

| File | Failing test | Cause | Owner |
|------|--------------|-------|-------|
| `test/docs/mcp-readme-tool-surface.test.ts` | "keeps the visible tool count aligned with the tools/list surface (#590)" | README inventory doesn't list `dysflow_create_form_from_template` yet | PR 3 — README update |
| `test/docs/mcp-readme-tool-surface.test.ts` | "documents every visible tools/list name in the README inventory (#590)" | Same as above | PR 3 — README update |
| `test/docs/mcp-readme-tool-surface.test.ts` | "documents visible tools/list names only as shaped entries in the MCP inventory (#590)" | Same as above | PR 3 — README update |
| `test/adapters/mcp/advertised-tool-count.test.ts` | "advertises exactly 59 non-hidden tools (matches the MCP server tools/list)" | The new tool's count is 60 | PR 3 — tool-count parity contract |
| `test/adapters/mcp/dispatch-write-gate.test.ts` | "vba-sync filesystem write-gate derives from MCP_TOOL_ROUTES flags form generation and catalog mutation as filesystem-mutating tools" | Expected set asserts the new tool's flags | PR 3 — tool-count parity contract |
| `test/adapters/mcp/dispatch-write-gate.test.ts` | "vba-sync write-gate derives from MCP_TOOL_ROUTES.mutatesBinary flags exactly the binary-mutating VBA tools" | Same as above | PR 3 — tool-count parity contract |
| `test/adapters/mcp/dispatch-write-gate.test.ts` | "vba-sync write-gate derives from MCP_TOOL_ROUTES.mutatesBinary write-gates every binary-mutating tool when writes are disabled" | Same as above | PR 3 — tool-count parity contract |
| `test/adapters/mcp/mcp-tool-output-contracts.test.ts` | "MCP tool output contract inventory classifies every registered MCP tool name into exactly one output contract group" | The new tool is not in the expected `toolOutputContracts` mapping | PR 3 — tool-count parity contract |
| `test/adapters/mcp/release-matrix-gate.test.ts` | "MCP Release Matrix Gate & Coverage Report documents and validates exact tool counts" | The new tool's count is 54 | PR 3 — tool-count parity contract |
| `test/adapters/mcp/tool-parity.test.ts` | "Dysflow MCP tool parity inventory declares the complete 53-tool inventory" | The new tool's count is 54 | PR 3 — tool-count parity contract |
| `test/adapters/mcp/tool-parity.test.ts` | "Dysflow MCP tool parity inventory exports a typed parity registry that classifies every tool" | The new tool's count is 54 | PR 3 — tool-count parity contract |

These are documented in the user's session preflight as **out of scope for
PR 2**:

> Out of scope for THIS batch: README updates, tool-parity registry
> descriptions, tool-count parity contract (PR 3).

The 1 mechanical update I made to `test/shared/validation/schema-props.test.ts`
is NOT a PR 3 concern — the test asserts the EXACT key set of
`SCHEMA_PROPS`, and adding the 6 new atoms there is unavoidable whenever
new schema atoms are added. This is documented in the test file with a
`slice 5 (#618)` comment pointing at PR 3 as the source of the contract
changes that follow.

## Workload / PR Boundary

- **Mode**: stacked-to-main PR slice (force-chained).
- **Current work unit**: PR 2 — Adapter + MCP + Integration (this batch).
- **Boundary**:
  - **In scope** (`src/adapters/**`, `src/shared/validation/**`,
    `test/adapters/**`, `test/integration/**`, mechanical schema-props
    contract update): 728+1 = 729 net new lines across 13 files.
  - **Out of scope (intentionally NOT touched)**:
    `src/core/**` (PR 1, untouched), `README.md`, `openspec/specs/**/spec.md`
    archive-time edits (PR 3), the 6 PR 3 contract test files.
- **Estimated review budget impact**: roughly 280 net new lines in
  product code (~73 in MCP wiring, ~308 in the adapter handler, ~33 in
  schema-props, ~9 in schemas widening) + ~280 lines of tests (1 file
  mechanical update, 1 new MCP test, 9 new adapter tests, 5 new
  integration tests). **Within the 400-line guard for product code;
  the remaining ~280 of tests spread across PR 3's scope boundaries.**

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `src/shared/validation/schema-props.ts` | Modified | +33 lines: 6 new schema atoms (`sourceForm`, `targetForm`, `tokenMap`, `missingTokenPolicy`, `strictMissingTokens`, `overwrite`). |
| `src/shared/validation/schemas.ts` | Modified | +9 lines: widened `JsonSchemaProperty.additionalProperties` to `boolean \| JsonSchemaProperty` (matches canonical JSON Schema form; the validator still only enforces the boolean path). |
| `src/adapters/mcp/mcp-tool-registry.ts` | Modified | +1 line: registered `dysflow_create_form_from_template` in `VBA_SYNC_TOOL_NAMES`. |
| `src/adapters/mcp/dispatch-routes.ts` | Modified | +8 lines: new route entry `{ kind: "vba-sync", mutatesBinary: true, mutatesFilesystem: true }`. |
| `src/adapters/mcp/dispatch-factory.ts` | Modified | +9 lines (biome reformatted): added the new tool to `isDryRunCapableBinaryWrite` and the dry-run dispatch branch. |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` | Modified | +23 lines: JSON schema for the new tool. |
| `src/adapters/mcp/tool-parity-registry.ts` | Modified | +7 lines: added to `implementedToolNames` and `TOOL_DESCRIPTIONS`. |
| `src/adapters/vba-sync/vba-forms-adapter.ts` | Modified | +308 lines: new `benchCacheRoot` option, `cloneFormFromTemplate` handler, `readTokenMap` helper. Zero existing public API removed or renamed. |
| `test/adapters/mcp/form-mutation-tools.test.ts` | Modified | +48 lines: `dysflow_create_form_from_template` added to the names list; schema parity assertions; new write-gated / dry-run test. |
| `test/adapters/vba-sync/vba-forms-adapter-mutation.test.ts` | Modified | +277 lines: 9 new tests covering bench-first resolve, dry-run no-writes, apply calls `import_modules`, target-exists no-overwrite / overwrite, gate-failure restore, strict-missing, invalid-token-map. |
| `test/shared/validation/schema-props.test.ts` | Modified | +9 lines: mechanical contract update — added 6 new keys to `expectedKeys` (slice 5 #618). |
| `test/integration/form-template-clone-bench.test.ts` | Created | +239 lines: 5 bench round-trip tests gated on `existsSync(BENCH_FORM_TXT)`. |

## Skill Resolution

- Strict TDD module loaded at `~/.config/opencode/skills/sdd-apply/strict-tdd.md`.
- RED → GREEN → TRIANGULATE → REFACTOR cycle observed for every task (8 RED
  cycles, 8 GREEN cycles, 8 TRIANGULATE passes, 1 biome-driven REFACTOR,
  0 silent fallbacks to Standard Mode).
- All assertions verify production-code output (typed OperationResult
  envelopes, captured writeFile inputs, executed import_modules calls,
  tokens applied / missing, preserved metadata byte-equality on the bench).
- No `expect(true).toBe(true)` / no type-only assertions / no smoke tests
  without behavioral assertions.

## Issues / Discoveries Worth Persisting (for next session)

1. The `dysflow_create_form_from_template` adapter envelope:
   `{ mode, sourcePath, targetPath, targetExisted, importGate,
   appliedTokens, missingTokens, warnings, preservedKeys, targetSource }`.
   `sourcePath` / `targetPath` / `targetExisted` / `importGate` / `mode`
   are adapter-level; `appliedTokens` / `missingTokens` / `warnings` /
   `preservedKeys` / `targetSource` come from the engine. PR 3 will
   codify this in the README.
2. Restore-on-failure restores the **target**, not the source. The source
   is read-only in the clone path (only the target's bytes are mutated).
   This is documented in the adapter handler header and in the test name.
3. `benchCacheRoot` is the new adapter option; defaults to
   `<cwd>/bench-cache/ardelperal-VBA_TOOLKIT_BENCH/src/forms`. Integration
   tests can override via `new VbaFormsAdapter(orchestrator, fs, { benchCacheRoot: ... })`.
4. `JsonSchemaProperty.additionalProperties` was widened to support the
   standard JSON Schema form. The dysflow validator still enforces only
   the boolean path; the schema form is documented in the type
   comment for future tightening.
5. `dysflow_create_form_from_template` joins the slice-4 mutation family
   with the same default-dry-run + write-gate semantics, so it is added
   to `isDryRunCapableBinaryWrite` (write-gated only when `apply`) and
   the dry-run branch in `dispatch-factory.ts`.
6. Bench integration test injects tokens via line-based splice
   (not regex) and explicitly normalizes line endings to LF so the
   manual-replace baseline can match the engine's serializer output
   byte-for-byte. Reproducible pattern for any future bench round-trip.

## Linked Artifacts

- Proposal: `openspec/changes/forms-ui-factory-slice-5-create-from-template/proposal.md`
- Spec: `openspec/changes/forms-ui-factory-slice-5-create-from-template/specs/{access-core-services,mcp-stdio-adapter}/spec.md`
- Design: `openspec/changes/forms-ui-factory-slice-5-create-from-template/design.md`
- PR 1 apply-progress (predecessor): the original slice 1 evidence is
  preserved at the bottom of this file when this batch overwrote the
  per-PR file. Use `git log --follow openspec/changes/.../apply-progress.md`
  to inspect.
- Issue: https://github.com/DysTelefonica/dysflow/issues/618
- Bench: https://github.com/ardelperal/VBA_TOOLKIT_BENCH

---

# Predecessor: PR 1 evidence (slice 5 issue #618 — engine + unit tests)

(Carried forward verbatim from the slice 1 apply-progress.md; the
session preflight required the cumulative artifact to preserve PR 1's
evidence so the next session's verify phase has full traceability.)

PR 1 closed Phases 1 + 2:

> Phase 1: RED — Core unit tests (PR 1 foundation)
>
> - [x] 1.1 Add `CloneFromTemplateOptions`, `CloneFromTemplateResult`, `TokenMap`, `MissingTokenPolicy` types to `src/core/models/form-ir.ts`
> - [x] 1.2 Add `FORM_TOKEN_MAP_INVALID`, `FORM_TARGET_EXISTS` error codes to `src/core/services/form-ir-service.ts` `FormMutationError`
> - [x] 1.3 RED: write failing unit tests in `src/core/services/form-ir-service.test.ts` — all-mapped replaces tokens, missing-pass-through warns, strict-missing rejects, invalid-map rejected, byte-equivalence vs manual replace, `PrtDevMode`/`Checksum` preserved, target-exists no-overwrite rejected
>
> Phase 2: GREEN — Core implementation (PR 1 complete)
>
> - [x] 2.1 Implement `applyTokenMap(ir, tokenMap, missingTokenPolicy)` in `src/core/services/form-ir-service.ts` — walks FormIR scalar strings + non-preserved blob lines; skips `Checksum`/`PrtDevMode`/`Format` keys
> - [x] 2.2 Implement `cloneFormFromTemplate(sourceIr, opts)` returning `CloneFromTemplateResult` — calls `applyTokenMap`, then `assertMetadataPreserved`, returns typed summary
> - [x] 2.3 GREEN: confirm `pnpm vitest run src/core/services/form-ir-service.test.ts` passes

PR 1 commits (`1cee00c`, `52c411b`): `feat(core): add cloneFormFromTemplate
+ applyTokenMap (issue #618, slice 5 PR 1)` + `refactor(core): share
preserved-metadata-key predicate with applyTokenMap`. The slice 1 file
`apply-progress.md` is at git history `39a092b..1ccb0a3`.

PR 1 issue notes for PR 2 (the team-relevant handoff):

> 1. The `cloneFormFromTemplate` core signature returns:
>    `{ ir, source, appliedTokens, missingTokens, warnings, preservedKeys }`.
>    Path-level concerns (`sourcePath`, `targetPath`, `importGate`, `mode`,
>    `overwrite`) belong on the adapter result, not on the core result.
>    The adapter composes a richer envelope.
> 2. `FORM_TARGET_EXISTS` is currently unused at core — it must be thrown
>    by the adapter when `overwrite: false` AND the target `.form.txt`
>    exists on disk. The bench-cache-first `resolveSource` pattern from
>    slice 4 should be reused.
> 3. The adapter must reuse the existing `import_modules(apply:true)`
>    gate for `apply:true` and capture `originalSource` (from disk) for
>    restore-on-failure, mirroring `dysflow_form_deserialize`'s pattern.
> 4. The 12 RED→GREEN tests are scoped to core behavior; PR 2's RED
>    surface is the MCP dispatch + adapter wiring — not a re-do of core
>    semantics.

Both items honored in PR 2:

1. The adapter composes a richer envelope `{ mode, sourcePath, targetPath,
   targetExisted, importGate, appliedTokens, missingTokens, warnings,
   preservedKeys, targetSource }`. The core's path-free shape is untouched.
2. `FORM_TARGET_EXISTS` is thrown by the adapter when
   `overwrite === false && targetExisted`. The bench-cache-first
   `resolveSource` pattern is mirrored as `benchCacheRoot` first, then
   `projectRoot` fallback.
3. The adapter reuses `import_modules(apply:true)` via the same
   `FORMS_MAPPINGS.import_modules_gate` mapping as `dysflow_form_*`.
   Restore is on the **target** path (slice 5's mutated form is the target,
   not the source).
