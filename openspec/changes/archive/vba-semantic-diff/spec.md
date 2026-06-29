# Delta Spec: vba-semantic-diff

## Purpose

Replace the flat byte-exact `different` bucket in `verify_binary` / `verify_code` / `reconcile_binary`
with a semantic classification engine. Consumers MUST be able to distinguish actionable module
differences (requiring import, export, or manual merge) from pure serialization, whitespace,
attribute-header, or encoding noise without performing a manual temp export.

---

## ADDED Requirements

### Requirement: Classification Taxonomy

The classifier MUST assign exactly one of eight categories to each differing module pair:
`matched`, `whitespaceOnly`, `attributeOnly`, `formSerializationOnly`, `encodingOnly`,
`sourceNewer`, `binaryNewer`, `bothChanged`.

The five non-functional categories (`whitespaceOnly`, `attributeOnly`, `formSerializationOnly`,
`encodingOnly`, `matched`) MUST map to `recommendation: no_action`. Functional categories
(`sourceNewer`, `binaryNewer`, `bothChanged`) MUST map to `import_to_binary`, `export_to_src`,
and `manual_merge` respectively.

`NameMap` sections in `.form.txt` files MUST NOT be stripped; they are functional. Only these
seven sections are serialization noise: `Checksum`, `PrtDevMode`, `PrtDevModeW`, `PrtDevNames`,
`PrtDevNamesW`, `PrtMip`, `RecSrcDt`.

`VB_Name` changes MUST NOT be classified as `attributeOnly`; a name change is a functional rename.

#### Scenario: whitespaceOnly — CRLF and trailing whitespace

- GIVEN two versions of a `.bas` file whose content is identical except for CRLF vs. LF line endings and trailing spaces
- WHEN the classifier compares source text against binary text
- THEN classification is `whitespaceOnly`
- AND recommendation is `no_action`
- AND `srcUniqueFunctionalLines` is 0 and `binaryUniqueFunctionalLines` is 0

#### Scenario: attributeOnly — VB_ header differs, code identical

- GIVEN two versions of a `.cls` file where only `Attribute VB_Description` differs
- WHEN the classifier compares source text against binary text
- THEN classification is `attributeOnly`
- AND recommendation is `no_action`

#### Scenario: VB_Name change is functional

- GIVEN two `.cls` files that differ ONLY in the `Attribute VB_Name` line
- WHEN the classifier compares source text against binary text
- THEN classification is NOT `attributeOnly`
- AND `srcUniqueFunctionalLines` OR `binaryUniqueFunctionalLines` is greater than 0

#### Scenario: formSerializationOnly — printer/checksum noise only

- GIVEN a `.form.txt` file where binary differs from source only in `Checksum`, `PrtDevMode`, and `PrtMip` sections
- WHEN the classifier compares source text against binary text
- THEN classification is `formSerializationOnly`
- AND recommendation is `no_action`

#### Scenario: NameMap is functional, not stripped

- GIVEN a `.form.txt` file where binary differs from source only in the `NameMap` section
- WHEN the classifier compares source text against binary text
- THEN classification is NOT `formSerializationOnly`
- AND `srcUniqueFunctionalLines` OR `binaryUniqueFunctionalLines` is greater than 0

#### Scenario: encodingOnly — mojibake normalization

- GIVEN source text and binary text that differ solely due to Latin-1/UTF-8 double-encoding (mojibake)
- WHEN the classifier normalizes both texts and recompares
- THEN classification is `encodingOnly`
- AND recommendation is `no_action`

#### Scenario: encodingOnly safe-failure (still differs after normalization)

- GIVEN source text and binary text where normalization does not resolve the difference
- WHEN the classifier normalizes both texts and recompares
- THEN the pair MUST NOT be classified as `encodingOnly`
- AND the pair MUST be classified as a functional category based on symmetric diff

---

### Requirement: Directionality from Symmetric Functional-Line Diff

The classifier MUST derive directionality ONLY from the symmetric diff of functional lines
(`srcUniqueFunctionalLines`, `binaryUniqueFunctionalLines`). Directionality MUST NOT rely
on file modification times or a base snapshot.

| srcUnique > 0 | binaryUnique > 0 | Category       | Recommendation    |
|---------------|------------------|----------------|-------------------|
| yes           | no               | `sourceNewer`  | `import_to_binary` |
| no            | yes              | `binaryNewer`  | `export_to_src`   |
| yes           | yes              | `bothChanged`  | `manual_merge`    |
| no            | no               | non-functional | `no_action`       |

#### Scenario: sourceNewer — lines added only in source

- GIVEN a `.bas` file where source has three additional functional lines absent from the binary version
- WHEN the classifier computes the symmetric diff
- THEN `srcUniqueFunctionalLines` is 3, `binaryUniqueFunctionalLines` is 0
- AND classification is `sourceNewer`, recommendation is `import_to_binary`

#### Scenario: binaryNewer — lines added only in binary

