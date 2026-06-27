# Tasks: form-ui-factory

> Artifact store: hybrid (this file + Engram `sdd/form-ui-factory/tasks`).
> Strict TDD: every implementation task is preceded by a failing-test task.
> Delivery strategy: ask-on-risk (see Review Workload Forecast at bottom before applying).

---

## Dependency Graph

```
Slice 1 (parser + models + inspect_form + README)
  |
  +-----> Slice 2 (compare_form)         ─┐
  |                                        |  parallel; merge sequentially
  +-----> Slice 3 (serializeFormTxt        |  — all touch form-ir-service.ts
  |        + round-trip + integration)    ─┤  in different function sections
  |                                        |
  +-----> Slice 4 (mutation primitives)  ─┘
               |
               +-----> Slice 5 (create_form_from_template + MCP + GUID integration)
               ^
     Slice 3 --+
```

Slices 2, 3, 4 have no inter-dependency and can be developed in parallel branches after Slice 1
merges, but they should be reviewed and merged sequentially to avoid conflict on `form-ir-service.ts`.
Slice 5 is gated on both Slice 3 (needs `serializeFormTxt`) and Slice 4 (needs mutation primitives).

---

## Slice 1 — parseFormTxt + FormIR models + inspect_form MCP + README fix

**Spec requirements satisfied**: Form IR Parse (Req 1), inspect_form MCP Tool (Req 3),
access-core-services README accuracy clause.
**PR dependency**: none (first slice).

All tasks in this slice are sequential.

---

### S1-T1 — Define FormIR types

**File to create**: `src/core/models/form-ir.ts`

**Action**: Create new file with the following exported types (no logic):

```typescript
export type PropertyEntry =
  | { kind: "scalar"; key: string; value: string }
  | { kind: "blob"; key: string; lines: string[] };

export interface FormNode {
  blockType: string;       // e.g. "Form", "Report", "Label", "Section", "" (unlabeled Begin)
  entries: PropertyEntry[];
  children: FormNode[];
}

export interface FormIR {
  name: string;
  kind: "Form" | "Report";
  preamble: PropertyEntry[];  // Version, VersionRequired, PublishOption, Checksum before Begin Form/Report
  root: FormNode;
  codeBehind: string | null;  // CodeBehindForm section verbatim, NOT modeled
}
```

No failing test required for type declarations, but S1-T2 tests will import from here.
**Behavior locked in**: the contract the rest of the codebase builds against.

---

### S1-T2 — Write failing parseFormTxt unit tests

**File to create**: `test/core/services/form-ir-parse.test.ts`

**Failing tests (must fail — no implementation yet)**:

1. **`parseFormTxt: parses frmSplash → name, kind, version, blobs`**
   - Read `E2E_testing/src/forms/Form_frmSplash.form.txt` as UTF-8 string.
   - Call `parseFormTxt(text)` (not yet implemented → test will fail at import).
   - Assert `ir.name === "frmSplash"`, `ir.kind === "Form"`, `ir.preamble` contains an entry
     `{kind:"scalar", key:"Version", value:"21"}`.
   - Assert `ir.root.blockType === "Form"`.
   - Assert a `blob` entry exists in `ir.root.entries` with `key === "GUID"`.
   - Assert a `blob` entry with `key === "NameMap"` preserves hex lines verbatim.

2. **`parseFormTxt: handles duplicate keys (frmBusy NoSaveCTIWhenDisabled)`**
   - Read `E2E_testing/src/forms/Form_frmBusy.form.txt`.
   - Call `parseFormTxt(text)`.
   - Assert `ir.root.entries.filter(e => e.kind === "scalar" && e.key === "NoSaveCTIWhenDisabled").length === 2`.
   - (Documents that duplicate keys must be preserved, not collapsed.)

3. **`parseFormTxt: parses frmBusy nested unlabeled Begin blocks`**
   - Read `E2E_testing/src/forms/Form_frmBusy.form.txt`.
   - Assert `ir.root.children` contains at least one child with `blockType === ""` (unlabeled Begin).
   - Assert that child contains a `FormNode` with `blockType === "Section"`.

