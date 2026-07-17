# Form Comparison and Lint Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the remaining form comparison and lint wrapper behavior from the read-tools hotspot without changing public tool contracts.

**Architecture:** `vba-forms-comparison-tools.ts` owns comparison resolution, immutable snapshots, parsing, and core delegation through the neutral read-context port. `vba-forms-lint-tools.ts` owns only public payload normalization and delegation to the unchanged lint adapter; `vba-forms-read-tools.ts` is a compatibility re-export surface.

**Tech Stack:** TypeScript, Vitest, Biome, CodeGraph, deterministic TypeScript import-cycle reporter.

---

### Task 1: Lock comparison snapshot behavior

**Files:**
- Modify: `test/adapters/vba-sync/vba-forms-adapter-compare.test.ts`

- [x] Add a project-target regression whose filesystem returns a valid candidate only on its first read.
- [x] Add a direct-path regression that asserts one read per side while exercising `path` and `target` aliases.
- [x] Run the four focused suites and observe the project snapshot regression fail before implementation: 4 files, 62 passed, 1 failed.

### Task 2: Extract comparison and lint capabilities

**Files:**
- Create: `src/adapters/vba-sync/vba-forms-comparison-tools.ts`
- Create: `src/adapters/vba-sync/vba-forms-lint-tools.ts`
- Modify: `src/adapters/vba-sync/vba-forms-read-tools.ts`
- Modify: `test/adapters/vba-sync/vba-forms-lint-adapter.test.ts`

- [x] Move `compareForm` behind `FormTargetResolver`, `readFormCandidateContext`, and `readFormSnapshot`, resolving the execution target once and parsing the successful candidate bytes once.
- [x] Preserve source-before-target validation/read/parse precedence, aliases, side-specific messages, and result envelopes.
- [x] Move only lint payload normalization/delegation; leave `vba-forms-lint-adapter.ts` and its probe/reread semantics unchanged.
- [x] Exercise normalization through `VbaFormsAdapter.execute` at the public port.
- [x] Replace the hotspot with five compatibility re-exports and verify the four focused suites: 4 files, 63 tests passed.

### Task 3: Verify architecture and delivery boundaries

**Files:**
- Modify: `docs/architecture/typescript-hotspot-decomposition.md`

- [x] Run `pnpm lint`, `pnpm build`, `node scripts/check-core-adapter-boundary.mjs`, and `git diff --check`; all pass.
- [x] Run the eight-file induced-cycle command; it reports 8 modules, 7 edges, 8 SCCs, and 0 cyclic SCCs.
- [x] Re-index CodeGraph after the code edits; 658 files, 11,545 nodes, and 37,782 edges indexed.
- [x] Record the exact focused, architecture, cycle, and rollback boundaries in the architecture evidence.
