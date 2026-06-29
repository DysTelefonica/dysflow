# Tasks: forms-ui-factory-slice-1

> Artifact store: hybrid (this file + Engram `sdd/forms-ui-factory-slice-1/tasks`).
> Strict TDD: every implementation task is preceded by a failing-test task.
> Delivery strategy: single commit / no PR (dysflow release policy is main-only, no PRs).
> Closes issue **#596** (Slice 1 of 5 in epic #595).

---

## Status — already shipped in `main`

Slice 1 was implemented in `main` across four feature commits and one docs commit
that already shipped in `v1.9.5` and `v1.10.0`. This tasks file therefore does not
re-implement; it **formally closes the slice** with:

- the three contract specs (`specs/form-ir-models.md`, `specs/inspect-form-source.md`,
  `specs/readme-honesty.md`),
- one new doc-anchor test that locks the README honesty claim,
- a single SDD-artifacts commit referencing issue #596,
- an archive report, an Engram observation, and the issue closure.

The work-unit table below is the formal record. The implementation SHAs are listed
under "Implementation commits" so the archive report can point to them with
verifiable evidence.

---

## Work Units

| ID   | Work Unit                                              | Layer    | TDD Cycle                                  | Commit                              |
|------|--------------------------------------------------------|----------|--------------------------------------------|-------------------------------------|
| WU-1 | Three contract specs (proposal + 3 specs + tasks)      | docs     | n/a (documentation contract)               | chore(sdd): formalize slice-1        |
| WU-2 | Doc-anchor test pinning README honesty claim            | unit     | RED: write test → GREEN: assert passes     | chore(sdd): formalize slice-1        |
| WU-3 | Quality gates (test, build, lint)                      | n/a      | n/a                                        | chore(sdd): formalize slice-1        |
| WU-4 | Archive report + Engram observation + close #596       | n/a      | n/a                                        | chore(sdd): archive slice-1          |

A single `chore(sdd)` commit carries WU-1 + WU-2 + WU-3 because they are the
formalization work; a second `chore(sdd)` commit carries WU-4 (the archive). Both
are well under the 400-line budget (see Review Workload Forecast).

---

## WU-1 — Write the three contract specs

**Files to create**:

- `openspec/changes/forms-ui-factory-slice-1/proposal.md` (already written — keeps
  the honest status note about slice 1 being already shipped).
- `openspec/changes/forms-ui-factory-slice-1/specs/form-ir-models.md` (already
  written — locks the IR model contract: ordered arrays, recursive tree, duplicate
  keys, opaque blobs, code-behind split, typed error, round-trip).
- `openspec/changes/forms-ui-factory-slice-1/specs/inspect-form-source.md` (already
  written — locks the MCP tool contract: source-only, return shape, error codes,
  read-only classification, `path` alias).
- `openspec/changes/forms-ui-factory-slice-1/specs/readme-honesty.md` (already
  written — locks the documentation contract for `generate_form` honesty and
  `inspect_form` source-only).
- `openspec/changes/forms-ui-factory-slice-1/tasks.md` (this file).

**Behavior locked in**: the three specs are the source of truth for the slice. Any
future refactor of `form-ir-service.ts` or `vba-forms-adapter.ts` must keep the
behaviour described here.

**No failing test** for a documentation contract — the failing-test gate applies to
behaviour code, not SDD artifacts. The artifacts are reviewed by the verify phase.

---

## WU-2 — Doc-anchor test that pins the README honesty claim

**File to create**: `test/docs/forms-ui-factory-readme.test.ts`

**Strict TDD cycle**:

1. **RED** — Write the test FIRST. Read `README.md` and assert:
   - The `generate_form` inventory entry contains `.form.json`.
   - The `generate_form` inventory entry does NOT contain
     `"compile a live Access form"` (the pre-Slice-1 lie) nor
     `"create a live Access form"` (the matching synonym).
   - The `inspect_form` inventory entry mentions `.form.txt` AND one of
     `offline` / `read-only` / `without Access`.
   - The test imports the existing `sectionBetween` helper from
     `test/docs/mcp-readme-tool-surface.test.ts` if available; otherwise
     re-implement it inline (~10 lines).

   The test MUST fail on the pre-Slice-1 README (the lie) and MUST pass on the
   current `README.md` after the `63dea09` honesty fix. Verify with `pnpm test`
   that the test passes against the current `README.md`.

2. **GREEN** — Confirm the test passes against the current `README.md` (the
   post-`63dea09` version). No production code change is needed; the test is
   self-contained against the on-disk README.

3. **TRIANGULATE** — Add at least two cases:
   - The `generate_form` honesty check (positive: `.form.json` is present; negative:
     the lie substrings are absent).
   - The `inspect_form` source-only check (positive: `.form.txt` + offline language
     are present).

4. **REFACTOR** — Extract the `sectionBetween` helper into a tiny shared module
   (`test/docs/_readme-section.ts`) so the test file stays focused on the
   honesty-claim assertions. Re-run `pnpm test` to confirm still green.

**Behavior locked in**: the README honesty claim is now under test; any future
revert of the honesty fix is caught by CI before it lands.

---

## WU-3 — Quality gates