4. **`parseFormTxt: preserves Spanish captions verbatim`**
   - Read `E2E_testing/src/forms/Form_frmBusy.form.txt`.
   - Assert a scalar entry anywhere in the IR has `key === "Caption"` and `value` contains `"Espere..."`.

5. **`parseFormTxt: rejects malformed input with typed error`**
   - Call `parseFormTxt("not a form")`.
   - Assert it throws an error (any) — specific typed error verified once implementation exists.

6. **`parseFormTxt: parses all E2E_testing fixtures without throwing`**
   - Enumerate all `*.form.txt` files in `E2E_testing/src/forms/`.
   - For each: read as UTF-8 and call `parseFormTxt(text)`.
   - Assert no exception is thrown and the result has `.name` and `.kind` defined.

**Behavior locked in**: parse contract against real fixtures, duplicate-key preservation, nested
unlabeled Begin blocks, Spanish caption survival, typed error on bad input, fixture corpus coverage.

---

### S1-T3 — Implement parseFormTxt

**File to create**: `src/core/services/form-ir-service.ts`

Implement `parseFormTxt(text: string): FormIR` only (serializer and mutations come in later slices).
Algorithm must handle:
- Preamble lines before `Begin Form` / `Begin Report`.
- Scalar entries: lines matching `key = value` pattern.
- Blob entries: `key = Begin` ... `End` multi-line blocks.
- Recursive Begin [blockType] ... End children (blockType may be empty for unlabeled Begin).
- `CodeBehindForm` section: detect the marker and preserve from there to EOF as `codeBehind`.
- Duplicate scalar keys: append to `entries[]`, do NOT collapse.

Export: `parseFormTxt`. Do not export `serializeFormTxt` yet (not implemented).

**Gate**: `pnpm test` must turn tests S1-T2 (1–6) green. Test 5 (error case) must also pass.

---

### S1-T4 — Extend FormFileSystemPort with readFile

**File to modify**: `src/core/services/vba-form-service.ts`

Add `readFile(path: string): Promise<string>` to the `FormFileSystemPort` interface.
Add the Node.js implementation (`readFile(path, "utf8")`) to `nodeFileSystem`.

**File to modify**: `src/adapters/vba-sync/vba-forms-adapter.ts`

Add `readFile` to `nodeFormFileSystem` (the one local to the adapter file).

**No behavioral test required** — the interface addition is mechanical. Tests in S1-T5 will verify
the observable behavior through the adapter mock.

---

### S1-T5 — Write failing inspect_form adapter tests

**File to create**: `test/adapters/vba-sync/vba-forms-adapter-inspect.test.ts`

**Failing tests (must fail — inspect_form not yet handled)**:

1. **`VbaFormsAdapter.handles("inspect_form") === true`**
   - Assert the static method returns true.

2. **`inspect_form: returns name, kind, controls, events for FormComercial`**
   - Mock `FormFileSystemPort` to return the real text of
     `E2E_testing/src/forms/Form_FormComercial.form.txt` from `readFile`.
   - Call `adapter.execute("inspect_form", { sourcePath: "...Form_FormComercial.form.txt" })`.
   - Assert `result.ok === true`.
   - Assert `result.data.name === "FormComercial"`, `result.data.kind === "Form"`.
   - Assert `result.data.controls` is a non-empty array.
   - Assert each control entry has `name`, `type`, and `properties`.

3. **`inspect_form: events array lists OnOpen for frmBusy`**
   - Mock `readFile` to return text of `Form_frmBusy.form.txt`.
   - Assert `result.data.events` includes `"OnOpen"`.

4. **`inspect_form: returns FORM_NOT_FOUND when readFile throws ENOENT`**
   - Mock `readFile` to throw `{ code: "ENOENT" }`.
   - Call `adapter.execute("inspect_form", { sourcePath: "missing.form.txt" })`.
   - Assert `result.ok === false`, `result.error.code === "FORM_NOT_FOUND"`.

5. **`inspect_form: does not call resolveExecutionTarget or validateStrictContext`**
   - Assert read-only tool never touches COM runner orchestrator methods.

**Behavior locked in**: tool handle registration, control-tree shape, event extraction, missing-file
error code, read-only classification.

