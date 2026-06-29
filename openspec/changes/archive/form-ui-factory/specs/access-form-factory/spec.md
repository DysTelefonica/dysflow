# access-form-factory Specification

## Purpose

Define the Form Intermediate Representation (IR) layer — parse, serialize, inspect, compare, mutate,
and template-create Access `.form.txt` files without raw hand-editing. Pure domain service; no I/O.

## Requirements

| # | Requirement | Strength |
|---|-------------|----------|
| 1 | Form IR Parse | MUST |
| 2 | Form IR Serialize + Round-Trip | MUST |
| 3 | inspect_form MCP Tool | MUST |
| 4 | compare_form Drift Report | MUST |
| 5 | Mutation Primitives | MUST |
| 6 | create_form_from_template | MUST |

---

### Requirement: Form IR Parse

The system MUST parse a valid Access `SaveAsText` `.form.txt` into a structured IR: name, kind
(`Form`/`Report`), version, form-level properties, sections (Header/Detail/Footer) each with a
control tree (type, name, properties, nested controls), and opaque preserved blobs for noise keys
(`Checksum`, `PrtDevMode`, `PrtDevNames`, `PrtMip`, `RecSrcDt`, `NameMap`, `GUID`,
`LayoutCached*`). Non-SaveAsText or malformed input MUST be rejected with a typed error that
identifies the failure point. No partial IR MAY be returned on error.

#### Scenario: Parse succeeds on real fixture

- GIVEN the text of `E2E_testing/src/forms/Form_frmSplash.form.txt`
- WHEN `parseFormTxt` is called with that text
- THEN the IR MUST contain `name: "frmSplash"`, `kind: "Form"`, `version: 21`, at least one section, and blob keys (`PrtDevMode`, `Checksum`, `GUID`) as verbatim opaque strings

#### Scenario: Parse rejects malformed input

- GIVEN text that does not begin with a valid `Version =` / `Begin Form` / `Begin Report` header
- WHEN `parseFormTxt` is called
- THEN it MUST throw a typed parse error naming the failure location

---

### Requirement: Form IR Serialize + Round-Trip

The system MUST serialize a Form IR into `.form.txt` text accepted by Access `LoadFromText`.
The round-trip `serialize(parse(x))` MUST equal `x` modulo known noise normalization
(`FORM_NOISE_KEYS` from `vba-semantic-classifier.ts`). Opaque blobs MUST survive verbatim.

#### Scenario: Round-trip on complex fixture

- GIVEN the text of `E2E_testing/src/forms/Form_FormComercial.form.txt`
- WHEN `serialize(parse(text))` is called
- THEN the result MUST be semantically equivalent to the original per the existing semantic classifier
- AND opaque blob content MUST be byte-identical to the original

#### Scenario: Opaque blobs unchanged

- GIVEN an IR containing opaque blobs (`PrtDevMode`, `NameMap`)
- WHEN the IR is serialized
- THEN blob hex lines MUST appear in the output exactly as parsed, with no transformation

---

### Requirement: inspect_form MCP Tool

`inspect_form` MUST accept a source `.form.txt` path and return structured JSON with top-level
`name`, `kind`, `controls` (array of `{name, type, properties}`) and `events` (event-procedure
names). It MUST work offline from source files; Access MUST NOT be required.

#### Scenario: Returns control tree

- GIVEN the source path of `Form_FormComercial.form.txt`
- WHEN `inspect_form` is called
- THEN the response MUST include `name: "FormComercial"`, a non-empty `controls` array, and each entry MUST have `name`, `type`, and `properties`

#### Scenario: Reports event procedures

- GIVEN a form with `OnOpen = "[Event Procedure]"` in its properties
- WHEN `inspect_form` is called
- THEN the response `events` field MUST list `OnOpen`

#### Scenario: Missing file returns typed error

- GIVEN a path that does not exist
- WHEN `inspect_form` is called
- THEN the tool MUST return an MCP error with code `FORM_NOT_FOUND`

---

### Requirement: compare_form Drift Report

`compare_form` MUST compare a form between source `.form.txt` and a comparison target (binary
path or second source path) using the existing semantic classifier. It MUST report:
`missingInTarget`, `extraInTarget`, property-level diffs per control, and `driftDetected: boolean`.

#### Scenario: Detects added control

- GIVEN a source with control `txtNuevo` absent from the comparison target
- WHEN `compare_form` is called
- THEN `missingInTarget` MUST contain `"txtNuevo"` and `driftDetected` MUST be `true`

#### Scenario: No drift for equivalent forms

- GIVEN source and target that produce equivalent IRs after noise normalization
- WHEN `compare_form` is called
- THEN `driftDetected` MUST be `false` and diff lists MUST be empty

---

### Requirement: Mutation Primitives

The service MUST expose pure IR → IR transforms: `addControl`, `removeControl`,
`setControlProperty`, `setFormProperty`, `moveControl`, `bindControl`, `renameForm`.
Each primitive MUST perform no I/O, MUST return a new IR leaving the input unchanged, and MUST
throw a typed error for invalid operations (duplicate name on `addControl`; unknown name on all
control-targeting primitives; unknown property on property setters).

#### Scenario: addControl succeeds

- GIVEN an IR for `Form_FormComercial`
- WHEN `addControl` is called with a unique name and valid type
- THEN the returned IR MUST contain the new control in the target section and the original IR MUST be unmodified

#### Scenario: addControl rejects duplicate name

- GIVEN an IR containing a control named `txtFecha`
- WHEN `addControl` is called with `name: "txtFecha"`
- THEN a typed `DuplicateControlError` MUST be thrown with the name in the message

#### Scenario: removeControl rejects unknown name

- GIVEN an IR
- WHEN `removeControl` is called with a name not in the IR
- THEN a typed `UnknownControlError` MUST be thrown

---

### Requirement: create_form_from_template

`create_form_from_template` MUST accept: source template `.form.txt` path, new form name, optional
record source, and optional field bindings (`{ controlName: fieldName }`). It MUST produce a
serialized `.form.txt` routed through the guarded PS1 `LoadFromText` import path.
The GUID MUST NOT be cloned from the template — it MUST be stripped or regenerated in the output.

#### Scenario: Produces renamed form without cloned GUID

- GIVEN `Form_FormComercial.form.txt` as template and new name `FormComercialCopia`
- WHEN `create_form_from_template` is called
- THEN the output IR MUST have `name: "FormComercialCopia"` and its GUID MUST differ from the template's GUID

#### Scenario: Field bindings applied to controls

- GIVEN a template and bindings `{ txtImporte: "Importe" }`
- WHEN `create_form_from_template` is called
- THEN the produced IR's `txtImporte` control MUST have `ControlSource` set to `"Importe"`

#### Scenario: Missing template returns typed error

- GIVEN a template path that does not exist
- WHEN `create_form_from_template` is called
- THEN the tool MUST return an MCP error with code `TEMPLATE_NOT_FOUND`
