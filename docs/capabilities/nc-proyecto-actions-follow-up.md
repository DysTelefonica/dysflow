# Capacidad: acciones y seguimiento de NC Proyecto

## §0 Identidad
- **ID de capacidad**: `CAP-NCP-ACTIONS-FOLLOWUP`
- **Nivel**: critical
- **Estado**: active / documentación alineada con v2; evidencia runtime reciente para helper de seguimiento de tareas
- **Fuente**: hybrid (documentos de funcionalidad + inventario de fuente + confirmación de producto pendiente)
- **Responsable / autoridad de producto**: Confirmación pendiente — dominio Calidad / NC Proyecto
- **Última verificación**: 2026-06-15 actualización documental con evidencia runtime ya recogida; no se ejecutó Dysflow/Access en esta pasada
- **Confianza global**: mixed — seguimiento de tareas tiene evidencia runtime a nivel helper/form delegation; el ciclo completo AC/AR/tareas sigue sin prueba de negocio dedicada; los 2 contratos divergentes de seguimiento de proyecto (Issue38, Issue50) se resolvieron funcionalmente el 2026-06-15

## §1 Intención de negocio
- **Propósito**: Realizar seguimiento de acciones correctoras, acciones de resolución, riesgos, tareas diferidas e indicadores de seguimiento para NC con origen en proyecto.
- **Usuarios / personas**: Equipo de calidad, usuarios de proyecto/operativos, managers/revisores, desarrolladores/agentes IA.
- **Problema que resuelve**: Da visibilidad actual a los usuarios sobre qué queda abierto, quién es responsable y si el estado de acción/seguimiento está actualizado tras los cambios.
- **Valor de negocio / por qué existe**: El seguimiento evita que las NC se conviertan en registros estáticos; el estado de acciones debe impulsar el cierre, los indicadores y la visibilidad de gestión.
- **No objetivos**: Las reglas de acciones con origen en auditoría y las definiciones globales de buckets del cuadro de mando se documentan por separado.
- **Fuente de intención**: Borrador de capacidad existente y libros de funcionalidad; detalles del ciclo de vida de acciones pendientes de confirmación por propietario/fuente.
- **Referencia tracker de origen**: Issue #39, Issue #18, Issue #67, cambio de helper de seguimiento.

## §2 Contrato de comportamiento

### Escenarios (Given / When / Then)
- **GIVEN** una NC Proyecto **WHEN** el usuario revisa seguimiento **THEN** los indicadores de tareas diferidas reflejan estado controlado de tareas.
- **GIVEN** la caché relacionada de AC/AR/Riesgo se sabe cargada **WHEN** se leen datos relacionados **THEN** se usan lecturas cache-first y cargado-vacío no se trata como fallo.
- **GIVEN** una mutación correcta de NC/AC/AR/tarea afecta a indicadores **WHEN** se ejecuta la sincronización **THEN** se refresca el alcance de NC afectado; el fallo de sincronización es visible.
- **GIVEN** un usuario crea/completa/reasigna/cancela una acción/tarea **WHEN** se guarda la operación **THEN** propiedad, fechas, estado, indicadores y enlace con la NC padre deben verificarse con pruebas dedicadas antes de afirmar release.