---

### S1-T6 — Register inspect_form in MCP registry and add schema

**File to modify**: `src/adapters/mcp/mcp-tool-registry.ts`
- Add `"inspect_form"` to `VBA_SYNC_TOOL_NAMES`.

**File to modify**: `src/adapters/mcp/tool-parity-registry.ts`
- Add `"inspect_form"` to `implementedToolNames` Set.
- Add `TOOL_DESCRIPTIONS["inspect_form"]`: `"Inspect a .form.txt source file and return its control tree (name, type, properties) and event-procedure names. Read-only; works offline — Access is not required."`.

**File to modify**: `src/adapters/mcp/schemas/vba-sync-schemas.ts`
- Add Zod schema `inspectFormSchema`: `{ sourcePath: z.string(), live: z.boolean().optional() }`.
- Export it and register in the dispatch layer (follow existing pattern for other form tool schemas).

**Gate**: existing `test/adapters/mcp/advertised-tool-count.test.ts` and
`test/adapters/mcp/tool-parity-registry.test.ts` must stay green (they count registered tools).

---

### S1-T7 — Implement inspect_form in VbaFormsAdapter

**File to modify**: `src/adapters/vba-sync/vba-forms-adapter.ts`

1. Add `"inspect_form"` to `VbaFormsAdapter.handles()`.
2. In `execute()`, add handler for `"inspect_form"`:
   - Read `sourcePath` param.
   - Call `this.formFileSystem.readFile(sourcePath)` (catch ENOENT → return `FORM_NOT_FOUND`).
   - Call `parseFormTxt(text)` from `form-ir-service.ts`.
   - Extract controls: walk `ir.root` recursively, collect `FormNode`s that have a `Name =` scalar
     entry; map each to `{ name, type: node.blockType, properties: Object.fromEntries(...) }`.
   - Extract events: from `ir.root.entries`, collect scalar entries whose key matches `/^On[A-Z]/`
     and value is `"[Event Procedure]"`; return their keys.
   - Return `successResult({ name: ir.name, kind: ir.kind, controls, events })`.

Do NOT call `resolveExecutionTarget` or `validateStrictContext`.

**Gate**: `pnpm test` turns S1-T5 tests (1–5) green.

---

### S1-T8 — Fix README generate_form description

**File to modify**: `README.md` (around line 647, `generate_form` section)

Change any claim that `generate_form` creates a live Access form to state it writes a `.form.json`
stub that records the spec and is used as a source-of-truth for later automation steps.

**Gate**: `test/docs/architecture-doc.test.ts` (or the nearest doc-anchor test) must pass.
No new test needed — the access-core-services spec clause is satisfied by the doc change.

---

## Slice 2 — compare_form (sequential after Slice 1)

**Spec requirements satisfied**: compare_form Drift Report (Req 4).
**PR dependency**: Slice 1 merged.

Tasks within this slice are sequential.

---

### S2-T1 — Write failing compareFormIR unit tests

**File to create**: `test/core/services/form-ir-compare.test.ts`

**Failing tests**:

1. **`compareFormIR: detects control present in source but absent from target`**
   - Parse `Form_FormComercial.form.txt` as `sourceIR`.
   - Clone a minimal IR without one named control as `targetIR`.
   - Call `compareFormIR(sourceIR, targetIR)`.
   - Assert `result.missingInTarget` contains the missing control name.
   - Assert `result.driftDetected === true`.

2. **`compareFormIR: detects control present in target but absent from source`**
   - Assert `result.extraInTarget` contains the extra name.

3. **`compareFormIR: reports property-level diff for a matching control`**
   - Build two IRs where `txtFecha` exists in both but has different `Left` values.
   - Assert `result.propertyDiffs["txtFecha"]` lists `key === "Left"`.

4. **`compareFormIR: no drift for identical IRs`**
   - Parse the same fixture text twice.
   - Assert `result.driftDetected === false`, `missingInTarget.length === 0`,
     `extraInTarget.length === 0`.

**File to create**: `test/adapters/vba-sync/vba-forms-adapter-compare.test.ts`

5. **`VbaFormsAdapter.handles("compare_form") === true`**

