# Capacidad: ciclo de vida de NC Auditoría

## §0 Identidad
- **ID de capacidad**: `CAP-NCA-LIFECYCLE`
- **Nivel**: critical
- **Estado**: active / documentación alineada con v2; evidencia del ciclo completo pendiente
- **Fuente**: hybrid (documentos de funcionalidad de auditoría + inventario de fuente + confirmación de negocio pendiente)
- **Responsable / autoridad de producto**: Confirmación pendiente — dominio Auditoría / Calidad
- **Última verificación**: 2026-06-15 actualización documental con evidencia runtime ya recogida; en esta tarea no se ejecutó Dysflow/Access
- **Confianza global**: mixed — lista/caché, selección de informe y algunos hooks de indicadores de auditoría tienen evidencia runtime; crear/editar/cerrar/reabrir/eliminar/rehabilitar no está probado

## §1 Intención de negocio
- **Propósito**: Gestionar no conformidades originadas en auditorías: listar/seleccionar, abrir detalle/seguimiento/acciones/documentos/control-eficacia y generar salidas específicas de auditoría.
- **Usuarios / personas**: Equipo de auditoría/calidad, auditores/coordinadores, revisores UAT, desarrolladores/agentes IA.
- **Problema que resuelve**: Evita que las NC de auditoría se confundan con las NC de proyecto y mantiene fiable la evidencia/información del dominio auditoría.
- **Valor de negocio / por qué existe**: Las NC con origen en auditoría tienen significado de dominio separado y deben seguir trazables en listados, informes, indicadores y estado de ciclo de vida.
- **No objetivos**: El comportamiento de NC con origen en proyecto y las definiciones globales de buckets de indicadores se documentan por separado.
- **Fuente de intención**: Borrador de capacidad existente + documentos de funcionalidad de auditoría; modelo de estados completo pendiente de confirmación.
- **Referencia tracker de origen**: Cambio de caché de lista backend de auditoría; evidencia de regresión de informe de auditoría 2026-06-14; Issue #18 para indicadores adyacentes.

## §2 Contrato de comportamiento

### Escenarios (Given / When / Then)
- **GIVEN** el formulario de gestión de NC Auditoría **WHEN** se carga la lista **THEN** el comportamiento helper/caché de auditoría ofrece datos actuales de auditoría o reconstruye/recarga de forma segura.
- **GIVEN** la caché de auditoría está obsoleta/falta **WHEN** se ejecuta la reconstrucción **THEN** la reconstrucción es atómica y la invalidación fuerza la recarga en el siguiente acceso.
- **GIVEN** una NC de auditoría seleccionada **WHEN** se ejecuta el comando de informe **THEN** se usan helpers de selección de auditoría y `constructor.getNCAuditoria`, nunca `constructor.getNCProyecto`.
- **GIVEN** un usuario crea/edita/cierra/reabre/elimina/rehabilita una NC de auditoría **WHEN** se ejecuta la operación **THEN** las validaciones y permisos específicos de dominio deben probarse antes de afirmar release.