### Reglas de negocio
| ID de regla | Enunciado (previsto) | Autoridad | ¿Aplicada en código? | Prueba (evidencia) | Confianza |
|---|---|---|---|---|---|
| BR-NCP-AF-1 | Los indicadores de seguimiento diferido de proyecto reflejan el estado de tareas. | Documento de funcionalidad de helper de seguimiento | Sí a nivel helper según docs | `tests/tests.vba.seguimiento-tareas-helper.json`: 9/9 procedimientos únicos verdes; `Test_TareasHelper_FilterParity_AllPredicates_Atomic`, `Test_TareasHelper_Estado_SelectsSource`, `Test_TareasHelper_NoARPerRowHydration`, `Test_TareasHelper_DeterministicOrder_ExportInput` | Verified-runtime |
| BR-NCP-AF-2 | El comportamiento del helper de seguimiento debe poder probarse sin estado UI vivo. | Arquitectura de proyecto/pruebas | Sí para la parte helper documentada | Fallback/log 4/4 y helper 4/4 verdes; `Test_TareasForm_Delegates_FilterPaths` verifica delegación del formulario a rutas helper | Verified-runtime |
| BR-NCP-AF-3 | Las lecturas relacionadas de AC/AR/Riesgo usan semántica cache-first cuando la caché está cargada. | Documento de funcionalidad de confianza de caché | Sí según docs | El documento existente informa `tests/tests.vba.cache-e2e.json`; hace falta reejecutar | Verified-static |
| BR-NCP-AF-4 | La caché cargada-vacía de datos relacionados es un resultado válido, no un fallo. | Documento de funcionalidad de confianza de caché | Sí según docs | Diagnósticos existentes de cache-trust; hace falta reejecutar | Verified-static |
| BR-NCP-AF-5 | Las mutaciones correctas que afectan a indicadores refrescan el `IDNoConformidad` afectado; los fallos son visibles. | Documento de funcionalidad Issue #18 | Histórico / evidencia reciente pendiente | FALTA → crear mediante access-vba-tdd; reejecutar/añadir pruebas actuales de sincronización en staging | Intended |
| BR-NCP-AF-6 | Se aplican las reglas de crear, completar, cancelar, reasignar, vencimiento y propietario de AC/AR/tareas. | Autoridad de producto pendiente | Desconocido | FALTA → crear mediante access-vba-tdd tras confirmar esquema/reglas | Intended |
| BR-NCP-AF-7 | El comportamiento de acciones de formulario permanece como cableado UI fino sobre costuras helper/servicio. | Regla de usuario/proyecto | Parcial / desconocido | FALTA → crear mediante access-vba-tdd contra costuras helper/servicio; pruebas de formulario a nivel cableado solo si son inevitables | Intended |

### Validaciones
- La NC padre debe identificarse antes de guardar acciones/seguimiento.
- Los valores de indicadores de tareas diferidas deben coincidir con el estado de tarea controlado por fixture.
- El helper debe conservar el orden de predicados legacy, seleccionar fuente por `Estado`, evitar hidratación AR/AC/NC por fila y producir orden/export input determinista.
- El comportamiento de caché cargada-vacía y los fallos de sincronización post-escritura deben ser explícitos.
- Las reglas de finalización/cancelación/reasignación/vencimiento están pendientes de confirmación.

### Transiciones de estado
- `Sin acción/tarea` --(`Crear`)--> `Acción/tarea creada` — NC padre obligatoria.
- `Tarea abierta/diferida` --(`Actualizar`)--> `Estado de seguimiento actualizado` — los indicadores reflejan el estado.
- `Acción/tarea modificada` --(`Sincronizar`)--> `Caché de indicadores refrescada para la NC afectada` — prueba reciente pendiente.
- `Fallo de sincronización` --(`Post-escritura`)--> `Fallo visible / caché no actual`.

### Caminos límite y de error
- La caché cargada con cero filas relacionadas debe devolver vacío, no datos de consulta fallback.
- Un fallo de sincronización no debe afirmar indicadores actuales.
- El comportamiento de eventos de formulario UI debe cubrirse mediante pruebas de costura helper/servicio.

### Señales de aceptación / presencia
- Los indicadores de seguimiento son reproducibles desde filas fixture controladas.
- Los diagnósticos cache-trust distinguen cargado-vacío de fallo.
- Las pruebas de mutación comprueban cardinalidad antes/después y comportamiento de sincronización de alcance afectado.

