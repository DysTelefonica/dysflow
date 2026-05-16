# Design: Core Utils Extraction

## Overview

Centralize 6 duplicated helpers (`REDACTED_SECRET`, `isRecord`, `stringValue`, `sanitizeSecrets`, `readJsonFileSync`, `readJsonFileAsync`) into a single flat module at `src/core/utils/index.ts`. Pure structural refactor — no behavior changes observable to any caller.

## Architecture Approach

**Pattern**: Shared kernel module within the core layer. Adapters and other core modules import from `core/utils` via standard module paths. The existing `test/architecture/core-boundary.test.ts` already enforces that `core/utils` cannot import from adapters or HTTP — no new boundary rules required.

**Layering**:

```
src/adapters/mcp/{tools.ts, stdio.ts}        ─┐
src/core/services/vba-sync-legacy-service.ts ─┤
src/core/runner/access-runner.ts             ─┼─► src/core/utils/index.ts
src/core/config/dysflow-config.ts            ─┘
```

All edges point inward (adapters → core/utils, core → core/utils). No utility ever reaches outward. Boundary enforcement is automatic via the existing core-boundary test.

## Module Structure

### Decision 1: Flat single-file module

`src/core/utils/index.ts` — one file, ~40 lines of logic, 6 named exports.

**Rationale**: Splitting into `type-guards.ts`, `string-utils.ts`, `secret-utils.ts`, `json-utils.ts`, plus a barrel `index.ts` would create 5 files for ~40 lines of code. The split adds navigation cost (open file → trace re-export → open real file) without solving any real problem: there is no internal coupling between groups, no risk of one group growing faster than others, and no testing seam that demands separation.

**Trigger for revisit**: when the file exceeds ~150 lines of logic OR when any single logical group (e.g. string utilities) grows past ~3 functions. At that point, split by concern AND keep `index.ts` as a barrel for back-compat.

**Rejected alternative — multi-file split now**: Premature. Optimizes for hypothetical future growth at the cost of present-day clarity.

### Decision 2: `readJsonFile` — two distinct exports

```typescript
export function readJsonFileSync<T>(path: string): T
export function readJsonFileAsync<T>(path: string): Promise<T>
```

- `readJsonFileSync` uses `readFileSync` from `node:fs`. Required because `loadDysflowConfig` is synchronous (runs at startup before async machinery is wired) and cannot be made async without propagating `await` through dozens of call-sites.
- `readJsonFileAsync` uses `readFile` from `node:fs/promises`. Used by `vba-sync-legacy-service.ts`, which is already async end-to-end.

**Rationale**: The two variants have different semantics (sync vs async) and cannot be unified behind a single signature without either (a) blocking the event loop in async contexts or (b) forcing async propagation through the sync startup path. Both costs are larger than maintaining two named exports.

**Rejected alternative — single `readJsonFile` returning `T | Promise<T>`**: TypeScript supports it via overloads, but it leaks the sync/async choice into every caller's type narrowing and provides no real benefit.

**Rejected alternative — sync-only**: Would force `vba-sync-legacy-service.ts` to use blocking I/O in async paths. Regression.

**Rejected alternative — async-only**: Would force `loadDysflowConfig` to become async — large propagation refactor outside this change's scope.

### Decision 3: `sanitizeSecrets` unification with empty-string guard

Current divergent state:

- `sanitizePowerShellOutput(value, secrets)` in `access-runner.ts`: guards `secret.length === 0` before replacing.
- `sanitize(value, secrets)` in `vba-sync-legacy-service.ts`: no empty-secret guard.

Design:

```typescript
export function sanitizeSecrets(value: string, secrets: readonly string[]): string {
  let result = value;
  for (const secret of secrets) {
    if (secret.length === 0) continue;  // adopted from access-runner
    result = result.split(secret).join(REDACTED_SECRET);
  }
  return result;
}
```

**Rationale**: The empty-string guard is the safer behavior. Without it, `"".split("")` produces `[]` and `[].join(REDACTED)` produces `""`, silently wiping the input. Adopting the guard is a strict improvement; the only behavior change is when a caller passes an empty secret, which no current caller does.

**Back-compat shim** in `access-runner.ts`:

```typescript
export { sanitizeSecrets as sanitizePowerShellOutput } from "../utils/index.js";
```

This preserves the import path `sanitizePowerShellOutput` used by existing tests so they don't need to change.

**Rejected alternative — drop the back-compat shim, rename test imports**: Increases blast radius (more files changed) without any technical benefit. The shim is one line.

