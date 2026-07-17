# TypeScript Hotspot Decomposition

Issue #897 reduces large TypeScript hotspots through behavior-preserving, dependency-ordered
slices. Each slice keeps the public adapter contract stable and is independently reversible.

## Current responsibility and call graph

```text
VbaFormsAdapter.execute
  -> vba-forms-comparison-tools.ts
  -> vba-forms-inspection-tools.ts
  -> vba-forms-layout-binding-tools.ts
  -> vba-forms-lint-tools.ts
  -> vba-forms-preview-tools.ts
       -> vba-forms-read-context.ts (resolve, read, parse)
            -> core resolver/contracts/FormIR/parser/filesystem port + vba-forms-types.ts boundary
```

`vba-forms-read-context.ts` owns the shared source-path resolution, filesystem read, filename-derived
form identity, and canonical parse error envelope. `vba-forms-inspection-tools.ts` owns
`inspectForm`, `getFormGeometry`, and `listFormControls`, including capability-private geometry,
limit, event-binding, and section-filter helpers. `VbaFormsAdapter` imports every read capability
directly from its owning module; the `vba-forms-read-tools.ts` compatibility barrel is retired.

## Dependency-ordered child slices

Apply these slices in order; each title is the intended conventional commit/PR title.

1. **`refactor(vba-sync): extract form preview and diff read tools`:** move
   `renderFormPreviewTool` and `diffFormPreviewTool` behind the compatibility barrel and reuse the
   read context without depending on inspection.
2. **`refactor(vba-sync): extract form layout and binding analysis`:** move
   `analyzeFormLayoutTool` and `verifyFormBindingsTool`, including behavior-map and schema
   validation.
3. **`refactor(vba-sync): isolate form comparison and lint orchestration`:** move `compareForm`
   and the `lintFormCode` shim with their dedicated dependencies.
4. **`refactor(vba-sync): retire form read-tools compatibility barrel`:** migrate adapter imports
   only after the previous boundaries are stable; remove the barrel implementation and re-exports
   only when direct callers prove that removal safe.

The order follows dependencies rather than line count. Shared context moves first so later slices
depend downward on one stable boundary instead of importing sideways from another capability.

## Churn rationale and line evidence

Before this slice, `vba-forms-read-tools.ts` was **1,512 lines** and mixed source resolution,
inspection, geometry inventory, preview, comparison, lint, layout, and binding responsibilities.
After extraction it is **1,055 lines**. The focused modules are **107 lines**
(`vba-forms-read-context.ts`) and **130 lines** (`vba-forms-inspection-tools.ts`). The aggregate is
smaller than the original because duplicated resolution/parsing in `inspectForm` and the inventory
helpers became one context operation. This slice targets high-cohesion code that already changes
together; it does not split functions merely to reduce a metric.

The remaining barrel is **1,055 lines / 17 functions / 17 imports**. Across the last 100 commits,
the touched path accounts for **1,536 additions + 481 deletions = 2,017 changed lines**. The next
slices are ordered by dependency even though the raw prioritization metrics differ:

| Remaining slice | Span in barrel | Dependency/core mass | Functions | Imports | Churn |
| --- | ---: | ---: | ---: | ---: | ---: |
| Preview rendering and diff | 337 lines | 1,242 LOC | 52 | 5 | 1,242 |
| Layout and binding analysis | 261 lines | 976 LOC | 44 | 7 | 1,008 |
| Comparison and lint | 194 lines | 726 LOC | 24 | 12 | 818 |

## Boundary and cycle invariants

- Core never imports adapters.
- The read context imports core modules plus only a type-only orchestrator dependency.
- Inspection imports the read context, never the compatibility barrel.
- The compatibility barrel re-exports inspection; extracted modules never import it back.
- Capability modules do not import sibling capabilities.
- Filesystem I/O stays behind `FormFileSystemPort`; parsing and geometry remain core services.
- `VbaFormsAdapter.execute` remains the observable test port and its result envelopes do not change.

