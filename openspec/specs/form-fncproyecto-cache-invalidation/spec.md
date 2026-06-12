# form-fncproyecto-cache-invalidation — Specification (Delta)

## Purpose

Contrato end-to-end de invalidación + refill + feedback disparado por `ComandoActualizarLista_Click` en `Form_FormNCProyectoGestion`. Cierra la brecha que #49 dejó: tras editar backend, lista filtrada y combos mostraban valores stale hasta cerrar/reabrir el form.

## ADDED Requirements

### Requirement: R1 — `RebuildNCProyectoListadoCache`

`CacheNCProyecto.bas` MUST exponer `RebuildNCProyectoListadoCache(ForceInvalidation As Long)`. `=0` borra filas de `TbCacheListadoNC` (scope proyecto) y regenera; `=1` salta delete y solo regenera stale. Usa `InvalidarCache` / `RegenerarRegistro` / `SincronizarCache`. Espejo de `RebuildNCAuditoriaListadoCache`.

| Scenario | Given (fixture) | When | Then (assert) |
|----------|-----------------|------|---------------|
| Cache off → no-op | `IsCacheEnabled=False` | `(0)` o `(1)` | retorna sin escribir en `TbCacheListadoNC` |
| ForceFull delete+regen | sandbox ON, 3 filas seed `IDProyecto=100` válidas; fuente con 5 NCs | `(0)` | conteo pre=3 post=5; todas `CacheValida=True` `FechaCache` actual; ninguna preexistente sobrevive |
| ForceStale solo stale | 3 filas `IDProyecto=200` (1 válida, 2 `CacheValida=False`) | `(1)` | válida intacta; 2 stale regeneradas; sin DELETE masivo |

### Requirement: R2 — `RefreshNCProyectoGestionCaches`

`NCProyectoGestionListadoHelper.bas` MUST exponer `RefreshNCProyectoGestionCaches(ByRef Error As String) As Boolean`. MUST llamar `RebuildNCProyectoListadoCache(0)`. True=éxito, False=`Error` poblado. Espejo de `RefreshNCAuditoriaGestionCaches`.

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Éxito | sandbox con cache sembrado y fuente consistente | invoca con cache ON | `True`; `Error=vbNullString`; cache regenerada |
| Falla propagada | backend sin `TbCacheListadoNC` | invoca | `False`; `Error` con mensaje primitiva; `Err` preservado para re-raise |

### Requirement: R3 — `Entorno.InvalidateCombosCache` encapsulado

`Entorno.cls` MUST exponer `InvalidateCombosCache()` (sin params). MUST asignar `Nothing` a `ColNCsProyecto`, `ColJuridicasDistintas`, `ColTipos`, `ColJefesProyecto`, `ColUsuariosCalidad`, `ColEstadosNC`. MUST NO exponer `Property Get/Set/Let` públicos. Próximo `EstablecerCombo*` repuebla lazy.

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Nulifica 6 colecciones | `m_ObjEntorno` con 6 colecciones inicializadas | `InvalidateCombosCache` | 6 refs internas = `Nothing`; sin Property Set público |
| Re-init lazy | colecciones nuleadas | invoca `EstablecerCombo*` | repuebla desde DB; combos con valores lookup actuales |

### Requirement: R4 — `ComandoActualizarLista_Click` secuencia

`Form_FormNCProyectoGestion.cls` MUST ejecutar: `Hourglass True` → `DoEvents` → `RefreshNCProyectoGestionCaches` → `m_ObjEntorno.InvalidateCombosCache` → `EstablecerCombos` → `lblEstado.Caption="Cache recargado"`+`Visible=True` → `ActualizarDatosFiltrados` → `ActualizarLista` → `lblEstado.Visible=False` → `Hourglass False`. `On Error GoTo EH` con cleanup único en `SALIR`.

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Happy path | form abierto, `lblEstado` oculto, combos cacheados | click | `Refresh=True`; `InvalidateCombosCache` antes de `EstablecerCombos`; combos repoblados; `lblEstado` visible con caption; `Visible=False` antes de SALIR; `Hourglass False` |
| Falla con cleanup | `Refresh…` retorna `False` | click | `Err.Raise` preserva contexto; `lblEstado` no se muestra; `Hourglass False` en SALIR |

### Requirement: R5 — Feedback `lblEstado = "Cache recargado"`

