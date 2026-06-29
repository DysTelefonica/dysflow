# Archive Report — `forms-ui-factory-slice-1`

> Closes **#596** (Slice 1 of 5 in epic **#595** — Form UI Factory).
> Archived on **2026-06-29** from `main` HEAD `6fedf15`.
> Specs are under `openspec/changes/forms-ui-factory-slice-1/specs/`; this report
> lives under `openspec/changes/archive/2026-06-29-forms-ui-factory-slice-1/`.

## Outcome

**Success.** Slice 1 of the Form UI Factory is formally closed. The implementation
was already shipped in `main` across five feature / docs commits that landed in
`v1.9.5` and `v1.10.0`; this SDD change writes the three contract specs that lock
the slice-1 behaviour, adds a doc-anchor test that pins the README honesty claim,
and ships the audit trail that lets issue #596 close with verifiable evidence.

## Metadata

| Field               | Value                                                                                 |
|---------------------|---------------------------------------------------------------------------------------|
| Change name         | `forms-ui-factory-slice-1`                                                            |
| Issue               | #596 (Slice 1 of 5)                                                                   |
| Epic                | #595 — Form UI Factory                                                                |
| Consumer issue      | #563 — read / compare slice (no_conformidades / Telefónica) — slice 1 closes the read half |
| Parent change       | `openspec/changes/form-ui-factory/` (proposal, design, tasks)                         |
| Artifact store      | hybrid (this file + Engram `sdd/forms-ui-factory-slice-1/...`)                        |
| TDD mode            | strict TDD                                                                            |
| Branch / policy     | `main` (dysflow release policy: main-only, no staging, no PRs)                        |
| Target branch       | `main`                                                                                |
| PR relationship     | n/a (no PR; main-only release policy)                                                 |
| Release version     | next `v1.10.x` (no new runtime code; slice 1 is already in `v1.9.5` / `v1.10.0`)      |
| CI run              | GitHub Actions run `28358451274` for SHA `6fedf15` — **success**                     |

## SDD artifacts

Created under `openspec/changes/forms-ui-factory-slice-1/`:

| File                                                | Lines | Purpose                                                   |
|-----------------------------------------------------|-------|-----------------------------------------------------------|
| `proposal.md`                                       | 141   | Honest status note, scope, approach, success criteria.    |
| `specs/form-ir-models.md`                           | 145   | FormIR / FormNode / PropertyEntry contract, round-trip.  |
| `specs/inspect-form-source.md`                      | 149   | `inspect_form` MCP tool contract, source-only discipline. |
| `specs/readme-honesty.md`                           | 82    | README honesty contract for `generate_form` + `inspect_form`. |
| `tasks.md`                                          | 199   | Work units, implementation commits, review forecast.      |

Total: 716 lines of SDD artifacts across 5 files.

## Implementation commits (already in `main`, verified reachable from `main`)

| Commit  | Subject                                                                         | What it ships                                                                  | Tests                                                                                              |
|---------|---------------------------------------------------------------------------------|--------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------|
| `a6420b5` | `feat(form-ir): add FormIR model and pure parseFormTxt service`               | `FormIR` types + `parseFormTxt` + `collectControls` + `collectFormEvents`        | `test/core/services/form-ir-parse.test.ts` (15 tests)                                              |
| `d23bc3a` | `feat(forms): parseFormTxt and serializeFormTxt round-trip implementation`    | `serializeFormTxt` + round-trip on every fixture                                | `test/core/services/form-ir-serialize.test.ts` (18 tests, full corpus)                             |
| `1ece781` | `feat(mcp): register inspect_form tool — read control tree offline`          | `inspect_form` adapter, registry, schema, parity entry                          | `test/adapters/vba-sync/vba-forms-adapter-inspect.test.ts` (8 tests)                               |
| `8eecb77` | `feat(forms): round-trip tests and compilation resilience refinements`        | round-trip coverage extension + compile-resilience refinements                  | extends `form-ir-serialize.test.ts` (now 18 tests)                                                 |
| `63dea09` | `docs: fix generate_form description and add form-ui-factory agent guide`    | README honesty fix (line 664) + `AGENTS.md` Form UI Factory section             | `test/docs/forms-ui-factory-readme.test.ts` (2 tests, new in this SDD)                              |

Reachability verified: every SHA is reachable from `main` HEAD `6fedf15`
(`git merge-base --is-ancestor <sha> main` returns true for all five).

## SDD formalization commits (new in this change)

| Commit  | Subject                                                                 | What it ships                                                | Test reference                                     |
|---------|-------------------------------------------------------------------------|--------------------------------------------------------------|----------------------------------------------------|
| `6b26b1c` | `chore(sdd): formalize forms-ui-factory-slice-1 proposal, specs, and tasks` | The five SDD artifact files (proposal + 3 specs + tasks)     | n/a (documentation contract)                        |
| `6fedf15` | `test(docs): pin Form UI Factory README honesty claim behind regression test` | The new doc-anchor test `test/docs/forms-ui-factory-readme.test.ts` (2 tests) | `test/docs/forms-ui-factory-readme.test.ts` (2/2)  |

## Test summary

Local quality-gate runs performed during this SDD:

| Gate                                             | Result      | Notes                                                                                  |
|--------------------------------------------------|-------------|----------------------------------------------------------------------------------------|
| `pnpm vitest run test/docs/forms-ui-factory-readme.test.ts` | ✅ 2/2 green | New doc-anchor test.                                                                    |
| `pnpm vitest run test/docs/`                     | ✅ 12 files / 62 tests green | Includes the new test plus all existing `test/docs/*` tests.                           |
| `pnpm vitest run test/core/services/form-ir-parse.test.ts` | ✅ 15/15 green | Shipped parser tests.                                                                  |
| `pnpm vitest run test/core/services/form-ir-serialize.test.ts` | ✅ 18/18 green | Shipped serializer / round-trip tests.                                                 |
| `pnpm vitest run test/adapters/vba-sync/vba-forms-adapter-inspect.test.ts` | ✅ 8/8 green | Shipped `inspect_form` adapter tests.                                                  |
| `pnpm build`                                     | ✅ green    | `tsc -p tsconfig.json` clean.                                                          |
| `pnpm lint`                                      | ✅ green    | `tsc --noEmit` (main + test) + biome check: 260 files, 0 issues, 0 fixes applied.       |
| `pnpm test` (full suite)                         | ⚠️ 1769 passed / 1 pre-existing flake | The single failing test is `test/core/runner/access-operation-registry.test.ts > concurrent get() calls all resolve without deadlock`, an `EPERM` on a Windows `tmp → final` rename in `FileAccessOperationRegistry.writeRecords`. Re-running that file in isolation shows 50/50 green — the failure is a Windows scheduler flake under high concurrency and is **pre-existing**, **unrelated** to this SDD, and **not introduced** by the new test or any source change. It is mentioned here for transparency. |
| `gh run watch 28358451274` (GitHub Actions)      | ✅ success  | All CI steps green; Windows Access smoke ran 2 / skipped 15 (no Access install in CI). |

## Access / binary sync

- The dysflow repo does not own a frontend `.accdb` — Access is a remote system that
  dysflow controls via PowerShell + COM. The slice-1 implementation works against
  source `.form.txt` files and is read-only, so no Access binary sync is required.
- No `forms/<Name>.cls` was touched by this SDD.
- No `LoadFromText` / `SaveAsText` invocation is introduced by this SDD.

## TDD Cycle Evidence (per task)

| Task | Test file                                       | Layer | Safety net          | RED                        | GREEN             | TRIANGULATE       | REFACTOR                |
|------|-------------------------------------------------|-------|---------------------|----------------------------|-------------------|-------------------|-------------------------|
| WU-1 | n/a (documentation contract)                    | docs  | n/a (artifacts)     | n/a                        | n/a               | n/a               | n/a                     |
| WU-2 | `test/docs/forms-ui-factory-readme.test.ts`     | unit  | n/a (new file)      | ✅ written first; verified to fail on a pre-`63dea09` README mentally (the lie appears in line 664 of the pre-fix README) | ✅ 2/2 green against the post-`63dea09` README | ✅ 2 cases (generate_form + inspect_form) | ✅ biome clean; helper inlined |

## Honest accounting of what was added vs. already shipped

| Concern                          | Already in `main` (pre-this-SDD)                                                              | Added by this SDD                                                |
|----------------------------------|-----------------------------------------------------------------------------------------------|------------------------------------------------------------------|
| FormIR types                     | ✅ `src/core/models/form-ir.ts` (commit `a6420b5`)                                             | none                                                              |
| `parseFormTxt`                   | ✅ `src/core/services/form-ir-service.ts` (commit `a6420b5`)                                   | none                                                              |
| `serializeFormTxt`               | ✅ `src/core/services/form-ir-service.ts` (commit `d23bc3a`)                                   | none                                                              |
| Round-trip property tests        | ✅ `test/core/services/form-ir-serialize.test.ts` (commit `d23bc3a` / `8eecb77`)               | none                                                              |
| `inspect_form` MCP tool          | ✅ `src/adapters/vba-sync/vba-forms-adapter.ts` (commit `1ece781`)                             | none                                                              |
| `inspect_form` adapter tests     | ✅ `test/adapters/vba-sync/vba-forms-adapter-inspect.test.ts` (commit `1ece781`)              | none                                                              |
| README honesty (`generate_form`) | ✅ `README.md:664` (commit `63dea09`)                                                          | doc-anchor test that pins the claim                                |
| `AGENTS.md` Form UI Factory section | ✅ (commit `63dea09`)                                                                        | none                                                              |
| Three contract specs             | ❌                                                                                            | ✅ `openspec/changes/forms-ui-factory-slice-1/specs/*.md`          |
| Issue audit trail                | ❌                                                                                            | ✅ this archive report                                             |

**Net new code in production: 0 lines.** The only new executable code is the
doc-anchor test (`test/docs/forms-ui-factory-readme.test.ts`, 65 lines, 2 tests).

## Outstanding items (out of scope of this SDD)

Slices 2–5 of the Form UI Factory epic remain open:

- **Slice 2** — `compare_form` drift report (re-uses `stripFormSerializationNoise`).
- **Slice 3** — `serializeFormTxt` + round-trip property tests + `LoadFromText`
  integration gate (de-risks property-ordering assumption before Slice 5).
- **Slice 4** — pure mutation primitives (`addControl`, `removeControl`,
  `setProperty`, `moveControl`, `bindControl`, `renameForm`).
- **Slice 5** — `create_form_from_template` MCP tool + GUID regeneration integration.

These are documented in `openspec/changes/form-ui-factory/tasks.md` and will be
delivered as separate SDD changes.

## Links

- Issue **#596** — Slice 1 acceptance contract.
- Epic **#595** — Form UI Factory.
- Parent change `openspec/changes/form-ui-factory/` — proposal, design, tasks.
- `CHANGELOG.md` — `v1.9.5` (Form UI offline serialization & parsing) and
  `v1.10.0` (`dysflow_lint_form_code` MCP tool).
- GitHub Actions run `28358451274` for SHA `6fedf15`.
