---
name: dysflow-protocol
description: Canonical entry point for dysflow MCP usage. Load BEFORE calling any dysflow tool. Mirrors `engram-memory-protocol` so AI agents do not have to invent the workflow.
triggers:
  - Calling any dysflow MCP tool (read OR write)
  - Choosing between `apply: true`, `apply: false`, or `confirmedRequiresConfirmation`
  - Pre-write preflight (`doctor`, `diagnose`, `state`)
  - Session start on a dysflow project
  - Recovery (orphaned access processes, drift, missing config)
  - After compaction on a dysflow session
---

# dysflow-protocol — canonical entry point

This skill is the single source of truth for HOW an AI agent operates dysflow. Loaded BEFORE any MCP tool call. Mirrors `engram-memory-protocol`: the runtime gives you primitives; this skill teaches the workflow.

The runtime is the source of truth. If this skill disagrees with `get_capabilities` output, **runtime wins**. Surface the drift to the user.

## 0. When this skill applies (load when...)

- The project contains `.dysflow/project.json` or you receive a dysflow MCP envelope.
- You are about to call any dysflow MCP tool (read or write).
- You are deciding between `apply: true`, `apply: false`, or `confirmedRequiresConfirmation`.
- You are uncertain whether a tool's check has `requires_confirmation: true`.

## 1. Hard rules (NEVER violate)

### HR-1 — The HUMAN compiles.

NEVER pass `apply: true` on `test_vba` / `run_vba` while `humanCompilePending: true`. Required loop:

1. Write source → 2. `import_modules({moduleNames:[...], apply: false})` → 3. ASK the user to compile manually (Debug ▸ Compile) → 4. WAIT for "ya está" → 5. THEN `test_vba`.

Failures from `test_vba` are test failures, never compile errors.

### HR-2 — NEVER kill `MSACCESS.EXE` generically.

Forbidden (verbatim): `Stop-Process -Name MSACCESS`, `taskkill /F /IM MSACCESS.EXE`, `pkill MSACCESS`, `Get-Process | Stop-Process -Force`, `kill -9` on `Get-Process` results.

Use ONLY dysflow-owned cleanup: `list_access_operations` → `access_force_cleanup_orphaned({confirmPid: null})` → `access_force_cleanup_orphaned({confirmPid: <real pid>})` → OR `cleanup_access_operation({operationId: <real id>})`.

### HR-3 — NEVER write to the production backend.

`m_TestingMode=True` is the only path for test data. If sandbox unreachable → surface "TESTS BLOCKED", do NOT touch data. Production writes = silent corruption.

### HR-4 — Unified confirmation policy (Slice 3).

For ANY mutating call:

1. Look up the tool's `implements_check` value. The four mappings that exist today:
   - `export_modules` / `export_all` → `export_overwrites_source_precheck`
   - `clean_stale_markers` → `stale_markers`
   - `access_force_cleanup_orphaned` → `orphans_msaccess`
   - All other mutating tools: no `implements_check` declared, no override needed.
2. If `doctorCheckMetadata(check_id).requires_confirmation === true`, you MUST pass `confirmedRequiresConfirmation: true` after an explicit `ask_user` step.
3. If you pass `confirmedRequiresConfirmation: true` on a check that does NOT require it, the seam returns `CONFIRMATION_NOT_NEEDED` (envelope carries `check_id` + `reason_code`).
4. If you DON'T pass it on a check that DOES require it, the seam returns `CONFIRMATION_REQUIRED` (envelope carries `check_id` + `reason_code`).
5. AI agents MUST NEVER set `confirmedRequiresConfirmation: true` without a prior `ask_user` step.

### HR-5 — `apply: false` is the canonical plan signal.

`apply: false` ≡ "preview without commit". NEVER `dryRun: true` (legacy alias, hard-removed in v2.31.0). NEVER `diff: true` on mutating tools (legacy alias, deprecated).

### HR-6 — Pre-flight BEFORE every write.

Self-check (5 points):
1. `adapterVersion` is current.
2. `writeExecutionPolicy` matches your intent (developer mode vs safe-by-default).
3. `writesProcess.enabled` AND `writesProject.allowWrites` are both `true`.
4. `humanCompilePending` is `false` before any `test_vba` / `run_vba` call.
5. The tool's `requires_confirmation` policy is understood; `confirmedRequiresConfirmation` set if needed.

