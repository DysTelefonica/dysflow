# TypeScript Hotspot Decomposition

Issue #897 reduces large TypeScript hotspots through behavior-preserving, dependency-ordered
slices. Each slice keeps the public adapter contract stable and is independently reversible.

## Current responsibility and call graph

```text
VbaFormsAdapter.execute
  -> vba-forms-read-tools.ts (compatibility exports + remaining read capabilities)
       -> vba-forms-inspection-tools.ts (inspection and inventory capability)
            -> vba-forms-read-context.ts (resolve, read, parse)
                 -> core resolver/contracts/FormIR/parser/filesystem port
                 -> vba-forms-types.ts (type-only orchestrator boundary)
```

`vba-forms-read-context.ts` owns the shared source-path resolution, filesystem read, filename-derived
form identity, and canonical parse error envelope. `vba-forms-inspection-tools.ts` owns
`inspectForm`, `getFormGeometry`, and `listFormControls`, including capability-private geometry,
limit, event-binding, and section-filter helpers. `vba-forms-read-tools.ts` remains the compatible
import surface while retaining rendering, comparison, lint, layout, and binding behavior.

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
