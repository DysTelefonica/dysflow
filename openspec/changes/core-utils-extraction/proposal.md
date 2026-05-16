# Proposal: Core Utils Extraction

Closes #64

## Intent

Four utility helpers (`REDACTED_SECRET`, `isRecord`, `stringValue`/`normalizeNameValue`, `readJsonFile`) plus a `sanitize` routine are copy-pasted across 3-5 files in `src/core/` and `src/adapters/mcp/`. Each copy drifts: `isRecord` has two equivalent-but-different type predicates, `sanitizePowerShellOutput` guards empty secrets while vba-sync `sanitize` does not, and the redaction constant is inlined in one place. This proposal centralizes these helpers under `src/core/utils/` to eliminate drift, make secret redaction consistent, and give future code one obvious place to import shared primitives.

## Scope

### In Scope
- Create `src/core/utils/index.ts` (flat, single file) exporting: `REDACTED_SECRET`, `isRecord`, `stringValue`, `sanitizeSecrets`, `readJsonFileSync`, `readJsonFileAsync`
- Replace duplicate definitions in `dysflow-config.ts`, `access-runner.ts`, `vba-sync-legacy-service.ts`, `tools.ts`, `stdio.ts` with imports from `src/core/utils/index.js`
- Rename `normalizeNameValue` / `normalizePathValue` call sites in `dysflow-config.ts` to `stringValue`
- Unify `sanitizePowerShellOutput` (access-runner) and `sanitize` (vba-sync) onto `sanitizeSecrets(value, secrets)` using `REDACTED_SECRET`; keep a thin `sanitizePowerShellOutput` re-export in `access-runner.ts` to preserve the public API for existing test imports
- Verify the existing `test/architecture/core-boundary.test.ts` continues to pass (it already covers `src/core/utils/`)

### Out of Scope
- Splitting utils into multiple files (`type-guards.ts`, `string-utils.ts`, etc.) — premature at ~25 lines of logic
- Converting `loadDysflowConfig` to async (would force `readJsonFileSync` callers to async — large refactor)
- Extracting single-file helpers (`pickFirstDefined`, `truthy`, `stringArrayValue` variants) — not duplicates
- Modifying behavior of any caller — pure structural refactor

## Capabilities

### New Capabilities
None.

### Modified Capabilities
None — this is a pure internal refactor. No spec-level behavior changes: configuration loading, secret redaction, JSON parsing, and adapter parsing all keep identical observable behavior. No requirements added, removed, or altered.

## Approach

Single flat module at `src/core/utils/index.ts` exporting all helpers. Callers import via `"../utils/index.js"` (core) or `"../../core/utils/index.js"` (adapters). The dependency direction (adapters → core/utils) is already legal and is enforced automatically by the existing core-boundary test. `readJsonFile` is exposed as two named exports (`readJsonFileSync`, `readJsonFileAsync`) because `dysflow-config.ts` intentionally uses sync I/O at startup and converting to async cascades. `sanitizeSecrets` adopts the safer `secret.length === 0` guard from `access-runner.ts`.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/utils/index.ts` | New | New module with 6 named exports |
| `src/core/config/dysflow-config.ts` | Modified | Remove 5 local helpers, import from utils, rename callers |
| `src/core/runner/access-runner.ts` | Modified | Remove `REDACTED_SECRET`, re-export `sanitizePowerShellOutput` as thin wrapper over `sanitizeSecrets` |
| `src/core/services/vba-sync-legacy-service.ts` | Modified | Remove 4 local helpers + private `sanitize`/`readJsonFile`, use utils |
| `src/adapters/mcp/tools.ts` | Modified | Remove local `isRecord`, `stringValue`; import from core/utils |
| `src/adapters/mcp/stdio.ts` | Modified | Remove local `isRecord`; import from core/utils |
| `test/architecture/core-boundary.test.ts` | None | Already covers `src/core/utils/` recursively |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `sanitizePowerShellOutput` public API breaks test imports | Medium | Keep thin re-export in `access-runner.ts` |
| Behavior drift between vba-sync `sanitize` and unified `sanitizeSecrets` (empty-secret guard) | Low | Adopt the guarding behavior (safer; only changes behavior when callers pass empty strings, which they currently don't) |
| `stringValue(unknown)` replacing `normalizeNameValue(string | undefined)` widens input type | Low | `unknown` is a supertype of `string | undefined`; all existing callers remain type-safe |
| Import path churn across 5 files | Low | Mechanical; tsc + existing tests catch regressions |
| Architecture boundary violation in new utils file | Low | Existing boundary test fails the build immediately if utils imports adapters or HTTP |

## Rollback Plan

Revert the commit(s). The change is mechanical and self-contained — no data migrations, no config changes, no API surface changes externally. If `sanitizePowerShellOutput` consumers break, restore the original function body in `access-runner.ts` and delete the re-export.

## Dependencies

None. No new packages, no version bumps, no environment changes.

## Success Criteria

- [ ] `src/core/utils/index.ts` exists with 6 named exports
- [ ] Zero duplicate definitions of `isRecord`, `stringValue`, `REDACTED_SECRET`, `readJsonFile` across `src/`
- [ ] `access-runner.ts` still exports `sanitizePowerShellOutput` (back-compat shim)
- [ ] `pnpm test` (or project test command) passes, including `test/architecture/core-boundary.test.ts`
- [ ] `tsc --noEmit` passes with no new errors
- [ ] No behavioral change observable from any existing caller
