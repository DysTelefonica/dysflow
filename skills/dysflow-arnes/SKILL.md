---
name: dysflow-arnes
description: "Trigger: MUST-LOAD for any AI agent touching dysflow artifacts (.dysflow/*, *.accdb, *.bas, *.cls, *.form.txt, tests/*.json). Load dysflow-usage FIRST, then this operating harness; call bootstrap({}) before static diagnosis and expand capabilities explicitly. Self-contained hard rules, workflow loop, companion-skill matrix, and anti-patterns."
license: Apache-2.0
metadata:
  author: "Andrés Román"
  version: "1.0.0"
  status: active
  last_verified: "2026-08-26"
  last_dysflow_version: "4.3.0"
  requires: "dysflow MCP >= 3.0, dysflow-usage skill"
  managed_by: "dysflow install / dysflow upgrade (shipped with the runtime)"
  scope:
    in_scope: "operating rules, hard constraints, workflow loop, companion-skills matrix, anti-patterns for any AI agent using dysflow"
    out_of_scope: "canonical tool names / write-flags / error codes (dysflow-usage), TDD discipline details (access-vba-tdd-*), e2e methodology (access-vba-e2e-methodology), form UI perceive→act→verify details (access-form-ui-builder)"
  injection_format: "the literal markdown block delimited by <!-- dysflow:arnés --> ... <!-- /dysflow:arnés --> HTML comments at the top of SKILL.md, intended for copy-paste into any agent's system prompt"
  pointer_marker: "<!-- user-supplement:dysflow:pointer --><!-- /user-supplement:dysflow:pointer --> in each AGENTS.md / CLAUDE.md of an installed agent; block is rewritten by `dysflow install` / `dysflow update`"
---

<!-- dysflow:arnés -->
# dysflow — Operating Harness

You are an AI agent operating in a Microsoft Access / VBA project that uses the
dysflow MCP. dysflow is the only canonical path for source↔binary sync, SQL
execution, test execution, and form UI operations on Access projects.

**MUST-LOAD ORDER:** load `dysflow-usage` first, then this harness. Call
`bootstrap({})` before reading static project files, forming a diagnosis, or
modifying `.dysflow/project.json`. Route with
`schema({view:"index"})`; expand through an explicit compact/full capability
view or selective `describe_tool` only when needed. The live runtime is
authoritative.

## 1. When this arnés applies (load it when...)

- The project contains `*.accdb`, `*.bas`, `*.cls`, `*.form.txt`, `.dysflow/*`,
  or `tests/*.json` files.
- You are about to call any dysflow MCP tool.
- You receive an MCP error envelope from dysflow.
- You are about to write a new test, helper, fixture, or form handler.
- You are deciding whether a write should happen (`apply:false` vs `apply:true`).

## 2. Hard rules (NEVER violate)

- **HR-1 — The HUMAN compiles.** You NEVER call `compile_vba`, NEVER pass
  `compile:true`. Required loop for any slice ending in `test_vba`:
  (1) write source → (2) `import_modules({moduleNames:[...], apply:false})` →
  (3) ASK the user to compile manually (Debug → Compile VBA Project) →
  (4) WAIT for "ya está" confirmation → (5) THEN `test_vba`. Failures from
  `test_vba` are test failures, never compile errors.

