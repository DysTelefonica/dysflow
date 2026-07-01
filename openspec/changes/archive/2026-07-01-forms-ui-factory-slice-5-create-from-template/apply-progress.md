# Apply Progress: forms-ui-factory-slice-5-create-from-template (PR 3 of 3 — COMPLETE)

## Status

PR 3 of the `stacked-to-main` chain is COMPLETE. Phase 5 (README docs +
parity contract) is now closed. The full chain `1ccb0a3 → 39a092b → 42c0438
→ 95e1ccb → 4fe082a → 5bee2c9 → 66e2c4b` is pushed to `origin/main`. The
repo is green end-to-end (`pnpm test` exits 0; 1882/1882 tests pass across
156 files; the 11 contract failures PR 2 flagged are now closed).
Ready for `sdd-verify`.

## Implementation Commits (slice 5 PR 3)

| Commit  | Work unit | SDD tasks | Verification | Access sync |
|---------|-----------|-----------|--------------|--------------|
| `5bee2c9` | `docs(mcp): document dysflow_create_form_from_template in README` | Phase 5.1 (README inventory entry, signature, dry-run default, token-map description; bumped visible-count callouts 59 → 60) | Focused: `pnpm vitest run test/docs/mcp-readme-tool-surface.test.ts` → 4/4 green (was 1/4) | N/A |
| `66e2c4b` | `feat(mcp): align parity registry + contract tests with new tool` | Phase 5.2 (refined `TOOL_DESCRIPTIONS` copy: PRESERVED_METADATA_KEYS skipping, strict-missing alias, restore-on-gate-failure, automatic `.form.txt` extension); Phase 5.3 (mechanically evolved inventory assertions: `tool-parity.test.ts` 29/53 → 30/54, `release-matrix-gate.test.ts` 53/59 → 54/60, `advertised-tool-count.test.ts` 59 → 60, `dispatch-write-gate.test.ts` adds tool to filesystemWriters/binaryWriters sets + `minimalInput` entry, `mcp-tool-output-contracts.test.ts` adds tool to `vbaManagerDysflowResult` group) | Focused: `pnpm vitest run test/docs/mcp-readme-tool-surface.test.ts test/adapters/mcp/advertised-tool-count.test.ts test/adapters/mcp/dispatch-write-gate.test.ts test/adapters/mcp/mcp-tool-output-contracts.test.ts test/adapters/mcp/release-matrix-gate.test.ts test/adapters/mcp/tool-parity.test.ts` → 36/36 green (was 25/36 = 11 failing) | N/A |

Branch: direct commits on `main` (the orchestrator preflight and the
`stacked-to-main` default both target main directly for this repo).
Pushed to: `origin/main` (full chain `1ccb0a3 → 66e2c4b`).

## Cumulative Task Progress (PR 1 + PR 2 + PR 3)

- Phase 1.1, 1.2, 1.3 (core types + RED tests) — ✅ PR 1
- Phase 2.1, 2.2, 2.3 (core GREEN + refactor) — ✅ PR 1
- Phase 3.1, 3.2, 3.3, 3.4, 3.5, 3.6 (adapter + MCP RED + GREEN) — ✅ PR 2
- Phase 4.1, 4.2, 4.3 (integration round-trip tests) — ✅ PR 2
- Phase 5.1, 5.2, 5.3 (README + tool-parity-registry description + tool-count contract) — ✅ **PR 3 (this batch)**

**18/18 tasks complete.** **0 remaining.**

## Completed Tasks (this batch — PR 3)

