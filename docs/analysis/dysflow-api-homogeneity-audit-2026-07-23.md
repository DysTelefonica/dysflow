# Auditoría de homogeneidad de la API de Dysflow 2.22.1

Fecha: 2026-07-23  
Alcance: las 90 herramientas anunciadas por el MCP live  
Fuentes de verdad:

- `get_capabilities({})` del runtime 2.22.1.
- `schema({})` del mismo proceso MCP.
- Esquemas MCP anunciados al host.
- Implementación de `schema-tool.ts`, `mcp-tool-contracts.ts`,
  `access-query-request-mapper.ts` y las rutas de formularios, inspeccionadas
  mediante CodeGraph.

Artefactos complementarios:

- [Mapa de las 90 herramientas](./dysflow-api-tool-map-2.22.1.md).
- [Inventario íntegro de 992 apariciones de parámetros](./dysflow-api-parameter-map-2.22.1.csv).

## 1. Resumen ejecutivo

La superficie es funcionalmente rica, pero todavía no es homogénea para un
consumidor automático. El problema principal NO es que existan 90
herramientas: es que el runtime expone varias verdades parciales que no siempre
coinciden.

Datos objetivos:

| Métrica | Resultado |
|---|---:|
| Herramientas | 90 |
| Familias funcionales | 11 |
| Nombres de parámetro únicos | 164 |
| Apariciones de parámetros | 992 |
| Mediana de parámetros por herramienta | 10 |
| Máximo | 28 (`sync_binary`) |
| Defaults descritos en texto | 126 |
| Defaults expuestos de forma estructurada | 1 |
| Apariciones de aliases explicados solo en texto | 97 |
| Descripciones de parámetros con historia de issues | 40 |
| Herramientas sin `useCases` | 81 |
| Esquemas de retorno específicos | 0; las 90 exponen el mismo envelope genérico |

Conclusión: un agente puede operar Dysflow, pero necesita recordar excepciones,
interpretar prosa y cruzar `get_capabilities`, `schema`, la descripción MCP y
skills. Esa carga debe absorberla el runtime.

## 2. Modelo de uso homogéneo propuesto

Mientras se resuelven los hallazgos, cualquier consumidor debería seguir un
único protocolo:

1. `get_capabilities({})` para estado y gates.
2. `diagnose({cwd?, projectId?})` para el contexto del proyecto.
3. `describe_tool({name})` antes de construir una llamada no trivial.
4. Usar exclusivamente parámetros canónicos:
   - `apply:false` para preview.
   - `apply:true` para commit.
   - `dryRun` o `diff` solo cuando el registry declare que son canónicos o
     aliases compatibles.
5. Identidad:
   - `projectId` identifica el proyecto.
   - `contextId` solo correlaciona una operación distinta; no duplica
     `projectId`.
6. Contexto estricto:
   - elegir el target mediante la config registrada;
   - usar `strictContext` y `expected*` cuando la identidad del destino sea
     crítica;
   - no inventar overrides de paths.
7. Leer `ok`, `isError`, `error.code` y los datos estructurados; no parsear
   mensajes.

## 3. Mapa funcional simplificado

### 3.1 Bootstrap y diagnóstico

Camino recomendado:

`get_capabilities` → `diagnose` → `describe_tool`

- `schema` queda para generación de catálogos y auditorías completas.
- `resolve_project` queda para verificar worktrees.
- `state` y `logs` son herramientas de investigación posterior.
- `doctor` es diagnóstico por categorías/CLI y no debería competir
  conceptualmente con `diagnose`.

### 3.2 Source ↔ binary

Camino recomendado:

`verify_code` → `sync_binary`

- `import_modules` / `export_modules`: control granular.
- `import_all` / `export_all`: resync deliberado de árbol completo.
- `list_objects`, `list_vba_modules` y `exists`: inspección, no alternativas a
  `verify_code`.

### 3.3 Tests y ejecución

- `test_vba`: tests registrados en manifests.
- `run_vba`: procedimiento público permitido.
- `vba_inline_execution`: snippet temporal excepcional.

No son intercambiables. `test_vba` conserva hoy `dryRun` como flag canónico,
mientras el resto de writes converge en `apply`.

### 3.4 SQL y datos

Camino recomendado:

- `query_execute({mode:"read"})` para lectura ad hoc.
- `query_execute({mode:"write", apply:false|true})` para escritura explícita.
- `get_schema`, `list_tables`, `get_relationships` para metadatos.
- `exec_sql`, `query_sql`, `create_table`, `drop_table`, `seed_fixture` y
  `teardown_fixture` deben tratarse como wrappers especializados o de
  compatibilidad, no como caminos equivalentes sin jerarquía.

### 3.5 Formularios

Camino recomendado:

`analyze_form_ui` → `map_form_behavior` → `generate_form_design_plan` →
`apply_form_design_plan` → `verify_form_ui`

- Para cambios simples: preferir `form_set_properties` a N llamadas de
  `form_set_property`.