- **HR-2 — Confirm destructive operations; NEVER kill MSACCESS.EXE generically.**
  Every public destructive `apply:true` call requires the exact schema-advertised
  `implements_check` token AND `confirmedRequiresConfirmation:true` after the
  human approves the risk. The enforced tokens are:
  `delete_module_precheck`, `compact_repair_precheck`,
  `relink_directory_precheck`, `localize_backend_precheck`,
  `drop_table_precheck`, and `teardown_fixture_precheck`. `apply:false` remains
  the safe planning path. The Access-kill escape hatch keeps its stricter
  PID-bound `orphans_msaccess` contract. Forbidden generic kill operations
  (verbatim):
  (verbatim):
  `Stop-Process -Name MSACCESS`,
  `taskkill /F /IM MSACCESS.EXE`,
  `pkill MSACCESS`,
  `Get-Process | Stop-Process -Force`,
  `kill -9` on `Get-Process` results.
  Use ONLY dysflow-owned cleanup: `list_access_operations` →
  `access_force_cleanup_orphaned({pid:null})` →
  `access_force_cleanup_orphaned({pid:<real pid>,implements_check:"orphans_msaccess",confirmedRequiresConfirmation:true})` → OR
  `cleanup_access_operation({operationId:<real id>})`.

- **HR-3 — NEVER write to production backend.** `m_TestingMode=True` is the
  ONLY path for test data. If sandbox unreachable → surface "TESTS BLOCKED",
  do NOT touch data. Production writes = silent corruption.

- **HR-4 — Pre-flight BEFORE every dysflow write call.** Start from
  `bootstrap({})`, then fetch the bounded capability blocks needed by the
  selected tool. Self-check (5 points): (1) `adapterVersion` is current,
  (2) `effectiveDryRunDefault[toolName]` matches your intent,
  (3) `writesProcess.enabled` AND `writesProject.allowWrites` are both `true`,
  (4) `humanCompilePending` is `false` before `test_vba` / `run_vba`,
  (5) `toolInventory.advertised` or `.callable` matches the claim you cite;
  legacy `toolsVisible` has context-dependent meaning.
  If any check fails, STOP and surface the gap.

- **HR-5 — Runtime is source of truth.** Never memorize tool names, flags,
  defaults, or error codes from any doc. Re-fetch `bootstrap`, route through
  `schema({view:"index"})`, and expand the relevant capability/schema blocks
  before any non-trivial call sequence. If runtime value disagrees with
  this arnés or any skill, trust runtime and surface drift to the user.

- **HR-6 — Test definitions live in `tests/*.json` manifests, NOT in
  `.dysflow/project.json` allowlist.** The allowlist is a runtime gate, not a
  test registry. Adding test names to allowlist on each fix is an anti-pattern.

- **HR-7 — Verify process liveness BEFORE asserting or blocking.** Never
  assert a process exists from cached / registry / prior-turn state.
  Read-only checks: `list_access_operations`,
  `cleanup_access_operation({force:false})`,
  `access_force_cleanup_orphaned({pid:null})`. Never fabricate
  process details a tool did not return.

- **HR-8 — Writes are serialized per process.** Never batch dysflow write
  calls in parallel from one agent context. One call → wait → audit → next.
  To batch related ops, use List-shape arguments in ONE call.

- **HR-9 — Select worktrees per call, never by restarting the MCP.** Each worktree
  owns a unique `.dysflow/project.json`. Every project-config-consuming tool
  accepts optional `cwd`; omit it for the startup worktree or pass the intended
  worktree root. Use `register_worktree({cwd})` to pre-warm a sibling,
  `resolve_project({cwd,projectId})` to verify it, and
  `clear_worktree_cache({cwd})` only when a forced rescan is needed. Never
  weaken the guard or edit configs to switch worktrees.

- **HR-10 — Bootstrap missing project config before any other write.** When
  `get_capabilities({view:"full"}).projectConfig.status === "missing"`, call
  `setup_project({cwd,projectId,frontendFile,apply:false})`, review
  `resolvedConfig`, then repeat with `apply:true`. A fresh worktree MUST provide
  an explicit `projectId`; `setup_project` may reuse an existing
  `WorktreeContext` id, but never invent one from the `cwd` basename. The
  bootstrap apply enforces the process write gate and candidate
  `capabilities.allowWrites`; the same `cwd` is immediately usable without an
  MCP restart. Shell-enabled clients may use the equivalent `dysflow setup` CLI.

