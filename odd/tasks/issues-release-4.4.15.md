# Resolve the issue queue and publish the next release
Branch: `chore/issues-release-4.4.15`; delivery: auto-chain, independent issue PRs to main; forecast: 2,000 authored lines.
Runner: focused Vitest/Pester regressions, repository quality gates, and `pnpm test:e2e:mcp:release`.

## Specs

- S1: "ataca las issues y saca release". Resolve every actionable open issue against current evidence, integrate verified fixes, and publish exactly one final release after the required gates pass.
- S2: "autorizo no preguntes nada si no es imprescincdible tienes todo autorizado en esta sesión, trabaja desatendidamente". Proceed autonomously with implementation, verification, GitHub delivery, and release. Use the explicitly authorized `gpt-6.1-sol` substitute for unavailable `gpt-6.1-luna`.
- S3: Existing issue acceptance criteria are authoritative for their individual scope: #1812, #1822, #1823, #1824, #1830, #1831, #1832, #1833, #1834, #1835; #1836 aggregates #1831–#1835. Reproduce each report before fixing; close only with observed evidence.

## Tasks

- T1 | S1–S3 | delegated explorer | mapping in progress | no commit.
- T2 | S1–S3 | delegated independent issue lanes | #1831 readiness guard | pending.
- T3 | S1–S3 | delegated independent issue lanes | #1830 cleanup contract | pending.
- T4 | S1–S3 | delegated independent issue lanes | #1812 startup suppression | pending.
- T5 | S1–S3 | delegated independent issue lanes | #1832 CI applicability then #1835 Pester selection | pending.
- T6 | S1–S3 | delegated independent issue lanes | #1833 discovery metadata | pending.
- T7 | S1–S3 | delegated independent issue lanes | #1834 cancellation | pending.
- T8 | S1–S3 | delegated independent issue lanes | #1822 isolated Pi installation | pending.
- T9 | S1–S3 | delegated independent issue lanes | #1823 test procedure callability | pending.
- T10 | S1–S3 | inline | #1824 shipped harness/examples reconciliation | pending.
- T11 | S1–S3 | inline | close #1836 after child evidence; final queue reconciliation, release gates and publication | pending.

## Log

- L1 (2026-10-22): User: "ataca las issues y saca release".
- L2 (2026-10-22): User: "autorizo no preguntes nada si no es imprescincdible tienes todo autorizado en esta sesión, trabaja desatendidamente".
- L3: Baseline origin/main `623ba51a`; initial checkout `skill-fleet/dysflow` at `02ecd863`, clean, with existing fleet PR #1813. Latest release v4.4.14; eleven open issues. Preserve unrelated PRs and origin branch history.
- L4: Read project release-loop skill. Use one isolated worktree per issue, parallel independent lanes, serialized integration. Use the executable `scripts/release-prepare.ps1` merge-before-tag path rather than the obsolete tag-before-merge example in AGENTS.md. Branch protection was read from GitHub and requires five checks.
- L5: Engram project resolved uniquely to `dysflow`, but the host rejects lifecycle/write tools because the Codex session is unregistered. Memory mirror pending; local document is the recovery source. Do not invent or register a session identity.
- L6: Risk inventory: readiness/startup guards item 2; cleanup/discovery shared contracts item 3; cancellation item 4; CI/Pester/install/release item 5. Each affected unit requires independent verification after its own checks.
