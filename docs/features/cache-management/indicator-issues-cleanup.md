# indicator-issues-cleanup — caché compartida de indicadores e Issue #18 cleanup

> Relleno documental para GitHub issue [#67](https://github.com/DysTelefonica/No_conformidades/issues/67) desde el SDD archivado `2026-06-12-indicator-issues-cleanup`, manifests de test, historial git local y evidencia Dysflow reciente aportada por slices. Esta página es intencionadamente conservadora: no se declara verde el manifest completo porque timeoutea y aún hay divergencias funcionales.

## Estado

| Campo | Valor |
|-------|-------|
| **Current** | `active` / `mixed evidence` — comportamiento documentado con evidencia runtime por slices; 3 contratos divergentes previos (Issue18_GlobalCache + Issue38 + Issue50) resueltos el 2026-06-15; 1 caso sigue pendiente por anomalía runner/COM (`HRESULT 0x800706BE`) |
| **Last verified** | 2026-06-15 — evidencia Dysflow aportada por filtros/slices; esta actualización documental no ejecutó Access/VBA |
| **Manifest drift** | `known timeout` — `tests/tests.vba.indicadores-caracterizacion.json` tiene 55 procedimientos y timeoutea como conjunto; usar filtros/slices |
| **Staging reachability** | `partial / pending evidence` — `git merge-base --is-ancestor` local confirmó algunos commits base en `staging`; commits posteriores de Phase 3 existen en el historial local, pero no son ancestros de `staging`/`origin/staging` en este checkout |
| **TDD evidence** | `mixed` — múltiples slices `Verified-runtime`; no full manifest green; 3 contratos divergentes previos (Issue18_GlobalCache + Issue38 + Issue50) resueltos el 2026-06-15; 1 caso pendiente por anomalía runner/COM |
| **Last verified commit** | Pendiente de verificación contra el `staging` HEAD actual |
| **Last verified at** | 2026-06-15 |
| **Test evidence** | Actual por slices: `indicator-fast-counts` 5/5, `cache-materialized` 13/13, `audit-gestion-helper` 11/11, `Indicadores_` 11/11, `CacheIndicadoresMaterializado` 8/8, `CacheIndicadoresAuditoriaMaterializado` 3/3, slices Issue #18 listados debajo; no hay manifest completo verde |
| **Staging integration commit** | Pendiente de reconciliación; el archivo nombra `8cfb047` como cierre y `687a822` / `255e327` como docs de trazabilidad alcanzables desde `staging`, pero los SHA de implementación Phase 3 requieren reconciliación de alcance en este checkout |
| **Evidence updated at** | 2026-06-15 — documentación actualizada con evidencia aportada; sin ejecutar Access/VBA en esta tarea |

## Seguimiento de release

| Campo | Valor |
|-------|-------|
| **UAT status** | `pending` |
| **UAT tag** | Pendiente |
| **UAT date** | Pendiente |
| **UAT evidence** | Pendiente |
| **UAT tag history** | Pendiente |
| **Approved UAT tag** | Pendiente |
| **Production release tag** | Pendiente |
| **Production release commit** | Pendiente |
| **Production date** | Pendiente |
| **Rollback release tag** | Pendiente |

## Comportamiento de negocio

La familia indicator/cache cleanup implementa el comportamiento aclarado de Issue #18: la información de indicadores se materializa en tablas compartidas de caché backend para que usuarios de Proyecto y Auditoría puedan abrir buckets y vistas de detalle sin ejecutar consultas vivas de indicadores en el camino de lectura cache-first.

En términos de negocio:

- Una caché backend compartida representa el estado actual de indicadores para todos los usuarios conectados al mismo backend.
- La caché contiene suficiente detalle de NC/AC/AR/tareas para renderizar y filtrar buckets de indicadores, no solo recuentos resumen.
- Las lecturas se filtran en runtime por usuario conectado/responsable y dominio, para que cada usuario vea el trabajo relevante de Proyecto o Auditoría desde el dataset compartido.
- Los cambios correctos de NC, AC, AR o tarea refrescan solo el alcance de `IDNoConformidad` afectado inmediatamente después de que la escritura de negocio termine correctamente.
- La reconstrucción completa queda reservada a bootstrap, reparación o cambios globales de reglas/configuración; no es la ruta normal de escritura.
- Si la sincronización de caché falla tras una mutación correcta, el sistema debe hacer visible el fallo en lugar de afirmar que la caché está actualizada.

## Criterios de aceptación

- [x] La propiedad de caché backend es compartida: las filas de configuración/cabecera/detalle de caché viven en tablas backend dedicadas, mientras `TbConfiguracionBackends` y el enrutamiento de backend activo siguen siendo frontend/locales (`Issue18_BackendCacheSchema` 2/2, `CacheIndicadoresMaterializado` 8/8, `CacheIndicadoresAuditoriaMaterializado` 3/3).
- [x] Las filas de caché son suficientemente completas para buckets de Proyecto y Auditoría: detalle, dominio y campos de visualización están cubiertos por `Issue18_CargarDetalle` 2/2 e `Issue18_DetalleCompleto` 1/1; queda deuda de rendimiento por pruebas de ~122s.
- [x] Las lecturas runtime de buckets/detalle usan filas cacheadas en el camino cache-first según los slices `Issue18_CargarBucket` 2/2 e `Issue18_CargarDetalle` 2/2; no declarar manifest completo verde.
- [x] Las lecturas runtime filtran la caché compartida por usuario conectado/responsable y dominio: `Verified-runtime` el 2026-06-15. `Test_Issue18_GlobalCache_DosResponsables_DosDominios_Atomic` 1/1 tras arreglar la query global del propio test para sumar recuentos per-domain (`IDCacheIndicadorProyecto=1` + `IDCacheIndicadorProyecto=2`), esquivando un quirk de caché DAO/Jet con `IN (1, 2)` en `COUNT(*)` sin más predicados. Las aserciones por usuario (`QA_User` 3, `Otro_User` 2) ya pasaban; el total global de 5 filas se confirma sumando los dos dominios.
- [x] Los cambios de NC sincronizan solo el alcance de `IDNoConformidad` afectado (`Issue18_SincronizarNC` 3/3, `Issue18_NCWriteHook` 1/1 ~120s).
- [x] Los cambios de AC resuelven AC → NC y sincronizan solo la NC padre (`Issue18_ResolverNCDesde` 3/3, `Issue18_ACWriteHook` 1/1 ~114s).
- [x] Los cambios de AR/tarea resuelven AR/tarea → AC → NC y sincronizan solo la NC padre (`Issue18_ARWriteHook` 4/4; dos hooks ~117–123s).
- [ ] La reconstrucción completa es explícita y limitada a bootstrap/reparación/cambios globales: `Test_Issue18_ReconstruirTodo_Idempotent_Atomic` queda pendiente por anomalía runner/COM. La última ejecución devuelve `HRESULT 0x800706BE` tras ~58s; no es regresión funcional. La auditoría posterior no encontró operación Dysflow viva ni lock activo del frontend. No marcar como fallo de comportamiento hasta obtener un retry limpio.
- [ ] La sincronización post-escritura fallida se reporta/loguea y evita falso éxito: hooks pasan, pero falta prueba explícita de fallo post-escritura → FALTA → author via access-vba-tdd.
- [x] Los tests aportados son schema-first, fixture-first y sandbox-safe según slices `Fixture` 2/2 y familias Issue #18; no se debe confiar en datos lucky.
- [x] Proyecto, Auditoría y no regresión cross-domain están cubiertos: `Test_Issue18_GlobalCache_DosResponsables_DosDominios_Atomic` 1/1 con query per-domain (5 filas globales sumando Proyecto + Auditoría). `Test_Issue18_CargarDetalle_*` e `Test_Issue18_CargarBucket_*` Verified-runtime. `Test_Issue38_SeguimientoAuditoria` 1/1. Sin regresión cross-domain observada.

## Tests requeridos / evidencia actual

| Procedimiento / familia | Manifest | Estado |
|-----------|----------|--------|
| `Test_Issue18_BackendCacheSchema_*` | filtro `Issue18_BackendCacheSchema` en `tests/tests.vba.indicadores-caracterizacion.json` | Verified-runtime 2/2 |
| `Test_Issue18_*Fixture_*` | filtro `Fixture` en `tests/tests.vba.indicadores-caracterizacion.json` | Verified-runtime 2/2 |
| `Test_Issue18_SincronizarNC_*` | filtro `Issue18_SincronizarNC` en `tests/tests.vba.indicadores-caracterizacion.json` | Verified-runtime 3/3 |
| `Test_Issue18_ResolverNCDesde*` | filtro `Issue18_ResolverNCDesde` en `tests/tests.vba.indicadores-caracterizacion.json` | Verified-runtime 3/3 |
| `Test_Issue18_ReconstruirTodo_Idempotent_Atomic` | `tests/tests.vba.indicadores-caracterizacion.json` | Pendiente por tooling: última ejecución `HRESULT 0x800706BE` tras ~58s; no es regresión funcional, es caveat del runner/COM; auditoría posterior sin operación Dysflow viva ni lock frontend |
| `Test_Issue18_CargarBucket_*` | filtro `Issue18_CargarBucket` en `tests/tests.vba.indicadores-caracterizacion.json` | Verified-runtime 2/2; un test ~120s |
| `Test_Issue18_CargarDetalle_*` | filtro `Issue18_CargarDetalle` en `tests/tests.vba.indicadores-caracterizacion.json` | Verified-runtime 2/2; un test ~122s |
| `Test_Issue18_GlobalCache_DosResponsables_DosDominios_Atomic` | `tests/tests.vba.indicadores-caracterizacion.json` | Verified-runtime 1/1 (resuelto 2026-06-15): query global del test ajustada para sumar recuentos per-domain (`IDCacheIndicadorProyecto=1` + `IDCacheIndicadorProyecto=2`), esquivando un quirk de caché DAO/Jet con `IN (1, 2)` en `COUNT(*)` sin más predicados; `QA_User` 3 + `Otro_User` 2, total global 5 |
| `Test_Issue18_DetalleCompleto_CamposRequeridosUI_Atomic` | filtro `Issue18_DetalleCompleto` en `tests/tests.vba.indicadores-caracterizacion.json` | Verified-runtime 1/1 |
| `Test_Issue18_NCWriteHook_*` | filtro `Issue18_NCWriteHook` en `tests/tests.vba.indicadores-caracterizacion.json` | Verified-runtime 1/1; ~120s |
| `Test_Issue18_ACWriteHook_*` | filtro `Issue18_ACWriteHook` en `tests/tests.vba.indicadores-caracterizacion.json` | Verified-runtime 1/1; ~114s |
| `Test_Issue18_ARWriteHook_*` | filtro `Issue18_ARWriteHook` en `tests/tests.vba.indicadores-caracterizacion.json` | Verified-runtime 4/4; dos hooks ~117–123s |
| `Test_CacheIndicadoresMaterializado_*` Proyecto/Auditoría materialized cache family | `tests/tests.vba.cache-materialized.json`; filtros `CacheIndicadoresMaterializado`, `CacheIndicadoresAuditoriaMaterializado` | Verified-runtime 13/13 en manifest, 8/8 proyecto y 3/3 auditoría tras retry |
| `Test_Indicadores_AuditoriaFastCounts_RuntimeUsaConteos_Atomic` y fast counts relacionados | `tests/tests.vba.indicator-fast-counts.json` | Verified-runtime 5/5 |
| `Test_Issue38_SeguimientoProyecto_ActualizarModoProyecto_Contract` | filtro/procedimiento Issue #38 | Verified-runtime 1/1 (resuelto 2026-06-15): refactor de `src/forms/Form_FormNCProyectoSeguimiento.cls`; `ComandoActualizar_Click` ya no llama a `PintarIndicadores` directamente, fija `m_CargaInicialIndicadoresPendiente = True` y `Me.TimerInterval = 100`; el `.cls` referencia `NCProyectoSeguimientoHelper.CargarIndicadoresSeguimientoProyecto`. `OnTimer = "[Event Procedure]"` en el `.form.txt` (línea 369) ya estaba enlazado. |
| `Test_Issue50_SeguimientoProyecto_CargaDiferidaHelper_Contract` | filtro/procedimiento Issue #50 | Verified-runtime 1/1 (resuelto 2026-06-15): el mismo refactor añadió en `src/forms/Form_FormNCProyectoSeguimiento.cls` los flags privados `m_CargaInicialIndicadoresPendiente`, `m_CargandoIndicadores`, `m_UltimaDuracionIndicadores`; el sub `Form_Timer`; la programación del timer en `Form_Load`; la delegación al helper y la llamada al helper usando `p_DuracionSegundos:=m_UltimaDuracionIndicadores` para casar con la firma del helper. |
| `Test_Issue38_SeguimientoAuditoria` | filtro `Issue38_SeguimientoAuditoria` | Verified-runtime 1/1 |
| `Test_Issue38_ResetearColTareas` | filtro `Issue38_ResetearColTareas` | Verified-runtime 1/1 |
| `Test_CacheListado_ACAR_SearchPipeColumns_Atomic` / `Test_PipeFlatten_MissingTable_Logs_ACAR_Atomic` / `Test_NCProyectoOperaciones_ACAR_InvalidatesListing_Atomic` | `tests/tests.vba.cache-acar.json` | Cobertura adyacente de invalidación cache/listing; no es evidencia directa de cierre Issue #18 |
| `Test_KillSwitch_*` / `Test_E2E_KillSwitch_*` / `Test_EstadoCatalogo_CacheWarmup_UsesCatalogBackedState_Atomic` | `tests/tests.vba.cache-readiness.json` | Cobertura de readiness operativo / kill-switch / warm-up; no es evidencia directa de cierre Issue #18 |
| `Test_E2E_Cache_PrecalentarSincronizar_LogEvidence_Atomic` | `tests/tests.vba.cache-warmup.json` | Camino de evidencia de warm-up operador; no es evidencia directa de cierre Issue #18 |

## Última evidencia passing conocida

| Campo | Valor |
|-------|-------|
| **Date** | 2026-06-15 evidencia por slices Dysflow; la evidencia histórica de archivo sigue debajo para commits |
| **Commit** | La evidencia histórica referencia `276e2bc`, `834d0de`, `4d45de3`, `bcb87c6`, `cd9a327`, `2b025a6`, `7b7e613`, `bf76fa0`, `89b2226`, `9cbc9f8`, `a74a947`; ancla actual de staging pendiente de reconciliación |
| **Manifest** | `tests/tests.vba.indicadores-caracterizacion.json` by filters/slices; `tests/tests.vba.cache-materialized.json`; `tests/tests.vba.indicator-fast-counts.json`; `tests/tests.vba.audit-gestion-helper.json` |
| **Result** | Verified-runtime por los slices listados en `Tests requeridos / evidencia actual`; el manifest completo `tests/tests.vba.indicadores-caracterizacion.json` de 55 procedimientos timeoutea como conjunto; un test Issue #18 queda pendiente por anomalía runner/COM (`HRESULT 0x800706BE`); 3 contratos divergentes previos (Issue18_GlobalCache + Issue38 + Issue50) resueltos el 2026-06-15 |

## Commits de integración

| SHA | Mensaje | Ancestro de staging |
|-----|---------|---------------------|
| `b7eaa86` | `feat(issue-18): add shared cache config table and idempotent migration helper` | Yes — local `git merge-base --is-ancestor b7eaa86 staging` returned 0 on 2026-06-14 |
| `7f7d15f` | `docs(issue-18): document wu1 migration helper and pending phases` | Yes — local `git merge-base --is-ancestor 7f7d15f staging` returned 0 on 2026-06-14 |
| `276e2bc` | `feat(issue-18): ModuloCacheIndicadoresIssue18 — per-NC sync, AC/AR resolvers, full rebuild, read/filter API` | Yes — local `git merge-base --is-ancestor 276e2bc staging` returned 0 on 2026-06-14 |
| `c80f7bb` | `fix(issue-18): test helpers InsertHeaderEstado and InsertFixtureRow set required IDCacheConfig and Dominio` | Yes — local `git merge-base --is-ancestor c80f7bb staging` returned 0 on 2026-06-14 |
| `457eae1` | `test(issue-18): add indicadores-caracterizacion test plan` | Yes — local `git merge-base --is-ancestor 457eae1 staging` returned 0 on 2026-06-14 |
| `53a0e03` | `feat(issue-18): add PHASE 2.1-2.7 tests + extend main test plan` | Yes — local `git merge-base --is-ancestor 53a0e03 staging` returned 0 on 2026-06-14 |
| `834d0de` | `fix(issue-18): persist cache metadata in indicators` | Yes — local `git merge-base --is-ancestor 834d0de staging` returned 0 on 2026-06-14 |
| `4d45de3` | `feat(issue-18/3.4): cache-only indicator path — prevent legacy live-query fallback` | Pending / not ancestor of local `staging` or `origin/staging` in this checkout on 2026-06-14 |
| `bcb87c6` | `feat(issue-18/3.1-3.2): NC and AC write hooks for shared backend cache` | Pending / not ancestor of local `staging` or `origin/staging` in this checkout on 2026-06-14 |
| `cd9a327` | `feat(issue-18/3.3): AR write hooks for shared backend cache` | Pending / not ancestor of local `staging` or `origin/staging` in this checkout on 2026-06-14 |
| `2b025a6` | `fix(issue-18/3.3): correct InvalidAR test assertion to match resolver error message` | Pending / not ancestor of local `staging` or `origin/staging` in this checkout on 2026-06-14 |
| `7b7e613` | `fix(issue-18/3.4): pass usuario object to cache helpers (not .Nombre String)` | Pending / not ancestor of local `staging` or `origin/staging` in this checkout on 2026-06-14 |
| `bf76fa0` | `fix(issue-18/3.4): provide explicit test usuario in ReturnsCacheCounts/ReturnsDetailRows` | Pending / not ancestor of local `staging` or `origin/staging` in this checkout on 2026-06-14 |
| `89b2226` | `fix(issue-18/3.5): propagate Issue #18 sync error in CacheNCProyecto.InvalidarCache` | Pending / not ancestor of local `staging` or `origin/staging` in this checkout on 2026-06-14 |
| `9cbc9f8` | `docs(issue-18): verify Phase 3.4 cache-only runtime read path — 4/4 GREEN` | Pending / not ancestor of local `staging` or `origin/staging` in this checkout on 2026-06-14 |
| `a74a947` | `docs(issue-18): verify Phase 3.5 no-false-success on failed sync — 2/2 GREEN` | Pending / not ancestor of local `staging` or `origin/staging` in this checkout on 2026-06-14 |
| `687a822` | `docs(indicator-issues-cleanup): refresh reachability after staging ff-merge` | Yes — local `git merge-base --is-ancestor 687a822 staging` returned 0 on 2026-06-14 |
| `255e327` | `docs(closeout): audit open/closed issues vs origin/staging and origin/main` | Yes — local `git merge-base --is-ancestor 255e327 staging` returned 0 on 2026-06-14 |
| `8cfb047` | Archive/closure traceability commit referenced by archived SDD | Yes — local `git merge-base --is-ancestor 8cfb047 staging` returned 0 on 2026-06-14 |

## Estado de sync Access

- **Import method**: el archivo histórico registra importaciones Dysflow de módulos/clases de implementación y test; esta tarea documental no importó nada.
- **Manual compile**: el archivo histórico registra compilación manual por el usuario tras las importaciones; esta tarea no compiló ni pidió compilar.
- **verify_binary**: pendiente evidencia actual de paridad source/binary para esta familia de feature; no se ejecutó ninguna operación Dysflow/Access en esta actualización solo documental.

## Caveats de runner/MCP

- `proceduresJson` como array shorthand falló con `VBA_INVALID_TEST_PLAN: Test #1 must be an object`; workaround usado: `testsPath` + `filter`.
- El manifest completo `tests/tests.vba.indicadores-caracterizacion.json` devuelve `MCP error -32001: Request timed out`; no usarlo para afirmar rojo/verde funcional de todo el comportamiento.
- `Test_Issue18_ReconstruirTodo_Idempotent_Atomic` devuelve `HRESULT 0x800706BE` tras ~58s en la última ejecución; la auditoría posterior no encontró operación Dysflow viva ni lock activo del frontend. Marcar como evidencia pendiente, no fallo funcional. El error se encuadra como anomalía de runner/COM, no como regresión de la familia.
- Los hooks/lecturas lentos están verificados (`Verified-runtime`), pero sus duraciones ~114–123s son deuda de rendimiento y riesgo diagnóstico.

## Ancla de rollback

El ancla de rollback está pendiente de la reconciliación final de release staging/UAT.

Operativamente, el objetivo de rollback más seguro documentado es el estado de implementación pre-Issue-18 anterior al primer work unit de caché backend compartida (`b7eaa86`) o anterior al commit core de API de caché (`276e2bc`), según si el rollback debe retirar también el helper de esquema además del comportamiento runtime. Debe registrarse un SHA final de rollback tras reconciliar alcance de staging y etiquetado UAT.

## Reglas de negocio

- La caché compartida de indicadores es estado de negocio backend, no estado de sesión frontend.
- El enrutamiento backend y la selección sandbox/producción siguen siendo responsabilidad local del frontend (`TbConfiguracionBackends` no es configuración de caché).
- Proyecto y Auditoría son dominios de negocio separados y no deben fugar filas entre sus buckets.
- La caché debe soportar vistas de detalle, no solo recuentos del cuadro de mando.
- Las vistas específicas de usuario son filtros sobre filas de caché compartida, no snapshots persistentes separados por usuario.
- Las escrituras de negocio correctas deben ir seguidas de sincronización inmediata de caché para el alcance NC afectado antes de afirmar éxito.
- La sincronización de caché fallida debe ser visible para callers y logs; el éxito silencioso con caché obsoleta es inválido.
- La reconstrucción completa es excepcional y explícita: solo bootstrap, reparación o cambios globales de reglas/configuración.
- Semántica UI/dominio a preservar durante la migración: buckets, recuentos, filas de detalle, filtrado por responsable, separación Proyecto/Auditoría y camino cache-first sin live-query.
- Implicación de estado de datos: las tablas de caché son estado derivado/materializado, por lo que reconstruirlas está permitido cuando se solicita explícitamente, pero las tablas fuente de negocio siguen siendo autoritativas.

## Legacy que no copiar

- Filas de caché solo de recuentos que no pueden renderizar pantallas de detalle.
- Diseño de caché solo Proyecto que excluye indicadores de Auditoría.
- Snapshots persistentes por usuario en lugar de un dataset backend compartido filtrado en lectura.
- Invalidación lazy o reparación de lecturas obsoletas como modelo principal de frescura.
- Reconstrucción completa tras cada mutación individual de NC/AC/AR/tarea.
- Sincronización de caché fire-and-forget que registra un error pero sigue informando éxito de negocio.
- Propiedad frontend-local/session-memory para datos que deben compartirse entre usuarios.
- Tests que pasan porque existen datos previos en lugar de sembrar fixtures sandbox deterministas.
- Acoplamiento específico de Access como depender de que `m_ObjUsuarioConectado` esté inicializado en contextos de test headless.

## Notas de migración

Para una futura implementación web, preservar los contratos de negocio y sustituir las mecánicas específicas de Access por límites explícitos de servicio:

- Modelar la caché de indicadores como un modelo de lectura materializado compartido propiedad del servicio/base de datos backend.
- Mantener el enrutamiento de entorno/tenant/backend fuera de las tablas de caché materializada; no mezclar enrutamiento de despliegue con configuración de caché de negocio.
- Exponer APIs de lectura de caché para recuentos de bucket y filas de detalle con filtros explícitos: dominio, responsable/usuario, bucket key, estado/fecha y alcance NC afectado.
- Tratar las escrituras NC/AC/AR/tarea como comandos de dominio que publican o ejecutan refresco incremental inmediato de caché para la NC afectada.
- Hacer observable y transaccional el fallo de sync de caché desde la perspectiva del caller: no equivalente a `200 OK` si el contrato de escritura exige caché actual y el sync falló.
- Mantener la reconstrucción completa como comando de operador/reparación con logs de auditoría, no como camino normal de petición.
- Mantener dominios Proyecto y Auditoría separados en esquema/API aunque compartan infraestructura.
- Portar la disciplina de fixtures: los tests deben crear datos de dominio deterministas y afirmar cardinalidad, no depender de seed data similar a producción.
- Añadir observabilidad de antigüedad de caché, resultados de rebuild/sync y propagación de fallos de sync antes del cutover de migración.

## Decisiones abiertas

1. **Full manifest no verde**: mantener la estrategia por slices mientras `tests/tests.vba.indicadores-caracterizacion.json` timeoutee como conjunto.
2. **Reachability reconciliation pending**: resolver por qué los commits posteriores de Phase 3 están presentes en el historial local pero no son ancestros de `staging` / `origin/staging` local en este checkout, pese a que el texto archivado describe cierre vía staging.
3. **Divergencias funcionales previas resueltas el 2026-06-15**:
   - `Test_Issue18_GlobalCache_DosResponsables_DosDominios_Atomic`: query global del test ajustada para sumar recuentos per-domain (`IDCacheIndicadorProyecto=1` + `IDCacheIndicadorProyecto=2`), esquivando un quirk de caché DAO/Jet con `IN (1, 2)` en `COUNT(*)` sin más predicados. `Test_IndicadoresCaracterizacion.bas` línea 3389.
   - `Test_Issue38_SeguimientoProyecto_ActualizarModoProyecto_Contract` y `Test_Issue50_SeguimientoProyecto_CargaDiferidaHelper_Contract`: refactor de `src/forms/Form_FormNCProyectoSeguimiento.cls` alineado con el patrón de `Form_FormNCAuditoriaSeguimiento.cls` (flags privados, `Form_Timer`, programación del timer en `Form_Load`, delegación a `NCProyectoSeguimientoHelper.CargarIndicadoresSeguimientoProyecto` con `p_DuracionSegundos:=m_UltimaDuracionIndicadores`). `OnTimer = "[Event Procedure]"` en el `.form.txt` (línea 369) ya estaba enlazado. No hay regresión en `Test_Issue38_SeguimientoAuditoria`.
4. **Auditoría runtime follow-up**: mantener seguimiento de cobertura Auditoría/cross-domain porque web migration debe preservar aislamiento de dominio.
5. **Catalog linking**: esta página de feature existe pero aún no está enlazada desde `docs/features/README.md` u `openspec/REGRESSION-ANCHOR.md`; el follow-up de issue #67 debe añadir esos enlaces.

## Fuentes de evidencia

- GitHub issue [#67 — docs(features): complete feature-by-feature regression ledger](https://github.com/DysTelefonica/No_conformidades/issues/67)
- Archived SDD spec: [`openspec/changes/archive/2026-06-12-indicator-issues-cleanup/spec.md`](../../../openspec/changes/archive/2026-06-12-indicator-issues-cleanup/spec.md)
- Archived SDD design: [`openspec/changes/archive/2026-06-12-indicator-issues-cleanup/design.md`](../../../openspec/changes/archive/2026-06-12-indicator-issues-cleanup/design.md)
- Archived apply progress / evidence: [`openspec/changes/archive/2026-06-12-indicator-issues-cleanup/apply-progress.md`](../../../openspec/changes/archive/2026-06-12-indicator-issues-cleanup/apply-progress.md)
- Archived task traceability: [`openspec/changes/archive/2026-06-12-indicator-issues-cleanup/tasks.md`](../../../openspec/changes/archive/2026-06-12-indicator-issues-cleanup/tasks.md)
- Archived indicator-cache spec: [`openspec/changes/archive/2026-06-12-indicator-issues-cleanup/specs/indicator-cache/spec.md`](../../../openspec/changes/archive/2026-06-12-indicator-issues-cleanup/specs/indicator-cache/spec.md)
- Test manifest: [`tests/tests.vba.indicadores-caracterizacion.json`](../../../tests/tests.vba.indicadores-caracterizacion.json)
- Test manifest: [`tests/tests.vba.cache-materialized.json`](../../../tests/tests.vba.cache-materialized.json)
- Test manifest: [`tests/tests.vba.indicator-fast-counts.json`](../../../tests/tests.vba.indicator-fast-counts.json)
- Test manifest: [`tests/tests.vba.cache-acar.json`](../../../tests/tests.vba.cache-acar.json)
- Test manifest: [`tests/tests.vba.cache-readiness.json`](../../../tests/tests.vba.cache-readiness.json)
- Test manifest: [`tests/tests.vba.cache-warmup.json`](../../../tests/tests.vba.cache-warmup.json)

## Gate documental post-test

> **Regla**: la integración no está terminada hasta actualizar esta sección. Tras integrar en staging y pasar tests, actualizar los campos de Estado antes de declarar el trabajo completo.

| Paso | Acción | Hecho |
|------|--------|------|
| 1 | Tests pass contra el `staging` HEAD actual | [ ] mixed: slices pasan, full manifest timeoutea, 3 contratos divergentes previos resueltos 2026-06-15, 1 caso pendiente por anomalía runner/COM (`HRESULT 0x800706BE`) |
| 2 | `last_verified_commit` actualizado con SHA actual | [ ] pendiente de fresh run |
| 3 | `last_verified_at` actualizado con fecha ISO | [x] 2026-06-15 |
| 4 | `test_evidence` actualizado con manifest + pass/total | [x] actualizado por slices; no full manifest green |
| 5 | `staging_integration_commit` actualizado con SHA de merge | [ ] pendiente de reachability reconciliation |
| 6 | `evidence_updated_at` actualizado tras fresh evidence | [x] 2026-06-15 |
| 7 | Estado de feature refleja estado actual | [x] mixed evidence; 3 contratos divergentes resueltos 2026-06-15, queda 1 caso pendiente por anomalía runner/COM y reachability |