- [x] **Phase 5.1** — Added `dysflow_create_form_from_template` entry under
      `§4 GUI & Forms` in `README.md` immediately after
      `dysflow_form_deserialize`. Documents: `{{Token}}` syntax and
      `{{FormName}} → Form_FormNuevaAuditoria` example; bench-cache-first /
      projectRoot-second path resolution; default dry-run returning the
      post-replacement preview + applied/missing token summary;
      `apply:true` writes the target and routes through the `import_modules`
      LoadFromText gate with restore-on-failure; `overwrite:true` to
      replace an existing target; `missingTokenPolicy:'warn-pass-through'`
      (default) vs `'strict'`. Parameter list covers `sourceForm`,
      `targetForm`, `tokenMap`, `missingTokenPolicy`, `strictMissingTokens`,
      `overwrite`, `dryRun`/`apply`. Bumped the visible-count callouts
      in the header (line 22) and `### It is` (line 54) from `59` to `60`
      to match `buildHiddenToolRegistry(tools).filter(!hidden).length`.

- [x] **Phase 5.2** — Refined the `TOOL_DESCRIPTIONS` copy for
      `dysflow_create_form_from_template` in
      `src/adapters/mcp/tool-parity-registry.ts` (the MVP copy PR 2 left
      behind). The refined copy documents:
      - `PRESERVED_METADATA_KEYS` skipping (`Checksum` / `PrtDevMode*` /
        `Format`) so `PrtDevMode` round-trips unchanged;
      - the `strictMissingTokens:true` alias of
        `missingTokenPolicy:'strict'` (both fail with
        `FORM_MUTATION_INVALID`);
      - the bench-cache-first / projectRoot-second appends `.form.txt`
        automatically (callers pass a bare form name);
      - default dry-run `apply:true` write semantics + restore-on-failure.
      - The `implementedToolNames` set in `tool-parity-registry.ts` was
        already updated by PR 2 (no-op for PR 3).

- [x] **Phase 5.3** — Mechanically evolved the inventory assertions in the
      5 contract-test files PR 2 flagged, plus added a `minimalInput`
      entry for the new tool in `dispatch-write-gate.test.ts` so the
      empty-input write-gate test exercises it correctly. The previous
      failure mode for the binary-mutating test was `MCP_INPUT_INVALID:
      sourceForm is required.` because the schema requires
      `sourceForm`/`targetForm`/`tokenMap`; with a valid `apply:true`
      input the test now reaches the write-gate and returns
      `MCP_WRITES_DISABLED` as expected.

## TDD Cycle Evidence (this batch — PR 3)

The 11 failing tests are already RED by design (they encode the contract
that the inventory asserts the tool count and presence in the README).
PR 3 closes them with the minimum mechanical updates to the codebase +
README + tool descriptions. Each update is justified by the slice-5 spec
scenarios ("Public Create-From-Template MCP Tool",
"Create-From-Template Write-Gate and Dry-Run Semantics") and the design
decision (`Dry-run is the default` — slice-5 `design.md`).

| Update | Test File | RED (pre-existing) | GREEN | TRIANGULATE | REFACTOR |
|--------|-----------|--------------------|-------|-------------|----------|
| 5.1 (README entry) | `test/docs/mcp-readme-tool-surface.test.ts` (3 tests) | ✅ All 3 tests failed with `expected Set{ 59 } to deeply equal Set{ 60 }` / `[ 'dysflow_create_form_from_template' ]` / `Set{ 'dysflow_vba_execute', …(58) }` vs `Set{ 'dysflow_vba_execute', …(59) }` | ✅ All 3 tests pass after the README inventory gains `dysflow_create_form_from_template` (4/4 green) | ➖ Single axis: presence in §4 GUI & Forms; the contract is the README regex's enumeration | ➖ None; the entry mirrors the slice-4 style. |
| 5.2 (refined description) | `test/adapters/mcp/tool-parity.test.ts` (2 tests) | ✅ Both tests failed with `expected … to have a length of 29 but got 30` / `toBe 53 // Object.is equality` | ✅ All tests pass after `29 → 30`, `53 → 54`, plus the explicit `toContain("dysflow_create_form_from_template")` guard | ➖ Single axis: count + presence assertions | ➖ Refined `TOOL_DESCRIPTIONS` copy as a separate refactor pass; no behavior change. |
| 5.3 (contract test evolution) | `test/adapters/mcp/advertised-tool-count.test.ts`, `test/adapters/mcp/dispatch-write-gate.test.ts` (3 tests), `test/adapters/mcp/mcp-tool-output-contracts.test.ts`, `test/adapters/mcp/release-matrix-gate.test.ts` | ✅ 5/5 tests failed (advertised 60 vs 59; filesystemWriters/binaryWriters missing new tool; empty-input binary-gate test got `MCP_INPUT_INVALID`; groupedToolNames 59 vs registeredToolNames 60; toolCount 54 vs 53) | ✅ All 5 tests pass after mechanical evolution: advertised `59 → 60`, both writer lists include new tool, `minimalInput` entry for the new tool, output-contract group includes new tool, release-matrix toolCount `53 → 54` and visibleCount `59 → 60` | ➖ The dispatch-write-gate minimalInput entry is a 5-line addition (3 fields + `apply:true`); no further axes needed because every other assertion in the contract files is already a single-axis count/list check | ➖ None. |

