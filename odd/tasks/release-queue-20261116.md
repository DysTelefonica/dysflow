# Complete the pending Dysflow release queue
Owner: direct Codex session. Branch: chore/release-queue-20261116. Delivery: independent issue PRs.
Checks: focused Vitest, lint/types, required CI; heavy E2E exclusively in the final tag workflow.

## Specs

- S1: "Atacalas todas poco a poco y al final cuando no quede nada pendiente sacamos release"
- S2: "recuerda de ejecutar tus sh dentro de tu entorno que salta en mi sistema"
- S3: "aquí no hay coordinación, si está en tu agents quitalo y la skill no la uses"
- S4: "sigue hasta que acabes" / "no pares"

## Tasks

- T1: #1999 installer — S1-S4, delegated independent parallel writer, merged PR #2006 (f35360fe +19a9378e; merge b1f39f42), CI green and issue closed; 108 tests + realpnpm10/12 install/update PASS; Risk item5.
- T2: #2000 Pi typed errors — S1-S4, delegated independent parallel writer, merged PR #2004 (aac2b74e + 12fa011c; merge83a85d33), CI green and issue closed; Risk item2.
- T3: #2001 large semantic diff counts — S1-S4, inline, merged PR #2005 (f6813b27; mergefc8b4612), CI green and issue closed; missing VB_Name stays actionable.
- T4: #2002 legacy CodeBehind — S1-S4, inline, merged PR #2003 (9ffa2d6e; merge e58c106f), issue closed.
- T5: #1918 startup-crash investigation — S1-S4, blocked by unknown-owned headless Access at 14:15 UTC; no probe launched; causal evidence still required.
- T6: #1993 existing implementation and failed release — S1-S4, inline reconciliation complete; existing 7014-line feature preserved, focused107 tests/build/context-budget PASS; delivery-size decision pending.
- T7: Eight dependency PRs — S1-S4, all eight merged, including #1986 e268e4da after RED/4 GREEN/lint/independent check; remote refs preserved.
- T8: Refresh queue and publish one final release — S1-S4, blocked until #1993 delivery decision and #1918 quiet-window investigation are resolved; no tag or release created.

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

- L12: #1999 real pnpm12 proof found a second original failure: pnpm12 ignores package.json pnpm.overrides. Bounded correction derives staged workspace override settings, isolates nested Pi workspace, preserves source workspace bytes. RED2 then GREEN108 installer tests; actual10/12 recheck pending.
- L13: Merged #2003/#2004 worktree removal unregistered both but failed with Directory not empty; residual owned directories retained. Further recursive cleanup was rejected by execution policy; no alternate deletion attempted. Their local branches removed after merge proof; all remote branches preserved. Biome worktree retained temporarily as dependency cache for the active large-diff verification tree.

- L14: #1999 nativepnpm10.17.1 and12.16.1 install ANDforcedupdate PASS, CLI/stateparity and unchanged lock/manifestbytes; both failurepaths preserve old executableapp. SourceSHA FBF1F1E1FA33EC4F143D33D2BB0BDC636A2ACB15B93EECAEF0D49B31EAADB2C0. PR#2006 merged after exact-head CIgreen.
- L15: #1993 mixed-tree proof at87eab8e1:16 focusedtestfiles107/107PASS; throwawaytsbuildPASS; contextbudgetPASS(72advertised,95callable,describeparity). NoAccess opened. Final integrated lint after #1999merge passed (987files;3warnings,noerrors); fullunit suite/realAccesssmoke not rerun locally.
- L16: One bounded slicingpass found existing store/lock/liveness behavior coupled (initial438 implementation+283 tests), and launch behavior357 implementation+442 tests. An ordinary <=400line slice cannot be certified without re-authoring reviewed behavior. Existing purefeature diff excludes queue log:6871 additions+143deletions=7014authoredlines. No aggregatefeature PR opened without explicit size decision; previousRDDapproval is not a sizewaiver.
- L17: Nativegit worktree removals unregistered all five retired issue/dependency trees but could not fully remove their directories (Directory not empty / Invalid argument). Recursive cleanup was denied; no alternate deletion used. Retired localbranches removed; remote refs preserved. Residual folders: installer-1999,pi-errors-2000,legacy-codebehind-2002,large-diff-2001,biome-1986 under HOME/Projects/dysflow-worktrees. Original shared main and its8 preexistingcommits untouched. Existing provider candidate-view worktrees untouched.
- L18: Retained verifier scratch under TEMP:tmp.AmkFqugZRe,tmp.gvrxlaakRQ,tmp.EvnJQD0Dkq,tmp.uJHjjsoA9z,tmp.5i91TBOQZm. Last has test-runtime/node_modules junction into activequeuecheckout; never recursively follow it. Installer guardlogs under dysflow-install-check-QEDcmC,dysflow-installer-final-kN5Ud0; markerincident backup retained. Shared marker finalSHA A4CAABE31BB701C2686677F3AC97EA7451B022E0BD729D855D72231060E3C6A3 unchanged.
