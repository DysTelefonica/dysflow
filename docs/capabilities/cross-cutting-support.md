# Capacidad: soporte transversal

## §0 Identidad
- **ID de capacidad**: `CAP-CROSS-CUTTING-SUPPORT`
- **Nivel**: standard
- **Estado**: active / documentación alineada con v2; evidencia mixta
- **Fuente**: hybrid (documentos de funcionalidad + inventario de fuente + convenciones operativas)
- **Responsable / autoridad de producto**: Confirmación pendiente — soporte de aplicación / servicios de plataforma
- **Última verificación**: 2026-06-15 migración solo documental; no se ejecutó Dysflow/Access
- **Confianza global**: mixed — partes de caché/listado tienen evidencia estática; runbooks de permisos/correo/enrutamiento backend están mayoritariamente sin probar

## §1 Intención de negocio
- **Propósito**: Mantener fiable la aplicación Access entre capacidades mediante acceso a datos compartido, frescura de caché, permisos, diagnósticos, configuración, correo, logging, serialización y evidencia de regresión.
- **Usuarios / personas**: Usuarios de negocio, operadores de soporte, revisores UAT, desarrolladores/agentes IA.
- **Problema que resuelve**: Las mecánicas compartidas pueden romper varios flujos de negocio; necesitan trazabilidad y pruebas explícitas en lugar de acoplamiento oculto.
- **Valor de negocio / por qué existe**: Servicios compartidos fiables reducen regresiones entre Proyecto, Auditoría, documentos, indicadores y releases.
- **No objetivos**: Esta página no sustituye a los documentos de capacidad de dominio; enlaza mecánicas de apoyo.
- **Fuente de intención**: Documentos de funcionalidad/inventario de fuente existentes; runbooks de permisos/correo/operador pendientes de confirmación.
- **Referencia tracker de origen**: Issue #67, Issue #39, Issue #18, cambios de caché de auditoría.

## §2 Contrato de comportamiento

### Escenarios (Given / When / Then)
- **GIVEN** un formulario de negocio necesita datos cacheados **WHEN** la caché está vacía/desactivada/obsoleta **THEN** el comportamiento de soporte debe evitar resultados falsamente vacíos/obsoletos.
- **GIVEN** se reconstruye la caché de auditoría **WHEN** se ejecuta la operación **THEN** los límites transaccionales impiden datos parciales.
- **GIVEN** falla la sincronización de indicadores **WHEN** una escritura de negocio tuvo éxito **THEN** el fallo es visible y no se afirma una caché actual falsa.
- **GIVEN** el enrutamiento/configuración backend es incorrecto **WHEN** se ejecutan pruebas/UAT **THEN** los diagnósticos identifican el desacuerdo antes de confiar en los datos.
- **GIVEN** se ejecuta una acción/correo/informe sensible **WHEN** aplican permisos o notificaciones **THEN** las reglas deben ser explícitas y estar probadas antes de afirmar release.

