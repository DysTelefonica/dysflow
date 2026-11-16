# Complete the pending Dysflow release queue
Owner: direct Codex session. Branch: chore/release-queue-20261116. Delivery: independent issue PRs.
Checks: focused Vitest, lint/types, required CI; heavy E2E exclusively in the final tag workflow.

## Specs

- S1: Original request: "Atacalas todas poco a poco y al final cuando no quede nada pendiente sacamos release". The current explicit S6 exception supersedes the zero-open-issues condition.
- S2: "recuerda de ejecutar tus sh dentro de tu entorno que salta en mi sistema"
- S3: "aquí no hay coordinación, si está en tu agents quitalo y la skill no la uses"
- S4: "sigue hasta que acabes" / "no pares"

- S5: "Never build/install to or modify the production runtime" (existing repository safety constraint; workflow isolation is a prerequisite of the #1918 experiment).

- S6: Owner: "Lo autorizo" to: "Propongo integrar el aislamiento ya verificado sin abrir otra incidencia, dejar #1918 abierta como investigación no bloqueante y publicar en DysTelefonica/dysflow con la sesión actual de GitHub, únicamente con CI y E2E del tag verdes."

## Tasks

- T1: #1999 installer — S1-S4, delegated independent parallel writer, merged PR #2006 (f35360fe +19a9378e; merge b1f39f42), CI green and issue closed; 108 tests + realpnpm10/12 install/update PASS; Risk item5.
- T2: #2000 Pi typed errors — S1-S4, delegated independent parallel writer, merged PR #2004 (aac2b74e + 12fa011c; merge83a85d33), CI green and issue closed; Risk item2.
- T3: #2001 large semantic diff counts — S1-S4, inline, merged PR #2005 (f6813b27; mergefc8b4612), CI green and issue closed; missing VB_Name stays actionable.
- T4: #2002 legacy CodeBehind — S1-S4, inline, merged PR #2003 (9ffa2d6e; merge e58c106f), issue closed.
- T5: #1918 startup-crash investigation — S1-S4, quiet window now available; rawCOM no-DB plus canonical no-DB/privateblankDB probes completed without crashes; causal evidence still required.
- T6: #1993 existing implementation and failed release — S1-S4, merged PR #2007 with scoped owner-authorized size exception; preserved original commits, exact-head CIgreen; merge c880e557, issue closed.
- T7: Eight dependency PRs — S1-S4, all eight merged, including #1986 e268e4da after RED/4 GREEN/lint/independent check; remote refs preserved.
- T8: Refresh queue and publish one final release — S1-S4, pending isolation PR and canonical release gates; #1918 stays open/non-blocking perS6; no tag or release created.

- T9: Isolate manual/release test-runtime installation — S1/S5, inline, locally verified commit70b7da44;284tests + independent containment/restore probes PASS; owner waived a separate issue; BLOCKED: current GitHub App lacks workflows permission, firstpush authoritatively rejected; no remote branch/PR; Risk item5.

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

- L19 (owner): "Autorizo" in response to the scoped size-exception question for #1993. This authorizes the 7014-authored-line feature delivery, not release with unresolved issues, not killing other Access processes, and not broad future size waivers.
- L20: Created feat/detached-test-runs-1993 at53ac0fc1 from preserved integration. Only queue-tracking document removed from that delivery; all other source bytes identical to previously verified integrated tree. Exact feature diff remains84files,6871additions+143deletions. Existing source commits preserved.

- L21 (owner): "dale"; "sigue". Continue the original queue; no additional kill/production/remote-operation authorization inferred.
- L22: PR#2007 (feature-only7014lines) opened with type:feature and size:exception, exacthead53ac0fc1 CIpassed, mergedc880e557 and #1993closed. Nativecleanup of its own hoisted-dependency worktree succeeded; localfeaturebranch deleted, remote preserved. Queuebranch retained its tracker when merging origin/main's historical tracker deletion.
- L23: At17:35UTC preflight found noAccess. RealSTArawCOM probe ownedPID2932 (creation18:10:16.2252991UTC) survived120.789s, Quit(2) returned, FinalRelease/GC completed, ownedprocess exited, and exactPID+creation Application1000 query found0crashes. NoDB opened/securitychanged/forcedkill. This nonrepro does not resolve #1918. ScratchTEMP/tmp.XxlTP1FF5j retains stages.jsonl.

- L24: Controlledcontrast at18:19-18:22UTC created exactlythree furtherownedinstances: seed14360 createdprivateempty.accdb(format12), canonicalnoDB37792 held10.080s, canonicalprivateblankDB32888 held120.768s. AllbeganwithzeroAccess, SecurityLowfalse, gracefulclose, noforcedkills, noownedprocesssurvived, and exactPID+creation event1000 queriesfound0crashes. ScratchTEMP/tmp.0mhRxXeE9V retains traces/privateblankfixture. Scratchobserverexit-race corrected without re-creatingseed. These boundednonrepros do not resolve #1918.
- L25: Do not interpret canonical OwnedPidKilled=true as proof of termination: current helper sets it on observed naturalexit too; suppression killstubs were never invoked in theseprobes. Historicalrelease42059432207 metadata returnedno retainedartifacts. Read-only safety audit of manualworkflow installer isolation pending before any runner dispatch; no remotejob started.

- L26: Freshsource audit confirms both Access workflows run install with only runtime-dir/no-tui; this still discovers global skill/pointertargets and writes the machine marker. Existing --exclude opencode,claude,codex,cursor,pi plus DYSFLOW_RUNTIME_MARKER_PATH suffice, including explicit external Pi agentdirs. Preparing bounded safety correction locally before remoteexecution; no unsafeinstall orworkflowdispatch performed. Public newissue publication remains subject to required form confirmations; no new tracker created yet.

- L27: T9 observed meaningfulRED:4cases/44assertions showed profile/pointerwrites and fakeglobalmarkerredirect at successfulinstall, CIset/unset. InitialmalformedCursorfixture failure was corrected and not counted asRED. Candidate70b7da44 (128additions/5deletions,4files) adds existing adapterexclusions and job-private marker toboth workflows; normalinstaller sourceunchanged. Full21file284testsPASS, finalfocused4/Biome/testtypesPASS, full lintPASSwith3existingwarnings.
- L28: Independentfresharchive verifier70b7da44 re-ran21files284testsPASS, reproducedbaseline4/44failures, and executed exact READMEtry/finally restoration4/4(previousmarkerdefined/unset,installersuccess/throw). NoAccess/jobs/production writes; actualmachine marker hashunchanged. VerifierTEMP/tmp.1RGV5vyFq8 retains baseline/candidate dependencyjunctions to activeisolationcheckout:neverrecursivefollow.
- L29: Completedopen+closedduplicate search for test-runtime(54results), reviewed related1771/475/574infull; no equivalentworkflowinstallcontainmenttracker. Prepared privacy-scanned bug_report.yml-conforming draft in TEMP/dysflow-workflow-issue-2075e0c56c8845e39d839a598bdaaec2/issue-body.md, hash1C5956FE14EF213151E68EE749EFAFF3CBEDB1B38F2CA573630287CD75D43C98. Two required first-person pre-submissioncheckboxes leftUNSET pendingexplicit humanaffirmation; noissueorPRcreated, no sourcepush.
- L30: #1993postmerge mainCI atc880e557passed. Onlypublishedopenissue remains1918; releaseunchangedv4.5.7. Standalone4ownedAccessinstancesallcompletedwithoutcrash orsurvivors, notcausalresolution. Nextneededproof ismanualrunner workload aftersafeisolationfix; no remoteexecution permission inferred from earlier sizeexception. No manualjobdispatched.

- L31 (owner): "Lo autorizo" to the complete S6 proposal. Separate newissue publication was explicitly waived, so its private draft remains unsubmitted and its checkbox confirmations are not inferred. Keep1918open, do not claimCOMcausefixed, integrate70b7da44 then use currentGitHubsession forrelease onlyafterallrequiredCI/tagE2Egatesgreen. Manualdiagnosticworkflow is not a release prerequisite under this updatedscope.

- L32: First normal push of fix/e2e-runtime-isolation was authoritatively rejected: GitHub App cannot create/update .github/workflows/access-e2e-manual.yml without workflows permission. No retry, API workaround, credential discovery/switch, or unsafe release attempted. Read-only ls-remote and PRlookup confirm no remote branch and no PR. Verified localhead70b7da44e9e2da456974a248896f532adf361dfc remains clean. Owner must publish this exact branch/commit using a session legitimately authorized for workflows, or enable that permission on the existing connection; current session cannot complete publication. After that externalstatechange, resume already-authorized PR+CI+release without another generalapproval.
