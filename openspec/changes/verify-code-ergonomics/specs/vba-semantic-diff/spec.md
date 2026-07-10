# Delta for vba-semantic-diff

> Additive. No existing field renamed/removed/type-changed. `vba-semantic-classifier.ts` and `aggregateRecommendation` MUST NOT be modified.

## ADDED Requirements

### Requirement: summaryStructured

`verify_code` in semantic mode SHALL return `summaryStructured` next to the flat `summary` (which MUST remain). `summaryStructured` MUST expose nested `actionable` and `nonActionable` buckets plus top-level counts (`matched`, `different`, `missingInSource`, `missingInBinary`); each nested group MUST include a `total` = sum of its member buckets.

#### Scenario: Nested counts equal flat summary buckets (happy)

- GIVEN 3 sourceNewer, 5 binaryNewer, 4 bothChanged, 20 formSerializationOnly
- WHEN the semantic-mode result returns
- THEN `summaryStructured.actionable.sourceNewer === summary.sourceNewer`
- AND `summaryStructured.actionable.total === sourceNewer + binaryNewer + bothChanged`
- AND `summaryStructured.nonActionable.formSerializationOnly === summary.formSerializationOnly`

#### Scenario: Identical trees return zeroed structured summary (edge)

- GIVEN source and binary trees are identical
- WHEN `compareVbaSourceTrees` runs in semantic mode
- THEN `summaryStructured.matched` equals the module count
- AND `summaryStructured.different`, `actionable.total`, `nonActionable.total` are 0
- AND flat `summary` is still present

### Requirement: Per-Entry Classification on nonActionableDifferent

`verify_code` in semantic mode SHALL attach `classification` and `reason` to every `nonActionableDifferent[]` entry using the same vocabulary already on `diffs[]` (`"whitespaceOnly" | "attributeOnly" | "caseOnly" | "formSerializationOnly" | "encodingOnly"`). No new enum is introduced.

#### Scenario: Each entry carries classification + non-empty reason (happy)

- GIVEN a form module producing a `formSerializationOnly` diff
- WHEN the result returns
- THEN every `nonActionableDifferent[]` entry has a non-empty `reason` and a valid `classification`

#### Scenario: Classification matches diffs[] on a case-only diff (edge)

- GIVEN source and binary differ only in identifier casing
- WHEN semantic mode runs
- THEN the module is in `nonActionableDifferent`
- AND its `classification === "caseOnly"`

#### Scenario: nonActionable classification equals matching diffs[] entry (cross-check)

- GIVEN a module present in BOTH `nonActionableDifferent[]` and `diffs[]`
- WHEN the result returns
- THEN the `nonActionableDifferent[]` entry's `classification` and `reason` equal the `diffs[]` entry's values exactly

### Requirement: bulkImportable and bulkExportable

`verify_code` in semantic mode SHALL return `bulkImportable`, `bulkImportableCount`, `bulkExportable`, `bulkExportableCount`, derived alongside (NOT inside) `aggregateRecommendation`:

- `bulkImportable = {sourceNewer moduleNames} ∪ {missingInBinary moduleNames}`
- `bulkExportable = {binaryNewer moduleNames} ∪ {missingInSource moduleNames}`
- `bothChanged` MUST be excluded from BOTH arrays
- Each array sorted lexicographically by `moduleName`, directly usable as the `moduleNames` arg of `import_modules`/`export_modules` (no consumer-side filter)

#### Scenario: bulkImportable sorted, deduped (happy)

- GIVEN sourceNewer `ModA`,`ModC`,`ModB` and missingInBinary `ModD`,`ModA`
- WHEN the result returns
- THEN `bulkImportable === ["ModA","ModB","ModC","ModD"]`
- AND `bulkImportableCount === 4`

#### Scenario: bulkExportable sorted (happy)

- GIVEN binaryNewer `ModZ`,`ModX` and missingInSource `ModY`
- WHEN the result returns
- THEN `bulkExportable === ["ModX","ModY","ModZ"]`
- AND `bulkExportableCount === 3`

#### Scenario: bothChanged excluded from both arrays (edge)

- GIVEN bothChanged `BothChanged1`,`BothChanged2` and sourceNewer `ModA`
- WHEN the result returns
- THEN `bulkImportable` includes `ModA`, excludes bothChanged
- AND `bulkExportable` excludes bothChanged

#### Scenario: only bothChanged yields empty bulk arrays (edge)

- GIVEN only bothChanged (no sourceNewer, binaryNewer, missingIn*)
- WHEN the result returns
- THEN `bulkImportable === []`, `bulkImportableCount === 0`, `bulkExportable === []`, `bulkExportableCount === 0`, `recommendedAction === "manual_merge"`

### Requirement: Cross-Cutting Invariants

Output MUST preserve:

1. `summaryStructured.actionable.total === sourceNewer + binaryNewer + bothChanged`
2. `summaryStructured.nonActionable.total` = sum of its five buckets
3. `recommendedAction === "manual_merge"` does NOT force empty bulk arrays; consumers MUST honor both
4. `bulkImportable ⊆ actionableDifferent.filter(sourceNewer) ∪ missingInBinary`; `bulkExportable ⊆ actionableDifferent.filter(binaryNewer) ∪ missingInSource`

#### Scenario: summaryStructured totals agree (cross-cutting)

- GIVEN any mix of buckets
- WHEN the result returns
- THEN `summaryStructured.actionable.total === sourceNewer+binaryNewer+bothChanged`
- AND `summaryStructured.nonActionable.total === caseOnly+whitespaceOnly+attributeOnly+formSerializationOnly+encodingOnly`

#### Scenario: bulkImportable non-empty with manual_merge (cross-cutting)

- GIVEN bothChanged modules coexist with at least one sourceNewer
- WHEN the result returns
- THEN `recommendedAction === "manual_merge"` AND `bulkImportable.length > 0`
- AND `bulkImportable` does NOT include bothChanged modules

## Resolution Notes

- **Version bump**: `v2.3.2` patch (proposal default). Consumer prompt's `v2.2.0` minor is invalid (shipped); SemVer-strict MINOR = `v2.4.0`. Confirm with maintainer in design.
- **Round 4**: in-flight at `92b39271`; patch `v2.3.2` avoids conflict. Single PR.
