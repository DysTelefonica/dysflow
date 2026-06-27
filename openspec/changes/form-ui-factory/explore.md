# Exploration: form-ui-factory

> Back-filled from Engram (`sdd/form-ui-factory/explore`, obs #14485). The explore
> phase had no file-write tool, so this file reproduces that exploration verbatim to
> keep the OpenSpec file trail complete.

## Executive Summary

The `form-ui-factory` change will bridge two currently disconnected form worlds in dysflow: the real Access round-trip (SaveAsText/.form.txt/LoadFromText) and a near-empty JSON abstraction. The key architectural fork is **source-path mutation** (parse .form.txt → IR → serialize, no Access needed) vs **binary/COM read-then-write** (SaveAsText for canonical source, mutate, LoadFromText — Access must be open). A hybrid model is the pragmatic path: parse from source for inspect/template reads, use SaveAsText+LoadFromText (existing PS1 guards) for the actual write-to-binary step. The existing semantic-classifier, component-resolver, PS1 guard functions, and adapter pattern are all directly reusable. The VbaFormService controls model ({name, type}) must be replaced with a richer form IR.

---

## Current State

### World 1 — Real Access Round-Trip (PS1-driven)

**File**: `scripts/dysflow-vba-manager.ps1`

The actual form pipeline:
- **Export**: `$app.SaveAsText(acForm=2 | acReport=3, name, tempPath)` → writes `.form.txt` in CP-1252 encoding
- **Import**: `$app.LoadFromText(type, name, tempAnsiPath)` → reads ANSI temp file
- **Normalization before import** (lines ~1016–1025): `Normalize-AccessDocumentTextForLoadFromText` pipeline:
  - `Remove-AccessDocumentRootNameProperty`: strips `Name = "..."` from root `Begin Form` (Access rejects it)
  - `Normalize-AccessDocumentRootEndMarker`: changes `End Form`/`End Report` → `End` (Access rejects the explicit suffix)
  - `Normalize-AccessDocumentCodeBehindMarker`: fixes `CodeBehind` → `CodeBehindForm`/`CodeBehindReport`
  - `Normalize-AccessDocumentOrphanCodeBehindSection`: inserts missing CodeBehind marker
- **Validation** (lines ~1027–1073): `Assert-AccessDocumentTextLooksLoadable` — validates header format, CodeBehind placement
- **Canonical header merge** (lines ~897–917): `Merge-AccessDocumentWithCanonicalHeader` — for existing forms, does `SaveAsText` to get the live binary header, then injects local code-behind into it. This is the critical guard preventing stale headers.
- **Encoding**: disk read as UTF-8 (for our source), write as CP-1252 ANSI temp before LoadFromText

### .form.txt Format (verified from real fixtures in E2E_testing/src/forms/)

```
Version =21
VersionRequired =20
PublishOption =1       ← noise (already in FORM_NOISE_KEYS)
Checksum =-868279142   ← noise (already in FORM_NOISE_KEYS)
Begin Form
    RecordSelectors = NotDefault
    Width =10206
    Caption ="..."
    OnOpen ="[Event Procedure]"
    RecSrcDt = Begin   ← noise blob
        0x...
    End
    GUID = Begin       ← FUNCTIONAL (must preserve)
        0x465afc03...
    End
    NameMap = Begin    ← noise (in FORM_NOISE_KEYS)
        ...
    End
    PrtDevMode = Begin ← noise blob
        0x...
    End
    NoSaveCTIWhenDisabled =1
    Begin              ← unlabeled block = the control container
        Begin Label
            BackStyle =0
            FontSize =11
            ...
        End
        Begin CommandButton
            Width =1701
            ...
        End
        Begin FormHeader
            Height =727
            ...
        End
        Begin Section
            CanGrow = NotDefault
            Height =6464
            Begin TextBox ... End
            Begin ComboBox ... End
        End
        Begin FormFooter ... End
    End
End
CodeBehindForm
Attribute VB_Name = "Form_FormXYZ"
' VBA code here
```

Key observations:
- Control type names (Label, TextBox, CommandButton, etc.) are exact COM type names
- Properties are scalar assignments (`Key =Value`) or `Key = Begin ... End` blob blocks
- Toggle properties use `NotDefault`/`0`/`-1` serialization (already handled by classifier)
- Sections: `FormHeader`, `Section` (the Detail section), `FormFooter`
- Controls are inside sections (nested), and can also appear in an unlabeled `Begin` block at the top level
- Binary blobs (PrtDevMode, GUID, etc.) are hex dump lines — must be preserved opaquely
- GUID is functional; Checksum/PrtDevMode/NameMap/RecSrcDt/PrtMip are noise
- CodeBehind section lives AFTER the root `End`

### World 2 — JSON Stub (src/core, disconnected)

**File**: `src/core/services/vba-form-service.ts`

Currently:
- `VbaFormService`: validates specs, writes `.form.json` stubs, maintains a catalog
- Control model: only `{name: string, type: string}` — no geometry, no properties, no bindings
- `generateForm`: writes a `.form.json` file to disk — **does NOT create a live Access form**
- **README lie** (line 647): "Compile a form spec into a live Access form" — false, must be corrected

**File**: `src/adapters/vba-sync/vba-forms-adapter.ts`

Handles: `generate_erd`, `validate_form_spec`, `generate_form`, `catalog_add_control`, `harvest_form_catalog`. Correctly separates from runner orchestration (no resolveExecutionTarget calls).

### GitHub Issues

- **#559** (closed): `verify_code` VBE-cache caveat — already fixed in v1.9.0
- **#560** (closed/resolved): binary-vs-source drift — resolved in v1.9.0 semantic diff pass
- **#563** (open): **Real consumer demand** from no_conformidades/Telefónica:
  - `dysflow_inspect_form`: read controls as JSON from the BINARY via COM `VBE...Designer`
  - `dysflow_compare_form`: binary-vs-source comparison (drift detection per form, not module)
  - This is the "read" slice. Requires Access to be open for the COM path; source-path parse is the testable alternative.

### Existing Reusable Infrastructure

| Asset | Status | Notes |
|---|---|---|
| `src/core/mapping/component-resolver.ts` | Directly reusable | maps form/report names → folder + `.form.txt` ext |
| `src/core/services/vba-semantic-classifier.ts` | Directly reusable | `stripFormSerializationNoise`, `FORM_NOISE_KEYS`, `stripCodeBehindSection` |
| `src/core/services/vba-source-comparison.ts` | Directly reusable | full comparison service; `compare_module` already exists |
| `src/adapters/vba-sync/vba-forms-adapter.ts` | Extend (add new tool routes) | good port isolation |
| `src/core/services/vba-form-service.ts` | Partially reuse | port interfaces (FormFileSystemPort) are good; controls model must be upgraded |
| PS1: Normalize/Assert/Merge functions | Cannot be replaced | they are the Access-compatibility contract; any write-back path MUST go through them |

---

## The Form IR Concept

A round-trippable JSON model of a form (the IR = Intermediate Representation):

```typescript
interface FormIR {
  name: string;
  kind: "Form" | "Report";
  version: string;         // "21"
  versionRequired: string; // "20"
  properties: Record<string, FormPropertyValue>;  // scalar form-level props
  sections: FormSection[];
  opaqueBlobs: Record<string, string[]>;  // hex lines for GUID, RecSrcDt, etc.
  codeBehindMarker: string; // "CodeBehindForm" or "CodeBehindReport"
}

interface FormSection {
  type: "FormHeader" | "Section" | "FormFooter" | "unlabeled";
  properties: Record<string, FormPropertyValue>;
  controls: FormControl[];
}

interface FormControl {
  type: string;   // "Label", "TextBox", "CommandButton", etc.
  properties: Record<string, FormPropertyValue>;
  controls?: FormControl[];  // nested (tabs, subforms)
  opaqueBlobs?: Record<string, string[]>;
}

type FormPropertyValue =
  | { scalar: string }           // "Width =10206" → Width: { scalar: "10206" }
  | { toggle: boolean }          // "RecordSelectors = NotDefault"
  | { blob: string[] }           // hex lines
```

**Lossless round-trip feasibility assessment**:
- Scalar properties: straightforward parse/serialize (Key =Value)
- Binary blobs: preserve as opaque string arrays → round-trip is lossless
- Toggle properties (NotDefault/0/-1): the classifier already handles these; the parser needs to normalize consistently
- Property ordering: Access's SaveAsText has an implicit ordering that LoadFromText may or may not depend on. This is the **biggest unknown risk** — needs empirical testing with real fixtures
- Checksum: noise (in FORM_NOISE_KEYS); strip before LoadFromText. Access regenerates it on import
- GUID: must preserve exactly
- CodeBehind: parsed separately, kept outside the IR (owned by the .cls)

**Round-trip test strategy**: parse real fixtures from `E2E_testing/src/forms/*.form.txt` → serialize → compare (after noise stripping) → should match. This can be done without Access using the fixtures already in the repo.

---

## Source-of-Truth Tension (Key Architectural Fork)

The fundamental question: when an agent mutates or reads a form, which path does it use?

### Option A: Source-Path Only (parse .form.txt → IR → mutate → serialize → LoadFromText)

**Pros**:
- No Access required for read
- Version-controlled source is the input
- Testable without COM (pure TS functions)
- Works in CI (pnpm test, no Access)

**Cons**:
- Lossless round-trip fidelity challenge (property ordering, encoding, GUID stability)
- Cannot read form state not yet exported to source
- Requires Access to be open for the final LoadFromText step (but that's already the case today)
- Write must still go through PS1 guards (Normalize/Assert/Merge) to be safe

**Effort**: Medium. Parser for .form.txt is new work; the serializer is the hard part (property order).

### Option B: Binary/COM Path Only (COM Designer API, Access must be open)

**Pros**:
- Gets authoritative live state
- What issue #563 specifically requests for inspect_form
- No round-trip fidelity concern for the read side

**Cons**:
- Requires Access to be open (no offline capability)
- Hard to test (integration only, needs Windows + Access COM)
- COM Designer API for forms is more complex than VBE.CodeModules
- Mutation via COM (modifying Designer objects) is extremely fragile and undocumented

**Effort**: High for mutation; Medium for read-only inspect.

### Option C: Hybrid (recommended for design phase evaluation)

- **Read/Inspect** (offline): parse `.form.txt` → emit IR → `inspect_form` response. Source path.
- **Read/Inspect** (live): COM `SaveAsText` → parse → emit IR. More accurate but needs Access.
- **Template clone**: parse `.form.txt` of base form → mutate IR → serialize new `.form.txt` → `LoadFromText` via PS1 guards (same path as today's import_modules). Source path for read, PS1 path for write.
- **Compare** (`compare_form`): parse both sides → use existing semantic classifier. Source path.

Key insight: the PS1 `Merge-AccessDocumentWithCanonicalHeader` function is already a hybrid — it does SaveAsText to get the canonical header, then injects local code. A template clone could follow the same model: export base form to get canonical header, then replace the control tree with the new IR-serialized controls.

---

## Templates: Use Form X as Base for Form Y

The read→mutate→write model:

1. **Read source** of template form: `parse(forms/Form_X.form.txt)` → IR
2. **Clone IR**: copy IR, rename (`Form_X` → `Form_Y`), apply parameterization
3. **Parameterize**: replace Caption, RecordSource, control names/bindings via mutation primitives
4. **Serialize**: `serialize(IR_Y)` → `.form.txt` text
5. **Write to disk**: `forms/Form_Y.form.txt` (creates a new managed source file)
6. **Import to binary**: `import_modules({moduleNames: ["Form_Y"]})` → invokes PS1 Import-VbaModule → LoadFromText with guards

The PS1 import path is already the right path for step 6. For step 2-4, new pure TS functions are needed.

Template parameterization primitives needed:
- `renameForm(ir, newName)`: change name
- `setFormProperty(ir, key, value)`: e.g., RecordSource, Caption
- `addControl(ir, section, control)`: append a control to a section
- `removeControl(ir, controlName)`: delete by name
- `setControlProperty(ir, controlName, key, value)`: Width, Height, ControlSource, etc.
- `moveControl(ir, controlName, section)`: move between sections

---

## Mutation Primitives as Pure Core Functions

Target: `src/core/services/form-ir-service.ts` or similar. All pure, no I/O.

```typescript
function parseFormTxt(text: string): FormIR
function serializeFormTxt(ir: FormIR): string
function findControl(ir: FormIR, name: string): FormControl | undefined
function addControl(ir: FormIR, sectionType: SectionType, control: FormControl): FormIR
function removeControl(ir: FormIR, controlName: string): FormIR
function setFormProperty(ir: FormIR, key: string, value: FormPropertyValue): FormIR
function setControlProperty(ir: FormIR, controlName: string, key: string, value: FormPropertyValue): FormIR
function renameForm(ir: FormIR, newName: string): FormIR
```

These are pure functions: input IR → output IR. No COM, no filesystem. Testable with `pnpm test`.

---

## Risks

1. **Lossless round-trip property ordering**: Access's SaveAsText has an implicit property order within each control block. If LoadFromText requires exact ordering, the serializer must replicate it. This needs empirical testing with real fixtures — UNKNOWN risk magnitude.

2. **Binary blob preservation**: hex data in PrtDevMode blocks contains printer settings. If a control has binary sub-blocks (not just the form-level noise), those must also be preserved opaquely. The parser must handle arbitrary `Key = Begin ... End` blocks within controls.

3. **Encoding 1252/UTF-8 boundary**: The PS1 reads as UTF-8 from our source files, writes ANSI temp for LoadFromText. The serializer must produce text that survives this conversion. Non-ASCII content in string properties (Spanish form captions in this codebase) must not be corrupted. Already handled by the PS1 path; the IR serializer must not add new encoding risks.

4. **Requiring Access to be open for binary path**: The COM path for `inspect_form` (issue #563 primary request) requires Access to be running. The source-path parse is an alternative that works offline. The design must decide whether `inspect_form` requires Access or works from source.

5. **Scope size**: Full form factory (parse + serialize + mutations + templates + COM inspect + compare) is large. The slice breakdown below mitigates this.

6. **GUID must survive clone**: When cloning a form from template, the new form GUID must be different (otherwise Access may confuse the two forms). The IR must either strip GUID (let Access assign a new one on import) or generate a synthetic GUID. This needs verification with Access behavior.

7. **README/docs honesty**: `generate_form` currently claims to create a live Access form. This must be fixed in the same change or immediately before. Otherwise agents will continue misusing the tool.

---

## TDD Strategy (Strict TDD Active, runner: pnpm test / vitest)

Per `docs/testing/testing-philosophy.md`: test at the ports, mock only I/O boundaries, refactor-safe.

**Slice 1 (parser/serializer) — pure unit tests**:
- Input: raw text from `E2E_testing/src/forms/*.form.txt` fixtures (these are real exported forms)
- `parseFormTxt(text)` → assert structure: name, sections, controls, blob keys
- `serializeFormTxt(parseFormTxt(text)) === stripNoise(text)` — round-trip property test
- Edge cases: forms with no controls, nested tabs, binary-only blobs
- All these are pure functions, no mock needed, run under `vitest.config.ts`

**Slice 2 (mutation primitives) — port-level integration**:
- Drive `addControl` / `removeControl` / `setProperty` through the service
- Assert on the resulting serialized .form.txt text (observable output)
- No COM, no filesystem — mock FormFileSystemPort as done in existing tests

**Slice 3 (template clone use case) — port-level integration**:
- `FormTemplateService.cloneForm(baseIr, newName, params)` → new IR
- Verify the output serializes to valid .form.txt (parse back and check name changed, GUID differs)
- Verify that the import step is issued via the PS1 port (already tested pattern in VbaModulesAdapter tests)

**Slice 4 (COM inspect — integration only)**:
- Goes in `vitest.integration.config.ts` (needs Windows + Access COM)
- Test against real forms in E2E_testing project
- Cannot be unit-tested (COM boundary)

---

## Recommended Slice Breakdown for Chained Delivery

| Slice | Scope | Value | Risk |
|---|---|---|---|
| 1. Parse + inspect_form (source) | `parseFormTxt` → IR; new `inspect_form` MCP tool (source path) | Closes half of #563; unblocks everything | Medium (property ordering) |
| 2. Compare + compare_form | `compare_form` source-vs-source (uses existing classifier) | Closes rest of #563 | Low |
| 3. Serialize + round-trip | `serializeFormTxt`; round-trip property tests with fixtures | Enables write path | Medium-High (ordering risk) |
| 4. Mutation primitives | Pure core: addControl/removeControl/setProperty/renameForm | Enables templates | Low (pure functions) |
| 5. Template clone | `cloneForm` use case; new MCP tool `create_form_from_template` | The "factory" user story | Medium |
| 6. README honesty + docs | Fix `generate_form` description, document IR approach | Prevents agent misuse | Low |

Slice 6 can go with Slice 1 as a docs-only commit (no functional change).

---

## Affected Files

- `src/core/services/vba-form-service.ts` — extend or replace controls model; add FormIR types
- `src/core/services/form-ir-service.ts` (NEW) — pure parser, serializer, mutation primitives
- `src/adapters/vba-sync/vba-forms-adapter.ts` — add `inspect_form`, `compare_form`, `create_form_from_template` routes
- `src/adapters/mcp/tool-parity-registry.ts` — register new tools
- `src/adapters/mcp/schemas/dysflow-schemas.ts` (or wherever tool schemas live) — add schemas
- `src/shared/validation/schema-props.ts` — may need new form IR props
- `src/core/mapping/component-resolver.ts` — no change needed (directly reusable)
- `src/core/services/vba-semantic-classifier.ts` — no change (reuse stripFormSerializationNoise)
- `README.md` — fix `generate_form` description
- `test/core/services/form-ir-service.test.ts` (NEW) — parser/serializer tests using fixtures
- `test/adapters/vba-sync/vba-forms-adapter.test.ts` — add new tool coverage
- `scripts/dysflow-vba-manager.ps1` — no change (PS1 guards are the write contract; import_modules path reused as-is)
