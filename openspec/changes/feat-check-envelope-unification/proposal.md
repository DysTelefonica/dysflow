# Proposal: feat-check-envelope-unification — Unify diagnostic check envelope with requires_confirmation policy

SDD: feat-check-envelope-unification
GitHub issue: TBD (open as part of this change)
Strict TDD: ACTIVE
Target version: v2.31.0 (post-merge minor bump on `main`)
Delivery: 3 slices. Slices 1+2 already landed on `feat/check-envelope-unification`. Slice 3 (dispatch seam unification) is pending and includes the deprecation cycle for the four escape hatches.
Branch: `feat/check-envelope-unification`

## Intent

Replace the four ad-hoc escape hatches (`dryRun` as planning signal, `confirm` for stale-markers, `confirmOverwriteSource` for export overlap, `confirmPid` for orphan cleanup) with a single declarative `requires_confirmation: boolean` field on every diagnostic check, plus a unified `confirmedRequiresConfirmation: true` override flag at the call site.

Each check ports its own enforcement policy. The agent reads `requires_confirmation: true` from the check_id and demands the override. One semantic. One seam. No more per-tool escape hatches.

This is the foundational slice of the runtime-autonomy épica (Round 17 prompt, `docs/prompts/prompt-ia-mantenedora-dysflow-round-17-2026-07-29.md`). The next épica slices — repair surface, `suggest_X` tools, progressive disclosure, `review_after` lifecycle, worktree hooks — all build on this contract.

## Current State

The 25 existing diagnostic checks (and 1 NEW check) are scattered across five surfaces with five different shapes:

| Surface | File | Shape |
|---|---|---|
| CLI category A (`project-config`) | `src/cli/commands/doctor/checks/project-config.ts` | `DoctorCategoryCheck` |
| CLI category B (`vba-structure`) | `src/cli/commands/doctor/checks/vba-structure.ts` | `DoctorCategoryCheck` |
| CLI category C (`runtime-consumer`) | `src/cli/commands/doctor/checks/runtime-consumer.ts` | `DoctorCategoryCheck` |
| CLI category D (`external-deps`) | `src/cli/commands/doctor/checks/external-deps.ts` | `DoctorCategoryCheck` |
| Supplementary OpenCode wiring | `src/cli/commands/opencode-mcp-wiring.ts` | `McpWiringCheck` |
| Supplementary codegraph drift | `src/cli/commands/codegraph-supplement-drift-check.ts` | `SupplementDriftDiagnostic` |
| MCP `diagnose` runner | `src/adapters/mcp/diagnose-tool.ts` | `DiagnoseCheck<TValue>` |
| PowerShell-routed legacy | `src/core/services/diagnostics-service.ts` | `AccessDiagnosticCheck` |

None carry a stable `check_id`, `reason_code`, `requires_confirmation`, or `safe_next_step`. The four ad-hoc escape hatches live in the dispatch seam (`src/adapters/mcp/dispatch-common.ts`): `dryRun`, `confirm`, `confirmOverwriteSource`, `confirmPid`.

Three readable gaps:

1. **The agent cannot branch programmatically.** Every check has different field names and no stable identifier — across the five surfaces, the same logical concept (e.g., "stale markers") is named three different ways.
2. **The runtime cannot enforce a uniform confirmation policy.** Every mutating tool invents its own escape mechanism, so the agent must learn four escape names for one intent.
3. **Audit reproducibility is impossible** without file:line archaeology. A `laccdb_locks` finding in 2027 cannot be cross-referenced against v2.30.0 findings without line numbers; a stable `check_id` solves this.

## Scope

### In scope

**Slice 1 (PR-1, landed as `0a369e6c`):** contract-only.

- Add `DiagnosticCheck`, `DiagnosticCheckResult`, `DiagnosticCategory`, `Severity`, `CheckId`, `ReasonCode` types to `src/core/contracts/diagnostic-check.ts`.
- Add `DiagnosticCheckRegistry`, `MutatingToolDeclaration`, `RequiresConfirmationOverride`, `RequiresConfirmationError` to `src/core/contracts/diagnostic-registry.ts`.
- 12 type-level tests in `test/core/contracts/diagnostic-check.test.ts` pin the contract shape.
- No behavior change. Backwards compatible 100%.

**Slice 2 (PR-2, landed as `7a0f5376`):** migrate the 25 existing + 1 new check.

