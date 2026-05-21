# Technical Design: Convert raw throws to OperationResult failures

## Overview

Two `throw new Error(...)` sites inside the core layer escape the `OperationResult<T>` contract. The fix is a **boundary conversion** pattern: keep pure validators throwing internally where they already do (or remove the throw entirely where natural), and convert exceptions into typed `failureResult(createDysflowError(...))` at the nearest service-layer function that already returns `OperationResult<T>`.

No new modules, no new abstractions, no signature changes on public exports. The change surface is two functions plus their immediate callers, plus vitest coverage.

---

## Architecture Approach

### Pattern: Boundary Conversion at the Service Edge

The codebase already follows the rule "exceptions never cross the service boundary". The two regressions live in helpers that were added without that discipline. The fix is to restore the boundary at the smallest surface area:

- **Bug 1 (`findWorktreeProjectConfigPath`)**: move the ambiguity *detection* up into `loadDysflowConfig` (which already returns `OperationResult<DysflowConfig>`). The helper becomes a plain `string | undefined` lookup with no failure mode. This is the cheapest possible change.
- **Bug 2 (`resolveTestProceduresJson`)**: promote the helper itself to return `Promise<OperationResult<string>>` and wrap the parse/normalize pipeline in `try/catch`. `normalizeTestPlan` stays as the pure throwing validator — the boundary is the helper that owns I/O and orchestration.

Rationale for asymmetric treatment:

| Function | Why different |
|----------|---------------|
| `findWorktreeProjectConfigPath` | Pure filesystem lookup, no I/O failure modes worth modelling. Ambiguity is the *only* error condition and it can be checked equally well in the caller. Simplest possible fix. |
| `resolveTestProceduresJson` | Already does async I/O (`readFile`), JSON parsing, and validation — three independent failure modes. Promoting to `OperationResult<string>` lets a single `try/catch` collapse all three into one typed code without leaking implementation detail to `executeTestVba`. |

---

## Component Map

```
loadDysflowConfig (OperationResult<DysflowConfig>)
  ├── existsSync sweep over DEFAULT_PROJECT_CONFIG_FILENAMES  [NEW: ambiguity check here]
  │     → failureResult(CONFIG_AMBIGUOUS_PROJECT_FILE) on conflict
  └── findWorktreeProjectConfigPath(cwd): string | undefined   [CHANGED: no throw]

executeTestVba (OperationResult<unknown>)
  └── resolveTestProceduresJson(params): Promise<OperationResult<string>>  [CHANGED: promoted return type]
        ├── inline JSON path (procedureName)               → successResult(json)
        └── file path:
              try { readFile → JSON.parse → normalizeTestPlan → filter → stringify }
                → successResult(json)
              catch (err) → failureResult(VBA_INVALID_TEST_PLAN, err.message)
```

### Data Flow

**Bug 1 — config load:**
1. `loadDysflowConfig` reaches the worktree-config branch (no explicit path, no projectId, no env-pointed path).
2. Before delegating to `findWorktreeProjectConfigPath`, it resolves both candidate filenames and counts those that exist.
3. If two distinct candidates exist → `failureResult(CONFIG_AMBIGUOUS_PROJECT_FILE)` with the cwd and both paths in the message.
4. Otherwise delegates to the helper (which now just returns the first existing candidate or `undefined`).

**Bug 2 — test plan resolution:**
1. `executeTestVba` calls `await this.resolveTestProceduresJson(params)`.
2. The helper either returns inline JSON (procedureName branch — never fails) or runs the file pipeline.
3. The file pipeline is wrapped in one `try/catch`. Any of `readFile` ENOENT, `JSON.parse` syntax error, or `normalizeTestPlan` validation throw becomes one typed failure.
4. `executeTestVba` checks `result.ok`; on failure it returns `result` directly (already an `OperationResult<unknown>` with the same shape).

### Integration Points

- **Error codes** (`DysflowError.code` is `string`, no enum to update):
  - `CONFIG_AMBIGUOUS_PROJECT_FILE` — non-retryable. Surfaced by CLI/MCP/HTTP adapters as a config error users must resolve manually.
  - `VBA_INVALID_TEST_PLAN` — non-retryable. Surfaced when `tests.vba.json` is missing, unparseable, or malformed.
- **Caller invariants preserved**: all existing branches of `loadDysflowConfig` and `executeTestVba` continue to return the same `OperationResult<T>` shape; no adapter change required.

---

## ADR-style Decisions

### ADR-1 — Keep `findWorktreeProjectConfigPath` as `string | undefined`

**Context.** The helper currently throws on ambiguity. The proposal allows either a tagged return shape or moving the check into the caller.

**Decision.** Move ambiguity detection into `loadDysflowConfig`. Keep the helper signature unchanged (`string | undefined`).

**Rationale.**
- Smallest diff: zero callers besides `loadDysflowConfig`, so a tagged return adds ceremony without value.
- The helper becomes a pure filesystem lookup with one obvious responsibility.
- Ambiguity check sits next to the other `CONFIG_*` failure branches in `loadDysflowConfig`, improving locality.
- Test surface stays focused on `loadDysflowConfig` (the public API), not on an internal helper.

