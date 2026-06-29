# Spec — `compare_form` (source-vs-source drift)

> Part of SDD change `forms-ui-factory-slice-2` (closes issue **#597**, consumer
> half of #563). Source: this spec is the contract;
> `src/core/services/form-ir-compare-service.ts` and
> `src/adapters/vba-sync/vba-forms-adapter.ts` are the implementation.
> Behaviour-first tests in
> `test/core/services/form-ir-compare.test.ts` and
> `test/adapters/vba-sync/vba-forms-adapter-compare.test.ts` lock the contract.

## Purpose

`compare_form` is the **compare** path into the Form IR. It accepts two
version-controlled `.form.txt` paths (left/source + right/target) and returns a
structured drift report describing how the two forms differ at the IR level:
added controls, removed controls, per-property changes, and layout-bound
changes. Each drift item carries an actionability flag so that an AI agent can
keep actionable differences (Caption, Name, layout, source/target control
add/remove) separate from the noise floor (`Checksum`, `PrtDevMode*`,
`PrtDevNames*`, `PrtMip`, `RecSrcDt`, `LayoutCached*`, `PublishOption`,
`NoSaveCTIWhenDisabled`, `NameMap`).

`compare_form` is **source-only**. It MUST NOT invoke Access, MUST NOT call
`LoadFromText` or `SaveAsText`, and MUST NOT need a running `MSACCESS.EXE`
process. It reads both files via the existing injectable `FormFileSystemPort`
and parses both via the existing pure `parseFormTxt` (slice 1), then runs a
pure IR-level diff (`compareForms`).

## Requirements

| # | Requirement                                                                              | Strength |
|---|------------------------------------------------------------------------------------------|----------|
| 1 | Two input paths: `sourcePath` (left) + `targetPath` (right), each absolute or project-root-relative | MUST     |
| 2 | Pure IR diff: no Access COM, no PowerShell                                                | MUST     |
| 3 | Returns `{ matched, driftDetected, actionableOk, drifts[] }`                             | MUST     |
| 4 | Reports `controlAdded` for every control present in target but not in source             | MUST     |
| 5 | Reports `controlRemoved` for every control present in source but not in target           | MUST     |
| 6 | Reports `propertyChanged` per (control, key, oldValue, newValue) for differing scalars   | MUST     |
| 7 | Reports `layoutBoundsChanged` when `Left`/`Top`/`Width`/`Height` differ on a same-named control | MUST  |
| 8 | Each drift carries `actionable: boolean` + `reason: string`                             | MUST     |
| 9 | Property changes whose key is in `FORM_NOISE_KEYS` are classified `actionable: false`   | MUST     |
| 10| `matched` is `true` iff zero actionable drift; `driftDetected` iff any drift at all    | MUST     |
| 11| `path` aliases are accepted for parity                                                    | MUST     |
| 12| Missing `sourcePath` returns typed `FORM_SPEC_MISSING`                                  | MUST     |
| 13| Missing `targetPath` returns typed `FORM_SPEC_MISSING`                                  | MUST     |
| 14| Filesystem read failure on either side returns typed `FORM_NOT_FOUND`                   | MUST     |
| 15| Malformed text on either side returns typed `FORM_PARSE_ERROR`                          | MUST     |
| 16| Read-only — `writeFile` port is never invoked                                            | MUST     |
| 17| Identical sources (modulo known noise) yield empty `drifts[]` + `matched: true`        | MUST     |
| 18| Duplicate-key scalars are compared by key, not index                                     | MUST     |

---

### Requirement: Two input paths, source-only, no Access COM

`compare_form` MUST accept `sourcePath` (left) and `targetPath` (right). Each
MUST accept an absolute path, or a path relative to the project source root.
The adapter MUST read both files via the existing `FormFileSystemPort` and
parse both via the existing pure `parseFormTxt`. It MUST NOT call
`resolveExecutionTarget`, `validateStrictContext`, or any PowerShell / Access
runner. The orchestrator methods that gate Access execution MUST NOT be invoked
for any `compare_form` call.

`path` is accepted as an alias for `sourcePath` and for `targetPath`
(`targetPath` may also be passed as `path` when `sourcePath` is set explicitly;
binding is positional: `sourcePath` ← params.sourcePath ?? params.pathA, and
`targetPath` ← params.targetPath ?? params.pathB is NOT used — instead,
`compare_form` accepts `sourcePath`/`path` for the left side and `targetPath`/
`path` for the right side, where the right side may also be supplied as the
alias `target`).

#### Scenario: Reads both `.form.txt` files and returns a drift report

- GIVEN two valid `.form.txt` paths.
- WHEN `compare_form` is called.
- THEN the result MUST include `matched`, `driftDetected`, `actionableOk`, and
  a `drifts` array.

---

### Requirement: Reports added/removed controls

`compare_form` MUST emit one `controlAdded` drift per control whose scalar
`Name` (with surrounding quotes stripped, if any) appears in the right `FormIR`
walk but not in the left. It MUST emit one `controlRemoved` drift per control
whose scalar `Name` appears in the left but not in the right. Both kinds are
`actionable: true` (a control add/remove is always user-visible). The `kind`
field MUST be exactly `"controlAdded"` or `"controlRemoved"`; the `controlName`
field MUST be the un-quoted control name.

#### Scenario: One control added in target

- GIVEN a left form containing `[A, B]` and a right form containing `[A, B, C]`
  (same prefixes, `C` is new).
- WHEN `compare_form` is called.
- THEN `drifts` MUST contain exactly one `controlAdded` drift with
  `controlName === "C"` and `actionable: true`. `drifts` MUST NOT contain a
  drift with `kind === "controlRemoved"`.

#### Scenario: One control removed in target

- GIVEN a left form containing `[A, B, C]` and a right form containing
  `[A, B]`.
- WHEN `compare_form` is called.
- THEN `drifts` MUST contain exactly one `controlRemoved` drift with
  `controlName === "C"` and `actionable: true`. `drifts` MUST NOT contain a
  drift with `kind === "controlAdded"`.

---

### Requirement: Reports per-property changes on same-named controls

For every control whose scalar `Name` is present in both left and right,
`compare_form` MUST walk each side's scalar entries (in document order,
collapsing duplicates by key) and emit one `propertyChanged` drift per
(key, oldValue, newValue) triple whose trimmed values differ. The `key` field
MUST be the property name (no surrounding quotes); the `oldValue` and
`newValue` fields MUST be the trimmed scalar values.

