# Delta for mcp-query-dispatch

## MODIFIED Requirements

### Requirement: REQ-003-1 — MCP_TOOL_QUERY_ACTIONS Compile-Time Checked

`MCP_TOOL_QUERY_ACTIONS` en `src/adapters/mcp/dispatch-routes.ts` DEBE
estar construido como literal tipado usando `satisfies
Record<QueryToolName, AccessQueryAction>` (o equivalente que preserve
inferencia de literales), NUNCA vía `Object.fromEntries(...) as
Record<...>` ni `Record<string, ...>` con cast.

#### Scenario: nueva entrada en QUERY_TOOL_NAMES sin mapping produce error de compilación

- DADO un cambio hipotético que añade `"new_query_tool"` a
  `QUERY_TOOL_NAMES` sin agregar entrada en `MCP_TOOL_QUERY_ACTIONS`
- CUANDO se ejecuta `pnpm build`
- ENTONCES `tsc` DEBE reportar TS2741 ("Property 'new_query_tool' is
  missing in type ...") o TS2322, FALLANDO la build

#### Scenario: el binding identidad sigue funcionando con `satisfies`

- DADO el literal `MCP_TOOL_QUERY_ACTIONS` con cada `QueryToolName`
  mapeado a su propio nombre (binding identidad)
- CUANDO se ejecuta `pnpm build`
- ENTONCES la build verde y los valores siguen siendo las strings
  originales

#### Scenario: action map sigue dando cobertura runtime

- DADO el literal tipado
- CUANDO `mcp-tool-action-map.test.ts` (existente) verifica que
  `MCP_TOOL_QUERY_ACTIONS` tiene una entrada para cada query-routed
  tool
- ENTONCES el test pasa sin modificación

### Requirement: REQ-003-2 — Construction Source Visible Test

El test de regresión de tipo DEBE detectar regresiones a la construcción
con `as Record<...>` cast.

#### Scenario: source code no contiene `as Record<QueryToolName, AccessQueryAction>`

- DADO el archivo fuente `src/adapters/mcp/dispatch-routes.ts`
- CUANDO el test `mcp-tool-action-map-source.test.ts` lo lee
- ENTONCES NO DEBE contener el patrón
  `as Record<QueryToolName, AccessQueryAction>`
- Y DEBE contener `satisfies Record<QueryToolName, AccessQueryAction>`
  (o el patrón equivalente typed literal que el equipo elija)
