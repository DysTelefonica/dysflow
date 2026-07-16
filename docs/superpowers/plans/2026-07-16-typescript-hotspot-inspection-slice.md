# TypeScript Hotspot Inspection Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract form inspection and inventory behavior from the largest TypeScript hotspot without changing its public adapter contract.

**Architecture:** Keep `vba-forms-read-tools.ts` as the compatibility surface. Move shared read/parse resolution into a one-way context module and move inspection, geometry, and control-list behavior into one capability module that depends on that context and core ports only.

**Tech Stack:** TypeScript, Vitest, CodeGraph, pnpm.

---

### Task 1: Freeze the inspection contract

**Files:**
- Test: `test/adapters/vba-sync/vba-forms-adapter-inspect.test.ts`
- Test: `test/adapters/vba-sync/vba-forms-adapter-geometry.test.ts`

- [ ] Add port-level assertions through `VbaFormsAdapter.execute` for path aliases, project resolution, missing inputs/files, parse failure, geometry, filtering, limits, truncation, and event binding. `list_form_controls` coverage belongs in `vba-forms-adapter-geometry.test.ts`: the describe block starts at line 187, with cases at lines 188, 196, 254, 261, 274, and 293.
- [ ] Run `pnpm exec vitest run test/adapters/vba-sync/vba-forms-adapter-inspect.test.ts test/adapters/vba-sync/vba-forms-adapter-geometry.test.ts` and record the intentional RED result for the new contract.

### Task 2: Extract the cohesive capability

**Files:**
- Create: `src/adapters/vba-sync/vba-forms-read-context.ts`
- Create: `src/adapters/vba-sync/vba-forms-inspection-tools.ts`
- Modify: `src/adapters/vba-sync/vba-forms-read-tools.ts`

- [ ] Move source resolution, file reading, and FormIR parsing into the read-context module, with only core dependencies and a type-only orchestrator dependency.
- [ ] Move `inspectForm`, `getFormGeometry`, and `listFormControls` with their private helpers into the inspection module.
- [ ] Re-export the three functions from the existing read-tools module and ensure extracted modules never import that barrel.
- [ ] Run the focused command from Task 1 and require GREEN.

### Task 3: Record architecture and verify

**Files:**
- Create: `docs/architecture/typescript-hotspot-decomposition.md`

- [ ] Record the responsibility/call-graph map, dependency-ordered future slices, churn evidence, before/after line counts, and cycle/boundary invariants.
- [ ] Run `pnpm lint`, `pnpm build`, relevant/full tests, `git diff --check`, and dependency-cycle/boundary checks.
- [ ] Re-index CodeGraph and confirm the new dependency direction.
- [ ] Commit code, tests, and documentation as one behavior-preserving work unit.
