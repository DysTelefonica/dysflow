---
name: dysflow-usage
description: "Trigger: MUST-LOAD before any dysflow diagnosis or call when the cwd contains .dysflow/project.json, .dysflow/*, *.accdb, *.bas, *.cls, *.form.txt, or tests/*.json. Load first and call bootstrap({}), then use explicit bounded discovery views before inspecting static files or changing config. Canonical tool names, write flags, error codes, safe-by-default policy, and human-compile contract."
license: Apache-2.0
metadata:
  author: "Andrés Román"
  version: "2.0.0"
  status: active
  last_verified: "2026-08-26"
  last_dysflow_version: "4.2.6"
  requires: "dysflow MCP >= 3.0"
  managed_by: "`dysflow install` / `dysflow update` ship this skill with the runtime; this user-owned mirror is the read-side surface and stays here for offline reference."
  scope:
    in_scope: "canonical dysflow tool names, write-flags matrix, error codes, write-execution-policy, human-compile contract, defensive parsing for transport wrappers that still double-encode envelopes"
    out_of_scope: "high-level workflow (dysflow-codegraph-update), single-tool usage examples (skills per feature)"
  changelog: "CHANGELOG.md (in this skill directory)"
---

## Activation Contract

**MUST-LOAD:** when a cwd contains `.dysflow/project.json`, any `.dysflow/*`
artifact, `*.accdb`, `*.bas`, `*.cls`, `*.form.txt`, or `tests/*.json`, load
this skill BEFORE inspecting static project files, inventing a diagnosis, or
modifying configuration. Call `bootstrap({})` first, then
`schema({ view: "index" })` for route selection. Expand with
`get_capabilities({ view: "compact" })` or a selective `describe_tool` only when
the next step needs those fields; the live runtime owns tool names, flags,
defaults, and recovery semantics.

Use this skill when ANY of:

- Calling a dysflow MCP tool (or about to call one).
- Choosing between flags, defaults, or aliases for a dysflow write call.
- Reading a typed error envelope from a dysflow MCP call.
- Updating another skill that touches dysflow — point to this skill instead of duplicating tables.
- Verifying whether a tool name, flag, or error code still exists in the live runtime.

### ⚠️ Code Mode JSON-wrapping workaround (OpenCode Code Mode bug)

The `dysflow` MCP declares `get_capabilities: Promise<unknown>` (and every other tool: `Promise<unknown>`), but the **OpenCode Code Mode wrapper can deliver these as JSON-encoded `string` literals instead of parsed objects**. Accessing `.adapterVersion` on a `string` returns `undefined`, which the JSON-RPC bridge surfaces as `null` — making every `caps.adapterVersion` / `caps.toolsVisible` / etc. read appear empty even though the underlying MCP responded correctly.

Every dysflow MCP response is JSON-encodable and carries a top-level
`schemaVersion: "dysflow.result/v1"` discriminator, so consumers can branch on
a single field. This is a guaranteed response contract, not an in-flight
caveat. The defensive parse collapses to:

```js
// Issue #1168 — universal MCP response contract. Branch on the
// schemaVersion discriminator instead of trusting `typeof === "object"`,
// because the OpenCode Code Mode wrapper may stringify the whole envelope.
const raw = await tools.dysflow.someTool(args);
const env = typeof raw === "string" ? JSON.parse(raw) : raw;
if (env?.schemaVersion !== "dysflow.result/v1") {
  throw new Error("not a dysflow MCP envelope — possibly flattened by the transport wrapper");
}
// Prefer `structuredContent` first; it carries the complete result when present.
// Use `content[0].text` only when it contains the complete payload, not a bounded summary.
// env.error.code (when isError === true) is the typed error code.
```

The discriminator is defined once by `RESULT_SCHEMA_VERSION` in
`src/adapters/mcp/response-envelope.ts`; the stdio central seam and every
success/error envelope builder stamp it. Use
`env.schemaVersion === "dysflow.result/v1"` as the branch signal — never invent
your own literal.

If you call the dysflow MCP from a host that DOES parse JSON correctly (Claude/Cursor/Cline with a real MCP bridge, the `dysflow` CLI directly, `gh`-style REST adapters), the response is the parsed object and the `typeof raw === "string"` branch is dead code. The discriminator check is still useful as a defensive sanity gate. The break is specifically in the OpenCode Code Mode `execute` tool.