- Extend `DoctorCategoryCheck` with four OPTIONAL fields (`check_id?`, `reason_code?`, `requires_confirmation?`, `category?`, `safe_next_step?`).
- Centralize check metadata in `DOCTOR_CHECK_METADATA` registry (26 entries; 5 mutating + 21 advisory). `doctorCheckMetadata(checkId)` lookup helper. **Decision captured post-hoc:** registry pattern (not in original spec) — sub-agent choice, accepted as defensible. See "Decisions captured" §5.
- Per-check construction sites spread `...doctorCheckMetadata(...)` to populate the fields.
- `McpWiringCheck` and `SupplementDriftDiagnostic` make the four metadata fields REQUIRED on their narrow types. **Deviation captured post-hoc:** only 2 literal return sites each; compile-time safety wins over optional flexibility.
- New `export_overwrites_source_precheck` check surfaces if configured `destinationRoot` overlaps source root. Read-only. `requires_confirmation: true`. Complements the existing `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` envelope (pre-flight vs hard refusal).
- `diagnose` MCP envelope gains `checks: DiagnoseCheck[]` populated by `buildDiagnoseChecks()`. Includes 11 unified entries (10 existing + NEW precheck via `pathOverlapsSourceRoot`).
- 5 additional tests in `test/core/contracts/diagnostic-check.test.ts` covering the migrated checks.

**Slice 3 (dispatch seam unification — PENDING):** promote to required and unify.

- Promote `DoctorCategoryCheck` optional fields to REQUIRED.
- Every mutating tool schema declares `implements_check: CheckId`.
- Dispatch seam reads `requires_confirmation` from the matched check and demands `confirmedRequiresConfirmation` override.
- Deprecate `dryRun: true` on mutating tools → `apply: false` + check-policy-driven demand.
- Deprecate `confirm: true`, `confirmOverwriteSource: true`, `confirmPid` → all become `confirmedRequiresConfirmation: true`.
- Typed `CONFIRMATION_REQUIRED` envelope at the seam.
- Migration cycle: deprecation warnings for one minor, then hard removal in the next major.

### Out of scope

- `apply: true` / `apply: false` commit polarity. Not escape hatches; canonical commit signal per #1167.
- Composition constraints (`apply:true` + `dryRun:true` → `MCP_INPUT_INVALID`). Already enforced via `compositionConstraints` in each schema.
- Repair surface (`doctor repair --plan --dry-run --apply`). Separate épica.
- Worktree lifecycle hooks (`post-worktree` plugin). Separate épica.
- `suggest_X` discovery API. Separate épica.
- Progressive disclosure 3-layer for `diagnose`. Separate épica.
- `review_after` lifecycle. Separate épica.

## Capabilities

### Modified capabilities

- **`src/cli/commands/doctor/checks/types.ts`** — `DoctorCategoryCheck` extended with 4 optional fields; `DoctorCheckMetadata` extracted; `DOCTOR_CHECK_METADATA` registry (26 entries) exposed; `doctorCheckMetadata(id)` helper.
- **`src/cli/commands/doctor/checks/{project-config,vba-structure,runtime-consumer,external-deps}.ts`** — every literal construction site spreads `...doctorCheckMetadata(...)`.
- **`src/cli/commands/opencode-mcp-wiring.ts`** — `McpWiringCheck` requires 4 metadata fields; spread at 2 return sites.
- **`src/cli/commands/codegraph-supplement-drift-check.ts`** — `SupplementDriftDiagnostic` requires 4 metadata fields; spread at 1 return site.
- **`src/core/services/diagnostics-service.ts`** — `AccessDiagnosticCheck` adds the 4 optional fields; mapper injects `diagnostics_powershell_router` metadata on every result.
- **`src/adapters/mcp/diagnose-tool.ts`** — `DiagnoseCheck<TValue>` interface added; `DiagnoseResult.checks` populated; `buildDiagnoseChecks()` consolidates runtime checks; NEW `pathOverlapsSourceRoot(destinationRoot, projectRoot)` for export-overlap precheck.
- **`src/adapters/mcp/contracts/bootstrap-result-contracts.ts`** — `diagnoseResultContract` schema includes `checks: unknownRecord[]`.

### New capabilities

- `src/core/contracts/diagnostic-check.ts` (PR 1).
- `src/core/contracts/diagnostic-registry.ts` (PR 1).
- `DOCTOR_CHECK_METADATA` registry with `doctorCheckMetadata(checkId)` lookup (PR 2).
- `export_overwrites_source_precheck` diagnostic check (PR 2).

## Approach

