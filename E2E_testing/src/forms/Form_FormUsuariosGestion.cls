Option Compare Database
Option Explicit
Private m_UsuarioSeleccionado As USUARIO

Public Event Seleccionar(m_UsuarioSeleccionado As USUARIO)
Private m_Error As String


Private Sub Activos_Change()
    If Me.ComandoBuscar.Enabled = True Then
        Me.ComandoBuscar.SetFocus
        ComandoBuscar_Click
    End If
End Sub

Private Sub cmdElegir_Click()
    On Error GoTo errores
    m_Error = ""
    If m_UsuarioSeleccionado Is Nothing Then
        Exit Sub
    End If
    RaiseEvent Seleccionar(m_UsuarioSeleccionado)
    DoCmd.Close acForm, Me.Name, acSaveNo
     Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al cmdElegir_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub cmdSalir_Click()
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub


Public Function Filtrar(Optional ByRef p_Error As String) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_Usuario As USUARIO
    Dim m_ID As Variant
    Dim m_Activo As String
    Dim lst As ListBox
   
    On Error GoTo errores
    
    p_Error = ""
    Set m_UsuarioSeleccionado = Nothing
   
    Set lst = Me.ListaFiltrados
    lst.RowSource = "Id;Nombre"
    
    Avance "Obteniendo los usuarios Filtrados"
    Set m_Col = m_ObjEntorno.ColUsuarios
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    If Nz(Me.Activos, "") = "" Then Me.Activos = "Todos"
    
    m_Activo = Me.Activos
    For Each m_ID In m_Col
        Set m_Usuario = m_Col(m_ID)
        If Nz(Me.USUARIO, "") <> "" Then
            If InStr(1, m_Usuario.Nombre, Me.USUARIO) = 0 Then
                GoTo siguiente
            End If
        End If
        If m_Activo <> "" Then
            If m_Activo = "Sí" Then
                If IsDate(m_Usuario.FechaBaja) Then
                    GoTo siguiente
                End If
            ElseIf m_Activo = "No" Then
                If Not IsDate(m_Usuario.FechaBaja) Then
                    GoTo siguiente
                End If
            End If
            If InStr(1, m_Usuario.Nombre, Me.USUARIO) = 0 Then
                GoTo siguiente
            End If
        End If
        lst.AddItem m_Usuario.ID & ";" & m_Usuario.Nombre
siguiente:
        Set m_Usuario = Nothing
    Next
    lst.Selected(1) = True
    ListaFiltrados_Click
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Filtrar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Public Sub ComandoBuscar_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    AvanceCerrar
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoBuscar_Click se ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    AvanceCerrar
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub ComandoLimpiar_Click()
    Me.USUARIO = Null
    Me.Activos = "Todos"
    ComandoBuscar_Click
End Sub



Private Sub Form_Open(Cancel As Integer)
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    Ajustar Me
    
    
    If Nz(Me.OpenArgs(), "") = "" Then
        Me.cmdElegir.Visible = False
    Else
        Me.cmdElegir.Visible = True
    End If
    Me.Activos = "Sí"
    Filtrar m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    AvanceCerrar
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Open se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub


Private Sub ListaFiltrados_Click()
    
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    
    If Nz(Me.ListaFiltrados.Column(0), "") = "" Then
        Set m_UsuarioSeleccionado = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_UsuarioSeleccionado Is Nothing Then
        Set m_UsuarioSeleccionado = constructor.getUsuario(p_ID:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
       
    Else
        If Me.ListaFiltrados.Column(0) <> m_UsuarioSeleccionado.ID Then
            Set m_UsuarioSeleccionado = constructor.getUsuario(p_ID:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
            
        End If
    End If
    If m_UsuarioSeleccionado Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
  
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ListaFiltrados_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
    
End Sub


Private Sub ListaFiltrados_DblClick(Cancel As Integer)
    On Error Resume Next
    Application.Echo False
    If cmdElegir.Visible = True Then
        cmdElegir_Click
        Application.Echo True
        Exit Sub
    End If
    If Me.cmdElegir.Visible = True Then
        cmdElegir_Click
    End If
    Application.Echo True
End Sub

Private Sub USUARIO_KeyDown(KeyCode As Integer, Shift As Integer)
     ' Detectar si se ha pulsado la tecla Enter
    If KeyCode = vbKeyReturn Then
        ' Código que deseas ejecutar cuando se pulse Enter
        
        If Me.ComandoBuscar.Enabled = True Then
            Me.ComandoBuscar.SetFocus
            ComandoBuscar_Click
        End If
        ' Si deseas evitar que Access realice la acción predeterminada de Enter,
        ' puedes utilizar la siguiente línea:
        KeyCode = 0
    End If
End Sub