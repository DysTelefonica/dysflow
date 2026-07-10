# Proposal: verify-code-ergonomics

## Intent

`verify_code` already returns `summary`, `actionableDifferent`, `nonActionableDifferent`,
`missingInBinary`, `missingInSource`, `diffs[]` (with `classification` / `reason`). Fleet
consumer `expedientes` scanned 244 modules; three common questions force post-processing:
"how many to import?" (parse flat `summary`), "how many `caseOnly` vs `whitespaceOnly`?"
(re-issue `verify_code({ diff:true })`), "list for `import_modules`" (`filter+map` to drop
`binaryNewer` and `bothChanged`). Round 5 makes `verify_code` deliver results ready to act on
(cross-project rule: expose derived fields, don't force consumers to re-derive). Additive —
every existing field, key, and shape stays byte-identical.

## Scope

### In Scope

- **E1 — `summaryStructured`**: nested `{ matched, different, missingIn{S,Binary},
  actionable:{sourceNewer, binaryNewer, bothChanged, total}, nonActionable:{caseOnly,
  whitespaceOnly, attributeOnly, formSerializationOnly, encodingOnly, total} }` alongside
  flat `summary`.
- **E2 — per-entry `classification` / `reason`** on every `nonActionableDifferent[]` entry
  (same vocabulary as `diffs[]`). Free-of-cost: pipeline already computes both at
  `vba-source-comparison.ts:620-660`.
- **E3 — `bulkImportable` / `bulkExportable` + `_count`**. `bulkImportable` = sourceNewer +
  missingInBinary; `bulkExportable` = binaryNewer + missingInSource; `bothChanged` excluded
  from both. Drop-in for `import_modules` / `export_modules`.

### Out of Scope

Rename / removal / shape change to existing response keys. Logic edits in
`vba-semantic-classifier.ts`. Algorithm changes to `aggregateRecommendation`. Round 4 features.
Strict-mode (`strict: true`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `vba-semantic-diff`: three ADDED requirements (`summaryStructured`, per-entry
  `classification` on `nonActionableDifferent`, `bulkImportable` / `bulkExportable`).
  Existing `VB_Name One-Side-Missing Actionability` unaffected.

## Approach

All three land inside `compareVbaSourceTrees`
(`src/core/services/vba-source-comparison.ts:551`):

1. Compute `summaryStructured` next to `semanticSummary` (`:573`); emit alongside `summary`
   when `mode === "semantic"`.
2. When bucketing each diff, attach `{ classification, reason }` from the already-computed
   `classifyVbaPair` to the entry — same vocabulary `diffs[]` already emits.
3. After the loop, derive `bulkImportable` / `bulkExportable` + `_count` by filtering on
   entry-attached `classification` and concatenating with `missingInBinary` /
   `missingInSource`. Sort once for determinism.

`VbaVerifyResult` (`:69-115`) gains optional `summaryStructured` + 4 bulk fields;
`VbaSourceComparisonEntry` gains optional `classification` + `reason`. MCP schema
(`schemas/vba-sync-schemas.ts:163`) and tool description
(`tool-parity-registry.ts:132-133`) gain additive doc lines. Dispatch route stays
`mutatesBinary:false, mutatesFilesystem:false, risk:"read-only"`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/services/vba-source-comparison.ts` | Modified | Extend types; emit 3 fields; derive 2 lists. |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` | Modified | Additive fields on `verify_code` schema. |
| `src/adapters/mcp/tool-parity-registry.ts` | Modified | Doc the 3 fields. |
| `src/core/services/vba-semantic-classifier.ts` | **NOT modified** | Hard constraint. |
| `vba-source-comparison.ts#aggregateRecommendation` | **NOT modified** | Algorithm unchanged. |
| `test/**` | New | RED-first atoms per E + 244-module E2E. |
| `openspec/specs/vba-semantic-diff/spec.md` | Modified (delta) | Three ADDED requirements. |
| `docs/mcp-examples.md` | Modified | `verify_code` → `bulkImportable` → `import_modules` example. |

## Risks

| Risk | L | Mitigation |
|------|---|------------|
| Extra keys on `nonActionableDifferent` break strict consumers | L | Additive; pin-shape unit test. |
| `bulkImportable` non-empty when `recommendedAction="manual_merge"` | M | Spec calls out conflict; consumer uses `bothChanged` exclusion + manual review. |
| `summaryStructured` totals disagree with `summary` | L | Cross-check test: `actionable.total === sourceNewer + binaryNewer + bothChanged`. |
| Version bump conflicts with round 4 (`v2.2.0` candidate) | M | Default `v2.3.2` (patch on `v2.3.1`) unless round 4 ships first. Flag for spec phase. |

## Rollback Plan

All changes additive at TS level (new optional fields) and MCP schema level (new optional
keys). Reverting the merge commit on `staging` returns the fleet to the previous response
shape. No state, data, or schema migration.

## Dependencies

Round 4 (`feat/r4-list-modules-bulk-import-verify-parallel`, separate worktree) ships
complementary bulk features; round 5 is independent. `pnpm test` + `pnpm build` for
verification (`openspec/config.yaml`).

## Success Criteria

- [ ] `verify_code` semantic-mode response includes `summaryStructured`, `bulkImportable`,
      `bulkExportable`, `bulkImportableCount`, `bulkExportableCount` without changing any
      existing key.
- [ ] Every `nonActionableDifferent[*]` entry carries `classification` + `reason` matching
      `diffs[]` vocabulary.
- [ ] `bulkImportable` ⊆ sourceNewer + missingInBinary; `bulkExportable` ⊆ binaryNewer +
      missingInSource; `bothChanged` in neither — RED-first unit test.
- [ ] `aggregateRecommendation` body and `vba-semantic-classifier.ts` byte-identical.
- [ ] E2E reproduces 244-module flow: `verify_code → bulkImportable → import_modules`.
- [ ] Conventional commits, no AI attribution; single PR
      (`delivery_strategy: single-pr-default`).
- [ ] Version bump: minor (exact target resolved in spec phase).

## Reference

- Source prompt: `C:/00repos/codigo/00_EXPEDIENTES_staging/docs/prompts/prompt-ia-mantenedora-dysflow-round-2026-07-09-r5.md`
- Round 4 worktree (complementary): `C:/Proyectos/dysflow-feat-r4` on
  `feat/r4-list-modules-bulk-import-verify-parallel`.
- Branch: `feat/r5-verify-code-ergonomics` (HEAD `92b39271` = `v2.3.1`).