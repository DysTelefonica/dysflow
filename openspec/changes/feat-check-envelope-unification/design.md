# design.md — feat-check-envelope-unification

Architecture + alternatives considered. The 7 numbered design decisions also live in `proposal.md` §Decisions captured; this file tracks WHY and what alternatives were rejected.

## Three-plane separation (engram pattern adapted)

The unified envelope follows engram's three-plane model:

| Plane | Lives in | Status |
|---|---|---|
| **Primitives** (runtime) | `src/core/contracts/diagnostic-check.ts` + dispatch seam | THIS ÉPICA |
| **Lifecycle** (plugin) | `plugin/` + `setup.sh` | separate work (Fase 6 of Round 17) |
| **Workflows** (skills) | `dysflow-usage`, `vba-binary-drift`, `vba-form-repair`, etc. | separate work — plugins for hooks, `suggest_X` for workflows |

This épica only touches the **primitives** plane. Plugins and workflows are separate épicas. The boundary is intentional: the runtime seam enforces the contract; the plugin captures context the agent doesn't have; the skills teach the agent how to apply the contract to real scenarios.

## DOCTOR_CHECK_METADATA registry (sub-agent decision, accepted post-hoc)

Sub-agent introduced a centralized registry: `DOCTOR_CHECK_METADATA = [...] as const satisfies readonly DoctorCheckMetadata[]` plus a `doctorCheckMetadata(checkId)` lookup helper.

**Why accepted:** single source of truth for `check_id → metadata`. Without it, the 8 literal construction sites each enumerate metadata separately. Adding a new `check_id` would risk silent inconsistency (different `reason_code` assignments, different `category` placements, etc.).

**Alternatives considered:**
- *Embed metadata at each construction site.* Rejected: drift risk across 8+ files.
- *Convention-based metadata from function names.* Rejected: brittle (function renames break the convention), hard to test.
- *Reflection-based metadata discovery.* Rejected: runtime cost; breaks static analysis tools that read TS source.

The `satisfies` constraint ensures the registry entries stay type-aligned with `DoctorCheckMetadata` (which `Required<Pick<...>>` enforces the 4 fields are present). New entries added without the 4 fields fail compile. Excellent for SDD.

## Required vs optional fields (McpWiringCheck, SupplementDriftDiagnostic)

Sub-agent made the 4 metadata fields REQUIRED on these two narrow types, even though the proposal said optional. Only 2 literal return sites each.

**Why accepted:** with so few sites, compile-time safety beats runtime checking. If a return site forgets the metadata spread, TypeScript fails immediately.

**Alternative considered:** keep optional + add a runtime check that errors if metadata missing. Rejected: shifts discovery from compile-time to runtime; loses IDE assistance; opens the door to silent omission in deeply nested branches.

The `DoctorCategoryCheck` parent type keeps the fields **optional** because it has 8+ construction sites and additive migration is cleaner. PR-3 will promote to required once all consumers are migrated (see tasks.md §T3.4).

## conflated vs unified errors (Slice 3 design)

The 4 escape hatches today each return a defensive error in their own shape:
- `dryRun: true` → various behaviors per tool, some errors, some silent
- `confirm: true` on `clean_stale_markers` → just confirms the flip
- `confirmOverwriteSource: true` → `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION`
- `confirmPid` on `access_force_cleanup_orphaned` → confirms the PID-specific cleanup

PR-3 unifies them under **two** error codes:
- `CONFIRMATION_REQUIRED` — the check requires confirmation, none provided.
- `CONFIRMATION_NOT_NEEDED` — the check does not require confirmation, one was provided.

Two codes, not one, because the inverse case (`why did the override fail?`) is semantically distinct and useful for agent debugging.

## Backwards compat during deprecation cycle

Per open question #5 in `proposal.md`: 1 minor deprecation warning before removing `dryRun`, `confirm`, `confirmOverwriteSource`, `confirmPid` — OR hard removal in v2.31? My recommendation: 1-minor warning, then v3.0 hard removal. The agent benefits from seeing the warning AND understanding what to migrate to; removing on the same release confuses the migration story.

## Reverse evolution: what we lose

- **Ad-hoc `dryRun` semantics.** Call sites depending on the implicit "preview" behavior must migrate to `apply: false`. Migration impact: every mutating tool consumer.
- **Per-tool escape hatch tuning.** `confirm` on `clean_stale_markers` was a different semantic than `confirmPid` on `access_force_cleanup_orphaned`. The unified override is one semantic; per-tool nuances need to map onto it.
- **Implicit `tool_name → check_id` coupling.** With `implements_check` declared explicitly in the tool schema, tools that lacked a `check_id` (e.g., `link_tables`, `create_table`, `drop_table`) must be assigned one in Slice 3.

## Inverse: what we gain

- **One semantic for confirmation.** The agent learns one rule: "if the check says `requires_confirmation: true`, pass `confirmedRequiresConfirmation: true` and proceed. Otherwise, no override needed."
- **Static branching on `check_id`.** AI agents can pattern-match on identifiers (`'export_overwrites_source_precheck'`) without parsing human-readable message strings.
- **Audit reproducibility.** A finding in 2027 cross-references against the same `check_id` in v2.31.0 and v3.5.0. Stable identifiers outlive code reorganization.
- **Pluggable registry.** Tests + third-party modules can register their own checks via `DiagnosticCheckRegistry.register()` without forking dysflow. Future-proof for open extension points.
- **Single source of truth for `requires_confirmation`.** Verified by `rg` test (T3.4 acceptance): zero mentions outside `src/core/contracts/`.

## Architectural pre-mortem: Slice 3 risks

The dispatch seam is the single most critical hot path in dysflow — every MCP call goes through it. Slice 3 touches this. Risks:

1. **Performance regression.** `doctorCheckMetadata(checkId)` does a linear scan today. Under high call volume this could matter. Mitigation: convert to a Map-based registry or precomputed index in PR-3.
2. **Behavior change for callers who USE the escape hatches.** If those callers don't read deprecation warnings, they'll break on the next major bump. Mitigation: highlight in CHANGELOG; the deprecation envelope is loud (severity: warning + remediation.hint).
3. **Distinction between `requires_confirmation` and `severity`.** Some checks are `severity: critical` and `requires_confirmation: false` (e.g., `project_json_schema` — informational, no fix to apply). They should NOT block writes via the seam. The current design keeps them separate cleanly.
4. **Unknown `check_id` at the seam.** If a tool declares `implements_check: 'foo'` and `foo` isn't in `DOCTOR_CHECK_METADATA`, the seam should warn at startup, not at every call. Slice 3 can add a startup validator.

## Inverse: where engram already does this

For cross-reference, engram's `internal/diagnostic/registry.go` exhibits the same three-plane model (primitives in `internal/`, lifecycle hooks in `plugin/claude-code/scripts/`, workflow in `skills/memory-protocol/SKILL.md`). The dysflow épica mirrors this; the primitives come first.
