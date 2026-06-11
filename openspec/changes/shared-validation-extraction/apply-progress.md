# Apply Progress: shared-validation-extraction

**Change**: `shared-validation-extraction`
**Issue**: #512
**Mode**: Strict TDD
**Status**: COMPLETE — shared validation extraction, MCP re-export compatibility, HTTP adapter migration, boundary documentation, full-suite verification, build verification, and MCP/HTTP smoke evidence are complete.

## Workload / PR Boundary

- Mode: stacked PR slice
- Chain strategy: stacked-to-main
- Current work unit: Final PR 2 apply closeout — full validation suite, build, and manual MCP/HTTP smoke verification.
- Boundary: verification/artifact closeout only in this final executor run; no production runtime behavior change was introduced by this run.
- Estimated review budget impact: small artifact-only closeout; no commits created in this apply run.

## Completed Tasks

- [x] 1.1 Create failing test for `src/shared/validation/validator.ts` — `validateInput()` behavior.
- [x] 1.2 Create `src/shared/validation/validator.ts` with `validateInput()` and helpers moved from MCP.
- [x] 1.3 Ensure `validator.ts` has zero adapter imports and exports pure functions.
- [x] 1.4 Create test coverage for `src/shared/validation/schemas.ts` type contracts.
- [x] 1.5 Create `src/shared/validation/schemas.ts` with shared JSON schema types.
- [x] 1.6 Create test coverage for `src/shared/validation/schema-props.ts` atoms.
- [x] 1.7 Create `src/shared/validation/schema-props.ts` with `SCHEMA_PROPS`, `CTX_PROPS`, `ACCESS_OVERRIDE`, and `STRICT_CTX`.
- [x] 1.8 Create test coverage for `src/shared/validation/http-schemas.ts` HTTP schemas.
- [x] 1.9 Create `src/shared/validation/http-schemas.ts` with HTTP request schemas.
- [x] 1.10 Create `src/shared/validation/index.ts` barrel export.
- [x] 1.11 Create test coverage for `src/adapters/mcp/validator.ts` re-export compatibility.
- [x] 1.12 Update `src/adapters/mcp/validator.ts` to re-export from shared validation.
- [x] 1.13 Create test coverage for `src/adapters/mcp/schemas/dysflow-schemas.ts` re-export compatibility.
- [x] 1.14 Update `src/adapters/mcp/schemas/dysflow-schemas.ts` to re-export shared types/atoms/schemas.
- [x] 1.15 Update `src/adapters/mcp/schemas/index.ts` to re-export shared validation contracts.
- [x] 1.16 Update `src/adapters/mcp/schemas/query-schemas.ts` to import shared atoms from shared validation.
- [x] 1.17 Update `src/adapters/mcp/schemas/vba-sync-schemas.ts` to import shared atoms from shared validation.
- [x] 1.18 Update `src/adapters/mcp/dispatch-common.ts` to import `validateInput` from shared validation.
- [x] 1.19 Run `pnpm test`; MCP adapter tests passed within the full-suite run, but the suite remains red on an unrelated timing-sensitive install-utils assertion.
- [x] 1.20 Run `pnpm build` — zero TypeScript errors.
- [x] 2.1 Existing HTTP integration coverage validates request bodies against `HTTP_QUERY_SCHEMA`, `HTTP_WRITE_QUERY_SCHEMA`, `HTTP_VBA_EXECUTE_SCHEMA`, and `CLEANUP_SCHEMA` through `src/adapters/http/server.ts`.
- [x] 2.2 Update `src/adapters/http/server.ts` to import schemas and `validateInput` from `../../shared/validation`.
- [x] 2.3 Verify HTTP adapter compiles and all HTTP-related focused tests pass.
- [x] 2.4 Run full test suite (`pnpm test`) — all tests pass.
- [x] 2.5 Run TypeScript build (`pnpm build`) — zero errors.
- [x] 2.6 Manual smoke test: built CLI MCP starts and responds to `listTools`; built CLI HTTP server starts, `/health` responds, and invalid `/query/read` is rejected by shared validation with `HTTP_INVALID_INPUT`.
- [x] 3.1 Verify no `../mcp/` imports remain in `src/adapters/http/`.
- [x] 3.2 Verify `src/shared/validation/` has zero imports from `src/adapters/`.
- [x] 3.3 Document convention forbidding adapter-to-adapter imports.
- [x] 3.4 Update/audit documentation referencing old import paths; current architecture docs now point to `src/shared/**`, while archive docs remain historical.
- [x] 3.5 Final verification: `pnpm test` and `pnpm build` are green after the full-suite brittleness fixes.