- **HR-11 — Recover ambiguity without overwriting config.** When
  `resolve_project({})` returns `outcome:"ambiguous"`, ask the human to choose
  exactly one entry from `availableProjects`; never guess. Retry
  `resolve_project` or the intended project-config-consuming tool with that
  entry's `projectId`,
  `projectChoiceReason:"user_selected_after_ambiguous_project"`, and the opaque
  `recoveryToken`. The dispatch seam consumes this complete trio BEFORE any
  fresh collision check and routes through the cached chosen project root.
  Tokens are one-shot, process-local, and invalidated by config/worktree
  changes; a consumed or missing token MUST fail closed. Use
  `resolve_project({clearResolution:true})` to drop a pending choice.
  `setup_project` may consume the trio only to return `mode:"resolution"` for
  the selected existing project; that route never writes config.

- **HR-12 — Let runtime metadata route discovery.** `tools/list` contains the
  advertised surface, while schema index contains every callable tool and an
  `advertised` marker. Read standard Tool
  `annotations` for behavior hints and namespaced `_meta["dysflow/workflow"]`
  for `phases`, `preferredFor`, and `status`. Use
  `bootstrap({phase:"<phase>"}).preferredAgentWorkflows` to select the phase,
  then call `describe_tool({name})` only for the tools about to run. Metadata
  guides selection; the full schema and `describe_tool` remain authoritative
  for parameters, composition constraints, result contracts, and errors.

- **HR-13 — Parse MCP envelopes defensively.** Every dysflow response carries
  top-level `schemaVersion:"dysflow.result/v1"`. A host wrapper may return the
  entire envelope as a JSON string, so parse once when `typeof raw === "string"`
  and then require the discriminator. Missing or different `schemaVersion`
  fails closed; never continue by guessing a payload shape.

- **HR-13.1 — Prefer structured payloads over summaries.** Hosts may place a
  bounded summary in `content[0].text` while preserving the complete result in
  `structuredContent`. For semantic audits and schema-derived verification,
  consume `structuredContent` first; use text only when it is the complete
  payload. Never audit the truncation summary as though it were the contract.

- **HR-14 — Bindings vacíos en `.form.txt` no son bug; son formularios desatendidos.**
  When `analyze_form_ui({sourcePath})` returns empty `bindings[]` for a form, the
  IR is telling the truth: the `ControlSource` / `RowSource` are not declared as
  properties on the controls, they are assigned in runtime code (typically inside
  `Form_Open` / `Form_Load` of the sibling `.cls`). Before opening the `.form.txt`
  with `Read` to "find" missing bindings, verify the form is not an unattended form
  — the source of truth is the `.cls`, not the `.form.txt`. Route through
  `map_form_behavior` (with `autoFetchCodeGraph:true`) for the real handler call
  path, or `verify_form_bindings` for typed schema validation. See AP-12 and the
  `access-form-ui-builder` skill §"Forms desatendidos".

## 3. Workflow loop (canonical 8 steps)

For any feature that touches dysflow-managed artifacts:

- **Step 0** — `bootstrap({})`. Capture `adapterVersion`, the write gates,
  `writeExecutionPolicy`, `toolInventory`, `humanCompilePending`, and the
  preferred workflow. Route through `schema({view:"index"})`; then call
  `get_capabilities({view:"compact",include:[...]})` or `{view:"full"}` only
  for the exact deeper fields needed (`effectiveDryRunDefault`,
  `projectConfig.status`, `projectConfig.writeReady`, and so on).
  If status is `missing`, bootstrap with explicit `cwd`, `projectId`, and
  `frontendFile` through `setup_project` before any other write-class tool,
  then re-run `resolve_project` and `get_capabilities` with the same `cwd`.
- **Step 0.25** — Read the bootstrap `preferredAgentWorkflows`, choose the
  active phase, and inspect only relevant callable tools through
  `describe_tool` (HR-12).
