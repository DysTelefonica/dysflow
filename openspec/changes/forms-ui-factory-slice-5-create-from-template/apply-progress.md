# Apply Progress: forms-ui-factory-slice-5-create-from-template (PR 1 of 3)

## Status

Slice 1 (PR 1 of the `stacked-to-main` chain) is COMPLETE. All 6 tasks
in Phase 1 + Phase 2 are marked `[x]`. No out-of-scope work for this batch
was staged: `src/adapters/**` and `test/integration/**` were not touched.

The repo is in a green, runnable state. Phase 3 (MCP/adapter) and
Phase 4/5 (integration + docs + parity contract) will be applied by the
orchestrator's next batch.

## Implementation Commits (slice 5 PR 1)

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `1cee00c` | `feat(core): add cloneFormFromTemplate + applyTokenMap (issue #618, slice 5 PR 1)` | Phase 1.1, 1.2, 1.3 (RED); Phase 2.1, 2.2, 2.3 (GREEN) | `pnpm vitest run test/core/services/form-ir-clone-template.test.ts` → 12/12; `pnpm test` → 1872/1872; `pnpm lint` clean; `pnpm build` clean | N/A (TypeScript, not VBA/Access) |
| `52c411b` | `refactor(core): share preserved-metadata-key predicate with applyTokenMap` | Phase 2.3 (refactor step) | Same vitest run still green; no behavior change | N/A |

Branch: direct commits on `main` (the orchestrator preflight and the
`stacked-to-main` default both target main directly for this repo).
Pushed to: `origin/main` (chain `1ccb0a3 → 1cee00c → 52c411b`).

## Completed Tasks (this batch)

- [x] **Phase 1.1** — Add `CloneFromTemplateOptions`,
      `CloneFromTemplateResult`, `TokenMap`, `MissingTokenPolicy`,
      `ApplyTokenMapOptions`, `ApplyTokenMapResult` types to
      `src/core/models/form-ir.ts`.
- [x] **Phase 1.2** — Add `FORM_TOKEN_MAP_INVALID`, `FORM_TARGET_EXISTS`
      to the `FormMutationError` union in
      `src/core/services/form-ir-service.ts`. (`FORM_TARGET_EXISTS` is a
      reserved code for the adapter layer in PR 2; core does not throw it.)
- [x] **Phase 1.3** — RED: 12 failing Vitest cases in
      `test/core/services/form-ir-clone-template.test.ts` covering
      spec scenarios 1 (byte-equivalence), 2 (preserved metadata safety),
      all-mapped, missing-pass-through, strict-missing, invalid token map,
      target name assignment, immutability, and preserved-keys accounting.
- [x] **Phase 2.1** — GREEN: `applyTokenMap(ir, tokenMap, opts?)` walks
      the FormIR's preamble + every node entry, replaces `{{Key}}` in
      non-preserved scalar values and blob body lines, and partitions
      source tokens into `appliedTokens` vs `missingTokens` under the
      chosen `MissingTokenPolicy`. Default = `warn-pass-through`;
      `strict` throws `FORM_MUTATION_INVALID`.
- [x] **Phase 2.2** — GREEN: `cloneFormFromTemplate(sourceIr, opts)`
      orchestrates `applyTokenMap`, sets the cloned IR's `name` to
      `targetFormName`, calls `assertMetadataPreserved`, and returns
      a typed `CloneFromTemplateResult` (ir, source, appliedTokens,
      missingTokens, warnings, preservedKeys).
- [x] **Phase 2.3** — GREEN: full focused vitest run + safety net
      clean. Slice 4 byte-equivalence property preserved across both
      commits.

## TDD Cycle Evidence

| Task | Test File | Layer | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|-----|-------|-------------|----------|
| 1.1 (types) | — | — | ➖ Type-only declaration; no test required by TDD laws | n/a | n/a | n/a |
| 1.2 (error codes) | — | — | ➖ Type-only union expansion; no test required (compile-time gate) | n/a | n/a | n/a |
| 1.3 / 2.1 / 2.2 (clone + apply) | `test/core/services/form-ir-clone-template.test.ts` (12 tests) | Unit (Vitest, in-memory IR only — no mocks) | ✅ All 12 tests failed with `TypeError: applyTokenMap is not a function` / `TypeError: cloneFormFromTemplate is not a function` — **the production functions did not exist yet**, which is the canonical RED signal | ✅ All 12 tests passed after implementing the functions. Two initial test-expectation bugs were caught at this gate (see "Deviations / Caveats" below) | ✅ Multiple scenario axes covered: low-level token replacement (scalar in quoted/non-preserved blob), PreservedKey scalar value skip, PreservedKey blob body skip, default warn-pass-through accounting, strict policy rejection, empty token key rejection, non-string token value rejection, byte-equivalence against manualReplace (no-token-in-metadata case), preserved-metadata byte-equivalence (token-leaked-into-metadata case → engine preserves, manualReplace does not), target name assignment + appliedTokens, source-IR immutability, strict-policy rejection + source-IR immutability | ✅ Single source of truth for "is this a preserved Access metadata key" predicate. Commit `52c411b` (1 line in `metadataSnapshot`; reuse from slice 5 engine). No behavior change — slice 4 byte-equivalence property holds; 18+18+9+12 = 57 core form IR tests still green. |

## Test Summary

- **Total tests written**: 12 new tests in one new file
  (`test/core/services/form-ir-clone-template.test.ts`).
- **Total tests passing** (focused): 12/12 in the new file;
  39/39 in `test/core/services/form-ir-{clone-template,mutation,serialize}.test.ts`
  combined; 253/253 across `test/core/services/**`.
- **Total tests passing** (full suite): 1872/1872 in `pnpm test`
  across 156 files. Zero regressions.
- **Layers used**: Unit only. Pure IR transformation; no Access, no
  filesystem, no mocks. (Integration test is Phase 4 / PR 3.)
- **Approval tests** (refactoring): 1 — the `metadataSnapshot` → `isPreservedMetadataKey`
  route was an extraction with zero behavior change; pre-existing
  `form-ir-serialize.test.ts` (18 tests) acted as the approval gate.
- **Pure functions created**: 2 public (`applyTokenMap`, `cloneFormFromTemplate`)
  + 5 internal helpers (`validateTokenMap`, `replaceTokensInString`,
  `collectSourceTokens`, `applyTokensToEntry`, `applyTokensToNode`,
  `isPreservedMetadataKey`). All are deterministic, side-effect-free,
  no I/O.

## Verification Commands

| Command | Exit | Notes |
|---------|------|-------|
| `pnpm vitest run test/core/services/form-ir-clone-template.test.ts` (after types only) | 1 | RED — all 12 tests fail (`TypeError: ... is not a function`). Confirmed the test file references production code that doesn't exist yet. |
| `pnpm vitest run test/core/services/form-ir-clone-template.test.ts` (after GREEN implementation) | 0 | GREEN — all 12 tests pass; 2 initial failures were test-expectation bugs, fixed without behavior change in production. |
| `pnpm vitest run test/core/services/` | 0 | 253/253 service-level tests green; slice 4 mutation/serialize/parse properties preserved. |
| `pnpm test` | 0 | Full suite: 156 files, 1872 tests, zero regressions. |
| `pnpm build` | 0 | `tsc -p tsconfig.json` — typecheck clean. |
| `pnpm lint` | 0 | `tsc --noEmit` (prod config) + `tsc --noEmit` (test config) + `biome check src/ test/` (280 files) — clean. |
| `git push origin main` | 0 | Pushed `1ccb0a3..52c411b`. Chain visible. |

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `src/core/models/form-ir.ts` | Modified | +5 new types (`TokenMap`, `MissingTokenPolicy`, `ApplyTokenMapOptions`, `ApplyTokenMapResult`, `CloneFromTemplateOptions`, `CloneFromTemplateResult`). 64 new lines. No existing type changed. |
| `src/core/services/form-ir-service.ts` | Modified | +236 lines (new error codes in `FormMutationError` union; `applyTokenMap`, `cloneFormFromTemplate`, +5 internal helpers; `metadataSnapshot` route via `isPreservedMetadataKey`). No public API removed or renamed. |
| `test/core/services/form-ir-clone-template.test.ts` | Created | 292 lines. 12 unit tests across two `describe` blocks. Mirrors slice-4 test style. |

