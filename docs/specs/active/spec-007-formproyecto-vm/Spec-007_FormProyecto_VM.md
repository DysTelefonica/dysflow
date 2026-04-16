# Spec-007: FormNCProyecto Contenedor — Dual-Path VM + Fallback

**Estado:** 🔵 ABIERTA
**Prioridad:** Alta
**Tipo:** Nueva Funcionalidad + Corrección
**Módulos PRD afectados:** PRD-01_NC_Proyectos
**Spec padre:** —
**Specs relacionadas:** Spec-002, Spec-006, Spec-007b, Spec-007c, Spec-007d, Spec-007e, Spec-007f, Spec-007g
**RFC origen:** RFC-001
**Plan origen:** PLAN-002 (T-07)
**Fecha de creación:** 2026-03-14
**Fecha de actualización:** 2026-03-23
**Fecha límite:** Sin límite
**Cierre:** Pendiente

---

> **Regla anti-placeholder (obligatoria):**
> Este archivo contiene contenido completo en secciones 1 a 9.

---

## 1. Resumen Técnico

- **Problema / Necesidad:** FormNCProyecto (contenedor multi-pestaña) necesita mejorar rendimiento usando ViewModel + caché, pero sin perder la ruta de datos real (fallback).
- **Causa raíz:** El formulario actualmente usa `constructor.getNCProyecto()` para cargar `m_NCAlInicio` (objeto NCProyecto). Esta ruta es la de fallback, pero no hay path rápido vía VM+caché.
- **Solución propuesta:** Implementar **dual-path architecture**:
  1. **Path rápido:** Intentar cargar via `NCProyectoWrapper.GetNCProyectoVM()` (caché-aware)
  2. **Path fallback:** Si el VM falla o no hay caché, usar `constructor.getNCProyecto()` (objeto existente)
  3. Ambos paths coexisten — el fallback es automático y transparente
- **Restricciones conocidas:**
  - Sin TTL en caché de detalle — refresco manual solo
  - El VM y el objeto entidad coexisten durante la migración
  - Los subformularios reciben referencia al VM o al objeto entidad según disponibilidad

---

## 2. Historia de Usuario

> Como usuario, quiero que FormNCProyecto abra rápido usando caché, pero si la caché falla o está vacía, sigo viendo los datos correctamente (sin error, sin pantalla en blanco).

**Contexto:**
- El formulario tiene 6 pestañas: General, Acciones, ControlEficacia, Nota, Documentos, Replanificaciones
- Objetivo: apertura <2s (desde caché cuando está disponible)
- Si no hay caché: fallback automático a datos reales (puede tardar más pero funciona)
- Botón "Actualizar" permite forzar recarga desde BD real + regenerar caché

---

## 3. Arquitectura Dual-Path

### 3.1 Concepto

```
┌─────────────────────────────────────────────────────────────┐
│                    FormNCProyecto (Contenedor)               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Al abrir/form_load:                                        │
│                                                              │
│  ┌──────────────────┐    ┌──────────────────┐              │
│  │ Path 1 (VM)      │    │ Path 2 (Fallback)│              │
│  │ NCProyectoWrapper │ OR │ constructor.     │              │
│  │ .GetNCProyectoVM │    │ getNCProyecto()  │              │
│  │ (caché-aware)   │    │ (objeto real)    │              │
│  └────────┬─────────┘    └────────┬─────────┘              │
│           │                         │                        │
│           │    ┌────────────────────┘                        │
│           │    │                                             │
│           ▼    ▼                                             │
│  ┌──────────────────┐                                       │
│  │  m_VM As NCPro   │  ← nuevo: ViewModel de detalle       │
│  │  yectoDetailVM   │                                       │
│  ├──────────────────┤                                       │
│  │  m_NCAlInicio As │  ← existente: objeto NCProyecto      │
│  │  NCProyecto      │      (fallback)                       │
│  └──────────────────┘                                       │
│           │                                                 │
│           ▼                                                 │
│  ┌─────────────────────────────────────┐                    │
│  │ Subformularios (Spec-007b a 007g)   │                    │
│  │ Acceden a:                           │                    │
│  │   - contenedor.m_VM (si existe)      │                    │
│  │   - contenedor.m_NCAlInicio (si VM  │                    │
│  │     no existe)                        │                    │
│  └─────────────────────────────────────┘                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Variables del formulario

| Variable | Tipo | Estado | Descripción |
|----------|------|--------|-------------|
| `m_VM` | `NCProyectoDetailVM` | **NUEVA** | ViewModel con datos de caché. Puede ser Nothing si no se usa o falla. |
| `m_NCAlInicio` | `NCProyecto` | EXISTENTE | Objeto entidad (fallback). Siempre disponible. |

### 3.3 Regla de acceso a datos

```
REGLA: Los subformularios NUNCA crashean por falta de VM.

