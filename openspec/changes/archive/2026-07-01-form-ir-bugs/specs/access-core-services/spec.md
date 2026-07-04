# Delta for access-core-services

Closes three form-IR bugs from issue #622: missing `rpt` prefix recognition (#A), `FormatConditions` predicate collision paired with the `appliedTokens` truthfulness lie (#B twofold), and silent catalog overwrite on corrupt JSON (#C). Every scenario below is TESTABLE at the listed port; this delta does NOT add E2E scenarios.

## ADDED Requirements

### Requirement: Component Resolver Recognizes Report Prefixes Beyond `Report_`

The system MUST classify a VBA component name as a report when its lowercased name's prefix matches one of `{report_, rpt, rpt_}`. The classification MUST apply whether `vbaType` is undefined or equals `100` (document-module fallback). Existing `Report_`, `form_`, and `frm` contracts MUST stay unchanged.

#### Scenario: rptFoo resolves to reports
- GIVEN `resolveComponent("rptFoo")` is called with no `vbaType`
- WHEN classification runs
- THEN it MUST return `{ folder: "reports", extension: ".report.txt", type: "report" }`

#### Scenario: rpt_Foo, Rpt_X, rptAudit also resolve to reports
- GIVEN three name variants differing in underscore and case after the prefix
- WHEN classification runs
- THEN all MUST return the same report resolution (lower-cased prefix match)

#### Scenario: type-100 fallback overridden by rpt prefix
- GIVEN `resolveComponent("rptDaily", 100)`
- WHEN the prefix check runs before the `vbaType === 100` form-default branch
- THEN it MUST return reports (NOT the form-default)

#### Scenario: existing Report_/Form_/frm prefixes unchanged
- GIVEN the existing ten contract tests in `test/core/mapping/component-resolver.test.ts`
- WHEN classification runs for each
- THEN every existing assertion MUST hold (regression guard)

#### Scenario: unrelated lowercase prefix stays at default modules
- GIVEN `resolveComponent("utils")` with no `vbaType`
- WHEN classification runs
- THEN it MUST resolve to `{ folder: "modules", extension: ".bas", type: "module" }` (no accidental `rpt` false-positive)

**Test surface**: pure function `src/core/mapping/component-resolver.ts`; no I/O, no Access. Add to `describe("resolveComponent")` in `test/core/mapping/component-resolver.test.ts`:

- `it("should resolve rpt prefixed components as reports")` — `rptFoo`.
- `it("should resolve rpt_ underscored form as reports")` — `rpt_Foo`.
- `it("should resolve uppercase Rpt prefix as reports")` — `Rpt_X` and `rptAudit`.
- `it("should resolve type 100 with rpt prefix as reports")` — fallback precedence.

### Requirement: Preserved-Metadata Key Predicate Is Exact-Match

`applyTokenMap` MUST classify a property key as preserved metadata ONLY when it is byte-equal to one of `["Checksum", "Format", "PrtDevMode"]`. Keys sharing a prefix with a preserved key (e.g. `FormatConditions`, `FormatHeader`) MUST be treated as ordinary layout keys and MUST flow through token replacement.

#### Scenario: FormatConditions scalar is replaced when mapped
- GIVEN a source whose `FormatConditions` scalar holds `FormatConditions = "{{X}}_foo"` AND `tokenMap = { X: "BAR" }`
- WHEN `applyTokenMap` runs
- THEN the serialized output MUST contain `FormatConditions = "BAR_foo"`
- AND it MUST NOT contain the literal `{{X}}` substring inside `FormatConditions`

#### Scenario: exact-match preserved keys still exclude replacement
- GIVEN a source whose `Checksum`/`Format`/`PrtDevMode` scalars hold `{{X}}` AND `tokenMap = { X: "BAR" }`
- WHEN `applyTokenMap` runs
- THEN those bytes MUST remain verbatim in the serialized output (regression contract)

#### Scenario: arbitrary FormatXxx prefix is NOT preserved
- GIVEN a source layout key `FormatHeader = "{{X}}"` (key not equal to `Format`)
- WHEN `applyTokenMap` runs
- THEN `FormatHeader = "BAR"` MUST appear in the serialized output
- AND `appliedTokens` MUST include `X`

**Test surface**: pure IR `applyTokenMap` in `src/core/services/form-ir-service.ts` (predicate body around line 750). Extend `describe("applyTokenMap")` in `test/core/services/form-ir-clone-template.test.ts`:

- `it("replaces a {{Token}} occurrence in a FormatConditions scalar when mapped")`.
- `it("does NOT preserve keys that share a prefix with Format/Checksum/PrtDevMode")`.

The existing test at `form-ir-clone-template.test.ts:106` ("does NOT walk scalar values of preserved metadata keys") MUST stay green with the same fixture; only the predicate body changes.

### Requirement: `appliedTokens` Reflects Actual Replacement

`applyTokenMap` MUST derive `appliedTokens` from post-transformation state, NOT from `Object.hasOwn(tokenMap, sourceToken)`. A token whose `{{Token}}` pattern still appears anywhere in the serialized result (e.g. because its only occurrences live inside a preserved metadata key) MUST NOT appear in `appliedTokens` and MUST appear in `missingTokens`.

