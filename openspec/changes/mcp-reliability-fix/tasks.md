# Tasks: MCP Reliability Fix

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~380 total (~130 slice 1, ~130 slice 2, ~120 slice 3) |
| 400-line budget risk | Medium |
| Chained PRs recommended | Yes |
| Suggested split | 3 PRs via feature-branch-chain sobre staging |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | DELTA-003 + DELTA-005 + DELTA-012 + doc-fix | PR 1 (staging ← feature/mcp-reliability-slice1) | Input rejection + orphan wrapper + protocol age gate |
| 2 | DELTA-006 + DELTA-007 | PR 2 (feature/mcp-reliability-slice1 ← feature/mcp-reliability-slice2) | Typed mappers + dryRun parity |
| 3 | DELTA-008 + DELTA-009 + DELTA-010 | PR 3 (feature/mcp-reliability-slice2 ← feature/mcp-reliability-slice3) | Observability + cache LRU + empty-sql rejection |

✅ Decisión LRU resuelta (2026-06-27): opción (a) `cache.delete(key) + cache.set(key, value)` en cada `get`. Justificación: el side-effect de re-set es despreciable porque `serviceCache` guarda referencias a unavailable services. Documentado en `dysflow/mcp-reliability-fix/lru-strategy` (engram #14548).

---

## Slice 1: Write-gate Wrapper + Protocol Contract

### 1.1 DELTA-003 — Empty Input Rejection en Write-gated Tools

**DELTA**: DELTA-003 | **Spec ref**: `mcp-stdio-adapter.md §Empty Input`

**RED — test que debe fallar primero:**

- Test path: `test/adapters/mcp/stdio.test.ts`
- Test name: `inputTargetsConfig rejects empty {} targeting startup config`
- What it asserts: `inputTargetsConfig({}, startupConfig)` retorna `false`; una write-tool con `arguments: {}` retorna `MCP_INPUT_INVALID` sin invocar servicio.

**GREEN — código de producción que lo hace pasar:**

- Files to modify: `src/adapters/mcp/stdio.ts:497-512`
- Approach: En `inputTargetsConfig`, cambiar `Object.keys(params).length === 0` por `false`. La función solo retorna `true` cuando hay identificación explícita por `projectId`, `accessPath` o `projectRoot`. El rechazo de `{}` en write-gated se implementa en `dispatch-factory.ts` (agregar rama que verifique si `isWriteGated && inputTargetsConfig(input, startupConfig)` y rechace con `MCP_INPUT_INVALID`). Herramientas con `NO_INPUT_SCHEMA` (list_access_operations) permanecen exentas.

**Refactor:**

- Ninguno. Cambio mínimo y focalizado.

**Coverage expectation:**

- Unit: Test directo de `inputTargetsConfig` con `{}`, con `projectId` explícito, y con solo `unknownField`.
- Integration/E2E: Test end-to-end del handler de una write-tool con `arguments: {}` que verifique `MCP_INPUT_INVALID`.

---

### 1.2 DELTA-005 — listOrphans failureResult Wrapper

**DELTA**: DELTA-005 | **Spec ref**: `mcp-stdio-adapter.md §ListOrphans`

**RED — test que debe fallar primero:**

- Test path: `test/adapters/mcp/access-orphan-cleanup-tool.test.ts`
- Test name: `listOrphans returns failureResult on resolveService failure, not throw`
- What it asserts: Cuando `resolveService` retorna `{ ok: false }`, o `orphanCleanupService === undefined`, el wrapper `listOrphans` retorna `failureResult(...)` con código `ORPHAN_CLEANUP_SERVICE_UNAVAILABLE` y no lanza `Error`.

**GREEN — código de producción que lo hace pasar:**

- Files to modify: `src/adapters/mcp/stdio.ts:355-363`
- Approach: Cambiar los dos `throw new Error(...)` por `return failureResult(...)` con código y mensaje equivalentes. Los `error.message` de los throw actuales se preservan en el `failureResult`.

**Refactor:**

- Ninguno. Simetría con `cleanupOrphan` que ya retorna `failureResult`.

**Coverage expectation:**

- Unit: Test directo del wrapper con mock de `resolveService` fallido y con servicio undefined.
- Integration/E2E: Test de `list_access_operations` (heredado de `mcp-hardening`) no es afectado.

---

### 1.3 DELTA-012 — MCP_PROTOCOL_VERSION_REVIEW Age Gate

**DELTA**: DELTA-012 | **Spec ref**: `mcp-stdio-adapter.md §Vitest Age Gate`

**RED — test que debe fallar primero:**

- Test path: `test/adapters/mcp/stdio-protocol-review.test.ts` (crear)
- Test name: `MCP_PROTOCOL_VERSION_REVIEW reviewedAt within 90-day window passes`
- What it asserts: `reviewedAt` dentro de 90 días no produce fallo.
- Test name: `MCP_PROTOCOL_VERSION_REVIEW reviewedAt older than 90 days fails with actionable message`
- What it asserts: `reviewedAt` con más de 90 días produce `vitest.fail()` con mensaje que menciona `docs/testing/mcp-protocol-maintenance.md`.

**GREEN — código de producción que lo hace pasar:**

- Files to modify: `test/adapters/mcp/stdio-protocol-review.test.ts` (crear)
- Approach: Test solo. El código bajo test (`MCP_PROTOCOL_VERSION_REVIEW`) ya existe con `reviewedAt: "2026-06-10"`. Si `2026-06-10` ya supera los 90 días a fecha de implementación, el test fallará inicialmente — eso es correcto (RED). Actualizar `reviewedAt` a la fecha actual o fecha de revisión real en el mismo commit verde.

**Refactor:**

- Ninguno. Test only.

**Coverage expectation:**

- Unit: Test que calcula edad `(hoy - reviewedAt) > 90` y falla con mensaje accionable.
- Integration/E2E: Ninguno.

---

### 1.4 Doc Fix — SizeLimitTransform JSDoc

**DELTA**: DELTA-012 (doc-fix) | **Spec ref**: `mcp-stdio-adapter.md §SizeLimitTransform`

**RED — test que debe fallar primero:**

- Test path: `test/adapters/mcp/stdio-size-guard.test.ts`
- Test name: `SizeLimitTransform JSDoc no longer claims processing continues after oversized line`
- What it asserts: El JSDoc de `SizeLimitTransform` no contiene la frase `"Processing continues after an oversized line — the transform does NOT close"`.

**GREEN — código de producción que lo hace pasar:**

- Files to modify: `src/adapters/mcp/stdio-size-guard.ts:7-21`
- Approach: Reemplazar el JSDoc problemático por descripción coherente con `emitSizeError()` que llama `this.destroy()`: describir que el transform se cierra al exceder `maxBytes` (1 MiB). No cambiar lógica de la clase.

**Refactor:**

- Ninguno. Solo JSDoc.

**Coverage expectation:**

- Unit: Test del JSDoc (lectura del archivo fuente).
- Integration/E2E: Ninguno.

---

## Slice 2: Form/Schema Parity + Typed Mappers

### 2.1 DELTA-006 — Typed Mappers en alias-tools

**DELTA**: DELTA-006 | **Spec ref**: `mcp-stdio-adapter.md §Mappers Tipados`

**RED — test que debe fallar primero:**

- Test path: `test/adapters/mcp/alias-tools.test.ts` (crear si no existe; o extender)
- Test name: `buildCleanupRequest ignores undeclared fields`
- What it asserts: `buildCleanupRequest({ operationId: "x", accessPath: "y", unknownField: "z" })` retorna objeto sin `unknownField`.
- Test name: `buildRunVbaRequest ignores undeclared fields`
- What it asserts: `buildRunVbaRequest({ procedureName: "Test", extra: "garbage" })` retorna objeto sin `extra`.
- Test name: `buildQuerySqlRequest rejects empty sql/query`
- What it asserts: `buildQuerySqlRequest({ projectId: "demo" })` retorna `invalidInput("query_sql requires sql or query.")` cuando `sql ?? query` es cadena vacía o solo espacios.

**GREEN — código de producción que lo hace pasar:**

- Files to modify: `src/adapters/mcp/alias-tools.ts:81-112, 120-154, 167-201`
- Approach: Extraer cada cast `validatedInput as {...}` en función pura con typed params: `buildCleanupRequest(input)`, `buildRunVbaRequest(input)`, `buildQuerySqlRequest(input)`. Cada builder lee solo campos declarados del esquema, ignora extras, y para `buildQuerySqlRequest` agrega validación de cadena vacía con `invalidInput`.

**Refactor:**

- Los builders extraídos son funciones puras testables sin dependencias del handler. Se pueden unit-tester aisladamente.

**Coverage expectation:**

- Unit: Tests de cada builder cubriendo: campos válidos, campos faltantes (requeridos), campos extra (unknownField), y para `buildQuerySqlRequest` el caso de `sql` vacío / solo espacios.
- Integration/E2E: Ninguno (cambio interno de type safety).

---

### 2.2 DELTA-007 — catalog_add_control Schema Parity (dryRun/apply)

**DELTA**: DELTA-007 | **Spec ref**: `vba-form-service.md §Catalog Add Control Parity`, `mcp-stdio-adapter.md §Catalog Add Control Expone DryRun/Apply`

#### 2.2.1 Schema — catalog_add_control expone dryRun y apply

**RED — test que debe fallar primero:**

- Test path: `test/adapters/mcp/alias-tools.test.ts` (o schema test)
- Test name: `catalog_add_control schema includes dryRun and apply properties`
- What it asserts: El esquema JSON de `catalog_add_control` en `VBA_SYNC_TOOL_SCHEMAS` contiene `properties.dryRun` y `properties.apply`.

**GREEN — código de producción que lo hace pasar:**

- Files to modify: `src/adapters/mcp/schemas/vba-sync-schemas.ts:203-216`
- Approach: Agregar `dryRun: SCHEMA_PROPS.dryRun` y `apply: SCHEMA_PROPS.apply` a `catalog_add_control` schema, igual que `generate_form` en `:199-200`.

#### 2.2.2 Service — catalogAddControl resuelve dryRun con misma regla canónica

**RED — test que debe fallar primero:**

- Test path: `test/core/services/vba-form-service.test.ts`
- Test name: `catalogAddControl defaults to dryRun when both flags absent`
- What it asserts: Invocado con `{ controlName, controlType, spec }` sin `dryRun` ni `apply`, retorna `successResult` con `dryRun: true` y no modifica el catálogo.
- Test name: `catalogAddControl apply:true disables dryRun`
- What it asserts: Invocado con `apply: true` modifica el catálogo en disco.
- Test name: `catalogAddControl dryRun:true explicit respected`
- What it asserts: Invocado con `dryRun: true` no modifica el catálogo.

**GREEN — código de producción que lo hace pasar:**

- Files to modify: `src/core/services/vba-form-service.ts:134-187`
- Approach: Antes de la lógica de escritura en `catalogAddControl`, agregar `const dryRun = params.apply === true ? false : params.dryRun !== false;`. Si `dryRun` es `true`, retornar `successResult` con `{ dryRun: true, written: false, ... }` sin ejecutar escritura.

#### 2.2.3 Dispatch — catalog_add_control evalúa resolveIsDryRun

**RED — test que debe fallar primero:**

- Test path: `test/adapters/mcp/dispatch-write-gate.test.ts`
- Test name: `catalog_add_control with dryRun:true returns dry-run plan`
- What it asserts: Handler con `dryRun: true` (sin `apply`) no pasa el write-gate.
- Test name: `catalog_add_control with apply:true bypasses write-gate`
- What it asserts: Handler con `apply: true` pasa el write-gate cuando `allowWrites` está activo.

**GREEN — código de producción que lo hace pasar:**

- Files to modify: `src/adapters/mcp/dispatch-factory.ts:57-63`
- Approach: Extender la rama `isFilesystemWrite` para evaluar `resolveIsDryRun` también para `catalog_add_control`: cambiar `name === "generate_form"` por `name === "generate_form" || name === "catalog_add_control"`.

**Refactor:**

- Ninguno.

**Coverage expectation:**

- Unit: Tests de schema (props), tests de service (dryRun resolution), tests de dispatch (write-gate).
- Integration/E2E: Test end-to-end de `catalog_add_control` vía MCP: con flags omitidos → plan dry-run; con `apply:true` → ejecución.

---

## Slice 3: Observability + Cache Hygiene

### 3.1 DELTA-008 — sendProgress .catch + DYSFLOW_DEBUG_PROGRESS

**DELTA**: DELTA-008 | **Spec ref**: `mcp-stdio-adapter.md §Send Progress Captura Rechazos`

**RED — test que debe fallar primero:**

- Test path: `test/adapters/mcp/stdio.test.ts`
- Test name: `sendProgress logs to stderr when DYSFLOW_DEBUG_PROGRESS=true and notification rejects`
- What it asserts: Cuando `DYSFLOW_DEBUG_PROGRESS === "true"` y `extra.sendNotification` rechaza, el error se escribe en `process.stderr`.
- Test name: `sendProgress silently ignores rejection when DYSFLOW_DEBUG_PROGRESS is absent`
- What it asserts: Cuando `DYSFLOW_DEBUG_PROGRESS` no está definido y `sendNotification` rechaza, no se lanza `unhandledRejection`.

**GREEN — código de producción que lo hace pasar:**

- Files to modify: `src/adapters/mcp/stdio.ts:161-174`
- Approach: Cambiar `void extra.sendNotification(...)` por:
  ```ts
  extra.sendNotification({...}).catch((err) => {
    if (process.env.DYSFLOW_DEBUG_PROGRESS === "true") {
      process.stderr.write(`[dysflow] sendProgress error: ${err}\n`);
    }
  });
  ```
  El `.catch()` previene `unhandledRejection`; solo loguea cuando la variable de entorno está activa.

**Refactor:**

- Ninguno.

**Coverage expectation:**

- Unit: Stub de `extra.sendNotification` que rechaza; verificación de que `.catch` registra o silencia según la variable de entorno.
- Integration/E2E: Ninguno.

---

### 3.2 DELTA-009 — serviceCache LRU Eviction

**DELTA**: DELTA-009 | **Spec ref**: `mcp-stdio-adapter.md §Service Cache LRU`

**RED — test que debe fallar primero:**

- Test path: `test/adapters/mcp/stdio.test.ts`
- Test name: `serviceCache LRU: recently accessed entry survives eviction`
- What it asserts: Dado cache con MAX (16) entradas, cuando se hace `get(keyA)` y luego se inserta una nueva, la entrada evictada NO es `keyA` sino la menos recientemente usada.

✅ Decisión LRU resuelta: opción (a) — `cache.delete + cache.set` en cada `get`.

**GREEN — código de producción que lo hace pasar:**

- Files to modify: `src/adapters/mcp/stdio.ts:306-315`
- Approach: En el helper de `get`, ejecutar `cache.delete(key); cache.set(key, value)` para reubicar la entrada al final del insertion order. En el helper de `set`, cuando `cache.size >= MAX_UNAVAILABLE_SERVICE_CACHE_ENTRIES`, eliminar el primer elemento del iterador (`cache.keys().next().value`), que tras los reinserts del `get` representa la entrada menos recientemente accedida. El side-effect de re-set es aceptable porque `serviceCache` guarda referencias a wrappers de servicios unavailable (no los servicios en sí).

**Coverage expectation:**

- Unit: Test del cache que verifica LRU vs FIFO. Debe poder crearse con `new Map()` spy o doble y verificar `delete`+`set` en get.
- Integration/E2E: Ninguno (comportamiento interno del cache).

---

### 3.3 DELTA-010 — query_sql Empty String Rejection

**DELTA**: DELTA-010 | **Spec ref**: `mcp-stdio-adapter.md §Query SQL Rechaza`

**RED — test que debe fallar primero:**

- Test path: `test/adapters/mcp/alias-tools.test.ts`
- Test name: `buildQuerySqlRequest rejects empty sql and empty query`
- What it asserts: `buildQuerySqlRequest({ projectId: "demo" })` (sin `sql` ni `query`) retorna `invalidInput("query_sql requires sql or query.")`.

**GREEN — código de producción que lo hace pasar:**

- Files to modify: `src/adapters/mcp/alias-tools.ts` ( builder extraído en 2.1)
- Approach: En `buildQuerySqlRequest`, tras extraer el valor de `sql ?? query`, verificar si la cadena resultante está vacía o es solo espacios: `if (!sql || !sql.trim()) return invalidInput("query_sql requires sql or query.");`

**Refactor:**

- Ninguno. El builder extraído en 2.1 es reutilizado.

**Coverage expectation:**

- Unit: Test del builder con `sql` ausente, `sql: ""`, `sql: "   "`, `sql: "SELECT 1"`.
- Integration/E2E: Test end-to-end que verifique que un caller MCP con `sql` vacío recibe `MCP_INPUT_INVALID`.

---

## Implementation commits

| Commit | Work unit | SDD tasks | Verification | Access sync |
|---|---|---|---|---|
| `0cb47dc` | 1.1 DELTA-003 RED — empty input rejection (test) | test/adapters/mcp/stdio.test.ts | RED 8/8 fail | n/a |
| `5847ff3` | 1.1 DELTA-003 GREEN — inputTargetsConfig + dispatch-factory | src/adapters/mcp/stdio.ts, dispatch-factory.ts | pnpm test 1601/1601 ✅; mcp-input-validation.e2e 3/3 ✅ | n/a |
| `79c4697` | 1.1 E2E coverage for DELTA-003 | test/e2e/mcp-input-validation.e2e.test.ts | integration: 3/3 ✅ | n/a |
| `ff8623c` | 1.2 DELTA-005 RED — listOrphans wrapper (test) | test/adapters/mcp/access-orphan-cleanup-tool.test.ts | RED 2/2 fail with throw frames | n/a |
| `ca5d008` | 1.2 DELTA-005 GREEN — listOrphans returns failureResult | src/adapters/mcp/stdio.ts | pnpm test 1603/1603 ✅ | n/a |
| `ee12280` | 1.2 E2E coverage for DELTA-005 | test/e2e/mcp-orphan-cleanup.e2e.test.ts | integration: 2/2 ✅ | n/a |
| `c7fbf31` | 1.3 DELTA-012 RED — MCP_PROTOCOL_VERSION_REVIEW age gate (test) | test/adapters/mcp/stdio-protocol-review.test.ts | RED 1/3 fail (simulated +100d) | n/a |
| `28e2a76` | 1.3 DELTA-012 GREEN — bump reviewedAt + inline comment | src/adapters/mcp/stdio.ts | pnpm test 1606/1606 ✅; 3/3 protocol-review | n/a |
| `deba728` | 1.4 doc-fix RED — SizeLimitTransform JSDoc (test) | test/adapters/mcp/stdio-size-guard-jsdoc.test.ts | RED 1/2 fail on offending phrase | n/a |
| `efc8075` | 1.4 doc-fix GREEN — refresh JSDoc to match destroy() | src/adapters/mcp/stdio-size-guard.ts | pnpm test 1608/1608 ✅; 2/2 jsdoc | n/a |
| `7ef1cc7` | 2.1 DELTA-006 + DELTA-010 RED — typed mappers + empty sql (test) | test/adapters/mcp/alias-tools.test.ts | RED 5/5 fail with "is not a function" | n/a |
| `ded0b2e` | 2.1 DELTA-006 + DELTA-010 GREEN — typed builders + schema validation | src/adapters/mcp/alias-tools.ts | pnpm test 1613/1613 ✅; 5/5 alias-tools | n/a |
| `80af33b` | 2.2 DELTA-007 RED — catalogAddControl dryRun/apply parity (test) | test/adapters/mcp/dispatch-write-gate.test.ts, test/core/services/vba-form-service.test.ts | RED 8/8 fail | n/a |
| `e3a668e` | 2.2 DELTA-007 GREEN — schema + service + dispatch | src/adapters/mcp/schemas/vba-sync-schemas.ts, src/core/services/vba-form-service.ts, src/adapters/mcp/dispatch-factory.ts (+ 4 test files updated for apply:true) | pnpm test 1621/1621 ✅ | n/a |
| `85a1734` | 2.2 E2E coverage for DELTA-007 catalog_add_control dryRun/apply | test/e2e/mcp-catalog-dryrun.e2e.test.ts | integration: 4/4 ✅ | n/a |
