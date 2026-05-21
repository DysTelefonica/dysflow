Option Compare Database
Option Explicit
Private m_PECALSeleccionada As PECAL
Private WithEvents m_FormPECAL As Form_FormPECAL
Public Event Eliminar()
Public Event Seleccionar(m_PECALSeleccionada As PECAL)
Private m_Error As String


Private Sub cmdElegir_Click()
    On Error GoTo errores
    m_Error = ""
    If m_PECALSeleccionada Is Nothing Then
        Exit Sub
    End If
    RaiseEvent Seleccionar(m_PECALSeleccionada)
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
    Dim m_Pecal As PECAL
    Dim m_ID As Variant
    Dim lst As ListBox
   
    On Error GoTo errores
    
    p_Error = ""
    Set m_PECALSeleccionada = Nothing
    Me.ComandoEliminar.Enabled = False
    Me.ComandoEditar.Enabled = False
    Set lst = Me.ListaFiltrados
    lst.RowSource = "IDPECAL;PECAL;DESCRIPCIÓN"
    
    Avance "Obteniendo los PECALes Filtrados"
    Set m_Col = m_ObjEntorno.PECALES
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    
    For Each m_ID In m_Col
        Set m_Pecal = m_Col(m_ID)
        If Nz(Me.PECAL, "") <> "" Then
            If InStr(1, m_Pecal.PECAL, Me.PECAL) = 0 Then
                GoTo siguiente
            End If
        End If
        lst.AddItem m_Pecal.IDPECAL & ";" & Replace(m_Pecal.PECAL, ";", ":") & ";" & Replace(m_Pecal.DESCRIPCION, ";", ":")
siguiente:
        Set m_Pecal = Nothing
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
    
    Set m_ObjPECALActiva = Nothing
    
    If FormularioAbierto("FormPECAL") Then
        DoCmd.Close acForm, "FormPECAL", acSaveNo
    End If
    DoCmd.OpenForm "FormPECAL"
    If FormularioAbierto("FormPECAL") Then
        Set m_FormPECAL = Forms("FormPECAL")
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

    Dim m_PECALOp As PECALOperaciones
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If m_PECALSeleccionada Is Nothing Then
        Set m_PECALSeleccionada = constructor.getPecal(p_IDPEcal:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_PECALSeleccionada Is Nothing Then
            m_Error = "Se ha de seleccionar un Elemento de la lista"
            Err.Raise 1000
        End If
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    pregunta = MsgBox("¿Desea realmente borrar la PECAL seleccionada?", vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar")
    If pregunta <> vbYes Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Set m_PECALOp = New PECALOperaciones
    With m_PECALOp
        Set .PECAL = m_PECALSeleccionada
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
    Me.PECAL = Null
    ComandoBuscar_Click
End Sub

Private Sub ComandoEditar_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If m_PECALSeleccionada Is Nothing Then
        Set m_PECALSeleccionada = constructor.getPecal(p_IDPEcal:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_PECALSeleccionada Is Nothing Then
            m_Error = "Se ha de seleccionar un Elemento de la lista"
            Err.Raise 1000
        End If
    End If
    Set m_ObjPECALActiva = m_PECALSeleccionada
    
    If FormularioAbierto("FormPECAL") Then
        DoCmd.Close acForm, "FormPECAL", acSaveNo
    End If
    DoCmd.OpenForm "FormPECAL"
    If FormularioAbierto("FormPECAL") Then
        Set m_FormPECAL = Forms("FormPECAL")
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


Private Sub PECAL_Exit(Cancel As Integer)
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
        m_Error = "Al PECAL_Exit se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
        Set m_PECALSeleccionada = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_PECALSeleccionada Is Nothing Then
        Set m_PECALSeleccionada = constructor.getPecal(p_IDPEcal:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
       
    Else
        If Me.ListaFiltrados.Column(0) <> m_PECALSeleccionada.IDPECAL Then
            Set m_PECALSeleccionada = constructor.getPecal(p_IDPEcal:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
            
        End If
    End If
    If m_PECALSeleccionada Is Nothing Then
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

Private Sub m_FormPECAL_Alta()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    Set m_ObjEntorno.PECALES = Nothing
    ComandoBuscar_Click
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormPECAL_Alta se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub m_FormPECAL_Editado()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    Set m_ObjEntorno.PECALES = Nothing
    ComandoBuscar_Click
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormPECAL_Editado se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub