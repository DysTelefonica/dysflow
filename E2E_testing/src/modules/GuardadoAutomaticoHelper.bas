Attribute VB_Name = "GuardadoAutomaticoHelper"
Option Compare Database
Option Explicit

Public Function getSnapshot(frm As Form, Optional ByRef p_Error As String) As String
    Dim ctl As Control
    Dim m_Campo As String
    Dim m_Valor As String
    Dim m_Snapshot As String
    On Error GoTo errores
    
    
    
    For Each ctl In frm.Controls
        If ctl.ControlType = acTextBox Or ctl.ControlType = acComboBox Then
            If m_Snapshot = "" Then
                m_Snapshot = Nz(ctl.value, "")
            Else
                m_Snapshot = m_Snapshot & "||" & Nz(ctl.value, "")
            End If
          
        End If
    Next ctl
    getSnapshot = m_Snapshot
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSnapshot ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function



'------------------------------------------------------------------------------
' SetDTOFromForm
' Copia los controles del formulario al DTO del expediente.
' Delega en SetDTOFromGeneral o SetDTOFromFechas según el tipo de formulario.
'------------------------------------------------------------------------------
Public Function SetDTOFromForm( _
                                frm As Form, _
                                p_ObjExpedienteDTO As ExpedienteDTO, _
                                Optional ByRef p_Error As String _
                                ) As String
    On Error GoTo errores
    If frm.Name = "FormExpedienteGeneral" Then
        SetDTOFromForm = SetDTOFromGeneral(frm, p_ObjExpedienteDTO, p_Error)
    ElseIf frm.Name = "FormExpedienteFechas" Then
        SetDTOFromForm = SetDTOFromFechas(frm, p_ObjExpedienteDTO, p_Error)
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SetDTOFromForm a devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function SetDTOFromGeneral( _
                                frm As Form, _
                                p_Expediente As Expediente, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    Dim m_TipoEnum As EnumAPLICAAGEDYS
    Dim m_Ejercito As Ejercito
    Dim m_OC As OrganoContratacion
    Dim m_Op As OficinaPrograma
    Dim m_Clasificacion As GradoClasificacion
    Dim m_GradoClasificacion As String
    Dim m_EjercitoNombre As String
    Dim m_OCNombre As String
    Dim m_OPNombre As String
    
    On Error GoTo errores
   
    If p_Expediente Is Nothing Then
        p_Error = "No se ha establecido el expediente"
        Err.Raise 1000
    End If
    With p_Expediente
        
        If .IDExpediente = "" Then
            .POSTAGEDO = "Sí"
        Else
            If .POSTAGEDO = "" Then .POSTAGEDO = "Sí"
            
        End If
        .HPSAplica = Nz(frm.HPSAplica, "")
        If IsNumeric(frm.Ordinal) Then .Ordinal = Format(frm.Ordinal, "00")
        .ESTADO = "DESCONOCIDO"
        If IsNumeric(frm.IDResponsableSeguridad) Then .IDResponsableSeguridad = frm.IDResponsableSeguridad
        .Ambito = Nz(frm.Ambito.value, "")
        .APLICAESTADO = Nz(frm.APLICAESTADO.value, "")
        If IsNumeric(frm.AGEDYSAplica.Column(0)) Then
            m_TipoEnum = CLng(frm.AGEDYSAplica.Column(0))
            If m_TipoEnum = EnumAPLICAAGEDYS.No Then
                .AGEDYSAplica = "No"
                .AGEDYSGenerico = ""
            ElseIf m_TipoEnum = EnumAPLICAAGEDYS.SiExpGenerico Then
                .AGEDYSAplica = "Sí"
                .AGEDYSGenerico = "Sí"
            ElseIf m_TipoEnum = EnumAPLICAAGEDYS.SiExpNormal Then
                .AGEDYSAplica = "Sí"
                .AGEDYSGenerico = "No"
            End If
        Else
            .AGEDYSAplica = ""
            .AGEDYSGenerico = ""
        End If
        
        .CodExp = Nz(frm.CodExp.value, "")
        .CodExpLargo = Nz(frm.CodExpLargo.value, "")
        .ImporteLicitacion = Nz(frm.ImporteLicitacion.value, "")
        .ImporteContratacion = Nz(frm.ImporteContratacion.value, "")
        .Titulo = Nz(frm.Titulo.value, "")
        .ObjetoContrato = Nz(frm.ObjetoContrato.value, "")
        
        m_GradoClasificacion = Nz(frm.IdGradoClasificacion, "")
         If m_GradoClasificacion <> "" Then
            Set m_Clasificacion = getGradoClasificacion(p_GradoClasificacion:=m_GradoClasificacion, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If m_Clasificacion Is Nothing Then
                p_Error = "No se reconoce el grado de clasificación"
                Err.Raise 1000
            End If
            .IdGradoClasificacion = m_Clasificacion.IdGradoClasificacion
        End If
        
        .Nemotecnico = Nz(frm.Nemotecnico.value, "")
        .Ordinal = Nz(frm.Ordinal.value, "")
        m_OCNombre = Nz(frm.IDOrganoContratacion, "")
        If m_OCNombre <> "" Then
            Set m_OC = getOrganoContratacion(p_OrganoContratacion:=m_OCNombre, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If m_OC Is Nothing Then
                p_Error = "No se reconoce el órgano de contratación"
                Err.Raise 1000
            End If
            .IDOrganoContratacion = m_OC.IDOrganoContratacion
        End If
        m_EjercitoNombre = Nz(frm.IDEjercito, "")
        If m_EjercitoNombre <> "" Then
            Set m_Ejercito = getEjercito(p_Ejercito:=m_EjercitoNombre, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If m_Ejercito Is Nothing Then
                p_Error = "No se reconoce el ejército seleccionado"
                Err.Raise 1000
            End If
            .IDEjercito = m_Ejercito.IDEjercito
        End If
        m_OPNombre = Nz(frm.IDOficinaPrograma, "")
        If m_OPNombre <> "" Then
            Set m_Op = getOficinaPrograma(p_OficinaPrograma:=m_OPNombre, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If m_Op Is Nothing Then
                p_Error = "No se reconoce la Oficina de Programa"
                Err.Raise 1000
            End If
            .IDOficinaPrograma = m_Op.IDOficinaPrograma
        End If
        .IDResponsableCalidad = Nz(frm.IDResponsableCalidad.Column(0), "")
        .IDResponsableSeguridad = Nz(frm.IDResponsableSeguridad.Column(0), "")
        .CodS4H = Nz(frm.CodS4H.value, "")
        .NPedido = Nz(frm.NPedido.value, "")
        .CodProyecto = Nz(frm.CodProyecto.value, "")
        .CodigoActividad = Nz(frm.CodigoActividad.value, "")
        .AccesoSharepoint = Nz(frm.AccesoSharepoint.value, "")
        .Observaciones = Nz(frm.Observaciones.value, "")
    End With
    
    
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SetDTOFromGeneral a devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function SetFormGeneralFromExpediente( _
                                            p_IDExpediente As String, _
                                            frm As Form, _
                                            Optional ByRef p_Error As String _
                                            ) As String

    Dim m_TipoEnum As EnumAPLICAAGEDYS
    Dim m_Ejercito As Ejercito
    Dim m_OC As OrganoContratacion
    Dim m_Op As OficinaPrograma
    Dim m_Clasificacion As GradoClasificacion
    Dim m_expediente As Expediente
    
    On Error GoTo errores
    
    Set m_expediente = constructor.getExpediente(p_IDExpediente:=p_IDExpediente, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_expediente Is Nothing Then
        p_Error = "No se ha podido determinar el expediente"
        Err.Raise 1000
    End If
    With m_expediente
        If .Ambito <> "" Then
            frm.Ambito = .Ambito
        End If
        If .APLICAESTADO <> "" Then
            frm.APLICAESTADO = .APLICAESTADO
        End If
        If .AGEDYSAplica = "Sí Exp Normal" Then
            frm.AGEDYSAplica = 2
        ElseIf .AGEDYSAplica = "Sí Exp Genérico (OTROS_COMERCIALES)" Then
            frm.AGEDYSAplica = 3
        ElseIf .AGEDYSAplica = "No" Then
            frm.AGEDYSAplica = 1
        End If
        If .HPSAplica = "Sí" Or .HPSAplica = "No" Then
            frm.HPSAplica = .HPSAplica
        Else
            frm.HPSAplica = "Sí"
        End If
        frm.CodExp = .CodExp
        frm.CodExpLargo = .CodExpLargo
        If IsNumeric(.ImporteLicitacion) Then
            frm.ImporteLicitacion = Format(.ImporteLicitacion, "#,##0.00 €")
        End If
        If IsNumeric(.ImporteContratacion) Then
            frm.ImporteContratacion = Format(.ImporteContratacion, "#,##0.00 €")
        End If
        frm.Titulo = .Titulo
        If IsNumeric(.IdGradoClasificacion) Then
            Set m_Clasificacion = constructor.getGradoClasificacion(p_IdGradoClasificacion:=.IdGradoClasificacion, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If m_Clasificacion Is Nothing Then
                p_Error = "El Expediente tiene grabado un IdGradoClasificacion=" & .IdGradoClasificacion & _
                            " y no está registrado en estos momentos"
                Err.Raise 1000
            End If
            frm.IdGradoClasificacion = m_Clasificacion.GradoClasificacion
        End If
        If IsNumeric(.Ordinal) Then
            frm.Ordinal = Format(.Ordinal, "00")
        End If
        If .AplicaTareaS4H = "Sí" Or .AplicaTareaS4H = "No" Then
            frm.AplicaTareaS4H = .AplicaTareaS4H
        End If
        frm.Nemotecnico = .Nemotecnico
        If IsNumeric(.IDOrganoContratacion) Then
            
            Set m_OC = getOrganoContratacion(p_IDOrganoContratacion:=.IDOrganoContratacion, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If m_OC Is Nothing Then
                p_Error = "El Expediente tiene grabado un IDOrganoContratacion=" & .IDOrganoContratacion & _
                            " y no está registrado en estos momentos"
                Err.Raise 1000
            End If
            frm.IDOrganoContratacion = m_OC.OrganoContratacion
        End If
        If IsNumeric(.IDEjercito) Then
            
            Set m_Ejercito = getEjercito(p_IDEjercito:=.IDEjercito, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If m_Ejercito Is Nothing Then
                p_Error = "El Expediente tiene grabado un IDEjercito=" & .IDEjercito & _
                            " y no está registrado en estos momentos"
                Err.Raise 1000
            End If
            frm.IDEjercito = m_Ejercito.Ejercito
        End If
        If IsNumeric(.IDOficinaPrograma) Then
            
            Set m_Op = getOficinaPrograma(p_IDOficinaPrograma:=.IDOficinaPrograma, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If m_Op Is Nothing Then
                p_Error = "El Expediente tiene grabado un IDOficinaPrograma=" & .IDOficinaPrograma & _
                            " y no está registrado en estos momentos"
                Err.Raise 1000
            End If
            frm.IDOficinaPrograma = m_Op.OficinaPrograma
        End If
        If IsNumeric(.IDResponsableCalidad) Then
            frm.IDResponsableCalidad = .IDResponsableCalidad
        End If
        If .CodS4H <> "" Then
            frm.CodS4H = .CodS4H
        End If
        If .NPedido <> "" Then
            frm.NPedido = .NPedido
        End If
        If IsNumeric(.IDResponsableSeguridad) Then
            frm.IDResponsableSeguridad = .IDResponsableSeguridad
        End If
        If .CodProyecto <> "" Then
            frm.CodProyecto = .CodProyecto
        End If
        frm.TIpo = .TipoCalculadoTexto
        If .CodigoActividad <> "" Then
            frm.CodigoActividad = .CodigoActividad
        End If
        If .POSTAGEDO = "Sí" Or .POSTAGEDO = "No" Then
            frm.EnListas = .POSTAGEDO
        Else
            frm.EnListas = "Sí"
        End If
        If .AccesoSharepoint <> "" Then
            frm.AccesoSharepoint = .AccesoSharepoint
        End If
        If .ObjetoContrato <> "" Then
            frm.ObjetoContrato = .ObjetoContrato
        End If
        If .Observaciones <> "" Then
            frm.Observaciones = .Observaciones
        End If
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SetFormGeneralFromExpediente a devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function SetFormFechasFromExpediente( _
                                            p_IDExpediente As String, _
                                            frm As Form, _
                                            Optional ByRef p_Error As String _
                                            ) As String

    Dim ctl As Control
    Dim m_expediente As Expediente
    On Error GoTo errores
    
    Set m_expediente = constructor.getExpediente(p_IDExpediente:=p_IDExpediente, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_expediente Is Nothing Then
        p_Error = "No se ha podido determinar el expediente"
        Err.Raise 1000
    End If
    For Each ctl In frm.Controls
        If Nz(ctl.Tag, "") = "PARAFECHA" Then
            If AbiertoParaEditar = True Then
                If EsAdministrador = EnumSiNo.Sí Then
                    ctl.Enabled = True
                Else
                    ctl.Enabled = False
                End If
            Else
                ctl.Enabled = False
            End If
                
        End If
    Next
    With m_expediente
        If .FECHAINICIOLICITACION <> "" Then
            frm.FECHAINICIOLICITACION = .FECHAINICIOLICITACION
        End If
        If .FECHAPREOFERTA <> "" Then
            frm.FECHAPREOFERTA = .FECHAPREOFERTA
        End If
        If .FECHAOFERTA <> "" Then
            frm.FECHAOFERTA = .FECHAOFERTA
        End If
        If .FECHADESESTIMADA <> "" Then
            frm.FECHADESESTIMADA = .FECHADESESTIMADA
        End If
        If .FECHAPERDIDA <> "" Then
            frm.FECHAPERDIDA = .FECHAPERDIDA
        End If
        If .FechaInicioContrato <> "" Then
            frm.FechaInicioContrato = .FechaInicioContrato
        End If
        If .FechaFinContrato <> "" Then
            frm.FechaFinContrato = .FechaFinContrato
        End If
        If .GARANTIAMESES <> "" Then
            frm.GARANTIAMESES = .GARANTIAMESES
        End If
        If .FECHAADJUDICACION <> "" Then
            frm.FECHAADJUDICACION = .FECHAADJUDICACION
        End If
        If .FECHAFIRMACONTRATO <> "" Then
            frm.FECHAFIRMACONTRATO = .FECHAFIRMACONTRATO
        End If
        If .FECHACERTIFICACION <> "" Then
            frm.FECHACERTIFICACION = .FECHACERTIFICACION
        End If
        If .FechaFinGarantia <> "" Then
            frm.FechaFinGarantia = .FechaFinGarantia
        End If
        frm.lblEstadoExpediente.Caption = "ESTADO: " & UCase(.ESTADOCalculadoTitulo)
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SetFormFechasFromExpediente a devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Private Function SetDTOFromFechas( _
                                    frm As Form, _
                                    p_ObjExpedienteDTO As ExpedienteDTO, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    On Error GoTo errores
    
    If p_ObjExpedienteDTO Is Nothing Then
       Exit Function
    End If
    
    With p_ObjExpedienteDTO.Expediente
        .FECHAINICIOLICITACION = Nz(frm.FECHAINICIOLICITACION.value, "")
        .FECHAPREOFERTA = Nz(frm.FECHAPREOFERTA.value, "")
        .FECHAOFERTA = Nz(frm.FECHAOFERTA.value, "")
        .FECHADESESTIMADA = Nz(frm.FECHADESESTIMADA.value, "")
        .FECHAPERDIDA = Nz(frm.FECHAPERDIDA.value, "")
        .FECHAADJUDICACION = Nz(frm.FECHAADJUDICACION.value, "")
        .FechaInicioContrato = Nz(frm.FechaInicioContrato.value, "")
        .FechaFinContrato = Nz(frm.FechaFinContrato.value, "")
        .GARANTIAMESES = Nz(frm.GARANTIAMESES.value, "")
        .FECHAFIRMACONTRATO = Nz(frm.FECHAFIRMACONTRATO.value, "")
        .FECHACERTIFICACION = Nz(frm.FECHACERTIFICACION.value, "")
        .FechaFinGarantia = Nz(frm.FechaFinGarantia.value, "")
        
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SetDTOFromFechas a devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Public Function GuardarPestana( _
                                frm As Form, _
                                p_IDExpediente As String, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    
    
    On Error GoTo errores
    
     If frm.Name = "FormExpedienteGeneral" Then
        GuardarPestanaGeneral frm:=frm, p_IDExpediente:=p_IDExpediente, p_Error:=p_Error
    ElseIf frm.Name = "FormExpedienteFechas" Then
        GuardarPestanaFechas frm:=frm, p_IDExpediente:=p_IDExpediente, p_Error:=p_Error
    End If

   
   

    
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GuardarPestana ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Function PestanaNoSoportadaConPendientes(frm As Form) As Boolean
    On Error GoTo errores

    If frm Is Nothing Then Exit Function

    Select Case frm.Name
        Case "FormExpedienteGeneral", "FormExpedienteFechas"
            PestanaNoSoportadaConPendientes = False
        Case "FormExpedienteHitos", "FormExpedienteModificados"
            PestanaNoSoportadaConPendientes = CBool(CallByName(frm, "HayDatosPendientes", VbMethod))
    End Select

    Exit Function
errores:
    PestanaNoSoportadaConPendientes = False
End Function


Public Function getNombrePestana( _
                                    frm As Form, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    On Error GoTo errores
    If frm.Name = "FormExpedienteGeneral" Then
        getNombrePestana = "tabGeneral"
    ElseIf frm.Name = "FormExpedienteFechas" Then
        getNombrePestana = "tabFechas"
    ElseIf frm.Name = "FormExpedienteEntidades" Then
        getNombrePestana = "tabEntidades"
    ElseIf frm.Name = "FormExpedienteSuministradores" Then
        getNombrePestana = "tabSuministradores"
    ElseIf frm.Name = "FormExpedienteDocumentacion" Then
        getNombrePestana = "tabAnexos"
    ElseIf frm.Name = "FormExpedienteHitos" Then
        getNombrePestana = "tabHitos"
    ElseIf frm.Name = "FormExpedienteModificados" Then
        getNombrePestana = "tabModificados"
    Else
        p_Error = "Pestaña desconocida"
        Err.Raise 1000
    End If
    
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNombrePestana ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function



Public Function NavegarAPestana( _
                                frm As Form, _
                                Optional ByRef p_Error As String _
                                ) As String
    Dim nombreTab As String
    Dim nombreSubform As String
    Dim rutaSubform As String
    On Error GoTo errores
    
    
    nombreSubform = frm.Name
    
    frm.Parent.SetFocus
    nombreTab = getNombrePestana(frm, p_Error)
    If p_Error <> "" Then Err.Raise 1000
    rutaSubform = frm.Parent.Name & ".NavigationSubform"
    DoCmd.BrowseTo acBrowseToForm, nombreSubform, rutaSubform

     
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NavegarAPestana ha devuelto el error: " & vbNewLine & Err.Description
    End If
    
   
End Function
Public Function getFormPestanaActiva( _
                                    frmPadre As Form, _
                                    Optional ByRef p_Error As String _
                                    ) As Form
    
    On Error GoTo errores

    ' Intentar FrmDetalle primero
    Dim err1 As Long
    On Error Resume Next
    Set getFormPestanaActiva = frmPadre.FrmDetalle.Form
    err1 = Err.Number
    On Error GoTo errores
    
    If err1 = 0 And Not getFormPestanaActiva Is Nothing Then
        Exit Function
    End If
    
    ' Intentar NavigationSubform como fallback
    Dim err2 As Long
    On Error Resume Next
    Set getFormPestanaActiva = frmPadre.NavigationSubform.Form
    err2 = Err.Number
    On Error GoTo errores
    
    If err2 = 0 And Not getFormPestanaActiva Is Nothing Then
        Exit Function
    End If
    
    p_Error = "No se encontró el subformulario activo del expediente"
    Err.Raise 1000
    Exit Function

    If getFormPestanaActiva Is Nothing Then
        p_Error = "No se encontró el subformulario activo del expediente"
        Err.Raise 1000
    End If

   

    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getFormPestanaActiva ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function GuardarPestanaActiva( _
                                    frmPadre As Form, _
                                    p_IDExpediente As String, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
        
    Dim m_form As Form
    On Error GoTo errores
    Set m_form = getFormPestanaActiva(frmPadre, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If PestanaNoSoportadaConPendientes(m_form) Then
        p_Error = "La pestaña activa tiene datos pendientes que todavía no se pueden guardar automáticamente. Regístrelos antes de cerrar el expediente."
        Err.Raise 1000
    End If
    GuardarPestanaActiva = GuardarPestana(frm:=m_form, p_IDExpediente:=p_IDExpediente, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GuardarPestanaActiva ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

'------------------------------------------------------------------------------
' HeredarDatosDePadre
' Poblal los controles del formulario de alta con los datos heredados del padre.
' Se llama desde Form_FormExpedienteAlta.Form_Load cuando hay padre.
'------------------------------------------------------------------------------
Public Function HeredarDatosDePadre( _
                                    frm As Form, _
                                    p_IDExpedientePadre As String, _
                                    p_TipoEnum As EnumTipoExpediente, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    Dim m_Padre As Expediente
    Dim m_OC As OrganoContratacion
    Dim m_Clasificacion As GradoClasificacion
    Dim m_Ejercito As Ejercito
    Dim m_Op As OficinaPrograma
    Dim m_Nemotecnico As String
    Dim m_Ordinal As String
    On Error GoTo errores
    
    If Not IsNumeric(p_IDExpedientePadre) Then
        p_Error = "No se ha indicado el ID del Padre"
        Err.Raise 1000
    End If
    
   
    ' Cargar el padre para acceder a sus datos
    Set m_Padre = constructor.getExpediente(p_IDExpediente:=p_IDExpedientePadre, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Padre Is Nothing Then
        p_Error = "No se ha podido obtener el Expediente Padre"
        Err.Raise 1000
    End If
    With m_Padre
        frm.IDResponsableSeguridad = .IDResponsableSeguridad
        frm.ObjetoContrato = .ObjetoContrato
        If .IDOrganoContratacion <> "" Then
            Set m_OC = getOrganoContratacion(p_IDOrganoContratacion:=.IDOrganoContratacion, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If Not m_OC Is Nothing Then
                frm.IDOrganoContratacion = m_OC.OrganoContratacion
            End If
        End If
        If .IdGradoClasificacion <> "" Then
            Set m_Clasificacion = getGradoClasificacion(p_IdGradoClasificacion:=.IdGradoClasificacion, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If Not m_Clasificacion Is Nothing Then
                frm.IdGradoClasificacion = m_Clasificacion.GradoClasificacion
            End If
        End If
        If .IDEjercito <> "" Then
            Set m_Ejercito = getEjercito(p_IDEjercito:=.IDEjercito, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If Not m_Ejercito Is Nothing Then
                frm.IDEjercito = m_Ejercito.IDEjercito
            End If
        End If
        If .IDOficinaPrograma <> "" Then
            Set m_Op = getOficinaPrograma(p_IDOficinaPrograma:=.IDOficinaPrograma, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If Not m_Op Is Nothing Then
               
                frm.IDOficinaPrograma = m_Op.OficinaPrograma
            End If
        End If
        If .AGEDYSAplica <> "" Then
            If .AGEDYSAplica = "No" Then
                frm.AGEDYSAplica = 1
            ElseIf .AGEDYSAplica = "Sí Exp Normal" Then
                frm.AGEDYSAplica = 2
            ElseIf .AGEDYSAplica = "Sí Exp Genérico (OTROS_COMERCIALES)" Then
                frm.AGEDYSAplica = 3
            End If
            
        End If
        
        m_Ordinal = CalcularOrdinalSiguiente(m_Padre, p_TipoEnum, p_Error)
        ' Ordinal calculado con helper
        frm.Ordinal = m_Ordinal
        If p_Error <> "" Then Err.Raise 1000
        
        frm.Ambito = .Ambito
        
        frm.APLICAESTADO = .APLICAESTADO
          
        m_Nemotecnico = CalcularNemotecnicoCalculado(m_Padre, m_Ordinal, _
            p_TipoEnum, , p_Error)
        If p_Error <> "" Then Err.Raise 1000
        If m_Nemotecnico <> "" Then
            frm.Nemotecnico = m_Nemotecnico
        End If
    End With
    
    
     Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HeredarDatosDePadre ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function SetDatosDeExpedienteTipo( _
                                            p_Expediente As Expediente, _
                                            p_TipoEnum As EnumTipoExpediente, _
                                            Optional ByRef p_Error As String _
                                            ) As String
                                            
    
    
    On Error GoTo errores
   
    If p_Expediente Is Nothing Then
        Exit Function
    End If
    With p_Expediente
        If p_TipoEnum = EnumTipoExpediente.AM Then
            .EsAM = "Sí"
            .EsLote = "No"
            .EsBasado = "No"
            .EsExpediente = "No"
            .TIpo = "Acuerdo Marco"
        ElseIf p_TipoEnum = EnumTipoExpediente.Lote Then
            .EsAM = "No"
            .EsLote = "Sí"
            .EsBasado = "No"
            .EsExpediente = "No"
            .TIpo = "Lote"
        ElseIf p_TipoEnum = EnumTipoExpediente.BasadoDeAM Then
            .EsAM = "No"
            .EsLote = "No"
            .EsBasado = "Sí"
            .EsExpediente = "No"
            .TIpo = "Contrato Basado de AM"
        ElseIf p_TipoEnum = EnumTipoExpediente.BasadoDeLote Then
            .EsAM = "No"
            .EsLote = "No"
            .EsBasado = "Sí"
            .EsExpediente = "No"
            .TIpo = "Contrato Basado de Lote"
        ElseIf p_TipoEnum = EnumTipoExpediente.EXPIndividual Then
            .EsAM = "No"
            .EsLote = "No"
            .EsBasado = "No"
            .EsExpediente = "Sí"
            .TIpo = "Expediente individual"
        ElseIf p_TipoEnum = EnumTipoExpediente.EXPHPS Then
            .EsAM = "No"
            .EsLote = "No"
            .EsBasado = "No"
            .EsExpediente = "Sí"
       
        End If
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SetDatosDeExpedienteTipo ha producido el error : " & vbNewLine & Err.Description
    End If
End Function
'------------------------------------------------------------------------------
' CalcularOrdinalSiguiente
' Calcula el ordinal del siguiente hijo del tipo indicado.
' Testable, sin acoplamiento a formularios.
' p_Padre: expediente padre del que se heredan los datos
' p_TipoEnumHijo: EnumTipoExpediente del hijo (Lote, BasadoDeAM, BasadoDeLote, etc.)
'------------------------------------------------------------------------------
Public Function CalcularOrdinalSiguiente( _
                            p_Padre As Expediente, _
                            p_TipoEnumHijo As EnumTipoExpediente, _
                            Optional ByRef p_Error As String _
                            ) As String
    Dim m_UltimoHijo As Expediente
    On Error GoTo errores

    If p_Padre Is Nothing Then
        p_Error = "No hay expediente padre"
        Exit Function
    End If

    If p_TipoEnumHijo = EnumTipoExpediente.Lote Then
        Set m_UltimoHijo = p_Padre.UltimoLoteDerivado
    Else
        Set m_UltimoHijo = p_Padre.UltimoBasadoDerivado
    End If

    If m_UltimoHijo Is Nothing Then
        CalcularOrdinalSiguiente = "01"
    ElseIf IsNumeric(m_UltimoHijo.Ordinal) Then
        CalcularOrdinalSiguiente = Format(CInt(m_UltimoHijo.Ordinal) + 1, "00")
    Else
        CalcularOrdinalSiguiente = "01"
    End If

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "CalcularOrdinalSiguiente: " & Err.Description
    End If
End Function

'------------------------------------------------------------------------------
' CalcularNemotecnicoCalculado
' Calcula el nemotécnico del hijo según reglas de encadenamiento.
' Testable, sin acoplamiento a formularios.
' p_Padre: expediente padre
' p_Ordinal: ordinal del hijo ya calculado
' p_TipoEnumHijo: EnumTipoExpediente del hijo
' p_EjercitoDesc: descripción del ejército (opcional, para basado con ejército)
'------------------------------------------------------------------------------
Public Function CalcularNemotecnicoCalculado( _
                            p_Padre As Expediente, _
                            p_Ordinal As String, _
                            p_TipoEnumHijo As EnumTipoExpediente, _
                            Optional p_EjercitoDesc As String = "", _
                            Optional ByRef p_Error As String _
                            ) As String
    Dim m_Nemotecnico As String
    On Error GoTo errores

    If p_Padre Is Nothing Then
        p_Error = "No hay expediente padre"
        Exit Function
    End If

    If p_Padre.Nemotecnico = "" Then
        Exit Function
    End If

    If p_TipoEnumHijo = EnumTipoExpediente.Lote Then
        If IsNumeric(p_Ordinal) Then
            m_Nemotecnico = p_Padre.Nemotecnico & "_L" & Format(p_Ordinal, "00")
        End If
    ElseIf p_TipoEnumHijo = EnumTipoExpediente.BasadoDeAM Or p_TipoEnumHijo = EnumTipoExpediente.BasadoDeLote Then
        If IsNumeric(p_Ordinal) Then
            m_Nemotecnico = p_Padre.Nemotecnico & "_CB" & Format(p_Ordinal, "00")
            If p_EjercitoDesc <> "" And p_EjercitoDesc <> "N/A" Then
                m_Nemotecnico = m_Nemotecnico & "_" & p_EjercitoDesc
            End If
        Else
            If p_EjercitoDesc <> "" And p_EjercitoDesc <> "N/A" Then
                m_Nemotecnico = p_Padre.Nemotecnico & "_" & p_EjercitoDesc
            End If
        End If
    End If

    CalcularNemotecnicoCalculado = m_Nemotecnico

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "CalcularNemotecnicoCalculado: " & Err.Description
    End If
End Function
Public Function EstablecerCombos( _
                                frm As Form, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    Dim cmb As ComboBox
    Dim m_ID As Variant
    Dim i As Integer
    
    Dim m_Col As Scripting.Dictionary
    On Error GoTo errores
    
   
    
    
    Dim m_RespCalidad As USUARIO
    Set cmb = frm.IDResponsableCalidad
    cmb.RowSource = ""
    Set m_Col = m_ObjEntorno.ColUsuariosCalidad
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            Set m_RespCalidad = m_Col(m_ID)
            cmb.AddItem m_RespCalidad.ID & ";" & m_RespCalidad.Nombre
            Set m_RespCalidad = Nothing
        Next
    End If
    Set cmb = frm.IDResponsableSeguridad
    cmb.RowSource = "0;N/A;" & _
                "162;Martina Torralba Rodríguez;" & _
                "127;Esperanza del Álamo Arriba;" & _
                "200;Almudena Cárdenas Velloso;" & _
                "206;Laura Écija López;"
    cmb.DefaultValue = 0
    'cmb.RowSource = "162;Martina Torralba Rodríguez;127;Esperanza del Álamo Arriba;200;Almudena Cárdenas Velloso"
    Set cmb = frm.AGEDYSAplica
    cmb.RowSource = ""
    Set m_Col = m_ObjEntorno.ColTiposAplicaAgedys
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            cmb.AddItem m_ID & ";" & m_ObjEntorno.ColTiposAplicaAgedys(m_ID)
        Next
    End If
    Set cmb = frm.Ordinal
    For i = 1 To 20
        cmb.AddItem Format(i, "00")
    Next
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerCombos ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If

End Function


Public Function GuardarPestanaFechas( _
                                        frm As Form, _
                                        p_IDExpediente As String, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim dbUse As DAO.Database
    Dim m_expediente As Expediente
    On Error GoTo errores
    
    p_Error = ""
   
    If Not IsNumeric(p_IDExpediente) Then
        p_Error = "No se ha indicado el expediente"
        Err.Raise 1000
    End If
      
    Set dbUse = getdb()
    
    m_SQL = "SELECT * FROM TbExpedientes WHERE IDExpediente=" & p_IDExpediente & ";"
    Set rcdDatos = dbUse.OpenRecordset(m_SQL)
    
    If rcdDatos.EOF Then
        rcdDatos.Close
        Exit Function
    End If
    
    rcdDatos.Edit
    
    With frm
        rcdDatos.Fields("FECHAINICIOLICITACION").value = IIf(IsDate(.FECHAINICIOLICITACION), .FECHAINICIOLICITACION, Null)
        rcdDatos.Fields("FECHAPREOFERTA").value = IIf(IsDate(.FECHAPREOFERTA), .FECHAPREOFERTA, Null)
        rcdDatos.Fields("FECHAOFERTA").value = IIf(IsDate(.FECHAOFERTA), .FECHAOFERTA, Null)
        rcdDatos.Fields("FECHADESESTIMADA").value = IIf(IsDate(.FECHADESESTIMADA), .FECHADESESTIMADA, Null)
        rcdDatos.Fields("FECHAPERDIDA").value = IIf(IsDate(.FECHAPERDIDA), .FECHAPERDIDA, Null)
        rcdDatos.Fields("FechaInicioContrato").value = IIf(IsDate(.FechaInicioContrato), .FechaInicioContrato, Null)
        rcdDatos.Fields("FechaFinContrato").value = IIf(IsDate(.FechaFinContrato), .FechaFinContrato, Null)
        rcdDatos.Fields("GARANTIAMESES").value = IIf(IsNumeric(.GARANTIAMESES), .GARANTIAMESES, Null)
        rcdDatos.Fields("FECHAADJUDICACION").value = IIf(IsDate(.FECHAADJUDICACION), .FECHAADJUDICACION, Null)
        rcdDatos.Fields("FECHAFIRMACONTRATO").value = IIf(IsDate(.FECHAFIRMACONTRATO), .FECHAFIRMACONTRATO, Null)
        rcdDatos.Fields("FECHACERTIFICACION").value = IIf(IsDate(.FECHACERTIFICACION), .FECHACERTIFICACION, Null)
        rcdDatos.Fields("FechaFinGarantia").value = IIf(IsDate(.FechaFinGarantia), .FechaFinGarantia, Null)
    End With
    
    rcdDatos.Update
    rcdDatos.Close
    Set rcdDatos = Nothing
    Set m_expediente = constructor.getExpediente(p_IDExpediente:=p_IDExpediente, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    ' Registrar último cambio
    RegistrarUltimoCambio p_IDExpediente:=p_IDExpediente, p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    ActualizarCache p_Expediente:=m_expediente, p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    GuardarPestanaFechas = "1"
    Exit Function
    
errores:
    If Not rcdDatos Is Nothing Then
        If Not rcdDatos.EOF Then rcdDatos.CancelUpdate
        rcdDatos.Close
    End If
    If Err.Number <> 1000 Then
        p_Error = "GuardarPestanaFechas: " & Err.Description
    End If
End Function

Public Function GuardarPestanaGeneral( _
                                        p_IDExpediente As String, _
                                        frm As Form, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim dbUse As DAO.Database
    Dim m_expediente As Expediente
    
    On Error GoTo errores
    
    p_Error = ""
    If Not IsNumeric(p_IDExpediente) Then
        p_Error = "No se ha indicado el expediente"
        Err.Raise 1000
    End If
    Set m_expediente = New Expediente
    m_expediente.IDExpediente = p_IDExpediente
    SetDTOFromGeneral frm, m_expediente, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    Set dbUse = getdb()
    
    ' Abrir registro para EDIT (no AddNew)
    m_SQL = "SELECT * FROM TbExpedientes WHERE IDExpediente=" & p_IDExpediente & ";"
    Set rcdDatos = dbUse.OpenRecordset(m_SQL)
    
    If rcdDatos.EOF Then
        rcdDatos.Close
        Exit Function
    End If
    
    rcdDatos.Edit
    
    ' Campos â€” asignación DIRECTA para evitar truncamiento de Memo fields
    With m_expediente
        ' Comparar y asignar solo si hay cambios (para poder retornar "" si no hay cambios)
        ' Se asigna directo al field para preservar contenido completo de memo
        rcdDatos.Fields("Ambito").value = Nz(.Ambito, "")
        rcdDatos.Fields("APLICAESTADO").value = Nz(.APLICAESTADO, "")
        rcdDatos.Fields("AGEDYSAplica").value = Nz(.AGEDYSAplica, "")
        rcdDatos.Fields("AGEDYSGenerico").value = Nz(.AGEDYSGenerico, "")
        rcdDatos.Fields("HPSAplica").value = Nz(.HPSAplica, "")
        rcdDatos.Fields("CodExp").value = Nz(.CodExp, "")
        rcdDatos.Fields("CodExpLargo").value = Nz(.CodExpLargo, "")
        rcdDatos.Fields("ImporteLicitacion").value = IIf(IsNumeric(.ImporteLicitacion), .ImporteLicitacion, Null)
        rcdDatos.Fields("ImporteContratacion").value = IIf(IsNumeric(.ImporteContratacion), .ImporteContratacion, Null)
        rcdDatos.Fields("Titulo").value = .Titulo  ' Puede ser memo â€” asignación directa
        rcdDatos.Fields("ObjetoContrato").value = .ObjetoContrato  ' Puede ser memo â€” asignación directa
        rcdDatos.Fields("IdGradoClasificacion").value = IIf(.IdGradoClasificacion <> "", .IdGradoClasificacion, Null)
        rcdDatos.Fields("Nemotecnico").value = Nz(.Nemotecnico, "")
        rcdDatos.Fields("Ordinal").value = Nz(.Ordinal, "")
        rcdDatos.Fields("IDOrganoContratacion").value = IIf(.IDOrganoContratacion <> "", .IDOrganoContratacion, Null)
        rcdDatos.Fields("IDEjercito").value = IIf(.IDEjercito <> "", .IDEjercito, Null)
        rcdDatos.Fields("IDOficinaPrograma").value = IIf(.IDOficinaPrograma <> "", .IDOficinaPrograma, Null)
        rcdDatos.Fields("IDResponsableCalidad").value = IIf(.IDResponsableCalidad <> "", .IDResponsableCalidad, Null)
        rcdDatos.Fields("IDResponsableSeguridad").value = IIf(.IDResponsableSeguridad <> "", .IDResponsableSeguridad, Null)
        rcdDatos.Fields("CodS4H").value = Nz(.CodS4H, "")
        rcdDatos.Fields("NPedido").value = Nz(.NPedido, "")
        rcdDatos.Fields("CodProyecto").value = Nz(.CodProyecto, "")
        rcdDatos.Fields("CodigoActividad").value = Nz(.CodigoActividad, "")
        rcdDatos.Fields("AccesoSharepoint").value = Nz(.AccesoSharepoint, "")
        rcdDatos.Fields("Observaciones").value = .Observaciones  ' Memo â€” asignación directa
        rcdDatos.Fields("POSTAGEDO").value = Nz(.POSTAGEDO, "")
        rcdDatos.Fields("AplicaTareaS4H").value = Nz(.AplicaTareaS4H, "")
    End With
    
    rcdDatos.Update
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    ' Registrar último cambio
    RegistrarUltimoCambio p_Expediente:=m_expediente, p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    ' Actualizar caché
    ActualizarCache p_Expediente:=m_expediente, p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
   
    
    GuardarPestanaGeneral = "1"
    Exit Function
    
errores:
    If Not rcdDatos Is Nothing Then
        If Not rcdDatos.EOF Then rcdDatos.CancelUpdate
        rcdDatos.Close
    End If
    If Err.Number <> 1000 Then
        p_Error = "GuardarPestanaGeneral: " & Err.Description
    End If
End Function
Public Function ActualizarCache( _
                                p_Expediente As Expediente, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    Dim m_ExpEntOp As New ExpedienteEntidadOperaciones
    On Error GoTo errores
    
    p_Error = ""
    Set m_ExpEntOp.Expediente = p_Expediente
    m_ExpEntOp.Registrar p_Db:=getdb(), p_Ambito:=EnumAmbitoActualizacion.Cabecera, p_Error:=p_Error
    If p_Error <> "" Then Err.Raise 1000
    Set m_ExpEntOp = Nothing
     
     
    Exit Function
     
errores:
     
    If Err.Number <> 1000 Then
        p_Error = "ActualizarCache: " & Err.Description
    End If
End Function

'------------------------------------------------------------------------------
' AbrirExpedienteEnFechas
' Abre FormExpediente en modo edición en la pestaña Fechas.
' Delegado desde m_FormAltaExpediente_Alta tras un alta exitoso.
' Lógica de negocio en el helper — formulario minimalista.
'------------------------------------------------------------------------------
Public Sub AbrirExpedienteEnFechas( _
                    p_IDExpediente As String, _
                    Optional ByRef p_Error As String)
    On Error GoTo errores
    If p_IDExpediente = "" Then Exit Sub
    If FormularioAbierto("FormExpediente") Then
        DoCmd.Close acForm, "FormExpediente", acSaveNo
    End If
    DoCmd.OpenForm "FormExpediente", OpenArgs:=p_IDExpediente & "|Fechas"
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        p_Error = "AbrirExpedienteEnFechas: " & Err.Description
    End If
End Sub

'------------------------------------------------------------------------------
' NavegarAPestanaSiSolicitada
' Comprueba si OpenArgs indica navegación a una pestaña y la ejecuta.
' Lógica de negocio en el helper — formulario minimalista.
' frm: FormExpediente (el formulario padre que contiene el tab control)
' p_OpenArgs: OpenArgs recebido por el formulario
'------------------------------------------------------------------------------
Public Function NavegarAPestanaSiSolicitada( _
                            frm As Form, _
                            p_OpenArgs As String, _
                            Optional ByRef p_Error As String) As String
    Dim m_Args As String
    On Error GoTo errores

    m_Args = Nz(p_OpenArgs, "")
    If InStr(m_Args, "|Fechas") > 0 Then
        Dim m_SubformActivo As Form
        Set m_SubformActivo = getFormPestanaActiva(frm, p_Error)
        If p_Error <> "" Then Exit Function
        Dim m_Ruta As String
        m_Ruta = frm.Name & "." & m_SubformActivo.Name
        DoCmd.BrowseTo acBrowseToForm, "FormExpedienteFechas", m_Ruta
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "NavegarAPestanaSiSolicitada: " & Err.Description
    End If
End Function