**Rejected alternatives.**
- **Tagged result `{ ok, path } | { ok: false, error }`.** Adds a discriminated union for a single caller; pure overhead.
- **Return `{ path?: string; ambiguous?: boolean }` (proposal's suggestion).** Two-field optional shape is harder to reason about than promoting the check upstream.

### ADR-2 — Promote `resolveTestProceduresJson` to `Promise<OperationResult<string>>`

**Context.** Three failure modes (file missing, JSON syntax, schema invalid) currently bubble up as raw exceptions through `executeTestVba`.

**Decision.** Change the return type from `Promise<string>` to `Promise<OperationResult<string>>`. Wrap the file-path branch in one `try/catch` that emits `VBA_INVALID_TEST_PLAN`.

**Rationale.**
- Makes the contract explicit at the type level — TypeScript prevents future regressions where a caller forgets to handle the failure.
- One catch block collapses three independent failure modes into one user-facing code, matching how other VBA tool failures are reported.
- The procedureName inline branch wraps trivially in `successResult` with no behaviour change.

**Rejected alternatives.**
- **Keep `Promise<string>`, wrap try/catch in `executeTestVba`.** Pushes error knowledge into the caller and keeps a function whose type lies about its failure modes. Violates the boundary rule.
- **Convert each throw inside `normalizeTestPlan` to `OperationResult`.** Would force every internal validation step to return a discriminated union, polluting a pure validator with transport concerns. Boundary belongs at the I/O edge.

### ADR-3 — Leave `normalizeTestPlan` unchanged

**Context.** `normalizeTestPlan` has three throw sites for schema violations.

**Decision.** Do not modify `normalizeTestPlan`. Its throws are caught by the `resolveTestProceduresJson` boundary.

**Rationale.**
- `normalizeTestPlan` is a pure validator with no I/O — exceptions are the natural in-function failure mode for invalid input.
- Changing it would force a return-type cascade through any future caller (none exist today, but the abstraction is cleaner).
- Single boundary at `resolveTestProceduresJson` is easier to test and reason about than scattered conversion at three throw sites.

**Rejected alternatives.**
- **Return `OperationResult<VbaTestPlanEntry[]>` from `normalizeTestPlan`.** Adds noise to a 17-line pure function and provides no caller benefit.

### ADR-4 — Preserve original error messages inside `DysflowError.message`

**Context.** The original `throw new Error(msg)` carries diagnostic detail (file paths, test index, missing field).

**Decision.** When catching, set `DysflowError.message` to `err instanceof Error ? err.message : String(err)` so the existing diagnostic text survives. Prepend a short prefix only when needed for disambiguation (e.g., `Invalid test plan: ${err.message}`).

**Rationale.**
- Issues #61/#62 are about *contract*, not *content*. Preserving messages keeps debugging UX identical.
- Adapter logs (CLI/MCP/HTTP) already render `error.code` + `error.message`, so users see the same string they used to see in the stack trace.

### ADR-5 — Both new error codes are `retryable: false`

**Context.** `createDysflowError` accepts `{ retryable?: boolean }` defaulting to `false`.

**Decision.** Use the default. Ambiguous config and invalid test plans are user-input problems; retrying without intervention will not help.

**Rationale.** Matches the convention used by other `CONFIG_*` and `VBA_*` validation failures in the codebase.

---

## Test Strategy

Two vitest specs alongside the modified modules. Both follow strict-TDD red-first as required by project context.

**`src/core/config/dysflow-config.test.ts`** (extend existing or add new file):
- Given a tmp cwd containing both `.dysflow/project.json` AND `dysflow.project.json` with distinct contents, `loadDysflowConfig({ cwd })` returns `{ ok: false, error.code: "CONFIG_AMBIGUOUS_PROJECT_FILE" }`. No exception escapes.
- Given a tmp cwd with only one of the two files, `loadDysflowConfig` returns `{ ok: true, ... }` (regression guard for the success path).

**`src/core/services/vba-sync-legacy-service.test.ts`** (extend existing or add new file):
- Given `tests.vba.json` containing `"not-an-array"`, `executeTestVba({...})` returns `{ ok: false, error.code: "VBA_INVALID_TEST_PLAN" }`. No exception escapes.
- Given a missing `tests.vba.json`, same code (ENOENT from `readFile` is caught).
- Given malformed JSON (`"{ not valid"`), same code (`JSON.parse` SyntaxError caught).
- Given a valid plan, the procedureName inline path still works (regression guard).

Run target: `pnpm vitest run` (per project context).

---

## Risks and Open Questions

| Risk | Assessment | Mitigation |
|------|------------|------------|
| A caller outside the searched scope relies on the throw | Low — proposal grep confirmed `executeTestVba` is the sole caller; `findWorktreeProjectConfigPath` is unexported and only used in `loadDysflowConfig`. | Re-grep during apply as final guard. |
| Error code name collisions with future codes | Low — codes are namespaced (`CONFIG_*`, `VBA_*`) and `DysflowError.code` is free-form string. | None needed. |
| Test plan `readFile` error message contains absolute paths and leaks to logs | Already true with the current throw; behaviour preserved. | None — out of scope (matches ADR-4). |

**No open questions.** Approach is mechanical and grounded in the existing pattern; tasks phase can decompose without further design input.

---

## Out of Scope (reaffirmed from proposal)

- Auditing other services for raw throws (separate hardening pass).
- Schema validation for `tests.vba.json` beyond existing checks.
- Reorganising vba-sync-legacy-service parity coverage.
- Behavioural changes to the success path of either function.
