# HANDOFF — Epic #811 (AI-first Access form UI, Phase 2)

> Tool-agnostic resume pointer. If the AI working this branch runs out of tokens, **any** other AI
> continues from here. Source of truth for progress is committed in-repo (this file + `openspec/changes/`
> + git log), not in any single agent's memory.

## Resume protocol (do this first)
1. Read this file.
2. Read `openspec/changes/projectid-form-source-resolution/tasks.md` — the `- [ ]` / `- [x]` checklist is
   the granular progress ledger. Continue from the first unchecked task.
3. If you have the SDD skills: run `/sdd-status projectid-form-source-resolution`, then
   `/sdd-continue projectid-form-source-resolution`.
4. If you have Engram: `mem_search "sdd/projectid-form-source-resolution"` then `mem_get_observation`.
5. Ground-truth cross-check: `git log --oneline` on this branch.

## Current state
- **Epic:** #811 — Phase 2 form UI (perceive → act → verify loop).
- **Active change (Phase 0):** #718 — projectId-first source resolution across form tools. This is the
  foundation every other phase depends on; do it first.
- **Worktree:** `C:/Proyectos/dysflow-718`  •  **Branch:** `feat/718-projectid-form-source-resolution`.
- **SDD config (cached):** mode `automatic` • store `hybrid` • delivery `auto-chain` • **strict TDD active**.
- **Test runner:** `pnpm test` (vitest unit). E2E: `vitest.integration.config.ts` and
  `node E2E_testing/mcp-e2e.mjs` (Windows + Access COM, needs `ACCESS_VBA_PASSWORD`).

## Phase roadmap (all under epic #811)
- [ ] **Phase 0 — #718** projectId-first resolver (this change).  ← IN PROGRESS
- [ ] Phase 1 — #812 `form_set_property` + `form_delete_control`; #813 wire `apply_form_design_plan`.
- [ ] Phase 2 — #814 `render_form_preview`; #815 `analyze_form_layout`.
- [ ] Phase 3 — #816 `form_align_controls` + `form_distribute_controls`.
- [ ] Phase 4 — #817 `diff_form_preview`; #818 `verify_form_bindings`.
- [ ] Phase 5 — #819 align `access-form-ui-builder` skill + AGENTS.md.

## Testing strategy (per repo philosophy — test at ports, mock only I/O)
- **Unit at ports (`pnpm test`), no Access:** #718, #812, #814, #815, #816, #817.
- **E2E in `E2E_testing/` (real Access COM):** #813 (apply → `import_modules` → binary), #718
  (resolution against a real `.dysflow/project.json`), #818 (bindings vs real schema). Add new cases to
  `E2E_testing/mcp-e2e.mjs`.

## Hard rules (do not violate)
- Never build/modify the production runtime (`%LOCALAPPDATA%\dysflow`). Build to `test-runtime/`.
- Guarded writes only; dry-run first; honor `MCP_WRITES_DISABLED` / `allowWrites`.
- `.cls` owns code-behind; `.form.txt` owns layout. Verify code-behind via `verify_code` against `.cls`.
- Conventional commits, no AI attribution. Keep domain logic in `src/core`, I/O in adapters.
- Re-index CodeGraph after code changes: `codegraph index C:\Proyectos\dysflow`.

## Tooling / MCP (for sub-agents and any IA)
- `.mcp.json` (committed) declares `codegraph-vba` + `dysflow` as project MCP servers so the worktree and
  any IA get them (engram stays a global plugin — do NOT redeclare it here). **MCP server changes take
  effect on the next Claude Code restart**; a mid-session add is not seen by already-running sub-agents.
- The global SDD agents (`~/.claude/agents/sdd-{explore,design,apply,verify}.md`) were granted
  `mcp__codegraph-vba__codegraph_explore` (and explore got the full engram read trio). Also restart-scoped.
- A stale top-level `codegraph` MCP server (broken, ✘) still exists in `~/.claude.json`; harmless, can be
  removed with `claude mcp remove codegraph -s user`.

## Progress log
- Phase 0 / #718: explore ✅ → proposal ✅ (`openspec/changes/projectid-form-source-resolution/proposal.md`).
  Next: `sdd-design` (resolve the [PATH]-diagnostic channel constraint) + `sdd-spec` (parallel).

## Update this file
Keep the checklists above current at the end of each work session, and note anything a fresh agent would
otherwise re-derive.
