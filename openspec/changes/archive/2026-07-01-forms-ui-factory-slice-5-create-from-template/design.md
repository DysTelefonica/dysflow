# Design: forms-ui-factory-slice-5-create-from-template

## Technical Approach

Reuse the slice 4 source-path-first FormIR pipeline. Core owns the new semantics: a pure `cloneFormFromTemplate(sourceIr, opts)` returning a target `FormIR` + typed summary. The adapter owns I/O — reads the source `.form.txt` (bench cache first, projectRoot fallback), parses, calls the core clone, re-serializes, then on `apply:true` writes the target and reuses the existing `import_modules` LoadFromText gate. On gate failure the adapter restores the source tree best-effort.

## Architecture Decisions

### Decision: Source/target path resolution (OQ2)

**Choice**: bench-cache first, then resolved `projectRoot`.
**Alternatives considered**: `projectRoot`-first; binary export only.
**Rationale**: Slice 4 already treats the bench as primary for `Form_FormRiesgosGestionRiesgo`; bench-cache is gitignored.

### Decision: Token replacement lives in core

**Choice**: `cloneFormFromTemplate` + `applyTokenMap` exported from `form-ir-service.ts` over a parsed `FormIR` + token map + policy.
**Alternatives considered**: `String#replace` in adapter; `form-template-service.ts`.
**Rationale**: `assertMetadataPreserved` only holds when replacement walks the IR — raw `String#replace` leaks into `PrtDevMode` blobs.

### Decision: Token syntax, scope, missing-token policy

**Choice**: `{{Token}}` only (OQ3). Scope = source layout only (preamble + scalar values + blob body lines whose key does NOT start with `Checksum` / `Format` / `PrtDevMode`). `.cls` untouched (OQ1). Missing tokens pass through + warning (OQ4); `strictMissingTokens:true` → `FORM_MUTATION_INVALID`.
**Alternatives considered**: regex injection; `.cls` replacement.
**Rationale**: `{{Token}}` is the orchestrator's chosen shape.

### Decision: Restore-on-failure

**Choice**: capture `originalSource` before the apply write; on gate failure best-effort `writeFile(sourcePath, originalSource)` and return `FORM_IMPORT_GATE_FAILED`.
**Alternatives considered**: PowerShell backup; transactional journal.
**Rationale**: Identical to `dysflow_form_deserialize`. A journal doesn't remove the FS race.

### Decision: Dry-run is the default

**Choice**: omitting `apply` (or `dryRun:true`) returns a structured preview without writing or importing. `apply:true` runs the gate.
**Alternatives considered**: opt-in dry-run.
**Rationale**: Matches slice 4's contract every consumer agent already knows.

### Decision: No new `access-form-mutation` domain

**Choice**: Reuse `access-core-services` for the core signature; reuse `mcp-stdio-adapter` for wire exposure.
**Alternatives considered**: new domain; `form-template-service.ts`.
**Rationale**: Slice 4 closed the mutation domain. A separate file would fork `assertMetadataPreserved`/`cloneIr`.

### Decision: PrtDevMode round-trip safety

**Choice**: Token replacement does NOT walk `PRESERVED_METADATA_KEYS`; slice 4's `assertMetadataPreserved` continues to enforce byte-equivalence post-clone without modification.
**Alternatives considered**: a separate `clonePreservesPrtDevMode` assertion.
**Rationale**: Reusing the guard gives free coverage — tokens inside `PrtDevMode` are also covered because the guard short-circuits.

## Data Flow

