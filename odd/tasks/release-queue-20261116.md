# Complete the pending Dysflow release queue
Owner: direct Codex session. Branch: chore/release-queue-20261116. Delivery: independent issue PRs.
Checks: focused Vitest, lint/types, required CI; heavy E2E exclusively in the final tag workflow.

## Specs

- S1: "Atacalas todas poco a poco y al final cuando no quede nada pendiente sacamos release"
- S2: "recuerda de ejecutar tus sh dentro de tu entorno que salta en mi sistema"
- S3: "aquí no hay coordinación, si está en tu agents quitalo y la skill no la uses"
- S4: "sigue hasta que acabes" / "no pares"

## Tasks

- T1: #1999 installer — S1-S4, delegated independent parallel writer, implemented; 106 tests green, real pnpm10/12 independent verification running; Risk item 5.
- T2: #2000 Pi typed errors — S1-S4, delegated independent parallel writer, verified; aac2b74e + 12fa011c, PR #2004 CI pending; Risk item 2.
- T3: #2001 large semantic diff counts — S1-S4, inline, verified; f6813b27, PR #2005 CI pending; preserve missing VB_Name actionability.
- T4: #2002 legacy CodeBehind — S1-S4, inline, merged PR #2003 (9ffa2d6e; merge e58c106f), issue closed.
- T5: #1918 startup-crash investigation — S1-S4, blocked by unknown-owned headless Access at 14:15 UTC; no probe launched; causal evidence still required.
- T6: #1993 existing implementation and failed release — S1-S4, inline reconciliation, pending.
- T7: Eight dependency PRs — S1-S4, all eight merged, including #1986 e268e4da after RED/4 GREEN/lint/independent check; remote refs preserved.
- T8: Refresh queue and publish one final release — S1-S4, pending all tasks and gates.

## Log

- L1 (owner): "Atacalas todas poco a poco y al final cuando no quede nada pendiente sacamos release"
- L2 (owner): "recuerda de ejecutar tus sh dentro de tu entorno que salta en mi sistema"
- L3 (owner): "aquí no hay coordinación, si está en tu agents quitalo y la skill no la uses"
- L4 (owner): "sigue hasta que acabes"; "no pares"
- L5: Preserve local main's eight #1993 commits df58f715..db287543. Old v4.5.8 workflow failed; no release claimed.
- L6: No local release battery. #1918 teardown hypothesis was disproved in issue comments; green tests alone cannot close it.

- L7: #2000 verifier caught four candidate-caused privacy leaks; one correction batch and original-blocker recheck PASS. Focused15/15 plus success/untyped differential unchanged.
- L8: #2001 RED5 then GREEN130; independent74 probes +10,000 exactLCS cases PASS. Missing VB_Name remains actionable per #646; issue comment records rationale.
- L9: Installer tests had pre-existing global-marker writes through explicit fake envs (including applyIntegrationSelection). Tests interrupted, fixture paths isolated, machine marker restored to observed installed runtime4.5.7 after backup; final106 tests left SHA A4CAABE31BB701C2686677F3AC97EA7451B022E0BD729D855D72231060E3C6A3 unchanged. No production app bytes changed.
- L10: RDD became globally OFF during work; agent did not toggle it. Ordinary functional and independent risk checks retained.
- L11: #1993 existing work exceeds 400-line review slices (individual prior commits up to2183 authored lines); preserve historical commits and prior review evidence, no aggregate PR published pending proper delivery-size decision.
