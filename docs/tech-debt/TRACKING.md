# Tech-Debt Remediation — Tracking Ledger

> **Single source of truth** for the multi-issue tech-debt cleanup that came out of the
> 2026-06-03 fresh architecture review of the dysflow MCP runtime. This ledger exists so that
> **any AI (or human) can resume the work exactly where it was left** if the active session runs
> out of tokens or is compacted. Keep it accurate — update it as the **first** action after any
> state change, before moving on.

---

## ⛑️ If you are resuming this work — READ THIS FIRST

1. Read this whole file. The **Status board** below tells you which issue is in flight and the
   **exact next action**.
2. For the issue currently `in-progress`, open its GitHub issue (link in the board) — the issue body
   is the authoritative spec (context, problem with `file:line`, acceptance criteria, constraints).
3. Recover SDD state for the active change (see **Artifact store** section) before writing code.
4. Honor the **Workflow contract** below. Do not skip the close + archive steps.
5. After every meaningful step, update this ledger (status, branch, PR, next action) and the
   `Last updated` line.

`Last updated`: 2026-06-03 — ledger created; environment incident diagnosed & worked around (see below); no issue implemented yet.

---

## ⚙️ Environment gotcha (READ if bash commands look broken)

The Bash tool spawns **Git Bash**, which mounts `C:` only at `/cygdrive/c`, but the Claude Code
harness writes its cwd-tracking marker under `/c/...`. Result: **every bash command exits `1` with a
trailing `…/Temp/claude-XXXX-cwd: No such file or directory`** even though the command itself ran and
its output is valid. This also makes the **Skill tool fail** (its `!command` substitution treats the
non-zero exit as fatal) — so `sdd-init` and the `sdd-*` skills will not load until the durable fix
below takes effect.

- **Per-command workaround (works now)**: prefix any bash command with `mount C:/ /c 2>/dev/null;` —
  this makes the marker write succeed and the real exit code surface. Without it, judge success by
  parsing output, not the exit code.
- **Durable fix (already applied, needs a Claude Code restart to activate)**: `BASH_ENV` is set in
  `HKCU\Environment` to `C:/Users/adm1/.claude-bash-env.sh`, which runs `mount C:/ /c` for every
  non-interactive bash. After the next session restart, bash exit codes are correct and skills work.
- Could not create `/etc/fstab` (Program Files ACL blocks writes even though `test -w /etc` lies).

---

## Workflow contract (per issue)

Each issue is handled as its own SDD change and follows this lifecycle:

1. **SDD plan** → proposal → spec → design → tasks (right-sized: small issues may collapse phases).
2. **Implement** on a dedicated branch (`refactor/<issue>-<slug>` or `feat/...`).
3. **Verify** → `pnpm test` green + `tsc --noEmit && biome check` clean. No assertion edits made
   solely to fit a refactor (see `docs/testing/testing-philosophy.md`).
4. **PR** → one PR per issue, linking the issue (`Closes #NNN`).
5. **Close** the GitHub issue (merging the PR with `Closes #NNN` does this automatically).
6. **Archive** the SDD change (`/sdd-archive`) so the change folder/observation is closed.
7. **Update this ledger** → mark the issue `done`, record PR link, advance to the next issue.

### Hard constraints (apply to every issue)

- Hexagonal boundary: `src/core` must NOT import from `src/adapters`. Enforced by
  `test/architecture/core-boundary.test.ts` — it must stay green.
- Tests assert **behavior at the ports**. Mock only I/O adapters. Never assert internal call order
  or private collaborators.
- Biome strict: no `any`, no non-null assertions.
- Conventional commits. **No** AI co-author / attribution lines.
- Never touch the production runtime (`%LOCALAPPDATA%\dysflow`). Build to `test-runtime/` for E2E.

---

## Status board (in order of importance)

| Order | Issue | Title | Severity | Status | Branch | PR | SDD change |
|-------|-------|-------|----------|--------|--------|----|------------|
| 1 | [#405](https://github.com/DysTelefonica/dysflow/issues/405) | Unify bifurcated MCP tool registration | high | `in-progress` | `refactor/405-unify-mcp-tool-registration` | — | `405-unify-mcp-tool-registration` |
| 2 | [#406](https://github.com/DysTelefonica/dysflow/issues/406) | Remove duplicated VBA comparison types | high | `todo` | — | — | — |
| 3 | [#407](https://github.com/DysTelefonica/dysflow/issues/407) | Make AccessOperationRegistry ownership explicit | medium | `todo` | — | — | — |
| 4 | [#408](https://github.com/DysTelefonica/dysflow/issues/408) | HTTP adapter input validation parity | medium | `todo` | — | — | — |

Status legend: `todo` → `planning` → `in-progress` → `verifying` → `pr-open` → `done`.

---

## Per-issue working notes

### #405 — Unify bifurcated MCP tool registration
- **Key files**: `src/adapters/mcp/tools.ts` (explicit handlers `:272-430`; dispatch loop `~:433`;
  `MCP_TOOL_ROUTES` `:457-506`; dedup `add` guard `:264-269`).
- **Guardrail**: tool counts in `test/adapters/mcp/release-matrix-gate.test.ts` (45+2+5=48) MUST NOT change.
- **Next action**: start SDD planning.
- **Notes**: _(none yet)_

### #406 — Remove duplicated VBA comparison types
- **Key files**: core source of truth `src/core/services/vba-source-comparison.ts:16-62`; delete the
  duplicates in `src/adapters/vba-sync/vba-sync-adapter.ts:30-65`; re-export pattern already at `:611`.
- **Scope**: pure type move; behavior must be identical; `tsc --noEmit` proves it.
- **Next action**: queued behind #405.
- **Notes**: _(none yet)_

### #407 — AccessOperationRegistry ownership
- **Key files**: singleton at `src/core/runner/access-runner.ts:118` + `getDefaultAccessOperationRegistry()` `:121`;
  consumers `src/adapters/mcp/tools.ts:277`, `src/adapters/http/server.ts`.
- **Decision needed in proposal**: explicit injection (preferred) vs. intentional + test-pinned shared state.
- **Next action**: queued.
- **Notes**: _(none yet)_

### #408 — HTTP input validation parity
- **Key files**: `src/adapters/http/server.ts:175-177,197` (`String(body.data.x ?? "")` with no schema);
  reuse `src/adapters/mcp/validator.ts` approach.
- **Next action**: queued.
- **Notes**: _(none yet)_

---

## Execution settings (decided 2026-06-03)

- **Execution mode**: `auto` — phases run back-to-back without pausing.
- **Delivery**: one PR per issue (issues are independent).
- **SDD weight (right-sized)**:
  - `#405`, `#407` → **full SDD** (explore→propose→spec→design→tasks→apply→verify→archive) — real design decisions.
  - `#406`, `#408` → **lightweight** (proposal + tasks → apply → verify → archive) — mechanical changes, no heavy design phase.

## Artifact store

SDD artifacts (proposal/spec/design/tasks/progress/verify) for each change are persisted in:

- **Backend**: `hybrid` — versioned files in `openspec/changes/<change-name>/` **and** engram observations.
- **How to recover**:
  - engram → `mem_search(query: "sdd/<change-name>/<phase>", project: "dysflow")` then `mem_get_observation(id)`.
  - openspec → read `openspec/changes/<change-name>/`.

This ledger is the human-readable index; the artifact store holds the detailed phase content.