```text
gate -> VbaFormsAdapter.cloneFormFromTemplate
  -> resolve sourcePath (bench-cache first, then projectRoot)
  -> readFile + parseFormTxt
  -> core: cloneFormFromTemplate(ir, opts) -> applyTokenMap + assertMetadataPreserved
  -> dryRun: return preview
  -> apply: write target .form.txt -> import_modules(apply:true)
            on gate fail: restore source + return FORM_IMPORT_GATE_FAILED
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/core/services/form-ir-service.ts` | Modify | `cloneFormFromTemplate`, `applyTokenMap`, new error codes; reuse `assertMetadataPreserved`. |
| `src/core/models/form-ir.ts` | Modify | `CloneFromTemplateInput`, `CloneFromTemplateResult`, `TokenMap`, `CloneFromTemplateOptions` types if shared. |
| `src/core/services/form-ir-service.test.ts` | Modify | Token-map unit tests + byte-equivalence + `PrtDevMode`/`Checksum` preserved. |
| `src/shared/validation/schema-props.ts` | Modify | `tokenMap`, `targetForm`, `strictMissingTokens`, `overwrite`, `missingTokenPolicy`. |
| `src/adapters/mcp/mcp-tool-registry.ts` | Modify | Register `dysflow_create_form_from_template`. |
| `src/adapters/mcp/dispatch-routes.ts` | Modify | Route as `mutatesBinary:true, mutatesFilesystem:true`. |
| `src/adapters/mcp/tool-parity-registry.ts` | Modify | Add to `implementedToolNames` + description. |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts` | Modify | New JSON schema for the tool. |
| `src/adapters/vba-sync/vba-forms-adapter.ts` | Modify | `cloneFormFromTemplate` handler; bench-first `resolveSource`; best-effort restore. |
| `src/adapters/vba-sync/vba-forms-adapter-mutation.test.ts` | Modify | Registration, dry-run, apply, gate failure restore, overwrite, missing-token, strict-missing. |
| `test/adapters/mcp/form-mutation-tools.test.ts` | Modify | Registry + dispatch + schema parity assertions. |
| `test/integration/form-ir-mutation-preservation.test.ts` | Modify | Bench round-trip: inject `{{FormName}}` at test time, clone to `Form_FormNuevaAuditoria`, byte-compare vs manual replace. |
| `README.md` | Modify | Document `dysflow_create_form_from_template` in the MCP tools table. |
| `openspec/specs/{access-core-services,mcp-stdio-adapter}/spec.md` | Modify at archive | Replace MODIFIED blocks with the deltas. |

## Interfaces / Contracts

```ts
type TokenMap = Record<string, string>;
type MissingTokenPolicy = "warn-pass-through" | "strict";
type CloneFromTemplateOptions = {
  tokenMap: TokenMap;
  missingTokenPolicy?: MissingTokenPolicy; // default "warn-pass-through"
  overwrite?: boolean;                       // default false (OQ5)
  targetFormName: string;
};
type CloneFromTemplateResult = {
  ir: FormIR;
  targetSource: string;
  targetPath: string;
  appliedTokens: string[];
  missingTokens: string[];
  preservedKeys: string[];
  sourcePath: string;
  importGate: "not-run" | "passed" | "failed" | "skipped";
  mode: "dry-run" | "apply";
};
```

Errors: `FORM_TOKEN_MAP_INVALID`, `FORM_TARGET_EXISTS`, `FORM_MUTATION_INVALID` (strict missing-token), `FORM_METADATA_LOSS` (slice 4), `FORM_IMPORT_GATE_FAILED` (adapter).

## Testing Strategy

| Layer | What | Approach |
|-------|------|----------|
| Core | All-mapped, missing-pass-through, strict-missing, invalid map, byte-equivalence vs manual replace, `PrtDevMode`/`Checksum` preserved, target rejection when no overwrite. | Pure Vitest. |
| Adapter/MCP | Registration, schema parity, write-gate, dry-run no writes, apply invokes `import_modules`, gate failure restores source, overwrite, strict-missing. | Mock `FormFileSystemPort` + `VbaFormsOrchestrator`. |
| Integration | Clone `Form_FormRiesgosGestionRiesgo` into `Form_FormNuevaAuditoria` with `{{FormName}}` injected at test time — no fixture seeding. | `vitest.integration.config.ts`; skip when bench cache absent. |

## Migration / Rollout

None. Tool is additive, write-gated, default dry-run.

## Open Questions

None — all OQs resolved; deferred decisions documented in the Architecture Decisions section.