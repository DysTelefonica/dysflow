# Proposal: forms-ui-factory-slice-2

> SDD change `forms-ui-factory-slice-2` for dysflow. Closes issue **#597**
> (Slice 2 of 5 in the Form UI Factory epic **#595**, consumer issue **#563**).
> Artifact store: hybrid (this file + Engram `sdd/forms-ui-factory-slice-2/proposal`).
> Reads: epic proposal/design at `openspec/changes/form-ui-factory/{proposal,design}.md`
> and slice-1 artifacts at `openspec/changes/forms-ui-factory-slice-1/`.

## Intent

Introduce `dysflow_compare_form` — an MCP tool that compares two on-disk
`.form.txt` source files and reports a structured drift report: added controls,
removed controls, changed properties, and changed layout bounds, with each drift
item classified as `actionable` vs `non-actionable` so an AI agent can decide
which deltas deserve a sync action without having to enumerate every property
change by hand.

This closes the **compare half of #563** (the consumer ask from no_conformidades/
Telefónica). Slice 1 shipped `inspect_form` (read), Slice 2 adds `compare_form`
(compare). Slices 3-5 close the other half of the epic (serialize round-trip +
mutation + factory).

## Scope

### In scope

- **Pure form-IR-domain classifier** in `src/core/services/form-ir-compare-service.ts`:
  - `compareForms(input)` → `FormDriftReport`.
  - Detects `controlAdded` / `controlRemoved` / `propertyChanged` /
    `layoutBoundsChanged` between two parsed `FormIR`s.
  - Classifies each drift as `actionable` (Caption, Name, ControlSource, layout
    bounds, control Added/Removed) or `non-actionable` (keys in
    `FORM_NOISE_KEYS` = `Checksum`, `PrtDevMode*`, `PrtDevNames*`, `PrtMip`,
    `RecSrcDt`, `LayoutCached*`, `PublishOption`, `NoSaveCTIWhenDisabled`,
    `NameMap`).
  - Pure: no I/O, no Access, no COM. Testable under `pnpm test`.
  - Reuses the **noise-key list** from the existing
    `src/core/services/vba-semantic-classifier.ts` philosophy (same locks, same
    bias-to-functional). The list is **co-located with the new compare service**
    rather than imported from `vba-semantic-classifier.ts` because the latter
    keeps `FORM_NOISE_KEYS` as a non-exported `const` and the form-IR domain is
    typed/structured (FormIR), not line-based text — the heavy text/LCS machinery
    of `classifyVbaPair` does not fit a typed IR diff.
- **`dysflow_compare_form` MCP tool surface** registered across:
  - `src/adapters/mcp/mcp-tool-registry.ts` — `VBA_SYNC_TOOL_NAMES`.
  - `src/adapters/mcp/dispatch-routes.ts` — `kind: "vba-sync",
    mutatesBinary: false, mutatesFilesystem: false`.
  - `src/adapters/mcp/tool-parity-registry.ts` — `implementedToolNames` +
    `TOOL_DESCRIPTIONS`.
  - `src/adapters/mcp/schemas/vba-sync-schemas.ts` — input schema
    (`sourcePath` + `targetPath` required; `path` aliases accepted for parity).
  - `src/adapters/vba-sync/vba-forms-adapter.ts` — `handles()` + `execute()`.
- **Port-level MCP adapter** in
  `src/adapters/vba-sync/vba-forms-adapter.ts` that reads both `.form.txt`
  files via the existing `FormFileSystemPort`, parses both via the existing
  `parseFormTxt` (from slice 1), runs `compareForms`, returns a structured
  `OperationResult<FormDriftReport>` and **never writes**. Read-only — the
  write-gate stays disabled (`mutatesBinary: false`, `mutatesFilesystem: false`).
- **Tests** (RED-first):
  - Unit: `test/core/services/form-ir-compare.test.ts` covering identical,
    added/removed control, layout-bounds change, property change, and noise
    suppression. Pure Node test; no Access, no PowerShell.
  - Port: `test/adapters/vba-sync/vba-forms-adapter-compare.test.ts`
    covering routing, missing path, missing file, parse error, writeFile never
    invoked.
- **Bumps to existing tool-count tests**:
  - `test/adapters/mcp/tool-parity.test.ts` (24/24/48 instead of 23/24/47).
  - `test/adapters/mcp/advertised-tool-count.test.ts` (54 instead of 53).
  - `test/adapters/mcp/release-matrix-gate.test.ts` (48 instead of 47 for
    `DYSFLOW_MCP_TOOL_NAMES`, 54 instead of 53 for `visibleCount`).
  - `test/adapters/mcp/mcp-tool-output-contracts.test.ts` — add `compare_form`
    to the `vbaManagerDysflowResult` group.