Actionability MUST be `false` iff `key` is in `FORM_NOISE_KEYS` (= the same
canonical set as `vba-semantic-classifier.ts` —
`Checksum`, `PrtDevMode`, `PrtDevModeW`, `PrtDevNames`, `PrtDevNamesW`,
`PrtMip`, `RecSrcDt`, `LayoutCachedLeft`, `LayoutCachedTop`,
`LayoutCachedWidth`, `LayoutCachedHeight`, `PublishOption`,
`NoSaveCTIWhenDisabled`, `NameMap`); otherwise `actionable: true`.

#### Scenario: Caption change on an existing control

- GIVEN two forms whose control `B` has `Caption ="Old"` (left) and
  `Caption ="New"` (right), and all other scalars match.
- WHEN `compare_form` is called.
- THEN `drifts` MUST contain a `propertyChanged` drift with
  `controlName === "B"`, `key === "Caption"`, `oldValue === "Old"`,
  `newValue === "New"`, and `actionable: true`.

#### Scenario: Noise-key property change is non-actionable

- GIVEN two forms whose control `B` has `Checksum =X` (left) and
  `Checksum =Y` (right).
- WHEN `compare_form` is called.
- THEN `drifts` MUST contain a `propertyChanged` drift with
  `controlName === "B"`, `key === "Checksum"`, `oldValue === "X"`,
  `newValue === "Y"`, and `actionable: false`. `reason` MUST mention
  `FORM_NOISE_KEYS`.

