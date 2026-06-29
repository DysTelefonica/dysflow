# Tasks: vba-semantic-diff

Status: tasks
Depends on: spec (sdd/vba-semantic-diff/spec), design (sdd/vba-semantic-diff/design)
Artifact store: hybrid (file + Engram `sdd/vba-semantic-diff/tasks`)
Delivery: chained PRs — 3 PRs (PR2 has documented fallback sub-split if >400 lines)
Test runner: `pnpm test` (Vitest) — STRICT TDD MODE ACTIVE

---

## Conventions

- Every behavioral unit has a RED task (write failing test asserting behavior at port), a GREEN task
  (minimal implementation to pass), and a REFACTOR checkpoint.
- Work-unit commits: tests + code + docs for one behavior travel in the same commit.
- Tests assert on observable outputs of `classifyVbaPair` / aggregated `VbaVerifyResult` fields.
  Never assert on normalizer call order or private shapes.
- Mock only the `ComparisonFileSystemPort` (I/O boundary). The classifier is pure — no mocks needed.
- Each PR must be independently green: `pnpm test && pnpm build && pnpm lint`.
- NEVER touch `%LOCALAPPDATA%\dysflow`. Build to `test-runtime/` only.

---

## PR1 — Pure Semantic Classifier + Unit Tests

**Scope**: Introduce `src/core/services/vba-semantic-classifier.ts` as a pure synchronous domain
service. Write exhaustive unit tests first. Zero adapter dependencies. No changes to any existing
file except adding the new files.

**Files touched**:
- `src/core/services/vba-semantic-classifier.ts` — NEW
- `test/core/services/vba-semantic-classifier.test.ts` — NEW

**Estimated changed lines**: ~300–380

**PR1 verification**: `pnpm test && pnpm build && pnpm lint`

---

### PR1-T01 — RED: Types and public API contract test

**Req**: Classification Taxonomy  
**What**: Create `test/core/services/vba-semantic-classifier.test.ts`. Import
`classifyVbaPair`, `VbaSemanticCategory`, `VbaRecommendation`, `SemanticClassification`,
`ClassifyVbaPairInput`, `VbaComparisonMode` from the classifier module path. Assert the test file
compiles (import-only test that drives the type shape contract).

Write one `describe("classifyVbaPair — type contract")` block with:
- `it("returns a SemanticClassification object with all required fields")` — call
  `classifyVbaPair({ sourceText: "x", binaryText: "x", fileType: "bas", mode: "semantic" })` and
  assert the result has `classification`, `reason`, `srcUniqueFunctionalLines`,
  `binaryUniqueFunctionalLines`, `recommendation`, `actionable` properties.

This test MUST be red (module does not exist yet).

**Parallel**: Can start immediately. No dependencies within PR1.

---

### PR1-T02 — RED: matched category test group

**Req**: Classification Taxonomy — `matched` scenario  
**What**: Add `describe("matched — identical texts")` group:
- `it("classifies identical strings as matched with no_action")` — same text both sides,
  `fileType: "bas"`, `mode: "semantic"`. Expect `classification: "matched"`,
  `recommendation: "no_action"`, `actionable: false`, `srcUniqueFunctionalLines: 0`,
  `binaryUniqueFunctionalLines: 0`.
- `it("classifies identical form.txt as matched")` — use a real-shaped snippet from
  `E2E_testing/src/forms/Form_FormCPV.form.txt` (first 5 non-blank lines as a string constant).

**Parallel**: Runs in parallel with PR1-T01 (same test file, no impl yet).

---

### PR1-T03 — RED: whitespaceOnly category test group

**Req**: Classification Taxonomy — `whitespaceOnly` scenario  
**What**: Add `describe("whitespaceOnly — CRLF and trailing whitespace")` group:
- `it("classifies CRLF vs LF difference as whitespaceOnly")` — source uses `\n`, binary uses
  `\r\n` for the same lines. Expect `classification: "whitespaceOnly"`, `recommendation: "no_action"`,
  `srcUniqueFunctionalLines: 0`, `binaryUniqueFunctionalLines: 0`.
- `it("classifies trailing spaces difference as whitespaceOnly")` — same lines, source has trailing
  spaces, binary does not.
- `it("classifies extra trailing blank lines as whitespaceOnly")`.
- `it("does NOT classify whitespaceOnly in strict mode")` — same CRLF/LF pair with
  `mode: "strict"`. Expect `classification` is NOT `"whitespaceOnly"` (strict bypasses noise;
  functional diff result expected).

**Sequential after**: PR1-T01 (test file must exist).

---

### PR1-T04 — RED: attributeOnly category test group

**Req**: Classification Taxonomy — `attributeOnly` scenario; `VB_Name` is functional  
**What**: Add `describe("attributeOnly — VB_ header differences")` group. Use a real `.cls` header
snippet from `E2E_testing/src/classes/Cambio.cls`:
- `it("classifies VB_Description difference as attributeOnly")` — source and binary identical
  except `Attribute VB_Description = "old desc"` vs `"new desc"`. `fileType: "cls"`. Expect
  `classification: "attributeOnly"`, `recommendation: "no_action"`.