- GIVEN a `.bas` file where binary has two additional functional lines absent from source
- WHEN the classifier computes the symmetric diff
- THEN `binaryUniqueFunctionalLines` is 2, `srcUniqueFunctionalLines` is 0
- AND classification is `binaryNewer`, recommendation is `export_to_src`

#### Scenario: bothChanged — lines unique on both sides

- GIVEN a module where source has one unique functional line and binary has a different unique functional line
- WHEN the classifier computes the symmetric diff
- THEN `srcUniqueFunctionalLines` is 1, `binaryUniqueFunctionalLines` is 1
- AND classification is `bothChanged`, recommendation is `manual_merge`

---

### Requirement: Additive Backward-Compatible Result Contract

`VbaVerifyResult` MUST retain all existing fields: `operation`, `ok`, `dryRun`,
`willModifyAccess`, `sourceRoot`, `matched[]`, `different[]`, `missingInSource[]`,
`missingInBinary[]`, `diffs[]`. These fields MUST keep their current meaning.

The following additive fields MUST be present on the result when semantic mode is active:

| Field | Type | Invariant |
|-------|------|-----------|
| `summary` | `Record<Category, number>` | Counts across all 8 categories |
| `actionableDifferent[]` | string[] | Modules with category `sourceNewer`, `binaryNewer`, or `bothChanged` |
| `nonActionableDifferent[]` | string[] | Modules with non-functional category |
| `hasFunctionalDifferences` | boolean | `true` iff `actionableDifferent.length > 0` |
| `actionableOk` | boolean | `true` iff `actionableDifferent.length === 0 && missingInSource.length === 0 && missingInBinary.length === 0` |

Each entry in `diffs[]` MUST carry these additive per-diff fields in semantic mode:
`classification`, `reason` (human-readable string), `srcUniqueFunctionalLines` (number),
`binaryUniqueFunctionalLines` (number), `recommendation`.

`ok` MAY remain `false` whenever any difference (including non-functional) exists.
Consumers that need the actionability signal MUST use `actionableOk` / `hasFunctionalDifferences`,
not `ok` / `different[]`.

#### Scenario: backward-compatible JSON serialization

- GIVEN an existing consumer that calls `verify_binary` and uses `JSON.stringify(result)`
- WHEN semantic mode is active and the result is serialized
- THEN the JSON output contains all previously existing fields with their prior meanings intact
- AND the JSON output also contains the new additive fields
- AND no previously existing field is absent, renamed, or changed in type

#### Scenario: actionableDifferent and nonActionableDifferent are disjoint

- GIVEN a verify_binary result containing modules across multiple categories
- WHEN the result is returned
- THEN the union of `actionableDifferent` and `nonActionableDifferent` equals `different[]`
- AND `actionableDifferent` ∩ `nonActionableDifferent` is empty

---

### Requirement: Semantic Mode as Default, Strict Mode as Opt-In

`verify_binary`, `verify_code`, and `reconcile_binary` MUST run in semantic mode by default.
Callers MAY pass a `strict` flag to restore byte/text-exact comparison. In `strict` mode the
additive semantic fields MUST be omitted or empty and the result MUST reproduce the byte-exact
behavior of the current implementation.

`reconcile_binary` recommendations in semantic mode MUST derive from per-module
`recommendation` values from the classifier, not from the flat `different[]` bucket.

#### Scenario: semantic is default

- GIVEN a caller invokes `verify_binary` without passing any mode flag
- WHEN two modules differ only in `Attribute VB_*` headers
- THEN both modules appear in `nonActionableDifferent[]`
- AND `hasFunctionalDifferences` is `false`
- AND `actionableOk` is `true` (assuming no missing modules)

#### Scenario: strict mode restores byte-exact behavior

- GIVEN a caller invokes `verify_binary` with `strict: true`
- WHEN two modules differ only in `Attribute VB_*` headers
- THEN the modules appear in `different[]` as before
- AND `actionableDifferent`, `nonActionableDifferent`, `hasFunctionalDifferences`, `actionableOk` are absent or empty
- AND behavior is identical to the pre-change implementation

---

### Requirement: 173-Module Acceptance Gate

When verify_binary processes a source tree where 173 modules differ from the binary but
only 7 carry functional differences, the result MUST separate the actionable from the non-actionable.

#### Scenario: 173-module real-case separation

- GIVEN a source tree of 173 modules that differ from the binary, where 159 differ only in whitespace, attribute headers, form serialization noise, or encoding, and 7 differ in functional lines (3 `sourceNewer`, 4 `bothChanged`)
- WHEN `verify_binary` runs in semantic mode (default)
- THEN `actionableDifferent` contains exactly 7 module names
- AND `nonActionableDifferent` contains exactly 159 module names (or more, based on actual noise counts)
- AND `hasFunctionalDifferences` is `true`
- AND `summary.sourceNewer` is 3
- AND `summary.bothChanged` is 4
- AND `different[]` still contains all 173 module names (backward compat)

---

### Requirement: compare_module MCP Tool

The system MUST expose a new MCP-only tool `compare_module` that classifies a single named
module semantically without requiring a manual temp export. `compare_module` MUST NOT be
exposed via HTTP or CLI.

