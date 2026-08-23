---
name: dysflow-pointer-rollout
description: >
  Trigger: dysflow-arnes/SKILL.md content drifted from inlined pointer blocks across the active agent instruction files, dysflow/AGENTS.md lost its embedded harness block, user says regen pointers / redistribuir arnés / los pointers quedaron viejos, ARN-2 of dysflow-codegraph-update chains after ARN-1, `dysflow install` / `dysflow update` could not reach an agent's AGENTS.md / CLAUDE.md. Detects drift between the canonical `dysflow-arnes` skill and the agent instruction files where the pointer lives, regenerates only the marked regions, preserves every other byte of those files. Companion to the `dysflow install` plugin layer that performs the same job during routine install/update; this skill is the manual fallback when the plugin cannot reach a target.
license: Apache-2.0
metadata:
  author: "Andrés Román"
  version: "1.0.0"
  status: active
  last_verified: "2026-08-23"
  last_dysflow_version: "3.0.0"
  parent: "dysflow-codegraph-update"
  requires: "dysflow-arnes skill, dysflow-codegraph-update (ARN-1 upstream), `dysflow-plugin` for routine install/update refresh"
  managed_by: "`dysflow install` / `dysflow update` for routine pointer refresh; this skill is the manual fallback when those commands cannot reach a target (permissions, OS-specific path, agent not in the install matrix)."
  in_scope: "user-global agent instruction files (OpenCode / Codex / Claude Code / Cursor / Kiro / Copilot / Gemini / Antigravity / Hermes / OpenClaw / Pi) + dysflow project AGENTS.md embedded harness. Targets are discovered dynamically from the agent config the user invokes; the legacy hardcoded 8+1 target list is preserved only as a fallback when discovery fails."
  out_of_scope: "dysflow-arnes itself (ARN-1 of dysflow-codegraph-update), per-tool example files in dysflow-usage/assets/examples/ (dysflow-examples-sync), gentle-ai-owned skills, anything outside the canonical skills repo + user-global config"
  supersedes: "v0.2.3 (2026-07-30; explicit managed_by + fallback role; raised floor to 2.34)"
  trigger_patterns:
    - "ARN-2 — dysflow-arnes/SKILL.md content drifted from inlined pointer blocks across agent instruction files"
    - "ARN-2 — dysflow/AGENTS.md lost the embedded harness block between <!-- dysflow:arnés --> and <!-- /dysflow:arnés -->"
    - "ARN-2 chain from dysflow-codegraph-update ARN-1 (post-arnés-regeneration)"
    - "user says regen pointers / redistribuir arnés / los pointers quedaron viejos"
    - "`dysflow install` / `dysflow update` skipped an agent (no permission, missing config) and the pointer is stale"
    - "session-start verification: hash compare canonical block vs inlined content across active targets"
---

## Philosophy

The pointer is the LIGHTER variant of the harness — a compact current-contract block, not the full harness. It exists in 8 user-global instruction files plus the dysflow project AGENTS.md, so every installed agent can discover the harness without forcing the agent to load the full block into context.

Drift is the enemy. Run on demand after the arnés regenerates (ARN-1 → ARN-2 chain). Run rarely otherwise. But when you run, run completely across the 9 active targets.

### Canonical consumer pointer template

The installer ships this template inside the skill so every supported agent can
materialize the pointer even when companion assets are unavailable:

```markdown
<!-- user-supplement:dysflow:pointer -->
## Dysflow runtime-first rule

When the cwd contains `.dysflow/project.json`, any `.dysflow/*` artifact,
`*.accdb`, `*.bas`, `*.cls`, `*.form.txt`, or `tests/*.json`, `dysflow-usage`
and `dysflow-arnes` are **MUST-LOAD** skills. Load `dysflow-usage` first, then
the arnés. Call `bootstrap({})` before inspecting static project files,
forming a diagnosis, or modifying configuration. Route through
`schema({view:"index"})`, which lists every callable tool and marks the active
advertised surface. Expand with `get_capabilities({view:"compact"})`, an
explicit full view, or selective `describe_tool` only when needed. The live
runtime wins over cached documentation and assumptions.
<!-- /user-supplement:dysflow:pointer -->
```

1. **Single source of truth = `dysflow-arnes/SKILL.md` marker-delimited harness plus `assets/pointer.md`.** The delimited harness block is the canonical payload. The pointer is the lighter reference; the embedded block is the heavier payload (only in the home file `dysflow/AGENTS.md`).
2. **Markers are sacrosanct.** `<!-- user-supplement:dysflow:pointer -->...<!-- /user-supplement:dysflow:pointer -->` in user-globals; `<!-- dysflow:arnés -->...<!-- /dysflow:arnés -->` in `dysflow/AGENTS.md`. Operations only touch content INSIDE these markers. Outside content is read-only.
3. **The 9-target active list is fixed.** Adding a new instruction file requires user sign-off — the deployment surface does not grow by drift.
4. **Fail closed on missing delimiters.** If `dysflow-arnes/SKILL.md` lacks its `<!-- dysflow:arnés -->...<!-- /dysflow:arnés -->` pair, abort the run; surface the upstream defect to the user.
5. **Hash before write.** SHA256 of the canonical block vs SHA256 of the inlined content; only write on mismatch.

## Activation

Use when:
- `dysflow-codegraph-update` ARN-1 just regenerated the arnés (chain trigger ARN-1 → ARN-2).
- The user says "regen pointers" / "redistribuir arnés" / "los pointers quedaron viejos".
- An agent reports its instruction file has a dysflow pointer section but the section content disagrees with `dysflow-arnes/SKILL.md`.
- Session-start verification: any of the 9 active target files shows a hash mismatch with the canonical block.

Do NOT use for:
- Regenerating `dysflow-arnes/SKILL.md` itself (HR-1 of dysflow-codegraph-update → ARN-1).
- Creating per-tool example files (`dysflow-examples-sync`).
- A change in only one instruction file the user wants to make by hand — don't fight the user; point at the marker convention and let them edit.

## Hard Rules

1. **Source of truth is the released `skills/dysflow-arnes/SKILL.md`.** Installed
   agent copies and deprecated external mirrors are downstream, never upstream
   runtime-contract input. The complete rollout procedure ships in this skill.
2. **Edit only inside marker pairs.** `<!-- user-supplement:dysflow:pointer -->` for user-globals; `<!-- dysflow:arnés -->` for `dysflow/AGENTS.md` (literate embed). Outside-marker content is read-only.
3. **Back up before write.** Snapshot each touched file to `$HOME\AppData\Local\Temp\dysflow-pointer-backup-<timestamp>\<relative-path>.bak` preserving the directory tree.
4. **Hash before write.** SHA256 of canonical block vs inlined content; only write on mismatch. Skip-skip-noop if hashes match.
5. **Fail closed on missing delimiters.** If `dysflow-arnes/SKILL.md` lacks its `<!-- dysflow:arnés -->` open or close delimiter, abort; do not produce a half-pointer.
6. **Never edit inside `<!-- gentle-ai:* -->` markers.** The user-supplement markers are the legal injection seams for dysflow content; gentle-ai-managed markers are not.
7. **Always preserve frontmatter.** Cursor `.mdc`, Kiro `.md`, and VSCode `copilot-instructions.md` carry frontmatter; do not clobber the frontmatter block when rewriting the body.
8. **One file at a time, sequential.** No parallel writes; for the 9-target list, write sequentially with read-back verification between each.
9. **Append-only for the 8 user-globals.** When a user-global does NOT yet have a pointer, append at end. When it does, replace inside markers only.
10. **HR-13 of `dysflow-codegraph-update` carries over.** Owner signal `author: "Andrés Román"` applies; do not touch anything outside the user's owned scope.
11. **SEPARATE `POINTER_HASH` from `HARNESS_HASH`.** The lighter pointer template
    (`assets/pointer.md`) is for user-globals (targets 1–8); the dysflow-arnés
    delimited block is for the per-project AGENTS.md (target 9). These are DIFFERENT
    payloads with DIFFERENT hashes. Targets 1–8 are validated against `POINTER_HASH`;
    target 9 is validated against `HARNESS_HASH`. The skill MUST NEVER compare a
    pointer's inlined hash against `HARNESS_HASH` (different content, different
    boundary). Template/contract confusion here was the source of a v0.1.x false-green.
12. **Discover the dysflow target, do not hardcode it.** The 9th target is the unique `main` worktree from the Dysflow Git worktree list; the current resolved path is `<discovered-main-worktree>\AGENTS.md`. Discovery failure is a hard error. Never fall back to the legacy project path.

## Procedure

Full pre-flight, per-file recipes, and aggregate output: `references/procedure.md`. In short:

1. Step 0 — Pre-flight: load canonical block from `dysflow-arnes/SKILL.md` marker-delimited harness plus `assets/pointer.md`; compute SHA256; verify delimiters present.
2. Step 1 — Enumerate the 9 active targets (8 user-globals + dysflow/AGENTS.md).
3. Step 2 — Per file: read → extract inlined block via marker pair → hash compare → back up → replace inside markers → read-back verify → diff summary.
4. Step 3 — Aggregate: list touched / skipped / failed; deliver output contract.

## Output Contract

Return, in order: (1) canonical-block SHA256 (12-char prefix); (2) per-file status with before/after SHA256 (only files written; rest reported as "noop-skip-on-match"); (3) backup directory; (4) marker-idempotence check (each touched file still has its open + close markers); (5) any open decisions needing the user.

## References

- `references/procedure.md` — tooling-only procedure + dynamic target rules.
- `skills/dysflow-arnes/SKILL.md` marker-delimited block — canonical release block.
- `skills/dysflow-codegraph-update/SKILL.md` ARN-1 — upstream trigger.
- HR-13 of `dysflow-codegraph-update` — owner-boundary for "do not touch gentle-ai-owned skills".
