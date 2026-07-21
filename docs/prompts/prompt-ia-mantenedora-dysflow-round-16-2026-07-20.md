# Maintainer prompt — dysflow round 16 — three sister form tools expose only opaque nested-object schemas

## Mode

`bug-hunt` (documentation/contract regression on three sister tools), medium variant.

## Routing

This issue is filed against **`DysTelefonica/dysflow`** (the MCP runtime, not the docs). The fix is runtime code that publishes the nested-object schema for `generate_form_design_plan`, `copy_form_ui_pattern`, and `verify_form_ui`. The matching examples on the consumer-facing side (the `dysflow-usage` per-tool `.md`s plus the `access-form-ui-builder` skill content) live in `C:\Proyectos\skills\` (remote = `DysTelefonica/team-skills`), so the docs/file refresh is filed separately against `DysTelefonica/team-skills` in this same session.

## Distinct from #1022

Round 14 / `#1022` covers `apply_form_design_plan`'s top-level `plan` argument. This round covers three DIFFERENT form tools whose nested-object schemas are opaque to the agent at the MCP boundary. There is no overlap — neither the tool names nor the argument surface overlap with `#1022`.

## Consumer context

- Consumer: `DysTelefonica/GESTION_RIESGOS`
- Consumer worktree: `C:/00repos/codigo/00_GESTION_RIESGOS_staging`
- Runtime: dysflow MCP `2.19.0`, `toolsVisible=89`
- Active project config: `projectId=00-gestion-riesgos-staging`, `status=valid`, on branch `feature/issue-129-indicador-thin` (read-only audit, no consumer source touched)
- Prior rounds:
  - round 13 / `#1021` — `contextId` bound as `projectId` in `form_list_controls`
  - round 14 / `#1022` — `apply_form_design_plan.plan` opaque (DISTINCT — this round)
  - round 15 — `form_duplicate_control` clones source GUID verbatim (also being filed this session)

## Verified symptom

`schema({toolName:"generate_form_design_plan"})`, `schema({toolName:"copy_form_ui_pattern"})`, and `schema({toolName:"verify_form_ui"})` each expose at least one nested-object argument with `description: ""` and no `properties` map. The shape is opaque: an agent cannot construct a valid payload from the runtime schema alone and must read maintainer source code or guess.

Specifically:

| Tool | Opaque argument | Notes |
| --- | --- | --- |
| `generate_form_design_plan` | (nested object(s) — see RED probe 1) | description empty, no `properties` map |
| `copy_form_ui_pattern` | (nested object(s) — see RED probe 2) | description empty, no `properties` map |
| `verify_form_ui` | `checks` (or equivalent) array of objects | description empty, no item schema |