Tarjan analysis over all `src/**/*.ts` files found no cycle regression:

| Graph | Modules | Declarations | Edges | SCCs | Cyclic SCCs |
| --- | ---: | ---: | ---: | ---: | ---: |
| Before extraction | 158 | 697 | 554 | 135 | 6 |
| After extraction | 160 | 711 | 568 | 135 | 6 |

The relevant induced graph changed from **2 modules / 1 edge / 0 cycles**
(`adapter -> read-tools`) to **4 modules / 3 edges / 0 cycles**
(`adapter -> read-tools -> inspection -> context`). Relevant outgoing edges increased from **29 to
43** because dependencies were redistributed into explicit capability modules; the unchanged cycle
count is the safety signal, not a lower raw edge count.

## Verification

```powershell
pnpm exec vitest run test/adapters/vba-sync/vba-forms-adapter-inspect.test.ts test/adapters/vba-sync/vba-forms-adapter-geometry.test.ts --coverage --coverage.include=src/adapters/vba-sync/vba-forms-read-context.ts --coverage.include=src/adapters/vba-sync/vba-forms-inspection-tools.ts --coverage.include=src/adapters/vba-sync/vba-forms-read-tools.ts --coverage.reporter=text --coverage.reporter=json-summary
pnpm lint
pnpm build
git diff --check
node scripts/check-core-adapter-boundary.mjs
codegraph index C:\Proyectos\dysflow-worktrees\refactor-897-typescript-hotspots
codegraph explore "vba forms inspection read context dependency direction" --max-files 6
```

The focused run passed **2 files / 20 tests**. Its process exited **1 only because a narrow
`--coverage.include` run still enforces the repository-wide global thresholds**; the tests
themselves were green. Exact focused coverage was:

| File | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `vba-forms-inspection-tools.ts` | 41/46 (89.13%) | 29/51 (56.86%) | 9/10 (90%) | 36/39 (92.30%) |
| `vba-forms-read-context.ts` | 25/30 (83.33%) | 15/22 (68.18%) | 1/1 (100%) | 25/29 (86.20%) |
| `vba-forms-read-tools.ts` | 0/335 (0%) | 0/255 (0%) | 0/17 (0%) | 0/315 (0%) |
| **Focused include total** | **66/411 (16.05%)** | **44/328 (13.41%)** | **10/28 (35.71%)** | **61/383 (15.92%)** |

The barrel's zero row is expected: this focused command exercises the extracted inspection path,
not the remaining preview, layout, comparison, or lint bodies. Full-suite and global coverage gates
remain the authoritative repository checks.

For the quantitative baseline, the same 20 port tests were run at parent commit `26e510e3` with
only the pre-extraction `vba-forms-read-tools.ts` included. They also passed, and the mixed barrel
reported **113/494 statements (22.87%)**, **52/355 branches (14.64%)**, **11/29 functions
(37.93%)**, and **103/454 lines (22.68%)**. The current extracted contract path—the inspection and
read-context modules together—reports **66/76 statements (86.84%)**, **44/73 branches (60.27%)**,
**10/11 functions (90.91%)**, and **61/68 lines (89.71%)**.

Those percentages are not an apples-to-apples improvement claim: the baseline denominator includes
all preview, layout, comparison, and lint bodies in the former 1,512-line barrel, while the current
aggregate isolates the extracted capability and deduplicates resolution/parsing. The defensible
regression evidence is that the identical 20 observable port contracts pass before and after, and
the extracted behavior remains quantitatively exercised rather than becoming an untested seam.

Rollback boundary: remove the two extracted modules and this document, restore the extracted
functions in `vba-forms-read-tools.ts`, and remove the additional adapter-envelope assertions. No
core contract, dispatch route, or external tool name needs reverting.

## Issue #913 — preview rendering and diff extraction

