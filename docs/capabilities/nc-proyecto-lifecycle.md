# Capacidad: ciclo de vida de NC Proyecto

## §0 Identidad
- **ID de capacidad**: `CAP-NCP-LIFECYCLE`
- **Nivel**: critical
- **Estado**: active / documentación alineada con v2; evidencia runtime reciente para `form-helper`, `proyecto-gestion-helper` y `seguimiento-tareas-helper`
- **Fuente**: hybrid (documentos de funcionalidad existentes + inventario de repositorio/fuente + confirmación de negocio pendiente)
- **Responsable / autoridad de producto**: Confirmación pendiente — dominio Calidad / NC Proyecto
- **Última verificación**: 2026-06-15 actualización documental con evidencia runtime ya recogida; no se ejecutó Dysflow/Access en esta pasada
- **Confianza global**: mixed — hay evidencia runtime para listado/apertura helper, gestión/refresco de caché de proyecto y seguimiento de tareas; el ciclo de vida completo aún debe pruebas de capacidad; los 2 contratos divergentes de seguimiento de proyecto (Issue38, Issue50) se resolvieron funcionalmente el 2026-06-15

## §1 Intención de negocio
- **Propósito**: Gestionar las no conformidades con origen en proyecto desde la creación y el listado hasta la edición, cierre, comportamiento de recuperación/eliminación y evidencia de seguimiento asociada.
- **Usuarios / personas**: Equipo de calidad, usuarios de proyecto/operativos, revisores UAT, desarrolladores/agentes IA.
- **Problema que resuelve**: Mantiene coherente el ciclo de vida de NC Proyecto entre formularios UI, costuras helper, comportamiento de caché/modelo de lectura y diagnóstico de regresiones de release.
- **Valor de negocio / por qué existe**: Las NC de proyecto son registros centrales de calidad; los usuarios deben poder crearlas, encontrarlas, actualizarlas, cerrarlas y diagnosticarlas sin perder estado ni aplicar reglas de cierre demasiado pronto.
- **No objetivos**: Esta página no define el comportamiento de NC con origen en auditoría, la política de almacenamiento documental ni el modelo completo de indicadores/cuadro de mando.
- **Fuente de intención**: Borrador de capacidad existente + documentos de funcionalidad de apoyo; los nombres exactos de estado y permisos son `Intended` / pendientes de confirmación.
- **Referencia tracker de origen**: Issue #67 trazabilidad documental; Issue #45 / issue-19 gate de cumplimiento; Issue #39 confianza de caché.

## §2 Contrato de comportamiento

### Escenarios (Given / When / Then)
- **GIVEN** la superficie de gestión de NC Proyecto **WHEN** un usuario busca o filtra **THEN** el listado se carga mediante comportamiento respaldado por helper con paridad caché/legacy.
- **GIVEN** un usuario elige `Alta` **WHEN** se abre la ruta de creación **THEN** la ausencia de `FechaPrevistaControlEficacia` no debe bloquear la creación.
- **GIVEN** un usuario elige `Edicion` para una NC existente **WHEN** se abre el formulario **THEN** se carga el registro; si falta, el sistema informa del registro ausente en lugar de editar silenciosamente un estado inválido.
- **GIVEN** una NC Proyecto abierta sin los datos de eficacia requeridos para cierre **WHEN** el usuario la cierra **THEN** el cierre queda bloqueado por la validación en tiempo de cierre.
- **GIVEN** una NC Proyecto eliminada/retirada **WHEN** se usa un flujo soportado de recuperación/eliminación **THEN** el comportamiento de `borrado`/rehabilitación debe ser intencional y probado antes de afirmar cobertura de release.

