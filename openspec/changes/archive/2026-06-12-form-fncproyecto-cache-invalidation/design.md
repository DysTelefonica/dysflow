# Design: form-fncproyecto-cache-invalidation

## Overview

Replicar el patrón #49 sobre `Form_FormNCProyectoGestion` cerrando la brecha
de feedback que ese fix dejó pendiente. El cambio agrega (a) un rebuild
transaccional del cache de listado (`TbCacheListadoNC`) disparado por el handler,
(b) un orquestador simétrico al audit en el helper, (c) un punto único de
invalidación de las 6 colecciones de `Entorno` consumido por lazy re-init de los
`EstablecerCombo*`, y (d) el feedback visible `lblEstado = "Cache recargado"`.
Como cierre cosmético se renombra el handler homólogo del lado audit
(`ComandoActualizar_Click` → `ComandoActualizarLista_Click`) para mantener
consistencia entre formas hermanas. La arquitectura NO introduce setters
públicos en `Entorno`: la nulificación se encapsula en un único método de
batch sobre variables `Private`.

## Architecture Decisions

| # | Decisión | Alternativa | Por qué |
|---|----------|-------------|---------|
| AD-1 | `RebuildNCProyectoListadoCache(Optional ByVal p_ForceInvalidation As Long = 0, Optional ByRef p_Error As String) As Boolean` | Firma con dos flags booleanos separados | Mantiene simetría con `RebuildNCAuditoriaListadoCache(p_IDAuditoria, p_Error)`; un único `Long` codifica el modo (0=full delete+regen, 1=stale-only regen) sin extender la signatura |
| AD-2 | El parámetro de scope es `p_ForceInvalidation` (0/1), no `p_IDProyecto` | Reusar firma del audit con `p_IDProyecto` | El cache `TbCacheListadoNC` es **específico de proyecto** por nombre de tabla; no existe la noción "scope por proyecto" en este dominio. Reusar la firma del audit introduce un parámetro sin semántica |
| AD-3 | `RefreshNCProyectoGestionCaches` SIEMPRE llama con `p_ForceInvalidation=0` | Permitir propagar el flag | El handler del form es el único caller; el flag=1 está en el contrato para T3 (test de stale-only) que lo invoca directo, pero el orquestador fija 0 para no permitir regen incremental disparado por UI |
| AD-4 | `Entorno.InvalidateCombosCache` nulifica **directamente** las 6 vars `Private`, sin Property Set | Exponer `Property Set` públicos para nulificar | AD-4 del R3 del spec: encapsular. Cero nuevos `Property Let/Get/Set` públicos. El método actúa como "batch nullifier" interno |
| AD-5 | El handler no usa `Sleep` ni `Application.OnTime`; el reset de `lblEstado.Visible = False` ocurre en el mismo handler, antes de `Exit Sub` | `Application.OnTime` para auto-ocultar | El spec R5 prohíbe explícitamente bloqueos. El ciclo de "visible breve" lo aprovecha el usuario por percepción; el repaint de la lista sucede justo después. La transición `Visible=True → ActualizarDatosFiltrados → ActualizarLista → Visible=False` ocurre en el mismo tick de UI |
| AD-6 | Una única entrada `SALIR` con cleanup `Hourglass False` + `DoEvents` | Múltiples `Exit Sub` con cleanup duplicado | El spec R4 lo fija. Patrón idéntico al audit (líneas 33-36 de `Form_FormNCAuditoriaGestion.cls`) |
| AD-7 | Tests fixture-first con `BeginTestSession` / `m_TestingMode` / `getdb()` + sandbox `NoConformidades_Datos_local_sandbox.accdb` | Tests sobre backend productivo | Regla dura del proyecto (`AGENTS.md` global y local): cero lucky data, FK-order seed, teardown por markers deterministas |
| AD-8 | Slices 1-4 con chained PRs (≤400 líneas c/u) | Un solo PR monolítico | El forecast de helpers + tests + handler + rename + verificación supera las 400 líneas; el budget lo fija el `AGENTS.md` global (`review_budget_lines: 400`) |
| AD-9 | Rename en `.cls`; `.form.txt` requiere verificación (no edición) del mapeo de evento | Renombrar también el control en `.form.txt` | El form.txt del audit usa `OnClick ="[Event Procedure]"` (línea 539). Access resuelve el handler por convención `<ControlName>_Click`; el rename en `.cls` ya redirige. NO tocar `Name ="ComandoActualizar"` (es el control) |

