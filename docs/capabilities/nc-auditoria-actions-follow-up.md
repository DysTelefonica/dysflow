# Capacidad: acciones y seguimiento de NC Auditoría

## §0 Identidad
- **ID de capacidad**: `CAP-NCA-ACTIONS-FOLLOWUP`
- **Nivel**: critical
- **Estado**: active / documentación alineada con v2; falta evidencia runtime dedicada
- **Fuente**: reverse-engineered/hybrid (inventario de fuente + documentos adyacentes de auditoría/indicadores)
- **Responsable / autoridad de producto**: Confirmación pendiente — dominio Auditoría / Calidad
- **Última verificación**: 2026-06-15 actualización documental con evidencia runtime ya recogida; en esta tarea no se ejecutó Dysflow/Access
- **Confianza global**: mixed — selección de informe/listado y algunos hooks de seguimiento/indicadores de auditoría tienen evidencia runtime por manifest/slices; el ciclo completo de acciones sigue pendiente

## §1 Intención de negocio
- **Propósito**: Realizar seguimiento de acciones correctoras, acciones de resolución, replanificaciones, notas y tareas de seguimiento para NC con origen en auditoría.
- **Usuarios / personas**: Equipo de auditoría/calidad, auditores/coordinadores, managers/revisores, desarrolladores/agentes IA.
- **Problema que resuelve**: Mantiene el trabajo de acciones de auditoría correcto en su dominio y visible sin fugas de estado de acciones de proyecto.
- **Valor de negocio / por qué existe**: Los hallazgos de auditoría necesitan acciones responsables, fechas límite, notas y evidencia de seguimiento antes del cierre/aceptación de release.
- **No objetivos**: El comportamiento de acciones de proyecto y las definiciones globales del cuadro de mando viven en páginas de capacidad separadas.
- **Fuente de intención**: Nombres de fuente y documentos adyacentes; reglas de negocio exactas pendientes de confirmación.
- **Referencia tracker de origen**: Evidencia de regresión de informe de auditoría; Issue #18 comportamiento adyacente de indicadores; Issue #67 documentación.

## §2 Contrato de comportamiento

### Escenarios (Given / When / Then)
- **GIVEN** una NC de auditoría **WHEN** el usuario abre seguimiento **THEN** las AC/AR/tareas/notas/replanificaciones mostradas deben pertenecer al dominio auditoría.
- **GIVEN** cambia una acción/tarea de auditoría **WHEN** se espera sincronización de indicadores **THEN** se deben preservar filtros de dominio Auditoría y refresco de alcance afectado.
- **GIVEN** una NC de auditoría seleccionada en la UI de gestión **WHEN** se ejecuta una salida de informe/listado **THEN** la NC de auditoría seleccionada se resuelve mediante helpers de auditoría.
- **GIVEN** flujos de crear/completar/cancelar/reasignar/replanificar/anotar acciones **WHEN** se guardan **THEN** las reglas de propietario, fecha, estado e historial deben probarse con pruebas dedicadas.

### Reglas de negocio
| ID de regla | Enunciado (previsto) | Autoridad | ¿Aplicada en código? | Prueba (evidencia) | Confianza |
|---|---|---|---|---|---|
| BR-NCA-AF-1 | Las acciones/seguimiento de auditoría siguen siendo específicas de dominio y nunca enrutan por estado de acciones de Proyecto. | Contrato de capacidad | Parcial | Evidencia acotada: `Issue38_SeguimientoAuditoria` 1/1, `Issue38_ResetearColTareas` 1/1 y slices de Issue #18 con Auditoria AC->NC / Auditoria AR hook. FALTA → crear mediante access-vba-tdd para el ciclo completo de acciones. | Verified-runtime |
| BR-NCA-AF-2 | La selección de informe/listado de auditoría usa helpers de auditoría y NC de auditoría seleccionadas. | Documento de funcionalidad de auditoría | Sí | `ComandoInforme_Click` usa `EnsureNCAuditoriaGestionSelected`; `tests/tests.vba.audit-gestion-helper.json` pasó 11/11 tras el arreglo | Verified-runtime |
| BR-NCA-AF-3 | Los indicadores compartidos pueden incluir filas de Auditoría, pero las lecturas runtime filtran por dominio/responsable. | Documentos de funcionalidad de indicadores | Parcial | Evidencia por slices: `CacheIndicadoresAuditoriaMaterializado` 3/3; `CacheIndicadoresAuditoriaMaterializado_SincronizarDesdeNegocio` pasó dentro de slice 3/3; no afirmar suite completa `tests/tests.vba.indicadores-caracterizacion.json` verde. | Verified-runtime |
| BR-NCA-AF-4 | Las reglas de creación, vencimientos, finalización, cancelación, replanificación, notas y asignación de propietario de acciones de auditoría son explícitas. | Autoridad de producto pendiente | Desconocido | FALTA → crear mediante access-vba-tdd tras confirmar esquema/reglas | Intended |
| BR-NCA-AF-5 | El comportamiento de formularios de seguimiento de auditoría permanece como cableado UI fino sobre costuras helper/servicio. | Regla de usuario/proyecto | Desconocido | FALTA → crear mediante access-vba-tdd contra costuras helper/servicio, no comportamiento directo de formulario | Intended |

### Validaciones
- La NC de auditoría padre existe para el contexto de acciones/seguimiento.
- El aislamiento de dominio es bloqueante para selección, indicadores e informes.
- Reglas de propietario/vencimiento/replanificación/finalización/cancelación pendientes.

### Transiciones de estado
- `Sin acción/tarea de auditoría` --(`Crear`)--> `Acción/tarea de auditoría creada`.
- `Acción/tarea de auditoría abierta` --(`Editar/replanificar/anotar`)--> `Estado de seguimiento actualizado`.
- `Acción/tarea de auditoría modificada` --(`Sincronizar`)--> `Indicador/detalle de Auditoría refrescado`.
- `NC de auditoría seleccionada` --(`Comando de informe/listado`)--> `Salida de dominio auditoría generada`.

### Caminos límite y de error
- Que aparezcan datos de Proyecto en seguimiento de auditoría es una fuga crítica de dominio.
- La pérdida de historial de replanificación/notas requiere pruebas dedicadas de retención.

### Señales de aceptación / presencia
- Existen pruebas acotadas/slices para seguimiento, reset de tareas y hooks AC/AR de auditoría; faltan pruebas completas de ciclo de vida de acciones.
- Las pruebas de indicadores/dominio disponibles son por slices y no permiten declarar verde completa `tests/tests.vba.indicadores-caracterizacion.json`.
- El comportamiento de selección de informe de gestión de auditoría está cubierto mediante helper de selección; otros formularios de seguimiento/acciones requieren pruebas dedicadas de costuras helper/servicio.

## §3 Mapa de implementación
- **Puntos de entrada UI**: `Form_FormNCAuditoriaSeguimiento`, `Form_FormNCAuditoriaSeguimientoNC`, `Form_FormNCAuditoriaSeguimientoTareas`, `Form_FormNCAuditoriaAcciones`, `Form_FormNCAuditoriaAC`, `Form_FormNCAuditoriaAR`, `Form_FormNCAuditoriaReplanificaciones`, `Form_FormNCAuditoriaNota`.
- **Puntos de entrada de fuente**: `NCAuditoriaSeguimientoHelper`, `ACAuditoria`, `ACAuditoriaOperaciones`, `ARAuditoria`, `ARAuditoriaOperaciones`, `SegNCAuditoria`, `SegTareasAuditoria`, `ReplanificacionesAuditoria`, `ReplanificacionesAuditoriaOperaciones`, `LogNCAuditoria`.
- **Datos tocados**: NC Auditoría, AC/AR de auditoría, datos de seguimiento/tareas, replanificaciones, notas/logs, caché compartida de indicadores.
- **Salidas**: vistas de seguimiento de auditoría, indicadores de acciones/tareas, salida de informe de auditoría, historial de notas/replanificación.
- **Dependencias e integraciones**: ciclo de vida de auditoría, cuadro de mando de indicadores, documentos/evidencia, control eficacia.
- **Sincronización fuente↔binario**: para el arreglo relacionado de informe/listado, `src/forms/Form_FormNCAuditoriaGestion.cls` fue importado antes de esta tarea, el usuario compiló manualmente y `dysflow_verify_binary` fue correcto para `.cls` y `.form.txt`. En esta tarea solo documental no se importó, compiló ni ejecutaron tests.
- **Evaluación de diseño (as-built vs ideal)**: el dominio tiene formularios/clases identificables, pero carece de contrato helper/servicio probado. Tratarlo como alto riesgo de regresión/migración hasta que existan pruebas.

## §4 Receta de reconstrucción
1. Confirmar modelo de estados, campos obligatorios, permisos y reglas de retención de AC/AR/tareas/notas/replanificación de auditoría.
2. Inspeccionar esquema y diseñar grafo de fixtures determinista: NC de auditoría padre → AC/AR/tarea → notas/replanificaciones.
3. Extraer/apuntar a costuras helper/servicio para mutaciones y refresco de indicadores; mantener formularios finos.
4. Crear pruebas JSON `Public Function` mediante `access-vba-tdd`, con `DAO.Database` explícito, fixtures sandbox, cardinalidad para mutaciones y aserciones contra fugas de dominio.
5. Cambios futuros de código: importación Dysflow → compilación manual del usuario → pruebas Dysflow.

