# Design: verify-code-ergonomics (round 5)

> Additive. No existing key renamed, removed, or type-changed. Shielded: `src/core/services/vba-semantic-classifier.ts`, `aggregateRecommendation` body.

## Technical Approach

Three additive fields on the semantic-mode `VbaVerifyResult` produced by `compareVbaSourceTrees` (`src/core/services/vba-source-comparison.ts:551`). All three reuse data already produced in the main diff loop — no second parse pass, no new I/O. `summaryStructured` is a pure projection of the flat `summary`. `nonActionableDifferent[*].classification`/`reason` (and `actionableDifferent[*].classification` for symmetry) are the same `classifyVbaPair` output already attached to `diffs[*]`. `bulkImportable`/`bulkExportable` are pure filters on those arrays + `missingIn{Binary,Source}`, sorted once. MCP route stays `mutatesBinary:false, mutatesFilesystem:false, risk:"read-only"`. Version: `v2.4.0` MINOR (SemVer-strict: additive backward-compatible features).

## Architecture Decisions

| # | Decision | Choice & rationale |
|---|----------|-------------------|
| 1 | Where to compute `summaryStructured` | After the main loop at `:676` — O(1) projection of already-computed `semanticSummary` + array lengths. |
| 2 | Per-entry `classification` typing | Extend `VbaSourceComparisonEntry` with optional `classification?` + `reason?`. `readonly` → no consumer breaks. MCP output is open (input `additionalProperties:false` does not constrain outputs). |
| 3 | Attach `classification` to `actionableDifferent` too | Yes — symmetric. Lets `deriveBulkLists` be a pure function over both arrays. Tests insensitive to extra field. |
| 4 | `deriveBulkLists` location | Sibling of `aggregateRecommendation` — per pre-resolved decision. Both are pure projections of the same accumulators. |
| 5 | Dedup strategy | `Set` first (O(1) insert), spread + `.sort()` once per output array. Byte-stable, deterministic. |
| 6 | Sort order | Default lexicographic `<`. ModuleName-only; matches ID-stable expectation. |
| 7 | Strict mode behavior | Skip all 5 new fields. Same gate as `summary` at `:691`. Strict output byte-identical. |
| 8 | MCP input schema | No change. New fields are OUTPUTS. |

## Data Flow

    compareVbaSourceTrees (semantic mode)
       │  per diff: classifyVbaPair → { classification, reason, actionable, ... }
       ├─→ push to actionableDifferent | nonActionableDifferent
       │     (entry.classification = classification.classification
       │      entry.reason        = classification.reason)
       ├─→ semanticSummary[cat] += 1
       ├─→ diffs.push({ ...entry, classification, reason, ... })
       │  end of loop:
       ├─→ summaryStructured  = project(semanticSummary, arrayLengths)
       ├─→ bulk lists = deriveBulkLists(actionableDifferent, missingIn{Binary,Source})
       └─→ return { ...existing, summaryStructured, ...bulkFields }

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/services/vba-source-comparison.ts` | Modify | Extend `VbaSourceComparisonEntry` (+2 optional fields); add `SummaryStructured`; extend `VbaVerifyResult` (+5 optional fields); attach `classification`/`reason` in loop push sites (lines 643-647); compute `summaryStructured` at `:676`; add `deriveBulkLists` next to `aggregateRecommendation`. |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` | Touch | No INPUT schema change. Add a one-line comment above the `verify_code` schema (outside `properties` so `additionalProperties:false` is unaffected). |
| `src/adapters/mcp/tool-parity-registry.ts` | Modify | Append one sentence to the `verify_code` tool description (line 132-133) describing the new output fields and the `bulkImportable` → `import_modules` drop-in shape. |
| `docs/mcp-examples.md` | Modify | Add a `verify_code → bulkImportable → import_modules` example. |
| `package.json` | Modify | Bump `version` to `2.4.0`. |
| `CHANGELOG.md` | Modify | Add `v2.4.0` entry. |

### NOT modified (with reasoning)