### Reglas de negocio
| ID de regla | Enunciado (previsto) | Autoridad | ¿Aplicada en código? | Prueba (evidencia) | Confianza |
|---|---|---|---|---|---|
| BR-NCA-LC-1 | La caché de listado de auditoría refleja los datos actuales de auditoría del backend. | Documento de funcionalidad de auditoría | Sí | `tests/tests.vba.audit-gestion-helper.json` pasó 11/11 tras el arreglo de selección de informe | Verified-runtime |
| BR-NCA-LC-2 | La reconstrucción de caché de auditoría es atómica. | Documento de funcionalidad de auditoría | Sí | `tests/tests.vba.audit-gestion-helper.json` pasó 11/11; `CacheIndicadoresAuditoriaMaterializado` pasó 3/3 en evidencia de indicadores adyacente | Verified-runtime |
| BR-NCA-LC-3 | La invalidación de caché fuerza recarga completa en el siguiente acceso al listado de auditoría. | Documento de funcionalidad de auditoría | Sí | `tests/tests.vba.audit-gestion-helper.json` pasó 11/11 | Verified-runtime |
| BR-NCA-LC-4 | La generación de informes de auditoría usa resolver/constructor de auditoría, no la ruta de proyecto. | Documento de funcionalidad de regresión de auditoría | Sí | Fallo controlado: `VBA_TESTS_FAILED: 1 VBA test(s) failed: Test_AuditGestionForm_ReportConstructorPath_Characterization — Expected report path to delegate selected audit NC resolution`; después `tests/tests.vba.audit-gestion-helper.json` pasó 11/11 | Verified-runtime |
| BR-NCA-LC-5 | Los dominios auditoría y proyecto permanecen separados en caché, informes e indicadores. | Contrato de capacidad + docs de indicadores | Parcial | Evidencia por slices: `Issue18_ResolverNCDesde` 3/3 incluye Auditoria AC->NC; `Issue18_ARWriteHook` incluye hook Auditoria AR; `CacheIndicadoresAuditoriaMaterializado_SincronizarDesdeNegocio` pasó dentro de slice 3/3. No afirmar suite completa `tests/tests.vba.indicadores-caracterizacion.json` verde. | Verified-runtime |
| BR-NCA-LC-6 | Las reglas completas de crear/editar/cerrar/reabrir/eliminar/rehabilitar auditoría son explícitas y están probadas. | Autoridad de producto pendiente | Desconocido | FALTA → crear mediante access-vba-tdd tras confirmar regla | Intended |
| BR-NCA-LC-7 | El comportamiento de ciclo de vida en formularios es cableado UI fino sobre costuras helper/servicio. | Regla de usuario/proyecto | Desconocido | FALTA → crear mediante access-vba-tdd contra costuras helper/servicio, no lógica directa de formulario | Intended |

### Validaciones
- El esquema de caché de auditoría soporta las columnas obligatorias de listado.
- La reconstrucción/recarga de caché obsoleta o ausente de auditoría es bloqueante para confiar en el listado.
- La ruta de informe de auditoría debe resolver la NC de auditoría seleccionada mediante helpers de selección de auditoría.
- Campos obligatorios, roles y reglas de recuperación para crear/editar/cerrar están pendientes de confirmación.

### Transiciones de estado
- `Datos backend de auditoría` --(`Reconstrucción de caché`)--> `Caché reciente de listado de auditoría`.
- `Caché reciente de listado de auditoría` --(`Invalidación`)--> `Caché invalidada`.
- `NC de auditoría seleccionada` --(`Comando de informe`)--> `Informe de auditoría generado`.
- `None` --(`Crear`)--> `Nueva NC de auditoría` — pendiente de confirmación.
- `NC de auditoría abierta` --(`Cerrar`)--> `NC de auditoría cerrada` — reglas/pruebas pendientes.
- `NC de auditoría cerrada/retirada` --(`Reabrir/rehabilitar`)--> `NC de auditoría activa` — reglas/pruebas pendientes.

### Caminos límite y de error
- Que un informe de auditoría abra datos de proyecto es una regresión crítica de dominio.
- Una reconstrucción parcial de caché o caché obsoleta tras invalidación es una regresión crítica de listado.
- La fuga de dominio de indicadores requiere pruebas recientes centradas en Auditoría.

### Señales de aceptación / presencia
- El manifest helper/caché de auditoría pasó 11/11 después del arreglo de selección de informe de auditoría.
- La caracterización de informe de auditoría probó la ruta de constructor de auditoría: primero falló con detalle útil y después pasó dentro del manifest 11/11.
- Las pruebas de ciclo de vida completo cubren crear/editar/cerrar/reabrir/eliminar/rehabilitar antes de afirmar migración/release.