## Module Changes

### 1. `src/modules/CacheNCProyecto.bas` — `RebuildNCProyectoListadoCache`

Patrón espejado de `RebuildNCAuditoriaListadoCache` (NCAuditoriaListadoCache.bas:210-255),
adaptado a `TbCacheListadoNC` (`NOMBRE_TABLA_LISTADO`) y `TbNoConformidades`.
La función es **adyacente** a `SincronizarCache` (línea 2134) para mantener
proximidad lógica con el resto del módulo de cache.

**Firma:**

```vb
Public Function RebuildNCProyectoListadoCache( _
    Optional ByVal p_ForceInvalidation As Long = 0, _
    Optional ByRef p_Error As String _
) As Boolean
```

**Algoritmo (espejo del audit):**

1. `On Error GoTo EH`; `p_Error = ""`.
2. `getdb()` → `db`; `DBEngine.Workspaces(0)` → `wrk`.
3. `EnsureCacheSchemaReadiness(p_Error)` — existente, garantiza `TbCacheListadoNC` con schema listo.
4. Guard `IsCacheEnabled()`: si `False`, retorna `True` sin escribir (cumple R1 escenario "Cache off → no-op"). Esto **diverge** del audit (que no chequea flag) porque la convención de proyecto lo exige; documentado como comentario inline.
5. `wrk.BeginTrans`; `transactionStarted = True`.
6. Branch por `p_ForceInvalidation`:
   - `= 0` (full): `DELETE FROM TbCacheListadoNC` + loop de regeneración desde `TbNoConformidades WHERE Nz(Borrado,False)=False`.
   - `= 1` (stale-only): `UPDATE TbCacheListadoNC SET CacheValida=False, FechaCache=Now()` + loop solo de IDs donde `CacheValida=False` post-update.
7. Loop de regeneración: lee `SELECT ID FROM TbNoConformidades WHERE Nz(Borrado,False)=False ORDER BY ID`; por cada ID llama `RegenerarRegistro(CStr(id), errReg)`. Si falla → `GoTo RollbackRebuild`.
8. `wrk.CommitTrans`; `transactionStarted = False`; retorna `True`.
9. `CleanExit:` rollback si `transactionStarted`, libera `rs`/`wrk`/`db`.
10. `RollbackRebuild:` setea `p_Error = "RebuildNCProyectoListadoCache: " & p_Error` y cae a `CleanExit`.
11. `EH:` `p_Error = "RebuildNCProyectoListadoCache: " & Err.Description`; `Resume CleanExit`.

**Primitivas reusadas (todas existentes, no se duplican):**

- `IsCacheEnabled()` (línea 47)
- `EnsureCacheSchemaReadiness(p_Error)` (línea 122)
- `InvalidarCache(p_IDNC, "", p_Error)` (línea 690) — sólo rama stale-only
- `RegenerarRegistro(p_IDNC, p_Error)` (línea 2094) — para el loop
- `SincronizarCache(p_Error)` (línea 2134) — alternativa de recovery mencionada en Rollback Plan

### 2. `src/modules/NCProyectoGestionListadoHelper.bas` — `RefreshNCProyectoGestionCaches`

Sub espejada de `RefreshNCAuditoriaGestionCaches` (NCAuditoriaGestionListadoHelper.bas:204-218).
Va al **final del módulo**, después de `LogFallback` (línea 447), para mantener
proximidad con la familia de helpers de cache/refresh.

**Firma:**

```vb
Public Sub RefreshNCProyectoGestionCaches(Optional ByRef p_Error As String)
```

**Algoritmo:**

1. `On Error GoTo errores`; `p_Error = ""`.
2. `If Not TableExists(NOMBRE_TABLA_LISTADO) Then LogFallback "Cache refresh skipped: TbCacheListadoNC not available"`.
3. `ElseIf Not RebuildNCProyectoListadoCache(0, p_Error) Then Err.Raise 1000`.
4. `Exit Sub`.
5. `errores:` si `Err.Number <> 1000`, `p_Error = "El método RefreshNCProyectoGestionCaches ha devuelto el error: " & Err.Description`.

**Diferencias explícitas con el audit (y por qué):**

