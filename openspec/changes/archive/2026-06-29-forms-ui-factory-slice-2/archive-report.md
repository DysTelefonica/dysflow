# Archive Report — `forms-ui-factory-slice-2`

> SDD change `forms-ui-factory-slice-2` archived on **2026-06-29**.
> Closes issue **#597** (Slice 2 of 5 in the Form UI Factory epic **#595**).
> Artifact store: hybrid (this file + Engram `sdd/forms-ui-factory-slice-2/archive`).
>
> Source SDD artifacts:
> - `openspec/changes/forms-ui-factory-slice-2/proposal.md`
> - `openspec/changes/forms-ui-factory-slice-2/specs/compare-form-source-source.md`
> - `openspec/changes/forms-ui-factory-slice-2/tasks.md`
>
> This report is the closing record; the audit trail lives in the
> implementation commits and the GitHub issue evidence comment.

## Status

CLOSED. All quality gates green. Issue #597 closed with an evidence comment.

## Change summary

Introduced `dysflow_compare_form` — an MCP tool that compares two on-disk
`.form.txt` files via a pure IR-domain diff and returns a structured drift
report:

- `controlAdded` / `controlRemoved` for missing/extra named controls.
- `propertyChanged` per (control, key, oldValue, newValue) for differing
  scalars, with actionability classified against the canonical
  `FORM_NOISE_KEYS` noise floor (Checksum, PrtDevMode*, PrtDevNames*,
  PrtMip, RecSrcDt, LayoutCached*, PublishOption, NoSaveCTIWhenDisabled,
  NameMap).
- `layoutBoundsChanged` for `Left` / `Top` / `Width` / `Height` deltas
  — emitted as ONE drift (not four `propertyChanged` entries), to avoid
  double-counting geometry changes.
- Aggregate `matched` (zero actionable drift), `driftDetected` (any
  drift at all), `actionableOk` (mirror of `matched`).

Read-only — no Access, no PowerShell, no filesystem writes. Reuses the
slice-1 `parseFormTxt` parser and `FormFileSystemPort` (read).

## Implementation commits

| Commit  | Subject                                                              | SDD tasks       | Verification                                                                                                                                        |
|---------|----------------------------------------------------------------------|-----------------|-----------------------------------------------------------------------------------------------------------------------------------------------------|
| `e7c53bc` | `chore(sdd): formalize forms-ui-factory-slice-2 proposal, spec, and tasks` | Phases 1-3      | SDD artifacts staged ahead of implementation (proposal, spec, tasks).                                                                               |
| `37a5177` | `feat(forms): compare_form source-vs-source drift tool`              | Phase 4 (WU-1-4) | `test/core/services/form-ir-compare.test.ts` (8 cases), `test/adapters/vba-sync/vba-forms-adapter-compare.test.ts` (8 cases), bumped count tests, README parity, MCP wiring in 5 sites, MCP `tools/list` description. |

Source-only — no Access install / no `LoadFromText` / no `MSACCESS.EXE`
invocation. CI runs `pnpm test` against the Node-side suite; the
PowerShell Pester suite covers independent commands.

## Quality gates (local + CI)

| Gate                                                      | Status | Notes                                                                                                          |
|-----------------------------------------------------------|--------|----------------------------------------------------------------------------------------------------------------|
| `pnpm test` (Vitest, 141 files, 1786 tests)               | GREEN  | New: `form-ir-compare.test.ts` (8) + `vba-forms-adapter-compare.test.ts` (8). No regressions.                   |
| `pnpm build` (`tsc -p tsconfig.json`)                     | GREEN  | No type errors in `src/` or `test/`.                                                                           |
| `pnpm lint` (`check-optional-presence-guards + tsc + tsc test + biome`) | GREEN  | Biome auto-fixed a test file at L248-252 (`Caption ="Form"`).                                                |
| `pnpm test:ps1` (PowerShell Pester, 390 tests)            | GREEN  | 386 passed, 0 failed, 4 skipped (pre-existing). No new failures.                                               |
| GitHub Actions — Quality gates (`28359938363`)            | GREEN  | Lint + Test + Build + Coverage + Audit deps all green.                                                          |
| GitHub Actions — Windows PowerShell/Access smoke (`28359938363`) | GREEN  | Pester + Access/PowerShell integration green.                                                                  |

