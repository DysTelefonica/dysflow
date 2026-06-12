## Exploration: result-writer contract schema

### Current State
`src/core/contracts/result-writer.ts` currently defines the contract as TypeScript types plus pure helpers: `PAYLOAD_TYPE_WHITELIST`, `PayloadType`, `SerializationFailedEnvelope`, `whyPayloadTypeIsNotWhitelisted()`, and `buildSerializationFailedEnvelope()`. The PowerShell writers in `scripts/dysflow-vba-manager.ps1` and `scripts/dysflow-access-runner.ps1` mirror the fallback envelope shape manually, while existing tests pin the whitelist and fallback behavior without a declarative schema.

### Affected Areas
- `src/core/contracts/result-writer.ts` — add the Zod schemas next to the existing contract types/helpers.
- `src/core/contracts/index.ts` — re-export the new schemas for downstream consumers.
- `test/core/contracts/result-writer-contract.test.ts` — add schema-level assertions and backward-compat checks.
- `scripts/tests/dysflow-vba-manager.Tests.ps1` / `scripts/tests/dysflow-access-runner-result-coverage.Tests.ps1` — likely future CI consumers of the schema contract, even if not changed now.
- `package.json` (+ lockfile) — Zod is not currently a dependency.

### Approaches
1. **Co-locate Zod schemas in `result-writer.ts`** — define `PayloadTypeSchema`, `SerializationFailedEnvelopeSchema`, and a broader `ResultEnvelopeSchema` in the same contract module.
   - Pros: one source of truth; simplest export story; keeps the contract close to the current validators.
   - Cons: adds a new dependency to a core contract file; the success-payload side of the contract may need careful modeling.
   - Effort: Medium

2. **Create a sibling schema module** — keep the current helpers in `result-writer.ts` and add `result-writer.schema.ts` for Zod-only runtime validation.
   - Pros: cleaner separation between pure helpers and declarative schemas; lower churn in the current file.
   - Cons: split contract surface; more export plumbing; easier for the helpers and schemas to drift.
   - Effort: Medium

### Recommendation
Co-locate the schemas in `src/core/contracts/result-writer.ts` and re-export them from the barrel. Keep `whyPayloadTypeIsNotWhitelisted()` and `buildSerializationFailedEnvelope()` unchanged so current callers and tests stay stable, then let CI consume the new schema for JSON drift checks after stripping the `DYSFLOW_RESULT ` marker.

### Risks
- The term “result envelope” is ambiguous: the schema must clearly distinguish the success payload from the fallback envelope so validation does not become either too loose or too strict.
- Zod will need to be added as a new dependency, so lockfile and build/test plumbing may need a small follow-up.

### Ready for Proposal
Yes — the change is scoped enough for a delta spec/proposal. The next step should define the exact schema boundaries and how PowerShell output will be validated in CI.
