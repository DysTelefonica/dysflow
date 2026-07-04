# access-core-services Specification

## Purpose

Provide Access/VBA/query services behind a safe PowerShell runner boundary and propagate real-time progress.

## Requirements

### Requirement: Runner Boundary

The system MUST execute Access-related work only through a bounded runner interface with timeouts and sanitized outputs. Services MUST also propagate any optional `onProgress` callback from their caller to the runner without modification.

#### Scenario: Service calls runner
- GIVEN a valid Access operation request
- WHEN a core service executes it
- THEN it SHALL call the runner boundary
- AND return a protocol-neutral result

#### Scenario: Runner timeout
- GIVEN a runner exceeds its timeout
- WHEN the service handles completion
- THEN it MUST return a timeout error

#### Scenario: Seam refactor preserves behavior
- GIVEN characterization coverage exists for a sync path
- WHEN a seam refactor is applied
- THEN observable runner calls and protocol-neutral results MUST remain equivalent

#### Scenario: Untested path blocks refactor
- GIVEN a sync path lacks characterization coverage
- WHEN decomposition is proposed
- THEN implementation MUST add coverage before changing the path

### Requirement: VBA Sync Adapter Characterization

The system MUST characterize `VbaSyncAdapter` behavior before introducing seams or decomposition.

### Requirement: Progress Callback Forwarding

`VbaService` and `QueryService` MUST accept an optional `onProgress` callback from their caller context and MUST forward it unchanged to the underlying runner call. Neither service MAY alter, wrap, or suppress the callback before forwarding.

When the caller does not supply `onProgress`, the service MUST call the runner without an `onProgress` option, preserving the original call contract.

#### Scenario: vba-service forwards onProgress to runner
- GIVEN a `vba-service` execute call with `onProgress` provided in the service options
- WHEN the service invokes the runner
- THEN the runner MUST receive the same `onProgress` reference
- AND progress callbacks fired by the runner MUST reach the original caller

#### Scenario: query-service forwards onProgress to runner
- GIVEN a `query-service` execute call with `onProgress` provided in the service options
- WHEN the service invokes the runner
- THEN the runner MUST receive the same `onProgress` reference
- AND progress callbacks fired by the runner MUST reach the original caller

#### Scenario: Service called without onProgress
- GIVEN a service execute call with no `onProgress` in options
- WHEN the service invokes the runner
- THEN the runner MUST be called without an `onProgress` option
- AND the service result MUST be identical to its pre-change behavior

### Requirement: VBA Form Service Module

`src/core/services/vba-form-service.ts` MUST own the operations `validateFormSpec`, `generateForm`, `catalogAddControl`, `harvestFormCatalog`, and `resolveFormSpec`. These functions MUST be exported from this module.

#### Scenario: Form operations importable from vba-form-service
- GIVEN a consumer that needs `validateFormSpec` or `generateForm`
- WHEN they import
- THEN the symbol MUST be resolvable from `vba-form-service.ts`

#### Scenario: Not duplicated in vba-sync-adapter
- GIVEN `vba-sync-adapter.ts`
- WHEN it needs a form operation
- THEN it MUST import from `vba-form-service.ts`, not reimplement it

### Requirement: VBA Source Comparison Module

`src/core/services/vba-source-comparison.ts` MUST own the operations `compareSourceAgainstBinary`, `compareVbaSourceTrees`, and `collectVbaSourceFiles`. These functions MUST be exported from this module.

#### Scenario: Comparison operations importable from vba-source-comparison
- GIVEN a consumer that needs `compareSourceAgainstBinary`
- WHEN they import
- THEN the symbol MUST be resolvable from `vba-source-comparison.ts`

### Requirement: VBA Sync Adapter Public API Preserved

`VbaSyncAdapter` MUST retain its existing public API. Callers MUST require no import path or signature changes after the split.
(Previously: the service contained all form and comparison logic inline; now it delegates.)

#### Scenario: Public API unchanged
- GIVEN existing call sites for `VbaSyncAdapter`
- WHEN the split lands
- THEN all call sites MUST compile and pass tests without modification

#### Scenario: Delegation to sub-modules
- GIVEN the service receives a form-related operation
- WHEN it executes
- THEN it MUST delegate to `vba-form-service.ts` — not contain inline form logic

### Requirement: Form Template Cloning Service

The system MUST provide a protocol-neutral service that clones an existing source form into a new target form by applying a caller-supplied token map to the source layout text. Token replacement scope MUST be limited to the source layout (`.form.txt`) content only (OQ1: code-behind `.cls` token replacement is a non-goal for this slice). The service MUST preserve the source form's opaque serialization data so the cloned target satisfies the `serializeFormTxt` round-trip property: a manual clone-and-replace on the same source MUST be byte-equivalent to the service result, with no metadata loss.