## §3 Mapa de implementación
- **Puntos de entrada UI**: `Form_FormNCProyectoSeguimiento`, `Form_FormNCProyectoSeguimientoTareas`, `Form_FormNCProyectoSeguimientoNC`, `Form_FormNCProyectoAC`, `Form_FormNCProyectoAR`, `Form_FormIndicadores`.
- **Puntos de entrada de fuente**: `NCProyectoSeguimientoHelper`; `CacheTrustDiagnostics`; `ModuloCacheIndicadoresIssue18`; clases de acción/dominio pendientes de mapeo directo.
- **Datos tocados**: NC Proyecto, AC, AR, Riesgo, datos de tareas/seguimiento diferido, caché compartida de indicadores, `CacheNCProyecto`.
- **Salidas**: indicadores de seguimiento, visualización relacionada AC/AR/Riesgo, buckets/filas de detalle del cuadro de mando, posibles informes de acciones/tareas.
- **Dependencias e integraciones**: ciclo de vida de proyecto, cuadro de mando de indicadores, soporte transversal de caché.
- **Sincronización fuente↔binario**: no comprobada en esta tarea solo documental.
- **Evaluación de diseño (as-built vs ideal)**: las costuras helper/caché existentes son prometedoras. El ciclo de vida completo de acciones sigue dependiendo demasiado de nombres inferidos de formularios/clases hasta que las costuras de servicio y pruebas sean explícitas. El formulario de seguimiento de proyecto ya delega la carga al helper y replica el patrón de formulario de seguimiento de auditoría.

## §4 Receta de reconstrucción
1. Confirmar estados de ciclo de vida AC/AR/tareas, campos obligatorios, reglas de vencimiento/propietario y permisos.
2. Inspeccionar el esquema antes de escribir fixtures; diseñar el grafo de fixtures NC padre → AC/AR/tarea.
3. Extraer/apuntar a costuras helper/servicio para mutaciones de acciones y sincronización de indicadores; mantener formularios como cableado UI.
4. Crear pruebas JSON `Public Function ... As String` mediante `access-vba-tdd`, con fixtures sandbox, `DAO.Database` explícito, aserciones fuertes y cardinalidad alrededor de mutaciones.
5. Reejecutar manifests helper/caché existentes y añadir pruebas de mutación/sincronización pendientes antes de marcar reglas como `Verified-runtime`.

## §5 Evidencia y trazabilidad
- **Pruebas verificadas en runtime**: `tests/tests.vba.seguimiento-tareas-helper.json` cubierto por slices, con 9/9 procedimientos únicos verdes.
  - Fallback/log 4/4: `Test_TareasHelper_Fallback_EmptyCache_Logs`, `Test_TareasHelper_Fallback_DisabledCache_Logs`, `Test_TareasHelper_Fallback_NoUser_SafeLog`, `Test_TareasHelper_Fallback_CacheError_Logs`.
  - Helper 4/4: `Test_TareasHelper_FilterParity_AllPredicates_Atomic`, `Test_TareasHelper_Estado_SelectsSource`, `Test_TareasHelper_NoARPerRowHydration`, `Test_TareasHelper_DeterministicOrder_ExportInput`.
  - Form 1/1: `Test_TareasForm_Delegates_FilterPaths`.
- **Detalle de evidencia**: gate de esquema documentado; backend sandbox seguro; fallback de caché vacía registrado; caché desactivada registrada; sin usuario registra como `Sistema`; error forzado en seam de caché registrado; el helper conserva el orden de predicados legacy, selecciona fuente por `Estado`, no hidrata AR/AC/NC por fila y mantiene orden/export input determinista; el formulario delega rutas de filtro/carga/limpieza al helper.
- **Pruebas no verificadas en esta evidencia**: `tests/tests.vba.cache-e2e.json`, manifests históricos de indicadores y mutaciones AC/AR/tarea siguen pendientes salvo ejecución reciente específica.
- **Caveat de runner relacionado**: un intento amplio anterior de ejecutar `tests/tests.vba.proyecto-gestion-helper.json` quedó interrumpido y dejó la operación obsoleta `dysflow-51869803-608b-44bc-8792-ef9ca837b894`; posteriormente pasó a `status=timed_out`. La manifestación de gestión de proyecto ya no queda pendiente por ese marcador: se verificó 8/8 mediante filtros pequeños. Este caveat no es fallo funcional de seguimiento.