## Test Summary

- **Total tests passing** (cumulative, all PRs): **1882 / 1882** across
  156 files.
- **Total tests passing** (PR 3 focused, 6 contract files): **36 / 36**.
- **Total tests passing** (PR 3 integration): **5 / 5** in
  `test/integration/form-template-clone-bench.test.ts`.
- **Total tests passing** (PR 2 focused): 38 / 38 (adapter + MCP +
  schema-props) + 5 / 5 (integration).
- **Total tests passing** (PR 1 core, focused): 12 / 12.
- **Net new tests** (slice 5, all PRs combined): 14 (PR 2 adapter) + 1
  (PR 2 MCP) + 1 (PR 2 schema-props mechanical update) + 5 (PR 2
  integration) = 21 new tests + 1 mechanical update.
- **Layers used** across the slice: Core (Vitest), Adapter (Vitest +
  mocked `FormFileSystemPort` + `VbaFormsOrchestrator`), MCP dispatch
  (Vitest with stub VBA sync service), shared validation (Vitest),
  Integration (Vitest on real bench fixture read from disk).
- **Pure functions created** (PR 1): `applyTokenMap`,
  `cloneFormFromTemplate`, `assertMetadataPreserved` (reused from slice 4).
- **Pure helpers added** (PR 2): `readTokenMap` (token-map parser in
  adapter).
- **Mock/assertion ratio** (PR 2 adapter): 4 mocks for 17 tests = 0.24
  mocks / test → healthy focus.

## Verification Commands

| Command | Exit | Notes |
|---------|------|-------|
| `pnpm vitest run test/docs/mcp-readme-tool-surface.test.ts test/adapters/mcp/advertised-tool-count.test.ts test/adapters/mcp/dispatch-write-gate.test.ts test/adapters/mcp/mcp-tool-output-contracts.test.ts test/adapters/mcp/release-matrix-gate.test.ts test/adapters/mcp/tool-parity.test.ts` | 0 | PR 3 focused: 36 / 36 green across the 6 contract files. |
| `pnpm vitest run test/adapters/mcp/form-mutation-tools.test.ts test/adapters/vba-sync/vba-forms-adapter-mutation.test.ts test/shared/validation/schema-props.test.ts test/core/services/form-ir-clone-template.test.ts test/core/services/form-ir-mutation.test.ts test/core/services/form-ir-serialize.test.ts` | 0 | PR 1 + PR 2 focused (sanity): 77 / 77 green. |
| `pnpm vitest run --config vitest.integration.config.ts test/integration/form-template-clone-bench.test.ts` | 0 | PR 2 integration: 5 / 5 green. |
| `pnpm build` | 0 | `tsc -p tsconfig.json` — typecheck clean. |
| `pnpm lint` | 0 | `tsc --noEmit` + biome — clean. 3 pre-existing warnings on PR 2's `test/integration/form-template-clone-bench.test.ts` (FIXABLE: `noAdjacentSpacesInRegex`, `useImportType`, `useConst`) — untouched here, noted in PR 2's apply-progress. |
| `pnpm test` | 0 | **Full unit suite: 1882 / 1882 across 156 files.** 11 failures from PR 2's apply-progress are now all closed. |
| `git push origin main` | 0 | Pushed `de521b5..66e2c4b`. Full slice-5 chain visible: `1ccb0a3 → 66e2c4b` (8 commits). |
| `Get-Process -Name MSACCESS \| Measure-Object \| Select-Object Count` | 0 | Pre-push audit clean (no Access process running). |
| `Get-ChildItem . -Filter "*.laccdb"` | 0 | Post-push audit clean (no lock files). |

