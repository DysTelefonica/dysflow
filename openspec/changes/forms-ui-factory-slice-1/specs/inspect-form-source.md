# Spec — `inspect_form` (source-only)

> Part of SDD change `forms-ui-factory-slice-1` (closes issue #596). Source: this spec
> is the contract; `src/adapters/vba-sync/vba-forms-adapter.ts` is the implementation.
> Behaviour-first tests in `test/adapters/vba-sync/vba-forms-adapter-inspect.test.ts`
> lock the contract.

## Purpose

`inspect_form` is the read path into the Form IR. It accepts a source `.form.txt`
path on disk (the version-controlled file) and returns a structured JSON payload
suitable for an AI agent: the form's name, kind, control tree (each control with name,
type, scalar properties), and form-level event-procedure names.

`inspect_form` is **source-only**. It MUST NOT invoke Access, MUST NOT call
`LoadFromText` or `SaveAsText`, and MUST NOT need a running `MSACCESS.EXE` process.
It is a pure read of the on-disk text file, routed through the injectable
`FormFileSystemPort` so unit tests can mock the filesystem.

## Requirements

| # | Requirement                                                              | Strength |
|---|--------------------------------------------------------------------------|----------|
| 1 | `inspect_form` reads `.form.txt` from disk, no Access COM               | MUST     |
| 2 | Returns structured `{ name, kind, controls, events }` JSON              | MUST     |
| 3 | Form name derived from the filename (strip `Form_` prefix, `.form.txt` suffix) | MUST |
| 4 | Each control exposes `name`, `type`, and scalar `properties` map        | MUST     |
| 5 | `events` lists form-level property names whose value is `"[Event Procedure]"` | MUST |
| 6 | Missing file returns typed `FORM_NOT_FOUND`                              | MUST     |
| 7 | Missing `sourcePath` parameter returns typed `FORM_SPEC_MISSING`          | MUST     |
| 8 | Malformed text returns typed `FORM_PARSE_ERROR`                          | MUST     |
| 9 | Read-only — `writeFile` port is never invoked                            | MUST     |
| 10| `path` is an accepted alias for `sourcePath`                              | MUST     |

---

### Requirement: Read from disk, no Access COM

`inspect_form` MUST read the version-controlled `.form.txt` from disk via the
injectable `FormFileSystemPort` and parse it with the pure `parseFormTxt` service. It
MUST NOT call `resolveExecutionTarget`, `validateStrictContext`, or any
PowerShell / Access runner. The orchestrator methods that gate Access execution MUST
NOT be invoked for any `inspect_form` call.

#### Scenario: Reads source `.form.txt` and returns IR-shaped JSON

- GIVEN the source path of an `E2E_testing/src/forms/*.form.txt` fixture.
- WHEN `inspect_form` is called.
- THEN the result MUST include `name`, `kind`, a non-empty `controls` array, and a
  `events` array; each control entry MUST have `name`, `type`, and `properties` (an
  object of scalar property values keyed by property name).

---

### Requirement: Form name derived from filename

The form `name` field MUST be derived from the filename by stripping the
`Form_` / `Report_` prefix and the `.form.txt` / `.report.txt` suffix.

#### Scenario: Form name is derived

- GIVEN `sourcePath: "C:/repo/E2E_testing/src/forms/Form_FormComercial.form.txt"`.
- WHEN `inspect_form` is called.
- THEN the result's `name` MUST equal `"FormComercial"`.

---

### Requirement: Controls list with name, type, properties

The `controls` array MUST be a flat list of every `FormNode` in the IR tree that has
a scalar `Name` entry. Each entry MUST expose:

- `name` — the value of the `Name =` scalar, with surrounding quotes stripped if
  present.
- `type` — the node's `blockType` (e.g. `"Label"`, `"TextBox"`, `"Section"`).
- `properties` — an object whose keys are the node's scalar property names and whose
  values are the trimmed scalar values.

Controls MUST be returned in document order (depth-first walk of the `FormNode` tree).

#### Scenario: Controls are discovered recursively

- GIVEN a form with a `Label` named `lblTitulo` and a `TextBox` named `txtNombre`
  under nested `Begin` containers.
- WHEN `inspect_form` is called.
- THEN `result.data.controls` MUST include an entry for `lblTitulo` (type `"Label"`)
  and one for `txtNombre` (type `"TextBox"`), regardless of how deeply nested the
  `Begin` containers are.

---

### Requirement: Events list of form-level event procedures

The `events` array MUST list the keys of every form-level (root) scalar property
whose value contains the substring `"[Event Procedure]"` (the Access convention for
"this form has a handler for this event"). Events nested inside child controls MUST
NOT be included.

#### Scenario: Multiple form-level events are listed

- GIVEN a form with `OnOpen`, `OnClose`, and `OnTimer` set to `"[Event Procedure]"`
  at the root level.
- WHEN `inspect_form` is called.
- THEN `result.data.events` MUST contain all three names.

---

### Requirement: Typed error codes

- Missing `sourcePath` (and no `path` alias) MUST return a `failureResult` with
  `error.code === "FORM_SPEC_MISSING"`.
- Filesystem read failure (e.g. `ENOENT`) MUST return a `failureResult` with
  `error.code === "FORM_NOT_FOUND"`.
- A `.form.txt` that fails to parse (e.g. not SaveAsText format) MUST return a
  `failureResult` with `error.code === "FORM_PARSE_ERROR"`.

#### Scenario: ENOENT returns FORM_NOT_FOUND

- GIVEN a `sourcePath` that does not exist on disk and the `FormFileSystemPort.readFile`
  port rejects with an `ENOENT` error.
- WHEN `inspect_form` is called.
- THEN the result MUST be `ok: false` with `error.code === "FORM_NOT_FOUND"`.

---

### Requirement: Read-only

`inspect_form` MUST NOT call `writeFile` on the `FormFileSystemPort`. The tool is
classified as a read-only `vba-sync` tool in the MCP dispatch routes
(`mutatesBinary: false`, no `mutatesFilesystem`).

#### Scenario: writeFile is never called

- GIVEN a `sourcePath` that exists and a `FormFileSystemPort.writeFile` spy.
- WHEN `inspect_form` is called.
- THEN the `writeFile` spy MUST NOT have been called.

---

### Requirement: `path` is an alias for `sourcePath`

For ergonomic parity with the rest of the dysflow MCP surface, `inspect_form` MUST
accept `path` as an alias for `sourcePath` and resolve either one transparently.

#### Scenario: `path` alias works

- GIVEN `{ path: "C:/repo/forms/Form_TestForm.form.txt" }` and no `sourcePath`.
- WHEN `inspect_form` is called.
- THEN the result MUST be `ok: true` (same as if `sourcePath` had been provided).
