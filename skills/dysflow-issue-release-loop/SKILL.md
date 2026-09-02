---
name: dysflow-issue-release-loop
description: "Trigger: cerrar todas las issues, issue queue, release final. Ejecuta issues con worktrees aislados, TDD, CI, merge, limpieza y gates de release. Repo-local de Dysflow (no parte del catálogo personal global)."
license: Apache-2.0
metadata:
  author: "ardelperal"
  version: "1.7.0"
  last_verified: "2026-09-02"
---

# Autonomous Issue Release Loop

## §1 Activation

Load when the user asks to exhaust a GitHub issue queue in Dysflow or codegraph-vba and finish with a release. Also load when continuing an interrupted queue.

## §2 Hard Rules

- **HR-1 — Process every open actionable issue.** Finish only when none remain.
- **HR-2 — Use safe parallelism by default.** Partition dependency-ready, non-conflicting issues into the largest safe batch allowed by the host thread budget. Assign one issue, agent, branch, and worktree per lane. Serialize dependencies, shared-file or high-conflict work, merge/rebase gates, and release finalization.
- **HR-3 — Use one clean worktree and one branch per issue.** Never mix issues.
- **HR-4 — Use strict TDD.** Prove RED, implement GREEN, then refactor and run relevant regression tests.
- **HR-5 — Prioritize every green authorized PR over further issue work.** Poll each PR independently. As soon as its required CI is green and merge authorization exists, merge it to `main` without waiting for slower siblings. Verify the linked issue closed; close it if GitHub did not. Immediately unregister/remove its local worktree and delete its local branch.
- **HR-6 — Preserve every remote branch on `origin`.** Never delete `origin/<branch>` after merge; the PR is the merge artifact and the remote ref is durable history.
- **HR-7 — Honor explicit review-size waivers.** Do not split, delay, or redesign work because of PR line count when the user waived review-size limits.
- **HR-8 — Append newly discovered defects to the same queue.** Create one tracker per independently actionable defect.
- **HR-9 — Route published issues directly to execution.** A stable target-host issue identity with matching read-back completes issue creation; never re-run issue-creation gates or require/re-check YAML Issue Forms after publication.
- **HR-10 — Bootstrap a missing Issue Form for genuinely new defects.** Invoke `issue-creation`'s bundled-form bootstrap path and continue. Missing forms alone never block work; only a genuine inability to mutate the target after the bounded authorized attempt is a blocker.
- **HR-11 — Never release with an open issue or red required gate.** Keep the queue active until both conditions clear.
- **HR-12 — Run the Dysflow release E2E gate.** Execute `pnpm test:e2e:mcp:release` from the Dysflow repository before release. For every failure, create an issue with reproducible evidence, iterate it through this workflow, and rerun the complete suite after fixes.
- **HR-13 — Generate exactly one final release.** Publish only after the queue and every release gate are green.
- **HR-14 — Run disk hygiene at every merge and every session end.** The orchestrator MUST run the full sweep below; per-merge cleanup alone is insufficient because interrupted sessions accumulate worktrees and branches.
  1. **Local branches merged to `main`** — `git branch --merged main` lists them; delete each with `git branch -d <name>` (use `-D` only for branches known to be safely retired but not in the merged list). Never leave a local branch whose tip is reachable from `main`.
  2. **Remote branches are PRESERVED on `origin` after merge** — the remote ref is the permanent history. Never pass `--delete-branch` to `gh pr merge`, never run `git push origin --delete <branch>`, and never ask `gh` to clean up the remote ref on merge, close, or reopen. Confirm a branch's remote ref still exists with `git ls-remote --heads origin <branch>` — the expected answer is `yes, present`, not `gone`. This applies to every branch type (`feat/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*`), including branches whose PR was already merged into `main`.
  3. **Local worktrees are REMOVED after merge** — the loop creates an isolated worktree per issue, so it owns the cleanup. Once the PR lands, run `git worktree remove <path>` and `git worktree prune`. A worktree left behind holds an obsolete branch checked out, and the next iteration can land in it and commit to the wrong place. Confirm with `git worktree list` — the expected answer is that only the main checkout remains. The local branch may be deleted with it; the remote ref stays (rule 2).
  3. **Worktree directories not registered in `git worktree list`** — `git worktree list --porcelain` is the authoritative registry. Anything under the worktree root (default `C:\Proyectos\<repo>-worktrees\`) that is NOT in the porcelain list is an orphan directory. Delete with `Remove-Item -Recurse -Force` (PowerShell) or `rm -rf` (bash). If a file is locked by another process (typical for `.codegraph-vba/codegraph.db*` SQLite WAL files held by the codegraph-vba MCP), do NOT run destructive lifecycle commands on codegraph (`codegraph uninit` etc., see repo AGENTS.md); rename the directory instead (`Rename-Item ... -NewName ".orphaned-<oldname>"`) to unlink it from git's view, then delete the renamed copy once the holding process releases the handle.
  4. **`git worktree prune` and `git remote prune origin`** at session end to clear stale registrations and remote-tracking refs.
  5. **Verify before reporting done**: `git worktree list` should show ONLY active worktrees (currently in use by a sub-agent) plus the main worktree. The local branch list should show ONLY `main` plus any active slice/fix branch. Anything else is a hygiene defect.
- **HR-15 — End a completed release with a fresh-session handoff.** After verifying publication and hygiene, ask the user to: (1) close the current agent session, (2) run `dysflow update`, and (3) open a fresh agent session in the Dysflow repository so that session runs `dysflow-codegraph-update`. Do not run the post-release alignment in the same session: its MCP process and initially loaded skills may still represent the pre-release runtime.

## §3 Decision Gates

| Condition | Action |
|---|---|
| Issues are dependency-ready and non-conflicting | Fill the largest safe parallel batch within the host thread budget; use one isolated lane per issue |
| Issues depend on each other or touch shared/high-conflict files | Serialize them in dependency order; do not parallelize them |
| PR has green required CI and merge authorization | Merge immediately, verify or close the linked issue, remove its local worktree, delete its local branch, and preserve its remote branch |
| PR is still running while a sibling is green and authorized | Merge and clean the green PR immediately; keep polling the slower PR independently |
| Stable target-host issue identity and matching read-back exist | Treat issue creation as complete; route directly to issue execution and never re-evaluate Issue Form availability |
| A genuinely new defect has no target YAML Issue Form | Invoke `issue-creation` bootstrap with its bundled asset; continue after stable read-back, and block only when the bounded authorized mutation cannot occur |
| Issue is duplicate, invalid, or blocked externally | Record evidence in GitHub; close only when justified, otherwise leave blocked and report the hard blocker |
| CI or tests fail | Keep the issue active; diagnose and fix with a new RED test |
| Merge or rebase is required | Serialize the gate against current `main`, resolve it in that issue's lane, then rerun required CI |
| Dysflow E2E fails | Create an issue per independently actionable defect and return to the queue |
| Queue changes during execution | Refresh and continue until empty |
| Queue and required gates are green | Serialize release finalization; create exactly one release |
| Final release is published and verified | Run hygiene, then stop and give the three-step fresh-session handoff; do not execute `dysflow-codegraph-update` in the current session |
| Session end (or before reporting completion) | Run the full disk-hygiene sweep per the hard rule above — prune branches merged to main, delete orphan worktree dirs, `git worktree prune`, `git remote prune origin`. Do not skip. |

## §4 Execution Steps

1. Inspect repository state, remotes, latest release, open issues, and existing PRs; preserve unrelated work. Retain target-host identity/read-back for every existing queue item: that identity completes creation, so execute it without loading or re-evaluating issue-creation gates or YAML Issue Form availability.
2. Build the dependency graph. Fill the largest safe batch of dependency-ready, non-conflicting issues within the host thread budget; serialize dependencies and shared/high-conflict files.
3. Give each issue one agent, branch, and isolated worktree. Establish acceptance evidence, execute RED-GREEN-refactor, run regressions, commit, push, and open a linked PR to `main`.
4. Poll every PR independently. Fix a red PR in its own lane. The moment a PR is green and authorized, merge it, verify or close its linked issue, immediately remove its local worktree and local branch, and confirm its remote branch remains on `origin`; do not wait for slower siblings.
5. Refresh the dependency graph and queue after every merge or newly discovered defect. For a genuinely new defect, invoke `issue-creation`; if no target form exists, use its bundled-form bootstrap path rather than stopping. Rebase dependent lanes on current `main` through a serialized merge/rebase gate, then refill safe capacity until no actionable issue remains.
6. Serialize repository release gates. For Dysflow, run all E2E tests from the mandated directory and loop failures back through GitHub issues.
7. Create exactly one final release through the repository's canonical release workflow; verify publication.
8. After publication and final hygiene, stop technical execution. Ask the user to close the current agent session, run `dysflow update`, open a fresh agent session in the Dysflow repository, and request `dysflow-codegraph-update`. The fresh session owns runtime, documentation, pointer, example, and consumer-skill alignment.

## §5 Output Contract

Return every key, even when its value is empty:

| Key | Type | Description |
|---|---|---|
| `status` | `"released" \| "blocked"` | Final state of the unattended loop. |
| `issue_pr_mappings` | object[] | Issue, branch, worktree, PR, RED/GREEN evidence, and CI result. |
| `merge_cleanup` | object[] | Merge SHA plus local worktree/branch cleanup and preserved remote-branch evidence. |
| `final_open_issue_count` | number | Open actionable issues after the final queue refresh. |
| `release` | object \| null | Published version, tag, URL, and verification evidence. |
| `dysflow_e2e` | object | Command, candidate, status, and result of the release E2E gate. |
| `post_release_handoff` | object \| null | Exact close-session → `dysflow update` → fresh-session → `dysflow-codegraph-update` instructions. |
| `blockers` | object[] | Genuine external blockers only. |

## §6 Anti-patterns

| Symptom | Fix |
|---|---|
| Running `dysflow-codegraph-update` immediately after publishing from the same agent session | Stop and hand off through session close, `dysflow update`, and a fresh session. |
| Reporting release completion before final hygiene | Run the complete hygiene sweep, then verify the remaining worktrees and local branches. |
| Waiting for every sibling PR before merging one that is green and authorized | Merge and clean the ready lane immediately; continue polling the rest. |
| Deleting the remote branch during cleanup | Delete only the local worktree and local branch; preserve `origin/<branch>`. |

## §7 References

- `../dysflow-codegraph-update/SKILL.md`
- `../branch-pr/SKILL.md`
- `../work-unit-commits/SKILL.md`
- `../issue-creation/SKILL.md`