Método propuesto en contenedor:
  - TryLoadFromVM() → intenta m_VM = GetNCProyectoVM(idNC)
  - If m_VM Is Nothing Or Not m_VM.EstaCargado Then
      ' Fallback: m_NCAlInicio ya fue cargado por EstablecerDatos
      Log "VM no disponible, usando fallback"
    End If
```

---

## 4. Análisis de Impacto

### 4.1 Módulos afectados

| PRD | Módulo / Clase | Tipo de impacto | Notas |
|-----|----------------|-----------------|-------|
| PRD-01_NC_Proyectos | `Form_FormNCProyecto.cls` | Modificación | Añadir m_VM + TryLoadFromVM |
| PRD-01_NC_Proyectos | `FormNCProyecto.form.txt` | Modificación UI | Añadir btnActualizarDetalle |

### 4.2 Archivos a modificar

| Archivo | Tipo de cambio | Descripción del cambio |
|---------|-----------------|------------------------|
| `src/forms/Form_FormNCProyecto.cls` | Modificación | Añadir TryLoadFromVM, m_VM, btn click handler |
| `src/forms/FormNCProyecto.form.txt` | Modificación UI | Añadir botón btnActualizarDetalle |
| `src/modules/NCProyectoWrapper.bas` | Sin cambios | Ya existe y funciona (verificar que GetNCProyectoVM está operativo) |

### 4.3 Tablas / Entidades de datos afectadas

| Tabla | Cambio | Detalle |
|-------|--------|---------|
| `TbCacheNCProyecto` | Solo lectura | Caché de detalle (via GetNCProyectoVM) |
| `TbNoConformidades` | Solo lectura | Datos reales (fallback via constructor) |

### 4.4 Formularios / UI afectados

| Formulario | Cambio | Detalle |
|------------|--------|---------|
| `FormNCProyecto` (contenedor) | Modificación | Nuevo botón en algún lugar visible (ej: near lblTitulo) |

### 4.5 Deuda técnica relacionada

| ID | Descripción | Relación |
|----|-------------|----------|
| DT-001 | ViewModels para optimización rendimiento | Resuelve parcialmente (contenedor, no subformularios aún) |

### 4.6 Riesgos

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|-------------|---------|------------|
| R-1: VM disponible pero datos incoherentes con BD real | Baja | Alto | El fallback siempre funciona. Si VM devuelve datos diferentes, el usuario puede pulsar "Actualizar". |
| R-2: Subformularios no saben que hay VM disponible | Media | Medio | Contenedor expone `GetVM()` y `GetNCObject()` públicos para subformularios. |
| R-3: Caché vacío causa lentitud en primer acceso | Alta | Bajo | Es esperado. Segundo acceso será rápido. Botón "Actualizar" regenera caché. |

---

## 5. Plan de Intervención

### Intervención 1: Añadir variable m_VM al formulario

**Archivo:** `src/forms/Form_FormNCProyecto.cls`
**Tipo:** Nueva variable de instancia
**Precondición:** —

**Descripción:**
Añadir al inicio de la clase (junto a las otras variables privadas):

```vba
Private m_VM As NCProyectoDetailVM  ' NUEVA: ViewModel de detalle (cache-aware)
```

**Postcondición:** La variable existe pero está sin inicializar (Nothing).

---

### Intervención 2: Crear método TryLoadFromVM

**Archivo:** `src/forms/Form_FormNCProyecto.cls`
**Tipo:** Nuevo método
**Precondición:** Intervención 1 completada

**Descripción:**
Crear método `TryLoadFromVM(p_IDNC As Long)` que:
1. Intenta cargar `m_VM = NCProyectoWrapper.GetNCProyectoVM(p_IDNC)`
2. Si succeeds y `m_VM.EstaCargado = True` → log "VM cargado desde caché"
3. Si falla o `m_VM Is Nothing` → mantiene `m_NCAlInicio` existente como fallback
4. Siempre retorna True (el fallback garantiza que hay datos)

```vba
Public Function TryLoadFromVM(ByVal p_IDNC As Long) As Boolean
    On Error GoTo errores
    
    Set m_VM = Nothing
    
    Set m_VM = NCProyectoWrapper.GetNCProyectoVM(p_IDNC)
    
    If Not m_VM Is Nothing And m_VM.EstaCargado Then
        Debug.Print "FormNCProyecto.TryLoadFromVM: VM cargado (caché OK)"
        TryLoadFromVM = True
    Else
        Debug.Print "FormNCProyecto.TryLoadFromVM: VM no disponible, usando fallback"
        Set m_VM = Nothing
        TryLoadFromVM = True  ' Siempre succeeds porque hay fallback
    End If
    
    Exit Function
    