The first planned child slice now lives in `vba-forms-preview-tools.ts`. It owns
`renderFormPreviewTool`, `diffFormPreviewTool`, and their private option/output orchestration while
depending downward on `vba-forms-read-context.ts`. It imports neither the inspection capability nor
the compatibility barrel. `vba-forms-read-tools.ts` continues to re-export both public functions,
so `VbaFormsAdapter.execute` and every external tool contract remain unchanged.

The read context now exposes a candidate-snapshot seam. Candidate resolution reads each successful
path once and parses those exact bytes; diff still resolves the execution target once for both
aliases and preserves before/after-specific read and parse errors. Stateful filesystem port tests
return invalid content on any second read, proving render and both diff sides retain their first
successful snapshots without asserting private collaborator calls.

| File | Before #913 | After #913 |
| --- | ---: | ---: |
| `vba-forms-read-tools.ts` | 1,055 | 676 |
| `vba-forms-preview-tools.ts` | 0 | 162 |
| `vba-forms-read-context.ts` | 107 | 132 |

Verification evidence:

- The four adapter suites are reproducible with
  `pnpm vitest run test/adapters/vba-sync/vba-forms-adapter-render.test.ts test/adapters/vba-sync/vba-forms-adapter-diff.test.ts test/adapters/vba-sync/vba-forms-adapter-inspect.test.ts test/adapters/vba-sync/vba-forms-adapter-geometry.test.ts`:
  **4 files / 46 tests passed**.
- The preview/diff contract run is reproducible with
  `pnpm vitest run test/core/services/form-ui-render.test.ts test/core/services/form-ui-diff.test.ts test/adapters/vba-sync/vba-forms-adapter-render.test.ts test/adapters/vba-sync/vba-forms-adapter-diff.test.ts`:
  **4 files / 65 tests passed**. These are two core suites plus two adapter suites, not four adapter
  suites.
- `pnpm lint`: passed, including TypeScript and boundary checks.
- `pnpm build`: passed.
- `node scripts/check-core-adapter-boundary.mjs`: passed.
- `git diff --check`: passed.
- CodeGraph sync including the committed evidence script and test passed (**656 files / 11,533
  nodes / 37,899 edges**); its dependency query
  confirms preview imports read context and the adapter still reaches preview only through the
  compatibility barrel.

The coverage run used the same two core and two adapter preview/diff suites on both trees. The
narrow current run exited **1 only because repository-wide global coverage thresholds still apply
to a deliberately narrow `--coverage.include` selection**; all 65 focused tests passed. Exact
baseline coverage for the
pre-extraction barrel was:

| Baseline file | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `vba-forms-read-tools.ts` | 106/335 (31.64%) | 65/255 (25.49%) | 3/17 (17.64%) | 104/315 (33.01%) |

Current focused coverage was:

| Current file/set | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `vba-forms-preview-tools.ts` | 82.60% | 77.77% | 100% | 85.96% |
| `vba-forms-read-context.ts` | 83.87% | 76% | 100% | 86.66% |
| `vba-forms-read-tools.ts` | 0% | 0% | 0% | 0% |
| **Focused include total** | **522/773 (67.52%)** | **312/543 (57.45%)** | **60/75 (80%)** | **461/666 (69.21%)** |

The barrel's zero row is expected: these suites exercise the extracted preview, inspection, and
shared-context paths, not its remaining layout, comparison, lint, and binding bodies. Core diff and
render services remain highly covered and behaviorally unchanged. Baseline and current aggregate
percentages are not an apples-to-apples improvement claim: extraction redistributes code into new
denominators and the current aggregate includes core services and already-extracted capabilities.
The defensible comparison is the same four preview/diff contract suites passing before and after,
with the new capability and context directly exercised through the two adapter port suites.

Tarjan analysis is now reproducible with the committed
`node scripts/report-ts-import-cycles.mjs [--root <checkout>] [--files <paths...>]` command. The
script parses static relative TypeScript imports and re-exports with the TypeScript compiler,
resolves them with `NodeNext`, sorts its JSON output, and reports both the full graph and an optional
induced file set. Running it against a temporary detached worktree at the exact issue base
`04681eeb` and against the current tree produced:

| Graph | Modules | Edges | SCCs | Cyclic SCCs | Cyclic sizes |
| --- | ---: | ---: | ---: | ---: | --- |
| Base `04681eeb` | 160 | 568 | 135 | 6 | 15, 8, 2, 2, 2, 2 |
| After #913 | 161 | 572 | 137 | 6 | 14, 8, 2, 2, 2, 2 |

The relevant direct induced graph is acyclic: `adapter -> barrel`; `barrel -> inspection, preview`;
`inspection -> context`; `preview -> context, core-diff, core-render`; `context -> core`; and
`core-diff -> core-render`. Reproduce it with
`node scripts/report-ts-import-cycles.mjs --files src/adapters/vba-sync/vba-forms-adapter.ts src/adapters/vba-sync/vba-forms-read-tools.ts src/adapters/vba-sync/vba-forms-inspection-tools.ts src/adapters/vba-sync/vba-forms-preview-tools.ts src/adapters/vba-sync/vba-forms-read-context.ts src/core/services/form-ui-diff.ts src/core/services/form-ui-render.ts`.
That command reports **7 modules / 8 edges / 7 SCCs / 0 cyclic SCCs**. The neutral target-resolver port keeps preview and read context as
singleton SCCs outside the legacy VBA-sync component. Globally, the largest cyclic SCC changes from
**15 modules at `04681eeb` to 14 modules after #913**; this is not described as “no SCC growth” or
as an unchanged global graph. Inspection retains its pre-existing #897 membership, while the
relevant induced capability graph remains acyclic.

Rollback boundary: restore the preview and diff bodies in `vba-forms-read-tools.ts`, remove
`vba-forms-preview-tools.ts`, revert the candidate-snapshot additions in
`vba-forms-read-context.ts`, and remove the two stateful port regressions. The adapter import,
dispatch route, core renderer/diff services, and public error/result envelopes require no rollback.

## Issue #914 — layout analysis and binding validation extraction

`vba-forms-layout-binding-tools.ts` now owns `analyzeFormLayoutTool`,
`verifyFormBindingsTool`, and their private option/schema/counting helpers. The capability depends
only on the neutral `FormTargetResolver`/`readFormContext` boundary and the core analysis,
behavior-map, layout-lint, and binding-validator services. It imports neither preview, inspection,
nor the compatibility barrel. The barrel retains both re-exports, so adapter dispatch, aliases,
schema normalization, options, messages, and result envelopes are unchanged.

Both project-target paths now parse the exact bytes that selected the successful candidate instead
of probing a path and reading it again. Stateful filesystem port regressions return valid form
content once and malformed content on a second read; layout analysis and binding validation both
succeed with exactly one read through `VbaFormsAdapter.execute`.

| File | Before #914 | After #914 |
| --- | ---: | ---: |
| `vba-forms-read-tools.ts` | 676 | 221 |
| `vba-forms-layout-binding-tools.ts` | 0 | 189 |
| `vba-forms-read-context.ts` | 135 | 135 |

The same four focused core/adapter suites passed before extraction (**4 files / 72 tests**) and
after extraction (**4 files / 75 tests**); three additions cover snapshots and error precedence.
The narrow coverage result is reproducible with this exact four-suite command and include list:

```powershell
pnpm exec vitest run test/core/services/form-ui-layout-lint.test.ts test/core/services/form-ui-binding-validator.test.ts test/adapters/vba-sync/vba-forms-adapter-layout.test.ts test/adapters/vba-sync/vba-forms-adapter-verify-bindings.test.ts --coverage --coverage.include=src/adapters/vba-sync/vba-forms-read-tools.ts --coverage.include=src/adapters/vba-sync/vba-forms-layout-binding-tools.ts --coverage.include=src/adapters/vba-sync/vba-forms-read-context.ts
```

