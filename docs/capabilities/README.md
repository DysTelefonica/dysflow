# Catálogo de capacidades de negocio

Este directorio es la capa de documentación orientada al negocio para No Conformidades. Léelo antes que el código cuando necesites entender qué hace la aplicación, qué comportamiento de negocio debe sobrevivir a una release y qué capacidad probablemente falta cuando aparece una regresión.

## Estándar canónico de documentación

Desde el 2026-06-15, esta es la forma canónica de documentar No Conformidades y cualquier trabajo futuro de capacidades Access/VBA en este repositorio.

Todos los entregables de documentación se redactan de forma canónica en castellano de España. Los identificadores de código, nombres de pruebas, manifests, nombres de módulos/clases/formularios, herramientas Dysflow, valores de enumeraciones de confianza/estado, rutas, referencias a commits/issues/PRs, ramas y URLs se conservan exactamente como estén en las fuentes.

Todo trabajo nuevo, trabajo SDD existente y comportamiento legacy anterior a SDD debe documentarse mediante el flujo `access-vba-capability-docs`:

1. **Gate 0 — recuperar primero la intención**: revisar artefactos SDD existentes (`openspec/`, Engram `sdd/*`, issues/PRs) antes de hacer ingeniería inversa. SDD y la entrada del product owner explican **por qué** existe la capacidad.
2. **El código es la fuente de verdad del comportamiento**: el código Access/VBA exportado, formularios, consultas, informes y verificación Dysflow explican **qué hace realmente la aplicación y cómo**.
3. **Detectar divergencias**: si la intención SDD/producto dice una cosa y el código hace otra, marcarlo como `Divergent`; no ocultar ni normalizar el desacuerdo.
4. **Toda regla de negocio necesita una prueba**: una regla sin una prueba Dysflow en verde no está completa. Marcarla como `Verified-static` solo como deuda temporal y crear/planificar una prueba mediante `access-vba-tdd`.
5. **Usar confianza en cada hecho**: `Verified-runtime`, `Verified-static`, `Intended`, `Likely` o `Divergent`, con evidencia y fecha.
6. **Trazar releases**: registrar la etiqueta UAT, release de producción, commit, referencia de seguimiento, pruebas y estado para poder localizar después los cambios del equipo de calidad.
7. **Facilitar el diagnóstico de regresiones**: cada capacidad debe indicar cómo reconocer que falta, está rota, obsoleta o ya no está verificada en una release posterior.
8. **Facilitar la migración web**: documentar el comportamiento de negocio que debe preservarse y las mecánicas legacy de Access/VBA que no deben copiarse.

Por tanto, `docs/capabilities/` es el primer lugar que una IA o desarrollador debe leer antes de tocar código. `docs/features/` sigue siendo el libro técnico/de regresión de apoyo por debajo.

## Capas de documentación

| Capa | Ruta canónica | Propósito | Evidencia típica |
|---|---|---|---|
| Capacidades de negocio | `docs/capabilities/` | Comportamiento de negocio, flujos de trabajo, notas de migración, trazabilidad release/UAT y diagnóstico de regresiones por capacidad. | Páginas de capacidad, filas de trazabilidad de release, etiquetas UAT/release, preguntas de negocio abiertas. |
| Funcionalidades de apoyo | `docs/features/` | Evidencia técnica/de regresión que da soporte a las capacidades. Las páginas de funcionalidad son libros de evidencia respaldados por implementación, no el mapa de negocio completo. | Manifests de pruebas, últimos commits conocidos en verde, estado de sincronización Access, alcanzabilidad en staging, anclas de rollback. |

Usa esta separación de forma deliberada:

- Empieza en `docs/capabilities/` para entender la aplicación desde el punto de vista de negocio.
- Sigue los enlaces hacia `docs/features/` para verificar la cobertura técnica y la evidencia de regresión.
- Si una capacidad no tiene página de funcionalidad de apoyo o no tiene evidencia reciente, trátalo como un hueco de documentación o verificación.

## Índice de capacidades

| Dominio | Página inicial de capacidad | Estado | Notas |
|---|---|---|---|
| Ciclo de vida de NC Proyecto | [NC Proyecto lifecycle](nc-proyecto-lifecycle.md) | v2-aligned / mixed confidence | Crear/editar/buscar/ver/cerrar/reabrir/eliminar o rehabilitar no conformidades de proyecto. |
| Acciones y seguimiento de NC Proyecto | [NC Proyecto actions and follow-up](nc-proyecto-actions-follow-up.md) | v2-aligned / mixed confidence | Acciones correctoras/de resolución, tareas diferidas e indicadores de seguimiento. |
| Documentos | [Documents and generated evidence](documents-generated-evidence.md) | v2-aligned / pending business evidence | Adjuntar, generar, emitir y gestionar documentos y evidencias. |
| Control eficacia | [Control eficacia workflow](control-eficacia-workflow.md) | v2-aligned / mixed confidence | Flujo de control de eficacia, fechas, validación y bloqueo de cierre. |
| Ciclo de vida de NC Auditoría | [NC Auditoría lifecycle](nc-auditoria-lifecycle.md) | v2-aligned / mixed confidence | Ciclo de vida de no conformidades con origen en auditoría. |
| Acciones/seguimiento de Auditoría | [NC Auditoría actions and follow-up](nc-auditoria-actions-follow-up.md) | v2-aligned / high test debt | Seguimiento de acciones de auditoría y seguimiento asociado. |
| Indicadores/cuadro de mando | [Indicators dashboard](indicators-dashboard.md) | v2-aligned / pending fresh evidence | Indicadores, cuadros de mando, recuentos y visibilidad de gestión. |
| Expedientes, riesgos y responsables | [Expedientes, riesgos y responsables](expedientes-riesgos-responsables.md) | initial / mixed static evidence | Búsqueda/selección de expedientes, responsables, jurídicas y riesgos asociados. |
| Comunicaciones, informes y exportaciones | [Communications, reports and exports](communications-reports-exports.md) | initial / high test debt | Correo, HTML, informes Word y exportaciones visibles. |
| Usuarios, permisos y navegación | [Users, permissions and navigation](users-permissions-navigation.md) | initial / high test debt | Menús, roles, filtros iniciales por usuario y bloqueos de acciones sensibles. |
| Configuración, backends y runtime local | [Configuration, backends and local runtime](configuration-backends-runtime.md) | initial / mixed static evidence | Enrutamiento backend, rutas locales, kill-switches y guardas de sandbox/producción. |
| Maestros y catálogos | [Master data and catalogues](master-data-catalogues.md) | initial / mixed static evidence | Motivos, tipologías, estados, técnicos, responsables, jurídicas/proveedores y catálogos. |
| UAT/release/rollback | [Release, UAT and rollback traceability](release-uat-rollback-traceability.md) | initial / documentary capability | Tags UAT, gates de release, alcanzabilidad y rollback documental. |
| Soporte transversal | [Cross-cutting support](cross-cutting-support.md) | v2-aligned / mixed evidence | Caché, permisos, configuración, diagnósticos, correo, informes y otros servicios compartidos. |

## Huecos prioritarios de pruebas de capacidad

Estas son las siguientes obligaciones de reglas de negocio creadas por la migración v2. Cada regla marcada como `FALTA` debe crearse mediante `access-vba-tdd`: fixtures con esquema primero, preparación segura en sandbox, pruebas JSON `Public Function`, `DAO.Database` explícito cuando se toquen datos y comprobaciones de cardinalidad alrededor de mutaciones. Si el comportamiento está actualmente en código de formulario, apunta a una costura de helper/servicio y deja los formularios como cableado UI fino.

