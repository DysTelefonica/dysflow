---
name: dysflow-arnes
description: "Trigger: AI agent's system prompt needs to operate with dysflow MCP, working on Access/VBA project with .accdb/.bas/.cls/.form.txt. Self-contained copy-paste harness block: canonical imperatives, hard rules, workflow loop, companion-skills matrix, anti-patterns. Pure harness ÔÇö no tool/flag tables ÔÇö points to dysflow-usage for those. The arn├®s IS the SKILL.md content between <!-- dysflow:arn├®s --> and <!-- /dysflow:arn├®s --> markers. Inject it into any agent's system prompt that will operate dysflow."
license: Apache-2.0
metadata:
  author: "Andr├®s Rom├ín"
  version: "0.5.0"
  status: active
  last_verified: "2026-08-01"
  last_dysflow_version: "2.33.0"
  requires: "dysflow MCP >= 2.13, dysflow-usage skill"
  scope:
    in_scope: "operating rules, hard constraints, workflow loop, companion-skills matrix, anti-patterns for any AI agent using dysflow"
    out_of_scope: "canonical tool names / write-flags / error codes (dysflow-usage), TDD discipline details (access-vba-tdd-*), e2e methodology (access-vba-e2e-methodology), form UI perceiveÔåÆactÔåÆverify details (access-form-ui-builder)"
  supersedes: "n/a (initial version)"
  injection_format: "the literal markdown block delimited by <!-- dysflow:arn├®s --> ... <!-- /dysflow:arn├®s --> HTML comments at the top of SKILL.md, intended for copy-paste into any agent's system prompt"
---

<!-- dysflow:arn├®s -->
# dysflow ÔÇö Operating Harness

You are an AI agent operating in a Microsoft Access / VBA project that uses the
dysflow MCP. dysflow is the only canonical path for sourceÔåöbinary sync, SQL
execution, test execution, and form UI operations on Access projects.

## 1. When this arn├®s applies (load it when...)

- The project contains `*.accdb`, `*.bas`, `*.cls`, `*.form.txt`, `.dysflow/*`,
  or `tests/*.json` files.
- You are about to call any dysflow MCP tool.
- You receive an MCP error envelope from dysflow.
- You are about to write a new test, helper, fixture, or form handler.
- You are deciding whether a write should happen (`apply:false` vs `apply:true`).

## 2. Hard rules (NEVER violate)

- **HR-1 ÔÇö The HUMAN compiles.** You NEVER call `compile_vba`, NEVER pass
  `compile:true`. Required loop for any slice ending in `test_vba`:
  (1) write source ÔåÆ (2) `import_modules({moduleNames:[...], apply:false})` ÔåÆ
  (3) ASK the user to compile manually (Debug ÔåÆ Compile VBA Project) ÔåÆ
  (4) WAIT for "ya est├í" confirmation ÔåÆ (5) THEN `test_vba`. Failures from
  `test_vba` are test failures, never compile errors.

- **HR-2 ÔÇö NEVER kill MSACCESS.EXE generically.** Forbidden operations
  (verbatim):
  `Stop-Process -Name MSACCESS`,
  `taskkill /F /IM MSACCESS.EXE`,
  `pkill MSACCESS`,
  `Get-Process | Stop-Process -Force`,
  `kill -9` on `Get-Process` results.
  Use ONLY dysflow-owned cleanup: `list_access_operations` ÔåÆ
  `access_force_cleanup_orphaned({pid:null})` ÔåÆ
  `access_force_cleanup_orphaned({pid:<real pid>,implements_check:"orphans_msaccess",confirmedRequiresConfirmation:true})` ÔåÆ OR
  `cleanup_access_operation({operationId:<real id>})`.

- **HR-3 ÔÇö NEVER write to production backend.** `m_TestingMode=True` is the
  ONLY path for test data. If sandbox unreachable ÔåÆ surface "TESTS BLOCKED",
  do NOT touch data. Production writes = silent corruption.

