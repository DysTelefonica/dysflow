# Proposal: forms-ui-factory-slice-1

> SDD change `forms-ui-factory-slice-1` for dysflow. Closes issue **#596** (Slice 1 of 5 in
> the Form UI Factory epic **#595**). Artifact store: hybrid (this file + Engram
> `sdd/forms-ui-factory-slice-1/proposal`).
> Reads: epic proposal/design at `openspec/changes/form-ui-factory/{proposal,design}.md`.

## Status — already shipped in `main`

Slice 1 of the Form UI Factory is **already implemented and shipped** in `main` as
part of dysflow `v1.9.5` and `v1.10.0`. This SDD change is the **formal closure** of
issue #596: it writes the specs that lock the contract, validates that the shipped
behaviour matches those specs, and archives the existing implementation commits under
a single audit trail.

This is the honest state. The user's prompt anticipated this: *"Aceptar lo ya
implementado como foundation (parseFormTxt, serializeFormTxt, inspect_form) si cumple
el scope, y añadir la 'README honesty'…"* — the foundation was already accepted, the
README honesty was already in `main` line 664, and there is nothing new to ship in this
slice beyond the SDD artifacts themselves plus one small doc-anchor test that locks the
honesty claim so it cannot silently regress.

## Intent

Formally close Slice 1 of the Form UI Factory so that issue #596 can be closed with
evidence (commit SHAs, test references, archive path). Lock the three slice-1 contracts
behind behaviour-first tests against real `E2E_testing/src/forms/*.form.txt` fixtures,
and pin the README honesty claim behind a doc-anchor test that fails if the README ever
re-introduces the "compile a live Access form" lie for `generate_form`.

## Scope

### In scope

- **FormIR model contract** — `src/core/models/form-ir.ts` (already shipped): ordered
  arrays + recursive `FormNode` tree, NOT maps. The contract is what survives a
  behaviour-preserving refactor: `serializeFormTxt(parseFormTxt(x)) === normalizeLineEndings(x)`
  for every real fixture.
- **`parseFormTxt` contract** — `src/core/services/form-ir-service.ts` (already shipped):
  preamble + recursive `Begin … End` parse + `CodeBehindForm` split + duplicate-key
  preservation + opaque blob preservation + Spanish caption survival.
- **`inspect_form` source-only MCP tool** — `src/adapters/vba-sync/vba-forms-adapter.ts`
  (already shipped): reads the version-controlled `.form.txt` via the injectable
  `FormFileSystemPort`, returns `{ name, kind, controls, events }`. **Source-only** —
  no Access COM, no `LoadFromText`, no live state.
- **README honesty** — `README.md` line 664 (already shipped) and `AGENTS.md` form
  inspection section (already shipped): `generate_form` is documented as writing a
  `.form.json` stub, NOT compiling a live Access form.
- **Doc-anchor test for the honesty claim** — a new `test/docs/forms-ui-factory-readme.test.ts`
  that reads `README.md` and asserts the `generate_form` entry does not contain
  "live Access form" / "compile" / "create" alone with `generate_form`, locking the
  contract from future regressions.

### Out of scope / non-goals

- **No new write paths.** Writes go through the existing guarded PS1
  `import_modules` path; this slice is read-only.
- **No mutation primitives.** `addControl`, `removeControl`, `setProperty`,
  `moveControl`, `bindControl`, `renameForm` are Slice 4.
- **No `serializeFormTxt` extension.** The serializer is already shipped and
  round-trip-tested; the round-trip property tests are in scope of this slice
  because they are the regression net for the parser, but no new serialize logic
  is added.
- **No `compare_form`.** That is Slice 2.
- **No `create_form_from_template`.** That is Slice 5.
- **No `live` COM-refresh flag for `inspect_form`.** Reserved for a future slice
  per the parent design.
- **No Access install / no PowerShell mutation.** The slice stays source-only and
  pure-Node; it MUST run under `pnpm test` without Windows + Access COM.

## Approach (headline)

1. **Accept the shipped foundation as the implementation.** The commits already in
   `main` (`a6420b5`, `d23bc3a`, `1ece781`, `8eecb77`, `63dea09`) implement every
   functional requirement of slice 1. We do not re-implement; we re-verify and lock.
2. **Write the three contract specs.** `specs/form-ir-models.md`,
   `specs/inspect-form-source.md`, `specs/readme-honesty.md` — written from the user's
   prompt and the issue body, not lifted from the implementation, so the specs are
   the source of truth and the code is the answer.
