Option Compare Database
Option Explicit

Public Event NCNuevo()
Public Event NCEditado()

Public m_PermitidoEditar As EnumSino
Public m_Expediente As Expediente
Public m_IDProyecto As String 'para riesgos
Public m_ColRiesgos As Scripting.Dictionary
Public m_NCAlInicio As NCProyecto
Public blnRequiereCorreoAlta As Boolean
Private m_Error As String



Private Sub ComandoInforme_Click()
    On Error GoTo errores
    Dim m_mensaje As String
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    GenerarWordNoConformidades p_EsDeProyecto:=EnumSino.Sí, p_NC:=m_ObjNCProyectoActiva, p_Error:=m_Error
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
        m_Error = "Al ComandoInforme_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoSalir_Click()
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub


Private Sub Form_Close()
    
    
    
    
    On Error GoTo errores
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    
    With m_ObjNCProyectoActiva
        If .IDNoConformidad <> "" And blnRequiereCorreoAlta Then
            If .TieneAcciones = EnumSino.No Then
                PintarIndicadores p_Reiniciando:=EnumSino.Sí
                m_Error = "No se va a mandar el correo a Calidad al no haber acciones registradas. "
                Err.Raise 1000
            End If
            EnviarCorreoAltaNCProyecto m_ObjNCProyectoActiva
            
        End If
    End With
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Close se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
    'Me.ControlDeNavegación0.Tabs(0).Enabled = False
'    Me.InsideHeight = 9060
'    Me.InsideWidth = 13980
    Ajustar Me
    blnRequiereCorreoAlta = False
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
   
    
    Dim m_Titulo As String
    
    
    
    
    On Error GoTo errores
    Me.Caption = m_ObjEntorno.TituloUsuarioConectado
    If EsTecnico = EnumSino.Sí Then
        m_PermitidoEditar = EnumSino.No
        Me.AllowEdits = False
        
    Else
        m_PermitidoEditar = EnumSino.Sí
        If EsTecnico <> EnumSino.Sí Then
            Me.AllowEdits = True
        Else
            Me.AllowEdits = False
        End If
        
    End If
    
    If m_ObjNCProyectoActiva Is Nothing Then
        Me.lblTitulo.Caption = "ALTA DE NO CONFORMIDAD DE PROYECTO"
        Me.NavGeneral.SetFocus
        
        Me.NavAcciones.Enabled = False
        Me.NavControlEficacia.Enabled = False
        
        Me.NavNotas.Enabled = False
        Me.NavDocumentos.Enabled = False
        Me.NavReplanificaciones.Enabled = False
        Me.NavMotivoBorrado.Enabled = False
    
        Set m_ObjNCProyectoActiva = New NCProyecto
        blnRequiereCorreoAlta = True
        Me.ComandoInforme.Visible = False
    Else
        
        Me.ComandoInforme.Visible = True
        Set m_NCAlInicio = constructor.getNCProyecto(p_IDNC:=m_ObjNCProyectoActiva.IDNoConformidad, p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_NCAlInicio Is Nothing Then
            p_Error = "Parece que no se ha podido encontrar la NC de proyecto registrada"
            Err.Raise 1000
        End If
        If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
            Me.lblTitulo.Caption = "EDICIÓN DE NO CONFORMIDAD DE PROYECTO " & m_ObjNCProyectoActiva.CodigoNoConformidad
        Else
            Me.lblTitulo.Caption = "EDICIÓN DE NO CONFORMIDAD DE PROYECTO " & m_ObjNCProyectoActiva.CodigoNoConformidad & " --> " & m_ObjNCProyectoActiva.NCProyectoAsociada.CodigoNoConformidad
            
        End If
        If m_NCAlInicio.Borrado = True Then
            m_PermitidoEditar = EnumSino.No
            Me.AllowEdits = False
        End If
'        If m_NCAlInicio.FECHACIERRE <> "" Then
'            m_PermitidoEditar = EnumSino.No
'            Me.AllowEdits = False
'        End If
        If EsTecnico <> EnumSino.Sí Then
            EstablecerColorPestañasNCProyecto p_Error:=p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End If
        blnRequiereCorreoAlta = False
    End If
    Me.NavGeneral.NavigationTargetName = "FormNCProyectoGeneral"
    Me.FrmDetalle.SourceObject = "FormNCProyectoGeneral"
    If m_ObjNCProyectoActiva.IDNoConformidad = "" Then
        Me.FrmDetalle.Controls("PalabraClave").SetFocus
    End If
    
    
   
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
