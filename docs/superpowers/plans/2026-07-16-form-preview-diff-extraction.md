# Form Preview and Diff Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract preview rendering and preview diff orchestration from the compatibility barrel without changing the adapter port contract.

**Architecture:** A cohesive adapter capability owns both preview entry points and private option/output helpers. It depends downward on the shared read context; that context gains a target-aware snapshot seam so candidate discovery and parsing use the same bytes exactly once.

**Tech Stack:** TypeScript, Vitest, CodeGraph, pnpm.

---

### Task 1: Lock snapshot behavior at the adapter port

**Files:**
- Modify: `test/adapters/vba-sync/vba-forms-adapter-render.test.ts`
- Modify: `test/adapters/vba-sync/vba-forms-adapter-diff.test.ts`

- [x] Add stateful filesystem tests that return invalid content on a second read.
- [x] Run both suites and verify the tests fail because resolved candidates are re-read.

### Task 2: Extract the cohesive preview capability

**Files:**
- Create: `src/adapters/vba-sync/vba-forms-preview-tools.ts`
- Modify: `src/adapters/vba-sync/vba-forms-read-context.ts`
- Modify: `src/adapters/vba-sync/vba-forms-read-tools.ts`

- [x] Extend the shared context with target-aware single-snapshot reading and side-specific error labels.
- [x] Move render and diff entry points plus private option/output helpers into the capability module.
- [x] Re-export both functions from the compatibility barrel without changing adapter imports.
- [x] Run the focused suites and verify all port contracts pass.

### Task 3: Record architecture evidence and verify boundaries

**Files:**
- Modify: `docs/architecture/typescript-hotspot-decomposition.md`

- [x] Record #913 line counts, dependency direction, verification evidence, and rollback boundary.
- [x] Run four focused suites, lint, build, core-adapter boundary, and diff checks.
- [x] Re-index CodeGraph and confirm the capability depends on context rather than inspection or the barrel.
