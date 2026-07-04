# Proposal: detect-dead-code (#705)

## Intent

Add a read-only MCP tool `dysflow_detect_dead_code` that finds VBA procedures and module-level declarations defined but never referenced. Closes #705 (re-files #615). Enables safe cleanup during large Access/VBA refactors.

## Goals

- Read-only: no binary mutation, no filesystem write, no write gate.
- `scope=binary` analyzes the whole VBA project; optional `module` narrows to one.
- Each unreferenced symbol returns **evidence** (definition line, scanned modules) and **risk** (Low/Med/High).
- Exclude control-event handlers + `AutoExec`; ignore strings / comments / substrings.

## Non-goals

- No bulk-delete. Detect only; deletion stays in `delete_module` + human review.
- No `.form.txt` / `.report.txt` control-tree parsing. Special names excluded by allowlist.
- No `export_all` / `import_all` coupling. Dead-code lives in `core/services`.

## Scope

In scope: `detectDeadCode(modules, opts?): DeadCodeReport | undefined` in `src/core/services/vba-procedure-service.ts`; `findVbaReferences` search phase patched to `stripStrings(cleanLine)` before `searchRegex.test(...)`; `searchRegex` tightened to `\b<name>\b`; special-name allowlist for Access control events + `AutoExec`; new `dysflow_detect_dead_code` MCP tool (read-only, kind `vba-sync`); RED-first tests. Out of scope: auto-delete, cross-binary reachability, VBA compile-time constants.

## Capabilities

> Contract with `sdd-spec`. Sibling: `vba-orphan-audit`.

### New Capabilities
- `vba-dead-code-detection`: read-only procedure / declaration reachability via `dysflow_detect_dead_code`.

### Modified Capabilities
- None at spec level. `findVbaReferences` gains an internal string-stripping step; public contract unchanged.

## Approach

1. **RED** in `test/core/services/vba-procedure-service.test.ts`: definition-only, single-string-call, multi-module reference, exclusions (control-event / `AutoExec`), non-references (comment / substring), word-boundary, regression pins.
2. **GREEN**: wire `stripStrings` into `findVbaReferences`; tighten `searchRegex` to `\b<name>\b`; add `detectDeadCode(modules, opts?)` returning `DeadCodeReport | undefined` with findings emitting `{ symbol, module, kind, line, evidence, risk }`.
3. Register via the **modern MCP tool path** (same as the `#701` procedure tools): append to `MODERN_TOOL_NAMES` in `tools.ts`, add `modernContracts.dysflow_detect_dead_code` entry in `mcp-tool-contracts.ts`, declare `DETECT_DEAD_CODE_SCHEMA` in `schemas/dysflow-schemas.ts`, wire a custom handler in `tools.ts`; add `docs/mcp-examples.md` payload + capabilities snapshot. Modern tools bypass `dispatch-routes.ts` and `mcp-tool-registry.ts` — do NOT register there.

## Affected Areas

- `src/core/services/vba-procedure-service.ts` — new `detectDeadCode`; `findVbaReferences` strips strings + word-boundary
- `src/adapters/mcp/mcp-tool-contracts.ts` — `modernContracts.dysflow_detect_dead_code` read-only entry
- `src/adapters/mcp/schemas/dysflow-schemas.ts` — `DETECT_DEAD_CODE_SCHEMA` (with `additionalProperties: false`)
- `src/adapters/mcp/tools.ts` — append to `MODERN_TOOL_NAMES` + custom handler entry
- `test/core/services/vba-procedure-service.test.ts` — RED-first tests + regression pins
- `test/adapters/mcp/` — contract tests
- `docs/mcp-examples.md` — new tool payload

NOT touched: `dispatch-routes.ts`, `mcp-tool-registry.ts` — modern tools bypass those legacy registries.

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `findVbaReferences` regression for non-dead-code callers | Low | Pin current behavior with regression tests before string-strip |
| `stripStrings` mishandles VBA `""` escapes | Low | Existing regex collapses `""` → `''`; integration tests pin behavior |
| Special-name allowlist drops legitimate dead code | Med | Allowlist documented in tests; override deferred |
| Word-boundary misses `_`-prefixed VBA names | Low | Pattern tested against real `vba-access` naming |

## Rollback Plan

Additive + read-only. Revert commits; no state migration, no Access binary touched. `pnpm test` gates CI.

## Dependencies

- `stripStrings` helper at `vba-procedure-service.ts:61`.
- #701 procedure-introspection in `origin/main`.

## Success Criteria

- [ ] All RED tests GREEN; `pnpm test` clean.
- [ ] `dysflow_detect_dead_code` in `dysflow_get_capabilities` + `docs/mcp-examples.md`.
- [ ] Real binary: `AutoExec`, control-event handlers, string / comment / substring refs correctly classified.
- [ ] `findVbaReferences` contract for non-dead-code callers unchanged.
- [ ] #705 closed with commit SHA + test reference; #615 closed as duplicate.

## Traceability

- GitHub: #705 (primary), #615 (duplicate).