# dysflow-pointer-rollout — Procedure

The actual 9-target table and per-file recipes. Read fully before running.

## Step 0 — Pre-flight

1. Read `<bundle-root>\skills\dysflow-arnes\SKILL.md`.
2. Extract content between `<!-- dysflow:arnés -->` and `<!-- /dysflow:arnés -->` by marker, never by line number. Confirm both delimiters exist. If not, **abort** and report "upstream arnés delimiters missing — fix dysflow-arnes/SKILL.md first".
3. Compute SHA256 of the extracted block. Store as `HARNESS_HASH` (the contracted value for the per-project AGENTS.md embed).
4. Read `assets/pointer.md`. Extract the literal bytes **between** the opening and
   closing `user-supplement:dysflow:pointer` markers, including the boundary
   newlines but excluding both marker lines. Compute SHA256 of that inlined
   region and store it as `POINTER_HASH`. Do not hash the whole file.
5. The two hashes are NOT comparable. `POINTER_HASH` is the contract for targets 1–8; `HARNESS_HASH` is the contract for target 9. The skill must NEVER compare a pointer's inlined hash against `HARNESS_HASH`.

## Step 1 — Enumerate the 9 active targets

The 9-target active list is FIXED. Adding a new instruction file requires explicit user
sign-off — the deployment surface does not grow by drift.

Routine `dysflow update` rollout follows the five-agent install matrix:
OpenCode, Claude, Codex, Cursor, and Pi. Their instruction
targets are `.config/opencode/AGENTS.md`, `.claude/CLAUDE.md`,
`.codex/AGENTS.md`, `.cursor/rules/dysflow-vba.mdc`, and
`.pi/agent/APPEND_SYSTEM.md`. The extended table below remains the manual ARN-2
fallback for agents outside that install matrix.

### User-global pointers (8 files)

| # | Path | Marker convention | Default operation |
|---|------|-------------------|-------------------|
| 1 | `$HOME\.claude\CLAUDE.md` | `<!-- user-supplement:dysflow:pointer -->` | append if absent, replace inside markers if present |
| 2 | `$HOME\.codex\AGENTS.md` | same | same |
| 3 | `$HOME\.config\opencode\AGENTS.md` | same | same |
| 4 | `$HOME\.gemini\GEMINI.md` | same | same |
| 5 | `$HOME\.hermes\SOUL.md` | same | same |
| 6 | `$HOME\.cursor\rules\dysflow-vba.mdc` | `.mdc` frontmatter + body (no in-body markers) | create if absent, replace body if present |
| 7 | `$HOME\.kiro\steering\dysflow-vba.md` | `<!-- user-supplement:dysflow:pointer -->` + `inclusion: always` frontmatter | create if absent, replace inside markers if present |
| 8 | `$HOME\.vscode\copilot-instructions.md` | `<!-- user-supplement:dysflow:pointer -->` | create if absent, replace inside markers if present |

These files are validated against `POINTER_HASH` (the `assets/pointer.md` reference).

### Per-project (1 active — dynamically discovered)

| # | Path | Marker convention | Special |
|---|------|-------------------|---------|
| 9 | **Discovered** from the Dysflow Git repository; current canonical layout resolves to `<discovered-main-worktree>\AGENTS.md` | `<!-- dysflow:arnés -->...<!-- /dysflow:arnés -->` | EMBEDS the literal harness block, NOT the lighter pointer. The home file is the only place where the full block lands. |

**Discovery rule for target 9** — DO NOT hardcode a missing legacy path. Discover the Dysflow repository under the configured code roots, inspect its Git worktrees, and select the worktree on `main` whose repository root contains `AGENTS.md`. The current canonical result is `<discovered-main-worktree>\AGENTS.md`, but discovery remains authoritative. If no unique main worktree exists, abort; never fall back to `<legacy-dysflow-root>\AGENTS.md`.

