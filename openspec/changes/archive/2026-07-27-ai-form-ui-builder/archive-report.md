# Archive Report: ai-form-ui-builder

**Archived at**: 2026-07-27
**Artifact store**: openspec (filesystem only - no Engram observation IDs were available for this retroactive archive)
**Status**: success
**Verdict**: PASS WITH WARNINGS
**Tracking issue**: #1161 (re-verify before archiving; #1156 held the change back pending the rerun)

## Summary

The SDD change `ai-form-ui-builder` is archived as part of the backlog cleanup tracked by issue #1161, which itself was opened during the #1156 sweep. The original `verify-report.md` (filed against `feat/ai-form-ui-builder`) was recorded as `Status: failed` with one CRITICAL: `apply_form_design_plan` overwriting a `.form.txt` with a synthetic status string. That CRITICAL was independently remediated by PR #813 (commit `f088d6df` — `src/core/services/form-ui-plan-execution.ts` introducing the three fail-closed validators `validatePlanIdentity`, `validatePlanOperationsAgainstContract`, `validatePlanPreservesContract`), but the original verify-report was never rewritten.

Issue #1161 tracked the required rerun. The native `sdd-verify` review facade was unable to freeze/render the required 507-path historical candidate (the previous attempt was blocked with `code: candidate_context_unavailable` on 2026-07-27T06:36:46Z, and a zero-diff review of clean `main` was rejected as dishonest), so this archive is based on a **scoped re-verification** (not a full native rerun): direct code inspection, focused test suite, `pnpm build`, `pnpm lint`, and the full project suite — all green on the current `main` @ `3fe528f`. The new `verify-report.md` records the methodology, what was covered, and what was not, in the same folder this archive moves into.

This is a retroactive archive of work that landed on `feat/ai-form-ui-builder` and reached `main` before the #1156 sweep. The archive date prefix follows the convention in `skills/sdd-archive` (today's ISO date), not the original completion date. The tracked CRITICAL is resolved; two WARNINGs are accepted and tracked below as follow-ups (not blocking for this archive).

## Task Completion Gate

| Check | Result | Evidence |
|---|---|---|
| OpenSpec tasks checked | PASS | Archived `tasks.md` has 14 of 14 implementation tasks marked `[x]` and zero `- [ ]` entries (5 phases: Foundation, Core Contracts, Apply + Verify Wiring, TDD Verification, Cleanup). |
| Verification critical issues | PASS WITH WARNINGS | Re-verified `verify-report.md` records `Status: passed`. CRITICAL from the original report is resolved (the synthetic status-string write is absent from current `main`; the apply path now routes through `applyGuardedFormWrite` after fail-closed pre-flight validators). Two WARNINGs are recorded and tracked as follow-ups (see "Notes and Risks"). |

No stale-checkbox reconciliation was performed.

## Specs Synced

| Domain | Action | Details |
|---|---|---|
| `ai-form-ui-builder` | Created | New main spec with 6 requirements and 10 tabulated scenarios: Workflow Contract (2), Semantic UI Analysis (2), Behavior Map (2), Design Plan Generation and Application (2), Reference Pattern Copy (2), Verification (2). |

No `openspec/specs/ai-form-ui-builder/` existed, so the delta became the new main spec. The delta was written as a flat `## ADDED Requirements` block (no `## Purpose`); on the way in, the document header was normalized to `# ai-form-ui-builder Specification` and the `## ADDED Requirements` block became `## Requirements`. A `## Purpose` paragraph was synthesized verbatim from the first sentence of the `proposal.md` Intent section ("Add an AI-first workflow for designing and validating Microsoft Access form UIs so contributors can analyze an existing form, map behavior, generate/apply a design plan, copy reference UI patterns, and verify the result without hand-waving") plus a second sentence capturing the protocol-neutral / adapter-specific split from the same proposal. Every requirement, scenario heading, scenario body, and GIVEN/WHEN/THEN clause was carried over verbatim; no requirement or scenario text was reworded.

## Archive Location

`openspec/changes/archive/2026-07-27-ai-form-ui-builder/`

## Archive Contents

- `proposal.md` — original change proposal
- `design.md` — original change design
- `tasks.md` — 14/14 tasks complete
- `apply-progress.md` — implementation evidence (TDD cycle table, files changed, test commands, deviations)
- `verify-report.md` — re-verified `Status: passed` (this run, 2026-07-27)
- `archive-report.md` — this file
- `specs/ai-form-ui-builder/spec.md` — copy of the original delta spec (the canonical version now lives at `openspec/specs/ai-form-ui-builder/spec.md`)

## Source of Truth Updated

- `openspec/specs/ai-form-ui-builder/spec.md` (new)

## Notes and Risks

- **Re-verification methodology is scoped, not native full-rerun.** The original `sdd-verify` review facade still cannot render the historical candidate (`code: candidate_context_unavailable`); a native 4R review receipt is **not** generated by this archive. What was verified: (a) the original CRITICAL is absent from `src/adapters/vba-sync/vba-forms-ai-tools.ts` and the new apply path uses `applyGuardedFormWrite` after `validatePlanIdentity` / `validatePlanOperationsAgainstContract` / `validatePlanPreservesContract` from `form-ui-plan-execution.ts`; (b) the focused suite (7 files, 66 tests) is green; (c) `pnpm build` is green; (d) `pnpm lint` is clean (the 20 Biome/format/style errors from the original report are absent); (e) the full project suite (`pnpm test`, 358 files, 4635 passed / 1 skipped / 1 todo) is green. The new `verify-report.md` is the auditable record of this rerun.

- **Spec/implementation drift on `codegraphEvidence` (WARNING #1).** The spec at `openspec/changes/ai-form-ui-builder/specs/ai-form-ui-builder/spec.md` says `codegraphEvidence` MUST be supplied, but the implementation intentionally relaxed it to "optional with opt-in `autoFetchCodeGraph: true` fallback" since #830. The README, the MCP schema (`vba-sync-schemas.ts:1104`), and the adapter test suite all document the relaxed contract correctly; only the spec delta is out of date. Follow-up: amend the spec to "MUST be supplied OR `autoFetchCodeGraph: true`", or open a separate issue. **Not blocking** for this archive because the fallback is safe and explicit (no throw, warning surfaced to caller).

- **No negative regression test for "screenshot-only" input (WARNING #2).** The adapter returns `FORM_SPEC_MISSING` when `sourcePath` is absent and the MCP schema for `analyze_form_ui` requires `sourcePath` or `path`, but a test that names the screenshot-only path explicitly is missing. The contract enforcement makes this low-risk; a single test in `test/adapters/vba-sync/vba-forms-ai-tools.test.ts` would close it. **Not blocking** for this archive.

- **The eight partially-done changes are untouched.** `git diff origin/main` scoped to their paths is empty (verified during the #1160 sweep and unchanged by this archive). They are: `2026-07-13-stale-laccdb-no-block-import`, `feat-759-no-compile`, `feat-v1.20.0-auto-mode-and-ambiguity`, `feat-v1.20.0-human-compile-reminder`, `form-ui-execution-wiring`, `projectid-form-source-resolution`, `verify-code-ergonomics`, `wire-write-policy-runtime-785`.

- **Post-change counts.** `openspec/changes/` now holds **8 active changes** (down from 9) and **44 open tasks** (unchanged — `ai-form-ui-builder` carried 0 pending tasks). The change count drops by one, the backlog stays the same.

- **`pnpm lint` passes** (607 files checked, no fixes applied). The 20 Biome/format/style errors from the original report are gone.