## Workload / PR Boundary (PR 3 — final)

- **Mode**: stacked-to-main PR slice (final).
- **Current work unit**: PR 3 — Docs + Parity + Contract.
- **Boundary**:
  - **In scope** (`README.md`, `src/adapters/mcp/tool-parity-registry.ts`,
    5 contract test files): ~58 lines of net changes
    (+36 README + 2 tool-parity-registry + 20 contract tests).
  - **Out of scope (intentionally NOT touched)**: `src/core/**` (PR 1,
    untouched), `src/adapters/mcp/mcp-tool-registry.ts` / `dispatch-routes.ts` /
    `dispatch-factory.ts` (PR 2, untouched), `src/adapters/vba-sync/**`
    (PR 2, untouched), `src/shared/validation/**` (PR 2, untouched),
    `test/integration/**` (PR 2, untouched).
- **Estimated review budget impact**: ~58 lines net. **Well within the
  400-line guard.**

## File Changes (PR 3 — this batch)

| File | Action | Notes |
|------|--------|-------|
| `README.md` | Modified | +4 / -2 lines: new tool entry under `§4 GUI & Forms`; bumped visible-count callouts 59 → 60 in two places. |
| `src/adapters/mcp/tool-parity-registry.ts` | Modified | +1 / -1 lines: refined `TOOL_DESCRIPTIONS` entry for `dysflow_create_form_from_template` (PRESERVED_METADATA_KEYS skipping, strict-missing alias, restore-on-gate-failure, automatic `.form.txt` extension). |
| `test/adapters/mcp/advertised-tool-count.test.ts` | Modified | +3 / -2 lines: advertised `59 → 60`; comment update. |
| `test/adapters/mcp/dispatch-write-gate.test.ts` | Modified | +11 / 0 lines: `dysflow_create_form_from_template` added to filesystemWriters expected list; `minimalInput` entry added; added to binaryWriters expected list. |
| `test/adapters/mcp/mcp-tool-output-contracts.test.ts` | Modified | +1 / 0 lines: `dysflow_create_form_from_template` added to `vbaManagerDysflowResult` group. |
| `test/adapters/mcp/release-matrix-gate.test.ts` | Modified | +7 / -7 lines: toolCount `53 → 54`, visibleCount `59 → 60`; comment updated to list the new tool. |
| `test/adapters/mcp/tool-parity.test.ts` | Modified | +8 / -6 lines: VBA_SYNC `29 → 30`, DYSFLOW_MCP `53 → 54`, TOOL_PARITY_REGISTRY `53 → 54`; `toContain("dysflow_create_form_from_template")` guard added. |

## Skill Resolution

- Strict TDD module loaded at `~/.config/opencode/skills/sdd-apply/strict-tdd.md`.
- RED → GREEN → TRIANGULATE → REFACTOR cycle observed for every Phase 5 task.
- The 11 failing tests are the RED signal; the README + parity registry +
  contract-test updates are the GREEN pass; REFACTOR consolidated the
  TOOL_DESCRIPTIONS copy with the slice-4 style.
- Zero silent fallbacks to Standard Mode.
- All assertions verify production-code output (typed `OperationResult`
  envelopes, captured writeFile inputs, executed `import_modules` calls,
  README regex enumeration, parity-registry lengths, dispatched route
  flags).
- No `expect(true).toBe(true)` / no type-only assertions / no smoke tests
  without behavioral assertions.

## Issues / Discoveries Worth Persisting (for next session)

