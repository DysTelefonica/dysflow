# Design: form-ui-factory

> SDD change `form-ui-factory` for dysflow. Phase: design. Artifact store: hybrid.
> Reads: `proposal.md` (Engram `sdd/form-ui-factory/proposal`), `explore.md`.
> Verified against real code (see "Code verification" notes inline).

## Technical Approach

A new **pure-core** service (`src/core/services/form-ir-service.ts`, types in
`src/core/models/form-ir.ts`) parses `.form.txt` into a **lossless, order-preserving Form IR**,
serializes it back, and exposes pure mutation primitives. Three new MCP tools (`inspect_form`,
`compare_form`, `create_form_from_template`) are routed through the existing `VbaFormsAdapter`.
Reads parse from source; writes serialize to a `.form.txt` and go through the **existing,
unchanged PS1 `import_modules` guarded path** (`LoadFromText` + Normalize/Assert/Merge). The
legacy `VbaFormService` (`generate_form`, `catalog_*`, spec validation) is untouched except a
README honesty fix.

## Architecture Decisions

### Decision: Source-of-truth fork — Option C, source-path-first (HEADLINE)

**Choice**: `inspect_form` and `compare_form` read from the version-controlled `.form.txt` by
default (offline, no Access, fully testable under `pnpm test`). A reserved `live?: boolean` flag
(integration-only, NOT in the first slices) may later refresh via COM `SaveAsText`. All writes
serialize IR → `.form.txt` → existing PS1 `import_modules` (`LoadFromText` + guards).
**Alternatives**: A (source-only, no live read) loses un-exported live state; B (COM-only) needs
Access open, is integration-only, and COM mutation is fragile/undocumented.
**Rationale**: source-path-first gives offline, CI-testable read/compare (closes #563's read+compare
halves with zero COM), while writes reuse the proven guard contract. Mirrors the existing hybrid
`Merge-AccessDocumentWithCanonicalHeader`. Mutations never touch the binary directly.

### Decision: IR property model is ordered arrays, NOT maps

**Choice**: properties are `PropertyEntry[]` (ordered, duplicate keys preserved), and the form body
is a recursive `FormNode` tree, NOT `Record<string, value>` + a flat sections/controls split.
**Alternatives**: the explore sketch's `properties: Record<string, FormPropertyValue>` and a
fixed `FormSection[]`/`FormControl[]` shape.
**Rationale**: **Code verification killed the map model** — `E2E_testing/src/forms/Form_frmBusy.form.txt`
emits `NoSaveCTIWhenDisabled =1` on two consecutive lines (L57–58). A JS object silently collapses
duplicate keys and reorders numeric-like keys, so a map cannot round-trip losslessly. The real file
is also a recursive `Begin … End` tree with **unlabeled `Begin` control containers** (L59, L83) and
**nameless default-style control blocks** (L60) that the fixed sections/controls shape cannot
represent. A recursive node tree mirrors `SaveAsText` exactly and round-trips by construction.

### Decision: GUID on clone — strip, let Access regenerate

**Choice**: `renameForm` (clone) strips the `GUID = Begin … End` blob entirely; Access assigns a
fresh GUID on `LoadFromText`, same as it regenerates `Checksum`.
**Alternatives**: synthesize a new GUID (format undocumented, risky) or keep it (duplicate GUID risks
Access confusing the two forms).
**Rationale**: lowest-risk; GUID is functional/identifying so it must not be duplicated. **Must be
verified empirically** in the slice-5 integration test before close.

### Decision: Encoding stays at the existing boundary

**Choice**: IR is pure `string` in / `string` out — never touches bytes. The adapter reads/writes
`.form.txt` as UTF-8 (matching existing source files); CP-1252 ANSI conversion for `LoadFromText`
remains owned by PS1, unchanged.
**Rationale**: preserving exact string content means Spanish captions (`"Espere..."`,
`"Procesando..."` in frmBusy) survive untouched. The serializer adds no new encoding risk.

## Interfaces / Contracts

```typescript
// src/core/models/form-ir.ts — lossless layer (mirrors SaveAsText)
type PropertyEntry =
  | { kind: "scalar"; key: string; value: string }   // "Width =4800"
  | { kind: "blob";   key: string; lines: string[] };  // "GUID = Begin\n  0x..\n End"

interface FormNode {
  blockType: string;        // "Form" | "Report" | "Label" | "Section" | "" (unlabeled Begin)
  entries: PropertyEntry[]; // ordered; duplicates preserved
  children: FormNode[];     // nested Begin blocks, ordered
}

interface FormIR {
  name: string;             // from filename/VB_Name — never a root `Name =` prop
  kind: "Form" | "Report";
  preamble: PropertyEntry[];// Version, VersionRequired, PublishOption, Checksum (before Begin Form)
  root: FormNode;           // the Begin Form … End tree
  codeBehind: string | null;// CodeBehindForm section preserved verbatim, NOT modeled (owned by .cls)
}

// src/core/services/form-ir-service.ts — all pure, no I/O
function parseFormTxt(text: string): FormIR;
function serializeFormTxt(ir: FormIR): string;
function findControl(ir: FormIR, name: string): FormNode | undefined; // by "Name" entry
function addControl(ir: FormIR, targetBlockType: string, control: FormNode): FormIR;
function removeControl(ir: FormIR, controlName: string): FormIR;
function setControlProperty(ir: FormIR, controlName: string, key: string, value: string): FormIR;
function setFormProperty(ir: FormIR, key: string, value: string): FormIR;
function moveControl(ir: FormIR, controlName: string, targetBlockType: string): FormIR;
function renameForm(ir: FormIR, newName: string): FormIR; // also strips GUID blob
```

