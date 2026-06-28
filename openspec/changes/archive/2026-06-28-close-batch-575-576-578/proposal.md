# Proposal: Close #575, #576, #578 — registry quarantine, http sanitization, mcp action map

## Intent

Cerrar 3 issues prioritarias con fixes ad-hoc sobre el código actual. Las tres
inciden sobre superficies distintas (registro de operaciones, adaptador HTTP,
dispatcher MCP) pero comparten el patrón: reforzar el contrato para que un fallo
en una capa no degrade silenciosamente el comportamiento observable por el
usuario o por el verificador TypeScript.

- **#575** — Un registry corrupto de operaciones Access se trata como vacío
  (`src/core/operations/access-operation-registry.ts:298-319`): misma firma
  que un registry limpio. Hay que ponerlo en cuarentena y reportar estado
  degradado.
- **#576** — Las respuestas de error HTTP no usan el sanitizador común
  (`src/adapters/http/server.ts:320-338` usa `sanitizeSecrets` para validation;
  `:426-438` y otros serializan resultados crudos). MCP sí envuelve con
  `sanitizeMcpErrorMessage`. Hay que aplicar el mismo sanitizador en HTTP.
- **#578** — `MCP_TOOL_QUERY_ACTIONS` se construye con
  `Object.fromEntries(...) as Record<...>` (`src/adapters/mcp/dispatch-routes.ts:88-90`).
  El cast oculta drift entre `QUERY_TOOL_NAMES` y la unión de acciones. Hay
  que reemplazarlo por una construcción compile-time-checked.

## Scope

### In Scope

- **DELTA-001** — `AccessOperationRegistry` añade `getHealth()`. Cuando el
  JSON del registry es inválido, `FileAccessOperationRegistry.readRecords`
  renombra el archivo a un sidecar `operations.json.quarantine-<ISO>.json`,
  registra el path y timestamp, y expone `status: "degraded"`. La lista
  (HTTP `/access/operations` y MCP `list_access_operations`) y la limpieza
  (HTTP `/access/cleanup`, MCP `cleanup_access_operation`) propagan el
  `registryHealth` para que el llamante pueda distinguir entre "no hay
  operaciones" y "registry estaba corrupto".

- **DELTA-002** — `sendOperationResult` aplica
  `sanitizeMcpErrorMessage(result.error.message, secrets)` con los secretos
  `httpToken / accessPassword / backendPassword` antes de serializar
  respuestas de fallo. Los tests cubren filtrado de contraseñas y de
  `;PWD=...`. Los códigos estructurados (`error.code`) y la marca
  `error.retryable` permanecen intactos.

- **DELTA-003** — `MCP_TOOL_QUERY_ACTIONS` se construye como literal tipado
  con `satisfies Record<QueryToolName, AccessQueryAction>`. El cast
  `as Record<...>` desaparece. Una nueva entrada en `QUERY_TOOL_NAMES` que
  no esté en el literal produce `TS2741` o `TS2322` en tiempo de compilación.
  Sin cambio de comportamiento en runtime.

### Out of Scope / Non-goals

- No se rediseña el formato del registry (sigue siendo JSON con shape
  `{ records: [...] }` o array legado).
- No se migra `sendOperationResult` a un sistema de sanitización enchufable
  genérico; se reusa `sanitizeMcpErrorMessage` ya existente para mantener
  paridad con MCP.
- No se tocan los archivos de encoding (`3fbd60a`).
- No se introducen nuevas herramientas MCP ni se cambia la semántica del
  flujo `cleanup_access_operation` más allá de la propagación del health.
- No se reabre el ciclo `mcp-reliability-fix` archivado.

## Capabilities

### Modified Capabilities

- `access-operation-registry` — `getHealth()` en la interfaz
  `AccessOperationRegistry`; cuarentena del archivo corrupto; health
  propagado en list/cleanup.
- `http-error-sanitization` — `sendOperationResult` sanitiza mensajes de
  error con `sanitizeMcpErrorMessage`.
- `mcp-query-dispatch` — `MCP_TOOL_QUERY_ACTIONS` se compila contra el
  literal exacto, no contra un cast.

