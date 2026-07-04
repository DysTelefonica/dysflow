# Proposal: Runtime Path Safety — Audit-Driven Hardening

## Intent

Close three related path-safety holes from the 2026-07-01 full-repo audit
(filed as issue #619). Same family as historical incident #13228 (186
files overwritten in the installed runtime). AGENTS.md hard rule:
**never mutate the dysflow production runtime directory**. The fixes
make that rule hold for the call paths the existing
`isWithinRuntime` guard does NOT cover.

## Scope

### In Scope

- **F1 (🔴)** Move the `isWithinRuntime` guard in
  `src/adapters/vba-sync/vba-modules-adapter.ts` from a
  post-write prune-only check (lines 466-478) to a pre-write check
  on the **resolved `destinationRoot`** for `export_modules` and
  `export_all` (currently only fires for explicit `exportPath`,
  lines 198-213). Mirror the pattern at `vba-forms-adapter.ts:427-442`.
- **F2 (🔴)** In `src/core/config/execution-target.ts` branch 2
  (lines 93-106), propagate every caller override the typed
  `ExecutionTarget` declares but the literal return object drops
  (`backendPath`, `allowWrites`, `allowedProcedures`, full
  `accessDbPath` semantics). Same family as #13228 — silent override
  loss.
- **F3 (🟡)** In `src/core/config/dysflow-config.ts` `buildProjectConfig`
  (lines 280-282), route `destinationRoot` (and symmetry: the other
  three path fields that already go through `stringValue()` in
  `buildExplicitConfig`) through `stringValue()` before the `??`
  test, mirroring `buildExplicitConfig:222`. Stop the silent
  empty-string override win.
- **F4 (🟡)** Remove `.frm` from `MANAGED_CODE_EXTENSIONS`
  (`vba-modules-adapter.ts:117`) so prune only deletes the
  documented allow-list (`.bas/.cls/.form.txt/.report.txt`). Audit
  revealed `.frm` was pruneable but never documented.

### Out of Scope

- New MCP tools, schema changes, CLI surface changes, or feature work.
- The legacy Access `.frm` legacy-binary path (still used by
  non-SaveAsText projects): removing the prune entry just stops
  pruning them, not reading them.
- Refactors that move `resolveProjectPath` semantics.
- The `dispatch-common.ts` / `stdio.ts` callers — they already
  forward the overrides correctly; the bug is in resolution.

## Capabilities

### New Capabilities
None.

### Modified Capabilities

- **`vba-manager-actions`**: Add the "Runtime-Safe Export Write"
  requirement (any `export_modules` / `export_all` whose resolved
  `destinationRoot` falls inside the production runtime MUST be
  refused before PowerShell is invoked). Add the
  "Prune Allow-List Parity" requirement
  (`MANAGED_CODE_EXTENSIONS` MUST equal the AGENTS.md allow-list).
- **`core-configuration`**: Add the "Override Precedence" requirement
  (caller-supplied overrides MUST win over repo-config defaults
  uniformly across all four path fields; empty strings MUST be
  normalized to `undefined` before precedence resolution) — closes
  the remaining #13228 family defect.

## Approach

Each fix is a one-line correctness change backed by a failing
port-level test, in the same shape as
`test/adapters/vba-sync/runtime-guard-filesystem-writes.test.ts`.
Strict TDD: RED → GREEN → REFACTOR per PR.

Reference patterns to mirror:
- `src/adapters/vba-sync/vba-execution-adapter.ts:160-175` — guard
  resolves target then refuses.
- `src/adapters/vba-sync/vba-forms-adapter.ts:427-442` — guards both
  `sourcePath` and `destinationRoot`.
- `src/core/config/dysflow-config.ts:222` (`buildExplicitConfig`) —
  four-path `stringValue()` normalization to mirror.

