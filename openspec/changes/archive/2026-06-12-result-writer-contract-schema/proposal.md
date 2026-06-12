# Proposal: Result Writer Contract Schema

## Intent

The TS↔PowerShell `Write-DysflowResult` contract is currently documented through TypeScript types, helpers, comments, and mirrored PowerShell behavior. Add declarative Zod schemas as the reviewable contract boundary for result-writer payloads and fallback envelopes without changing existing validators, writer behavior, marker parsing, or emitted JSON.

## Goals

- Make the result-writer contract machine-checkable from TypeScript.
- Preserve `PAYLOAD_TYPE_WHITELIST`, `whyPayloadTypeIsNotWhitelisted()`, and `buildSerializationFailedEnvelope()` behavior.
- Enable future CI checks for PowerShell output after stripping `DYSFLOW_RESULT `.

## Scope

### In Scope
- Add Zod schemas beside the existing result-writer contract helpers.
- Re-export schemas from the core contracts barrel.
- Add focused contract tests proving schema acceptance/rejection and backward compatibility.
- Add Zod dependency and lockfile update if not already present.

### Out of Scope / Non-Goals
- No PowerShell writer rewrite.
- No changed stdout marker, payload whitelist, fallback envelope fields, diagnostics truncation, or error code semantics.
- No adapter behavior change or new runtime validation gate in this slice.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `access-core-runner`: clarify the final stdout result contract can be validated by a declarative schema without changing runner behavior.
- `access-operation-contracts`: document the schema-backed fallback envelope contract for serialization failures.

## Schema Boundary

- Source of truth: `src/core/contracts/result-writer.ts`.
- Schemas cover payload type enum/whitelist, serialization-failed envelope, and a bounded result envelope surface needed for TS↔PS drift checks.
- Schemas must complement, not replace, current pure helpers until a later approved change introduces runtime enforcement.

## Approach

Co-locate `PayloadTypeSchema`, `SerializationFailedEnvelopeSchema`, and result envelope schema exports in `result-writer.ts`; export through `src/core/contracts/index.ts`; pin behavior in `test/core/contracts/result-writer-contract.test.ts` before production edits, following strict TDD.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/contracts/result-writer.ts` | Modified | Add Zod schemas next to existing helpers. |
| `src/core/contracts/index.ts` | Modified | Re-export schema contract. |
| `test/core/contracts/result-writer-contract.test.ts` | Modified | Add schema and compatibility tests. |
| `package.json`, lockfile | Modified | Add Zod dependency if required. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Schema becomes stricter than existing behavior | Med | Pin helper parity and no-behavior-change tests. |
| Dependency churn expands review | Low | Keep PR to contract/schema/test files only. |

## Rollback Plan

Revert the schema exports, tests, and dependency changes. Existing helpers and PowerShell behavior remain untouched, so rollback restores the previous contract surface without data migration.

## Dependencies

- Zod package availability in the TypeScript build/test pipeline.
- GH #515 acceptance criteria.

## Success Criteria

- [ ] `pnpm test` and `pnpm build` pass.
- [ ] Existing result-writer tests remain green without weakened assertions.
- [ ] New schema tests prove valid fallback envelopes parse and invalid drift is rejected.
- [ ] Expected review slice stays under 400 changed lines.

## Expected Review Slice

Single focused PR: dependency + core contract schemas + barrel export + contract tests only.
