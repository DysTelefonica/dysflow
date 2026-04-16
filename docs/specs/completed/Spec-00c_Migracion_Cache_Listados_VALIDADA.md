# Spec-00c: Migración de Esquema - TbCacheListadoNC con Campos Aplanados

**Estado:** ✅ CERRADA
**Prioridad:** Crítica (bloqueante)
**Tipo:** Migración de esquema
**Módulos PRD afectados:** PRD-01_NC_Proyectos
**Spec padre:** —
**Specs relacionadas:** Spec-003
**RFC origen:** RFC-001
**Plan origen:** PLAN-002 (T-00c)
**Fecha de creación:** 2026-03-16
**Fecha de cierre:** 2026-03-16
**Validación:** ✅ VALIDADA EN ACCESS por usuario

---

## 1. Resumen Técnico

- **Problema / Necesidad:** Crear/modificar la tabla TbCacheListadoNC para almacenar un registro por NC con campos aplanados para filtrado SQL.
- **Solución propuesta:** Recrear la tabla con la nueva estructura de campos.
- **Dependencias:** Ninguna (tarea de infraestructura)

---

## 2. Historia de Usuario

> Como sistema, quiero almacenar cada NC con campos aplanados en una tabla para que el formulario de gestión pueda filtrar directamente con SQL.

---

## 3. Análisis de Impacto

### 3.1 Tabla a crear/modificar

| Tabla | Cambio | Detalle |
| :--- | :--- | :--- |
| TbCacheListadoNC | Recrear | Un registro por NC con campos aplanados |

### 3.2 Estructura de TbCacheListadoNC

| Campo | Tipo | Nullable | Notas |
|-------|------|----------|-------|
| IDNoConformidad | Long | No | PK |
| CodigoNoConformidad | Text(50) | No | |
| IDExpediente | Text(50) | Sí | |
| Nemotecnico | Text(255) | Sí | |
| CodExp | Text(50) | Sí | |
| JuridicaExp | — | NO | Eliminado por cambio de req. |
| IDTipo | Long | Sí | FK a tabla de tipos |
| Descripcion | Text(255) | Sí | |
| Notas | Memo | Sí | |
| Estado | Text(50) | Sí | |
| FechaApertura | DateTime | Sí | |
| FechaCierre | DateTime | Sí | |
| RequiereControlEficacia | Text(2) | Sí | Si/No |
| ControlEficacia | Text(2) | Sí | Si/No |
| ResponsableTelefonica | Text(255) | Sí | |
| RESPONSABLECALIDAD | Text(255) | Sí | |
| ACR | Text(50) | Sí | |
| Cerrada | Boolean | Sí | Derivado de FechaCierre |
| FechaCache | DateTime | Sí | |
| CacheValida | Boolean | Sí | Default: True |

---

## 4. Diseño de la Solución

### 4.1 Script de migración

```sql
' Paso 1: Si existe TbCacheListadoNC, renombrar (backup)
IF EXISTS (SELECT * FROM MSysObjects WHERE Name = 'TbCacheListadoNC') THEN
    ALTER TABLE TbCacheListadoNC RENAME TO TbCacheListadoNC_Backup_YYYYMMDD
END IF

' Paso 2: Crear nueva tabla
CREATE TABLE TbCacheListadoNC (
    IDNoConformidad LONG PRIMARY KEY,
    CodigoNoConformidad VARCHAR(50) NOT NULL,
    IDExpediente VARCHAR(50),
    Nemotecnico VARCHAR(255),
    CodExp VARCHAR(50),
    -- JuridicaExp ELIMINADO
    IDTipo LONG,
    Descripcion VARCHAR(255),
    Notas MEMO,
    Estado VARCHAR(50),
    FechaApertura DATETIME,
    FechaCierre DATETIME,
    RequiereControlEficacia VARCHAR(2),
    ControlEficacia VARCHAR(2),
    ResponsableTelefonica VARCHAR(255),
    RESPONSABLECALIDAD VARCHAR(255),
    ACR VARCHAR(50),
    Cerrada BOOLEAN,
    FechaCache DATETIME,
    CacheValida BOOLEAN DEFAULT TRUE
)
```

### 4.2 Proceso de migración en VBA