| Elemento (funcionalidad o arreglo) | Ref. tracker | Versión staging (UAT) | Estado UAT | Release de producción | Fecha en prod | Nota |
|---|---|---|---|---|---|---|
| Indicadores de tareas diferidas de proyecto | Cambio de helper de seguimiento | Pendiente | pending | Pendiente | Pendiente | `tests/tests.vba.seguimiento-tareas-helper.json` 9/9 procedimientos únicos Verified-runtime. |
| Lecturas AC/AR/Riesgo cache-first | Issue #39 / Issue #67 | Pendiente | pending | Pendiente | Pendiente | Los documentos existentes citan `23af345` / `20b71f64`. |
| Sincronización de indicadores por alcance afectado | Issue #18 | Pendiente | pending | Pendiente | Pendiente | Solo evidencia histórica; falta prueba reciente en staging actual. |
| Ciclo de vida completo AC/AR/tarea | Pendiente | Pendiente | pending | Pendiente | Pendiente | Faltan pruebas de negocio dedicadas. |

| Síntoma | Causa probable | Comprobación (Dysflow) | Ancla documental |
|---|---|---|---|
| Indicadores de seguimiento obsoletos | Regresión de helper o sincronización de indicadores | Reejecutar `tests/tests.vba.seguimiento-tareas-helper.json`; para sincronización de indicadores crear/ejecutar pruebas pendientes | BR-NCP-AF-1,5 |
| AC/AR/Riesgo relacionado obsoleto o fallback a consulta viva | Regresión de confianza de caché | Reejecutar diagnósticos cache-e2e | BR-NCP-AF-3..4 |
| Cambió el comportamiento de guardado de acción/tarea | Faltan pruebas de ciclo de vida de negocio | Crear pruebas específicas de acciones | BR-NCP-AF-6..7 |

## §6 Notas de migración web

### §6.1 Conservar (comportamiento de negocio que debe sobrevivir)
- Los indicadores de seguimiento diferido de proyecto reflejan el estado de tareas (BR-NCP-AF-1): la web debe seguir garantizando que la API de indicadores devuelve el mismo estado de tareas que la app VBA actual, con el contrato de helper de seguimiento (`Test_TareasHelper_*` 9/9).
- El helper de seguimiento debe poder probarse sin estado UI vivo (BR-NCP-AF-2): la web debe permitir testear el helper como servicio puro, no como artefacto acoplado a la UI; replicar el patrón de `Test_TareasForm_Delegates_FilterPaths`.
- Las lecturas relacionadas de AC/AR/Riesgo usan semántica cache-first cuando la caché está cargada (BR-NCP-AF-3): la web debe mantener la misma semántica; cargado-vacío no es fallback a backend.
- La caché cargada-vacía de datos relacionados es un resultado válido, no un fallo (BR-NCP-AF-4): la web debe distinguir "caché cargada con cero filas" de "caché no disponible", igual que los diagnósticos cache-trust ya lo prueban.
- Las mutaciones correctas que afectan a indicadores refrescan el `IDNoConformidad` afectado; los fallos son visibles (BR-NCP-AF-5): la web debe propagar el `pError` de un fallo de sincronización, no afirmar que la caché está actualizada.
- Las reglas de crear, completar, cancelar, reasignar, vencimiento y propietario de AC/AR/tareas (BR-NCP-AF-6): la web debe exigir los mismos campos obligatorios y las mismas transiciones que la app VBA.
- El comportamiento de acciones de formulario como cableado UI fino sobre costuras helper/servicio (BR-NCP-AF-7): la web debe poder llamar a los mismos servicios que la UI, sin lógica embebida en componentes de UI.