## Honest accounting — what already existed vs. what was added

| Concern                                                          | Already in `main` (slice 1)                                                                | Added by this SDD                                                                                          |
|------------------------------------------------------------------|--------------------------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|
| `FormIR` model + `parseFormTxt` + `serializeFormTxt` (round-trip) | shipped (`a6420b5`, `d23bc3a`, `8eecb77`)                                                 | none                                                                                                        |
| `inspect_form` MCP tool + adapter + tests                        | shipped (`1ece781`)                                                                         | none                                                                                                        |
| `FormFileSystemPort.readFile`                                    | shipped (used by `inspect_form`)                                                            | none                                                                                                        |
| `VbaFormsAdapter.handles()` for forms tools                      | already routed `inspect_form`, `lint_form_code`, `validate_form_spec`, `generate_form`    | adds `compare_form` route                                                                                    |
| `MCP_TOOL_ROUTES` for forms tools                                | `inspect_form` / `lint_form_code` already `{ kind: "vba-sync", mutatesBinary: false, mutatesFilesystem: false }` | adds `compare_form` with the same shape (read-only, source-only)                                            |
| Drift report type (`FormDrift`, `FormDriftReport`)              | none                                                                                       | new (in `form-ir-compare-service.ts`)                                                                       |
| `FORM_NOISE_KEYS` exported from the form-IR domain                | existed as a non-exported `const` in `vba-semantic-classifier.ts` (text-level diff)         | new exported `FORM_NOISE_KEYS` set in `form-ir-compare-service.ts` (same canonical contents, IR-domain use) |
| `dysflow_compare_form` MCP tool surface                          | none                                                                                       | wired across all 5 MCP sites (registry, routes, parity + description, schema, adapter)                       |
| Test files                                                       | none                                                                                       | `test/core/services/form-ir-compare.test.ts`, `test/adapters/vba-sync/vba-forms-adapter-compare.test.ts` (16 new test cases total) |
| Tool-count test bumps (4 files)                                  | none                                                                                       | `tool-parity.test.ts` (23→24), `advertised-tool-count.test.ts` (53→54), `release-matrix-gate.test.ts` (47/53→48/54), `mcp-tool-output-contracts.test.ts` |
| README parity (line ~22 "X visible MCP tools" + inventory entry) | documented 53 tools                                                                        | bumped to 54 + added `compare_form` inventory entry                                                          |

## Backward compatibility

No breaking changes. The MCP surface gains one read-only tool and bumps
six documented counts. All existing tool contracts (`inspect_form`,
`lint_form_code`, `validate_form_spec`, `generate_form`, `catalog_add_control`)
remain unchanged. The dispatch factory derives the write-gate from
`MCP_TOOL_ROUTES` so `compare_form` is automatically bypass-gated
(`mutatesBinary: false`, `mutatesFilesystem: false`).

## Files changed (committed in this slice)

```
A  openspec/changes/forms-ui-factory-slice-2/proposal.md
A  openspec/changes/forms-ui-factory-slice-2/specs/compare-form-source-source.md
A  openspec/changes/forms-ui-factory-slice-2/tasks.md
A  src/core/services/form-ir-compare-service.ts
A  test/core/services/form-ir-compare.test.ts
A  test/adapters/vba-sync/vba-forms-adapter-compare.test.ts
M  README.md
M  src/adapters/mcp/dispatch-routes.ts
M  src/adapters/mcp/mcp-tool-registry.ts
M  src/adapters/mcp/schemas/vba-sync-schemas.ts
M  src/adapters/mcp/tool-parity-registry.ts
M  src/adapters/vba-sync/vba-forms-adapter.ts
M  test/adapters/mcp/advertised-tool-count.test.ts
M  test/adapters/mcp/mcp-tool-output-contracts.test.ts
M  test/adapters/mcp/release-matrix-gate.test.ts
M  test/adapters/mcp/tool-parity.test.ts
```

