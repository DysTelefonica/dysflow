VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ExpedienteOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public Expediente As Expediente

' ==============================================================================
' MÉTODO PRINCIPAL TRANSACCIONAL (OPTIMIZADO)
' ==============================================================================
Public Function Registrar( _
                            p_DTO As ExpedienteDTO, _
                            p_ExpedienteAlInicio As Expediente, _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim ws As DAO.Workspace
    Dim dbUse As DAO.Database
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_MotivoNoOK As String
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim bTransaccionIniciadaAqui As Boolean
    Dim esAlta As Boolean
    
    ' Servicios auxiliares
    Dim m_SrvSum As ExpedienteSuministradorServicio
    Dim m_ExpAnualidad As ExpedienteAnualidad
    Dim m_Responsable As ExpedienteResponsable
    Dim m_Lugar As LugarEjecucion
    
    On Error GoTo errores
    
    ' 1. INICIO DE TRANSACCIÓN ATÓMICA
    Set ws = DBEngine.Workspaces(0)
    Set dbUse = getdb() ' Conexión a la base de datos de datos
    
    ws.BeginTrans
    bTransaccionIniciadaAqui = True
    
    ' ---------------------------------------------------------
    ' A. VALIDACIONES Y PREPARACIÓN
    ' ---------------------------------------------------------
    Set Me.Expediente = p_DTO.Expediente
    esAlta = (p_ExpedienteAlInicio Is Nothing)
    
    With Me.Expediente
        If p_DTO.Expediente.POSTAGEDO <> "Sí" And p_DTO.Expediente.POSTAGEDO <> "No" Then
            p_DTO.Expediente.POSTAGEDO = "Sí"
        End If
        
        m_MotivoNoOK = MotivoNoOK(p_DTO, p_ExpedienteAlInicio, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        p_Error = m_MotivoNoOK
        If p_Error <> "" Then Err.Raise 1000
        
        If .Ambito = "HPS" Then .HPSAplica = "Sí"
        If IsNumeric(.Ordinal) Then .Ordinal = Format(.Ordinal, "00")
        .ESTADO = .ESTADOCalculadoTexto
        .FechaFinGarantia = .FechaFinGarantiaCalculada
        p_Error = .Error
        If p_Error <> "" Then Err.Raise 1000
        If .IDResponsableSeguridad = "0" Then .IDResponsableSeguridad = ""
        
        ' Determinación de ID
        If esAlta Then
            m_SQL = "TbExpedientes"
            .IDExpediente = .IDExpedienteCalculado
        Else
            m_SQL = "SELECT * FROM TbExpedientes WHERE IDExpediente=" & .IDExpediente & ";"
        End If
        
        .TIpo = .TipoCalculadoTexto
        .TipoInforme = .TipoInformeCalculado
        
        ' ---------------------------------------------------------
        ' B. GUARDADO DE CABECERA (TbExpedientes)
        ' ---------------------------------------------------------
        Set rcdDatos = dbUse.OpenRecordset(m_SQL)
        
        If esAlta Then
            rcdDatos.AddNew
            rcdDatos.Fields("IdExpediente") = .IDExpediente
        Else
            rcdDatos.Edit
        End If
        ' --- MAPEO DE CAMPOS ---

        ' Texto / IDs
        If .IDExpedientePadre <> "" Then
            rcdDatos.Fields("IDExpedientePadre") = .IDExpedientePadre
        Else
            rcdDatos.Fields("IDExpedientePadre") = Null
        End If
        
        If .Nemotecnico <> "" Then
            rcdDatos.Fields("Nemotecnico") = .Nemotecnico
        Else
            rcdDatos.Fields("Nemotecnico") = Null
        End If
        
        If .Titulo <> "" Then
            rcdDatos.Fields("Titulo") = .Titulo
        Else
            rcdDatos.Fields("Titulo") = Null
        End If
        
        If .ObjetoContrato <> "" Then
            rcdDatos.Fields("ObjetoContrato") = .ObjetoContrato
        Else
            rcdDatos.Fields("ObjetoContrato") = Null
        End If
        
        ' Numéricos
        If IsNumeric(.ImporteLicitacion) Then
            rcdDatos.Fields("ImporteLicitacion") = .ImporteLicitacion
        Else
            rcdDatos.Fields("ImporteLicitacion") = Null
        End If
        
        If IsNumeric(.ImporteContratacion) Then
            rcdDatos.Fields("ImporteContratacion") = .ImporteContratacion
        Else
            rcdDatos.Fields("ImporteContratacion") = Null
        End If
        
        ' Códigos / flags
        If .CodProyecto <> "" Then
            rcdDatos.Fields("CodProyecto") = .CodProyecto
        Else
            rcdDatos.Fields("CodProyecto") = Null
        End If
        
        If .CodExp <> "" Then
            rcdDatos.Fields("CodExp") = .CodExp
        Else
            rcdDatos.Fields("CodExp") = Null
        End If
        
        If .CodExpLargo <> "" Then
            rcdDatos.Fields("CodExpLargo") = .CodExpLargo
        Else
            rcdDatos.Fields("CodExpLargo") = Null
        End If
        
        If .CodS4H <> "" Then
            rcdDatos.Fields("CodS4H") = .CodS4H
        Else
            rcdDatos.Fields("CodS4H") = Null
        End If
        
        If .EsAM <> "" Then
            rcdDatos.Fields("EsAM") = .EsAM
        Else
            rcdDatos.Fields("EsAM") = Null
        End If
        
        If .EsLote <> "" Then
            rcdDatos.Fields("EsLote") = .EsLote
        Else
            rcdDatos.Fields("EsLote") = Null
        End If
        
        If .EsBasado <> "" Then
            rcdDatos.Fields("EsBasado") = .EsBasado
        Else
            rcdDatos.Fields("EsBasado") = Null
        End If
        
        If .EsExpediente <> "" Then
            rcdDatos.Fields("EsExpediente") = .EsExpediente
        Else
            rcdDatos.Fields("EsExpediente") = Null
        End If
        
        If .Ordinal <> "" Then
            rcdDatos.Fields("Ordinal") = .Ordinal
        Else
            rcdDatos.Fields("Ordinal") = Null
        End If

        If IsNull(.OrdinalE2E) Or IsEmpty(.OrdinalE2E) Then
            rcdDatos.Fields("OrdinalE2E") = Null
        ElseIf Not IsNumeric(.OrdinalE2E) Then
            rcdDatos.Fields("OrdinalE2E") = Null
        ElseIf CLng(.OrdinalE2E) <= 0 Then
            rcdDatos.Fields("OrdinalE2E") = Null
        Else
            rcdDatos.Fields("OrdinalE2E") = CLng(.OrdinalE2E)
        End If
        
        If .IdGradoClasificacion <> "" Then
            rcdDatos.Fields("IDGradoClasificacion") = .IdGradoClasificacion
        Else
            rcdDatos.Fields("IDGradoClasificacion") = Null
        End If
        
        If .IDOrganoContratacion <> "" Then
            rcdDatos.Fields("IDOrganoContratacion") = .IDOrganoContratacion
        Else
            rcdDatos.Fields("IDOrganoContratacion") = Null
        End If
        
        If .IDOficinaPrograma <> "" Then
            rcdDatos.Fields("IDOficinaPrograma") = .IDOficinaPrograma
        Else
            rcdDatos.Fields("IDOficinaPrograma") = Null
        End If
        
        If .IDEjercito <> "" Then
            rcdDatos.Fields("IDEjercito") = .IDEjercito
        Else
            rcdDatos.Fields("IDEjercito") = Null
        End If
        
        If .AccesoSharepoint <> "" Then
            rcdDatos.Fields("AccesoSharepoint") = .AccesoSharepoint
        Else
            rcdDatos.Fields("AccesoSharepoint") = Null
        End If
        
        If .Observaciones <> "" Then
            rcdDatos.Fields("Observaciones") = .Observaciones
        Else
            rcdDatos.Fields("Observaciones") = Null
        End If
        
        If .Ambito <> "" Then
            rcdDatos.Fields("Ambito") = .Ambito
        Else
            rcdDatos.Fields("Ambito") = Null
        End If
        
        If .NPedido <> "" Then
            rcdDatos.Fields("NPedido") = .NPedido
        Else
            rcdDatos.Fields("NPedido") = Null
        End If
        
        If .IDResponsableCalidad <> "" Then
            rcdDatos.Fields("IDResponsableCalidad") = .IDResponsableCalidad
        Else
            rcdDatos.Fields("IDResponsableCalidad") = Null
        End If
        
        If .IDResponsableSeguridad <> "" Then
            rcdDatos.Fields("IDResponsableSeguridad") = .IDResponsableSeguridad
        Else
            rcdDatos.Fields("IDResponsableSeguridad") = Null
        End If
        
        If .TIpo <> "" Then
            rcdDatos.Fields("TIpo") = .TIpo
        Else
            rcdDatos.Fields("TIpo") = Null
        End If
        
        If .AGEDYSAplica <> "" Then
            rcdDatos.Fields("AGEDYSAplica") = .AGEDYSAplica
        Else
            rcdDatos.Fields("AGEDYSAplica") = Null
        End If
        
        If .AGEDYSGenerico <> "" Then
            rcdDatos.Fields("AGEDYSGenerico") = .AGEDYSGenerico
        Else
            rcdDatos.Fields("AGEDYSGenerico") = Null
        End If
        
        If .HPSAplica <> "" Then
            rcdDatos.Fields("HPSAplica") = .HPSAplica
        Else
            rcdDatos.Fields("HPSAplica") = Null
        End If
        
        If .TipoInforme <> "" Then
            rcdDatos.Fields("TipoInforme") = .TipoInforme
        Else
            rcdDatos.Fields("TipoInforme") = Null
        End If
        
        If .POSTAGEDO <> "" Then
            rcdDatos.Fields("POSTAGEDO") = .POSTAGEDO
        Else
            rcdDatos.Fields("POSTAGEDO") = Null
        End If
        
        If .APLICAESTADO <> "" Then
            rcdDatos.Fields("APLICAESTADO") = .APLICAESTADO
        Else
            rcdDatos.Fields("APLICAESTADO") = Null
        End If
        
        ' --- Fechas ---
        If .FECHAINICIOLICITACION <> "" Then
            rcdDatos.Fields("FECHAINICIOLICITACION") = .FECHAINICIOLICITACION
        Else
            rcdDatos.Fields("FECHAINICIOLICITACION") = Null
        End If
        
        If .FECHAPREOFERTA <> "" Then
            rcdDatos.Fields("FECHAPREOFERTA") = .FECHAPREOFERTA
        Else
            rcdDatos.Fields("FECHAPREOFERTA") = Null
        End If
        
        If .FECHAOFERTA <> "" Then
            rcdDatos.Fields("FECHAOFERTA") = .FECHAOFERTA
        Else
            rcdDatos.Fields("FECHAOFERTA") = Null
        End If
        
        If .FECHADESESTIMADA <> "" Then
            rcdDatos.Fields("FECHADESESTIMADA") = .FECHADESESTIMADA
        Else
            rcdDatos.Fields("FECHADESESTIMADA") = Null
        End If
        
        If .FECHAPERDIDA <> "" Then
            rcdDatos.Fields("FECHAPERDIDA") = .FECHAPERDIDA
        Else
            rcdDatos.Fields("FECHAPERDIDA") = Null
        End If
        
        If .FechaInicioContrato <> "" Then
            rcdDatos.Fields("FechaInicioContrato") = .FechaInicioContrato
        Else
            rcdDatos.Fields("FechaInicioContrato") = Null
        End If
        
        If .FechaFinContrato <> "" Then
            rcdDatos.Fields("FechaFinContrato") = .FechaFinContrato
        Else
            rcdDatos.Fields("FechaFinContrato") = Null
        End If
        
        If .GARANTIAMESES <> "" Then
            rcdDatos.Fields("GARANTIAMESES") = .GARANTIAMESES
        Else
            rcdDatos.Fields("GARANTIAMESES") = Null
        End If
        
        If .FECHAADJUDICACION <> "" Then
            rcdDatos.Fields("FECHAADJUDICACION") = .FECHAADJUDICACION
        Else
            rcdDatos.Fields("FECHAADJUDICACION") = Null
        End If
        
        If .FECHAFIRMACONTRATO <> "" Then
            rcdDatos.Fields("FECHAFIRMACONTRATO") = .FECHAFIRMACONTRATO
        Else
            rcdDatos.Fields("FECHAFIRMACONTRATO") = Null
        End If
        
        If .FECHACERTIFICACION <> "" Then
            rcdDatos.Fields("FECHACERTIFICACION") = .FECHACERTIFICACION
        Else
            rcdDatos.Fields("FECHACERTIFICACION") = Null
        End If
        
        If .FechaFinGarantia <> "" Then
            rcdDatos.Fields("FechaFinGarantia") = .FechaFinGarantia
        Else
            rcdDatos.Fields("FechaFinGarantia") = Null
        End If
        
        ' Estado / actividad
        If .ESTADO <> "" Then
            rcdDatos.Fields("ESTADO") = .ESTADO
        Else
            rcdDatos.Fields("ESTADO") = Null
        End If
        
        If .CodigoActividad <> "" Then
            rcdDatos.Fields("CodigoActividad") = .CodigoActividad
        Else
            rcdDatos.Fields("CodigoActividad") = Null
        End If
        
        If .AplicaTareaS4H <> "" Then
            rcdDatos.Fields("AplicaTareaS4H") = .AplicaTareaS4H
        End If
        
        ' Valor por defecto
        If .ContratistaPrincipal = "" Then
            .ContratistaPrincipal = "Sí"
        End If


        rcdDatos.Update
        rcdDatos.Close
        Set rcdDatos = Nothing
        
        ' Actualizar NCs solo cuando existe snapshot inicial para comparar cambios.
        If Not esAlta Then
             ActualizarNCs Me.Expediente, p_ExpedienteAlInicio, dbUse, p_Error
        End If
        
        ' ---------------------------------------------------------
        ' C. GUARDADO DE DETALLES - SOLO EN ALTA
        ' ---------------------------------------------------------
        If esAlta Then
        
            ' 1. Anualidades
            Set m_Col = p_DTO.ColAnualidades
            If Not m_Col Is Nothing Then
                For Each m_ID In m_Col
                    Set m_ExpAnualidad = m_Col(m_ID)
                    RegistrarAnualidad m_ExpAnualidad, p_Error, dbUse
                    If p_Error <> "" Then Err.Raise 1000
                Next
            End If
            
            ' 2. Comerciales
            Set m_Col = p_DTO.ColComerciales
            If Not m_Col Is Nothing Then
                For Each m_ID In m_Col
                    RegistrarComercial CStr(m_ID), p_Error, dbUse
                    If p_Error <> "" Then Err.Raise 1000
                Next
            End If

            ' 3. Codigos Compra
            Set m_Col = p_DTO.ColCodCompras
            If Not m_Col Is Nothing Then
                For Each m_ID In m_Col
                    RegistrarCodigoCompra CStr(m_ID), p_Error, dbUse
                    If p_Error <> "" Then Err.Raise 1000
                Next
            End If
            
            ' 4. CPVs
            Set m_Col = p_DTO.ColCPVs
            If Not m_Col Is Nothing Then
                For Each m_ID In m_Col
                    RegistrarCPV CStr(m_ID), p_Error, dbUse
                    If p_Error <> "" Then Err.Raise 1000
                Next
            End If
            
            ' 5. PECALES
            Set m_Col = p_DTO.ColPECALES
            If Not m_Col Is Nothing Then
                For Each m_ID In m_Col
                    RegistrarPECAL CStr(m_ID), p_Error, dbUse
                    If p_Error <> "" Then Err.Raise 1000
                Next
            End If
            
            ' 6. RACs
            Set m_Col = p_DTO.ColRACs
            If Not m_Col Is Nothing Then
                For Each m_ID In m_Col
                    RegistrarRAC CStr(m_ID), p_Error, dbUse
                    If p_Error <> "" Then Err.Raise 1000
                Next
            End If
            
            ' 7. Anexos
            Set m_Col = p_DTO.ColAnexos
            If Not m_Col Is Nothing Then
                For Each m_ID In m_Col
                    RegistrarAnexo CStr(m_ID), p_Error, dbUse
                    If p_Error <> "" Then Err.Raise 1000
                Next
            End If
            
            ' 8. Responsables
            Set m_Col = p_DTO.ColResponsables
            If Not m_Col Is Nothing Then
                For Each m_ID In m_Col
                    Set m_Responsable = m_Col(m_ID)
                    RegistraResponsable m_Responsable, p_Error, dbUse
                    If p_Error <> "" Then Err.Raise 1000
                Next
            End If
            
            ' 9. Lugares Ejecución
            Set m_Col = p_DTO.ColLugaresEjecucion
            If Not m_Col Is Nothing Then
                For Each m_ID In m_Col
                    Set m_Lugar = m_Col(m_ID)
                    RegistrarLugarEjecucion m_Lugar.IDLugarEjecucion, p_Error, dbUse
                    If p_Error <> "" Then Err.Raise 1000
                Next
            End If
            
            ' 10. Suministradores (Ãrbol en Memoria)
            If Not p_DTO.ColArbolSuministradores Is Nothing Then
                If p_DTO.ColArbolSuministradores.Count > 0 Then
                    Set m_SrvSum = New ExpedienteSuministradorServicio
                    m_SrvSum.PersistirArbolDesdeMemoria .IDExpediente, p_DTO.ColArbolSuministradores, dbUse
                    Set m_SrvSum = Nothing
                End If
            End If
            
            ' 11. Recalcular cadenas complejas tras insertar todo
            ActualizarCadenaPECAL p_Error, dbUse
            
        End If ' Fin If esAlta
        
'        ' 12. AGEDYS (Fuera de DB principal, gestión de error propia)
'        If .AGEDYSAplica = "Sí" Then
'            RegistrarExpAntiguo Me.Expediente, p_Error
'            If p_Error <> "" Then Err.Raise 1000
'        End If
        
        ' ---------------------------------------------------------
        ' D. ACTUALIZACIÓN CACHÉ (DENTRO DE LA TRANSACCIÓN)
        ' ---------------------------------------------------------
        ' Actualizamos la caché TbExpedientesConEntidades para el ámbito Cabecera.
        ' Los métodos de detalles (hijos) ya deberían haber actualizado su parte si es Alta.
        ' Al usar dbUse, esto forma parte del commit atómico.
        RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse, p_Ambito:=EnumAmbitoActualizacion.Cabecera
        If p_Error <> "" Then Err.Raise 1000
        
    End With
    
    ' SI TODO HA IDO BIEN, CONFIRMAMOS LA TRANSACCIÓN
    ws.CommitTrans
    bTransaccionIniciadaAqui = False
    
    ' ---------------------------------------------------------
    ' E. POST-PROCESO (Fuera de la transacción)
    ' ---------------------------------------------------------
    
    ' Pintado de tareas (Lógica UI/Avisos)
    Dim blnPintarTareas As Boolean
    If Not p_ExpedienteAlInicio Is Nothing Then
        If p_ExpedienteAlInicio.ESTADO = "Desconocido" And Me.Expediente.ESTADO <> "Desconocido" Then blnPintarTareas = True
        If p_ExpedienteAlInicio.ESTADO <> "Desconocido" And Me.Expediente.ESTADO = "Desconocido" Then blnPintarTareas = True
        If Me.Expediente.NecesitaCodS4H <> p_ExpedienteAlInicio.NecesitaCodS4H Then blnPintarTareas = True
    Else
        If Me.Expediente.ESTADO = "Desconocido" Then blnPintarTareas = True
        If Me.Expediente.NecesitaCodS4H = EnumSiNo.Sí Then blnPintarTareas = True
    End If
    
    If blnPintarTareas Then PintarTareas EnumSiNo.Sí
    
    ' Log de cambios
    RegistrarUltimoCambio p_Expediente:=Me.Expediente
    
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "Error CRÍTICO en Registrar: " & Err.Description
    End If
    ' ROLLBACK TOTAL SI ALGO FALLA
    If bTransaccionIniciadaAqui And Not ws Is Nothing Then
        On Error Resume Next
        ws.Rollback
    End If
    
    
End Function
Public Function RegistrarAlta( _
                            p_DTO As ExpedienteDTO, _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim ws As DAO.Workspace
    Dim dbUse As DAO.Database
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_MotivoNoOK As String
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim bTransaccionIniciadaAqui As Boolean
   
    
    
    
    On Error GoTo errores
    
    ' 1. INICIO DE TRANSACCIÓN ATÓMICA
    Set ws = DBEngine.Workspaces(0)
    Set dbUse = getdb() ' Conexión a la base de datos de datos
    
    ws.BeginTrans
    bTransaccionIniciadaAqui = True
    
    ' ---------------------------------------------------------
    ' A. VALIDACIONES Y PREPARACIÓN
    ' ---------------------------------------------------------
    Set Me.Expediente = p_DTO.Expediente
    
    
    With Me.Expediente
        If p_DTO.Expediente.POSTAGEDO <> "Sí" And p_DTO.Expediente.POSTAGEDO <> "No" Then
            p_DTO.Expediente.POSTAGEDO = "Sí"
        End If
        If .HPSAplica = "" Then .HPSAplica = "No"
        m_MotivoNoOK = MotivoNoOKAlta(p_DTO, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        p_Error = m_MotivoNoOK
        If p_Error <> "" Then Err.Raise 1000
        
        If .Ambito = "HPS" Then .HPSAplica = "Sí"
        If IsNumeric(.Ordinal) Then .Ordinal = Format(.Ordinal, "00")
        .ESTADO = .ESTADOCalculadoTexto
        .FechaFinGarantia = .FechaFinGarantiaCalculada
        p_Error = .Error
        If p_Error <> "" Then Err.Raise 1000
        If .IDResponsableSeguridad = "0" Then .IDResponsableSeguridad = ""
        .IDExpediente = .IDExpedienteCalculado
        .TIpo = .TipoCalculadoTexto
        .TipoInforme = .TipoInformeCalculado
        
        m_SQL = "TbExpedientes"
        
        
        Set rcdDatos = dbUse.OpenRecordset(m_SQL)
        rcdDatos.AddNew
        rcdDatos.Fields("IdExpediente") = .IDExpediente
        
        If .IDExpedientePadre <> "" Then
            rcdDatos.Fields("IDExpedientePadre") = .IDExpedientePadre
        Else
            rcdDatos.Fields("IDExpedientePadre") = Null
        End If
        
        If .Ambito <> "" Then
            rcdDatos.Fields("Ambito") = .Ambito
        End If
        If .APLICAESTADO <> "" Then
            rcdDatos.Fields("APLICAESTADO") = .APLICAESTADO
        End If
        If .AGEDYSAplica <> "" Then
            rcdDatos.Fields("AGEDYSAplica") = .AGEDYSAplica
        End If
        If .AGEDYSGenerico <> "" Then
            rcdDatos.Fields("AGEDYSGenerico") = .AGEDYSGenerico
        End If
        If .HPSAplica <> "" Then
            rcdDatos.Fields("HPSAplica") = .HPSAplica
        End If
        If .CodExp <> "" Then
            rcdDatos.Fields("CodExp") = .CodExp
        End If
        If .CodExpLargo <> "" Then
            rcdDatos.Fields("CodExpLargo") = .CodExpLargo
        End If
        If IsNumeric(.ImporteLicitacion) Then
            rcdDatos.Fields("ImporteLicitacion") = .ImporteLicitacion
        
        End If
        If IsNumeric(.ImporteContratacion) Then
            rcdDatos.Fields("ImporteContratacion") = .ImporteContratacion
        End If
        If .Titulo <> "" Then
            rcdDatos.Fields("Titulo") = .Titulo
        End If
        If .IdGradoClasificacion <> "" Then
            rcdDatos.Fields("IDGradoClasificacion") = .IdGradoClasificacion
        End If
        If .EsAM <> "" Then
            rcdDatos.Fields("EsAM") = .EsAM
        End If
        If .EsLote <> "" Then
            rcdDatos.Fields("EsLote") = .EsLote
        End If
        If .EsBasado <> "" Then
            rcdDatos.Fields("EsBasado") = .EsBasado
        End If
        If .EsExpediente <> "" Then
            rcdDatos.Fields("EsExpediente") = .EsExpediente
        End If
        If .Ordinal <> "" Then
            rcdDatos.Fields("Ordinal") = .Ordinal
        End If
        If .AplicaTareaS4H <> "" Then
            rcdDatos.Fields("AplicaTareaS4H") = .AplicaTareaS4H
        End If
        If .Nemotecnico <> "" Then
            rcdDatos.Fields("Nemotecnico") = .Nemotecnico
        End If
        If .IDOrganoContratacion <> "" Then
            rcdDatos.Fields("IDOrganoContratacion") = .IDOrganoContratacion
        End If
        If .IDEjercito <> "" Then
            rcdDatos.Fields("IDEjercito") = .IDEjercito
        End If
        If .IDOficinaPrograma <> "" Then
            rcdDatos.Fields("IDOficinaPrograma") = .IDOficinaPrograma
        End If
        If .IDResponsableCalidad <> "" Then
            rcdDatos.Fields("IDResponsableCalidad") = .IDResponsableCalidad
        End If
        If .CodS4H <> "" Then
            rcdDatos.Fields("CodS4H") = .CodS4H
        End If
        If .NPedido <> "" Then
            rcdDatos.Fields("NPedido") = .NPedido
        End If
        If .IDResponsableSeguridad <> "" Then
            rcdDatos.Fields("IDResponsableSeguridad") = .IDResponsableSeguridad
        End If
        If .CodProyecto <> "" Then
            rcdDatos.Fields("CodProyecto") = .CodProyecto
        End If
        If .TIpo <> "" Then
            rcdDatos.Fields("TIpo") = .TIpo
        End If
         If .CodigoActividad <> "" Then
            rcdDatos.Fields("CodigoActividad") = .CodigoActividad
        End If
        If .AccesoSharepoint <> "" Then
            rcdDatos.Fields("AccesoSharepoint") = .AccesoSharepoint
        End If
        If .ObjetoContrato <> "" Then
            rcdDatos.Fields("ObjetoContrato") = .ObjetoContrato
        End If
        If .Observaciones <> "" Then
            rcdDatos.Fields("Observaciones") = .Observaciones
        End If
        If .TipoInforme <> "" Then
            rcdDatos.Fields("TipoInforme") = .TipoInforme
        End If
        If .FECHAINICIOLICITACION <> "" Then
            rcdDatos.Fields("FECHAINICIOLICITACION") = .FECHAINICIOLICITACION
        End If
        If .FECHAPREOFERTA <> "" Then
            rcdDatos.Fields("FECHAPREOFERTA") = .FECHAPREOFERTA
        End If
        If .FECHAOFERTA <> "" Then
            rcdDatos.Fields("FECHAOFERTA") = .FECHAOFERTA
        End If
        If .FECHADESESTIMADA <> "" Then
            rcdDatos.Fields("FECHADESESTIMADA") = .FECHADESESTIMADA
        End If
        If .FECHAPERDIDA <> "" Then
            rcdDatos.Fields("FECHAPERDIDA") = .FECHAPERDIDA
        End If
        If .FECHAADJUDICACION <> "" Then
            rcdDatos.Fields("FECHAADJUDICACION") = .FECHAADJUDICACION
        End If
        If .FechaInicioContrato <> "" Then
            rcdDatos.Fields("FechaInicioContrato") = .FechaInicioContrato
        End If
        If .FechaFinContrato <> "" Then
            rcdDatos.Fields("FechaFinContrato") = .FechaFinContrato
        End If
        If .GARANTIAMESES <> "" Then
            rcdDatos.Fields("GARANTIAMESES") = .GARANTIAMESES
        End If
        If .FECHAFIRMACONTRATO <> "" Then
            rcdDatos.Fields("FECHAFIRMACONTRATO") = .FECHAFIRMACONTRATO
        End If
        If .FECHACERTIFICACION <> "" Then
            rcdDatos.Fields("FECHACERTIFICACION") = .FECHACERTIFICACION
        End If
        If .FechaFinGarantia <> "" Then
            rcdDatos.Fields("FechaFinGarantia") = .FechaFinGarantia
        End If
        If .ESTADO <> "" Then
            rcdDatos.Fields("ESTADO") = .ESTADO
        End If
        rcdDatos.Update
        rcdDatos.Close
        Set rcdDatos = Nothing
        ActualizarNCs Me.Expediente, Nothing, dbUse, p_Error
        RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse, p_Ambito:=EnumAmbitoActualizacion.Cabecera
        If p_Error <> "" Then Err.Raise 1000
        
    End With
    
    ' SI TODO HA IDO BIEN, CONFIRMAMOS LA TRANSACCIÓN
    ws.CommitTrans
    bTransaccionIniciadaAqui = False
    
    ' ---------------------------------------------------------
    ' E. POST-PROCESO (Fuera de la transacción)
    ' ---------------------------------------------------------
    
    ' Pintado de tareas (Lógica UI/Avisos)
    Dim blnPintarTareas As Boolean
    
    If blnPintarTareas Then PintarTareas EnumSiNo.Sí
    
    ' Log de cambios
    RegistrarUltimoCambio p_Expediente:=Me.Expediente
    
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "Error CRÍTICO en RegistrarAlta: " & Err.Description
    End If
    ' ROLLBACK TOTAL SI ALGO FALLA
    If bTransaccionIniciadaAqui And Not ws Is Nothing Then
        On Error Resume Next
        ws.Rollback
    End If
    
    
End Function
' ==============================================================================
' MÉTODO RECUPERADO: ACTUALIZACIÓN DE CACHÉ (FACHADA)
' ==============================================================================

Public Function RegistrarExpEntidades( _
                                    Optional ByRef p_Error As String, _
                                    Optional p_Db As DAO.Database = Nothing, _
                                    Optional p_Ambito As EnumAmbitoActualizacion = EnumAmbitoActualizacion.Todo, _
                                    Optional p_ForceCacheFailureForTest As Boolean = False _
                                    ) As String
    
    Dim m_ExpEntidadOp As ExpedienteEntidadOperaciones
    
    On Error GoTo errores
    
    If Me.Expediente Is Nothing Then
        p_Error = "Expediente no registrado"
        Err.Raise 1000
    End If
    If Me.Expediente.IDExpediente = "" Then
        p_Error = "Expediente no registrado"
        Err.Raise 1000
    End If
    
    Set m_ExpEntidadOp = New ExpedienteEntidadOperaciones
    With m_ExpEntidadOp
        Set .Expediente = Me.Expediente
        ' AQUI PASAMOS EL ÃMBITO PARA QUE NO RECALCULE TODO
        .Registrar p_Error:=p_Error, p_Db:=p_Db, p_Ambito:=p_Ambito, p_ForceCacheFailureForTest:=p_ForceCacheFailureForTest
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    ' Actualizamos el objeto en memoria global (esto es rápido)
    ActualizarExpedienteCompleto Me.Expediente, p_Error
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteOperaciones.RegistrarExpEntidades ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

' ==============================================================================
' FUNCIONES DE VALIDACIÓN Y LÓGICA DE NEGOCIO (RECUPERADAS Y ADAPTADAS)
' ==============================================================================

Public Function MotivoNoOK( _
                            p_ExpedienteDTO As ExpedienteDTO, _
                            p_ObjExpedienteAlInicio As Expediente, _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim m_Comprobar As Boolean
    Dim m_expediente As Expediente
    Dim m_ExpedienteOtro As Expediente
    Dim m_CadenaDPDs As String
    Dim m_ID As Variant
    Dim m_Responsable As ExpedienteResponsable
    Dim dato
    On Error GoTo errores
    Set m_expediente = p_ExpedienteDTO.Expediente
    
    With m_expediente
        
        ' 1. Validaciones de Campos Obligatorios Básicos
        If .Titulo = "" Then
            MotivoNoOK = "El título del expediente es obligatorio"
            Exit Function
        End If
        If .EsAM <> "Sí" And .EsAM <> "No" Then
            MotivoNoOK = "No se ha rellenado EsAM"
            Exit Function
        End If
        If .EsLote <> "Sí" And .EsLote <> "No" Then
            MotivoNoOK = "No se ha rellenado EsLote"
            Exit Function
        End If
        If .EsExpediente <> "Sí" And .EsExpediente <> "No" Then
            MotivoNoOK = "No se ha rellenado EsExpediente"
            Exit Function
        End If
        If .EsBasado <> "Sí" And .EsBasado <> "No" Then
            MotivoNoOK = "No se ha rellenado EsBasado"
            Exit Function
        End If
        If .APLICAESTADO <> "Sí" And .APLICAESTADO <> "No" Then
            MotivoNoOK = "APLICAESTADO se ha de rellenar"
            Exit Function
        End If
        
        ' 2. Coherencia de Fechas y Estado
        If .APLICAESTADO = "Sí" Then
            If InStr(1, .FechasIrregulares, "Sí|") <> 0 Then
                dato = Split(.FechasIrregulares, "|")
                MotivoNoOK = dato(1)
                Exit Function
            End If
        End If
        If .ContratistaPrincipal <> "Sí" And .ContratistaPrincipal <> "No" Then
            MotivoNoOK = "ContratistaPrincipal se ha de rellenar"
            Exit Function
        End If
        
        ' 3. Validaciones de Tipología (AM / Lote / Basado)
        If .EsAM = "Sí" Then
            If .EsLote = "Sí" Then MotivoNoOK = "No puede ser Acuerdo Marco y Lote a la vez": Exit Function
            If .EsExpediente = "Sí" Then MotivoNoOK = "No puede ser Acuerdo Marco y Expediente individual a la vez": Exit Function
            If .EsBasado = "Sí" Then MotivoNoOK = "No puede ser Acuerdo Marco y Basado a la vez": Exit Function
            If .IDExpedientePadre <> "" Then MotivoNoOK = "Un Acuerdo Marco no puede tener padre": Exit Function
        End If
        
        If .EsLote = "Sí" Then
            If .EsAM = "Sí" Then MotivoNoOK = "No puede ser Acuerdo Marco y Lote a la vez": Exit Function
            If .EsExpediente = "Sí" Then MotivoNoOK = "No puede ser Lote y Expediente individual a la vez": Exit Function
            If .EsBasado = "Sí" Then MotivoNoOK = "No puede ser Lote y Basado a la vez": Exit Function
        End If
        
        If .EsAM = "No" And .EsLote = "No" And .EsExpediente = "No" And .EsBasado = "No" Then
            MotivoNoOK = "Debe seleccionar un tipo (EsAM, EsLote, EsExpediente o EsBasado)"
            Exit Function
        End If
        
        ' 4. Validaciones de Código y Tipo Texto
        If .TIpo = "" Then
            .TIpo = .TipoCalculadoTexto
            p_Error = .Error
            If p_Error <> "" Then
                MotivoNoOK = "Error al obtener tipo calculado: " & p_Error
                Exit Function
            End If
            If .TIpo = "" Then
                MotivoNoOK = "El Tipo de expediente es obligatorio"
                Exit Function
            End If
        End If
        
        If .CodExp = "" And .EsLote <> "Sí" Then
            MotivoNoOK = "El código de Expediente es obligatorio (salvo para Lotes)"
            Exit Function
        End If
        
        If .Ordinal <> "" Then
            If Not IsNumeric(.Ordinal) Then
                MotivoNoOK = "El ordinal ha de ser un valor numérico"
                Exit Function
            End If
        End If
        
        ' 5. Validaciones AGEDYS
        If .AGEDYSAplica = "" Then
            MotivoNoOK = "Se ha de indicar si aplica a AGEDYS"
            Exit Function
        End If
        If .AGEDYSAplica = "Sí" Then
            If .AGEDYSGenerico = "" Then
                MotivoNoOK = "Si aplica Agedys, indicar si es genérico"
                Exit Function
            End If
        End If
        
        ' Comprobar coherencia al quitar AGEDYS
        If .AGEDYSAplica <> "Sí" And Not p_ObjExpedienteAlInicio Is Nothing Then
            If p_ObjExpedienteAlInicio.AGEDYSAplica = "Sí" Then
                 m_CadenaDPDs = .CadenaDPDs
                p_Error = .Error
                If p_Error <> "" Then Err.Raise 1000
                If m_CadenaDPDs <> "" Then
                    MotivoNoOK = "No se puede quitar AGEDYS: ya tiene DPDs vinculados."
                    Exit Function
                End If
            End If
        End If
        
        If .HPSAplica = "" Then .HPSAplica = "No"
        
        ' 6. Validaciones de DUPLICADOS (Consultas a BD)
        
        ' Título
        If p_ObjExpedienteAlInicio Is Nothing Then m_Comprobar = True Else If p_ObjExpedienteAlInicio.Titulo <> .Titulo Then m_Comprobar = True
        If m_Comprobar Then
            Set m_ExpedienteOtro = getExpedientePorCampo("Titulo", .Titulo, EnumSiNo.Sí, p_Error)
            If p_Error <> "" Then Err.Raise 1000
            If Not m_ExpedienteOtro Is Nothing Then
                MotivoNoOK = "El Título ya existe en el Expediente ID: " & m_ExpedienteOtro.IDExpediente
                Exit Function
            End If
            m_Comprobar = False
        End If
        
        ' CodExp
        If .CodExp <> "" Then
            If p_ObjExpedienteAlInicio Is Nothing Then m_Comprobar = True Else If p_ObjExpedienteAlInicio.CodExp <> .CodExp Then m_Comprobar = True
            If m_Comprobar Then
                Set m_ExpedienteOtro = getExpedientePorCampo("CodExp", .CodExp, EnumSiNo.Sí, p_Error)
                If p_Error <> "" Then Err.Raise 1000
                If Not m_ExpedienteOtro Is Nothing Then
                    MotivoNoOK = "El Código corto ya existe en el Expediente ID: " & m_ExpedienteOtro.IDExpediente
                    Exit Function
                End If
                m_Comprobar = False
            End If
        End If
        
        ' CodExpLargo
        If .CodExpLargo <> "" Then
            If p_ObjExpedienteAlInicio Is Nothing Then m_Comprobar = True Else If p_ObjExpedienteAlInicio.CodExpLargo <> .CodExpLargo Then m_Comprobar = True
            If m_Comprobar Then
                Set m_ExpedienteOtro = getExpedientePorCampo("CodExpLargo", .CodExpLargo, EnumSiNo.Sí, p_Error)
                If p_Error <> "" Then Err.Raise 1000
                If Not m_ExpedienteOtro Is Nothing Then
                    MotivoNoOK = "El Código Largo ya existe en el Expediente ID: " & m_ExpedienteOtro.IDExpediente
                    Exit Function
                End If
                m_Comprobar = False
            End If
        End If
        
        ' NPedido
        If .NPedido <> "" Then
            If p_ObjExpedienteAlInicio Is Nothing Then m_Comprobar = True Else If p_ObjExpedienteAlInicio.NPedido <> .NPedido Then m_Comprobar = True
            If m_Comprobar Then
                Set m_ExpedienteOtro = getExpedientePorCampo("NPedido", .NPedido, EnumSiNo.Sí, p_Error)
                If p_Error <> "" Then Err.Raise 1000
                If Not m_ExpedienteOtro Is Nothing Then
                    MotivoNoOK = "El NPedido ya existe en el Expediente ID: " & m_ExpedienteOtro.IDExpediente
                    Exit Function
                End If
                m_Comprobar = False
            End If
        End If
        
        ' Nemotécnico
        If .Nemotecnico <> "" Then
            If p_ObjExpedienteAlInicio Is Nothing Then m_Comprobar = True Else If p_ObjExpedienteAlInicio.Nemotecnico <> .Nemotecnico Then m_Comprobar = True
            If m_Comprobar Then
                Set m_ExpedienteOtro = getExpediente(p_Nemotecnico:=.Nemotecnico, p_Error:=p_Error)
                If p_Error <> "" Then Err.Raise 1000
                If Not m_ExpedienteOtro Is Nothing Then
                    MotivoNoOK = "El Nemotécnico ya existe en el Expediente ID: " & m_ExpedienteOtro.IDExpediente
                    Exit Function
                End If
                m_Comprobar = False
            End If
        End If
        
        ' CodProyecto
        If .CodProyecto <> "" Then
            If p_ObjExpedienteAlInicio Is Nothing Then m_Comprobar = True Else If p_ObjExpedienteAlInicio.CodProyecto <> .CodProyecto Then m_Comprobar = True
            If m_Comprobar Then
                Set m_ExpedienteOtro = getExpedientePorCampo("CodProyecto", .CodProyecto, EnumSiNo.Sí, p_Error)
                If p_Error <> "" Then Err.Raise 1000
                If Not m_ExpedienteOtro Is Nothing Then
                    MotivoNoOK = "El Código de Proyecto ya existe en el Expediente ID: " & m_ExpedienteOtro.IDExpediente
                    Exit Function
                End If
                m_Comprobar = False
            End If
        End If
       
        If .Ambito = "" Then
            MotivoNoOK = "Se ha de indicar un ámbito (Defensa, Fuera o HPS)"
            Exit Function
        End If
        
        If .TienePECAL = EnumSiNo.Sí Then
            If .responsableCalidad Is Nothing And .Adjudicado = "Sí" Then
                MotivoNoOK = "Expediente adjudicado con PECAL requiere un Responsable de Calidad"
                Exit Function
            End If
        End If
        
        ' 7. Validaciones de Responsables (Para Alta y Agedys)
        If .IDExpediente = "" Then
            If .AGEDYSAplica = "Sí" And .AGEDYSGenerico <> "Sí" And Not p_ExpedienteDTO.ColResponsables Is Nothing Then
                Dim hayJP As Boolean, hayCorreo As Boolean
                For Each m_ID In p_ExpedienteDTO.ColResponsables
                    Set m_Responsable = p_ExpedienteDTO.ColResponsables(m_ID)
                    If m_Responsable.EsJefeProyecto = "Sí" Then hayJP = True
                    If m_Responsable.CorreoSiempre = "Sí" Then hayCorreo = True
                    Set m_Responsable = Nothing
                Next
                
                If Not hayJP Then
                    MotivoNoOK = "Para Agedys se requiere al menos un Jefe de Proyecto."
                    Exit Function
                End If
                If Not hayCorreo Then
                    MotivoNoOK = "Para Agedys se requiere al menos un Responsable con 'Correo Siempre'."
                    Exit Function
                End If
            End If
        End If
        
        ' 8. Validación de Anexos
        If Not p_ExpedienteDTO.ColAnexos Is Nothing Then
            For Each m_ID In p_ExpedienteDTO.ColAnexos
                ' Si es una ruta (Alta) y no un ID
                If Not IsNumeric(m_ID) Then
                    If Not fso.FileExists(m_ID) Then
                        p_Error = "El anexo no es accesible: " & m_ID
                        Err.Raise 1000
                    End If
                End If
            Next
        End If
    End With
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método ExpedienteOperaciones.MotivoNoOK ha devuelto el error: " & Err.Description
     End If
End Function
Public Function MotivoNoOKAlta( _
                                p_ExpedienteDTO As ExpedienteDTO, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    Dim m_expediente As Expediente
    Dim m_ExpedienteOtro As Expediente
    
    On Error GoTo errores
    Set m_expediente = p_ExpedienteDTO.Expediente
    
    With m_expediente
        
        If .Ambito = "" Then
            MotivoNoOKAlta = "Se ha de indicar un ámbito (Defensa, Fuera o HPS)"
            Exit Function
        End If
        If .APLICAESTADO <> "Sí" And .APLICAESTADO <> "No" Then
            MotivoNoOKAlta = "APLICAESTADO se ha de rellenar"
            Exit Function
        End If
        If .AGEDYSAplica = "" Then
            MotivoNoOKAlta = "Se ha de indicar si aplica a AGEDYS"
            Exit Function
        End If
        If .AGEDYSAplica = "Sí" Then
            If .AGEDYSGenerico = "" Then
                MotivoNoOKAlta = "Si aplica Agedys, indicar si es genérico"
                Exit Function
            End If
        End If
        If .CodExp = "" And .EsLote <> "Sí" Then
            MotivoNoOKAlta = "El código de Expediente es obligatorio (salvo para Lotes)"
            Exit Function
        End If
        If .CodExp <> "" Then
           Set m_ExpedienteOtro = getExpedientePorCampo("CodExp", .CodExp, EnumSiNo.Sí, p_Error)
            If p_Error <> "" Then Err.Raise 1000
            If Not m_ExpedienteOtro Is Nothing Then
                MotivoNoOKAlta = "El Código corto ya existe en el Expediente ID: " & m_ExpedienteOtro.IDExpediente
                Exit Function
            End If
        End If
        If .CodExpLargo <> "" Then
            Set m_ExpedienteOtro = getExpedientePorCampo("CodExpLargo", .CodExpLargo, EnumSiNo.Sí, p_Error)
            If p_Error <> "" Then Err.Raise 1000
            If Not m_ExpedienteOtro Is Nothing Then
                MotivoNoOKAlta = "El Código Largo ya existe en el Expediente ID: " & m_ExpedienteOtro.IDExpediente
                Exit Function
            End If
        End If
        If .Titulo = "" Then
            MotivoNoOKAlta = "El título del expediente es obligatorio"
            Exit Function
        End If
        Set m_ExpedienteOtro = getExpedientePorCampo("Titulo", .Titulo, EnumSiNo.Sí, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        If Not m_ExpedienteOtro Is Nothing Then
            MotivoNoOKAlta = "El Título ya existe en el Expediente ID: " & m_ExpedienteOtro.IDExpediente
            Exit Function
        End If
        If .Nemotecnico <> "" Then
            Set m_ExpedienteOtro = getExpediente(p_Nemotecnico:=.Nemotecnico, p_Error:=p_Error)
            If p_Error <> "" Then Err.Raise 1000
            If Not m_ExpedienteOtro Is Nothing Then
                MotivoNoOKAlta = "El Nemotécnico ya existe en el Expediente ID: " & m_ExpedienteOtro.IDExpediente
                Exit Function
            End If
        End If
        If Not IsNumeric(.IDOrganoContratacion) Or .IDOrganoContratacion = "0" Then
            MotivoNoOKAlta = "El Órgano de contratación es obligatorio"
            Exit Function
        End If
        If .NPedido <> "" Then
           Set m_ExpedienteOtro = getExpedientePorCampo("NPedido", .NPedido, EnumSiNo.Sí, p_Error)
            If p_Error <> "" Then Err.Raise 1000
            If Not m_ExpedienteOtro Is Nothing Then
                MotivoNoOKAlta = "El NPedido ya existe en el Expediente ID: " & m_ExpedienteOtro.IDExpediente
                Exit Function
            End If
        End If
        If .CodProyecto <> "" Then
            Set m_ExpedienteOtro = getExpedientePorCampo("CodProyecto", .CodProyecto, EnumSiNo.Sí, p_Error)
            If p_Error <> "" Then Err.Raise 1000
            If Not m_ExpedienteOtro Is Nothing Then
                MotivoNoOKAlta = "El Código de Proyecto ya existe en el Expediente ID: " & m_ExpedienteOtro.IDExpediente
                Exit Function
            End If
        End If
        If .TIpo = "" Then
            .TIpo = .TipoCalculadoTexto
            p_Error = .Error
            If p_Error <> "" Then
                MotivoNoOKAlta = "Error al obtener tipo calculado: " & p_Error
                Exit Function
            End If
            If .TIpo = "" Then
                MotivoNoOKAlta = "El Tipo de expediente es obligatorio"
                Exit Function
            End If
        End If
        
        
        
        
        If .EsAM <> "Sí" And .EsAM <> "No" Then
            MotivoNoOKAlta = "No se ha rellenado EsAM"
            Exit Function
        End If
        If .EsLote <> "Sí" And .EsLote <> "No" Then
            MotivoNoOKAlta = "No se ha rellenado EsLote"
            Exit Function
        End If
        If .EsExpediente <> "Sí" And .EsExpediente <> "No" Then
            MotivoNoOKAlta = "No se ha rellenado EsExpediente"
            Exit Function
        End If
        If .EsBasado <> "Sí" And .EsBasado <> "No" Then
            MotivoNoOKAlta = "No se ha rellenado EsBasado"
            Exit Function
        End If
        
        
        
         ' 5. Validaciones AGEDYS
        
        
        ' 3. Validaciones de Tipología (AM / Lote / Basado)
        If .EsAM = "Sí" Then
            If .EsLote = "Sí" Then MotivoNoOKAlta = "No puede ser Acuerdo Marco y Lote a la vez": Exit Function
            If .EsExpediente = "Sí" Then MotivoNoOKAlta = "No puede ser Acuerdo Marco y Expediente individual a la vez": Exit Function
            If .EsBasado = "Sí" Then MotivoNoOKAlta = "No puede ser Acuerdo Marco y Basado a la vez": Exit Function
            If .IDExpedientePadre <> "" Then MotivoNoOKAlta = "Un Acuerdo Marco no puede tener padre": Exit Function
        End If
        
        If .EsLote = "Sí" Then
            If .EsAM = "Sí" Then MotivoNoOKAlta = "No puede ser Acuerdo Marco y Lote a la vez": Exit Function
            If .EsExpediente = "Sí" Then MotivoNoOKAlta = "No puede ser Lote y Expediente individual a la vez": Exit Function
            If .EsBasado = "Sí" Then MotivoNoOKAlta = "No puede ser Lote y Basado a la vez": Exit Function
        End If
        
        If .EsAM = "No" And .EsLote = "No" And .EsExpediente = "No" And .EsBasado = "No" Then
            MotivoNoOKAlta = "Debe seleccionar un tipo (EsAM, EsLote, EsExpediente o EsBasado)"
            Exit Function
        End If
        
        
        
        If .Ordinal <> "" Then
            If Not IsNumeric(.Ordinal) Then
                MotivoNoOKAlta = "El ordinal ha de ser un valor numérico"
                Exit Function
            End If
        End If
        
        
        
        
      
    End With
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método ExpedienteOperaciones.MotivoNoOKAlta ha devuelto el error: " & Err.Description
     End If
End Function
Public Function MotivoNoOKSoloHPS( _
                                    p_ExpedienteDTO As ExpedienteDTO, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_expediente As Expediente
    Dim m_ExpedienteOtro As Expediente
    Dim hayJuridica As Boolean
    
    On Error GoTo errores
    Set m_expediente = p_ExpedienteDTO.Expediente
    
    With m_expediente
        If .Titulo = "" Then
            MotivoNoOKSoloHPS = "El título del expediente es obligatorio"
            Exit Function
        End If
        
        Set m_ExpedienteOtro = getExpedientePorCampo("Titulo", .Titulo, EnumSiNo.Sí, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        If Not m_ExpedienteOtro Is Nothing Then
            MotivoNoOKSoloHPS = "El Título ya existe en el Expediente ID: " & m_ExpedienteOtro.IDExpediente
            Exit Function
        End If
        
        If .CodExp = "" Then
            MotivoNoOKSoloHPS = "El código de Expediente es obligatorio"
            Exit Function
        End If
        
        Set m_ExpedienteOtro = getExpedientePorCampo("CodExp", .CodExp, EnumSiNo.Sí, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        If Not m_ExpedienteOtro Is Nothing Then
            MotivoNoOKSoloHPS = "El Código ya existe en el Expediente ID: " & m_ExpedienteOtro.IDExpediente
            Exit Function
        End If
        
        If .Nemotecnico <> "" Then
            Set m_ExpedienteOtro = getExpedientePorCampo("Nemotecnico", .Nemotecnico, EnumSiNo.Sí, p_Error)
            If p_Error <> "" Then Err.Raise 1000
            If Not m_ExpedienteOtro Is Nothing Then
                MotivoNoOKSoloHPS = "El Nemotécnico ya existe en el Expediente ID: " & m_ExpedienteOtro.IDExpediente
                Exit Function
            End If
        End If
    End With
    
    ' --- VALIDACIÓN ADAPTADA A NUEVA ESTRUCTURA ÃRBOL ---
    hayJuridica = False
    ' Verificamos si hay elementos en el árbol unificado (antes ColContratistas)
    If Not p_ExpedienteDTO.ColArbolSuministradores Is Nothing Then
        If p_ExpedienteDTO.ColArbolSuministradores.Count > 0 Then
            hayJuridica = True
        End If
    End If
    
    If Not hayJuridica Then
        MotivoNoOKSoloHPS = "Este tipo de expediente requiere al menos una empresa/suministrador."
        Exit Function
    End If
    
    ' Validación de Lugares
    If p_ExpedienteDTO.ColLugaresEjecucion Is Nothing Then
        MotivoNoOKSoloHPS = "Se requiere al menos un lugar de ejecución."
        Exit Function
    ElseIf p_ExpedienteDTO.ColLugaresEjecucion.Count = 0 Then
        MotivoNoOKSoloHPS = "Se requiere al menos un lugar de ejecución."
        Exit Function
    End If
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método ExpedienteOperaciones.MotivoNoOKSoloHPS ha devuelto el error: " & Err.Description
     End If
End Function

Public Function RegistrarSoloHPS( _
                            p_DTO As ExpedienteDTO, _
                            Optional ByRef p_Error As String _
                            ) As String
    ' Wrapper simple para usar el registro transaccional estándar configurando HPS
    
    With p_DTO.Expediente
        .Ambito = "HPS"
        .HPSAplica = "Sí"
        .POSTAGEDO = "Sí"
        .EsExpediente = "Sí"
        .EsAM = "No"
        .EsBasado = "No"
        .EsLote = "No"
        .AGEDYSAplica = "No"
        .AGEDYSGenerico = "No"
        .APLICAESTADO = "No"
        .TIpo = .TipoCalculadoTexto
    End With
    
    ' Delegamos en el método maestro transaccional
    RegistrarSoloHPS = Registrar(p_DTO, Nothing, p_Error)
    
End Function

' ==============================================================================
' SUB-MÉTODOS DE REGISTRO TRANSACCIONALES (ADAPTADOS)
' ==============================================================================

Public Function RegistrarAnualidad( _
                                    p_Anualidad As ExpedienteAnualidad, _
                                    Optional ByRef p_Error As String, _
                                    Optional p_Db As DAO.Database = Nothing _
                                    ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim dbUse As DAO.Database
    
    ' Gestión de conexión
    If p_Db Is Nothing Then Set dbUse = getdb() Else Set dbUse = p_Db
    
    With p_Anualidad
        If Not IsNumeric(.IVA) Then .IVA = "21"
        If Not IsNumeric(.IPSI) Then .IPSI = "8"
        If Not IsNumeric(.IGIC) Then .IGIC = "7"
        
        m_SQL = "SELECT * FROM TbExpedientesAnualidades WHERE IDExpediente=" & Me.Expediente.IDExpediente & " AND Año=" & .AÑO & ";"
        Set rcdDatos = dbUse.OpenRecordset(m_SQL)
        
        If Not rcdDatos.EOF Then
            rcdDatos.Delete
            Set rcdDatos = dbUse.OpenRecordset(m_SQL)
        End If
        
        If rcdDatos.EOF Then
            rcdDatos.AddNew
            .IDAnualidad = .IDAnualidadCalculada
            rcdDatos.Fields("IDAnualidad") = .IDAnualidad
            rcdDatos.Fields("IdExpediente") = Me.Expediente.IDExpediente
            rcdDatos.Fields("Año") = .AÑO
            If .BIIVA <> "" Then rcdDatos.Fields("BIIVA") = .BIIVA
            If .BIIPSI <> "" Then rcdDatos.Fields("BIIPSI") = .BIIPSI
            If .BIIGIC <> "" Then rcdDatos.Fields("BIIGIC") = .BIIGIC
            If .BIEXENTA <> "" Then rcdDatos.Fields("BIEXENTA") = .BIEXENTA
            If .IVA <> "" Then rcdDatos.Fields("IVA") = .IVA
            If .IPSI <> "" Then rcdDatos.Fields("IPSI") = .IPSI
            If .IGIC <> "" Then rcdDatos.Fields("IGIC") = .IGIC
            If .PeriodoFacturacion <> "" Then rcdDatos.Fields("PeriodoFacturacion") = .PeriodoFacturacion
            rcdDatos.Update
            RegistrarAnualidad = "1"
        End If
        rcdDatos.Close
    End With
End Function

Public Function RegistrarComercial( _
                                    p_IDComercial As String, _
                                    Optional ByRef p_Error As String, _
                                    Optional p_Db As DAO.Database = Nothing _
                                    ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_ExpComercial As ExpedienteComercial
    Dim dbUse As DAO.Database
    
    If p_Db Is Nothing Then Set dbUse = getdb() Else Set dbUse = p_Db
    
    Set m_ExpComercial = New ExpedienteComercial
    With m_ExpComercial
        .IDComercialExpediente = .IDComercialExpedienteCalculado
        .IDExpediente = Me.Expediente.IDExpediente
        .IDComercial = p_IDComercial
        
        Dim m_SQL As String
        m_SQL = "SELECT * FROM TbExpedientesComerciales WHERE IDExpediente=" & .IDExpediente & " AND IDComercial=" & .IDComercial & ";"
        Set rcdDatos = dbUse.OpenRecordset(m_SQL)
        
        If rcdDatos.EOF Then
            rcdDatos.AddNew
            rcdDatos.Fields("IDComercialExpediente") = .IDComercialExpediente
            rcdDatos.Fields("IdExpediente") = .IDExpediente
            rcdDatos.Fields("IDComercial") = .IDComercial
            rcdDatos.Update
            RegistrarComercial = "1"
        End If
        rcdDatos.Close
    End With
    RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse, p_Ambito:=EnumAmbitoActualizacion.Comerciales
End Function

Public Function RegistrarCodigoCompra( _
                                    p_CodCompras As String, _
                                    Optional ByRef p_Error As String, _
                                    Optional p_Db As DAO.Database = Nothing _
                                    ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_ExpCC As ExpedienteCodigoCompra
    Dim dbUse As DAO.Database
    
    If p_Db Is Nothing Then Set dbUse = getdb() Else Set dbUse = p_Db
    
    Set m_ExpCC = New ExpedienteCodigoCompra
    With m_ExpCC
        .ID = .IDCalculado
        .IDExpediente = Me.Expediente.IDExpediente
        .CodCompras = p_CodCompras
        
        Dim m_SQL As String
        m_SQL = "SELECT * FROM TbExpedientesCodigoCompras WHERE IDExpediente=" & .IDExpediente & " AND CodCompras='" & .CodCompras & "';"
        Set rcdDatos = dbUse.OpenRecordset(m_SQL)
        
        If rcdDatos.EOF Then
            rcdDatos.AddNew
            rcdDatos.Fields("ID") = .ID
            rcdDatos.Fields("IdExpediente") = .IDExpediente
            rcdDatos.Fields("CodCompras") = .CodCompras
            rcdDatos.Update
            RegistrarCodigoCompra = "1"
        End If
        rcdDatos.Close
    End With
End Function

Public Function RegistrarCPV( _
                            p_IDCPV As String, _
                            Optional ByRef p_Error As String, _
                            Optional p_Db As DAO.Database = Nothing _
                            ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_ExpCPV As ExpedienteCPV
    Dim dbUse As DAO.Database
    
    If p_Db Is Nothing Then Set dbUse = getdb() Else Set dbUse = p_Db
    
    Set m_ExpCPV = New ExpedienteCPV
    With m_ExpCPV
        .IDCPVExpediente = .IDCPVExpedienteCalculado
        .IDExpediente = Me.Expediente.IDExpediente
        .IDCPV = p_IDCPV
        
        Dim m_SQL As String
        m_SQL = "SELECT * FROM TbExpedientesCPVs WHERE IDExpediente=" & .IDExpediente & " AND IDCPV=" & .IDCPV & ";"
        Set rcdDatos = dbUse.OpenRecordset(m_SQL)
        
        If rcdDatos.EOF Then
            rcdDatos.AddNew
            rcdDatos.Fields("IDCPVExpediente") = .IDCPVExpediente
            rcdDatos.Fields("IdExpediente") = .IDExpediente
            rcdDatos.Fields("IDCPV") = .IDCPV
            rcdDatos.Update
            RegistrarCPV = "1"
        End If
        rcdDatos.Close
    End With
End Function

Public Function RegistrarLugarEjecucion( _
                                        p_IDLugar As String, _
                                        Optional ByRef p_Error As String, _
                                        Optional p_Db As DAO.Database = Nothing, _
                                        Optional p_ForceCacheFailureForTest As Boolean = False _
                                        ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_ExpLugar As ExpedienteLugarEjecucion
    Dim dbUse As DAO.Database
    Dim ws As DAO.Workspace
    Dim bOwnTransaction As Boolean
    
    On Error GoTo errores
    p_Error = ""

    If p_Db Is Nothing Then
        Set ws = DBEngine.Workspaces(0)
        Set dbUse = getdb()
        ws.BeginTrans
        bOwnTransaction = True
    Else
        Set dbUse = p_Db
    End If
    
    Set m_ExpLugar = New ExpedienteLugarEjecucion
    With m_ExpLugar
        .IDExpedienteLugarEjecucion = .IDLugarEjecucionExpedienteCalculado
        .IDExpediente = Me.Expediente.IDExpediente
        .IDLugarEjecucion = p_IDLugar
        
        Dim m_SQL As String
        m_SQL = "SELECT * FROM TbExpedientesLugaresEjecucion WHERE IDExpediente=" & .IDExpediente & " AND IDLugarEjecucion=" & .IDLugarEjecucion & ";"
        Set rcdDatos = dbUse.OpenRecordset(m_SQL)
        
        If rcdDatos.EOF Then
            rcdDatos.AddNew
            rcdDatos.Fields("IDExpedienteLugarEjecucion") = .IDExpedienteLugarEjecucion
            rcdDatos.Fields("IdExpediente") = .IDExpediente
            rcdDatos.Fields("IDLugarEjecucion") = .IDLugarEjecucion
            rcdDatos.Update
            RegistrarLugarEjecucion = "1"
        End If
        rcdDatos.Close
    End With

    If bOwnTransaction Then
        RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse, p_Ambito:=EnumAmbitoActualizacion.Lugares, p_ForceCacheFailureForTest:=p_ForceCacheFailureForTest
        If p_Error <> "" Then Err.Raise 1000
        ws.CommitTrans
        bOwnTransaction = False
        RegistrarUltimoCambio p_Expediente:=Me.Expediente
    End If
    Exit Function
errores:
    On Error Resume Next
    If Not rcdDatos Is Nothing Then rcdDatos.Close
    If bOwnTransaction And Not ws Is Nothing Then ws.Rollback
    If Err.Number <> 1000 Then p_Error = "Error en RegistrarLugarEjecucion: " & Err.Description
End Function

Public Function RegistrarPECAL( _
                                p_IDPEcal As String, _
                                Optional ByRef p_Error As String, _
                                Optional p_Db As DAO.Database = Nothing, _
                                Optional p_ForceCacheFailureForTest As Boolean = False _
                                ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_ExpPECAL As ExpedientePECAL
    Dim dbUse As DAO.Database
    Dim ws As DAO.Workspace
    Dim bOwnTransaction As Boolean
    
    On Error GoTo errores
    p_Error = ""

    If p_Db Is Nothing Then
        Set ws = DBEngine.Workspaces(0)
        Set dbUse = getdb()
        ws.BeginTrans
        bOwnTransaction = True
    Else
        Set dbUse = p_Db
    End If
    
    Set m_ExpPECAL = New ExpedientePECAL
    With m_ExpPECAL
        .IDPECALExpediente = .IDPECALExpedienteCalculado
        .IDExpediente = Me.Expediente.IDExpediente
        .IDPECAL = p_IDPEcal
        
        Dim m_SQL As String
        m_SQL = "SELECT * FROM TbExpedientesPECAL WHERE IDExpediente=" & .IDExpediente & " AND IDPECAL=" & .IDPECAL & ";"
        Set rcdDatos = dbUse.OpenRecordset(m_SQL)
        
        If rcdDatos.EOF Then
            rcdDatos.AddNew
            rcdDatos.Fields("IDPECALExpediente") = .IDPECALExpediente
            rcdDatos.Fields("IdExpediente") = .IDExpediente
            rcdDatos.Fields("IDPECAL") = .IDPECAL
            rcdDatos.Update
            RegistrarPECAL = "1"
        End If
        rcdDatos.Close
    End With

    If bOwnTransaction Then
        ActualizarCadenaPECAL p_Error, dbUse
        If p_Error <> "" Then Err.Raise 1000
        RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse, p_Ambito:=EnumAmbitoActualizacion.PECAL, p_ForceCacheFailureForTest:=p_ForceCacheFailureForTest
        If p_Error <> "" Then Err.Raise 1000
        ws.CommitTrans
        bOwnTransaction = False
        RegistrarUltimoCambio p_Expediente:=Me.Expediente
    End If
    Exit Function
errores:
    On Error Resume Next
    If Not rcdDatos Is Nothing Then rcdDatos.Close
    If bOwnTransaction And Not ws Is Nothing Then ws.Rollback
    If Err.Number <> 1000 Then p_Error = "Error en RegistrarPECAL: " & Err.Description
End Function

Public Function RegistrarRAC( _
                            p_IDRac As String, _
                            Optional ByRef p_Error As String, _
                            Optional p_Db As DAO.Database = Nothing, _
                            Optional p_ForceCacheFailureForTest As Boolean = False _
                            ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_ExpRAC As ExpedienteRAC
    Dim dbUse As DAO.Database
    Dim ws As DAO.Workspace
    Dim bOwnTransaction As Boolean
    
    On Error GoTo errores
    p_Error = ""

    If p_Db Is Nothing Then
        Set ws = DBEngine.Workspaces(0)
        Set dbUse = getdb()
        ws.BeginTrans
        bOwnTransaction = True
    Else
        Set dbUse = p_Db
    End If
    
    Set m_ExpRAC = New ExpedienteRAC
    With m_ExpRAC
        .IDRacExpediente = .IDRacExpedienteCalculado
        .IDExpediente = Me.Expediente.IDExpediente
        .IDRAC = p_IDRac
        
        Dim m_SQL As String
        m_SQL = "SELECT * FROM TbExpedientesRACS WHERE IDExpediente=" & .IDExpediente & " AND IDRAC=" & .IDRAC & ";"
        Set rcdDatos = dbUse.OpenRecordset(m_SQL)
        
        If rcdDatos.EOF Then
            rcdDatos.AddNew
            rcdDatos.Fields("IDRACExpediente") = .IDRacExpediente
            rcdDatos.Fields("IdExpediente") = .IDExpediente
            rcdDatos.Fields("IDRAC") = .IDRAC
            rcdDatos.Update
            RegistrarRAC = "1"
        End If
        rcdDatos.Close
    End With

    If bOwnTransaction Then
        RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse, p_Ambito:=EnumAmbitoActualizacion.RACs, p_ForceCacheFailureForTest:=p_ForceCacheFailureForTest
        If p_Error <> "" Then Err.Raise 1000
        ws.CommitTrans
        bOwnTransaction = False
        RegistrarUltimoCambio p_Expediente:=Me.Expediente
    End If
    Exit Function
errores:
    On Error Resume Next
    If Not rcdDatos Is Nothing Then rcdDatos.Close
    If bOwnTransaction And Not ws Is Nothing Then ws.Rollback
    If Err.Number <> 1000 Then p_Error = "Error en RegistrarRAC: " & Err.Description
End Function

Public Function RegistraResponsable( _
                                    p_Responsable As ExpedienteResponsable, _
                                    Optional ByRef p_Error As String, _
                                    Optional p_Db As DAO.Database = Nothing, _
                                    Optional p_ForceCacheFailureForTest As Boolean = False _
                                    ) As String
    Dim rcdDatos As DAO.Recordset
    Dim dbUse As DAO.Database
    Dim ws As DAO.Workspace
    Dim bOwnTransaction As Boolean
    
    On Error GoTo errores
    p_Error = ""

    If p_Db Is Nothing Then
        Set ws = DBEngine.Workspaces(0)
        Set dbUse = getdb()
        ws.BeginTrans
        bOwnTransaction = True
    Else
        Set dbUse = p_Db
    End If
    
    With p_Responsable
        .IDExpediente = Me.Expediente.IDExpediente
        .IDExpedienteResponsable = .IDExpedienteResponsableCalculado
        
        Dim m_SQL As String
        m_SQL = "SELECT * FROM TbExpedientesResponsables WHERE IDExpediente=" & .IDExpediente & " AND IDUsuario=" & .IdUsuario & ";"
        Set rcdDatos = dbUse.OpenRecordset(m_SQL)
        
        If rcdDatos.EOF Then
            rcdDatos.AddNew
            rcdDatos.Fields("IDExpedienteResponsable") = .IDExpedienteResponsable
            rcdDatos.Fields("IdExpediente") = .IDExpediente
            rcdDatos.Fields("IdUsuario") = .IdUsuario
            rcdDatos.Fields("EsJefeProyecto") = .EsJefeProyecto
            rcdDatos.Fields("CorreoSiempre") = .CorreoSiempre
            rcdDatos.Update
            RegistraResponsable = "1"
        End If
        rcdDatos.Close
    End With

    If bOwnTransaction Then
        RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse, p_Ambito:=EnumAmbitoActualizacion.Responsables, p_ForceCacheFailureForTest:=p_ForceCacheFailureForTest
        If p_Error <> "" Then Err.Raise 1000
        ws.CommitTrans
        bOwnTransaction = False
        RegistrarUltimoCambio p_Expediente:=Me.Expediente
    End If
    Exit Function
errores:
    On Error Resume Next
    If Not rcdDatos Is Nothing Then rcdDatos.Close
    If bOwnTransaction And Not ws Is Nothing Then ws.Rollback
    If Err.Number <> 1000 Then p_Error = "Error en RegistraResponsable: " & Err.Description
End Function

Public Function RegistrarAnexo( _
                                p_URLLocal As String, _
                                Optional ByRef p_Error As String, _
                                Optional p_Db As DAO.Database = Nothing _
                                ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_ExpAnexo As ExpedienteAnexo
    Dim m_URLDir As String
    Dim m_URLFinal As String
    Dim dbUse As DAO.Database
    Dim m_CopiaFisicaRealizada As Boolean
    Dim m_NumeroError As Long
    Dim m_DescripcionError As String

    On Error GoTo errores
    p_Error = ""

    If Trim$(Nz(p_URLLocal, "")) = "" Then
        p_Error = "No se ha indicado el archivo que se quiere anexar"
        Err.Raise 1000
    End If
    
    If p_Db Is Nothing Then Set dbUse = getdb() Else Set dbUse = p_Db
    If p_Error <> "" Then Err.Raise 1000
    
    If Not fso.FileExists(p_URLLocal) Then
        p_Error = "El anexo no es alcanzable"
        Err.Raise 1000
    End If
    If Me.Expediente Is Nothing Then
        p_Error = "No se ha indicado el expediente al que anexar el documento"
        Err.Raise 1000
    End If
    If Trim$(Nz(Me.Expediente.IDExpediente, "")) = "" Then
        p_Error = "No se puede anexar el documento porque el expediente no tiene identificador"
        Err.Raise 1000
    End If
    
    Set m_ExpAnexo = New ExpedienteAnexo
    With m_ExpAnexo
        .IDDocumento = .IDDocumentoCalculado
        .IDExpediente = Me.Expediente.IDExpediente
        .NombreDocumento = fso.GetFileName(p_URLLocal)
        
        m_URLDir = .URLDirectorio
        If .Error <> "" Then
            p_Error = .Error
            Err.Raise 1000
        End If
        If m_URLDir = "" Then
            p_Error = "No se puede calcular el directorio de anexos del expediente " & .IDExpediente
            Err.Raise 1000
        End If
        
        m_URLFinal = .URLDocumento
        If .Error <> "" Then
            p_Error = .Error
            Err.Raise 1000
        End If
        If m_URLFinal = "" Then
            p_Error = "No se puede calcular la ruta final del anexo " & .NombreDocumento
            Err.Raise 1000
        End If
        If Not fso.FolderExists(m_URLDir) Then fso.CreateFolder m_URLDir
        ValidarCarpetaEscribible m_URLDir, "anexos del expediente " & .IDExpediente, p_Error
        If p_Error <> "" Then Err.Raise 1000
        
        Dim m_SQL As String
        m_SQL = "SELECT * FROM TbExpedientesAnexos WHERE IDExpediente=" & .IDExpediente & " AND NombreDocumento='" & .NombreDocumento & "';"
        Set rcdDatos = dbUse.OpenRecordset(m_SQL)
        
        If rcdDatos.EOF Then
            fso.CopyFile p_URLLocal, m_URLFinal, True
            m_CopiaFisicaRealizada = True

            rcdDatos.AddNew
            rcdDatos.Fields("IDDocumento") = .IDDocumento
            rcdDatos.Fields("IdExpediente") = .IDExpediente
            rcdDatos.Fields("NombreDocumento") = .NombreDocumento
            rcdDatos.Update
            RegistrarAnexo = "1"
        End If
        rcdDatos.Close
    End With
    Exit Function
errores:
    m_NumeroError = Err.Number
    m_DescripcionError = Err.Description
    On Error Resume Next
    If Not rcdDatos Is Nothing Then rcdDatos.Close
    If m_CopiaFisicaRealizada And RegistrarAnexo <> "1" Then
        If m_URLFinal <> "" Then
            If fso.FileExists(m_URLFinal) Then fso.DeleteFile m_URLFinal, True
        End If
    End If
    If m_NumeroError <> 1000 Then
        p_Error = "El método RegistrarAnexo ha devuelto el error:" & vbNewLine & m_DescripcionError
    End If
End Function

' ==============================================================================
' MÉTODOS DE CÁLCULO INTERNO (TRANSACCIONALES)
' ==============================================================================

Public Function ActualizarCadenaPECAL( _
                                    Optional ByRef p_Error As String, _
                                    Optional p_Db As DAO.Database = Nothing _
                                    ) As String
    
    Dim rcd As DAO.Recordset
    Dim m_SQL As String
    Dim sCadena As String
    Dim dbUse As DAO.Database
    
    On Error GoTo errores
    
    ' 1. Usar la conexión transaccional si se proporciona
    If p_Db Is Nothing Then
        Set dbUse = getdb()
    Else
        Set dbUse = p_Db
    End If
    
    If Me.Expediente Is Nothing Then Exit Function
    If Me.Expediente.IDExpediente = "" Then Exit Function
    
    ' 2. Leer los PECALES asociados (usando la conexión correcta para ver datos no confirmados)
    m_SQL = "SELECT T.PECAL " & _
            "FROM TbExpedientesPECAL R " & _
            "INNER JOIN TbPECAL T ON R.IDPECAL = T.IDPECAL " & _
            "WHERE R.IDExpediente=" & Me.Expediente.IDExpediente & " " & _
            "ORDER BY T.PECAL;"
            
    Set rcd = dbUse.OpenRecordset(m_SQL, dbOpenSnapshot)
    
    ' 3. Construir la cadena
    sCadena = ""
    With rcd
        Do While Not .EOF
            If sCadena = "" Then
                sCadena = .Fields("PECAL")
            Else
                sCadena = sCadena & "|" & .Fields("PECAL")
            End If
            .MoveNext
        Loop
        .Close
    End With
    Set rcd = Nothing
    
    ' 4. Actualizar la cabecera del expediente
    If sCadena = "" Then
        m_SQL = "UPDATE TbExpedientes SET CadenaPecal = Null, Pecal='No' " & _
                "WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
    Else
        ' Si es N/A se trata distinto
        If sCadena = "N/A" Then
             m_SQL = "UPDATE TbExpedientes SET CadenaPecal = Null, Pecal='No' " & _
                    "WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
        Else
            m_SQL = "UPDATE TbExpedientes SET CadenaPecal = '" & sCadena & "', Pecal='Sí' " & _
                    "WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
        End If
    End If
    
    dbUse.Execute m_SQL, dbFailOnError
    
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "Error en ActualizarCadenaPECAL: " & Err.Description
    End If
End Function
' ==============================================================================
' ACTUALIZACIÓN RECURSIVA DE NEMOTÉCNICOS
' ==============================================================================

Public Function ActualizaNemotecnicosFamilia( _
                                p_Expediente As Expediente, _
                                Optional ByRef p_Error As String, _
                                Optional p_Db As DAO.Database = Nothing _
                                ) As String
    
    Dim m_SQL As String
    Dim m_ExpedienteHijo As Expediente
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    Dim dbUse As DAO.Database
    
    On Error GoTo errores
    
    ' 1. Gestión de la conexión (Transaccional o Standalone)
    If p_Db Is Nothing Then
        Set dbUse = getdb()
    Else
        Set dbUse = p_Db
    End If

    If p_Expediente Is Nothing Then
        p_Error = "Expediente no registrado"
        Err.Raise 1000
    End If
    
    With p_Expediente
        If .IDExpediente = "" Then
            p_Error = "Expediente no registrado (Sin ID)"
            Err.Raise 1000
        End If
        
        ' 2. Calcular y Actualizar el Nemotécnico del expediente actual
        .Nemotecnico = .NemotecnicoCalculado
        
        If .Nemotecnico <> "" Then
            m_SQL = "UPDATE TbExpedientes SET Nemotecnico = '" & .Nemotecnico & "' " & _
                    "WHERE IDExpediente=" & .IDExpediente & ";"
            dbUse.Execute m_SQL
        End If
        
        ' 3. Procesar hijos recursivamente
        ' Si no tiene derivados, terminamos aquí
        If .Derivados Is Nothing Then Exit Function
        
        Set m_Col = .Derivados
        For Each m_ID In m_Col
            Set m_ExpedienteHijo = m_Col(m_ID)
            
            ' Llamada recursiva pasando la misma conexión para mantener coherencia
            ActualizaNemotecnicosFamilia m_ExpedienteHijo, p_Error, dbUse
            
            If p_Error <> "" Then Err.Raise 1000
            
            Set m_ExpedienteHijo = Nothing
        Next
    End With
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteOperaciones.ActualizaNemotecnicosFamilia ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function

' ==============================================================================
' GESTIÓN DE HITOS (RECUPERADO Y TRANSACCIONAL)
' ==============================================================================

Public Function RegistrarHito( _
                                p_Hito As ExpedienteHito, _
                                Optional ByRef p_Error As String, _
                                Optional p_Db As DAO.Database = Nothing _
                                ) As String
                                
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_HitoExistente As ExpedienteHito
    Dim dbUse As DAO.Database
    
    On Error GoTo errores
    
    ' 1. Gestión de la conexión (Transaccional o Standalone)
    If p_Db Is Nothing Then
        Set dbUse = getdb()
    Else
        Set dbUse = p_Db
    End If

    ' 2. Validaciones
    If Me.Expediente Is Nothing Then
        p_Error = "Expediente no registrado"
        Err.Raise 1000
    End If
    If Me.Expediente.IDExpediente = "" Then
        p_Error = "El ID del expediente no es válido"
        Err.Raise 1000
    End If
    If p_Hito Is Nothing Then
        p_Error = "Falta el objeto Hito"
        Err.Raise 1000
    End If
    
    With p_Hito
        If .DESCRIPCION = "" Then
             p_Error = "La Descripción del hito es obligatoria"
             Err.Raise 1000
        End If
        If Not IsDate(.FechaHito) Then
            p_Error = "La fecha del hito es obligatoria"
             Err.Raise 1000
        End If
        
        ' 3. Persistencia
        ' Buscamos por IDExpediente y Fecha (Clave lógica en este contexto)
        m_SQL = "SELECT * FROM TbExpedientesHitos WHERE IDExpediente=" & Me.Expediente.IDExpediente & " AND FechaHito=#" & Format(.FechaHito, "mm/dd/yyyy") & "#;"
        Set rcdDatos = dbUse.OpenRecordset(m_SQL)
        
        ' Si ya existe un registro con esa fecha, lo borramos para sobrescribir (política simple)
        ' OJO: Si necesitas editar sin borrar, habría que cambiar esto por un Edit.
        ' Dado tu código anterior, parece que se trataba como un "Upsert" basado en fecha.
        If Not rcdDatos.EOF Then
            rcdDatos.Delete
            ' Reabrimos para insertar
            Set rcdDatos = dbUse.OpenRecordset(m_SQL)
        End If
        
        If rcdDatos.EOF Then
            rcdDatos.AddNew
                .IDHitoExpediente = .IDHitoExpedienteCalculado
                rcdDatos.Fields("IDHitoExpediente") = .IDHitoExpediente
                rcdDatos.Fields("IdExpediente") = Me.Expediente.IDExpediente
                rcdDatos.Fields("DESCRIPCION") = .DESCRIPCION
                rcdDatos.Fields("FechaHito") = .FechaHito
                
                If IsDate(.FechaGarantiaHito) Then
                    rcdDatos.Fields("FechaGarantiaHito") = .FechaGarantiaHito
                End If
                If IsNumeric(.Importe) Then
                    rcdDatos.Fields("Importe") = .Importe
                End If
            rcdDatos.Update
            
            RegistrarHito = "1"
            
           RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse, p_Ambito:=EnumAmbitoActualizacion.Hitos
            
            RegistrarUltimoCambio p_Expediente:=Me.Expediente
        Else
            RegistrarHito = "0"
        End If
        
        rcdDatos.Close
        Set rcdDatos = Nothing
    End With
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteOperaciones.RegistrarHito ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function EliminarHito( _
                                p_FechaHito As String, _
                                Optional ByRef p_Error As String, _
                                Optional p_Db As DAO.Database = Nothing _
                                ) As String

    Dim m_SQL As String
    Dim dbUse As DAO.Database
    
    On Error GoTo errores
    
    If p_Db Is Nothing Then Set dbUse = getdb() Else Set dbUse = p_Db
    
    If Me.Expediente Is Nothing Then Err.Raise 1000, , "Expediente no registrado"
    If p_FechaHito = "" Then Err.Raise 1000, , "Falta la fecha del hito"
    
    m_SQL = "DELETE * " & _
            "FROM TbExpedientesHitos " & _
            "WHERE IDExpediente=" & Me.Expediente.IDExpediente & " AND FechaHito=#" & Format(p_FechaHito, "mm/dd/yyyy") & "#;"
            
    dbUse.Execute m_SQL
    
    ' Actualizar caché
    RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse, p_Ambito:=EnumAmbitoActualizacion.Hitos
    
    RegistrarUltimoCambio p_Expediente:=Me.Expediente
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteOperaciones.EliminarHito ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

' ==============================================================================
' GESTIÓN DE MODIFICADOS (RECUPERADO Y TRANSACCIONAL)
' ==============================================================================

Public Function RegistrarModificado( _
                                    p_Modificado As ExpedienteModificado, _
                                    Optional ByRef p_Error As String, _
                                    Optional p_Db As DAO.Database = Nothing _
                                    ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim dbUse As DAO.Database
    
    On Error GoTo errores
    
    If p_Db Is Nothing Then Set dbUse = getdb() Else Set dbUse = p_Db
    
    If Me.Expediente Is Nothing Then Err.Raise 1000, , "Expediente no registrado"
    If p_Modificado Is Nothing Then Err.Raise 1000, , "Falta el Modificado"
    
    With p_Modificado
        If .DESCRIPCION = "" Then Err.Raise 1000, , "La Descripción es obligatoria"
        If Not IsNumeric(.NModificado) Then Err.Raise 1000, , "El número de modificado es obligatorio"
        
        ' Lógica de persistencia: Buscar si existe para Editar o Crear
        If .IDExpedienteModificado <> "" Then
             m_SQL = "SELECT * FROM TbExpedientesModificados WHERE IDExpedienteModificado=" & .IDExpedienteModificado & ";"
        Else
             m_SQL = "SELECT * FROM TbExpedientesModificados WHERE IDExpediente=" & Me.Expediente.IDExpediente & " AND NModificado=" & .NModificado & ";"
        End If
        
        Set rcdDatos = dbUse.OpenRecordset(m_SQL)
        
        If rcdDatos.EOF Then
            rcdDatos.AddNew
            .IDExpedienteModificado = .IDExpedienteModificadoCalculado
            rcdDatos.Fields("IDExpedienteModificado") = .IDExpedienteModificado
            rcdDatos.Fields("IdExpediente") = Me.Expediente.IDExpediente
        Else
            rcdDatos.Edit
        End If
        
        rcdDatos.Fields("NModificado") = .NModificado
        If IsDate(.FechaFirmaModificado) Then
            rcdDatos.Fields("FechaFirmaModificado") = .FechaFirmaModificado
        Else
            rcdDatos.Fields("FechaFirmaModificado") = Null
        End If
        If IsDate(.FechaFinModificado) Then
            rcdDatos.Fields("FechaFinModificado") = .FechaFinModificado
        Else
            rcdDatos.Fields("FechaFinModificado") = Null
        End If
        
        rcdDatos.Fields("DESCRIPCION") = .DESCRIPCION
                
        rcdDatos.Update
        rcdDatos.Close
        Set rcdDatos = Nothing
        
        RegistrarModificado = "1"
        
        
        
        RegistrarUltimoCambio p_Expediente:=Me.Expediente
    End With
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteOperaciones.RegistrarModificado ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function EliminarModificado( _
                                p_IDExpedienteModificado As String, _
                                Optional ByRef p_Error As String, _
                                Optional p_Db As DAO.Database = Nothing _
                                ) As String
    Dim m_SQL As String
    Dim dbUse As DAO.Database
    
    On Error GoTo errores
    
    If p_Db Is Nothing Then Set dbUse = getdb() Else Set dbUse = p_Db
    
    If p_IDExpedienteModificado = "" Then Err.Raise 1000, , "Falta el ID del Modificado"
    
    m_SQL = "DELETE * FROM TbExpedientesModificados WHERE IDExpedienteModificado=" & p_IDExpedienteModificado & ";"
    dbUse.Execute m_SQL
    
    
    RegistrarUltimoCambio p_Expediente:=Me.Expediente
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteOperaciones.EliminarModificado ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

' ==============================================================================
' GESTIÓN DE CAMBIO DE TIPO (RECUPERADO)
' ==============================================================================

Public Function RegistrarCambioTipo( _
                                    Optional ByRef p_Error As String, _
                                    Optional p_Db As DAO.Database = Nothing _
                                    ) As String
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim dbUse As DAO.Database
    
    On Error GoTo errores
    
    ' Gestión de conexión (Transaccional o Standalone)
    If p_Db Is Nothing Then
        Set dbUse = getdb()
    Else
        Set dbUse = p_Db
    End If
    
    If Me.Expediente Is Nothing Then
        p_Error = "Expediente no registrado"
        Err.Raise 1000
    End If
    
    With Me.Expediente
        If .IDExpediente = "" Then
            p_Error = "El expediente no está registrado"
            Err.Raise 1000
        End If
        
        ' Recalcular el texto del tipo antes de guardar (basado en los flags modificados en el formulario)
        .TIpo = .TipoCalculadoTexto
        
        m_SQL = "SELECT * " & _
                "FROM TbExpedientes " & _
                "WHERE IDExpediente=" & .IDExpediente & ";"
        
        Set rcdDatos = dbUse.OpenRecordset(m_SQL)
        
        If Not rcdDatos.EOF Then
            rcdDatos.Edit
                ' Actualizar Padre
                If .IDExpedientePadre <> "" Then
                    rcdDatos.Fields("IDExpedientePadre") = .IDExpedientePadre
                Else
                    rcdDatos.Fields("IDExpedientePadre") = Null
                End If
                
                ' Actualizar Flags de Tipología
                If .EsAM <> "" Then rcdDatos.Fields("EsAM") = .EsAM Else rcdDatos.Fields("EsAM") = Null
                If .EsLote <> "" Then rcdDatos.Fields("EsLote") = .EsLote Else rcdDatos.Fields("EsLote") = Null
                If .EsBasado <> "" Then rcdDatos.Fields("EsBasado") = .EsBasado Else rcdDatos.Fields("EsBasado") = Null
                If .EsExpediente <> "" Then rcdDatos.Fields("EsExpediente") = .EsExpediente Else rcdDatos.Fields("EsExpediente") = Null
                
                ' Actualizar Texto Tipo
                If .TIpo <> "" Then rcdDatos.Fields("TIpo") = .TIpo Else rcdDatos.Fields("TIpo") = Null
                
            rcdDatos.Update
        End If
        rcdDatos.Close
        Set rcdDatos = Nothing
        
        ' Actualizar caché y log (Pasando la conexión)
        RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse
        If p_Error <> "" Then Err.Raise 1000
        
        RegistrarUltimoCambio p_Expediente:=Me.Expediente
        
    End With
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteOperaciones.RegistrarCambioTipo ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

' ==============================================================================
' ELIMINACIÓN DE EXPEDIENTE (RECUPERADO)
' ==============================================================================

Public Function Eliminar( _
                        Optional ByRef p_Error As String, _
                        Optional p_Db As DAO.Database = Nothing _
                        ) As String
    
    Dim m_MotivoNoOK As String
    Dim m_SQL As String
    Dim ws As DAO.Workspace
    Dim dbUse As DAO.Database
    Dim bTransaccionIniciadaAqui As Boolean
    
    On Error GoTo errores
    
    ' 1. Validaciones Previas
    If Me.Expediente Is Nothing Then
        p_Error = "Expediente no registrado"
        Err.Raise 1000
    End If
    If Me.Expediente.IDExpediente = "" Then
        p_Error = "Expediente no registrado (Sin ID)"
        Err.Raise 1000
    End If
    
    ' Comprobar reglas de negocio (dependencias externas que impiden borrar)
    m_MotivoNoOK = MotivoEliminarNoOK(p_Error)
    If p_Error <> "" Then Err.Raise 1000
    
    If m_MotivoNoOK <> "" Then
        p_Error = m_MotivoNoOK
        Err.Raise 1000
    End If
    
    ' 2. Gestión de Transacción
    If p_Db Is Nothing Then
        ' Si no nos pasan BD, iniciamos nuestra propia transacción
        Set ws = DBEngine.Workspaces(0)
        Set dbUse = getdb()
        ws.BeginTrans
        bTransaccionIniciadaAqui = True
    Else
        ' Si nos pasan BD, nos unimos a la transacción existente
        Set dbUse = p_Db
        bTransaccionIniciadaAqui = False
    End If
    
    ' 3. Borrado en Cascada Manual (Orden inverso para integridad referencial)
    
    ' A) Borrar de Caché de Entidades
    m_SQL = "DELETE * FROM TbExpedientesConEntidades WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
    dbUse.Execute m_SQL
    
    ' B) Borrar Suministradores (Tabla intermedia)
    m_SQL = "DELETE * FROM TbExpedientesSuministradores WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
    dbUse.Execute m_SQL
    
    ' C) Borrar Hitos
    m_SQL = "DELETE * FROM TbExpedientesHitos WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
    dbUse.Execute m_SQL
    
    ' D) Borrar Anualidades
    m_SQL = "DELETE * FROM TbExpedientesAnualidades WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
    dbUse.Execute m_SQL
    
    ' E) Borrar Modificados
    m_SQL = "DELETE * FROM TbExpedientesModificados WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
    dbUse.Execute m_SQL
    
    ' F) Borrar Responsables
    m_SQL = "DELETE * FROM TbExpedientesResponsables WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
    dbUse.Execute m_SQL
    
    ' G) Borrar Relaciones N:M (Comerciales, CPVs, etc.)
    m_SQL = "DELETE * FROM TbExpedientesComerciales WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
    dbUse.Execute m_SQL
    
    m_SQL = "DELETE * FROM TbExpedientesCPVs WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
    dbUse.Execute m_SQL
    
    m_SQL = "DELETE * FROM TbExpedientesLugaresEjecucion WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
    dbUse.Execute m_SQL

    m_SQL = "DELETE * FROM TbExpedientesPECAL WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
    dbUse.Execute m_SQL
    
    m_SQL = "DELETE * FROM TbExpedientesRACS WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
    dbUse.Execute m_SQL
    
    m_SQL = "DELETE * FROM TbExpedientesCodigoCompras WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
    dbUse.Execute m_SQL

    ' H) Finalmente, borrar el Expediente Principal
    m_SQL = "DELETE * FROM TbExpedientes WHERE IDExpediente=" & Me.Expediente.IDExpediente & ";"
    dbUse.Execute m_SQL
    
    ' 4. Confirmar
    If bTransaccionIniciadaAqui Then
        ws.CommitTrans
    End If
    
    ' Limpiar caché en memoria global del entorno para refrescar listas
    Set m_ObjEntorno.ColExpedientesCompletos = Nothing
    
    Exit Function
     
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteOperaciones.Eliminar ha devuelto el error: " & Err.Description
    End If
    ' Rollback si iniciamos nosotros la transacción
    If bTransaccionIniciadaAqui And Not ws Is Nothing Then
        On Error Resume Next
        ws.Rollback
    End If
    
    
End Function

Public Function MotivoEliminarNoOK( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_CadenaDPDs As String
    Dim m_CadenaGestionesDeRiesgo As String
    Dim m_CadenaUsuariosHPS As String
    Dim m_CadenaNCs As String

    On Error GoTo errores
    
    If Me.Expediente Is Nothing Then Exit Function
    
    With Me.Expediente
        ' 1. Hijos derivados
        If Not .Derivados Is Nothing Then
            MotivoEliminarNoOK = "De este elemento derivan otros expedientes (Lotes o Basados). Elimínelos primero."
            Exit Function
        End If
        
        ' 2. DPDs (Agedys)
        m_CadenaDPDs = .CadenaDPDs
        p_Error = .Error
        If p_Error <> "" Then Err.Raise 1000
        If m_CadenaDPDs <> "" Then
            MotivoEliminarNoOK = "Este expediente está vinculado a los DPDs: " & vbNewLine & m_CadenaDPDs
            Exit Function
        End If
        
        ' 3. Gestión de Riesgos
        m_CadenaGestionesDeRiesgo = .CadenaProyectosGestionRiesgos
        p_Error = .Error
        If p_Error <> "" Then Err.Raise 1000
        If m_CadenaGestionesDeRiesgo <> "" Then
            MotivoEliminarNoOK = "Este expediente tiene Gestiones de Riesgo asociadas: " & vbNewLine & m_CadenaGestionesDeRiesgo
            Exit Function
        End If
        
        ' 4. HPS
        m_CadenaUsuariosHPS = .CadenaUsuariosHPS
        p_Error = .Error
        If p_Error <> "" Then Err.Raise 1000
        If m_CadenaUsuariosHPS <> "" Then
            MotivoEliminarNoOK = "Este expediente está en uso por usuarios de HPS: " & vbNewLine & m_CadenaUsuariosHPS
            Exit Function
        End If
        
        ' 5. No Conformidades
        m_CadenaNCs = .CadenaNCs
        p_Error = .Error
        If p_Error <> "" Then Err.Raise 1000
        If m_CadenaNCs <> "" Then
            MotivoEliminarNoOK = "Este expediente tiene No Conformidades asociadas: " & vbNewLine & m_CadenaNCs
            Exit Function
        End If
    End With
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método ExpedienteOperaciones.MotivoEliminarNoOK ha devuelto el error: " & Err.Description
     End If
End Function
' ==============================================================================
' EDICIÓN DE RESPONSABLES (RECUPERADO Y TRANSACCIONAL)
' ==============================================================================

Public Function EditarEnvioCorreoResponsable( _
                                            p_IDUsuario As String, _
                                            p_EnvioCorreoFinal As String, _
                                            Optional ByRef p_Error As String, _
                                            Optional p_Db As DAO.Database = Nothing _
                                            ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_ExpedienteConEnvioCorreo As ExpedienteResponsable
    Dim m_ID As Variant
    Dim dbUse As DAO.Database
    
    On Error GoTo errores
    
    ' 1. Gestión de la conexión
    If p_Db Is Nothing Then
        Set dbUse = getdb()
    Else
        Set dbUse = p_Db
    End If
    
    If Me.Expediente Is Nothing Then
        p_Error = "Expediente no registrado"
        Err.Raise 1000
    End If
    If Me.Expediente.IDExpediente = "" Then
        p_Error = "Expediente no registrado"
        Err.Raise 1000
    End If
    If p_IDUsuario = "" Then
        p_Error = "Falta el Responsable"
        Err.Raise 1000
    End If
    If p_EnvioCorreoFinal <> "Sí" And p_EnvioCorreoFinal <> "No" Then
        p_Error = "El envío de correo ha de ser Sí o NO"
        Err.Raise 1000
    End If
    
    ' Validación de reglas de negocio para AGEDYS (si aplica)
    If p_EnvioCorreoFinal = "No" And Me.Expediente.AGEDYSAplica = "Sí" And Me.Expediente.AGEDYSGenerico <> "Sí" Then
        If Me.Expediente.ResponsablesConEnvioCorreo Is Nothing Then
            p_Error = "Al menos un ha de haber un Responsable con Envío de Correo electrónico en un Expediente para Agedys"
            Err.Raise 1000
        End If
        ' Si solo queda uno y es el que vamos a quitar...
        If Me.Expediente.ResponsablesConEnvioCorreo.Count = 1 Then
            For Each m_ID In Me.Expediente.ResponsablesConEnvioCorreo
                Set m_ExpedienteConEnvioCorreo = Me.Expediente.ResponsablesConEnvioCorreo(m_ID)
            Next
            ' Comprobamos si el único que hay es el usuario que estamos editando
            If m_ExpedienteConEnvioCorreo.IdUsuario = p_IDUsuario Then
                p_Error = "Al menos ha de haber un Responsable con Envío de Correo electrónico en un Expediente para Agedys"
                Err.Raise 1000
            End If
        End If
    End If
    
    m_SQL = "SELECT * " & _
            "FROM TbExpedientesResponsables " & _
            "WHERE IDExpediente=" & Me.Expediente.IDExpediente & " AND IDUsuario=" & p_IDUsuario & ";"
            
    Set rcdDatos = dbUse.OpenRecordset(m_SQL)
    
    If rcdDatos.EOF Then
        p_Error = "No parece que el usuario sea un Responsable registrado en este expediente"
        Err.Raise 1000
    End If
    
    rcdDatos.Edit
        rcdDatos.Fields("CorreoSiempre") = p_EnvioCorreoFinal
    rcdDatos.Update
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse, p_Ambito:=EnumAmbitoActualizacion.Responsables
    
    RegistrarUltimoCambio p_Expediente:=Me.Expediente
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteOperaciones.EditarEnvioCorreoResponsable ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function EditarJPResponsable( _
                                    p_IDUsuario As String, _
                                    p_JPFinal As String, _
                                    Optional ByRef p_Error As String, _
                                    Optional p_Db As DAO.Database = Nothing _
                                    ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_ExpedienteConJPSi As ExpedienteResponsable
    Dim m_ID As Variant
    Dim dbUse As DAO.Database
    
    On Error GoTo errores
    
    If p_Db Is Nothing Then
        Set dbUse = getdb()
    Else
        Set dbUse = p_Db
    End If
    
    If Me.Expediente Is Nothing Then
        p_Error = "Expediente no registrado"
        Err.Raise 1000
    End If
    If Me.Expediente.IDExpediente = "" Then
        p_Error = "Expediente no registrado"
        Err.Raise 1000
    End If
    If p_IDUsuario = "" Then
        p_Error = "Falta el Responsable"
        Err.Raise 1000
    End If
    If p_JPFinal <> "Sí" And p_JPFinal <> "No" Then
        p_Error = "Si es JP ha de ser Sí o NO"
        Err.Raise 1000
    End If
    
    ' Validación regla AGEDYS: Mínimo 1 JP
    If p_JPFinal = "No" And Me.Expediente.AGEDYSAplica = "Sí" And Me.Expediente.AGEDYSGenerico <> "Sí" Then
        If Me.Expediente.ResponsablesJP Is Nothing Then
            p_Error = "Al menos ha de haber un Jefe de Proyecto en un Expediente para Agedys"
            Err.Raise 1000
        End If
        If Me.Expediente.ResponsablesJP.Count = 1 Then
            For Each m_ID In Me.Expediente.ResponsablesJP
                Set m_ExpedienteConJPSi = Me.Expediente.ResponsablesJP(m_ID)
            Next
            If m_ExpedienteConJPSi.IdUsuario = p_IDUsuario Then
                p_Error = "Al menos ha de haber un Jefe de Proyecto en un Expediente para Agedys"
                Err.Raise 1000
            End If
        End If
    End If
    
    m_SQL = "SELECT * " & _
            "FROM TbExpedientesResponsables " & _
            "WHERE IDExpediente=" & Me.Expediente.IDExpediente & " AND IDUsuario=" & p_IDUsuario & ";"
            
    Set rcdDatos = dbUse.OpenRecordset(m_SQL)
    
    If rcdDatos.EOF Then
        p_Error = "No parece que el usuario sea un Responsable registrado"
        Err.Raise 1000
    End If
    
    rcdDatos.Edit
        rcdDatos.Fields("EsJefeProyecto") = p_JPFinal
    rcdDatos.Update
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse, p_Ambito:=EnumAmbitoActualizacion.Responsables
    RegistrarUltimoCambio p_Expediente:=Me.Expediente
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteOperaciones.EditarJPResponsable ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
' ==============================================================================
' MÉTODOS DE ELIMINACIÓN DE DETALLES (RECUPERADOS Y TRANSACCIONALES)
' ==============================================================================

Public Function EliminarAnualidad( _
                                    p_Año As String, _
                                    Optional ByRef p_Error As String, _
                                    Optional p_Db As DAO.Database = Nothing _
                                    ) As String
    Dim m_SQL As String
    Dim dbUse As DAO.Database
    
    On Error GoTo errores
    
    ' Gestión de conexión
    If p_Db Is Nothing Then Set dbUse = getdb() Else Set dbUse = p_Db
    
    If Me.Expediente Is Nothing Then Err.Raise 1000, , "Expediente no registrado"
    If p_Año = "" Then Err.Raise 1000, , "Falta el año"
    
    m_SQL = "DELETE * FROM TbExpedientesAnualidades " & _
            "WHERE IDExpediente=" & Me.Expediente.IDExpediente & " AND Año=" & p_Año & ";"
    dbUse.Execute m_SQL
    
    RegistrarUltimoCambio p_Expediente:=Me.Expediente
    Exit Function
errores:
    If Err.Number <> 1000 Then p_Error = "Error en EliminarAnualidad: " & Err.Description
End Function

Public Function EliminarComercial( _
                                    p_IDComercial As String, _
                                    Optional ByRef p_Error As String, _
                                    Optional p_Db As DAO.Database = Nothing _
                                    ) As String
    Dim m_SQL As String
    Dim dbUse As DAO.Database
    
    On Error GoTo errores
    If p_Db Is Nothing Then Set dbUse = getdb() Else Set dbUse = p_Db
    
    If Me.Expediente Is Nothing Then Err.Raise 1000, , "Expediente no registrado"
    
    m_SQL = "DELETE * FROM TbExpedientesComerciales " & _
            "WHERE IDExpediente=" & Me.Expediente.IDExpediente & " AND IDComercial=" & p_IDComercial & ";"
    dbUse.Execute m_SQL
    
    RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse, p_Ambito:=EnumAmbitoActualizacion.Comerciales
    
    RegistrarUltimoCambio p_Expediente:=Me.Expediente
    Exit Function
errores:
    If Err.Number <> 1000 Then p_Error = "Error en EliminarComercial: " & Err.Description
End Function

Public Function EliminarCPV( _
                            p_IDCPV As String, _
                            Optional ByRef p_Error As String, _
                            Optional p_Db As DAO.Database = Nothing _
                            ) As String
    Dim m_SQL As String
    Dim dbUse As DAO.Database
    
    On Error GoTo errores
    If p_Db Is Nothing Then Set dbUse = getdb() Else Set dbUse = p_Db
    
    If Me.Expediente Is Nothing Then Err.Raise 1000, , "Expediente no registrado"
    
    m_SQL = "DELETE * FROM TbExpedientesCPVs " & _
            "WHERE IDExpediente=" & Me.Expediente.IDExpediente & " AND IDCPV=" & p_IDCPV & ";"
    dbUse.Execute m_SQL
    
    RegistrarUltimoCambio p_Expediente:=Me.Expediente
    Exit Function
errores:
    If Err.Number <> 1000 Then p_Error = "Error en EliminarCPV: " & Err.Description
End Function

Public Function EliminarLugarEjecucion( _
                                        p_IDLugar As String, _
                                        Optional ByRef p_Error As String, _
                                        Optional p_Db As DAO.Database = Nothing, _
                                        Optional p_ForceCacheFailureForTest As Boolean = False _
                                        ) As String
    Dim m_SQL As String
    Dim dbUse As DAO.Database
    Dim ws As DAO.Workspace
    Dim bOwnTransaction As Boolean
    Dim m_ErrNumber As Long
    Dim m_ErrDescription As String
    
    On Error GoTo errores
    p_Error = ""

    If p_Db Is Nothing Then
        Set ws = DBEngine.Workspaces(0)
        Set dbUse = getdb()
        ws.BeginTrans
        bOwnTransaction = True
    Else
        Set dbUse = p_Db
    End If
    
    If Me.Expediente Is Nothing Then Err.Raise 1000, , "Expediente no registrado"
    
    m_SQL = "DELETE * FROM TbExpedientesLugaresEjecucion " & _
            "WHERE IDExpediente=" & Me.Expediente.IDExpediente & " AND IDLugarEjecucion=" & p_IDLugar & ";"
    dbUse.Execute m_SQL
    
    RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse, p_Ambito:=EnumAmbitoActualizacion.Lugares, p_ForceCacheFailureForTest:=p_ForceCacheFailureForTest
    If p_Error <> "" Then Err.Raise 1000

    If bOwnTransaction Then
        ws.CommitTrans
        bOwnTransaction = False
    End If
    
    RegistrarUltimoCambio p_Expediente:=Me.Expediente
    Exit Function
errores:
    m_ErrNumber = Err.Number
    m_ErrDescription = Err.Description
    On Error Resume Next
    If bOwnTransaction And Not ws Is Nothing Then ws.Rollback
    If m_ErrNumber <> 1000 Then p_Error = "Error en EliminarLugarEjecucion: " & m_ErrDescription
End Function

Public Function EliminarPECAL( _
                                p_IDPEcal As String, _
                                Optional ByRef p_Error As String, _
                                Optional p_Db As DAO.Database = Nothing _
                                ) As String
    Dim m_SQL As String
    Dim dbUse As DAO.Database
    
    On Error GoTo errores
    If p_Db Is Nothing Then Set dbUse = getdb() Else Set dbUse = p_Db
    
    If Me.Expediente Is Nothing Then Err.Raise 1000, , "Expediente no registrado"
    
    m_SQL = "DELETE * FROM TbExpedientesPECAL " & _
            "WHERE IDExpediente=" & Me.Expediente.IDExpediente & " AND IDPECAL=" & p_IDPEcal & ";"
    dbUse.Execute m_SQL
    
    ' Recalcular cadena
    ActualizarCadenaPECAL p_Error, dbUse
    
    RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse, p_Ambito:=EnumAmbitoActualizacion.PECAL
    
    RegistrarUltimoCambio p_Expediente:=Me.Expediente
    Exit Function
errores:
    If Err.Number <> 1000 Then p_Error = "Error en EliminarPECAL: " & Err.Description
End Function

Public Function EliminarRAC( _
                            p_IDRac As String, _
                            Optional ByRef p_Error As String, _
                            Optional p_Db As DAO.Database = Nothing, _
                            Optional p_ForceCacheFailureForTest As Boolean = False _
                            ) As String
    Dim m_SQL As String
    Dim dbUse As DAO.Database
    Dim ws As DAO.Workspace
    Dim bOwnTransaction As Boolean
    Dim m_ErrNumber As Long
    Dim m_ErrDescription As String
    
    On Error GoTo errores
    p_Error = ""

    If p_Db Is Nothing Then
        Set ws = DBEngine.Workspaces(0)
        Set dbUse = getdb()
        ws.BeginTrans
        bOwnTransaction = True
    Else
        Set dbUse = p_Db
    End If
    
    If Me.Expediente Is Nothing Then Err.Raise 1000, , "Expediente no registrado"
    
    m_SQL = "DELETE * FROM TbExpedientesRACS " & _
            "WHERE IDExpediente=" & Me.Expediente.IDExpediente & " AND IDRAC=" & p_IDRac & ";"
    dbUse.Execute m_SQL
    
    RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse, p_Ambito:=EnumAmbitoActualizacion.RACs, p_ForceCacheFailureForTest:=p_ForceCacheFailureForTest
    If p_Error <> "" Then Err.Raise 1000

    If bOwnTransaction Then
        ws.CommitTrans
        bOwnTransaction = False
    End If
    
    RegistrarUltimoCambio p_Expediente:=Me.Expediente
    Exit Function
errores:
    m_ErrNumber = Err.Number
    m_ErrDescription = Err.Description
    On Error Resume Next
    If bOwnTransaction And Not ws Is Nothing Then ws.Rollback
    If m_ErrNumber <> 1000 Then p_Error = "Error en EliminarRAC: " & m_ErrDescription
End Function

Public Function EliminarResponsable( _
                                    p_IDUsuario As String, _
                                    Optional ByRef p_Error As String, _
                                    Optional p_Db As DAO.Database = Nothing _
                                    ) As String
    Dim m_SQL As String
    Dim dbUse As DAO.Database
    
    On Error GoTo errores
    If p_Db Is Nothing Then Set dbUse = getdb() Else Set dbUse = p_Db
    
    If Me.Expediente Is Nothing Then Err.Raise 1000, , "Expediente no registrado"
    
    m_SQL = "DELETE * FROM TbExpedientesResponsables " & _
            "WHERE IDExpediente=" & Me.Expediente.IDExpediente & " AND IDUsuario=" & p_IDUsuario & ";"
    dbUse.Execute m_SQL
    
    RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse, p_Ambito:=EnumAmbitoActualizacion.Responsables
    
    ' Actualizar Gestión de Riesgos si aplica (fuera de esta transacción específica usualmente)
    If Not m_ObjEntorno.ColExpedientesEnGestionDeRiesgos Is Nothing Then
        If m_ObjEntorno.ColExpedientesEnGestionDeRiesgos.exists(CStr(Me.Expediente.IDExpediente)) Then
            ActualizarCadenaAutorizadosEnGestionRiesgos Me.Expediente, p_Error
        End If
    End If
    
    RegistrarUltimoCambio p_Expediente:=Me.Expediente
    Exit Function
errores:
    If Err.Number <> 1000 Then p_Error = "Error en EliminarResponsable: " & Err.Description
End Function

Public Function EliminarSuministrador( _
                                    p_IDSuministrador As String, _
                                    Optional ByRef p_Error As String, _
                                    Optional p_Db As DAO.Database = Nothing _
                                    ) As String
    Dim m_SQL As String
    Dim dbUse As DAO.Database
    
    On Error GoTo errores
    If p_Db Is Nothing Then Set dbUse = getdb() Else Set dbUse = p_Db
    
    If Me.Expediente Is Nothing Then Err.Raise 1000, , "Expediente no registrado"
    
    m_SQL = "DELETE * FROM TbExpedientesSuministradores " & _
            "WHERE IDExpediente=" & Me.Expediente.IDExpediente & " AND IDSuministrador=" & p_IDSuministrador & ";"
    dbUse.Execute m_SQL
    
RegistrarExpEntidades p_Error:=p_Error, p_Db:=dbUse, p_Ambito:=EnumAmbitoActualizacion.Suministradores
    
    RegistrarUltimoCambio p_Expediente:=Me.Expediente
    Exit Function
errores:
     If Err.Number <> 1000 Then p_Error = "Error en EliminarSuministrador: " & Err.Description
End Function

' ==============================================================================
' AUTOGUARDADO DE PESTAÑAS â€” MÉTODOS PARCIALES
' ==============================================================================


Public Function EliminarCodigoCompra( _
                                    p_CodCompras As String, _
                                    Optional ByRef p_Error As String, _
                                    Optional p_Db As DAO.Database = Nothing _
                                    ) As String
    Dim m_SQL As String
    Dim dbUse As DAO.Database
    
    On Error GoTo errores
    If p_Db Is Nothing Then Set dbUse = getdb() Else Set dbUse = p_Db
    
    If Me.Expediente Is Nothing Then Err.Raise 1000, , "Expediente no registrado"
    
    m_SQL = "DELETE * FROM TbExpedientesCodigoCompras " & _
            "WHERE IDExpediente=" & Me.Expediente.IDExpediente & " AND CodCompras='" & p_CodCompras & "';"
    dbUse.Execute m_SQL
    
    RegistrarUltimoCambio p_Expediente:=Me.Expediente
    Exit Function
errores:
    If Err.Number <> 1000 Then p_Error = "Error en EliminarCodigoCompra: " & Err.Description
End Function

Public Function EliminarAnexo( _
                                p_NombreDocumento As String, _
                                Optional ByRef p_Error As String, _
                                Optional p_Db As DAO.Database = Nothing _
                                ) As String
    Dim m_SQL As String
    Dim dbUse As DAO.Database
    Dim m_ExisteURL As Boolean
    Dim m_NombreReal As String
    
    On Error GoTo errores
    If p_Db Is Nothing Then Set dbUse = getdb() Else Set dbUse = p_Db
    
    If Me.Expediente Is Nothing Then Err.Raise 1000, , "Expediente no registrado"
    If p_NombreDocumento = "" Then Err.Raise 1000, , "Falta nombre documento"
    
    If fso.FileExists(p_NombreDocumento) Then m_ExisteURL = True
    m_NombreReal = fso.GetFileName(p_NombreDocumento)
    
    m_SQL = "DELETE * FROM TbExpedientesAnexos " & _
            "WHERE IDExpediente=" & Me.Expediente.IDExpediente & " AND NombreDocumento='" & m_NombreReal & "';"
    dbUse.Execute m_SQL
    
    ' Borrado físico (No transaccional, se hace al final)
    If m_ExisteURL Then
        If Not FicheroAbierto(p_NombreDocumento) Then
            On Error Resume Next
            fso.DeleteFile p_NombreDocumento, True
            Err.Clear
            On Error GoTo errores
        End If
    End If
    
RegistrarUltimoCambio p_Expediente:=Me.Expediente
    Exit Function
errores:
     If Err.Number <> 1000 Then p_Error = "Error en EliminarAnexo: " & Err.Description
End Function

' ==============================================================================
' AUTOGUARDADO â€” NUEVAS VERSIONES (PESTANA GENERAL)
' ==============================================================================

' ==============================================================================
' AUTOGUARDADO â€” NUEVAS VERSIONES (PESTANA FECHAS)
' ==============================================================================