- La constante es `NOMBRE_TABLA_LISTADO` (pública en `CacheNCProyecto.bas`), no `AUDIT_CACHE_TABLE` local.
- Se llama con `0` fijo (per AD-3).
- `LogFallback` reusa el existente (línea 435) — la constante `LOG_OPERATION_FALLBACK = "FormCacheFallback"` ya existe.

### 3. `src/classes/Entorno.cls` — `InvalidateCombosCache`

Método público nuevo, ubicado **después de la última `Property Get` de la
familia de combos** (alrededor de la línea 2587, junto a `Property Set ColTipos`).
Cero `Property Get/Set/Let` nuevos.

**Firma:**

```vb
Public Sub InvalidateCombosCache()
    Set m_objColNCsProyecto = Nothing
    Set m_ObjColJuridicasDistintas = Nothing
    Set m_objColTipos = Nothing
    Set m_objColJefesProyecto = Nothing
    Set m_objColUsuariosCalidad = Nothing
    Set m_ObjColEstadosNC = Nothing
End Sub
```

**Mapeo `Property Get` → variable `Private` (extraído del grep):**

| Property Get | Variable Private | Línea declaración |
|---|---|---|
| `ColUsuariosCalidad` | `m_objColUsuariosCalidad` | 20 |
| `ColNCsProyecto` | `m_objColNCsProyecto` | 45 |
| `ColJuridicasDistintas` | `m_ObjColJuridicasDistintas` | 47 |
| `ColTipos` | `m_objColTipos` | 52 |
| `ColEstadosNC` | `m_ObjColEstadosNC` | 57 |
| `ColJefesProyecto` | `m_objColJefesProyecto` | 73 |

**Decisiones de encapsulación (AD-4):**

- Sin `Set` en el método: `Set m_xxx = Nothing` libera la referencia al `Scripting.Dictionary` interno; el siguiente `Property Get ColX` que se invoque verá la var en `Nothing` y disparará la rama de lazy-init existente (líneas 1247, 1681, 1739, 1773, 2572 del `Entorno.cls`).
- No expone `Property Set` nuevos: los tres existentes (`ColNCsProyecto`, `ColJuridicasDistintas`, `ColTipos`) **se conservan** porque la auditoría los usa; no se agregan más.
- `ColAuditorias` y `ColNCsAuditoria` **NO** se invalidan aquí: pertenecen al dominio audit y siguen siendo nulificados por el handler audit vía sus `Property Set` existentes (líneas 29-30 de `Form_FormNCAuditoriaGestion.cls`).

### 4. `src/forms/Form_FormNCProyectoGestion.cls` — `ComandoActualizarLista_Click` (reemplazo)

Reemplaza las líneas 446-451 actuales. El handler cambia de `On Error Resume Next`
a `On Error GoTo EH` con cleanup único. La signatura `Public Sub` se mantiene
porque el botón dispara por convención `<ControlName>_Click` (el control es
`ComandoActualizarLista` ya — verificar en el `.form.txt`; el grep no lo
encontró explícitamente así que se asume que el rename del control es **previo**
o que el `ComandoActualizarLista_Click` actual ya está conectado).

**Pseudocódigo (referencial, no literal):**

```vb
Public Sub ComandoActualizarLista_Click()
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""

    RefreshNCProyectoGestionCaches p_Error:=m_Error
    If m_Error <> "" Then Err.Raise 1000

    m_ObjEntorno.InvalidateCombosCache
    EstablecerCombos

    With Me.lblEstado
        .Caption = "Cache recargado"
        .Visible = True
    End With

    ActualizarDatosFiltrados
    ActualizarLista

    Me.lblEstado.Visible = False
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub

errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoActualizarLista_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub
```

**Transiciones de `lblEstado` (verificables por T8):**

1. Antes del click: `Visible = False` (estado actual del form, verificado por T8 Arrange).
2. Tras `EstablecerCombos`: `Caption = "Cache recargado"`, `Visible = True`.
3. Tras `ActualizarDatosFiltrados` + `ActualizarLista`: `Visible = False`.
4. Si `RefreshNCProyectoGestionCaches` falla: `lblEstado` nunca se muestra.

