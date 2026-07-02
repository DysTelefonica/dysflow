# Proposal: Forms UI Factory Slice 3 — Serialize and Round-Trip MCP Tools

## Intent

Ship issue #616: public MCP tools `dysflow_form_serialize` and `dysflow_form_deserialize` that wire the existing FormIR serialize/parse into the MCP server, with byte-equivalent round-trip semantics and a LoadFromText integration gate.

**Core state pre-slice-3 (already shipped)**: `serializeFormTxt(ir)` and `parseFormTxt(text)` exist in `src/core/services/form-ir-service.ts` along with `normalizeLineEndings`, `serializeEntry`, `serializeNode` private helpers. Round-trip property tests (18 cases, 47+ real fixtures) pass GREEN at line 134ms (`pnpm test test/core/services/form-ir-serialize.test.ts`). The LoadFromText integration gate test exists in `test/integration/form-ir-loadfromtext.test.ts` (skipIf no Windows).

**What slice 3 actually ships (the missing 50%)**:
- MCP tool wiring: `dysflow_form_serialize` and `dysflow_form_deserialize` exposed via the dyslow MCP server.
- LoadFromText integration gate in the deserialize path (writes deserialized `.form.txt` + invokes the existing import path + asserts no binary drift).
- Slice 4 regression: re-run existing mutation primitives against slice 3's serializers to confirm no behavior change.

This is the prerequisite for slice 5 (`create_from_template`) which will consume these tools for clone + token replacement.

## Scope

### In Scope

- Add `dysflow_form_serialize` (read-only) and `dysflow_form_deserialize` (write-gated) as discoverable MCP tools in `src/adapters/mcp/**` and `src/adapters/vba-sync/vba-forms-adapter.ts`.
- Wire the LoadFromText integration gate by reusing the existing import path.
- RED→GREEN tests at the adapter/MCP layer covering: registration, dryRun default, apply gate, LoadFromText gate, slice-4 regression.
- Update public docs (`README.md`, `docs/mcp-examples.md`, `tool-parity-registry.ts`).

### Out of Scope

- Issue #618 (`create_from_template`) — out of scope; slice 3 ships the round-trip primitive that slice 5 depends on.
- New `serializeFormTxt` / `parseFormTxt` implementations — already shipped as core.
- New `deserialize` implementation — `parseFormTxt` already serves as the inverse direction (text → IR); no new core function needed.
- Form designer UX, bulk layout generation, unrelated FormIR refactors.

## Capabilities

### New Capabilities

- `access-form-roundtrip`: Form UI serialize/deserialize with byte-equivalent round-trip + LoadFromText integration gate.

### Modified Capabilities

- `mcp-stdio-adapter`: Register and route the two public serialize/deserialize MCP tools with read-only default and explicit `apply` semantics (deserialize writes).
- `access-core-services`: Pure serializer/deserialize logic over FormIR.

## Approach

Extend the existing FormIR pipeline with pure `serialize` and `deserialize` operations. Core stays pure: string ↔ IR. Adapter owns the I/O. Verify round-trip equivalence in core via fixtures, and live via LoadFromText on a real Access project.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/models/form-ir.ts` | Modified | Add serialize/deserialize input/result types only if shared by services/tests. |
| `src/core/services/form-ir-service.ts` | Modified | Add pure `serialize(ir)` and `deserialize(source)` methods. Round-trip guard rejects metadata loss. |
| `src/adapters/vba-sync/vba-forms-adapter.ts` | Modified | Wire handlers, source read (deserialize side), source write (serialize side maybe?), LoadFromText integration gate. |
| `src/adapters/mcp/**` | Modified | Schemas, registry, routes, contracts, handlers for the two new tools. |
| `scripts/dysflow-vba-manager.ps1` | Modified | Reuse existing import path for the LoadFromText gate. |
| `README.md`, `docs/mcp-examples.md`, `test/**` | Modified | Public docs plus RED/GREEN behavior and integration coverage. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Round-trip is not byte-equivalent (whitespace, CRLF, comment order) | High | Round-trip guard at core rejects any byte-level diff; canonical fixtures assert preserved form. |
| Opaque metadata (`PrtDevMode`, `Checksum`, `Format`) is dropped by parse → serialize | Medium | Each fixture must explicitly preserve opaque keys (test asserts presence AND value). |
| LoadFromText gate fails on Access quirks different from local fixtures | Medium | Run canonical live gate against `ardelperal/VBA_TOOLKIT_BENCH/Gestion_Riesgos.accdb`; document skip behavior when fixture absent. |
| Slice 4 (already shipped) was tested against an internal serializer — re-test required | Medium | Re-run slice 4's canonical live gate against slice 3's serializer to confirm no regression. |

## Rollback Plan

Revert the change PR. If slice 4 callers depend on the new serialize API, ship a shim that delegates to the previous internal serializer.

## Dependencies

- Slice 1 (`2026-06-29-forms-ui-factory-slice-1`) and slice 2 (`2026-06-29-forms-ui-factory-slice-2`) — provide the FormIR parsing layer that slice 3 wraps. Confirm via `git log` that slice 1/2 landed in main before starting slice 3 implementation.
- Canonical bench fixture path must be available for integration verification.
- Slice 4 (already shipped, v1.12.0) — must pass re-verification against slice 3's serializer before this issue closes.

## Success Criteria

- [ ] `serialize(parse(s)) === s` round-trip equivalence proven on canonical `Form_FormRiesgosGestionRiesgo.form.txt` (byte-equal).
- [ ] `deserialize(serialize(ir)) === ir` IR round-trip equivalence proven on pure FormIR fixtures.
- [ ] Opaque metadata preservation proven for `PrtDevMode`, `Checksum`, `Format`, and event-bound `[Event Procedure]` names.
- [ ] LoadFromText integration gate passes on `Form_FormRiesgosGestionRiesgo` for all three MCP tools (serialize, deserialize, mutate-via-slice-4).
- [ ] Slice 4 mutation tests still green against slice 3's serializer (no regression from internal-serializer switch).
- [ ] Public tools discoverable via MCP tool registry; documented in `README.md` MCP tools list.
