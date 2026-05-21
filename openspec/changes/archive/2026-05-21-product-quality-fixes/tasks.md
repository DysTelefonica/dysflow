# Tasks: product-quality-fixes (GH #172–#179)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~370–480 lines total |
| 400-line budget risk | Medium–High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 (correctness, ~120–150 lines) → PR2 (mcp+gates, ~250–330 lines) |
| Delivery strategy | ask-on-risk |
| Chain strategy | stacked-to-main |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | DMTF→ISO, token-aware SQL guard, E2E fix, lock-free registry reads | PR1 "correctness" | Base: main. ~120–150 lines. 4 work-unit commits. |
| 2 | Hide stub tools, shared registry, per-tool schemas, coverage floors | PR2 "mcp+gates" | Base: PR1 branch (stacked-to-main). ~250–330 lines. 4 work-unit commits. If #177 exceeds budget, split PR3. |

---

## Dependency diagram

```
main
 └─ PR1 (correctness) 📍  ← #172, #173, #174, #179
      └─ PR2 (mcp+gates)  ← #175, #176, #177, #178
```

---

## PR1 — Correctness (#172, #173, #174, #179)

### Phase 1.1 — TDD: DMTF→ISO conversion (#172)

- [ ] T1.1 **RED** — `test/core/operations/windows-processes.test.ts`: add `parseCimDateTimeToIso` unit tests covering (a) well-formed DMTF string `20240315143000.000000+000` → `2024-03-15T14:30:00.000Z`, (b) already-ISO passthrough, (c) malformed string returns structured error. Spec: scenarios §172 happy path / passthrough / edge case. Run `pnpm test` — expect RED.
- [ ] T1.2 **GREEN** — `src/core/operations/windows-processes.ts`: implement `parseCimDateTimeToIso(raw: string): string` per ADR-1; wire into `WindowsMsAccessProcessInspector.startTime` mapping. Run `pnpm test` — expect GREEN.

### Phase 1.2 — TDD: Token-aware `isReadOnlySql` (#173)

- [ ] T1.3 **RED** — `test/adapters/http/server.test.ts`: add tests for `isReadOnlySql` covering (a) SELECT with `;` inside string literal → accepted, (b) `INSERT … ; DELETE …` → rejected, (c) nested SELECT with embedded semicolon in string → accepted. Spec: scenarios §173. Run `pnpm test` — expect RED.
- [ ] T1.4 **GREEN** — `src/adapters/http/server.ts`: rewrite `isReadOnlySql` to strip comments → strip string literals → split top-level `;` → require exactly 1 non-empty statement starting with SELECT, no INTO, no DML keyword. Per ADR-2 (no new deps). Run `pnpm test` — expect GREEN.

### Phase 1.3 — Fix E2E assertion (#174)

- [ ] T1.5 **FIX** — `test/e2e/access-fixture.e2e.test.ts` line ~87: change `rows: { One: 1 }` to `rows: [{ One: 1 }]`; remove any `skipIf` wrapping the row-shape assertion. Acceptance: assertion executes unconditionally and passes with correct shape. Spec: scenarios §174.

### Phase 1.4 — TDD: Lock-free `get()` / `listRecent()` (#179)

- [ ] T1.6 **RED** — `test/core/runner/access-operation-registry.test.ts`: add concurrency test — N parallel `get()` calls + 1 concurrent `create()` — assert no deadlock, no torn JSON parse, all readers return state N or N+1. Spec: scenarios §179. Run `pnpm test` — expect RED.
- [ ] T1.7 **GREEN** — `src/core/operations/access-operation-registry.ts`: extract `readRecordsUnlocked()` (no file lock); have `get()` and `listRecent()` call it directly; writes remain through `withFileLock` + atomic rename. Per ADR-7. Run `pnpm test` — expect GREEN.

---

## PR2 — MCP + Gates (#175, #176, #177, #178)

### Phase 2.1 — TDD: Hide stub tools (#175)

- [ ] T2.1 **RED** — `test/adapters/mcp/tools.test.ts`: assert `tools/list` response does NOT contain any of the 5 stub names (`verify_code`, `verify_binary`, `reconcile_binary`, `init_project`, `normalize_documents`); assert advertised count equals real-handler count. Spec: scenarios §175. Run `pnpm test` — expect RED.
- [ ] T2.2 **GREEN** — `src/adapters/mcp/tools.ts`: add `hidden?: boolean` to `DysflowMcpTool`; mark the 5 stubs `hidden: true`. `src/adapters/mcp/stdio.ts`: filter `hidden` tools out of the `tools/list` projection (keep `tools/call` dispatch intact). Per ADR-3. Run `pnpm test` — expect GREEN.

### Phase 2.2 — TDD: Shared registry wiring (#176)

- [ ] T2.3 **RED** — `test/adapters/http/server.test.ts`: add test asserting that an operation created through the MCP adapter is visible in `GET /access/operations` from the HTTP adapter (same singleton). Also assert adapters start with the same registry instance. Spec: scenarios §176. Run `pnpm test` — expect RED.
- [ ] T2.4 **GREEN** — `src/adapters/http/server.ts`: in `createCoreServices`, build `FileAccessOperationRegistry` from `resolveProjectOperationRegistryPath(config)`; pass the same instance into `AccessPowerShellRunner`, `services.operationRegistry`, and `AccessOperationCleanupService.registry`. Export `createProjectOperationRegistry` from `stdio.ts` or move to shared. Per ADR-4. Run `pnpm test` — expect GREEN.

### Phase 2.3 — TDD: Per-tool JSON Schemas (#177)

- [ ] T2.5 **RED** — `test/adapters/mcp/tools.test.ts`: add contract test — for each tool name in `tools/list`, look up `LEGACY_TOOL_SCHEMAS[toolName]`; assert the entry exists (no fallback to catch-all); assert `list_tables` schema properties do NOT include params specific to other tools. Spec: scenarios §177 happy path / completeness. Run `pnpm test` — expect RED.
- [ ] T2.6 **DESIGN step** — Draft `LEGACY_TOOL_SCHEMAS` map in `src/adapters/mcp/tools.ts`: define reusable atoms `CONTEXT_PROPS`, `ACCESS_OVERRIDE_PROPS`, `STRICT_CONTEXT_PROPS`; compose per-tool entries following handler bodies. No wiring yet — schema map only.
- [ ] T2.7 **GREEN** — `src/adapters/mcp/tools.ts`: wire `LEGACY_TOOL_SCHEMAS` so each handler uses its own schema entry; remove catch-all. Per ADR-5. Run `pnpm test` — expect GREEN.

### Phase 2.4 — Coverage floors (#178)

- [ ] T2.8 **MEASURE** — Run `pnpm coverage` on the PR2 branch after T2.7 is GREEN. Record lines/statements/functions/branches percentages. Floor = max(0, floor(measured%) − 2) per ADR-6.
- [ ] T2.9 **RED** — `test/quality-gates/ci-workflow.test.ts`: update threshold assertions to expect numeric values > 0 (not the current "0% floor" string check); assert each threshold is a number greater than zero. Spec: scenarios §178 assertability. Run `pnpm test` — expect RED.
- [ ] T2.10 **GREEN** — `vitest.config.ts`: set `coverage.thresholds` to the floors measured in T2.8. `test/quality-gates/ci-workflow.test.ts`: confirm assertion now passes. `docs/testing/repo-quality-gates.md`: update documented floors. Run `pnpm test` — expect GREEN.