### Reglas de negocio
| ID de regla | Enunciado (previsto) | Autoridad | ¿Aplicada en código? | Prueba (evidencia) | Confianza |
|---|---|---|---|---|---|
| BR-NCP-LC-1 | El listado/búsqueda debe usar comportamiento respaldado por helper, no lógica DAO directa en formulario. | Documentos existentes de funcionalidad de listado de proyecto | Sí — `Form_FormNCProyectoGestion`, `NCProyectoGestionListadoHelper` según docs | `tests/tests.vba.form-helper.json` cubierto por slices: `FormHelper_Coverage` 1/1, `FormHelper_Listing` 4/4 y `FormHelper_Open` 4/4; total único 9/9 verde | Verified-runtime |
| BR-NCP-LC-2 | Una caché vacía o desactivada cae a la fuente legacy; la semántica de caché cargada-vacía no debe mostrar blancos falsos. | Documentos de funcionalidad de caché/listado | Sí — ruta `CacheNCProyecto`/helper según docs | `Test_FormHelper_Listing_EmptyCacheFallback_Atomic` y `Test_FormHelper_Listing_DisabledCacheFallback_Atomic` verifican fallback con logs en fixtures sandbox | Verified-runtime |
| BR-NCP-LC-3 | Las rutas de listado por caché y legacy preservan la paridad de filtros. | Documentos de funcionalidad de listado de proyecto | Sí según docs | `Test_FormHelper_Listing_CacheFilters_Atomic` verifica filtros por `Codigo`, `Juridica`, columna pipe de Google y sin filtro | Verified-runtime |
| BR-NCP-LC-3b | Las operaciones helper de gestión/refresco de caché de proyecto deben poder ejecutarse por costuras acotadas sin depender de una ejecución amplia del runner. | Documentos de funcionalidad de caché/listado | Sí — `CacheNCProyecto`, `NCProyectoGestionListadoHelper` y costuras de formulario según docs | `tests/tests.vba.proyecto-gestion-helper.json` 8/8 por filtros: `CacheOff` 1/1, `RebuildForce` 2/2, `RefreshCache` 2/2, `ProyectoGestionForm` 2/2, `RenameHandler` 1/1 | Verified-runtime |
| BR-NCP-LC-4 | `Alta` y `Edicion` no deben requerir `FechaPrevistaControlEficacia`. | Documento de funcionalidad de cumplimiento / issue-19 | Sí — `NCProyectoOperaciones` según docs | El documento existente informa pruebas issue-19; hace falta reejecutar | Verified-static |
| BR-NCP-LC-5 | El cierre debe exigir `FechaPrevistaControlEficacia` cuando sea obligatorio y preservar la invariancia de `EficaciaOK`. | Documento de funcionalidad de cumplimiento | Sí según docs | El documento existente informa pruebas issue-19; hace falta reejecutar | Verified-static |
| BR-NCP-LC-6 | Los indicadores de seguimiento reflejan el estado de tareas diferidas de proyecto donde las vistas de ciclo de vida usan datos de seguimiento. | Documento de funcionalidad de seguimiento | Sí a nivel helper según docs | `tests/tests.vba.seguimiento-tareas-helper.json`: procedimientos únicos 9/9 verdes; fallback/log 4/4, helper 4/4 y formulario 1/1 | Verified-runtime |
| BR-NCP-LC-7 | Crear/editar/buscar/ver/cerrar/reabrir/eliminar/rehabilitar debe estar cubierto como escenarios de ciclo de vida de negocio. | Contrato de capacidad | Parcial / eventos UI exactos sin confirmar | FALTA → crear mediante access-vba-tdd; probar costuras helper/servicio, no comportamiento directo de formulario | Intended |
| BR-NCP-LC-8 | Los roles y permisos para cerrar/reabrir/eliminar/rehabilitar deben ser explícitos. | Autoridad de producto pendiente | Desconocido | FALTA → crear mediante access-vba-tdd tras confirmar la regla | Intended |

### Validaciones
- El registro existente debe cargarse para `Edicion`; si falta, debe informarse.
- `Alta` devuelve un `NCProyecto` nuevo; `Edicion` diferencia registro existente, no encontrado y `borrado` según las pruebas helper recientes.
- `FechaPrevistaControlEficacia` no es obligatoria para crear/editar; sí lo es al cerrar cuando FE es requerido.
- La paridad de esquema/fallback/filtros de caché debe mantenerse antes de confiar en los resultados del listado.
- Las reglas de reabrir/eliminar/rehabilitar están pendientes de confirmación.

### Transiciones de estado
- `None` --(`Alta`)--> `Borrador/nueva NC Proyecto` — la fecha prevista FE no bloquea la creación.
- `NC Proyecto existente` --(`Edicion/guardar`)--> `NC Proyecto editada` — el registro existente se carga o se informa de su ausencia.
- `NC Proyecto abierta` --(`Close`, FE data valid)--> `NC Proyecto cerrada`.
- `NC Proyecto cerrada` --(`Reabrir`)--> `NC Proyecto reabierta` — pendiente de confirmación.
- `NC Proyecto retirada/eliminada` --(`Rehabilitate`/flujo `borrado`)--> `NC Proyecto activa o recuperable` — pendiente de confirmación.