**Comparación con `Form_FormNCAuditoriaGestion.ComandoActualizar_Click`** (líneas 18-47):
la estructura es **idéntica** salvo el agregado de feedback `lblEstado`. El
spec R5 obliga el feedback; el audit ya tenía `lblEstado` declarado (línea 58
del cls audit) pero no lo usaba en este handler — esto es el carry-forward
explícito del issue #48.

### 5. `src/forms/Form_FormNCAuditoriaGestion.cls` + `.form.txt` — Rename handler

**En `Form_FormNCAuditoriaGestion.cls`:**

- Línea 18: `Private Sub ComandoActualizar_Click()` → `Private Sub ComandoActualizarLista_Click()`.
- Línea 41: `m_Error = "Al ComandoActualizar_Click se ha producido..."` → `m_Error = "Al ComandoActualizarLista_Click se ha producido..."`.
- Línea 3196 (en el `.form.txt` línea análoga del módulo de clase embebido en el form): misma sustitución.
- Cualquier otro call site (búsqueda por grep en `src/`): `grep -rn "ComandoActualizar_Click" src/forms/Form_FormNCAuditoriaGestion*` debe retornar **cero** hits tras el cambio.

**En `Form_FormNCAuditoriaGestion.form.txt`:**

- Línea 539: `OnClick ="[Event Procedure]"` — **NO SE TOCA**. Access resuelve el handler por convención `<ControlName>_Click`; el rename en `.cls` es suficiente.
- Línea 537: `Name ="ComandoActualizar"` — **NO SE TOCA** (es el nombre del control, no del handler). Renombrar el control requeriría además renombrar `Me.ComandoActualizar` en el cls y propagarlo a otros call sites, lo cual es **fuera de scope** del rename cosmético R6.
- Verificación post-rename (T10): abrir el form compilado, clickear el botón, confirmar que dispara el handler renombrado (assertable vía `Debug.Print` capturado o contador en `m_ObjEntorno`).

## Data Flow

    User click "Actualizar"
        │
        ▼
    ComandoActualizarLista_Click (Form_FormNCProyectoGestion.cls)
        │
        ├─► DoCmd.Hourglass True / DoEvents
        │
        ├─► RefreshNCProyectoGestionCaches
        │       │
        │       └─► TableExists(TbCacheListadoNC)?
        │               │ sí
        │               ▼
        │           RebuildNCProyectoListadoCache(0)
        │               │
        │               ├─► EnsureCacheSchemaReadiness
        │               ├─► wrk.BeginTrans
        │               ├─► DELETE FROM TbCacheListadoNC
        │               ├─► rs = SELECT ID FROM TbNoConformidades WHERE Nz(Borrado,False)=False
        │               ├─► For each ID:
        │               │       RegenerarRegistro(id) ──► GenerarCacheCompleto + UpsertListado
        │               ├─► wrk.CommitTrans (o Rollback en error)
        │               └─► return True/False + p_Error
        │
        ├─► m_ObjEntorno.InvalidateCombosCache
        │       └─► Set m_objColNCsProyecto / m_ObjColJuridicasDistintas / m_objColTipos /
        │            m_objColJefesProyecto / m_objColUsuariosCalidad / m_ObjColEstadosNC = Nothing
        │
        ├─► EstablecerCombos  (lazy re-init: cada Property Get ColX repuebla desde DB)
        │
        ├─► Me.lblEstado.Caption = "Cache recargado" / Visible = True
        │
        ├─► ActualizarDatosFiltrados (usa GetListadoFiltradoSQL → cache recién regenerado)
        ├─► ActualizarLista          (pinta m_ColFiltrado)
        │
        ├─► Me.lblEstado.Visible = False
        │
        └─► DoCmd.Hourglass False / DoEvents

## File Changes