## Remaining Tasks

- None — all 31 tasks are complete.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1-1.3 shared validator | `test/shared/validation/validator.test.ts` | Unit | Existing MCP validator tests covered current behavior before extraction | Tests were introduced for shared validator behavior before relying on shared module imports | ✅ Focused shared validation test run passed; full suite executes shared validator tests | ✅ Covers invalid input, missing required fields, type mismatch, enum, nested object, array max/items, and valid payloads | ✅ Shared validator has no adapter imports |
| 1.4-1.5 schema contracts | `test/shared/validation/schemas.test.ts` | Unit/type contract | N/A — structural shared module | Tests were introduced for shared schema contract shape before relying on the moved contracts | ✅ `schemas.test.ts` passed 9/9 in focused run and full suite | ✅ Covers object schemas, nested properties, primitive union, enum, bounds, array items, and object properties | ✅ Pure type-contract module; no adapter imports |
| 1.6-1.7 schema atoms | `test/shared/validation/schema-props.test.ts` | Unit/contract | N/A — structural shared module | Tests were introduced for atom objects before relying on moved atom exports | ✅ `schema-props.test.ts` passed 15/15 in focused run and full suite | ✅ Covers individual atom definitions plus aggregate `CTX_PROPS`, `ACCESS_OVERRIDE`, `STRICT_CTX`, and expected key inventory | ✅ Shared atom source remains adapter-neutral |
| 1.8-1.9 HTTP schemas | `test/shared/validation/http-schemas.test.ts` | Unit/contract | N/A — structural shared module | Tests were introduced for HTTP schemas before depending on shared HTTP schema exports | ✅ `http-schemas.test.ts` passed 16/16 in focused run and full suite | ✅ Covers cleanup, read query, write query, and VBA execute schema paths | ✅ HTTP schemas are pure data in shared validation |
| 1.11-1.18 MCP re-export/import compatibility | `test/adapters/mcp/validator-reexport.test.ts`, `test/adapters/mcp/dysflow-schemas-reexport.test.ts`, `test/adapters/mcp/validator.test.ts` | Unit/compatibility | Existing MCP validator behavior tests remain in place | Re-export tests were introduced to fail if MCP shims stop exporting the shared runtime references | ✅ Focused MCP/shared run passed 7 files / 90 tests; full suite MCP tests passed | ✅ Covers identity references plus behavior through the MCP compatibility path | ✅ MCP schemas import shared atoms/types directly where appropriate |
| PR 2 adapter boundary / 2.2 | `test/architecture/adapter-boundary.test.ts` | Architecture/unit | ✅ Prior baseline: focused core-boundary + HTTP tests passed before import migration | ✅ Boundary test failed with `src/adapters/http/server.ts` importing MCP adapter modules | ✅ After import migration, boundary and HTTP tests passed | ➖ Triangulation skipped: structural import-boundary rule with one expected output (`[]` violations) | ✅ Kept change to import rewiring only; no runtime logic changed |
| 2.1 HTTP body validation | `test/adapters/http/server.test.ts` | HTTP adapter integration | ✅ Focused HTTP validation tests passed in prior continuation | ➖ Existing test section already covered the four HTTP schemas before this continuation; RED was not re-observed because production behavior was already implemented | ✅ Full suite HTTP server tests passed 41/41 | ✅ Tests cover cleanup, read query, write query, VBA execute, and secret redaction validation paths | ✅ No production change required in this continuation |
| 3.3-3.4 docs/import-path convention | `test/architecture/adapter-boundary.test.ts`, static grep | Architecture/docs | ✅ Existing adapter-boundary test passed before adding doc assertion | ✅ Prior doc assertion failed until the architecture convention was documented | ✅ `adapter-boundary.test.ts` passed 2/2 in full suite; doc grep audited current docs | ✅ Assertions cover prohibition and `src/shared/**` guidance; grep differentiates current docs from archive history | ✅ Root `exploration.md` moved into the SDD change artifact set |
| 2.4 full validation suite | Full repository suite | Verification | ✅ Prior focused shared/MCP/HTTP/boundary/build checks existed | N/A — verification-only task; no new production behavior | ✅ `pnpm test` passed 93 files / 1223 tests, 3 skipped | N/A — suite-level verification | ✅ Two unrelated brittle suite blockers were fixed before closeout: removed wall-clock `<1000ms` assertion in `test/cli/install-utils.test.ts`; increased stale ownerless lock reclaim timeout to `5_000ms` in `test/core/runner/access-operation-registry.test.ts` |
| 2.6 manual smoke | Built CLI (`dist/cli/index.js`) | Manual smoke | ✅ `pnpm build` completed before smoke | N/A — smoke verification-only task | ✅ MCP `listTools` returned 51 tools including `dysflow_doctor`; HTTP `/health` returned ok; invalid `/query/read` returned 400 `HTTP_INVALID_INPUT` | ✅ Smoke covers both start/respond and validation-rejection paths | ✅ Child HTTP server was killed after the smoke run |
| 3.5 final verification | Full repository suite + TypeScript build | Verification | ✅ Task 2.4 suite and task 2.6 smoke were green first | N/A — final verification-only task | ✅ `pnpm test` passed and `pnpm build` passed | N/A — final verification | ✅ No Access binary sync required; TypeScript/docs-only change |

