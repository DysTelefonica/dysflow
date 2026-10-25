# Write execution policy

The `developer` and `safe-by-default` policies and their effect on `effectiveDryRunDefault`.

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
- `access_force_cleanup_orphaned` with a positive `pid` requires `implements_check:"orphans_msaccess"` and `confirmedRequiresConfirmation:true` after explicit human approval. It needs no `allowWrites` (#1862): the listing (`pid` omitted or `null`) and a retire of a listed PID that passes the ownership guards run with writes disabled.
- The `test_vba` / `run_vba` procedure gate is **default-allow**. `capabilities.procedures.allow` (resolved as `allowedProcedures`) is enforced only when the same project declares `capabilities.procedures.strictMode: true`; when it is, enforcement applies in both modes. The write gate stays authoritative either way and now covers `run_vba` as well (it previously did not, because `run_vba` is an alias tool that bypassed the dispatch seam) — never treat `MCP_PROCEDURE_NOT_ALLOWED` as the reason a write was refused without checking `writesProject.allowWrites` and `writesProcess.enabled` first. HTTP ignores `strictMode` and keeps enforcing.
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