If any check fails, STOP and surface the gap.

### HR-7 — Runtime is source of truth.

Never memorize tool names, flags, defaults, or error codes from this skill. Re-fetch via `get_capabilities({})` before any non-trivial call sequence. If runtime value disagrees with this skill or any other artifact, trust runtime and surface drift.

### HR-8 — Test definitions live in `tests/*.json` manifests, NOT in `.dysflow/project.json` allowlist.

The allowlist is a runtime gate, not a test registry. Adding test names to allowlist on each fix is an anti-pattern.

### HR-9 — Select worktrees per call, never by restarting the MCP.

Each worktree owns a unique `.dysflow/project.json`. For a sibling worktree, call `resolve_project({cwd: "<worktree>", projectId: "<id>"})`. Project-scoped read tools may accept that `cwd`; write tools select the discovered sibling with `projectId` or its configured `accessPath`. Confirm each shape with `describe_tool({name: "<tool>"})`.

### HR-10 — Discover progressively.

Call `get_capabilities({})`, select the relevant `preferredAgentWorkflows` phase, then call `describe_tool` only for the tools about to run. Do not preload or guess the full surface.

### HR-11 — Bootstrap and ambiguity recovery are different operations.

When `projectConfig.status === "missing"`, use `setup_project` (or the canonical CLI setup command) with explicit human-provided `projectId` and frontend input. Omitting `projectId` is valid only when the selected WorktreeContext already has a configured id to reuse; otherwise the runtime fails closed with `MCP_INPUT_INVALID` and `projectId is required`. It never invents an id from the cwd basename. When `resolve_project` returns `outcome: "ambiguous"`, do not guess: ask the human to choose one `availableProjects` entry, then retry `resolve_project`, the intended write-class tool, or `setup_project` with that exact `projectId`, `projectChoiceReason: "user_selected_after_ambiguous_project"`, and the returned `recoveryToken`. In recovery mode, `setup_project` only caches the selected existing project and returns `mode: "resolution"`; it never creates or overwrites config. Bootstrap mode is separate and requires `frontendFile`. The one-shot choice is cached only in the current MCP process; use `resolve_project({clearResolution:true})` to drop it.

## 2. The 8-step canonical loop

For any dysflow-managed feature:

**Step 0 — Bootstrap context.** Call `get_capabilities({})`. Capture `adapterVersion`, `writeExecutionPolicy`, `toolsVisible`, `humanCompilePending`, `preferredAgentWorkflows`, `effectiveDryRunDefault` (legacy, may be empty).

**Step 1 — Diagnose the project.** Call `doctor({})` or `diagnose({})`. Read the findings. The `diagnose` envelope carries `checks: DiagnoseCheck[]` with `requires_confirmation` policy per check_id.

**Step 2 — Detect check_id for the mutating tool.** Look up the tool's `implements_check` value. If the tool doesn't have one, no override needed.

**Step 3 — Determine confirmation policy.** `requires_confirmation: true|false` from `DOCTOR_CHECK_METADATA` registry.

**Step 4 — Plan first, then apply.** `apply: false` for the plan view. Review the plan. The confirmation gate does NOT fire on plan; it fires on commit (`apply: true`).

**Step 5 — Get confirmation if needed.** If the check requires it, `ask_user` with the specific operation. Capture explicit user ack BEFORE applying.

**Step 6 — Commit with confirmation.** `apply: true` + `confirmedRequiresConfirmation: true`. The seam validates and either proceeds or returns `CONFIRMATION_REQUIRED` with `check_id` in the envelope — branch on it.

**Step 7 — Verify.** `verify_code({})` after writes. Check for drift between source and binary.

**Step 8 — Analyze and refactor.** Refactor-safety: a behavior-preserving refactor MUST NOT break tests. If it does, the test is the defect.

## 3. Quick reference: tool → check_id → confirmation policy

| Tool | `implements_check` | `requires_confirmation` |
|---|---|---|
| `export_modules` | `export_overwrites_source_precheck` | true (when destination overlaps source) |
| `export_all` | `export_overwrites_source_precheck` | true (when destination overlaps source) |
| `clean_stale_markers` | `stale_markers` | true (always — non-dry-run needs override) |
| `access_force_cleanup_orphaned` | `orphans_msaccess` | true (always — kill needs override) |
| (other ~37 mutating tools) | (none declared — no override needed) | n/a |