The service resolves source and target locations against the project's canonical form source location (OQ2: bench-cache-first vs project-root-first resolution is deferred to design).

#### Scenario: Clone preserves round-trip byte-equivalence
- GIVEN a source form and a token map whose keys all appear in the source
- WHEN the clone-from-template operation runs
- THEN the service MUST return a target form whose serialized layout is byte-equivalent to a manual clone-and-replace on the same source
- AND opaque serialization metadata (Checksum, PrtDevMode, Format bytes) MUST remain preserved

#### Scenario: Token replacement never touches preserved metadata
- GIVEN a source form where a token appears on a section that also holds `PrtDevMode`
- WHEN the operation applies the token map
- THEN replacement MUST occur only in user-modifiable layout strings
- AND the preserved metadata bytes MUST remain byte-equivalent

### Requirement: Token Map Application Policy

Tokens MUST use the `{{Token}}` syntax by default (OQ3). When a token is present in the source but absent from the token map, the service MUST leave the token verbatim, emit a structured per-token warning, and still return success — the `warn-pass-through` policy (OQ4). When the caller passes strict token-map enforcement, an unmapped source token MUST cause a typed error and MUST NOT write a target form. An invalid token map MUST fail with a typed, actionable error.

#### Scenario: All tokens mapped
- GIVEN a source form and a token map covering every source token
- WHEN the operation runs
- THEN every token MUST be replaced with its mapped value
- AND the result MUST report no missing-token warnings

#### Scenario: Missing token warns and passes through
- GIVEN a source token that has no entry in the token map
- WHEN the operation runs without strict enforcement
- THEN the token MUST be left verbatim in the target
- AND the result MUST include a structured warning naming the missing token
- AND the operation MUST still return success

#### Scenario: Strict enforcement rejects missing token
- GIVEN a source token absent from the token map
- WHEN the operation runs with strict token-map enforcement enabled
- THEN it MUST return a typed error
- AND no target form MUST be written

#### Scenario: Invalid token map is rejected
- GIVEN a token map with a non-string key or value, malformed token syntax, or an empty token key
- WHEN the operation validates the map
- THEN it MUST return a typed error with an actionable message
- AND no target form MUST be written

### Requirement: Target Form Existence Policy

When the target form already exists, the service MUST reject the operation by default (OQ5). The caller MAY request overwrite; when overwrite is requested, the service MUST replace the existing target through the gated restore path so a failed load restores prior state.

#### Scenario: Absent target is created
- GIVEN a target form that does not yet exist
- WHEN the clone operation runs
- THEN the service MUST create the target from the token-replaced source

#### Scenario: Existing target without overwrite is rejected
- GIVEN a target form that already exists
- WHEN the clone operation runs without an overwrite request
- THEN it MUST return a typed error
- AND it MUST NOT modify the existing target

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

### Requirement: Shared FORM_NOISE_KEYS identity

`FORM_NOISE_KEYS` MUST be defined exactly once in
`src/core/services/form-noise-keys.ts` and exported as
`ReadonlySet<string>`. `src/core/services/form-ir-compare-service.ts`
and `src/core/services/vba-semantic-classifier.ts` MUST import from
the shared module and MUST NOT redeclare locally. The LOCKED comment
that warned future contributors to update both files MUST be removed.

#### Scenario: Both consumers reference the same Set identity

- **GIVEN** `form-noise-keys.ts` exports `FORM_NOISE_KEYS`
- **WHEN** the two consumers import it
- **THEN** `Object.is(consumerA.FORM_NOISE_KEYS, consumerB.FORM_NOISE_KEYS)`
  MUST be `true`
- **AND** neither file declares a local `FORM_NOISE_KEYS`

#### Scenario: Membership preserved byte-for-byte (regression)

- **GIVEN** the shared constant
- **WHEN** its size and contents are enumerated
- **THEN** it MUST contain exactly 14 keys in this order: `Checksum`,
  `PrtDevMode`, `PrtDevModeW`, `PrtDevNames`, `PrtDevNamesW`, `PrtMip`,
  `RecSrcDt`, `LayoutCachedLeft`, `LayoutCachedTop`,
  `LayoutCachedWidth`, `LayoutCachedHeight`, `PublishOption`,
  `NoSaveCTIWhenDisabled`, `NameMap`

#### Scenario: Set is read-only at the boundary (edge)

