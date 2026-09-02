# AGENTS.md — dysflow

Canonical guide for **any** agent working in this repo — Claude Code, OpenCode/Codex, or otherwise.
This file is authoritative. Claude Code loads it via `CLAUDE.md` (which imports this file). Read it
before working, and do not silently override it.

## Dysflow & VBA Skill Catalog

This section embeds the literal operating arnés from `dysflow-arnes/SKILL.md` so any agent with read access to this repo can operate dysflow without an extra skill load. The block between `<!-- dysflow:arnés --> ... <!-- /dysflow:arnés -->` is verbatim from the canonical source — do not edit content inside it; updates propagate through `dysflow-codegraph-update` ARN-1 → ARN-2.

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

- **HR-15 — Gate `verify_code` on actionability, never compact-count
  guesswork.** Read `actionableOk` and `recommendedAction`; raw `ok` can be
  false for non-actionable noise. `summaryByCategory` and
  `nonActionableByCategory` are aggregate counts and do not identify module
  membership. Use one whole-scope `diagnostic:true` call and read
  `actionableDifferent[]` / `nonActionableDifferent[]` when names matter.
  One logical Access form/report may emit separate `.cls` and `.form.txt`
  entries, classified independently. Identifier-only `caseOnly` drift is
  non-actionable; strings and comments remain case-sensitive.

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

- **AP-13 — Assigning compact `verify_code` category totals to named
  modules.** Compact category maps are aggregate counts, not membership lists.
  Do not correlate them with log order, requested names, or another array. Use
  `diagnostic:true` once for the full scope and read the classified
  `actionableDifferent[]` / `nonActionableDifferent[]` entries.

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
### Project-context (this worktree, NOT inside the canonical block)

- `m_BackendSandboxURL` — TODO: fill against a real `tests/*.json` manifest run.
- `Variables Globales.bas` path — TODO: locate in this worktree's `src/` before any test.
- Drift window: any update to the marker-delimited block in `dysflow-arnes/SKILL.md` must propagate here via `dysflow-codegraph-update` ARN-1 → ARN-2 → re-embed.

## What this is

dysflow — a TypeScript **MCP + CLI runtime** that drives Microsoft Access (VBA sync, query tools,
the Access runner) through PowerShell scripts. Architecture is **hexagonal / clean**:

- `src/core` — domain and use cases (no dependency on adapters).
- `src/adapters` — MCP, HTTP, vba-sync, and the I/O boundaries.
- `src/cli` — command surface.

A `.codegraph/` index at the repo root holds a SQLite-backed symbol + call-path graph for the
whole tree. When exploring or before editing, prefer the `codegraph-vba` MCP tool's
`codegraph_explore` (pass `projectPath: "C:\Proyectos\dysflow"`) over `Read`/`Grep`/`Glob` —
it returns the relevant symbols' line-numbered source + the call paths between them in one call,
and includes dynamic-dispatch hops that grep cannot follow. See the "Hard rules" section for
maintenance triggers and re-index command.

## Testing — READ THIS BEFORE WRITING ANY TEST

The authoritative testing criterion lives in **[`docs/testing/testing-philosophy.md`](./docs/testing/testing-philosophy.md)**.
Read it. The essence:

- **North star: a test must survive any internal refactor that preserves observable behavior.**
  If a behavior-preserving refactor turns the suite red, the test is the defect — fix the test.
- The real axis is **behavior vs implementation**, not unit vs e2e.
- **Test at the ports.** Exercise real domain/use-case logic; mock ONLY the I/O adapters
  (Access COM / PowerShell spawn, filesystem, network). Never assert on internal call order,
  private collaborators, or internal data shape.
- **Coverage is a diagnostic floor, not a target** (see
  [`docs/testing/repo-quality-gates.md`](./docs/testing/repo-quality-gates.md)). Never add an
  implementation-coupled test just to move a coverage number.

Commands:
- Unit/spec: `pnpm test` (`vitest.config.ts`).
- Integration/E2E: `vitest.integration.config.ts` (`test/e2e/**`, `test/integration/**`) — requires Windows + Access COM.
- Real MCP E2E: `node E2E_testing/mcp-e2e.mjs` (requires `ACCESS_VBA_PASSWORD`).

