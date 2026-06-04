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
2. For the issue currently in flight, open its GitHub issue (link in the board) — the issue body is
   the authoritative spec (context, problem with `file:line`, acceptance criteria, constraints).
3. Recover SDD state for the active change (see **Artifact store** section) before writing code.
4. Honor the **Workflow contract** below. Do not skip the close + archive steps.
5. After every meaningful step, update this ledger (status, branch, PR, next action) and the
   `Last updated` line.
6. Cross-check reality with `gh issue list --state open` and engram (`mem_search "tech-debt"`),
   which are the authoritative remote state if this file ever lags.

`Last updated`: 2026-06-04 — **CAMPAIGN COMPLETE.** All 5 issues (#410, #405, #406, #407, #408) merged to main; CI green; shipped in v1.2.15. No open work remaining.

---

## Progress log

- **#410** (CI fix, unplanned but prioritized): main was red on Linux CI (pre-existing, 4+ runs).
  Fixed 5 Windows-coupled tests → PR #411 merged → **main green again** (first time since v1.2.12).
- **#405**: SDD full cycle done → PR #409 merged → issue closed → SDD archived (engram report).
- **#406**: pure type-move, lightweight SDD → PR #412 merged → issue closed → archived.
- **#407 + #408**: shipped together in PR #413 (remove global registry + HTTP input validation;
  also resolved an E2E race). Both issues closed → both SDD changes archived under
  `openspec/changes/archive/2026-06-03-407-...` and `.../2026-06-03-408-...`. Released in v1.2.15.
- **Campaign closed.** Nothing left in flight.

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

1. **SDD plan** → proposal → (spec/design as right-sized) → tasks. Delegated to sub-agents (the
   `sdd-*` skills cannot load under the bash gotcha; use the `sdd-*` sub-agent types instead).
2. **Implement** on a dedicated branch (`refactor/<issue>-<slug>` or `fix/`, `feat/`), STRICT TDD.
3. **Verify** → fresh-context adversarial review + `pnpm test` green + `tsc --noEmit && biome check`
   clean. No assertion edits made solely to fit a refactor (see `docs/testing/testing-philosophy.md`).
4. **PR** → one PR per issue, linking the issue (`Closes #NNN`). Branch off the latest `main`.
5. **CI green** → merge (`gh pr merge --merge --delete-branch`). Merging closes the issue.
6. **Archive** the SDD change → save an engram archive-report (`sdd/<change>/archive-report`); the
   `openspec/changes/<change>/` files remain on `main` as the permanent record.
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
| 0 | [#410](https://github.com/DysTelefonica/dysflow/issues/410) | Make Windows-coupled CI tests platform-aware (red main) | high | `done` ✅ | (merged) | [#411](https://github.com/DysTelefonica/dysflow/pull/411) | — |
| 1 | [#405](https://github.com/DysTelefonica/dysflow/issues/405) | Unify bifurcated MCP tool registration | high | `done` ✅ | (merged) | [#409](https://github.com/DysTelefonica/dysflow/pull/409) | `405-unify-mcp-tool-registration` |
| 2 | [#406](https://github.com/DysTelefonica/dysflow/issues/406) | Remove duplicated VBA comparison types | high | `done` ✅ | (merged) | [#412](https://github.com/DysTelefonica/dysflow/pull/412) | `406-remove-duplicate-vba-comparison-types` |
| 3 | [#407](https://github.com/DysTelefonica/dysflow/issues/407) | Make AccessOperationRegistry ownership explicit | medium | `done` ✅ | (merged) | [#413](https://github.com/DysTelefonica/dysflow/pull/413) | `407-access-operation-registry-ownership` |
| 4 | [#408](https://github.com/DysTelefonica/dysflow/issues/408) | HTTP adapter input validation parity | medium | `done` ✅ | (merged) | [#413](https://github.com/DysTelefonica/dysflow/pull/413) | `408-http-input-validation` |

Status legend: `todo` → `planning` → `in-progress` → `verifying` → `pr-open` → `done`.

---

## Per-issue working notes

### #410 — CI fix (DONE)
Pre-existing red Linux CI: 5 Windows-coupled tests asserted `powershell.exe`/`taskkill` unconditionally.
Made them platform-aware (assert `POWERSHELL_EXE`; branch kill-path on `process.platform`). Test-only.
PR #411 merged; main green.

### #405 — Unify bifurcated MCP tool registration (DONE)
Outcome: single `registerMcpToolList()` (pure, throws on duplicate names), `ALIAS_TOOL_NAMES` partitions
alias vs dispatch by construction. Behavior preserved (counts 45/2/5/48 unchanged). PR #409 merged.
Artifacts: `openspec/changes/405-unify-mcp-tool-registration/` + engram `sdd/405-.../*`.

### #406 — Remove duplicated VBA comparison types (DONE)
Deleted the 5 duplicate type declarations in `vba-sync-adapter.ts` (were identical to core) and
re-exported them from `core/services/vba-source-comparison.ts`. Pure type move; tsc clean; behavior
identical. PR #412 merged.

### #407 — AccessOperationRegistry ownership (DONE)
Outcome: Removed process-global defaultRegistry singleton and getDefaultAccessOperationRegistry() from core. Injected explicit registries from composition roots. All tests and compilation gates verified green.

### #408 — HTTP input validation parity (DONE)
Outcome: HTTP adapter now validates request input at the boundary (parity with the MCP `validateInput`
path) and returns 400 on malformed payloads instead of silently coercing via `String(... ?? "")`.
Shipped together with #407 in PR #413. Released in v1.2.15.

---

## Execution settings (decided 2026-06-03)

- **Execution mode**: `auto` — phases run back-to-back without pausing.
- **Delivery**: one PR per issue (issues are independent). Branch off latest `main`.
- **SDD weight (right-sized)**:
  - `#407` → **full SDD** (real design decision).
  - `#406`, `#408` → **lightweight** (proposal + tasks → apply → verify).

## Artifact store

SDD artifacts (proposal/spec/design/tasks/progress/verify/archive-report) for each change are persisted in:

- **Backend**: `hybrid` — versioned files in `openspec/changes/<change-name>/` **and** engram observations.
- **How to recover**:
  - engram → `mem_search(query: "sdd/<change-name>/<phase>", project: "dysflow")` then `mem_get_observation(id)`.
  - openspec → read `openspec/changes/<change-name>/`.

This ledger is the human-readable index; the artifact store holds the detailed phase content.
