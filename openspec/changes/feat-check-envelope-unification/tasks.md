# tasks.md — feat-check-envelope-unification

Strict TDD tasks (RED → GREEN → REFACTOR). Slices 1+2 are landed; Slice 3 (dispatch seam unification) is pending until the 5 open questions in `proposal.md` are resolved.

## Slice 1 — Contract types [PR-1, LANDED `0a369e6c`]

- [x] **T1.1 — RED:** write 12 type-level tests asserting the contract shape; tests fail until types exist.
- [x] **T1.2 — GREEN:** write `src/core/contracts/diagnostic-check.ts` (Severity, CheckId, ReasonCode, DiagnosticCategory, DiagnosticCheck, DiagnosticCheckResult) and `src/core/contracts/diagnostic-registry.ts` (DiagnosticCheckRegistry, MutatingToolDeclaration, RequiresConfirmationOverride, RequiresConfirmationError).
- [x] **T1.3 — VERIFY:** `tsc -p tsconfig.json --noEmit` clean; 36/36 tests in `test/core/contracts/` green; full `vitest` run clean.

## Slice 2 — Migrate 25 existing checks + 1 NEW check [PR-2, LANDED `7a0f5376`]

- [x] **T2.1 — RED:** tests assert 5 mutating checks (`attribute_vb_name`, `option_explicit`, `lacdb_locks`, `stale_markers`, `orphans_msaccess`, `export_overwrites_source_precheck`) carry `requires_confirmation: true`; 21 advisory checks carry `false`.
- [x] **T2.2 — GREEN:** extend `DoctorCategoryCheck` with 4 optional fields (`check_id?`, `reason_code?`, `requires_confirmation?`, `category?`, `safe_next_step?`).
- [x] **T2.3 — GREEN:** build `DOCTOR_CHECK_METADATA` registry (26 entries) + `doctorCheckMetadata(checkId)` lookup helper in `src/cli/commands/doctor/checks/types.ts:25-188`.
- [x] **T2.4 — GREEN:** spread `...doctorCheckMetadata(...)` at every literal construction site across 8 files: `project-config.ts`, `vba-structure.ts`, `runtime-consumer.ts`, `external-deps.ts`, `opencode-mcp-wiring.ts`, `codegraph-supplement-drift-check.ts`, `diagnostics-service.ts`, `diagnose-tool.ts`.
- [x] **T2.5 — GREEN:** `McpWiringCheck` makes the 4 metadata fields REQUIRED; spread at 2 return sites.
- [x] **T2.6 — GREEN:** `SupplementDriftDiagnostic` makes the 4 metadata fields REQUIRED; spread at 1 return site.
- [x] **T2.7 — GREEN:** NEW `export_overwrites_source_precheck` check in `diagnose-tool.ts` via `pathOverlapsSourceRoot(destinationRoot, projectRoot)`. Read-only pre-flight. Complements `EXPORT_OVERWRITES_SOURCE_REQUIRES_CONFIRMATION` hard refusal.
- [x] **T2.8 — GREEN:** `diagnose` MCP envelope gains `checks: DiagnoseCheck[]` populated by `buildDiagnoseChecks()`; `DiagnoseResult` schema in `bootstrap-result-contracts.ts` accepts `unknownRecord[]`.
- [ ] **T2.9 — VERIFY (pending retroactive re-run):** `tsc -p tsconfig.json --noEmit` clean; `vitest run test/adapters/mcp/` clean (1812 tests in 145 files); full suite clean.

## Slice 3 — Dispatch seam unification [PENDING]

The highest-risk slice. TDD gate-by-gate. **DO NOT START until the 5 open questions in `proposal.md` are answered by the maintainer.**

### T3.1 — RED: dispatch seam rejects missing override