| Archivo | Acción | Descripción |
|---|---|---|
| `src/modules/CacheNCProyecto.bas` | Modify | +`RebuildNCProyectoListadoCache(p_ForceInvalidation, p_Error)` (~50 líneas) adyacente a `SincronizarCache` |
| `src/modules/NCProyectoGestionListadoHelper.bas` | Modify | +`RefreshNCProyectoGestionCaches(p_Error)` (~15 líneas) al final del módulo |
| `src/classes/Entorno.cls` | Modify | +`InvalidateCombosCache()` (~10 líneas) tras la familia de combos |
| `src/forms/Form_FormNCProyectoGestion.cls` | Modify | Reemplazo del handler `ComandoActualizarLista_Click` (~30 líneas) |
| `src/forms/Form_FormNCAuditoriaGestion.cls` | Modify | Rename de handler (2 ocurrencias en strings de error) |
| `src/forms/Form_FormNCAuditoriaGestion.form.txt` | Verify-only | Sin edición; verificación post-rename de que `OnClick ="[Event Procedure]"` resuelve al nuevo handler |
| `src/modules/Test_NCProyectoGestionListadoHelper.bas` | New | 10 procedimientos de test + helpers (~350 líneas) |
| `tests/tests.vba.proyecto-gestion-helper.json` | New | Manifest con 10 entradas (~70 líneas) |

## Interfaces / Contracts

**`CacheNCProyecto.bas`:**

```vb
Public Function RebuildNCProyectoListadoCache( _
    Optional ByVal p_ForceInvalidation As Long = 0, _
    Optional ByRef p_Error As String _
) As Boolean
```

Contrato: `p_ForceInvalidation=0` → delete + regen full; `=1` → update a stale + regen incremental. Retorna `True` si éxito, `False` + `p_Error` poblado si falla. Si `IsCacheEnabled()=False` retorna `True` sin escribir.

**`NCProyectoGestionListadoHelper.bas`:**

```vb
Public Sub RefreshNCProyectoGestionCaches(Optional ByRef p_Error As String)
```

Contrato: si `TbCacheListadoNC` no existe → `LogFallback` y termina; si `RebuildNCProyectoListadoCache(0)` falla → `Err.Raise 1000` y propaga; si OK → `p_Error` queda `""`.

**`Entorno.cls`:**

```vb
Public Sub InvalidateCombosCache()
```

Contrato: asigna `Nothing` a las 6 vars `Private` listadas. No retorna. No expone accessors públicos nuevos. No dispara lazy init (sólo nulifica).

**`Form_FormNCProyectoGestion.cls`:**

```vb
Public Sub ComandoActualizarLista_Click()
```

Contrato: orquestador UI. Secuencia fija documentada en §"Module Changes > 4". En error, `Err.Raise 1000` preserva contexto y `SALIR` único limpia Hourglass.

## Test Fixture Setup

**Módulo de test:** `src/modules/Test_NCProyectoGestionListadoHelper.bas`
**Manifest:** `tests/tests.vba.proyecto-gestion-helper.json`

**Patrón Arrange/Act/Assert (idéntico al audit, ver `Test_NCAuditoriaGestionListadoHelper.bas`):**

- **Sandbox:** `m_TestingMode = True` al inicio; `BeginTestSession` engancha sandbox `NoConformidades_Datos_local_sandbox.accdb` vía `getdb()`.
- **Seed por test:** cada test inserta **explícitamente** sus filas controladas con IDs deterministas. Convenciones:
  - `TEST_ID_NC_*` con sufijos `_T1` a `_T10` (uno por test, evita colisiones).
  - `TEST_ID_PROYECTO_*` constantes con sufijos `_T1`/`T2`/`T3` (vía `IDProyecto=100`, `200`, `300` por convención del spec, marcados con prefijo `FNCP-T?` en `Codigo` o `Descripcion`).
  - Orden FK: `TbProyectos` → `TbNoConformidades` → `TbCacheListadoNC`. Padres primero.
- **Teardown por marker:** cada test borra por `IDNoConformidad` (Long) o por `IDProyecto` (Long), en orden inverso al seed, sólo las filas que él insertó. NUNCA `SELECT TOP 1`, NUNCA "verificar que existe".
- **Helpers compartidos locales al módulo:** `TableExistsInDb(p_Db, p_TableName)`, `DeleteByIDNoConformidad(p_Db, p_ID)`, `SeedProyecto(p_Db, p_ID, p_Marker)`, `SeedNoConformidad(p_Db, p_IDNC, p_IDProyecto, p_Marker)`, `SeedCacheRow(p_Db, p_IDNC, p_Valida)`.
- **Aserciones:** `AssertEquals(expected, actual, p_Message)`, `AssertTrue(cond, p_Message)`, `AssertErrorContains(p_Error, p_Substring)`. Salida JSON-string para parsing por harness.

**Estrategia para T8/T9 (handler form):** los tests NO instancian el form
sintéticamente. La estrategia es **orquestador de helpers** + **invocación
directa del handler contra el form abierto**:

- T8 (happy path): el form `Form_FormNCProyectoGestion` ya está abierto en
  sesión de test (preparado por el harness). El test (a) seedea 5 NCs de
  prueba en sandbox, (b) llama `Forms("Form_FormNCProyectoGestion").ComandoActualizarLista_Click`,
  (c) assertea: `lblEstado.Caption = "Cache recargado"`, `lblEstado.Visible = True`
  en el momento inmediatamente posterior (capturando antes de `ActualizarLista`),
  `lblEstado.Visible = False` al final, `TbCacheListadoNC` regenerada con 5
  filas, `m_ObjEntorno.ColNCsProyecto` re-inicializado (no es `Nothing` después
  de `EstablecerCombos`).
- T9 (falla): (a) dropea `TbCacheListadoNC` en sandbox, (b) llama el handler,
  (c) assertea: `Err.Raise 1000` se propagó, `lblEstado.Visible` no cambió,
  `Hourglass` quedó en `False`.

Esta estrategia evita mockear el form; en su lugar se aprovecha que la sesión
de test ya tiene el form abierto. La fixture es **el estado del form + el
estado del backend**; ambos se controlan por seed explícito.

## Test Module Structure

| # | Procedimiento | Verifica | Setup clave | Act | Asserts clave | Teardown |
|---|---|---|---|---|---|---|
| T1 | `Test_ProyectoGestionHelper_CacheOff_NoOp_Atomic` | R1 (cache-off no-op) | Setear `CacheHabilitada=False` en `TbConfiguracion` para sandbox | `RebuildNCProyectoListadoCache(0)` y `(1)` | Retorna `True`; `TbCacheListadoNC` no tiene filas nuevas | Reset flag |
| T2 | `Test_ProyectoListadoCache_RebuildForceFull_DeleteAndRegen_Atomic` | R1 (full delete+regen) | 3 filas seed `IDProyecto=100` preexistentes en cache; 5 NCs válidas en `TbNoConformidades` con `IDProyecto=100` (marker `FNCP-T2`) | `RebuildNCProyectoListadoCache(0)` | Pre=3 Post=5; todas `CacheValida=True`; `FechaCache ≈ Now()`; ninguna fila con `IDNoConformidad` preexistente sobrevive | Borrar las 5 NCs y las 5 filas de cache por marker |
| T3 | `Test_ProyectoListadoCache_RebuildForceStale_OnlyStaleRegen_Atomic` | R1 (stale-only regen) | 3 filas seed `IDProyecto=200` en cache: 1 válida + 2 con `CacheValida=False` (marker `FNCP-T3`) | `RebuildNCProyectoListadoCache(1)` | 1 válida intacta (mismo `FechaCache`); 2 stale regeneradas (nuevo `FechaCache` ≈ Now); sin DELETE masivo (fila válida no fue tocada) | Borrar las 3 filas de cache por marker |
| T4 | `Test_ProyectoGestionHelper_RefreshCache_TrueOnSuccess_Atomic` | R2 (éxito) | Sandbox con `TbCacheListadoNC` sembrado y 3 NCs válidas | `RefreshNCProyectoGestionCaches` | `p_Error = ""`; cache regenerada con 3 filas; `TbLogCache` registra `FormCacheFallback` (NO — no debería, sólo en fallback path; verificar que NO se logueó) | Borrar cache + NCs |
| T5 | `Test_ProyectoGestionHelper_RefreshCache_FalseOnError_Atomic` | R2 (falla) | `DROP TABLE TbCacheListadoNC` en sandbox | `RefreshNCProyectoGestionCaches` (con `On Error GoTo` interno, debe capturarse) | `p_Error` contiene "TbCacheListadoNC" o mensaje primitiva; `Err.Number` preservado para re-raise | (no requiere teardown, la tabla no existe intencionalmente) |
| T6 | `Test_Entorno_InvalidateCombosCache_NullsSixCollections_Atomic` | R3 (encapsulación) | `m_ObjEntorno` con 6 colecciones pre-inicializadas (llamando cada `Property Get` una vez) | `m_ObjEntorno.InvalidateCombosCache` | Las 6 vars `Private` son `Nothing`; introspection vía serialización custom o `TypeName` | (sin teardown, singleton) |
| T7 | `Test_Entorno_InvalidateCombosCache_LazyReinitOnEstablecer_Atomic` | R3 (lazy re-init) | (a) Inicializar las 6 colecciones. (b) Modificar `TbTipos` directo en backend (insertar un nuevo tipo). (c) `InvalidateCombosCache`. | `m_ObjEntorno.ColTipos` | La colección repoblada contiene el nuevo tipo; `Set m_objColTipos Is Nothing` fue `True` antes del `Get` | Borrar el tipo insertado |
| T8 | `Test_ProyectoGestionForm_ActualizarLista_SequenceHappyPath_Atomic` | R4 + R5 (secuencia + feedback) | Form abierto; 5 NCs seed en `TbNoConformidades` con marker `FNCP-T8`; `lblEstado.Visible = False` | `Forms("Form_FormNCProyectoGestion").ComandoActualizarLista_Click` (con hook pre-`ActualizarLista` para capturar `lblEstado.Visible=True`) | `RefreshNCProyectoGestionCaches` retornó OK; `m_ObjEntorno.ColNCsProyecto` re-poblada (Count > 0); `lblEstado.Caption = "Cache recargado"`; `lblEstado.Visible = False` post-handler; `TbCacheListadoNC` con 5 filas | Borrar NCs + cache |
| T9 | `Test_ProyectoGestionForm_ActualizarLista_RefreshError_RaiseAndCleanup_Atomic` | R4 (cleanup en error) | Drop `TbCacheListadoNC`; form abierto | `Forms("Form_FormNCProyectoGestion").ComandoActualizarLista_Click` | `Err.Number = 1000` propagado; `lblEstado.Visible` no cambió; `Hourglass = False` (assertable vía `SysCmd(acSysCmdHourglass)` o re-lectura de estado) | (no requiere teardown) |
| T10 | `Test_AuditGestionForm_RenameHandler_NoRegression_Atomic` | R6 (rename sin regresión) | Form audit abierto con backend consistente | (a) Verificar `ComandoActualizar_Click` ya NO existe en el módulo. (b) Verificar que `ComandoActualizarLista_Click` es `Public` o `Private` con visibilidad adecuada. (c) Verificar que el test `Test_AuditListadoHelper_CacheOn_SourceContract_RED` (audit previo) sigue verde vía re-run | (a) `Debug.Print` del nombre de Sub o `VBE.ActiveVBProject.VBComponents("Form_FormNCAuditoriaGestion").CodeModule.ProcOfLine(line, vbext_pk_Proc)` retorna "ComandoActualizarLista_Click"; (b) click programático dispara el handler renombrado | (sin teardown) |

