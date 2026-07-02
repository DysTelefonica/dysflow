# Design: Forms UI Factory Slice 3 Serialize and Round-Trip

## Technical Approach

Extend the existing source-path-first FormIR pipeline with pure `serialize(ir)` and `deserialize(source)` operations. Core stays protocol-neutral (returns plain types + typed errors). The adapter owns source-file I/O and the LoadFromText integration gate. Default `dryRun:true` for both MCP tools; `apply:true` required for deserialize writes.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Serialize layer | Pure functions in `src/core/services/form-ir-service.ts` over FormIR; emit serialized text + typed metadata-loss report. | Mutate raw text in adapter. | Pure functions are testable in isolation; raw-text mutation repeats slice 4's old unsafe orchestrator behavior. |
| Deserialize layer | Pure parser already exists from slice 1/2; slice 3 wraps the parse output through a serializer-equivalence check. | Re-parse from scratch. | Reuse existing parser; slice 3 only adds the inverse direction. |
| Round-trip guard | Core compares byte-equal of serialized result against the source; non-equal returns typed `SERDE_ROUND_TRIP_FAILED` with diff snippet. | Best-effort with warning. | Silent round-trip drift is dangerous; explicit failure is required. |
| Opaque metadata | Serialize preserves `PrtDevMode`, `Checksum`, `Format`, layout scalars, event-bound procedure names byte-for-byte (no normalization). | Normalize whitespace/keys. | Access dependency on byte-exact metadata; normalization breaks LoadFromText. |
| Apply semantics | Deserialize requires explicit `apply:true`; serialize returns serialized text + metadata without writing. | Always apply. | Default read-only matches orchestrator safety. |
| LoadFromText gate | After deserialize-and-write, invoke the existing import path via `dysflow_import_modules` and assert the binary does not drift (checksum compare). | Custom PS1 action. | Existing import path already exercises `LoadFromText`, normalization, and operation tracking. |
| Slice 4 re-verification | Run slice 4's canonical live gate (mutation primitives) against slice 3's serializer; assert no regression in `apply:true` flow. | Add new regression suite. | Reuse existing verified path. |

## Data Flow

```text
MCP dispatch/write gate
  -> VbaFormsAdapter
     -> read sourcePath via FormFileSystemPort
        -> core parse(source)
           -> core serialize(ir)            [dysflow_form_serialize]
              -> dryRun: return plan
              -> apply: N/A (serialize is read-only)
           -> core parse(serialize(ir))      [round-trip equivalence check]
              -> non-equal: SERDE_ROUND_TRIP_FAILED
     -> write sourcePath via FormFileSystemPort  [dysflow_form_deserialize]
        -> dryRun: return plan
        -> apply: write .form.txt -> import_modules(apply:true) -> assert checksum
  -> MCP JSON response
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/core/services/form-ir-service.ts` | Modify | Add `serialize(ir)` and `deserialize(source)` pure methods; add round-trip guard. |
| `src/core/models/form-ir.ts` | Modify | Add `SerializeResult` and `DeserializeResult` types if shared. |
| `src/adapters/vba-sync/vba-forms-adapter.ts` | Modify | Wire `serialize`/`deserialize` handlers, dryRun default, apply gate, LoadFromText integration, error translation. |
| `src/adapters/mcp/mcp-tool-registry.ts` | Modify | Add the two public tool names to the VBA-sync inventory. |
| `src/adapters/mcp/dispatch-routes.ts` | Modify | Mark `deserialize` as `mutatesBinary:true`, `mutatesFilesystem:true`. `serialize` is read-only. |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` | Modified | Schemas for `sourcePath`, `formName`, `apply`, `dryRun`, round-trip report. |
| `src/adapters/mcp/tool-parity-registry.ts` | Modified | Public descriptions. |
| `test/**`, `test/integration/form-ir-serialize.test.ts` | Modified | RED→GREEN core, adapter, MCP, integration tests. |
| `test/integration/slice-4-regression.test.ts` (new) | Create | Re-run slice 4 mutation primitives against slice 3's serializer. |

## Interfaces / Contracts

```ts
type SerializeInput = { sourcePath: string; formName: string };
type SerializeResult = {
  serialized: string;            // the .form.txt equivalent of the parsed IR
  metadataReport: {
    preservedKeys: string[];     // ['PrtDevMode', 'Checksum', 'Format', ...]
    byteDiff: number;             // 0 in success
    opaqueCount: number;
  };
  roundTripOk: boolean;          // serialize(parse(source)) === source
};

type DeserializeInput = { sourcePath: string; formName: string; ir: FormIR; apply: boolean; dryRun: boolean };
type DeserializeResult = {
  written: boolean;               // true if apply succeeded
  appliedChecksumBefore: string;
  appliedChecksumAfter: string;
  loadFromTextGate: 'passed' | 'failed';
  importErrorCode?: string;
};
```

Errors (typed, core returns; adapter maps to MCP): `SERDE_ROUND_TRIP_FAILED`, `SERDE_METADATA_LOSS`, `SERDE_PARSE_FAILED`, `LOADFROMTEXT_FAILED`, `ACCESS_DATABASE_LOCKED`.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Core | `serialize(parse(s)) === s` byte-equal. `deserialize` is parse inverse. Round-trip guard fires on forced mutation. | Pure Vitest fixtures; assert `Buffer.compare(source, serialized) === 0`. |
| Core | Opaque metadata preservation for `PrtDevMode`, `Checksum`, `Format`, layout scalars, event-bound `[Event Procedure]` names. | Fixtures containing each opaque key type; assert key + value present in serialized output. |
| Adapter/MCP | Registration, schemas, write-gate, dryRun default, apply gate, error code translation. | Mock `FormFileSystemPort` and orchestrator; assert behavior, not internal call order. |
| Integration | LoadFromText acceptance on `Form_FormRiesgosGestionRiesgo`. | Live Access integration; skip with explicit reason when bench fixture absent. |
| Slice 4 regression | Existing mutation primitives still pass against slice 3's serializer. | Re-run slice 4 canonical live gate; assert identical results. |

## Migration / Rollout

No migration required. Both tools are additive. Slice 4 calls the new serializer via the same adapter interface; if a shim is needed, ship it in slice 3's PR.

## Open Questions

- Should `serialize` accept an IR directly (not just path)? Useful for cross-tool invocations later (slice 5 `create_from_template` would pass an IR). Defer the answer until slice 5 implementation; current design supports both via separate input types.