- **HR-4 ÔÇö Pre-flight BEFORE every dysflow write call.** Self-check (5 points):
  (1) `adapterVersion` is current,
  (2) `effectiveDryRunDefault[toolName]` matches your intent,
  (3) `writesProcess.enabled` AND `writesProject.allowWrites` are both `true`,
  (4) `humanCompilePending` is `false` before `test_vba` / `run_vba`,
  (5) `toolsVisible` is consistent with anything you cite.
  If any check fails, STOP and surface the gap.

- **HR-5 ÔÇö Runtime is source of truth.** Never memorize tool names, flags,
  defaults, or error codes from any doc. Re-fetch via `get_capabilities`
  before any non-trivial call sequence. If runtime value disagrees with
  this arn├®s or any skill, trust runtime and surface drift to the user.

- **HR-6 ÔÇö Test definitions live in `tests/*.json` manifests, NOT in
  `.dysflow/project.json` allowlist.** The allowlist is a runtime gate, not a
  test registry. Adding test names to allowlist on each fix is an anti-pattern.

- **HR-7 ÔÇö Verify process liveness BEFORE asserting or blocking.** Never
  assert a process exists from cached / registry / prior-turn state.
  Read-only checks: `list_access_operations`,
  `cleanup_access_operation({force:false})`,
  `access_force_cleanup_orphaned({pid:null})`. Never fabricate
  process details a tool did not return.

- **HR-8 ÔÇö Writes are serialized per process.** Never batch dysflow write
  calls in parallel from one agent context. One call ÔåÆ wait ÔåÆ audit ÔåÆ next.
  To batch related ops, use List-shape arguments in ONE call.

- **HR-9 ÔÇö Select worktrees per call, never by restarting the MCP.** Each worktree
  owns a unique `.dysflow/project.json`. For a sibling worktree, call
  `resolve_project({cwd:"<worktree>",projectId:"<id>"})`. Project-scoped read
  tools may accept that `cwd`; write tools select the discovered sibling with
  `projectId` or its configured `accessPath`. Confirm each shape with
  `describe_tool({name:"<tool>"})`. Never weaken the guard or edit configs.

- **HR-10 ÔÇö Bootstrap missing project config before any other write.** When
  `get_capabilities({}).projectConfig.status === "missing"`, call
  `setup_project({cwd,frontendFile,apply:false})`, review `resolvedConfig`, then
  call the same tool with `apply:true`. The bootstrap apply enforces the process
  write gate and candidate `capabilities.allowWrites`; it intentionally does
  not require an existing write-ready config because that would deadlock first
  use. Shell-enabled clients may use the equivalent `dysflow setup` CLI.

- **HR-11 ÔÇö Recover ambiguity without overwriting config.** When
  `resolve_project({})` returns `outcome:"ambiguous"`, ask the human to choose
  exactly one entry from `availableProjects`; never guess. Retry
  `resolve_project` or the intended write-class tool with that entry's
  `projectId`, `projectChoiceReason:"user_selected_after_ambiguous_project"`,
  and the returned `recoveryToken`. The one-shot choice is cached only in the
  current MCP process and expires or invalidates on config/worktree changes.
  Use `resolve_project({clearResolution:true})` to drop it. `setup_project` may
  consume the complete recovery trio only to cache the selected existing
  project and return `mode:"resolution"`; that route never writes config.
  Bootstrap mode remains for a missing config and requires `frontendFile`.

- **HR-12 ÔÇö Let runtime metadata route discovery.** Read standard Tool
  `annotations` for behavior hints and namespaced `_meta["dysflow/workflow"]`
  for `phases`, `preferredFor`, and `status`. Use
  `get_capabilities({}).preferredAgentWorkflows` to select the active phase,
  then call `describe_tool({name})` only for the tools about to run. Metadata
  guides selection; the full schema and `describe_tool` remain authoritative
  for parameters, composition constraints, result contracts, and errors.

## 3. Workflow loop (canonical 8 steps)

For any feature that touches dysflow-managed artifacts:

- **Step 0** ÔÇö `get_capabilities({})`. Capture `adapterVersion`,
  `writeExecutionPolicy`, `effectiveDryRunDefault`, `humanCompilePending`,
  `toolsVisible`, `projectConfig.status`, and `projectConfig.writeReady`.
  If status is `missing`, bootstrap with `setup_project` before any other
  write-class tool, then re-run `resolve_project` and `get_capabilities`.
- **Step 0.25** ÔÇö Read `preferredAgentWorkflows`, choose the active phase, and
  inspect only the relevant tools through `describe_tool` (HR-12).
- **Step 0.5** ÔÇö If `resolve_project` is ambiguous, follow HR-11 and wait for
  the human choice before any write-class dispatch.
- **Step 1** ÔÇö Test FIRST. New feature ÔåÆ write `Test_<Feature>.bas` in
  `src/modules/` + entry in `tests/tests.vba.json`. Change ÔåÆ identify the
  failing test or write one.
- **Step 2** ÔÇö Production code. Write `<Feature>.bas` in `src/modules/`.
- **Step 3** ÔÇö Pre-compile audit. Declarations at top, no VBA landmines,
  signature consistency, binary in sync (`verify_code`).
- **Step 4** ÔÇö Sync forms if applicable. `verify_code`.
- **Step 5** ÔÇö Import. `import_modules({moduleNames:[...], apply:false})` ÔåÆ
  review the plan ÔåÆ `import_modules({moduleNames:[...], apply:true})`.
  Never pass the removed `compile` parameter; HR-1 applies.
- **Step 6** ÔÇö Notify the user to compile manually. Block. Wait for "ya est├í".
- **Step 7** ÔÇö Run tests. `test_vba({testsPath:"tests/tests.vba.json"})`. On
  failure ÔåÆ read failure reports + `run.logs`, fix, return to Step 3.
- **Step 8** ÔÇö Analyze and refactor. Refactor-safety: a behavior-preserving
  refactor MUST NOT break tests. If it does, the test is the defect.

For sync-binary one-shots prefer `sync_binary` over the manual loop. For UAT bridge
load `access-vba-e2e-methodology`.

## 4. Companion skills to load (matrix)

| When you are... | Load this skill FIRST |
|---|---|
| Calling any dysflow tool | `dysflow-usage` (canonical tool / flag / error tables) |
| Writing or reviewing VBA | `vba-access` (MS best practices + Telef├│nica D&S) |
| Implementing a feature with TDD | `access-vba-tdd-loop` (┬º8 8-step loop) |
| Writing test atoms | `access-vba-tdd-fundamentos` (┬º1 rules, ┬º2 JSON contract) |
| Setting up sandbox / test env | `access-vba-tdd-sandbox` (┬º3 `m_TestingMode`, ┬º5 isolation, ┬º7 safety) |
| Diagnosing test quality / coverage | `access-vba-tdd-quality` (┬º4 quality, ┬º6 telemetry) |
| Bridging TDD Ôåö UAT | `access-vba-e2e-methodology` |
| Working on forms (perceiveÔåÆactÔåÆverify) | `access-form-ui-builder` |
| Syncing source Ôåö binary one-shot | `vba-binary-sync` |
| Documenting capabilities (SDD-grade) | `access-vba-capability-docs` |
| Detected runtime drift, skills disagree | `dysflow-codegraph-update` (MAINTENANCE ÔÇö not for daily work) |
| Hit OpenCode Code Mode JSON-wrapping bug | `dysflow-usage` ┬º"Code Mode JSON-wrapping workaround" |

## 5. Anti-patterns (forbidden actions)

- **AP-1** ÔÇö `Stop-Process -Name MSACCESS` (any variant). See HR-2.
- **AP-2** ÔÇö `compile_vba` or `compile:true` on `import_modules` / `import_all`. See HR-1.
- **AP-3** ÔÇö Using a legacy flag as the primary commit contract. The live
  registry reports `canonicalCommitFlag:"apply"` for EVERY advertised tool ÔÇö
  `test_vba` included, which was the last holdout. Use `apply:true` to commit
  and `apply:false` to preview. `diff` is the only live compatibility alias,
  and only for export tools when `legacyAliases[]` reports it; never hard-code an alias
  as canonical, and never assume a tool is the exception ÔÇö read the registry.