## Approach

Tres work units, una por issue. Cada work unit: RED test, GREEN fix mínimo,
refactor mínimo (cuando aplica). UN commit por issue + UN commit por update
de tasks.md + UN commit de archive = 5 commits en total sobre `main` (per
`dysflow/release-policy/main-only` engram #14611).

Review budget: ~180 líneas estimadas (DELTA-001 ~100, DELTA-002 ~50,
DELTA-003 ~30). Por debajo del límite de 400. Sin chained PRs.

## Affected Areas

| Área | Impacto |
|---|---|
| `src/core/operations/access-operation-registry.ts` | Modified (DELTA-001) — `getHealth()`, quarantine logic |
| `src/adapters/http/server.ts` | Modified (DELTA-001 + DELTA-002) — list response shape, `sendOperationResult` |
| `src/adapters/mcp/canonical-handlers.ts` | Modified (DELTA-001) — list response shape |
| `src/adapters/mcp/dispatch-routes.ts` | Modified (DELTA-003) — typed literal |
| `test/core/operations/access-operation-registry*.test.ts` | Updated (DELTA-001) — assertions for quarantine + health |
| `test/core/runner/access-operation-registry.test.ts` | Updated (DELTA-001) — tests at lines 492, 1132, 1146 lock the OLD behavior and must change |
| `test/adapters/http/server.test.ts` | New tests (DELTA-002) — secret redaction in HTTP envelopes |
| `test/adapters/mcp/mcp-tool-action-map.test.ts` | Source-code assertion (DELTA-003) — typed literal, no cast |

## Risks

| Riesgo | Mitigación |
|---|---|
| Tests existentes en `access-operation-registry.test.ts:492, 1132, 1146` assertan el comportamiento VIEJO (empty map, log entry). Cambiarlos sin más sería romper tests. | Esos tests reflejan el bug que #575 arregla. Se actualizan en el mismo commit que el fix, con un assertion adicional que verifica la cuarentena (path con `.quarantine-`, health degraded). Esto es un cambio contractual explícito, documentado en tasks.md y en la issue. |
| Añadir `getHealth()` a `AccessOperationRegistry` rompe implementaciones externas | La interfaz es interna (`src/core/operations/`); solo `InMemoryAccessOperationRegistry` y `FileAccessOperationRegistry` la implementan. Ambas se actualizan en el mismo cambio. |
| Sanitización extra de `sendOperationResult` cambia mensajes observados por tests existentes | Los tests existentes usan mensajes "neutros" (sin secretos). El nuevo path solo se activa cuando hay secretos presentes en `error.message`; el resto del envelope queda idéntico. `sanitizeMcpErrorMessage` es determinista y solo modifica substrings explícitos. |
| `as Record<...>` cast removal podría estrechar el tipo e introducir TS2741 | Las strings literales en `QUERY_TOOL_NAMES` ya son union-typed. El `satisfies` valida que cada entrada mapea a un valor de `AccessQueryAction`; como el binding es identidad, no hay drift entre los dos union types. |

## Rollback Plan

Revertir el commit de cada issue (3 commits revertibles independientemente).
Los tests se incluyen en el mismo commit que el fix, así que el revert
deja el código en el estado pre-issue.

## Dependencies

- Strict TDD con E2E (engram #14545): cada work unit requiere RED + GREEN
  verificable con `pnpm test`. `pnpm build` valida tipos.
- Release policy `main-only` (engram #14611): commits directos a `main`,
  sin PRs ni staging.

## Success Criteria

- [ ] `pnpm test` pasa con todos los tests nuevos y los actualizados (target:
      1658 + tests nuevos verdes).
- [ ] `pnpm build` verde tras DELTA-003 (sin TS2741 / TS2322).
- [ ] `pnpm lint` y `pnpm format:check` verdes.
- [ ] Tests Pester (374) sin cambios.
- [ ] Issues #575, #576, #578 cerradas con comentario de traceability
      (commit SHA + test path).
- [ ] Change `close-batch-575-576-578` archivado en
      `openspec/changes/archive/2026-06-28-close-batch-575-576-578/`.