### Reglas de negocio
| ID de regla | Enunciado (previsto) | Autoridad | ¿Aplicada en código? | Prueba (evidencia) | Confianza |
|---|---|---|---|---|---|
| BR-XCUT-1 | El soporte de caché/repositorio debe preservar el comportamiento de dominio y no cambiar el significado de negocio. | Contrato de capacidad | Parcial | Documentos de funcionalidad existentes; hace falta reejecutar | Verified-static |
| BR-XCUT-2 | Los resultados de caché cargada-vacía son válidos y no fallos de caché. | Documento de funcionalidad cache-trust | Sí según docs | `tests/tests.vba.cache-e2e.json` existente; hace falta reejecutar | Verified-static |
| BR-XCUT-3 | La reconstrucción de caché de auditoría es atómica. | Documento de funcionalidad de auditoría | Sí según docs | Manifest de auditoría existente; hace falta reejecutar | Verified-static |
| BR-XCUT-4 | La caché compartida de indicadores filtra por usuario/responsable/dominio y expone fallos de sincronización. | Docs Issue #18 | Histórico / reciente pendiente | FALTA → crear mediante access-vba-tdd; reejecutar/añadir pruebas de staging actual | Intended |
| BR-XCUT-5 | La configuración backend enruta lecturas/escrituras al entorno previsto; las pruebas no dependen de datos accidentales. | Reglas de seguridad del proyecto | Parcial/nombres de fuente | FALTA → crear mediante access-vba-tdd; definir/ejecutar diagnósticos de configuración backend | Intended |
| BR-XCUT-6 | La matriz de permisos para cerrar/eliminar/rehabilitar/documento/acción/informe/configuración es explícita. | Autoridad de producto pendiente | Desconocido | FALTA → crear mediante `access-vba-tdd` tras confirmar matriz; añadir UAT cuando proceda. Cross-link: misma matriz pretendida por `users-permissions-navigation` BR-UPN-7 y `master-data-catalogues` BR-CAT-6 (cobertura CRUD de catálogos) | Intended |
| BR-XCUT-7 | El comportamiento de correo/logging requerido por negocio es explícito y comprobable. | Autoridad de producto pendiente | Desconocido | FALTA → crear mediante access-vba-tdd tras confirmar notificación/log; probar costuras | Intended |

### Validaciones
- Validez de esquema/frescura de caché antes de vistas respaldadas por caché.
- Filtros de dominio/usuario en caché de indicadores.
- Seguridad del destino backend antes de confiar en evidencia de pruebas/UAT.
- Comprobaciones de permisos para acciones sensibles pendientes.

### Transiciones de estado
- `Caché de proyecto vacía/desactivada` --(`Listado/lectura`)--> `Listado/lectura fallback legacy`.
- `Caché de auditoría obsoleta/ausente` --(`Reconstruir`)--> `Caché de auditoría reconstruida`.
- `Caché de indicadores actual` --(`Escritura de negocio`)--> `Alcance de NC afectada sincronizado`.
- `Backend/configuración incorrectos` --(`Diagnóstico`)--> `Problema de enrutamiento diagnosticado`.
- `Usuario sin permiso` --(`Acción sensible`)--> `Acción bloqueada/limitada` — pendiente de confirmación.

### Caminos límite y de error
- Datos de backend incorrecto invalidan conclusiones de pruebas/UAT.
- El comportamiento de permisos/correo/logging no puede inferirse de nombres de clases.
- El comportamiento de soporte visible desde formularios debe probarse mediante costuras helper/servicio.

### Señales de aceptación / presencia
- Las pruebas de caché/listado/auditoría/indicadores pasan en staging actual.
- Los diagnósticos de enrutamiento backend están documentados y son deterministas.
- La matriz de permisos y los eventos obligatorios de correo/log tienen pruebas o evidencia UAT.

## §3 Mapa de implementación
- **Puntos de entrada UI**: formularios de negocio en Proyecto/Auditoría; `Form_FormIndicadores`; `Form_FormCorreo`; rutas operativas de caché/preparación/warm-up pendientes.
- **Puntos de entrada de fuente**: `CacheNCService`, `CacheNCCrud`, `CacheNCCacheRepositorio`, `CacheNCProyecto`, `CacheTrustDiagnostics`, `NCAuditoriaListadoCache`, `NCAuditoriaGestionListadoHelper`, `NCProyectoGestionListadoHelper`, `ModuloCacheIndicadoresIssue18`, `ModuloCacheIndicadores`, `IndicadorRepositorio`, `IndicadorServicio`, `NCRepository`, `ACRepository`, `ARRepository`, `RiesgoRepositorio`, `Usuario`, `UsuarioAplicacionPermisos`, `Entorno`, `Variables Globales`, `Test_BackendConfigPaths`, `Correo`, `LogNCProyecto`, `LogNCAuditoria`, `JSONHelper`, `JsonConverter`.
- **Datos tocados**: cachés de proyecto/auditoría/listado, caché de indicadores, `TbConfiguracionBackends`, usuarios/permisos, registros de logs/correo.
- **Salidas**: diagnósticos/logs de caché, evidencia de preparación/warm-up, correos, libros de funcionalidad de regresión.
- **Dependencias e integraciones**: todas las capacidades de negocio.
- **Sincronización fuente↔binario**: no comprobada en esta tarea solo documental.
- **Evaluación de diseño (as-built vs ideal)**: las costuras de caché son cada vez más explícitas. Permisos/correo/enrutamiento backend necesitan pruebas/runbooks de primer nivel antes de la migración.