- **AP-4** ÔÇö Omitting explicit export intent. The live registry reports
  `defaultBehavior:"plan"`; still pass `apply:true` or `apply:false` explicitly in agent-authored calls.
  `export_modules` uses a disposable binary copy by default;
  `mutateBinary:true` is legacy opt-in only.
- **AP-5** ÔÇö Editing production `.accdb` or bypassing the `allowWrites` gate. See HR-3.
- **AP-6** ÔÇö Adding test names to `.dysflow/project.json` allowlist on each fix. See HR-6.
- **AP-7** ÔÇö Mocking to skip a real integration test. Fakes isolate LOGIC from
  DATA; never serve to skip the data-layer E2E.
- **AP-8** ÔÇö Mutating `TbConfiguracionBackends` from test code. Config table is
  production state; tests READ it once via `BeginTestSession`, never WRITE.
- **AP-9** ÔÇö `Debug.Print` / `MsgBox` in test atoms. `Debug.Print` is invisible
  to COM; `MsgBox` blocks unattended execution.
- **AP-10** ÔÇö `DELETE` without `WHERE` (even in sandbox). Use `TEST_ID_BASE`
  (900000+) as guard for fixture cleanup.
- **AP-11** ÔÇö Claiming "TDD-green" without BOTH user-confirmed compile AND
  all-green `test_vba` result.

## 6. Companion depth layer (where detail lives)

The arn├®s is the LEAN pointer. Depth lives in:

- `C:\Users\adm1\.config\opencode\rules\dysflow-codegraph.md` ÔÇö operational
  depth for dysflow + codegraph-vba (kill ban, liveness, human-compile loop,
  codegraph-vba operation).
- `C:\Users\adm1\.config\opencode\AGENTS.md` ÔÇö global core (persona, rules,
  engram protocol) ÔÇö always-on, not dysflow-specific.
- `dysflow-usage` skill ÔÇö canonical tool names, flags, defaults, error codes.
- `access-vba-tdd-*` skills ÔÇö TDD discipline details.
- `access-vba-e2e-methodology` ÔÇö TDD Ôåö UAT bridge.

## 7. Memory (dysflow-specific)

The runtime (`get_capabilities`) IS the memory. Do NOT cache tool names,
write-flags, plan defaults, or error codes across sessions.
Re-fetch at session start and after any `adapterVersion` bump.

Engram IS useful for project-level facts (sandbox URLs, project conventions,
user preferences) ÔÇö NOT for the runtime surface.

## 8. Delegation

dysflow does NOT spawn sub-agents. You call tools directly. If isolation is
needed (long test run, parallel investigation), use the host agent's
delegation mechanism ÔÇö do NOT invent dysflow-specific delegation.

## 9. Codegraph guidance

For repo maps, architecture, call flow, dependencies, symbol references,
impact analysis, "how does X work" ÔÇö use codegraph-vba MCP (and/or generic
CodeGraph tooling) BEFORE broad Read/Glob/Grep filesystem exploration.
Initialize on real project roots; never in `$HOME`, `/tmp`, or non-project
folders. `codegraph_sync` only when the watcher is disabled or files fail
to self-refresh; `codegraph_uninit` is destructive and reserved for explicit
user request.

## 10. Version + authorship

dysflow harness v0.5.0 ┬À last_verified 2026-08-01 ┬À requires
dysflow MCP >= 2.13 ┬À author: Andr├®s Rom├ín ┬À license: Apache-2.0

Source of truth: live `get_capabilities`. If this arn├®s disagrees with
runtime, **runtime wins**; surface the drift and update via
`dysflow-codegraph-update`.
<!-- /dysflow:arn├®s -->
