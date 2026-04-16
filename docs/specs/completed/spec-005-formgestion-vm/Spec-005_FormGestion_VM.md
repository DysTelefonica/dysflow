# Spec-005: FormGestion VM (Filtrado SQL + Botón Actualizar)

**Estado:** ✅ VALIDADO EN ACCESS (2026-03-16)
**Prioridad:** Alta
**Tipo:** Rediseño
**Módulos PRD afectados:** PRD-01_NC_Proyectos
**Spec padre:** —
**Specs relacionadas:** Spec-001, Spec-003, Spec-004
**RFC origen:** RFC-001
**Plan origen:** PLAN-002 (T-05)
**Fecha de creación:** 2026-03-14
**Fecha límite:** Sin límite
**Cierre:** 2026-03-16

---

## 1. Resumen Técnico (NUEVO ENFOQUE)

- **Problema / Necesidad:** FormNCProyectoGestion debe usar filtrado SQL sobre caché para mejor rendimiento.
- **Causa raíz:** Filtrado en memoria sobre colección completa.
- **Solución propuesta:**
  - Filtrado mediante **SQL sobre TbCacheListadoNC**
  - Botón "Actualizar" borra caché completa y rebuild
- **Dependencias:** Spec-003 completada (caché con campos aplanados)

---

## 2. Historia de Usuario

> Como usuario de FormNCProyectoGestion, quiero que el listado cargue rápido usando SQL y pueda actualizar manualmente para obtener datos frescos.

**Contexto:**
- Objetivo: <3s apertura, <1s filtros
- Botón "Actualizar" para forzar rebuild completo

---

## 3. Análisis de Impacto

### 3.1 Módulos afectados

| PRD | Módulo / Clase | Tipo de impacto | Notas |
| :--- | :--- | :--- | :--- |
| PRD-01_NC_Proyectos | Form_FormNCProyectoGestion | Modificación | Usa SQL sobre caché |

### 3.2 Archivos a modificar

| Archivo | Tipo de cambio | Descripción del cambio |
| :--- | :--- | :--- |
| `src/forms/Form_FormNCProyectoGestion.form.txt` | Modificación | btnActualizarListado |
| `src/forms/Form_FormNCProyectoGestion.cls` | Modificación | Filtrado SQL + btnActualizar_Click |

### 3.3 Tablas / Entidades de datos afectadas

| Tabla | Cambio | Detalle |
| :--- | :--- | :--- |
| TbCacheListadoNC | Leer + Rebuild | Filtrado SQL, rebuild completo |

### 3.4 Formularios / UI afectados

| Formulario | Cambio | Detalle |
| :--- | :--- | :--- |
| FormNCProyectoGestion | Modificación | Filtrado SQL, nuevo botón |

---

## 4. Diseño de la Solución

### 4.1 Filtrado mediante SQL

En lugar de iterar sobre colección en memoria:

```vba
' [NUEVO] En lugar de:
' Set ncList = Constructor.GetNCsFiltrados(filtros)
' For Each nc In ncList
'     If cumpleFiltros(nc) Then ...
' [NUEVO] Usar SQL directo sobre caché:
Private Function ObtenerListadoConFiltros() As Collection
    Dim sql As String
    sql = "SELECT * FROM TbCacheListadoNC WHERE CacheValida=True"

    If Nz(Me.ComboCodigo, "") <> "" Then
        sql = sql & " AND CodigoNoConformidad LIKE '*" & Me.ComboCodigo & "*'"
    End If

    ' ComboJuridica ELIMINADO (cambio de req. 2026-03-16)

    ' ... otros filtros

    Set ObtenerListadoConFiltros = CacheNCProyecto.GetListadoFiltradoSQL(sql)
End Function
```

### 4.2 Botón "Actualizar" (Rebuild Parcial - Solo Abiertas)