6. **`compare_form: returns driftDetected:false for same-source comparison`**
   - Mock `readFile` to return the same fixture text for both source and target paths.
   - Assert `result.ok === true`, `result.data.driftDetected === false`.

7. **`compare_form: does not call resolveExecutionTarget or validateStrictContext`**

**Behavior locked in**: control-level presence diff, property-level diff, drift boolean, read-only
classification, zero-drift identity case.

---

### S2-T2 — Implement compareFormIR

**File to modify**: `src/core/services/form-ir-service.ts`

Add pure function `compareFormIR(source: FormIR, target: FormIR): FormDriftReport`.

```typescript
type PropertyDiff = { key: string; sourceValue: string; targetValue: string };
type FormDriftReport = {
  missingInTarget: string[];   // control names in source not in target
  extraInTarget: string[];     // control names in target not in source
  propertyDiffs: Record<string, PropertyDiff[]>; // per-control property diffs (keyed by control name)
  driftDetected: boolean;
};
```

Export `FormDriftReport` from `src/core/models/form-ir.ts`.

Algorithm:
- Walk source and target IR recursively to collect all named controls (nodes with `Name = ` scalar entry).
- Compute set differences for `missingInTarget` / `extraInTarget`.
- For matching controls, compare scalar property entries key-by-key.
- `driftDetected` is true when any list is non-empty.

**Gate**: `pnpm test` turns S2-T1 tests (1–4) green.

---

### S2-T3 — Register compare_form and implement in VbaFormsAdapter

**File to modify**: `src/adapters/mcp/mcp-tool-registry.ts` — add `"compare_form"`.
**File to modify**: `src/adapters/mcp/tool-parity-registry.ts` — add to `implementedToolNames`;
  add description: `"Compare a .form.txt source against a second source or binary path using the semantic classifier. Reports per-control drift (missingInTarget, extraInTarget, propertyDiffs, driftDetected). Read-only."`.
**File to modify**: `src/adapters/mcp/schemas/vba-sync-schemas.ts`
  — add schema `compareFormSchema`: `{ sourcePath: z.string(), targetPath: z.string() }`.
**File to modify**: `src/adapters/vba-sync/vba-forms-adapter.ts`
  — add `"compare_form"` to `handles()`.
  — in `execute()`: read both `sourcePath` and `targetPath` via `readFile`; call `parseFormTxt`
    on each; call `compareFormIR`; return `successResult(report)`.

Do NOT call `resolveExecutionTarget` or `validateStrictContext`.

**Gate**: `pnpm test` turns S2-T1 tests (5–7) green.

---

## Slice 3 — serializeFormTxt + round-trip property tests + integration gate

**Spec requirements satisfied**: Form IR Serialize + Round-Trip (Req 2).
**PR dependency**: Slice 1 merged. (Parallel with Slices 2 and 4 — merge sequentially.)

Tasks within this slice are sequential.

---

### S3-T1 — Write failing round-trip property tests

**File to create**: `test/core/services/form-ir-serialize.test.ts`

**Failing tests (must fail — serializeFormTxt not yet implemented)**:

1. **`serializeFormTxt(parseFormTxt(x)) === normalizeLineEndings(x) for every E2E fixture`**
   - Load all `E2E_testing/src/forms/*.form.txt` files.
   - For each `text`:
     - `normalized = normalizeLineEndings(text)` (replace `\r\n` → `\n`).
     - Assert `serializeFormTxt(parseFormTxt(text)) === normalized`.
   - This is the north-star round-trip invariant; any parser refactor that preserves behavior must
     keep it green.

2. **`serializeFormTxt: blob entries reproduce hex lines byte-for-byte`**
   - Parse `Form_frmBusy.form.txt`.
   - Serialize.
   - Assert the `NameMap = Begin` block in the serialized output matches the original hex lines
     exactly (no whitespace drift, no truncation).

3. **`serializeFormTxt: duplicate scalar keys appear in original order`**
   - Parse `Form_frmBusy.form.txt` (has two `NoSaveCTIWhenDisabled =1` lines).
   - Serialize.
   - Assert both lines appear consecutively in the output.