### Decision 4: `normalizeNameValue` / `normalizePathValue` → `stringValue` rename

`dysflow-config.ts` currently has `normalizeNameValue` and `normalizePathValue`, both of which accept `string | undefined`. They are replaced by `stringValue(value: unknown): string | undefined` from utils.

**Type-safety analysis**: `unknown` is a supertype of `string | undefined`, so every existing call-site that passes a `string | undefined` (or any other value) remains type-safe. No `as` casts required. TypeScript validates this at compile time — if any call-site breaks, `pnpm build` fails immediately.

**Rejected alternative — keep both names as aliases**: Adds noise without value. The rename is mechanical and improves vocabulary consistency across the codebase.

### Decision 5: `isRecord` type predicate signature

Use `value is Record<string, unknown>` (not `value is { [key: string]: unknown }`).

```typescript
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

**Rationale**: `Record<string, unknown>` is the idiomatic TypeScript form, displays cleanly in tooltips, and matches what most callers expect when narrowing. The 4 current copies use both forms inconsistently; standardizing on `Record<string, unknown>` removes the inconsistency.

**Rejected alternative — `{ [key: string]: unknown }`**: Functionally equivalent but verbose and less idiomatic.

## Component Map

| Component | Responsibility | Exports |
|-----------|---------------|---------|
| `src/core/utils/index.ts` | Shared primitives — no domain logic | `REDACTED_SECRET`, `isRecord`, `stringValue`, `sanitizeSecrets`, `readJsonFileSync`, `readJsonFileAsync` |
| `src/core/config/dysflow-config.ts` | Loads `.dysflow.json`; sync | Consumer of `isRecord`, `stringValue`, `readJsonFileSync` |
| `src/core/runner/access-runner.ts` | Spawns PowerShell, sanitizes output | Consumer of `sanitizeSecrets`, `REDACTED_SECRET`; re-exports `sanitizePowerShellOutput` |
| `src/core/services/vba-sync-legacy-service.ts` | Async VBA sync workflow | Consumer of `isRecord`, `stringValue`, `sanitizeSecrets`, `readJsonFileAsync` |
| `src/adapters/mcp/tools.ts` | MCP tools adapter | Consumer of `isRecord`, `stringValue` |
| `src/adapters/mcp/stdio.ts` | MCP stdio adapter | Consumer of `isRecord` |
| `test/core/utils/utils.test.ts` | Unit tests for utils | New — pure unit tests, no mocks |

## Data Flow

```
Startup path (sync):
  bootstrap → loadDysflowConfig → readJsonFileSync → isRecord/stringValue → Config object

Runtime path (async):
  MCP request → tools.ts/stdio.ts → isRecord/stringValue → adapter logic
                                  ↓
  vba-sync-legacy-service.ts → readJsonFileAsync → isRecord/stringValue → sanitizeSecrets → result
                                                                       ↑
  access-runner.ts → spawn PS → sanitizePowerShellOutput (= sanitizeSecrets) ──┘
