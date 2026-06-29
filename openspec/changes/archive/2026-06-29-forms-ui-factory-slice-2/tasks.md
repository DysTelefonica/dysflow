# Tasks: forms-ui-factory-slice-2

> Artifact store: hybrid (this file + Engram `sdd/forms-ui-factory-slice-2/tasks`).
> Strict TDD: every implementation task is preceded by a failing-test task.
> Delivery strategy: single work-unit commit (dysflow release policy is
> main-only, no PRs).
> Closes issue **#597** (Slice 2 of 5 in epic #595).

## Status — implementation pending

Slice 2 introduces the `dysflow_compare_form` MCP tool and the in-domain
`compareForms` service. Slice 1's shipped foundation
(`openspec/changes/forms-ui-factory-slice-1/`) is the dependency: `FormIR`,
`parseFormTxt`, `inspect_form`, `FormFileSystemPort`. This tasks file groups the
work into reviewable units and commits clean.

The work-unit table below is the contract between the proposal/spec and the
implementation. Each work unit has a TDD cycle, a single SHA record, and a
CI gate to wait on before archive.

## Work Units

| ID   | Work Unit                                                            | Layer    | TDD Cycle                                                                              | Commit                                                       |
|------|----------------------------------------------------------------------|----------|----------------------------------------------------------------------------------------|--------------------------------------------------------------|
| WU-1 | Pure form-IR compare service (`compareForms` + types + noise list)   | unit     | RED: `form-ir-compare.test.ts` → GREEN: implement minimal diff + classifier           | `feat(forms): compare_form source-vs-source drift tool`      |
| WU-2 | MCP tool surface (registry, routes, parity, schema, adapter, parity description) | port | RED: adapter test for routing → GREEN: wire `compare_form` in 5 MCP sites            | same as WU-1                                                 |
| WU-3 | Bumps to existing tool-count tests + README parity                   | n/a      | n/a (count-bump + docs)                                                                | same as WU-1                                                 |
| WU-4 | Quality gates + push + CI wait                                       | n/a      | n/a                                                                                    | same as WU-1                                                 |
| WU-5 | Archive report + Engram observation + close #597                     | n/a      | n/a                                                                                    | `chore(sdd): archive forms-ui-factory-slice-2` (separate commit) |

A single `feat(forms)` commit carries WU-1 + WU-2 + WU-3 + WU-4 because they
form a single autonomous change; the WU-5 archive lands in a separate
`chore(sdd)` commit. Both are well under the 400-line budget (see Review
Workload Forecast).

---

## WU-1 — Pure form-IR compare service

**Files to create**:

- `src/core/services/form-ir-compare-service.ts` — the pure service.

**Type exports** (in the service file or a small companion `models` add):

```typescript
export const FORM_NOISE_KEYS: ReadonlySet<string> = new Set([
  "Checksum",
  "PrtDevMode",
  "PrtDevModeW",
  "PrtDevNames",
  "PrtDevNamesW",
  "PrtMip",
  "RecSrcDt",
  "LayoutCachedLeft",
  "LayoutCachedTop",
  "LayoutCachedWidth",
  "LayoutCachedHeight",
  "PublishOption",
  "NoSaveCTIWhenDisabled",
  "NameMap",
]);

export type FormDriftKind =
  | "controlAdded"
  | "controlRemoved"
  | "propertyChanged"
  | "layoutBoundsChanged";

export interface FormDrift {
  kind: FormDriftKind;
  controlName?: string;
  key?: string;
  oldValue?: string;
  newValue?: string;
  /** Layout-bounds payload: the four old/new pairs in a deterministic order (Left, Top, Width, Height). */
  bounds?: { Left?: [string, string]; Top?: [string, string]; Width?: [string, string]; Height?: [string, string] };
  actionable: boolean;
  reason: string;
}

export interface CompareFormsInput {
  leftName: string;
  rightName: string;
  left: import("../models/form-ir.js").FormIR;
  right: import("../models/form-ir.js").FormIR;
}

export interface FormDriftReport {
  matched: boolean;
  driftDetected: boolean;
  actionableOk: boolean;
  drifts: FormDrift[];
  sourceName: string;
  targetName: string;
}

export function compareForms(input: CompareFormsInput): FormDriftReport;
```

**Files to create (tests)**:

- `test/core/services/form-ir-compare.test.ts` — strict TDD RED → GREEN cycle.

**Strict TDD cycle**:

1. **RED** — Write the test first. The minimum 7 cases (per the issue and
   the spec):

   - identical sources → empty drift, `matched: true`, `driftDetected: false`.
   - one control added in target (`target has an extra named control`).
   - one control removed in target (`target is missing a named control`).
   - one property changed on an existing same-named control (`Caption` change).
   - one control moved (Left, Top differ) → emits ONE `layoutBoundsChanged`,
     no separate `propertyChanged` for Left/Top.
   - non-actionable noise (`Checksum` change) → `actionable: false`,
     `matched` stays true.
   - duplicate scalar keys on a control (e.g. `NoSaveCTIWhenDisabled =1`
     twice) are compared by key, not by position.

   Each test MUST import `compareForms` from the new service. Each test
   MUST fail before WU-1's GREEN. Run `pnpm test -- form-ir-compare` and
   confirm every case fails because the module does not exist yet (or the
   function returns `undefined`).

