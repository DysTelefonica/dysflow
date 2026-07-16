# Form Layout and Binding Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract layout analysis and binding validation from the compatibility barrel without changing their adapter-port behavior.

**Architecture:** A cohesive layout/binding capability owns the two tool functions and their normalization helpers. It reads one exact filesystem snapshot through the neutral read-context port, delegates all rules to core services, and remains re-exported by the existing barrel.

**Tech Stack:** TypeScript, Vitest, pnpm, CodeGraph.

---

### Task 1: Lock the snapshot contract

**Files:**
- Modify: `test/adapters/vba-sync/vba-forms-adapter-layout.test.ts`
- Modify: `test/adapters/vba-sync/vba-forms-adapter-verify-bindings.test.ts`

- [x] **Step 1: Add failing stateful port tests**

Drive each tool only through `VbaFormsAdapter.execute`, return valid form bytes on the first read of the resolved project candidate, and malformed bytes on any second read.

- [x] **Step 2: Verify RED**

Run `pnpm exec vitest run test/adapters/vba-sync/vba-forms-adapter-layout.test.ts test/adapters/vba-sync/vba-forms-adapter-verify-bindings.test.ts` and expect the two new snapshot cases to fail while the existing 22 cases pass.

### Task 2: Extract the capability

**Files:**
- Create: `src/adapters/vba-sync/vba-forms-layout-binding-tools.ts`
- Modify: `src/adapters/vba-sync/vba-forms-read-tools.ts`

- [x] **Step 1: Move both public tools and private helpers**

Move layout option normalization, section counting, schema normalization, and control counting with the tools they serve. Use `readFormContext` and its `FormTargetResolver` port so project candidates are parsed from the bytes that selected them.

- [x] **Step 2: Preserve compatibility exports**

Re-export `analyzeFormLayoutTool` and `verifyFormBindingsTool` from `vba-forms-read-tools.ts`; do not change `VbaFormsAdapter` dispatch or external result/error contracts.

- [x] **Step 3: Verify GREEN**

Run the two adapter suites and expect 24/24 tests to pass.

### Task 3: Record and verify architecture evidence

**Files:**
- Modify: `docs/architecture/typescript-hotspot-decomposition.md`

- [x] **Step 1: Document responsibility, line, coverage, and cycle evidence**

Record the before/after barrel and capability lines, the identical four-suite behavior baseline/current results, focused coverage denominators, and reproducible SCC evidence.

- [x] **Step 2: Run repository gates**

Run the four focused suites, `pnpm lint`, `pnpm build`, `node scripts/check-core-adapter-boundary.mjs`, `git diff --check`, and CodeGraph indexing/exploration. Expect all behavioral and repository gates to pass; a deliberately narrow coverage run may exit 1 only for repository-wide thresholds.

Rollback boundary: restore the two tool bodies/helpers to `vba-forms-read-tools.ts`, remove the new capability and stateful regressions, and remove the #914 documentation section. No adapter dispatch, core service, schema, or public tool name requires rollback.
