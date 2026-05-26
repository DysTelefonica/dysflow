Option Compare Database
Option Explicit


Private m_NC As NCProyecto

Public m_ACSeleccionada As ACProyecto
Public m_ARSeleccionada As ARProyecto
Private m_UltimoOrden As String

Private WithEvents m_FormAnexos As Form_FormARProyectoDocumentos
Private WithEvents m_FormAR As Form_FormNCProyectoAR
Private WithEvents m_FormAC As Form_FormNCProyectoAC
Private m_Error As String

Private Sub ComandoACAlta_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If m_ObjNCProyectoActiva.DatosGeneralesOK <> EnumSino.Sí Then
        m_Error = "Debe regularizar primero los datos que faltan en la ficha general"
        Err.Raise 1000
    End If
    
    If FormularioAbierto("FormNCProyectoAC") Then
        DoCmd.Close acForm, "FormNCProyectoAC", acSaveNo
    End If
    Set m_ObjACProyectoActiva = Nothing
    DoCmd.OpenForm "FormNCProyectoAC", OpenArgs:=m_ObjNCProyectoActiva.Estado
    If FormularioAbierto("FormNCProyectoAC") Then
        Set m_FormAC = Forms("FormNCProyectoAC")
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoACAlta_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoACBorrar_Click()
    Dim ACOP As ACProyectoOperaciones
    Dim m_EstadoAlInicio As String
    Dim m_Estado As String
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If m_ACSeleccionada Is Nothing Then
        Set m_ACSeleccionada = constructor.getACProyecto(p_IDAC:=Nz(Me.ListaAC.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ACSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    If m_ACSeleccionada.ARs Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        pregunta = MsgBox("¿Desea borrar la Acción Correctiva Seleccionada?", vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar Acción Correctiva")
        If pregunta <> vbYes Then
            Exit Sub
        End If
        VBA.DoEvents
        DoCmd.Hourglass True
        VBA.DoEvents
    Else
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        pregunta = MsgBox("¿Desea borrar la acción Correctiva seleccionada junto con sus " & _
                    m_ACSeleccionada.ARs.count & " tareas asociadas?", _
                    vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar acción correctiva")
        If pregunta <> vbYes Then
            Exit Sub
        End If
        VBA.DoEvents
        DoCmd.Hourglass True
        VBA.DoEvents
    End If
    Set ACOP = New ACProyectoOperaciones
    With ACOP
        Set .AC = m_ACSeleccionada
        m_EstadoAlInicio = m_ObjNCProyectoActiva.Estado
        .Eliminar m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        Set m_ObjNCProyectoActiva.Replanificaciones = Nothing
        Set m_ObjNCProyectoActiva.ACs = Nothing
        m_Estado = m_ObjNCProyectoActiva.EstadoCalculadoTexto
    End With
    If m_EstadoAlInicio <> "" Then
        If m_EstadoAlInicio <> "Cerrada" Then
            If m_Estado = "Cerrada" Then
                pregunta = MsgBox("La NC de proyecto pasa a estar cerrada ", vbInformation, "Cierre de NC")
            End If
        Else
            If m_EstadoAlInicio = "Cerrada" Then
                If m_Estado <> "Cerrada" Then
                    pregunta = MsgBox("La NC de proyecto ha dejado de estar cerrada ", vbInformation, "Reapertura de NC")
                End If
            End If
        End If
        
    End If
   
    
    EstablecerDatos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If FormularioAbierto("FormNCProyectoGestion") Then
        Form_FormNCProyectoGestion.ActualizarLineaLista
    End If
    VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoACBorrar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoARDocumentos_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    
    If m_ARSeleccionada Is Nothing Then
        Set m_ARSeleccionada = constructor.getARProyecto(p_IDAR:=Nz(Me.ListaAR.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ARSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    If FormularioAbierto("FormARProyectoDocumentos") Then
        DoCmd.Close acForm, "FormARProyectoDocumentos", acSaveNo
    End If
    Set m_ObjARProyectoActiva = m_ARSeleccionada
    DoCmd.OpenForm "FormARProyectoDocumentos"
    If FormularioAbierto("FormARProyectoDocumentos") Then
        Set m_FormAnexos = Forms("FormARProyectoDocumentos")
    End If
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoARDocumentos_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoACEdicion_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If m_ACSeleccionada Is Nothing Then
        Set m_ACSeleccionada = constructor.getACProyecto(p_IDAC:=Nz(Me.ListaAC.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ACSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    If FormularioAbierto("FormNCProyectoAC") Then
        DoCmd.Close acForm, "FormNCProyectoAC", acSaveNo
    End If
    Set m_ObjACProyectoActiva = m_ACSeleccionada
    DoCmd.OpenForm "FormNCProyectoAC"
    If FormularioAbierto("FormNCProyectoAC") Then
        Set m_FormAC = Forms("FormNCProyectoAC")
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoACEdicion_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoACHistorial_Click()
    Dim m_mensaje As String
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If m_ACSeleccionada Is Nothing Then
        Set m_ACSeleccionada = constructor.getACProyecto(p_IDAC:=Nz(Me.ListaAC.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ACSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    m_mensaje = HTMHistorialProyecto(m_ACSeleccionada, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    HTMLENTXT p_HTML:=m_mensaje, p_Error:=m_Error
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
        m_Error = "Al ComandoACHistorial_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoActualizarACs_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    ActualizarDatosACsProyecto m_NC.ACs, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_NC.ACs = Nothing
    EstablecerDatos
    If FormularioAbierto("FormNCProyectoGestion") Then
        Form_FormNCProyectoGestion.ActualizarLineaLista
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
    
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoActualizarACs_Click se ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoActualizarARs_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If m_ACSeleccionada Is Nothing Then
        Set m_ACSeleccionada = constructor.getACProyecto(p_IDAC:=Nz(Me.ListaAC.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ACSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    ActualizarDatosARsProyecto m_ACSeleccionada.ARs, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ACSeleccionada.ARs = Nothing
    Set m_ACSeleccionada = Nothing
    If FormularioAbierto("FormNCProyectoGestion") Then
        Form_FormNCProyectoGestion.ActualizarLineaLista
    End If
    ListaAC_Click
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoActualizarARs_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoARAlta_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If m_ACSeleccionada Is Nothing Then
        Set m_ACSeleccionada = constructor.getACProyecto(p_IDAC:=Nz(Me.ListaAC.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ACSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    If m_ObjNCProyectoActiva.DatosGeneralesOK <> EnumSino.Sí Then
         m_Error = "Debe regularizar primero los datos que faltan en la ficha general"
        Err.Raise 1000
    End If
    If FormularioAbierto("FormNCProyectoAR") Then
        DoCmd.Close acForm, "FormNCProyectoAR", acSaveNo
    End If
    Set m_ObjARProyectoActiva = Nothing
    Set m_ObjACProyectoActiva = m_ACSeleccionada
    DoCmd.OpenForm "FormNCProyectoAR", OpenArgs:=m_ObjNCProyectoActiva.Estado
    If FormularioAbierto("FormNCProyectoAR") Then
        Set m_FormAR = Forms("FormNCProyectoAR")
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoARAlta_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub



Private Sub ComandoARBorrar_Click()
    Dim m_AROp As ARProyectoOperaciones
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If m_ARSeleccionada Is Nothing Then
        Set m_ARSeleccionada = constructor.getARProyecto(p_IDAR:=Nz(Me.ListaAR.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ARSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    pregunta = MsgBox("¿Desea borrar la Acción Realizada Seleccionada?", _
                vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar Acción Realizada")
    If pregunta <> vbYes Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Set m_AROp = New ARProyectoOperaciones
    With m_AROp
        Set .AR = m_ARSeleccionada
        .Eliminar m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    Set m_ObjNCProyectoActiva.Replanificaciones = Nothing
    If Not m_ACSeleccionada Is Nothing Then
        Set m_ACSeleccionada.ARs = Nothing
        Set m_ACSeleccionada = constructor.getACProyecto(p_IDAC:=Me.ListaAR.Column(0), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
            
        End If
        ListaAR_Click
    End If
    ComandoActualizarACs_Click
    If FormularioAbierto("FormNCProyectoGestion") Then
        Form_FormNCProyectoGestion.ActualizarLineaLista
    End If
    
    
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoARBorrar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoAREdicion_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    
    If m_ARSeleccionada Is Nothing Then
        Set m_ARSeleccionada = constructor.getARProyecto(p_IDAR:=Nz(Me.ListaAR.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ARSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    If m_ACSeleccionada Is Nothing Then
        Set m_ACSeleccionada = constructor.getACProyecto(p_IDAC:=Nz(Me.ListaAC.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ACSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    If FormularioAbierto("FormNCProyectoAR") Then
        DoCmd.Close acForm, "FormNCProyectoAR", acSaveNo
    End If
    Set m_ObjARProyectoActiva = m_ARSeleccionada
    Set m_ObjACProyectoActiva = m_ACSeleccionada
    DoCmd.OpenForm "FormNCProyectoAR", OpenArgs:=m_ObjNCProyectoActiva.Estado
    If FormularioAbierto("FormNCProyectoAR") Then
        Set m_FormAR = Forms("FormNCProyectoAR")
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAREdicion_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoARHistorial_Click()
    Dim m_mensaje As String
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If m_ARSeleccionada Is Nothing Then
        Set m_ARSeleccionada = constructor.getARProyecto(p_IDAR:=Nz(Me.ListaAR.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ARSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    m_mensaje = HTMHistorialProyecto(m_ARSeleccionada, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    HTMLENTXT p_HTML:=m_mensaje, p_Error:=m_Error
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
        m_Error = "Al ComandoARHistorial_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub





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
        m_Error = "Al Form_Load se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub
Public Function EstablecerDatos( _
                                    Optional ByRef p_Error As String _
                                    ) As String
   
    
    
    
    Dim m_Col As Scripting.Dictionary
    
    On Error GoTo errores
    If m_ObjNCProyectoActiva Is Nothing Then
         m_Error = "El formulario se ha abierto con parámetros insuficentes"
        Err.Raise 1000
    End If
    Me.AllowEdits = True
    EstablecerCombos p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
        Me.ComandoActualizarACs.Enabled = True
        Me.ComandoActualizarARs.Enabled = True
        If EsTecnico <> EnumSino.Sí Then
            Me.ComandoACAlta.Enabled = True
        Else
            Me.ComandoACAlta.Enabled = False
        End If
        
    Else
        Me.ComandoACAlta.Enabled = False
        Me.ComandoActualizarACs.Enabled = False
        Me.ComandoActualizarARs.Enabled = False
    End If
    If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
        Set m_NC = m_ObjNCProyectoActiva
    Else
        Set m_NC = m_ObjNCProyectoActiva.NCProyectoAsociada
    End If
    Me.ImagenNotaAC.Visible = False
    Me.ImagenNotaAR.Visible = False
    Me.OrdenAC = EnumOrden.PorNAccion
    Me.OrdenAR = EnumOrden.PorNAccion
    EstablecerListaAC p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    EstablecerListaAR p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Private Function EstablecerListaAC( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_EnumOrden As EnumOrden
    Dim m_ACProyecto As ACProyecto
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_Responsable As String
    
    On Error GoTo errores
    Me.ComandoACAlta.Enabled = False
    Me.ComandoACEdicion.Enabled = False
    
    Me.ComandoACBorrar.Enabled = False
    Me.ComandoACHistorial.Enabled = False
    Me.ComandoARAlta.Enabled = False
    Me.ImagenNotaAC.Visible = False
    
    Set lst = Me.ListaAC
    lst.RowSource = "ID;Nº;Acción correctiva;Responsable;F.inicio;F.fin prev.;F.fin real"
    If Form_FormNCProyecto.m_PermitidoEditar <> EnumSino.No Then
        If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
            Me.ComandoACAlta.Enabled = True
        End If
    End If
    m_EnumOrden = Nz(Me.OrdenAC.Column(0), 0)
    
    
    Set m_Col = constructor.getACsProyecto(p_IDNC:=m_ObjNCProyectoActiva.IDNoConformidad, _
                        p_EnumOrden:=m_EnumOrden, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
       Exit Function
    End If
    
    For Each m_ID In m_Col
        Set m_ACProyecto = m_Col(m_ID)
        With m_ACProyecto
            If .ResponsableObj Is Nothing Then
                m_Responsable = ""
            Else
                m_Responsable = .ResponsableObj.Nombre
            End If
            lst.AddItem .IdAccionCorrectiva & ";" & .NAccion & ";" & Replace(.AccionCorrectiva, ";", ":") & ";" & m_Responsable & ";" & .FechaInicialMinima & ";" & _
                        .FechaFinPrevistaUltima & ";" & .FechaFinalUltima
        End With
        
        Set m_ACProyecto = Nothing
    Next
    If lst.ListCount = 1 Then
        Exit Function
    End If
    
    lst.Selected(1) = True
    
    ListaAC_Click
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerListaAC ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Private Function EstablecerListaAR( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_ARProyecto As ARProyecto
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    Dim lst As ListBox
    Dim m_Responsable As String
    Dim m_EnumOrden As EnumOrden
    On Error GoTo errores
    
    Me.ComandoAREdicion.Enabled = False
    Me.ComandoARBorrar.Enabled = False
    Me.ComandoARHistorial.Enabled = False
    Me.ComandoARDocumentos.Enabled = False
   
    Me.ImagenNotaAR.Visible = False
    Set lst = Me.ListaAR
    lst.RowSource = "ID;Nº;Tarea;Responsable;F. inicio;F.fin prev.;F.fin real"
    
    If m_ACSeleccionada Is Nothing Then
        Exit Function
    End If
    m_EnumOrden = Nz(Me.OrdenAR.Column(0), 0)
    
    
    Set m_Col = constructor.getARsDeACProyecto(p_IDAC:=m_ACSeleccionada.IdAccionCorrectiva, _
                        p_EnumOrden:=m_EnumOrden, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    
    
    Me.ComandoARDocumentos.Enabled = True
    For Each m_ID In m_Col
        Set m_ARProyecto = m_Col(m_ID)
        With m_ARProyecto
            If .ResponsableObj Is Nothing Then
                m_Responsable = ""
            Else
                m_Responsable = .ResponsableObj.Nombre
            End If
            lst.AddItem .IDAccionRealizada & ";" & .NAccion & ";" & Replace(.AccionRealizada, ";", ":") & ";" & _
                        m_Responsable & ";" & .FechaInicio & ";" & .FechaFinPrevista & ";" & .FechaFinReal
        End With
        
        Set m_ARProyecto = Nothing
    Next
    If lst.ListCount = 1 Then
        Exit Function
    End If
    
    lst.Selected(1) = True
    ListaAR_Click
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerListaAR ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Private Sub ImagenAnexo_Click()
    Dim m_Documento As DocumentoProyecto
    Dim m_ID As Variant
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    If m_ARSeleccionada Is Nothing Then
        Set m_ARSeleccionada = constructor.getARProyecto(p_IDAR:=Nz(Me.ListaAR.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ARSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista superior"
            Err.Raise 1000
        End If
    End If
    
    If m_ARSeleccionada.Documentos Is Nothing Then
        m_Error = "No parece tener anexos registrados"
        Err.Raise 1000
    End If
    If m_ARSeleccionada.Documentos.count = 1 Then
        For Each m_ID In m_ARSeleccionada.Documentos
            Set m_Documento = m_ARSeleccionada.Documentos(m_ID)
            AbrirEnLocal m_Documento.URLAnexo, m_Error
            If m_Error <> "" Then
                Err.Raise 1000
            End If
            Set m_Documento = Nothing
            VBA.DoEvents
            DoCmd.Hourglass False
            VBA.DoEvents
            Exit Sub
        Next
    End If
    If Me.ComandoARDocumentos.Enabled = True Then
        ComandoARDocumentos_Click
    End If
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ImagenAnexo_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ImagenNotaAC_Click()
    On Error Resume Next
    If Me.ComandoACEdicion.Enabled = True Then
        ComandoACEdicion_Click
    End If
End Sub

Private Sub ImagenNotaAR_Click()
    On Error Resume Next
    If Me.ComandoAREdicion.Enabled = True Then
        ComandoAREdicion_Click
    End If
End Sub

Public Sub ListaAC_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
   
    Me.ComandoAREdicion.Enabled = False
    Me.ImagenNotaAC.Visible = False
    If Nz(Me.ListaAC.Column(0), "") = "" Then
        Set m_ACSeleccionada = Nothing
        EstablecerListaAR
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_ACSeleccionada Is Nothing Then
        Set m_ACSeleccionada = constructor.getACProyecto(p_IDAC:=Nz(Me.ListaAC.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If m_ACSeleccionada.IdAccionCorrectiva <> Me.ListaAC.Column(0) Then
            Set m_ACSeleccionada = constructor.getACProyecto(p_IDAC:=Nz(Me.ListaAC.Column(0), ""), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        End If
    End If
    If Form_FormNCProyecto.m_PermitidoEditar <> EnumSino.No Then
        If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
            If EsTecnico <> EnumSino.Sí Then
                Me.ComandoARAlta.Enabled = True
            End If
        End If
    End If
    Me.ComandoACEdicion.Enabled = True
    Me.ComandoACHistorial.Enabled = True
    If Form_FormNCProyecto.m_PermitidoEditar <> EnumSino.No Then
        If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
            If EsTecnico <> EnumSino.Sí Then
                Me.ComandoACBorrar.Enabled = True
                Me.ComandoARAlta.Enabled = True
            End If
        End If
    End If
    If m_ACSeleccionada.Notas <> "" Then
        Me.ImagenNotaAC.Visible = True
    End If
    
    
    EstablecerListaAR
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ListaAC_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Private Sub ListaAR_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    Me.ComandoAREdicion.Enabled = False
    Me.ComandoARBorrar.Enabled = False
    Me.ComandoARHistorial.Enabled = False
    Me.ImagenNotaAR.Visible = False
    If Nz(Me.ListaAR.Column(0), "") = "" Then
        Set m_ARSeleccionada = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If Nz(Me.ListaAR.Column(0), "") = "" Then
        Set m_ARSeleccionada = Nothing
        Me.ImagenAnexo.Visible = False
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_ARSeleccionada Is Nothing Then
        Set m_ARSeleccionada = constructor.getARProyecto(p_IDAR:=Nz(Me.ListaAR.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    Else
        If m_ARSeleccionada.IDAccionRealizada <> Me.ListaAR.Column(0) Then
            Set m_ARSeleccionada = constructor.getARProyecto(p_IDAR:=Nz(Me.ListaAR.Column(0), ""), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        End If
    End If
    If m_ARSeleccionada.Notas <> "" Then
        Me.ImagenNotaAR.Visible = True
    End If
    Me.ComandoAREdicion.Enabled = True
    Me.ComandoARHistorial.Enabled = True
    If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
        
        If Form_FormNCProyecto.m_PermitidoEditar <> EnumSino.No Then
            If EsTecnico <> EnumSino.Sí Then
                Me.ComandoARBorrar.Enabled = True
            End If
            
        End If
    End If
    If m_ARSeleccionada.Documentos Is Nothing Then
        Me.ImagenAnexo.Visible = False
    Else
        Me.ImagenAnexo.Visible = True
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ListaAC_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub m_FormAC_Alta(p_EstadoAlInicio As String)

    Dim m_Estado As String
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Set m_ObjNCProyectoActiva.ACs = Nothing
    m_ObjNCProyectoActiva.EstadoGrabar
    m_Estado = m_ObjNCProyectoActiva.EstadoCalculadoTexto
    
    EstablecerListaAC

    EstablecerListaAR
    If p_EstadoAlInicio <> "" Then
        If p_EstadoAlInicio <> "Cerrada" Then
            If m_Estado = "Cerrada" Then
                pregunta = MsgBox("La NC de proyecto pasa a estar cerrada ", vbInformation, "Cierre de NC")
            End If
        Else
            If p_EstadoAlInicio = "Cerrada" Then
                If m_Estado <> "Cerrada" Then
                    pregunta = MsgBox("La NC de proyecto ha dejado de estar cerrada ", vbInformation, "Reapertura de NC")
                End If
            End If
        End If
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    m_Error = ""
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormAC_Alta se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub m_FormAC_Editado()
    
    Dim m_IDACSeleccionada As String
    Dim i As Long
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    m_IDACSeleccionada = m_ACSeleccionada.IdAccionCorrectiva
    Set m_ACSeleccionada = Nothing
    Set m_ObjNCProyectoActiva.ACs = Nothing
    EstablecerListaAC
    For i = 1 To Me.ListaAC.ListCount - 1
        If Me.ListaAC.Column(0, i) = m_IDACSeleccionada Then
            Me.ListaAC.Selected(i) = True
            ListaAC_Click
            Exit For
        End If
    Next
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
   
    
    
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormAC_Editado se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub m_FormAnexos_Alta()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Set m_ARSeleccionada.Documentos = Nothing
    Me.ImagenAnexo.Visible = True
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    m_Error = ""
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormAnexos_Alta se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub m_FormAR_Alta(p_EstadoAlInicio As String)
    Dim m_Estado As String
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Set Form_FormNCProyecto.m_NCAlInicio = constructor.getNCProyecto(p_IDNC:=m_ObjNCProyectoActiva.IDNoConformidad, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ObjNCProyectoActiva = constructor.getNCProyecto(p_IDNC:=m_ObjNCProyectoActiva.IDNoConformidad, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_Estado = m_ObjNCProyectoActiva.Estado
    Set m_ACSeleccionada = constructor.getACProyecto(p_IDAC:=m_ACSeleccionada.IdAccionCorrectiva, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    EstablecerListaAR
    EstablecerColorPestañasNCProyecto
    If p_EstadoAlInicio <> "" Then
        If p_EstadoAlInicio <> "Cerrada" Then
            If m_Estado = "Cerrada" Then
                pregunta = MsgBox("La NC de proyecto pasa a estar cerrada ", vbInformation, "Cierre de NC")
            End If
        Else
            If p_EstadoAlInicio = "Cerrada" Then
                If m_Estado <> "Cerrada" Then
                    pregunta = MsgBox("La NC de proyecto ha dejado de estar cerrada ", vbInformation, "Reapertura de NC")
                End If
            End If
        End If
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    m_Error = ""
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormAR_Alta se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub m_FormAR_Editado(p_EstadoAlInicio As String)
    Dim m_Estado As String
    Dim m_IDACSeleccionada As String
    Dim i As Long
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Set Form_FormNCProyecto.m_NCAlInicio = constructor.getNCProyecto(p_IDNC:=m_ObjNCProyectoActiva.IDNoConformidad, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
'    Set m_ObjNCProyectoActiva = constructor.getNCProyecto(p_IDNC:=m_ObjNCProyectoActiva.IDNoConformidad, p_Error:=m_Error)
'    If m_Error <> "" Then
'        Err.Raise 1000
'    End If
    m_Estado = m_ObjNCProyectoActiva.Estado
    m_IDACSeleccionada = m_ACSeleccionada.IdAccionCorrectiva
    Set m_ACSeleccionada = Nothing
    Set m_ObjNCProyectoActiva.ACs = Nothing
    EstablecerListaAC
    For i = 1 To Me.ListaAC.ListCount - 1
        If Me.ListaAC.Column(0, i) = m_IDACSeleccionada Then
            Me.ListaAC.Selected(i) = True
            ListaAC_Click
            Exit For
        End If
    Next
    EstablecerColorPestañasNCProyecto
    If p_EstadoAlInicio <> "" Then
        If p_EstadoAlInicio <> "Cerrada" Then
            If m_Estado = "Cerrada" Then
                pregunta = MsgBox("La NC de proyecto pasa a estar cerrada ", vbInformation, "Cierre de NC")
            End If
        Else
            If p_EstadoAlInicio = "Cerrada" Then
                If m_Estado <> "Cerrada" Then
                    pregunta = MsgBox("La NC de proyecto ha dejado de estar cerrada ", vbInformation, "Reapertura de NC")
                End If
            End If
        End If
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
   
    
    
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormAR_Editado se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub
Private Sub OrdenAC_AfterUpdate()
    Dim m_IDACSeleccionada As String
    Dim i As Long
    
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Not m_ACSeleccionada Is Nothing Then
        m_IDACSeleccionada = m_ACSeleccionada.IdAccionCorrectiva
    End If
    Set m_ACSeleccionada = Nothing
    EstablecerListaAC
    If m_IDACSeleccionada <> "" Then
        For i = 1 To Me.ListaAC.ListCount - 1
            If Me.ListaAC.Column(0, i) = m_IDACSeleccionada Then
                Me.ListaAC.Selected(i) = True
                ListaAC_Click
                Exit For
            End If
        Next
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al OrdenAC_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Public Function ActualizarLineaListaAC( _
                                        Optional ByRef p_Error As String _
                                        ) As String
   
    Dim m_ACProyecto As ACProyecto
    Dim lst As ListBox
    Dim i As Long
    Dim m_SourceInicial As String
    Dim m_SourceFinal As String
    Dim m_LineaAlInicio As String
    Dim m_LineaAlFinal As String
    Dim j As Long
    Dim m_Responsable As String
    
    On Error GoTo errores
    Set lst = Me.ListaAC
    If lst.ListCount = 1 Then
        Exit Function
    End If
    m_SourceInicial = lst.RowSource
    Set m_ACProyecto = constructor.getACProyecto(p_IDAC:=Nz(lst.Column(0), ""), p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ACProyecto Is Nothing Then
        Exit Function
    End If
    With m_ACProyecto
        If .ResponsableObj Is Nothing Then
            m_Responsable = ""
        Else
            m_Responsable = .ResponsableObj.Nombre
        End If
        m_LineaAlFinal = .IdAccionCorrectiva & ";" & .NAccion & ";" & Replace(.AccionCorrectiva, ";", ":") & ";" & m_Responsable & ";" & .FechaInicialMinima & ";" & _
                        .FechaFinPrevistaUltima & ";" & .FechaFinalUltima
    End With
    
    For i = 1 To lst.ListCount - 1
        If lst.Selected(i) = True Then
            For j = 0 To 5
                If m_LineaAlInicio = "" Then
                    m_LineaAlInicio = lst.Column(j, i)
                Else
                    m_LineaAlInicio = m_LineaAlInicio & ";" & lst.Column(j, i)
                End If
            Next
            Exit For
        End If
    Next
    m_SourceFinal = Replace(m_SourceInicial, m_LineaAlInicio, m_LineaAlFinal)
    lst.RowSource = m_SourceFinal
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarLineaListaAC ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function ActualizarLineaListaAR( _
                                        Optional ByRef p_Error As String _
                                        ) As String
   
    Dim m_ARProyecto As ARProyecto
    Dim lst As ListBox
    Dim i As Long
    Dim m_SourceInicial As String
    Dim m_SourceFinal As String
    Dim m_LineaAlInicio As String
    Dim m_LineaAlFinal As String
    Dim m_Responsable As String
    Dim j As Long
    
    On Error GoTo errores
    Set lst = Me.ListaAR
    If lst.ListCount = 1 Then
        Exit Function
    End If
    m_SourceInicial = lst.RowSource
    Set m_ARProyecto = constructor.getARProyecto(p_IDAR:=Nz(lst.Column(0), ""), p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ARProyecto Is Nothing Then
        Exit Function
    End If
    With m_ARProyecto
        If .ResponsableObj Is Nothing Then
            m_Responsable = ""
        Else
            m_Responsable = .ResponsableObj.Nombre
        End If
        m_LineaAlFinal = .IDAccionRealizada & ";" & .NAccion & ";" & Replace(.AccionRealizada, ";", ":") & ";" & _
                        m_Responsable & ";" & .FechaInicio & ";" & .FechaFinPrevista & ";" & .FechaFinReal
    End With
    
    For i = 1 To lst.ListCount - 1
        If lst.Selected(i) = True Then
            For j = 0 To 5
                If m_LineaAlInicio = "" Then
                    m_LineaAlInicio = lst.Column(j, i)
                Else
                    m_LineaAlInicio = m_LineaAlInicio & ";" & lst.Column(j, i)
                End If
            Next
            Exit For
        End If
    Next
    m_SourceFinal = Replace(m_SourceInicial, m_LineaAlInicio, m_LineaAlFinal)
    lst.RowSource = m_SourceFinal
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarLineaListaAR ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Sub OrdenAR_AfterUpdate()
    Dim m_IDARSeleccionada As String
    Dim i As Long
    
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Not m_ARSeleccionada Is Nothing Then
        m_IDARSeleccionada = m_ARSeleccionada.IDAccionRealizada
    End If
    Set m_ARSeleccionada = Nothing
    EstablecerListaAR
    If m_IDARSeleccionada <> "" Then
        For i = 1 To Me.ListaAR.ListCount - 1
            If Me.ListaAR.Column(0, i) = m_IDARSeleccionada Then
                Me.ListaAR.Selected(i) = True
                ListaAR_Click
                Exit For
            End If
        Next
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al OrdenAR_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub
Private Function EstablecerCombos( _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
   
    
    On Error GoTo errores
    
    
    EstablecerComboOrdenarPor Me.OrdenAC, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    EstablecerComboOrdenarPor Me.OrdenAR, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerCombos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
