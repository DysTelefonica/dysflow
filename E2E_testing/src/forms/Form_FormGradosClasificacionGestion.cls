Option Compare Database
Option Explicit
Private m_GradoClasificacionSeleccionado As GradoClasificacion
Private WithEvents m_FormGradoClasificacion As Form_FormGradoClasificacion
Public Event Eliminar()
Public Event Seleccionar(m_GradoClasificacionSeleccionado As GradoClasificacion)
Private m_Error As String


Private Sub cmdElegir_Click()
     On Error GoTo errores
    m_Error = ""
    If m_GradoClasificacionSeleccionado Is Nothing Then
        Exit Sub
    End If
    RaiseEvent Seleccionar(m_GradoClasificacionSeleccionado)
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
    Dim m_GradoClasificacion As GradoClasificacion
    Dim m_ID As Variant
    Dim lst As ListBox
   
    On Error GoTo errores
    
    p_Error = ""
    Set m_GradoClasificacionSeleccionado = Nothing
    Me.ComandoEliminar.Enabled = False
    Me.ComandoEditar.Enabled = False
    Set lst = Me.ListaFiltrados
    lst.RowSource = "IDGradoClasificacion;GRADO;DESCRIPCIÓN"
    
    Avance "Obteniendo los GradoClasificacions Filtrados"
    Set m_Col = m_ObjEntorno.GradosClasificaciones
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    
    For Each m_ID In m_Col
        Set m_GradoClasificacion = m_Col(m_ID)
        If Nz(Me.GradoClasificacion, "") <> "" Then
            If InStr(1, m_GradoClasificacion.GradoClasificacion, Me.GradoClasificacion) = 0 Then
                GoTo siguiente
            End If
        End If
        lst.AddItem m_GradoClasificacion.IdGradoClasificacion & ";" & _
                    Replace(m_GradoClasificacion.GradoClasificacion, ";", ":") & _
                    ";" & Replace(m_GradoClasificacion.DESCRIPCION, ";", ":")
siguiente:
        Set m_GradoClasificacion = Nothing
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
    
    Set m_ObjGradoClasificacionActivo = Nothing
    
    If FormularioAbierto("FormGradoClasificacion") Then
        DoCmd.Close acForm, "FormGradoClasificacion", acSaveNo
    End If
    DoCmd.OpenForm "FormGradoClasificacion"
    If FormularioAbierto("FormGradoClasificacion") Then
        Set m_FormGradoClasificacion = Forms("FormGradoClasificacion")
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

    Dim m_GradoClasificacionOp As GradoClasificacionOperaciones
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If m_GradoClasificacionSeleccionado Is Nothing Then
        Set m_GradoClasificacionSeleccionado = constructor.getGradoClasificacion(p_IdGradoClasificacion:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_GradoClasificacionSeleccionado Is Nothing Then
            m_Error = "Se ha de seleccionar un Elemento de la lista"
            Err.Raise 1000
        End If
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    pregunta = MsgBox("¿Desea realmente borrar al GradoClasificacion seleccionado?", vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar")
    If pregunta <> vbYes Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Set m_GradoClasificacionOp = New GradoClasificacionOperaciones
    With m_GradoClasificacionOp
        Set .GradoClasificacion = m_GradoClasificacionSeleccionado
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
    Me.GradoClasificacion = Null
    ComandoBuscar_Click
End Sub

Private Sub ComandoEditar_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If m_GradoClasificacionSeleccionado Is Nothing Then
        Set m_GradoClasificacionSeleccionado = constructor.getGradoClasificacion(p_IdGradoClasificacion:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_GradoClasificacionSeleccionado Is Nothing Then
            m_Error = "Se ha de seleccionar un Elemento de la lista"
            Err.Raise 1000
        End If
    End If
    Set m_ObjGradoClasificacionActivo = m_GradoClasificacionSeleccionado
    
    If FormularioAbierto("FormGradoClasificacion") Then
        DoCmd.Close acForm, "FormGradoClasificacion", acSaveNo
    End If
    DoCmd.OpenForm "FormGradoClasificacion"
    If FormularioAbierto("FormGradoClasificacion") Then
        Set m_FormGradoClasificacion = Forms("FormGradoClasificacion")
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


Private Sub GradoClasificacion_Exit(Cancel As Integer)
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
        m_Error = "Al GradoClasificacion_Exit se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
        Set m_GradoClasificacionSeleccionado = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_GradoClasificacionSeleccionado Is Nothing Then
        Set m_GradoClasificacionSeleccionado = constructor.getGradoClasificacion(p_IdGradoClasificacion:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
       
    Else
        If Me.ListaFiltrados.Column(0) <> m_GradoClasificacionSeleccionado.IdGradoClasificacion Then
            Set m_GradoClasificacionSeleccionado = constructor.getGradoClasificacion(p_IdGradoClasificacion:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
            
        End If
    End If
    If m_GradoClasificacionSeleccionado Is Nothing Then
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

Private Sub m_FormGradoClasificacion_Alta()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    Set m_ObjEntorno.GradosClasificaciones = Nothing
    ComandoBuscar_Click
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormGradoClasificacion_Alta se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub m_FormGradoClasificacion_Editado()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    m_Error = ""
    Set m_ObjEntorno.GradosClasificaciones = Nothing
    ComandoBuscar_Click
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormGradoClasificacion_Editado se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub
