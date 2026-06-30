# Design: Forms UI Factory Slice 4 Mutation Primitives

## Technical Approach

Extend the existing source-path-first FormIR pipeline. Core stays pure: parse `.form.txt` → mutate ordered `FormIR` → serialize. The MCP/VBA adapter owns source-file I/O, write-gate routing, project target resolution, and the `LoadFromText` gate by invoking the existing `import_modules` path after writing/applying the mutated `.form.txt`.

## Architecture Decisions

| Decision | Choice | Alternatives considered | Rationale |
|---|---|---|---|
| Mutation layer | Add pure mutation APIs to `src/core/services/form-ir-service.ts` (or `form-ir-mutation-service.ts` if it grows) over `FormIR`/`FormNode`. | Mutate raw text in adapter. | Ordered arrays already preserve duplicate keys, blobs, empty lines, and code-behind; raw text would repeat the old unsafe orchestrator behavior. |
| Public tools | Register `dysflow_form_add_control`, `dysflow_form_move_control`, `dysflow_form_rename_control` as VBA-sync dispatch tools. | Legacy names without `dysflow_`. | Issue #617 names are the public contract; generated dispatch provides schema validation and write-gate consistency. |
| Move semantics | `move_control` updates layout scalars `Left`/`Top` only; it does not reorder the node tree. | Reparent/reorder controls. | Access UI “move” is visual position; reparenting changes containment semantics and risks serialization drift. |
| Apply gate | Default dry-run returns mutated source preview/metadata. `apply:true` writes source, calls `import_modules` with the form module, and restores original source on import failure best-effort. | Add a new PS1 action. | Existing import path already exercises `LoadFromText`, ANSI conversion, normalization, operation tracking, and strict context. |

## Data Flow

```text
MCP dispatch/write gate
  -> VbaFormsAdapter
  -> read sourcePath via FormFileSystemPort
  -> core parse/mutate/serialize
  -> dryRun: return plan
  -> apply: write .form.txt -> import_modules(apply:true,moduleNames:[module]) -> result
```

## File Changes

| File | Action | Description |
|---|---|---|
| `src/core/services/form-ir-service.ts` or `form-ir-mutation-service.ts` | Modify/Create | `addControl`, `moveControl`, `renameControl`, typed mutation errors, metadata-preservation guard. |
| `src/core/models/form-ir.ts` | Modify | Add small request/result types only if shared by services/tests. |
| `src/adapters/vba-sync/vba-forms-adapter.ts` | Modify | Add handlers, source read/write, dry-run/apply flow, import gate, error translation. |
| `src/adapters/mcp/mcp-tool-registry.ts` | Modify | Add the three public tool names to the VBA-sync inventory. |
| `src/adapters/mcp/dispatch-routes.ts` | Modify | Mark tools as `mutatesBinary:true`, `mutatesFilesystem:true`. |
| `src/adapters/mcp/schemas/vba-sync-schemas.ts`, `src/shared/validation/schema-props.ts` | Modify | Add schemas for sourcePath/formName/controlName/controlType/properties/left/top/apply/dryRun. |
| `src/adapters/mcp/tool-parity-registry.ts`, `README.md`, `docs/mcp-examples.md` | Modify | Public descriptions and examples. |
| `test/**`, `test/integration/form-ir-loadfromtext.test.ts` | Modify | RED→GREEN unit, adapter, MCP, docs, and LoadFromText coverage. |

## Interfaces / Contracts

```ts
type AddControlInput = { targetSectionName?: string; control: { name: string; type: string; properties: Record<string,string> } };
type MoveControlInput = { controlName: string; left?: number; top?: number };
type RenameControlInput = { controlName: string; newName: string };
type FormMutationResult = { source: string; changedControlName: string; preservedKeys: string[] };
```

Errors: `FORM_DUPLICATE_CONTROL`, `FORM_CONTROL_NOT_FOUND`, `FORM_SECTION_NOT_FOUND`, `FORM_MUTATION_INVALID`, `FORM_METADATA_LOSS`. Core returns protocol-neutral failures; adapter maps to MCP JSON.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Core | add/move/rename preserve `PrtDevMode`, `Checksum`, `Format`, code-behind, duplicate keys. | Pure Vitest fixtures; assert original IR unchanged and serialized source preserves untouched lines. |
| Adapter/MCP | Registration, schemas, write-gate, dry-run no writes, apply invokes import gate. | Mock `FormFileSystemPort` and orchestrator; assert behavior, not internal call order. |
| Integration | `Form_FormRiesgosGestionRiesgo` LoadFromText acceptance when fixture exists. | Windows/Access integration test; skip with explicit reason when bench fixture absent. |

## Migration / Rollout

No migration required. Tools are additive and write-gated.

## Open Questions

None.