3. **Add one small doc-anchor test** (`test/docs/forms-ui-factory-readme.test.ts`)
   that pins the README honesty claim. RED-first: write the test, watch it pass
   against the current README, lock the contract. ~25 lines.
4. **Run the local quality gates** (`pnpm test`, `pnpm build`, `pnpm lint`,
   `pnpm test:ps1` if available) and confirm no new failures.
5. **Commit the SDD artifacts + the new doc-anchor test** as a single
   `chore(sdd): formalize forms-ui-factory-slice-1` commit referencing issue #596.
6. **Archive** to `openspec/changes/archive/2026-06-29-forms-ui-factory-slice-1/`
   with an archive report listing the implementation commits already in `main`.
7. **Close issue #596** with an evidence comment naming the commit SHAs, the test
   references, and the archive path.
8. **Save an Engram observation** under topic `sdd/forms-ui-factory-slice-1` with
   `capture_prompt: false` (this is an SDD artifact, not a human decision).

## Honest accounting of what was already done vs. added by this SDD

| Concern                         | Already in `main`                                                                                                | Added by this SDD                                            |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `FormIR` types                  | `a6420b5` — `src/core/models/form-ir.ts`                                                                         | none                                                         |
| `parseFormTxt` + tests          | `a6420b5` — `src/core/services/form-ir-service.ts`, `test/core/services/form-ir-parse.test.ts`                   | none                                                         |
| `serializeFormTxt` + tests      | `d23bc3a`, `8eecb77` — `src/core/services/form-ir-service.ts`, `test/core/services/form-ir-serialize.test.ts`    | none                                                         |
| `inspect_form` MCP tool         | `1ece781` — adapter, registry, schema, parity entry, `test/adapters/vba-sync/vba-forms-adapter-inspect.test.ts`  | none                                                         |
| `FormFileSystemPort.readFile`   | already present (used by `inspect_form`)                                                                         | none                                                         |
| README honesty (`generate_form`)| `63dea09` — `README.md:664`                                                                                      | doc-anchor test that locks it                                |
| `AGENTS.md` form factory section| `63dea09`                                                                                                        | none                                                         |

## Review Workload Forecast

- **Estimated changed lines in this SDD**: ~310 (proposal ~120, 3 specs ~120, tasks
  ~70, doc-anchor test ~25, archive report ~50). Well under the 400-line budget.
- **400-line budget risk**: Low.
- **Chained PRs recommended**: No (dysflow is main-only with no PRs; release policy
  forbids PRs).
- **Decision needed before apply**: No.

## Success criteria

- `openspec/changes/forms-ui-factory-slice-1/{proposal,specs/*,tasks}.md` exist and
  describe WHAT the shipped behaviour does, not HOW it was implemented.
- The new doc-anchor test (`test/docs/forms-ui-factory-readme.test.ts`) is RED-first
  and passes against the current `README.md`.
- `pnpm test` is green (modulo the pre-existing flaky `access-operation-registry`
  Windows EPERM test that is unrelated to this slice; flagged in the archive report).
- `pnpm build` and `pnpm lint` are green.
- An archive report is committed under
  `openspec/changes/archive/2026-06-29-forms-ui-factory-slice-1/archive-report.md`
  listing the implementation commits and their test references.
- Issue #596 is closed with evidence.
- An Engram observation is saved under topic `sdd/forms-ui-factory-slice-1`.

## Links

- **Issue**: #596 — `feat(forms): Slice 1 — Form IR parser + models + inspect_form (source) + README honesty`
- **Epic**: #595 — Form UI Factory
- **Consumer issue**: #563 — read/compare slice (no_conformidades / Telefónica)
- **Parent change**: `openspec/changes/form-ui-factory/` (proposal, design, tasks)
- **Implementation commits (already in `main`)**:
  - `a6420b5` — `feat(form-ir): add FormIR model and pure parseFormTxt service`
  - `d23bc3a` — `feat(forms): parseFormTxt and serializeFormTxt round-trip implementation`
  - `1ece781` — `feat(mcp): register inspect_form tool — read control tree offline`
  - `8eecb77` — `feat(forms): round-trip tests and compilation resilience refinements`
  - `63dea09` — `docs: fix generate_form description and add form-ui-factory agent guide`