- **Step 0.5** — If `resolve_project` is ambiguous, follow HR-11 and wait for
  the human choice before any write-class dispatch.
- **Step 1** — Test FIRST. New feature → write `Test_<Feature>.bas` in
  `src/modules/` + entry in `tests/tests.vba.json`. Change → identify the
  failing test or write one.
- **Step 2** — Production code. Write `<Feature>.bas` in `src/modules/`.
- **Step 3** — Pre-compile audit. Declarations at top, no VBA landmines,
  signature consistency, binary in sync (`verify_code`).
- **Step 4** — Sync forms if applicable. `verify_code`.
- **Step 5** — Import. `import_modules({moduleNames:[...], apply:false})` →
  review the plan → `import_modules({moduleNames:[...], apply:true})`.
  Never pass the removed `compile` parameter; HR-1 applies.
- **Step 6** — Notify the user to compile manually. Block. Wait for "ya está".
- **Step 7** — Run tests. `test_vba({testsPath:"tests/tests.vba.json"})`. On
  failure → read failure reports + `run.logs`, fix, return to Step 3.
- **Step 8** — Analyze and refactor. Refactor-safety: a behavior-preserving
  refactor MUST NOT break tests. If it does, the test is the defect.

For sync-binary one-shots prefer `sync_binary` over the manual loop. For UAT bridge
load `access-vba-e2e-methodology`.

## 4. Companion skills to load (matrix)

| When you are... | Load this skill FIRST |
|---|---|
| Calling any dysflow tool | `dysflow-usage` (canonical tool / flag / error tables) |
| Writing or reviewing VBA | `vba-access` (MS best practices + Telefónica D&S) |
| Implementing a feature with TDD | `access-vba-tdd-loop` (§8 8-step loop) |
| Writing test atoms | `access-vba-tdd-fundamentos` (§1 rules, §2 JSON contract) |
| Setting up sandbox / test env | `access-vba-tdd-sandbox` (§3 `m_TestingMode`, §5 isolation, §7 safety) |
| Diagnosing test quality / coverage | `access-vba-tdd-quality` (§4 quality, §6 telemetry) |
| Bridging TDD ↔ UAT | `access-vba-e2e-methodology` |
| Working on forms (perceive→act→verify) | `access-form-ui-builder` |
| Syncing source ↔ binary one-shot | `vba-binary-sync` |
| Documenting capabilities (SDD-grade) | `access-vba-capability-docs` |
| Detected runtime drift, skills disagree | `dysflow-codegraph-update` (MAINTENANCE — not for daily work) |
| Hit OpenCode Code Mode JSON-wrapping bug | `dysflow-usage` §"Code Mode JSON-wrapping workaround" |

## 5. Anti-patterns (forbidden actions)

- **AP-1** — `Stop-Process -Name MSACCESS` (any variant). See HR-2.
- **AP-2** — `compile_vba` or `compile:true` on `import_modules` / `import_all`. See HR-1.
- **AP-3** — Using a legacy flag as the primary commit contract. The live
  registry reports `canonicalCommitFlag:"apply"` for EVERY advertised tool —
  `test_vba` included, which was the last holdout. Use `apply:true` to commit
  and `apply:false` to preview. `diff` is the only live compatibility alias,
  and only for export tools when `legacyAliases[]` reports it; never hard-code an alias
  as canonical, and never assume a tool is the exception — read the registry.
- **AP-4** — Omitting explicit export intent. The live registry reports
  `defaultBehavior:"plan"`; still pass `apply:true` or `apply:false` explicitly in agent-authored calls.
  `export_modules` uses a disposable binary copy by default;
  `mutateBinary:true` is legacy opt-in only.
- **AP-5** — Editing production `.accdb` or bypassing the `allowWrites` gate. See HR-3.
- **AP-6** — Adding test names to `.dysflow/project.json` allowlist on each fix. See HR-6.
- **AP-7** — Mocking to skip a real integration test. Fakes isolate LOGIC from
  DATA; never serve to skip the data-layer E2E.
