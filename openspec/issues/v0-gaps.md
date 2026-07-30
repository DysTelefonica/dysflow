# Dysflow v2.31 — Remaining gaps vs engram

Tracked from the v2.31 dysflow-vs-engram judgment session.

Each issue below is its own branch, its own PR, its own commit.
The goal: every gap closed before declaring v2.31 ready for release.

---

## Issue A — `dysflow upgrade` plugin layer refresh

**Status:** needs verification

**Description:** When engram ships a new release, `engram upgrade`
re-fetches the latest binary AND refreshes the agent plugin layer
(installs the new `.claude-plugin/plugin.json`, new hooks, new scripts).
Dysflow has `dysflow update` (in `src/cli/commands/install/updater.ts`)
but its current behavior is unknown — does it refresh the per-agent
plugin files too, or only the runtime binary?

**Acceptance:**
1. `dysflow update` (or `--force`) refreshes:
   - `~/.claude/plugins/dysflow/`
   - `~/.codex/plugins/dysflow/`
   - `~/.config/opencode/plugins/dysflow/`
2. The post-update plugin files are byte-identical to the new
   `plugin/<agent>/` in the source tree.
3. The user's `dysflow-protocol` skill symlink is preserved.
4. A `update` report shows what changed per agent (file count, hook
   list, MCP server config diff).

**Branch:** `feat/dispatch-update-plugin-refresh`

**Owner:** parallel agent (sub-agent)

---

## Issue B — Migration tooling for `dryRun` consumers

**Status:** design phase

**Description:** v2.31 hard-removed `dryRun: true` from every mutating
tool schema. Consumers (e.g. `expedientes`) that still pass `dryRun`
in their MCP calls now get `MCP_INPUT_INVALID: dryRun is not allowed`.

`dysflow` should ship a consumer-side migration tool:
- Scan a consumer codebase for `dryRun: true` (or `dryRun: false`).
- Rewrite to `apply: false` / `apply: true` per the new convention.
- Surface a report: file count, edit count, undo path (write a
  `dryrun-to-apply.undo` manifest the consumer can replay).

**Acceptance:**
1. `dysflow migrate-dryrun --cwd <consumer-repo> --dry-run` scans
   without writing. Report: total files matched, total edits proposed,
   per-file diff.
2. `dysflow migrate-dryrun --cwd <consumer-repo> --apply` rewrites in
   place with an undo manifest written to `<consumer-repo>/.dysflow-runtime/migration-<timestamp>.undo.json`.
3. Test fixtures: a sample consumer repo with mixed `dryRun` usages
   in `.bas` / `.cls` / `.form.txt` shows clean rewrites.
4. Dry-run report includes the legacy `dryRun` source line, the new
   `apply` line, and a confidence score (literal match vs context-dependent).

**Branch:** `feat/cli-migrate-dryrun`

**Owner:** parallel agent (sub-agent)

---

## Issue C — TUI install report + verifier

**Status:** design phase

**Description:** The dysflow TUI's setup flow calls `handleInstallCommand`
which configures each agent's plugin dir + MCP. There's no feedback
to the user DURING the install (no spinner, no file count).

`dysflow install` already returns a report via `createInstallReport`
(stdout). The TUI just shows the cursor moving. We should surface the
report in the TUI as well.

**Acceptance:**
1. After `dysflow install --agent X` completes, the TUI shows:
   - Files copied (count + paths)
   - MCP server config diff
   - Skill symlink status
   - Reload prompt for the user
2. The non-interactive `dysflow install` flow gets a `--verbose` flag
   that prints per-file copy events to stdout.
3. The TUI keeps the report available via a "Show details" key
   (e.g. `i` key) without exiting the install flow.

**Branch:** `feat/cli-install-report`

**Owner:** parallel agent (sub-agent)

---

## Issue D — `docs/SETUP.md` + `docs/PLUGIN-AUTHORS.md`

**Status:** to-do

**Description:** Two missing docs.

`docs/SETUP.md` should walk a consumer through:
- `git clone dysflow`
- `pnpm build` (or `npx dysflow` via npm release)
- `dysflow install --agent claude-code` (or interactive `dysflow tui`)
- Verify with `dysflow get_capabilities`

`docs/PLUGIN-AUTHORS.md` should document the plugin layer shape so
third-party plugin authors can build their own dysflow plugin:
- File layout (`plugin/<agent>/.claude-plugin/plugin.json`)
- Hook event names + payload shapes
- MCP server config
- Skill format
- Namespace markers convention (`_dysflow_marker` etc.)

**Acceptance:**
1. `docs/SETUP.md` walks a consumer from `git clone` to "dysflow installed and verified" with copy-pasteable commands.
2. `docs/PLUGIN-AUTHORS.md` is a reference doc for plugin authors.
3. Both docs cross-link to the existing `README.md`.

**Branch:** `feat/docs-setup-and-plugin-authors`

**Owner:** parallel agent (sub-agent)

---

## Issue E — Round 16 legacy config migration commit

**Status:** fix code is on the worktree but uncommitted (stashed)

**Description:** Round 16 fix from the consumer prompt
(`docs/prompts/prompt-ia-mantenedora-dysflow-round-16-2026-07-30.md`)
adds legacy `projectId` fallback to the resolver + a `MIGRATE_LEGACY_PROJECT_ID`
warning. The fix code + 4 RED tests live on the worktree but were
stashed at the start of this turn to clear CRLF noise.

**Acceptance:**
1. Pop the stash onto the feature branch.
2. Resolve any CRLF/LF mismatches cleanly (`.gitattributes` or
   `.git/config core.autocrlf=false`).
3. Run full `pnpm vitest run` + `pnpm test:e2e:mcp`. All green.
4. Commit on `feat/check-envelope-unification` as a single commit.
5. CHANGELOG entry for v2.31.1 (round-16 + slice-3 polish).

**Branch:** `feat/check-envelope-unification` (existing)

**Owner:** orchestrator

---

## Workflow

- Each issue gets its own branch (named `feat/<scope>` per conventional commits).
- Sub-agents work in parallel — they cannot edit the same files
  concurrently, so file ownership is partitioned by issue scope.
- Each PR is **merged to main, branch deleted**. No unmerged PRs left
  in the repo at the end of this turn.
- The current `feat/check-envelope-unification` branch (17 commits,
  slice-3 + plugins + skill + R16) is the foundation; it merges FIRST
  to `main`, then the four follow-up branches land in sequence.

---

## Acceptance gate

Before declaring v2.31 ready:
- `pnpm tsc -p tsconfig.json --noEmit` clean.
- `pnpm vitest run` green.
- `pnpm test:e2e:mcp` green (215+ passed).
- All four sub-issues (A, B, C, D) merged to main.
- `feat/check-envelope-unification` branch merged + deleted.
- Release-prepare script bumps version + tag.