- `it("classifies VB_GlobalNameSpace difference as attributeOnly")` — same pattern.
- `it("does NOT classify VB_Name difference as attributeOnly")` — source `Attribute VB_Name = "ModA"`,
  binary `Attribute VB_Name = "ModB"`. Expect `classification` is NOT `"attributeOnly"` and
  `srcUniqueFunctionalLines > 0 || binaryUniqueFunctionalLines > 0`.
- `it("does NOT classify attributeOnly for form.txt files")` — attribute lines in a form.txt should
  NOT trigger the attribute normalizer (file type guard). Expect functional diff.

**Sequential after**: PR1-T01.

---

### PR1-T05 — RED: formSerializationOnly category test group

**Req**: Classification Taxonomy — `formSerializationOnly` scenario; `NameMap` is functional  
**What**: Add `describe("formSerializationOnly — printer/checksum noise")` group. Use real-shaped
form.txt snippet from `E2E_testing/src/forms/Form_FormCPV.form.txt` (contains `Checksum`,
`RecSrcDt = Begin...End`):
- `it("classifies Checksum scalar line difference as formSerializationOnly")` — source and binary
  identical except `Checksum = -226007363` vs `Checksum = -999999999`. `fileType: "form.txt"`.
  Expect `classification: "formSerializationOnly"`, `recommendation: "no_action"`.
- `it("classifies PrtDevMode Begin..End block difference as formSerializationOnly")` — source has
  no `PrtDevMode` block, binary has one.
- `it("classifies RecSrcDt Begin..End block difference as formSerializationOnly")`.
- `it("classifies PrtDevModeW block difference as formSerializationOnly")`.
- `it("classifies PrtDevNames block difference as formSerializationOnly")`.
- `it("classifies PrtDevNamesW block difference as formSerializationOnly")`.
- `it("classifies PrtMip block difference as formSerializationOnly")`.
- `it("does NOT classify NameMap difference as formSerializationOnly")` — source and binary differ
  only in `NameMap = Begin...End` block content. Expect classification is NOT
  `"formSerializationOnly"` and `srcUniqueFunctionalLines > 0 || binaryUniqueFunctionalLines > 0`.
- `it("does NOT classify unknown Begin..End section as formSerializationOnly")` — source has
  `FooUnknown = Begin...End` block not in binary. Expect functional diff (unknown-section bias).
- `it("does NOT classify formSerializationOnly for bas/cls files")` — form noise keys in a .bas
  file are treated as functional lines, not stripped.

**Sequential after**: PR1-T01.

---

### PR1-T06 — RED: encodingOnly category test group

**Req**: Classification Taxonomy — `encodingOnly` scenario; U+FFFD guard  
**What**: Add `describe("encodingOnly — mojibake normalization")` group:
- `it("classifies Latin-1/UTF-8 double-encoding mojibake as encodingOnly when bytes provided")` —
  `sourceBytes` = UTF-8 bytes of `"Edición"`, `binaryBytes` = Windows-1252 bytes of `"Edición"`
  (mis-decoded as Latin-1 UTF-8 -> mojibake `"EdiciÃ³n"`). Expect `classification: "encodingOnly"`,
  `recommendation: "no_action"`.
- `it("does NOT classify as encodingOnly when U+FFFD is present in source string")` — source string
  contains `�` replacement char. Expect classification is NOT `"encodingOnly"` (falls to
  functional).
- `it("does NOT classify as encodingOnly when U+FFFD is present in binary string")`.
- `it("does NOT classify as encodingOnly when repair does not resolve the difference")` — texts differ
  in actual content even after normalization. Expect functional category, NOT `"encodingOnly"`.
- `it("falls back to string repair path when no bytes provided; still guards against FFFD")` —
  no `sourceBytes`/`binaryBytes`, strings already contain `�`. Expect NOT `"encodingOnly"`.

**Sequential after**: PR1-T01.

---

### PR1-T07 — RED: directionality (sourceNewer / binaryNewer / bothChanged) test group

**Req**: Directionality from Symmetric Functional-Line Diff  
**What**: Add `describe("directionality — functional-line diff")` group:
- `it("classifies sourceNewer when source has unique functional lines")` — source has 3 lines not in
  binary (add 3 distinct non-whitespace/non-attribute lines). Expect `classification: "sourceNewer"`,
  `recommendation: "import_to_binary"`, `srcUniqueFunctionalLines: 3`,
  `binaryUniqueFunctionalLines: 0`, `actionable: true`.
- `it("classifies binaryNewer when binary has unique functional lines")` — binary has 2 additional
  lines. Expect `classification: "binaryNewer"`, `recommendation: "export_to_src"`,
  `binaryUniqueFunctionalLines: 2`, `srcUniqueFunctionalLines: 0`.
- `it("classifies bothChanged when both sides have unique lines")` — one line unique on each side.
  Expect `classification: "bothChanged"`, `recommendation: "manual_merge"`,
  `srcUniqueFunctionalLines >= 1`, `binaryUniqueFunctionalLines >= 1`.
