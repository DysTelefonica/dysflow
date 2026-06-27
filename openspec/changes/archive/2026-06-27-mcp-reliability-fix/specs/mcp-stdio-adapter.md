# Delta for mcp-stdio-adapter

## MODIFIED Requirements

### Requirement: Empty Input Requiere Identificación En Write Tools

Una herramienta MCP con `mutatesBinary` o `mutatesFilesystem` que reciba `arguments: {}` (sin `projectId`/`accessPath`/`projectRoot`/`backendPath` ni campos obligatorios) DEBE retornar `MCP_INPUT_INVALID` antes de evaluar `allowWrites`. Las herramientas con `NO_INPUT_SCHEMA` están exentas.

#### Scenario: input vacío en write-gated
- DADO `catalog_add_control` con `mutatesFilesystem: true`
- CUANDO el adaptador recibe `arguments: {}`
- ENTONCES DEBE retornar `MCP_INPUT_INVALID` sin invocar al servicio

#### Scenario: herramienta sin esquema exenta
- DADO `list_access_operations` con `NO_INPUT_SCHEMA`
- CUANDO el adaptador recibe `arguments: {}`
- ENTONCES DEBE preservar el comportamiento actual

### Requirement: ListOrphans No Lanza Excepciones Crudas

El wrapper `listOrphans` (`stdio.ts:355-363`) DEBE retornar `failureResult` en lugar de `throw new Error` cuando `resolveService` falla o el servicio es undefined.

#### Scenario: resolveService falla o servicio ausente
- DADO `listOrphans` con `resolveService` `{ ok: false }` o `orphanCleanupService === undefined`
- ENTONCES DEBE retornar `failureResult(...)` sin lanzar excepción

(Previously: `throw new Error` rompía la simetría.)

### Requirement: Mappers Tipados Sin Cast Estructural

Los builders de `alias-tools.ts` con `validatedInput as { ... }` (líneas 82-96, 121-135, 167-184) DEBEN sustituirse por funciones puras testeables que lean solo campos del esquema y devuelvan el tipo de dominio.

#### Scenario: campo no declarado se ignora
- DADO `query_sql` con `{ sql: "SELECT 1", unknownField: "x" }`
- ENTONCES DEBE construir `AccessQueryRequest` con `sql: "SELECT 1"` y sin `unknownField`

### Requirement: Query SQL Rechaza SQL Vacío

`buildQuerySqlRequest` DEBE rechazar con `invalidInput("query_sql requires sql or query.")` cuando `sql ?? query` sea cadena vacía o solo espacios.

#### Scenario: argumentos sin sql ni query
- DADO `query_sql` con `{ projectId: "demo" }`
- ENTONCES DEBE retornar `invalidInput(...)` sin invocar al servicio

(Previously: `?? ""` ejecutaba SQL vacío.)

### Requirement: Catalog Add Control Expone DryRun/Apply En Adapter

El esquema de `catalog_add_control` (`vba-sync-schemas.ts:203-216`) DEBE exponer `dryRun` y `apply` como `generate_form` (`:188-202`). `dispatch-factory.ts:57-63` DEBE extender la rama `isFilesystemWrite` para evaluar `resolveIsDryRun` también en `catalog_add_control`.

#### Scenario: catalog_add_control expone los flags
- DADO el esquema `catalog_add_control`
- ENTONCES `properties` DEBE contener `dryRun` y `apply`

### Requirement: Send Progress Captura Rechazos

La llamada `void extra.sendNotification(...)` (`stdio.ts:162-174`) DEBE adjuntar `.catch(...)`. El log SOLO se emite cuando `DYSFLOW_DEBUG_PROGRESS === "true"`; por defecto el rechazo se silencia.

#### Scenario: rechazo silenciado o logado según env
- DADO `sendNotification` que rechaza
- CUANDO `DYSFLOW_DEBUG_PROGRESS === "true"` el error DEBE escribirse en `process.stderr`
- Y si no, NO DEBE propagarse como `unhandledRejection`

### Requirement: Service Cache Con Eviction LRU

La eviction en `serviceCache` (`stdio.ts:306-315`) DEBE seguir LRU: cada `get(key)` re-inserta (`cache.delete; cache.set`) la entrada al final; al insertar con caché al límite (16 entradas), la cabeza del iterador DEBE ser la víctima.

#### Scenario: lectura reciente protege
- DADO `serviceCache` con 16 entradas
- CUANDO se accede por `get(keyA)` y luego se inserta una nueva
- ENTONCES la evictada DEBE ser la menos recientemente accedida

### Requirement: Vitest Age Gate Para MCP_PROTOCOL_VERSION_REVIEW

Un test nuevo en `test/adapters/mcp/stdio-protocol-review.test.ts` DEBE leer `MCP_PROTOCOL_VERSION_REVIEW.reviewedAt` (`stdio.ts:74-78`), calcular la edad en días y fallar cuando supere la ventana configurable (default 90).

#### Scenario: dentro y fuera de la ventana
- DADO `reviewedAt` dentro de los últimos 90 días el test DEBE pasar
- Y DADO `reviewedAt` con más de 90 días DEBE fallar con mensaje accionable que mencione `docs/testing/mcp-protocol-maintenance.md`

### Requirement: SizeLimitTransform JSDoc Coherente

El JSDoc de `SizeLimitTransform` (`stdio-size-guard.ts:7-21`) NO DEBE afirmar que el procesamiento continúa tras una línea sobredimensionada. DEBE describir el cierre al exceder `maxBytes` (1 MiB), coherente con `emitSizeError()` en `:121` y el test `stdio-size-guard.test.ts:98-115`.

#### Scenario: JSDoc refleja el destroy()
- DADO `stdio-size-guard.ts`
- ENTONCES el JSDoc NO DEBE contener "Processing continues after an oversized line — the transform does NOT close"
- Y DEBE describir el cierre al exceder el límite

(Previously: contradecía `this.destroy()`.)

## Verification

- **Test command**: `pnpm test`
- **Files**: `src/adapters/mcp/stdio.ts`, `src/adapters/mcp/alias-tools.ts`, `src/adapters/mcp/dispatch-factory.ts`, `src/adapters/mcp/schemas/vba-sync-schemas.ts`, `src/adapters/mcp/stdio-size-guard.ts`, `test/adapters/mcp/stdio-protocol-review.test.ts`, `test/adapters/mcp/alias-tools.test.ts`, `test/adapters/mcp/access-orphan-cleanup-tool.test.ts`
- **Capability**: mcp-stdio-adapter
- **Delta**: DELTA-003..012 (excl. 004, 011)