# Proposal: VbaFormService Real Dependencies

## Intent

Issue #441 flags `VbaFormService` as high-risk technical debt: it accepts `executor`, `resolveExecutionTarget`, and `validateStrictContext` as `unknown`, stores them, and never uses them. This is fake dependency injection around direct filesystem calls, weakening test seams and obscuring whether form/catalog operations belong in core services or adapter orchestration.

## Scope

### In Scope
- Decide whether `VbaFormService` needs real injected ports or should remove dead dependencies.
- Preserve observable behavior for `validate_form_spec`, `generate_form`, `catalog_add_control`, and `harvest_form_catalog`.
- Add strict-TDD characterization first: port-level tests must mock only filesystem/runner I/O seams.
- Keep hexagonal direction: core owns protocol-neutral behavior; adapters wire concrete dependencies.

### Out of Scope
- New form-generation features or Access/VBA binary import behavior.
- MCP schema or CLI flag changes.
- Broad refactor of `VbaSyncAdapter`, `dispatch.ts`, or unrelated service splits.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `access-core-services`: clarify that `VBA Form Service Module` has explicit, behavior-testable I/O seams and no unused dependency constructor surface.

## Approach

Use strict TDD (`pnpm test`) before production changes. First pin current behavior through resilient tests around returned results and observable filesystem/runner-port effects. Then choose the smallest clean design: either introduce typed `FormFileSystemPort`/related collaborators used by the service, or remove the unused execution-target dependencies and keep filesystem as the only seam. Prefer adapter injection into `VbaFormsAdapter` only if tests prove adapter wiring is the real boundary to protect.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/core/services/vba-form-service.ts` | Modified | Constructor contract, typed ports, or dead dependency removal |
| `src/adapters/vba-sync/vba-forms-adapter.ts` | Modified | Possible service injection/wiring instead of hard-coded construction |
| `test/core/services/vba-form-service.test.ts` | Modified | Port-level strict-TDD coverage without real filesystem dependence where possible |
| `test/adapters/vba-sync/vba-sync-adapter.test.ts` | Modified | Adapter behavior stays stable |
| `openspec/specs/access-core-services/spec.md` | Modified | Delta spec for explicit testable seams |

## Open Design Forks

- **Real DI**: add typed filesystem/clock ports. Better isolated tests, more surface area.
- **Remove deps**: delete unused executor/target/context fields. Smaller change, but filesystem remains the main seam unless abstracted.
- **Adapter-owned service injection**: improves adapter test seams, but may exceed issue scope.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Implementation-coupled tests | Med | Test observable results/effects only; mock filesystem/runner ports only |
| Scope creep into adapter redesign | Med | Limit to `VbaFormService` dependency contract and necessary wiring |
| Backward compatibility break | Low | Preserve public tool names, result shapes, and re-exports |

## Rollback Plan

Revert the change commit/PR. No data migration, runtime install, or config schema changes are expected.

## Dependencies

- Strict TDD stays active; no Standard Mode fallback.
- Test runner: `pnpm test`.

## Success Criteria

- [ ] No unused `unknown` dependencies remain in `VbaFormService`.
- [ ] Dependencies are either typed and exercised or removed.
- [ ] Form-service behavior is testable through I/O seams without accidental real filesystem reliance.
- [ ] Existing public MCP/adapter behavior remains unchanged.