### Caminos límite y de error
- Una caché vacía/desactivada no debe producir un listado falsamente vacío.
- Los resultados de caché AC/AR/Riesgo cargada-vacía son válidos y distintos de fallos de caché.
- La ausencia de registro al editar debe ser visible para llamador/usuario.

### Señales de aceptación / presencia
- El listado de NC Proyecto puede buscar/filtrar y cargar registros mediante costuras helper.
- Las rutas de creación/edición no se bloquean por ausencia de fecha prevista FE.
- La ruta de cierre bloquea la ausencia de fecha prevista FE cuando es obligatoria.
- Reabrir/eliminar/rehabilitar no puede afirmarse hasta que existan pruebas dedicadas.

## §3 Mapa de implementación
- **Puntos de entrada UI**: `Form_FormNCProyectoGestion`; `Form_FormNCProyectoSeguimiento`; formularios de detalle/general/creación/edición/cierre pendientes de mapeo exacto.
- **Puntos de entrada de fuente**: `NCProyectoGestionListadoHelper`; `CacheNCProyecto`; `NCProyectoSeguimientoHelper`; `NCProyectoOperaciones`.
- **Datos tocados**: tablas fuente de NC Proyecto (esquema exacto pendiente); `CacheNCProyecto`; datos relacionados de AC/AR/Riesgo; campos de control-eficacia; documentos/evidencia.
- **Salidas**: listado de NC Proyecto, indicadores de seguimiento, estado de control-eficacia, documentos/informes relacionados.
- **Dependencias e integraciones**: gestión de caché de proyecto, control eficacia, acciones/seguimiento, documentos, indicadores.
- **Sincronización fuente↔binario**: no comprobada en esta tarea solo documental. Cualquier cambio de fuente debe pasar por importación Dysflow MCP; después el usuario compila manualmente.
- **Evaluación de diseño (as-built vs ideal)**: las costuras helper son buenas anclas de migración. El ciclo de vida completo sigue demasiado acoplado a formularios y poco especificado hasta extraer reglas de crear/editar/cerrar/reabrir/eliminar a costuras helper/servicio probadas. El formulario `Form_FormNCProyectoSeguimiento` ya replica el patrón diferido/concurrente de `Form_FormNCAuditoriaSeguimiento` (flags privados, `Form_Timer`, `Form_Load`, delegación a `NCProyectoSeguimientoHelper`).

## §4 Receta de reconstrucción
1. Confirmar nombres de estado de producto, permisos por rol y eventos UI canónicos para crear/editar/ver/cerrar/reabrir/eliminar/rehabilitar.
2. Mapear cada evento de formulario a una costura helper/servicio; mantener los formularios como cableado UI fino.
3. Completar pruebas pendientes con `access-vba-tdd`: fixtures con esquema primero, datos sandbox explícitos, pruebas JSON `Public Function`, aserciones fuertes, cardinalidad para mutaciones.
4. Para comportamiento de formulario, probar la costura helper/servicio; usar pruebas de formulario solo para demostrar cableado de eventos cuando sea inevitable.
5. Importar módulos modificados mediante `dysflow.import_modules`; el usuario compila manualmente en Access; después ejecutar `dysflow.test_vba`.
6. Actualizar §5 y §7 con evidencia Dysflow reciente solo después de ejecutar las pruebas.

## §5 Evidencia y trazabilidad
- **Pruebas verificadas en runtime**:
  - `tests/tests.vba.form-helper.json` — 9/9 procedimientos únicos verdes por slices: `FormHelper_Coverage` 1/1 (`Test_FormHelper_Coverage_Canary_Atomic`), `FormHelper_Listing` 4/4 (`Test_FormHelper_Listing_EnsureSchema_Atomic`, `Test_FormHelper_Listing_EmptyCacheFallback_Atomic`, `Test_FormHelper_Listing_DisabledCacheFallback_Atomic`, `Test_FormHelper_Listing_CacheFilters_Atomic`) y `FormHelper_Open` 4/4 (`Test_FormHelper_Open_AltaMode_Atomic`, `Test_FormHelper_Open_EdicionMode_Exists_Atomic`, `Test_FormHelper_Open_EdicionMode_NotFound_Atomic`, `Test_FormHelper_Open_EdicionMode_Borrado_Atomic`). Evidencia: schema ensure para campos pipe de `TbCacheListadoNC`; fallback de caché vacía/desactivada con logs; filtros por `Codigo`, `Juridica`, Google pipe-column y sin filtro; `Alta` devuelve `NCProyecto` nuevo; `Edicion` cubre existente/no encontrado/`borrado` con fixtures sandbox.
  - `tests/tests.vba.seguimiento-tareas-helper.json` — 9/9 procedimientos únicos verdes. El filtro fallback ejecutó 4/4; el filtro amplio `TareasHelper_` repitió esos 4 y añadió 4 pruebas helper; `TareasForm` ejecutó 1/1. Evidencia: gate de esquema documentado; backend sandbox seguro; fallback de caché vacía registrado; caché desactivada registrada; sin usuario registra como `Sistema`; error forzado en seam de caché registrado; helper conserva orden de predicados legacy; selecciona fuente por `Estado`; no hidrata AR/AC/NC por fila; orden/export input determinista; el formulario delega rutas de filtro/carga/limpieza al helper.
  - `tests/tests.vba.proyecto-gestion-helper.json` — 8/8 procedimientos verdes por filtros pequeños: `CacheOff` 1/1 (`Test_ProyectoGestionHelper_CacheOff_NoOp_Atomic`), `RebuildForce` 2/2 (`Test_ProyectoListadoCache_RebuildForceFull_DeleteAndRegen_Atomic`, `Test_ProyectoListadoCache_RebuildForceStale_OnlyStaleRegen_Atomic`, ~27s y ~25s), `RefreshCache` 2/2 (`Test_ProyectoGestionHelper_RefreshCache_TrueOnSuccess_Atomic`, `Test_ProyectoGestionHelper_RefreshCache_FalseOnError_Atomic`, TrueOnSuccess ~27s), `ProyectoGestionForm` 2/2 (`Test_ProyectoGestionForm_ActualizarLista_SequenceHappyPath_Atomic`, `Test_ProyectoGestionForm_ActualizarLista_RefreshError_RaiseAndCleanup_Atomic`, HappyPath ~26s) y `RenameHandler` 1/1 (`Test_AuditGestionForm_RenameHandler_NoRegression_Atomic`).
- **Pruebas no verificadas en esta evidencia**: las pruebas `issue-19` y `cache-e2e` siguen como evidencia documental/pendiente salvo ejecución reciente específica. La cobertura anterior no prueba el ciclo completo crear/cerrar/reabrir/eliminar/rehabilitar.
- **Caveat de runner histórico**: una ejecución amplia previa quedó interrumpida y dejó la operación Dysflow obsoleta `dysflow-51869803-608b-44bc-8792-ef9ca837b894`; posteriormente pasó a `status=timed_out`. La verificación válida de `tests/tests.vba.proyecto-gestion-helper.json` es la ejecución por filtros pequeños 8/8. Los filtros lentos (~25-27s) son coste de ejecución, no fallo del runner.

| Elemento (funcionalidad o arreglo) | Ref. tracker | Versión staging (UAT) | Estado UAT | Release de producción | Fecha en prod | Nota |
|---|---|---|---|---|---|---|
| Listado respaldado por helper y evidencia de caché | Issue #67 | Pendiente | pending | Pendiente | Pendiente | `tests/tests.vba.form-helper.json` 9/9 Verified-runtime por slices; no cubre ciclo completo crear/cerrar/reabrir/eliminar/rehabilitar. |
| Gestión/refresco de caché de listado de proyecto | Issue #67 / cache invalidation | Pendiente | pending | Pendiente | Pendiente | `tests/tests.vba.proyecto-gestion-helper.json` 8/8 Verified-runtime por filtros pequeños. |
| Indicadores de seguimiento diferido | Cambio de helper de seguimiento | Pendiente | pending | Pendiente | Pendiente | `tests/tests.vba.seguimiento-tareas-helper.json` 9/9 procedimientos únicos Verified-runtime. |
| Gate FE solo en cierre | Issue #45 / issue-19 | Pendiente | pending | Pendiente | Pendiente | Los documentos existentes citan `8cb7f0a`. |
| Lecturas AC/AR/Riesgo cache-first | Issue #39 / Issue #67 | Pendiente | pending | Pendiente | Pendiente | Los documentos existentes citan `23af345` / `20b71f64`. |

