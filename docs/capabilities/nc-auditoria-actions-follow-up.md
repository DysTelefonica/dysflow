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

### §6.1 Conservar (comportamiento de negocio que debe sobrevivir)
- Las acciones/seguimiento de auditoría permanecen en su dominio: nunca enrutan por estado de acciones de Proyecto (BR-NCA-AF-1). La web debe mantener separados los endpoints y rutas de NC-Auditoria-AC/AR/tarea y NC-Proyecto-AC/AR/tarea, con guardas explícitas de `tipoDominio`.
- La selección de informe/listado de auditoría sigue resolviendo por helpers de auditoría y NC de auditoría seleccionada (BR-NCA-AF-2): el endpoint de generación de informe de auditoría debe seguir exigiendo un `IDNoConformidad` válido (de la NC de auditoría) y `EnsureNCAuditoriaGestionSelected` debe sobrevivir a la migración como guard de la capa de aplicación, no como evento de formulario.
- Las filas de indicadores compartidos pueden incluir auditoría, pero las lecturas filtran por dominio/responsable (BR-NCA-AF-3): el filtrado per-domain y per-responsable del cuadro de mando debe seguir aplicando, sin permitir fugas.
- Las reglas de crear, vencimientos, finalización, cancelación, replanificación, notas y asignación de propietario de acciones de auditoría (BR-NCA-AF-4): la web debe seguir exigiendo los mismos campos obligatorios y las mismas transiciones de estado que la app VBA.
- Los formularios de seguimiento de auditoría como cableado UI fino sobre costuras helper/servicio (BR-NCA-AF-5): la web debe poder llamar a los mismos servicios de mutación que la UI, sin lógica embebida en componentes de UI.

### §6.2 Transformar (mecanismo legacy que se reformula)
- Sustituir `Form_FormNCAuditoriaSeguimiento`, `Form_FormNCAuditoriaSeguimientoNC`, `Form_FormNCAuditoriaSeguimientoTareas`, `Form_FormNCAuditoriaAcciones`, `Form_FormNCAuditoriaAC`, `Form_FormNCAuditoriaAR`, `Form_FormNCAuditoriaReplanificaciones`, `Form_FormNCAuditoriaNota` por endpoints REST diferenciados: `GET/POST/PUT` por recurso (`ac`, `ar`, `tarea`, `replanificacion`, `nota`).
- Convertir `NCAuditoriaSeguimientoHelper`, `ACAuditoriaOperaciones`, `ARAuditoriaOperaciones`, `ReplanificacionesAuditoriaOperaciones` en servicios backend con una firma por comando (`Crear`, `Finalizar`, `Cancelar`, `Reasignar`, `Replanificar`, `Anotar`).
- Reemplazar el patrón de `LogNCAuditoria` por un appender de logs estructurados a un bus de eventos, no por una tabla de Access consultable.
- Mover la regla "el seguimiento de auditoría muestra solo auditoría" a un middleware de autorización que valide `tipoDominio=Auditoria` en cada request, no como check en el `.cls` del formulario.
- Sustituir el `OnTimer` con `m_CargaInicialIndicadoresPendiente` por un endpoint asíncrono o un skeleton explícito, no por un timer del cliente.

### §6.3 NO copiar (deuda legacy de Access que no debe portarse)
- No portar `Me.OpenArgs` ni `DoCmd.OpenForm` como contrato de selección de NC de auditoría: la API REST debe recibir `IDNoConformidad` (de la NC de auditoría) en la URL.
- No duplicar la lógica de "esto es seguimiento de auditoría" en cada `.cls` de formulario: la web debe tener un único discriminador de dominio y un único guard.
- No usar la cinta (Ribbon) ni la visibilidad de menús como control de seguridad real: la web debe aplicar permisos en el servidor.
- No migrar la combinación de `Form_FormNCAuditoriaAcciones` + `Form_FormNCAuditoriaAC` + `Form_FormNCAuditoriaAR` como tres UI distintas en la web si la lógica de negocio es la misma: la web puede tener un único recurso `accion` con subtipo.
- No usar el helper `NCAuditoriaSeguimientoHelper` desde la capa de UI en la web: el helper debe ser consumido solo desde la capa de servicio, no por componentes.