## Workload / PR Boundary

- **Mode**: stacked-to-main PR slice (force-chained).
- **Current work unit**: PR 1 — Core + Unit Tests (this batch).
- **Boundary**: engine layer only.
  - **In scope** (`src/core/**` + `test/core/services/**`): 591 net new lines across 3 files.
  - **Out of scope (intentionally NOT touched)**: `src/adapters/mcp/**`, `src/adapters/vba-sync/vba-forms-adapter.ts`, `src/shared/validation/schema-props.ts`, `test/integration/**`, `README.md`, `openspec/specs/**/spec.md` archive-time edits.
- **Estimated review budget impact**: ~210 net new lines in the product code (~25 in types + ~235 in service file - 50 for the helper DRY net) + ~292 lines of tests. Well under the 400-line guard.

## Deviations / Caveats

- **No trailing newline in fixtures.** `serializeFormTxt` does NOT emit a
  trailing newline; the slice-4 byte-equivalence property uses
  `normalizeLineEndings` to compare. The first byte-equivalence RED→GREEN
  test asserted against a `manualReplace` that preserved the source's
  trailing `\n`. The test was corrected (fixture trimming) to match the
  canonical comparator's framing — the production behavior was correct.
- **Manual-replace cannot preserve PrtDevMode.** The "manual clone-and-
  replace is byte-equivalent" spec scenario only holds for sources where
  no token leaks into preserved metadata. For the input where a token
  DOES sit inside `PrtDevMode`'s body, the test was tightened to:
  preserved-metadata bytes stay byte-equivalent to the SOURCE (not to
  manualReplace); layout scalars stay byte-equivalent to manualReplace.
  This is the engine's actual value-add, and the test now codifies it.
- **`FORM_TARGET_EXISTS` declared but unused at core.** Reserved error
  code lives on the `FormMutationError` union so the adapter (PR 2) can
  throw it without re-editing the union. Out of scope to actually throw
  in core — path existence is an I/O concern.

## Skill Resolution

- Strict TDD module loaded at `~/.config/opencode/skills/sdd-apply/strict-tdd.md`.
  RED → GREEN → TRIANGULATE → REFACTOR cycle observed for every task.
- No silent fallback to Standard Mode (which would have skipped RED).
- All assertions verify production-code output (form IR serialized
  bytes, error codes thrown, applied/missing token lists). No
  type-only / tautology / empty-collection assertions without setup.

## Issues / Discoveries Worth Persisting (for next session)

The orchestrator will apply PR 2 (MCP + adapter). When they get there:

1. The `cloneFormFromTemplate` core signature returns:
   `{ ir, source, appliedTokens, missingTokens, warnings, preservedKeys }`.
   Path-level concerns (`sourcePath`, `targetPath`, `importGate`, `mode`,
   `overwrite`) belong on the adapter result, not on the core result.
   The adapter composes a richer envelope.
2. `FORM_TARGET_EXISTS` is currently unused at core — it must be thrown
   by the adapter when `overwrite: false` AND the target `.form.txt`
   exists on disk. The bench-cache-first `resolveSource` pattern from
   slice 4 should be reused.
3. The adapter must reuse the existing `import_modules(apply:true)`
   gate for `apply:true` and capture `originalSource` (from disk) for
   restore-on-failure, mirroring `dysflow_form_deserialize`'s pattern.
4. The 12 RED→GREEN tests are scoped to core behavior; PR 2's RED
   surface is the MCP dispatch + adapter wiring — not a re-do of core
   semantics.

## Linked Artifacts

- Proposal: `openspec/changes/forms-ui-factory-slice-5-create-from-template/proposal.md`
- Spec: `openspec/changes/forms-ui-factory-slice-5-create-from-template/specs/access-core-services/spec.md`
- Design: `openspec/changes/forms-ui-factory-slice-5-create-from-template/design.md`
- Issue: https://github.com/DysTelefonica/dysflow/issues/618
- Bench: https://github.com/ardelperal/VBA_TOOLKIT_BENCH
