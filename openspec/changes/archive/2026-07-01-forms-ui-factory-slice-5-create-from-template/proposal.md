# Proposal: Forms UI Factory Slice 5 — `create_form_from_template`

## Intent

Ship the issue #618 surface: an MCP tool that clones an existing `.form.txt` into a new form, applies a caller-supplied token map (e.g. `{{FormName}}` → `Form_FormNuevaAuditoria`), and reloads via the existing LoadFromText integration gate so the orchestrator can stamp out new forms without writing `.form.txt` by hand.

## Consumer context

The orchestrator (Phase 2 of `ardelperal/VBA_TOOLKIT_BENCH#2`) needs to clone `Form_FormRiesgosGestionRiesgo` into `Form_FormNuevaAuditoria` by replacing tokens, reusing ~80% of the original layout. The orchestrator does not currently have a programmatic way to clone forms.

## Scope

### In scope

- Public MCP tool: `dysflow_create_form_from_template` (exact name pending design).
- Signature shape (open): `{ source_form, target_form, token_map: { token: replacement }, bindings_overrides? }`.
- Token replacement on the source `.form.txt` content BEFORE compile / load.
- Round-trip safety: byte-equivalent result compared with a manual clone-and-replace when tokens are simple `{{...}}` strings.
- Failure modes: invalid token map (typed error); token present in source but not in replacement map (warning, leave as-is); source / target path issues.
- Strict TDD: RED → GREEN → REFACTOR discipline following project conventions.
- Documentation update: `README.md` MCP tools list and capability table.
- Acceptance UAT wherever the project applies it (none in dysflow per the tooling override recorded at `dysflow/cross-project/uat-override-for-tooling-projects-2026-06-30`).

### Out of scope

- `create_from_template` of reports (`.report.txt`) — separate slice if needed.
- Designer-side wizards, drag-to-clone, visual tooling.
- Token replacement outside the textual content of `.form.txt` (CodeBehind `.cls` is out unless a follow-up slice asks for it).
- Re-closing the orchestrator worktree (`orchestrator-isolation-2026-06-29`); that is consumer-side work, not dysflow's.

## Predecessors

- `dysflow/cross-project/uat-override-for-tooling-projects-2026-06-30` — confirms no UAT gate for this project.
- Issue #616 (slice 3, `serializeFormTxt` + round-trip + LoadFromText gate) — closed 2026-06-30 as `not planned` because slice 4 absorbed the property.
- Issue #617 (slice 4, mutation primitives) — closed 2026-06-30, released in `v1.12.0`. `serializeFormTxt`, `parseFormTxt`, and the LoadFromText integration gate already exist in core and are the foundation of this slice.
- Issue #618 itself.

## Open questions (resolve before `sdd-spec`)

1. Should `create_form_from_template` apply tokens to BOTH the layout (`.form.txt`) AND the code-behind (`.cls`)? Issue body says layout-only; orchestrator usage suggests tokens like `{{FormName}}` may also live in `.cls`.
2. Should the tool produce a `dry-run` plan that shows the post-replacement `.form.txt` before commit? This matches how the slice 4 tools behave.
3. Token syntax: `{{Token}}`, `${Token}`, `<Token>` or caller-supplied regex? Default to `{{Token}}` or expose as option?
4. How should the tool handle a token present in the source but missing from `token_map`: pass-through with warning (default), hard error, or caller-controlled via `missing_token_policy`?
5. Does `target_form` get created if it already exists in the destination backend? Reject? Overwrite via `import_modules` restore path?
6. Multiple targets from one source: does the same source allow several `target_form` clones in one session, and is there a reason to batch or is one-by-one enough?
7. `bench-cache/ardelperal-VBA_TOOLKIT_BENCH/` is the agreed canonical fixture location for this project's integration tests. Is there anything slice 5 needs that is NOT already covered by what lives there (e.g. a source form with `{{...}}` tokens already in it, or do we seed such a fixture)?

## Workload forecast (preliminary)

Following the slice-4 forecast pattern this lands at roughly:

| Field | Estimated value |
|-------|-----------------|
| Estimated changed lines | 200-450 |
| 400-line budget risk | Medium (under threshold with conservative split) |
| Chained PRs recommended | Possibly yes if VerifyFromTemplate needs a separate fixture PR |
| Suggested split | Single PR for the tool + tests + docs; chained only if the fixture seeding is non-trivial |

These are placeholders; `sdd-tasks` will sharpen them once scope is settled.

## Status

Scaffold only. Not yet `apply`-ready. Next phases when greenlit:

1. `sdd-explore` on the open questions above (especially #1, #4, #5).
2. `sdd-propose` to lock intent and acceptance criteria with explicit answers.
3. `sdd-spec` to write the delta spec using `dysflow_form_*` as the MCP contract template.
4. `sdd-design` to settle: where the token-replacement stage lives (core vs adapter), how the source file is sourced (FS read vs Access export), how the gate failure is restored.
5. `sdd-tasks` to bound the work units and the budget forecast precisely.
6. Strict-TDD `sdd-apply` + `sdd-verify`.
7. Release train: cut a new patch / minor once `verify-report` is PASS, run `release-prepare.ps1` with CI gate, archive the SDD, close the issue with the standard closure trace.

## Risk register (preliminary)

- **Token replacement leaking into opaque metadata.** The slice 4 invariant says byte-equivalent `PrtDevMode` / `Checksum` / `Format` MUST survive a mutation. Token replacement has to be carefully scoped to user-modifiable strings, or it will drop the byte-equivalence guarantee and trigger `FORM_METADATA_LOSS` from the underlying service.
- **LoadFromText gate fails for `target_form` because the source already references unknown tokens.** Mitigation: lint the source for non-replaced tokens as a pre-flight step, surface a structured error.
- **Overwrite vs no-overwrite** semantics on `target_form` is the kind of thing that breaks production by surprise. Pick a default and contract it.
- **Bench fixture seeding** — if no canonical source already contains `{{...}}` tokens, we may need to seed one as `bench-cache/ardelperal-VBA_TOOLKIT_BENCH/src/forms/Form_FormTemplateDemo.form.txt`. Coordinate with the bench owner if so.

## Linked artifacts

- Issue: https://github.com/DysTelefonica/dysflow/issues/618
- Plan reference: `ardelperal/VBA_TOOLKIT_BENCH/blob/main/plans/plan-ambicioso-dysflow-codegraph-vba-2026-06-29.md` (Phase 2.2)
- Bench: https://github.com/ardelperal/VBA_TOOLKIT_BENCH
- Predecessor slice (delivers the underlying engine): issue #617 / release `v1.12.0`.