- `src/core/services/vba-semantic-classifier.ts` — hard constraint. All 5 new fields are pure projections of its output; no new classification vocabulary.
- `aggregateRecommendation` body in `vba-source-comparison.ts:718-756` — hard constraint. Output reused unchanged; `deriveBulkLists` lives alongside.
- Strict-mode branch (`:589-603`) — no change. Strict output byte-identical.
- MCP dispatch route (`src/adapters/mcp/dispatch-routes.ts:94`) — `mutatesBinary:false, mutatesFilesystem:false, risk:"read-only"` confirmed unchanged.
- `test/core/services/vba-source-comparison.test.ts` — 9 RED atoms at lines 1811-2127 are the bridge to GREEN. The implementation is the bridge; tests stay as authored.

## Interfaces / Contracts

```ts
// 1) Extend VbaSourceComparisonEntry
export type VbaSourceComparisonEntry = {
  moduleName: string;
  fileType: string;
  sourcePath?: string;
  binaryPath?: string;
  // NEW (semantic mode; populated on actionableDifferent + nonActionableDifferent entries)
  classification?: VbaSemanticCategory;
  reason?: string;
};

// 2) New type
export type SummaryStructured = {
  matched: number;
  different: number;        // = semantic diffs (diffs.length)
  missingInSource: number;
  missingInBinary: number;
  actionable: {
    sourceNewer: number; binaryNewer: number; bothChanged: number;
    total: number;          // = sum of three
  };
  nonActionable: {
    caseOnly: number; whitespaceOnly: number; attributeOnly: number;
    formSerializationOnly: number; encodingOnly: number;
    total: number;          // = sum of five
  };
};

// 3) Extend VbaVerifyResult — all OPTIONAL
export type VbaVerifyResult = {
  // ...existing fields byte-identical...
  summaryStructured?: SummaryStructured;
  bulkImportable?: readonly string[];
  bulkImportableCount?: number;
  bulkExportable?: readonly string[];
  bulkExportableCount?: number;
};

// 4) deriveBulkLists — pure, sibling of aggregateRecommendation
function deriveBulkLists(
  actionableDifferent: readonly VbaSourceComparisonEntry[],
  missingInBinary: readonly VbaSourceComparisonEntry[],
  missingInSource: readonly VbaSourceComparisonEntry[],
): {
  bulkImportable: string[]; bulkImportableCount: number;
  bulkExportable: string[]; bulkExportableCount: number;
} {
  const importSet = new Set<string>();
  const exportSet = new Set<string>();
  for (const e of actionableDifferent) {
    if (e.classification === "sourceNewer") importSet.add(e.moduleName);
    else if (e.classification === "binaryNewer") exportSet.add(e.moduleName);
    // bothChanged excluded by both branches
  }
  for (const e of missingInBinary) importSet.add(e.moduleName);
  for (const e of missingInSource) exportSet.add(e.moduleName);
  const bulkImportable = [...importSet].sort();
  const bulkExportable = [...exportSet].sort();
  return {
    bulkImportable, bulkImportableCount: bulkImportable.length,
    bulkExportable, bulkExportableCount: bulkExportable.length,
  };
}
```

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | REQ-1 `summaryStructured` happy + zero-tree edge | Tests `:1814-1912` (RED). Green when the field is in the semantic-mode return spread. |
| Unit | REQ-2 per-entry `classification`/`reason` + cross-check with `diffs[]` | Tests `:1916-1963` (RED). Green when the loop push site attaches `classification.classification` + `classification.reason`. |
| Unit | REQ-3 bulk lists happy + bothChanged-excluded + only-bothChanged edge | Tests `:1967-2052` (RED). Green when `deriveBulkLists` is called and its four values included in the return spread. |
| Unit | Cross-cutting totals + manual_merge coexistence | Tests `:2056-2126` (RED). Green when `summaryStructured.totals` are `+=` over their buckets and `bulkImportable` filters out `bothChanged` regardless of `recommendedAction`. |
| E2E | 244-module `verify_code → bulkImportable → import_modules` | New E2E in `E2E_testing/mcp-e2e.mjs` (per proposal success criteria) — follow-up. |
| Hardening | All 30+ pre-existing tests in this file | Unchanged. Every existing assertion keeps passing. |

## Performance & Determinism

