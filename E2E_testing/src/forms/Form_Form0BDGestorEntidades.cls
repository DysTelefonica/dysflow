Option Compare Database
Option Explicit
Private m_Error As String

Private Sub cmdSalir_Click()
    
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Function EstablecerLista(Optional ByRef p_Error As String) As String
    
    Dim lst As ListBox
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_Opcion As String
    
    On Error GoTo errores
    Set lst = Me.ListaOtrasOpciones
    lst.RowSource = ""
    Set m_Col = m_ObjEntorno.OtrasOpciones
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    For Each m_ID In m_Col
        m_Opcion = m_Col(m_ID)
        lst.AddItem m_ID & ";" & m_Opcion
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerLista ha devuelto el error: " & Err.Description
    End If
End Function

Private Sub ComandoAbrirFormulario_Click()
    
    Dim m_NombreFormulario As String
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    Me.ComandoAbrirFormulario.Enabled = False
    If Nz(Me.ListaOtrasOpciones.Column(0), "") = "" Then
        m_Error = "No se ha seleccionado ninguna opción"
        Err.Raise 1000
    End If
    m_NombreFormulario = m_ObjEntorno.OtrasOpcionesFormularios(CStr(Me.ListaOtrasOpciones.Column(0)))
    If m_NombreFormulario = "" Then
        m_Error = "No se ha seleccionado ninguna entidad reconocida"
        Err.Raise 1000
    End If
    DoCmd.OpenForm m_NombreFormulario
    ListaOtrasOpciones_Click
    DoCmd.Close acForm, Me.Name, acSaveNo
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAbrirFormulario_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoAyuda_Click()
    On Error GoTo errores
    m_Error = ""
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    AbrirAyuda m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
     If Err.Number <> 1000 Then
        m_Error = "Al ComandoAyuda_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub Form_Open(Cancel As Integer)
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Ajustar Me
    
    If Application.TempVars("EnDesarrollo") <> "Sí" Then
        DoCmd.ShowToolbar "Ribbon", acToolbarNo
    Else
        DoCmd.ShowToolbar "Ribbon", acToolbarYes
    End If
    Me.Caption = m_TituloFormulario
    Me.ComandoAbrirFormulario.Enabled = True
    EstablecerLista m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Open se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Sub ListaOtrasOpciones_Click()
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    Me.ComandoAbrirFormulario.Enabled = False
    If Nz(Me.ListaOtrasOpciones.Column(0), "") <> "" Then
        Me.ComandoAbrirFormulario.Enabled = True
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ListaOtrasOpciones_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ListaOtrasOpciones_DblClick(Cancel As Integer)
    
    On Error Resume Next
    If Me.ComandoAbrirFormulario.Enabled = True Then
        ComandoAbrirFormulario_Click
    End If
End Sub