## §5 Evidencia y trazabilidad
- **Pruebas**: evidencia ya recogida: `tests/tests.vba.audit-gestion-helper.json` pasó 11/11 tras el arreglo de selección de informe; `Issue38_SeguimientoAuditoria` pasó 1/1; `Issue38_ResetearColTareas` pasó 1/1; `Issue18_ResolverNCDesde` 3/3 incluye Auditoria AC->NC; `Issue18_ARWriteHook` incluye hook Auditoria AR; `CacheIndicadoresAuditoriaMaterializado` pasó 3/3. Faltan pruebas dedicadas de ciclo completo de acciones/seguimiento de auditoría.
- **Caveat de runner**: la operación obsoleta `dysflow-51869803-608b-44bc-8792-ef9ca837b894`, posteriormente movida a `status=timed_out`, procede de una interrupción no relacionada de `proyecto-gestion-helper`; no es un fallo funcional de auditoría ni una prueba pendiente de gestión de proyecto.

| Elemento (funcionalidad o arreglo) | Ref. tracker | Versión staging (UAT) | Estado UAT | Release de producción | Fecha en prod | Nota |
|---|---|---|---|---|---|---|
| Seguridad de selección de informe/listado de auditoría | Evidencia de regresión 2026-06-14 | Pendiente | pending | Pendiente | Pendiente | `ComandoInforme_Click` usa `EnsureNCAuditoriaGestionSelected`; manifest helper de auditoría 11/11. |
| Filas/detalle de indicadores de Auditoría | Issue #18 | Pendiente | pending | Pendiente | Pendiente | Evidencia por slices y pruebas acotadas: `CacheIndicadoresAuditoriaMaterializado` 3/3, `Issue38_SeguimientoAuditoria` 1/1, `Issue38_ResetearColTareas` 1/1, hooks AC/AR de Issue #18. |
| Flujos completos de acciones/seguimiento de auditoría | Issue #67 docs | Pendiente | pending | Pendiente | Pendiente | FALTA → crear mediante access-vba-tdd; la evidencia actual no cubre crear/completar/cancelar/reasignar/replanificar/anotar de extremo a extremo. |

| Síntoma | Causa probable | Comprobación (Dysflow) | Ancla documental |
|---|---|---|---|
| El seguimiento de auditoría muestra datos de Proyecto | Falta enrutamiento de dominio | Crear/reejecutar pruebas de dominio de seguimiento de auditoría | BR-NCA-AF-1 |
| Filas de cuadro de mando de auditoría obsoletas/ausentes | Regresión de sincronización/filtro de dominio de indicadores | Reejecutar/añadir pruebas de indicadores Auditoría | BR-NCA-AF-3 |
| El guardado de acción/tarea difiere tras release | Faltan pruebas de ciclo de vida | Crear pruebas de acciones de auditoría | BR-NCA-AF-4..5 |
| Se pierde historial de notas/replanificación | Retención/enlace sin probar | Confirmar esquema/reglas + pruebas | BR-NCA-AF-4 |

## §6 Notas de migración web
- Modelar AC, AR, tareas, notas y replanificaciones de auditoría como recursos explícitos bajo NC de auditoría.
- Mantener separadas las APIs de acciones de auditoría y proyecto aunque los patrones de implementación se compartan.
- Preservar filtros de dominio en indicadores e informes.
- No reutilizar componentes de acciones de Proyecto hasta que existan escenarios UAT específicos de auditoría.

## §7 Libro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| Existen formularios/clases de acciones/seguimiento de auditoría. | Verified-static | Inventario de fuente de documentos existentes | 2026-06-15 |
| La seguridad de selección de informe/listado de auditoría tiene evidencia runtime. | Verified-runtime | `tests/tests.vba.audit-gestion-helper.json` 11/11; `ComandoInforme_Click` usa `EnsureNCAuditoriaGestionSelected` | 2026-06-15 |
| Existen slices de seguimiento/indicadores del lado Auditoría. | Verified-runtime | `Issue38_SeguimientoAuditoria` 1/1, `Issue38_ResetearColTareas` 1/1, `Issue18_ResolverNCDesde` 3/3 con Auditoria AC->NC, `Issue18_ARWriteHook` con hook Auditoria AR, `CacheIndicadoresAuditoriaMaterializado` 3/3 | 2026-06-15 |
| El ciclo de vida dedicado de acciones de auditoría está protegido para release. | Intended | Faltan pruebas/reglas | 2026-06-15 |

**⚠️ Divergencias (intención SDD ≠ realidad del código)**
- Sin divergencia funcional confirmada. Hueco confirmado de evidencia: el inventario de fuente implica un comportamiento de seguimiento/acciones de auditoría más rico que lo cubierto por los tests actuales.
- No afirmar ciclo completo de acciones de auditoría hasta crear pruebas `access-vba-tdd` para crear/completar/cancelar/reasignar/replanificar/anotar con fixtures sandbox.