## Slice Plan

Review budget: **400 líneas**. Forecast total: ~600 líneas (helpers + tests +
handler + rename). Slices forzados en chained PRs.

| Slice | Contenido | Archivos | Líneas estimadas | Tag |
|---|---|---|---|---|
| **1 — Helpers RED** | `RebuildNCProyectoListadoCache` (stub que retorna `False` o con implementación mínima) + `RefreshNCProyectoGestionCaches` + módulo de test con T1-T5 como RED (compilan, fallan asserts) + manifest con 5 entradas | `CacheNCProyecto.bas`, `NCProyectoGestionListadoHelper.bas`, `Test_NCProyectoGestionListadoHelper.bas`, `tests.vba.proyecto-gestion-helper.json` | ~250 | slice1, red, helpers, orchestrator |
| **2 — Entorno + Rebuild GREEN** | `Entorno.InvalidateCombosCache` + implementación completa de `RebuildNCProyectoListadoCache` (full + stale) + T1, T2, T3, T6, T7 GREEN | `Entorno.cls`, `CacheNCProyecto.bas`, `Test_NCProyectoGestionListadoHelper.bas`, manifest actualizado | ~200 | slice2, green, encapsulacion, rebuild |
| **3 — Handler GREEN** | `ComandoActualizarLista_Click` reescrito + T4, T5, T8, T9 GREEN | `Form_FormNCProyectoGestion.cls`, `Test_NCProyectoGestionListadoHelper.bas`, manifest | ~180 | slice3, green, handler, feedback |
| **4 — Audit rename** | Rename `ComandoActualizar_Click` → `ComandoActualizarLista_Click` en audit cls (2 ocurrencias) + T10 + regresión audit (re-run manifest audit-gestion-helper) | `Form_FormNCAuditoriaGestion.cls`, `Test_NCProyectoGestionListadoHelper.bas`, manifest | ~80 | slice4, rename, regression |

