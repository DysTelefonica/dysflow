# Tasks: fix-mcp-schema-argsjson-errors

## Review Workload Forecast

| Field                   | Value                          |
| ----------------------- | ------------------------------ |
| Estimated changed lines | 80-180                         |
| 400-line budget risk    | Low                            |
| Chained PRs recommended | No                             |
| Suggested split         | Single PR for GitHub issue #93 |
| Delivery strategy       | single-pr                      |
| Chain strategy          | size-exception not needed      |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: single-pr
400-line budget risk: Low

## RED Test Plan

Strict TDD is active. Use `pnpm test` for RED/GREEN evidence and `pnpm build` for final type verification.

### Phase 1: RED tests

- [x] 1.1 In `test/adapters/mcp/tools.test.ts`, add a failing test: legacy `run_vba` with malformed `argsJson` returns `MCP_INPUT_INVALID`, `isError: true`, and does not call `vbaService.execute`.
- [x] 1.2 In `test/adapters/mcp/tools.test.ts`, add regression tests: valid array `argsJson` maps to the same arguments array; valid non-array JSON maps to a single wrapped argument; omitted/blank `argsJson` maps to `[]`.
- [x] 1.3 In `test/adapters/mcp/tools.test.ts`, add a failing nested object validation test using `import_queries.queryDefinitions[0].sql`.
- [x] 1.4 In `test/adapters/mcp/tools.test.ts`, add a failing array-item validation test for `seed_fixture.allowTables`.
- [x] 1.5 In `test/adapters/mcp/stdio.test.ts`, add a JSON-RPC regression: malformed `run_vba.argsJson` returns a normal response `result.isError === true`, not `error.code === -32603`.
- [x] 1.6 Run `pnpm test`; RED evidence: initial run failed 2 tests as intended — invalid `mode` was accepted as `{"rows":[]}`, and malformed `argsJson` rejected with raw `SyntaxError: Unexpected end of JSON input`.

### Phase 2: GREEN implementation

- [x] 2.1 In `src/adapters/mcp/tools.ts`, extend `JsonSchemaProperty` so enum, array `items`, and object child schemas can express the tested nested shapes.
- [x] 2.2 In `src/adapters/mcp/tools.ts`, refactor `validateInput` into a recursive local-schema validator that reports invalid paths and honors `additionalProperties: false` at root and nested object levels.
- [x] 2.3 In `src/adapters/mcp/tools.ts`, update relevant legacy schema declarations (`moduleNames`, `allowTables`, `denyTables`, `queryDefinitions`, and `queries`) only as much as needed to enforce issue #93 scenarios without over-expanding scope.
- [x] 2.4 In `src/adapters/mcp/tools.ts`, replace raw `parseLegacyArgsJson` with a non-throwing parse result; return `invalidInput("argsJson must be valid JSON.")` when parsing fails.
- [x] 2.5 In `src/adapters/mcp/tools.ts`, ensure invalid `argsJson` returns before `services.vbaService.execute` and valid legacy mapping remains unchanged.
- [x] 2.6 Run `pnpm test`; GREEN evidence: final run passed 19 test files / 120 tests.

### Phase 3: Verification and cleanup

- [x] 3.1 Run `pnpm build`; GREEN evidence: `tsc -p tsconfig.json` passed.
- [x] 3.2 Confirm architecture tests still pass, especially core dependency direction and legacy skill boundary tests; included in the passing `pnpm test` suite.
- [x] 3.3 Inspect diff to verify no files under `C:\Proyectos\workflow\skills\dysflow` were touched and no production code imports old workflow skill folders.
- [x] 3.4 Update PR notes with RED/GREEN evidence, issue #93 closure reference, and review workload forecast.

## Dependencies

- Tasks 2.x depend on RED tests from Phase 1.
- Task 3.1 depends on GREEN implementation.
- Final PR readiness depends on both `pnpm test` and `pnpm build` passing.

## Files Expected to Modify During Apply

- `test/adapters/mcp/tools.test.ts` - primary RED/GREEN tests for safe `argsJson` and recursive validation.
- `test/adapters/mcp/stdio.test.ts` - optional JSON-RPC regression for no `-32603` internal error.
- `src/adapters/mcp/tools.ts` - adapter-only implementation.

## Non-goals

- Do not edit core services for this issue unless a RED test proves an adapter-only solution is impossible.
- Do not change legacy tool names or parity inventory.
- Do not modify `C:\Proyectos\workflow\skills\dysflow`.
