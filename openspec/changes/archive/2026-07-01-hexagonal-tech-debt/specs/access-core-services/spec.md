# Delta for access-core-services

Closed by **PR 2** (FORM_NOISE_KEYS shared module + form-lint redundant
guard) AND **PR 4** (FS port injection for `FileAccessOperationRegistry`
+ `VbaFormService`). Both PRs land here because their files
(`form-ir-compare-service.ts`, `vba-semantic-classifier.ts`,
`form-lint.ts`, `access-operation-registry.ts`, `vba-form-service.ts`)
live under this capability.

> Audit-imprecision carried forward: the proposal's "Modified
> Capabilities" mapping omits #B.1 (FORM_NOISE_KEYS) and #E form-lint
> guard. They live here because the affected source files do. Surface to
> the orchestrator in the return envelope.

## ADDED Requirements

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

### Test surface

| Test file | New test name | Class |
|---|---|---|
| `test/core/services/form-ir-compare.test.ts` | `FORM_NOISE_KEYS identity equals shared module reference` | identity |
| `test/core/services/form-ir-compare.test.ts` | `FORM_NOISE_KEYS membership preserved (14 keys)` | regression |
| `test/core/services/vba-semantic-classifier.test.ts` | `FORM_NOISE_KEYS identity equals shared module reference` | identity |
| `test/core/services/form-lint.test.ts` | `ListBox.ColumnWidths returns no warning after guard removed` | regression |
| `test/core/operations/access-operation-registry.test.ts` | `constructor accepts fileSystem port and routes every FS call through it` | happy |
| `test/core/operations/access-operation-registry.test.ts` | `default factory wires Node adapter at the documented path` | sad |
| `test/core/operations/access-operation-registry.test.ts` | `failing fake port surfaces typed Error unchanged` | adversarial |
| `test/core/services/vba-form-service.test.ts` | (existing tests remain GREEN; port extraction is opaque to tests) | regression |