- **README parity** for the new tool.

### Out of scope / non-goals

- **No `live` binary-vs-source mode.** Reserved by the parent design
  (`openspec/changes/form-ui-factory/design.md`, "Open Questions"); a future
  slice may refresh via COM `SaveAsText` when Access is open.
- **No mutation primitives.** `addControl`, `removeControl`, `setProperty`,
  `moveControl`, `bindControl`, `renameForm` are slice 4.
- **No `create_form_from_template`.** That is slice 5.
- **No serializer changes.** Round-trip property is owned by slice 1's
  `serializeFormTxt`; this slice parses-only via the existing pure parser.
- **No Access COM, no PowerShell, no filesystem mutations.** The slice runs
  fully under `pnpm test` on any platform (no Windows + Access requirement).
- **No reuse of the text-level `classifyVbaPair` pipeline.** It is built for
  line-based diff with LCS over VBA source text; a typed IR diff does not need
  it and would just add an indirection.

## Approach (headline)

1. **Read both `.form.txt` files via `FormFileSystemPort`** (existing, injected
   for tests). Parse both via the slice-1 `parseFormTxt` (existing).
2. **Diff two `FormIR`s** at the typed level:
   - **Controls**: walk the left tree and right tree depth-first, keying each
     `FormNode` by its scalar `Name` value (a control is "the same control" iff
     its name matches, regardless of nesting depth — this mirrors how
     `collectControls` already flattens the IR for inspection).
   - **Added**: present in right, missing in left.
   - **Removed**: present in left, missing in right.
   - **Same name in both**: walk each side's scalar entries (in document order)
     and produce a `propertyChanged` drift per (key, oldValue, newValue) pair
     whose trimmed values differ.
   - **Layout bounds**: when (in a same-name comparison) the four `Left`,
     `Top`, `Width`, `Height` keys differ, additionally emit a dedicated
     `layoutBoundsChanged` drift with the four old/new pairs — these are the
     Actionable signals an agent cares about.
3. **Classify each drift**:
   - `actionable: true` for:
     - `controlAdded`, `controlRemoved` (any control add/remove).
     - `propertyChanged` where the key is **not** in `FORM_NOISE_KEYS`.
     - `layoutBoundsChanged` (always actionable).
   - `actionable: false` for:
     - `propertyChanged` where the key IS in `FORM_NOISE_KEYS` (same locks as
       `vba-semantic-classifier.ts` — these are
       `Checksum`/`PrtDevMode*`/`PrtDevNames*`/`PrtMip`/`RecSrcDt`/
       `LayoutCached*`/`PublishOption`/`NoSaveCTIWhenDisabled`/`NameMap`).
4. **Co-locate the noise-key list** with the new service
   (`src/core/services/form-ir-compare-service.ts`) as an exported
   `FORM_NOISE_KEYS`. We deliberately do NOT cross-import from
   `vba-semantic-classifier.ts` because:
   - That file keeps `FORM_NOISE_KEYS` private and named for its own list.
   - The two domains (line-text VBA vs typed FormIR) are decoupled by design;
     coupling them would import heavy text machinery for a typed diff.
   - The list is short and LOCKED — the slice-1 spec already locks it as the
     canonical Access serialization-noise floor; this slice just re-asserts
     the same canonical set. (Future consolidation is a refactor opportunity
     if the project later wants a shared access-noise module.)
5. **Surface the report** as the JSON returned from
   `compare_form`: `{ matched, driftDetected, actionableOk, drifts[] }`. Each
   drift carries `{ kind, controlName?, key?, oldValue?, newValue?, actionable,
   reason }`. `matched === true` iff zero actionable drift;
   `driftDetected === true` iff any drift at all (actionable or not);
   `actionableOk === true` iff zero actionable drift.
6. **Wire the MCP tool surface** (5 sites listed above) and the routing inside
   `VbaFormsAdapter.handles()` / `VbaFormsAdapter.execute()`.
7. **RED-first tests** for the service and the adapter.
8. **Run gates**: `pnpm test`, `pnpm build`, `pnpm lint`, then the focused
   `pwsh -Command "Invoke-Pester scripts/tests/"`.