## §3 Mapa de implementación
- **Puntos de entrada UI**: `Form_FormNCAuditoriaGestion`, `Form_FormNCAuditoria`, `Form_FormNCAuditoriaGeneral`, `Form_FormNCAuditoriaSeguimiento`, `Form_FormNCAuditoriaAcciones`, `Form_FormNCAuditoriaAC`, `Form_FormNCAuditoriaAR`, `Form_FormNCAuditoriaDocumentos`, `Form_FormNCAuditoriaControlEficacia`.
- **Puntos de entrada de fuente**: `NCAuditoriaGestionListadoHelper`, `NCAuditoriaListadoCache`, `NCAuditoriaSeguimientoHelper`, `NCAuditoria`, `NCAuditoriaOperaciones`, `ACAuditoriaOperaciones`, `ARAuditoriaOperaciones`. La generación de informe de Word se hace desde `Informe.cls::GenerarWordNoConformidades(p_EsDeProyecto:=No)`; el módulo `InformeNCAuditorias` fue retirado el 2026-06-15 (estaba vacío desde el commit inicial y no se usaba).
- **Datos tocados**: registros de NC Auditoría, caché de listado de auditoría, AC/AR de auditoría, documentos, control-eficacia, filas de caché compartida de indicadores.
- **Salidas**: listado de auditoría, informe de auditoría, vistas de seguimiento/acciones, documentos, filas de indicadores.
- **Dependencias e integraciones**: acciones/seguimiento de auditoría, documentos, control eficacia, indicadores, soporte transversal de caché.
- **Sincronización fuente↔binario**: el arreglo ya importado de `src/forms/Form_FormNCAuditoriaGestion.cls` fue compilado manualmente por el usuario; `dysflow_verify_binary` fue correcto para `Form_FormNCAuditoriaGestion.cls` y `.form.txt`. En esta tarea solo documental no se importó, compiló ni ejecutaron tests.
- **Evaluación de diseño (as-built vs ideal)**: las costuras helper de lista/informe de auditoría son buenas; el contrato de ciclo de vida sigue infraespecificado y no debe inferirse solo por nombres de formularios.

## §4 Receta de reconstrucción
1. Confirmar nombres de estados de NC Auditoría, permisos, campos obligatorios, diferencias de control-eficacia y reglas de recuperación/eliminación.
2. Mapear acciones de formulario a costuras helper/servicio de auditoría y mantener formularios finos.
3. Crear pruebas con esquema primero para lista/caché/ruta de informe de auditoría y ciclo de vida crear/editar/cerrar/recuperar.
4. Añadir pruebas de indicadores de dominio Auditoría donde se afirme caché/filtro de dominio compartido.
5. Cambios futuros de código: importación Dysflow → compilación manual del usuario → ejecución de pruebas Dysflow.

## §5 Evidencia y trazabilidad
- **Pruebas**: evidencia ya recogida: `tests/tests.vba.audit-gestion-helper.json` pasó 11/11 tras el arreglo de selección de informe; `CacheIndicadoresAuditoriaMaterializado` pasó 3/3; `Issue38_SeguimientoAuditoria` pasó 1/1; `Issue38_ResetearColTareas` pasó 1/1; slices de Issue #18 cubrieron Auditoria AC->NC, hook Auditoria AR y `CacheIndicadoresAuditoriaMaterializado_SincronizarDesdeNegocio`. Esta tarea no reejecutó Dysflow/Access.
- **Caveat de runner**: existe una operación Dysflow obsoleta `dysflow-51869803-608b-44bc-8792-ef9ca837b894`, posteriormente movida a `status=timed_out`, procedente de una interrupción no relacionada de `proyecto-gestion-helper`; es una salvedad histórica del runner, no una evidencia de fallo funcional de auditoría ni una prueba pendiente de gestión de proyecto.

