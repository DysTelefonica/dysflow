# Complete the pending Dysflow release queue
Owner: direct Codex session. Branch: chore/release-queue-20261116. Delivery: independent issue PRs.
Checks: focused Vitest, lint/types, required CI; heavy E2E exclusively in the final tag workflow.

## Specs

- S1: "Atacalas todas poco a poco y al final cuando no quede nada pendiente sacamos release"
- S2: "recuerda de ejecutar tus sh dentro de tu entorno que salta en mi sistema"
- S3: "aquí no hay coordinación, si está en tu agents quitalo y la skill no la uses"
- S4: "sigue hasta que acabes" / "no pares"

## Tasks

- T1: #1999 installer — S1-S4, delegated independent parallel writer, pending; Risk item 5; own PR.
- T2: #2000 Pi typed errors — S1-S4, delegated independent parallel writer, pending; Risk item 2; own PR.
- T3: #2001 large semantic diff counts — S1-S4, inline after T4, pending; preserve missing VB_Name actionability.
- T4: #2002 legacy CodeBehind — S1-S4, inline, pending.
- T5: #1918 startup-crash investigation — S1-S4, pending; causal evidence required.
- T6: #1993 existing implementation and failed release — S1-S4, inline reconciliation, pending.
- T7: Eight dependency PRs — S1-S4, seven verified green heads merged; #1986 schema correction pending.
- T8: Refresh queue and publish one final release — S1-S4, pending all tasks and gates.

## Log

- L1 (owner): "Atacalas todas poco a poco y al final cuando no quede nada pendiente sacamos release"
- L2 (owner): "recuerda de ejecutar tus sh dentro de tu entorno que salta en mi sistema"
- L3 (owner): "aquí no hay coordinación, si está en tu agents quitalo y la skill no la uses"
- L4 (owner): "sigue hasta que acabes"; "no pares"
- L5: Preserve local main's eight #1993 commits df58f715..db287543. Old v4.5.8 workflow failed; no release claimed.
- L6: No local release battery. #1918 teardown hypothesis was disproved in issue comments; green tests alone cannot close it.