The runtime still **accepts** well-formed payloads (the tools succeed on the staging `FormIndicador`'s 38 controls and the 2x3 geometry), so the gap is purely an AI-agent-onboarding blocker — agents cannot craft the payloads without maintainer source code, and that pattern is explicitly discouraged by the global `access-form-ui-builder` discipline ("don't read maintainer source").

The installed per-tool examples under `C:\Users\adm1\.agents\skills\dysflow-usage/assets/examples/` for these three tools are still TODO scaffolds:

```text
assets/examples/generate-form-design-plan.md:  696 bytes (TODO placeholder)
assets/examples/copy-form-ui-pattern.md:       696 bytes (TODO placeholder)
assets/examples/verify-form-ui.md:             690 bytes (TODO placeholder)
```

## Required TDD RED tests

1. `schema({toolName:"generate_form_design_plan"})` must expose the full nested-object schema for every argument named by the tool description, with `properties`, `required`, and per-property `type`/`description` populated. Schema-emptiness test fails today.
2. Same test for `copy_form_ui_pattern`.
3. Same test for `verify_form_ui`.
4. Each supported tool accepts a runtime-constructable dry-run payload and returns `mode: "dry-run"` with no filesystem/binary mutation. RED today only in the sense that consumers cannot reliably construct that payload from public schema.
5. A documentation test fails while any of the three example `.md` files contains the literal string `TODO: replace this scaffold with a runtime-verified usage contract.`
6. An acceptance test for `verify_form_ui` exercises the contract discovered in test 3 against the real `FormIndicador` form (38 controls; `cmdTile5Excel` GUID `0x6efe25de7eddc44e992c942cfc8e983f`; 2x3 tile geometry `shTile1..shTile6`).

## Minimum fix

Publish the complete contract through the MCP schema/catalog for each of the three tools. For each:

- Replace `description: ""` with a description that names the discriminator (if any), the required fields per item, and the allowed values.
- Add a `properties` map with full per-field schemas.
- Add `required: [...]` per object and per item in arrays.
- Add `additionalProperties: false` where the contract is closed.

Then, in concert with the maintainer's docs pipeline, refresh the matching example `.md`s under `dysflow-usage/assets/examples/` with a runtime-verified dry-run payload. The example-refresh work is filed separately as round-1 against `DysTelefonica/team-skills` because those files are tracked under the team's skills monorepo, not the dysflow runtime repo.

Do NOT touch `apply_form_design_plan` in this fix — it is covered by `#1022`. Do not introduce a second plan shape only for docs; schema, implementation, and example must share one contract.

## What already works and must not regress

- `apply_form_design_plan`'s atomic single-write/single-import gate and rollback behavior (round 10 / `#951`) remain intact. `generate_form_design_plan` is a *plan-only* read tool today; adding the nested-object schema must not introduce a write side-effect or change its return shape.
- `copy_form_ui_pattern`'s read-only contract remains intact.
- `verify_form_ui`'s read-only contract and current result shape (`{ checks: [...] }` or equivalent) remain intact.
- The single-write/single-import guard from `#951` continues to gate every write verb; the three tools in this round are read-only or plan-only.
- `form_list_controls`, `analyze_form_ui`, `render_form_preview` continue to provide safe read-only perception.
- `get_capabilities.tools[<tool>].commitFlag` continues to return `"dryRun"` for these three tools (`generate_form_design_plan`, `copy_form_ui_pattern`, `verify_form_ui`); do not flip the flag.

## Discipline and guardrails

- Start with RED tests 1-6 above.
- Do not weaken write gates, dry-run defaults, strict context, rollback, or human-compile discipline.
- Do not introduce a second contract shape only to satisfy docs; schema, implementation, and example must share one shape.
- Keep the fix scoped to the three named tools.
- Use conventional commits; no AI attribution.

## Cross-session safe

- Round 13 / `#1021` (optional-field binding defect) and round 14 / `#1022` (`apply_form_design_plan.plan` opaque) are addressed separately. Do not regress fixes from those rounds while shipping this one.
- Round 15 (`form_duplicate_control` clones GUID verbatim) is a clone-verb gap, NOT a plan-shape gap. Distinct fix path.
- Round 1 (filed today against `DysTelefonica/team-skills`) covers the docs-only refresh of the per-tool examples and `access-form-ui-builder` content. That issue is the docs-side companion to this runtime fix; both landers sync via the canonical contract once this round ships.

## Acceptance output

- PR with schema/conformance tests 1-6 and the minimal nested-schema expansion for the three tools.
- Changelog entry describing the contract publication and the link to the docs companion round.
- Version bump and release containing the fix.
- PR body includes RED-before / GREEN-after schema sample for each tool (the diff between today's opaque schema and the published schema).
- Confirmation that `apply_form_design_plan` was not touched.

## Quick verification

```text
schema({toolName:"generate_form_design_plan"})
  -> each nested object exposes properties / required / additionalProperties
schema({toolName:"copy_form_ui_pattern"})
  -> each nested object exposes properties / required / additionalProperties
schema({toolName:"verify_form_ui"})
  -> checks[] items expose properties / required / additionalProperties
verify_form_ui({sourcePath:"<FormIndicador.form.txt>", checks:[…]})
  -> mode:"dry-run", no source/binary mutation; per-check verdicts returned
example .md files (3) -> no "TODO" placeholder strings remain
```