- Para geometría: preferir `form_align_controls` /
  `form_distribute_controls` a N movimientos.
- `sourcePath` debería significar siempre el `.form.txt`; `path` es hoy un
  alias demasiado ambiguo.

### 3.6 Procesos y recuperación

`list_access_operations` → `cleanup_access_operation({force:false})` →
`access_force_cleanup_orphaned({confirmPid:null})` → confirmación exacta.

Las operaciones condicionales necesitan una representación estructurada de
preview/confirmación; actualmente `clean_stale_markers` es el caso más
inconsistente.

## 4. Hallazgos

### H1 — `schema` no refleja el schema MCP real de varias herramientas (P0)

Evidencia:

- `schema` anuncia cero parámetros para `schema`, `diagnose`, `state` y
  `clean_stale_markers`.
- El MCP real acepta parámetros en al menos las cuatro.
- La causa está en `MODERN_TOOL_INPUT_SCHEMAS`: faltan entradas y `schema` se
  registra explícitamente con `NO_INPUT_SCHEMA`.
- `clean_stale_markers` se describe como apply condicional con `confirm:true`,
  pero su catálogo de parámetros está vacío.

Impacto: `describe_tool` puede inducir al agente a construir una llamada
incorrecta justo en las herramientas creadas para evitar el tanteo.

### H2 — El flag canónico no está presente en cinco herramientas write-class (P0)

`get_capabilities` declara `canonicalCommitFlag:"apply"`, pero `schema` no
expone `apply` para:

- `generate_erd`
- `link_tables`
- `cleanup_access_operation`
- `access_force_cleanup_orphaned`
- `clean_stale_markers`

Además, `link_tables.dryRun` dice textualmente que `apply:true` confirma la
escritura aunque `apply` no forma parte de su schema.

Impacto: el consumidor no puede obedecer simultáneamente al registry y al
schema.

### H3 — `form_serialize` aparece como read-only, pero expone `apply` y `dryRun` (P0)

`form_serialize` no está en `writeClassToolsPermitted`, pero su schema contiene
flags de mutación. Es necesario decidir una sola semántica:

- si escribe, debe ser write-class y estar gateado;
- si es puro, hay que retirar flags que no hacen nada.

### H4 — Requiredness incoherente (P0)

Ejemplos demostrados:

- `describe_tool.name` figura como opcional, pero el handler devuelve
  `MCP_INPUT_INVALID` cuando faltan tanto `name` como `toolName`.
- `cleanup_access_operation.accessPath` figura como requerido, pero su
  descripción dice “Optional override”.
- `analyze_form_ui.sourcePath` figura como opcional, pero el handler falla con
  `FORM_SPEC_MISSING` si faltan `sourcePath` y `path`.

El modelo actual no puede expresar “se requiere exactamente uno de estos
aliases”. Hace falta `oneOf`/`anyOf` o metadata equivalente.

### H5 — Los defaults no son consumibles por máquina (P1)

Hay 126 parámetros cuyo texto habla de un default, pero solo uno lleva el
campo estructurado `default`.

Impacto:

- una IA debe extraer defaults de lenguaje natural;
- los tests no pueden comprobar fácilmente que descripción, schema y runtime
  coinciden;
- cambiar un default puede dejar prosa obsoleta sin romper CI.

### H6 — Aliases sin contrato estructurado (P1)

Se detectan 97 apariciones de aliases descritos en prosa. Ejemplos:

- `name` / `formName`
- `table` / `tableName`
- `sourcePath` / `databasePath`
- `path` / `testsPath`, `exportPath`, `importPath` o fichero de formulario
- `password` / `backendPassword`

No existe por parámetro:

- `canonicalName`
- `aliases[]`
- `deprecated`
- `conflictsWith[]`
- regla de precedencia

Impacto: cada adapter vuelve a implementar el aliasing y cada consumidor debe
memorizarlo.

### H7 — Sobrecarga semántica de paths y targets (P1)

- `accessPath`: 65 herramientas.
- `sourcePath`: 35 herramientas; unas veces significa base de datos y otras
  `.form.txt`.
- `path`: 24 herramientas con la descripción genérica “used as exportPath or
  importPath”, incluso cuando representa tests o formularios.
- `target`: 16 herramientas y tipos `string`/`enum` diferentes.

La homogeneización no debería eliminar targets distintos, sino darles nombres
canónicos por dominio y reservar aliases para compatibilidad.

### H8 — `projectId` y `contextId` generan ruido sistemático (P1)

- `projectId`: 84 herramientas.
- `contextId`: 80 herramientas.
- Hay dos descripciones diferentes de `contextId`; solo una aclara que no debe
  duplicar `projectId`.

Propuesta: documentarlos una vez en un bloque común del catálogo y exponer por
herramienta solo si cambia su semántica. El schema MCP puede seguir
incluyéndolos, pero `describe_tool` debería separarlos como `commonContext`.