| Prioridad | Capacidad | Prueba pendiente | Por qué importa |
|---|---|---|---|
| P0 | Indicators dashboard | Pruebas de staging actual para la caché compartida de indicadores: filas de detalle, filtros de usuario/dominio, sincronización de NC afectada, propagación de fallos. | La evidencia histórica de Issue #18 no basta para tener confianza de release. |
| P0 | NC Auditoría actions/follow-up | Pruebas dedicadas del ciclo de vida de AC/AR/tarea/nota/replanificación de auditoría. | La documentación actual tiene inventario de fuente y evidencia adyacente de listas/informes, no prueba de negocio. |
| P0 | NC Proyecto lifecycle | Pruebas end-to-end o sobre costuras helper para crear/editar/ver/cerrar/reabrir/eliminar/rehabilitar y permisos. | La evidencia existente cubre helper/caché/partes de FE, no el ciclo de vida completo. |
| P1 | NC Proyecto actions/follow-up | Pruebas de mutación para crear/completar/cancelar/reasignar AC/AR/tarea y sincronización de indicadores afectados. | Existen indicadores de seguimiento, pero las reglas del ciclo de vida de acciones siguen sin confirmarse. |
| P1 | Control eficacia | Flujo completo aprobado/no aprobado/no requerido/replanificación y comportamiento del botón diferido de auditoría. | Issue #19 cubre el momento de validación FE, no todo el dominio de control de eficacia. |
| P1 | Documents/evidence | Pruebas de enrutamiento por dominio, evidencia obligatoria, permisos, nomenclatura/versionado/retención y trazabilidad de informes generados. | El comportamiento de evidencia se infiere en gran parte de formularios/clases. |
| P1 | NC Auditoría lifecycle | Ciclo completo de crear/editar/cerrar/reabrir/eliminar/rehabilitar auditoría y pruebas de aislamiento de dominio. | La ruta de caché/informe de auditoría está cubierta; el ciclo de vida no. |
| P1 | Expedientes, riesgos y responsables | Búsqueda/selección de expedientes con fixtures; filtros por responsable/calidad; vínculos expediente→responsables/jurídicas/riesgos; ciclo de vida de riesgos. | Expedientes y riesgos condicionan listados, seguimiento e informes, pero no tienen manifest dedicado. |
| P1 | Usuarios, permisos y navegación | Matriz de permisos por rol y acción sensible; navegación de menús; bloqueo de técnico en altas; filtros iniciales por responsable. | La seguridad está embebida en formularios y no puede migrarse ni auditarse por nombres. |
| P1 | Comunicaciones, informes y exportaciones | `Correo.Registrar`, HTML de NC, rutas de informe Word, exportaciones Excel y privacidad de copia oculta. | Las salidas externas son evidencia de negocio; hoy falta prueba de registro/salida completa. |
| P1 | Configuración/backends/runtime | Diagnóstico end-to-end de backend activo/sandbox, sanitización de rutas, kill-switch y estado de catálogo contra staging actual. | Una prueba contra backend incorrecto invalida cualquier `Verified-runtime`. |
| P2 | Maestros/catálogos | Contratos de tipologías, motivos CE, estados, técnicos, responsables, jurídicas/proveedores; permisos de edición e idempotencia. | Los catálogos son reglas de negocio y hoy tienen cobertura parcial. |
| P2 | UAT/release/rollback | Check documental/Git que valide reachability, tags UAT, release rows y rollback anchors por capability/feature. | Sin gate automatizado, la evidencia puede quedar obsoleta aunque los tests pasen. |
| P2 | Cross-cutting support | Diagnósticos de enrutamiento backend, matriz de permisos, pruebas de comportamiento requerido de correo/logging. | Los servicios compartidos pueden invalidar muchas afirmaciones de capacidad a la vez. |

## Huecos documentales restantes tras la auditoría del 2026-06-15

La auditoría documental cubrió los formularios, módulos/clases, OpenSpec, docs de features y manifests disponibles sin ejecutar Dysflow/Access. Quedan estos huecos explícitos:

| Área | Estado | Obligación siguiente |
|---|---|---|
| Esquema real de expedientes/responsables/riesgos/catálogos | Parcial; inferido por clases y formularios | Inspeccionar esquema con Dysflow en una tarea futura y diseñar fixtures `access-vba-tdd`. |
| Proveedores | No hay contrato de capacidad separado; posible presencia dentro de expediente/catálogos | Confirmar tabla/campo de proveedor y crear sección/prueba si es comportamiento vivo. |
| Auditorías base (`Auditoria`, `FormAuditoria*`) | Cubiertas solo indirectamente por NC Auditoría | Decidir si crear capacidad propia de auditorías base: alta/gestión/selección de auditoría. |
| Informes Excel | Detectados por nombres de eventos, no inventariados exhaustivamente | Mapear `ComandoExportarAExcel_Click` por formulario y crear pruebas de columnas/filtros. |
| Correo real vs cola de envío | Código registra `TbCorreosEnviados`; envío externo no probado | Confirmar proceso de envío posterior y privacidad de BCC. |
| Matriz de permisos | Roles en código, reglas dispersas en formularios | Crear matriz producto y pruebas por rol/acción. |
| UAT/release por capability | Filas mayoritariamente pendientes | Completar al crear tags `PRUEBAS-###` y releases. |

## Campos obligatorios para cada página de capacidad

Cada página de capacidad DEBE incluir estas secciones, incluso cuando el primer borrador solo diga `Evidencia pendiente` o `Confirmación pendiente`.

