VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_FormNCAuditoria"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public Event NCNuevo()
Public Event NCEditado()

Public m_PermitidoEditar As EnumSino

Public m_NCAlInicio As NCAuditoria

Public blnRequiereCorreoAlta As Boolean
Private m_Error As String


Private Sub ComandoInforme_Click()
     On Error GoTo errores
    Dim m_mensaje As String
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    
    GenerarWordNoConformidades p_EsDeProyecto:=EnumSino.No, p_NC:=m_ObjNCAuditoriaActiva, p_Error:=m_Error
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
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    
    With m_ObjNCAuditoriaActiva
        If .id <> "" And blnRequiereCorreoAlta Then
            If .TieneAcciones = EnumSino.No And .RequiereAccionCorrectiva = "Sí" Then
                PintarIndicadores p_Reiniciando:=EnumSino.Sí
                m_Error = "No se va a mandar el correo a Calidad al no haber acciones registradas. "
                Err.Raise 1000
            End If
            EnviarCorreoAltaNCAuditoria m_ObjNCAuditoriaActiva
            
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
        Me.AllowEdits = True
        
    End If
    If m_ObjAuditoriaActiva Is Nothing Then
        If m_ObjNCAuditoriaActiva Is Nothing Then
            p_Error = "No se conoce la auditoría de la que proviente"
            Err.Raise 1000
        End If
        Set m_ObjAuditoriaActiva = m_ObjNCAuditoriaActiva.Auditoria
        If m_ObjAuditoriaActiva Is Nothing Then
            p_Error = "No se conoce la auditoría de la que proviente"
            Err.Raise 1000
        End If
    End If
    If m_ObjNCAuditoriaActiva Is Nothing Then
        Me.lblTitulo.Caption = "ALTA DE REGISTRO DE AUDITORÍA " & m_ObjAuditoriaActiva.NombreAuditoria
        Me.NavGeneral.SetFocus
        
        Me.NavAcciones.Enabled = False
        Me.NavControlEficacia.Enabled = False
        
        Me.NavNotas.Enabled = False
        Me.NavDocumentos.Enabled = False
        Me.NavReplanificaciones.Enabled = False
        Me.NavMotivoBorrado.Enabled = False
        
        Set m_ObjNCAuditoriaActiva = New NCAuditoria
        Me.ComandoInforme.Visible = False
        blnRequiereCorreoAlta = True
    Else
        Me.ComandoInforme.Visible = True
        If m_ObjNCAuditoriaActiva.id = "" Then
            Me.lblTitulo.Caption = "ALTA DE REGISTRO DE AUDITORÍA " & m_ObjAuditoriaActiva.NombreAuditoria
            Me.NavGeneral.SetFocus
            
            Me.NavAcciones.Enabled = False
            Me.NavControlEficacia.Enabled = False
            
            Me.NavNotas.Enabled = False
            Me.NavDocumentos.Enabled = False
            Me.NavReplanificaciones.Enabled = False
            Me.NavMotivoBorrado.Enabled = False
            
            Set m_ObjNCAuditoriaActiva = New NCAuditoria
            blnRequiereCorreoAlta = True
        Else
            Set m_NCAlInicio = constructor.getNCAuditoria(p_IDNC:=m_ObjNCAuditoriaActiva.id, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If m_NCAlInicio Is Nothing Then
                p_Error = "Parece que no se ha podido encontrar la NC de auditoría registrada"
                Err.Raise 1000
            End If
            
            Me.lblTitulo.Caption = "EDICIÓN DE " & m_ObjNCAuditoriaActiva.Particula & " DE AUDITORÍA " & Format(m_NCAlInicio.Numero, "00")
            If m_NCAlInicio.Borrado = True Then
                m_PermitidoEditar = EnumSino.No
                Me.AllowEdits = False
            End If
            
            EstablecerColorPestañasNCAuditoria p_Error:=p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            blnRequiereCorreoAlta = False
        
        End If
        
        
    End If
    Me.NavGeneral.NavigationTargetName = "FormNCAuditoriaGeneral"
    Me.FrmDetalle.SourceObject = "FormNCAuditoriaGeneral"
    
    
    
   
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