| Current file/set | Statements | Branches | Functions | Lines |
| --- | ---: | ---: | ---: | ---: |
| `vba-forms-layout-binding-tools.ts` | 91.75% | 86.58% | 100% | 96.29% |
| `vba-forms-read-context.ts` | 93.54% | 84% | 100% | 93.33% |
| **Focused include total** | **118/186** | **92/148** | **14/18** | **106/168** |

The process exits **1 only because repository-wide global thresholds apply to this deliberately
narrow include list**; all **4 files / 75 focused tests pass**. The uncovered compatibility barrel
is included so the totals state the exact measurement boundary. These denominators are execution
evidence rather than a percentage-improvement claim; the identical four port/core suites plus the
stateful port regressions are the behavior-preservation proof.

Tarjan reporting remains reproducible through `node scripts/report-ts-import-cycles.mjs`. The full
graph changed from **161 modules / 572 edges / 6 cyclic SCCs** to **162 modules / 578 edges / 6
cyclic SCCs**; cyclic sizes remain **14, 8, 2, 2, 2, 2**. The relevant eight-file induced graph is
acyclic at **8 modules / 7 edges / 8 SCCs / 0 cyclic SCCs**. Reproduce that result with:

```powershell
node scripts/report-ts-import-cycles.mjs --files src/adapters/vba-sync/vba-forms-adapter.ts src/adapters/vba-sync/vba-forms-read-tools.ts src/adapters/vba-sync/vba-forms-layout-binding-tools.ts src/adapters/vba-sync/vba-forms-read-context.ts src/core/services/form-ui-analysis-service.ts src/core/services/form-ui-behavior-map-service.ts src/core/services/form-ui-layout-lint.ts src/core/services/form-ui-binding-validator.ts
```

Verification: the focused command passed **4 files / 75 tests**; `pnpm lint`, `pnpm build`,
`node scripts/check-core-adapter-boundary.mjs`, and `git diff --check` passed. CodeGraph was indexed
after the edit and confirms the capability points downward to read context/core while the adapter
continues through the compatibility barrel.

Rollback boundary: move the two tool bodies and private helpers back into
`vba-forms-read-tools.ts`, remove `vba-forms-layout-binding-tools.ts`, and remove the two stateful
port regressions and this section. No adapter dispatch, core contract, external tool name, schema,
or result envelope requires rollback.

## Issue #915 — comparison and lint wrapper extraction

`vba-forms-comparison-tools.ts` now owns `compareForm`; it depends on the neutral
`FormTargetResolver` and snapshot readers rather than another capability or the compatibility
barrel. Project comparisons resolve their target once, read each successful candidate once, and
parse exactly those bytes. Direct comparisons retain the `sourcePath`/`path` and
`targetPath`/`target` aliases and read each side once. Both paths are validated before reads; source
and target reads precede source and target parsing, with the existing side-specific messages.

`vba-forms-lint-tools.ts` owns only the public parameter normalization and delegation to the
unchanged `VbaFormsLintAdapter`. Its tests continue to lock the lint adapter's intentional
probe-then-reread behavior. The former hotspot is now a five-line compatibility re-export surface:

| File | Before #915 | After #915 |
| --- | ---: | ---: |
| `vba-forms-read-tools.ts` | 221 | 5 |
| `vba-forms-lint-tools.ts` | 0 | 31 |

The RED boundary was:

```powershell
pnpm exec vitest run test/core/services/form-ir-compare.test.ts test/core/services/form-lint.test.ts test/adapters/vba-sync/vba-forms-adapter-compare.test.ts test/adapters/vba-sync/vba-forms-lint-adapter.test.ts
```