```

No new data flow paths. The refactor only changes WHERE the primitive lives, not WHEN it runs or WHAT it does.

## Integration Points

| Integration | Direction | Mechanism |
|-------------|-----------|-----------|
| `core/utils` → `node:fs` | Outbound | `import { readFileSync } from "node:fs"` |
| `core/utils` → `node:fs/promises` | Outbound | `import { readFile } from "node:fs/promises"` |
| Core modules → `core/utils` | Inbound | `import { ... } from "../utils/index.js"` |
| Adapters → `core/utils` | Inbound | `import { ... } from "../../core/utils/index.js"` |
| `access-runner.ts` → `sanitizePowerShellOutput` (shim) | Re-export | `export { sanitizeSecrets as sanitizePowerShellOutput } from "../utils/index.js"` |

All `.js` suffix imports (ESM convention used throughout this project).

## Migration Strategy — Compile-Driven

The migration is mechanical and incremental. Each file is migrated independently and validated before moving on:

1. **Create** `src/core/utils/index.ts` with all 6 exports + `test/core/utils/utils.test.ts` with unit tests. Run `pnpm test` — utils tests pass.
2. **Migrate `dysflow-config.ts`**: delete local helpers, add utils import, rename `normalizeNameValue`/`normalizePathValue` call-sites to `stringValue`. Run `pnpm build` → `pnpm test`. Both pass.
3. **Migrate `access-runner.ts`**: delete local `REDACTED_SECRET` and `sanitizePowerShellOutput` body; add `import { sanitizeSecrets } from "../utils/index.js"` and the back-compat re-export. Run `pnpm build` → `pnpm test`. Both pass.
4. **Migrate `vba-sync-legacy-service.ts`**: delete local `isRecord`, `stringValue` variants, `sanitize`, and `readJsonFile`; import from utils. Run `pnpm build` → `pnpm test`. Both pass.
5. **Migrate `tools.ts`**: delete local `isRecord`, `stringValue`; import from utils. Run `pnpm build` → `pnpm test`. Both pass.
6. **Migrate `stdio.ts`**: delete local `isRecord`; import from utils. Run `pnpm build` → `pnpm test`. Both pass.

**Validation gates** at every step:

- `pnpm build` (`tsc --noEmit`) catches any type errors from the `unknown`-widening of `stringValue` (none expected).
- `pnpm test` (vitest run) confirms all behavior is preserved AND that `test/architecture/core-boundary.test.ts` continues to enforce the boundary.

**Rollback**: revert per-file commits. Each migration step is self-contained.

## Testing Strategy

### New test file: `test/core/utils/utils.test.ts`

Pure unit tests — no mocks, no I/O stubs needed (except for `readJsonFile*` which can use real tmp files via `node:fs.mkdtempSync`).

Coverage targets:

| Export | Test cases |
|--------|-----------|
| `REDACTED_SECRET` | Exported constant equals expected string |
| `isRecord` | true for `{}`, `{ a: 1 }`; false for `null`, `undefined`, `[]`, `"x"`, `1`, `true` |
| `stringValue` | Returns string for `"x"`; returns `undefined` for `null`, `undefined`, `1`, `{}`, `[]` |
| `sanitizeSecrets` | Replaces each secret with `REDACTED_SECRET`; skips empty secrets; handles secrets not present in input; handles multiple occurrences |
| `readJsonFileSync` | Parses real tmp JSON file; throws on invalid JSON; throws on missing file |
| `readJsonFileAsync` | Parses real tmp JSON file; rejects on invalid JSON; rejects on missing file |

### Existing tests

- `test/architecture/core-boundary.test.ts` — already passes; covers `src/core/utils/` recursively. No changes needed.
- All caller tests (config, runner, vba-sync, MCP) — must continue to pass unchanged. They validate that observable behavior is preserved.

## ADR Summary

| ID | Decision | Status | Rationale |
|----|----------|--------|-----------|
| ADR-1 | Flat single-file module | Accepted | ~40 lines of logic; splitting is premature |
| ADR-2 | Two `readJsonFile` exports (sync + async) | Accepted | Sync config startup cannot be made async without large refactor |
| ADR-3 | `sanitizeSecrets` adopts empty-secret guard | Accepted | Strictly safer; no behavior change for current callers |
| ADR-4 | Rename `normalizeNameValue` → `stringValue` | Accepted | Type-safe widening; improves vocabulary consistency |
| ADR-5 | `isRecord` uses `Record<string, unknown>` predicate | Accepted | Idiomatic TS form; standardizes 4 inconsistent copies |
| ADR-6 | Compile-driven incremental migration | Accepted | One file per step; `tsc` + `vitest` are the gates |
| ADR-7 | Keep `sanitizePowerShellOutput` re-export in `access-runner.ts` | Accepted | Preserves test import paths without behavior change |

## Open Questions / Assumptions

- **Assumed**: No caller currently passes an empty string as a secret to `sanitizePowerShellOutput` or `sanitize`. If any does, the new guard skips it instead of silently wiping output — strictly safer, but a behavior delta worth flagging during apply/verify.
- **Assumed**: ESM `.js` import suffix convention applies to the new utils file. (Confirmed by current import style across `src/core/*`.)
- **Assumed**: `pnpm` is the active package manager. (Confirmed by `pnpm-lock.yaml` in repo root.)

## Risks (Architectural)

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| New utils file accidentally imports an adapter or HTTP module | Low | Build fails | `test/architecture/core-boundary.test.ts` catches at test time |
| `unknown`-widening of `stringValue` breaks a caller's narrowing chain | Low | Build fails | `tsc --noEmit` catches before commit |
| Empty-secret guard delta affects an undocumented caller | Low | Behavior delta | Unit tests cover the guard explicitly; verify step audits caller usage |
| File split is wrong abstraction (single file becomes a god-module) | Low | Slows future change | Trigger at ~150 lines / 3+ functions per group — documented in ADR-1 |
