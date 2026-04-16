# PRD-06: Tratamiento de Errores

**Estado:** Aprobado
**Fecha:** 2026-03-15
**Tipo:** Transversal (todos los módulos)

---

## 1. Visión General

### Propósito
Establecer un patrón unificado de manejo de errores en todo el proyecto VBA/Access que diferencie errores de sistema de errores de negocio controlados.

### Justificación
- Actualmente no existe documentación formal del patrón de errores
- Es un requerimiento transversal que afecta a TODOS los módulos
- Garantiza consistencia en el tratamiento de errores entre desarrolladores

---

## 2. Patrón Actual Detectado (ya implementado)

1. **Functions:** Usan `Optional ByRef p_Error As String` como último parámetro
2. **Errores controlados:** `Err.Raise 1000` para propagar errores de negocio
3. **Subs (Form_Load):** Manejo diferenciado según `Err.Number`

---

## 3. Requerimientos Funcionales

### RF-01: Parámetro de Error en Functions
Toda función pública debe tener el parámetro de error como último argumento:
```vba
Public Function MiFuncion(arg1 As String, arg2 As Long, Optional ByRef p_Error As String) As Boolean
```

**Validaciones:**
- [x] p_Error es siempre el **último** parámetro
- [x] p_Error es siempre **ByRef** (nunca ByVal)
- [x] p_Error es siempre de tipo **String**
- [x] p_Error es siempre **Optional**

### RF-02: Propagación de Errores en Functions
Cuando una función llamada devuelve p_Error <> "", debe propagarse:
```vba
resultado = FuncionInterna(arg, err)
If err <> "" Then
    Err.Raise 1000
End If
```

### RF-03: Error 1000 como Error Controlado
- **Errores de sistema:** Números estándar (3021, 3078, etc.)
- **Error 1000:** Error controlado de negocio (no es error de VBA)

### RF-04: Manejo de Errores en Subs (Form_Load)
```vba
Private Sub Form_Load()
    On Error GoTo errores
    
    ' ... código ...
    Exit Sub
    
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        MsgBox m_Error, vbCritical, "Error"
    Else
        MsgBox m_Error, vbExclamation, "Advertencia"
    End If
End Sub
```

**Validaciones:**
- [x] Usar `On Error GoTo errores`
- [x] Always set `DoCmd.Hourglass False` in error handler
- [x] Si Err.Number <> 1000 → vbCritical + CorreoAlAdministrador
- [x] Si Err.Number = 1000 → vbExclamation (sin email)

---

## 4. Reglas de Access VBA

### RR-01: Crear Primary Key con DAO
**Error común:** `fld.Attributes = dbPrimaryKey` (da error de compilación)

**Correcto:**
```vba
Dim idx As dao.Index
Set idx = tdf.CreateIndex("PrimaryKey")
idx.Fields.Append idx.CreateField("IDNoConformidad")
idx.Primary = True
tdf.Indexes.Append idx
```

### RR-02: Cerrar Recordsets en Access VBA (DAO)

**INCORRECTO:**
```vba
If rs.Status = dbStateOpen Then rs.Close  ' NO EXISTE en Access VBA
```

**CORRECTO:**
```vba
If Not rs Is Nothing Then
    rs.Close
    Set rs = Nothing
End If
```

---

## 5. Documentación Relacionada

- `docs/lecciones-aprendidas/LECCIONES_VBA.md`

---

*Documento generado: 2026-03-15*