1. **Mechanical parity evolution**: The slice-5 chain grew the
   `DYSFLOW_MCP_TOOL_NAMES` inventory by exactly 1 (53 → 54) and the
   `advertised` count by exactly 1 (59 → 60). Every contract file that
   pinned the previous counts (`tool-parity.test.ts`,
   `release-matrix-gate.test.ts`, `advertised-tool-count.test.ts`,
   `dispatch-write-gate.test.ts` for the route flags,
   `mcp-tool-output-contracts.test.ts` for the output-group) had to evolve
   in lockstep. The slice-5 PR 2 evidence noted this as "out of scope
   for PR 2"; PR 3 owns the mechanical evolution. Future slices should
   expect the same pattern (1 new tool → 5 files updated).
2. **`isDryRunCapableBinaryWrite` already covered `dysflow_create_form_from_template`**:
   PR 2 added the new tool to the dry-run branch in
   `dispatch-factory.ts`, so the dry-run-allowed / apply-write-gated
   behavior was already correct before PR 3. The only remaining PR 3
   work was to teach the dispatch-write-gate test about the tool (add
   `minimalInput` entry so the empty-input loop exercises it).
3. **README inventory regex is the single source of truth for visible
   tool documentation**: `mcp-readme-tool-surface.test.ts` parses the
   README with `/^\s*(?:####|\*)\s+(?:\*\*)?`([^`]+)`(?:\*\*)?\s*(?::)?/gm`
   between `### Core MCP Tools` and `### MCP protocol and maintenance`.
   Every new visible tool needs a matching `* **\`tool_name\`**: ...`
   entry under `§4 GUI & Forms` (or whichever section it belongs in)
   AND the visible-count callouts in the header + `### It is` section
   need to match `buildHiddenToolRegistry(tools).filter(!hidden).length`.
4. **`PRESERVED_METADATA_KEYS` skipping is the load-bearing invariant for
   the slice-5 clone**: Token replacement walks scalar FormIR strings and
   non-preserved blob lines; `Checksum` / `PrtDevMode*` / `Format` are
   skipped. This guarantees byte-equivalent `PrtDevMode` round-trip and
   keeps the slice-4 `assertMetadataPreserved` guard valid post-clone.
   PR 3 documents this prominently in the TOOL_DESCRIPTIONS copy so
   consumer LLMs understand the invariant.

## Linked Artifacts

- Proposal: `openspec/changes/forms-ui-factory-slice-5-create-from-template/proposal.md`
- Spec: `openspec/changes/forms-ui-factory-slice-5-create-from-template/specs/{access-core-services,mcp-stdio-adapter}/spec.md`
- Design: `openspec/changes/forms-ui-factory-slice-5-create-from-template/design.md`
- PR 1 apply-progress (predecessor): preserved at the bottom of this file
  (see "Predecessor: PR 1 evidence" below) and at git history
  `39a092b..1ccb0a3`.
- PR 2 apply-progress (predecessor): preserved at git history
  `4fe082a..de521b5` and re-stated in the "Cumulative Task Progress"
  section above.
- Issue: https://github.com/DysTelefonica/dysflow/issues/618
- Bench: https://github.com/ardelperal/VBA_TOOLKIT_BENCH
- Final chain (8 commits, all on `main`):
  - `1ccb0a3` chore(openspec): scaffold slice 5 create-from-template change
  - `1cee00c` feat(core): add cloneFormFromTemplate + applyTokenMap
  - `52c411b` refactor(core): share preserved-metadata-key predicate with applyTokenMap
  - `39a092b` chore(sdd): apply-progress + tasks.md for slice 5 PR 1
  - `42c0438` feat(mcp): register dysflow_create_form_from_template with write gate
  - `95e1ccb` feat(adapter): bench-cache-first path resolution and restore-on-failure
  - `4fe082a` test(integration): bench round-trip with injected tokens
  - `de521b5` chore(sdd): apply-progress + tasks.md for slice 5 PR 2
  - `5bee2c9` docs(mcp): document dysflow_create_form_from_template in README **(PR 3)**
  - `66e2c4b` feat(mcp): align parity registry + contract tests with new tool **(PR 3)**

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