## 4. Anti-patterns (forbidden actions)

- **AP-1** — `dryRun: true` (any variant). Use `apply: false`. Hard-removed in v2.31.0.
- **AP-2** — `confirm: true` on `clean_stale_markers`. Use `confirmedRequiresConfirmation: true` with `implements_check: 'stale_markers'`.
- **AP-3** — `confirmOverwriteSource: true` on export tools. Use `confirmedRequiresConfirmation: true` with `implements_check: 'export_overwrites_source_precheck'`.
- **AP-4** — `confirmPid: <pid>` on `access_force_cleanup_orphaned`. Use `confirmedRequiresConfirmation: true` with `implements_check: 'orphans_msaccess'`.
- **AP-5** — Calling `test_vba` with `humanCompilePending: true`. Wait for the human.
- **AP-6** — Generic `Stop-Process -Name MSACCESS`. Use `access_force_cleanup_orphaned`.
- **AP-7** — Bypassing `allowWrites: false`. Do not touch data.
- **AP-8** — Adding test names to `.dysflow/project.json` allowlist on each fix.
- **AP-9** — Mocking to skip a real integration test. Fakes isolate LOGIC from DATA; never serve to skip the data-layer E2E.
- **AP-10** — Mutating `TbConfiguracionBackends` from test code. Config table is production state; tests READ it once via `BeginTestSession`, never WRITE.
- **AP-11** — `Debug.Print` / `MsgBox` in test atoms. `Debug.Print` is invisible to COM; `MsgBox` blocks unattended execution.
- **AP-12** — `DELETE` without `WHERE` (even in sandbox). Use `TEST_ID_BASE` (900000+) as guard for fixture cleanup.
- **AP-13** — Claiming "TDD-green" without BOTH user-confirmed compile AND all-green `test_vba` result.
- **AP-14** — Setting `confirmedRequiresConfirmation: true` without a prior `ask_user` step.

## 5. Companion skills (matrix)

| When you are... | Load this skill FIRST |
|---|---|
| Calling any dysflow tool | THIS skill (`dysflow-protocol`) |
| Writing or reviewing VBA | `vba-access` |
| Implementing TDD feature | `access-vba-tdd-loop` |
| Writing test atoms | `access-vba-tdd-fundamentos` |
| Setting up sandbox / test env | `access-vba-tdd-sandbox` |
| Diagnosing test quality / coverage | `access-vba-tdd-quality` |
| Bridging TDD ↔ UAT | `access-vba-e2e-methodology` |
| Working on forms (perceive→act→verify) | `access-form-ui-builder` |
| Syncing source ↔ binary one-shot | `vba-binary-sync` |
| Documenting capabilities (SDD-grade) | `access-vba-capability-docs` |
| Detected runtime drift, skills disagree | `dysflow-codegraph-update` (MAINTENANCE — not for daily work) |
| Hit OpenCode Code Mode JSON-wrapping bug | `dysflow-usage` §"Code Mode JSON-wrapping workaround" |

## 6. Recovery (error code → action)

If a call returns an error envelope, branch on `error.code`:

| Code | Meaning | Action |
|---|---|---|
| `CONFIRMATION_REQUIRED` | check requires confirmation, you didn't pass it | Re-call with `confirmedRequiresConfirmation: true` after `ask_user` |
| `CONFIRMATION_NOT_NEEDED` | check does NOT require it, you passed it | Drop the override |
| `MCP_INPUT_INVALID` | schema / flag contradiction | Read `error.rejectedFlag` + `error.toolCommitFlag` for the right replacement |
| `MCP_PROCEDURE_NOT_ALLOWED` | procedure not in allowlist | Add to `.dysflow/project.json#allowedProcedures` OR plan only with `apply: false` |
| `MCP_ALLOWLIST_NOT_CONFIGURED` | no allowlist set | Configure it OR plan only with `apply: false` |
| `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` | destination overlaps source | Pass `implements_check: 'export_overwrites_source_precheck'` + `confirmedRequiresConfirmation: true` |
| `DESTINATION_ROOT_REQUIRED` | no destination declared | Set explicit `destinationRoot` / `exportPath` OR `allowConfiguredDestinationRoot: true` |
| `MCP_WRITES_DISABLED` | runtime disabled | Surface to user; do not retry |
| `PROJECT_CONFIG_NOT_WRITE_READY` | project config missing fields | Run `dysflow setup --cwd <repo> --apply --project-id <id> --access-path <path>` to bootstrap |
| `CONFIG_MISSING_ACCESS_PATH` | no `.dysflow/project.json` | Run `dysflow setup --cwd <repo> --apply --project-id <id> --access-path <path>` |
| `humanCompilePending` warning (advisory) | post-write reminder | Wait for human compile before `test_vba` |
| `FRONTEND_TARGET_MISSING` | workspace resolution failed | Run `resolve_project` first |
| `FRONTEND_TARGET_AMBIGUOUS` / `outcome: "ambiguous"` | more than one project is eligible | Ask the human to choose from `availableProjects`; retry once with the exact recovery trio |
| `CWD_NOT_IN_WORKTREE` / `TARGET_MISMATCH_WARNING` | cwd not in worktree | Pass explicit `projectId` / `cwd` per call |

## 7. Session lifecycle

- **Session start**: call `get_capabilities`, capture `adapterVersion`, `toolsVisible`, `humanCompilePending`. Load project state via `state({})`.
- **After compaction**: re-call `get_capabilities`. The `toolsVisible` count may have changed; `adapterVersion` may have bumped. Re-establish the working context.
- **Subagent spawn**: each subagent gets a fresh context. Pass the dysflow-protocol skill explicitly via the agent's system prompt.
- **Session end**: run `doctor` one last time. Surface any unresolved drift to the user.

## 8. Memory (dysflow-specific)

The runtime (`get_capabilities`) IS the memory. Do NOT cache tool names, write-flags, default `dryRun` values, or error codes across sessions. Re-fetch at session start and after any `adapterVersion` bump.

Engram IS useful for project-level facts (sandbox URLs, project conventions, user preferences) — NOT for the runtime surface.

## 9. Delegation

dysflow does NOT spawn sub-agents. You call tools directly. If isolation is needed (long test run, parallel investigation), use the host agent's delegation mechanism — do NOT invent dysflow-specific delegation.

## 10. Codegraph guidance

For repo maps, architecture, call flow, dependencies, symbol references, impact analysis, "how does X work" — use codegraph-vba MCP (and/or generic CodeGraph tooling) BEFORE broad Read/Glob/Grep filesystem exploration. Initialize on real project roots; never in `$HOME`, `/tmp`, or non-project folders.

## 11. Worktree workflow (canonical)

**Worktrees are the primary friction surface for dysflow.** `git worktree add ../new-wt` does NOT copy `.dysflow/` into the new worktree. Without explicit setup, every mutating call returns `CONFIG_MISSING_ACCESS_PATH` and the agent has to invent a config from scratch. The canonical workflow eliminates that:

### A. The happy path (post-hook-install)

After `dysflow setup` has been run **once** in the main repo (which installs the `post-worktree` git hook — see `dysflow setup --install-hooks`), every subsequent worktree bootstrap is automatic:

1. **Create the worktree** the standard way:
   ```
   git worktree add ../repo-feature-x main
   ```
2. **Navigate** to the new worktree:
   ```
   cd ../repo-feature-x
   ```
3. **Use dysflow normally.** The `post-worktree` hook fired on `git worktree add`, copied `.dysflow/project.json` from the parent worktree, minted a fresh `id` (UUID v7), and the runtime is ready.

No `dysflow setup` re-run. No `git mv` of `.dysflow/`. No manual `projectId` minting. The agent does not have to invent anything.

### B. What the hook does (post-worktree git hook)

When `git worktree add <new-path> [<commitish>]` runs, git invokes `.git/hooks/post-worktree <new-path>` (per `man githooks`). The hook, installed by `dysflow setup --install-hooks`:

1. Reads `<new-path>` from `$1` (git's first arg).
2. Walks to the parent's worktree toplevel (the one that issued the `add`) and reads its `.dysflow/project.json`.
3. Deep-copies the parent's `.dysflow/project.json` verbatim — same `accessPath`, same `backendPath`, same `capabilities`, same `dryRun` policy.
4. **Mints a fresh `id`** (UUID v7 — sortable, collision-safe) for the new worktree so `discoveredProjects[]` distinguishes siblings.
5. Writes the new `.dysflow/project.json` to `<new-path>/.dysflow/`.

Both worktrees share the SAME `.accdb` (the `accessPath` is intentionally NOT changed). What differs across worktrees: `id`, `projectRoot`, `cwd` resolution at runtime, and `destinationRoot` (the worktree's own `src/`).

### C. Manual fallback (when the hook is NOT installed)

When `dysflow setup --install-hooks` was never run, or when the agent is on a CI runner without git hooks enabled, the agent MUST bootstrap manually:

1. **Detect the missing config.** Call `get_capabilities({})`. It surfaces `projectConfig.status: "missing"` and a `remediation` field with the exact command.
2. **Read the parent's config** (any sibling worktree's `.dysflow/project.json`) to learn the `accessPath`.
3. **Run the suggested command**:
   ```
   dysflow setup --cwd <new-worktree-path> --apply --project-id <id> --access-path <parent-access-path>
   ```
   Use the SAME `accessPath` as the parent. Provide a stable `id` explicitly, or reuse an existing configured id.
4. **Verify** with `state({})`: `projectConfig.status` should be `valid` and `writeReady: true`.

### D. Recovery

If a worktree's `.dysflow/project.json` becomes corrupt, stale, or missing entirely:

| Symptom | Recovery |
|---|---|
| `projectConfig.status: "missing"` | Run the manual fallback command (C.3). |
| `projectConfig.status: "outside-project-root"` | The `.dysflow/` is in a directory git does not consider the worktree toplevel. Move it. |
| `PROJECT_ID_COLLISION` (multiple worktrees share the same `id`) | Manually edit one worktree's `.dysflow/project.json#id` to a fresh UUID v7. Re-run `get_capabilities` to confirm. |
| `INHERITED_WORKTREE_MISMATCH` | A child worktree inherited config from a parent that's been deleted. Delete the child worktree and re-create with the hook installed. |
| `CWD_NOT_IN_WORKTREE` | The process cwd is outside any git worktree (e.g., a temp dir). Pass `cwd` or `projectId` explicitly per call. |

### E. Anti-patterns

- **AP-15** — copy `.dysflow/project.json` from a sibling by hand. Don't — the hook does it deterministically with a fresh UUID v7. Manual copying risks stale `id` collisions in `discoveredProjects[]`.
- **AP-16** — run `dysflow setup --access-path <different-path>` per worktree. Don't — worktrees share the SAME `.accdb` on purpose. Splitting the binary per worktree breaks `compare_backends`, drift detection, and `humanCompilePending` continuity (the human compiles once for the binary; both worktrees see the same compile state).
- **AP-17** — commit `.dysflow/project.json` to git. Don't — `.dysflow/` is gitignored. Each worktree mints its own config at bootstrap time.
- **AP-18** — invoke `.git/hooks/post-worktree` manually outside of `git worktree add`. Don't — git only invokes hooks under specific commands; manual invocation skips the `gitdir` discovery that the hook relies on.

### F. Detection (does the hook exist?)

If unsure whether the hook is installed, the agent can ask:

```sh
test -x .git/hooks/post-worktree && echo "installed" || echo "missing"
```

If `missing`, run `dysflow setup --install-hooks` once. The hook lands at `.git/hooks/post-worktree` and persists across worktree additions until someone deletes the hooks directory.

## 12. Version + authorship

- dysflow-protocol v1.0.0 — initial release aligned with v2.31.0.
- Requires dysflow MCP >= 2.31.
- Source of truth: live `get_capabilities`. If this skill disagrees with runtime, **runtime wins**; surface the drift and update via `dysflow-codegraph-update`.

---

*Mirrors engram's `engram-memory-protocol` shape (canonical workflow + recovery matrix + companion skill table). Adapted to dysflow's three-plane model: runtime primitives (this skill teaches the workflow), plugin layer (`.claude-plugin/`, `plugin/`), workflow skills (TDD loop, form-ui-builder, etc.).*
