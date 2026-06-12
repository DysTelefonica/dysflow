Option Compare Database
Option Explicit


Public Event NCSeleccinonada(p_NC As NCAuditoria)
Public m_NCSeleccionada As NCAuditoria
Private m_Expediente As Expediente
Private m_ColFiltrado As Collection
Private m_ParaVinculo As Boolean
Private m_Error As String

Private Sub Auditoria_Change()
     On Error Resume Next
    Me.Estado = Null
    ActualizarLista
End Sub

Private Sub ComandoActualizarLista_Click()
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    On Error GoTo errores
    m_Error = ""
    RefreshNCAuditoriaGestionCaches p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Set m_ObjEntorno.ColAuditorias = Nothing
    Set m_ObjEntorno.ColNCsAuditoria = Nothing
    EstablecerCombos
    ActualizarDatosFiltrados
    ActualizarLista
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoActualizarLista_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub
Private Function ActualizarDatosFiltrados( _
                                            Optional ByRef p_Error As String _
                                            ) As String
   
    Dim m_Item As Object
    Dim m_NC As NCAuditoria
    On Error GoTo errores
    If m_ColFiltrado Is Nothing Then
        Exit Function
    End If
    Set lbl = Me.lblEstado
    
    
    For Each m_Item In m_ColFiltrado
        If TypeOf m_Item Is NCAuditoria Then
            Set m_NC = m_Item
        Else
            Set m_NC = constructor.getNCAuditoria( _
                        p_IDNC:=CStr(CallByName(m_Item, "ID", VbGet)), _
                        p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End If
        With m_NC
            Avance .Titulo & " ...."
            .FPREVCIERREGrabar
            .FECHACIERREGrabar
            .EstadoGrabar
            
        End With
       
        Set m_NC = Nothing
    Next
    AvanceCerrar
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarDatosFiltrados ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Private Sub ComandoEnviarCorreoElectronico_Click()
     VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    On Error GoTo errores
    m_Error = ""
    If m_NCSeleccionada Is Nothing Then
        Set m_NCSeleccionada = constructor.getNCAuditoria(p_IDNC:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_NCSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista"
            Err.Raise 1000
        End If
    End If
    Set m_ObjNCAuditoriaActiva = m_NCSeleccionada
    If FormularioAbierto("FormCorreo") Then
        DoCmd.Close acForm, "FormCorreo", acSaveNo
    End If
    DoCmd.OpenForm "FormCorreo", OpenArgs:=EnumSino.No
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEnviarCorreoElectronico_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Private Sub PieDelFormulario_DblClick(Cancel As Integer)
    Dim m_ID As String
    Dim m_NCAuditoria As NCAuditoria
    Dim m_mensaje As String
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If m_NCSeleccionada Is Nothing Then
        Set m_NCSeleccionada = constructor.getNCAuditoria(p_IDNC:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_NCSeleccionada Is Nothing Then
            m_Error = "Se ha de seleccionar un elemento de la lista"
            Err.Raise 1000
        End If
    End If
    m_mensaje = HTMLNCAuditoria(p_NC:=m_NCSeleccionada, p_ConAcciones:=EnumSino.Sí, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    AbrirHTMLEnLocal p_Mensaje:=m_mensaje, p_Error:=m_Error
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
        m_Error = "Al PieDelFormulario_DblClick se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Private Sub cmdSalir_Click()
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub


'Private Sub ComandoActualizarEstado_Click()
'
'    VBA.DoEvents
'    DoCmd.Hourglass True
'    VBA.DoEvents
'    On Error GoTo errores
'    m_Error = ""
'    If m_NCSeleccionada Is Nothing Then
'        Set m_NCSeleccionada = constructor.getNCAuditoria(Nz(Me.ListaFiltrados.Column(0), ""), , m_Error)
'        If m_Error <> "" Then
'            Err.Raise 1000
'        End If
'        If m_NCSeleccionada Is Nothing Then
'            m_Error = "Seleccione un elemento de la lista"
'            'Err.Raise l000
'        End If
'    End If
'    ActualizarDatosNCAuditoria m_NCSeleccionada, m_Error
'    If m_Error <> "" Then
'        Err.Raise 1000
'    End If
'    ActualizarLineaLista m_Error
'    If m_Error <> "" Then
'        Err.Raise 1000
'    End If
'    VBA.DoEvents
'    DoCmd.Hourglass False
'    VBA.DoEvents
'    Exit Sub
'errores:
'    DoCmd.Hourglass False
'    If Err.Number <> 1000 Then
'        m_Error = "Al ComandoActualizarEstado_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
'        CorreoAlAdministrador m_Error
'        pregunta = MsgBox(m_Error, vbCritical, "Error")
'    Else
'        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
'    End If
'End Sub



Private Sub ComandoAltaDeAuditoria_Click()
     
    Dim m_Auditoria As Auditoria
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If Nz(Me.Auditoria.Column(0), "") = "" Then
        If m_NCSeleccionada Is Nothing Then
            Set m_NCSeleccionada = constructor.getNCAuditoria(p_IDNC:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
            If m_NCSeleccionada Is Nothing Then
                
                m_Error = "Seleccione un elemento de la lista"
                Err.Raise 1000
            End If
        End If
        Set m_Auditoria = m_NCSeleccionada.Auditoria
    Else
        Set m_Auditoria = constructor.getAuditoria(p_ID:=Nz(Me.Auditoria.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    If m_Auditoria Is Nothing Then
        m_Error = "No se ha podido determinar la auditoría a la que pertenecería"
        Err.Raise 1000
    End If
    
    Set m_ObjAuditoriaActiva = m_Auditoria
    Set m_ObjNCAuditoriaActiva = Nothing
    
    If FormularioAbierto("FormNCAuditoria") Then
        DoCmd.Close acForm, "FormNCAuditoria", acSaveNo
    End If
    DoCmd.OpenForm "FormNCAuditoria"
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAltaDeAuditoria_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoLimiparTipo_Click()
     On Error Resume Next
    Me.Tipo = Null
    ActualizarLista
End Sub

Private Sub ComandoNCAuditoriaHistorial_Click()
    
    Dim m_mensaje As String
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    On Error GoTo errores
    m_Error = ""
    If m_NCSeleccionada Is Nothing Then
        Set m_NCSeleccionada = constructor.getNCAuditoria(p_IDNC:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_NCSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista"
            'Err.Raise l000
        End If
    End If
    m_mensaje = HTMHistorialAuditoria(m_NCSeleccionada, m_Error)
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
        m_Error = "Al ComandoNCAuditoriaHistorial_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Private Sub ComandoEditar_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If m_NCSeleccionada Is Nothing Then
        Set m_NCSeleccionada = constructor.getNCAuditoria(p_IDNC:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_NCSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista"
            Err.Raise 1000
        End If
    End If
    Set m_ObjNCAuditoriaActiva = m_NCSeleccionada
    
    If FormularioAbierto("FormNCAuditoria") Then
        DoCmd.Close acForm, "FormNCAuditoria", acSaveNo
    End If
    DoCmd.OpenForm "FormNCAuditoria"
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEditar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Private Sub ComandoEliminar_Click()
    
    Dim m_NCOp As NCaUDITORIAOperaciones
    Dim m_Motivo As String
    On Error GoTo errores
    
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If m_NCSeleccionada Is Nothing Then
        Set m_NCSeleccionada = constructor.getNCAuditoria(p_IDNC:=Nz(Me.ListaFiltrados.Column(0), ""), p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If m_NCSeleccionada Is Nothing Then
            m_Error = "Seleccione un elemento de la lista"
            Err.Raise 1000
        End If
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    If Me.ComandoEliminar.Caption = "Eliminar" Then
        pregunta = MsgBox("¿Desea marcar como borrado la no conformidad de auditoria seleccionada?", vbExclamation + vbYesNo + vbDefaultButton2, "Borrado de NC")
        m_Motivo = Nz(InputBox("Introduzca el motivo para marcar como borrada la no conformidad", "Motivación"), "")
        
    Else
        pregunta = MsgBox("¿Desea habilitar la no conformidad de auditoria seleccionada?", vbExclamation + vbYesNo + vbDefaultButton2, "Habilitación de NC")
    End If
    
    If pregunta <> vbYes Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Set m_NCOp = New NCaUDITORIAOperaciones
    With m_NCOp
        Set .nc = m_NCSeleccionada
        If Me.ComandoEliminar.Caption = "Eliminar" Then
            .nc.MotivoBorrado = m_Motivo
            .Eliminar EnumSino.No, m_Error
        Else
            .Habilitar m_Error
        End If
        
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    ActualizarLista EnumSino.Sí
    ListaFiltrados_Click
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEliminar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoInformeLista_Click()
    Dim m_Col As Scripting.Dictionary
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
   
    If Me.ListaFiltrados.ListCount = 0 Then
        m_Error = "No hay elementos en la lista"
        Err.Raise 1000
    End If
    Set m_Col = BuildNCAuditoriaGestionReportCollection( _
                    p_ListedItems:=m_ColFiltrado, _
                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        m_Error = "No hay elementos en la lista una vez tratados"
        Err.Raise 1000
    End If
    GenerarWordNoConformidades p_EsDeProyecto:=EnumSino.No, p_col:=m_Col, p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    AvanceCerrar
    Me.AllowEdits = False
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Me.AllowEdits = True
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoInformeLista_Click se ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    AvanceCerrar
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoLimiparEstado_Click()
    On Error Resume Next
    Me.Estado = Null
    ActualizarLista
End Sub




Private Sub ComandoLimiparPalabraClave_Click()
     On Error Resume Next
    Me.PalabraClave = Null
    ActualizarLista
End Sub

Private Sub ComandoLimiparRESPONSABLEIMPLANTACION_Click()
    On Error Resume Next
    Me.RESPONSABLEIMPLANTACION = Null
    ActualizarLista
End Sub



Private Sub ComandoLimpiaoRequiereControlEficacia_Click()
    On Error Resume Next
    Me.ComboRequiereControlEficacia = Null
    ActualizarLista
End Sub

Private Sub ComandoLimpiarAuditoria_Click()
    On Error Resume Next
    Me.Auditoria = Null
    ActualizarLista
End Sub

Private Sub ComandoLimpiarControlEficaciaRelleno_Click()
    On Error Resume Next
    Me.ComboControlEficaciaRelleno = Null
    ActualizarLista
End Sub


Private Sub ComandoInforme_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""

    EnsureNCAuditoriaGestionSelected p_EmptyMessage:="Se ha de seleccionar un elemento de la lista", p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    GenerarWordNoConformidades p_EsDeProyecto:=EnumSino.No, p_NC:=m_NCSeleccionada, p_Error:=m_Error
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
        m_Error = "Al ComandoInforme_Click se ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    AvanceCerrar
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub ComandoAlta_Click()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    Set m_ObjNCAuditoriaActiva = Nothing
    If FormularioAbierto("FormNCAuditoria") Then
        DoCmd.Close acForm, "FormNCAuditoria", acSaveNo
    End If
    DoCmd.OpenForm "FormNCAuditoria"
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAlta_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoLimiparDescripcion_Click()
    On Error Resume Next
    Me.Descripcion = Null
    ActualizarLista
End Sub



Private Sub ComboRequiereControlEficacia_AfterUpdate()
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    
    ActualizarLista
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComboRequiereControlEficacia_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComboControlEficaciaRelleno_AfterUpdate()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    
    ActualizarLista
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComboControlEficaciaRelleno_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub





Public Sub ESTADO_AfterUpdate()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    
    ActualizarLista
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ESTADO_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
    Me.Caption = Me.lblTitulo1.Caption
    Me.lblEstado.Visible = False
   
    EstablecerCombos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Me.ComandoAlta.Enabled = False
    Me.ComandoEditar.Enabled = False
    Me.ComandoEliminar.Enabled = False
    
    Me.ComandoEnviarCorreoElectronico.Enabled = False
    Me.ComandoInforme.Enabled = False
    Me.ComandoInformeLista.Enabled = False
    Me.ComandoAltaDeAuditoria.Enabled = False
    Me.ComandoAltaDeAuditoria.Caption = "Alta para #"
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

Public Function getNCsAudtoriasFiltrados(Optional ByRef p_Error As String) As Collection

    On Error GoTo errores

    Set getNCsAudtoriasFiltrados = GetNCAuditoriaGestionFiltradas( _
                                    p_IDAuditoria:=CLng(Val(Nz(Me.Auditoria.Column(0), "0"))), _
                                    p_Tipo:=Nz(Me.Tipo, ""), _
                                    p_Descripcion:=Nz(Me.Descripcion, ""), _
                                    p_ResponsableImplantacion:=Nz(Me.RESPONSABLEIMPLANTACION, ""), _
                                    p_Estado:=Nz(Me.Estado.Column(0), ""), _
                                    p_PalabraClave:=Nz(Me.PalabraClave, ""), _
                                    p_RequiereControlEficacia:=Nz(Me.ComboRequiereControlEficacia, ""), _
                                    p_ControlEficaciaRelleno:=Nz(Me.ComboControlEficaciaRelleno, ""), _
                                    p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsAudtoriasFiltrados ha devuelto el error: " & vbNewLine & Err.Description
    End If
    
End Function

Public Function TodosParametrosBusquedaVacios(Optional ByRef p_Error As String) As EnumSino

    
    
    On Error GoTo errores
    If Nz(Me.Auditoria, "") = "" And Nz(Me.Descripcion, "") = "" And _
        Nz(Me.RESPONSABLEIMPLANTACION, "") = "" And Nz(Me.Estado, "") = "" And _
        Nz(Me.PalabraClave, "") = "" And Nz(Me.ComboControlEficaciaRelleno, "") = "" And _
        Nz(Me.ComboRequiereControlEficacia, "") = "" And Nz(Me.Tipo, "") = "" Then
        TodosParametrosBusquedaVacios = EnumSino.Sí
    Else
    
        TodosParametrosBusquedaVacios = EnumSino.No
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método TodosParametrosBusquedaVacios ha devuelto el error: " & vbNewLine & Err.Description
    End If
    
End Function


Public Sub ActualizarLista(Optional p_ManteniendoSeleccionado As EnumSino)
    
    Dim m_IDNCPrevia As String
    Dim i As Long
    Dim m_Varitem As Variant
    Dim m_Auditoria As Auditoria
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    Me.ComandoInformeLista.Enabled = False
    If p_ManteniendoSeleccionado = EnumSino.Sí Then
        'If Me.ListaFiltrados.ItemsSelected > 0 Then
            For Each m_Varitem In Me.ListaFiltrados.ItemsSelected
                m_IDNCPrevia = Me.ListaFiltrados.Column(0, m_Varitem)
            Next
        'End If
    End If
    Me.ComandoEditar.Enabled = False
    Me.ComandoEliminar.Enabled = False
    Me.ComandoNCAuditoriaHistorial.Enabled = False
    Me.ComandoEnviarCorreoElectronico.Enabled = False
    Me.ComandoInforme.Enabled = False
    Me.ComandoNCAuditoriaHistorial.Enabled = False
    Me.ComandoAltaDeAuditoria.Enabled = False
    Me.ComandoAltaDeAuditoria.Caption = "Alta para #"
    Me.lblEstado.Visible = False
    Set m_NCSeleccionada = Nothing
    Me.ListaFiltrados.RowSource = "IDNoconformidad;Auditoría;Tipo;Nº;Descripción;Responsable;Estado;FApertura;FCierre"
    Set m_ColFiltrado = getNCsAudtoriasFiltrados(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ColFiltrado Is Nothing Then
        
        Set m_Auditoria = constructor.getAuditoria(p_ID:=Nz(Me.Auditoria.Column(0), ""))
        EstablecerBotonAltaPara m_Auditoria
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Me.ComandoInformeLista.Enabled = True
    RellenarListaConCol m_ColFiltrado, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If IsNumeric(m_IDNCPrevia) Then
        For i = 1 To Me.ListaFiltrados.ListCount - 1
            If Me.ListaFiltrados.Column(0, i) = m_IDNCPrevia Then
                Me.ListaFiltrados.Selected(i) = True
                ListaFiltrados_Click
                VBA.DoEvents
                DoCmd.Hourglass False
                VBA.DoEvents
                Exit Sub
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
        m_Error = "Al ActualizarLista se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub



Private Sub ListaFiltrados_Click()
    
    Dim m_EstadoClaro As String
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
   
    Me.ComandoEditar.Enabled = False
    Me.ComandoEliminar.Enabled = False
    Me.ComandoEnviarCorreoElectronico.Enabled = False
    Me.ComandoInforme.Enabled = False
    Me.ComandoNCAuditoriaHistorial.Enabled = False
    Me.ComandoAltaDeAuditoria.Enabled = False
    Me.ComandoAltaDeAuditoria.Caption = "Alta para #"
    Me.lblEstado.Visible = False
    If Nz(Me.ListaFiltrados.Column(0), "") = "" Then
        Set m_NCSeleccionada = Nothing
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Set m_NCSeleccionada = ResolveNCAuditoriaGestionSelection( _
                            p_Current:=m_NCSeleccionada, _
                            p_SelectedID:=Me.ListaFiltrados.Column(0), _
                            p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_NCSeleccionada Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass True
        VBA.DoEvents
        Exit Sub
    End If
    Me.ComandoEditar.Enabled = True
    
    If m_NCSeleccionada.Estado = "BORRADA" Then
        Me.ComandoEliminar.Caption = "Habilitar"
    Else
        Me.ComandoEliminar.Caption = "Eliminar"
    End If
    Me.ComandoEliminar.Enabled = True
    EstablecerBotonAltaPara m_NCSeleccionada.Auditoria
    Me.ComandoNCAuditoriaHistorial.Enabled = True
    Me.ComandoEnviarCorreoElectronico.Enabled = True
    Me.ComandoInforme.Enabled = True
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ListaFiltrados_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub
Private Sub EstablecerBotonAltaPara(Optional p_Auditoria As Auditoria)
    On Error Resume Next
    If p_Auditoria Is Nothing Then
        Me.ComandoAltaDeAuditoria.Caption = "Alta para #"
        Me.ComandoAltaDeAuditoria.Enabled = False
    Else
     
        Me.ComandoAltaDeAuditoria.Enabled = True
        Me.ComandoAltaDeAuditoria.Caption = "Alta para " & p_Auditoria.NombreAuditoria
    End If
End Sub



Private Sub ListaFiltrados_DblClick(Cancel As Integer)
    On Error Resume Next
    Application.Echo False
    If Me.ComandoEditar.Enabled = True Then
        ComandoEditar_Click
    End If
    Application.Echo True
End Sub



Public Function SeleccionarNC( _
                                m_ID As String, _
                                Optional ByRef p_Error As String _
                                ) As String
   
    Dim lst As ListBox
    Dim i As Long
    
    
    On Error GoTo errores
    Set lst = Me.ListaFiltrados
    If lst.ListCount = 0 Then
        Exit Function
    End If
    For i = 1 To lst.ListCount - 1
        If lst.Column(0, i) = m_ID Then
            lst.Selected(i) = True
            ListaFiltrados_Click
            Exit Function
        End If
    Next
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SeleccionarNC ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Function RellenarListaConCol( _
                                    p_col As Collection, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_Item As Object
    Dim lst As ListBox
    
    
    On Error GoTo errores
    
    
    
    If p_col Is Nothing Then
       Exit Function
    End If
    Set lst = Me.ListaFiltrados
    lst.RowSource = "IDNoconformidad;Auditoría;Tipo;Nº;Descripción;Responsable;Estado;FApertura;FCierre"
    For Each m_Item In p_col
        lst.AddItem BuildNCAuditoriaGestionListRow(p_Item:=m_Item, p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Set m_Item = Nothing
    Next
   
    If lst.ListCount > 1 Then
        lst.Selected(1) = True
        ListaFiltrados_Click
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarListaConCol ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Sub EnsureNCAuditoriaGestionSelected( _
    Optional ByVal p_EmptyMessage As String = "Seleccione un elemento de la lista", _
    Optional ByRef p_Error As String _
    )

    On Error GoTo errores

    p_Error = ""
    Set m_NCSeleccionada = ResolveNCAuditoriaGestionSelection( _
                            p_Current:=m_NCSeleccionada, _
                            p_SelectedID:=Nz(Me.ListaFiltrados.Column(0), ""), _
                            p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_NCSeleccionada Is Nothing Then
        p_Error = p_EmptyMessage
        Err.Raise 1000
    End If
    Exit Sub

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EnsureNCAuditoriaGestionSelected ha devuelto el error: " & Err.Description
    End If
End Sub


Private Function EstablecerCombos( _
                                    Optional ByRef p_Error As String _
                                    ) As String
   
    
    On Error GoTo errores
    EstablecerComboResponsablesImplantacion Me.RESPONSABLEIMPLANTACION, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    EstablecerComboAuditoriasNombres Me.Auditoria, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
   
    EstablecerComboEstado Me.Estado, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Me.Estado.AddItem "Abiertas;0"
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerCombos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Sub RESPONSABLEIMPLANTACION_AfterUpdate()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    ActualizarLista
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al RESPONSABLEIMPLANTACION_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub
Private Sub PalabraClave_KeyDown(KeyCode As Integer, Shift As Integer)
    
  
    
    If KeyCode = vbKeyReturn Or KeyCode = 9 Then
        Me.ComandoLimiparPalabraClave.SetFocus
        Me.PalabraClave.SetFocus
        'Debug.Print Me.Pass
        ' Código que deseas ejecutar cuando se pulse Enter
        ActualizarLista
        
        ' Si deseas evitar que Access realice la acción predeterminada de Enter,
        ' puedes utilizar la siguiente línea:
        KeyCode = 0
    End If
End Sub
Private Sub Descripcion_KeyDown(KeyCode As Integer, Shift As Integer)
    
  
    
    If KeyCode = vbKeyReturn Or KeyCode = 9 Then
        Me.ComandoLimiparDescripcion.SetFocus
        Me.Descripcion.SetFocus
        'Debug.Print Me.Pass
        ' Código que deseas ejecutar cuando se pulse Enter
        ActualizarLista
        
        ' Si deseas evitar que Access realice la acción predeterminada de Enter,
        ' puedes utilizar la siguiente línea:
        KeyCode = 0
    End If
End Sub

Public Function ActualizarLineaLista( _
                                        Optional ByRef p_Error As String _
                                        ) As String
   
   
    Dim lst As ListBox
    Dim i As Long
    Dim m_SourceInicial As String
    Dim m_SourceFinal As String
    Dim m_LineaAlInicio As String
    Dim m_LineaAlFinal As String
    Dim j As Long
   
    Dim m_IDLista As String
    
    On Error GoTo errores
    Set lst = Me.ListaFiltrados
    If lst.ListCount = 1 Then
        Exit Function
    End If
    m_SourceInicial = lst.RowSource
    If m_ObjNCAuditoriaActiva Is Nothing Then
        Exit Function
    End If
    
    For i = 1 To lst.ListCount - 1
        m_IDLista = lst.Column(0, i)
        If m_ObjNCAuditoriaActiva.id = m_IDLista Then
            
            lst.Selected(i) = True
            With m_ObjNCAuditoriaActiva
                m_LineaAlFinal = .id & ";" & .Auditoria.NombreAuditoria & ";" & .Tipo & ";" & _
                        Format(.Numero, "00") & ";" & Replace(.Descripcion, ";", ":") & ";" & _
                        .RESPONSABLEIMPLANTACION & ";" & .EstadoCalculadoTexto & ";" & .FechaApertura & ";" & .FECHACIERRECalculada
            End With
            For j = 0 To 8
                If m_LineaAlInicio = "" Then
                    m_LineaAlInicio = lst.Column(j, i)
                Else
                    m_LineaAlInicio = m_LineaAlInicio & ";" & lst.Column(j, i)
                End If
            Next
            m_SourceFinal = Replace(m_SourceInicial, m_LineaAlInicio, m_LineaAlFinal)
            lst.RowSource = m_SourceFinal
            lst.Requery
        End If
    Next
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarLineaLista ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Public Function ActualizarLineaListaConDatos( _
                                            p_Estado As String, _
                                            p_FechaApertura As String, _
                                            p_FechaCierre As String, _
                                            Optional ByRef p_Error As String _
                                             ) As String
        
   
    Dim lst As ListBox
    Dim i As Long
    Dim m_SourceInicial As String
    Dim m_SourceFinal As String
    Dim m_LineaAlInicio As String
    Dim m_LineaAlFinal As String
    Dim j As Long
    Dim dato As Variant
    
    
    On Error GoTo errores
    Set lst = Me.ListaFiltrados
    If lst.ListCount = 1 Then
        Exit Function
    End If
    m_SourceInicial = lst.RowSource
    If Nz(lst.Column(0), "") = "" Then
        Exit Function
    End If
    For j = 0 To 8
        If m_LineaAlInicio = "" Then
            m_LineaAlInicio = lst.Column(j)
        Else
            m_LineaAlInicio = m_LineaAlInicio & ";" & lst.Column(j)
        End If
    Next
    dato = Split(m_LineaAlInicio, ";")
    
    For j = 0 To 5
        If m_LineaAlFinal = "" Then
            m_LineaAlFinal = lst.Column(j)
        Else
            m_LineaAlFinal = m_LineaAlFinal & ";" & lst.Column(j)
        End If
    Next
    m_LineaAlFinal = m_LineaAlFinal & ";" & p_Estado
    m_LineaAlFinal = m_LineaAlFinal & ";" & p_FechaApertura
    m_LineaAlFinal = m_LineaAlFinal & ";" & p_FechaCierre
    m_SourceFinal = Replace(m_SourceInicial, m_LineaAlInicio, m_LineaAlFinal)
    lst.RowSource = m_SourceFinal
    lst.Requery
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarLineaListaConDatos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Sub Tipo_AfterUpdate()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    ActualizarLista
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al Tipo_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