| Elemento (funcionalidad o arreglo) | Ref. tracker | Versión staging (UAT) | Estado UAT | Release de producción | Fecha en prod | Nota |
|---|---|---|---|---|---|---|
| Esquema/lectura/reconstrucción/transacción de caché de lista de auditoría | Caché de lista backend de auditoría | Pendiente | pending | Pendiente | Pendiente | `tests/tests.vba.audit-gestion-helper.json` pasó 11/11; commits históricos citados: `e119189`, `31977af`, `7e27db8`, `3c4692f`. |
| La ruta de informe de auditoría usa helper de auditoría | Evidencia de regresión 2026-06-14 | Pendiente | pending | Pendiente | Pendiente | `ComandoInforme_Click` usa `EnsureNCAuditoriaGestionSelected`; fallo controlado de `Test_AuditGestionForm_ReportConstructorPath_Characterization` y manifest posterior 11/11. |
| Filas compartidas de indicadores de Auditoría | Issue #18 | Pendiente | pending | Pendiente | Pendiente | Evidencia por slices: `CacheIndicadoresAuditoriaMaterializado` 3/3, `Issue38_SeguimientoAuditoria` 1/1, `Issue38_ResetearColTareas` 1/1 y slices de Issue #18 indicadas; no afirmar suite completa de indicadores verde. |
| Ciclo de vida completo de auditoría | Pendiente | Pendiente | pending | Pendiente | Pendiente | Faltan reglas/pruebas. |

| Síntoma | Causa probable | Comprobación (Dysflow) | Ancla documental |
|---|---|---|---|
| Listado de auditoría en blanco/obsoleto | Regresión de esquema/reconstrucción/invalidación de caché | Reejecutar manifest helper de auditoría | BR-NCA-LC-1..3 |
| El informe de auditoría abre NC de proyecto | Regresión de ruta de constructor | Reejecutar caracterización de informe | BR-NCA-LC-4 |
| Fuga de indicadores auditoría/proyecto | Falta/obsolescencia de filtro de dominio | Reejecutar/añadir pruebas de indicadores Auditoría | BR-NCA-LC-5 |
| Regresión de acción de ciclo de vida de auditoría | Falta contrato E2E de ciclo de vida | Crear pruebas de ciclo de vida | BR-NCA-LC-6..7 |

## §6 Notas de migración web

### §6.1 Conservar (comportamiento de negocio que debe sobrevivir)
- La caché de listado de auditoría refleja los datos actuales de auditoría del backend (BR-NCA-LC-1): la web debe seguir resolviendo el listado de auditoría desde un modelo de lectura backend, no desde un estado de cliente. `tests.vba.audit-gestion-helper.json` 11/11 ya documenta el comportamiento.
- La reconstrucción de caché de auditoría es atómica (BR-NCA-LC-2): si el sistema hace `Reconstruir` y falla a mitad, no debe quedar un dataset parcial. La web debe replicar el patrón transaccional de borrado-y-regeneración o un job con compensación.
- La invalidación de caché fuerza recarga completa en el siguiente acceso al listado de auditoría (BR-NCA-LC-3): la web debe seguir invalidando explícitamente y reconstruyendo, sin caches intermedias obsoletas.
- La generación de informes de auditoría usa resolver/constructor de auditoría, no la ruta de proyecto (BR-NCA-LC-4): el endpoint de generación de informe de la web debe seguir exigiendo un `IDNoConformidad` (de la NC de auditoría) y resolver por el constructor de auditoría; nunca `constructor.getNCProyecto`.
- Los dominios auditoría y proyecto permanecen separados en caché, informes e indicadores (BR-NCA-LC-5): la web debe mantener la separación per-domain en la respuesta, no devolver una unión cruzada.
- Las reglas de crear/editar/cerrar/reabrir/eliminar/rehabilitar de auditoría son explícitas (BR-NCA-LC-6): la web debe exigir los mismos campos obligatorios y las mismas transiciones que la app VBA actual.
- El ciclo de vida en formularios como cableado UI fino sobre costuras helper/servicio (BR-NCA-LC-7): la web debe poder llamar a los mismos servicios que la UI, sin lógica embebida en componentes de UI.