### §6.2 Transformar (mecanismo legacy que se reformula)
- Sustituir `Form_FormNCProyectoSeguimiento`, `Form_FormNCProyectoSeguimientoTareas`, `Form_FormNCProyectoSeguimientoNC`, `Form_FormNCProyectoAC`, `Form_FormNCProyectoAR`, `Form_FormIndicadores` por endpoints REST diferenciados: `GET/POST/PUT` por recurso (`tarea`, `ac`, `ar`).
- Convertir `NCProyectoSeguimientoHelper`, `CacheTrustDiagnostics`, `ModuloCacheIndicadoresIssue18` en una capa de aplicación con servicios diferenciados (`Seguimiento`, `Cache`, `Diagnostico`), no un módulo VBA con helper y diagnósticos entrelazados.
- Reemplazar el patrón de carga diferida de indicadores (`OnTimer` + `m_CargaInicialIndicadoresPendiente = True` + `Me.TimerInterval = 100`) por un endpoint asíncrono o un skeleton explícito, no por un timer del cliente.
- Mover la resolución de NC padre desde cambios de AC/AR/tarea (`Issue18_ResolverNCDesde`) a un evento del backend que se dispara tras la mutación, no como hook de formulario.
- Sustituir `p_DuracionSegundos:=m_UltimaDuracionIndicadores` por un patrón de instrumentación de performance en el backend (métricas, trazas), no como propiedad de un objeto VBA.

### §6.3 NO copiar (deuda legacy de Access que no debe portarse)
- No portar `OnTimer` con `TimerInterval = 100` como patrón de carga diferida: la web debe poder invocar el helper de forma síncrona o asíncrona real (cola/worker), no con un timer del cliente.
- No duplicar la lógica de "esto es seguimiento de proyecto" en cada `.cls` de formulario: la web debe tener un único discriminador de dominio y un único guard.
- No usar la cinta (Ribbon) ni la visibilidad de menús como control de seguridad real: la web debe aplicar permisos en el servidor.
- No migrar el patrón "consulta viva a backend si la caché está vacía" como ruta normal: la web debe responder vacío y permitir reintento explícito, no fallback silencioso.
- No propagar el resultado de un hook de sincronización fallido como éxito: la web debe devolver error explícito y, si el cliente lo ignora, no debe reescribir el estado de la caché.