- `it("classifies line reorder as bothChanged (conservative LCS behavior)")` — same lines in
  different order. Expect `classification: "bothChanged"` (documents LCS conservative choice;
  never hides a reorder as matched).

**Sequential after**: PR1-T01.

---

### PR1-T08 — RED: strict mode test group

**Req**: Semantic Mode as Default, Strict Mode as Opt-In  
**What**: Add `describe("strict mode — bypasses noise buckets")` group:
- `it("strict mode: whitespace-only diff classifies as functional")` — CRLF vs LF diff with
  `mode: "strict"`. Expect `classification` is one of `sourceNewer/binaryNewer/bothChanged`
  (NOT `whitespaceOnly`). Directionality is still derived via LCS on raw (non-normalized) lines.
- `it("strict mode: attribute-only diff classifies as functional")` — VB_ header diff with
  `mode: "strict"`. Expect functional category.
- `it("strict mode: identical text classifies as matched even in strict mode")` — `sourceText ===
  binaryText`, `mode: "strict"`. Expect `classification: "matched"` (strict = byte-exact equality
  still catches identical files).
- `it("semantic is default when mode is omitted")` — call `classifyVbaPair` without `mode` field
  (default). Expect whitespace-only noise to be `whitespaceOnly`.

**Sequential after**: PR1-T01.

---

### PR1-T09 — RED: LCS line-move test (documents conservative choice)

**Req**: Directionality — move handling  
**What**: Add `it("line-move: reorder surfaces as bothChanged via LCS conservative choice")` —
two versions of a `.bas` module where all lines are identical but in different order. Expect
`classification: "bothChanged"`, `recommendation: "manual_merge"`. Include code comment:
"LCS is conservative — a pure reorder yields symmetric unique count; classified as bothChanged
to never silently hide an intentional reorder."

**Sequential after**: PR1-T01.

---

### PR1-T10 — GREEN: Implement `vba-semantic-classifier.ts` to pass all RED tests

**Req**: All Classification Taxonomy + Directionality + Mode requirements  
**What**: Create `src/core/services/vba-semantic-classifier.ts`. Implement:

1. **Type exports**: `VbaComparisonMode`, `VbaSemanticCategory`, `VbaRecommendation`,
   `SemanticClassification`, `ClassifyVbaPairInput`.
2. **Normalizers** (all pure, `(text, fileType) => string`):
   - `normalizeLineEndings(text)` — CRLF/CR -> LF
   - `normalizeTrailingWhitespace(text)` — strip trailing spaces/tabs per line; collapse trailing
     blank lines
   - `stripAttributeLines(text, fileType)` — remove `Attribute VB_*` lines for `bas/cls/frm` only;
     VB_Name is NOT stripped (it is functional — do not add it to the strip list)
   - `stripFormSerializationNoise(text, fileType)` — for `form.txt/report.txt` only: strip scalar
     `Checksum =` lines and `Begin...End` blocks for keys `PrtDevMode, PrtDevModeW, PrtDevNames,
     PrtDevNamesW, PrtMip, RecSrcDt`. Unknown `Begin...End` keys are RETAINED (bias-to-functional).
     `NameMap` and `GUID` are RETAINED.
   - `repairMojibake(text, bytes?)` — best-effort Latin-1<->UTF-8 double-encoding repair. If
     `bytes` present: decode under both UTF-8 and Windows-1252 and compare. If string contains
     U+FFFD (`�`): do not repair, return original string unchanged (safety guard).
3. **LCS functional-line differ** (`lcsLength(a: string[], b: string[]): number`) — classic DP,
   capped at 20000 lines per side (fallback to multiset-difference count if either side exceeds cap;
   append `lcs-capped` to reason in that case).
4. **`classifyVbaPair(input: ClassifyVbaPairInput): SemanticClassification`** — implement the
   classification algorithm from design §3.3 in fixed precedence order:
   - 0: strict mode — no normalization, raw equality check then straight to functional differ.
   - 1: raw equal -> `matched`
   - 2: equal after lineEndings + trailingWs normalizers -> `whitespaceOnly`
   - 3: equal after (2) + stripAttributeLines -> `attributeOnly` (code types only)
   - 4: equal after (2) + stripFormSerializationNoise -> `formSerializationOnly` (form/report only)
   - 5: equal after (2..4) + repairMojibake -> `encodingOnly` (only if no U+FFFD, repair succeeds)
   - 6: else -> run LCS-based functional-line diff on fully-normalized texts; map to
     `sourceNewer/binaryNewer/bothChanged` per directionality table.
5. Export normalizers individually (named exports) so they can be directly unit-tested if needed,
   but tests MUST assert on `SemanticClassification` output, not normalizer internals.

`classifyVbaPair` is the ONLY entry point that `vba-source-comparison.ts` will call (PR2).

**Sequential after**: PR1-T01 through PR1-T09 all red.

---

### PR1-T11 — REFACTOR: Classifier code quality pass

**What**: After all PR1 tests are green, run the refactor checkpoint:
- Verify no `node:*` imports in `vba-semantic-classifier.ts`.
- Ensure normalizer functions are exported and have JSDoc describing their contract.
- Ensure `reason` strings are stable, human/grep-friendly, contain no paths or timestamps.
- Confirm LCS cap constant is named (e.g. `LCS_LINE_BUDGET = 20000`) and documented.
- Run `pnpm lint` to fix any Biome violations.
- Run `pnpm build` to confirm TypeScript compiles.
- Run `pnpm test` — all PR1 tests must be green.

**Sequential after**: PR1-T10.

---

## PR2 — Wire Classifier + Result Contract + readFileBytes + Mode Plumbing

**Scope**: Integrate the classifier into `compareVbaSourceTrees`. Extend `ComparisonFileSystemPort`
with optional `readFileBytes`. Grow `VbaVerifyResult` additively. Add `strict` prop to the three
existing schemas. Extend `vba-source-comparison.test.ts`.

**Files touched**:
- `src/core/services/vba-source-comparison.ts` — MODIFY (types + compareVbaSourceTrees + result)
- `src/adapters/vba-sync/vba-modules-adapter.ts` — MODIFY (add `readFileBytes` to
  `nodeComparisonFileSystem`; derive `mode` from `params.strict`)
- `src/adapters/mcp/schemas/vba-sync-schemas.ts` — MODIFY (add `strict: SCHEMA_PROPS.strict` to
  `verify_code`, `verify_binary`, `reconcile_binary` schemas)
- `test/core/services/vba-source-comparison.test.ts` — MODIFY (extend with semantic tests)

**Estimated changed lines**: ~300–400 (see PR2a/PR2b fallback sub-split below if >400)

**PR2 verification**: `pnpm test && pnpm build && pnpm lint`

**PR2a/PR2b fallback sub-split** (apply if PR2 exceeds 400 lines):
- PR2a: `readFileBytes` optional port method + encoding path in classifier wiring only (~100–150 lines)
- PR2b: All remaining PR2 scope (result contract, mode plumbing, schemas)

---

### PR2-T01 — RED: readFileBytes port method test

**Req**: Encoding — byte-returning port variant (design §5)  
**What**: In `test/core/services/vba-source-comparison.test.ts`, add a test group
`describe("ComparisonFileSystemPort.readFileBytes — optional method")`:
- `it("compareVbaSourceTrees works when readFileBytes is absent (backward compat)")` — use the
  existing in-memory `ComparisonFileSystemPort` mock WITHOUT `readFileBytes`. Call
  `compareVbaSourceTrees` with two files that differ only in encoding noise (manually written string
  pair without bytes). Expect it does not throw and returns a valid result.
- `it("compareVbaSourceTrees uses readFileBytes when available to enable reliable encodingOnly")` —
  mock implements `readFileBytes` returning known byte arrays. Pass encoding-noise file pair. Expect
  `diffs[0].classification === "encodingOnly"`.

**Sequential after**: PR1-T11 (PR1 must be merged/green).

---

### PR2-T02 — RED: additive result contract test group

**Req**: Additive Backward-Compatible Result Contract  
**What**: Add `describe("VbaVerifyResult — additive semantic fields")` group:
- `it("result includes summary, actionableDifferent, nonActionableDifferent, hasFunctionalDifferences, actionableOk in semantic mode")` —
  run `compareVbaSourceTrees` with one whitespace-only diff module. Assert:
  - `result.summary` is an object with `total`, `byCategory`, `actionable`, `nonActionable`.
  - `result.actionableDifferent` is an array.
  - `result.nonActionableDifferent` is an array.
  - `result.hasFunctionalDifferences` is a boolean.
  - `result.actionableOk` is a boolean.
  - All previously existing fields are present (`matched`, `different`, `missingInSource`,
    `missingInBinary`, `ok`, `operation`, `dryRun`, `willModifyAccess`, `sourceRoot`).
- `it("backward-compat: JSON.stringify of result still has all original fields with correct types")` —
  assert `JSON.stringify(result)` round-trips and parsed object has `matched`, `different`,
  `missingInSource`, `missingInBinary`, `ok` (boolean), `dryRun` (true), `willModifyAccess` (false),
  `operation` (string), `sourceRoot` (string) — no field absent, renamed, or type-changed.

**Sequential after**: PR2-T01.

---

### PR2-T03 — RED: ok-recalc and actionability semantics test group

**Req**: `ok` / `hasFunctionalDifferences` / `actionableOk` recomputation (design §8)  
**What**: Add `describe("ok semantics and actionability")` group:
- `it("ok=false but actionableOk=true when only whitespace-only diff exists")` — one module with
  CRLF vs LF difference. Expect `ok: false` (legacy preserved), `actionableOk: true`,
  `hasFunctionalDifferences: false`, module name in `nonActionableDifferent`.
- `it("ok=false and actionableOk=false when sourceNewer module exists")` — one module with extra
  functional line in source. Expect `ok: false`, `actionableOk: false`,
  `hasFunctionalDifferences: true`, module name in `actionableDifferent`,
  `summary.byCategory.sourceNewer === 1`.
- `it("hasFunctionalDifferences=true when missingInBinary is non-empty")` — module exists in source
  but not in binary. Expect `hasFunctionalDifferences: true`, `actionableOk: false`.
