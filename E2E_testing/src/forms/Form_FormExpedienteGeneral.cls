Option Compare Database
Option Explicit
Private WithEvents m_FormOC As Form_FormOrganoContratacionGestion
Private WithEvents m_FormClasificacion As Form_FormGradosClasificacionGestion
Private WithEvents m_FormEjercito As Form_FormEjercitosGestion
Private WithEvents m_FormOficinaPrograma As Form_FormOficinasProgramaGestion

Private m_Error As String
Public m_SnapshotAlInicio As String
Private m_IDExpediente As String

Private Sub ComandoLimpiarClasificacion_Click()
    Me.IdGradoClasificacion = Null
End Sub

Private Sub ComandoLimpiarEjercito_Click()
    Me.IDEjercito = Null
End Sub

Private Sub ComandoLimpiarOC_Click()
    Me.IDOrganoContratacion = Null
End Sub

Private Sub ComandoLimpiarOficinaPrograma_Click()
    Me.IDOficinaPrograma = Null
End Sub

Private Sub Form_Unload(Cancel As Integer)
    Dim m_Snapshot As String
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Me.AllowEdits = False Then
        Exit Sub
    End If
    m_Snapshot = getSnapshot(frm:=Me, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Snapshot = m_SnapshotAlInicio Then
        Exit Sub
    End If
    
    GuardarPestana frm:=Me, p_IDExpediente:=m_IDExpediente, p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Unload se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub
Private Sub AccesoSharepoint_Exit(Cancel As Integer)
    If Nz(Me.AccesoSharepoint, "") <> "" Then
        Me.ComandoVerSharepoint.Enabled = True
    Else
        Me.ComandoVerSharepoint.Enabled = False
    End If
End Sub

Private Sub Ambito_AfterUpdate()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Nz(Me.Ambito, "") = "HPS" Then
        Me.HPSAplica = "Sí"
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Ambito_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoElegitClasificacion_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If FormularioAbierto("FormGradosClasificacionGestion") Then
        DoCmd.Close acForm, "FormGradosClasificacionGestion"
    End If
    Set m_ObjGradoClasificacionActivo = Nothing
    DoCmd.OpenForm "FormGradosClasificacionGestion", OpenArgs:="PARA SELECCIONAR"
    If FormularioAbierto("FormGradoClasificacion") Then
        Set m_FormClasificacion = Forms("FormGradosClasificacionGestion")
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoElegitClasificacion_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoElegirOficinaPrograma_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If FormularioAbierto("FormOficinasProgramaGestion") Then
        DoCmd.Close acForm, "FormOficinasProgramaGestion"
    End If
    Set m_ObjOficinaProgramaActiva = Nothing
    DoCmd.OpenForm "FormOficinasProgramaGestion", OpenArgs:="PARA SELECCIONAR"
    If FormularioAbierto("FormOficinasProgramaGestion") Then
        Set m_FormOficinaPrograma = Forms("FormOficinasProgramaGestion")
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoElegirOficinaPrograma_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoElegirEjercito_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If FormularioAbierto("FormEjercitosGestion") Then
        DoCmd.Close acForm, "FormEjercitosGestion"
    End If
    Set m_ObjEjercitoActivo = Nothing
    DoCmd.OpenForm "FormEjercitosGestion", OpenArgs:="PARA SELECCIONAR"
    If FormularioAbierto("FormEjercitosGestion") Then
        Set m_FormEjercito = Forms("FormEjercitosGestion")
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoElegirEjercito_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub ComandoElegirOC_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If FormularioAbierto("FormOrganoContratacionGestion") Then
        DoCmd.Close acForm, "FormOrganoContratacionGestion"
    End If
    Set m_ObjOrganoContratacionActivo = Nothing
    DoCmd.OpenForm "FormOrganoContratacionGestion", OpenArgs:="PARA SELECCIONAR"
    If FormularioAbierto("FormOrganoContratacionGestion") Then
        Set m_FormOC = Forms("FormOrganoContratacionGestion")
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoElegirOC_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub ComandoRellenarNemotecnico_Click()
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    SetDTOFromForm Me, m_ObjExpedienteDTOActivo, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Me.Nemotecnico = m_ObjExpedienteDTOActivo.Expediente.NemotecnicoCalculado
    'Me.Nemotecnico = ActualizaNemotecnico(p_Expediente:=m_ObjExpedienteActivo)
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoRellenarNemotecnico_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoVerSharepoint_Click()
    If Nz(Me.AccesoSharepoint, "") <> "" Then
        Ejecutar 1, "open", Nz(Me.AccesoSharepoint, ""), "", "", 1
    End If
    
End Sub


Private Sub Form_Load()
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Me.AllowEdits = False
    Me.Parent.Controls("ComandoRegistrar").Visible = True
    
    If AbiertoParaEditar = True Then
        If EsAdministrador = EnumSiNo.Sí Then
            Me.AllowEdits = True
        End If
    Else
        Me.AllowEdits = False
    End If
   
    If Me.AllowEdits = True Then
        m_SnapshotAlInicio = getSnapshot(frm:=Me, p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 100
        End If
    End If
    Me.Parent.Controls("ComandoRegistrar").Enabled = Me.AllowEdits
     Me.ComandoElegitClasificacion.Enabled = Me.AllowEdits
        Me.ComandoLimpiarClasificacion.Enabled = Me.AllowEdits
        Me.ComandoRellenarNemotecnico.Enabled = Me.AllowEdits
        Me.ComandoElegirOC.Enabled = Me.AllowEdits
        Me.ComandoLimpiarOC.Enabled = Me.AllowEdits
        Me.ComandoElegirEjercito.Enabled = Me.AllowEdits
        Me.ComandoLimpiarEjercito.Enabled = Me.AllowEdits
        Me.ComandoElegirOficinaPrograma.Enabled = Me.AllowEdits
        Me.ComandoLimpiarOficinaPrograma.Enabled = Me.AllowEdits
    m_IDExpediente = m_ObjExpedienteDTOActivo.Expediente.IDExpediente
    EstablecerCombos frm:=Me, p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    SetFormGeneralFromExpediente p_IDExpediente:=m_IDExpediente, frm:=Me, p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Me.AllowEdits = True Then
        m_SnapshotAlInicio = getSnapshot(frm:=Me, p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Load se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub Ordinal_AfterUpdate()
    
    Dim m_ExpedienteOrdinalUsado As EnumSiNo
    
    Dim m_ExpedienteOtro As Expediente
    Dim m_textoExp As String
    On Error GoTo errores
    
    
    m_Error = ""
    If Not IsNumeric(Nz(Me.Ordinal, "")) Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
   
    
   
        Set m_ExpedienteOtro = ExpedienteOrdinalUsado(m_ObjExpedienteDTOActivo.Expediente.IDExpedientePadre, p_Ordinal:=Me.Ordinal, p_Error:=m_Error)
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If Not m_ExpedienteOtro Is Nothing Then
            If m_ExpedienteOtro.CodExp <> "" Then
                m_textoExp = m_ExpedienteOtro.CodExp
            Else
                If m_ExpedienteOtro.Nemotecnico <> "" Then
                    m_textoExp = m_ExpedienteOtro.Nemotecnico
                Else
                    m_textoExp = m_ExpedienteOtro.Titulo
                End If
            End If
            VBA.DoEvents
            DoCmd.Hourglass False
            VBA.DoEvents
            pregunta = MsgBox("El número ya ha sido usado para el Expediente : " & m_textoExp, vbExclamation, "Ordinal repetido")
            
        End If
        
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Ordinal_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub m_FormClasificacion_Seleccionar(m_GradoClasificacionSeleccionado As GradoClasificacion)
     On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Not m_GradoClasificacionSeleccionado Is Nothing Then
        Me.IdGradoClasificacion = m_GradoClasificacionSeleccionado.GradoClasificacion
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormClasificacion_Seleccionar se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub



Private Sub m_FormEjercito_Seleccionar(m_Ejercito As Ejercito)
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    
    If Not m_Ejercito Is Nothing Then
        Me.IDEjercito = m_Ejercito.Ejercito
        
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormEjercito_Seleccionar se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub m_FormOC_Seleccionar(m_OrganoContratacionSeleccionado As OrganoContratacion)
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    
    If Not m_OrganoContratacionSeleccionado Is Nothing Then
        Me.IDOrganoContratacion = m_OrganoContratacionSeleccionado.OrganoContratacion
        
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormOC_Seleccionar se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub




Private Sub m_FormOficinaPrograma_Seleccionar(m_OficinaProgramaSeleccionada As OficinaPrograma)
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    If Not m_OficinaProgramaSeleccionada Is Nothing Then
        Me.IDOficinaPrograma = m_OficinaProgramaSeleccionada.OficinaPrograma
        
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormOficinaPrograma_Seleccionar se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub