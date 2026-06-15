# Capacidad: cuadro de mando de indicadores

## §0 Identidad
- **ID de capacidad**: `CAP-INDICATORS-DASHBOARD`
- **Nivel**: critical
- **Estado**: active / documentación alineada con v2; evidencia runtime reciente de indicadores recogida por slices
- **Fuente**: hybrid (documentos de funcionalidad Issue #18 + inventario de fuente + documentos adyacentes de caché)
- **Responsable / autoridad de producto**: Confirmación pendiente — informes de Calidad / gestión
- **Última verificación**: 2026-06-15, evidencia aportada de ejecuciones Dysflow por filtros/slices; esta actualización documental no ejecutó Dysflow/Access
- **Confianza global**: mixed — múltiples slices pasan como `Verified-runtime`; el manifest completo timeoutea; la reconstrucción completa idempotente y la propagación de fallo post-escritura tienen focused PASS del 2026-06-15; los 3 contratos divergentes previos (Issue18_GlobalCache + Issue38 + Issue50) se resolvieron funcionalmente el 2026-06-15

## §1 Intención de negocio
- **Propósito**: Proporcionar visibilidad de gestión sobre trabajo de NC/acciones/tareas mediante buckets de indicadores, recuentos y filas de detalle en Proyecto y Auditoría.
- **Usuarios / personas**: Equipo de calidad, managers/supervisores, usuarios de Proyecto/Auditoría, soporte/desarrolladores.
- **Problema que resuelve**: Los usuarios necesitan visibilidad actual de carga/estado sin abrir manualmente cada NC.
- **Valor de negocio / por qué existe**: Indicadores fiables impulsan seguimiento, priorización y diagnóstico de regresiones tras escrituras de negocio.
- **No objetivos**: No define cada ciclo de vida subyacente de acciones; eso vive en capacidades de dominio.
- **Fuente de intención**: Borrador de capacidad existente + documentos de funcionalidad Issue #18; nombres/umbrales de buckets pendientes de confirmación de producto/UAT.
- **Referencia tracker de origen**: Issue #18, Issue #39, Issue #67.

## §2 Contrato de comportamiento

### Escenarios (Given / When / Then)
- **GIVEN** un usuario abre el cuadro de mando **WHEN** la caché de indicadores está actualizada **THEN** los recuentos de buckets y filas de detalle se filtran por usuario/responsable y dominio.
- **GIVEN** cambian datos de NC/AC/AR/tarea **WHEN** se ejecuta sincronización post-escritura **THEN** solo se refresca el alcance de `IDNoConformidad` afectado, no una reconstrucción amplia.
- **GIVEN** falla la sincronización post-escritura **WHEN** la escritura tuvo éxito **THEN** el fallo es visible y no se afirma que la caché esté actualizada.
- **GIVEN** filas de Proyecto y Auditoría comparten infraestructura **WHEN** se ejecutan lecturas del cuadro de mando **THEN** las filas nunca se fugan entre dominios.

### Reglas de negocio
| ID de regla | Enunciado (previsto) | Autoridad | ¿Aplicada en código? | Prueba (evidencia) | Confianza |
|---|---|---|---|---|---|
| BR-IND-1 | La caché de indicadores es estado materializado compartido en backend, no estado de sesión frontend. | Docs Issue #18 | Sí, con evidencia por slices | `Issue18_BackendCacheSchema` 2/2, `CacheIndicadoresMaterializado` 8/8, `CacheIndicadoresAuditoriaMaterializado` 3/3 tras retry | Verified-runtime |
| BR-IND-2 | La caché incluye filas de detalle necesarias por el cuadro de mando, no solo recuentos agregados. | Docs Issue #18 | Sí, con deuda de rendimiento | `Issue18_CargarDetalle` 2/2 (~122s en un test), `Issue18_DetalleCompleto` 1/1 | Verified-runtime |
| BR-IND-3 | Las lecturas runtime filtran por usuario conectado/responsable. | Docs Issue #18 | Sí | `Issue18_CargarBucket` 2/2 (~120s en un test); `Test_Issue18_GlobalCache_DosResponsables_DosDominios_Atomic` 1/1 tras arreglar la query global del propio test para sumar recuentos por dominio (los recuentos per-domain evitan un quirk de caché DAO/Jet con `IN (1, 2)` en `COUNT(*)` sin más predicados); las aserciones por usuario ya pasaban | Verified-runtime (resuelto 2026-06-15) |
| BR-IND-4 | Las filas de Proyecto y Auditoría permanecen separadas por dominio. | Docs Issue #18 | Sí | `CacheIndicadoresAuditoriaMaterializado` 3/3 y `Issue18_CargarDetalle` 2/2 pasan; `Test_Issue18_GlobalCache_DosResponsables_DosDominios_Atomic` 1/1 tras el mismo arreglo de query per-domain; el test afirma ahora 5 filas globales sumando Proyecto (1) + Auditoría (2) y mantiene `QA_User` 3 + `Otro_User` 2 | Verified-runtime (resuelto 2026-06-15) |
| BR-IND-5 | Los cambios correctos de NC/AC/AR/tarea sincronizan solo el alcance de la NC afectada. | Docs Issue #18 | Sí, con hooks lentos | `Issue18_SincronizarNC` 3/3, `Issue18_NCWriteHook` 1/1 (~120s), `Issue18_ACWriteHook` 1/1 (~114s), `Issue18_ARWriteHook` 4/4 con dos hooks ~117–123s | Verified-runtime |
| BR-IND-6 | Los cambios de AC resuelven AC→NC; los de AR/tarea resuelven AR/tarea→AC→NC. | Docs Issue #18 | Sí | `Issue18_ResolverNCDesde` 3/3, `Issue18_ACWriteHook` 1/1, `Issue18_ARWriteHook` 4/4 | Verified-runtime |
| BR-IND-7 | La sincronización post-escritura fallida es visible e impide afirmaciones falsas de caché actual. | Docs Issue #18 | Sí, con evidencia focused | `Test_Issue18_NCWriteHook_InvalidarCache_FailedSync_ReturnsError_Atomic` PASS el 2026-06-15 (`4788` ms, `issue18_nc_write_hook_failed_sync_ok`): `NC 992099` inexistente, `InvalidarCache` devuelve `False` y propaga `pError` explícito | Verified-runtime focused |
| BR-IND-8 | Los nombres, umbrales y salidas de gestión de buckets del cuadro de mando están aprobados por producto. | Autoridad de producto pendiente | Desconocido | FALTA → crear mediante access-vba-tdd tras confirmar escenario UAT | Intended |

### Validaciones
- El esquema de caché tiene campos de dominio/detalle/responsable.
- Las lecturas filtran por usuario/responsable y dominio.
- La resolución de NC padre para escrituras AC/AR/tarea es obligatoria para refrescar el alcance afectado.
- Los nombres/umbrales de buckets están pendientes de confirmación.

### Transiciones de estado
- `Sin caché materializada` --(`Reconstrucción completa`)--> `Caché de indicadores construida`.
- `Caché actual` --(`Escritura afectada`)--> `Alcance de NC afectada sincronizado`.
- `Escritura correcta + fallo de sincronización` --(`Propagación de fallo`)--> `Fallo visible / caché no actual`.
- `Filas de caché compartida` --(`Lectura de cuadro de mando`)--> `Vista filtrada por usuario/dominio`.

### Caminos límite y de error
- Los resultados vacíos de bucket/detalle pueden ser válidos; no inventar fallback vivo sin regla.
- Una reconstrucción completa amplia como ruta normal de escritura es un olor de diseño.
- La fuga de dominio entre Proyecto y Auditoría es crítica.

### Señales de aceptación / presencia
- Los slices de indicadores pasan en staging actual con datos fixture controlados; no afirmar manifest completo verde.
- Las pruebas demuestran filtrado de dominio/responsable, completitud de detalle, sincronización de alcance afectado y propagación explícita de fallo post-escritura donde los slices/focused runs están verdes; no afirmar manifest completo verde.
- Las definiciones de buckets aprobadas por producto están documentadas.

## §3 Mapa de implementación
- **Puntos de entrada UI**: `Form_FormIndicadores`; vistas bucket/detalle pendientes de mapeo exacto de controles; consumidores de seguimiento/listado de Proyecto/Auditoría.
- **Puntos de entrada de fuente**: `ModuloCacheIndicadoresIssue18`, `ModuloCacheIndicadores`, `IndicadorRepositorio`, `IndicadorServicio`, `Test_IndicadoresCaracterizacion`, `Test_IndicadoresTelemetry`.
- **Datos tocados**: tablas compartidas de cabecera/configuración/detalle de caché de indicadores, NC Proyecto/NC Auditoría, datos AC/AR/tarea, campos responsable/usuario/dominio, `TbConfiguracionBackends` para enrutamiento de entorno.
- **Salidas**: recuentos de buckets del cuadro de mando, filas de detalle, diagnósticos/logs, posibles informes de gestión.
- **Dependencias e integraciones**: acciones/seguimiento de Proyecto, acciones/seguimiento de Auditoría, soporte transversal de caché/preparación.
- **Sincronización fuente↔binario**: no comprobada en esta tarea solo documental; no se importó, compiló ni ejecutó Access/VBA durante esta actualización.
- **Evaluación de diseño (as-built vs ideal)**: el modelo de lectura materializado en backend tiene evidencia runtime amplia por slices, pero la confianza sigue siendo mixta: tres contratos divergentes previos (Issue18_GlobalCache + Issue38 + Issue50) se resolvieron el 2026-06-15; la reconstrucción completa idempotente y la propagación de fallo post-escritura tienen focused PASS; quedan la cautela de manifest completo no ejecutado/verde y deuda de rendimiento en hooks/lecturas lentas.

## §4 Receta de reconstrucción
1. Confirmar nombres de buckets, umbrales, reglas de visibilidad y SLA de frescura.
2. Inspeccionar esquema y escribir pruebas fixture-first para filas de Proyecto y Auditoría, filtros de responsable, filas de detalle y resolución de padres.
3. Probar sincronización de mutaciones mediante costuras helper/servicio; los formularios siguen siendo consumidores finos.
4. Mantener pruebas de fallo de sincronización que afirmen fallo visible/no afirmación falsa de caché actual; evidencia focused actual: `Test_Issue18_NCWriteHook_InvalidarCache_FailedSync_ReturnsError_Atomic` PASS.
5. Cambios futuros: importación Dysflow → compilación manual del usuario → pruebas Dysflow.

## §5 Evidencia y trazabilidad
- **Pruebas**: evidencia aportada de ejecuciones Dysflow por filtros/slices. El manifest completo `tests/tests.vba.indicadores-caracterizacion.json` contiene 55 procedimientos y timeoutea como conjunto (`MCP error -32001: Request timed out`), por lo que no se debe declarar verde completo. Esta actualización documental no ejecutó Dysflow/Access; los `Verified-runtime` de BR-IND-3/BR-IND-4 y de los contratos Issue #38/Issue #50 se basan en la misma evidencia runtime ya recogida y aportada por el usuario.

### Evidencia runtime reciente (Dysflow por slices)

| Ámbito | Manifest / filtro | Resultado | Confianza | Nota |
|---|---|---:|---|---|
| Recuentos rápidos | `tests/tests.vba.indicator-fast-counts.json` | 5/5 | Verified-runtime | Cobertura runtime de conteos rápidos. |
| Caché materializada | `tests/tests.vba.cache-materialized.json` | 13/13 | Verified-runtime | Cobertura relacionada de caché materializada. |
| Helper de gestión/auditoría | `tests/tests.vba.audit-gestion-helper.json` | 11/11 | Verified-runtime | Pasó tras el arreglo de selección de informe de auditoría. |
| Caracterización indicadores | `tests/tests.vba.indicadores-caracterizacion.json` + filtro `Indicadores_` | 11/11 | Verified-runtime | Slice de indicadores. |
| Caché proyecto | filtro `CacheIndicadoresMaterializado` | 8/8 | Verified-runtime | Slice de caché materializada. |
| Caché auditoría | filtro `CacheIndicadoresAuditoriaMaterializado` | 3/3 | Verified-runtime | Pasó tras retry; la cancelación anterior fue accidental. |
| Esquema backend Issue #18 | filtro `Issue18_BackendCacheSchema` | 2/2 | Verified-runtime | Evidencia de estructura de caché. |
| Fixtures Issue #18 | filtro `Fixture` | 2/2 | Verified-runtime | Preparación de datos fixture. |
| Sincronización NC | filtro `Issue18_SincronizarNC` | 3/3 | Verified-runtime | Sincronización por NC afectada. |
| Resolución AC/AR→NC | filtro `Issue18_ResolverNCDesde` | 3/3 | Verified-runtime | Resolución de padres. |
| Buckets | filtro `Issue18_CargarBucket` | 2/2 | Verified-runtime | Un test tardó ~120s; comportamiento verificado con deuda de rendimiento/diagnóstico. |
| Detalle | filtro `Issue18_CargarDetalle` | 2/2 | Verified-runtime | Un test tardó ~122s; comportamiento verificado con deuda de rendimiento/diagnóstico. |
| Detalle completo | filtro `Issue18_DetalleCompleto` | 1/1 | Verified-runtime | Campos requeridos de detalle. |
| Hook NC | filtro `Issue18_NCWriteHook` | 1/1 | Verified-runtime | ~120s; hook verificado pero lento. |
| Hook NC — fallo de sincronización explícito | `Test_Issue18_NCWriteHook_InvalidarCache_FailedSync_ReturnsError_Atomic` | 1/1 | Verified-runtime focused | PASS 2026-06-15, `4788` ms, valor `issue18_nc_write_hook_failed_sync_ok`; `NC 992099` inexistente fuerza fallo, `InvalidarCache` devuelve `False` y propaga `pError` explícito. |
| Hook AC | filtro `Issue18_ACWriteHook` | 1/1 | Verified-runtime | ~114s; hook verificado pero lento. |
| Hook AR | filtro `Issue18_ARWriteHook` | 4/4 | Verified-runtime | Dos hooks ~117–123s; verificado con deuda de rendimiento. |
| Tests de caché específicos | `Cache_Proyecto_Delegacion_Y_Reset_Atomic`, `Cache_InvalidarTodo_SeparaProyectosYAuditorias_Atomic`, `Cache_InvalidacionSelectiva_Atomic`, `Cache_ConsistenciaConEntorno_Atomic` | 4/4 | Verified-runtime | Regresión de cache/reset/invalidation. |
| Formulario | filtro `Formulario` | 2/2 | Verified-runtime | Cobertura de formulario relacionada. |
| Seguimiento auditoría | filtro `Issue38_SeguimientoAuditoria` | 1/1 | Verified-runtime | Contrato de auditoría. |
| Reset colección tareas | filtro `Issue38_ResetearColTareas` | 1/1 | Verified-runtime | Contrato de reset de tareas. |

### Evidencia focused reciente (2026-06-15)

| Procedimiento | Estado | Evidencia |
|---|---|---|
| `Test_Issue18_ReconstruirTodo_Idempotent_Atomic` | Verified-runtime focused PASS | Duración `4862` ms, valor `issue18_rebuild_idempotent_ok`; fixture-first con schema Proyecto/Auditoría inspeccionado, Proyecto `NC=992001` / `AC=992011` / `AR=992021` y Auditoría `Auditoria=992201` / `NC=992202` / `AC=992211` / `AR=992221`; primera y segunda reconstrucción con `pError=''`, resultado `ok true`, `Proyecto=true`, `Auditoria=true`; cabeceras estables y teardown OK. |
| `Test_Issue18_NCWriteHook_InvalidarCache_FailedSync_ReturnsError_Atomic` | Verified-runtime focused PASS | Duración `4788` ms, valor `issue18_nc_write_hook_failed_sync_ok`; confirmado que no existe `NC 992099`; `InvalidarCache` devuelve `False` con `pError` `CacheNCProyecto.InvalidarCache no pudo sincronizar indicador de Proyecto para NC 992099: Cache_IndicadoresProyectoMaterializado_SincronizarNC: no se encontraron filas para NC 992099.`; asserts OK. |

### Divergencias resueltas (2026-06-15)

| Procedimiento | Estado previo | Resolución | Evidencia |
|---|---|---|---|
| `Test_Issue18_GlobalCache_DosResponsables_DosDominios_Atomic` | Divergent (recuento global) | Arreglo del propio test en `src/modules/Test_IndicadoresCaracterizacion.bas` (`Test_Issue18_GlobalCache_DosResponsables_DosDominios_Atomic`): la query global ahora suma recuentos per-domain (`IDCacheIndicadorProyecto=1` + `IDCacheIndicadorProyecto=2`) para esquivar el quirk de caché DAO/Jet con `IN (1, 2)` en `COUNT(*)` sin más predicados. Aserciones por usuario ya pasaban. | 1/1 |
| `Test_Issue38_SeguimientoProyecto_ActualizarModoProyecto_Contract` | Divergent (no delegaba al helper) | Refactor de `src/forms/Form_FormNCProyectoSeguimiento.cls` para replicar el patrón de `Form_FormNCAuditoriaSeguimiento.cls`: `ComandoActualizar_Click` ya no llama a `PintarIndicadores` directamente; ahora fija `m_CargaInicialIndicadoresPendiente = True` y `Me.TimerInterval = 100` y el `.cls` referencia `NCProyectoSeguimientoHelper.CargarIndicadoresSeguimientoProyecto`. `OnTimer = "[Event Procedure]"` en el `.form.txt` (línea 369) ya estaba enlazado. | 1/1 |
| `Test_Issue50_SeguimientoProyecto_CargaDiferidaHelper_Contract` | Divergent (faltan flags, guard, `Form_Timer`, programación, delegación, duración) | Mismo refactor de `src/forms/Form_FormNCProyectoSeguimiento.cls` añadió los flags privados `m_CargaInicialIndicadoresPendiente`, `m_CargandoIndicadores`, `m_UltimaDuracionIndicadores`; `Form_Timer`; programación del timer en `Form_Load`; delegación al helper y llamada al helper usando `p_DuracionSegundos:=m_UltimaDuracionIndicadores` para casar con la firma `NCProyectoSeguimientoHelper.CargarIndicadoresSeguimientoProyecto`. | 1/1 |

### Caveats del runner/MCP

- `proceduresJson` como array shorthand falló con `VBA_INVALID_TEST_PLAN: Test #1 must be an object`; workaround efectivo: `testsPath` + `filter`.
- El manifest completo `tests/tests.vba.indicadores-caracterizacion.json` timeoutea (`MCP error -32001: Request timed out`); usar slices/filtros.
- Las lecturas/hooks lentos están verificados funcionalmente, pero son deuda de rendimiento y riesgo diagnóstico.
- La evidencia focused PASS de reconstrucción completa y fallo post-escritura no equivale a manifest completo verde; el manifest completo `tests/tests.vba.indicadores-caracterizacion.json` sigue sin evidencia de ejecución completa satisfactoria.

| Elemento (funcionalidad o arreglo) | Ref. tracker | Versión staging (UAT) | Estado UAT | Release de producción | Fecha en prod | Nota |
|---|---|---|---|---|---|---|
| Caché compartida de indicadores en backend | Issue #18 / Issue #67 | Pendiente | pending | Pendiente | Pendiente | Evidencia runtime reciente por slices y focused PASS para reconstrucción completa/fallo post-escritura; no manifest completo verde. |
| Datos relacionados cache-first | Issue #39 / Issue #67 | Pendiente | pending | Pendiente | Pendiente | Los documentos existentes citan 7/7 cache-e2e en `20b71f64`, evidencia adyacente no cobertura completa de cuadro de mando. |
| Indicadores diferidos de proyecto | Cambio de helper de seguimiento | Pendiente | pending | Pendiente | Pendiente | Contratos `Issue38_SeguimientoProyecto_ActualizarModoProyecto` e `Issue50_SeguimientoProyecto_CargaDiferidaHelper` resueltos funcionalmente el 2026-06-15 (refactor de `Form_FormNCProyectoSeguimiento.cls` alineado con el patrón `Form_FormNCAuditoriaSeguimiento.cls`). |

| Síntoma | Causa probable | Comprobación (Dysflow) | Ancla documental |
|---|---|---|---|
| Recuentos obsoletos tras escrituras | Regresión de sincronización de alcance afectado | Reejecutar pruebas de mutación/sincronización de indicadores | BR-IND-5..7 |
| Fuga de dominio | Falta filtro de dominio | Reejecutar/añadir pruebas cross-domain | BR-IND-4 |
| Vista de detalle incompleta | Regresión de esquema/detalle de caché | Reejecutar pruebas de detalle completo | BR-IND-2 |
| Se discute el significado de buckets | Falta definición de producto | Confirmar definiciones UAT | BR-IND-8 |

## §6 Notas de migración web

### §6.1 Conservar (comportamiento de negocio que debe sobrevivir)
- La caché de indicadores como estado materializado en backend, no estado de sesión frontend (BR-IND-1): la web debe seguir resolviendo recuentos y detalle desde un modelo de lectura backend, no recalcularlos en cada request del navegador.
- La inclusión de filas de detalle en la caché, no solo recuentos agregados (BR-IND-2): las pruebas `Issue18_CargarDetalle` y `Issue18_DetalleCompleto` así lo documentan; la API REST debe seguir devolviendo las filas de detalle requeridas por el cuadro de mando, con el mismo esquema.
- El filtrado runtime por usuario conectado/responsable y dominio (BR-IND-3): cada endpoint del cuadro de mando debe aplicar el filtro de responsable del usuario actual, sin permitir que un usuario vea filas de otro responsable o de otro dominio. La regla de per-domain-counts para esquivar el quirk DAO/Jet con `IN (1, 2)` debe replicarse en el backend SQL.
- La separación de filas de Proyecto y Auditoría en cada lectura (BR-IND-4): la web debe seguir separando dominios en la respuesta, no devolver una unión cruzada. La query global debe sumar recuentos per-domain, como ya se documenta para `Test_Issue18_GlobalCache_DosResponsables_DosDominios_Atomic`.
- El refresco incremental por NC afectada tras mutaciones de NC/AC/AR/tarea (BR-IND-5): un cambio en `NC 992099` solo debe refrescar el alcance de esa NC, no disparar una reconstrucción completa.
- La resolución de padres AC→NC y AR/tarea→AC→NC (BR-IND-6): cualquier hook de escritura debe resolver la NC padre antes de sincronizar, replicando `Issue18_ResolverNCDesde`.
- La propagación explícita del fallo de sincronización post-escritura (BR-IND-7): un fallo de `InvalidarCache` debe propagar `pError` y no afirmar que la caché está actualizada. La web debe hacer lo propio: devolver `5xx` o un payload con `sincronizado=false`.
- La pertenencia al cuadro de mando como un recurso de lectura, no como UI: la web debe poder consumir los mismos buckets/detalle desde un panel web, una API externa o un job, sin pasar por la UI.

### §6.2 Transformar (mecanismo legacy que se reformula)
- Sustituir `ModuloCacheIndicadoresIssue18` y `ModuloCacheIndicadores` por un servicio backend de modelo de lectura con su propio SLA de frescura, no por código VBA in-process.
- Convertir `IndicadorRepositorio` y `IndicadorServicio` en dos servicios REST diferenciados (lectura vs. sincronización), con autenticación y autorización declarativas.
- Mover la lógica de `Issue18_NCWriteHook`, `Issue18_ACWriteHook` y `Issue18_ARWriteHook` a eventos del backend (cola/worker) que se disparen tras las mutaciones de dominio, no a un hook de formulario.
- Reemplazar `Test_IndicadoresCaracterizacion` y `Test_IndicadoresTelemetry` por suites automatizadas de la API REST del cuadro de mando, con tiempos de respuesta esperados documentados.
- Mover el contrato de buckets del cuadro de mando (umbrales, nombres, reglas de visibilidad) a un archivo de configuración versionado y revisable por producto, en lugar de estar embebido en el código.
- Sustituir el patrón de `Form_FormIndicadores` por una SPA con componentes finos que consuman la API REST, no un formulario Access con estado mutable.

### §6.3 NO copiar (deuda legacy de Access que no debe portarse)
- No portar la carga de indicadores en `Form_Load` con `TimerInterval = 100` y `m_CargaInicialIndicadoresPendiente` como patrón de la web: la API REST debe poder invocarse de forma síncrona o asíncrona real (cola/worker), no con un timer del cliente.
- No migrar la query global `IN (1, 2)` con `COUNT(*)` sin predicados: la web debe usar SQL parametrizado con `GROUP BY` per-domain, no reproducir el quirk de DAO/Jet.
- No usar la reconstrucción completa como ruta normal de escritura: en la web, una "reconstrucción completa" es un job explícito de operación con auditoría, no un side effect de `Save`.
- No acoplar la lectura de la caché de indicadores al evento de un formulario concreto: la lectura debe ser un servicio reutilizable por cualquier consumidor.
- No propagar el resultado de un hook de sincronización fallido como éxito: la web debe devolver error explícito y, si el cliente lo ignora, no debe reescribir el estado de la caché.

### §6.4 Preguntas abiertas al product owner
- ¿Los nombres de buckets, umbrales y reglas de visibilidad del cuadro de mando (BR-IND-8) están aprobados? Confirmar lista canónica y SLA de actualización por bucket.
- ¿La resolución AC→NC y AR/tarea→AC→NC (BR-IND-6) puede tener AC o AR sin NC padre en algún caso especial? Hoy la regla es "toda AC/AR pertenece a una NC"; ¿se mantiene?
- ¿El fallo de sincronización post-escritura (BR-IND-7) debe notificar al usuario o basta con log? Hoy se propaga `pError`; ¿la web debe mostrar un toast o devolver `5xx`?
- ¿La deuda de rendimiento de los hooks (~120s) se aborda antes de la migración o se acepta como coste? Confirmar presupuesto de tiempo.
- ¿El manifest completo `tests/tests.vba.indicadores-caracterizacion.json` debe dejarse como timeout histórico o se reescribe en formato no-aggregate para la web? Hoy timeoutea como conjunto; la web debe poder ejecutarse de forma atómica.
- ¿El cuadro de mando debe exponer un endpoint "what-if" para simulaciones o solo los recuentos reales? Confirmar alcance.

## §7 Libro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| BR-IND-1 — La caché de indicadores es estado materializado compartido en backend, no estado de sesión frontend. | Verified-runtime | `Issue18_BackendCacheSchema` 2/2, `CacheIndicadoresMaterializado` 8/8, `CacheIndicadoresAuditoriaMaterializado` 3/3 tras retry | 2026-06-15 |
| BR-IND-2 — La caché incluye filas de detalle necesarias por el cuadro de mando, no solo recuentos agregados. | Verified-runtime | `Issue18_CargarDetalle` 2/2 (~122s en un test), `Issue18_DetalleCompleto` 1/1 | 2026-06-15 |
| BR-IND-3 — Las lecturas runtime filtran por usuario conectado/responsable. | Verified-runtime (resuelto 2026-06-15) | `Issue18_CargarBucket` 2/2 (~120s en un test); `Test_Issue18_GlobalCache_DosResponsables_DosDominios_Atomic` 1/1 tras arreglar la query global del propio test para sumar recuentos por dominio | 2026-06-15 |
| BR-IND-4 — Las filas de Proyecto y Auditoría permanecen separadas por dominio. | Verified-runtime (resuelto 2026-06-15) | `CacheIndicadoresAuditoriaMaterializado` 3/3, `Issue18_CargarDetalle` 2/2; `Test_Issue18_GlobalCache_DosResponsables_DosDominios_Atomic` 1/1 tras el mismo arreglo de query per-domain; el test afirma 5 filas globales sumando Proyecto (1) + Auditoría (2) y mantiene `QA_User` 3 + `Otro_User` 2 | 2026-06-15 |
| BR-IND-5 — Los cambios correctos de NC/AC/AR/tarea sincronizan solo el alcance de la NC afectada. | Verified-runtime | `Issue18_SincronizarNC` 3/3, `Issue18_NCWriteHook` 1/1 (~120s), `Issue18_ACWriteHook` 1/1 (~114s), `Issue18_ARWriteHook` 4/4 con dos hooks ~117–123s | 2026-06-15 |
| BR-IND-6 — Los cambios de AC resuelven AC→NC; los de AR/tarea resuelven AR/tarea→AC→NC. | Verified-runtime | `Issue18_ResolverNCDesde` 3/3, `Issue18_ACWriteHook` 1/1, `Issue18_ARWriteHook` 4/4 | 2026-06-15 |
| BR-IND-7 — La sincronización post-escritura fallida es visible e impide afirmaciones falsas de caché actual. | Verified-runtime focused | `Test_Issue18_NCWriteHook_InvalidarCache_FailedSync_ReturnsError_Atomic` PASS el 2026-06-15 (`4788` ms, `issue18_nc_write_hook_failed_sync_ok`): `NC 992099` inexistente, `InvalidarCache` devuelve `False` y propaga `pError` explícito | 2026-06-15 |
| BR-IND-8 — Los nombres, umbrales y salidas de gestión de buckets del cuadro de mando están aprobados por producto. | Intended | FALTA → crear mediante access-vba-tdd tras confirmar escenario UAT | 2026-06-15 |
| La caché materializada de indicadores tiene evidencia runtime reciente por slices. | Verified-runtime | `indicator-fast-counts` 5/5, `cache-materialized` 13/13, filtros Issue #18 descritos en §5 | 2026-06-15 |
| El manifest completo de caracterización de indicadores no puede tratarse como verde completo. | Pending | `tests/tests.vba.indicadores-caracterizacion.json` tiene 55 procedimientos y timeoutea como conjunto; usar slices | 2026-06-15 |
| La reconstrucción completa idempotente y la propagación de fallo post-escritura tienen evidencia focused PASS. | Verified-runtime focused | `Test_Issue18_ReconstruirTodo_Idempotent_Atomic` 1/1 (`4862` ms, `issue18_rebuild_idempotent_ok`) y `Test_Issue18_NCWriteHook_InvalidarCache_FailedSync_ReturnsError_Atomic` 1/1 (`4788` ms, `issue18_nc_write_hook_failed_sync_ok`) | 2026-06-15 |
| Las reglas de filtrado por responsable y separación de dominio (BR-IND-3, BR-IND-4) son `Verified-runtime` tras el arreglo del propio test Issue #18 GlobalCache. | Verified-runtime | `Test_Issue18_GlobalCache_DosResponsables_DosDominios_Atomic` 1/1 con query per-domain; recuentos `QA_User` 3 + `Otro_User` 2, total global 5 | 2026-06-15 |
| Los contratos de seguimiento de proyecto (Issue #38, Issue #50) son `Verified-runtime` tras alinear `Form_FormNCProyectoSeguimiento.cls` con el patrón de `Form_FormNCAuditoriaSeguimiento.cls`. | Verified-runtime | `Test_Issue38_SeguimientoProyecto_ActualizarModoProyecto_Contract` 1/1, `Test_Issue50_SeguimientoProyecto_CargaDiferidaHelper_Contract` 1/1; flags privados, `Form_Timer`, programación en `Form_Load`, delegación al helper y duración del helper presentes | 2026-06-15 |
| El comportamiento adyacente de cache-trust tiene evidencia reciente en documentos de funcionalidad. | Verified-static | Documento existente de funcionalidad cache-e2e; no reejecutado en esta tarea documental | 2026-06-15 |
| Las definiciones de buckets del cuadro de mando están aprobadas por producto. | Intended | Confirmación pendiente | 2026-06-15 |

**⚠️ Divergencias activas (intención SDD ≠ realidad del código)**
- No hay divergencias funcionales activas documentadas a 2026-06-15 en la evidencia aportada. Mantener cautela: no hay manifest completo verde de `tests/tests.vba.indicadores-caracterizacion.json`, no hay UAT tag/release y quedan deudas de reachability/rendimiento.

**✅ Divergencias resueltas el 2026-06-15**
- `Test_Issue18_GlobalCache_DosResponsables_DosDominios_Atomic` — query global del test ajustada para sumar recuentos per-domain y esquivar el quirk DAO/Jet con `IN (1, 2)` en `COUNT(*)` sin más predicados.
- `Test_Issue38_SeguimientoProyecto_ActualizarModoProyecto_Contract` — `ComandoActualizar_Click` delega ahora al helper vía `Form_Timer` (`m_CargaInicialIndicadoresPendiente = True`, `Me.TimerInterval = 100`).
- `Test_Issue50_SeguimientoProyecto_CargaDiferidaHelper_Contract` — el mismo refactor añadió flags privados, `Form_Timer`, programación en `Form_Load`, delegación y duración del helper con `p_DuracionSegundos:=m_UltimaDuracionIndicadores`.