errores:
    Debug.Print "FormNCProyecto.TryLoadFromVM ERROR: " & Err.Description
    Set m_VM = Nothing
    TryLoadFromVM = True  ' Fallback activo
End Function

Public Function GetVM() As NCProyectoDetailVM
    Set GetVM = m_VM
End Function

Public Function GetNCObject() As NCProyecto
    Set GetNCObject = m_NCAlInicio
End Function
```

**Postcondición:** `m_VM` contiene el ViewModel (si se pudo cargar) o Nothing (si no).

---

### Intervención 3: Modificar carga existente para invocar TryLoadFromVM

**Archivo:** `src/forms/Form_FormNCProyecto.cls`
**Tipo:** Modificación de método existente
**Precondición:** Intervención 2 completada

**Descripción:**
En `EstablecerDatos()`, después de cargar `m_NCAlInicio` (línea ~167 del código actual):

```vba
' === EXISTENTE (línea ~167) ===
Set m_NCAlInicio = constructor.getNCProyecto(p_IDNC:=m_ObjNCProyectoActiva.IDNoConformidad, p_Error:=p_Error)

' === NUEVO: Intentar cargar desde VM (después de m_NCAlInicio) ===
If m_ObjNCProyectoActiva.IDNoConformidad <> "" Then
    Call TryLoadFromVM(m_ObjNCProyectoActiva.IDNoConformidad)
End If
```

**Nota:** El código NO reemplaza la carga existente de `m_NCAlInicio`. Solo añade el intento de VM en paralelo. El fallback es `m_NCAlInicio`.

**Postcondición:** `m_VM` se intenta cargar. Si falla, `m_NCAlInicio` sigue disponible.

---

### Intervención 4: Añadir botón btnActualizarDetalle

**Archivo:** `src/forms/FormNCProyecto.form.txt`
**Tipo:** Nuevo control UI
**Precondición:** Intervención 3 completada

**Descripción:**
Añadir un botón en el formulario contenedor:
- **Nombre:** `btnActualizarDetalle`
- **Caption:** "Actualizar"
- **Tooltip:** "Regenera la caché de detalle y recarga los datos"
- **Ubicación sugerida:** Near `lblTitulo` o en toolbar area
- **Visible:** True siempre

```vba
' En el .form.txt (propiedades del control):
Begin BtnActualizar
    Name = "btnActualizarDetalle"
    Caption = "Actualizar"
    TooltipText = "Regenera la caché de detalle y recarga los datos"
    OnClick = "[Event Procedure]"