### H9 — Los retornos del catálogo no describen los datos reales (P1)

Las 90 herramientas devuelven exactamente:

`{content, isError, ok?, error?}`

No aparece el payload específico de `verify_code`, `diagnose`, `logs`,
`sync_binary`, etc.

Impacto: se puede construir una llamada, pero no consumir su respuesta sin
skills o conocimiento previo.

### H10 — Metadatos funcionales insuficientes (P2)

- 81 herramientas carecen de `useCases`.
- 84 descripciones son únicamente “Read-only MCP contract” o
  “Write-capable MCP contract”.
- 40 descripciones de parámetros incluyen notas como `Issue #807`, útiles
  para mantenimiento pero ruidosas para el consumidor.

El catálogo debería describir intención y resultado; la genealogía de issues
debe quedar en `crossReferences`.

### H11 — `apply` + `dryRun` tiene precedencia, no exclusión uniforme (P1)

`resolveIsDryRun` implementa:

1. `apply:true` → ejecutar.
2. `dryRun:false` → ejecutar.
3. cualquier otro caso → plan.

Por tanto, `apply:true` + `dryRun:true` ejecuta. Algunos documentos/consumidores
lo interpretan como combinación contradictoria que debería rechazarse.

Hay que elegir y publicar una regla única:

- recomendada: rechazar intentos contradictorios con `MCP_INPUT_INVALID`;
- alternativa compatible: mantener precedencia, pero exponerla
  estructuradamente y probarla en todas las familias.

## 5. Accionables candidatos a issues

### I1 — P0: Garantizar paridad entre schemas MCP y `schema`/`describe_tool`

**Objetivo:** una sola fuente de schema.

Criterios:

- Las 90 herramientas comparan estructuralmente su input schema anunciado con
  el devuelto por `schema`.
- Se corrigen `schema`, `diagnose`, `state` y `clean_stale_markers`.
- Test de paridad falla al añadir una herramienta moderna sin registrarla.

### I2 — P0: Validar coherencia de write intent en las 90 herramientas

Criterios:

- Toda write-class expone su `canonicalCommitFlag`.
- Ninguna read-only expone flags de escritura.
- Resolver explícitamente los seis casos señalados en H2/H3.
- `get_capabilities`, schema MCP y `schema` producen el mismo verdict.

### I3 — P0: Expresar aliases requeridos mediante `oneOf`

Criterios:

- `describe_tool`: `name | toolName`.
- Formularios: `sourcePath | path` o `projectId + formName`, según cada tool.
- Tablas: `tableName | table`.
- El requiredness del catálogo coincide con el handler.
- Los errores indican exactamente qué combinación válida falta.

### I4 — P1: Añadir metadata estructurada de parámetros

Campos mínimos:

- `default`
- `canonicalName`
- `aliases[]`
- `deprecated`
- `conflictsWith[]`
- `precedence`
- `sensitive`

Criterio: cero defaults o aliases que existan únicamente en prosa.

### I5 — P1: Crear componentes reutilizables de schema

Bloques sugeridos:

- `ProjectIdentity`
- `OperationCorrelation`
- `AccessTarget`
- `DatabaseTarget`
- `ManagedSourceTarget`
- `StrictContext`
- `WriteIntent`
- `OutputMode`

Criterio: una sola descripción por parámetro común y tests de composición.

### I6 — P1: Exponer schemas de retorno específicos

Criterios:

- `returns.data` por herramienta.
- Uniones tipadas para plan/apply y success/error.
- `describe_tool` permite a un agente consumir el resultado sin documentación
  externa.

### I7 — P1: Definir una política única para flags contradictorios

Recomendación: rechazar `apply:true` + `dryRun:true`.

Criterios:

- misma regla en query, VBA sync, forms y mantenimiento;
- error tipado con remediation;
- tests de matriz para todas las write-class.

### I8 — P2: Publicar vistas `compact` y `full` del catálogo

- `compact`: función, required params, defaults, canonical write intent y
  resultado principal.
- `full`: JSON Schema completo, aliases, errores y referencias.

Esto reduce tokens sin perder introspección.

### I9 — P2: Definir una superficie recomendada para agentes

Sin eliminar compatibilidad:

- marcar wrappers como `preferred`, `specialized` o `legacy`;
- exponer `supersededBy`/`preferFor`;
- establecer golden paths para sync, SQL, formularios, diagnóstico y recovery.

## 6. Orden recomendado

1. I1 + I2: hoy el propio runtime ofrece contratos incompatibles.
2. I3 + I4: eliminar tanteo y parsing de prosa.
3. I6 + I7: consumo seguro y escritura uniforme.
4. I5: reducir duplicación interna.
5. I8 + I9: simplificar experiencia y coste de contexto.

No se recomienda eliminar herramientas todavía. Primero hay que hacer que el
runtime declare de manera inequívoca cuál es el camino preferido y cuáles son
wrappers especializados o compatibles.
