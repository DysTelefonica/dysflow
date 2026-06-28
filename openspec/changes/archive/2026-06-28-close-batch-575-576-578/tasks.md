# Tasks: Close #575, #576, #578

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~180 total (DELTA-001 ~100, DELTA-002 ~50, DELTA-003 ~30) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | single direct commit to `main` per issue |
| Delivery strategy | single-commit per issue (no chained PR — dysflow/release-policy/main-only) |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: n/a
400-line budget risk: Low

---

## Slice 1: DELTA-001 — Registry Quarantine (#575)

### 1.1 RED test — quarantine + health

**DELTA**: DELTA-001 | **Spec ref**: `access-operation-registry.md §REQ-001-1`

**RED — test que debe fallar primero:**

- Test path: `test/core/operations/access-operation-registry-quarantine.test.ts` (nuevo)
- Test name: `quarantines corrupt JSON by renaming the file with an ISO timestamp suffix`
- What it asserts: dado un `operations.json` con contenido inválido, el
  `FileAccessOperationRegistry` lo renombra a
  `operations.json.quarantine-<ISO>.json` en la primera lectura.

- Test name: `getHealth returns degraded with quarantinePath and quarantinedAt after corrupt read`
- What it asserts: tras la lectura del archivo corrupto, `getHealth()`
  retorna `{ status: "degraded", quarantinePath: <abs>, quarantinedAt:
  <ISO>, reason: "corrupt-json" }`.

- Test name: `getHealth returns ok for in-memory registry`
- What it asserts: `InMemoryAccessOperationRegistry.getHealth()` retorna
  `{ status: "ok" }`.