4. **`serializeFormTxt: CodeBehindForm section preserved verbatim when present`**
   - Parse any fixture that has a `CodeBehindForm` marker.
   - Assert the serialized output contains the verbatim code-behind lines.

**Behavior locked in**: full round-trip equality over the entire fixture corpus (regression net for
any future parse/serialize refactor), blob verbatim fidelity, duplicate-key order, code-behind
preservation.

---

### S3-T2 — Implement serializeFormTxt

**File to modify**: `src/core/services/form-ir-service.ts`

Add `serializeFormTxt(ir: FormIR): string`.

Algorithm:
- Output preamble entries (scalar → `key =value\n`; blob → `key = Begin\n  line\n End\n`).
- Recursively output `ir.root`: `Begin blockType\n` (or `Begin\n` when blockType is `""`),
  entries, children (indented), `End\n`.
- Append `codeBehind` verbatim if non-null.
- Use `\n` line endings (UTF-8 output; CP-1252 conversion stays owned by PS1).

**Gate**: `pnpm test` turns S3-T1 tests (1–4) green. The corpus round-trip test (test 1) is the
primary gate — it must pass against all 46+ fixtures before this task is considered done.

---

### S3-T3 — Write and run integration round-trip gate (LoadFromText)

**File to create**: `test/integration/form-ir-loadfromtext.test.ts`

**Configured in**: `vitest.integration.config.ts` (Windows + Access COM, requires Access install).

**Failing test (integration — must fail until Access is available)**:

1. **`LoadFromText round-trip: serialized frmBusy survives import without error`**
   - Read `E2E_testing/src/forms/Form_frmBusy.form.txt`.
   - Parse → serialize → write to a temp `.form.txt` under `test-runtime/`.
   - Call the guarded PS1 `import_modules` script via the existing executor port pointing at
     the E2E Access binary.
   - Assert no VBA_COMPILE_ERROR or import failure.
   - Assert the re-exported form text is semantically equivalent (per `vba-source-comparison`)
     to the original.

2. **`LoadFromText round-trip: property ordering survives (mutation-safety gate)`**
   - After import, call `export_modules` to get the Access-emitted text.
   - Assert `compare_form` of original vs re-exported reports `driftDetected: false`.
   - This is the empirical guard the design calls out: property ordering through `LoadFromText`
     must be confirmed before slice 5 is declared safe.

**Behavior locked in**: confirms serializer output is Access-loadable; de-risks property-ordering
assumption before `create_form_from_template` ships. **This integration test MUST pass before
Slice 3 closes** as stated in the design.

---

## Slice 4 — Pure mutation primitives

**Spec requirements satisfied**: Mutation Primitives (Req 5).
**PR dependency**: Slice 1 merged. (Parallel with Slices 2 and 3 — merge sequentially.)

Tasks within this slice are sequential.

---

### S4-T1 — Write failing mutation unit tests

**File to create**: `test/core/services/form-ir-mutations.test.ts`

All tests are pure — no I/O, no mocks. Parse a fixture to get a base IR; apply mutations; assert
observable IR output. The input IR must be unmodified after each mutation.

**Failing tests (must fail — functions not yet implemented)**:

1. **`addControl: adds control to target section, leaves original unmodified`**
   - Parse `Form_FormComercial.form.txt` as `baseIR`.
   - Build a minimal `FormNode` for a new TextBox named `txtNuevo`.
   - Call `addControl(baseIR, "Section", textBoxNode)`.
   - Assert returned IR contains a node with `Name = "txtNuevo"`.
   - Assert `baseIR` does NOT contain `txtNuevo` (immutability).

2. **`addControl: throws DuplicateControlError when name already exists`**
   - Find an existing control name in the parsed IR (e.g. `txtFecha`).
   - Assert calling `addControl(ir, "Section", {...name:"txtFecha"...})` throws an error
     whose `message` includes `"txtFecha"`.

3. **`removeControl: removes named control from IR`**
   - Call `removeControl(ir, existingName)`.
   - Assert returned IR does not contain a node with that name.
   - Assert original IR still contains it (immutability).

