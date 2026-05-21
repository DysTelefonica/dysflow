Option Compare Database
Option Explicit
Public Event Seleccionado(p_Suministrador As Suministrador)
Private m_SuministracionSeleccionado As Suministrador
Private WithEvents m_FormSuministrador As Form_FormSuministrador
Public Event Eliminar()
Public Event Alta(p_ID As String)
Public Event Editado()
Public Event Seleccionar(m_GradoClasificacionSeleccionado As GradoClasificacion)
Private m_Error As String


Private Sub cmdElegir_Click()
     On Error GoTo errores
    m_Error = ""
    If m_SuministracionSeleccionado Is Nothing Then
        Exit Sub
    End If
    RaiseEvent Seleccionar(m_SuministracionSeleccionado)
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
    Dim m_Suministrador As Suministrador
    Dim m_ID As Variant
    Dim lst As ListBox
   
    On Error GoTo errores
    
    p_Error = ""
    Set m_SuministracionSeleccionado = Nothing
    Me.ComandoEliminar.Enabled = False
    Me.ComandoEditar.Enabled = False
    Set lst = Me.ListaFiltrados
    lst.RowSource = "IDSuministrador;CIF;Nombre"
    
    Avance "Obteniendo los RACes Filtrados"
    Set m_Col = m_ObjEntorno.Suministradores
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_Suministrador = m_Col(m_ID)
        If Nz(Me.PalabraClave, "") <> "" Then
            If InStr(1, m_Suministrador.Nombre, Me.PalabraClave) = 0 And _
               InStr(1, m_Suministrador.CIF, Me.PalabraClave) = 0 Then
                GoTo siguiente
            End If
        End If
        lst.AddItem m_Suministrador.IDSuministrador & ";" & Replace(m_Suministrador.CIF, ";", ":") & ";" & _
                Replace(m_Suministrador.Nombre, ";", ":")
siguiente:
        Set m_Suministrador = Nothing
    Next
    lst.Selected(1) = True
    ListaFiltrados_Click
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Filtrar ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Private Sub ComandoAlta_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    
    Set m_ObjSuministradorActivo = Nothing
    
    If FormularioAbierto("FormSuministrador") Then
        DoCmd.Close acForm, "FormSuministrador", acSaveNo
    End If
    DoCmd.OpenForm "FormSuministrador"
    If FormularioAbierto("FormSuministrador") Then
        Set m_FormSuministrador = Forms("FormSuministrador")
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAlta_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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

Private Sub ComandoEliminar_Click()

    Dim m_SuministradorOP As SuministradorOperaciones
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
   
    If m_SuministracionSeleccionado Is Nothing Then
        Set m_SuministracionSeleccionado = constructor.getSuministrador(p_IDSuministrador:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_SuministracionSeleccionado Is Nothing Then
            m_Error = "Se ha de seleccionar un Elemento de la lista"
            Err.Raise 1000
        End If
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    pregunta = MsgBox("¿Desea realmente borrar el Suministrador seleccionado?", vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar")
    If pregunta <> vbYes Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Set m_SuministradorOP = New SuministradorOperaciones
    With m_SuministradorOP
        Set .Suministrador = m_SuministracionSeleccionado
        .Eliminar m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        RaiseEvent Eliminar
    End With
    ComandoBuscar_Click
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEliminar_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoLimpiar_Click()
    Me.PalabraClave = Null
    ComandoBuscar_Click
End Sub

Private Sub ComandoEditar_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    
    If m_SuministracionSeleccionado Is Nothing Then
        Set m_SuministracionSeleccionado = constructor.getSuministrador(p_IDSuministrador:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_SuministracionSeleccionado Is Nothing Then
            m_Error = "Se ha de seleccionar un Elemento de la lista"
            Err.Raise 1000
        End If
    End If
    Set m_ObjSuministradorActivo = m_SuministracionSeleccionado
    
    If FormularioAbierto("FormSuministrador") Then
        DoCmd.Close acForm, "FormSuministrador", acSaveNo
    End If
    DoCmd.OpenForm "FormSuministrador"
    If FormularioAbierto("FormSuministrador") Then
        Set m_FormSuministrador = Forms("FormSuministrador")
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEditar_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


'Private Sub ComandoSeleccionar_Click()
'    On Error GoTo errores
'
'    VBA.DoEvents
'    DoCmd.Hourglass True
'    VBA.DoEvents
'
'    m_Error = ""
'
'    If m_SuministracionSeleccionado Is Nothing Then
'        Set m_SuministracionSeleccionado = constructor.getSuministrador(p_IDSuministrador:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
'        If m_Error <> "" Then
'            Err.Raise 1000
'        End If
'        If m_SuministracionSeleccionado Is Nothing Then
'            m_Error = "Se ha de seleccionar un Elemento de la lista"
'            Err.Raise 1000
'        End If
'    End If
'    RaiseEvent Seleccionado(m_SuministracionSeleccionado)
'    DoCmd.Close acForm, Me.Name, acSaveNo
'    VBA.DoEvents
'    DoCmd.Hourglass False
'    VBA.DoEvents
'    Exit Sub
'errores:
'    If Err.Number <> 1000 Then
'        m_Error = "Al ComandoSeleccionar_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
'        On Error Resume Next
'        CorreoAlAdministrador m_Error
'    End If
'
'    DoCmd.Hourglass False
'    pregunta = MsgBox(m_Error, vbCritical, "Error")
'End Sub

Private Sub Form_Open(Cancel As Integer)
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    Ajustar Me
    
    Me.ComandoAlta.Enabled = False
    Me.ComandoEditar.Enabled = False
    Me.ComandoEliminar.Enabled = False
    Me.Caption = m_TituloFormulario
    If EsAdministrador = EnumSiNo.Sí Then
        Me.ComandoAlta.Enabled = True
        Me.ComandoAlta.SetFocus
    End If
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
    Me.ComandoEditar.Enabled = False
    Me.ComandoEliminar.Enabled = False
    
    If Nz(Me.ListaFiltrados.Column(0), "") = "" Then
        Set m_SuministracionSeleccionado = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_SuministracionSeleccionado Is Nothing Then
        Set m_SuministracionSeleccionado = constructor.getSuministrador(p_IDSuministrador:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
       
    Else
        If Me.ListaFiltrados.Column(0) <> m_SuministracionSeleccionado.IDSuministrador Then
            Set m_SuministracionSeleccionado = constructor.getSuministrador(p_IDSuministrador:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
            
        End If
    End If
    If m_SuministracionSeleccionado Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Me.ComandoEditar.Enabled = True
    If EsAdministrador = EnumSiNo.Sí Then
        Me.ComandoEliminar.Enabled = True
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
    If Me.ComandoEditar.Enabled = True Then
        ComandoEditar_Click
    End If
    Application.Echo True
End Sub

Private Sub m_FormSuministrador_Alta(p_ID As String)
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    
    ComandoBuscar_Click
    RaiseEvent Alta(p_ID)
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormSuministrador_Alta se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub m_FormSuministrador_Editado()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    
    ComandoBuscar_Click
    RaiseEvent Editado
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormSuministrador_Editado se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub PalabraClave_KeyDown(KeyCode As Integer, Shift As Integer)
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