- `it("hasFunctionalDifferences=true when missingInSource is non-empty")`.
- `it("actionableDifferent and nonActionableDifferent are disjoint and their union equals different")` —
  mixed-category tree. Assert union === `different` and intersection is empty.

**Sequential after**: PR2-T01.

---

### PR2-T04 — RED: diffs carry classification fields test

**Req**: Per-diff additive fields (`classification`, `reason`, `srcUniqueFunctionalLines`,
`binaryUniqueFunctionalLines`, `recommendation`)  
**What**:
- `it("diffs entries carry classification and recommendation when includeDiffs=true")` — run
  `compareVbaSourceTrees` with `includeDiffs: true` and one `sourceNewer` module. Assert
  `result.diffs[0].classification === "sourceNewer"`, `result.diffs[0].recommendation ===
  "import_to_binary"`, `result.diffs[0].reason` is a non-empty string, and `srcUniqueFunctionalLines`
  and `binaryUniqueFunctionalLines` are numbers.
- `it("diffs entries still have sourceSnippet and binarySnippet (backward compat)")`.

**Sequential after**: PR2-T02.

---

### PR2-T05 — RED: strict mode integration test (compareVbaSourceTrees level)

**Req**: Semantic Mode as Default, Strict Mode as Opt-In  
**What**:
- `it("strict mode: whitespace-only diff stays in different[] and not in nonActionableDifferent")` —
  run `compareVbaSourceTrees` with `mode: "strict"` and a CRLF-only diff. Expect module in
  `different`, NOT in `nonActionableDifferent`, and `actionableOk === ok`.
- `it("strict mode: semantic additive fields are absent or empty")` — expect `actionableDifferent`,
  `nonActionableDifferent`, `hasFunctionalDifferences`, `actionableOk` are either absent or empty/false.
- `it("semantic mode is the default (mode parameter omitted)")` — call `compareVbaSourceTrees`
  without a `mode` argument. Whitespace-only diff -> `nonActionableDifferent` non-empty,
  `hasFunctionalDifferences: false`.

**Sequential after**: PR2-T02.

---

### PR2-T06 — RED: 173-module acceptance gate test

**Req**: 173-Module Acceptance Gate  
**What**: Add `describe("173-module acceptance gate")` in `vba-source-comparison.test.ts`:
- `it("separates 159 non-actionable and 7 actionable from 173 differing modules")` —
  build an in-memory `ComparisonFileSystemPort` mock that returns:
  - 100 modules with CRLF-vs-LF difference (whitespaceOnly)
  - 30 modules with VB_ header difference (attributeOnly)
  - 20 modules with Checksum/PrtDevMode noise in form.txt (formSerializationOnly)
  - 9 modules with encoding-only difference (encodingOnly)
  - 3 modules with extra functional lines in source (sourceNewer)
  - 4 modules where both sides have unique functional lines (bothChanged)
  - Total: 173 differing modules (all are in `different[]`), 7 actionable.
  Assert:
  - `actionableDifferent.length === 7`
  - `nonActionableDifferent.length === 166` (or >= 159, with actual distribution noted)
  - `hasFunctionalDifferences === true`
  - `summary.byCategory.sourceNewer === 3`
  - `summary.byCategory.bothChanged === 4`
  - `different.length === 173` (backward compat)
  Note: the actual non-actionable total (166) exceeds the spec's "159" — 166 = 100+30+20+9+7
  (the 7 matched modules are not in `different`). Use exact counts matching the fixture.

**Sequential after**: PR2-T03, PR2-T04.

---

### PR2-T07 — GREEN: Extend `ComparisonFileSystemPort` and types

**Req**: Encoding port; Additive result contract  
**What**:
1. In `src/core/services/vba-source-comparison.ts`:
   - Add optional `readFileBytes?(path: string): Promise<Uint8Array>` to `ComparisonFileSystemPort`.
   - Extend `VbaSourceDiffEntry` with additive fields: `classification: VbaSemanticCategory`,
     `reason: string`, `srcUniqueFunctionalLines: number`, `binaryUniqueFunctionalLines: number`,
     `recommendation: VbaRecommendation`.
   - Extend `VbaVerifyResult` with additive fields: `summary: VbaSemanticSummary`,
     `actionableDifferent: readonly VbaSourceComparisonEntry[]`,
     `nonActionableDifferent: readonly VbaSourceComparisonEntry[]`,
     `hasFunctionalDifferences: boolean`, `actionableOk: boolean`.
   - Import `classifyVbaPair`, `VbaSemanticCategory`, `VbaRecommendation`, `VbaSemanticSummary`,
     `VbaComparisonMode` from `./vba-semantic-classifier.js`.
   - Add `mode: VbaComparisonMode = "semantic"` as trailing parameter to `compareVbaSourceTrees`.
     Existing callers compile without change (default).
   - Update the comparison loop (line ~244): replace `if (sourceText === binaryText)` with a call to
     `classifyVbaPair`. Populate `matched` vs `different` based on classification === "matched".
     Populate `actionableDifferent` / `nonActionableDifferent`. Populate `diffs[].classification`
     etc. when `includeDiffs` is true.
   - Compute `summary`, `hasFunctionalDifferences`, `actionableOk` after the loop.
   - Preserve `ok` legacy semantics (false on any diff/missing).
   - When `readFileBytes` is present on `fileSystem`, read raw bytes for each pair and pass as
     `sourceBytes`/`binaryBytes` to `classifyVbaPair`. When absent, pass strings only.
