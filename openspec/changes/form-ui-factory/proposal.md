# Proposal: form-ui-factory

> SDD change `form-ui-factory` for dysflow. Phase: propose. Artifact store: hybrid.
> Source exploration: `openspec/changes/form-ui-factory/explore.md` (Engram `sdd/form-ui-factory/explore`).

## Intent

Turn dysflow into a **form factory** that an AI agent can drive: create, modify, and
template Microsoft Access forms and reports **without hand-editing raw `.form.txt`**.

Today an agent that wants to touch a form has to read and write the raw Access
`SaveAsText` serialization — a format hostile to LLMs (twips geometry, hex binary
blobs, CP-1252 encoding, implicit property ordering). Several PowerShell guard
functions exist *only* to catch the mistakes AI agents make when they edit that text by
hand. The intent is to replace hand-editing with a structured, round-trippable
**Form IR** (Intermediate Representation): parse `.form.txt` → IR JSON → mutate → serialize
back to `LoadFromText`-valid text, importing through the existing guarded PS1 write path.

**Success looks like**: an AI agent can
1. read a form into structured JSON,
2. clone form X as the base for a new form Y,
3. add/modify/move/bind controls and form properties through pure primitives,
4. import the result via the existing guarded `import_modules` path,

all without writing raw `.form.txt` by hand, and with `serialize(parse(x))` stable modulo
known noise.

## Problem

dysflow has **two disconnected form worlds**:

1. **The real round-trip** (`scripts/dysflow-vba-manager.ps1`): `SaveAsText` exports a
   `.form.txt`, `LoadFromText` imports it. Around the import sit normalize/assert/merge
   guard functions (`Normalize-AccessDocumentTextForLoadFromText`,
   `Assert-AccessDocumentTextLooksLoadable`, `Merge-AccessDocumentWithCanonicalHeader`)
   that make Access accept the text and prevent stale headers. This path WORKS and is the
   real write contract.

2. **A half-baked JSON stub** (`src/core/services/vba-form-service.ts`): `generate_form`
   writes a `.form.json` stub to disk and maintains a catalog whose control model is only
   `{name, type}` — no geometry, no properties, no bindings. It does **NOT** create a live
   Access form. `README.md:647` falsely claims it can "compile a form spec into a live
   Access form". This is a documentation lie that causes agent misuse.