4. **`removeControl: throws UnknownControlError for unknown name`**
   - Assert `removeControl(ir, "doesNotExist")` throws with `"doesNotExist"` in message.

5. **`setControlProperty: updates scalar property on named control`**
   - Call `setControlProperty(ir, existingName, "Width", "9000")`.
   - Find the control in the returned IR; assert its `Width` scalar entry has value `"9000"`.

6. **`setControlProperty: throws UnknownControlError for unknown control name`**

7. **`setFormProperty: updates scalar property at form (root) level`**
   - Call `setFormProperty(ir, "Caption", "NewTitle")`.
   - Assert root entries contain `{kind:"scalar", key:"Caption", value:"NewTitle"}`.

8. **`moveControl: moves named control to target section`**
   - Parse a form with a control in one section.
   - Call `moveControl(ir, controlName, "Header")`.
   - Assert returned IR has the control under a `Section` node whose `Name = "Encabezado"` /
     matching `blockType === "Section"` that targets Header.
   - Assert original section no longer contains it.

9. **`moveControl: throws UnknownControlError for unknown name`**

10. **`bindControl: sets ControlSource on named control`**
    - Call `bindControl(ir, controlName, "Importe")`.
    - Assert the control's entries include `{kind:"scalar", key:"ControlSource", value:"Importe"}`.

11. **`bindControl: throws UnknownControlError for unknown name`**

12. **`renameForm: changes ir.name and strips GUID blob`**
    - Call `renameForm(ir, "FormComercialCopia")`.
    - Assert `result.name === "FormComercialCopia"`.
    - Assert `result.root.entries` has no entry with `key === "GUID"`.
    - Assert original IR still has GUID and original name (immutability).

**Behavior locked in**: all seven mutation function signatures, DuplicateControlError/UnknownControlError
typed errors, immutability (input IR unchanged), GUID strip on rename.

---

### S4-T2 — Implement addControl and removeControl

**File to modify**: `src/core/services/form-ir-service.ts`

Implement `addControl` and `removeControl`.
Export typed error classes `DuplicateControlError` and `UnknownControlError`.
Use a helper `findControlNode(root: FormNode, name: string): FormNode | undefined` that walks
the tree recursively looking for a `FormNode` with scalar entry `{key:"Name", value:name}`.
Mutations return new `FormIR` objects — deep-clone the root tree, do not mutate the input.
(Ordered arrays guarantee: append-only; never reorder existing entries.)

**Gate**: `pnpm test` turns S4-T1 tests 1–4 green.

---

### S4-T3 — Implement setControlProperty, setFormProperty, and bindControl

**File to modify**: `src/core/services/form-ir-service.ts`

Implement `setControlProperty`, `setFormProperty`, `bindControl`.

For `setControlProperty` / `setFormProperty`: find the existing scalar entry by key and update its
value in-place on the cloned tree. If key does not exist, append a new scalar entry (append-only
rule). Throw `UnknownControlError` when the target control is not found.

For `bindControl`: alias for `setControlProperty(ir, controlName, "ControlSource", fieldName)`.

**Gate**: `pnpm test` turns S4-T1 tests 5–11 green.

---

### S4-T4 — Implement moveControl and renameForm

**File to modify**: `src/core/services/form-ir-service.ts`

Implement `moveControl` and `renameForm`.

`moveControl`: remove the `FormNode` from its current parent (walk the tree to find it),
then append it to the first child `FormNode` matching the target `blockType` (e.g., `"Section"`).
Preserves the relative order of all other nodes. Throws `UnknownControlError` if not found.

`renameForm(ir, newName)`: return a new `FormIR` with `name: newName` and `root.entries` with
the `GUID` blob entry removed (filter it out). All other entries and children are cloned unchanged.

**Gate**: `pnpm test` turns S4-T1 tests 8–12 green.
Full S4-T1 suite (all 12 tests) must be green before Slice 4 closes.

---

## Slice 5 — create_form_from_template use case + MCP tool + GUID integration

**Spec requirements satisfied**: create_form_from_template (Req 6).
**PR dependency**: Slice 3 merged (needs `serializeFormTxt`) AND Slice 4 merged (needs mutation
primitives: `renameForm`, `setFormProperty`, `bindControl`). Slice 3 integration gate must have
passed.