**Ordering guarantee**: `serializeFormTxt(parseFormTxt(x)) === normalizeLineEndings(x)` byte-for-byte
because entries/children are ordered arrays. Mutations **modify in place or append** — they never
reorder existing entries — so post-mutation text stays Access-loadable.

## Data Flow

```
inspect_form:   name → resolveComponent → read .form.txt → parseFormTxt → IR JSON   (no Access)
compare_form:   read both → stripFormSerializationNoise + stripCodeBehindSection
                          → vba-source-comparison classifier → per-form drift       (no Access)
create_form_from_template (write, dry-run default):
   base name → read → parseFormTxt → renameForm + setProperty/addControl
            → serializeFormTxt → write forms/New.form.txt
            → import_modules({moduleNames:["New"]}) → PS1 LoadFromText + Normalize/Assert/Merge guards
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/models/form-ir.ts` | Create | FormIR / FormNode / PropertyEntry types |
| `src/core/services/form-ir-service.ts` | Create | parse, serialize, pure mutation primitives |
| `src/adapters/vba-sync/vba-forms-adapter.ts` | Modify | route `inspect_form`/`compare_form`/`create_form_from_template`; extend `handles()` |
| `src/adapters/mcp/mcp-tool-registry.ts` | Modify | add 3 names to `VBA_SYNC_TOOL_NAMES` |
| `src/adapters/mcp/tool-parity-registry.ts` | Modify | add to `implementedToolNames` + `buildDescription` |
| `src/adapters/mcp/schemas/*` | Modify | tool input schemas (dry-run default for the write tool) |
| `README.md` | Modify | honesty fix: `generate_form` writes a JSON stub, not a live form |
| `test/core/services/form-ir-service.test.ts` | Create | parse + round-trip property tests over fixtures |
| `test/adapters/vba-sync/vba-forms-adapter.test.ts` | Modify | new tool coverage via mock port |

Unchanged (reused as-is): `component-resolver.ts`, `vba-semantic-classifier.ts`
(`stripFormSerializationNoise`, `FORM_NOISE_KEYS`, `stripCodeBehindSection`),
`vba-source-comparison.ts`, `scripts/dysflow-vba-manager.ps1` (guards ARE the write contract).

## Write-gate alignment

`create_form_from_template` follows `generate_form`'s existing gate: dry-run is the default
(`apply === true ? false : params.dryRun !== false`); `apply:true` performs the write + import.
`inspect_form`/`compare_form` are read-only. Descriptions in `buildDescription` mark the write tool
"Write-gated".

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit (`pnpm test`) | parse structure; `serialize(parse(x))` round-trip over **all** `E2E_testing/src/forms/*.form.txt` (incl. duplicate-key + Spanish-caption frmBusy); mutation outputs | pure functions, no mocks; assert on observable text |
| Port (`pnpm test`) | the 3 tools via `VbaFormsAdapter` | mock `FormFileSystemPort`; assert result + that import is issued via the executor port — never internal call order |
| Integration (`vitest.integration.config.ts`, Windows+Access) | **slice-3**: serialized form survives `LoadFromText`; **slice-5**: clone import + GUID regeneration; optional `live` COM read | real Access COM |

North-star fit: round-trip tests assert text equality (observable behavior), so they survive any
parser-internal refactor.

## Migration / Rollout

No data migration. Legacy `VbaFormService` ({name,type} model, `generate_form`, `catalog_*`) stays
functional and is NOT migrated — it is superseded by FormIR for the new tools and gets a README
deprecation/clarification note only. New tools ship behind the slice plan (read → compare → serialize
→ mutate → factory), chained, ask-on-risk.

## Open Questions

- [ ] Property ordering through `LoadFromText` after mutation — **de-risk empirically in slice 3**
  (integration round-trip) before declaring the serializer safe.
- [ ] GUID-strip on clone — confirm Access regenerates a fresh GUID on import (slice-5 integration).
- [ ] `live` COM-refresh flag for `inspect_form` — design-reserved, deferred out of the first slices.