## §4 Receta de reconstrucción
1. Mantener documentos de soporte enlazados a las capacidades de negocio afectadas; no tratar las mecánicas de soporte como comportamiento de negocio por sí mismas.
2. Para cualquier comportamiento de soporte que toque datos, inspeccionar primero el esquema y crear fixtures sandbox deterministas.
3. Crear pruebas de enrutamiento backend, permisos, costuras de correo/log y soporte de indicadores en staging actual.
4. Las reglas de soporte visibles desde formularios deben probarse mediante costuras helper/servicio; pruebas directas de formulario solo para cableado.
5. Cambios futuros de código: importación Dysflow → compilación manual del usuario → pruebas Dysflow.

## §5 Evidencia y trazabilidad
- **Pruebas**: los documentos existentes citan form-helper, project-cache, cache-e2e, audit-helper, manifests históricos de indicadores/preparación/warm-up/fast-count. No hubo ejecución reciente en esta tarea. **Tampoco existe manifest dedicado a permisos/roles/navegación**; ver `users-permissions-navigation` §5 para el detalle de búsqueda y BR-UPN-1..6. La precondición común para ejecutar pruebas de cualquiera de estas áreas es `configuration-backends-runtime` BR-CFG-5 (`AssertSafeBackendForCatalogBootstrap`) y BR-CFG-6 (auditoría de routing/kill-switch/indicadores).

| Elemento (funcionalidad o arreglo) | Ref. tracker | Versión staging (UAT) | Estado UAT | Release de producción | Fecha en prod | Nota |
|---|---|---|---|---|---|---|
| Soporte de listado/caché de proyecto | Issue #67 | Pendiente | pending | Pendiente | Pendiente | Los documentos existentes citan `20b71f64`. |
| Confianza cache-first AC/AR/Riesgo | Issue #39 / Issue #67 | Pendiente | pending | Pendiente | Pendiente | Los documentos existentes citan `23af345` / `20b71f64`. |
| Soporte de caché/informe de auditoría | Cambio de caché de auditoría | Pendiente | pending | Pendiente | Pendiente | Los documentos existentes citan varios SHAs; traza de arreglo de informe pendiente. |
| Soporte compartido de indicadores | Issue #18 | Pendiente | pending | Pendiente | Pendiente | Evidencia histórica; ejecución reciente pendiente. |
| Matriz de permisos (cerrar/eliminar/rehabilitar/documento/acción/informe/configuración) | Pendiente | Pendiente | pending | Pendiente | Pendiente | Falta evidencia dedicada. Cross-link: `users-permissions-navigation` BR-UPN-7 (misma matriz). |
| Permisos/correo/enrutamiento backend | Pendiente | Pendiente | pending | Pendiente | Pendiente | Falta evidencia dedicada. |

| Síntoma | Causa probable | Comprobación (Dysflow) | Ancla documental |
|---|---|---|---|
| Listas de proyecto/auditoría obsoletas/en blanco | Regresión de soporte de caché | Reejecutar manifests helper/caché | BR-XCUT-1..3 |
| Recuentos del cuadro de mando obsoletos | Regresión de soporte de indicadores | Reejecutar manifests actuales de indicadores | BR-XCUT-4 |
| Pruebas/UAT ven datos incorrectos | Desacuerdo de enrutamiento backend | Ejecutar/crear diagnósticos de configuración backend | BR-XCUT-5 |
| Acción no autorizada permitida/bloqueada | Falta/regresión de matriz de permisos | Crear pruebas/UAT de permisos (cross-link `users-permissions-navigation` BR-UPN-7) | BR-XCUT-6 |
| Falta notificación requerida | Costura de correo indefinida/regresada | Confirmar regla + crear prueba de costura | BR-XCUT-7 |