## Documentation ownership — keep docs with the change

A doc that describes behavior which no longer exists is worse than no doc, because an agent will act on it.

The CI gate validates **shape**: headings, paragraph length, links, naming. It leaves **semantic accuracy to human review**.

Nothing else catches a stale claim — see [documentation quality gates](./docs/testing/documentation-quality-gates.md). That is what this section is for.

- **Docs ship with the change that makes them true.** A user-visible behavior change and its documentation belong in the same PR, never a follow-up. A new flag, environment variable, or error code is documented in the commit that introduces it.
- **Removing a capability is a documentation change.** Record it in [absent by design](./docs/architecture/absent-by-design.md) naming the release that removed it, so nobody reintroduces it or files its absence as a defect.
- **Claims name their evidence.** A statement about this repository carries the path that proves it, or the boundary that bounds it. A claim with neither is an opinion: delete it or prove it.

### What changed maps to what you update

| When you change... | Update | Anchored by |
|---|---|---|
| An MCP tool name, parameter, or result contract | [MCP tool reference](./docs/api/mcp-tools.md) | `test/docs/mcp-readme-tool-surface.test.ts` |
| Where a new MCP tool must be registered | [Adding an MCP tool](./docs/api/adding-an-mcp-tool.md) | `test/docs/add-a-tool-checklist-1493.test.ts` |
| An HTTP route or its status mapping | [HTTP API](./docs/api/http-api.md) | `test/docs/http-api-doc.test.ts` |
| A core/adapter boundary or dependency rule | [Core and adapters](./docs/architecture/dysflow-core-and-adapters.md) | `test/docs/architecture-doc.test.ts` |
| A write gate, cleanup path, or the update mechanism | [Update trust model](./docs/security/update-trust-model.md) | `test/docs/security-doc-anchors.test.ts` |
| An install channel, its gate, or its verification | [Installation channels](./docs/installation-channels.md) | `test/docs/readme-release-doc.test.ts` |
| A write-tool pre-flight schema | Skill examples under `skills/dysflow-usage/` | `test/docs/write-tool-preflight.test.ts` |
| The form/report serialization noise floor | `src/core/services/form-noise-keys.ts` and the `stripFormSerializationNoise` docstring | `test/docs/form-noise-keys-docstring-1686.test.ts` |
| Install, project config, or an environment variable | [Setup](./docs/SETUP.md) | not anchored — review by hand |
| A capability that stops existing | [Absent by design](./docs/architecture/absent-by-design.md) | not anchored — review by hand |

### Doc-anchor tests

`test/docs/` turns a documentation claim into an executable assertion. Add one when a doc states something the runtime can contradict.

**Anchor against the runtime, not against a string.** A test that greps for a literal sentence only catches deletion. A test that compares the doc against the live surface catches drift.

Thirteen anchors do the second kind today:

- `add-a-tool-checklist-1493.test.ts` imports every hand-maintained tool registry and compares each against the live advertised surface, so a tool registered in one place and forgotten in another fails the suite.
- `agent-friction-examples-1614.test.ts` derives the callable MCP surface from the runtime and checks that each friction family links concrete live tools and complete examples.
- `architecture-doc.test.ts` imports the VBA import orchestrator and proves the documented rollback and save-only decisions against the live core service.
- `dysflow-usage-examples-1611.test.ts` derives the advertised MCP tool set from the runtime and proves each tool has a canonical example file.
- `example-input-properties-contract.test.ts` derives advertised tool schemas from the runtime and checks exact scaffold input-property parity.
- `form-noise-keys-docstring-1686.test.ts` iterates the live `FORM_NOISE_KEYS` set and requires the `stripFormSerializationNoise` docstring to strip every member and retain none of them, so a key added to the set without revising the prose fails here.
- `mcp-readme-tool-surface.test.ts` imports `createDysflowMcpTools` and compares the inventory against the live `tools/list` surface.
- `project-config-removed-fields-contract-1580.test.ts` invokes the project-config loader and checks that operator docs describe its typed rejection and canonical replacements.
- `readme-release-doc.test.ts` reads the installer source for the insecure-update gate variable and requires the README and the trust model to name the one the installer actually enforces, so renaming it in code fails until both documents follow.
- `resolve-project-recovery-example.test.ts` validates a documented payload against the live input schema.
- `verify-code-diagnostic-contract-1535.test.ts` compares the documented compact/diagnostic response split against the live `verify_code` schema and MCP response shaper.
- `verify-code-noise-categories-1669.test.ts` derives the non-actionable category keys from the live MCP response shaper and requires the tool reference and the skill example to name every one, then proves the documented indentation verdict against the live classifier.
- `write-tool-preflight.test.ts` reads the MCP schema source.