| Síntoma | Causa probable | Comprobación (Dysflow) | Ancla documental |
|---|---|---|---|
| El listado de proyecto se abre en blanco | Regresión de fallback/paridad de filtros de caché o refresco de caché de gestión | Reejecutar `tests/tests.vba.form-helper.json` y `tests/tests.vba.proyecto-gestion-helper.json` por filtros pequeños | BR-NCP-LC-1..3b |
| Crear/editar queda bloqueado por fecha FE | El gate FE solo en cierre se movió demasiado pronto | Reejecutar pruebas issue-19 | BR-NCP-LC-4 |
| El cierre permite ausencia de fecha FE | Validación de cierre omitida | Reejecutar pruebas issue-19 | BR-NCP-LC-5 |
| Comportamiento de reabrir/eliminar poco claro | Falta contrato/prueba de negocio | Crear pruebas tras confirmar la regla | BR-NCP-LC-7..8 |

## §6 Notas de migración web
- Mantener explícitos los estados de ciclo de vida en lugar de estado implícito de formulario.
- Preservar el momento de validación FE solo en cierre y la distinción cargado-vacío/fallo-de-caché.
- Mover la lógica DAO/formulario a límites de servicio/consulta; los formularios quedan como cableado fino.
- Añadir escenarios UAT de negocio para crear, editar, buscar, ver, cerrar, reabrir, eliminar y rehabilitar antes del corte web.

## §7 Libro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| Existe comportamiento de listado/helper/caché para NC Proyecto. | Verified-runtime | `tests/tests.vba.form-helper.json` 9/9 por slices: schema, fallback, filtros y apertura `Alta`/`Edicion` | 2026-06-15 |
| La gestión/refresco de caché de proyecto está cubierta por costuras helper y formulario. | Verified-runtime | `tests/tests.vba.proyecto-gestion-helper.json` 8/8 por filtros pequeños: `CacheOff`, `RebuildForce`, `RefreshCache`, `ProyectoGestionForm`, `RenameHandler` | 2026-06-15 |
| La fecha FE está prevista como validación solo de cierre, no de creación/edición. | Verified-static | Documento de funcionalidad de cumplimiento; sin reejecución en esta tarea | 2026-06-15 |
| Los indicadores de seguimiento de tareas de proyecto están cubiertos a nivel helper/form delegation. | Verified-runtime | `tests/tests.vba.seguimiento-tareas-helper.json` 9/9 procedimientos únicos; fallback/log, helper y formulario | 2026-06-15 |
| El ciclo de vida completo, incluidos cerrar/reabrir/eliminar/rehabilitar, está protegido para release. | Intended | FALTA → crear mediante access-vba-tdd; UI/reglas/pruebas exactas pendientes | 2026-06-15 |
| El comportamiento de negocio en formularios debe probarse mediante costuras helper/servicio. | Intended | Regla de usuario/proyecto para migración solo documental | 2026-06-15 |

**⚠️ Divergencias (intención SDD ≠ realidad del código)**
- Sin divergencia confirmada. Hueco confirmado de evidencia: la cobertura runtime reciente prueba helpers de listado/apertura y seguimiento, pero no el ciclo completo crear/cerrar/reabrir/eliminar/rehabilitar.

**✅ Divergencias resueltas el 2026-06-15**
- `Test_Issue38_SeguimientoProyecto_ActualizarModoProyecto_Contract` — `ComandoActualizar_Click` ya no llama a `PintarIndicadores` directamente; delega la carga diferida al helper `NCProyectoSeguimientoHelper.CargarIndicadoresSeguimientoProyecto` vía `Form_Timer` (`m_CargaInicialIndicadoresPendiente = True`, `Me.TimerInterval = 100`).
- `Test_Issue50_SeguimientoProyecto_CargaDiferidaHelper_Contract` — el mismo refactor añadió en `src/forms/Form_FormNCProyectoSeguimiento.cls` los flags privados `m_CargaInicialIndicadoresPendiente`, `m_CargandoIndicadores`, `m_UltimaDuracionIndicadores`; el sub `Form_Timer`; la programación del timer en `Form_Load`; la delegación al helper y la llamada al helper usando `p_DuracionSegundos:=m_UltimaDuracionIndicadores` para casar con la firma del helper.
- Detalle adicional en `docs/capabilities/nc-proyecto-actions-follow-up.md` y en `docs/capabilities/indicators-dashboard.md` §5 / §7.