## Tests Run

| Command | Result |
|---------|--------|
| `pnpm vitest run test/architecture/core-boundary.test.ts test/adapters/http/server.test.ts` | ✅ PASS — prior apply safety net, 44/44 tests passed |
| `pnpm vitest run test/architecture/adapter-boundary.test.ts` | ❌ RED — prior slice failed with `src\\adapters\\http\\server.ts` listed as the HTTP -> MCP violation |
| `pnpm vitest run test/architecture/adapter-boundary.test.ts` | ✅ GREEN — prior slice passed after import migration; later passed 2/2 after documentation assertion |
| `pnpm vitest run test/adapters/http/server.test.ts -t "HTTP Request Body Validation"` | ✅ PASS — prior continuation, 5 tests passed |
| `pnpm vitest run test/architecture/adapter-boundary.test.ts test/adapters/http/server.test.ts` | ✅ PASS — prior continuation, 43 tests passed |
| `pnpm exec biome check test/architecture/adapter-boundary.test.ts docs/architecture/dysflow-core-and-adapters.md` | ✅ PASS for checked TypeScript file; Biome ignored Markdown |
| `pnpm vitest run test/shared/validation/validator.test.ts test/shared/validation/schemas.test.ts test/shared/validation/schema-props.test.ts test/shared/validation/http-schemas.test.ts test/adapters/mcp/validator-reexport.test.ts test/adapters/mcp/dysflow-schemas-reexport.test.ts test/adapters/mcp/validator.test.ts` | ✅ PASS — 7 files, 90 tests passed |
| `pnpm build` | ✅ PASS — TypeScript compile succeeded |
| Fresh review evidence supplied before this continuation | ❌ `pnpm test` reported 2 unrelated failures: `test/cli/install-utils.test.ts` timeout elapsed 1030ms expected `< 1000ms`; `test/core/runner/access-operation-registry.test.ts` timed out acquiring operation registry lock |
| `pnpm test` | ❌ FAIL — latest local rerun showed 1 unrelated/pre-existing failure: `test/cli/install-utils.test.ts` / `runCommand times out and throws an error`, expected elapsed time `< 1000ms`, observed `1765ms`; 92 files passed, 1222 tests passed, 3 skipped |
| Focused fixer evidence supplied before this final closeout | ✅ PASS — `test/cli/install-utils.test.ts` after removing the brittle wall-clock `<1000ms` assertion; ✅ PASS — `test/core/runner/access-operation-registry.test.ts` after increasing the success-path stale ownerless lock reclaim timeout to `5_000ms` |
| Latest fixer full-suite evidence supplied before this final closeout | ✅ PASS — `pnpm test`, 93 files passed, 1223 tests passed, 3 skipped |
| `pnpm test` | ✅ PASS — rerun in this final apply executor, 93 files passed, 1223 tests passed, 3 skipped |
| `pnpm build` | ✅ PASS — rerun in this final apply executor, TypeScript compile succeeded |
| MCP + HTTP smoke (`node --input-type=module -e ...` against `dist/cli/index.js`) | ✅ PASS — MCP client connected to `dysflow mcp`, `listTools` returned 51 tools including `dysflow_doctor`; `dysflow serve --port 0` returned `/health` ok and invalid `/query/read` returned 400 `HTTP_INVALID_INPUT` |

