Option Compare Database
Option Explicit

Public Event AltaTipo(m_Tipo As TipologiaNCProyectos)
Public Event EdicionTipo(m_Tipo As TipologiaNCProyectos)

Private m_TipologiaAlInicio As TipologiaNCProyectos
Private m_Error As String


Public Function HaHabidoCambios(Optional ByRef p_Error As String) As EnumSino
    
    On Error GoTo errores
    
    If m_TipologiaAlInicio Is Nothing Then
        HaHabidoCambios = EnumSino.Sí
        Exit Function
    End If
    With m_TipologiaAlInicio
        
        If .Tipologia <> Nz(Me.Tipologia, "") Then
            HaHabidoCambios = EnumSino.Sí
            Exit Function
        End If
    End With
    HaHabidoCambios = EnumSino.No
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HaHabidoCambios ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function EstablecerDatos(Optional ByRef p_Error As String) As String
    
    Dim m_Titulo As String
    
    On Error GoTo errores
    
    If Not m_ObjTipologiaProyectoActiva Is Nothing Then
        m_Titulo = "Edición de tipología"
        Set m_TipologiaAlInicio = constructor.getTipologiaNCProyecto(p_IDTipo:=m_ObjTipologiaProyectoActiva.IDTipo, p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_TipologiaAlInicio Is Nothing Then
            p_Error = "No parece estar registrada la tipología"
            Err.Raise 1000
        End If
    Else
         m_Titulo = "Alta de tipología"
        
    End If
    Me.lblTitulo1.Caption = m_Titulo
    Me.Caption = Me.lblTitulo1.Caption
    If m_TipologiaAlInicio Is Nothing Then
        If EsTecnico = EnumSino.Sí Then
            Me.AllowEdits = False
            Me.ComandoRegistrar.Enabled = False
        Else
            Me.AllowEdits = True
            Me.ComandoRegistrar.Enabled = True
        End If
        Exit Function
    End If
    With m_TipologiaAlInicio
        
        If .Tipologia <> "" Then
            Me.Tipologia = .Tipologia
        End If
    End With
    If EsTecnico = EnumSino.Sí Then
        Me.AllowEdits = False
        Me.ComandoRegistrar.Enabled = False
    Else
        Me.AllowEdits = True
        Me.ComandoRegistrar.Enabled = True
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function RellenarObjetoConDatosFormulario(Optional ByRef p_Error As String) As String
    
    
    On Error GoTo errores
    If m_ObjTipologiaProyectoActiva Is Nothing Then
        Set m_ObjTipologiaProyectoActiva = New TipologiaNCProyectos
    End If
    With m_ObjTipologiaProyectoActiva
        
        .Tipologia = Nz(Me.Tipologia, "")
    End With
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarObjetoConDatosFormulario ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Private Sub cmdSalir_Click()
    Dim m_HaHabidoCambios As EnumSino
    On Error GoTo errores
    m_Error = ""
    If Me.ComandoRegistrar.Enabled = False Then
        DoCmd.Close acForm, Me.Name, acSaveNo
        Exit Sub
    End If
    If EsTecnico = EnumSino.Sí Then
        DoCmd.Close acForm, Me.Name, acSaveNo
        Exit Sub
    End If
    If m_TipologiaAlInicio Is Nothing Then
        DoCmd.Close acForm, Me.Name, acSaveNo
        Exit Sub
    End If
    m_HaHabidoCambios = HaHabidoCambios(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_HaHabidoCambios = EnumSino.Sí Then
        pregunta = MsgBox("¿Desea guardar los cambios antes de salir", vbExclamation + vbYesNo + vbDefaultButton1, "Guardar Cambios")
        If pregunta <> vbYes Then
            DoCmd.Close acForm, Me.Name, acSaveNo
            Exit Sub
        End If
        RellenarObjetoConDatosFormulario m_Error
        If m_Error <> "" Then
            Err.Raise 100
        End If
        
        m_ObjTipologiaProyectoActiva.Registrar m_TipologiaAlInicio, m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_TipologiaAlInicio Is Nothing Then
            RaiseEvent AltaTipo(m_ObjTipologiaProyectoActiva)
        Else
            RaiseEvent EdicionTipo(m_ObjTipologiaProyectoActiva)
        End If
    End If
    DoCmd.Close acForm, Me.Name, acSaveNo
    
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al cmdSalir_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Private Sub ComandoRegistrar_Click()
    Dim m_HaHabidoCambios As EnumSino
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    m_HaHabidoCambios = HaHabidoCambios(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_HaHabidoCambios = EnumSino.No Then
        m_Error = "No hay cambios que guardar"
        Err.Raise 1000
    End If
    RellenarObjetoConDatosFormulario m_Error
    If m_Error <> "" Then
        Err.Raise 100
    End If
    
    m_ObjTipologiaProyectoActiva.Registrar m_TipologiaAlInicio, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_TipologiaAlInicio Is Nothing Then
        RaiseEvent AltaTipo(m_ObjTipologiaProyectoActiva)
    Else
        RaiseEvent EdicionTipo(m_ObjTipologiaProyectoActiva)
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    DoCmd.Close acForm, Me.Name, acSaveNo
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoRegistrar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If

End Sub
Private Sub Form_Open(Cancel As Integer)
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Ajustar Me
    
    
    
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
        m_Error = "Al Form_Open se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