The tool MUST be registered in all five required surfaces: `mcp-tool-registry`,
`tool-parity-registry`, `dispatch-routes`, `vba-sync-schemas`, `VbaModulesAdapter`.
A missing registration in any of these five surfaces constitutes an incomplete implementation.

The tool MUST return the same per-module classification shape as the per-diff entries in
`verify_binary`: `classification`, `reason`, `srcUniqueFunctionalLines`,
`binaryUniqueFunctionalLines`, `recommendation`.

The tool MUST support `--moduleName <Name>` as a required parameter and a `--strict` flag
that reverts to byte-exact comparison for that single module.

#### Scenario: single-module semantic classification

- GIVEN an active session and a module named `ModUtilities` that differs only in `Attribute VB_*` headers
- WHEN `compare_module --moduleName ModUtilities` is called via MCP
- THEN the response contains `classification: "attributeOnly"`, `recommendation: "no_action"`
- AND `srcUniqueFunctionalLines` is 0, `binaryUniqueFunctionalLines` is 0

#### Scenario: compare_module mirrors verify_binary classification

- GIVEN a module `ModCalculos` where source has two additional functional lines vs. the binary
- WHEN `compare_module --moduleName ModCalculos` is called AND `verify_binary` is also called for the full tree
- THEN both responses agree on `classification: "sourceNewer"` and `recommendation: "import_to_binary"` for `ModCalculos`

#### Scenario: compare_module strict mode

- GIVEN a module that differs only in `Attribute VB_*` headers
- WHEN `compare_module --moduleName <Name> --strict` is called
- THEN the response does NOT contain the additive semantic fields
- AND the module is reported as different (byte-exact behavior)

#### Scenario: missing registration causes known error

- GIVEN `compare_module` is not registered in `dispatch-routes`
- WHEN an MCP client calls `compare_module`
- THEN the response returns `MCP_SERVICE_UNAVAILABLE` or `TOOL_NOT_IMPLEMENTED`
- AND the error is NOT a silent empty result

---

### Requirement: Acceptance Gates (CI + E2E)

The change MUST pass all four mandatory gates before it is considered complete:

1. `pnpm test` — unit/spec suite green, including new classifier unit tests written at the
   `ComparisonFileSystemPort` / pure-function seam (strict TDD: tests written before implementation).
2. `pnpm build` — TypeScript compilation produces no errors.
3. `pnpm lint` — Biome linter reports no violations.
4. `node E2E_testing/mcp-e2e.mjs` — real MCP E2E green, with `DYSFLOW_E2E_COMMAND` pointed at
   an isolated `test-runtime/` build. The production runtime at `%LOCALAPPDATA%\dysflow` MUST NOT
   be modified or read by tests.

New E2E test coverage for the semantic classification path MUST be added to `E2E_testing/mcp-e2e.mjs`.

The classifier domain service MUST have zero adapter dependencies; it MUST be testable
without PowerShell, COM, or filesystem access. Unit tests MUST mock only I/O adapters,
never internal call order or private data shapes.

#### Scenario: unit tests pass without Access COM

- GIVEN the classifier is a pure domain service
- WHEN `pnpm test` runs in a CI environment without Microsoft Access installed
- THEN all classifier unit tests pass
- AND no test asserts on internal call order or private fields

#### Scenario: E2E uses isolated test-runtime

- GIVEN `DYSFLOW_E2E_COMMAND` points to an isolated `test-runtime/` build
- WHEN `node E2E_testing/mcp-e2e.mjs` runs
- THEN `%LOCALAPPDATA%\dysflow` is never accessed or modified
- AND the E2E suite exercises at least one semantic classification scenario

---

## MODIFIED Requirements

### Requirement: verify_binary / verify_code Comparison Mode

`verify_binary` and `verify_code` MUST compare source and binary VBA content using semantic
classification by default. The comparison MUST classify each differing module using the
eight-category taxonomy and derive directionality from the symmetric functional-line diff.
(Previously: comparison was byte/text-exact; all differing modules landed in one flat `different[]` bucket.)

#### Scenario: semantic default replaces byte-exact

- GIVEN source and binary that differ only in non-functional ways (whitespace, attributes, form noise)
- WHEN `verify_binary` runs without a mode flag
- THEN `different[]` contains the module names (backward compat)
- AND `hasFunctionalDifferences` is `false`
- AND the existing `ok` field value is preserved under its current semantics

#### Scenario: strict flag restores prior behavior

- GIVEN source and binary that differ only in `Attribute VB_*` headers
- WHEN `verify_binary` is called with `strict: true`
- THEN the result is identical to the pre-change byte-exact result
- AND no semantic additive fields appear

---

## Non-Goals (Out of Scope for this Change)

- Deep `.form.txt` form-property AST parsing (v2).
- Base-snapshot or mtime-based directionality.
- `NameMap` stripping (it is functional).
- HTTP or CLI exposure of `compare_module`.
- Changes to the PowerShell export path or `fix_encoding` PS1 action.
