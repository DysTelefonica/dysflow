# Design: Product Quality Fixes (v0.4.4 audit)

## Architectural Overview

Eight independent, surgical bug fixes. No new modules, no boundary changes, no new dependencies. The dominant pattern is **fix at the source, keep contracts stable**: each defect is corrected where it originates, callers and test fixtures are realigned only when the type system or behaviour demands it.

Two cross-cutting touches:

1. **Composition root tightening** for #176 (HTTP must reuse the project-scoped `FileAccessOperationRegistry` already wired by MCP — eliminates a silent adapter divergence).
2. **Registry concurrency model** for #179 (split read and write paths so monitoring no longer contends with writers).

Everything else is local. The riskiest decisions are #177 (60-property blob -> per-tool schemas) and #178 (turning the coverage gate from 0% to real numbers); both get explicit calibration steps.

## ADR Index

| # | Decision | Rationale | Rejected Alternative |
|---|----------|-----------|----------------------|
| ADR-1 (#172) | Convert WMI `CreationDate` -> ISO inside `WindowsMsAccessProcessInspector` | Inspector is the boundary that normalizes OS data; downstream comparators stay shape-agnostic | Convert in `AccessOperationCleanupService` — leaks WMI format awareness into business logic |
| ADR-2 (#173) | Tokenize SQL (strip strings/comments) then count `;` between top-level statements | Single deterministic pass; no parser dependency; behaviour matches Jet expectations | Pull in a SQL parser (e.g. `node-sql-parser`) — adds prod dep, contradicts zero-dep invariant |
| ADR-3 (#175) | Add `hidden: true` flag on `DysflowMcpTool`; filter at `tools/list` projection | Keeps handlers wired and one-line re-enable; preserves dispatch path | Remove from routing map — destroys idempotency, makes re-enable a multi-file change |
| ADR-4 (#176) | Lift registry construction into `createCoreServices` and pass through `DysflowHttpServices.operationRegistry`; keep `getDefaultAccessOperationRegistry()` only as test fallback | Same instance for HTTP and MCP without breaking test wiring | Make HTTP always call `createProjectOperationRegistry(config)` directly — duplicates the MCP composition logic |
| ADR-5 (#177) | Per-tool schema map keyed by legacy tool name; each entry contains only the properties the handler reads | Schemas reflect reality; agents see accurate inputs; smaller payloads | Auto-derive from Zod runtime introspection — requires Zod adoption, out of scope |
| ADR-6 (#178) | Set coverage floors at measured % minus 2pp buffer; assert numeric floors in quality-gate test | Calibrates from empirical baseline, prevents future regressions, predictable CI | Pick round numbers (50/60/70) — either too lax or breaks the build on day 1 |
| ADR-7 (#179) | Add lock-free read path: `get` and `listRecent` read directly from disk without `withFileLock`; mutations keep the lock | Reads never block monitoring loops; writes still atomic via `rename` | Two-file split (read snapshot vs write log) — over-engineered for the contention profile |

---

## Per-Fix Technical Design

### #172 — DMTF -> ISO in WindowsMsAccessProcessInspector

**Decision**: Conversion lives in the inspector (ADR-1). The inspector already owns "talk to WMI"; everything downstream sees normalized ISO strings.

**Files to change**:
- `src/core/operations/windows-processes.ts` — convert `CreationDate` before returning the `OsProcessInfo`
- `test/core/operations/windows-processes.test.ts` (new) — unit-test the CIM datetime parser

**Implementation sketch**:

```ts
// Pure parser, no I/O — easy to unit test
function parseCimDateTimeToIso(cim: string): string {
  // Format: YYYYMMDDhhmmss.ffffff+ooo  (ooo = minute offset, signed)
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.(\d{6})([+-]\d{3})$/.exec(cim);
  if (!m) return cim; // pass-through if WMI returns unexpected shape; consumer keeps existing failure path
  const [, y, mo, d, h, mi, s, frac, off] = m;
  const offsetMin = parseInt(off, 10);
  const sign = offsetMin >= 0 ? "+" : "-";
  const absMin = Math.abs(offsetMin);
  const hh = String(Math.floor(absMin / 60)).padStart(2, "0");
  const mm = String(absMin % 60).padStart(2, "0");
  const ms = frac.slice(0, 3);
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.${ms}${sign}${hh}:${mm}`;
}
```

**Why pass-through on parse failure**: cleanup currently fails with `CLEANUP_PROCESS_START_TIME_MISMATCH` either way; we do not want to silently invent a timestamp. Pass-through preserves observability.

**Test cases**:
- Positive offset, fractional seconds, DST-active timezone
- Negative offset
- Malformed string -> returns input unchanged (regression guard)

---

### #173 — Token-aware `isReadOnlySql`

**Decision**: Strip string literals and comments first, then check for `;` *between non-empty statements*. A trailing `;` after the only statement is allowed. No SQL parser dependency (ADR-2).

**Files to change**:
- `src/adapters/http/server.ts` — replace `isReadOnlySql` body
- `test/adapters/http/server.test.ts` — add cases for quoted semicolons, trailing semicolon, multi-statement rejection

**Implementation sketch**:

```ts
function isReadOnlySql(sql: string): boolean {
  // 1. Strip comments
  const noComments = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  // 2. Strip string literals (replace with empty quotes to preserve token boundaries)
  const noStrings = noComments
    .replace(/'([^']|'')*'/g, "''")
    .replace(/"([^"]|"")*"/g, '""');
  const normalized = noStrings.trim().toLowerCase();
  // 3. Split on top-level ';' and drop empty trailing statement
  const statements = normalized.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
  if (statements.length !== 1) return false; // 0 = empty, >1 = chained
  const stmt = statements[0];
  if (!stmt.startsWith("select")) return false;
  if (/\binto\b/.test(stmt)) return false;
  if (/\b(alter|create|delete|drop|exec|execute|insert|parameters|transform|update)\b/.test(stmt)) return false;
  return true;
}
```

**Behaviour change**:
- Before: `SELECT name FROM t WHERE name = 'a;b'` rejected (contains `;`)
- After: accepted (the `;` is inside a string literal that was stripped)
- Before: `SELECT 1;` rejected
- After: accepted (trailing semicolon, single statement)
- `SELECT 1; DROP TABLE x` rejected by both (multiple top-level statements)

---

### #174 — E2E fixture row-shape assertion

**Decision**: Fix the assertion type. `AccessQueryResult.rows` is `readonly Record<string, unknown>[]`, so the matcher must use `rows: [{ One: 1 }]`.

**Files to change**:
- `test/e2e/access-fixture.e2e.test.ts` — line 87, replace `rows: { One: 1 }` with `rows: [{ One: 1 }]`

The original `skipIf(!canRunAccessE2e)` is kept (we cannot run real Access in CI), but the assertion must compile and match real shape so the test fails fast if a maintainer runs it locally with Access available.

---

### #175 — Hide unimplemented MCP stubs from `tools/list`

**Decision**: Add `hidden?: boolean` on `DysflowMcpTool`; filter at projection time in `JsonLineMcpStdioRuntime.dispatch("tools/list")` (ADR-3).

**Files to change**:
- `src/adapters/mcp/tools.ts` — add `hidden: true` to the 5 stub legacy tools whose handler returns `LEGACY_TOOL_NOT_IMPLEMENTED`
- `src/adapters/mcp/stdio.ts` — filter `hidden` tools from the `tools/list` projection
- `test/adapters/mcp/stdio.test.ts` — assert hidden tools are absent from `tools/list` but still dispatchable via `tools/call` (forward-compat)

**The 5 stub tools** (per `HIGHER_LEVEL_TOOLS` in `vba-sync-legacy-service.ts` minus those now implemented):
1. `verify_code`
2. `verify_binary`
3. `reconcile_binary`
4. `init_project`
5. `normalize_documents`

(Note: `validate_form_spec`, `generate_form`, `catalog_add_control`, `harvest_form_catalog` are listed in `HIGHER_LEVEL_TOOLS` but ARE implemented in `VbaSyncLegacyService` and appear in `implementedToolNames` in the legacy parity registry. They are NOT hidden.)

**Schema diff**:
```ts
export type DysflowMcpTool = {
  name: string;
  description: string;
  inputSchema?: JsonObjectSchema;
  hidden?: boolean; // NEW
  handler(input: unknown): Promise<McpToolResult>;
};
```

**Projection**:
```ts
// stdio.ts dispatch("tools/list")
tools: [...this.tools.values()]
  .filter((tool) => tool.hidden !== true)
  .map(({ name, description, inputSchema }) => ({ name, description, inputSchema: inputSchema ?? NO_INPUT_SCHEMA }))
```

`tools/call` still dispatches to hidden handlers — keeps re-enable to flipping a flag and keeps `LEGACY_TOOL_NOT_IMPLEMENTED` as a recoverable error if an agent explicitly invokes the tool name.

---

### #176 — Shared `FileAccessOperationRegistry` between HTTP and MCP

**Decision**: Lift project-scoped registry construction into the HTTP composition root mirror of `createConfiguredServices` in MCP (ADR-4).

**Current divergence**:
- MCP (`stdio.ts:createConfiguredServices`): `new FileAccessOperationRegistry({ filePath: <projectRoot>/.dysflow/runtime/operations.json })` — file-backed, project-scoped
- HTTP (`server.ts:createCoreServices`): `getDefaultAccessOperationRegistry()` — module-level `InMemoryAccessOperationRegistry`

Result: `GET /access/operations` never sees what MCP recorded; cleanup endpoints work against a different store than the one the runner wrote to.

**Files to change**:
- `src/adapters/mcp/stdio.ts` — export `resolveProjectOperationRegistryPath` (already exported) and `createProjectOperationRegistry` (currently private — make it exported, OR inline equivalent into a shared helper file)
- `src/adapters/http/server.ts` — `createCoreServices` builds `FileAccessOperationRegistry` from loaded config, passes the SAME instance into the runner AND into `operationRegistry`/`cleanupService`
- `test/adapters/http/server.test.ts` (or new integration test) — assert HTTP `/access/operations` returns records created via the runner (covers the same-instance contract)

**Composition root sketch** (`src/adapters/http/server.ts`):

```ts
function createCoreServices(env?: Record<string, string | undefined>): DysflowHttpServices {
  const configResult = loadDysflowConfig({ env });
  if (!configResult.ok) {
    process.stderr.write(`[dysflow] HTTP server starting in degraded mode: ...`);
    return createUnavailableHttpServices();
  }
  const config = configResult.data;
  const operationRegistry = new FileAccessOperationRegistry({
    filePath: resolveProjectOperationRegistryPath(config),
  });
  const runner = new AccessPowerShellRunner({ operationRegistry });
  return {
    diagnosticsService: new AccessDiagnosticsService({ runner, config }),
    queryService: new AccessQueryService({ runner, config }),
    vbaService: new AccessVbaService({ runner, config }),
    operationRegistry,
    cleanupService: new AccessOperationCleanupService({
      registry: operationRegistry,
      processInspector: new WindowsMsAccessProcessInspector(),
      processKiller: new WindowsProcessKiller(),
    }),
  };
}
```

**Why keep `getDefaultAccessOperationRegistry()`**: still used by tests that build `services` partially and by the `createUnavailableHttpServices()` degraded path. Marked as test-only in comments.

**Cross-process consistency**: both adapters now point to `<projectRoot>/.dysflow/runtime/operations.json`. The existing `withFileLock` makes concurrent process access safe.

---

### #177 — Per-tool schemas in MCP

**Decision**: Replace the 60-property `legacySchemaForTool` with a map keyed by tool name (ADR-5). Each entry contains only the properties the corresponding handler actually consumes (derived by reading `toLegacyQueryRequest`, `toLegacyWriteFixtureRequest`, `toLegacyMaintenanceRequest`).

**Files to change**:
- `src/adapters/mcp/tools.ts` — replace `legacySchemaForTool` body with a map; add per-tool constants
- `test/adapters/mcp/tools.test.ts` — for each legacy tool name, assert the schema validates a known-good example payload (contract test)

**Schema map architecture**:

```ts
// Reusable atoms (deduped from the original blob)
const CONTEXT_PROPS = { projectId, contextId } as const;
const ACCESS_OVERRIDE_PROPS = { accessPath, backendPath, projectRoot, destinationRoot } as const;
const STRICT_CONTEXT_PROPS = { strictContext, expectedAccessPath, expectedProjectRoot, expectedDestinationRoot } as const;

// Per-tool minimal schemas
const LEGACY_TOOL_SCHEMAS: Record<LegacyDysflowMcpToolName | "run_vba" | "query_sql" | "cleanup_access_operation", JsonObjectSchema> = {
  run_vba: { type: "object", required: ["procedureName"], additionalProperties: false, properties: { procedureName, argsJson } },
  query_sql: { type: "object", required: ["sql"], additionalProperties: false, properties: { ...CONTEXT_PROPS, ...ACCESS_OVERRIDE_PROPS, sql, query, top } },
  list_tables: { type: "object", additionalProperties: false, properties: { ...CONTEXT_PROPS, ...ACCESS_OVERRIDE_PROPS } },
  get_schema: { type: "object", required: ["tableName"], additionalProperties: false, properties: { ...CONTEXT_PROPS, ...ACCESS_OVERRIDE_PROPS, tableName, table } },
  count_rows: { type: "object", required: ["tableName"], additionalProperties: false, properties: { ...CONTEXT_PROPS, ...ACCESS_OVERRIDE_PROPS, tableName, table } },
  distinct_values: { type: "object", required: ["tableName", "columnName"], additionalProperties: false, properties: { ...CONTEXT_PROPS, ...ACCESS_OVERRIDE_PROPS, tableName, columnName, table, column, top } },
  compare_backends: { type: "object", required: ["comparePath"], additionalProperties: false, properties: { ...CONTEXT_PROPS, ...ACCESS_OVERRIDE_PROPS, comparePath, strict } },
  // ... per-tool entries; see Property Inventory below
  cleanup_access_operation: { type: "object", required: ["operationId"], additionalProperties: false, properties: { operationId, accessPath, force } },
};

function legacySchemaForTool(name: keyof typeof LEGACY_TOOL_SCHEMAS): JsonObjectSchema {
  return LEGACY_TOOL_SCHEMAS[name];
}
```

**Property inventory** (derived from `to*Request` functions and per-tool handler bodies):

| Tool | Required | Optional |
|------|----------|----------|
| `run_vba` | `procedureName` | `argsJson` |
| `query_sql` | `sql` (or `query`) | context + access overrides + `top` |
| `list_tables` | — | context + access overrides |
| `list_linked_tables` | — | context + access overrides |
| `get_schema` | `tableName` | context + access overrides + `table` alias |
| `count_rows` | `tableName` | context + access overrides + `table` alias |
| `distinct_values` | `tableName`, `columnName` | context + access overrides + aliases + `top` |
| `compare_backends` | `comparePath` | context + access overrides + `strict` |
| `list_access_files` | — | context + `rootPath`/`directory` |
| `get_relationships` | — | context + access overrides |
| `list_links` | — | context + access overrides |
| `link_tables` / `relink_tables` / `localize_backend_links` | — | context + access overrides + strict-context guards |
| `unlink_table` | `tableName` | context + access overrides + strict-context |
| `export_queries` | `exportPath` (or `path`) | context + access overrides |
| `import_queries` | `importPath` (or `path`) | context + access overrides + strict-context |
| `compact_repair` | — | context + access overrides + `backupFirst` |
| `exec_sql` | `sql` | context + access overrides + strict-write + `apply`/`dryRun` |
| `run_script` | `scriptPath` (or `path`) | context + access overrides + strict-write + `apply`/`dryRun` |
| `create_table` | `tableName`, `definition` (or `fields`) | context + access overrides + strict-write + `apply`/`dryRun` |
| `drop_table` | `tableName` | context + access overrides + strict-write + `apply`/`dryRun` + `allowTables`/`denyTables` |
| `seed_fixture` | `tableName`, `rows` | context + access overrides + strict-write + `apply`/`dryRun` |
| `teardown_fixture` | `tableName` | context + access overrides + strict-write + `apply`/`dryRun` + `allowTables`/`denyTables` |
| `export_modules`, `export_all`, `import_modules`, `import_all`, `list_objects`, `compile_vba`, `delete_module`, `fix_encoding` | per `DIRECT_MAPPINGS` | context + access overrides + tool-specific (`moduleNames`, `importMode`, `location`, etc.) |
| `exists` | `moduleName` | context |
| `test_vba` | — | context + `procedureName` OR `testsPath` + `filter` + `compile` + `argsJson` + `proceduresJson` |
| `generate_erd` | — | context + access overrides + `backendPath` + `erdPath` |
| `validate_form_spec`, `generate_form`, `catalog_add_control`, `harvest_form_catalog` | per handler | `spec`/`specPath`/`name`/`kind`/`controlName`/`controlType`/`catalogPath` |
| `cleanup_access_operation` | `operationId` | `accessPath`, `force` |
| `list_access_operations` | — | — (already uses `NO_INPUT_SCHEMA`) |

**Hidden tools** (#175): still get a schema entry (since handlers exist) but are filtered from `tools/list`. Schema entry can be a minimal `{ type: "object", additionalProperties: false, properties: { ...CONTEXT_PROPS } }`.

**Contract test pattern**:
```ts
const KNOWN_GOOD_INPUTS: Record<string, unknown> = {
  query_sql: { sql: "SELECT 1" },
  get_schema: { tableName: "T_Customers" },
  // ...
};
for (const [name, schema] of Object.entries(LEGACY_TOOL_SCHEMAS)) {
  const input = KNOWN_GOOD_INPUTS[name];
  expect(validateInput(input, schema)).toBeUndefined();
}
```

This locks schemas to real handler inputs.

---

### #178 — Coverage floors

**Decision**: Calibrate from measured coverage on `main`, set floors at `measured - 2pp` (or `floor(measured) - 1`, whichever is lower), assert exact numbers in the quality-gate test (ADR-6).

**Files to change**:
- `vitest.config.ts` — replace `0` floors with calibrated numbers
- `test/quality-gates/ci-workflow.test.ts` — assert numeric floors, not just `thresholds:` presence
- `docs/testing/repo-quality-gates.md` — update narrative (currently says "Coverage starts at a 0% floor"; quality-gate test asserts that string)

**Measurement step (manual one-time, executed during `sdd-apply`)**:
1. Run `pnpm coverage` on a clean main checkout
2. Read coverage summary (lines / branches / functions / statements percentages)
3. Compute floors: `Math.max(0, Math.floor(measured) - 2)` for each metric
4. Encode in `vitest.config.ts.test.coverage.thresholds`
5. Encode same numbers in the test assertion

**Conservative target ranges** (informed estimates — actual numbers come from the measurement step):

| Metric | Expected floor | Rationale |
|--------|---------------|-----------|
| lines | 70-80 | Heavy test coverage in core/, lighter in adapters/* and powershell wrappers |
| statements | 70-80 | tracks lines closely |
| functions | 65-75 | utility/helper coverage tends to lag |
| branches | 55-70 | error paths and PowerShell branch coverage typically lower |

**Test assertion sketch** (`test/quality-gates/ci-workflow.test.ts`):

```ts
it("enforces non-zero coverage floors", async () => {
  const config = await readText("vitest.config.ts");
  const match = /thresholds:\s*\{([^}]+)\}/m.exec(config);
  expect(match).not.toBeNull();
  const body = match![1];
  const get = (key: string) => Number(/(?:^|\s)KEY:\s*(\d+)/m.source.replace("KEY", key));
  const parse = (key: string) => {
    const m = new RegExp(`${key}:\\s*(\\d+)`).exec(body);
    return m ? Number(m[1]) : null;
  };
  expect(parse("lines")).toBeGreaterThanOrEqual(70);
  expect(parse("statements")).toBeGreaterThanOrEqual(70);
  expect(parse("functions")).toBeGreaterThanOrEqual(65);
  expect(parse("branches")).toBeGreaterThanOrEqual(55);
});
```

Exact numbers locked in tasks-phase after running `pnpm coverage`.

---

### #179 — Lock-free `get` and `listRecent`

**Decision**: `get(operationId)` and `listRecent({ limit })` read the registry file without `withFileLock`. Mutations (`create`, `update`) keep the lock. Readers tolerate brief inconsistencies because writes use atomic `rename` (already implemented).

**Files to change**:
- `src/core/operations/access-operation-registry.ts` — extract `readRecordsUnlocked()` (renamed from `readRecords`); `get`/`listRecent` call it directly; `create`/`update` still flow through `withFileLock`
- `test/core/operations/access-operation-registry.test.ts` — concurrent test: spawn N readers + 1 writer, assert no reader deadlocks and no torn JSON parse

**Read consistency model**:
- `writeRecords` uses `writeFile(tempPath)` + `rename(tempPath, filePath)` — POSIX-style atomic on a single filesystem (Node guarantees this on Windows NTFS too when both paths are siblings)
- `readFile` either sees the old file or the new file, never a half-written one
- Therefore `readRecordsUnlocked()` either returns a consistent snapshot of state N or state N+1; never a torn JSON
- Parse errors (catch returns empty `Map`) act as backpressure: caller sees empty/no-record momentarily, retries next cycle — acceptable for monitoring loops

**Implementation sketch**:

```ts
async get(operationId: string): Promise<AccessOperationRecord | undefined> {
  const record = (await this.readRecordsUnlocked()).get(operationId);
  return record ? { ...record, metadata: { ...record.metadata } } : undefined;
}

async listRecent(options: { limit?: number } = {}): Promise<AccessOperationRecord[]> {
  const limit = options.limit ?? 50;
  return [...(await this.readRecordsUnlocked()).values()]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, limit)
    .map((record) => ({ ...record, metadata: { ...record.metadata } }));
}

private async readRecordsUnlocked(): Promise<Map<string, AccessOperationRecord>> {
  // identical body to current readRecords — no lock acquisition
}
```

**What we explicitly do NOT do**: split-file (separate index/log), in-memory cache with invalidation, file-watcher. All add complexity not justified by the contention profile (a few writers per minute, monitors polling every few seconds).

**Race acknowledged**: a reader can see a record at state N while a writer commits N+1; the next read sees N+1. For cleanup decisions this is fine because the cleanup service re-reads via `registry.get()` and re-validates `processStartTime` before killing.

---

## Cross-Cutting Concerns

### Composition root invariants (post-#176)

Both adapters MUST:
1. Load `DysflowConfig` first
2. Construct ONE `FileAccessOperationRegistry` keyed off `resolveProjectOperationRegistryPath(config)`
3. Pass the same registry instance to BOTH the runner (`AccessPowerShellRunner({ operationRegistry })`) AND the adapter's exposed `operationRegistry` field
4. Cleanup service gets the same instance

`getDefaultAccessOperationRegistry()` remains for:
- HTTP degraded mode (`createUnavailableHttpServices`)
- Test scaffolding that does not need persistence

### Schema-handler contract (post-#177)

A new test (`test/adapters/mcp/legacy-schema-handler-contract.test.ts`) iterates `LEGACY_DYSFLOW_MCP_TOOL_NAMES` and asserts:
1. Every legacy name has a schema entry
2. Each schema validates its known-good example payload
3. No schema entry references properties not consumed by its handler (catches stale schema drift)

### Quality gate stability (post-#178)

The coverage docs string asserted by `ci-workflow.test.ts` ("Coverage starts at a 0% floor") must be updated together with the threshold. Plan: update `docs/testing/repo-quality-gates.md` AND the asserted substring in the same commit.

---

## File-Level Change Summary

| File | Change | Issue |
|------|--------|-------|
| `src/core/operations/windows-processes.ts` | Add `parseCimDateTimeToIso` helper; call before returning `OsProcessInfo` | #172 |
| `test/core/operations/windows-processes.test.ts` (new) | Unit-test the parser | #172 |
| `src/adapters/http/server.ts` | Rewrite `isReadOnlySql`; rewrite `createCoreServices` to wire `FileAccessOperationRegistry` | #173, #176 |
| `test/adapters/http/server.test.ts` | Add SQL guard cases + same-instance integration test | #173, #176 |
| `test/e2e/access-fixture.e2e.test.ts` | Fix `rows` shape on line 87 | #174 |
| `src/adapters/mcp/tools.ts` | Add `hidden` field; per-tool schema map; remove 60-property blob | #175, #177 |
| `src/adapters/mcp/stdio.ts` | Filter `hidden` in `tools/list` projection; export `createProjectOperationRegistry` (or move to shared) | #175, #176 |
| `test/adapters/mcp/stdio.test.ts` | Hidden-tool projection test | #175 |
| `test/adapters/mcp/tools.test.ts` | Per-tool schema contract test | #177 |
| `src/core/operations/access-operation-registry.ts` | Split read/write paths; `get`/`listRecent` lock-free | #179 |
| `test/core/operations/access-operation-registry.test.ts` | Concurrent reader/writer test | #179 |
| `vitest.config.ts` | Real thresholds | #178 |
| `test/quality-gates/ci-workflow.test.ts` | Assert numeric floors | #178 |
| `docs/testing/repo-quality-gates.md` | Update "0% floor" narrative | #178 |

---

## PR Split Recommendation

Per the proposal estimate and the chained-pr standard (400-line ceiling), ship as **two chained PRs**.

### PR1 — Correctness fixes (~120-150 lines)

**Scope**: #172, #173, #174, #179

**Work units (one commit each)**:
1. `fix(cleanup): convert WMI CreationDate to ISO in WindowsMsAccessProcessInspector` — #172, ~40 lines (parser + handler + tests)
2. `fix(http): make isReadOnlySql semicolon-aware for Jet SQL` — #173, ~30 lines (rewrite + tests)
3. `fix(test): assert rows array shape in Access E2E fixture` — #174, ~3 lines
4. `refactor(registry): make FileAccessOperationRegistry get/listRecent lock-free` — #179, ~40 lines (split + concurrent test)

**Rationale**: all four are surgical, no schema or contract changes, low review cost. Ships value immediately.

### PR2 — MCP and quality gates (~250-300 lines)

**Scope**: #175, #176, #177, #178

**Work units (one commit each)**:
1. `feat(mcp): add hidden flag and filter unimplemented tools from tools/list` — #175, ~30 lines
2. `refactor(http): share FileAccessOperationRegistry between HTTP and MCP adapters` — #176, ~50 lines (composition root + integration test)
3. `refactor(mcp): replace catch-all legacySchemaForTool with per-tool schemas` — #177, ~150-180 lines (schema map + contract test)
4. `feat(ci): enforce non-zero coverage thresholds` — #178, ~30 lines (config + assertions + docs)

**Sequencing rationale**:
- #175 before #177: hidden flag exists so #177 schema map can skip projection for hidden tools cleanly
- #176 before #178: registry change might shift coverage numbers slightly, calibrate after
- #178 last so the coverage floor reflects the final state of PR2

**Size budget**: 280-330 lines — within the 400-line ceiling but borderline. If #177 schema map balloons past expectations, split #177 into its own PR3.

**Collapse criterion**: if `sdd-tasks` measures actual diff under 400 lines after implementation, collapse PR1 + PR2 into a single PR labeled `size:exception` per the work-unit-commits convention.

---

## Risks and Open Questions

| Risk | Mitigation |
|------|------------|
| #177 schema map drifts from handler reality over time | Contract test (`legacy-schema-handler-contract.test.ts`) blocks drift in CI |
| #178 coverage floors set too high after refactors in PR2 | Measure coverage AFTER all PR2 commits land locally, then set floors |
| #176 changes file-locking pressure under load | Existing `withFileLock` already serialises mutations across processes; HTTP adapter just joins the existing queue |
| #179 lock-free read returns parse error during writer crash | `readRecordsUnlocked` returns empty `Map` on parse failure (current behaviour); cleanup re-reads next cycle |
| Updating `docs/testing/repo-quality-gates.md` and the test assertion in different commits would break CI | Both go in the same #178 commit |

**Open question (low priority)**: should `createProjectOperationRegistry` move to a shared `src/core/composition/operation-registry.ts` rather than be exported from `src/adapters/mcp/stdio.ts`? Cleaner boundary, but adds a file. Defer to implementation — exporting from `stdio.ts` is fine for this batch.