### §6.4 Preguntas abiertas al product owner
- ¿Los estados canónicos de una AC/AR/tarea de auditoría son los mismos que en proyecto o son específicos de auditoría? (BR-NCA-AF-4) Confirmar lista y transiciones.
- ¿La replanificación de una acción de auditoría tiene límite de veces o es indefinida? (BR-NCA-AF-4)
- ¿Las notas de auditoría se pueden editar tras crear o son inmutables? (BR-NCA-AF-4) Confirmar política de retención.
- ¿La cancelación de una acción de auditoría requiere motivo obligatorio? ¿Y la reasignación de propietario?
- ¿La herencia de AC/AR desde proyecto a auditoría se permite o son siempre dominios disjuntos? Hoy se asume disjuntos, pero conviene confirmarlo.
- ¿La fusión de UI `Acciones` + `AC` + `AR` en un único recurso es aceptable para el equipo de auditoría o se mantiene la separación por consistencia con proyecto?

## §7 Libro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| BR-NCA-AF-1 — Las acciones/seguimiento de auditoría siguen siendo específicas de dominio y nunca enrutan por estado de acciones de Proyecto. | Verified-runtime | `Issue38_SeguimientoAuditoria` 1/1, `Issue38_ResetearColTareas` 1/1 y slices de Issue #18 con Auditoria AC->NC / Auditoria AR hook; FALTA → crear mediante access-vba-tdd para el ciclo completo de acciones | 2026-06-15 |
| BR-NCA-AF-2 — La selección de informe/listado de auditoría usa helpers de auditoría y NC de auditoría seleccionadas. | Verified-runtime | `ComandoInforme_Click` usa `EnsureNCAuditoriaGestionSelected`; `tests/tests.vba.audit-gestion-helper.json` pasó 11/11 tras el arreglo | 2026-06-15 |
| BR-NCA-AF-3 — Los indicadores compartidos pueden incluir filas de Auditoría, pero las lecturas runtime filtran por dominio/responsable. | Verified-runtime | `CacheIndicadoresAuditoriaMaterializado` 3/3; `CacheIndicadoresAuditoriaMaterializado_SincronizarDesdeNegocio` pasó dentro de slice 3/3; no afirmar suite completa `tests/tests.vba.indicadores-caracterizacion.json` verde | 2026-06-15 |
| BR-NCA-AF-4 — Las reglas de creación, vencimientos, finalización, cancelación, replanificación, notas y asignación de propietario de acciones de auditoría son explícitas. | Intended | FALTA → crear mediante access-vba-tdd tras confirmar esquema/reglas | 2026-06-15 |
| BR-NCA-AF-5 — El comportamiento de formularios de seguimiento de auditoría permanece como cableado UI fino sobre costuras helper/servicio. | Intended | FALTA → crear mediante access-vba-tdd contra costuras helper/servicio, no comportamiento directo de formulario | 2026-06-15 |
| Existen formularios/clases de acciones/seguimiento de auditoría. | Verified-static | Inventario de fuente de documentos existentes | 2026-06-15 |
| La seguridad de selección de informe/listado de auditoría tiene evidencia runtime. | Verified-runtime | `tests/tests.vba.audit-gestion-helper.json` 11/11; `ComandoInforme_Click` usa `EnsureNCAuditoriaGestionSelected` | 2026-06-15 |
| Existen slices de seguimiento/indicadores del lado Auditoría. | Verified-runtime | `Issue38_SeguimientoAuditoria` 1/1, `Issue38_ResetearColTareas` 1/1, `Issue18_ResolverNCDesde` 3/3 con Auditoria AC->NC, `Issue18_ARWriteHook` con hook Auditoria AR, `CacheIndicadoresAuditoriaMaterializado` 3/3 | 2026-06-15 |
| El ciclo de vida dedicado de acciones de auditoría está protegido para release. | Intended | Faltan pruebas/reglas | 2026-06-15 |

**⚠️ Divergencias (intención SDD ≠ realidad del código)**
- Sin divergencia funcional confirmada. Hueco confirmado de evidencia: el inventario de fuente implica un comportamiento de seguimiento/acciones de auditoría más rico que lo cubierto por los tests actuales.
- No afirmar ciclo completo de acciones de auditoría hasta crear pruebas `access-vba-tdd` para crear/completar/cancelar/reasignar/replanificar/anotar con fixtures sandbox.
