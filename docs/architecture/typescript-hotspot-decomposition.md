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

## Dependency-ordered slices

1. **Inspection and inventory (this slice):** extract shared read context, then inspection tools.
2. **Preview rendering and diff:** reuse a stable read context without depending on inspection.
3. **Layout and binding analysis:** separate analysis envelopes from preview concerns.
4. **Comparison and lint:** isolate their dedicated core-service orchestration and lint adapter.
5. **Compatibility cleanup:** update direct callers only after every capability boundary is stable;
   keep re-exports until a separately reviewed migration proves they are unnecessary.

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

## Boundary and cycle invariants

- Core never imports adapters.
- The read context imports core modules plus only a type-only orchestrator dependency.
- Inspection imports the read context, never the compatibility barrel.
- The compatibility barrel re-exports inspection; extracted modules never import it back.
- Capability modules do not import sibling capabilities.
- Filesystem I/O stays behind `FormFileSystemPort`; parsing and geometry remain core services.
- `VbaFormsAdapter.execute` remains the observable test port and its result envelopes do not change.

## Verification

```powershell
pnpm vitest run test/adapters/vba-sync/vba-forms-adapter-inspect.test.ts test/adapters/vba-sync/vba-forms-adapter-geometry.test.ts
pnpm lint
pnpm build
git diff --check
node scripts/check-core-adapter-boundary.mjs
codegraph index C:\Proyectos\dysflow-worktrees\refactor-897-typescript-hotspots
codegraph explore "vba forms inspection read context dependency direction" --max-files 6
```

Rollback boundary: remove the two extracted modules and this document, restore the extracted
functions in `vba-forms-read-tools.ts`, and remove the additional adapter-envelope assertions. No
core contract, dispatch route, or external tool name needs reverting.
