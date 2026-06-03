# Design: Runtime shape validation for runner output

## Technical Approach

Implement Option B from the proposal: each service validates the shape of `runner.run()` output AFTER it returns, before handing data to callers. The runner keeps owning transport + JSON parsing (it already emits `RUNNER_INVALID_JSON` when `JSON.parse` throws). Services own SEMANTIC shape validation of the `TData` they requested.

A shared helper `ensureResultShape` (in `src/core/runner/access-runner.ts`, exported) takes a `successResult` and a predicate; on mismatch it converts to `failureResult(RUNNER_INVALID_OUTPUT)` while preserving `diagnostics`, `durationMs`, and `operation`. Failures and timeouts pass through untouched. Each service supplies its own predicate. Zero new npm deps — pure TS using existing `isRecord()`.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|----------|--------|----------|-----------|
| Where to validate | In each service caller (Option B) | A/C/D: validate inside runner / change `parseRunnerData` / new interface | Runner is generic `TData`; only the caller knows the expected shape. No interface or test-fake breakage. |
| Error code home | New string const `RUNNER_INVALID_OUTPUT`, used via `failureResult(createDysflowError(...))` | Adding to a formal enum/union | Project uses bare string codes (`RUNNER_INVALID_JSON`, `RUNNER_TIMEOUT`) passed to `createDysflowError`. Follow existing pattern, not a new abstraction. |
| Shared vs inline guard | Shared `ensureResultShape(result, predicate)` helper | Inline guard in each service | DRY for `ok`-check + metadata preservation; predicate stays colocated/specific per service. |
| Diagnostics on reject | Preserve original `diagnostics`/`durationMs`/`operation` | Drop them | Callers still need transport telemetry even when shape is wrong. |

## Data Flow

    Service.run() ─→ runner.run<TData>() ─→ OperationResult<TData>
                                                  │
                            ensureResultShape(result, predicate)
                                                  │
                          ok && predicate(data) ──┴── true  → pass result through
                                                            └─ false → failureResult(RUNNER_INVALID_OUTPUT)
                                                                       (keeps diagnostics/durationMs/operation)
    !ok (RUNNER_TIMEOUT / RUNNER_FAILED / RUNNER_INVALID_JSON) → pass through untouched

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/runner/access-runner.ts` | Modify | Add `export const RUNNER_INVALID_OUTPUT = "RUNNER_INVALID_OUTPUT"` and exported `ensureResultShape<TData>()` helper. |
| `src/core/services/diagnostics-service.ts` | Modify | Strict predicate: `isRecord(data) && Array.isArray(data.checks)`. |
| `src/core/services/query-service.ts` | Modify | Loose predicate: `isRecord(data)`. |
| `src/core/services/vba-service.ts` | Modify | Loose predicate: `isRecord(data)`. |
| `test/core/services/core-services.test.ts` | Modify | Add one mismatch → `RUNNER_INVALID_OUTPUT` test per service. |

## Interfaces / Contracts

```ts
// src/core/runner/access-runner.ts — additions
export const RUNNER_INVALID_OUTPUT = "RUNNER_INVALID_OUTPUT";

export function ensureResultShape<TData>(
  result: OperationResult<TData>,
  isValid: (data: unknown) => boolean,
): OperationResult<TData> {
  if (!result.ok) return result;
  if (isValid(result.data)) return result;
  return failureResult<TData>(
    createDysflowError(
      RUNNER_INVALID_OUTPUT,
      "PowerShell runner produced output with an unexpected shape.",
    ),
    {
      diagnostics: result.diagnostics,
      durationMs: result.durationMs,
      ...(result.operation ? { operation: result.operation } : {}),
    },
  );
}
```

```ts
// diagnostics-service.ts (strict) — checks MUST exist and be an array
const result = await this.runner.run<AccessDiagnosticsResult>(
  { kind: "diagnostics", request }, this.config,
);
return ensureResultShape(result, (data) => isRecord(data) && Array.isArray(data.checks));
```

```ts
// vba-service.ts (loose) — all fields optional incl. returnValue?: unknown
return ensureResultShape(result, isRecord);
// query-service.ts (loose) — 11 optional fields
return ensureResultShape(result, isRecord);
```

Note: pass `isRecord` as the predicate directly — its signature `(value: unknown) => value is Record<string, unknown>` is assignable to `(data: unknown) => boolean`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|--------------|----------|
| Unit | Each service maps wrong-shape success → `RUNNER_INVALID_OUTPUT` | Reuse `FakeRunner` in `core-services.test.ts`. It casts the canned result `as OperationResult<TData>`, so inject `successResult(<bad payload>)` with NO interface change. |
| Unit | Diagnostics rejects missing/non-array `checks` | `FakeRunner(successResult({ checks: "nope" }))` and `successResult({})` → expect `ok:false`, code `RUNNER_INVALID_OUTPUT`. |
| Unit | Query/Vba reject non-object payloads | `FakeRunner(successResult(42))` / `successResult(null)` → `RUNNER_INVALID_OUTPUT`; valid objects still pass (existing tests stay green). |
| Unit | Failures pass through | `FakeRunner(failureResult(RUNNER_TIMEOUT))` → unchanged (covered by existing test; no regression). |

Mock pattern (no interface change):
```ts
const runner = new FakeRunner(successResult({ checks: "not-an-array" }));
const result = await new AccessDiagnosticsService({ runner, config }).run();
expect(result.ok).toBe(false);
if (!result.ok) expect(result.error.code).toBe("RUNNER_INVALID_OUTPUT");
```

## Migration / Rollout

No migration required. Additive guards only; reverting the three service edits + helper restores prior behavior (per proposal rollback plan).

## Open Questions

- None blocking. `AccessQueryResult` loose-guard weakness is accepted in the proposal (catches non-object payloads, the real failure mode).
