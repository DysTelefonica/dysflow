# Proposal: Forms UI Factory Slice 4 Mutation Primitives

## Intent

Ship issue #617: public MCP tools that mutate Access form UI through FormIR/LoadFromText instead of orchestrator byte-editing `.form.txt` files.

## Scope

### In Scope
- Add `dysflow_form_add_control`, `dysflow_form_move_control`, and `dysflow_form_rename_control` as discoverable MCP tools.
- Implement protocol-neutral add/move/rename control primitives over parsed form UI source, preserving event bindings and opaque serialization blobs.
- Prove round-trip safety on `ardelperal/VBA_TOOLKIT_BENCH/Gestion_Riesgos.accdb` / `Form_FormRiesgosGestionRiesgo`, including `PrtDevMode`, `Checksum`, and form format bytes.
- Add RED→GREEN tests and document the public tool names in the README MCP tools list.

### Out of Scope
- `create_from_template` / issue #618.
- General form designer UX, bulk layout generation, or unrelated FormIR refactors.

## Capabilities

### New Capabilities
- `access-form-mutation`: Form UI mutation primitives, serialization preservation, and LoadFromText integration gate.

### Modified Capabilities
- `mcp-stdio-adapter`: Register and route the three public form mutation MCP tools with write-gate semantics.
- `access-core-services`: Own protocol-neutral form mutation service behavior behind adapter boundaries.

## Approach

Extend the existing FormIR pipeline with pure add/move/rename transforms, then expose thin MCP handlers that load form source, mutate IR, serialize, and validate via LoadFromText before claiming success.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/models/form-ir.ts` | Modified | Ensure IR can represent required mutation inputs without losing ordered entries. |
| `src/core/services/form-ir-service.ts` / `vba-form-service.ts` | Modified | Add mutation operations and typed validation errors. |
| `src/adapters/mcp/**` | Modified | Schemas, registry, routes, contracts, and handlers for public tools. |
| `scripts/dysflow-vba-manager.ps1` | Modified | LoadFromText gate if current runner actions lack the needed operation. |
| `README.md`, `test/**` | Modified | Public docs plus RED/GREEN behavior and integration coverage. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Access rewrites hidden serialization bytes | Medium | Preserve opaque blobs and require byte/semantic fixture assertions. |
| Public tool names conflict with legacy naming | Low | Prefer requested `dysflow_form_*`; keep aliases only if existing registry requires. |
| Fixture availability differs locally | Medium | Document path and provide skip/error behavior for integration-only gates. |

## Rollback Plan

Revert the change PR. No migration is needed; new tools are additive and must not alter existing form tools.

## Dependencies

- Issue #617 open and scoped; issue #618 remains dependent but out of scope.
- Canonical bench fixture path must be available for integration verification.

## Success Criteria

- [ ] Three public MCP tools are discoverable and documented.
- [ ] Add/move/rename tests fail first, then pass.
- [ ] LoadFromText integration gate passes on `Form_FormRiesgosGestionRiesgo`.
- [ ] Round-trip assertions preserve `PrtDevMode`, `Checksum`, and form format bytes.