### §6.2 Transformar (mecanismo legacy que se reformula)
- Sustituir `Form_FormNCAuditoriaGestion`, `Form_FormNCAuditoria`, `Form_FormNCAuditoriaGeneral`, `Form_FormNCAuditoriaSeguimiento`, `Form_FormNCAuditoriaAcciones`, `Form_FormNCAuditoriaAC`, `Form_FormNCAuditoriaAR`, `Form_FormNCAuditoriaDocumentos`, `Form_FormNCAuditoriaControlEficacia` por endpoints REST con discriminador de dominio.
- Convertir `NCAuditoriaGestionListadoHelper` y `NCAuditoriaListadoCache` en una capa de aplicación con dos servicios diferenciados: `Listado` y `Cache`, no un módulo VBA con helper y caché entrelazados.
- Reemplazar `NCAuditoriaOperaciones`, `ACAuditoriaOperaciones`, `ARAuditoriaOperaciones` por servicios REST con una firma por comando (`Crear`, `Editar`, `Cerrar`, `Reabrir`, `Eliminar`, `Rehabilitar`).
- Mover la generación de informe de Word desde `Informe.cls::GenerarWordNoConformidades(p_EsDeProyecto:=No)` a un servicio server-side con `p_EsDeProyecto:=No` como parámetro explícito y guard de tipo de NC.
- Sustituir el patrón `EnsureNCAuditoriaGestionSelected` (que hoy es un helper VBA) por una validación en la capa de aplicación que rechace la generación si la NC no es de auditoría, retornando `400` o `409`.

### §6.3 NO copiar (deuda legacy de Access que no debe portarse)
- No portar `DoCmd.OpenForm` con `OpenArgs` para abrir una NC de auditoría: la API REST debe recibir `IDNoConformidad` (de la NC de auditoría) en la URL.
- No duplicar la lógica de "esto es una NC de auditoría" en cada `.cls` de formulario: la web debe tener un único discriminador de dominio.
- No usar la cinta (Ribbon) ni la visibilidad de menús como control de seguridad: la web debe aplicar permisos en el servidor.
- No migrar la separación física de formularios (general, gestión, seguimiento, acciones, AC, AR, documentos, control-eficacia) si la lógica de negocio es compartible: la web debe poder unificar bajo un mismo recurso con sub-estados.
- No reintroducir un módulo `InformeNCAuditorias.cls` paralelo: la ruta canónica sigue siendo `Informe.GenerarWordNoConformidades(p_EsDeProyecto:=No)`.

### §6.4 Preguntas abiertas al product owner
- ¿Cuáles son los estados canónicos de NC Auditoría? (BR-NCA-LC-6) Confirmar lista y transiciones (crear → abrir → cerrar → reabrir → eliminar → rehabilitar).
- ¿La rehabilitación de una NC de auditoría borrada es indefinida o tiene un plazo? (BR-NCA-LC-6)
- ¿El cierre de una NC de auditoría exige todas las ACs cerradas o se permite cierre parcial? (BR-NCA-LC-6, adyacente a `control-eficacia-workflow` BR-CE-2)
- ¿La diferencia entre `NC Auditoría` y `NC Proyecto` debe mantenerse en la web como dos entidades con servicios paralelos, o se unifican en una sola con `tipoDominio`? (BR-NCA-LC-5)
- ¿Las reglas de `Reabrir` y `Eliminar` son reversibles en auditoría? Si se reabre, ¿se restaura el histórico de indicadores o se parte de cero?
- ¿La selección de informe de auditoría debe pasar obligatoriamente por `EnsureNCAuditoriaGestionSelected` o se admite una llamada directa con `IDNoConformidad` (de la NC de auditoría)?

