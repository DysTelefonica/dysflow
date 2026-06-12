# Design: Result Writer Contract Schema

Adds declarative Zod schemas to the TS↔PowerShell `Write-DysflowResult` contract (GH #515), making the payload and fallback envelope shapes machine-checkable without changing existing validators, writer behavior, or emitted JSON.

## Quick Path

1. Add Zod schemas co-located in `src/core/contracts/result-writer.ts`
2. Re-export from `src/core/contracts/index.ts`
3. Add contract tests proving schema parity with existing helpers
4. Verify `pnpm test` + `pnpm build` pass

## Architecture Decisions

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Co-locate schemas in `result-writer.ts` | Adds Zod import to core contract file; single source of truth | **Chosen** — simplest export story; keeps contract near validators |
| Sibling `result-writer.schema.ts` | Cleaner separation; risk of drift between helpers and schemas | Rejected — split surface not worth the churn for 3 schemas |
| Runtime enforcement gate in this slice | Adds adapter-layer behavior change; out of scope per proposal | Rejected — this change is schema-only, no enforcement |

| Schema boundary | Scope | Rationale |
|-----------------|-------|-----------|
| `PayloadTypeSchema` | Literal union matching `PAYLOAD_TYPE_WHITELIST` exactly | Pins the whitelist to a Zod enum; PS adapter drift becomes a schema failure |
| `SerializationFailedEnvelopeSchema` | Object: `{ok: false, error: {code, message}, diagnostics: [string, ...string[]]}` | Matches current `SerializationFailedEnvelope` type exactly |
| `ResultEnvelopeSchema` | Zod discriminated union on `ok` field | Encompasses both success and fallback; enables future CI validation of full `DYSFLOW_RESULT` JSON |

**Key rationale**: The schemas are a *reviewable contract boundary*, not a runtime enforcement gate. Existing helpers (`whyPayloadTypeIsNotWhitelisted`, `buildSerializationFailedEnvelope`) remain unchanged. The schemas complement them by giving CI a declarative way to validate PowerShell output after stripping `DYSFLOW_RESULT`.

## Data Flow

```
PowerShell writer
    │  emits: DYSFLOW_RESULT <json>
    ▼
ps-result-channel.ts  (extractResultPayload → JSON.parse)
    │  returns: unknown
    ▼
result-writer.ts schemas  (new: Zod validation entry point)
    │  validates: payload vs PayloadTypeSchema / ResultEnvelopeSchema
    ▼
access-runner.ts  (ensureResultShape → OperationResult<T>)
    │  wraps in OperationResult envelope
    ▼
MCP / HTTP adapter
```

The schemas sit between the raw `JSON.parse` output and the existing `ensureResultShape` guard — they are a *contract check*, not a replacement for the adapter-layer shape validation.

## Schema Definitions (sketch)

```ts
import { z } from "zod";

export const PayloadTypeSchema = z.enum([
  "null", "string", "number", "boolean", "object[]",
  "pscustomobject", "Record<string, unknown>",
  "[ordered]@{}", "[hashtable]",
]);

export const SerializationFailedEnvelopeSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
  diagnostics: z.tuple([z.string(), z.array(z.string()).optional()])
    .rest(z.string()),
});

export const ResultEnvelopeSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), data: z.unknown() }),
  SerializationFailedEnvelopeSchema,
]);
```

`PayloadTypeSchema` is a Zod `z.enum` that mirrors the literal values in `PAYLOAD_TYPE_WHITELIST` — it does not model the *runtime type check* (which uses prototype inspection); it models the *string labels* the contract exposes to consumers.

`ResultEnvelopeSchema` is deliberately loose on the success branch (`data: z.unknown()`) because the success payload is polymorphic and validated downstream by `ensureResultShape`. The fallback branch is strict because the envelope shape is the contract invariant.

## Interfaces / Contracts

New exports from `src/core/contracts/index.ts`:

```ts
export {
  PayloadTypeSchema,
  SerializationFailedEnvelopeSchema,
  ResultEnvelopeSchema,
} from "./result-writer.js";
```

No existing exports are removed or renamed. The existing `PayloadType` type alias and `SerializationFailedEnvelope` type remain as-is — the schemas complement them, not replace them.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/contracts/result-writer.ts` | Modify | Add `zod` import + 3 schema exports at bottom of module |
| `src/core/contracts/index.ts` | Modify | Re-export the 3 new schemas |
| `test/core/contracts/result-writer-contract.test.ts` | Modify | Add schema parity tests (acceptance + rejection + backward-compat) |
| `package.json` | Modify | Add `zod` as direct dependency (currently only transitive via `@modelcontextprotocol/sdk`) |

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Unit | Schema accepts values `buildSerializationFailedEnvelope` produces | Assert `SerializationFailedEnvelopeSchema.parse()` succeeds on envelope from helper |
| Unit | Schema rejects invalid drift (missing `diagnostics`, wrong `ok` literal) | Assert `safeParse` returns `success: false` |
| Unit | `PayloadTypeSchema` enum values match `PAYLOAD_TYPE_WHITELIST` array | Literal equality assertion pinning both to the same list |
| Unit | `ResultEnvelopeSchema` accepts success-shaped objects | Assert parse on `{ok: true, data: "test"}` |
| Integration | `pnpm test` passes (existing + new tests) | Full suite |
| Build | `pnpm build` passes | Confirm no type errors from Zod usage |

## Migration / Rollout

No migration required. Zod is added as a direct dependency (already a transitive dep via `@modelcontextprotocol/sdk`). Schema exports are purely additive — no existing behavior changes.

## Open Questions

- [ ] Should `ResultEnvelopeSchema` success branch use `z.unknown()` or a tighter shape? Using `z.unknown()` keeps this slice minimal; tightening can be a follow-up when the success envelope gains a formal shape.
- [ ] Should schemas also validate the `RESULT_MARKER` prefix + JSON parsing boundary (i.e. the full `DYSFLOW_RESULT <json>` line), or stay at the parsed-JSON level? Proposal scope says parsed-JSON level; prefix validation stays in `ps-result-channel.ts`.