2. Update `compareSourceAgainstBinary` to accept and forward a `mode` parameter derived from
   `truthy(params.strict)`.
3. Update `planReconcileBinary` to forward `mode` the same way. Update its `recommendation` string
   to reflect `actionableOk` when true but `ok` is false (noise-only differences).

**Sequential after**: PR2-T01 through PR2-T06 all red.

---

### PR2-T08 — GREEN: Add `readFileBytes` to `nodeComparisonFileSystem` and mode plumbing

**Req**: Encoding port (node adapter); Mode plumbing through `VbaModulesAdapter`  
**What**: In `src/adapters/vba-sync/vba-modules-adapter.ts`:
1. Add `readFileBytes: (path) => readFile(path)` to `nodeComparisonFileSystem` (returns `Buffer`,
   which satisfies `Promise<Uint8Array>`). Import `readFile` already present.
2. In the `handles()` routing for `verify_code`, `verify_binary`, `reconcile_binary`: derive
   `mode: VbaComparisonMode = truthy(params.strict) ? "strict" : "semantic"` and pass to
   `compareSourceAgainstBinary` / `planReconcileBinary`.

**Sequential after**: PR2-T07.

---

### PR2-T09 — GREEN: Add `strict` prop to three verify/reconcile schemas

**Req**: Semantic Mode as Default, Strict Mode as Opt-In — schema plumbing (design §7.3 gotcha)  
**What**: In `src/adapters/mcp/schemas/vba-sync-schemas.ts`:
- Add `strict: SCHEMA_PROPS.strict` to the `properties` object of each of these three schemas:
  `verify_code`, `verify_binary`, `reconcile_binary`.
- NOTE: `STRICT_CTX` spread is already present in those schemas but provides only `strictContext`,
  `expectedAccessPath`, `expectedProjectRoot`, `expectedDestinationRoot`. The `strict` prop is a
  separate property that MUST be added explicitly.

**Sequential after**: PR2-T08.

---

### PR2-T10 — REFACTOR: PR2 code quality and backward-compat verification

**What**: After all PR2 tests are green:
- Run `pnpm test` — all existing tests (pre-change) MUST still pass. Any test that previously
  asserted on `comparison.different` for genuinely different content must still pass because those
  are functional diffs (classification is sourceNewer/binaryNewer/bothChanged and they remain in
  `different[]`).
- If any existing test fails due to byte-exact bucketing of normalize-equal content, add a
  `mode: "strict"` variant of that test and update the original to pass under semantic mode.
- Run `pnpm build` — TypeScript must compile with zero errors.
- Run `pnpm lint` — zero Biome violations.
- Confirm `VbaReconcilePlanResult` still compiles (it `Omit`s from `VbaVerifyResult` and inherits
  new fields automatically — verify no field name collision).

**Sequential after**: PR2-T09.

---

## PR3 — `compare_module` MCP Tool (5-file registration + parity test + E2E)

**Scope**: Register `compare_module` through the five required surfaces. Add parity test. Add E2E
semantic coverage. Zero new comparison logic — reuses PR2's `compareSourceAgainstBinary`.

**Files touched**:
- `src/adapters/mcp/mcp-tool-registry.ts` — MODIFY
- `src/adapters/mcp/tool-parity-registry.ts` — MODIFY
- `src/adapters/mcp/dispatch-routes.ts` — MODIFY
- `src/adapters/mcp/schemas/vba-sync-schemas.ts` — MODIFY
- `src/adapters/vba-sync/vba-modules-adapter.ts` — MODIFY
- `test/adapters/mcp/compare-module-registration.test.ts` — NEW
- `E2E_testing/mcp-e2e.mjs` — MODIFY

**Estimated changed lines**: ~250–350

**PR3 verification**: `pnpm test && pnpm build && pnpm lint` + `node E2E_testing/mcp-e2e.mjs`
(E2E gate requires Windows + Access COM + `ACCESS_VBA_PASSWORD`; must use isolated `test-runtime/`)

---

### PR3-T01 — RED: compare_module registration parity test

**Req**: `compare_module` MCP Tool — 5-surface registration; missing registration causes known error  
**What**: Create `test/adapters/mcp/compare-module-registration.test.ts`. This test is the
canonical guard against silent mis-registration. It MUST be red before any registration changes.