> **Nota:** Este patrón está basado en `CacheNCProyecto.bas` (función `EnsureCacheSchema`).

```vba
Public Function MigrarTbCacheListadoNC(Optional ByRef p_Error As String) As Boolean
    Dim db As DAO.Database
    Dim tdf As DAO.TableDef
    Dim fld As DAO.Field
    Dim idx As DAO.Index

    On Error GoTo errores
    p_Error = ""
    Set db = CurrentDb()

    ' 1. Backup si existe (renombrar)
    On Error Resume Next
    db.TableDefs.Delete "TbCacheListadoNC_Backup"
    On Error GoTo errores

    If TablaExiste(db, "TbCacheListadoNC") Then
        db.TableDefs("TbCacheListadoNC").Name = "TbCacheListadoNC_Backup"
        db.TableDefs.Refresh
    End If

    ' 2. Crear nueva tabla
    Set tdf = db.CreateTableDef("TbCacheListadoNC")

    ' IDNoConformidad (PK)
    Set fld = tdf.CreateField("IDNoConformidad", dbLong)
    tdf.Fields.Append fld

    ' CodigoNoConformidad
    Set fld = tdf.CreateField("CodigoNoConformidad", dbText, 50)
    tdf.Fields.Append fld

    ' IDExpediente
    Set fld = tdf.CreateField("IDExpediente", dbText, 50)
    tdf.Fields.Append fld

    ' Nemotecnico
    Set fld = tdf.CreateField("Nemotecnico", dbText, 255)
    tdf.Fields.Append fld

    ' CodExp
    Set fld = tdf.CreateField("CodExp", dbText, 50)
    tdf.Fields.Append fld

    ' JuridicaExp ELIMINADO

    ' IDTipo
    Set fld = tdf.CreateField("IDTipo", dbLong)
    tdf.Fields.Append fld

    ' Descripcion
    Set fld = tdf.CreateField("Descripcion", dbText, 255)
    tdf.Fields.Append fld

    ' Notas
    Set fld = tdf.CreateField("Notas", dbMemo)
    tdf.Fields.Append fld

    ' Estado
    Set fld = tdf.CreateField("Estado", dbText, 50)
    tdf.Fields.Append fld

    ' FechaApertura
    Set fld = tdf.CreateField("FechaApertura", dbDate)
    tdf.Fields.Append fld

    ' FechaCierre
    Set fld = tdf.CreateField("FechaCierre", dbDate)
    tdf.Fields.Append fld

    ' RequiereControlEficacia
    Set fld = tdf.CreateField("RequiereControlEficacia", dbText, 2)
    tdf.Fields.Append fld

    ' ControlEficacia
    Set fld = tdf.CreateField("ControlEficacia", dbText, 2)
    tdf.Fields.Append fld

    ' ResponsableTelefonica
    Set fld = tdf.CreateField("ResponsableTelefonica", dbText, 255)
    tdf.Fields.Append fld

    ' ResponsableCalidad
    Set fld = tdf.CreateField("ResponsableCalidad", dbText, 255)
    tdf.Fields.Append fld

    ' ACR
    Set fld = tdf.CreateField("ACR", dbText, 50)
    tdf.Fields.Append fld

    ' Cerrada
    Set fld = tdf.CreateField("Cerrada", dbBoolean)
    tdf.Fields.Append fld

    ' FechaCache
    Set fld = tdf.CreateField("FechaCache", dbDate)
    tdf.Fields.Append fld

    ' CacheValida
    Set fld = tdf.CreateField("CacheValida", dbBoolean)
    tdf.Fields.Append fld

    ' 3. Crear índice Primary
    Set idx = tdf.CreateIndex("PrimaryKey")
    idx.Fields.Append idx.CreateField("IDNoConformidad")
    idx.Primary = True
    tdf.Indexes.Append idx

    ' 4. Guardar tabla
    db.TableDefs.Append tdf
    db.TableDefs.Refresh

    MigrarTbCacheListadoNC = True
    Exit Function

errores:
    p_Error = "Error en MigrarTbCacheListadoNC: " & Err.Description
    MigrarTbCacheListadoNC = False
End Function
```

### 4.3 Idempotencia