```vba
Private Sub btnActualizarListado_Click()
    On Error GoTo ErrorHandler

    DoCmd.Hourglass True

    ' Rebuild parcial: NO borra NCs cerradas
    ' Las cerradas se mantienen en caché para referencia histórica
    ' Solo se sincronizan/actualizan las abiertas
    CacheNCProyecto.RebuildCompleto p_BorrarCerradas:=False

    Me.Requery

    DoCmd.Hourglass False
    MsgBox "Caché actualizada correctamente.", vbInformation
    Exit Sub

ErrorHandler:
    DoCmd.Hourglass False
    MsgBox "Error al actualizar la caché: " & Err.Description, vbCritical
End Sub
```

> **Nota:** Para borrar toda la caché (incluidas cerradas), usar en ventana inmediato:
> ```vba
> CacheNCProyecto.RebuildCompleto p_BorrarCerradas:=True
> ```

### 4.3 Carga del formulario

```vba
Private Sub Form_Load()
    Dim listaVM As Collection

    ' Si la caché tiene registros válidos, usar SQL directo
    If CacheNCProyecto.TieneCacheValida() Then
        Set listaVM = ObtenerListadoConFiltros()
    Else
        ' Si no hay caché, rebuild automático
        CacheNCProyecto.RebuildCompleto
        Set listaVM = ObtenerListadoConFiltros()
    End If

    RellenarListaConVM listaVM
End Sub
```

---

## 5. Criterios de Verificación

### 5.1 Auto-verificación

- [ ] FormNCProyectoGestion.cls usa SQL sobre TbCacheListadoNC
- [ ] FormNCProyectoGestion.form.txt tiene btnActualizarListado
- [ ] btnActualizarListado_Click ejecuta RebuildCompleto

### 5.2 Validación en Access

- [ ] Apertura del formulario → usa SQL sobre caché
- [ ] Click botón actualizar → DELETE + rebuild completo
- [ ] Filtros funcionan correctamente con SQL
- [ ] Test de regresión: funcionalidad idéntica

### 5.3 Criterios de aceptación

- [ ] Apertura <3s P95
- [ ] Filtros <1s P95
- [ ] Sin regresiones funcionales
- [ ] VALIDADO EN ACCESS: Spec-005

---

## 5.1 Tests de Validación en Access

### Test 1: GetListadoFiltradoSQL desde formulario

```vba
Dim col As Collection
Set col = CacheNCProyecto.GetListadoFiltradoSQL()
Debug.Print "Total sin filtro: " & col.Count
```

**Esperado:** > 0

---

### Test 2: GetListadoFiltradoSQL con filtro Estado

```vba
Dim col As Collection
Set col = CacheNCProyecto.GetListadoFiltradoSQL(p_Estado:="Abierta")
Debug.Print "Abiertas: " & col.Count
```

**Esperado:** > 0

---

### Test 3: RebuildCompleto (sin borrar cerradas)

```vba
? CacheNCProyecto.RebuildCompleto(p_BorrarCerradas:=False)
```

**Esperado:** `True` (mantiene NCs cerradas en caché)

---

### Test 4: RebuildCompleto (borrar todo - admin)

```vba
? CacheNCProyecto.RebuildCompleto(p_BorrarCerradas:=True)
```

**Esperado:** `True` (borra toda la caché, incluidas cerradas)

---

### Test 5: SincronizarCache

```vba
? CacheNCProyecto.SincronizarCache
```

**Esperado:** `True`

---

## 6. Informe de Cambios UI

### 6.1 Controles añadidos

| Control | Tipo | Propiedades clave |
| :--- | :--- | :--- |
| btnActualizarListado | Botón | Caption: "Actualizar", visible: true |

---

## 7. Notas de Implementación

- Patrón de manejo de errores obligatorio (PRD-006)
- El filtrado usa LIKE con comodines para textos
- Fechas se comparan con formato ISO: #yyyy-mm-dd#
- No usar filtrado en memoria: siempre SQL sobre caché