Per-slice approach with strict-TDD discipline. Each PR follows RED → GREEN → REFACTOR.

**Slice 1 (PR-1, landed):** contract-only. RED-first tests pin the shape; GREEN just writes the types. No behavior change. 12 type-level tests; `tsc -p tsconfig.json --noEmit` clean; 36/36 tests in `test/core/contracts/` green.

**Slice 2 (PR-2, landed):** the existing checks carry the new metadata. RED tests assert `requires_confirmation` populated per category; GREEN spreads `doctorCheckMetadata(...)` at each construction site and threads the values through.

The `DOCTOR_CHECK_METADATA` registry was a sub-agent choice. Rationale for accepting it: a registry gives a single source of truth that prevents drift between check_id assignments and the actual check implementation. Without it, the four spread points would each have to enumerate metadata separately, and any addition of a check_id would risk silent inconsistency. The registry makes the assignment audit-checkable.

**Slice 3 (PENDING):** the highest-risk slice because it touches the dispatch seam used by every mutating tool. RED-then-GREEN, gate-by-gate:

1. RED: vitest tests asserting (a) `dryRun: true` on mutating tool triggers `MCP_INPUT_INVALID` via `compositionConstraints` (already wired, just gates the new path), (b) `confirmedRequiresConfirmation: true` on `requires_confirmation: false` check → reject, (c) `confirmedRequiresConfirmation: false` on `requires_confirmation: true` check → reject with `CONFIRMATION_REQUIRED`, (d) `confirmedRequiresConfirmation: true` on `requires_confirmation: true` check → commit.
2. GREEN: dispatch seam looks up the matched check by `implements_check`, reads `requires_confirmation`, demands the override.

## Affected Areas

| File | Slice | Lines added/changed (net) |
|---|---|---|
| `src/core/contracts/diagnostic-check.ts` | 1 | +109 (new) |
| `src/core/contracts/diagnostic-registry.ts` | 1 | +61 (new) |
| `test/core/contracts/diagnostic-check.test.ts` | 1, 2 | +217 (new tests + restored lost test) |
| `src/cli/commands/doctor/checks/types.ts` | 2 | +185 (registry + spread helper) |
| `src/cli/commands/doctor/checks/project-config.ts` | 2 | +6 spread calls |
| `src/cli/commands/doctor/checks/vba-structure.ts` | 2 | +2 spread calls |
| `src/cli/commands/doctor/checks/runtime-consumer.ts` | 2 | +2 spread calls |
| `src/cli/commands/doctor/checks/external-deps.ts` | 2 | +2 spread calls |
| `src/cli/commands/opencode-mcp-wiring.ts` | 2 | +5 (required fields + spread) |
| `src/cli/commands/codegraph-supplement-drift-check.ts` | 2 | +3 (required fields + spread) |
| `src/core/services/diagnostics-service.ts` | 2 | +5 (optional fields + mapper) |
| `src/adapters/mcp/diagnose-tool.ts` | 2 | +130 (`DiagnoseCheck`, `buildDiagnoseChecks`, `pathOverlapsSourceRoot`) |
| `src/adapters/mcp/contracts/bootstrap-result-contracts.ts` | 2 | +2 (`checks: unknownRecord[]`) |
| `src/shared/validation/schema-props.ts` (Slice 3) | 3 | TBD (`confirmedRequiresConfirmation` opt) |
| `src/adapters/mcp/dispatch-common.ts` (Slice 3) | 3 | TBD (override demand + `CONFIRMATION_REQUIRED` envelope) |
| `src/adapters/mcp/dispatch-factory.ts` (Slice 3) | 3 | TBD (deprecation warnings on 4 flags) |

## Acceptance criteria

Each AC is verifiable by a vitest test, a tsc run, a vitest run, or a structured grep audit.

**Slice 1 (✓ landed):**

- [x] `src/core/contracts/diagnostic-check.ts` exports the 5 types (Severity, CheckId, ReasonCode, DiagnosticCategory, DiagnosticCheck, DiagnosticCheckResult).
- [x] `src/core/contracts/diagnostic-registry.ts` exports the 4 interfaces (DiagnosticCheckRegistry, MutatingToolDeclaration, RequiresConfirmationOverride, RequiresConfirmationError).
- [x] 12 type-level tests in `test/core/contracts/diagnostic-check.test.ts` pass.
- [x] Project-wide `tsc -p tsconfig.json --noEmit` clean.
- [x] 36/36 tests in `test/core/contracts/` pass (12 new + 24 existing).