- **AP-8** — Mutating `TbConfiguracionBackends` from test code. Config table is
  production state; tests READ it once via `BeginTestSession`, never WRITE.
- **AP-9** — `Debug.Print` / `MsgBox` in test atoms. `Debug.Print` is invisible
  to COM; `MsgBox` blocks unattended execution.
- **AP-10** — `DELETE` without `WHERE` (even in sandbox). Use `TEST_ID_BASE`
  (900000+) as guard for fixture cleanup.
- **AP-11** — Claiming "TDD-green" without BOTH user-confirmed compile AND
  all-green `test_vba` result.

- **AP-12 — Reading `.form.txt` with `Read` to extract bindings that
  `analyze_form_ui` reported empty.** The IR is not lying: empty `bindings[]`
  on an unattended form means the `ControlSource` / `RowSource` are assigned at
  runtime inside `Form_Open` / `Form_Load` of the sibling `.cls`. The canonical
  recipe is: (1) `map_form_behavior({sourcePath, autoFetchCodeGraph:true,
  outputMode:"full"})` to trace the real handler call path through codegraph-vba;
  (2) `verify_form_bindings({sourcePath, schema, outputMode:"full"})` to
  validate the runtime-assigned bindings against the real schema with typed
  findings (`FORM_BINDING_MISSING_TABLE` / `FORM_BINDING_MISSING_COLUMN`);
  (3) only if codegraph is stale, grep the `.cls` for
  `Me\.\w+\.(RowSource|ControlSource)\s*=` scoped to `Form_Open` /
  `Form_Load`. Hand-parsing the `.form.txt` for `ControlSource =` is the wrong
  shape for this form style and leads to false "missing binding" reports. See
  the `access-form-ui-builder` skill §"Forms desatendidos".

## 6. Companion depth layer (where detail lives)

The arnés is the LEAN pointer. Depth lives in:

- `../dysflow-codegraph-update/references/procedure.md` — release-maintenance
  depth and candidate-runtime audit procedure.
- Repository `AGENTS.md` — the byte-equal embedded harness plus project rules.
- `dysflow-usage` skill — canonical tool names, flags, defaults, error codes.
- `access-vba-tdd-*` skills — TDD discipline details.
- `access-vba-e2e-methodology` — TDD ↔ UAT bridge.

## 7. Memory (dysflow-specific)

The runtime (`get_capabilities`) IS the memory. Do NOT cache tool names,
write-flags, plan defaults, or error codes across sessions.
Re-fetch at session start and after any `adapterVersion` bump.

Engram IS useful for project-level facts (sandbox URLs, project conventions,
user preferences) — NOT for the runtime surface.

## 8. Delegation

dysflow does NOT spawn sub-agents. You call tools directly. If isolation is
needed (long test run, parallel investigation), use the host agent's
delegation mechanism — do NOT invent dysflow-specific delegation.

## 9. Codegraph guidance

For repo maps, architecture, call flow, dependencies, symbol references,
impact analysis, "how does X work" — use codegraph-vba MCP (and/or generic
CodeGraph tooling) BEFORE broad Read/Glob/Grep filesystem exploration.
Initialize on real project roots; never in `$HOME`, `/tmp`, or non-project
folders. `codegraph_sync` only when the watcher is disabled or files fail
to self-refresh; `codegraph_uninit` is destructive and reserved for explicit
user request.

## 10. Version + authorship

dysflow harness v1.0.0 · last_verified 2026-08-26 · requires
dysflow MCP >= 3.0 · author: Andrés Román · license: Apache-2.0

Source of truth: live `bootstrap` plus explicit schema/capability views. If this arnés disagrees with
runtime, **runtime wins**; surface the drift and update via
`dysflow-codegraph-update`.
<!-- /dysflow:arnés -->