- El script/proceso debe poder ejecutarse múltiples veces sin error
- Si la tabla ya tiene la estructura correcta, no hace nada

---

## 5. Criterios de Aceptación

- [x] Script de migración ejecuta sin errores en Access de prueba
- [x] Proceso es idempotente (ejecutar 2 veces no falla)
- [x] Tabla TbCacheListadoNC tiene todos los campos definidos
- [x] PK funciona correctamente (no permite duplicados)
- [x] Tabla vacía tras migración (se poblará con Spec-003)
- [x] Backup de tabla anterior si existía
- [x] VALIDADO EN ACCESS: Spec-00c

---

## 6. Tests de Validación en Access

Ejecutar estos tests en el orden indicado. Cada test es independiente.

### Test 1: Ejecutar migración

```vba
' En ventana Inmediato:
? MigrarTbCacheListadoNC
```

**Esperado:** `True`

---

### Test 2: Verificar tabla existe

```vba
' En ventana Inmediato:
' Método 1: intentar acceder a la tabla
Dim db As DAO.Database
Set db = CurrentDb
On Error Resume Next
Dim tdf As TableDef
set tdf = db.TableDefs("TbCacheListadoNC")
If Err.Number = 0 And Not tdf Is Nothing Then
    Debug.Print "Tabla existe: True"
Else
    Debug.Print "Tabla existe: False"
End If
On Error GoTo 0
```

**Esperado:** "Tabla existe: True"

---

### Test 3: Verificar campos

```vba
' En ventana Inmediato:
Debug.Print "Campos en TbCacheListadoNC:"
Dim db As DAO.Database, tdf As TableDef, fld As Field
Set db = CurrentDb
Set tdf = db.TableDefs("TbCacheListadoNC")
For Each fld In tdf.Fields
    Debug.Print " - " & fld.Name & " (" & fld.Type & ")"
Next
```

**Esperado:** 19 campos listados:
- IDNoConformidad, CodigoNoConformidad, IDExpediente, Nemotecnico, CodExp
- IDTipo, Descripcion, Notas, Estado
- FechaApertura, FechaCierre, RequiereControlEficacia, ControlEficacia
- ResponsableTelefonica, RESPONSABLECALIDAD, ACR, Cerrada
- FechaCache, CacheValida

---

### Test 4: Verificar Primary Key

```vba
' En ventana Inmediato:
Debug.Print "Índices:"
Dim idx As Index
For Each idx In tdf.Indexes
    Debug.Print " - " & idx.Name & " (Primary: " & idx.Primary & ")"
Next
```

**Esperado:** PrimaryKey con Primary = True

---

### Test 5: Verificar tabla vacía

```vba
' En ventana Inmediato:
Dim db As DAO.Database, rs As DAO.Recordset
Set db = CurrentDb
Set rs = db.OpenRecordset("SELECT COUNT(*) AS Total FROM TbCacheListadoNC")
Debug.Print "Total registros: " & rs!Total
rs.Close
```

**Esperado:** "Total registros: 0"

---

### Test 6: Verificar idempotencia (ejecutar 2ª vez)

```vba
' En ventana Inmediato:
? MigrarTbCacheListadoNC
```

**Esperado:** `True` (no falla, no crea duplicados)

---

### Test 7: Verificar backup si existía

```vba
' Si existía TbCacheListadoNC antes:
Dim db As DAO.Database
Set db = CurrentDb
On Error Resume Next
Dim tdf As TableDef
Set tdf = db.TableDefs("TbCacheListadoNC_Backup")
If Err.Number = 0 And Not tdf Is Nothing Then
    Debug.Print "Backup existe: True"
Else
    Debug.Print "Backup existe: False"
End If
On Error GoTo 0
```

**Esperado:** "Backup existe: True" (si había datos) o "False" (si no había)

---

## 7. Rollback

| Acción | Descripción |
|--------|-------------|
| Restaurar backup | Si falla, renombrar TbCacheListadoNC_Backup de vuelta |

---

## 7. Notas de Implementación

- Usar DAO para crear tabla (no DDL puro)
- Verificar que no hay datos importantes antes de hacer backup
- La tabla debe estar vacía tras migración (los datos se generan en Spec-003)