Before implementation it reported **4 files: 3 passed, 1 failed; 63 tests: 62 passed, 1 failed**
because a project candidate was read twice and the second, stateful response was parsed. The same
command after correction reports **4 files / 66 tests passed**. The added adapter-port regressions
cover one-read project snapshots, one-read direct paths, target resolution once, aliases, competing
read/parse failures, and exact source/target parse diagnostics without observing private helpers.

The architecture boundary is reproducible with:

```powershell
pnpm lint
pnpm build
node scripts/check-core-adapter-boundary.mjs
git diff --check
```

All four commands pass. The focused import graph is reproducible with:

```powershell
node scripts/report-ts-import-cycles.mjs --files src/adapters/vba-sync/vba-forms-adapter.ts src/adapters/vba-sync/vba-forms-read-tools.ts src/adapters/vba-sync/vba-forms-comparison-tools.ts src/adapters/vba-sync/vba-forms-lint-tools.ts src/adapters/vba-sync/vba-forms-read-context.ts src/adapters/vba-sync/vba-forms-lint-adapter.ts src/core/services/form-ir-compare-service.ts src/core/services/form-lint.ts
```

It reports **8 modules / 7 edges / 8 SCCs / 0 cyclic SCCs**. The full reporter result is **164
modules / 583 edges / 139 SCCs / 6 cyclic SCCs**, with cyclic sizes **15, 8, 2, 2, 2, 2**.

Rollback boundary: restore comparison and lint wrapper bodies in `vba-forms-read-tools.ts`, remove
`vba-forms-comparison-tools.ts` and `vba-forms-lint-tools.ts`, and remove the three new adapter-port
regressions and this section. The unchanged lint adapter, core compare/lint services, adapter
dispatch, public tool names, aliases, and result envelopes require no rollback.

## Issue #916 — compatibility barrel retirement

`VbaFormsAdapter` now imports each read capability directly from its owning module, in the same
comparison, inspection, layout/binding, lint, and preview initialization order previously exposed
by `vba-forms-read-tools.ts`. The five-line compatibility barrel had no remaining live caller and
has been deleted. Dispatch order, public tool names, filesystem-port seams, and result/error
envelopes are unchanged; the existing adapter-port suites are therefore the behavioral regression
boundary and no implementation-coupled test was added.

| File | Before #916 | After #916 |
| --- | ---: | ---: |
| `vba-forms-read-tools.ts` | 5 lines | deleted |
| Direct adapter capability imports | 1 barrel | 5 owning modules |

The focused behavioral baseline and post-change check are reproducible with:

```powershell
pnpm exec vitest run test/adapters/vba-sync/vba-forms-adapter-diff.test.ts test/adapters/vba-sync/vba-forms-adapter-layout.test.ts test/adapters/vba-sync/vba-forms-adapter.test.ts
```

Both runs report **3 files / 31 tests passed**. Caller proof is reproducible with
`git grep -n "vba-forms-read-tools" -- "src/**/*.ts" "test/**/*.ts"`; after retirement it returns
no live TypeScript caller. Historical plans and earlier issue evidence retain the old filename as
an intentional record of their then-current architecture.

The focused import graph is reproducible with:

```powershell
node scripts/report-ts-import-cycles.mjs --files src/adapters/vba-sync/vba-forms-adapter.ts src/adapters/vba-sync/vba-forms-comparison-tools.ts src/adapters/vba-sync/vba-forms-inspection-tools.ts src/adapters/vba-sync/vba-forms-layout-binding-tools.ts src/adapters/vba-sync/vba-forms-lint-tools.ts src/adapters/vba-sync/vba-forms-preview-tools.ts
```

Before retirement, the same capability set plus the barrel reported **7 modules / 6 edges / 7
SCCs / 0 cyclic SCCs**. After retirement it reports **6 modules / 5 edges / 6 SCCs / 0 cyclic
SCCs**: the forwarding node and edge disappeared without introducing a cycle.

Rollback boundary: restore the five-line compatibility barrel and point the adapter's read-tool
imports back to it. No capability implementation, core contract, dispatch route, external schema,
or test needs reverting.
