# Tasks: Extract VbaSyncLegacyService to the adapters layer

Strict TDD is active (`pnpm test`). Each task: RED (failing/contract test) → GREEN (minimal change) → REFACTOR. Type-check gate: `pnpm build`. Architecture gate: `test/architecture/core-boundary.test.ts` MUST stay green after every PR.

## Review Workload Forecast

- Estimated changed lines (all three PRs): ~250-320 (mostly moved, not new).
- 400-line budget risk: Low
- Chained PRs recommended: Yes (sequencing safety, not size — each PR ships independently)
- Decision needed before apply: No
- Per-PR estimate: PR1 ~40, PR2 ~180-220 (file move dominates diff), PR3 ~60-100.

PRs are chained for dependency ordering. Each is autonomous, verifiable, and revertible on its own.

---

## PR1 — Introduce `LegacyVbaSyncPort` in core contracts (no behavior change)

Depends on: none. Goal: name the seam core already uses.

- [ ] 1.1 RED: add a contract test asserting `DysflowMcpServices.legacyToolService` is assignable from a `LegacyVbaSyncPort` value (type-level via a compile fixture, or runtime mock conforming to the type). Verify `pnpm build` fails until the type exists.
  - Files: `test/core/contracts/legacy-vba-sync-port.test.ts`
- [ ] 1.2 GREEN: add `export type LegacyVbaSyncPort = { execute(toolName: string, input: unknown): Promise<OperationResult<unknown>> }` to `src/core/contracts/index.ts`.
- [ ] 1.3 GREEN: in `src/adapters/mcp/tools.ts`, change `legacyToolService?: { execute(...) }` to `legacyToolService?: LegacyVbaSyncPort` (import the type from core/contracts). Note the port uses `string` for `toolName`; the adapter narrows to `LegacyDysflowMcpToolName` internally.
- [ ] 1.4 REFACTOR: confirm `core-boundary.test.ts` and the full suite are green; `pnpm build` passes.
- [ ] 1.5 Verify: `pnpm test` + `pnpm build`. No production behavior changed.

## PR2 — Move the adapter to `src/adapters/vba-sync/` + rewire composition root

Depends on: PR1. Goal: relocate the process-spawning class out of core.

- [ ] 2.1 RED: add `test/adapters/vba-sync/vba-sync-legacy-adapter.test.ts` by MOVING `test/core/services/vba-sync-legacy-service.test.ts`, updating only the import path to `../../../src/adapters/vba-sync/vba-sync-legacy-adapter`. Run `pnpm test` — it must fail (module not found) before the move.
- [ ] 2.2 GREEN: create `src/adapters/vba-sync/vba-sync-legacy-adapter.ts`. Move from `vba-sync-legacy-service.ts`: the `VbaSyncLegacyService` class (rename export to `VbaSyncLegacyAdapter`, keep a `VbaSyncLegacyService` alias export for back-compat during transition), `spawnVbaManager`, `resolveDefaultVbaManagerScriptPath`, and the private PS/preflight helpers. Import pure collaborators (`vba-form-service`, `vba-source-comparison`, plan builders) from core.
- [ ] 2.3 GREEN: declare the class `implements LegacyVbaSyncPort`.
- [ ] 2.4 GREEN: update `src/adapters/mcp/stdio.ts` imports (3 sites: line ~264, ~308, ~337) to import `VbaSyncLegacyAdapter` from `../vba-sync/vba-sync-legacy-adapter`.
- [ ] 2.5 GREEN: in `src/core/services/vba-sync-legacy-service.ts`, remove the moved class/PS code; temporarily re-export the still-pure items (`buildImportPlanResult`, `parseArgsJson`, form/comparison re-exports) so core consumers keep compiling. Leave a deprecation comment.
- [ ] 2.6 REFACTOR: run `core-boundary.test.ts` — core must no longer reference `spawnPowerShellProcess` through the legacy service. Confirm no `node:os`/`spawn` orchestration remains in core except the already-abstracted comparison context.
- [ ] 2.7 Verify: `pnpm test` + `pnpm build`. Tool names/schemas/outputs unchanged.

## PR3 — Relocate remaining pure exports + delete the core shim

Depends on: PR2. Goal: remove the leftover core file, land pure helpers in their proper home.

- [ ] 3.1 RED: update imports in callers/tests that still pull pure helpers (`buildImportPlanResult`, `parseArgsJson`, test-plan normalizers) from `core/services/vba-sync-legacy-service`. Point them at the chosen destination (e.g. a `core/services/vba-import-plan.ts` or re-export barrel). Run `pnpm build` — fails until moved.
- [ ] 3.2 GREEN: move the pure helpers to their core destination module(s); keep `vba-form-service.ts` and `vba-source-comparison.ts` in place.
- [ ] 3.3 GREEN: delete `src/core/services/vba-sync-legacy-service.ts` and drop the temporary `VbaSyncLegacyService` alias export from the adapter (callers now use `VbaSyncLegacyAdapter`).
- [ ] 3.4 REFACTOR: tidy imports across `adapters/mcp` and tests; ensure no dead re-exports remain.
- [ ] 3.5 Verify: `pnpm test` + `pnpm build`; `core-boundary.test.ts` green. Grep confirms zero references to the deleted core path.

---

## Definition of Done (all PRs)

- `pnpm test` and `pnpm build` green.
- `test/architecture/core-boundary.test.ts` green — core imports no adapter; legacy PS spawning no longer originates from core.
- MCP tool surface (names, schemas, outputs) byte-for-byte unchanged.
- No modification to `C:\Proyectos\workflow\skills\dysflow`.