| Campo | Contenido requerido |
|---|---|
| Identidad | ID de capacidad, nivel, estado, fuente (`sdd` / `reverse-engineered` / `hybrid`), última verificación, confianza global. |
| Propósito de negocio | Por qué existe la capacidad y qué resultado de negocio habilita. |
| Usuarios | Personas, equipos o roles que usan la capacidad o dependen de ella. |
| Flujo de trabajo | Camino principal esperado y caminos alternativos conocidos. |
| Puntos de entrada UI | Formularios, botones, entradas de menú, informes u otras superficies Access. |
| Reglas de negocio | Reglas que el negocio espera que el sistema aplique o preserve. |
| Libro de confianza | Confianza hecho a hecho: `Verified-runtime`, `Verified-static`, `Intended`, `Likely`, `Divergent`. |
| Datos tocados | Tablas, tablas vinculadas, modelos de lectura en caché o salidas tocadas por la capacidad. |
| Transiciones de estado | Cambios de estado permitidos y movimiento del ciclo de vida. |
| Validaciones | Campos obligatorios, validaciones bloqueantes, avisos y momento de aplicación. |
| Informes/salidas | Informes, exportaciones, correos, documentos generados o salidas visibles. |
| Pruebas | Manifests/procedimientos de prueba si se conocen; en caso contrario, marcar explícitamente la evidencia pendiente. |
| Documentos de funcionalidad de apoyo | Enlaces a páginas de `docs/features/` que aportan evidencia técnica/de regresión. |
| Puntos de entrada de fuente Access | Formularios, clases, módulos, informes o nombres de consultas inferidos o confirmados desde el inventario de fuente. |
| Historial release/UAT | Etiqueta UAT, etiqueta de release, commit, petición de calidad, pruebas y filas de estado. |
| Diagnóstico de regresión | Mapa basado en síntomas desde problema de negocio hasta funcionalidad de apoyo probable y siguiente acción. |
| Notas de migración web | Comportamiento que preservar y mecánicas legacy de Access que no copiar. |
| Preguntas abiertas | Incógnitas que requieren confirmación del product owner, equipo de calidad, desarrollador o UAT. |

## Semántica de confianza

| Confianza | Significado | Regla de cierre |
|---|---|---|
| `Verified-runtime` | El comportamiento del código está probado por una prueba Dysflow en verde. | Aceptable como evidencia de paso/release. |
| `Verified-static` | Se inspeccionó el código, pero aún no hay prueba en runtime que demuestre la regla. | Deuda temporal; crear una prueba antes de afirmar cobertura completa. |
| `Intended` | SDD, issue, PR o product owner indica que esto debería ocurrir. | Debe contrastarse con el código antes de trabajo de implementación o migración. |
| `Likely` | Inferido por nombres o por código/documentación circundante. | Necesita confirmación antes de apoyarse en ello. |
| `Divergent` | La intención y el código no coinciden. | Requiere revisión humana; tratar como riesgo o bug hasta resolverlo. |

## Modelo de tabla de trazabilidad de release

Usa esta tabla en cada página de capacidad. Enlaza las peticiones del equipo de calidad y el comportamiento de negocio con la evidencia exacta de release/UAT.

| Etiqueta UAT | Etiqueta release | Commit | Resumen del cambio | Petición de calidad | Pruebas | Estado |
|---|---|---|---|---|---|---|
| `PRUEBAS-###` | `release-YYYY-MM-DD` o pendiente | `<sha>` | Cambio visible para negocio | Issue GitHub / petición de calidad / nota UAT | Manifest o evidencia manual UAT | `pending` / `passed` / `failed` / `released` |

## Modelo de tabla de diagnóstico de regresiones

Usa esta tabla cuando una release posterior parezca haber perdido comportamiento. El objetivo es identificar qué capacidad de negocio, funcionalidad de apoyo o gate de verificación falta.

| Síntoma | Capacidad afectada | Funcionalidad de apoyo probable | Release donde pasó por última vez | Release donde falló | Evidencia | Siguiente acción |
|---|---|---|---|---|---|---|
| Lo que ve el usuario | Página/sección de capacidad | Documento de funcionalidad o hueco de funcionalidad pendiente | Etiqueta UAT/release + commit | Etiqueta UAT/release + commit | Prueba, nota UAT, captura, log o informe | Reejecutar pruebas, inspeccionar commits, crear/arreglar libro de funcionalidad o escalar pregunta de producto |

## Cómo añadir una capacidad

1. Ejecuta Gate 0: recuperar la intención existente de SDD/issue/PR y registrar la fuente.
2. Lee el código Access/VBA exportado como fuente de verdad del comportamiento.
3. Copia [`_template.md`](_template.md) a `docs/capabilities/<capability-key>.md`.
4. Rellena cada sección obligatoria de forma conservadora. Usa `Likely`, `Intended`, `Verified-static` o `Divergent` con honestidad.
5. Enlaza cada página conocida de `docs/features/` y manifest de prueba de apoyo.
6. Añade las pruebas que falten para reglas de negocio no cubiertas, o enuméralas explícitamente como obligaciones abiertas.
7. Añade o actualiza filas de trazabilidad de release a medida que se creen etiquetas UAT y producción.
8. Añade filas de diagnóstico de regresión para síntomas conocidos o áreas de riesgo.
9. Añade la nueva capacidad al índice anterior.