## §7 Libro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| BR-NCA-LC-1 — La caché de listado de auditoría refleja los datos actuales de auditoría del backend. | Verified-runtime | `tests/tests.vba.audit-gestion-helper.json` pasó 11/11 tras el arreglo de selección de informe de auditoría | 2026-06-15 |
| BR-NCA-LC-2 — La reconstrucción de caché de auditoría es atómica. | Verified-runtime | `tests/tests.vba.audit-gestion-helper.json` pasó 11/11; `CacheIndicadoresAuditoriaMaterializado` pasó 3/3 en evidencia de indicadores adyacente | 2026-06-15 |
| BR-NCA-LC-3 — La invalidación de caché fuerza recarga completa en el siguiente acceso al listado de auditoría. | Verified-runtime | `tests/tests.vba.audit-gestion-helper.json` pasó 11/11 | 2026-06-15 |
| BR-NCA-LC-4 — La generación de informes de auditoría usa resolver/constructor de auditoría, no la ruta de proyecto. | Verified-runtime | Fallo controlado de `Test_AuditGestionForm_ReportConstructorPath_Characterization` y manifest posterior 11/11; `ComandoInforme_Click` usa `EnsureNCAuditoriaGestionSelected` | 2026-06-15 |
| BR-NCA-LC-5 — Los dominios auditoría y proyecto permanecen separados en caché, informes e indicadores. | Verified-runtime | `Issue18_ResolverNCDesde` 3/3 incluye Auditoria AC->NC; `Issue18_ARWriteHook` incluye hook Auditoria AR; `CacheIndicadoresAuditoriaMaterializado_SincronizarDesdeNegocio` pasó dentro de slice 3/3; no afirmar suite completa `tests/tests.vba.indicadores-caracterizacion.json` verde | 2026-06-15 |
| BR-NCA-LC-6 — Las reglas completas de crear/editar/cerrar/reabrir/eliminar/rehabilitar auditoría son explícitas y están probadas. | Intended | FALTA → crear mediante access-vba-tdd tras confirmar regla | 2026-06-15 |
| BR-NCA-LC-7 — El comportamiento de ciclo de vida en formularios es cableado UI fino sobre costuras helper/servicio. | Intended | FALTA → crear mediante access-vba-tdd contra costuras helper/servicio, no lógica directa de formulario | 2026-06-15 |
| Existe y está documentado el comportamiento helper de lista/caché de auditoría. | Verified-runtime | `tests/tests.vba.audit-gestion-helper.json` 11/11 | 2026-06-15 |
| El informe de auditoría debe usar la ruta de constructor de auditoría. | Verified-runtime | `Test_AuditGestionForm_ReportConstructorPath_Characterization` falló con detalle controlado antes del arreglo y quedó cubierto por el manifest 11/11 después; `ComandoInforme_Click` usa `EnsureNCAuditoriaGestionSelected` | 2026-06-15 |
| La paridad fuente↔binario del formulario de gestión de auditoría quedó comprobada tras el arreglo. | Verified-runtime | Usuario compiló manualmente; `dysflow_verify_binary` correcto para `Form_FormNCAuditoriaGestion.cls` y `.form.txt` | 2026-06-15 |
| Los hooks/lecturas de indicadores del lado Auditoría tienen evidencia por slices. | Verified-runtime | `CacheIndicadoresAuditoriaMaterializado` 3/3, `Issue38_SeguimientoAuditoria` 1/1, `Issue38_ResetearColTareas` 1/1, slices Issue #18 indicadas | 2026-06-15 |
| El ciclo de vida completo de auditoría está protegido para release. | Intended | Faltan reglas/pruebas de negocio | 2026-06-15 |

**⚠️ Divergencias (intención SDD ≠ realidad del código)**
- No se debe inferir ciclo de vida completo de auditoría desde la evidencia actual: crear/cerrar/reabrir/eliminar/rehabilitar siguen como `FALTA → crear mediante access-vba-tdd`.
- No declarar verde completa la suite `tests/tests.vba.indicadores-caracterizacion.json`; la evidencia de indicadores usada aquí es por slices.