The two worlds never meet. The factory the consumer actually needs (issue #563 from
no_conformidades/Telefónica, epic #595) does not exist: there is no way to read a form's
controls as JSON, no way to compare a form's source against its binary, and no way to
template a form. The raw `.form.txt` remains the only real interface, and it is precisely
the interface an LLM handles worst.

## Approach (headline)

Introduce a structured, **round-trippable Form IR** as the agent-facing model, with a new
pure-core service and maximal reuse of existing, proven infrastructure.

- **New pure-core service** `src/core/services/form-ir-service.ts`:
  `parseFormTxt(text) → FormIR`, `serializeFormTxt(ir) → text`, and pure mutation
  primitives (`addControl`, `removeControl`, `setProperty`, `moveControl`, `bindControl`,
  `renameForm`). No COM, no filesystem — testable under `pnpm test`.
- **Reuse as-is**:
  - `component-resolver.ts` (form/report name → folder + `.form.txt` extension),
  - `vba-semantic-classifier.ts` (`FORM_NOISE_KEYS`, `stripFormSerializationNoise`,
    `stripCodeBehindSection`) for noise handling and `compare_form`,
  - `vba-source-comparison.ts` for the comparison plumbing,
  - the existing PS1 `import_modules` write path — its normalize/assert/merge guards ARE
    the Access-compatibility contract and must not be bypassed or reimplemented.
- **Templates = read → mutate → write**: parse the base form's `.form.txt` into IR, clone
  and parameterize the IR, serialize a new `.form.txt`, then import through the existing
  guarded path (the same path `Merge-AccessDocumentWithCanonicalHeader` already uses to
  inject local code into a canonical header).
- **CodeBehind stays out of the IR**: form code-behind is owned canonically by the
  `forms/*.cls`; the IR models UI/layout only (consistent with the semantic-classifier
  contract in AGENTS.md).

## Key architectural decision (deferred to design — framed here)

**Source-of-truth fork.** When an agent reads or mutates a form, which path is authoritative?

- **Option A — Source path only**: parse `.form.txt` → IR → mutate → serialize →
  `LoadFromText`. No Access needed for read; fully testable in CI; but bears the
  round-trip fidelity risk (property ordering, encoding, GUID stability) and cannot see
  un-exported live state.
- **Option B — Binary/COM only**: read live state through the COM Designer API (Access must
  be open). Authoritative for reads, but integration-only (hard to test), and COM-based
  mutation is fragile and undocumented.
- **Option C — Hybrid (exploration recommendation, source-path-first)**: source-path parse
  for offline `inspect_form`/`compare_form`/template reads; optional `SaveAsText` for live
  freshness when Access is open; PS1 guarded `LoadFromText` for all writes. Mirrors the
  existing `Merge-AccessDocumentWithCanonicalHeader` hybrid.

**This is the central design question.** The exploration recommends **Option C, source-path
first**. The design phase makes the final call and decides specifically whether
`inspect_form` requires Access (live COM) or reads from source by default.

## Scope

### In scope
- Form IR parser (`parseFormTxt`) and serializer (`serializeFormTxt`).
- `inspect_form` MCP tool — read a form into IR JSON (source path).
- `compare_form` MCP tool — source-vs-source comparison via the existing semantic classifier.
- Pure mutation primitives: `addControl`, `removeControl`, `setProperty`, `moveControl`,
  `bindControl`, `renameForm`.
- `create_form_from_template` use case + MCP tool — the factory user story.
- README honesty fix for `generate_form` (no longer claim "live Access form").
- Round-trip property tests against real fixtures in `E2E_testing/src/forms/*.form.txt`.

### Out of scope / non-goals (for now)
- Binary COM mutation as the primary write path (writes go through PS1 `import_modules`).
- A visual/WYSIWYG designer.
- Report-specific extensions beyond what falls out for free from the shared form/report
  serialization.
- Replacing or weakening the PS1 normalize/assert/merge guards.

## Slice plan (chained delivery, ask-on-risk)

1. **Read slice** — `parseFormTxt` → IR + `inspect_form` MCP tool (source path) +
   README honesty fix. Addresses the read half of #563. README fix can ride as a docs-only
   change in this slice.
2. **Compare slice** — `compare_form` (source-vs-source, reuses
   `stripFormSerializationNoise` + comparison service). Addresses the compare half of #563.
3. **Serialize slice** — `serializeFormTxt` + round-trip property tests on real fixtures.
   **De-risks property ordering** — this slice must empirically validate that
   `serialize(parse(x))` is stable modulo known noise before it closes.
4. **Mutation slice** — pure primitives: `addControl`, `removeControl`, `setProperty`,
   `moveControl`, `bindControl`, `renameForm`.
5. **Factory slice** — `create_form_from_template` use case + MCP tool: clone form X as a
   base for form Y, parameterize, serialize, import via the guarded PS1 path.

Slices 1–2 deliver standalone consumer value (#563) before the higher-risk serialize work.

## Risks & open questions

- **Property ordering in the serializer** — Access `SaveAsText` has an implicit property
  order; `LoadFromText` may depend on it. MUST be validated empirically against fixtures
  before slice 3 closes. Biggest unknown.
- **GUID handling on clone** — strip (let Access assign a fresh one on import) vs
  regenerate a synthetic GUID. Verify Access behavior before slice 5; a duplicated GUID may
  make Access confuse the two forms.
- **Encoding boundary** — CP-1252 / UTF-8 with Spanish captions. The serializer must not
  introduce encoding corruption the PS1 path already handles.
- **`inspect_form` Access dependency** — does it require Access (live COM) or read from
  source? Decided in design (tied to the Option A/B/C fork).
- **Binary blob preservation** — controls may carry their own `Key = Begin ... End` blobs,
  not just form-level noise; the parser must preserve arbitrary blobs opaquely.

## Success criteria

- An AI agent reads a form into structured JSON, clones form X as a base for Y,
  adds/modifies controls, and imports the result through the existing guarded path — with
  no hand-editing of raw `.form.txt`.
- `serializeFormTxt(parseFormTxt(x))` is stable modulo known noise (`FORM_NOISE_KEYS`).
- `inspect_form` and `compare_form` satisfy the #563 consumer demand.
- `README.md` no longer claims `generate_form` produces a live Access form.

## Links

- Epic **#595**.
- Consumer issue **#563** (read/compare slice; no_conformidades/Telefónica).
- **#559** and **#560** are CLOSED (fixed in v1.9.0) — do NOT treat as open.