**Acumulado por PR:** cada slice ≤ 400 líneas → cumple budget. Chained PRs
habilitados por force-chained (estrategia por defecto del proyecto).

**Trazabilidad de commits:** cada slice lleva `SDD: form-fncproyecto-cache-invalidation`
en el body del commit, con `Slice: N` y `Tests: T#-T#` para encadenar
verificación cruzada entre SDD y git.

## Risk Mitigation

- **`Entorno.InvalidateCombosCache` no debe disparar lazy init**: la
  implementación es estrictamente `Set m_xxx = Nothing` para cada var. NO
  llama a ningún `Property Get` ni `Property Let` (eso último ni existe).
  T6 assertea que las 6 vars son `Nothing` post-llamada.

- **`lblEstado` no queda visible permanente**: el handler setea
  `Visible = True` sólo tras confirmación de éxito del refresh, y
  `Visible = False` siempre antes de `Exit Sub` o `SALIR`. NO usa `Sleep`
  ni `Application.OnTime` (prohibido por R5). T8 captura el estado en
  tres puntos (post-EstablecerCombos, post-ActualizarLista, post-handler)
  y assertea la transición.

- **Rename audit sin regresión**: el form.txt usa `OnClick ="[Event Procedure]"`
  (línea 539), convención `<ControlName>_Click`. El control se llama
  `ComandoActualizar` (línea 537) — Access resolverá a `ComandoActualizar_Click`
  con el rename en cls. T10 verifica (a) el símbolo existe con el nuevo
  nombre, (b) el símbolo viejo ya no existe, (c) el form sigue disparando
  el mismo flujo. Si la verificación falla, **NO** se renombra el control
  (eso sería fuera de scope); se documenta y se reabre el debate.

- **PR > 400 líneas**: mitigado por slice plan (cada slice ≤ 250 líneas).
  Si el forecast crece durante implementation, forzar chained.

- **Compilación manual**: tras `dysflow.import_modules` se notifica al
  usuario y se espera confirmación antes de `dysflow.test_vba`. El proyecto
  fija que **el usuario compila, no el agente**.

- **Tests pasan por suerte**: mitigado por fixture-first + sandbox +
  teardown por markers + `Assert*` fuertes (cardinalidad, valores
  concretos, side effects). T6 usa introspection de las 6 vars privadas
  vía serialización custom o acceso indirecto por `Property Get` que debe
  forzar lazy init — el test verifica que **antes** del `Get` la var es
  `Nothing`, **después** no.

- **Carrera de caché y combos**: el orden `InvalidateCombosCache →
  EstablecerCombos` es estricto. Si `EstablecerCombos` corre antes que
  `InvalidateCombosCache`, los combos se re-pintan con la colección
  cacheada vieja. El handler fija este orden; T8 assertea que
  `m_ObjEntorno.ColNCsProyecto.Count > 0` post-handler (lo cual sólo
  ocurre si la lazy init corrió).

- **Concurrencia de múltiples operaciones Access**: prohibido por
  `AGENTS.md`. El slice plan se ejecuta **secuencialmente**; entre
  `import_modules` y `test_vba` se espera confirmación de compilación.

## Open Questions

- [ ] ¿El control `ComandoActualizar` en el `Form_FormNCAuditoriaGestion.form.txt`
      debe renombrarse a `ComandoActualizarLista` para máxima consistencia,
      o se mantiene el control con el nombre viejo y sólo el handler se
      renombra? Asumido: sólo handler (R6 explícito). Confirmar con el
      usuario si la inconsistencia visual es aceptable.

- [ ] ¿`lblEstado` se mantiene durante el repintado de la lista
      (`ActualizarDatosFiltrados` + `ActualizarLista`) o se oculta justo
      después de setear el caption? El spec R5 dice "≥1 ciclo antes de
      ActualizarLista; Visible=False antes de salir" — la interpretación
      literal es: visible durante `ActualizarDatosFiltrados` + `ActualizarLista`.
      Asumido: visible durante todo el repintado, oculto al final.
      Confirmar con UX si prefiere ocultar antes del repintado.