**Slice 2 (✓ landed, partial audit pending):**

- [x] `DOCTOR_CHECK_METADATA` registry has 26 entries (file `src/cli/commands/doctor/checks/types.ts:25-182`).
- [x] 5 mutating checks (`attribute_vb_name`, `option_explicit`, `lacdb_locks`, `stale_markers`, `orphans_msaccess`, `export_overwrites_source_precheck`) carry `requires_confirmation: true`.
- [x] 21 advisory checks carry `requires_confirmation: false`.
- [ ] Project-wide `tsc -p tsconfig.json --noEmit` clean (verify after merge).
- [ ] `vitest run test/adapters/mcp/` (1812 tests in 145 files) regression (verify after merge).

**Slice 3 (PENDING):**

- [ ] `DoctorCategoryCheck` fields become REQUIRED.
- [ ] Every mutating tool input schema declares `implements_check: CheckId`.
- [ ] Dispatch seam: omitting `confirmedRequiresConfirmation` when check requires it returns `CONFIRMATION_REQUIRED`.
- [ ] `dryRun: true` on a mutating tool returns `MCP_INPUT_INVALID` with deprecation warning pointing to `apply: false`.
- [ ] `confirm: true`, `confirmOverwriteSource: true`, `confirmPid` all return `MCP_INPUT_INVALID` with deprecation warnings pointing to `confirmedRequiresConfirmation: true`.
- [ ] Zero `requiresConfirmation` mentions outside `src/core/contracts/` (single source of truth).

## Decisions captured

1. **snake_case for protocol-level fields.** Matches engram's `internal/diagnostic/registry.go` and allows JSON ↔ Go ↔ TS round-trips without a transform layer.
2. **`confirmedRequiresConfirmation` as the unified override flag** (literal-typed in `MutatingToolDeclaration.accepts_override`). Distinguishes from any escape hatch and aligns with the existing `acknowledgeCompilePending` pattern in dysflow.
3. **`DOCTOR_CHECK_METADATA` registry + `doctorCheckMetadata(id)` lookup** (sub-agent choice, accepted post-hoc). Single source of truth for check metadata; prevents drift between `check_id` assignments and the actual check implementation.
4. **`McpWiringCheck` and `SupplementDriftDiagnostic` make the 4 fields REQUIRED at the type level.** Only 2 literal return sites each; compile-time safety wins over optional flexibility.
5. **5 `DiagnosticCategory` values** (`projectConfig | source | runtimeConsumer | externalDeps | safety`) matching the existing dysflow doctor category file layout exactly. `safety` is the only new addition for cross-cutting checks (HR-2/HR-3/HR-4: kill-ban, prod-backend, foreign-PID).
6. **`category` optional in PR-1, will be required after Slice 3 lands.** Staged rollout for backwards compat with consumers that build checks ad-hoc.
7. **`export_overwrites_source_precheck` is a NEW check.** Read-only pre-flight, complements the existing `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` hard refusal that fires at apply time. The precheck surfaces the risk BEFORE the agent plans an export.

## Open questions for the dysflow maintainer

These were raised by the PR-2 sub-agent. Need explicit OK before Slice 3 starts.

1. **`opencode_mcp_wiring` and `codegraph_supplement_drift` should flip `requires_confirmation: true`?** Both currently `warnOnly` and only render ⚠. If Slice 3 promotes them to actionable fixes, both flags should follow; otherwise they stay advisory.

2. **`diagnostics_powershell_router` should participate in the confirmation gate** when `crossProcessLock.active` is `true`? Today it's `false` by default. The PowerShell runner CAN kill processes via `cross-process-lock.ts`. If the gate should be active when the lock is engaged, the registry entry becomes a function-of-state rather than a static boolean.

3. **`checks: DiagnoseCheck[]` field expansion** is additive but expands the envelope surface area. Any consumer that pins the exact field count (`Object.keys(result).length === N`) will break. Searched the test suite — none found. Verify with `codegraph-vba` consumers that surface `diagnose` results to AI agents before merge.

4. **`export_overwrites_source_precheck` policy** when both it and `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` fire — treat the precheck as "must confirm before I even plan an export", or only as a hint? Different policies; need a decision.

5. **Slice 3 deprecation cycle** — 1 minor deprecation warning before removing `dryRun`, `confirm`, `confirmOverwriteSource`, `confirmPid`? Or hard removal in v2.31 (since none have shipped as a clean escape hatch yet)?