### §6.4 Preguntas abiertas al product owner
- ¿Los estados canónicos de una tarea/AC/AR de proyecto son los mismos que en auditoría? (BR-NCP-AF-6) Confirmar lista y transiciones.
- ¿La replanificación de una tarea de proyecto tiene límite de veces o es indefinida? (BR-NCP-AF-6)
- ¿Las notas de proyecto se pueden editar tras crear o son inmutables? (BR-NCP-AF-6) Confirmar política de retención.
- ¿La cancelación de una tarea/AC/AR requiere motivo obligatorio? ¿Y la reasignación de propietario?
- ¿El refactor de `Form_FormNCProyectoSeguimiento.cls` (Issue #38 + Issue #50) se mantiene como contrato de la web o se reescribe? Hoy la web debe consumir el helper `NCProyectoSeguimientoHelper.CargarIndicadoresSeguimientoProyecto` con la firma `p_DuracionSegundos`.
- ¿La fusión de UI `AC` + `AR` en un único recurso `accion` con subtipo es aceptable o se mantiene la separación por consistencia con auditoría?

## §7 Libro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| BR-NCP-AF-1 — Los indicadores de seguimiento diferido de proyecto reflejan el estado de tareas. | Verified-runtime | `tests/tests.vba.seguimiento-tareas-helper.json`: 9/9 procedimientos únicos verdes; `Test_TareasHelper_FilterParity_AllPredicates_Atomic`, `Test_TareasHelper_Estado_SelectsSource`, `Test_TareasHelper_NoARPerRowHydration`, `Test_TareasHelper_DeterministicOrder_ExportInput` | 2026-06-15 |
| BR-NCP-AF-2 — El comportamiento del helper de seguimiento debe poder probarse sin estado UI vivo. | Verified-runtime | Fallback/log 4/4 y helper 4/4 verdes; `Test_TareasForm_Delegates_FilterPaths` verifica delegación del formulario a rutas helper | 2026-06-15 |
| BR-NCP-AF-3 — Las lecturas relacionadas de AC/AR/Riesgo usan semántica cache-first cuando la caché está cargada. | Verified-static | `tests/tests.vba.cache-e2e.json`; FALTA → reejecutar | 2026-06-15 |
| BR-NCP-AF-4 — La caché cargada-vacía de datos relacionados es un resultado válido, no un fallo. | Verified-static | Diagnósticos existentes de cache-trust; FALTA → reejecutar | 2026-06-15 |
| BR-NCP-AF-5 — Las mutaciones correctas que afectan a indicadores refrescan el `IDNoConformidad` afectado; los fallos son visibles. | Intended | FALTA → crear mediante access-vba-tdd; reejecutar/añadir pruebas actuales de sincronización en staging | 2026-06-15 |
| BR-NCP-AF-6 — Se aplican las reglas de crear, completar, cancelar, reasignar, vencimiento y propietario de AC/AR/tareas. | Intended | FALTA → crear mediante access-vba-tdd tras confirmar esquema/reglas | 2026-06-15 |
| BR-NCP-AF-7 — El comportamiento de acciones de formulario permanece como cableado UI fino sobre costuras helper/servicio. | Intended | FALTA → crear mediante access-vba-tdd contra costuras helper/servicio; pruebas de formulario a nivel cableado solo si son inevitables | 2026-06-15 |
| Existe y está documentado el helper de indicadores de tareas diferidas. | Verified-runtime | `tests/tests.vba.seguimiento-tareas-helper.json` 9/9 procedimientos únicos; fallback/log, helper y delegación de formulario | 2026-06-15 |
| La semántica cache-first de datos relacionados está documentada. | Verified-static | Documento existente de cache-trust; sin reejecución | 2026-06-15 |
| La sincronización de indicadores Issue #18 está vigente en staging. | Intended | Solo evidencia histórica; ejecución reciente pendiente | 2026-06-15 |
| El ciclo de vida completo de acciones/tareas de negocio está cubierto. | Intended | FALTA → crear mediante access-vba-tdd; faltan pruebas/reglas confirmadas para crear/completar/cancelar/reasignar/vencimiento/propietario | 2026-06-15 |

**⚠️ Divergencias (intención SDD ≠ realidad del código)**
- Sin divergencia confirmada. Hueco confirmado de evidencia: el helper de seguimiento está cubierto en runtime, pero el ciclo de vida completo de acciones/tareas de negocio y sincronización post-mutación sigue pendiente.

**✅ Divergencias resueltas el 2026-06-15 (carga diferida del helper de seguimiento de proyecto)**
- `Test_Issue38_SeguimientoProyecto_ActualizarModoProyecto_Contract` y `Test_Issue50_SeguimientoProyecto_CargaDiferidaHelper_Contract` resueltos mediante el refactor de `src/forms/Form_FormNCProyectoSeguimiento.cls` alineado con el patrón de `Form_FormNCAuditoriaSeguimiento.cls`. Detalle completo y cross-link en [`docs/capabilities/nc-proyecto-lifecycle.md`](nc-proyecto-lifecycle.md) y en `docs/capabilities/indicators-dashboard.md` §5 / §7. No hubo regresión en `Test_Issue38_SeguimientoAuditoria`.
