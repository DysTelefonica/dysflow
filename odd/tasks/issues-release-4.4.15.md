# Resolve the issue queue and publish the next release
Branch: `chore/issues-release-4.4.15`; delivery: auto-chain, independent issue PRs to main; forecast: 2,000 authored lines.
Runner: focused Vitest/Pester regressions, repository quality gates, and `pnpm test:e2e:mcp:release`.

## Specs

- S1: "ataca las issues y saca release". Resolve every actionable open issue against current evidence, integrate verified fixes, and publish exactly one final release after the required gates pass.
- S2: "autorizo no preguntes nada si no es imprescincdible tienes todo autorizado en esta sesión, trabaja desatendidamente". Proceed autonomously with implementation, verification, GitHub delivery, and release. Use the explicitly authorized `gpt-6.1-sol` substitute for unavailable `gpt-6.1-luna`.
- S3: Existing issue acceptance criteria are authoritative for their individual scope: #1812, #1822, #1823, #1824, #1830, #1831, #1832, #1833, #1834, #1835; #1836 aggregates #1831–#1835. Reproduce each report before fixing; close only with observed evidence.

## Tasks

- T1 | S1–S3 | delegated explorer | mapping complete | baseline `623ba51a`.
- T2 | S1–S3 | delegated independent issue lanes | #1831 readiness guard | RED 2; GREEN 26; MCP 2,187; independent verification pending.
- T3 | S1–S3 | delegated independent issue lanes | #1830 cleanup contract | RED contract + inspection; MCP GREEN 2,195; independent verification pending.
- T4 | S1–S3 | delegated independent issue lanes | #1812 startup suppression | RED 4; GREEN 8; runner regressions 147; independent verification pending.
- T5 | S1–S3 | inline isolated lanes | #1832 CI applicability: commit `583384f0`, PR #1837 pending CI; #1835 pinned Pester: RED 3/GREEN 3, broader proof pending.
- T6 | S1–S3 | delegated independent issue lanes | #1833 discovery metadata | pending.
- T7 | S1–S3 | delegated independent issue lanes | #1834 cancellation | pending.
- T8 | S1–S3 | delegated independent issue lanes | #1822 isolated Pi installation | pending.
- T9 | S1–S3 | delegated independent issue lanes | #1823 test procedure callability | pending.
- T10 | S1–S3 | inline | #1824 shipped harness/examples reconciliation | pending.
- T11 | S1–S3 | inline | close #1836 after child evidence; final queue reconciliation, release gates and publication | pending.
- T12 | S1–S3 | independent issue lane | #1838 repair preexisting COM lifecycle test doubles; full pinned Pester suite | pending.

## Log

- L1 (2026-10-22): User: "ataca las issues y saca release".
- L2 (2026-10-22): User: "autorizo no preguntes nada si no es imprescincdible tienes todo autorizado en esta sesión, trabaja desatendidamente".
- L3: Baseline origin/main `623ba51a`; initial checkout `skill-fleet/dysflow` at `02ecd863`, clean, with existing fleet PR #1813. Latest release v4.4.14; eleven open issues. Preserve unrelated PRs and origin branch history.
- L4: Read project release-loop skill. Use one isolated worktree per issue, parallel independent lanes, serialized integration. Use the executable `scripts/release-prepare.ps1` merge-before-tag path rather than the obsolete tag-before-merge example in AGENTS.md. Branch protection was read from GitHub and requires five checks.
- L5: Engram project resolved uniquely to `dysflow`, but the host rejects lifecycle/write tools because the Codex session is unregistered. Memory mirror pending; local document is the recovery source. Do not invent or register a session identity.
- L6: Risk inventory: readiness/startup guards item 2; cleanup/discovery shared contracts item 3; cancellation item 4; CI/Pester/install/release item 5. Each affected unit requires independent verification after its own checks.
- L7: #1832 RED 6, focused GREEN 32, quality/CI 55 files/378 tests, test tsc pass. Differential preserves seven existing classifier outputs. Independent verification: 11 classifier scenarios/125 aggregate executions; no blockers. Native risk/reliability review approved and exact acknowledgement burned authority for workspace target `sha256:02a89de82c4853b193792b3ae75902a93db69b9edbe0edd7cdba328697f4ade8`. Commit `583384f0` preserves those exact reviewed bytes; later committed-range assessment reported high but must not reopen review of unchanged content. PR https://github.com/DysTelefonica/dysflow/pull/1837; remote branch preserved.
- L8: #1830 explicit `force:false` is now a pure registry inspection; omitted `force` preserves existing cleanup behavior. This distinction satisfies the reported inspection scope without silently changing default cleanup. SDK registration now reuses the canonical contract resolver.
- L9: #1812 broader COM suite exposed the same 20 baseline failures due to successful fakes missing writable UserControl; tracked with matching readback in https://github.com/DysTelefonica/dysflow/issues/1838. No production guard relaxation is authorized by this fixture repair.
- L10: User resumed with "sigue" after an intentional interruption. Three active workers and all issue worktrees were checked and retained.