Tasks within this slice are sequential.

---

### S5-T1 — Write failing create_form_from_template unit tests

**File to create**: `test/adapters/vba-sync/vba-forms-adapter-create-form.test.ts`

**Failing tests (must fail — tool not yet registered)**:

1. **`VbaFormsAdapter.handles("create_form_from_template") === true`**

2. **`create_form_from_template: dry-run by default — no import issued`**
   - Mock `readFile` to return `Form_FormComercial.form.txt` text.
   - Mock `writeFile` and `executeMappedTool` as spies.
   - Call `adapter.execute("create_form_from_template", { templatePath: "...", name: "Copy" })`.
   - Assert `result.ok === true`, `result.data.dryRun === true`, `result.data.wouldGenerate === true`.
   - Assert `executeMappedTool` NOT called (no import in dry-run).

3. **`create_form_from_template: apply:true writes file and issues import_modules`**
   - Call with `{ apply: true, templatePath: "...", name: "FormCopy", outputDir: "/tmp/forms" }`.
   - Assert `writeFile` called with a path ending in `FormCopy.form.txt` and text containing
     `"FormCopy"`.
   - Assert `executeMappedTool` called with tool `"import_modules"` and
     `moduleNames` containing `"FormCopy"`.

4. **`create_form_from_template: applies field bindings via bindControl`**
   - Provide `bindings: { txtImporte: "Importe" }`.
   - Assert the written `.form.txt` text contains `ControlSource ="Importe"` (or similar).

5. **`create_form_from_template: GUID is absent from written output`**
   - Assert the written `.form.txt` text does NOT contain the string `"GUID = Begin"`.

6. **`create_form_from_template: applies recordSource via setFormProperty`**
   - Provide `recordSource: "tblComerciales"`.
   - Assert written text contains `RecordSource ="tblComerciales"`.

7. **`create_form_from_template: TEMPLATE_NOT_FOUND when readFile throws ENOENT`**
   - Mock `readFile` to throw `{ code: "ENOENT" }`.
   - Assert `result.ok === false`, `result.error.code === "TEMPLATE_NOT_FOUND"`.

8. **`create_form_from_template: does not call resolveExecutionTarget or validateStrictContext`**
   - Assert those orchestrator methods are never invoked.

**Behavior locked in**: dry-run default gate (mirrors `generate_form`), write + import flow for
`apply:true`, field binding application, GUID strip, record source binding, missing-template error
code, write-gate classification.

---

### S5-T2 — Register create_form_from_template in MCP registry and add schema

**File to modify**: `src/adapters/mcp/mcp-tool-registry.ts`
- Add `"create_form_from_template"` to `VBA_SYNC_TOOL_NAMES`.

**File to modify**: `src/adapters/mcp/tool-parity-registry.ts`
- Add to `implementedToolNames`.
- Add description: `"Create a new Access form by cloning a template .form.txt, renaming it, and optionally binding controls to record fields. GUID is stripped so Access regenerates it on import. Write-gated (filesystem + Access mutation); dryRun default; apply:true performs the write and import."`.

**File to modify**: `src/adapters/mcp/schemas/vba-sync-schemas.ts`
- Add schema `createFormFromTemplateSchema`:
  ```
  {
    templatePath: z.string(),
    name: z.string(),
    outputDir: z.string().optional(),
    recordSource: z.string().optional(),
    bindings: z.record(z.string(), z.string()).optional(),
    dryRun: z.boolean().optional(),
    apply: z.boolean().optional(),
  }
  ```
- Register in dispatch layer.

**Gate**: advertised-tool-count and tool-parity-registry tests must stay green.

---

### S5-T3 — Implement create_form_from_template in VbaFormsAdapter

**File to modify**: `src/adapters/vba-sync/vba-forms-adapter.ts`

