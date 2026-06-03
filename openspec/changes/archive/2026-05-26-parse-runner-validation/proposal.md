# Proposal: Runtime shape validation for runner output

## Intent

`parseRunnerData<TData>()` in `src/core/runner/access-runner.ts` returns `{} as TData` (empty stdout) and `JSON.parse(stdout) as TData` (non-empty) with **zero runtime validation**. Both are phantom casts — a malformed PowerShell payload that is valid JSON but the wrong shape passes silently into `diagnostics-service`, `query-service`, and `vba-service`. Callers then read fields like `result.data.checks` that may not exist. GitHub issue #348 tracks this gap: the runner trusts the type system at a boundary the type system cannot enforce.

## Scope

### In Scope
- Add post-`runner.run()` shape guards in the three service callers: `diagnostics-service`, `query-service`, `vba-service`.
- Reuse existing `isRecord()` from `src/core/utils/index.ts` for the loose shapes (query, vba).
- Strict guard for `AccessDiagnosticsResult` verifying `Array.isArray(data.checks)`.
- Introduce error code string `RUNNER_INVALID_OUTPUT`, returned via `failureResult` on shape mismatch.
- One test per service covering the mismatch → `RUNNER_INVALID_OUTPUT` path.

### Out of Scope
- Changing `AccessRunner` interface, `AccessPowerShellRunner`, or `parseRunnerData` signatures (Options A/C/D rejected — they break the interface and test fakes).
- Adding a validation library (Zod/ajv) — project is intentionally zero-runtime-deps.
- Per-action deep validation of `AccessQueryResult` (too many loose variants; deferred).
- Guarding the empty-stdout `{} as TData` case — `{}` is currently valid for all three TData types.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `access-core-services`: extend the Runner Boundary contract so services MUST validate the runner result shape before returning it, failing with `RUNNER_INVALID_OUTPUT` on mismatch.

## Approach

Option B — validate in each service, after `runner.run()` returns. Clean layer separation: the runner handles transport, services own semantic validation of the shape they requested. Type guards stay colocated with the types they guard. Zero interface breakage means no test-fake updates beyond the new mismatch cases.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/services/diagnostics-service.ts` | Modified | Strict guard: `checks` must be an array |
| `src/core/services/query-service.ts` | Modified | `isRecord` guard on result data |
| `src/core/services/vba-service.ts` | Modified | `isRecord` guard on result data |
| `test/core/services/*` | New/Modified | Mismatch → `RUNNER_INVALID_OUTPUT` per service |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `AccessQueryResult` is so loose any object passes `isRecord` → weak signal | High | Accept; per-field checks would be fragile across many action variants. Catches non-object payloads, which is the real failure mode |
| Runner still returns bad shapes when called directly, bypassing services | Med | Accept; all known production callers route through the three services |
| Guard rejects a legitimate-but-novel payload shape | Low | Guards check minimal invariants only (object / `checks` array), not full schema |

## Rollback Plan

Revert the three service edits and the `RUNNER_INVALID_OUTPUT` additions. No interface or migration touched, so reverting the commit fully restores prior behavior. Tests for the mismatch path are removed with the same revert.

## Dependencies

- None. `isRecord` and `failureResult` are already available in core.

## Success Criteria

- [ ] Each service returns `RUNNER_INVALID_OUTPUT` when `runner.run()` yields a wrong-shape object.
- [ ] `diagnostics-service` rejects a result whose `checks` is missing or not an array.
- [ ] No changes to `AccessRunner`, `AccessPowerShellRunner`, or `parseRunnerData`.
- [ ] Existing runner/service tests still pass; new per-service mismatch tests pass.