- Test path (extension): `test/core/runner/access-operation-registry.test.ts`
  - Update the existing test at line 492 ("returns empty Map for a corrupt
    registry file (behavior preserved)") to assert quarantine sidecar +
    health degraded instead of just empty + log.
  - Update the existing test at line 1132 ("FileRegistry.readRecords handles
    malformed JSON gracefully") to assert quarantine sidecar.
  - Update the existing test at line 1146 ("FileRegistry.readRecords handles
    objects without records array") — this is a different case (valid JSON
    shape but missing key), so it stays with empty Map but should also
    surface degraded health (no quarantine sidecar since JSON is valid).
    Actually: re-reading the issue, it specifically targets JSON parse
    failure. Objects without `records` array is a different scenario —
    keep behavior for that case as-is (no quarantine, health OK) OR
    reclassify. Decision: keep current behavior for valid-JSON-but-wrong-shape
    (empty Map, no quarantine, health OK) — the issue is specifically about
    parse failure.

**GREEN — código de producción que lo hace pasar:**

- Files to modify:
  - `src/core/operations/access-operation-registry.ts:42-50` — add
    `getHealth(): AccessOperationRegistryHealth` to the
    `AccessOperationRegistry` interface.
  - `src/core/operations/access-operation-registry.ts:298-320` — when
    JSON.parse throws, rename the file via `rename` to
    `${filePath}.quarantine-<ISO>.json`, set instance
    `this.lastHealth = { status: "degraded", quarantinePath, quarantinedAt,
    reason: "corrupt-json" }`, then return empty Map. Add a new
    `AccessOperationRegistryHealth` type at module top.
  - `src/core/operations/access-operation-registry.ts:170-179` — add
    `getHealth()` to `InMemoryAccessOperationRegistry` returning
    `{ status: "ok" }`.
  - Add helper `listRecentAccessOperationsWithHealth(registry, options?)`
    that returns `{ records, registryHealth }` (preserves existing
    `listRecentAccessOperations` for backward compatibility).

**Integration points (DELTA-001 §REQ-001-2):**

- `src/adapters/http/server.ts:176-185` — `GET /access/operations`
  switches to `listRecentAccessOperationsWithHealth` and includes
  `registryHealth` in the success envelope.
- `src/adapters/http/server.ts:210-217` — `POST /access/cleanup`
  fetches `getHealth()` and includes `registryHealth` in the
  response (success or failure).
- `src/adapters/mcp/canonical-handlers.ts:89-96` —
  `handleMcpAccessOperationsList` returns the new shape including
  `registryHealth`.
- `src/adapters/mcp/canonical-handlers.ts:98-133` —
  `handleMcpAccessCleanup` propagates `registryHealth` in the
  response.

**Refactor:**

- None — quarantine is a focused change at one method; the helpers and
  integration sites compose cleanly.

**Coverage expectation:**

- Unit (new): quarantine sidecar exists, content unchanged, file timestamp.
- Unit (new): getHealth lifecycle (ok → degraded → ok after a clean write).
- Unit (new): in-memory getHealth is ok.
- Unit (updated): existing tests reflect new contract (RED→GREEN lock-step).
- Integration: HTTP server list response carries `registryHealth`.
- Integration: MCP list_access_operations result carries `registryHealth`.
- E2E (optional, if time allows): one e2e test using the real
  `FileAccessOperationRegistry` + HTTP server with corrupt file.

---

## Slice 2: DELTA-002 — HTTP Error Sanitization (#576)

### 2.1 RED test — secret redaction in HTTP error envelopes

**DELTA**: DELTA-002 | **Spec ref**: `http-error-sanitization.md §REQ-002-1`

**RED — test que debe fallar primero:**

- Test path: `test/adapters/http/server-error-sanitization.test.ts` (nuevo)
- Test name: `redacts accessPassword from query service failure envelope`
- What it asserts: un server HTTP con `accessPassword: "super-secret"` y un
  `queryService.execute` que retorna un error con `message: "...pwd
  super-secret..."` produce una respuesta JSON donde `error.message` no
  contiene `super-secret`.

- Test name: `redacts backendPassword from cleanup service failure envelope`
- What it asserts: análogo para cleanup.

- Test name: `redacts httpToken from any failure envelope`
- What it asserts: cualquier fallo que incluya el token en el mensaje.

- Test name: `strips ;PWD=... fragments from error message`
- What it asserts: `sanitizeConnectStrings` se aplica aunque no haya secretos
  explícitos.

- Test name: `preserves error.code and error.retryable exactly`
- What it asserts: el código y la marca retryable no se modifican.

- Test name: `does not sanitize success envelopes`
- What it asserts: si `result.ok === true`, el payload contiene la cadena
  literal "secret" sin cambios.

**GREEN — código de producción que lo hace pasar:**

- Files to modify: `src/adapters/http/server.ts`
  - Add helper `sanitizeOperationResult<T>(result: OperationResult<T>,
    secrets: readonly string[]): OperationResult<T>` that produces a
    shallow-copied result with `error.message` sanitized when `!result.ok`.
  - Update `sendOperationResult` signature to accept a `secrets` array (or
    a context with secrets). Apply sanitization on the failure branch.
  - Update `routeRequest` to construct the secrets list from `context`
    once and pass it to every `sendOperationResult` call. Existing
    validation path uses the same list.

**Refactor:**

- The `secrets` list construction is now centralized in `routeRequest`;
  the previous `handleValidation` local `secrets` array can be removed.
  The shared helper applies the same sanitization to validation errors
  and service-result errors.

**Coverage expectation:**

- Unit (new): 6 tests above cover the contract.
- Existing tests: confirm no regression in the "sanitized failure"
  test path (test/adapters/http/server.test.ts:362) — it uses a
  message without secrets, so behavior is unchanged.

---

## Slice 3: DELTA-003 — Typed Query Action Map (#578)

### 3.1 RED test — source code assertion

**DELTA**: DELTA-003 | **Spec ref**: `mcp-query-dispatch.md §REQ-003-1, §REQ-003-2`

**RED — test que debe fallar primero:**

- Test path: `test/adapters/mcp/mcp-tool-action-map-source.test.ts` (nuevo)
- Test name: `MCP_TOOL_QUERY_ACTIONS is constructed via satisfies, not as-cast`
- What it asserts: el contenido de `dispatch-routes.ts` NO contiene
  `as Record<QueryToolName, AccessQueryAction>` y SÍ contiene
  `satisfies Record<QueryToolName, AccessQueryAction>`.

**Alternative RED — TypeScript compile-time assertion:**

- We can rely on `pnpm build` as the type-level RED. Add a sentinel line
  in `test/adapters/mcp/mcp-tool-action-map-source.test.ts` that imports
  `MCP_TOOL_QUERY_ACTIONS` and assigns it to a typed variable that fails
  to compile if the inferred type is `Record<string, AccessQueryAction>`.
  This is redundant with the source-code test, so I'll skip and rely on
  the source-code assertion + `pnpm build`.

**GREEN — código de producción que lo hace pasar:**

- Files to modify: `src/adapters/mcp/dispatch-routes.ts:88-90`
- Replace:
  ```ts
  export const MCP_TOOL_QUERY_ACTIONS: Record<QueryToolName, AccessQueryAction> = Object.fromEntries(
    QUERY_TOOL_NAMES.map((name) => [name, name]),
  ) as Record<QueryToolName, AccessQueryAction>;
  ```
  with a typed object literal using `satisfies`:
  ```ts
  export const MCP_TOOL_QUERY_ACTIONS = {
    list_links: "list_links",
    export_queries: "export_queries",
    link_tables: "link_tables",
    relink_tables: "relink_tables",
    localize_backend_links: "localize_backend_links",
    unlink_table: "unlink_table",
    import_queries: "import_queries",
    compact_repair: "compact_repair",
    relink_directory: "relink_directory",
    list_tables: "list_tables",
    list_linked_tables: "list_linked_tables",
    get_schema: "get_schema",
    count_rows: "count_rows",
    distinct_values: "distinct_values",
    compare_backends: "compare_backends",
    list_access_files: "list_access_files",
    get_relationships: "get_relationships",
  } as const satisfies Record<QueryToolName, AccessQueryAction>;
  ```
- The keys must match `QUERY_TOOL_NAMES` exactly (imported from
  `./mcp-tool-registry.js`). The literal type narrows each key to its
  specific string, and `satisfies` validates that the inferred object
  is assignable to `Record<QueryToolName, AccessQueryAction>`.

**Refactor:**

- None — the change is the refactor. The literal is more verbose than
  the dynamic construction, but it gives compile-time safety. To keep
  the file readable, the literal can stay where it is; no further
  refactor needed.

**Coverage expectation:**

- Unit (new): 1 source-code assertion test.
- Existing: `test/adapters/mcp/mcp-tool-action-map.test.ts` (3 tests)
  continues to pass without modification because the literal still
  contains every query-routed tool.
- Build: `pnpm build` verde.

---

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `88770d8` | DELTA-001 — registry quarantine (#575) | src/core/operations/access-operation-registry.ts, src/adapters/http/server.ts, src/adapters/mcp/canonical-handlers.ts, src/adapters/mcp/stdio.ts, src/adapters/vba-sync/vba-operations-adapter.ts (+ tests) | pnpm test 1665/1665 ✅; pnpm build ✅; new test/core/operations/access-operation-registry-quarantine.test.ts (7 tests) | n/a (core registry + adapter envelopes) |
| `4979c48` | DELTA-002 — HTTP error sanitization (#576) | src/adapters/http/server.ts + test/adapters/http/server-error-sanitization.test.ts (new) + test/adapters/http/server.test.ts (1 message shape) | pnpm test 1672/1672 ✅; pnpm build ✅; pnpm lint ✅; new HTTP error sanitization tests (7 tests) | n/a (HTTP adapter only) |
| `764e313` | DELTA-003 — typed query action map (#578) | src/adapters/mcp/dispatch-routes.ts + test/adapters/mcp/mcp-tool-action-map-source.test.ts (new) | pnpm test 1674/1674 ✅; pnpm build ✅; pnpm lint ✅; TypeScript caught pre-existing drift (7 alias tools missing from the cast map) | n/a (MCP dispatch compile-time check) |