1. Add `"create_form_from_template"` to `handles()`.
2. In `execute()`, add handler:
   - Read `templatePath` → `readFile` (ENOENT → `TEMPLATE_NOT_FOUND`).
   - Parse → `renameForm(ir, name)` (strips GUID).
   - If `recordSource` provided → `setFormProperty(ir, "RecordSource", recordSource)`.
   - For each `[controlName, fieldName]` in `bindings` → `bindControl(ir, controlName, fieldName)`.
   - Serialize → `serializeFormTxt(mutatedIR)`.
   - `dryRun = params.apply === true ? false : params.dryRun !== false` (mirrors `generate_form` gate).
   - If `dryRun`: return `successResult({ dryRun: true, wouldGenerate: true, name })`.
   - Else:
     - Write to `outputDir / name.form.txt` via `writeFile`.
     - Call `this.orchestrator.executeMappedTool("import_modules", { moduleNames: [name] }, IMPORTS_MAPPING)`.
     - Return `successResult({ generated: true, outputPath, name })`.

Do NOT call `resolveExecutionTarget` or `validateStrictContext`.

**Gate**: `pnpm test` turns S5-T1 tests 1–8 green.

---

### S5-T4 — Write and run integration test for clone + GUID regeneration

**File to create**: `test/integration/create-form-from-template.test.ts`

**Configured in**: `vitest.integration.config.ts` (Windows + Access COM required).

**Failing tests (integration — must fail until Access available)**:

1. **`create_form_from_template integration: cloned form imports without error`**
   - Use `Form_FormComercial.form.txt` as template, new name `FormComercialCopyTest`.
   - Call `adapter.execute("create_form_from_template", { templatePath: "...", name: "FormComercialCopyTest", apply: true })`.
   - Assert `result.ok === true`, `result.data.generated === true`.

2. **`create_form_from_template integration: cloned form has correct name in Access`**
   - After import, call `list_objects` and assert `FormComercialCopyTest` appears.

3. **`create_form_from_template integration: GUID differs from template (Access regenerated)`**
   - Export `FormComercialCopyTest.form.txt` from Access.
   - Parse the exported text.
   - Assert the `GUID` blob value differs from the original `Form_FormComercial.form.txt` GUID.
   - This is the empirical verification the design requires before the slice can close.

4. **`create_form_from_template integration: cleanup — delete cloned form`**
   - Call `delete_module` for `FormComercialCopyTest` to keep the E2E DB clean.

**Behavior locked in**: end-to-end write path via PS1 guards, GUID regeneration by Access (not
synthesized), Access confirms name + import success.

---

## Review Workload Forecast

| Slice | Estimated Changed Lines | Notes |
|-------|------------------------|-------|
| 1 — parser + models + inspect_form + README | ~640 lines | `form-ir.ts` ~55, `form-ir-service.ts` (parse only) ~300, tests ~180, MCP wiring ~80, README ~5. Largest slice: parser is complex. |
| 2 — compare_form | ~290 lines | compare logic ~80, tests ~140, MCP wiring ~70. |
| 3 — serializeFormTxt + round-trip + integration | ~370 lines | serializer ~150, property tests ~130, integration test ~90. |
| 4 — mutation primitives | ~430 lines | 7 functions ~230, tests ~200. |
| 5 — create_form_from_template + MCP + integration | ~390 lines | use case ~100, adapter ~60, tests ~150, MCP schema ~50, integration ~80. |
| **TOTAL** | **~2120 lines** | Distributed across 5 PRs. |

**Chained PRs recommended: Yes**
**400-line budget risk: High** (Slice 1 ~640 lines and Slice 4 ~430 lines individually exceed the 400-line budget; Slices 3 and 5 are borderline.)
**Decision needed before apply: Yes**

The orchestrator MUST apply the `ask-on-risk` delivery strategy gate before launching `sdd-apply`:
- Slice 1 exceeds 400 lines on its own. Consider splitting into 1a (types + parser + tests) and
  1b (inspect_form MCP wiring + README fix) if the reviewer load is a concern.
- Slice 4 slightly exceeds 400 lines. Consider splitting into 4a (addControl + removeControl) and
  4b (remaining 5 primitives).
- Chain strategy (`stacked-to-main` vs `feature-branch-chain`) must be chosen before apply begins.
- All 5 slice PRs must close in dependency order: Slice 1 → {2, 3, 4 sequential} → Slice 5.