```typescript
describe("compare_module — 5-surface registration parity", () => {
  it("compare_module is in VBA_SYNC_TOOL_NAMES") — assert "compare_module" ∈ VBA_SYNC_TOOL_NAMES.
  it("compare_module has status=implemented and slice=vba-sync in tool-parity-registry") —
    getToolDefinition("compare_module").status === "implemented" &&
    getToolDefinition("compare_module").slice === "vba-sync".
  it("compare_module has kind=vba-sync route in MCP_TOOL_ROUTES") —
    MCP_TOOL_ROUTES.compare_module.kind === "vba-sync".
  it("compare_module schema exists, requires moduleName, and exposes strict") —
    VBA_SYNC_TOOL_SCHEMAS.compare_module is defined;
    VBA_SYNC_TOOL_SCHEMAS.compare_module.required includes "moduleName";
    VBA_SYNC_TOOL_SCHEMAS.compare_module.properties.strict is defined.
  it("VbaModulesAdapter.handles('compare_module') returns true") —
    new VbaModulesAdapter(...).handles("compare_module") === true.
});
```

All five `it` blocks MUST be red (failing) before any implementation in PR3-T02 through PR3-T06.

**Parallel**: Starts immediately once PR2 is merged. No dependencies within PR3.

---

### PR3-T02 — GREEN: Register in `mcp-tool-registry.ts` (surface 1 of 5)

**Req**: `compare_module` registration — surface 1  
**What**: In `src/adapters/mcp/mcp-tool-registry.ts`, add `"compare_module"` to the
`VBA_SYNC_TOOL_NAMES` array (keep alphabetical or append at end of vba-sync list).
Verify `pnpm build` still compiles (adding to the `as const` array updates the union type).

**Sequential after**: PR3-T01 is red.

---

### PR3-T03 — GREEN: Register in `tool-parity-registry.ts` (surface 2 of 5)

**Req**: `compare_module` registration — surface 2  
**What**: In `src/adapters/mcp/tool-parity-registry.ts`, add `"compare_module"` to the
`implementedToolNames` Set (in the "VBA sync tools" section). This ensures existing parity tests
that iterate `DYSFLOW_MCP_TOOL_NAMES` and assert every name has a schema/route/status continue to pass.

**Sequential after**: PR3-T02.

---

### PR3-T04 — GREEN: Register in `dispatch-routes.ts` (surface 3 of 5)

**Req**: `compare_module` registration — surface 3  
**What**: In `src/adapters/mcp/dispatch-routes.ts`, add `compare_module: { kind: "vba-sync" }` to
`MCP_TOOL_ROUTES`. Place it in the VBA sync group.
IMPORTANT: `compare_module` is a generated dispatch tool (`kind: "vba-sync"`), NOT an alias tool.
Do NOT add it to `ALIAS_TOOL_NAME_LIST` in `alias-tools.ts`.

**Sequential after**: PR3-T03.

---

### PR3-T05 — GREEN: Add schema in `vba-sync-schemas.ts` (surface 4 of 5)

**Req**: `compare_module` registration — surface 4  
**What**: In `src/adapters/mcp/schemas/vba-sync-schemas.ts`, add the `compare_module` schema:
```typescript
compare_module: {
  type: "object",
  required: ["moduleName"],
  additionalProperties: false,
  properties: {
    ...CTX_PROPS,
    ...ACCESS_OVERRIDE,
    moduleName: SCHEMA_PROPS.moduleName,
    strict: SCHEMA_PROPS.strict,
    diff: SCHEMA_PROPS.diff,
    timeoutMs: SCHEMA_PROPS.timeoutMs,
  },
},
```
Confirm `SCHEMA_PROPS.moduleName` exists (it is used in other schemas). If not present, add it to
`src/shared/validation/schema-props.ts` as `{ type: "string", description: "VBA module name." }`.

**Sequential after**: PR3-T04.

---

### PR3-T06 — GREEN: Wire `compareSingleModule` in `VbaModulesAdapter` (surface 5 of 5)

**Req**: `compare_module` registration — surface 5; single-module semantic classification  
**What**: In `src/adapters/vba-sync/vba-modules-adapter.ts`:
1. Add `"compare_module"` to the `handles()` method (or equivalent switch/routing).
2. Implement `compareSingleModule(toolName, params, ctx, fs)`:
   - Extract `moduleName = stringValue(params.moduleName)`. If missing, return a failure result.
   - Derive `mode: VbaComparisonMode = truthy(params.strict) ? "strict" : "semantic"`.
   - Call `compareSourceAgainstBinary("verify_code", { ...params, moduleNames: [moduleName] },
     ctx, fs)` (reuses the full export+compare+classify pipeline).
   - From the result, extract the single module's `diffs[0]` entry (or matched/different entry)
     and shape the response: return `{ classification, reason, srcUniqueFunctionalLines,
     binaryUniqueFunctionalLines, recommendation, summary, moduleName }`.
3. Route `"compare_module"` in `execute()` to `compareSingleModule`.

**Sequential after**: PR3-T05.

---

### PR3-T07 — GREEN: parity test turns green

**Req**: All 5 surfaces registered  
**What**: Run `pnpm test` — the five `it` blocks in `compare-module-registration.test.ts` must all
be green. If any surface test still fails, fix the corresponding registration before continuing.

**Sequential after**: PR3-T06.

---

### PR3-T08 — GREEN: Add E2E semantic coverage to `E2E_testing/mcp-e2e.mjs`