---

### Requirement: Reports layout-bounds changes on same-named controls

For every control whose scalar `Name` is present in both left and right,
`compare_form` MUST additionally emit a single `layoutBoundsChanged` drift
when ANY of `Left`, `Top`, `Width`, `Height` differs across the two sides, with
the drift carrying the (oldValue, newValue) for each of those four keys.
`actionable` MUST be `true` for `layoutBoundsChanged` (geometry is always
user-visible).

#### Scenario: Control moved (Left+Top change)

- GIVEN two forms whose control `B` has `Left =100`, `Top =100`, `Width =200`,
  `Height =40` on both sides.
- WHEN the right side changes to `Left =120`, `Top =140`, `Width =200`,
  `Height =40`.
- THEN `drifts` MUST contain a `layoutBoundsChanged` drift with
  `controlName === "B"`, the four old/new pairs, and `actionable: true`.
  `drifts` MUST NOT also emit a separate `propertyChanged` drift for `Left`
  or `Top`.

---

### Requirement: Drift report shape

The result of `compare_form` MUST be an object with:

- `matched: boolean` — `true` iff `drifts` contains zero entries with
  `actionable: true`.
- `driftDetected: boolean` — `true` iff `drifts.length > 0`.
- `actionableOk: boolean` — `true` iff `matched === true`.
- `drifts: FormDrift[]` — the per-item drift list.

The result MUST include the input paths (`sourcePath`, `targetPath`) so a
consumer can correlate the report back to its arguments. The result MUST
include the form names derived from each path (mirror the slice-1
`inspect_form` derivation: strip `Form_`/`Report_` prefix and
`.form.txt`/`.report.txt` suffix).

#### Scenario: Identical sources yield empty drift

- GIVEN two on-disk `.form.txt` files with identical content.
- WHEN `compare_form` is called.
- THEN `matched` MUST be `true`, `drifts` MUST be empty,
  `driftDetected` MUST be `false`, and `actionableOk` MUST be `true`.

#### Scenario: Only non-actionable noise yields `matched: true`

- GIVEN two forms whose only scalar difference is a `Checksum =X` vs
  `Checksum =Y` change.
- WHEN `compare_form` is called.
- THEN `drifts` MUST contain exactly one entry with `actionable: false`. The
  result MUST have `matched: true` (zero actionable drifts), `driftDetected:
  true` (one drift found), and `actionableOk: true` (matches `matched`).

---

### Requirement: Typed error codes

- Missing `sourcePath` (and no `path` alias) MUST return a `failureResult`
  with `error.code === "FORM_SPEC_MISSING"`.
- Missing `targetPath` MUST return a `failureResult` with
  `error.code === "FORM_SPEC_MISSING"`.
- Filesystem read failure on either side (e.g. `ENOENT`) MUST return a
  `failureResult` with `error.code === "FORM_NOT_FOUND"` and a message that
  includes both the offending path and the error.
- A `.form.txt` that fails to parse (e.g. not SaveAsText format) MUST return
  a `failureResult` with `error.code === "FORM_PARSE_ERROR"`.

#### Scenario: ENOENT on left returns FORM_NOT_FOUND

- GIVEN a `sourcePath` that does not exist on disk.
- WHEN `compare_form` is called.
- THEN the result MUST be `ok: false` with `error.code === "FORM_NOT_FOUND"`.

---

### Requirement: Read-only

`compare_form` MUST NOT call `writeFile` on the `FormFileSystemPort`. The tool
is classified as a read-only `vba-sync` tool in the MCP dispatch routes
(`mutatesBinary: false`, no `mutatesFilesystem`). No orchestrator method that
mutates Access state MAY be invoked.

#### Scenario: writeFile is never called

- GIVEN a `FormFileSystemPort.writeFile` spy.
- WHEN `compare_form` is called with two valid `.form.txt` paths.
- THEN the `writeFile` spy MUST NOT have been called.