There is intentionally **no** `<legacy-workflow-root>\AGENTS.md` target — that directory
was retired 2026-07-19 in the path migration cycle that consolidated the workflow
source-of-truth into `<bundle-root>\`. Do NOT resurrect it.

Target 9 is validated against `HARNESS_HASH` (the dysflow-arnés delimited block).

### Step 2 — Per-file recipes

### Recipe for files 1–5, 7, 8 (pointer markers)


```pseudo
read file
find open marker index O
find close marker index C
if O and C are both absent:
    append `assets/pointer.md` at end of file, wrapped in markers
    log: appended
else if exactly one marker is absent:
    fail closed; do not modify the malformed file
else:
    extract content between O and C
    compute SHA256 of inlined content against `assets/pointer.md`
    if matches POINTER_HASH:
        log: noop-skip-on-match
    else:
        back up: copy file to backup dir
        replace inlined content with `assets/pointer.md`
        write file
        read back, verify markers survived, verify content hash matches
        log: replaced
```

### Recipe for file 6 (Cursor `.mdc`)

Cursor uses frontmatter-only markers, no in-body HTML markers. Frontmatter stays untouched. If the body disagrees with the canonical block, replace the body only.

```pseudo
read file
parse frontmatter (preserve verbatim)
extract body (everything after `---`)
compute SHA256 of body
if matches: log: noop-skip
else:
    back up
    replace body with `assets/pointer.md` (without in-body markers — Cursor uses frontmatter.description)
    write file
    read back, verify frontmatter hash unchanged
    log: replaced
```

### Recipe for file 9 (dysflow/AGENTS.md — EMBED)

This is the home file. It gets the literal harness block, not the lighter pointer. The block lives between `<!-- dysflow:arnés -->` and `<!-- /dysflow:arnés -->`, **inclusive** of those markers. Do not strip them; the literal block of `dysflow-arnes/SKILL.md` the marker-delimited block includes them.

```pseudo
read file
find existing dysflow-arnés markers (open + close)
if absent:
    insert a new section "## Dysflow & VBA Skill Catalog" near the top
        (after global rules, before project-specific instructions)
    that section contains:
        - the pointer template (with user-supplement markers)
        - the LITERAL harness block (with dysflow-arnés markers, verbatim)
        - a project-context block with TODO placeholders for m_BackendSandboxURL and Variables Globales.bas path
if present:
    compute SHA256 of literal block between markers
    if matches: log: noop-skip
    else:
        back up
        replace literal block
        write
        read back
        log: replaced
```

## Step 3 — Verification

After all 9 active targets are processed:

1. **Marker idempotence**: For each touched file, `grep` the open marker and the close marker — both must appear.
2. **Hash verification**: For targets 1–8, verify the inlined pointer against `POINTER_HASH`; for target 9, verify the embedded harness against `HARNESS_HASH`.
3. **Backup directory present**: `ls` `$HOME\AppData\Local\Temp\dysflow-pointer-backup-<timestamp>\` must list every touched file.
4. **No accidental edits**: `git diff --stat` on each touched file (if it's a git repo) must show ONLY the marker-bounded region changed, not surrounding lines. For non-git files, diff against the backup.

## Step 4 — Output

Emit:

```
ARN-2 dysflow-pointer-rollout run <timestamp>
canonical_hash: <12-char-prefix>
files touched: <count>
files skipped (noop): <count>
files failed: <count>
backup: <absolute-path>

per-file:
  1. <path>: <touched|noop|failed> · before=<hash-prefix> · after=<hash-prefix>
  ...
open decisions:
  - <none|<list>>
```

## Failure modes

- **Missing delimiters in upstream arnés**: Step 0 aborts. User must fix `dysflow-arnes/SKILL.md` first.
- **File locked or unwritable**: log "failed"; continue with the rest of the list. Surface in the output contract.
- **Hash collision (false-positive drift)**: extremely unlikely (SHA256 on a >5KB block). If seen, treat as upstream bug, halt and report.
- **Frontmatter corruption in file 6**: roll back from backup, surface to user.

## References

- `<bundle-root>\skills\dysflow-arnes\SKILL.md` — canonical block source.
- `<bundle-root>\skills\dysflow-codegraph-update\references\deprecated-skills.md` — cross-check deprecated exclusions for the pointer template.