**Detecting the bug at runtime** (use in tools that expect object results):

```js
const snap = await tools.dysflow.bootstrap({});
if (typeof snap === 'string') {
  // OpenCode Code Mode wrapper is delivering a JSON string instead of the parsed object.
  // File an issue against OpenCode (or hard-restart the MCP client). Skill contract says
  // Promise<object>; the wrapper currently returns Promise<string>.
}
```

Do NOT use when:

- The question is workflow-level ("how do I sync binaries", "what's the test loop"). Use the workflow skill (`vba-binary-sync`, `vba-run-tests`, etc.) — they point here for tool/flag/error tables.
- The question is about `codegraph-vba`. Use `codegraph-vba` skill if installed, or the meta-skill `dysflow-codegraph-update`.
- The question is only about CLI installation or shell setup. For pure-MCP project bootstrap, use `setup_project`; for config migration, use `migrate_project_config`.

## Quick start

> **First call:** `bootstrap({})` — the minimal, project-resolution-free identity,
> write-gate, advertised-surface, workflow-routing, and human-compile snapshot.
> Then use the schema index for routing and fetch only the deeper block needed by
> the selected step. If runtime disagrees with this skill, **trust runtime** and
> update the bundle.

### Progressive bootstrap

Call `bootstrap({})`, then `schema({ view: "index", phase: "<phase>" })` to
select a callable tool. Index includes every registered/callable contract and
marks whether each one is currently `advertised` by `tools/list`. Fetch
`describe_tool({ name: "<tool>", sections: ["parameters"] })` for one-tool
details. Use `get_capabilities({ view: "compact" })` for compact tool/write
metadata; use `{ view: "full" }` only as deliberate complete-snapshot opt-in.
The compatibility alias `{ compact: true }` is accepted but is not canonical.

Core `tools/list` includes the read-only SQL/form inspection family plus `query_execute`.
External database reads require `allowExternalAccessPath:true`; source/FormIR tools do not.
`query_execute` accepts that opt-in only with `mode:"read"` and rejects it in write mode.

> **`setup_project` identity is fail-closed:** a fresh bootstrap requires an
> explicit `projectId`. If it is omitted, the runtime may reuse only the
> selected WorktreeContext's existing configured id and emits a warning that
> names the reuse. With no existing id it returns `MCP_INPUT_INVALID` containing
> `projectId is required`; it never derives an id from the cwd basename. See
> `assets/examples/setup-project.md`.

> **Stale `.laccdb` files do not block imports.** The runtime probes live-handle ownership. It removes an unowned stale lock and emits `LACCDB_STALE_DETECTED`; a real holder emits `LIVE_PROCESS_HOLDS_LACCDB` with its PID. Consumers must use only dysflow-owned cleanup paths (`cleanup_access_operation`, or `access_force_cleanup_orphaned` with a listed `pid` plus `implements_check:"orphans_msaccess"` and `confirmedRequiresConfirmation:true`) — never a generic process killer or consumer-side lock-file deletion. See `references/error-codes.md` and `assets/examples/import-modules.md#stale-laccdb-recovery-v291`.

`bootstrap` carries:

| Field | Meaning |
|---|---|
| `adapterVersion` | Live runtime version. |
| `writesProcess`, `writesProject`, `writeExecutionPolicy` | Minimal write-gate preflight. |
| `toolsVisible` | Legacy advertised count for the active `toolSurface`. |
| `toolInventory` | Unambiguous `{ callable, advertised, surface }` counts. |
| `preferredAgentWorkflows` | Phase routing, optionally filtered by `phase`. |
| `humanCompilePending` | Manual compile gate. |

`get_capabilities({ view: "compact" })` always carries the base identity/gates,
`toolInventory`, and by default compact `tools`, `sharedBlockSupport`,
`effectiveDryRunDefault`, `migrationNotes`, and the resolver-provided three-key
`documentationBundle`. It deliberately omits
`preferredAgentWorkflows`, `writeClassToolsPermitted`, `allowedProcedures`,
`projectConfig`, `worktreeCache`, and `humanCompilePending` unless requested
through `include` or `{ view: "full" }`.
The full/selective capability response carries:

| Field | Meaning |
|---|---|
| `adapterVersion` | Live runtime version. Quote it literally in any skill/AGENTS that needs a floor. |
| `writesProcess.enabled` | Whether writes are enabled at process level. `false` ⇒ every write tool returns `MCP_WRITES_DISABLED`. |
| `writesProject.allowWrites` | Whether the active `.dysflow/project.json` allows writes. Same envelope. |
| `dryRunDefault` | Compatibility-named global plan default. Input intent is canonical `apply`; the per-tool `effectiveDryRunDefault` map is what the dispatch seam consults. |
| `toolsVisible` | Legacy callable registry count in `get_capabilities`; do not compare it directly with bootstrap's advertised count. |
| `toolInventory` | Stable distinction: callable registry count, advertised `tools/list` count, and active surface. |
| `documentationBundle` | Installed diagnostic-doc availability (`errorCodesMd`, `hresultGuideMd`) and the bundle version. Treat missing or version-skewed diagnostics as an installation defect before following local remediation docs. |
| `writeClassToolsPermitted` | The allowlist of tools capable of mutating state. Cross-reference before documenting any tool name. |
| `humanCompilePending` | Whether the human has compiled the project since last persistence. Test runs block on it. |
| `writeExecutionPolicy` | Active risk-based write execution policy. `"safe-by-default"` (default) or `"developer"` (zero-friction routine dev loop). Resolved from `.dysflow/project.json` `capabilities.writeExecutionPolicy`. |
| `effectiveDryRunDefault` | Per-tool effective plan default under the active policy. Keys are contract tool names; values are booleans. Check it with `canonicalCommitFlag` and pass explicit `apply` intent. |
| `projectIdResolution` | Resolved project identity for the current `cwd`: `{ projectId, outcome }`. `outcome` is `"resolved"` when a unique project config was found, otherwise `"unresolved"`. Use this together with `projectConfig` to confirm the active target before any write-class call. |
| `surface` | Transport type the MCP server bound (e.g. `"stdio"`). Diagnostic-only — consumers do not branch on this; the live contract surface is the same regardless of transport. |
| `preferredAgentWorkflows` | Full-view phase guidance. Bootstrap includes `bootstrap,get_capabilities,schema,describe_tool,register_worktree,setup_project,resolve_project,clear_worktree_cache`; other phase lists are runtime-derived. |
| `projectConfig` | Normalized project-config diagnosis: `cwd`, `configPath`, config-owning `projectRoot`, `projectId`, effective `accessPath`, optional shared `backendPath`, local `destinationRoot`, `discoveredProjects[]`, typed `status`, boolean `writeReady`, `diagnostics[]`, and exact `remediation`. Persistent config stores only `frontendFile` (or a basename-only legacy `accessPath`); the effective frontend is always resolved under the worktree that physically owns `.dysflow/project.json`. Another worktree is selected only by an explicit per-call `projectId`, absolute `accessPath`, `backendPath`, or `cwd`. Explicit target provenance is call-local and never persisted. `cwd` is the **active git worktree toplevel**, not the process spawn cwd — see the two typed warnings below. |

#### `projectConfig.cwd` is the worktree, not the spawn cwd (#1179)

The MCP process is spawned from one fixed directory; the session consuming it
may be operating in a sibling worktree of the same repo. The resolver
therefore walks up to the git worktree toplevel before deciding which
`.dysflow/project.json` to consult, so the implicit target is the worktree.

Two typed entries can appear in `projectConfig.diagnostics[]` at
`severity: "warning"`. Both are additive — the pre-existing error codes and
the `writeReady` verdict are unchanged, so a consumer that ignores them keeps
working:

| Code | Meaning | What to do |
|---|---|---|
| `CWD_NOT_IN_WORKTREE` | The process cwd is not inside any git worktree, so `projectConfig.cwd` fell back to the spawn cwd. | Expected when the runtime is driven from a temp directory or a bare checkout. Surface it; do not treat it as a failure. |
| `TARGET_MISMATCH_WARNING` | The auto-detected worktree's configured `projectId` differs from the one the request asked for. Accompanies the existing `PROJECT_ID_MISMATCH` error. | Pass the intended worktree explicitly (`projectId`, or `cwd` on read tools) instead of relying on auto-detection. |

Read `projectConfig.cwd` rather than assuming the value you passed comes back
verbatim: outside the per-tool gate it now reports the worktree root.
| `tools` | Per-tool commit-flag and workflow metadata. Keys are contract tool names; values include `canonicalCommitFlag`, `legacyAliases[]`, `commitFlag`, `noWriteAlias`, `defaultBehavior`, standard `annotations`, and namespaced `_meta["dysflow/workflow"]`. Composition metadata is not sourced here; read full schema or `describe_tool`. |

### Workflow metadata and introspection

Every advertised `tools/list` entry exposes standard MCP `annotations` (`title`, `readOnlyHint`,
`destructiveHint`, `idempotentHint`, `openWorldHint`) and a compact namespaced
`_meta["dysflow/workflow"]` routing block (`phases`, `status`). The compact
`tools/list` schema keeps every callable property and concise safety semantics,
but omits deep parameter prose and migration/history text. Deep
`preferredFor` guidance and complete constraints remain in `schema` and
`describe_tool`. With `additionalProperties:false`, never treat an omitted
description as an omitted property; use the advertised property keys and then
fetch the deep contract when needed.

For low-context routing, `schema({view:"index"})` returns every callable tool
with only `name`, `purpose`, `access`, canonical workflow `phases`, `status`,
`preferredFor`, annotations, and boolean `advertised`.
Use `phase`, `status`, and `toolName` filters before requesting one deep view.
`get_capabilities({compact:true,include:["tools","sharedBlockSupport","effectiveDryRunDefault","migrationNotes"],toolNames:["<tool>"]})` keeps the routing blocks aligned while avoiding unrelated per-tool entries.

### When a tool rejects your flag (#757 C4)

