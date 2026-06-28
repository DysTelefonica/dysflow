# Delta for access-operation-registry

## MODIFIED Requirements

### Requirement: REQ-001-1 — Registry Corrupto Se Pone En Cuarentena

El sistema DEBE preservar (no perder) el archivo del registry cuando su JSON
no se pueda parsear, y reportar estado `degraded` para que `list`/`cleanup`
puedan distinguir entre "registry vacío" y "registry corrupto".

#### Scenario: archivo corrupto renombrado a sidecar con timestamp

- DADO un `operations.json` con contenido inválido (por ejemplo,
  `{ not valid json }`)
- CUANDO `FileAccessOperationRegistry` lee el archivo por primera vez
- ENTONCES DEBE renombrarlo a `operations.json.quarantine-<ISO8601>.json`
  junto al original
- Y DEBE devolver un `Map` vacío para esa lectura
- Y DEBE registrar internamente `quarantinePath` y `quarantinedAt`

#### Scenario: getHealth reporta estado degradado tras cuarentena

- DADO un registry cuyo `readRecords` detectó corrupción y puso en cuarentena
- CUANDO un caller invoca `getHealth()`
- ENTONCES DEBE retornar `{ status: "degraded", quarantinePath:
  "<path-absoluto>", quarantinedAt: "<ISO8601>", reason: "corrupt-json" }`

#### Scenario: getHealth reporta estado OK cuando el registry está limpio

- DADO un `operations.json` válido (o inexistente, primera ejecución)
- CUANDO un caller invoca `getHealth()`
- ENTONCES DEBE retornar `{ status: "ok" }`

#### Scenario: registry en memoria reporta estado OK

- DADO un `InMemoryAccessOperationRegistry`
- CUANDO un caller invoca `getHealth()`
- ENTONCES DEBE retornar `{ status: "ok" }` (el path in-memory nunca
  puede estar corrupto)

### Requirement: REQ-001-2 — List y Cleanup Propagan Registry Health

La capa de transporte (HTTP `/access/operations` y MCP
`list_access_operations`, HTTP `/access/cleanup` y MCP
`cleanup_access_operation`) DEBE incluir el `registryHealth` del registry
en la respuesta, de manera que el consumidor pueda distinguir entre
"no hay operaciones" y "registry estaba corrupto y se puso en cuarentena".

#### Scenario: HTTP /access/operations incluye registryHealth en la respuesta

- DADO un server HTTP con un `FileAccessOperationRegistry` cuyo JSON está
  corrupto y se ha puesto en cuarentena
- CUANDO un cliente hace `GET /access/operations`
- ENTONCES la respuesta JSON DEBE incluir un campo `registryHealth` con
  `status: "degraded"`, `quarantinePath`, `quarantinedAt`, y
  `reason: "corrupt-json"`

#### Scenario: MCP list_access_operations incluye registryHealth en la respuesta

- DADO un MCP stdio adapter con un `FileAccessOperationRegistry` cuyo JSON
  está corrupto y se ha puesto en cuarentena
- CUANDO un cliente invoca `list_access_operations`
- ENTONCES el contenido DEBE incluir un campo `registryHealth` con
  `status: "degraded"`

#### Scenario: HTTP /access/cleanup incluye registryHealth en la respuesta

- DADO un server HTTP con un `FileAccessOperationRegistry` en estado
  degradado
- CUANDO un cliente hace `POST /access/cleanup`
- ENTONCES la respuesta JSON DEBE incluir `registryHealth` con
  `status: "degraded"`

#### Scenario: registryHealth presente también en estado OK

- DADO un `FileAccessOperationRegistry` en estado OK
- CUANDO el caller inspecciona `listRecentAccessOperations` o invoca
  `list_access_operations` / `GET /access/operations`
- ENTONCES la respuesta DEBE incluir `registryHealth: { status: "ok" }`
  (campo siempre presente para que los consumidores no necesiten branching)