NO E2E during this cycle (per 2026-07-01 cycle rule). Integration
tests in `test/integration/**` are allowed and encouraged where the
unit tests would couple too tightly to internals.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/adapters/vba-sync/vba-modules-adapter.ts` | Modified | Add pre-export resolveExecutionTarget guard (F1); remove `.frm` from `MANAGED_CODE_EXTENSIONS` (F4). |
| `src/core/config/execution-target.ts` | Modified | Branch 2 return literal: include `backendPath`, full config spread (F2). |
| `src/core/config/dysflow-config.ts` | Modified | `buildProjectConfig`: `stringValue()` before `??` for all four path fields (F3). |
| `test/adapters/vba-sync/vba-modules-adapter.test.ts` | Modified | RED→GREEN for F1 and F4. |
| `test/adapters/vba-sync/runtime-guard-filesystem-writes.test.ts` | Modified | RED→GREEN for F1's default-`destinationRoot` case. |
| `test/core/config/execution-target.test.ts` | Modified | RED→GREEN for F2 (branch 2 backendPath/pass-through). |
| `test/core/config/dysflow-config.test.ts` | Modified | RED→GREEN for F3 (empty-string normalization + override precedence). |
| `openspec/specs/vba-manager-actions/spec.md` | Modified | Delta requirements: runtime-safe export write, prune allow-list parity. |
| `openspec/specs/core-configuration/spec.md` | Modified | Delta requirements: override precedence, empty-string normalization. |

## Chain Split (force-chained PRs, 400-line budget)

Estimated total: 480-620 changed lines across all four fixes.
Each PR stays inside the budget and has its own rollback boundary.

| # | PR | Goal | Likely Δ | TDD evidence | Verification | Rollback |
|---|---|---|---|---|---|---|
| **1** | `[#619/1] F1: guard export_* on resolved destinationRoot` | Move pre-write guard before `executeMappedTool`; cover exportPath-less path | 150-200 | RED unit tests `runtime-guard-filesystem-writes.test.ts` + 1 E2E-skipping integration in `test/integration/**` | `pnpm test` (unit + integration); targeted fixture in real Access deferred to release phase | Revert; exportPath path still guarded |
| **2** | `[#619/2] F2: branch-2 override propagation` | Branch 2 in `execution-target.ts` returns full override set; `buildProjectConfig` `stringValue()` normalization (F3 ships here too — same config-resolve concern, single review) | 200-280 | RED unit `execution-target.test.ts` + `dysflow-config.test.ts` | `pnpm test` (unit + integration); verify override-precedence parity | Revert; F3 contracts removed but no write-path regression |
| **3** | `[#619/3] F4: prune allow-list parity` | Drop `.frm` from `MANAGED_CODE_EXTENSIONS`; align AGENTS.md documented allow-list | 60-100 | RED unit in `vba-modules-adapter.test.ts` for prune behavior + module-name key | `pnpm test`; integration prune test still passes | Revert; legacy `.frm` files remain pruneable |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| F1 guard fires for legitimate workdirs near runtime | Med | Mirror `DYSFLOW_HOME=test-runtime` exclusion from `runtime-dir.ts:72`; reuse `isWithinRuntime` (test-runtime outside resolved runtime is allowed). |
| F2 test couples to internal `dispatch` wiring | Low | Test at the `resolveExecutionTarget` entry port (already in `test/core/config/execution-target.test.ts`); no internal collaborator. |
| F3 empty-string normalization flips a caller that relied on `""` as a fallback marker | Low | Document that `""` is now treated as `undefined`; audit MCP dispatch callers — none currently rely on `""`. |
| F4 `.frm` removal breaks an old project that has live `.frm` source files | Low | `.frm` is a legacy binary format; current docs target `.form.txt`. Document in changelog. |
| Chained PRs land in same review window | Med | Each PR closed independently; merge gate stays on PR-level. |

## Rollback Plan

Each PR is independently revertable. The guards and `.frm`
removal are additive corrections — reverting restores prior
behavior without data loss.

## Dependencies

- Existing `isWithinRuntime` (`src/shared/runtime-dir.ts:72`).
- Existing test port `test/adapters/vba-sync/runtime-guard-filesystem-writes.test.ts`.
- Project conventions: strict TDD, force-chained PRs, 400-line budget,
  target branch `staging` (main gated until user UAT sign-off).

## Success Criteria

- [ ] **F1**: `export_modules` / `export_all` whose resolved
      `destinationRoot` falls inside the production runtime return
      `INVALID_INPUT` BEFORE `executeMappedTool` is invoked. Pin
      via `test/adapters/vba-sync/runtime-guard-filesystem-writes.test.ts`.
- [ ] **F2**: `resolveExecutionTarget` branch 2 returns the
      caller-supplied `backendPath` and full override set; when an
      override is provided alongside a runtime-default `accessPath`,
      the override wins. Pin via
      `test/core/config/execution-target.test.ts`.
- [ ] **F3**: `buildProjectConfig` normalizes empty-string overrides
      to `undefined` for `destinationRoot` / `accessDbPath` /
      `backendPath` / `projectRoot` before precedence resolution.
      Pin via `test/core/config/dysflow-config.test.ts`.
- [ ] **F4**: `MANAGED_CODE_EXTENSIONS` is exactly the documented
      allow-list (`.bas`, `.cls`); `.frm` is never pruned. AGENTS.md
      allow-list table updated. Pin via
      `test/adapters/vba-sync/vba-modules-adapter.test.ts`.
- [ ] `pnpm test` and `pnpm build` pass after each PR.
- [ ] Each PR's commit body carries `SDD: runtime-path-safety` and
      the issue number (#619) per `gentle-ai:sdd-commit-traceability`.

## Audit-precision notes (informed by reading code)

Findings confirmed with file:line below. Two audit assertions were
slightly imprecise; the proposed fix is unchanged but the
description is corrected:

- **File path correction**: audit named
  `src/core/services/dispatch/execution-target.ts`; actual path is
  `src/core/config/execution-target.ts`.
- **Branch-2 trigger**: audit said branch 2 fires "when
  `context.accessPath` is undefined"; the code says branch 2 fires
  when `context.accessPath !== undefined` (lines 93-106 are the
  `else` of the `context.accessPath === undefined` check at line 70).
  Either way the symptom (`backendPath` drop) is real and the fix
  is the same.