## §6 Notas de migración web

### §6.1 Conservar (comportamiento de negocio que debe sobrevivir)
- La semántica cargado-vacío de las cachés de proyecto, auditoría e indicadores como resultado válido, no como fallo (BR-XCUT-1, BR-XCUT-2): la web debe distinguir "caché cargada con cero filas" de "caché no disponible", igual que `cache-e2e` y los diagnósticos de cache-trust ya lo prueban.
- La atomicidad de la reconstrucción de la caché de auditoría (BR-XCUT-3): si el sistema hace `Reconstruir` y falla a mitad, no debe quedar un dataset parcial: la web debe replicar el patrón transaccional de borrado-y-regeneración o un job con compensación.
- El filtrado de la caché compartida de indicadores por usuario/responsable y dominio (BR-XCUT-4): el backend de la web debe seguir aplicando filtros de autorización/dominio en cada lectura, no permitir que un usuario vea filas de otro responsable o de otro dominio.
- La regla de routing de backend expuesta al diagnóstico (BR-XCUT-5): si un test o UAT ejecuta contra el backend equivocado, el sistema debe detectarlo y reportarlo en vez de seguir adelante, igual que `AssertSafeBackendForCatalogBootstrap` ya hace para catálogos.
- La matriz de permisos por acción sensible (cerrar/eliminar/rehabilitar/documento/acción/informe/configuración) como contrato único (BR-XCUT-6): la web debe tener una sola fuente de verdad que aplique esa matriz; no debe haber reglas duplicadas por formulario.
- La obligatoriedad de notificar/loggear eventos sensibles (BR-XCUT-7): cualquier acción de cerrar/eliminar/rehabilitar debe dejar traza de quién, cuándo, desde qué IP, en qué estado quedó.

### §6.2 Transformar (mecanismo legacy que se reformula)
- Tratar `CacheNCService`, `CacheNCCrud`, `CacheNCCacheRepositorio`, `CacheNCProyecto`, `ModuloCacheIndicadoresIssue18`, `ModuloCacheIndicadores` como una sola familia de servicios: API REST de modelos de lectura con versión, invalidación explícita y reintento, no como módulos VBA acoplados.
- Reemplazar `NCAuditoriaListadoCache`, `NCAuditoriaGestionListadoHelper`, `NCProyectoGestionListadoHelper` por una capa de aplicación con la misma responsabilidad (lista/caché) pero expuesta como endpoints y con reintento en vez de formularios.
- Convertir `IndicadorRepositorio` y `IndicadorServicio` en servicios de lectura materializada (modelos de lectura backend) con su propio SLA de frescura y observabilidad, en lugar de llamadas in-process desde VBA.
- Sustituir `LogNCProyecto` / `LogNCAuditoria` (escritura de logs) por un appender de logs estructurados (JSON) a un bus de eventos, no por una tabla de Access.
- Mover `JSONHelper` / `JsonConverter` al backend de la web (no debe quedar código de serialización dentro de la UI ni de los servicios de lectura).
- Convertir `Usuario` y `UsuarioAplicacionPermisos` en un servicio de autorización con guardas declarativas, no como flags booleanos consultados en cada formulario.

### §6.3 NO copiar (deuda legacy de Access que no debe portarse)
- No migrar globals (`m_ObjEntorno`, `m_ObjUsuarioConectado`) ni TempVars como estado compartido entre request en la web: el estado de runtime vive en el request scope del framework, no en variables globales.
- No acoplar lógica de soporte a eventos de formulario (`Form_Load`, `Form_Open`): la inicialización de caché, de permisos y de diagnóstico debe ocurrir en el arranque del servicio o del request, no en eventos UI.
- No usar la cinta (Ribbon) ni la visibilidad de menús como control de seguridad real: la web debe aplicar permisos en el servidor y devolver `403` cuando corresponda, no ocultar UI como "control de acceso".
- No replicar el patrón "leer config desde `Variables Globales` cada vez" en la web: la configuración se lee una vez al arranque del proceso y se cachea de forma inmutable.
- No portar `TempVars` como mecanismo de comunicación entre formularios: la web usa rutas, query params y body de request, no variables globales.