9. **Commit**: a single `feat(forms): compare_form source-vs-source drift tool`
   conventional commit referencing the SDD key.
10. **Wait for CI green** (`gh run watch`); if red, STOP and report.
11. **Archive** under
    `openspec/changes/archive/2026-06-29-forms-ui-factory-slice-2/` with
    commit-SHA evidence + test references.
12. **Close #597** with the evidence comment per
    `gentle-ai:issue-closure-traceability`.

## Honest accounting of what already exists vs. added by this SDD

| Concern                                            | Already in `main` (slice 1)                                                          | Added by this SDD                                                                                          |
|----------------------------------------------------|--------------------------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| `FormIR` model                                     | `a6420b5` — `src/core/models/form-ir.ts`                                              | none                                                                                                       |
| `parseFormTxt` / `serializeFormTxt` / round-trip   | `a6420b5`, `d23bc3a`, `8eecb77` — `src/core/services/form-ir-service.ts`             | none                                                                                                       |
| `inspect_form` MCP tool + adapter + tests          | `1ece781` — adapter/registry/schema/parity/tests                                      | none                                                                                                       |
| `FormFileSystemPort.readFile`                      | already present (used by `inspect_form`)                                             | none                                                                                                       |
| `VbaFormsAdapter.handles()` for forms tools        | already routes `inspect_form`, `lint_form_code`, `validate_form_spec`, `generate_form` | adds `compare_form` route                                                                                   |
| `MCP_TOOL_ROUTES` for forms tools                  | `inspect_form` is `{ kind: "vba-sync", mutatesBinary: false, mutatesFilesystem: false }` | adds `compare_form` (same shape — read-only)                                                                |
| `FORM_NOISE_KEYS` list in form domain              | exists as a non-exported `const` in `vba-semantic-classifier.ts` (text-level diff)    | new exported `FORM_NOISE_KEYS` set in `form-ir-compare-service.ts` (same canonical contents, IR-domain use) |
| Drift report type                                   | none                                                                                  | new `FormDriftReport` / `FormDrift` types                                                                  |
| `compare_form` MCP tool surface + tests            | none                                                                                  | adapter route, registry entries, schema, parity description, 2 new test files, count bumps in 4 existing tests |
| `dysflow_compare_form` parity description          | none                                                                                  | added (read-only, source-only)                                                                             |

## Review Workload Forecast

- **Estimated changed lines in this SDD**: ~290 (matches issue #597 estimate).
  Breakdown: ~30 lines noise-list doc + service skeleton, ~120 lines
  `compareForms` implementation, ~80 lines types, ~80 lines MCP wiring,
  ~150 lines tests, ~30 lines tool-count test bumps, ~40 lines parity
  description + README delta + tasks/proposal text. Two conventional commits
  (one for source, one for any tooling/parity bump if needed).
- **400-line budget risk**: Low. Issue estimated ~290.
- **Chained PRs recommended**: No (dysflow release policy forbids PRs;
  main-only, no staging).
- **Decision needed before apply**: No.

## Success criteria

- `dysflow_compare_form` is registered across all 5 MCP surfaces (registry,
  routes, parity, schema, adapter).
- Adapter-level test locks the contract (source-only, never writes, returns
  typed errors for missing source/missing path/parse error).
- Service-level RED-first tests cover identical/added/removed/property-change/
  layout-bounds/noise scenarios.
- All existing tool-count tests bumped and re-green.
- `pnpm test`, `pnpm build`, `pnpm lint`, `pwsh -Command "Invoke-Pester
  scripts/tests/"` are green.
- GitHub Actions green for the new commits.
- Archive report lands under
  `openspec/changes/archive/2026-06-29-forms-ui-factory-slice-2/`.
- Issue #597 is closed with evidence (commit SHA + test references + archive
  path).
- Engram observation saved under topic `sdd/forms-ui-factory-slice-2`.

## Links

- **Issue**: #597 — `feat(forms): Slice 2 — compare_form (source-vs-source drift via classifier)`
- **Epic**: #595 — Form UI Factory
- **Sibling slices**: #596 (read — `inspect_form`, shipped), #598/#599/#600
  (serialize + mutation + factory, planned).
- **Consumer issue**: #563 — read/compare slice (no_conformidades/Telefónica).
- **Parent change**: `openspec/changes/form-ui-factory/` (proposal, design,
  tasks).
- **Slice 1 archive**: `openspec/changes/archive/2026-06-29-forms-ui-factory-slice-1/`.
