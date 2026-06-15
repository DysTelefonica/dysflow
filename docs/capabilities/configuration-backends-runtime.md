# Capacidad: configuración, backends y runtime local

## §0 Identidad
- **ID de capacidad**: `CAP-CONFIG-BACKENDS`
- **Tier**: critical
- **Estado**: active / inventario documental inicial
- **Source**: hybrid
- **Responsable / autoridad de producto**: Pendiente de confirmación — soporte / administración técnica
- **Última verificación**: 2026-06-15 mediante inspección documental/estática; no se ejecutó Dysflow/Access
- **Confianza global**: mixta — existen pruebas/manifests, pero no se reejecutaron en esta tarea; promover a `Verified-runtime` solo tras reejecución contra el `staging` HEAD actual

## §1 Intención de negocio
- **Propósito**: Asegurar que la aplicación usa el backend correcto, separa pruebas/sandbox de producción, expone kill-switches de caché y conserva configuración local por usuario.
- **Usuarios / perfiles**: Soporte, administradores, desarrolladores/agentes IA, revisores UAT.
- **Problema que resuelve**: Evita leer/escribir datos reales por error, mezclar entornos o confiar en evidencias de pruebas contra un backend incorrecto.
- **Valor de negocio / por qué existe**: La trazabilidad UAT y la seguridad de datos dependen de enrutamiento backend determinista.
- **No-objetivos**: No define infraestructura Dysflow ni despliegue fuera de Access.
- **Origen de la intención**: OpenSpec/features de configuración, tests `BackendConfigPaths`, `KillSwitch`, `EstadoCatalogoBootstrap` y reglas locales del proyecto.
- **Referencia de tracker de origen**: Issues #1, #8, #20, #42, #47; Issue #67.

## §2 Contrato de comportamiento

### Escenarios (Dado / Cuando / Entonces)
- **DADO** que la aplicación está en modo test **CUANDO** `BackendActivo` sea PROD **ENTONCES** las pruebas deben forzar sandbox/local y no escribir producción.
- **DADO** una ruta local con usuario Windows anterior **CUANDO** se sanitiza configuración local **ENTONCES** la ruta se reescribe al `USERPROFILE` actual.
- **DADO** una ruta UNC o no local **CUANDO** se sanitiza **ENTONCES** no se modifica como ruta local de usuario.
- **DADO** que el kill-switch de caché cambia OFF/ON/OFF **CUANDO** se persiste en configuración **ENTONCES** la aplicación restaura el estado esperado.
- **DADO** que se inicializa catálogo de estados **CUANDO** el backend no es seguro **ENTONCES** la operación se bloquea.

### Reglas de negocio
| ID regla | Enunciado (pretendido) | Autoridad | ¿Aplicada en código? | Prueba | Confianza |
|---|---|---|---|---|---|
| BR-CFG-1 | Las pruebas E2E deben forzar `BackendSandbox` aunque `BackendActivo` sea PROD. | Manifest `tests.vba.e2e.json` | Sí según prueba registrada | `Test_E2E_EnvConfig_AplicaBackendActivo_Atomic`; no reejecutado | Verified-static |
| BR-CFG-2 | Las rutas locales de usuario Windows se anclan al `USERPROFILE` actual. | Tests issue-20 | Sí según manifest principal | `Test_BackendConfigPaths_*`; no reejecutado | Verified-static |
| BR-CFG-3 | Rutas actuales, no locales y UNC no se modifican indebidamente. | Tests issue-20 | Sí según manifest principal | `Test_BackendConfigPaths_*`; no reejecutado | Verified-static |
| BR-CFG-4 | El kill-switch de caché persiste cambios controlados y puede restaurarse. | `tests.vba.cache-readiness.json` | Sí según tests registrados | `Test_KillSwitch_*`; no reejecutado | Verified-static |
| BR-CFG-5 | `EstadoCatalogoBootstrap` bloquea backend PROD/unsafe y exige LOCAL/SANDBOX/STAGING seguros. | Código y tests issue-47 | Sí — `AssertSafeBackendForCatalogBootstrap` | `Test_EstadoCatalogo_ProductionGuard_BlocksUnsafe_Atomic`; no reejecutado | Verified-static |
| BR-CFG-6 | Backend routing, configuración de caché e indicadores deben ser auditables antes de UAT/release. | Estándar capability-doc | Parcial | FALTA → author via access-vba-tdd para diagnósticos de configuración end-to-end | Intended |

### Validaciones
- `BackendActivo` vacío, PROD o no reconocido debe bloquear operaciones peligrosas.
- Rutas con `prod`, `\` o `\datoste` son inseguras para bootstrap de catálogo.
- Sanitización de ruta no debe tocar UNC ni rutas no locales.
- Kill-switch debe restaurar estado para no contaminar otras pruebas.

### Transiciones de estado
- `Config local obsoleta` --(`LeeConfiguracionLocal`)--> `Rutas ancladas a usuario actual`.
- `Cache ON/OFF` --(`KillSwitch`)--> `Estado persistido y restaurable`.
- `Backend unsafe` --(`Bootstrap catálogo`)--> `Operación bloqueada`.

### Casos límite y de error
- La documentación no debe afirmar seguridad runtime si las pruebas no se han ejecutado contra staging actual.
- Configuración local y backend compartido no deben mezclarse con cache business state.

### Señales de aceptación / presencia
- Manifests de configuración/backend pasan en staging actual.
- Los diagnósticos indican backend real antes de cualquier prueba que toque datos.
- Toda operación write-controlled usa fixture/sandbox y teardown.

## §3 Mapa de implementación
- **Puntos de entrada de UI**: menús de configuración; formularios `Form0BDOpciones*`; capacidad operativa más que una pantalla única.
- **Puntos de entrada de código**: `Variables Globales`, `Entorno`, `Test_BackendConfigPaths`, `EstadoCatalogoBootstrap`, `Test_KillSwitch`, `Test_E2E_BateriaNC`, `CacheNCProyecto`, `ModuloCacheIndicadores`.
- **Datos afectados**: `TbConfiguracionBackends`, `TbConfiguracion`, tablas de catálogo/estado, rutas frontend/backend locales.
- **Salidas**: TempVars de backend, estado de caché, errores de guardia, diagnósticos de test.
- **Dependencias e integraciones**: todas las capacidades con datos, indicadores, cachés, release/UAT.
- **Sincronización fuente↔binario**: no comprobada; tarea solo documental.
- **Valoración de diseño**: los guards de backend y tests son buena base. Deben consolidarse como runbook de operación y no quedar dispersos entre globals y tests.

## §4 Receta de reconstrucción
1. Documentar fuente de verdad de `TbConfiguracionBackends`, `BackendActivo`, rutas locales y sandbox.
2. Mantener pruebas de ruta/kill-switch/backend como smoke obligatorio de cualquier UAT que toque datos.
3. Crear un diagnóstico de configuración que devuelva JSON con backend resuelto, modo, caché y seguridad.
4. No promover feature/capacidad si la evidencia procede de backend incorrecto.
5. Antes de usar una fila de release/UAT como evidencia, cruzarla con [`CAP-RELEASE-UAT-ROLLBACK`](release-uat-rollback-traceability.md): tag UAT, commit alcanzable, manifest citado y estado de backend deben pertenecer al mismo corte de `staging`.

## §5 Evidencia y trazabilidad
- **Tests**: `tests/tests.vba.e2e.json`, `tests/tests.vba.cache-readiness.json`, procedimientos `Test_BackendConfigPaths_*` en `tests/tests.vba.json`; no reejecutados en esta sesión documental. **Caveat de runner**: tests registrados pero no reejecutados en esta sesión documental; promover a `Verified-runtime` solo tras reejecución contra el `staging` HEAD actual. **Precondición para BR-UPN-1..6 y BR-XCUT-1..7**: BR-CFG-5 (`AssertSafeBackendForCatalogBootstrap`) y BR-CFG-6 (auditoría de routing/kill-switch/indicadores) deben estar verdes antes de ejecutar suites que toquen `TbUsuariosAplicaciones` / `m_ObjUsuarioConectado` o costuras de soporte.

| Elemento | Ref. tracker | Versión de staging (UAT) | Estado UAT | Release de producción | Fecha en producción | Nota |
|---|---|---|---|---|---|---|
| Sanitización rutas Windows | Issue #20 | Pendiente | pending | Pendiente | Pendiente | Registrado en manifest principal. |
| Backend sandbox en pruebas | Issue #8 / #10 | Pendiente | pending | Pendiente | Pendiente | `tests.vba.e2e.json`. |
| Kill-switch/cache readiness | Issue #42 | Pendiente | pending | Pendiente | Pendiente | Manifest dedicado. |
| Catálogo de estados seguro | Issue #47 | Pendiente | pending | Pendiente | Pendiente | Manifest/cache-readiness + tests principales. |

| Síntoma | Causa probable | Comprobación (Dysflow) | Ancla del documento |
|---|---|---|---|
| Pruebas tocan producción | Guard de backend roto | Reejecutar E2E backend routing | BR-CFG-1 |
| Ruta local apunta a otro usuario | Sanitizer roto | Reejecutar issue-20 | BR-CFG-2..3 |
| Caché no respeta OFF/ON | Kill-switch roto | Reejecutar cache-readiness | BR-CFG-4 |

## §6 Notas de migración web
- Convertir configuración de entorno en configuración explícita por despliegue, con protección contra producción en tests.
- Separar routing local de cachés/materialized read models.
- Exponer diagnóstico de entorno auditable antes de ejecutar pruebas o migraciones.
- No copiar rutas de usuario ni TempVars como configuración server-side.

## §7 Registro de confianza
| Hecho | Confianza | Evidencia | Fecha |
|---|---|---|---|
| Hay pruebas registradas para forzar sandbox aunque `BackendActivo=PROD`. | Verified-static | `tests/tests.vba.e2e.json` | 2026-06-15 |
| Hay pruebas registradas de sanitización de ruta Windows. | Verified-static | `tests/tests.vba.json` | 2026-06-15 |
| `EstadoCatalogoBootstrap` bloquea rutas/backend inseguros por código. | Verified-static | `src/modules/EstadoCatalogoBootstrap.bas` | 2026-06-15 |
| Existe un runbook único de configuración/backend para UAT. | Intended | Falta documento/procedimiento dedicado | 2026-06-15 |

**⚠️ Divergencias (intención SDD ≠ realidad del código)**
- Sin divergencia confirmada. Riesgo: la configuración está parcialmente probada, pero falta un contrato operativo único de backend antes de cada UAT.

**Deuda de runbook**
- Falta un procedimiento único que una esta capacidad con la trazabilidad de release/UAT: comprobar backend activo/sandbox, kill-switch, manifests de configuración y fila de release antes de afirmar evidencia `Verified-runtime` en otra capacidad.