```ts
// test/adapters/mcp/dispatch-confirmation-required.test.ts
import { describe, it, expect } from 'vitest';

describe('dispatch seam — requires_confirmation demand', () => {
  it('rejects mutating tool without confirmedRequiresConfirmation when check requires it', async () => {
    const result = await client.call('export_modules', {
      apply: true,
      destinationRoot: '/path/that/overlaps/source',
    });
    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe('CONFIRMATION_REQUIRED');
    expect(result.error?.check_id).toBe('export_overwrites_source_precheck');
    expect(result.error?.remediation).toBeDefined();
  });

  it('rejects confirmedRequiresConfirmation: true on a requires_confirmation: false check', async () => {
    const result = await client.call('test_vba', {
      testsPath: 'tests/tests.vba.json',
      apply: true,
      confirmedRequiresConfirmation: true,
    });
    expect(result.isError).toBe(true);
    expect(result.error?.code).toBe('CONFIRMATION_NOT_NEEDED');
  });
});
```

### T3.2 — GREEN: dispatch seam looks up implements_check

In `src/adapters/mcp/dispatch-common.ts:~230`, after parameter validation:
```ts
const toolImpl = lookupMutatingTool(toolName);
if (toolImpl?.implements_check) {
  const check = doctorCheckMetadata(toolImpl.implements_check);
  if (check.requires_confirmation && !params.confirmedRequiresConfirmation) {
    return buildConfirmationRequiredError(check);
  }
  if (!check.requires_confirmation && params.confirmedRequiresConfirmation) {
    return buildConfirmationNotNeededError(check);
  }
}
```

### T3.3 — RED + GREEN: deprecation warnings on the 4 escape hatches

Add `description` field to each deprecated flag pointing to the replacement. Returns `MCP_INPUT_INVALID` with `remediation.hint` referencing `apply: false` (for `dryRun`) or `confirmedRequiresConfirmation: true` (for `confirm`, `confirmOverwriteSource`, `confirmPid`).

| Flag | Replacement | Hint |
|---|---|---|
| `dryRun: true` | `apply: false` | "Use `apply: false`; the check `requires_confirmation: true` determines whether the call needs the override." |
| `confirm: true` | `confirmedRequiresConfirmation: true` | "Pass `confirmedRequiresConfirmation: true`; the agent reads the check's `requires_confirmation` policy." |
| `confirmOverwriteSource: true` | `confirmedRequiresConfirmation: true` | "Same as above; the precheck `export_overwrites_source_precheck` informs the policy." |
| `confirmPid` | `confirmedRequiresConfirmation: true` | "Same as above; the check `orphans_msaccess` (or related safety check) determines policy." |

Hand-rolled for v2.31; hard removal in v3.0 (decision pending — see open question #5 in `proposal.md`).

### T3.4 — VERIFY (Slice 3 acceptance)

- [ ] `confirmedRequiresConfirmation: true` accepted on `requires_confirmation: true` checks.
- [ ] `confirmedRequiresConfirmation: true` rejected on `requires_confirmation: false` checks (`CONFIRMATION_NOT_NEEDED`).
- [ ] `confirmedRequiresConfirmation: undefined` rejected on `requires_confirmation: true` checks (`CONFIRMATION_REQUIRED`).
- [ ] All 4 escape hatches return `MCP_INPUT_INVALID` with `remediation.hint` pointing to replacement.
- [ ] Zero `requiresConfirmation` mentions outside `src/core/contracts/` (single source of truth verified by `rg "requiresConfirmation|requires_confirmation" src/ | grep -v contracts/`).
- [ ] `tsc -p tsconfig.json --noEmit` clean.
- [ ] `vitest run` clean across all suites.

## Cross-cutting

- [ ] CHANGELOG.md entry per Slice 3 merge ("feat(dispatch): unified `requires_confirmation` policy; deprecated `dryRun`/`confirm`/`confirmOverwriteSource`/`confirmPid` in mutating tools").
- [ ] `docs/prompts/prompt-ia-mantenedora-dysflow-round-17-2026-07-29.md` referenced in the changelog as the originating design context (already on disk).
- [ ] 5 open questions in `proposal.md` resolved with maintainer BEFORE Slice 3 starts.
- [ ] `openspec/specs/` updates per Round 17's spec evolution plan (separate task in the runtime-autonomy rollout doc).