### §6.4 Preguntas abiertas al product owner
- ¿La matriz de permisos (BR-XCUT-6) es la misma para Proyecto y Auditoría o se diferencia? Confirmar si las acciones sensibles (cerrar/eliminar/rehabilitar) tienen la misma matriz en ambos dominios.
- ¿Qué eventos generan notificación obligatoria (BR-XCUT-7)? ¿Basta con loggear o hay que enviar correo/Slack? Confirmar umbral y destinatarios.
- ¿La antigüedad de caché tolerable tiene un SLA formal? Hoy la web no expone un SLA explícito; ¿debe ser configurable por tipo de dato?
- ¿El `IndicadorServicio` debe seguir exponiendo las mismas filas de detalle que `Issue18_CargarDetalle` o se redefinen los campos de detalle? (BR-IND-2 adyacente)
- ¿La `matriz de permisos` debe ser declarativa (roles → acciones) o seguir siendo checks booleanos (`EsTecnico`, `EsAdministrador`)? ¿Qué cobertura quiere el equipo de seguridad?

## §7 Libro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| BR-XCUT-1 — El soporte de caché/repositorio debe preservar el comportamiento de dominio y no cambiar el significado de negocio. | Verified-static | Documentos de funcionalidad existentes; FALTA → reejecutar antes de promover | 2026-06-15 |
| BR-XCUT-2 — Los resultados de caché cargada-vacía son válidos y no fallos de caché. | Verified-static | `tests/tests.vba.cache-e2e.json` existente; FALTA → reejecutar | 2026-06-15 |
| BR-XCUT-3 — La reconstrucción de caché de auditoría es atómica. | Verified-static | Manifest de auditoría existente; FALTA → reejecutar | 2026-06-15 |
| BR-XCUT-4 — La caché compartida de indicadores filtra por usuario/responsable/dominio y expone fallos de sincronización. | Intended | FALTA → crear mediante access-vba-tdd; reejecutar/añadir pruebas de staging actual | 2026-06-15 |
| BR-XCUT-5 — La configuración backend enruta lecturas/escrituras al entorno previsto; las pruebas no dependen de datos accidentales. | Intended | FALTA → crear mediante access-vba-tdd; definir/ejecutar diagnósticos de configuración backend | 2026-06-15 |
| BR-XCUT-6 — La matriz de permisos para cerrar/eliminar/rehabilitar/documento/acción/informe/configuración es explícita. | Intended | FALTA → crear mediante `access-vba-tdd` tras confirmar matriz; cross-link `users-permissions-navigation` BR-UPN-7 y `master-data-catalogues` BR-CAT-6 | 2026-06-15 |
| BR-XCUT-7 — El comportamiento de correo/logging requerido por negocio es explícito y comprobable. | Intended | FALTA → crear mediante access-vba-tdd tras confirmar notificación/log; probar costuras | 2026-06-15 |
| El soporte de caché/listado de proyecto tiene pruebas documentadas. | Verified-static | Documentos de funcionalidad existentes; sin reejecución | 2026-06-15 |
| El soporte de caché de auditoría tiene pruebas documentadas. | Verified-static | Documento de funcionalidad de auditoría existente; sin reejecución | 2026-06-15 |
| El soporte de indicadores está vigente en staging. | Intended | Solo evidencia histórica | 2026-06-15 |
| El comportamiento de permisos/correo/enrutamiento backend está completamente especificado. | Intended | Faltan reglas/pruebas | 2026-06-15 |

**⚠️ Divergencias (intención SDD ≠ realidad del código)**
- Sin divergencia confirmada. Hueco sospechado: el inventario de clases de soporte sugiere capacidades de permisos/correo/enrutamiento backend que aún no tienen contrato de negocio ni pruebas runtime. La pieza de permisos es la misma matriz que `users-permissions-navigation` declara como intención en BR-UPN-7; mientras esa matriz no esté aprobada y probada, BR-XCUT-6 no puede ascender de `Intended`.