Run the full local quality gate set and confirm everything that touches the slice
1 area is green:

1. `pnpm test` — must be green EXCEPT the pre-existing flaky
   `test/core/runner/access-operation-registry.test.ts` "concurrent get() calls all
   resolve without deadlock" test, which fails with a Windows `EPERM` on a
   `tmp → final` rename in `FileAccessOperationRegistry.writeRecords` and is
   unrelated to the slice 1 implementation. This failure is documented in the
   archive report and is NOT introduced by this SDD.
2. `pnpm test test/docs/forms-ui-factory-readme.test.ts` — must be green (the new
   doc-anchor test).
3. `pnpm test test/core/services/form-ir-parse.test.ts` — must be green (the
   shipped parser tests).
4. `pnpm test test/core/services/form-ir-serialize.test.ts` — must be green (the
   shipped serializer tests).
5. `pnpm test test/adapters/vba-sync/vba-forms-adapter-inspect.test.ts` — must be
   green (the shipped `inspect_form` tests).
6. `pnpm build` — must be green.
7. `pnpm lint` — must be green.

If any of the slice-1–touched gates fail, STOP and report. The pre-existing
`access-operation-registry` flake is the only allowed exception, and it is
explicitly flagged.

---

## WU-4 — Archive + Engram + close #596

**Files to create**:

- `openspec/changes/archive/2026-06-29-forms-ui-factory-slice-1/archive-report.md`
  with the metadata, the implementation commits table, the test references, the
  quality-gate status, and the outstanding items (Slices 2–5).
- Engram observation under topic `sdd/forms-ui-factory-slice-1` (capture_prompt
  false — this is an SDD artifact, not a human decision).

**Issue closure**: close issue #596 with an evidence comment naming:

- the implementation commit SHAs (`a6420b5`, `d23bc3a`, `1ece781`, `8eecb77`,
  `63dea09`),
- the new SDD formalization commit SHA,
- the test references (`test/core/services/form-ir-parse.test.ts`,
  `test/core/services/form-ir-serialize.test.ts`,
  `test/adapters/vba-sync/vba-forms-adapter-inspect.test.ts`,
  `test/docs/forms-ui-factory-readme.test.ts`),
- the archive path
  (`openspec/changes/archive/2026-06-29-forms-ui-factory-slice-1/`).

The comment MUST follow the format mandated by `gentle-ai:issue-closure-traceability`
so the closure is auditable from `gh issue view 596 --comments` and survives
binary/source restores.

---

## Implementation commits (already in `main`)

| Commit  | Subject                                                                         | SDD tasks                              | Verification                                                                                          |
|---------|---------------------------------------------------------------------------------|----------------------------------------|-------------------------------------------------------------------------------------------------------|
| `a6420b5` | `feat(form-ir): add FormIR model and pure parseFormTxt service`                | models + parser foundation             | `test/core/services/form-ir-parse.test.ts` (17 tests, frmSplash, frmBusy, corpus, malformed)        |
| `d23bc3a` | `feat(forms): parseFormTxt and serializeFormTxt round-trip implementation`     | serializer + round-trip                | `test/core/services/form-ir-serialize.test.ts` (round-trip + blob verbatim + duplicate order)        |
| `1ece781` | `feat(mcp): register inspect_form tool — read control tree offline`           | MCP tool registration + adapter        | `test/adapters/vba-sync/vba-forms-adapter-inspect.test.ts` (7 tests)                                 |
| `8eecb77` | `feat(forms): round-trip tests and compilation resilience refinements`         | serializer resilience + corpus coverage| `test/core/services/form-ir-serialize.test.ts` (extended corpus)                                       |
| `63dea09` | `docs: fix generate_form description and add form-ui-factory agent guide`     | README honesty                         | `test/docs/forms-ui-factory-readme.test.ts` (new in this SDD — locks the claim)                       |

**Access sync**: source-only. No `MSACCESS.EXE` invocation; no Access install
required; no `LoadFromText` / `SaveAsText`. CI runs `pnpm test` against the
Node-side suite; the source files for any form/report are not in the dysflow
Access project (`dysflow` does not own a frontend `.accdb`).

---

## Review Workload Forecast

| Field                                  | Value                                                                                    |
|----------------------------------------|------------------------------------------------------------------------------------------|
| Estimated changed lines in this SDD    | ~310 (proposal ~120, 3 specs ~120, tasks ~70, doc-anchor test + helper ~30, archive ~50) |
| 400-line budget risk                   | Low                                                                                       |
| Chained PRs recommended                | No (dysflow is main-only; release policy forbids PRs)                                     |
| Delivery strategy                      | single-commit + archive-commit                                                            |
| Decision needed before apply           | No                                                                                        |

Two `chore(sdd)` commits land in `main`:

1. `chore(sdd): formalize forms-ui-factory-slice-1` — carries the proposal, the three
   specs, the tasks file, and the new doc-anchor test (WU-1 + WU-2 + WU-3).
2. `chore(sdd): archive forms-ui-factory-slice-1` — carries the archive report
   (WU-4). The Engram observation is written separately and does not touch git.

Both commits are well under the 400-line budget on their own.