#### Scenario: token in a preserved key absent from appliedTokens
- GIVEN a source whose `Checksum` scalar holds `Checksum = "{{X}}_checksum"` AND `tokenMap = { X: "BAR" }`
- WHEN `applyTokenMap` runs
- THEN the serialized output MUST still contain `{{X}}` (replacement did NOT happen)
- AND `appliedTokens` MUST NOT include `X`
- AND `missingTokens` MUST include `X`

#### Scenario: actually-replaced token appears in appliedTokens
- GIVEN a source whose layout `Caption` holds `Caption = "Hello {{X}}"` AND `tokenMap = { X: "World" }`
- WHEN `applyTokenMap` runs
- THEN `appliedTokens` MUST include `X`
- AND the serialized output MUST contain `"Hello World"`
- AND the serialized output MUST NOT contain `{{X}}` anywhere

#### Scenario: derivation mechanism is post-IR serialization, not source AND map membership
- GIVEN any source/token-map pair
- WHEN `applyTokenMap` runs
- THEN `appliedTokens` MUST be computed as the set difference between source `{{...}}` tokens and surviving `{{...}}` tokens in `serializeFormTxt(next)` (or an equivalent diff-based mechanism)
- AND it MUST NOT rely on `Object.hasOwn(tokenMap, sourceToken)` alone

**Test surface**: pure IR `applyTokenMap` in `src/core/services/form-ir-service.ts` (currently at lines 829-841). Extend `describe("applyTokenMap")`:

- `it("appliedTokens excludes a token whose only occurrence was inside a preserved-metadata key")`.
- `it("appliedTokens includes only tokens whose {{...}} pattern was actually replaced in the serialized IR")`.

Implementation contract (for design): derive by scanning `serializeFormTxt(next)` for surviving `{{...}}` patterns and excluding them from source tokens, OR diff `serializeFormTxt(ir)` against `serializeFormTxt(next)`. Either MUST NOT depend solely on `Object.hasOwn`.

### Requirement: Catalog Corruption Refused; ENOENT Still Empty

`catalogAddControl` MUST distinguish a missing catalog (`readJson` rejection with `err.code === "ENOENT"`) from a corrupt catalog (any other rejection, including JSON parse errors). On `ENOENT` the operation MUST proceed against an empty catalog (existing behavior). On any other error it MUST return `{ ok: false, error: { code: "VBA_CATALOG_CORRUPT" } }`, MUST NOT call `fileSystem.writeFile`, and MUST NOT mutate the on-disk catalog.

#### Scenario: ENOENT keeps empty-catalog behavior
- GIVEN a `FormFileSystemPort` whose `readJson` rejects with an error whose `code === "ENOENT"`
- WHEN `catalogAddControl` runs with `apply: true`
- THEN it MUST return `{ ok: true, ... }` with the new control appended to an empty catalog
- AND `fileSystem.writeFile` MUST be called exactly once with the new JSON

#### Scenario: corrupt catalog refuses and does NOT write
- GIVEN a `FormFileSystemPort` whose `readJson` rejects with any error whose `code !== "ENOENT"` (e.g. `new Error("Invalid JSON file: <path>")` from a JSON parse failure)
- WHEN `catalogAddControl` runs with `apply: true`
- THEN it MUST return `{ ok: false }` with `error.code === "VBA_CATALOG_CORRUPT"`
- AND `fileSystem.writeFile` MUST NOT be called

#### Scenario: corrupt catalog in dry-run also refuses (no write either way)
- GIVEN the same corrupt-`readJson` port as the previous scenario
- WHEN `catalogAddControl` runs with `dryRun: true`
- THEN it MUST return `{ ok: false }` with `error.code === "VBA_CATALOG_CORRUPT"`
- AND `fileSystem.writeFile` MUST NOT be called (corruption check precedes the dry-run branch, matching `generateForm` dryRun/apply parity)

#### Scenario: missing catalog with dryRun returns success without writing
- GIVEN a `readJson` rejection with `code === "ENOENT"`
- WHEN `catalogAddControl` runs with `dryRun: true`
- THEN it MUST return `{ ok: true, dryRun: true, written: false, ... }`
- AND `fileSystem.writeFile` MUST NOT be called (dry-run parity with `generateForm`)

**Test surface**: `VbaFormService.catalogAddControl` in `src/core/services/vba-form-service.ts:193-201`; the catch arm MUST branch on `isMissingPathError(err)` (already defined at line 332). **The pinning test at `test/core/services/vba-form-service.test.ts:814` MUST be SPLIT, not just augmented**:

- Keep (rename): `it("catalogAddControl uses empty catalog when readJson rejects with ENOENT")` — mock `readJson.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }))` (or carry `code: "ENOENT"` on the rejected Error). Happy path. Asserts `writeFile` called once with the new catalog JSON.
- Add (RED): `it("catalogAddControl returns VBA_CATALOG_CORRUPT when readJson rejects with a non-ENOENT error and does not write")` — mock `readJson.mockRejectedValue(new Error("Invalid JSON file: /path/catalog.json"))`; asserts `result.ok === false`, `error.code === "VBA_CATALOG_CORRUPT"`, and `fs.writeFile` was NOT called.

The existing test at line 841 (`VBA_CATALOG_WRITE_FAILED` when `writeFile` rejects) MUST stay green; the new read-arm gate runs BEFORE the write arm.

Both ports (`FormFileSystemPort`) used in the fake-port suite already expose `readJson` and `writeFile`; no port-shape change is required.