End
```

**Postcondición:** Botón visible en el formulario.

---

### Intervención 5: Crear handler del botón Actualizar

**Archivo:** `src/forms/Form_FormNCProyecto.cls`
**Tipo:** Nuevo evento/handler
**Precondición:** Intervención 4 completada

**Descripción:**
Crear el método que responde al click del botón:

```vba
Private Sub btnActualizarDetalle_Click()
    On Error GoTo errores
    
    Dim m_Error As String
    Dim idNC As Long
    
    DoCmd.Hourglass True
    m_Error = ""
    
    ' Obtener ID de NC actual
    If m_ObjNCProyectoActiva Is Nothing Then
        MsgBox "No hay NC cargada para actualizar.", vbExclamation
        DoCmd.Hourglass False
        Exit Sub
    End If
    
    idNC = m_ObjNCProyectoActiva.IDNoConformidad
    If idNC = "" Or idNC = 0 Then
        MsgBox "No hay NC cargada para actualizar.", vbExclamation
        DoCmd.Hourglass False
        Exit Sub
    End If
    
    ' Invalidar caché de detalle
    If Not NCProyectoWrapper.InvalidateNC(idNC, m_Error) Then
        Debug.Print "btnActualizarDetalle: InvalidateNC warning: " & m_Error
        ' No abortamos - seguimos con recarga
    End If
    
    ' Recargar datos reales (constructor)
    Set m_NCAlInicio = constructor.getNCProyecto(p_IDNC:=idNC, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    ' Intentar recargar VM (con caché fresco)
    Call TryLoadFromVM(idNC)
    
    DoCmd.Hourglass False
    DoCmd.Requery  ' Solo para controles bound, en unbound no hace nada crítico
    
    MsgBox "Datos actualizados.", vbInformation, "Actualizar"
    
    Exit Sub
    
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Error al actualizar: " & Err.Description
        CorreoAlAdministrador m_Error
        MsgBox m_Error, vbCritical, "Error"
    Else
        MsgBox m_Error, vbExclamation, "Advertencia"
    End If
End Sub
```

**Postcondición:** El botón invalidates caché y recarga datos reales.

---

## 6. Criterios de Verificación

### 6.1 Auto-verificación (IA — revisión estática de código)

- [ ] `m_VM As NCProyectoDetailVM` declarado como variable privada
- [ ] `TryLoadFromVM` implementado con fallback automático
- [ ] `GetVM()` y `GetNCObject()` públicos para subformularios
- [ ] `EstablecerDatos` llama a `TryLoadFromVM` después de cargar `m_NCAlInicio`
- [ ] `btnActualizarDetalle_Click` implementa invalidación + recarga
- [ ] Manejo de errores con rollback a fallback
- [ ] Cumple el patrón de errores (On Error GoTo / Exit / ErrorHandler / p_Error)

### 6.2 Validación en Access

- [ ] Form abre sin errores (primera vez, sin caché)
- [ ] Form abre rápido (segunda vez, con caché)
- [ ] `m_VM` se carga cuando hay caché (verificar en Debug.Print)
- [ ] `m_VM` es Nothing cuando no hay caché (verificar fallback activo)
- [ ] Botón "Actualizar" funciona y muestra MsgBox de confirmación
- [ ] Sin regresiones en navegación de pestañas

### 6.3 Criterios de aceptación

- [ ] Formulario compila sin errores en VBA Editor
- [ ] Apertura <2s P95 (cuando hay caché disponible)
- [ ] Sin regresiones: funcionalidad idéntica al estado anterior
- [ ] El fallback siempre funciona: si VM falla, se usa `m_NCAlInicio`
- [ ] Botón Actualizar regenera caché y recarga datos

---

## 7. Informe de Cambios UI

### 7.1 Controles añadidos

| Control | Tipo | Propiedades clave |
|---------|------|------------------|
| `btnActualizarDetalle` | Botón | Caption: "Actualizar", Tooltip: "Regenera la caché de detalle y recarga los datos", OnClick: [Event Procedure] |

### 7.2 Posicionamiento sugerido

El botón debe estar visible pero no intrusive. Sugerencias:
- Near `lblTitulo` (arriba a la derecha del título)
- O en una barra de herramientas si el formulario tiene una

---

## 8. Gaps y Decisiones

### Gap 1: Subformularios no acceden a m_VM

**Descripción:** Esta spec solo implementa el dual-path en el **contenedor**. Los subformularios (Spec-007b a 007g) siguen usando `Form_FormNCProyecto.m_NCAlInicio` directamente.

**Impacto:** El beneficio de rendimiento del VM no se manifiesta hasta que los subformularios se modifiquen para usarlo.

**Solución:** Spec-007b a 007g implementan la lectura desde `contenedor.GetVM()` cuando está disponible, con fallback a `contenedor.GetNCObject()`.

**Estado:** Conocido y planificado.

---

### Decisión 1: ¿Por qué no reemplazar m_NCAlInicio con m_VM?

**Pregunta:** ¿Por qué mantener ambos y no solo el VM?

**Respuesta:**
1. El VM es **solo lectura** — los subformularios necesitan el objeto entidad para hacer updates
2. El VM no tiene todos los métodos que el objeto tiene (`.DatosGeneralesOK`, `.EstadoGrabar`, etc.)
3. El fallback garantiza que SIEMPRE hay datos, aunque la implementación del VM esté incompleta
4. Migración gradual: se puede implementar Spec-007 ahora y los subformularios después

---

### Decisión 2: ¿Por qué TryLoadFromVM retorna True siempre?

**Respuesta:** Porque el fallback (`m_NCAlInicio`) ya está cargado por `EstablecerDatos` antes de invocar `TryLoadFromVM`. No hay scenario donde necesitemos abortar la carga del formulario por culpa del VM.

---

## 9. Notas de Implementación

- Esta spec **NO** requiere cambios en `NCProyectoWrapper` — ya tiene `GetNCProyectoVM` operativo
- El VM (`m_VM`) es **opcional** — si no se carga, el fallback es `m_NCAlInicio`
- Los subformularios (Spec-007b-g) serán los que consuman `m_VM` cuando esté disponible
- Esta spec no modifica la lógica de guardado (SaveNC) — eso es Spec-008
- Sin transacciones en este paso (solo lectura de datos)

---

## 10. Batería de Pruebas de Aceptación

**Instrucciones:** Estas pruebas debe ejecutarlas el usuario manualmente en su Access después de importar los módulos.

### Prerrequisitos
- Access abierto con la BD `NoConformidades.accdb`
- Una NC existente que sepas que funciona
- Conocer el ID de esa NC (ej: ID=1)
- El formulario `FormNCProyecto` debe abrirse desde el listado (`FormNCProyectoGestion`)

### Ejecución Visual (UI)

| ID | Escenario | Pasos | Resultado esperado | Verificación |
|----|-----------|-------|-------------------|--------------|
| **PA-01** | Apertura normal (sin caché) | 1. Cerrar Access<br>2. Abrir desde FormNCProyectoGestion<br>3. Abrir una NC | Formulario abre, datos visibles | Verificar que aparecen los datos de la NC |
| **PA-02** | Apertura rápida (con caché) | 1. Abrir la misma NC del PA-01 (ya está en caché) | Segunda apertura más rápida que la primera | Comparar tiempos (estimar ~1-2s vs ~3-4s) |
| **PA-03** | Botón Actualizar visible | 1. Verificar que existe el botón con caption "Actualizar" | Botón visible cerca del título | Visualmente |
| **PA-04** | Botón Actualizar funciona | 1. Modificar un campo en la NC<br>2. Click en "Actualizar"<br>3. Verificar datos recargados | Datos se recargan, MsgBox "Datos actualizados" | Confirmar con MsgBox |
| **PA-05** | Sin regresión: pestañas funcionan | 1. Navegar por las 6 pestañas | Todas las pestañas muestran datos | Verificar contenido en cada pestaña |

### Ejecución en Ventana Inmediato (VBE → Ctrl+G)

| ID | Escenario | Pasos | Resultado esperado | Verificación |
|----|-----------|-------|-------------------|--------------|
| **PA-06** | Verificar VM cargado | 1. `Debug.Print Form_FormNCProyecto.m_VM Is Nothing` | False (si hay caché) o True (si no hay) | En Immediate window |
| **PA-07** | Verificar fallback activo | 1. `Debug.Print Form_FormNCProyecto.m_NCAlInicio Is Nothing` | False siempre | En Immediate window |
| **PA-08** | GetVM() funciona | 1. `Set vm = Form_FormNCProyecto.GetVM()`<br>2. `Debug.Print vm Is Nothing` | False si hay VM cargado | En Immediate window |
| **PA-09** | GetNCObject() funciona | 1. `Set nc = Form_FormNCProyecto.GetNCObject()`<br>2. `Debug.Print nc Is Nothing` | False siempre | En Immediate window |
| **PA-10** | TryLoadFromVM retorna True | 1. `Debug.Print Form_FormNCProyecto.TryLoadFromVM(1)` | True siempre (fallback existe) | En Immediate window |

### Validación de Fallback (Forzar error de VM)

| ID | Escenario | Pasos | Resultado esperado | Verificación |
|----|-----------|-------|-------------------|--------------|
| **PA-11** | VM no disponible = fallback activo | 1. Forzar error temporal en GetNCProyectoVM<br>2. Abrir formulario | Formulario abre igual (usando m_NCAlInicio) | Verificar en Debug.Print que m_VM Is Nothing pero hay datos |

### Criterio de paso

**TODAS** las pruebas PA-01 a PA-10 deben retornar el resultado esperado.
La prueba PA-11 es bonus (si se puede simular).

Si alguna falla, no se considera validada la spec.

---

## 11. Checklist de Cierre

- [ ] Intervención 1 (m_VM) implementada
- [ ] Intervención 2 (TryLoadFromVM) implementada
- [ ] Intervención 3 (EstablecerDatos modificado) implementada
- [ ] Intervención 4 (btnActualizarDetalle en .form.txt) implementada
- [ ] Intervención 5 (btnActualizarDetalle_Click) implementada
- [ ] Auto-verificación 6.1 completada
- [ ] Validación en Access 6.2 completada
- [ ] Criterios de aceptación 6.3 cumplidos
- [ ] Pruebas de aceptación PA-01 a PA-10 pasan
- [ ] Sin regresiones en funcionalidad existente
- [ ] Gap documentado: subformularios (Spec-007b-g) fuera de scope de esta spec

---

## 12. Descubrimientos de Sesión

> Documenta hallazgos técnicos, bugs corregidos, tests creados y trabajo de infraestructura realizado durante la sesión de desarrollo.

### 12.1 Infraestructura: `access-query` reescrito con DAO directo

**Problema:** `access-query` usaba `Access.Application` via COM para ejecutar SQL, lo cual era lento y propenso a errores de instanciación.

**Solución:** Se reescribió para usar **DAO directo** (`DAO.DBEngine.120`), sin dependencia Access.Application COM:

```vba
' Nuevo patrón: DAO directo
Dim db As DAO.Database
Set db = DBEngine.OpenDatabase(ruta, False, False, ";PWD=" & password)
Dim rs As DAO.Recordset
Set rs = db.OpenRecordset(sql, DAO.RecordsetTypeEnum.dbOpenSnapshot)
```

**Impacto:** Habilita la ejecución de SQL contra backends `.accdb` sin necesidad de abrir Access, lo que permite crear tests automatizados robustos.

---

### 12.2 Configuración: `backends.json` actualizado

**Archivo:** `src/modules/backends.json`

**Backend `NoConformidades`** configurado:
```json
{
  "name": "NoConformidades",
  "accdb": "NoConformidades_Datos.accdb",
  "password": "dpddpd"
}
```

**Ubicación del backend:** `C:\Users\adm1\Telefonica\Aplicaciones_dys.TMETF - Aplicaciones PpD\No Conformidades\NoConformidades_Datos.accdb`

---

### 12.3 Bugs corregidos en `access-query`

| # | Bug | Corrección |
|---|-----|------------|
| B-1 | `GetSchema` usaba `DataTypeName` (texto, ej: "Long") | Cambiado a `DataType.FullName` (ej: "dbLong") |
| B-2 | PK detection fallaba si la tabla no tenía `Indexes` | Null-check con `If Not $td.Indexes Is Nothing Then` antes de iterar |
| B-3 | `Indexes = Nothing` crashaba en iteración | Verificación explícita de `Nothing` antes del loop |

---

### 12.4 Tests creados

#### `Spec007_TestManual(452)` — Función de test manual

**Archivo:** `src/modules/Spec007_Tests.bas`

**Función exportada:**
```vba
Public Function Spec007_TestManual(ByVal p_IDNC As Long) As Boolean
```

**Propósito:** Verificar que la NC existe, tiene ARs asociadas, y que los datos básicos se cargan correctamente.

**Uso en VBE (Ctrl+G):**
```
? Spec007_TestManual(452)
```

**Verifica:**
1. La NC existe en `TbNoConformidades`
2. La NC tiene ARs asociadas en `TbAcciones`
3. El constructor puede cargar la NC sin errores

**Resultado esperado:** `True` si todo OK, `False` si falla.

#### `Spec007_Tests.bas` — Módulo de tests

**Importado a Access** via `access-vba-sync`:
```
access-vba-sync import-modules --files src/modules/Spec007_Tests.bas
```

**Contenido:** Funciones de test para validación de Spec-007:
- `Spec007_TestManual(idNC)` — test básico de carga de NC
- Tests de verificación de VM y fallback

---

### 12.5 NC 452 — Caso de prueba verificado

**NC 452** verificada como buen caso de prueba:

| Campo | Valor |
|-------|-------|
| ID | 452 |
| Tabla | `TbNoConformidades` |
| ARs asociadas | 3 acciones en `TbAcciones` |
| Estado | Verificada |

**Por qué 452:**
- Existe consistentemente en la BD
- Tiene ARs asociadas (pruebas de relaciones)
- ID > 0, sin caracteres especiales
- Datos completos para validación

---

### 12.6 Descubrimiento: `TbConfiguracion` — Tabla real de configuración de caché

**Descubierto via `access-query` — `GetSchema` sobre `HPST_datos.accdb`:**

```
TableDef: TbConfiguracion
Campos: ID (Long), CacheHabilitada (Boolean), FechaCambioCache (Date), UsuarioCambioCache (String), MotivoCambioCache (String)
Primary Key: ID
```

**Registro actual (ID=1):**
| Campo | Valor |
|-------|-------|
| `ID` | 1 |
| `CacheHabilitada` | **False** |
| `FechaCambioCache` | 03/23/2026 12:58:09 |
| `UsuarioCambioCache` | adm |
| `MotivoCambioCache` | `Test: Desactivando cache` |

**Importancia:** Esta tabla es la **tabla real de configuración** del sistema de caché. `NCProyectoWrapper` debería leer `CacheHabilitada` de aquí (lazy loading desde `TbConfiguracion`) para determinar si el cache está activo.

---

### 12.7 Pendiente: `CacheHabilitada` como propiedad de `m_ObjEntorno`

**Estado:** 🔲 **PENDIENTE DE IMPLEMENTAR**

**Descripción:** `m_ObjEntorno` (objeto `ObjEntidad` que representa `TbConfiguracion`) necesita la propiedad `CacheHabilitada` con lazy loading.

**Contexto:**
- `m_ObjEntorno` ya existe en el formulario como objeto de configuración
- La tabla `TbConfiguracion` (ID=1) contiene `CacheHabilitada`
- El valor actual es `False` — la caché está desactivada

**Implementación sugerida:**
```vba
Public Property Get CacheHabilitada() As Boolean
    If m_CacheHabilitadaLoaded = False Then
        LoadConfiguracion  ' Leer de TbConfiguracion.ID=1
        m_CacheHabilitadaLoaded = True
    End If
    CacheHabilitada = m_CacheHabilitada
End Property
```

**Por qué es importante:**
- Sin esta propiedad, `NCProyectoWrapper` no puede consultar dinámicamente si la caché está habilitada
- El flag `CacheHabilitada=False` en producción indica que el sistema puede no estar usando el caché

---

### 12.8 Resumen de archivos modificados/creados

| Archivo | Acción | Detalle |
|---------|--------|---------|
| `src/modules/access-query.bas` | Reescrito | DAO directo en vez de COM |
| `src/modules/backends.json` | Actualizado | Backend `NoConformidades` configurado |
| `src/modules/Spec007_Tests.bas` | Creado | Tests para Spec-007 |
| `HPST_datos.accdb` | Leído | Schema de TbConfiguracion |

### 12.9 Notas de la sesión

- La batería de tests manuales (`Spec007_TestManual`) permite verificar la NC 452 sin abrir el formulario
- El reescrito de `access-query` con DAO es un prerrequisito para tests automatizados de aceptación
- `CacheHabilitada=False` sugiere que el caché fue desactivado explícitamente — verificar si debe estar activo
- La tabla `TbConfiguracion` es compartida por todo el sistema — cualquier cambio tiene efecto global