- `summaryStructured`: O(1) — fixed-shape read on `semanticSummary` + array lengths.
- Per-entry `classification`/`reason` on both lists: O(0) added cost — values are already in `classification.classification` / `classification.reason`. One property assignment per push.
- `deriveBulkLists`: O(n) over `actionableDifferent` + `missingInBinary` + `missingInSource`. One `Set` insert per entry, one `.sort()` per output array. No second file read, no second `classifyVbaPair` call, no second parse pass.
- Net delta on a 244-module compare: microseconds. The classifier's LCS pass is the dominant cost; this design adds zero new classification work.
- Sort is byte-stable: same input → same output bytes across runs. ID-stable for consumers.

## Edge Cases

- **Empty input**: all counts zero; `bulkImportable=[]`, `bulkExportable=[]`; `recommendedAction="no_action"`.
- **All bothChanged**: `summaryStructured.actionable.bothChanged=N`, both bulk lists empty, `recommendedAction="manual_merge"`. Cross-cutting test `:2104` exercises this.
- **Module-name collision** (same name in `actionableDifferent.filter(sourceNewer)` AND `missingInBinary`): `Set` dedupes → name appears once.
- **Cross-check invariant** (per-entry `classification` matches `diffs[*].classification` for the same module): by construction, the same `classification` object reference is the source of truth for both. Test `:1940-1963` asserts it.
- **Strict mode**: `summaryStructured` and bulk fields absent; per-entry `classification` not attached. Existing strict-mode tests (T05) keep passing.

## Backward Compatibility

Byte-identical for every existing key, value, and order. All public type deltas are strictly additive (new fields are optional). Consumers reading `result.summary` keep working unchanged. Consumers reading `result.actionableDifferent`/`result.nonActionableDifferent` keep working — entries gain two optional fields they can ignore. The flat `summary` is preserved alongside `summaryStructured` per spec. Strict-mode output is unchanged.

## Migration / Rollout

No data migration. No schema migration. No feature flag. Type-level addition + runtime derivation + MCP description update. Release pipeline bumps `package.json` to `2.4.0`; the existing release-title guard workflow enforces title=tag.

## Rollback

`git revert` on the staging merge commit. The 5 new fields disappear from the type and the runtime. Consumers that started reading them break — but MINOR bump means callers on `2.3.x` pinning do not auto-upgrade. Forward-only.

## Risks

| Risk | L | Mitigation |
|------|---|------------|
| `summaryStructured` totals off-by-one | L | Cross-cutting test `:2056-2102` asserts the invariant. Math is `+` over named buckets. |
| `bulkImportable` empty when `recommendedAction="manual_merge"` confuses consumers | M | Cross-cutting test `:2104-2126` exercises the positive case. Tool description explicitly notes coexistence. |
| Future refactor drops `classification` on `actionableDifferent` → bulk lists silently empty | L | Cross-cutting test would fail (asserts `bulkImportable.length > 0` when sourceNewer modules coexist with bothChanged). |
| Per-entry `classification` drifts from `diffs[*].classification` | L | Cross-check test `:1940-1963` asserts exact equality. By construction they share the same source object. |
| Strict mode accidentally gets new fields | L | `mode === "semantic"` gate at `:691` unchanged; new fields inside that conditional spread. Existing T05 keeps passing. |
| Version-bump collision with round 4 (spec mentions `v2.3.2` patch for round 4) | M | Pre-resolved: round 4 = `v2.3.2` (patch), round 5 = `v2.4.0` (minor). **CRITICAL risk — spec phase must confirm round 4 ships first.** |
| `vba-semantic-classifier.ts` accidental edit | L | Diff scoped to `vba-source-comparison.ts` only; CI diff is reviewable in a small window. |
| Consumers on `2.3.1` see `undefined` for new fields | L | All 5 new fields optional. MCP output is open. Documented in tool description. |

## Open Questions

- [ ] **CRITICAL**: Confirm round 4 (`v2.3.2` patch) lands BEFORE round 5 (`v2.4.0` minor). Spec phase must reconcile the order.
- [ ] `summaryStructured.different` semantics: design defaults to `different.length` (semantic diffs only, not `missing*`). Test `:1882` confirms this for the no-missing case. If spec phase wants it to include `missing*`, adjust to `diffs.length + missingIn*.length` — less natural.
- [ ] Whether the MCP tool description should call out the `bulkImportable` → `import_modules` drop-in shape explicitly. Design calls for the explicit sentence (per consumer prompt's "ready to act on" framing).