The `.atl/skill-registry.md` modification and the untracked `.codegraph/`
directory in the working tree were NOT touched or committed (per the
project policy at session open).

## Forward — slices 3/4/5 still pending

The epic (#595) has three remaining slices. They are NOT in scope of
this archive:

- **Slice 3 (serialize round-trip)** — already partly shipped in slice 1's
  `serializeFormTxt` + `8eecb77`; the de-risk question is whether the
  round-trip survives `LoadFromText` on real Access. That integration
  test is owned by a future slice.
- **Slice 4 (mutation primitives)** — `addControl`, `removeControl`,
  `setProperty`, `moveControl`, `bindControl`, `renameForm` are NOT
  implemented. Slices 2's IR diff is the engine block they will share.
- **Slice 5 (`create_form_from_template`)** — not implemented. Depends
  on slice 4 (the mutation primitives).

`compare_form` is the read-side engine block of the factory stack: once
slice 4 lands, an agent can chain `inspect_form` → `compare_form` →
`setProperty` → `serializeFormTxt` → `import_modules` without ever
hand-editing raw `.form.txt`.

## Notable design notes (for future sessions)

1. **Why the form-IR-domain classifier and not `classifyVbaPair`.** The
   existing `vba-semantic-classifier.ts` is a text-level line-diff with
   LCS — the right engine for source-vs-binary VBA pair comparisons
   where the IR does not exist. For typed `FormIR` diffs the IR is
   already structured, so a typed walker with the same canonical noise
   list is cheaper, more readable, and avoids pulling in the heavy
   text-machinery. The two classifiers share `FORM_NOISE_KEYS` by
   convention, not by import.

2. **Why `layoutBoundsChanged` is ONE drift, not four.** A control
   with `Left`/`Top`/`Width`/`Height` changes typically moves and
   resizes together. Emitting a single `bounds` payload carrying the
   four (old/new) tuples in `[Left, Top, Width, Height]` order gives
   the agent one decision to make ("this geometry changed") instead of
   four correlated ones. The test
   "Left+Top change → ONE layoutBoundsChanged, no separate
   propertyChanged for Left/Top" locks this invariant.

3. **Why we duplicate the noise-list rather than cross-import.** The
   `FORM_NOISE_KEYS` set in `vba-semantic-classifier.ts` is a `const`,
   not exported. This slice deliberately co-locates a fresh export of
   the same canonical contents with the new IR-domain service to avoid
   coupling the form-IR layer to the text-level classifier (which
   `stripFormSerializationNoise` calls don't even need). A follow-up
   consolidation could move the noise list to a shared
   `src/core/services/access-noise.ts` module once the project needs a
   third consumer.

## Links

- **Issue**: #597 — `feat(forms): Slice 2 — compare_form (source-vs-source drift via classifier)`
- **Epic**: #595 — Form UI Factory
- **Sister slice**: #596 / `openspec/changes/archive/2026-06-29-forms-ui-factory-slice-1/`
- **Consumer**: #563 — read/compare slice (no_conformidades / Telefónica)
- **Parent change**: `openspec/changes/form-ui-factory/`
- **GitHub Actions run (green)**: `28359938363` — both jobs green.
- **CI run URLs**:
  - Quality gates: https://github.com/DysTelefonica/dysflow/actions/runs/28359938363
  - Windows PowerShell/Access smoke: same run.

## Issue closure evidence

Issue #597 was closed after this archive commit. The closure comment
references:

- the SDD formalization commit `e7c53bc`
- the implementation commit `37a5177`
- the test refs `test/core/services/form-ir-compare.test.ts` +
  `test/adapters/vba-sync/vba-forms-adapter-compare.test.ts`
- the archive path `openspec/changes/archive/2026-06-29-forms-ui-factory-slice-2/`
- the GitHub Actions run `28359938363` (both jobs green)
