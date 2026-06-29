# Spec — Form IR Models

> Part of SDD change `forms-ui-factory-slice-1` (closes issue #596). Source: this spec
> is the contract; `src/core/models/form-ir.ts` and `src/core/services/form-ir-service.ts`
> are the implementation. Behaviour-first tests in `test/core/services/form-ir-parse.test.ts`
> and `test/core/services/form-ir-serialize.test.ts` lock the contract.

## Purpose

Define the **Form Intermediate Representation (Form IR)** — the lossless, ordered-array,
recursive-tree model that `dysflow` uses to parse and serialize Microsoft Access
`SaveAsText` `.form.txt` files without hand-editing the raw text.

The IR is the only model a caller (an AI agent, a future mutation primitive, a future
`create_form_from_template` tool) is allowed to mutate. Serializing the IR back to
text is the write boundary; `LoadFromText` and the existing PS1 guard functions then
own the Access-compatibility contract.

## Requirements

| # | Requirement                                                                       | Strength |
|---|-----------------------------------------------------------------------------------|----------|
| 1 | Lossless ordered-array property model                                              | MUST     |
| 2 | Recursive `FormNode` tree that mirrors `Begin … End` blocks                       | MUST     |
| 3 | Duplicate scalar keys preserved, NOT collapsed                                    | MUST     |
| 4 | Opaque blob entries preserved verbatim (CP-1252 / hex lines untouched)            | MUST     |
| 5 | `CodeBehindForm` section preserved as a single string, not modeled into nodes     | MUST     |
| 6 | Typed `FormParseError` thrown on malformed / non-SaveAsText input                 | MUST     |
| 7 | Round-trip equality: `serializeFormTxt(parseFormTxt(x)) === normalizeLineEndings(x)` | MUST  |

---

### Requirement: Lossless ordered-array property model

The IR MUST represent form properties as **ordered arrays**, not maps. The property
type is a discriminated union with three cases:

- `ScalarEntry` — `Key =Value` (single line, e.g. `Width =4800`).
- `BlobEntry` — `Key = Begin\n<lines>\nEnd` (multi-line block; lines preserved verbatim
  with original indentation).
- `EmptyLineEntry` — blank line between entries (Access occasionally emits them).

Duplicates of the same scalar key MUST be preserved as separate `ScalarEntry` items in
insertion order. A `Record<string, …>` model is **forbidden** because it silently
collapses duplicates and reorders numeric-like keys.

#### Scenario: Duplicate scalar keys are preserved in order

- GIVEN a `.form.txt` containing `NoSaveCTIWhenDisabled =1` on two consecutive lines
  (as in `Form_frmBusy.form.txt`)
- WHEN `parseFormTxt` is called
- THEN `ir.root.entries` MUST contain two separate `ScalarEntry` items with
  `key === "NoSaveCTIWhenDisabled"`, in the original document order.

---

### Requirement: Recursive `FormNode` tree

The form body MUST be modeled as a recursive `FormNode` tree, not a flat list of
controls. A `FormNode` has:

- `blockType: string` — the word following `Begin` (e.g. `"Form"`, `"Label"`,
  `"Section"`, `"FormHeader"`, `""` for unlabeled `Begin`).
- `entries: PropertyEntry[]` — properties of THIS node, in document order.
- `children: FormNode[]` — nested `Begin … End` blocks, in document order.

Unlabeled `Begin` containers (`Begin\n  …\nEnd`) MUST be modeled as `FormNode` with
`blockType === ""` so the structure mirrors `SaveAsText` exactly and round-trips by
construction.

#### Scenario: Unlabeled Begin containers are represented

- GIVEN a form like `Form_frmBusy.form.txt` whose root contains an unlabeled `Begin`
  container that wraps `Section` and `Label` children.
- WHEN `parseFormTxt` is called
- THEN `ir.root.children` MUST include a `FormNode` with `blockType === ""`, and
  that node's `children` MUST include a `FormNode` with `blockType === "Section"`.

---

### Requirement: Opaque blob entries preserved verbatim

Multi-line `Key = Begin\n…\nEnd` blocks (binary blobs, `GUID`, `PrtDevMode`,
`NameMap`, `Checksum`, etc.) MUST be preserved **verbatim** — same line endings,
same indentation, same byte content. The serializer MUST NOT reformat, re-indent, or
re-encode the lines inside a blob.

#### Scenario: Spanish caption inside a blob survives

- GIVEN a `.form.txt` whose `Caption` scalar value contains the Spanish word `Espere`
  (as in `Form_frmBusy.form.txt`).
- WHEN `parseFormTxt` is called
- THEN the IR MUST contain a `ScalarEntry` with `key === "Caption"` whose `value`
  contains `Espere`.

---

### Requirement: CodeBehindForm is preserved as a single string

The `CodeBehindForm` marker section (everything from the marker to EOF in the file)
MUST be stored as a single string field `codeBehind: string | null` on the top-level
`FormIR`, NOT modeled into the `FormNode` tree. The canonical code-behind lives in
the `forms/<Name>.cls` file; the IR models UI / layout only, mirroring the
semantic-classifier contract in `AGENTS.md`.

#### Scenario: CodeBehindForm is split off

- GIVEN a `.form.txt` with a `CodeBehindForm` marker followed by VBA code.
- WHEN `parseFormTxt` is called
- THEN `ir.codeBehind` MUST be a non-null string containing the original VBA lines
  in order, and the `FormNode` tree MUST NOT contain the code-behind text.

---

### Requirement: Typed error on malformed input

Malformed input (empty text, whitespace-only, no `Begin Form` / `Begin Report` block,
unterminated `Begin` blocks) MUST throw a `FormParseError` with a `code` field equal
to `"FORM_PARSE_ERROR"` and a message that names the failure point. The parser MUST
NOT return a partial IR.

#### Scenario: Non-SaveAsText input throws

- GIVEN the string `"this is not a form file\nno begin block"`.
- WHEN `parseFormTxt` is called
- THEN it MUST throw `FormParseError` with a message indicating no `Begin Form` /
  `Begin Report` block was found.

---

### Requirement: Round-trip equality

For every real Access SaveAsText fixture `x`,
`serializeFormTxt(parseFormTxt(x)) === normalizeLineEndings(x)`. This is the
north-star invariant: any parser-internal refactor that preserves observable behaviour
MUST keep this property true.

`normalizeLineEndings` converts CRLF to LF; the serializer always emits LF. The
fixture corpus used by this contract is `E2E_testing/src/forms/*.form.txt`.

#### Scenario: Round-trip on Form_frmBusy (duplicate keys + Spanish caption)

- GIVEN the text of `E2E_testing/src/forms/Form_frmBusy.form.txt`.
- WHEN `serializeFormTxt(parseFormTxt(text))` is evaluated.
- THEN the result MUST equal `text` with CRLF normalized to LF.