2. **GREEN** — Implement the service. Pure, no I/O.

   - `compareForms` walks both `FormIR`s with `collectControls`-style
     name keying.
   - For each control name in the symmetric diff, emit `controlAdded` /
     `controlRemoved` with `actionable: true`.
   - For each shared name, walk each side's scalar entries by key and:
     - Emit one `propertyChanged` per differing key (skipping Left/Top/
       Width/Height — those go through `layoutBoundsChanged` instead).
     - Emit one `layoutBoundsChanged` carrying the four [old, new] tuples
       in `[Left, Top, Width, Height]` order. Emit even if only one of the
       four differs.
     - Classify `propertyChanged` by `FORM_NOISE_KEYS.has(key)` →
       `actionable: false / true`.
   - Compute `matched`, `driftDetected`, `actionableOk` from the drift list.

3. **REFACTOR** — Extract a tiny helper `walkScalarsByKey(ir): Map<string, string>`
   so the diff body stays readable. Re-run `pnpm test -- form-ir-compare`.

**Behavior locked in**: any future refactor of `form-ir-compare-service.ts`
MUST keep the 7 cases above green, and MUST keep `FORM_NOISE_KEYS` as the
canonical noise floor for property-change classification.

---

## WU-2 — MCP tool surface

**Files to modify**:

- `src/adapters/mcp/mcp-tool-registry.ts` — add `"compare_form"` to
  `VBA_SYNC_TOOL_NAMES`.
- `src/adapters/mcp/dispatch-routes.ts` — add
  `compare_form: { kind: "vba-sync", mutatesBinary: false,
  mutatesFilesystem: false }` to `MCP_TOOL_ROUTES`, with a comment mirroring
  the `inspect_form` / `lint_form_code` lines.
- `src/adapters/mcp/tool-parity-registry.ts` — add `"compare_form"` to the
  `implementedToolNames` set, and add a real per-tool description to
  `TOOL_DESCRIPTIONS` (≥40 chars, no boilerplate, locked by the existing
  `tool-descriptions.test.ts` guard).
- `src/adapters/mcp/schemas/vba-sync-schemas.ts` — add `compare_form` schema:
  `additionalProperties: false`, `properties: { sourcePath, path (alias),
  targetPath, target (alias) }`. No `required` — adapter enforces presence at
  the route layer (existing pattern for `inspect_form`).
- `src/adapters/vba-sync/vba-forms-adapter.ts` — extend
  `VbaFormsAdapter.handles("compare_form")` to return `true`, add a
  `compareForm(params)` branch in `execute()`, mirror the `inspectForm`
  shape: read both files via `FormFileSystemPort.readFile`, derive names from
  path, parse both via `parseFormTxt`, call `compareForms`, return
  `successResult(report)`. Typed error codes:
  `FORM_SPEC_MISSING` (missing source/target), `FORM_NOT_FOUND` (read fail),
  `FORM_PARSE_ERROR` (parse fail).

**Files to create (tests)**:

- `test/adapters/vba-sync/vba-forms-adapter-compare.test.ts` — strict TDD
  RED → GREEN cycle.

**Strict TDD cycle**:

1. **RED** — Write the test first. Cases:

   - `VbaFormsAdapter.handles("compare_form")` returns `true` and is not
     swallowed (`inspect_form`, `lint_form_code` still handled).
   - Missing `sourcePath` → `FORM_SPEC_MISSING`.
   - Missing `targetPath` → `FORM_SPEC_MISSING`.
   - `ENOENT` on readFile for source → `FORM_NOT_FOUND` with the path in the
     message.
   - Both files parse, simple property change → returns
     `{ matched: false, driftDetected: true, actionableOk: false, drifts: [...] }`.
   - Identical files → `matched: true`, empty drifts.
   - `writeFile` port is never called.

2. **GREEN** — Implement the adapter route and 5-site wiring. Re-run
   `pnpm test -- vba-forms-adapter-compare`.

3. **REFACTOR** — Extract `deriveFormName(sourcePath)` if needed for
   parity with the `inspect_form` naming rule. Confirm the existing
   `inspect_form` test still passes after any rename.

---

## WU-3 — Bumps to existing tool-count tests + README parity

**Files to modify**:

- `test/adapters/mcp/tool-parity.test.ts` — bump
  `VBA_SYNC_TOOL_NAMES` length expectation from 23 → 24, total from 47 → 48.
- `test/adapters/mcp/advertised-tool-count.test.ts` — bump
  `advertised.length` expectation from 53 → 54 (one new non-hidden tool).