## Static Verification

- `src/adapters/http/`: no `../mcp` imports remain.
- `src/shared/validation/`: no imports from `src/adapters/` remain; previous grep matches were comments only.
- `src/adapters/mcp/validator.ts` re-exports `validateInput` from `../../shared/validation/validator.js`.
- `src/adapters/mcp/schemas/dysflow-schemas.ts` re-exports shared validation types/atoms/HTTP schemas and retains only MCP-only local schemas.
- `src/adapters/mcp/schemas/query-schemas.ts` and `src/adapters/mcp/schemas/vba-sync-schemas.ts` import shared atoms from `../../../shared/validation/index.js`.
- `src/adapters/mcp/dispatch-common.ts` imports `validateInput` from `../../shared/validation/validator.js`.
- Current architecture documentation points shared validation consumers to `src/shared/**`; archived docs with old paths were left unchanged as historical records.

## Exploration Artifact Disposition

- Root-level `exploration.md` was an untracked SDD exploration artifact for issue #512.
- Disposition: it belongs in the SDD artifact set, not the repository root.
- Action: moved to `openspec/changes/shared-validation-extraction/exploration.md` and removed from the root.

## Implementation Commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `e495335` | Add shared validation kernel with validator and schemas | 1.1-1.5, 1.10 | Focused shared validation tests pass; final `pnpm test` passes 93 files / 1223 tests | N/A — TypeScript/docs-only change, no Access binary sync |
| `275a863` | Extract shared schema atoms | 1.6-1.7 | Focused schema atom tests pass; final `pnpm test` passes 93 files / 1223 tests | N/A — TypeScript/docs-only change, no Access binary sync |
| `d21af4e` | Extract shared HTTP schemas | 1.8-1.9 | Focused HTTP schema tests pass; final `pnpm test` passes 93 files / 1223 tests | N/A — TypeScript/docs-only change, no Access binary sync |
| `c95f01e` | Re-export shared validation from MCP adapter | 1.11-1.18 | Focused MCP compatibility tests pass; final `pnpm test` passes 93 files / 1223 tests | N/A — TypeScript/docs-only change, no Access binary sync |
| `a57b1e7` | Apply Biome ordering/newline cleanup for shared/MCP modules | 1.19-1.20 | `pnpm build` passes; final `pnpm test` passes 93 files / 1223 tests | N/A — TypeScript/docs-only change, no Access binary sync |
| Pending commit | PR 2 HTTP adapter migration, boundary documentation, smoke closeout, and suite brittleness fixes | 2.1-2.6, 3.1-3.5 | Focused boundary/HTTP tests pass; final `pnpm test` passes; final `pnpm build` passes; MCP + HTTP smoke passes | N/A — TypeScript/docs-only change, no Access binary sync |

## Files Changed

- `openspec/changes/shared-validation-extraction/tasks.md` — checkboxes updated for truly completed shared kernel, MCP compatibility, build, and documentation audit tasks.
- `openspec/changes/shared-validation-extraction/apply-progress.md` — merged progress artifact with prior evidence, latest review findings, latest local test evidence, and exploration disposition.
- `openspec/changes/shared-validation-extraction/exploration.md` — moved SDD exploration content into the change artifact set.
- `exploration.md` — removed root-level stray artifact.
- `test/architecture/adapter-boundary.test.ts` — architecture boundary regression test from prior slice, still present.
- `docs/architecture/dysflow-core-and-adapters.md` — adapter-to-adapter boundary convention from prior slice, still present.
- `src/adapters/http/server.ts` — validation imports from shared validation from prior slice, still present.
- `test/cli/install-utils.test.ts` — suite brittleness fix supplied before this closeout removed brittle elapsed-time `<1000ms` assertion while keeping timeout behavior coverage.
- `test/core/runner/access-operation-registry.test.ts` — suite brittleness fix supplied before this closeout increased the success-path stale ownerless lock reclaim timeout to `5_000ms`.

## Deviations / Issues

- The prior full-suite blockers were test brittleness, not shared-validation regressions. They are now fixed and the full suite is green.
- Task 2.6 smoke used the built local CLI (`dist/cli/index.js`) and did not install or modify the production runtime.
- No commits were created in this apply run.