Every other anchor pins a literal string. Asserting that a doc merely *contains* a source path is a string anchor, not a runtime anchor.

Prefer that shape whenever the code can enumerate what the doc claims.

## VBA semantic diff — behavioral contract

`verify_code` (the single source/binary compare tool) runs in **semantic mode** by default. The job
is to keep `actionableDifferent` honest: a consuming agent decides what to sync based on it, so
non-functional noise must NEVER be reported as actionable. Full taxonomy lives in the README
([Semantic diff classification](./README.md#semantic-diff-classification)); the core is
`src/core/services/vba-semantic-classifier.ts`. Invariants — preserve them when editing:

- **Bias to functional.** When in doubt, classify as actionable. Only collapse a difference to a
  non-actionable category when you are certain it cannot change runtime behavior.
- **Case is non-functional only outside strings/comments.** VBA is case-insensitive for
  identifiers/keywords and the VBE re-cases them on import (`caseOnly`). Folding is **string-aware**:
  string-literal and comment bodies are compared case-sensitively, because their content is
  runtime-visible. Never fold the whole line blindly.
- **A category must name the difference it folded.** Actionability is not the whole contract: an
  agent reads `classification`/`reason` to decide whether the drift is worth a human's attention, so
  a bucket that mislabels the noise is a defect even when `actionable` is already `false`. Leading
  indentation is folded as `whitespaceOnly` for code modules (`.bas`/`.cls`/`.frm`) BEFORE the
  case-folding step, never as `caseOnly` (#1669). Form/report serialization keeps its indentation —
  `normalizeLeadingWhitespace` is a no-op outside code file types.
- **Lossy encoding (`►` → `?`) is `encodingOnly` outside string literals only.** A glyph change
  inside a quoted string stays functional.
- **A leading BOM / mojibake-BOM (`?Attribute VB_Name…`, U+FEFF, U+FFFD) on one side is stripped**
  before comparison — it is never functional. But a `VB_Name` VALUE change (e.g. `MigracionIssue18`
  vs `ModuloMigracionIssue18`) MUST stay actionable; only the leading marker is stripped, never the
  name itself.
- **Module/class header boilerplate is non-functional**: `Attribute VB_*` lines (in code modules
  AND a form's embedded `CodeBehindForm`) and the `VERSION x.x CLASS` + `BEGIN…END` instancing block
  are stripped — an Access export may emit them on one side only. `VB_Name` is the exception: it is
  functional whenever the two sides disagree — a real rename (both name it, values differ) OR one
  side omitting it entirely (a dropped-identity import defect, #646); non-functional only when both
  carry the same name or both omit it. A `.frm` starts with `VERSION 5.00` and a control `Begin…End`
  tree — that is functional and must NOT be stripped; only `VERSION <num> CLASS` headers are.
- **A form's code-behind is verified through its `forms/*.cls`, NOT its `.form.txt`.** The code lives
  canonically in the `.cls` (export writes it from `CodeModule.Lines`; import syncs it back into the
  document module). The `.form.txt` `CodeBehindForm` section is the same code serialized a second way
  (`SaveAsText`), so the classifier strips everything from `CodeBehindForm` onward and compares a
  `.form.txt` for its **UI/layout only**. Never compare form code-behind through the `.form.txt` — it
  double-counts and re-imports the serialization noise the `.cls` already owns.
- **Form serialization noise is an allow-list** (`Checksum`, `PrtDevMode*`, `PrtDevNames*`,
  `PrtMip`, `RecSrcDt`, `LayoutCached*`, `PublishOption`, `NoSaveCTIWhenDisabled`). `GUID` is
  functional — do not strip it. Unknown keys are retained (functional).
- **Toggle-property serialization is equivalent**: `Visible =0` ≡ `Visible = NotDefault` ≡
  `Visible =-1`. Access only serializes a non-default value, so the written value is always the same
  and only its `NotDefault`/`0`/`-1` representation varies. This collapse is value-token scoped — a
  non-toggle value (`Width =9070`, `SomeEnum =2`) stays exact and functional.
- **Strict mode (`strict: true`) bypasses every noise bucket** and does byte/text-exact comparison.
- The AI-facing result contract is additive: keep `summaryStructured` counts,
  `bulkImportable[]`, `bulkExportable[]`, and per-entry `classification`/`reason` on both
  `actionableDifferent[]` and `nonActionableDifferent[]`. Agents plan sync from the bulk lists
  (`bulkImportable` → `import_modules.moduleNames`, `bulkExportable` → `export_modules.moduleNames`),
  not by parsing raw `different[]`; reserve `manual_merge` / `bothChanged` for conflicts.

## Hard rules

- **Never** build/install to or modify the production runtime at `%LOCALAPPDATA%\dysflow` or
  `~/.config/opencode/opencode.json` during development/testing. Build to the throwaway
  `test-runtime/` and point E2E at it with `DYSFLOW_E2E_COMMAND`.
- **The tag workflow is the sole heavy release E2E authority.**

  `.github/workflows/release.yml` runs `pnpm test:e2e:mcp:release` in its
  tag-triggered `e2e-validation` job. Publication depends on that job.

  Agents must not run it locally as a pre-tag gate. That duplicates the same
  expensive authority without controlling whether the GitHub Release publishes.
- Conventional commits. No AI co-author / attribution lines in commit messages.
- A GitHub release **title must equal its tag name exactly** (e.g. tag `v1.2.8` → title `v1.2.8`). Human edits
  are checked by `.github/workflows/release-title-guard.yml` (`release: [edited]`); the job fails when the two
  values differ and names both so a maintainer can restore the title in the GitHub UI. Creation is protected
  separately inside `release.yml`: softprops receives `name: ${{ github.ref_name }}` and the publishing job
  immediately validates the live release. The split is intentional because `GITHUB_TOKEN`-created releases
  do not reliably trigger another workflow.
- Keep business logic in `src/core`; never let domain logic leak into adapters.
- **Update path security is per channel, and `stable` is the only signed one.** `dysflow install`
  / `dysflow update` / `dysflow doctor` take `--channel {stable|beta|main}` (issue #1521),
  resolved as `--channel` -> `DYSFLOW_CHANNEL` -> the channel recorded in
  `<runtimeDir>/.dysflow-install-state.json` -> `stable`. Omitting the flag keeps every existing
  call shape on `stable`, unchanged.
  - `stable` (default, ungated): the GitHub Release tar.gz, verified by an Ed25519 signature over
    `SHA256SUMS` and then SHA-256 over the archive. Never weaken this path — the signature gate
    fails closed, and `--skip-checksum` remains a stable-only escape hatch that still requires
    `DYSFLOW_ALLOW_INSECURE_UPDATE=1`.
  - `beta` (gated): the newest published prerelease tag's release tar.gz, verified by SHA-256
    against the published `SHA256SUMS`. Prereleases are NOT covered by the trust anchor, so this
    channel is unreachable without `DYSFLOW_ALLOW_INSECURE_UPDATE=1`.
  - `main` (gated): `archive/refs/heads/main.tar.gz` — repository **source**, built locally with
    `pnpm install` + `pnpm build` to reproduce the release-tarball shape. **Unverified by design**:
    GitHub publishes no `SHA256SUMS` for a branch archive and its bytes are not reproducible, so
    there is nothing to verify against. This is the one source-build path in the product; it is an
    explicitly gated development channel, never reachable without
    `DYSFLOW_ALLOW_INSECURE_UPDATE=1`, and it is never a fallback for a failed `stable` update.
  - There is still NO git-clone update path, and no channel may silently substitute for another:
    the archive-traversal guard runs on every channel, and `update` refuses to move a runtime
    between channels without `--force`. See
    [`docs/security/update-trust-model.md`](./docs/security/update-trust-model.md).
- **`export_all` prune is destructive — preserve its guards.** When `prune: true`, deletions are
  gated on a fully clean export (skip on ANY warning), scoped to managed source extensions
  (`.bas`/`.cls`/`.form.txt`/`.report.txt`), keyed off the export's own `exported` list, and the
  saved-queries folder is never scanned. `prune` + `filter` is rejected (`INVALID_INPUT`) because a
  filtered export would make every non-matching file look orphaned. Never weaken these when editing
  `exportAllWithPrune` in `src/adapters/vba-sync/vba-modules-adapter.ts`. The legacy `.frm` binary
  form format is **not** in the managed allow-list — prune must leave `.frm` files alone, even when
  no matching VBE module exists. See issue #619.
- **CodeGraph is the canonical code-exploration tool. Use it instead of `Read`/`Grep`/`Glob` when
  you can.** The `.codegraph/` index at the repo root holds a SQLite-backed symbol + call-path graph
  for the whole tree. The `codegraph-vba` MCP server's `codegraph_explore` returns the relevant
  symbols' verbatim line-numbered source PLUS the call paths between them in one call — including
  dynamic-dispatch hops that `grep` cannot follow. Reach for it BEFORE `Read`/`Grep` when you
  need to understand or locate code, and reach for it BEFORE edits to verify a call path before
  changing it. The MCP tool has no default project — pass `projectPath: "C:\Proyectos\dysflow"`
  (or the equivalent absolute path) explicitly. Example query: `codegraph_explore({ query:
  "modulesAdapter.execute exportPath dispatch chain", maxFiles: 8, projectPath: "C:\\Proyectos\\dysflow" })`.
- **Keep the `.codegraph/` index fresh — re-run after every code change.** A stale index is a silent
  token sink: `codegraph_explore` answers return the OLD source, the agent reads the file again to
  "verify", and 3–5× the tokens are spent for no benefit. Re-index whenever you:
  - add, rename, or delete files
  - change exported function signatures, type definitions, or dispatch routes
  - touch the MCP layer (`src/adapters/mcp/**`)
  - merge a PR that lands in `main`
  The standard tool is the `codegraph` CLI bundled with the MCP server — run
  `codegraph index C:\Proyectos\dysflow` (or `codegraph init` for a fresh index). Index drift is a
  P2 process defect; if you notice `codegraph_explore` returning answers that don't match the
  current source, re-index immediately.
- **Never delete remote branches.** Once a branch is pushed to `origin`, the ref stays there for the
  life of the repo. The PR is the merge artifact; the branch is the history (other contributors may
  have referenced it, forks may have cloned it, CI may have cached artifacts against it). Concretely:
  - Never pass `--delete-branch` to `gh pr merge` — leave the flag off.
  - Never run `git push origin --delete <branch>` or `git push origin :<branch>`.
  - Never ask `gh` to clean up the remote ref on merge, close, or reopen.
  This applies to every branch type — `feat/*`, `fix/*`, `chore/*`, `docs/*`, `refactor/*` —
  including branches whose PR was already merged into `main`.
- **Do delete the local worktree once its PR has merged.** If the work happened in a git worktree,
  run `git worktree remove <path>` and then `git worktree prune`.
  - This is not optional tidiness: a stale worktree keeps an obsolete branch checked out on disk,
    and a later session that lands in it will happily commit to the wrong place.
  - The local branch may go with it (`git branch -d <local>`); the remote ref stays.
  - "Clean up the branch" after a merge means the worktree, never the remote ref.

## MCP workflow recipes

Use these recipes before calling individual MCP tools. They keep Access automation auditable,
recoverable, and aligned with the write-gate contract.

### Bootstrap / doctor / config verification

1. Confirm the repo has `.dysflow/project.json`; if it does not, ask the human for frontend/backend
   paths and run `dysflow setup --write-project --project-id <id> --access-path <frontend.accdb>`
   with `--backend-path <backend.accdb>` when the project is split.
2. Keep secrets in environment variables, never in committed config.
3. Run `dysflow doctor` before tool calls and prefer short MCP payloads with `projectId` once the
   project is configured.

### Daily VBA sync loop

1. Inspect drift with `verify_code` or export the current binary with `export_all` when the binary is
   the source to mirror.
2. Edit disk source.
3. Import only the touched modules with `import_modules` when possible; use `import_all` only for a
   whole-tree resync. Mutations persist via save-only (`acCmdSaveAllModules` = RunCommand 280) — the
   runtime no longer compiles; the human compiles in Access (Debug > Compile) before re-running tests.
4. Re-run `verify_code` and the focused `test_vba` plan before trusting the binary.
5. Form/report sources are protected two ways on import (#958): a structural pre-import gate
   rejects unparseable `.form.txt`/`.report.txt` (`FORM_SOURCE_MALFORMED`) before Access is spawned.

   Repairable legacy metadata (missing `AutoResize = NotDefault`, stale/absent `Attribute VB_Name`)
   is self-healed during import.

   A file exported by an older dysflow is imported as if the current version had exported it.
   `export X` → `import X` is idempotent.

### Timeout and orphan recovery

1. Start with `list_access_operations` to see tracked operationId, PID, status, and target
   path.
2. Use `cleanup_access_operation` without `force` to reconcile stale terminal records; this path kills
   nothing.
3. Use `access_force_cleanup_orphaned` without `confirmPid` to list orphan candidates.
4. Pass `confirmPid` only after verifying the process is headless, holds the same `accessPath`, and
   is not owned by a running Dysflow operation.
5. Never kill `MSACCESS.EXE` by process name.

### Safe write enablement

1. Run write-capable tools with `dryRun` first whenever the tool supports it.
2. `dysflow mcp` (stdio) enables writes by default — the stdio surface is process-ownership-trusted.
   Scope a repo to read-only with `"allowWrites": false` in `.dysflow/project.json`, or start the
   whole session read-only with `dysflow mcp --disable-writes`.

   `dysflow serve` (HTTP) still starts writes-disabled by default; enable it explicitly per session
   with `--enable-writes` only for trusted local maintenance.
3. Use `apply: true` only for intentional writes after reviewing the dry-run plan.
4. Treat `MCP_WRITES_DISABLED` as a safety stop, not as a reason to bypass the adapter.

### Frontend vs backend target selection

- Use `accessPath` for the frontend `.accdb` that owns VBA/forms/reports and linked table defs.
- Use `backendPath` for the split data backend when relinking or comparing backend data.
- Use `databasePath` or its alias `sourcePath` for SQL/schema tools when you need an explicit target
  and do not want project config fallback to choose for you.
- Explicit per-call overrides win over `.dysflow/project.json`; use them when diagnosing context
  skew.

### Form/report sync ownership

- Code-behind lives in `.cls`; layout lives in `.form.txt` or `.report.txt`.
- Edit behavior in the `.cls`, then `import_modules`. Mutations persist via save-only
  (acCmdSaveAllModules = RunCommand 280); the runtime no longer compiles. The user compiles
  in Access (Debug > Compile) before trusting the binary.
- Edit controls/layout in `.form.txt`, then `import_modules`; ask the user to manually compile forms
  or reports when Access cannot verify document modules headlessly.
- Verify form behavior through the `.cls` with `verify_code`; do not treat embedded
  `CodeBehindForm` serialization as the source of truth.

## Form inspection and generation — agent guide

These MCP tools let agents read and author Access forms offline, without opening Access.

### inspect_form — read the control tree of an existing form

```
inspect_form({ sourcePath: "forms/Form_MyForm.form.txt" })
```

Returns `{ name, kind, controls, events }`:
- `name` — form name (derived from filename; prefix `Form_`/`Report_` and suffix `.form.txt` are stripped).
- `kind` — `"Form"` or `"Report"`.
- `controls` — flat array of `{ name, type, properties }` objects for every named control in the tree.
- `events` — array of event-procedure names bound at the form level (e.g. `"OnOpen"`, `"OnClose"`).

Works **offline** — reads the version-controlled `.form.txt` source file directly, no Access/COM required.
Read-only: never mutates any file.

The `path` parameter is accepted as an alias for `sourcePath`. The tool returns
`FORM_SPEC_MISSING` if neither is provided, and `FORM_NOT_FOUND` if the file cannot be read.

### AI form UI builder — analyze, plan, apply, verify

Use `analyze_form_ui`, `map_form_behavior`, `generate_form_design_plan`,
`apply_form_design_plan`, and `copy_form_ui_pattern` to plan and apply AI-assisted form UI changes.

Use `verify_form_ui` to keep those changes behavior-safe.

Golden path:
1. `analyze_form_ui({ sourcePath })` reads `.form.txt` through FormIR and returns semantic controls,
   roles, bindings, and events.
2. `map_form_behavior({ sourcePath, codegraphEvidence })` merges analysis with caller-supplied
   CodeGraph-VBA evidence. **Issue #830 opt-in**: pass `autoFetchCodeGraph: true` instead to relax
   the no-MCP-to-MCP boundary one-way (dysflow → codegraph-vba).

   The adapter invokes codegraph-vba internally and merges the result with any caller-supplied
   evidence; on any failure it falls back to `.form.txt`-declared events alone + a warning, never
   throws.
3. `generate_form_design_plan({ behaviorMap, plan })` creates explicit operations tied to the
   behavior map.
4. `apply_form_design_plan({ plan, dryRun: true })` previews. Use `apply: true` only for intentional
   guarded writes.
5. `verify_form_ui({ sourceContract, appliedContract })` reports actionable drift.

For reusable instructions, load `skills/access-form-ui-builder/SKILL.md`.

### validate_form_spec / generate_form — design and write a new form

1. **`validate_form_spec`** — parse and lint a JSON form specification (`.form.json`).
2. **`generate_form`** — write a `.form.json` stub from the spec. This does **not** instantiate
   a live Access form; it produces the source artifact that `import_all` or `import_modules`
   later synchronises into the database.

### catalog_add_control / harvest_form_catalog — control catalog management

- **`harvest_form_catalog`** — scan existing forms and index their controls into a catalog file.
- **`catalog_add_control`** — add or update a single control definition in the catalog.

### Key source paths

| Artifact | Path convention |
|---|---|
| Form SaveAsText export | `forms/Form_<Name>.form.txt` |
| Form code-behind (VBA) | `forms/<Name>.cls` |
| Report SaveAsText export | `reports/Report_<Name>.report.txt` |
| Form JSON spec | `forms/<Name>.form.json` (generated by `generate_form`) |

When verifying form code changes use `verify_code` against the `.cls` file — never compare
code-behind through the `.form.txt` (it is serialization noise; see VBA semantic diff section above).

### FormIR — intermediate representation (for implementors)

`src/core/models/form-ir.ts` defines `FormIR`, the in-memory tree produced by `parseFormTxt`.

Entries use **ordered arrays** (not maps) so duplicate keys (e.g. `NoSaveCTIWhenDisabled` appearing
twice in frmBusy) are preserved verbatim. Blob entries (`Key = Begin…End`) are kept opaque.

`codeBehind` is the raw VBA text after the `CodeBehindForm` marker, or `null` when absent.

### MCP real-world examples reference

For copy-pasteable, concrete JSON input payloads for everyday MCP tasks, see
[`docs/mcp-examples.md`](./docs/mcp-examples.md).

## Companion tool: codegraph-vba

For structural analysis, caller tracing, and impact analysis of the VBA/Access codebase, use the **`codegraph-vba`** MCP server.

Available custom agent skills in `codegraph-vba`:
- **`vba-event-tracer`**: Traces event declarations, raise sites, and custom `WithEvents` event handlers.
- **`vba-handler-backtrace`**: Traces form control event handlers, dynamic calls, circular references, UDT parameters, and reconstructs multiline SQL statements.
- **`vba-sql-impact`**: Traces database tables/columns touched by saved queries, extracts `RecordSource` and `RowSource` layout properties, and resolves SQL table aliases.

## Repo-local skills

Skills definidas en este repo (`skills/`) son scope-local de Dysflow. No forman parte del catálogo personal global; no las copie a `~/.opencode/skills/`, `~/.config/opencode/skills/` ni `~/.agents/skills/`.

### Inventario

| Skill | Ruta | Carga cuando |
|---|---|---|
| `dysflow-issue-release-loop` | `skills/dysflow-issue-release-loop/SKILL.md` | El usuario pide agotar la cola de issues de Dysflow o cerrar un release |

El nombre lleva prefijo `dysflow-`: el scope es este repo. `dysflow-issue-release-loop` ejecuta el ciclo completo `issue → worktree → CI → merge → close → cleanup` con paralelización por defecto y el `pnpm test:e2e:mcp:release` propio de Dysflow como gate previo al release. Permanece aquí porque el patrón de agotamiento de cola y el gate de E2E están ajustados específicamente para este repo.

## Flujo de trabajo (sobrescribe el ciclo estándar)

Este repo **no** usa el ciclo estándar `issue → worktree → CI → PR → merge`. Aplique este flujo en su lugar.

### Procedimiento

1. **Todo cambio se commitea directo contra `main`.** No abra feature branches para ediciones rutinarias. No use el ciclo de PR salvo que el usuario lo pida explícitamente.
2. **Empuje a `origin/main` inmediatamente después del commit.** Local y remoto deben converger lo antes posible. Este repo es consumido aguas abajo; un commit solo en local es una regresión esperando a ocurrir.
3. **Sin preflight de CodeGraph aquí.** Los artefactos binarios que el indexador maneja no son la superficie de edición de este repo.
4. **Sin flujo de `gh issue`.** Los defectos en vivo se trian como commits de un solo tiro contra `main` cuando el usuario lo pide; no se crean issues previas.
5. **Aplica desde local Windows y desde el VPS de Oracle Linux.** La verificación del path del clon en el VPS queda pendiente de una pasada concreta.

### Por qué

Dysflow es un consumible acoplado hacia abajo: los ficheros fuente aquí alimentan pipelines de tooling, servidores MCP y artefactos de release en `~/.dysflow/`. El flujo multi-paso estándar añade revisión de PR y ceremonia de merge sin mejorar la corrección aquí, y retrasa que el consumidor observe el cambio. El compilador, los tests y la compuerta de runtime en `bootstrap({})` ya cubren la red de seguridad que el ciclo de PR proporcionaría.

## Hard rules del flujo de trabajo

Estas reglas son obligatorias en cada cambio que llega al push. Su incumplimiento deja documentación desalineada en el commit y, por extensión, en `origin/main` y en cualquier máquina que replique este repo.

- **Alinear documentación antes del commit, no después.** Cualquier cambio que afecte a un path, un nombre de skill, una categoría, una sección del `AGENTS.md` o un activador declarado debe arrastrar consigo los updates de documentación correspondientes en el mismo commit. Nunca publique un cambio con refs huérfanas al nombre o ruta anteriores. El procedimiento canónico vive en la skill global `~/.config/opencode/skills/skill-propagation-sync/SKILL.md`; esta regla local existe como recordatorio y como contrato verificable a la hora del push.
- **Documentar cambios estructurales en el `CHANGELOG.md`.** Entradas en `### Changed` con el SHA, paths tocados, refs huérfanas purgadas y documentos actualizados. El CHANGELOG es append-only: nunca se borra ni se reescribe una entrada ya publicada.
- **Verificación previa al push.** Antes de `git push origin main`, ejecutar `grep -rn "<nombre-anterior>" --include="*.md" --include="*.json" --include="*.ts" --include="*.mjs"` en el árbol del repo. Cero hits esperados para el nombre o ruta que el cambio acaba de reemplazar. Si quedan hits, el push se retrasa hasta que la búsqueda regrese vacío.
- **Local y remoto reconciliados ASAP.** Tras un commit exitoso, ejecutar el push en la misma sesión antes de cerrar. Si la sesión termina con divergencia entre local y remoto, dejar nota explícita en el siguiente turno y reanudar desde el último estado confirmado.

Las HRs anteriores (`Hard Rules` del bloque `<!-- dysflow:arnés -->`, secciones sobre paralelización, gates de release, disk hygiene y preservación de rama remota) siguen plenamente vigentes. Esta sección las complementa con disciplina documental; no las sustituye.