- `test/adapters/mcp/release-matrix-gate.test.ts` — bump the breakdown
  expectation (47 → 48 for `DYSFLOW_MCP_TOOL_NAMES`, the comment now reads
  "47 dispatch + 1 inspect_form + 1 lint_form_code + 1 compare_form",
  and `visibleCount` 53 → 54).
- `test/adapters/mcp/mcp-tool-output-contracts.test.ts` — add
  `"compare_form"` to the `vbaManagerDysflowResult` group.
- `README.md` — register `compare_form` in the MCP tool inventory list
  alongside `inspect_form` / `lint_form_code`. (Mirror slice 1's
  `README.md:664` honesty fix style.)

**Tests added with WU-2's adapter test already cover the new surface**;
this WU is just the count bumps + README parity so the existing harness
doesn't regress.

---

## WU-4 — Quality gates

Run the full local quality gate set and confirm everything that touches the
slice 2 area is green:

1. `pnpm test` — must be green (modulo the pre-existing flaky
   `access-operation-registry` Windows EPERM test, which is documented as
   unrelated to this slice and is the only exception). The new
   `form-ir-compare.test.ts` and `vba-forms-adapter-compare.test.ts` MUST
   both be green.
2. `pnpm build` — must be green.
3. `pnpm lint` — must be green (Biome + tsc).
4. `pwsh -Command "Invoke-Pester scripts/tests/"` — must be green if
   available in the environment (the user's policy says run this in local
   gates; if a fresh runtime is unavailable in this sandbox, record the
   rationale and rely on CI).

If any of the slice-2-touched gates fail, STOP and report.

---

## WU-5 — Archive + Engram + close #597

**Files to create**:

- `openspec/changes/archive/2026-06-29-forms-ui-factory-slice-2/archive-report.md`
  with the metadata, the work-unit / commit table, the test references, the
  quality-gate status, the GitHub Actions run URL, and a forward note to
  slice 3 (serialize round-trip) and slice 4 (mutation primitives).
- Engram observation under topic `sdd/forms-ui-factory-slice-2`
  (`capture_prompt: false` — this is an SDD artifact, not a human decision)
  recording commits, archive path, CI run, and any design / scope notes
  that future sessions should recover.

**Issue closure**: close issue #597 with an evidence comment naming:

- the implementation commit SHA (the single `feat(forms)` commit),
- the archive commit SHA,
- the test references
  (`test/core/services/form-ir-compare.test.ts`,
  `test/adapters/vba-sync/vba-forms-adapter-compare.test.ts`),
- the archive path
  (`openspec/changes/archive/2026-06-29-forms-ui-factory-slice-2/`),
- the GitHub Actions run URL (only after CI green).

The comment MUST follow the format mandated by
`gentle-ai:issue-closure-traceability` so the closure is auditable from
`gh issue view 597 --comments` and survives binary/source restores.

---

## Implementation commits

| Commit   | Subject                                                                   | SDD tasks                                      | Verification                                                                                          |
|----------|---------------------------------------------------------------------------|------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| (pending) | `feat(forms): compare_form source-vs-source drift tool`                  | WU-1 + WU-2 + WU-3 + WU-4                       | `test/core/services/form-ir-compare.test.ts` (≥7 cases), `test/adapters/vba-sync/vba-forms-adapter-compare.test.ts` (≥7 cases), bumped count tests |
| (pending) | `chore(sdd): archive forms-ui-factory-slice-2`                            | WU-5 (archive + Engram + close #597)          | archive-report.md present; `gh issue view 597 --comments` shows evidence comment                      |

**Access sync**: source-only. No `MSACCESS.EXE` invocation, no Access install
required, no `LoadFromText`/`SaveAsText`. CI runs `pnpm test` against the
Node-side suite.

---

## Review Workload Forecast

| Field                                  | Value                                                                                       |
|----------------------------------------|---------------------------------------------------------------------------------------------|
| Estimated changed lines in this SDD    | ~290 (service ~120, types ~30, MCP wiring ~80, adapter test ~120, unit test ~120, count-bump test touches ~5 lines across 4 files, README ~5 lines, proposal/specs/tasks archive ~50) |
| 400-line budget risk                   | Low (matches issue #597 estimate ~290)                                                       |
| Chained PRs recommended                | No (dysflow is main-only; release policy forbids PRs)                                        |
| Delivery strategy                      | single-commit + archive-commit                                                                |
| Decision needed before apply           | No                                                                                            |

Two conventional commits land in `main`:

1. `feat(forms): compare_form source-vs-source drift tool` — carries WU-1 +
   WU-2 + WU-3 + WU-4 (the implementation, MCP wiring, count bumps, README
   parity, and the local quality gates that prove they pass).
2. `chore(sdd): archive forms-ui-factory-slice-2` — carries WU-5 (the
   archive report). The Engram observation is written separately and does
   not touch git.

Both commits are well under the 400-line budget on their own.
