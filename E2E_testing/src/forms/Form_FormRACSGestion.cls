Option Compare Database
Option Explicit
Private m_RACSeleccionado As RAC
Private WithEvents m_FormRAC As Form_FormRAC
Public Event Eliminar()
Public Event Seleccionar(m_RACSeleccionado As RAC)
Private m_Error As String


Private Sub cmdElegir_Click()
    On Error GoTo errores
    m_Error = ""
    If m_RACSeleccionado Is Nothing Then
        Exit Sub
    End If
    RaiseEvent Seleccionar(m_RACSeleccionado)
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
    Dim m_RAC As RAC
    Dim m_ID As Variant
    Dim lst As ListBox
   
    On Error GoTo errores
    
    p_Error = ""
    Set m_RACSeleccionado = Nothing
    Me.ComandoEliminar.Enabled = False
    Me.ComandoEditar.Enabled = False
    Set lst = Me.ListaFiltrados
    lst.RowSource = "IDRAC;RAC"
    
    Avance "Obteniendo los RACes Filtrados"
    Set m_Col = m_ObjEntorno.RACs
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_RAC = m_Col(m_ID)
        If Nz(Me.RAC, "") <> "" Then
            If InStr(1, m_RAC.RAC, Me.RAC) = 0 Then
                GoTo siguiente
            End If
        End If
        lst.AddItem m_RAC.IDRAC & ";" & Replace(m_RAC.RAC, ";", ":")
siguiente:
        Set m_RAC = Nothing
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
    
    Set m_ObjRACActivo = Nothing
    
    If FormularioAbierto("FormRAC") Then
        DoCmd.Close acForm, "FormRAC", acSaveNo
    End If
    DoCmd.OpenForm "FormRAC"
    If FormularioAbierto("FormRAC") Then
        Set m_FormRAC = Forms("FormRAC")
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

    Dim m_RACOp As RACOperaciones
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If m_RACSeleccionado Is Nothing Then
        Set m_RACSeleccionado = constructor.getRAC(p_IDRac:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_RACSeleccionado Is Nothing Then
            m_Error = "Se ha de seleccionar un Elemento de la lista"
            Err.Raise 1000
        End If
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    pregunta = MsgBox("¿Desea realmente borrar el RAC seleccionado?", vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar")
    If pregunta <> vbYes Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Set m_RACOp = New RACOperaciones
    With m_RACOp
        Set .RAC = m_RACSeleccionado
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
    Me.RAC = Null
    ComandoBuscar_Click
End Sub

Private Sub ComandoEditar_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If m_RACSeleccionado Is Nothing Then
        Set m_RACSeleccionado = constructor.getRAC(p_IDRac:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_RACSeleccionado Is Nothing Then
            m_Error = "Se ha de seleccionar un Elemento de la lista"
            Err.Raise 1000
        End If
    End If
    Set m_ObjRACActivo = m_RACSeleccionado
    
    If FormularioAbierto("FormRAC") Then
        DoCmd.Close acForm, "FormRAC", acSaveNo
    End If
    DoCmd.OpenForm "FormRAC"
    If FormularioAbierto("FormRAC") Then
        Set m_FormRAC = Forms("FormRAC")
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
    If Nz(Me.OpenArgs(), "") = "" Then
        Me.cmdElegir.Visible = False
    Else
        Me.cmdElegir.Visible = True
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
        Set m_RACSeleccionado = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_RACSeleccionado Is Nothing Then
        Set m_RACSeleccionado = constructor.getRAC(p_IDRac:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
       
    Else
        If Me.ListaFiltrados.Column(0) <> m_RACSeleccionado.IDRAC Then
            Set m_RACSeleccionado = constructor.getRAC(p_IDRac:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
            
        End If
    End If
    If m_RACSeleccionado Is Nothing Then
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

Private Sub m_FormRAC_Alta()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    
    ComandoBuscar_Click
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormRAC_Alta se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub m_FormRAC_Editado()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    
    ComandoBuscar_Click
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormRAC_Editado se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub RAC_KeyDown(KeyCode As Integer, Shift As Integer)
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