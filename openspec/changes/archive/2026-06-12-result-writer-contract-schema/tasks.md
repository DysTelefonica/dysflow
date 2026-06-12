# Tasks: Result Writer Contract Schema

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 120-180 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | auto-chain |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Pin the contract with failing schema tests and keep existing helper behavior covered | PR 1 | Base on main; tests only; no runtime changes |
| 2 | Add Zod schemas, direct dependency, and barrel exports | PR 1 | Same slice; schema-only core contract change |

## Phase 1: Strict TDD Red Tests

- [x] 1.1 Extend `test/core/contracts/result-writer-contract.test.ts` with failing cases for `PayloadTypeSchema`, `SerializationFailedEnvelopeSchema`, and `ResultEnvelopeSchema` exports.
- [x] 1.2 Add acceptance/rejection assertions for whitelist parity, fallback-envelope shape, and loose success-envelope parsing (`ok: true`, `data: z.unknown()`).

## Phase 2: Core Schema Implementation

- [x] 2.1 Add `zod` as a direct dependency in `package.json` and refresh `pnpm-lock.yaml` if it is only transitive today.
- [x] 2.2 Implement co-located schemas in `src/core/contracts/result-writer.ts` without changing `PAYLOAD_TYPE_WHITELIST`, `whyPayloadTypeIsNotWhitelisted()`, or `buildSerializationFailedEnvelope()`.
- [x] 2.3 Re-export `PayloadTypeSchema`, `SerializationFailedEnvelopeSchema`, and `ResultEnvelopeSchema` from `src/core/contracts/index.ts`.

## Phase 3: Verification

- [x] 3.1 Re-run `test/core/contracts/result-writer-contract.test.ts` until the new schema assertions pass and the existing contract assertions stay green.
- [x] 3.2 Verify `pnpm test` and `pnpm build` succeed with the new direct dependency and no runtime behavior change.

## Phase 4: Cleanup

- [x] 4.1 Review `src/core/contracts/result-writer.ts` and `src/core/contracts/index.ts` for comment drift so the schema boundary stays clearly additive.

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `da38586` | Add result-writer Zod schemas and contract tests | 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 4.1 | `pnpm vitest run test/core/contracts/result-writer-contract.test.ts`; `pnpm test`; `pnpm build`; `pnpm lint` | N/A |