- **GIVEN** a consumer holds the shared set reference
- **WHEN** the consumer calls `.add`, `.delete`, or `.clear`
- **THEN** TypeScript MUST reject the call (`ReadonlySet<string>`)
- **AND** the underlying set's size MUST remain unchanged

#### Scenario: LOCKED comment drift is removed

- **GIVEN** both files previously held a LOCKED warning
- **WHEN** inspected
- **THEN** the LOCKED comments MUST be gone

### Requirement: form-lint ListBox.ColumnWidths redundant guard removed

The redundant guard at `src/core/services/form-lint.ts:520-522` (returns
`null`, immediately above the default `return null` at line 523) MUST be
removed. The intent ("ColumnWidths is supported, do not warn") MUST
survive as a JSDoc above the function. Observable behavior is unchanged.

(Audit finding #E: reachable but redundant, not unreachable.)

#### Scenario: ListBox.ColumnWidths still returns no warning (regression)

- **GIVEN** a `.cls` containing `Me.MyListBox.ColumnWidths = "10cm"`
- **WHEN** `formLint.lintFormCode(...)` runs
- **THEN** the result MUST NOT include a warning targeting
  `ListBox.ColumnWidths`

#### Scenario: guard site is gone (structural)

- **GIVEN** `src/core/services/form-lint.ts` lines 515-525
- **WHEN** read after the refactor
- **THEN** the explicit `if (type === "ListBox" && prop === "ColumnWidths")
  { return null; }` block MUST NOT exist
- **AND** a JSDoc MUST remain documenting ColumnWidths as supported

#### Scenario: other access property rules still fire (regression)

- **GIVEN** an unrelated lint violation in the input
- **WHEN** the linter runs
- **THEN** the unrelated warning MUST still appear

### Requirement: Hexagonal FS port for FileAccessOperationRegistry

`FileAccessOperationRegistry` MUST depend on an injected
`RegistryFileSystemPort`. The Node.js implementation MUST live at
`src/adapters/operations/node-registry-file-system.ts`. The registry file
MUST NOT import `node:fs/promises` (audit named the file
`file-access-operation-registry.ts`; the actual file is
`access-operation-registry.ts:2,146`).

#### Scenario: Constructor accepts port injection (happy)

- **GIVEN** `new FileAccessOperationRegistry({ ..., fileSystem: fakePort })`
- **WHEN** a read/write/rename/stat/rm/mkdir cycle runs
- **THEN** every FS call MUST route through `fakePort`
- **AND** `fakePort.calls.length` MUST equal the expected count

#### Scenario: Default factory wires the Node adapter (sad)

- **GIVEN** `createFileAccessOperationRegistry()` with no arguments
- **THEN** it MUST inject the Node adapter at the documented path
- **AND** production behavior MUST be byte-equivalent to pre-refactor

#### Scenario: Core no longer imports `node:fs/promises` (adversarial)

- **WHEN** the registry file's imports are scanned
- **THEN** it MUST NOT contain any `node:*` import
- **AND** the only FS symbol MUST be the injected port

#### Scenario: Failing fake port surfaces typed error

- **GIVEN** `fakePort.readFile` rejects with `Error("EACCES")`
- **WHEN** the registry loads a record
- **THEN** `OperationResult` MUST carry the typed rejection unchanged
- **AND** no real FS call MUST be attempted

### Requirement: Hexagonal FS port for VbaFormService default

`VbaFormService` already accepts an injected `FormFileSystemPort` via
`VbaFormServiceOptions.fileSystem`. The DEFAULT Node.js implementation
MUST live in `src/adapters/services/node-form-file-system.ts`. The class
MUST NOT declare a default `nodeFileSystem` constant and MUST NOT import
`node:fs/promises`. (Mirror of `cross-process-lock.ts` →
`node-lock-file-system.ts`, commit `6ac0af1`.)

#### Scenario: Default factory wires the Node adapter (happy)

- **GIVEN** `createVbaFormService()` with no arguments
- **THEN** it MUST inject the Node adapter at the documented path
- **AND** observable file-creation behavior MUST match pre-refactor

#### Scenario: VbaFormService.ts no longer imports `node:fs/promises`

- **WHEN** the service file's imports are scanned
- **THEN** it MUST NOT import from `node:fs/promises`
- **AND** no `const nodeFileSystem` MUST appear

#### Scenario: Test injection path still works (regression)

- **GIVEN** existing tests construct
  `new VbaFormService({ ..., fileSystem: fake })`
- **THEN** every existing test in
  `test/core/services/vba-form-service.test.ts` MUST remain GREEN
  — the refactor is opaque to the test surface