Form MUST setear `Caption="Cache recargado"` y `Visible=True` tras invalidación OK. MUST ocultar `Visible=False` antes del fin del handler. MUST NOT usar `Sleep` ni `Application.OnTime` bloqueante.

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Transición válida | invalidación OK, lista a repintar | observar `lblEstado` en handler | `Caption="Cache recargado"` `Visible=True` ≥1 ciclo antes de `ActualizarLista`; `Visible=False` antes de salir |
| Sin estado colgado | invalidación falla | ejecutar handler | `Visible` sin cambios; `Caption` no se setea |

## MODIFIED Requirements

### Requirement: R6 — Rename `ComandoActualizar_Click` → `ComandoActualizarLista_Click`

`Form_FormNCAuditoriaGestion.cls` MUST renombrar handler. `.form.txt` MUST actualizar mapeo Click del botón. Sin cambio funcional. (Previously: nombre inconsistente con propósito.)

| Scenario | Given | When | Then |
|----------|-------|------|------|
| Sin regresión | form compilado con `ComandoActualizar_Click` previo | rename + compila manual | botón dispara mismo handler; `.form.txt` referencia nombre nuevo; `Test_AuditListadoHelper_CacheOn_SourceContract_RED` sigue verde |

## Backend / Schema considerations

- `TbCacheListadoNC` ya existe (spec `audit-backend-list-cache`). NO se modifican columnas/índices/FKs/tipos.
- Writes usan primitivos `InvalidarCache` / `RegenerarRegistro` / `SincronizarCache` existentes. NO rutas SQL nuevas.
- Sandbox: `m_TestingMode=True` + `getdb()` → `NoConformidades_Datos_local_sandbox.accdb`. Fixtures en `TbProyectos`/`TbNoConformidades`/`TbCacheListadoNC` en orden FK; teardown por markers deterministas.

## Test scenarios

Manifest: `tests/tests.vba.proyecto-gestion-helper.json` (nuevo). Naming: `Test_<Code>_<Behavior>_Atomic`. Patrón `BeginTestSession`/`m_TestingMode`/`getdb()`/`AssertEquals`/JSON-string helpers. Cero lucky data: Arrange documenta filas sembradas con IDs/markers propios.

| # | Procedure | Verifica | Tag |
|---|-----------|----------|-----|
| T1 | `Test_ProyectoGestionHelper_CacheOff_NoOp_Atomic` | R1: cache off no escribe | `slice1, red, cache-off` |
| T2 | `Test_ProyectoListadoCache_RebuildForceFull_DeleteAndRegen_Atomic` | R1: pre=3 post=5 todas `CacheValida=True` | `slice2, red, rebuild-full` |
| T3 | `Test_ProyectoListadoCache_RebuildForceStale_OnlyStaleRegen_Atomic` | R1: válida intacta, 2 stale regen, sin DELETE | `slice2, red, rebuild-stale` |
| T4 | `Test_ProyectoGestionHelper_RefreshCache_TrueOnSuccess_Atomic` | R2: `True` `Error` vacío cache regen | `slice1, red, orchestrator` |
| T5 | `Test_ProyectoGestionHelper_RefreshCache_FalseOnError_Atomic` | R2: sin tabla → `False` `Error` poblado | `slice1, red, orchestrator-error` |
| T6 | `Test_Entorno_InvalidateCombosCache_NullsSixCollections_Atomic` | R3: 6 = `Nothing` sin Property Set | `slice2, red, encapsulacion` |
| T7 | `Test_Entorno_InvalidateCombosCache_LazyReinitOnEstablecer_Atomic` | R3: próximo `EstablecerCombo*` repuebla | `slice2, red, lazy-reinit` |
| T8 | `Test_ProyectoGestionForm_ActualizarLista_SequenceHappyPath_Atomic` | R4+R5: secuencia completa + feedback | `slice3, red, handler, feedback` |
| T9 | `Test_ProyectoGestionForm_ActualizarLista_RefreshError_RaiseAndCleanup_Atomic` | R4: `False` → `Err.Raise` cleanup | `slice3, red, handler-error` |
| T10 | `Test_AuditGestionForm_RenameHandler_NoRegression_Atomic` | R6: rename OK sin regresión | `slice4, red, rename` |

## Non-goals

- Cache de detalle por-NC (`TbCacheNC`).
- Hardening transaccional de `ActualizarDatosFiltrados` (#43).
- Extracción de `NCProyectoSeguimientoNCListado` (#54).
- Migración de schema en `TbCacheListadoNC` o tablas de lookup.
- Navegación UI, autenticación, reescritura amplia de `EstablecerCombo*`.
