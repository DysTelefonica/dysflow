# Lecciones Aprendidas - Proyecto No Conformidades

## Reglas de Manejo de Errores

### 1. Patrón de error VBA (p_Error)
Toda función pública tiene el **último** parámetro opcional:
```vba
Optional ByRef p_Error As String
```

**Siempre:**
- p_Error es el **último** parámetro de la firma
- p_Error es **ByRef** (nunca ByVal)

**Quien llama debe verificar:**
1. Retorno de la función (True/False)
2. Además, que p_Error esté vacío

```vba
' Correcto:
If Not MiFuncion(arg, err) Then
    If err <> "" Then
        Err.Raise 1000
    End If
End If
```

### 2. Errores controlados con Err.Raise 1000
- Los errores de sistema son numéricos (ej: 3021, 3078)
- **Los errores 1000 son errores controlados de negocio**
- Se usan para propagar errores desde funciones internas sin perder el mensaje personalizado

### 3. Propagación de errores (Functions)
```vba
Set m_Col = getColSeguimientoPorUsuario(m_ColSegsTareasProyectoPteReplanificar, m_Usuario, p_Error)
If p_Error <> "" Then
    Err.Raise 1000
End If
```

### 4. Tratamiento de errores en Subs (Form_Load)
```vba
Private Sub Form_Load()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    EstablecerDatos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
    
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Load se ha producido el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        MsgBox m_Error, vbCritical, "Error"
    Else
        MsgBox m_Error, vbExclamation, "Advertencia"
    End If
End Sub
```

**Regla:**
- Si Err.Number <> 1000 → error de sistema → msgbox crítico + CorreoAlAdministrador
- Si Err.Number = 1000 → error de negocio controlado → msgbox advertencia (no email)

---

## Reglas de Access VBA

### Cómo cerrar Recordsets en Access VBA (DAO)

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

### Crear Primary Key con DAO
**NO usar:** `fld.Attributes = dbPrimaryKey` (da error de compilación)

**Correcto:**
```vba
Dim idx As dao.Index
Set idx = tdf.CreateIndex("PrimaryKey")
idx.Fields.Append idx.CreateField("IDNoConformidad")
idx.Primary = True
tdf.Indexes.Append idx
```

---

*Fecha: 2026-03-16*