# Bootstrap and capabilities

Fields returned by `bootstrap` and `get_capabilities`, progressive discovery, and workflow metadata.

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
| `humanCompilePending` | Compile reminder. It refuses no call. |

`get_capabilities({ view: "compact" })` always carries the base identity/gates,
`toolInventory`, and by default compact `tools`, `sharedBlockSupport`,
`effectiveDryRunDefault`, `migrationNotes`, and the resolver-provided three-key
`documentationBundle`. It deliberately omits
`preferredAgentWorkflows`, `writeClassToolsPermitted`, `allowedProcedures`,
`procedureStrictMode`, `projectConfig`, `worktreeCache`, and
`humanCompilePending` unless requested through `include` or
`{ view: "full" }`.
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
| `procedureStrictMode` | Whether the procedure gate actually enforces `allowedProcedures`. The gate is default-allow, so a populated `allowedProcedures` with `procedureStrictMode: false` is documentation, not a boundary — `run_vba` and stdio `test_vba` will run a procedure outside the list. Never infer enforcement from a non-empty `allowedProcedures` alone. `undefined` means the value is resolved per input and the startup snapshot cannot state it; treat that as "unknown here", never as `false`. HTTP ignores the flag and always enforces a populated list. |
| `humanCompilePending` | A reminder, not a gate. It turns `true` after a save-only persistence (`import_modules`, `import_all`, `delete_module`) and back to `false` after a `verify_code` with `actionableOk:true` on the same frontend. Dysflow cannot observe a compile in Access, so `false` never proves the project was compiled. The state is per MCP process. While it is `true`, successful `import_*`, `delete_module`, `test_vba` and `run_vba` results carry a `humanCompileReminder` field; no tool refuses a call because of it (`src/adapters/mcp/result-translation.ts`, `withHumanCompileReminder`). Compiling before a GREEN run is a team convention (HR-1 of `dysflow-arnes`). |
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