**Req**: Acceptance Gates — E2E semantic path; E2E uses isolated test-runtime  
**What**: In `E2E_testing/mcp-e2e.mjs`, add the following assertions after line ~227 (after the
existing `verify_code` record call):

1. **Semantic `verify_code` assertion** (extends the existing call):
   After `record("vba-sync", "verify_code", { ...ctx, moduleNames: [existingModuleName], diff: false })`,
   add a check that the result payload includes `summary`, `hasFunctionalDifferences`,
   `actionableOk`. Parse the serialized result and assert these keys exist.

2. **`compare_module` call**:
   ```javascript
   await record("vba-sync", "compare_module", {
     ...ctx,
     moduleName: existingModuleName,
     diff: true,
   });
   ```
   Assert the result payload contains `classification`, `recommendation`, and `reason`.

3. **`verify_code` with `strict: true`** (optional but recommended for regression guard):
   ```javascript
   await record("vba-sync", "verify_code", {
     ...ctx,
     moduleNames: [existingModuleName],
     strict: true,
     diff: false,
   });
   ```

HARD CONSTRAINT: `process.env.DYSFLOW_HOME` is already set to `join(repoRoot, "test-runtime")`
at line 25 of mcp-e2e.mjs. Do NOT change this. Do NOT reference `%LOCALAPPDATA%\dysflow` in
any test path.

**Sequential after**: PR3-T07.

---

### PR3-T09 — REFACTOR: PR3 code quality and final gate

**What**:
1. Run `pnpm test` — all unit/spec tests green (including parity test, all PR1 and PR2 tests).
2. Run `pnpm build` — zero TS errors.
3. Run `pnpm lint` — zero Biome violations.
4. Verify `compare_module` does NOT appear in any HTTP/CLI exposure path (grep for its name in
   non-MCP adapter files to confirm MCP-only).

**Sequential after**: PR3-T08.

---

## Final Acceptance Gate (mandatory, runs last, after PR3-T09)

**Req**: Acceptance Gates (CI + E2E) — real MCP E2E with isolated test-runtime  
**What**:

1. Build to isolated test-runtime (never touch `%LOCALAPPDATA%\dysflow`):
   ```
   pnpm build
   # Copy build artifacts to test-runtime/ per existing E2E setup
   ```
2. Run the real MCP E2E suite:
   ```
   DYSFLOW_E2E_COMMAND=<path-to-test-runtime-dysflow> \
   ACCESS_VBA_PASSWORD=<password> \
   node E2E_testing/mcp-e2e.mjs
   ```
3. Assert the E2E report (`E2E_testing/.dysflow/mcp-e2e-temp/mcp-e2e-report.md`) contains
   passing records for:
   - `compare_module` (new)
   - `verify_code` (semantic fields present in payload)
   - `verify_code` with `strict: true` (strict bucketing confirmed)
4. Confirm the suite makes zero accesses to `%LOCALAPPDATA%\dysflow`.

This gate is IN ADDITION to `pnpm test && pnpm build && pnpm lint` per PR. It requires Windows +
Access COM + `ACCESS_VBA_PASSWORD`. It runs once after all three PRs are merged and the
test-runtime build is complete.

**Sequential after**: PR3-T09 (all three PRs merged).

---

## Dependency Graph (task-level)

```
PR1:
  T01 -> T02, T03, T04, T05, T06, T07, T08, T09 (all parallel, same test file)
  T02..T09 -> T10 (all RED complete before GREEN)
  T10 -> T11

PR2:
  [PR1 merged] -> T01
  T01 -> T02
  T02 -> T03, T04, T05
  T03, T04, T05 -> T06
  T06 -> T07 (all RED complete before GREEN)
  T07 -> T08 -> T09 -> T10

PR3:
  [PR2 merged] -> T01 (RED)
  T01 -> T02 -> T03 -> T04 -> T05 -> T06 -> T07
  T07 -> T08 -> T09
  T09 -> Final Acceptance Gate
```

**Critical path**: PR1-T10 (classifier impl) → PR2-T07 (wiring) → PR3-T06 (adapter routing) →
Final E2E Gate.

---

## Review Workload Forecast

| PR | Scope | Est. changed lines | 400-line risk |
|----|-------|--------------------|---------------|
| PR1 | Pure classifier + unit tests | ~300–380 | Low |
| PR2 | Wiring + result contract + readFileBytes + mode + schemas | ~300–400 | Medium–High |
| PR3 | compare_module 5-file + parity test + E2E | ~250–350 | Low–Medium |

**Total estimated changed lines**: ~850–1130

**Chained PRs recommended**: Yes — work is already split into 3 chained PRs to stay within the
400-line review budget per PR.

**PR2 400-line budget risk**: High. If the `readFileBytes`/encoding path alone pushes PR2 over
400 lines, apply the PR2a/PR2b sub-split documented in the PR2 header. PR2a (~100–150 lines):
port method + encoding path in classifier wiring only. PR2b (~200–280 lines): result contract,
mode plumbing, schemas, test extensions.

**Decision needed before apply**: Yes — the orchestrator must choose a chain strategy
(`stacked-to-main` or `feature-branch-chain`) before `sdd-apply` begins PR1.