`get_capabilities` + `get_capabilities.tools` is the AUTHORITATIVE source for
which flag commits a tool. As of [issue #1167](https://github.com/DysTelefonica/dysflow/issues/1167)
**every advertised MCP tool reports `canonicalCommitFlag: "apply"`** — the
single canonical commit signal across the toolset. There is no longer a
per-tool polarity to memorize; the same lookup pattern works for every
write-class tool.

- `canonicalCommitFlag: "apply"` — pass `apply: true` to commit. This is
  the canonical contract for every advertised MCP tool, including
  `test_vba` (unified in #1167).
- `legacyAliases[]` — compatibility flags still accepted by the runtime.
  Never treat an alias as preferred. The live runtime reports only `diff`
  for `export_modules` and `export_all`; all other tools report an empty list.
- `noWriteAlias: "diff"` (`export_all`, `export_modules` only) — pass
  `diff: true` to plan. **Prefer `apply: false` for new code.**
- `noWriteAlias: null` — no compatibility alias; use the canonical `apply`
  field for write intent.
- `defaultBehavior: "plan"` — every write-class tool. No flag = plan.
- `defaultBehavior: "noop"` — read-only tools and conditional operations
  that require a separate explicit confirmation. No flag, no mutation.

When conflicting write intent is rejected, the
`MCP_INPUT_INVALID` envelope now carries `rejectedFlag`,
`rejectedFlags[]` (the full list of conflicting flags raised by the
truth table), `toolCommitFlag`, and `remediation` so an AI consumer
can switch without parsing the legacy text body. Since v2.23.0,
contradictory flag combinations (for example `apply:true` together
with legacy `diff:true` on an export tool) fail loud with `MCP_INPUT_INVALID` rather than
silently picking one intent — always read
`get_capabilities.tools[toolName]` first and pass the registry's
`commitFlag` / `noWriteAlias`. Contradictory combinations are modeled in two layers: full schema / `describe_tool` expose `compositionConstraints` and matching schema `anyOf` required groups; individual `parameters[*].conflictsWith` entries describe direct parameter conflicts. Do not attribute either layer to `get_capabilities.tools`.

## How to read this skill

1. **Examples** (`assets/examples/`) — one `.md` per common MCP action. Each has the canonical JSON call, anti-patterns for that call, and the result fields worth reading.
2. **Anti-patterns** (`assets/anti-patterns.md`) — curated list of dysflow-specific footguns.
3. **Write-flag matrix** (`assets/write-flags-matrix.md`) — table of write-class tools and the flag that commits them.
4. **Error codes** (`references/error-codes.md`) — typed envelope codes, verified live.
5. **Agent contract map** (`references/agent-friction-map.md`) — functionality-by-functionality zero-friction behavior.

## Examples (canonical directory)

See `assets/examples/` for the canonical per-tool index. Every advertised MCP
tool has a kebab-case `.md` example file there.

## Form UI tools — perceive → act → verify

The form-UI builder surface treats an Access form like a web page: perceive it, act with rich verbs, re-verify. All operate on `FormIR` (parsed `.form.txt`); the write tools go through the same guarded write + import gate. Full workflow in the **`access-form-ui-builder`** skill; canonical flags/errors stay here.

| Phase | Tools | Class |
|---|---|---|
| **Perceive** | `analyze_form_ui` (roles), `analyze_form_layout` (geometry lint: overlap/alignment/tab-order), `render_form_preview` (SVG/ASCII from twips), `map_form_behavior` (control→handler→callpath; consumes codegraph-vba evidence) | read |
| **Plan** | `generate_form_design_plan`, `copy_form_ui_pattern` | read |
| **Act** | `apply_form_design_plan` (execute plan — WRITE), `form_align_controls`, `form_distribute_controls` (batch geometry — WRITE) | write |
| **Verify** | `verify_form_ui` (contract + geometry/tab-order/property), `verify_form_bindings` (ControlSource/RowSource vs real schema), `diff_form_preview` (before/after visual) | read |

Write tools follow the live matrix: prefer `apply:false` to preview and `apply:true` to commit;
use `diff` only when reported as a compatibility alias. `apply_form_design_plan`'s
`mode`/`filesystemApplied` reflect the real write; the pure planning preview is always
`mode:"dry-run"`.

`form_set_properties` accepts a `properties` map and validates every property name and value before opening a guarded write. Every form mutation is transactional: when the import gate fails, dysflow restores the original source instead of leaving a partial filesystem mutation.

## Multi-worktree operation — explicit target per call

Git creates worktrees; Dysflow resolves targets safely. The current Git worktree is always the
implicit/default context. Its `.dysflow/project.json` stores `frontendFile` as a filename only
(or accepts a basename-only legacy `accessPath`), derives `projectRoot` from the config's physical
owner, and keeps `destinationRoot` relative/local. An absolute or shared `backendPath` remains
unchanged and is never rebased with the frontend.

To operate on another worktree, select it explicitly in that individual call with a unique
`projectId`, absolute `accessPath`, `backendPath`, or supported `cwd`. Successful explicit
resolution returns target provenance such as `explicit-project-id` or `explicit-access-path`;
that provenance is for the call only and MUST NOT be written into the current worktree's config.
Duplicate sibling ids fail with `PROJECT_ID_COLLISION` rather than first-match behavior.

When no frontend filename is configured, only one root `.accdb` may be auto-selected. Zero
candidates returns `FRONTEND_TARGET_MISSING`; multiple candidates return
`FRONTEND_TARGET_AMBIGUOUS`. Absolute or separator-containing legacy `accessPath` values return
`FRONTEND_PATH_NOT_BASENAME`; inherited sibling paths without an explicit target cannot authorize
writes and may return `INHERITED_WORKTREE_MISMATCH`.

Use `resolve_project({cwd:"<absolute-worktree>", projectId:"<id>"})` to inspect a sibling and
require `outcome:"resolved"`. If the outcome is `ambiguous`, ask the human to choose one
`availableProjects` entry and retry with that exact `projectId`,
`projectChoiceReason:"user_selected_after_ambiguous_project"`, and the opaque
`recoveryToken`. The dispatch seam consumes the complete trio before any fresh
collision check and routes through the cached chosen project root. This applies
equally to `setup_project`, `resolve_project`, `migrate_project_config`,
`test_vba`, and `access_force_cleanup_orphaned`. The token is one-shot and
process-local; a consumed or absent token fails closed, and the cached choice
expires or invalidates when config/worktree evidence changes. Clear it with
`resolve_project({clearResolution:true})`. Confirm each target parameter with
`describe_tool({name:"<tool>"})`. Never restart MCP or edit one worktree's config to
point at another. See `assets/examples/resolve-project.md` and
`assets/examples/resolve-project-recovery.md`.

For one-tool introspection, call `describe_tool({name:"<tool>"})` before inventing a
parameter. The canonical parameter is `name`; `toolName` is only an alias.

### Redirecting where a write lands — `destinationRoot` (#1169, #1226)

Every write-class tool accepts a `destinationRoot` override, and the project
root follows it, so the path-containment guards accept the override as the
authoritative root instead of rejecting a `sourcePath` that sits inside it.
Use it to write into a scratch tree without touching the configured source
root. Precedence is `projectRoot` (explicit) → `destinationRoot` (this
override) → the configured value → `cwd`; omitting the override leaves the
configured contract exactly as before.

**Issue #1226 (`export_modules` / `export_all`) — pre-resolve destinationRoot
gate.** The two export tools require an EXPLICIT declaration of where bytes
land before the dispatch seam engages the runner. Pass ONE of:

- `destinationRoot: "<path>"` — explicit override (preferred).
- `exportPath: "<path>"` — legacy alias. Forwarded to `destinationRoot` by
  the adapter; both reach the post-resolve export-source guard (#785).
- `allowConfiguredDestinationRoot: true` — opt-in to the configured value
  in `.dysflow/project.json` when the caller wants the historical
  silent-config-fallback behavior. Default is `false`.

If the call passes NONE of these three, the dispatch seam short-circuits
with the typed error code `DESTINATION_ROOT_REQUIRED` (`error.missingFields`
enumerates what to set; `error.toolName` names the offending tool). The
post-resolve #785 guard then fires normally once the destination IS
declared — after explicit approval, use `implements_check:"export_overwrites_source_precheck"` with `confirmedRequiresConfirmation:true` to bypass an overlap refusal.

`destinationRoot` chooses **where bytes land**, not which database is opened —
that is still `projectId` / `accessPath` / `backendPath`. Confirm the
parameter is accepted with `describe_tool({name:"<tool>"})` before relying on
it for a given tool.

### Migrating a legacy project config — `migrate_project_config`

The default call is a read-only diff preview of what the migration would
rewrite. Committing it is write-gated like any other write-class tool, and it
rewrites `.dysflow/project.json` atomically. Reach for it instead of
hand-editing a config that predates the current contract; see
`assets/examples/migrate-project-config.md`.

## VBA-sync workflow — `sync_binary`

When an AI agent needs a whole-project source ⇄ binary workflow, prefer `sync_binary` over the manual 5-step loop. For an explicit narrow list of modules, use `import_modules({moduleNames:[...]})` or `export_modules({moduleNames:[...]})`; Dysflow does not steer those focused calls toward a broader workflow. When the composed verify/plan/re-verify envelope is still useful for an explicit list, pass `scope:{moduleNamesOnly:true}` so modules outside that list cannot affect the workflow result. `sync_binary` composes `verify_code` + `import_modules` + `export_modules` + re-verify into a single round-trip. Workflow pattern lives in the **`vba-binary-sync`** skill; this is its MCP one-shot wrapper.

| Direction | What it does |
|---|---|
| `"src-to-binary"` | verify → plan import → (if `apply:true`) chunked `import_modules` → re-verify → recommend |
| `"binary-to-src"` | verify → plan export → (if `apply:true`) chunked `export_modules` → re-verify → recommend |
| `"both"` | verify + plan both directions; **plan-only even with `apply:true`**. Detect drift without committing either side. |

`apply:false` is the explicit preview shape and omitted intent plans. The consumer must explicitly opt into `apply:true`. `effectiveDryRunDefault.sync_binary` remains `true` as compatibility-named plan metadata. The four-list lockstep preserves plan-by-default semantics in developer mode. Hard rules honored: NO `compile:true`, Round 2/3/4 invariants preserved (no abort on missing module; ASCII-only runner-bound strings; chunked COM-safe imports).

Conflicting `bothChanged` entries remain `manual_merge` by default. A caller that has made an
explicit one-way decision may pass `acceptBothChanged:true` together with `direction:
"src-to-binary"` or `"binary-to-src"`; `direction:"both"` never resolves the conflict.

`export_modules` opens a disposable copy of the `.accdb` by default so the
original binary is not mutated by Access bookkeeping. Read `binaryMutated:false` as the normal
result. Pass `mutateBinary:true` only when the legacy direct-binary behavior is intentional.

Use `sync_binary` whenever the agent would otherwise script the 5-step loop manually. Use the manual primitives (`verify_code` + `import_modules` + `export_modules`) only when you need the granular control (single-step inspection, partial commits, custom chunking).

Large `import_modules` orchestration payloads are transport-safe on Windows: the PowerShell bridge
keeps Base64 payloads up to 8192 characters on argv and sends larger payloads over stdin. Do not
reduce `sync_binary.batchSize` merely to avoid Windows error 206; chunking remains a COM workload
and error-isolation decision. `PAYLOAD_TOO_LARGE_FOR_ARGV` is the internal CLI's pre-mutation guard
when a direct caller incorrectly sends an oversized payload through `--payload-base64` instead of
`--payload-stdin`.

## Write-execution-policy — `developer` vs `safe-by-default`

`get_capabilities.writeExecutionPolicy` reports the active mode. The dispatch layer consults the resolver per call; **the per-tool `effectiveDryRunDefault` map is the source of truth** (NOT a hardcoded input alias).

| Mode | Omitted write intent resolves to | When to use |
|---|---|---|
| `"developer"` | commit for `routine-dev-write`; plan for `destructive-write` and `critical-write` | zero-friction local dev loop |
| `"safe-by-default"` | plan for all write-class tools | shared CI, public agents, anything where the agent is not the human |

**Resolution rules** (the dispatch layer enforces these — DO NOT bypass):
- A `risk: "routine-dev-write"` tool in `developer` mode with omitted `apply` resolves to commit.
- A `risk: "destructive-write"` or `risk: "critical-write"` tool with omitted `apply` ALWAYS plans, regardless of mode. Explicit `apply: true` is required to commit.
- A `risk: "read-only"` tool ignores both flags (no-op either way).

**Per-call gating is authoritative and never bypassed** (independent of policy):

`compact_repair` defaults to the frontend. Pass its explicit target selector only when the
intended database is the backend; never rely on path fallback when the target matters.

- `delete_module`, `compact_repair`, `relink_directory`, `localize_backend_links`, `drop_table`, and `teardown_fixture` require their schema-advertised `implements_check` token plus `confirmedRequiresConfirmation:true` whenever `apply:true`; `apply:false` plans without the second confirmation.
- `cleanup_access_operation` with `force: true` requires explicit confirmation regardless of mode.
- `access_force_cleanup_orphaned` with a positive `pid` requires `implements_check:"orphans_msaccess"` and `confirmedRequiresConfirmation:true` after explicit human approval.
- The `test_vba` / `run_vba` allowlist gate (`capabilities.procedures.allow`, resolved as `allowedProcedures`) is enforced in both modes.
- The `capabilities.allowWrites: false` write-gate is enforced in both modes (the policy does NOT bypass it). Removed top-level fields fail with `CONFIG_TOP_LEVEL_FIELDS_REMOVED`.

**Export-source guard** (both modes reach it once the destination is
explicitly declared — see Issue #1226 for the pre-resolve
`DESTINATION_ROOT_REQUIRED` gate that fires BEFORE this guard when
`destinationRoot` is never declared):
- `export_modules` / `export_all` with a destination that overlaps the
  source root → refused with `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION`.
- After explicit human approval, re-call with
  `implements_check:"export_overwrites_source_precheck"` and
  `confirmedRequiresConfirmation:true`.
- Exact source root match → refused.
- Nested managed folder → refused.
- External path → allowed (subject to the existing write-gate).
- Case-insensitive Windows path matching.

**Practical rule for AI agents**: when in doubt, set the policy explicitly. If `.dysflow/project.json` is not configured, the runtime defaults to `"safe-by-default"` — every write call without an explicit `apply: true` plans. The `developer` mode is opt-in per-project (set `capabilities.writeExecutionPolicy: "developer"` in `.dysflow/project.json`).

## Cross-reference

- **Anti-patterns:** `assets/anti-patterns.md`
- **Write-flag matrix:** `assets/write-flags-matrix.md`
- **Error codes:** `references/error-codes.md`
- **Verification script:** `assets/scripts/verify-examples-vs-runtime.ps1`

## Self-check before any dysflow call

Run these in your head before every call. One fail = stop and resolve.

1. `adapterVersion` is current (from the latest `bootstrap`, expanded through `get_capabilities` only as needed).
2. The per-tool effective dry-run default (`effectiveDryRunDefault[toolName]`) matches your intent. Default behavior depends on the active policy — see `assets/examples/get-capabilities.md` for the truth table. Read `canonicalCommitFlag` and pass explicit canonical intent when committing.
3. Writes are enabled for write-class calls (`writesProcess.enabled` and `writesProject.allowWrites` both `true`).
4. `humanCompilePending:false` before any `test_vba` / `run_vba` call.
5. `toolInventory` matches the claim you cite: `advertised` for `tools/list`, `callable` for schema/dispatch. `toolsVisible` is legacy and context-dependent (`bootstrap` = advertised; `get_capabilities` = callable).
6. For `query_execute` — `mode: "read" | "write"` is REQUIRED (issue #1164). `apply: true` alone does NOT pick a write path; it only commits. Omitting `mode` returns `MCP_INPUT_INVALID` with `error.missingParam: "mode"` and exact remediation. `missingParam` is distinct from rejected write flags: it does not include `rejectedFlag` or `toolCommitFlag`. See `assets/examples/query-execute.md`.
7. **Legacy `accessPath` in `.dysflow/project.json`** — the runtime joins `frontendFile` to the worktree that physically owns the config (contract introduced in #1092, shipped in v2.23.1). If your config still carries an absolute legacy `accessPath`, migrate it with a one-line replacement:

   ```diff
   - "accessPath": "../../Users/.../frontend.accdb",
   + "frontendFile": "frontend.accdb",
   ```

   `frontendFile` is a basename: the runtime resolves it against the active worktree root, so the same config works across every worktree without edits. Per-call override (`accessPath`) still wins when a genuinely different frontend is needed (for example, to inspect a binary that lives outside the worktree) — never bake a sibling path into `.dysflow/project.json`. When the MCP exposes it, drive the migration deterministically with the `migrate_project_config` tool (#1177) instead of editing by hand; for the structured-diagnostic path see #1176.

8. **`run_vba` plan/apply agreement (#1174)** — `run_vba` parses `procedureName` into `<module>.<procedure>` once and threads the parsed `moduleName` + `procName` through both the `apply:false` plan and the `apply:true` preflight. The two paths therefore MUST agree on procedure resolution for the same input. If you observe a divergence:
   - `apply: false` succeeds with `moduleName` / `procedureName` populated, but `apply: true` fails with `PROCEDURE_NOT_FOUND` for the same input → the adapter forwarded a stale `moduleName` OR the binary's compiled p-code is out of sync with the on-disk source. Force a re-compile in Access VBE (Debug → Compile) and retry. Do NOT chase a phantom import issue.
   - `apply: true` fails with `PROCEDURE_NOT_CALLABLE` → the procedure is present in the binary's `VBComponents` but Access refused to invoke it (stale p-code). The typed envelope's `error.remediation` says "Recompile in Access VBE then retry"; follow it. Follow it ONCE: if a `Debug → Compile` that reported no errors does not change the outcome, stop recompiling and report it — that loop cannot terminate.
   - `apply: true` fails with `VBA_RUNTIME_ERROR` (#1681) → the procedure was invoked, ran, and raised. Read `error.details.vbaMessage` for the VBA error it emitted. Do NOT recompile: `apply` reached the procedure, so its p-code is current. Fix the procedure or the state it depends on.
   - `apply: true` fails with `RUNNER_FAILED` whose message matches `Excepción al llamar a "Run"` → the reclassifier should have caught it. If you see the raw `RUNNER_FAILED`, file an issue against the reclassifier at `src/core/services/vba-service.ts::reclassifyRunnerFailure`.

   See `assets/examples/run-vba.md` for the canonical procedureName parsing contract and the typed error envelopes (`MCP_PROCEDURE_NOT_ALLOWED` / `PROCEDURE_NOT_FOUND` / `PROCEDURE_NOT_CALLABLE` / `VBA_RUNTIME_ERROR`).

9. **Project-config plan/apply agreement (#1324)** — for identical explicit
   project arguments, `apply:false` and `apply:true` MUST resolve the same
   `WorktreeContext` from the same cwd-aware cache. If plan succeeds but apply returns
   `PROJECT_CONFIG_NOT_WRITE_READY`, file a dysflow bug: the dispatch seam has
   diverged. Do not bypass the write gate or remove explicit selectors to make
   the call pass.

Full rationale and per-item recovery: `assets/examples/preflight-checklist.md`.
Composition recipes (TDD loop, drift + act, recovery, exploration): `assets/examples/composition-patterns.md`.

> **Error codes in this skill are verified live against the runtime.** The full
> `schema({ view: "full" })` / selective `describe_tool` error catalogs are
> authoritative; `get_capabilities` does not enumerate per-tool errors.
