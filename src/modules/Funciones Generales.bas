Attribute VB_Name = "Funciones Generales"
Option Compare Database
Option Explicit
' Asegúrate de activar la referencia "Microsoft Scripting Runtime" en Herramientas > Referencias

Public Function BorrarContenidoCarpeta( _
                                        p_URL As String, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    
    Dim carpeta As Object
    Dim archivo As Object
    Dim subcarpeta As Object
    On Error GoTo errores
    
    If fso.FolderExists(p_URL) Then
        Set carpeta = fso.GetFolder(p_URL)
        
        ' Elimina todos los archivos
        For Each archivo In carpeta.Files
            archivo.Delete True
        Next archivo
        
        ' Elimina todas las subcarpetas y su contenido
        For Each subcarpeta In carpeta.SubFolders
            subcarpeta.Delete True
        Next subcarpeta
    End If

    Set carpeta = Nothing
    Set fso = Nothing
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método BorrarContenidoCarpeta ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function RellenarBordeCamposObligatoriosOK( _
                                                p_Form As Form, _
                                                Optional ByRef p_Error As String _
                                                ) As String
    
    
    Dim ctl As Control
    
    On Error GoTo errores
    
    p_Error = ""
    
     For Each ctl In p_Form.Controls
        'If ctl.Name = "MotivoNoAccionCorrectiva" Then Stop
        If InStr(Nz(ctl.Tag, ""), "OBLIGATORIO") <> 0 Then
            If Nz(ctl.Value, "") = "" Then
                EstablecerControlCombo ctl, EnumSino.No
                
            Else
                EstablecerControlCombo ctl, EnumSino.Sí
                
            End If
        Else
            If InStr(Nz(ctl.Tag, ""), "DATO") <> 0 Then
                EstablecerControlCombo ctl, EnumSino.Sí
            End If
        End If
    Next
   
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarBordeCamposObligatoriosOK ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function PintarIndicadores( _
                                    Optional p_Reiniciando As EnumSino = EnumSino.No, _
                                    Optional ByVal p_Modo As String = "AMBOS", _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    
    Dim m_ColSegsTareasProyectoPteReplanificar As Scripting.Dictionary
    Dim m_ColSegsTareasProyectoIrregulares As Scripting.Dictionary
    Dim m_ColSegsNCProyectoRegistradas As Scripting.Dictionary
    Dim m_ColSegsNCProyectoAccionesSinTareas As Scripting.Dictionary
    Dim m_ColSegsNCProyectoPteCE As Scripting.Dictionary
    Dim m_ColSegsNCProyectoCECaducada As Scripting.Dictionary
    Dim m_ColSegsNCProyectoCENoConforme As Scripting.Dictionary
    
    Dim m_ColSegsTareasAuditoriaPteReplanificar As Scripting.Dictionary
    Dim m_ColSegsNCAuditoriaRegistradas As Scripting.Dictionary
    Dim m_ColSegsNCAuditoriaAccionesSinTareas As Scripting.Dictionary
    Dim m_ColSegsNCAuditoriaPteCE As Scripting.Dictionary
    Dim m_ColSegsNCAuditoriaCECaducada As Scripting.Dictionary
    Dim m_ColSegsNCAuditoriaCENoConforme As Scripting.Dictionary
    
  
    
    Dim m_Resultados As Scripting.Dictionary
    Dim m_Usuario As usuario
    Dim m_IncluirProyecto As Boolean
    Dim m_IncluirAuditoria As Boolean
    Dim m_Telemetria As Scripting.Dictionary
    Dim m_TelemetriaResumen As String
    Dim m_TelemetriaError As String
    Dim m_ModoNormalizado As String
    Dim m_ConteosProyectoCache As Scripting.Dictionary
    Dim m_ConteosAuditoriaCache As Scripting.Dictionary
    Dim m_ProyectoCachePath As Boolean
    Dim m_AuditoriaCachePath As Boolean
    Dim m_ProyectoCacheError As String
    Dim m_AuditoriaCacheError As String
    Dim m_ProyectoSyncError As String
    Dim m_AuditoriaSyncError As String
    Dim m_ProyectoSyncOk As Boolean
    Dim m_AuditoriaSyncOk As Boolean
    
    On Error GoTo errores
    If p_Reiniciando = Empty Then
        p_Reiniciando = EnumSino.No
    End If
    If p_Reiniciando = EnumSino.Sí Then
        ResetearColTareas p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If

    m_ModoNormalizado = UCase$(Trim$(p_Modo))
    If m_ModoNormalizado = "" Then m_ModoNormalizado = "AMBOS"

    m_IncluirProyecto = (m_ModoNormalizado <> "AUDITORIA")
    m_IncluirAuditoria = (m_ModoNormalizado <> "PROYECTO")
    Set m_Usuario = m_ObjUsuarioConectado
    Set m_Telemetria = Indicadores_TelemetriaIniciar(p_Modo, m_IncluirProyecto, m_TelemetriaError)
    Call Indicadores_TelemetriaEtapa(m_Telemetria, "inicio", m_TelemetriaError)
    Call Indicadores_TelemetriaCacheEstado(m_Telemetria, "reset", p_Reiniciando <> EnumSino.Sí, m_TelemetriaError)
    
    ' Contrato baseline de indicadores (caracterización previa a optimización):
    ' - Null collection => cuenta como 0.
    ' - Totales Proyecto/Auditoría = suma de 6 buckets cada uno.
    ' - Filtro por usuario exige coincidencia exacta con usuario.Nombre.
    ' - Caption exacto: "Seguimiento X / Y".
    ' - m_ColSegsTareasProyectoIrregulares se consulta por compatibilidad pero NO suma.

    If m_IncluirProyecto Then
        If m_ModoNormalizado = "PROYECTO" Then
            Call Indicadores_TelemetriaEtapa(m_Telemetria, "proyecto-materialized-cache-start", m_TelemetriaError)
            Set m_ConteosProyectoCache = Cache_IndicadoresProyectoMaterializado_CargarConteos(m_Usuario, m_ProyectoCacheError)
            m_ProyectoCachePath = (m_ProyectoCacheError = "" And Not m_ConteosProyectoCache Is Nothing)
            Call Indicadores_TelemetriaCacheEstado(m_Telemetria, "proyecto-materialized-cache", m_ProyectoCachePath, m_TelemetriaError)
            If Not m_ProyectoCachePath Then
                Call Indicadores_TelemetriaEtapa(m_Telemetria, "proyecto-materialized-cache-sync-start", m_TelemetriaError)
                m_ProyectoSyncError = ""
                m_ProyectoSyncOk = Cache_IndicadoresProyectoMaterializado_Sincronizar(m_ProyectoSyncError)
                Call Indicadores_TelemetriaCacheEstado(m_Telemetria, "proyecto-materialized-cache-sync", m_ProyectoSyncOk, m_TelemetriaError)

                If m_ProyectoSyncOk Then
                    m_ProyectoCacheError = ""
                    Set m_ConteosProyectoCache = Cache_IndicadoresProyectoMaterializado_CargarConteos(m_Usuario, m_ProyectoCacheError)
                    m_ProyectoCachePath = (m_ProyectoCacheError = "" And Not m_ConteosProyectoCache Is Nothing)
                    Call Indicadores_TelemetriaCacheEstado(m_Telemetria, "proyecto-materialized-cache-after-sync", m_ProyectoCachePath, m_TelemetriaError)
                End If

                If Not m_ProyectoCachePath Then
                    Set m_ConteosProyectoCache = Nothing
                    Call Indicadores_TelemetriaCacheEstado(m_Telemetria, "proyecto-legacy-fallback", True, m_TelemetriaError)
                End If
            End If
        End If

        If Not m_ProyectoCachePath Then
            Call Indicadores_TelemetriaEtapa(m_Telemetria, "proyecto-cache-start", m_TelemetriaError)
            Set m_ColSegsTareasProyectoPteReplanificar = m_ObjEntorno.ColSegsTareasProyectoPteReplanificar
            Set m_ColSegsTareasProyectoIrregulares = m_ObjEntorno.ColSegsTareasProyecto
            Set m_ColSegsNCProyectoRegistradas = m_ObjEntorno.ColSegsNCProyectoRegistradas
            Set m_ColSegsNCProyectoAccionesSinTareas = m_ObjEntorno.ColSegsNCProyectoAccionesSinTareas
            Set m_ColSegsNCProyectoPteCE = m_ObjEntorno.ColSegsNCProyectoPteCE
            Set m_ColSegsNCProyectoCECaducada = m_ObjEntorno.ColSegsNCProyectoCECaducada
            Set m_ColSegsNCProyectoCENoConforme = m_ObjEntorno.ColSegsNCProyectoCENoConforme
            Call Indicadores_TelemetriaEtapa(m_Telemetria, "proyecto-cache-finish", m_TelemetriaError)
        End If
    End If

    If m_IncluirAuditoria Then
        If m_ModoNormalizado = "AUDITORIA" Then
            Call Indicadores_TelemetriaEtapa(m_Telemetria, "auditoria-materialized-cache-start", m_TelemetriaError)
            Set m_ConteosAuditoriaCache = Cache_IndicadoresAuditoriaMaterializado_CargarConteos(m_Usuario, m_AuditoriaCacheError)
            m_AuditoriaCachePath = (m_AuditoriaCacheError = "" And Not m_ConteosAuditoriaCache Is Nothing)
            Call Indicadores_TelemetriaCacheEstado(m_Telemetria, "auditoria-materialized-cache", m_AuditoriaCachePath, m_TelemetriaError)
            If Not m_AuditoriaCachePath Then
                Call Indicadores_TelemetriaEtapa(m_Telemetria, "auditoria-materialized-cache-sync-start", m_TelemetriaError)
                m_AuditoriaSyncError = ""
                m_AuditoriaSyncOk = Cache_IndicadoresAuditoriaMaterializado_Sincronizar(m_AuditoriaSyncError)
                Call Indicadores_TelemetriaCacheEstado(m_Telemetria, "auditoria-materialized-cache-sync", m_AuditoriaSyncOk, m_TelemetriaError)

                If m_AuditoriaSyncOk Then
                    m_AuditoriaCacheError = ""
                    Set m_ConteosAuditoriaCache = Cache_IndicadoresAuditoriaMaterializado_CargarConteos(m_Usuario, m_AuditoriaCacheError)
                    m_AuditoriaCachePath = (m_AuditoriaCacheError = "" And Not m_ConteosAuditoriaCache Is Nothing)
                    Call Indicadores_TelemetriaCacheEstado(m_Telemetria, "auditoria-materialized-cache-after-sync", m_AuditoriaCachePath, m_TelemetriaError)
                End If

                If Not m_AuditoriaCachePath Then
                    Set m_ConteosAuditoriaCache = Nothing
                    Call Indicadores_TelemetriaCacheEstado(m_Telemetria, "auditoria-legacy-fallback", True, m_TelemetriaError)
                End If
            End If
        End If

        If Not m_AuditoriaCachePath Then
            Call Indicadores_TelemetriaEtapa(m_Telemetria, "auditoria-cache-start", m_TelemetriaError)
            Set m_ColSegsTareasAuditoriaPteReplanificar = m_ObjEntorno.ColSegsTareasAuditoriaPteReplanificar
            Set m_ColSegsNCAuditoriaRegistradas = m_ObjEntorno.ColSegsNCAuditoriaRegistradas
            Set m_ColSegsNCAuditoriaAccionesSinTareas = m_ObjEntorno.ColSegsNCAuditoriaAccionesSinTareas
            Set m_ColSegsNCAuditoriaPteCE = m_ObjEntorno.ColSegsNCAuditoriaPteCE
            Set m_ColSegsNCAuditoriaCECaducada = m_ObjEntorno.ColSegsNCAuditoriaCECaducada
            Set m_ColSegsNCAuditoriaCENoConforme = m_ObjEntorno.ColSegsNCAuditoriaCENoConforme
            Call Indicadores_TelemetriaEtapa(m_Telemetria, "auditoria-cache-finish", m_TelemetriaError)
        End If
    End If

    Call Indicadores_TelemetriaEtapa(m_Telemetria, "calcular-start", m_TelemetriaError)
    Set m_Resultados = Indicadores_CalcularDesdeColecciones( _
                        m_Usuario, _
                        m_ColSegsTareasProyectoPteReplanificar, _
                        m_ColSegsTareasProyectoIrregulares, _
                        m_ColSegsNCProyectoRegistradas, _
                        m_ColSegsNCProyectoAccionesSinTareas, _
                        m_ColSegsNCProyectoPteCE, _
                        m_ColSegsNCProyectoCECaducada, _
                        m_ColSegsNCProyectoCENoConforme, _
                        m_ColSegsTareasAuditoriaPteReplanificar, _
                        m_ColSegsNCAuditoriaRegistradas, _
                        m_ColSegsNCAuditoriaAccionesSinTareas, _
                        m_ColSegsNCAuditoriaPteCE, _
                        m_ColSegsNCAuditoriaCECaducada, _
                        m_ColSegsNCAuditoriaCENoConforme, _
                        p_Modo, _
                        p_Error, _
                        m_ConteosProyectoCache, _
                        m_ConteosAuditoriaCache)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Call Indicadores_TelemetriaEtapa(m_Telemetria, "calcular-finish", m_TelemetriaError)
                               
    
    
    If m_IncluirProyecto And FormularioAbierto("Form0BDOpcionesParteProyectos") Then
        Call Indicadores_TelemetriaEtapa(m_Telemetria, "aplicar-proyecto", m_TelemetriaError)
        Forms("Form0BDOpcionesParteProyectos").Controls("lblSeguimientos").Caption = _
            Indicadores_FormatearCaption(CLng(m_Resultados("ProyectoUsuario")), CLng(m_Resultados("ProyectoTotal")))
    End If
    If m_IncluirAuditoria And FormularioAbierto("Form0BDOpcionesAuditorias") Then
        Forms("Form0BDOpcionesAuditorias").Controls("lblSeguimientos").Caption = _
            Indicadores_FormatearCaption(CLng(m_Resultados("AuditoriaUsuario")), CLng(m_Resultados("AuditoriaTotal")))
    End If
    If FormularioAbierto("FormNCProyectoSeguimiento") Then
        If Forms("FormNCProyectoSeguimiento").Controls("FrmDetalle").SourceObject = "FormNCProyectoSeguimientoNC" Then
            Form_FormNCProyectoSeguimientoNC.Filtrar
        ElseIf Forms("FormNCProyectoSeguimiento").Controls("FrmDetalle").SourceObject = "FormNCProyectoSeguimientoTareas" Then
            Form_FormNCProyectoSeguimientoTareas.Filtrar
        End If
    End If
    If FormularioAbierto("FormNCAuditoriaSeguimiento") Then
        If Forms("FormNCAuditoriaSeguimiento").Controls("FrmDetalle").SourceObject = "FormNCAuditoriaSeguimientoNC" Then
            Form_FormNCAuditoriaSeguimientoNC.Filtrar
        ElseIf Forms("FormNCAuditoriaSeguimiento").Controls("FrmDetalle").SourceObject = "FormNCAuditoriaSeguimientoTareas" Then
            Form_FormNCAuditoriaSeguimientoTareas.Filtrar
        End If
    End If
    m_TelemetriaResumen = Indicadores_TelemetriaResumen(m_Telemetria, m_TelemetriaError)
    If m_TelemetriaResumen <> "" Then Debug.Print "Indicadores telemetry: " & m_TelemetriaResumen
    AvanceCerrar
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método PintarIndicadores ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function Indicadores_MensajeAvance( _
                                    Optional ByVal p_Modo As String = "AMBOS", _
                                    Optional ByVal p_Etapa As String = "INICIO" _
                                    ) As String
    Dim m_Modo As String
    Dim m_Etapa As String

    m_Modo = UCase$(Trim$(p_Modo))
    m_Etapa = UCase$(Trim$(p_Etapa))
    If m_Modo = "" Then m_Modo = "AMBOS"
    If m_Etapa = "" Then m_Etapa = "INICIO"

    Select Case m_Etapa
        Case "INICIO"
            Select Case m_Modo
                Case "PROYECTO"
                    Indicadores_MensajeAvance = "Calculando indicadores de proyectos..."
                Case "AUDITORIA"
                    Indicadores_MensajeAvance = "Calculando indicadores de auditorías..."
                Case Else
                    Indicadores_MensajeAvance = "Calculando indicadores..."
            End Select
        Case "APLICAR"
            Select Case m_Modo
                Case "PROYECTO"
                    Indicadores_MensajeAvance = "Actualizando seguimiento de proyectos..."
                Case "AUDITORIA"
                    Indicadores_MensajeAvance = "Actualizando seguimiento de auditorías..."
                Case Else
                    Indicadores_MensajeAvance = "Actualizando seguimiento..."
            End Select
        Case Else
            Indicadores_MensajeAvance = "Calculando indicadores..."
    End Select
End Function

Public Function Indicadores_TelemetriaIniciar( _
                                    ByVal p_Modo As String, _
                                    Optional ByVal p_Habilitada As Boolean = True, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    Dim m_Telemetria As Scripting.Dictionary
    Dim m_Cache As Scripting.Dictionary
    Dim m_Modo As String

    On Error GoTo errores

    m_Modo = UCase$(Trim$(p_Modo))
    If m_Modo = "" Then m_Modo = "AMBOS"

    Set m_Telemetria = New Scripting.Dictionary
    m_Telemetria.CompareMode = TextCompare
    m_Telemetria("Habilitada") = p_Habilitada
    m_Telemetria("Modo") = m_Modo
    m_Telemetria("Inicio") = Timer
    Set m_Telemetria("Etapas") = New Collection

    Set m_Cache = New Scripting.Dictionary
    m_Cache.CompareMode = TextCompare
    Set m_Telemetria("Cache") = m_Cache

    Set Indicadores_TelemetriaIniciar = m_Telemetria
    Exit Function
errores:
    p_Error = "El método Indicadores_TelemetriaIniciar ha devuelto el error: " & vbNewLine & Err.Description
End Function

Public Function Indicadores_TelemetriaEtapa( _
                                    ByVal p_Telemetria As Scripting.Dictionary, _
                                    ByVal p_Etapa As String, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    On Error GoTo errores

    If p_Telemetria Is Nothing Then Exit Function
    If Not CBool(p_Telemetria("Habilitada")) Then Exit Function

    p_Telemetria("Etapas").Add Trim$(p_Etapa)
    Exit Function
errores:
    p_Error = "El método Indicadores_TelemetriaEtapa ha devuelto el error: " & vbNewLine & Err.Description
End Function

Public Function Indicadores_TelemetriaCacheEstado( _
                                    ByVal p_Telemetria As Scripting.Dictionary, _
                                    ByVal p_Etapa As String, _
                                    ByVal p_CacheHit As Boolean, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    Dim m_Cache As Scripting.Dictionary

    On Error GoTo errores

    If p_Telemetria Is Nothing Then Exit Function
    If Not CBool(p_Telemetria("Habilitada")) Then Exit Function

    Set m_Cache = p_Telemetria("Cache")
    If p_CacheHit Then
        m_Cache(Trim$(p_Etapa)) = "HIT"
    Else
        m_Cache(Trim$(p_Etapa)) = "MISS"
    End If
    Exit Function
errores:
    p_Error = "El método Indicadores_TelemetriaCacheEstado ha devuelto el error: " & vbNewLine & Err.Description
End Function

Public Function Indicadores_TelemetriaResumen( _
                                    ByVal p_Telemetria As Scripting.Dictionary, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    Dim m_Resumen As String
    Dim m_Etapa As Variant
    Dim m_Key As Variant
    Dim m_Cache As Scripting.Dictionary

    On Error GoTo errores

    If p_Telemetria Is Nothing Then Exit Function
    If Not CBool(p_Telemetria("Habilitada")) Then Exit Function

    m_Resumen = "modo=" & CStr(p_Telemetria("Modo")) & "; totalMs=" & _
                CStr(CLng((Timer - CSng(p_Telemetria("Inicio"))) * 1000))

    For Each m_Etapa In p_Telemetria("Etapas")
        m_Resumen = m_Resumen & "; " & CStr(m_Etapa)
    Next m_Etapa

    Set m_Cache = p_Telemetria("Cache")
    For Each m_Key In m_Cache.Keys
        m_Resumen = m_Resumen & "; " & CStr(m_Key) & "=" & CStr(m_Cache(m_Key))
    Next m_Key

    Indicadores_TelemetriaResumen = m_Resumen
    Exit Function
errores:
    p_Error = "El método Indicadores_TelemetriaResumen ha devuelto el error: " & vbNewLine & Err.Description
End Function

Public Function Indicadores_BuildDatos( _
                                    ByVal p_ColSegsTareasProyectoPteReplanificar As Scripting.Dictionary, _
                                    ByVal p_ColSegsTareasProyectoIrregulares As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCProyectoRegistradas As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCProyectoAccionesSinTareas As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCProyectoPteCE As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCProyectoCECaducada As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCProyectoCENoConforme As Scripting.Dictionary, _
                                    ByVal p_ColSegsTareasAuditoriaPteReplanificar As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCAuditoriaRegistradas As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCAuditoriaAccionesSinTareas As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCAuditoriaPteCE As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCAuditoriaCECaducada As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCAuditoriaCENoConforme As Scripting.Dictionary, _
                                    Optional ByVal p_Modo As String = "AMBOS", _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    Dim m_Datos As Scripting.Dictionary
    Dim m_IncluirProyecto As Boolean
    Dim m_IncluirAuditoria As Boolean
    On Error GoTo errores

    m_IncluirProyecto = (UCase$(Trim$(p_Modo)) <> "AUDITORIA")
    m_IncluirAuditoria = (UCase$(Trim$(p_Modo)) <> "PROYECTO")

    Set m_Datos = New Scripting.Dictionary
    m_Datos.CompareMode = TextCompare

    If m_IncluirProyecto Then
        m_Datos.Add "ProyectoTareasPteReplanificar", p_ColSegsTareasProyectoPteReplanificar
        m_Datos.Add "ProyectoTareasIrregulares", p_ColSegsTareasProyectoIrregulares
        m_Datos.Add "ProyectoNCRegistradas", p_ColSegsNCProyectoRegistradas
        m_Datos.Add "ProyectoNCAccionesSinTareas", p_ColSegsNCProyectoAccionesSinTareas
        m_Datos.Add "ProyectoNCPteCE", p_ColSegsNCProyectoPteCE
        m_Datos.Add "ProyectoNCCECaducada", p_ColSegsNCProyectoCECaducada
        m_Datos.Add "ProyectoNCCENoConforme", p_ColSegsNCProyectoCENoConforme
    End If

    If m_IncluirAuditoria Then
        m_Datos.Add "AuditoriaTareasPteReplanificar", p_ColSegsTareasAuditoriaPteReplanificar
        m_Datos.Add "AuditoriaNCRegistradas", p_ColSegsNCAuditoriaRegistradas
        m_Datos.Add "AuditoriaNCAccionesSinTareas", p_ColSegsNCAuditoriaAccionesSinTareas
        m_Datos.Add "AuditoriaNCPteCE", p_ColSegsNCAuditoriaPteCE
        m_Datos.Add "AuditoriaNCCECaducada", p_ColSegsNCAuditoriaCECaducada
        m_Datos.Add "AuditoriaNCCENoConforme", p_ColSegsNCAuditoriaCENoConforme
    End If

    Set Indicadores_BuildDatos = m_Datos
    Exit Function
errores:
    p_Error = "El método Indicadores_BuildDatos ha devuelto el error: " & vbNewLine & Err.Description
End Function

Public Function Indicadores_CalcularDesdeColecciones( _
                                    ByVal p_Usuario As usuario, _
                                    ByVal p_ColSegsTareasProyectoPteReplanificar As Scripting.Dictionary, _
                                    ByVal p_ColSegsTareasProyectoIrregulares As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCProyectoRegistradas As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCProyectoAccionesSinTareas As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCProyectoPteCE As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCProyectoCECaducada As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCProyectoCENoConforme As Scripting.Dictionary, _
                                    ByVal p_ColSegsTareasAuditoriaPteReplanificar As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCAuditoriaRegistradas As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCAuditoriaAccionesSinTareas As Scripting.Dictionary, _
                                    ByVal p_ColSegsNCAuditoriaPteCE As Scripting.Dictionary, _
                                     ByVal p_ColSegsNCAuditoriaCECaducada As Scripting.Dictionary, _
                                     ByVal p_ColSegsNCAuditoriaCENoConforme As Scripting.Dictionary, _
                                     Optional ByVal p_Modo As String = "AMBOS", _
                                     Optional ByRef p_Error As String, _
                                     Optional ByVal p_ConteosProyectoRapidos As Scripting.Dictionary, _
                                     Optional ByVal p_ConteosAuditoriaRapidos As Scripting.Dictionary _
                                      ) As Scripting.Dictionary
    Dim m_Datos As Scripting.Dictionary
    On Error GoTo errores

    If UCase$(Trim$(p_Modo)) = "PROYECTO" Then
        If Not p_ConteosProyectoRapidos Is Nothing Then
            Set Indicadores_CalcularDesdeColecciones = Indicadores_CalcularProyectoDesdeConteos(p_ConteosProyectoRapidos, p_Error)
            Exit Function
        End If
    End If

    If UCase$(Trim$(p_Modo)) = "AUDITORIA" Then
        If Not p_ConteosAuditoriaRapidos Is Nothing Then
            Set Indicadores_CalcularDesdeColecciones = Indicadores_CalcularAuditoriaDesdeConteos(p_ConteosAuditoriaRapidos, p_Error)
            Exit Function
        End If
    End If

    Set m_Datos = Indicadores_BuildDatos( _
                    p_ColSegsTareasProyectoPteReplanificar, _
                    p_ColSegsTareasProyectoIrregulares, _
                    p_ColSegsNCProyectoRegistradas, _
                    p_ColSegsNCProyectoAccionesSinTareas, _
                    p_ColSegsNCProyectoPteCE, _
                    p_ColSegsNCProyectoCECaducada, _
                    p_ColSegsNCProyectoCENoConforme, _
                    p_ColSegsTareasAuditoriaPteReplanificar, _
                    p_ColSegsNCAuditoriaRegistradas, _
                    p_ColSegsNCAuditoriaAccionesSinTareas, _
                    p_ColSegsNCAuditoriaPteCE, _
                    p_ColSegsNCAuditoriaCECaducada, _
                    p_ColSegsNCAuditoriaCENoConforme, _
                    p_Modo, _
                    p_Error)
    If p_Error <> "" Then Err.Raise 1000

    Set Indicadores_CalcularDesdeColecciones = Indicadores_Calcular(m_Datos, p_Usuario, p_Error, p_Modo)
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Indicadores_CalcularDesdeColecciones ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function Indicadores_Calcular( _
                                    ByVal p_Datos As Scripting.Dictionary, _
                                    ByVal p_Usuario As usuario, _
                                    Optional ByRef p_Error As String, _
                                    Optional ByVal p_Modo As String = "AMBOS" _
                                    ) As Scripting.Dictionary
    Dim m_Resultados As Scripting.Dictionary
    Dim m_ProyectoUsuario As Long
    Dim m_AuditoriaUsuario As Long
    Dim m_IncluirProyecto As Boolean
    Dim m_IncluirAuditoria As Boolean
    On Error GoTo errores

    m_IncluirProyecto = (UCase$(Trim$(p_Modo)) <> "AUDITORIA")
    m_IncluirAuditoria = (UCase$(Trim$(p_Modo)) <> "PROYECTO")

    Set m_Resultados = New Scripting.Dictionary
    m_Resultados.CompareMode = TextCompare

    If m_IncluirProyecto Then
        m_Resultados("ProyectoTotal") = Indicadores_CountDictionary(p_Datos, "ProyectoTareasPteReplanificar") + _
                                        Indicadores_CountDictionary(p_Datos, "ProyectoNCAccionesSinTareas") + _
                                        Indicadores_CountDictionary(p_Datos, "ProyectoNCRegistradas") + _
                                        Indicadores_CountDictionary(p_Datos, "ProyectoNCPteCE") + _
                                        Indicadores_CountDictionary(p_Datos, "ProyectoNCCECaducada") + _
                                        Indicadores_CountDictionary(p_Datos, "ProyectoNCCENoConforme")

        m_ProyectoUsuario = Indicadores_CountUsuario(Indicadores_GetDictionary(p_Datos, "ProyectoTareasPteReplanificar"), p_Usuario, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        m_ProyectoUsuario = m_ProyectoUsuario + Indicadores_CountUsuario(Indicadores_GetDictionary(p_Datos, "ProyectoTareasIrregulares"), p_Usuario, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        m_ProyectoUsuario = m_ProyectoUsuario + Indicadores_CountUsuario(Indicadores_GetDictionary(p_Datos, "ProyectoNCRegistradas"), p_Usuario, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        m_ProyectoUsuario = m_ProyectoUsuario + Indicadores_CountUsuario(Indicadores_GetDictionary(p_Datos, "ProyectoNCAccionesSinTareas"), p_Usuario, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        m_ProyectoUsuario = m_ProyectoUsuario + Indicadores_CountUsuario(Indicadores_GetDictionary(p_Datos, "ProyectoNCPteCE"), p_Usuario, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        m_ProyectoUsuario = m_ProyectoUsuario + Indicadores_CountUsuario(Indicadores_GetDictionary(p_Datos, "ProyectoNCCECaducada"), p_Usuario, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        m_ProyectoUsuario = m_ProyectoUsuario + Indicadores_CountUsuario(Indicadores_GetDictionary(p_Datos, "ProyectoNCCENoConforme"), p_Usuario, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        m_Resultados("ProyectoUsuario") = m_ProyectoUsuario
    End If

    If m_IncluirAuditoria Then
        m_Resultados("AuditoriaTotal") = Indicadores_CountDictionary(p_Datos, "AuditoriaTareasPteReplanificar") + _
                                         Indicadores_CountDictionary(p_Datos, "AuditoriaNCAccionesSinTareas") + _
                                         Indicadores_CountDictionary(p_Datos, "AuditoriaNCRegistradas") + _
                                         Indicadores_CountDictionary(p_Datos, "AuditoriaNCPteCE") + _
                                         Indicadores_CountDictionary(p_Datos, "AuditoriaNCCECaducada") + _
                                         Indicadores_CountDictionary(p_Datos, "AuditoriaNCCENoConforme")

        m_AuditoriaUsuario = Indicadores_CountUsuario(Indicadores_GetDictionary(p_Datos, "AuditoriaTareasPteReplanificar"), p_Usuario, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        m_AuditoriaUsuario = m_AuditoriaUsuario + Indicadores_CountUsuario(Indicadores_GetDictionary(p_Datos, "AuditoriaNCRegistradas"), p_Usuario, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        m_AuditoriaUsuario = m_AuditoriaUsuario + Indicadores_CountUsuario(Indicadores_GetDictionary(p_Datos, "AuditoriaNCAccionesSinTareas"), p_Usuario, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        m_AuditoriaUsuario = m_AuditoriaUsuario + Indicadores_CountUsuario(Indicadores_GetDictionary(p_Datos, "AuditoriaNCPteCE"), p_Usuario, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        m_AuditoriaUsuario = m_AuditoriaUsuario + Indicadores_CountUsuario(Indicadores_GetDictionary(p_Datos, "AuditoriaNCCECaducada"), p_Usuario, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        m_AuditoriaUsuario = m_AuditoriaUsuario + Indicadores_CountUsuario(Indicadores_GetDictionary(p_Datos, "AuditoriaNCCENoConforme"), p_Usuario, p_Error)
        If p_Error <> "" Then Err.Raise 1000
        m_Resultados("AuditoriaUsuario") = m_AuditoriaUsuario
    End If

    Set Indicadores_Calcular = m_Resultados
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Indicadores_Calcular ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function Indicadores_FormatearCaption(ByVal p_Usuario As Long, ByVal p_Total As Long) As String
    Indicadores_FormatearCaption = "Seguimiento " & CStr(p_Usuario) & " / " & CStr(p_Total)
End Function

Public Function Indicadores_CalcularProyectoDesdeConteos( _
                                    ByVal p_Conteos As Scripting.Dictionary, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    Dim m_Resultados As Scripting.Dictionary
    On Error GoTo errores

    p_Error = ""

    Set m_Resultados = New Scripting.Dictionary
    m_Resultados.CompareMode = TextCompare

    m_Resultados("ProyectoTotal") = Indicadores_ConteoLong(p_Conteos, "ProyectoTareasPteReplanificarTotal") + _
                                     Indicadores_ConteoLong(p_Conteos, "ProyectoNCAccionesSinTareasTotal") + _
                                     Indicadores_ConteoLong(p_Conteos, "ProyectoNCRegistradasTotal") + _
                                     Indicadores_ConteoLong(p_Conteos, "ProyectoNCPteCETotal") + _
                                     Indicadores_ConteoLong(p_Conteos, "ProyectoNCCECaducadaTotal") + _
                                     Indicadores_ConteoLong(p_Conteos, "ProyectoNCCENoConformeTotal")

    m_Resultados("ProyectoUsuario") = Indicadores_ConteoLong(p_Conteos, "ProyectoTareasPteReplanificarUsuario") + _
                                       Indicadores_ConteoLong(p_Conteos, "ProyectoTareasIrregularesUsuario") + _
                                       Indicadores_ConteoLong(p_Conteos, "ProyectoNCRegistradasUsuario") + _
                                       Indicadores_ConteoLong(p_Conteos, "ProyectoNCAccionesSinTareasUsuario") + _
                                       Indicadores_ConteoLong(p_Conteos, "ProyectoNCPteCEUsuario") + _
                                       Indicadores_ConteoLong(p_Conteos, "ProyectoNCCECaducadaUsuario") + _
                                       Indicadores_ConteoLong(p_Conteos, "ProyectoNCCENoConformeUsuario")

    Set Indicadores_CalcularProyectoDesdeConteos = m_Resultados
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Indicadores_CalcularProyectoDesdeConteos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function Indicadores_CalcularAuditoriaDesdeConteos( _
                                    ByVal p_Conteos As Scripting.Dictionary, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    Dim m_Resultados As Scripting.Dictionary
    On Error GoTo errores

    p_Error = ""

    Set m_Resultados = New Scripting.Dictionary
    m_Resultados.CompareMode = TextCompare

    m_Resultados("AuditoriaTotal") = Indicadores_ConteoLong(p_Conteos, "AuditoriaTareasPteReplanificarTotal") + _
                                      Indicadores_ConteoLong(p_Conteos, "AuditoriaNCAccionesSinTareasTotal") + _
                                      Indicadores_ConteoLong(p_Conteos, "AuditoriaNCRegistradasTotal") + _
                                      Indicadores_ConteoLong(p_Conteos, "AuditoriaNCPteCETotal") + _
                                      Indicadores_ConteoLong(p_Conteos, "AuditoriaNCCECaducadaTotal") + _
                                      Indicadores_ConteoLong(p_Conteos, "AuditoriaNCCENoConformeTotal")

    m_Resultados("AuditoriaUsuario") = Indicadores_ConteoLong(p_Conteos, "AuditoriaTareasPteReplanificarUsuario") + _
                                        Indicadores_ConteoLong(p_Conteos, "AuditoriaNCRegistradasUsuario") + _
                                        Indicadores_ConteoLong(p_Conteos, "AuditoriaNCAccionesSinTareasUsuario") + _
                                        Indicadores_ConteoLong(p_Conteos, "AuditoriaNCPteCEUsuario") + _
                                        Indicadores_ConteoLong(p_Conteos, "AuditoriaNCCECaducadaUsuario") + _
                                        Indicadores_ConteoLong(p_Conteos, "AuditoriaNCCENoConformeUsuario")

    Set Indicadores_CalcularAuditoriaDesdeConteos = m_Resultados
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Indicadores_CalcularAuditoriaDesdeConteos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function Indicadores_ObtenerConteosProyectoRapidos( _
                                    ByVal p_Usuario As usuario, _
                                    Optional p_Db As DAO.Database, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    Dim m_Db As DAO.Database
    Dim m_Conteos As Scripting.Dictionary
    Dim m_UsuarioSql As String
    Dim m_BaseTareas As String
    Dim m_BaseNCRegistradas As String
    Dim m_BaseNCSinTareas As String
    Dim m_BaseNCConAR As String
    On Error GoTo errores

    p_Error = ""
    If p_Usuario Is Nothing Then
        p_Error = "Indicadores_ObtenerConteosProyectoRapidos requiere usuario."
        Err.Raise 1000
    End If

    If p_Db Is Nothing Then
        Set m_Db = getdb(p_Error)
        If p_Error <> "" Then Err.Raise 1000
    Else
        Set m_Db = p_Db
    End If
    If m_Db Is Nothing Then
        p_Error = "Indicadores_ObtenerConteosProyectoRapidos no pudo resolver getdb()."
        Err.Raise 1000
    End If

    m_UsuarioSql = Indicadores_SqlTexto(p_Usuario.Nombre)
    Set m_Conteos = New Scripting.Dictionary
    m_Conteos.CompareMode = TextCompare

    m_BaseTareas = "FROM (TbNoConformidades INNER JOIN (TbNCAccionCorrectivas " & _
                   "INNER JOIN TbNCAccionesRealizadas ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva) " & _
                   "ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad) "
    m_BaseNCRegistradas = "FROM (TbNoConformidades INNER JOIN TbExpedientes " & _
                         "ON TbNoConformidades.IDExpediente = TbExpedientes.IDExpediente) " & _
                         "LEFT JOIN TbNCAccionCorrectivas ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad "
    m_BaseNCSinTareas = "FROM ((TbNoConformidades INNER JOIN TbExpedientes " & _
                       "ON TbNoConformidades.IDExpediente = TbExpedientes.IDExpediente) " & _
                       "INNER JOIN TbNCAccionCorrectivas ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad) " & _
                       "LEFT JOIN TbNCAccionesRealizadas ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva "
    m_BaseNCConAR = "FROM ((TbNoConformidades INNER JOIN TbExpedientes " & _
                    "ON TbNoConformidades.IDExpediente = TbExpedientes.IDExpediente) " & _
                    "INNER JOIN TbNCAccionCorrectivas ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad) " & _
                    "INNER JOIN TbNCAccionesRealizadas ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva "

    Call Indicadores_AgregarConteo(m_Conteos, "ProyectoTareasPteReplanificarTotal", m_Db, "TbNCAccionesRealizadas.IDAccionRealizada", _
        m_BaseTareas & "WHERE Not TbNCAccionesRealizadas.FechaInicio Is Null AND TbNCAccionesRealizadas.FechaFinPrevista<=Date() AND TbNCAccionesRealizadas.FechaFinReal Is Null", p_Error)
    Call Indicadores_AgregarConteo(m_Conteos, "ProyectoTareasPteReplanificarUsuario", m_Db, "TbNCAccionesRealizadas.IDAccionRealizada", _
        m_BaseTareas & "WHERE Not TbNCAccionesRealizadas.FechaInicio Is Null AND TbNCAccionesRealizadas.FechaFinPrevista<=Date() AND TbNCAccionesRealizadas.FechaFinReal Is Null AND TbNoConformidades.RESPONSABLECALIDAD=" & m_UsuarioSql, p_Error)
    Call Indicadores_AgregarConteo(m_Conteos, "ProyectoTareasIrregularesUsuario", m_Db, "TbNCAccionesRealizadas.IDAccionRealizada", _
        m_BaseTareas & "WHERE TbNoConformidades.RESPONSABLECALIDAD=" & m_UsuarioSql, p_Error)

    Call Indicadores_AgregarConteo(m_Conteos, "ProyectoNCRegistradasTotal", m_Db, "TbNoConformidades.IDNoConformidad", _
        m_BaseNCRegistradas & "WHERE TbNCAccionCorrectivas.IDAccionCorrectiva Is Null AND TbNoConformidades.Borrado=False", p_Error)
    Call Indicadores_AgregarConteo(m_Conteos, "ProyectoNCRegistradasUsuario", m_Db, "TbNoConformidades.IDNoConformidad", _
        m_BaseNCRegistradas & "WHERE TbNCAccionCorrectivas.IDAccionCorrectiva Is Null AND TbNoConformidades.Borrado=False AND TbNoConformidades.RESPONSABLECALIDAD=" & m_UsuarioSql, p_Error)
    Call Indicadores_AgregarConteo(m_Conteos, "ProyectoNCAccionesSinTareasTotal", m_Db, "TbNoConformidades.IDNoConformidad", _
        m_BaseNCSinTareas & "WHERE TbNCAccionesRealizadas.IDAccionRealizada Is Null AND TbNoConformidades.FECHACIERRE Is Null", p_Error)
    Call Indicadores_AgregarConteo(m_Conteos, "ProyectoNCAccionesSinTareasUsuario", m_Db, "TbNoConformidades.IDNoConformidad", _
        m_BaseNCSinTareas & "WHERE TbNCAccionesRealizadas.IDAccionRealizada Is Null AND TbNoConformidades.FECHACIERRE Is Null AND TbNoConformidades.RESPONSABLECALIDAD=" & m_UsuarioSql, p_Error)

    Call Indicadores_AgregarConteo(m_Conteos, "ProyectoNCPteCETotal", m_Db, "TbNoConformidades.IDNoConformidad", _
        m_BaseNCConAR & "WHERE Not TbNCAccionesRealizadas.FechaFinReal Is Null AND TbNoConformidades.FechaControlEficacia Is Null AND Not TbNoConformidades.FechaPrevistaControlEficacia Is Null", p_Error)
    Call Indicadores_AgregarConteo(m_Conteos, "ProyectoNCPteCEUsuario", m_Db, "TbNoConformidades.IDNoConformidad", _
        m_BaseNCConAR & "WHERE Not TbNCAccionesRealizadas.FechaFinReal Is Null AND TbNoConformidades.FechaControlEficacia Is Null AND Not TbNoConformidades.FechaPrevistaControlEficacia Is Null AND TbNoConformidades.RESPONSABLECALIDAD=" & m_UsuarioSql, p_Error)
    Call Indicadores_AgregarConteo(m_Conteos, "ProyectoNCCECaducadaTotal", m_Db, "TbNoConformidades.IDNoConformidad", _
        m_BaseNCConAR & "WHERE Not TbNCAccionesRealizadas.FechaFinReal Is Null AND TbNoConformidades.FechaControlEficacia Is Null AND TbNoConformidades.FechaPrevistaControlEficacia<=Date()", p_Error)
    Call Indicadores_AgregarConteo(m_Conteos, "ProyectoNCCECaducadaUsuario", m_Db, "TbNoConformidades.IDNoConformidad", _
        m_BaseNCConAR & "WHERE Not TbNCAccionesRealizadas.FechaFinReal Is Null AND TbNoConformidades.FechaControlEficacia Is Null AND TbNoConformidades.FechaPrevistaControlEficacia<=Date() AND TbNoConformidades.RESPONSABLECALIDAD=" & m_UsuarioSql, p_Error)
    Call Indicadores_AgregarConteo(m_Conteos, "ProyectoNCCENoConformeTotal", m_Db, "TbNoConformidades.IDNoConformidad", _
        m_BaseNCConAR & "WHERE TbNoConformidades.ConformeControlEficacia='No' AND Not TbNCAccionesRealizadas.FechaFinReal Is Null", p_Error)
    Call Indicadores_AgregarConteo(m_Conteos, "ProyectoNCCENoConformeUsuario", m_Db, "TbNoConformidades.IDNoConformidad", _
        m_BaseNCConAR & "WHERE TbNoConformidades.ConformeControlEficacia='No' AND Not TbNCAccionesRealizadas.FechaFinReal Is Null AND TbNoConformidades.RESPONSABLECALIDAD=" & m_UsuarioSql, p_Error)
    If p_Error <> "" Then Err.Raise 1000

    Set Indicadores_ObtenerConteosProyectoRapidos = m_Conteos
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Indicadores_ObtenerConteosProyectoRapidos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Function Indicadores_GetDictionary(ByVal p_Datos As Scripting.Dictionary, ByVal p_Key As String) As Scripting.Dictionary
    If p_Datos Is Nothing Then Exit Function
    If Not p_Datos.Exists(p_Key) Then Exit Function
    If IsObject(p_Datos(p_Key)) Then
        Set Indicadores_GetDictionary = p_Datos(p_Key)
    End If
End Function

Private Function Indicadores_CountDictionary(ByVal p_Datos As Scripting.Dictionary, ByVal p_Key As String) As Long
    Dim m_Col As Scripting.Dictionary
    Set m_Col = Indicadores_GetDictionary(p_Datos, p_Key)
    If Not m_Col Is Nothing Then
        Indicadores_CountDictionary = m_Col.count
    End If
End Function

Private Function Indicadores_ConteoLong(ByVal p_Conteos As Scripting.Dictionary, ByVal p_Key As String) As Long
    If p_Conteos Is Nothing Then Exit Function
    If Not p_Conteos.Exists(p_Key) Then Exit Function
    If IsNumeric(p_Conteos(p_Key)) Then Indicadores_ConteoLong = CLng(p_Conteos(p_Key))
End Function

Private Sub Indicadores_AgregarConteo( _
                                    ByVal p_Conteos As Scripting.Dictionary, _
                                    ByVal p_Key As String, _
                                    ByVal p_Db As DAO.Database, _
                                    ByVal p_IdExpression As String, _
                                    ByVal p_FromWhereSql As String, _
                                    ByRef p_Error As String _
                                    )
    If p_Error <> "" Then Exit Sub
    p_Conteos(p_Key) = Indicadores_CountDistinct(p_Db, p_IdExpression, p_FromWhereSql, p_Error)
End Sub

Private Function Indicadores_CountDistinct( _
                                    ByVal p_Db As DAO.Database, _
                                    ByVal p_IdExpression As String, _
                                    ByVal p_FromWhereSql As String, _
                                    ByRef p_Error As String _
                                    ) As Long
    Dim m_Rs As DAO.Recordset
    Dim m_SQL As String
    On Error GoTo errores

    m_SQL = "SELECT COUNT(*) AS Total FROM (SELECT DISTINCT " & p_IdExpression & " AS IdConteo " & p_FromWhereSql & ") AS Q"
    Set m_Rs = p_Db.OpenRecordset(m_SQL, dbOpenSnapshot)
    If Not m_Rs.EOF Then
        Indicadores_CountDistinct = CLng(Nz(m_Rs.Fields("Total").Value, 0))
    End If

salir:
    If Not m_Rs Is Nothing Then
        m_Rs.Close
        Set m_Rs = Nothing
    End If
    Exit Function
errores:
    p_Error = "El método Indicadores_CountDistinct ha devuelto el error: " & vbNewLine & Err.Description
    Resume salir
End Function

Private Function Indicadores_SqlTexto(ByVal p_Valor As String) As String
    Indicadores_SqlTexto = "'" & Replace(Nz(p_Valor, ""), "'", "''") & "'"
End Function

Private Function Indicadores_CountUsuario( _
                                        ByVal p_ColTotal As Scripting.Dictionary, _
                                        ByVal p_Usuario As usuario, _
                                        Optional ByRef p_Error As String _
                                        ) As Long
    Dim m_Col As Scripting.Dictionary
    Set m_Col = getColSeguimientoPorUsuario(p_ColTotal, p_Usuario, p_Error)
    If p_Error <> "" Then Exit Function
    If Not m_Col Is Nothing Then
        Indicadores_CountUsuario = m_Col.count
    End If
End Function
Public Function ResetearColTareas( _
                                    Optional ByRef p_Error As String _
                                    ) As String

    
    
    On Error GoTo errores
    ' Invalida cache global de indicadores antes de resetear propiedades de Entorno
    Cache_InvalidarTodo p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    With m_ObjEntorno
        Set .ColSegsTareasProyecto = Nothing
        Set .ColSegsTareasProyectoActivas = Nothing
        Set .ColSegsTareasProyectoPteReplanificar = Nothing
        
        Set .ColSegsNCProyectoRegistradas = Nothing
        Set .ColSegsNCProyectoAccionesSinTareas = Nothing
        Set .ColSegsNCProyectoPteCE = Nothing
        Set .ColSegsNCProyectoCECaducada = Nothing
        Set .ColSegsNCProyectoCENoConforme = Nothing
        Set .ColSegsNCProyectoTotales = Nothing
        
        Set .ColSegsTareasAuditoriaActivas = Nothing
        Set .ColSegsTareasAuditoriaPteReplanificar = Nothing
        
        Set .ColSegsNCAuditoriaRegistradas = Nothing
        Set .ColSegsNCAuditoriaAccionesSinTareas = Nothing
        Set .ColSegsNCAuditoriaPteCE = Nothing
        Set .ColSegsNCAuditoriaCECaducada = Nothing
        Set .ColSegsNCAuditoriaCENoConforme = Nothing
        Set .ColSegsNCAuditoriaTotales = Nothing
    End With
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ResetearColTareas ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getColSeguimientoPorUsuario( _
                                            p_ColTotal As Scripting.Dictionary, _
                                            p_Usuario As usuario, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary

    Dim m_ID As Variant
    Dim m_Objeto As Object
    Dim m_IDResuelto As String
    Dim m_ResponsableObjeto As String
    
    On Error GoTo errores
    
    If p_ColTotal Is Nothing Then
        Exit Function
    End If
    For Each m_ID In p_ColTotal
        Set m_Objeto = p_ColTotal(m_ID)
        If TypeOf m_Objeto Is SegTareasProyecto Then
            m_IDResuelto = m_Objeto.IDAccionRealizada
            m_ResponsableObjeto = m_Objeto.RespCalidad
            If m_ResponsableObjeto <> p_Usuario.Nombre Then
                GoTo siguiente
            End If
        ElseIf TypeOf m_Objeto Is SegNCProyecto Then
            m_IDResuelto = m_Objeto.IDNoConformidad
            m_ResponsableObjeto = m_Objeto.NombreCalidad
            If m_ResponsableObjeto <> p_Usuario.Nombre Then
                GoTo siguiente
            End If
        ElseIf TypeOf m_Objeto Is SegTareasAuditoria Then
            m_IDResuelto = m_Objeto.IDAccionRealizada
            m_ResponsableObjeto = m_Objeto.Responsable
            If m_ResponsableObjeto <> p_Usuario.Nombre Then
                GoTo siguiente
            End If
        ElseIf TypeOf m_Objeto Is SegNCAuditoria Then
            m_IDResuelto = m_Objeto.id
            m_ResponsableObjeto = m_Objeto.Responsable
            If m_ResponsableObjeto <> p_Usuario.Nombre Then
                GoTo siguiente
            End If
        End If
        If getColSeguimientoPorUsuario Is Nothing Then
            Set getColSeguimientoPorUsuario = New Scripting.Dictionary
            getColSeguimientoPorUsuario.CompareMode = TextCompare
        End If
        If Not getColSeguimientoPorUsuario.Exists(CStr(m_IDResuelto)) Then
            getColSeguimientoPorUsuario.Add CStr(m_IDResuelto), m_Objeto
        End If
siguiente:
        Set m_Objeto = Nothing
    Next
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColSeguimientoPorUsuario ha devuelto el error: " & Err.Description
    End If
End Function

Public Function RellenarBordeCamposObligatorios( _
                                                p_Form As Form, _
                                                Optional ByRef p_Error As String _
                                                ) As String
    
    
    Dim ctl As Control
    
    On Error GoTo errores
    
    p_Error = ""
    
    For Each ctl In p_Form.Controls
        'If ctl.Name = "MotivoNoAccionCorrectiva" Then Stop
        If InStr(Nz(ctl.Tag, ""), "OBLIGATORIO") <> 0 Then
            If Nz(ctl.Value, "") = "" Then
                EstablecerControlCombo ctl, EnumSino.No
                
            Else
                EstablecerControlCombo ctl, EnumSino.Sí
                
            End If
        Else
            If InStr(Nz(ctl.Tag, ""), "DATO") <> 0 Then
                EstablecerControlCombo ctl, EnumSino.Sí
            End If
        End If
    Next
    RellenaBordeListaSinSeleccion p_Form, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If p_Form.Name = "FormNCProyectoGeneral" Then
        Set ctl = p_Form.PalabraClave
        If Nz(p_Form.IDExpediente, "") = "" Then
            
            EstablecerControlCombo ctl, EnumSino.No
            
        Else
            EstablecerControlCombo ctl, EnumSino.Sí
        End If
        
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarBordeCamposObligatorios ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Private Function RellenaBordeListaSinSeleccion( _
                                                p_Form As Form, _
                                                Optional ByRef p_Error As String _
                                                ) As String
    
    
    Dim lst As ListBox
    Dim ctl As Control
    Dim m_AlgunElementoSeleccionado As EnumSino
    On Error GoTo errores
    
    p_Error = ""
    
    
    
    For Each ctl In p_Form.Controls
        If ctl.ControlType = AcControlType.acListBox Then
            If InStr(Nz(ctl.Tag, ""), "OBLIGATORIO") <> 0 Then
                Set lst = p_Form.Controls(ctl.Name)
                
                If Nz(lst.Value, "") <> "" Then
                    EstablecerControlCombo ctl, EnumSino.No
                Else
                    EstablecerControlCombo ctl, EnumSino.Sí
                End If
                
                
                
            End If
        End If
siguiente:
    Next
   
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenaBordeListaSinSeleccion ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function EstablecerControlCombo( _
                                        ctl As Control, _
                                        p_Relleno As EnumSino, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    
    
    
    
    On Error GoTo errores
    
    p_Error = ""
    If p_Relleno = EnumSino.Sí Then
        ctl.BorderColor = COLOR_BORDE_CAMPO_RELLENO
        ctl.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
    ElseIf p_Relleno = EnumSino.No Then
        ctl.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
        ctl.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
    End If
   
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerControlCombo ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Public Function FormatoCorrectoURL( _
                                    p_URL As String _
                                    ) As EnumSino
   
    'No borrar es para la consulta 1,12
    Dim dato
    Dim m_trozo As String
    
    On Error Resume Next
    If InStr(1, p_URL, ":\") <> 0 Then
        dato = Split(p_URL, ":\")
        m_trozo = dato(1)
        If InStr(1, m_trozo, "\\") <> 0 Then
            FormatoCorrectoURL = EnumSino.No
            Exit Function
        End If
        FormatoCorrectoURL = EnumSino.Sí
        Exit Function
    End If
    If InStr(1, p_URL, "\\") = 0 Then
        FormatoCorrectoURL = EnumSino.No
        Exit Function
    End If
    dato = Split(p_URL, "\\")
    If UBound(dato) > 1 Then
        FormatoCorrectoURL = EnumSino.No
        Exit Function
    End If
    FormatoCorrectoURL = EnumSino.Sí
    
    
    Exit Function

    
    
End Function


Public Function FormularioAbierto(ByVal Nombre As String) As Boolean
    
    Dim strEstado As String
    On Error GoTo errores
    strEstado = SysCmd(acSysCmdGetObjectState, acForm, Nombre)
    If strEstado = "0" Then
        FormularioAbierto = False
    Else
        FormularioAbierto = True
    End If
    Exit Function
errores:
    FormularioAbierto = False

End Function


Public Sub Ajustar(frmFormulario As Form)

    Dim i As Integer

    On Error GoTo Ajustar_TratamientoErrores

    ' ajusto el ancho del formulario teniendo en cuenta si tiene o no selector de registros
    If Not frmFormulario.RecordSelectors Then
        frmFormulario.InsideWidth = frmFormulario.Width
    Else
        frmFormulario.InsideWidth = frmFormulario.Width + 250
    End If

    ' si se abre en vista formulario simple
    If frmFormulario.DefaultView = 0 Then
        'ajusto el alto incluyendo las distintas secciones, encabezado, pie, grupos...
        ' como no sé el número de secciones del formulario, me salgo al producirse un error
        frmFormulario.InsideHeight = 0
        For i = 0 To 100
            frmFormulario.InsideHeight = frmFormulario.InsideHeight + frmFormulario.Section(i).Height
        Next
    End If

Ajustar_Salir:
   DoCmd.Restore
   On Error GoTo 0
   Exit Sub
   
Ajustar_TratamientoErrores:
   If Not Err = 2462 Then  ' "El número de sección que introdujo no es válido."
      MsgBox "Error " & Err.Number & " en proc.: Ajustar de Módulo: Módulo1 (" & Err.Description & ")"
   End If
   Resume Ajustar_Salir
End Sub

    
Function FicheroAbierto(filename As String)
    Dim filenum As Integer, errnum As Integer

    On Error Resume Next   ' Turn error checking off.
    filenum = FreeFile()   ' Get a free file number.
    ' Attempt to open the file and lock it.
    Open filename For Input Lock Read As #filenum
    Close filenum          ' Close the file.
    errnum = Err           ' Save the error number that occurred.
    On Error GoTo 0        ' Turn error checking back on.

    ' Check to see which error occurred.
    Select Case errnum

        ' No error occurred.
        ' File is NOT already open by another user.
        Case 0
         FicheroAbierto = False

        ' Error number for "Permission Denied."
        ' File is already opened by another user.
        Case 70
            FicheroAbierto = True

        ' Another error occurred.
        Case Else
            Error errnum
    End Select

End Function
            
Public Function AbrirEnLocal( _
                                p_URLFinal As String, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    Dim m_URLLocal As String
    Dim m_Hwn As Long
    
    On Error Resume Next
    m_Hwn = Application.Screen.ActiveForm.hWnd
    If Err.Number <> 0 Then
        Err.Clear
        m_Hwn = 1
    End If
    On Error GoTo errores
    If Not fso.FileExists(p_URLFinal) Then
        p_Error = "No es accesible la ruta del archivo que se pretende abrir" & vbNewLine & p_URLFinal
        Err.Raise 1000
    End If
    If Left(p_URLFinal, 2) = "\\" Then
        m_URLLocal = m_ObjEntorno.URLDirectorioLocal & fso.GetFileName(p_URLFinal)
        If fso.FileExists(m_URLLocal) Then
            If FicheroAbierto(m_URLLocal) Then
                p_Error = "Tiene el archivo abierto"
                Err.Raise 1000
            End If
            fso.DeleteFile m_URLLocal, True
        End If
        fso.CopyFile p_URLFinal, m_URLLocal, True
    Else
        m_URLLocal = p_URLFinal
    End If
    
    Ejecutar m_Hwn, "open", m_URLLocal, "", "", 1
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AbrirEnLocal ha producido el error nº: " & Err.Number & vbNewLine & _
                    "Detalle: " & Err.Description
    End If
End Function
Public Function AbrirAyuda( _
                            Optional ByRef p_Error As String _
                            ) As String

    
    Dim m_NombreFormulario As String
    Dim m_NombreArchivo As String
    Dim m_URL As String
    On Error Resume Next
    If Application.Screen.ActiveForm Is Nothing Then
        If Err.Number <> 0 Then
            Exit Function
        End If
        Exit Function
    End If
    If Err.Number <> 0 Then
        Exit Function
    End If
    Err.Clear
    On Error GoTo errores
    m_NombreFormulario = Application.Screen.ActiveForm.Name
    m_NombreArchivo = m_NombreFormulario & ".pdf"
    m_URL = m_ObjEntorno.URLDirectorioDocumentacionAyuda & m_NombreArchivo
    
    
    AbrirEnLocal m_URL, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
   
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AbrirAyuda ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Public Function Seleccionar( _
                            p_EsArchivo As Boolean, _
                            Optional p_Titulo As String, _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim m_ObjfDialog As Object
    Dim varFile As Variant
    
    On Error GoTo errores
    
    If p_Titulo = "" Then
        p_Titulo = "Seleccione el archivo"
    End If
    If p_EsArchivo = True Then
        Set m_ObjfDialog = Application.FileDialog(msoFileDialogFilePicker)
    Else
        Set m_ObjfDialog = Application.FileDialog(msoFileDialogFolderPicker)
    End If
    With m_ObjfDialog
        .Show
        If p_EsArchivo Then
            .AllowMultiSelect = False
            .InitialFileName = m_ObjEntorno.URLUltimoArchivo
            .Title = p_Titulo
            .Filters.Clear
            .Filters.Add "All Files", "*.*"
        End If
        For Each varFile In .SelectedItems
            Seleccionar = CStr(varFile)
        Next
    End With
    If p_EsArchivo Then
        m_ObjEntorno.URLUltimoArchivo = CStr(varFile)
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Seleccionar ha producido el error : " & vbNewLine & Err.Description
    End If
End Function

Private Function RellenaColeConCamposOrder( _
                                            p_SQLLista As String, _
                                            p_col As Collection, _
                                            p_CampoAFiltrar As String, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim m_ParticulaSelectCompleta As String
    Dim m_ParticulaOrder As String
    Dim varItem As Variant
    Dim dato1
    Dim dato2
    Dim flag As String
    Dim i As Integer
    Dim p_TrozoCampo As String
    
    On Error GoTo errores
    
    Set p_col = New Collection
    If InStr(1, p_SQLLista, "SELECT") = 0 Or InStr(1, p_SQLLista, "FROM") = 0 Then
        p_Error = "El SQL ha de tener la palabra SELECT Y FROM obligatoriamente"
        Err.Raise 1000
    End If
    p_SQLLista = Replace(p_SQLLista, ";", "")
    If InStr(1, p_SQLLista, "ORDER BY") <> 0 Then
        dato = Split(p_SQLLista, "ORDER BY")
        m_ParticulaOrder = dato(1)
    End If
    If m_ParticulaOrder <> "" Then
        If InStr(1, m_ParticulaOrder, ",") <> 0 Then
            dato = Split(m_ParticulaOrder, ",")
            For Each varItem In dato
                flag = Trim(CStr(varItem))
                If InStr(1, flag, "DESC") <> 0 Then
                    dato1 = Split(flag, "DESC")
                    p_TrozoCampo = dato1(0)
                    m_ParticulaOrder = dato1(1)
                Else
                    p_TrozoCampo = flag
                    m_ParticulaOrder = ""
                End If
                i = OrdenEnColeccion(p_col, p_TrozoCampo, 1)
                If i > 0 Then
                    p_col.Remove (i)
                End If
                If flag = p_CampoAFiltrar Then
                    If m_ParticulaOrder = "DESC" Then
                        p_col.Add p_TrozoCampo & "|" & "ASC"
                    Else
                        p_col.Add p_TrozoCampo & "|" & "DESC"
                    End If
                    
                End If
                
            Next
        Else
            flag = Trim(m_ParticulaOrder)
            If InStr(1, flag, "DESC") <> 0 Then
                dato1 = Split(flag, "DESC")
                p_TrozoCampo = dato1(0)
                m_ParticulaOrder = dato1(1)
            Else
                p_TrozoCampo = flag
                m_ParticulaOrder = ""
            End If
            i = OrdenEnColeccion(p_col, p_TrozoCampo, 1)
            If i > 0 Then
                p_col.Remove (i)
            End If
            If flag = p_CampoAFiltrar Then
                If m_ParticulaOrder = "DESC" Then
                    p_col.Add p_TrozoCampo & "|" & "ASC"
                Else
                    p_col.Add p_TrozoCampo & "|" & "DESC"
                End If
                
            End If
        End If
        For Each varItem In p_col
            dato = Split(varItem, "|")
            p_TrozoCampo = dato(0)
            m_ParticulaOrder = dato(1)
            If p_TrozoCampo = p_CampoAFiltrar Then
                GoTo siguiente
            End If
        Next
    End If
    
siguiente:
    i = OrdenEnColeccion(p_col, p_CampoAFiltrar, 1)
    If i = 0 Then
        p_col.Add p_CampoAFiltrar & "|" & "ASC"
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenaColeConCamposOrder ha producido el error nº: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Public Function DameSQLOrdenado( _
                                ByRef p_SQLLista As String, _
                                ByVal p_CampoAOrdenar As String, _
                                ByRef p_Error As String _
                                ) As String
    
    Dim m_ParticulaOrder As String
    Dim varItem As Variant
    Dim m_ParticulaAscDesc As String
    Dim m_CampoAOrdenarContrario As String
    Dim strTrozoCampo As String
    Dim colCamposOrdenados As New Collection
    On Error GoTo errores

    
    RellenaColeConCamposOrder p_SQLLista, colCamposOrdenados, p_CampoAOrdenar, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If colCamposOrdenados Is Nothing Then
        p_Error = "El método RellenaColeConCamposOrder no ha devuelto ningún campo"
        Err.Raise 1000
    End If
    If colCamposOrdenados.count = 0 Then
        p_Error = "El método RellenaColeConCamposOrder no ha devuelto ningún campo"
        Err.Raise 1000
    End If
    
    m_ParticulaOrder = "ORDER BY "
    For Each varItem In colCamposOrdenados
        dato = Split(varItem, "|")
        strTrozoCampo = Trim(dato(0))
        m_ParticulaAscDesc = dato(1)
        If m_ParticulaOrder = "ORDER BY " Then
            If m_ParticulaAscDesc = "DESC" Then
                m_ParticulaOrder = m_ParticulaOrder & strTrozoCampo & " " & m_ParticulaAscDesc
            Else
                m_ParticulaOrder = m_ParticulaOrder & strTrozoCampo
            End If
        Else
            If m_ParticulaAscDesc = "DESC" Then
                m_ParticulaOrder = m_ParticulaOrder & "," & strTrozoCampo & " " & m_ParticulaAscDesc
            Else
                m_ParticulaOrder = m_ParticulaOrder & "," & strTrozoCampo
            End If
        End If
        
    Next
    dato = Split(p_SQLLista, "ORDER BY")
    p_SQLLista = dato(0) & " " & m_ParticulaOrder & ";"
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DameSQLOrdenado ha producido el error nº: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
   
End Function

Public Function OrdenEnColeccion(ByRef col As Collection, strElemento As String, Optional intColumna As Integer) As Integer
    Dim i As Integer, strElementoDeLaCole As String, dato, intOrden As Integer
    For i = 1 To col.count
        strElementoDeLaCole = col(i)
        If intColumna > 0 Then
            If InStr(1, strElementoDeLaCole, "|") <> 0 Then
                dato = Split(strElementoDeLaCole, "|")
                strElementoDeLaCole = dato(intColumna - 1)
                If strElementoDeLaCole = strElemento Then
                    OrdenEnColeccion = i
                    Exit Function
                End If
            End If
        Else
            If strElementoDeLaCole = strElemento Then
                OrdenEnColeccion = i
                Exit Function
            End If
        End If
        
    Next
    intOrden = 0
    OrdenEnColeccion = intOrden
End Function


Public Function RegistrarLogProyecto( _
                                    p_Titulo As String, _
                                    Optional p_Linea As String, _
                                    Optional p_Objeto As Object, _
                                    Optional p_ObjetoAlInicio As Object, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    Dim m_Log As LogNCProyecto
    Dim m_Linea As Variant
    Dim m_Col As Collection
    Dim m_NombreCampo As Variant
    Dim m_ValorActual As String
    Dim m_ValorAlInicio As String
    Dim m_LineaInicial As String
    On Error GoTo errores
    
    If p_Titulo = "" Then
        p_Error = "Se ha de indicar el título"
        Err.Raise 1000
    End If
    
    If p_Objeto Is Nothing Then
        Set m_Log = New LogNCProyecto
        With m_Log
            .Titulo = p_Titulo
            If p_Linea <> "" Then
                .Linea = p_Linea
            End If
            
            .usuario = m_ObjUsuarioConectado.UsuarioRed
            .Alta p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End With
        Exit Function
    End If
    Set m_Col = New Collection
    If TypeOf p_Objeto Is NCProyecto Then
        If p_ObjetoAlInicio Is Nothing Then
            m_LineaInicial = "Alta de " & IIf(p_Objeto.EsNoConformidad = True, "No Conformidad", "Observación")
        Else
             m_LineaInicial = "Edición de " & IIf(p_Objeto.EsNoConformidad = True, "No Conformidad", "Observación")
        End If
    ElseIf TypeOf p_Objeto Is ACProyecto Then
        If p_ObjetoAlInicio Is Nothing Then
            m_LineaInicial = "Alta de Acción Correctiva"
        Else
             m_LineaInicial = "Edición de Acción Correctiva"
        End If
    ElseIf TypeOf p_Objeto Is ARProyecto Then
        If p_ObjetoAlInicio Is Nothing Then
            m_LineaInicial = "Alta de Acción Realizada"
        Else
             m_LineaInicial = "Edición de Acción Realizada"
        End If
    End If
    m_Col.Add m_LineaInicial
    For Each m_NombreCampo In p_Objeto.ColCampos
        Debug.Print m_NombreCampo
        m_ValorActual = p_Objeto.getPropiedad(m_NombreCampo, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ValorActual = "" Then m_ValorActual = "NULL"
        If Not p_ObjetoAlInicio Is Nothing Then
            m_ValorAlInicio = p_ObjetoAlInicio.getPropiedad(m_NombreCampo, p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If m_ValorAlInicio = "" Then m_ValorAlInicio = "NULL"
        End If
        If p_ObjetoAlInicio Is Nothing Then
            m_Col.Add m_NombreCampo & ":" & m_ValorActual
        Else
            If m_ValorActual <> m_ValorAlInicio Then
                m_Col.Add m_NombreCampo & "_Inicial:" & m_ValorAlInicio & "|" & m_NombreCampo & "_Final:" & m_ValorActual
            End If
        End If
    Next
    Set m_Log = New LogNCProyecto
    With m_Log
        If TypeOf p_Objeto Is NCProyecto Then
            .idNC = p_Objeto.IDNoConformidad
        ElseIf TypeOf p_Objeto Is ACProyecto Then
            .idAC = p_Objeto.IdAccionCorrectiva
        ElseIf TypeOf p_Objeto Is ARProyecto Then
            .idAR = p_Objeto.IDAccionRealizada
        End If
        .Titulo = p_Titulo
        Set .col = m_Col
        .usuario = m_ObjUsuarioConectado.UsuarioRed
        .Alta p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RegistrarLogProyecto ha producido el error nº: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function
Public Function RegistrarLogAuditoria( _
                                    p_Titulo As String, _
                                    Optional p_Linea As String, _
                                    Optional p_Objeto As Object, _
                                    Optional p_ObjetoAlInicio As Object, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    Dim m_Log As LogNCAuditoria
    Dim m_Linea As Variant
    Dim m_Col As Collection
    Dim m_NombreCampo As Variant
    Dim m_ValorActual As String
    Dim m_ValorAlInicio As String
    Dim m_LineaInicial As String
    On Error GoTo errores
    
    If p_Titulo = "" Then
        p_Error = "Se ha de indicar el título"
        Err.Raise 1000
    End If
    
    If p_Objeto Is Nothing Then
        Set m_Log = New LogNCAuditoria
        With m_Log
            .Titulo = p_Titulo
            If p_Linea <> "" Then
                .Linea = p_Linea
            End If
            
            .usuario = m_ObjUsuarioConectado.UsuarioRed
            .Alta p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End With
        Exit Function
    End If
    Set m_Col = New Collection
    If TypeOf p_Objeto Is NCAuditoria Then
        If p_ObjetoAlInicio Is Nothing Then
            m_LineaInicial = "Alta de No Conformidad"
        Else
             m_LineaInicial = "Edición de No Conformidad"
        End If
    ElseIf TypeOf p_Objeto Is ACAuditoria Then
        If p_ObjetoAlInicio Is Nothing Then
            m_LineaInicial = "Alta de Acción Correctiva"
        Else
             m_LineaInicial = "Edición de Acción Correctiva"
        End If
    ElseIf TypeOf p_Objeto Is ARAuditoria Then
        If p_ObjetoAlInicio Is Nothing Then
            m_LineaInicial = "Alta de Acción Realizada"
        Else
             m_LineaInicial = "Edición de Acción Realizada"
        End If
    End If
    m_Col.Add m_LineaInicial
    For Each m_NombreCampo In p_Objeto.ColCampos
        m_ValorActual = p_Objeto.getPropiedad(m_NombreCampo, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_ValorActual = "" Then m_ValorActual = "NULL"
        If Not p_ObjetoAlInicio Is Nothing Then
            m_ValorAlInicio = p_ObjetoAlInicio.getPropiedad(m_NombreCampo, p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If m_ValorAlInicio = "" Then m_ValorAlInicio = "NULL"
        End If
        If p_ObjetoAlInicio Is Nothing Then
            m_Col.Add m_NombreCampo & ":" & m_ValorActual
        Else
            If m_ValorActual <> m_ValorAlInicio Then
                m_Col.Add m_NombreCampo & "_Inicial:" & m_ValorAlInicio & "|" & m_NombreCampo & "_Final:" & m_ValorActual
            End If
        End If
    Next
    Set m_Log = New LogNCAuditoria
    With m_Log
        If TypeOf p_Objeto Is NCAuditoria Then
            .idNC = p_Objeto.id
        ElseIf TypeOf p_Objeto Is ACAuditoria Then
            .idAC = p_Objeto.IdAccionCorrectiva
        ElseIf TypeOf p_Objeto Is ARAuditoria Then
            .idAR = p_Objeto.IDAccionRealizada
        End If
        .Titulo = p_Titulo
        Set .col = m_Col
        .usuario = m_ObjUsuarioConectado.UsuarioRed
        .Alta p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RegistrarLogAuditoria ha producido el error nº: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function
Public Function getNombreUsuarioConectado(Optional ByRef p_Error As String) As String
    
    Dim m_UsuarioMaquina As usuario
    
    On Error GoTo errores
    
    If Not m_ObjUsuarioConectado Is Nothing Then
        getNombreUsuarioConectado = m_ObjUsuarioConectado.Nombre
        Exit Function
    End If
    
    Set m_UsuarioMaquina = constructor.getUsuarioConectadoPorMaquina(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_UsuarioMaquina Is Nothing Then
        getNombreUsuarioConectado = "Desconocido"
        Exit Function
    End If
    getNombreUsuarioConectado = m_UsuarioMaquina.Nombre
    Exit Function
errores:
    getNombreUsuarioConectado = "Desconocido"
End Function

Public Function CorreoAlAdministrador( _
                                        p_MensajeError As String, _
                                        Optional ByRef p_Error As String _
                                        ) As String
                                        
   
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_mensaje As String
    Dim m_Asunto As String
    Dim m_Nombre As String
    Dim m_NombreFormulario As String
    Dim m_NombreControl As String
    Dim m_TextoEnOficina As String
    Dim m_IDCorreo As String
    Dim m_Destinatarios As String
    Dim m_NombreEquipo As String
    
    On Error GoTo errores
    If Application.TempVars("EnPruebas") = "Sí" Then
        Exit Function
    End If
    If p_MensajeError = "" Then
        p_Error = "No hay mensaje que enviar"
        Err.Raise 1000
    End If
    If m_EnOficina = Empty Then
        m_TextoEnOficina = "En Oficina Desconocido"
    Else
        If m_EnOficina = EnumSino.Sí Then
            m_TextoEnOficina = "En Oficina"
        Else
            m_TextoEnOficina = "Fuera de Oficina"
        End If
    End If
    On Error Resume Next
    m_NombreEquipo = VBA.Environ("COMPUTERNAME")
    m_NombreFormulario = Screen.ActiveForm.Name
    If Err.Number <> 0 Then
        m_NombreFormulario = "Formulario Desconocido"
        Err.Clear
        
    End If
    m_NombreControl = Application.Screen.ActiveControl.Name
    If Err.Number <> 0 Then
        m_NombreControl = "Control Desconocido"
        Err.Clear
        
    End If
    
    m_Nombre = getNombreUsuarioConectado()
    
    m_Asunto = "Error en NO CONFORMIDADES " & m_Nombre & " " & m_TextoEnOficina
    
    m_mensaje = "FORMULARIO del ERROR: " & m_NombreFormulario
    m_mensaje = m_mensaje & vbNewLine
    m_mensaje = m_mensaje & "NOMBRE DEL CONTROL: " & m_NombreControl
    m_mensaje = m_mensaje & vbNewLine
    m_mensaje = m_mensaje & "NOMBRE EQUIPO: " & m_NombreEquipo
    m_mensaje = m_mensaje & vbNewLine
    m_mensaje = m_mensaje & "DETALLE: " & p_MensajeError
    m_Destinatarios = "ardelperal@gmail.com;andres.romandelperal@telefonica.com"
   
    
    m_IDCorreo = getID("TbCorreosEnviados", "IDCorreo", getdb())
    
    m_SQL = "TbCorreosEnviados"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        .AddNew
            .Fields("IDCorreo") = m_IDCorreo
            .Fields("Aplicacion") = "NC"
            .Fields("Originador") = m_ObjUsuarioConectado.UsuarioRed
            .Fields("Destinatarios") = m_Destinatarios
            .Fields("Asunto") = m_Asunto
            .Fields("Cuerpo") = m_mensaje
            .Fields("FechaGrabacion") = Now()
            
        .Update
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método CorreoAlAdministrador ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function GetIPAddresses(Optional FilterLocalhost As Boolean = False) As String

    Dim Ret As Long
    Dim Buffer() As Byte
    Dim IPTableRow As IPINFO
    Dim count As Long
    Dim BufferRequired As Long
    Dim StructSize As Long
    Dim NumIPAddresses As Long
    Dim IPAddress As String

  
       
    Call GetIpAddrTable(ByVal 0&, BufferRequired, 1)

    If BufferRequired > 0 Then
        
        ReDim Buffer(0 To BufferRequired - 1) As Byte
        
        If GetIpAddrTable(Buffer(0), BufferRequired, 1) = 0 Then
        
            'We've successfully obtained the IP Address details...
            'First 4 bytes is a long indicating the number of entries in the table
            StructSize = LenB(IPTableRow)
            CopyMemory NumIPAddresses, Buffer(0), 4
        
            While count < NumIPAddresses
            
                'Buffer contains the IPINFO structures (after initial 4 byte long)
                CopyMemory IPTableRow, Buffer(4 + (count * StructSize)), StructSize
                    
                IPAddress = IPAddressToString(IPTableRow.dwAddr)
                    
                If Not ((IPAddress = "127.0.0.1") _
                        And FilterLocalhost) Then
                            
                    'Replace this with whatever you want to do with the IP Address...
                    GetIPAddresses = GetIPAddresses & IPAddress & ";     "
                        
                End If
                
                count = count + 1
                
            Wend
            
        End If
            
    End If
 
    Exit Function



End Function
    
Private Function IPAddressToString(EncodedAddress As Long) As String
        
    Dim IPBytes(3) As Byte
    Dim count As Long
        
    'Converts a long IP Address to a string formatted 255.255.255.255
    'Note: Could use inet_ntoa instead
        
    CopyMemory IPBytes(0), EncodedAddress, 4 ' IP Address is stored in four bytes (255.255.255.255)
        
    'Convert the 4 byte values to a formatted string
    While count < 4
        
        IPAddressToString = IPAddressToString & _
                                CStr(IPBytes(count)) & _
                                IIf(count < 3, ".", "")

        count = count + 1
            
    Wend
        
End Function

Public Function EnOficina(Optional ByRef p_Error As String) As EnumSino
    
    Dim strIPS As String
    On Error GoTo errores
    strIPS = GetIPAddresses
    If InStr(1, strIPS, SubRedOficina) = 0 Then
        EnOficina = EnumSino.No
    Else
        EnOficina = EnumSino.Sí
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EnOficina ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function



Public Function Avance( _
                        p_Linea As Variant, _
                        Optional ByRef p_Error As String _
                        ) As String
    
    
    Dim m_Form As Form
    
    On Error GoTo errores
    Set m_Form = Screen.ActiveForm
    
    If lbl Is Nothing Then
        On Error Resume Next
        Set lbl = m_Form.lblEstado
        If Err.Number <> 0 Then
            Err.Clear
            Exit Function
        End If
    End If
    On Error GoTo errores
    
    If lbl.Visible = False Then
        lbl.Visible = True
    End If
    VBA.DoEvents
    lbl.Caption = p_Linea
    VBA.DoEvents
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Avance ha devuelto el error: " & Err.Description
    End If
End Function
    
Public Function AvanceCerrar() As String
    
    
    
    
    On Error Resume Next
    Application.Screen.ActiveForm.Controls("lblEstado").Visible = False
    
    Exit Function
    
End Function

'Public Function GenerarConsultas( _
'                                p_NombreInforme As String, _
'                                Optional p_SQL As String, _
'                                Optional p_lst As ListBox, _
'                                Optional ByRef p_Error As String _
'                                ) As String
'    On Error GoTo errores
'
'    If p_SQL = "" And p_lst Is Nothing Then
'        p_Error = "Se ha de indicar el SQL o la lista"
'        Err.Raise 1000
'    End If
'    If p_SQL = "" Then
'        p_SQL = getSQLPorLista(p_lst, p_Error)
'        If p_Error <> "" Then
'            Err.Raise 1000
'        End If
'    End If
'    GenerarConsultas = GenerarConsultaPorSQL(p_NombreInforme, p_SQL, p_Error)
'    If p_Error <> "" Then
'        Err.Raise 1000
'    End If
'
'    Exit Function
'errores:
'    If Err.Number <> 1000 Then
'        p_Error = "El método GenerarConsultas ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
'    End If
'
'End Function
'Private Function GenerarConsultaPorSQL( _
'                                        p_NombreInforme As String, _
'                                        p_SQL As String, _
'                                        Optional ByRef p_Error As String _
'                                         ) As String
'    Dim qdfTemp As QueryDef
'    Dim m_NombreArchivo As String
'    Dim m_NombreConsultaTemporal As String
'
'    On Error GoTo errores
'
'    m_NombreConsultaTemporal = fso.GetBaseName(fso.GetTempName())
'
'
'    If p_SQL = "" Then
'        p_Error = "No se ha podido obtener la consulta a exportar"
'        Err.Raise 1000
'    End If
'    If InStr(1, p_SQL, "SELECT") = 0 Then
'        p_SQL = "SELECT * " & _
'                "FROM " & p_SQL & ";"
'    End If
'    Set qdfTemp = CurrentDb().CreateQueryDef(m_NombreConsultaTemporal, p_SQL)
'    m_NombreArchivo = m_NombreConsultaTemporal & ".xlsx"
'    DoCmd.OutputTo acOutputQuery, m_NombreConsultaTemporal, acFormatXLSX, m_NombreArchivo, True
'    CurrentDb().QueryDefs.Delete m_NombreConsultaTemporal
'
'    Exit Function
'errores:
'    If Err.Number <> 1000 Then
'        p_Error = "El método GenerarConsultaPorSQL ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
'    End If
'
'End Function



Private Function BorraHTMLs( _
                            Optional ByRef p_Error As String) As String
    
    Dim fichero As File
    
    On Error GoTo errores
    
    For Each fichero In fso.GetFolder(m_ObjEntorno.URLDirectorioLocal).Files
        If fso.GetExtensionName(fichero.Path) = "html" Or fso.GetExtensionName(fichero.Path) = "htm" Then
            If Not FicheroAbierto(fichero.Path) Then
                fso.DeleteFile fichero.Path
            End If
        End If
    Next
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método BorraHTMLs ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
Public Function HTMHistorialProyecto( _
                                        p_Objeto As Object, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    
    
    Dim m_mensaje As String
    Dim Linea As Variant
    Dim varLog As Variant
    Dim m_Titular As String
    Dim m_Usuario As String
    Dim m_Titulo As String
    Dim m_Fecha As String
    Dim m_Col As Scripting.Dictionary
    Dim m_Log As LogNCProyecto
    Dim m_ID As Variant
    On Error GoTo errores
    
    If p_Objeto Is Nothing Then
        p_Error = "Con datos insuficientes"
        Err.Raise 1000
    End If
    Set m_Col = constructor.getLogsProyecto(p_Objeto:=p_Objeto, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        m_mensaje = m_mensaje & "<P>Sin datos</p>" & vbNewLine
        m_mensaje = m_mensaje & "</body>" & vbNewLine
        m_mensaje = m_mensaje & "</html>" & vbNewLine
        HTMHistorialProyecto = m_mensaje
        Exit Function
    End If
    m_mensaje = m_mensaje & "<h1>" & m_Titular & "</h1>" & vbNewLine
    m_mensaje = m_mensaje & "<table>" & vbNewLine
    m_mensaje = m_mensaje & "<tr>" & vbNewLine
        m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>Histórico de cambios</strong></td>"
    m_mensaje = m_mensaje & "</tr>" & vbNewLine
    For Each m_ID In m_Col
        Set m_Log = m_Col(m_ID)
        m_Titulo = m_Log.Titulo
        m_Fecha = m_Log.FECHA
        varLog = m_Log.Linea
        If Not m_Log.UsuarioObj Is Nothing Then
            m_Usuario = m_Log.UsuarioObj.Nombre
        End If
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
            m_mensaje = m_mensaje & "<td class=""cabecera"">" & m_Titulo & " ( " & m_Fecha & ") " & m_Usuario & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        dato = Split(varLog, vbNewLine)
        For Each Linea In dato
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
                m_mensaje = m_mensaje & "<td>" & Linea & " </font> </td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
        Next
        
        Set m_Log = Nothing
    Next
    
    m_mensaje = m_mensaje & "</table>" & vbNewLine
    m_mensaje = m_mensaje & "</body>" & vbNewLine
    m_mensaje = m_mensaje & "</html>" & vbNewLine
    HTMHistorialProyecto = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HTML.HTMHistorialProyecto ha producido el error nº: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
     
End Function
Public Function HTMHistorialAuditoria( _
                                        p_Objeto As Object, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    
    
    Dim m_mensaje As String
    Dim Linea As Variant
    Dim varLog As Variant
    Dim m_Titular As String
    Dim m_Usuario As String
    Dim m_Titulo As String
    Dim m_Fecha As String
    Dim m_Col As Scripting.Dictionary
    Dim m_Log As LogNCAuditoria
    Dim m_ID As Variant
    On Error GoTo errores
    
    If p_Objeto Is Nothing Then
        p_Error = "Con datos insuficientes"
        Err.Raise 1000
    End If
    Set m_Col = constructor.getLogsAuditoria(p_Objeto:=p_Objeto, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        m_mensaje = m_mensaje & "<P>Sin datos</p>" & vbNewLine
        m_mensaje = m_mensaje & "</body>" & vbNewLine
        m_mensaje = m_mensaje & "</html>" & vbNewLine
        HTMHistorialAuditoria = m_mensaje
        Exit Function
    End If
    m_mensaje = m_mensaje & "<h1>" & m_Titular & "</h1>" & vbNewLine
    m_mensaje = m_mensaje & "<table>" & vbNewLine
    m_mensaje = m_mensaje & "<tr>" & vbNewLine
        m_mensaje = m_mensaje & "<td class=""centrado"" > <strong>Histórico de cambios</strong></td>"
    m_mensaje = m_mensaje & "</tr>" & vbNewLine
    For Each m_ID In m_Col
        Set m_Log = m_Col(m_ID)
        m_Titulo = m_Log.Titulo
        m_Fecha = m_Log.FECHA
        varLog = m_Log.Linea
        If Not m_Log.UsuarioObj Is Nothing Then
            m_Usuario = m_Log.UsuarioObj.Nombre
        End If
        m_mensaje = m_mensaje & "<tr>" & vbNewLine
            m_mensaje = m_mensaje & "<td class=""cabecera"">" & m_Titulo & " ( " & m_Fecha & ") " & m_Usuario & "</td>" & vbNewLine
        m_mensaje = m_mensaje & "</tr>" & vbNewLine
        dato = Split(varLog, vbNewLine)
        For Each Linea In dato
            m_mensaje = m_mensaje & "<tr>" & vbNewLine
                m_mensaje = m_mensaje & "<td>" & Linea & " </font> </td>" & vbNewLine
            m_mensaje = m_mensaje & "</tr>" & vbNewLine
        Next
        
        Set m_Log = Nothing
    Next
    
    m_mensaje = m_mensaje & "</table>" & vbNewLine
    m_mensaje = m_mensaje & "</body>" & vbNewLine
    m_mensaje = m_mensaje & "</html>" & vbNewLine
    HTMHistorialAuditoria = m_mensaje
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HTML.HTMHistorialAuditoria ha producido el error nº: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If
     
End Function
Public Function HTMLENTXT( _
                            Optional p_HTML As String, _
                            Optional m_mensaje As ADODB.stream, _
                            Optional ByRef p_Error As String _
                            ) As String
    
    
    Dim m_URLHTML As String
    Dim mHWD As Long
    On Error GoTo errores
    
    If p_HTML = "" And m_mensaje Is Nothing Then
        p_Error = "No se ha indicado el HTML"
        Err.Raise 1000
    End If
    m_URLHTML = m_ObjEntorno.URLDirectorioLocal & "HTML.html"
    If p_HTML <> "" Then
        Set m_mensaje = New ADODB.stream
        m_mensaje.Type = adTypeText
        m_mensaje.Charset = "utf-8"
        m_mensaje.Open
        m_mensaje.WriteText p_HTML
        m_mensaje.SaveToFile m_URLHTML, adSaveCreateOverWrite
    Else
        m_mensaje.SaveToFile m_URLHTML, adSaveCreateOverWrite
    End If
    m_mensaje.Close
    Set m_mensaje = Nothing
    On Error Resume Next
    mHWD = Screen.ActiveForm.hWnd
    If Err.Number <> 0 Then
        Err.Clear
        mHWD = 1
    End If
    On Error GoTo errores
    Ejecutar mHWD, "open", m_URLHTML, "", "", 1
    HTMLENTXT = m_URLHTML
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HTMLENTXT ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function



Public Function EstablecerComboCodigo( _
                                        cmb As ComboBox, _
                                        Optional ByRef p_Error As String _
                                        ) As String
   
    Dim m_Col As Scripting.Dictionary
    Dim m_NC As NCProyecto
    Dim m_ID As Variant
    
    
    On Error GoTo errores
    
    cmb.RowSource = ""
    Set m_Col = m_ObjEntorno.ColNCsProyecto
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then
        Err.Raise 100
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_NC = m_Col(m_ID)
        cmb.AddItem m_NC.CodigoNoConformidad
        Set m_NC = Nothing
    Next
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerComboCodigo ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Public Function EstablecerComboTipo( _
                                            cmb As ComboBox, _
                                            Optional ByRef p_Error As String _
                                            ) As String
   
    Dim m_Col As Scripting.Dictionary
    Dim m_Tipo As TipologiaNCProyectos
    Dim m_ID As Variant
    
    
    On Error GoTo errores
    
    cmb.RowSource = ""
    Set m_Col = m_ObjEntorno.ColTipos
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then
        Err.Raise 100
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_Tipo = m_Col(m_ID)
        cmb.AddItem m_Tipo.IDTipo & ";" & m_Tipo.Tipologia
        Set m_Tipo = Nothing
    Next
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerComboTipo ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function EstablecerComboResponsables( _
                                            cmb As ComboBox, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim m_Col As Scripting.Dictionary
    Dim m_Tecnico As usuario
    Dim m_ID As Variant
    
    
    On Error GoTo errores
    
    cmb.RowSource = ""
    
    If m_ObjEntorno.ColJefesProyecto Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_ObjEntorno.ColJefesProyecto
        Set m_Tecnico = m_ObjEntorno.ColJefesProyecto(m_ID)
        'If m_Tecnico.UsuarioRed = "ssi" Then Stop
        If cmb.ColumnCount = 2 Then
            cmb.AddItem m_Tecnico.Nombre & ";" & m_Tecnico.UsuarioRed
        Else
            cmb.AddItem m_Tecnico.Nombre
        End If
        
        Set m_Tecnico = Nothing
    Next
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerComboResponsables ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function EstablecerComboJP( _
                                        cmb As ComboBox, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    Dim m_Col As Scripting.Dictionary
    Dim m_Tecnico As usuario
    Dim m_ID As Variant
    
    
    On Error GoTo errores
    
    cmb.RowSource = ""
    Set m_Col = m_ObjEntorno.ColJefesProyecto
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then
        Err.Raise 100
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_Tecnico = m_Col(m_ID)
        If cmb.ColumnCount = 2 Then
            cmb.AddItem m_Tecnico.Nombre & ";" & m_Tecnico.UsuarioRed
        Else
            cmb.AddItem m_Tecnico.Nombre
        End If
        
        Set m_Tecnico = Nothing
    Next
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerComboJP ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function EstablecerComboEstado( _
                                            cmb As ComboBox, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_Titulo As String
   
    On Error GoTo errores
    
    cmb.RowSource = ""
    For Each m_ID In m_ObjEntorno.ColEstadosNC
        m_Titulo = m_ObjEntorno.ColEstadosNCTitulo(CStr(m_ID))
        cmb.AddItem m_Titulo & ";" & m_ID
    Next
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerComboEstado ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function EstablecerComboEstadoAC( _
                                            cmb As ComboBox, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_Titulo As String
   
    On Error GoTo errores
    
    cmb.RowSource = ""
    For Each m_ID In m_ObjEntorno.ColEstadosAC
        m_Titulo = m_ObjEntorno.ColEstadosACTitulo(CStr(m_ID))
        cmb.AddItem m_Titulo & ";" & m_ID
    Next
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerComboEstadoAC ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function EstablecerComboResponsablesCalidad( _
                                                    cmb As ComboBox, _
                                                    Optional ByRef p_Error As String _
                                                    ) As String
    Dim m_Col As Scripting.Dictionary
    Dim m_Tecnico As usuario
    Dim m_ID As Variant
    
    
    On Error GoTo errores
    
    cmb.RowSource = ""
    Set m_Col = m_ObjEntorno.ColUsuariosCalidad
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then
        Err.Raise 100
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_Tecnico = m_Col(m_ID)
        If cmb.ColumnCount = 1 Then
            cmb.AddItem m_Tecnico.Nombre
        ElseIf cmb.ColumnCount = 2 Then
            cmb.AddItem m_Tecnico.Nombre & ";" & m_Tecnico.UsuarioRed
        End If
        
        Set m_Tecnico = Nothing
    Next
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerComboResponsablesCalidad ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Private Function getUsuarioMaquina( _
                            Optional ByRef p_Error As String _
                            ) As String
    Dim objNetwork As Object
    On Error GoTo errores
    Set objNetwork = CreateObject("Wscript.Network")
    With objNetwork
        getUsuarioMaquina = .UserName & "|" & .computername
    End With
   
    Set objNetwork = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getUsuarioMaquina ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function getMaquina( _
                            Optional ByRef p_Error As String _
                            ) As String
    Dim flag As String
    Dim dato As Variant
    On Error GoTo errores
    flag = getUsuarioMaquina
    If InStr(1, flag, "|") <> 0 Then
        dato = Split(flag, "|")
        getMaquina = dato(1)
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getMaquina ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function getUsuariodeMaquina( _
                                Optional ByRef p_Error As String _
                                ) As String
    Dim flag As String
    Dim dato As Variant
    On Error GoTo errores
    flag = getUsuarioMaquina
    If InStr(1, flag, "|") <> 0 Then
        dato = Split(flag, "|")
        getUsuariodeMaquina = dato(0)
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getUsuariodeMaquina ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function




Public Function DameID( _
                        p_NOmbreTabla As String, _
                        p_NombreCampoID As String, _
                        Optional ByRef p_Db As DAO.Database, _
                        Optional ByRef p_Error As String _
                        ) As String
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim lngIDMax As Long
    On Error GoTo errores
    
    If p_NOmbreTabla = "" Or p_NombreCampoID = "" Then
        p_Error = "Se ha de indicar el nombre de la tabla y de su campo ID"
        Err.Raise 1000
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT Max(" & p_NOmbreTabla & "." & p_NombreCampoID & ") AS MaxID " & _
            "FROM " & p_NOmbreTabla & ";"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            If IsNumeric(Nz(.Fields("MaxID"), "")) Then
                lngIDMax = .Fields("MaxID")
            End If

        End If
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    DameID = CStr(lngIDMax + 1)
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DameID ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function
Public Function getHora() As String
    Dim xmlHttp As Object
    Dim url As String
    Dim response As String
    Dim json As Object
    Dim hora As String
    Dim dato As Variant
    Dim flag As String
    
    ' URL de la API para obtener la hora en Madrid, España
    url = "http://worldtimeapi.org/api/timezone/Europe/Madrid"
    
    ' Crear el objeto XMLHTTP
    Set xmlHttp = CreateObject("MSXML2.XMLHTTP")
    
    ' Hacer la solicitud a la API
    xmlHttp.Open "GET", url, False
    xmlHttp.send
    
    ' Obtener la respuesta
    response = xmlHttp.responseText
    
    ' Analizar la respuesta JSON
    Set json = JsonConverter.ParseJson(response)
    
    ' Extraer la hora de la respuesta JSON
    hora = json("datetime")
    dato = Split(hora, "T")
    flag = dato(1)
    dato = Split(flag, ".")
    hora = dato(0)
    ' Retornar la hora
    getHora = hora
End Function

Private Function getDirectorioOneDrive(Optional ByRef p_Error As String) As String
    Dim fso As Object
    Dim carpetaRaiz As Object
    Dim subcarpeta As Object
    Dim rutaEncontrada As String
    Dim encontrado As Boolean
    Dim dato As Variant
    On Error GoTo errores
    
    rutaEncontrada = Environ("OneDrive")
    If InStr(1, rutaEncontrada, "OneDrive") <> 0 Then
        dato = Split(rutaEncontrada, "OneDrive")
        getDirectorioOneDrive = dato(0) & "OneDrive"
        Exit Function
    End If
    
    
    ' Crear objeto FileSystemObject
    Set fso = CreateObject("Scripting.FileSystemObject")
    
    ' Obtener la carpeta raíz de C:\
    Set carpetaRaiz = fso.GetFolder("C:\")
    
    ' Inicializar variables
    encontrado = False
    rutaEncontrada = ""
    
    ' Recorrer las subcarpetas en la raíz de C:\
    For Each subcarpeta In carpetaRaiz.SubFolders
        If InStr(1, subcarpeta.Name, "OneDrive", vbTextCompare) > 0 Then
            rutaEncontrada = subcarpeta.Path
            encontrado = True
            Exit For
        
        End If
    Next subcarpeta
    
    ' Mostrar el resultado
    If encontrado Then
        getDirectorioOneDrive = rutaEncontrada
   
    End If
    
    ' Liberar objetos
    Set subcarpeta = Nothing
    Set carpetaRaiz = Nothing
    Set fso = Nothing
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getDirectorioOneDrive ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Private Function getDirectorioOneDriveTelefonicaApps(Optional ByRef p_Error As String) As String
    Dim fso As Object
    Dim carpeta As String
    Dim m_RutaOneDrive As String
    
    On Error GoTo errores
    ' Crear objeto FileSystemObject
    Set fso = CreateObject("Scripting.FileSystemObject")
    m_RutaOneDrive = getDirectorioOneDrive(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_RutaOneDrive = "" Then
        Exit Function
    End If
    carpeta = m_RutaOneDrive & "\Telefonica\Aplicaciones_dys.TMETF - Aplicaciones PpD\"
    If Not fso.FolderExists(carpeta) Then
        Exit Function
    End If
    getDirectorioOneDriveTelefonicaApps = carpeta
    
    ' Liberar objetos
   
    
    Set fso = Nothing
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getDirectorioOneDriveTelefonicaApps ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Private Function getDirectorioOneDriveApps(Optional ByRef p_Error As String) As String
    Dim fso As Object
    Dim carpeta As String
    Dim m_RutaOneDrive As String
    
    On Error GoTo errores
    ' Crear objeto FileSystemObject
    Set fso = CreateObject("Scripting.FileSystemObject")
    m_RutaOneDrive = getDirectorioOneDrive(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_RutaOneDrive = "" Then
        Exit Function
    End If
    'C:\OneDrive\OneDrive - Telefonica\00LABORAL\Aplicaciones PpD
    carpeta = m_RutaOneDrive & "\OneDrive - Telefonica\00LABORAL\Aplicaciones PpD\"
    If Not fso.FolderExists(carpeta) Then
        Exit Function
    End If
    getDirectorioOneDriveApps = carpeta
    
    ' Liberar objetos
   
    
    Set fso = Nothing
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getDirectorioOneDriveApps ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function


Public Function getRutaAplicacionesLocal(Optional ByRef p_Error As String) As String
    Dim fso As Object
    Dim m_RutaOneDrive As String
    Dim m_RutaOneDriveTelefonica As String
    
    On Error GoTo errores
    ' Crear objeto FileSystemObject
    Set fso = CreateObject("Scripting.FileSystemObject")
    m_RutaOneDriveTelefonica = getDirectorioOneDriveTelefonicaApps(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    If fso.FolderExists(m_RutaOneDriveTelefonica) Then
        Set fso = Nothing
        getRutaAplicacionesLocal = m_RutaOneDriveTelefonica
        Exit Function
    End If
    
    m_RutaOneDrive = getDirectorioOneDrive(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_RutaOneDrive = "" Then
        Set fso = Nothing
        Exit Function
    End If
   
    getRutaAplicacionesLocal = m_RutaOneDrive
    
    ' Liberar objetos
   
    
    Set fso = Nothing
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getRutaAplicacionesLocal ha devuelto el error: " & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function

Public Function EstablecerComboJuridicas( _
                                            cmb As ComboBox, _
                                            Optional ByRef p_Error As String _
                                            ) As String
       
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    
    
    
    On Error GoTo errores
    
    cmb.RowSource = ""
    Set m_Col = m_ObjEntorno.ColJuridicasDistintas
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then
        Err.Raise 100
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        
        cmb.AddItem m_ID
        
    Next
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerComboJuridicas ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function EstablecerColorPestañasNCProyecto(Optional ByRef p_Error As String) As String
    
    Dim frm As Form
    
    On Error GoTo errores
    If Not FormularioAbierto("FormNCProyecto") Then
        Exit Function
    End If
    Set frm = Forms("FormNCProyecto")
    With frm
        .NavGeneral.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        .NavAcciones.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        
        .NavNotas.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        .NavDocumentos.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        .NavReplanificaciones.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        .NavMotivoBorrado.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        
        .NavGeneral.Enabled = True
        .NavAcciones.Enabled = True
        .NavControlEficacia.Enabled = True
        
        .NavNotas.Enabled = True
        .NavDocumentos.Enabled = True
        .NavReplanificaciones.Enabled = True
        .NavMotivoBorrado.Enabled = True
        
        If m_ObjNCProyectoActiva Is Nothing Then
            .NavDocumentos.Enabled = False
            .NavNotas.Enabled = False
            .NavMotivoBorrado.Enabled = False
            
            .NavAcciones.Enabled = False
            .NavControlEficacia.Enabled = False
            .NavReplanificaciones.Enabled = False
        Else
            If m_ObjNCProyectoActiva.IDNoConformidad = "" Then
                .NavDocumentos.Enabled = False
                .NavNotas.Enabled = False
                .NavMotivoBorrado.Enabled = False
                
                .NavAcciones.Enabled = False
                .NavControlEficacia.Enabled = False
                .NavReplanificaciones.Enabled = False
            Else
                
                If m_ObjNCProyectoActiva.Borrado = False Then
                    .NavMotivoBorrado.Enabled = False
                End If
                If m_ObjNCProyectoActiva.RequiereControlEficacia = "No" Then
                    .NavControlEficacia.Enabled = False
                End If
            End If
        End If
    End With
    With m_ObjNCProyectoActiva
        If .EstadoCalculado = EnumEstadoNC.Cerrada Then
            Exit Function
        End If
        If .Borrado = True Then
            Exit Function
        End If
        If .DatosGeneralesOK = EnumSino.Sí Then
            frm.NavGeneral.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        Else
            frm.NavGeneral.ForeColor = PESTAÑA_TODOS_DATOS_OK_NO
        End If
        If .AccionesOK = EnumSino.Sí Then
            frm.NavAcciones.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        Else
            frm.NavAcciones.ForeColor = PESTAÑA_TODOS_DATOS_OK_NO
        End If
        If .EficaciaOK = EnumSino.Sí Then
            frm.NavControlEficacia.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        Else
            frm.NavControlEficacia.ForeColor = PESTAÑA_TODOS_DATOS_OK_NO
        End If
        
    End With
   
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerColorPestañasNCProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function EstablecerColorPestañasNCAuditoria(Optional ByRef p_Error As String) As String
    
    Dim frm As Form
    
    On Error GoTo errores
    If Not FormularioAbierto("FormNCAuditoria") Then
        Exit Function
    End If
    Set frm = Forms("FormNCAuditoria")
    With frm
        .NavGeneral.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        .NavAcciones.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        
        .NavNotas.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        .NavDocumentos.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        .NavReplanificaciones.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        .NavMotivoBorrado.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        
        .NavGeneral.Enabled = True
        .NavAcciones.Enabled = True
        .NavControlEficacia.Enabled = True
        
        .NavNotas.Enabled = True
        .NavDocumentos.Enabled = True
        .NavReplanificaciones.Enabled = True
        .NavMotivoBorrado.Enabled = True
        
        If m_ObjNCAuditoriaActiva Is Nothing Then
            .NavDocumentos.Enabled = False
            .NavNotas.Enabled = False
            .NavMotivoBorrado.Enabled = False
            
            .NavAcciones.Enabled = False
            .NavControlEficacia.Enabled = False
            .NavReplanificaciones.Enabled = False
        Else
            If m_ObjNCAuditoriaActiva.id = "" Then
                .NavDocumentos.Enabled = False
                .NavNotas.Enabled = False
                .NavMotivoBorrado.Enabled = False
                
                .NavAcciones.Enabled = False
                .NavControlEficacia.Enabled = False
                .NavReplanificaciones.Enabled = False
            Else
                
                If m_ObjNCAuditoriaActiva.Borrado = False Then
                    .NavMotivoBorrado.Enabled = False
                End If
                If m_ObjNCAuditoriaActiva.RequiereControlEficacia = "No" Then
                    .NavControlEficacia.Enabled = False
                End If
                If m_ObjNCAuditoriaActiva.RequiereAccionCorrectiva = "No" Then
                    .NavAcciones.Enabled = False
                    .NavReplanificaciones.Enabled = False
                End If
            End If
        End If
    End With
    With m_ObjNCAuditoriaActiva
        If .EstadoCalculado = EnumEstadoNC.Cerrada Then
            Exit Function
        End If
        If .Borrado = True Then
            Exit Function
        End If
        If .DatosGeneralesOK = EnumSino.Sí Then
            frm.NavGeneral.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        Else
            frm.NavGeneral.ForeColor = PESTAÑA_TODOS_DATOS_OK_NO
        End If
        If .RequiereAccionCorrectiva = "Sí" Then
            If .AccionesOK = EnumSino.Sí Then
                frm.NavAcciones.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
            Else
                frm.NavAcciones.ForeColor = PESTAÑA_TODOS_DATOS_OK_NO
            End If
       
        
        End If
        
        If .EficaciaOK = EnumSino.Sí Then
            frm.NavControlEficacia.ForeColor = PESTAÑA_TODOS_DATOS_OK_SI
        Else
            frm.NavControlEficacia.ForeColor = PESTAÑA_TODOS_DATOS_OK_NO
        End If
        
    End With
   
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerColorPestañasNCAuditoria ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function ActualizarDatosACProyecto( _
                                        p_AC As ACProyecto, _
                                        Optional ByRef p_Error As String) As String
        
    
    Dim m_ACOp As ACProyectoOperaciones
    Dim m_ARProyecto As ARProyecto
    Dim m_ID As Variant
    Dim m_NC As NCProyecto
    Dim m_FPrevCierreNC As String
    
    On Error GoTo errores
    If p_AC Is Nothing Then
        Exit Function
    End If
    Set m_ACOp = New ACProyectoOperaciones
    With m_ACOp
        Set .AC = p_AC
        .ActualizarDatosCalculados p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
   
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarDatosACProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function ActualizarDatosACAuditoria( _
                                            p_AC As ACAuditoria, _
                                            Optional ByRef p_Error As String) As String
        
    
    Dim m_ACOp As ACAuditoriaOperaciones
    Dim m_ARAuditoria As ARAuditoria
    Dim m_ID As Variant
    Dim m_NC As NCAuditoria
    Dim m_FPrevCierreNC As String
    
    On Error GoTo errores
    If p_AC Is Nothing Then
        Exit Function
    End If
    Set m_ACOp = New ACAuditoriaOperaciones
    With m_ACOp
        Set .AC = p_AC
        .ActualizarDatosCalculados p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
   
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarDatosACAuditoria ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function ActualizarDatosACsProyecto( _
                                    p_col As Scripting.Dictionary, _
                                    Optional ByRef p_Error As String) As String
    
    Dim m_ACProyecto As ACProyecto
    Dim m_IDAC As Variant
    
    Dim m_ACOp As ACProyectoOperaciones
    Dim m_ARProyecto As ARProyecto
    Dim m_ID As Variant
    On Error GoTo errores
    If p_col Is Nothing Then
        Exit Function
    End If
    Set m_ACOp = New ACProyectoOperaciones
    
    For Each m_IDAC In p_col
        Set m_ACProyecto = p_col(m_IDAC)
        With m_ACOp
            Set .AC = m_ACProyecto
            .ActualizarDatosCalculados p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End With
        
        Set m_ACProyecto = Nothing
    Next
    
   
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarDatosACsProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function ActualizarDatosACsAuditoria( _
                                            p_col As Scripting.Dictionary, _
                                            Optional ByRef p_Error As String) As String
    
    Dim m_ACAuditoria As ACAuditoria
    Dim m_IDAC As Variant
    
    Dim m_ACOp As ACAuditoriaOperaciones
    Dim m_ARAuditoria As ARAuditoria
    Dim m_ID As Variant
    On Error GoTo errores
    If p_col Is Nothing Then
        Exit Function
    End If
    Set m_ACOp = New ACAuditoriaOperaciones
    
    For Each m_IDAC In p_col
        Set m_ACAuditoria = p_col(m_IDAC)
        With m_ACOp
            Set .AC = m_ACAuditoria
            .ActualizarDatosCalculados p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End With
        
        Set m_ACAuditoria = Nothing
    Next
    
   
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarDatosACsAuditoria ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function ActualizarDatosARProyecto( _
                                    p_AR As ARProyecto, _
                                    Optional ByRef p_Error As String) As String
    
    
    Dim m_AROp As ARProyectoOperaciones
    On Error GoTo errores
    If p_AR Is Nothing Then
        Exit Function
    End If
    Set m_AROp = New ARProyectoOperaciones
    With m_AROp
        Set .AR = p_AR
        .ActualizarDatosCalculados p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarDatosARProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function ActualizarDatosARAuditoria( _
                                            p_AR As ARAuditoria, _
                                            Optional ByRef p_Error As String) As String
    
    
    Dim m_AROp As ARAuditoriaOperaciones
    On Error GoTo errores
    If p_AR Is Nothing Then
        Exit Function
    End If
    Set m_AROp = New ARAuditoriaOperaciones
    With m_AROp
        Set .AR = p_AR
        .ActualizarDatosCalculados p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarDatosARAuditoria ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function ActualizarDatosARsProyecto( _
                                    p_col As Scripting.Dictionary, _
                                    Optional ByRef p_Error As String) As String
    
    Dim m_ARProyecto As ARProyecto
    Dim m_ID As Variant
    Dim m_AROp As ARProyectoOperaciones
    On Error GoTo errores
    If p_col Is Nothing Then
        Exit Function
    End If
    Set m_AROp = New ARProyectoOperaciones
    For Each m_ID In p_col
        Set m_ARProyecto = p_col(m_ID)
        With m_AROp
            Set .AR = m_ARProyecto
            .ActualizarDatosCalculados p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End With
        
        Set m_ARProyecto = Nothing
    Next
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarDatosARsProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function ActualizarDatosARsAuditoria( _
                                            p_col As Scripting.Dictionary, _
                                            Optional ByRef p_Error As String) As String
    
    Dim m_ARAuditoria As ARAuditoria
    Dim m_ID As Variant
    Dim m_AROp As ARAuditoriaOperaciones
    On Error GoTo errores
    If p_col Is Nothing Then
        Exit Function
    End If
    Set m_AROp = New ARAuditoriaOperaciones
    For Each m_ID In p_col
        Set m_ARAuditoria = p_col(m_ID)
        With m_AROp
            Set .AR = m_ARAuditoria
            .ActualizarDatosCalculados p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End With
        
        Set m_ARAuditoria = Nothing
    Next
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarDatosARsAuditoria ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function ActualizarDatosNCProyecto( _
                                            p_NC As NCProyecto, _
                                            Optional ByRef p_Error As String) As String
    
    
    Dim m_NCOp As NCProyectoOperaciones
    Dim m_ACProyecto As ACProyecto
    Dim m_ID As Variant
    
    On Error GoTo errores
    If p_NC Is Nothing Then
        Exit Function
    End If
    Set m_NCOp = New NCProyectoOperaciones
    With m_NCOp
        Set .nc = p_NC
        .ActualizarDatosCalculados p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    ' --- INTEGRACIÓN CACHÉ ---
    ' ActualizarDatosCalculados puede cambiar campos calculados antes de EstadoGrabar;
    ' dejamos detalle y listado regenerados y válidos, no solo marcados como stale.
    If Not CacheNCProyecto.RegenerarRegistro(CStr(p_NC.IDNoConformidad), p_Error) Then
        Err.Raise 1000
    End If
    ' -------------------------
    Set m_ObjNCProyectoActiva = p_NC
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarDatosNCProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function ActualizarDatosNCAuditoria( _
                                            p_NC As NCAuditoria, _
                                            Optional ByRef p_Error As String) As String
    
    
    Dim m_NCOp As NCaUDITORIAOperaciones
    Dim m_ACAuditoria As ACAuditoria
    Dim m_ID As Variant
    
    On Error GoTo errores
    If p_NC Is Nothing Then
        Exit Function
    End If
    Set m_NCOp = New NCaUDITORIAOperaciones
    With m_NCOp
        Set .nc = p_NC
        .ActualizarDatosCalculados p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarDatosNCAuditoria ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function ActualizarDatosNCsProyecto( _
                                        p_col As Scripting.Dictionary, _
                                        Optional ByRef p_Error As String) As String
    
    Dim m_NC As NCProyecto
    Dim m_IDNC As Variant
    Dim m_NCOp As NCProyectoOperaciones
    Dim m_ACProyecto As ACProyecto
    Dim m_ID As Variant
    
    On Error GoTo errores
    If p_col Is Nothing Then
        Exit Function
    End If
    Set m_NCOp = New NCProyectoOperaciones
    For Each m_IDNC In p_col
        Set m_NC = p_col(m_IDNC)
        With m_NCOp
            Set .nc = m_NC
            .ActualizarDatosCalculados p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End With
        
        Set m_NC = Nothing
    Next
    
   
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarDatosNCsProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function ActualizarDatosNCsAuditoria( _
                                            p_col As Scripting.Dictionary, _
                                            Optional ByRef p_Error As String) As String
        
    Dim m_NC As NCAuditoria
    Dim m_IDNC As Variant
    Dim m_NCOp As NCaUDITORIAOperaciones
    Dim m_ACAuditoria As ACAuditoria
    Dim m_ID As Variant
    
    On Error GoTo errores
    If p_col Is Nothing Then
        Exit Function
    End If
    Set m_NCOp = New NCaUDITORIAOperaciones
    For Each m_IDNC In p_col
        Set m_NC = p_col(m_IDNC)
        With m_NCOp
            Set .nc = m_NC
            .ActualizarDatosCalculados p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End With
        
        Set m_NC = Nothing
    Next
    
   
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ActualizarDatosNCsAuditoria ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function SincronizarNCProyectoVinculada( _
                                                p_NCDestino As NCProyecto, _
                                                Optional ByRef p_Error As String _
                                                ) As NCProyecto
    
    'p_NCDestino es la NC a la que se le va a vincular a otra que se va a llamar m_NCVinculada
    'Ciertos campos ColCamposVarianEnVinculacionNC han de ser copiados de m_NCVinculada a p_NCDestino
    
    
    Dim m_SQL As String
    Dim rcdDatos As DAO.Recordset
    Dim m_NCVinculada As NCProyecto
    Dim m_Valor As String
    Dim m_IDAC As Variant
    Dim m_ACProyecto As ACProyecto
    Dim m_ACDestino As ACProyecto
    Dim m_IDAR As Variant
    Dim m_ARProyecto As ARProyecto
    Dim m_ARDestino As ARProyecto
    Dim m_ACOp As ACProyectoOperaciones
    Dim m_AROp As ARProyectoOperaciones
    Dim m_Campo As Variant
    Dim m_EstadoVinculado As String
    Dim m_EstadoDestinoPersistido As String
    Dim m_TieneEstadoVinculado As Boolean
    Dim m_NumeroError As Long
    Dim m_DescripcionError As String
    On Error GoTo errores
    
    p_Error = ""
    If p_NCDestino Is Nothing Then
        Exit Function
    End If
    If p_NCDestino.IDNoConformidad = "" Then
        Exit Function
    End If
    Set m_NCVinculada = p_NCDestino.NCProyectoAsociada
    p_Error = p_NCDestino.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_NCVinculada Is Nothing Then
        Exit Function
    End If
    m_SQL = "SELECT * " & _
            "FROM TbNoConformidades " & _
            "WHERE IDNoConformidad=" & p_NCDestino.IDNoConformidad & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            m_EstadoDestinoPersistido = Nz(.Fields("ESTADO").Value, "")
            .Edit
                For Each m_Campo In m_NCVinculada.ColCamposParaCopiarDeVinculada
                    m_Valor = m_NCVinculada.getPropiedad(m_Campo, p_Error)
                    If p_Error <> "" Then
                        Err.Raise 1000
                    End If
                    p_NCDestino.SetPropiedad m_Campo, m_Valor, p_Error
                    If p_Error <> "" Then
                        Err.Raise 1000
                    End If
                    If StrComp(CStr(m_Campo), "ESTADO", vbTextCompare) = 0 Then
                        m_EstadoVinculado = m_Valor
                        m_TieneEstadoVinculado = True
                        GoTo siguiente
                    End If
                    If m_Valor = "Verdadero" Or m_Valor = "True" Or m_Valor = "Falso" Or m_Valor = "False" Then
                        .Fields(m_Campo).Value = CBool(m_Valor)
                    Else
                        If m_Valor <> "" Then
                            .Fields(m_Campo).Value = m_Valor
                        Else
                            .Fields(m_Campo).Value = Null
                        End If
                    End If
                    
siguiente:
                Next
            .Update
        End If
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    If m_TieneEstadoVinculado Then
        If Trim$(m_EstadoVinculado) <> "" Then
            p_NCDestino.Estado = m_EstadoDestinoPersistido
            p_NCDestino.EstadoGrabar m_EstadoVinculado, p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End If
    End If
    'ahora borramos todo lo que pudiera tener de otras cosas p_NCDestino
    m_SQL = "DELETE * " & _
            "FROM TbNCAccionCorrectivas " & _
            "WHERE IDNoConformidad=" & p_NCDestino.IDNoConformidad & ";"
    getdb().Execute m_SQL
    If m_NCVinculada.ACs Is Nothing Then
        Exit Function
    End If
    Set m_ACOp = New ACProyectoOperaciones
    Set m_AROp = New ARProyectoOperaciones
    For Each m_IDAC In m_NCVinculada.ACs
        Set m_ACProyecto = m_NCVinculada.ACs(m_IDAC)
        Set m_ACDestino = New ACProyecto
        m_ACDestino.AccionCorrectiva = m_ACProyecto.AccionCorrectiva
        m_ACDestino.Estado = m_ACProyecto.Estado
        m_ACDestino.FechaAccionCorrectiva = m_ACProyecto.FechaAccionCorrectiva
        m_ACDestino.FechaFinalUltima = m_ACProyecto.FechaFinalUltima
        m_ACDestino.FechaFinPrevistaUltima = m_ACProyecto.FechaFinPrevistaUltima
        m_ACDestino.FechaInicialMinima = m_ACProyecto.FechaInicialMinima
        m_ACDestino.IDNoConformidad = p_NCDestino.IDNoConformidad
        m_ACDestino.NAccion = m_ACProyecto.NAccion
        m_ACDestino.Notas = m_ACProyecto.Notas
        m_ACDestino.Responsable = m_ACProyecto.Responsable
        Set m_ACOp.AC = m_ACDestino
        m_ACOp.Registrar , p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If Not m_ACProyecto.ARs Is Nothing Then
            For Each m_IDAR In m_ACProyecto.ARs
                Set m_ARProyecto = m_ACProyecto.ARs(m_IDAR)
                Set m_ARDestino = New ARProyecto
                m_ARDestino.IdAccionCorrectiva = m_ACDestino.IdAccionCorrectiva
                m_ARDestino.AccionRealizada = m_ARProyecto.AccionRealizada
                m_ARDestino.Estado = m_ARProyecto.Estado
                m_ARDestino.FechaAccionRealizada = m_ARProyecto.FechaAccionRealizada
                m_ARDestino.FechaFinPrevista = m_ARProyecto.FechaFinPrevista
                m_ARDestino.FechaFinReal = m_ARProyecto.FechaFinReal
                m_ARDestino.FechaInicio = m_ARProyecto.FechaInicio
                m_ARDestino.NAccion = m_ARProyecto.NAccion
                m_ARDestino.Notas = m_ARProyecto.Notas
                m_ARDestino.Responsable = m_ARProyecto.Responsable
                
                Set m_AROp.AR = m_ARDestino
                m_AROp.Registrar , p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                
                Set m_ARDestino = Nothing
                Set m_ARProyecto = Nothing
            Next
        End If
        Set m_ACDestino = Nothing
        Set m_ACProyecto = Nothing
    Next
    
    
    Exit Function
errores:
    m_NumeroError = Err.Number
    m_DescripcionError = Err.Description
    On Error Resume Next
    If Not rcdDatos Is Nothing Then
        rcdDatos.Close
        Set rcdDatos = Nothing
    End If
    If m_NumeroError <> 1000 Then
        p_Error = "El método SincronizarNCProyectoVinculada ha devuelto el error: " & vbNewLine & m_DescripcionError
    End If
End Function
Public Function getURLCarpetaAnexoAuditoria( _
                                            p_Auditoria As Auditoria, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    
    
   
    
    
    
    On Error GoTo errores
    
    
    getURLCarpetaAnexoAuditoria = m_ObjEntorno.URLDirectorioDocumentacionAuditorias & p_Auditoria.NombreAuditoria & "\"
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getURLCarpetaAnexoAuditoria ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function getURLCarpetaAnexoNCAuditoria( _
                                            p_NCAuditoria As NCAuditoria, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    
    
   
   
    Dim m_CarpetaAuditoria As String
    
    On Error GoTo errores
    
    m_CarpetaAuditoria = getURLCarpetaAnexoAuditoria(p_NCAuditoria.Auditoria, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    getURLCarpetaAnexoNCAuditoria = m_CarpetaAuditoria & "NC" & p_NCAuditoria.Numero & "\"
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getURLCarpetaAnexoNCAuditoria ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function getURLCarpetaAnexoARAuditoria( _
                                            p_ARAuditoria As ARAuditoria, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    
    
   
    Dim m_AC As ACAuditoria
    Dim m_Auditoria As Auditoria
    Dim m_CarpetaAuditoria As String
    
    On Error GoTo errores
    Set m_Auditoria = p_ARAuditoria.AC.nc.Auditoria
    m_CarpetaAuditoria = getURLCarpetaAnexoAuditoria(m_Auditoria, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    getURLCarpetaAnexoARAuditoria = m_CarpetaAuditoria & "AR" & p_ARAuditoria.NAccion & "\"
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getURLCarpetaAnexoARAuditoria ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function EstablecerComboResponsablesImplantacion( _
                                                        cmb As ComboBox, _
                                                        Optional ByRef p_Error As String _
                                                        ) As String
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_Usuario As usuario
    
    On Error GoTo errores
    
    cmb.RowSource = ""
    Set m_Col = m_ObjEntorno.ColUsuariosCalidad
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then
        Err.Raise 100
    End If
    If Not m_Col Is Nothing Then
        
        For Each m_ID In m_Col
            Set m_Usuario = m_Col(m_ID)
            cmb.AddItem m_Usuario.Nombre
            Set m_Usuario = Nothing
        Next
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerComboResponsablesImplantacion ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function EstablecerComboPuntosNormaNCAuditorias( _
                                                        cmb As ComboBox, _
                                                        Optional ByRef p_Error As String _
                                                        ) As String
    Dim m_Col As Scripting.Dictionary
    Dim m_PuntoNorma As Variant
    
    
    On Error GoTo errores
    
    cmb.RowSource = ""
    Set m_Col = m_ObjEntorno.ColPuntosNormaNCAuditorias
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then
        Err.Raise 100
    End If
    If Not m_Col Is Nothing Then
        For Each m_PuntoNorma In m_Col
            If Trim(m_PuntoNorma) <> "" Then
                cmb.AddItem m_PuntoNorma
            End If
            
        Next
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerComboPuntosNormaNCAuditorias ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function EstablecerComboAuditoriasNombres( _
                                                cmb As ComboBox, _
                                                Optional ByRef p_Error As String _
                                                ) As String
   
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_Auditoria As Auditoria
   
    
    On Error GoTo errores
    
    cmb.RowSource = ""
    Set m_Col = m_ObjEntorno.ColAuditorias
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_Auditoria = m_Col(m_ID)
        cmb.AddItem m_ID & ";" & m_Auditoria.NombreAuditoria
        Set m_Auditoria = Nothing
    Next
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerComboAuditoriasNombres ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function RellenarTbProyectoParaLista( _
                                                p_NC As NCProyecto, _
                                                Optional ByRef p_Error As String _
                                                ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_IDAR As Variant
    Dim m_AR As ARProyecto
    Dim m_IDAC As Variant
    Dim m_AC As ACProyecto
    
    
    On Error GoTo errores
    
    p_Error = ""
    m_SQL = "DELETE * " & _
        "FROM TbACParaLista;"
    CurrentDb().Execute (m_SQL)
    m_SQL = "DELETE * " & _
        "FROM TbARParaLista;"
    CurrentDb().Execute (m_SQL)
    If p_NC.ACs Is Nothing Then
        Exit Function
    End If
   
    
    For Each m_IDAC In p_NC.ACs
        Set m_AC = p_NC.ACs(m_IDAC)
        m_SQL = "TbACParaLista"
        Set rcdDatos = CurrentDb().OpenRecordset(m_SQL)
        With m_AC
            rcdDatos.AddNew
                rcdDatos.Fields("IDAccionAC") = .IdAccionCorrectiva
                If IsNumeric(.NAccion) Then
                    If .NAccion <> "0" Then
                        rcdDatos.Fields("NAccion") = .NAccion
                    End If
                End If
                If .AccionCorrectiva <> "" Then
                    rcdDatos.Fields("Accion") = .AccionCorrectiva
                End If
                If .Estado <> "" Then
                    rcdDatos.Fields("Estado") = .Estado
                End If
                If IsDate(.FechaInicialMinima) Then
                    rcdDatos.Fields("FechaInicial") = .FechaInicialMinima
                End If
                If IsDate(.FechaFinalUltima) Then
                    rcdDatos.Fields("FechaFinal") = .FechaFinalUltima
                End If
                If IsDate(.FechaFinPrevistaUltima) Then
                    rcdDatos.Fields("FechaFinPrevista") = .FechaFinPrevistaUltima
                End If
                If Not .ResponsableObj Is Nothing Then
                    rcdDatos.Fields("Responsable") = .ResponsableObj.Nombre
                End If
            rcdDatos.Update
        End With
        If Not m_AC.ARs Is Nothing Then
             m_SQL = "TbARParaLista"
            Set rcdDatos = CurrentDb().OpenRecordset(m_SQL)
            For Each m_IDAR In m_AC.ARs
                Set m_AR = m_AC.ARs(m_IDAR)
                With m_AR
                    rcdDatos.AddNew
                        rcdDatos.Fields("IDAccionAR") = .IDAccionRealizada
                        rcdDatos.Fields("IDAccionAC") = m_AC.IdAccionCorrectiva
                        If IsNumeric(.NAccion) Then
                            If .NAccion <> "0" Then
                                rcdDatos.Fields("NAccion") = .NAccion
                            End If
                        End If
                        If .AccionRealizada <> "" Then
                            rcdDatos.Fields("Accion") = .AccionRealizada
                        End If
                        If .Estado <> "" Then
                            rcdDatos.Fields("Estado") = .Estado
                        End If
                        If IsDate(.FechaInicio) Then
                            rcdDatos.Fields("FechaInicial") = .FechaInicio
                        End If
                        If IsDate(.FechaFinReal) Then
                            rcdDatos.Fields("FechaFinal") = .FechaFinReal
                        End If
                        If IsDate(.FechaFinPrevista) Then
                            rcdDatos.Fields("FechaFinPrevista") = .FechaFinPrevista
                        End If
                        If Not .ResponsableObj Is Nothing Then
                            rcdDatos.Fields("Responsable") = .ResponsableObj.Nombre
                        End If
                    rcdDatos.Update
                  
                End With
                Set m_AR = Nothing
            Next
        End If
        
        
        Set m_AC = Nothing
    Next
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarTbProyectoParaLista ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function EstablecerComboOrdenarPor( _
                                            cmb As ComboBox, _
                                            Optional ByRef p_Error As String _
                                            ) As String
   
    Dim m_Col As Scripting.Dictionary
    Dim m_Titulo As String
    Dim m_ID As Variant
    
    
    On Error GoTo errores
    
    cmb.RowSource = ""
    Set m_Col = m_ObjEntorno.ColEnumOrdenTitulo
    p_Error = m_ObjEntorno.Error
    If p_Error <> "" Then
        Err.Raise 100
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        m_Titulo = m_Col(m_ID)
        cmb.AddItem m_ID & ";" & m_Titulo
        
    Next
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerComboOrdenarPor ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function PuntoNormaAuditoriaRegistrar( _
                                            p_PuntoNorma As String, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    
    On Error GoTo errores
    If p_PuntoNorma = "" Then
        Exit Function
    End If
    m_SQL = "SELECT * " & _
            "FROM TbAuxPuntoNorma " & _
            "WHERE PuntoNorma='" & p_PuntoNorma & "';"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If rcdDatos.EOF Then
        PuntoNormaAuditoriaRegistrar = "1"
        rcdDatos.AddNew
            rcdDatos.Fields("PuntoNorma") = p_PuntoNorma
        rcdDatos.Update
    Else
        PuntoNormaAuditoriaRegistrar = "0"
    End If
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método PuntoNormaAuditoriaRegistrar ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function EnviarCorreoAltaNCProyecto( _
                                            ByRef p_NC As NCProyecto, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim m_mensaje As String
    Dim m_Correo As Correo
    
    On Error GoTo errores
    
    p_Error = ""
    m_mensaje = HTMLAltaNC(p_NC:=p_NC, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_mensaje = AgregarCabeceraCorreoPruebas(p_Mensaje:=m_mensaje, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ObjUsuarioConectado.UsuarioRed = "adm" And Application.TempVars("EnPruebas") = "Sí" Then
        HTMLENTXT p_HTML:=m_mensaje, p_Error:=p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    Set m_Correo = New Correo
    With m_Correo
        If Application.TempVars("EnPruebas") = "Sí" Then
            .DESTINATARIOS = m_ObjEntorno.CadenaCorreosCalidadEnPruebas
        Else
            .DESTINATARIOS = m_ObjEntorno.CadenaCorreosCalidad
        End If
        .DestinatariosConCopia = m_ObjUsuarioConectado.CorreoUsuario
        .Cuerpo = m_mensaje
        .Asunto = "Alta de No Conformidad de proyecto " & p_NC.CodigoNoConformidad & "(No Conformidades)"
        .Registrar p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo EnviarCorreoAltaNCProyecto ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function EnviarCorreoAltaNCAuditoria( _
                                            ByRef p_NC As NCAuditoria, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim m_mensaje As String
    Dim m_Correo As Correo
    
    On Error GoTo errores
    
    p_Error = ""
    m_mensaje = HTMLAltaNCAuditoria(p_NC:=p_NC, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_mensaje = AgregarCabeceraCorreoPruebas(p_Mensaje:=m_mensaje, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ObjUsuarioConectado.UsuarioRed = "adm" And Application.TempVars("EnPruebas") = "Sí" Then
        HTMLENTXT p_HTML:=m_mensaje, p_Error:=p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Exit Function
    End If
    Set m_Correo = New Correo
    With m_Correo
        If Application.TempVars("EnPruebas") = "Sí" Then
            .DESTINATARIOS = m_ObjEntorno.CadenaCorreosCalidadEnPruebas
            '.DESTINATARIOS = "andres.romandelperal@telefonica.com"
        Else
            .DESTINATARIOS = m_ObjEntorno.CadenaCorreosCalidad
        End If
        .DestinatariosConCopia = m_ObjUsuarioConectado.CorreoUsuario
        .Cuerpo = m_mensaje
        .Asunto = "Alta de " & CapitalizarOracion(p_NC.Particula) & " de auditoría " & p_NC.Auditoria.NombreAuditoria & " " & _
            Format(p_NC.Numero, "00") & "(No Conformidades)"
        .Registrar p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo EnviarCorreoAltaNCAuditoria ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Function AgregarCabeceraCorreoPruebas( _
                                            p_Mensaje As String, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim m_DestinatariosProduccion As String

    On Error GoTo errores

    If Application.TempVars("EnPruebas") <> "Sí" Then
        AgregarCabeceraCorreoPruebas = p_Mensaje
        Exit Function
    End If

    m_DestinatariosProduccion = m_ObjEntorno.CadenaCorreosCalidad
    AgregarCabeceraCorreoPruebas = "<p><strong>Este correo en producción hubiera ido a:</strong> " & m_DestinatariosProduccion & "</p>" & p_Mensaje
    Exit Function
errores:
    p_Error = "El método AgregarCabeceraCorreoPruebas ha devuelto el error: " & vbNewLine & Err.Description
    AgregarCabeceraCorreoPruebas = p_Mensaje
End Function

Public Function getAlgunaAccionPteReplanificar( _
                                            ByRef p_ID As String, _
                                            p_EsDeProyecto As EnumSino, _
                                            Optional ByRef p_Error As String _
                                            ) As EnumSino
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_NombreTabla As String
    
    On Error GoTo errores
    If p_EsDeProyecto = EnumSino.Sí Then
        m_NombreTabla = "TbNCAccionesRealizadas"
    ElseIf p_EsDeProyecto = EnumSino.No Then
        m_NombreTabla = "TbNCAuditoriaAccionesRealizadas"
    Else
        Exit Function
    End If
    
    m_SQL = "SELECT IDAccionRealizada " & _
            "FROM " & m_NombreTabla & " " & _
            "WHERE IDAccionCorrectiva=" & p_ID & " AND " & _
            "FechaFinReal Is Null AND FechaFinPrevista<Date();"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If rcdDatos.EOF Then
        getAlgunaAccionPteReplanificar = EnumSino.No
    Else
        getAlgunaAccionPteReplanificar = EnumSino.Sí
    End If


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo getAlgunaAccionPteReplanificar ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function getAlgunaAccionIrregular( _
                                            ByRef p_ID As String, _
                                            p_EsDeProyecto As EnumSino, _
                                            Optional ByRef p_Error As String _
                                            ) As EnumSino
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_NombreTabla As String
    
    On Error GoTo errores
    If p_EsDeProyecto = EnumSino.Sí Then
        m_NombreTabla = "TbNCAccionesRealizadas"
    ElseIf p_EsDeProyecto = EnumSino.No Then
        m_NombreTabla = "TbNCAuditoriaAccionesRealizadas"
    Else
        Exit Function
    End If
    
    m_SQL = "SELECT IDAccionRealizada " & _
            "FROM " & m_NombreTabla & " " & _
            "WHERE IDAccionCorrectiva=" & p_ID & " " & _
            "AND Not FechaInicio Is Null " & _
            "AND FechaFinPrevista Is Null;"

    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If rcdDatos.EOF Then
        getAlgunaAccionIrregular = EnumSino.No
    Else
        getAlgunaAccionIrregular = EnumSino.Sí
    End If


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo getAlgunaAccionIrregular ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Public Function getAlgunaAccionActiva( _
                                            ByRef p_ID As String, _
                                            p_EsDeProyecto As EnumSino, _
                                            Optional ByRef p_Error As String _
                                            ) As EnumSino
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_NombreTabla As String
    
    On Error GoTo errores
    If p_EsDeProyecto = EnumSino.Sí Then
        m_NombreTabla = "TbNCAccionesRealizadas"
    ElseIf p_EsDeProyecto = EnumSino.No Then
        m_NombreTabla = "TbNCAuditoriaAccionesRealizadas"
    Else
        Exit Function
    End If
    
    m_SQL = "SELECT IDAccionRealizada " & _
            "FROM " & m_NombreTabla & " " & _
            "WHERE IDAccionCorrectiva=" & p_ID & " AND " & _
            "FechaFinReal Is Null " & _
            "AND Not FechaFinPrevista Is Null;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If rcdDatos.EOF Then
        getAlgunaAccionActiva = EnumSino.No
    Else
        getAlgunaAccionActiva = EnumSino.Sí
    End If


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo getAlgunaAccionActiva ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function getTodasAccionesFinalizadas( _
                                            ByRef p_ID As String, _
                                            p_EsDeProyecto As EnumSino, _
                                            Optional ByRef p_Error As String _
                                            ) As EnumSino
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_NombreTabla As String
    
    On Error GoTo errores
    If p_EsDeProyecto = EnumSino.Sí Then
        m_NombreTabla = "TbNCAccionesRealizadas"
    ElseIf p_EsDeProyecto = EnumSino.No Then
        m_NombreTabla = "TbNCAuditoriaAccionesRealizadas"
    Else
        Exit Function
    End If
    
    m_SQL = "SELECT IDAccionRealizada " & _
            "FROM " & m_NombreTabla & " " & _
            "WHERE IDAccionCorrectiva=" & p_ID & " AND " & _
            "FechaFinreal Is Null;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If rcdDatos.EOF Then
        getTodasAccionesFinalizadas = EnumSino.Sí
    Else
        getTodasAccionesFinalizadas = EnumSino.No
    End If


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo getTodasAccionesFinalizadas ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function getTieneAccionesPorReplanificar( _
                                            ByRef p_ID As String, _
                                            p_EsDeProyecto As EnumSino, _
                                            Optional ByRef p_Error As String _
                                            ) As EnumSino
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_NombreTabla As String
    
    On Error GoTo errores
    If p_EsDeProyecto = EnumSino.Sí Then
        m_NombreTabla = "TbNCAccionesRealizadas"
    ElseIf p_EsDeProyecto = EnumSino.No Then
        m_NombreTabla = "TbNCAuditoriaAccionesRealizadas"
    Else
        Exit Function
    End If
    
    m_SQL = "SELECT IDAccionRealizada " & _
            "FROM " & m_NombreTabla & " " & _
            "WHERE IDAccionCorrectiva=" & p_ID & " AND " & _
            "Not FechaInicio Is Null;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If rcdDatos.EOF Then
        getTieneAccionesPorReplanificar = EnumSino.Sí
    Else
        getTieneAccionesPorReplanificar = EnumSino.No
    End If


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo getTieneAccionesPorReplanificar ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Public Function getFechaInicialMinimaCalculada( _
                                            ByRef p_ID As String, _
                                            p_EsDeProyecto As EnumSino, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_NombreTabla As String
    
    On Error GoTo errores
    If p_EsDeProyecto = EnumSino.Sí Then
        m_NombreTabla = "TbNCAccionesRealizadas"
    ElseIf p_EsDeProyecto = EnumSino.No Then
        m_NombreTabla = "TbNCAuditoriaAccionesRealizadas"
    Else
        Exit Function
    End If
    
    m_SQL = "SELECT Min(FechaInicio) AS MinFecha " & _
            "FROM " & m_NombreTabla & " " & _
            "WHERE IDAccionCorrectiva=" & p_ID & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If Not rcdDatos.EOF Then
        getFechaInicialMinimaCalculada = Nz(rcdDatos.Fields("MinFecha"), "")
        
    End If


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo getFechaInicialMinimaCalculada ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function getFechaFinalUltimaCalculada( _
                                            ByRef p_ID As String, _
                                            p_EsDeProyecto As EnumSino, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_NombreTabla As String
    
    On Error GoTo errores
    If p_EsDeProyecto = EnumSino.Sí Then
        m_NombreTabla = "TbNCAccionesRealizadas"
    ElseIf p_EsDeProyecto = EnumSino.No Then
        m_NombreTabla = "TbNCAuditoriaAccionesRealizadas"
    Else
        Exit Function
    End If
    
    m_SQL = "SELECT Max(FechaFinReal) AS MaxFecha " & _
            "FROM " & m_NombreTabla & " " & _
            "WHERE IDAccionCorrectiva=" & p_ID & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If Not rcdDatos.EOF Then
        getFechaFinalUltimaCalculada = Nz(rcdDatos.Fields("MaxFecha"), "")
        
    End If


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo getFechaFinalUltimaCalculada ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function getFechaFinPrevistaUltimaCalculada( _
                                            ByRef p_ID As String, _
                                            p_EsDeProyecto As EnumSino, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_NombreTabla As String
    
    On Error GoTo errores
    If p_EsDeProyecto = EnumSino.Sí Then
        m_NombreTabla = "TbNCAccionesRealizadas"
    ElseIf p_EsDeProyecto = EnumSino.No Then
        m_NombreTabla = "TbNCAuditoriaAccionesRealizadas"
    Else
        Exit Function
    End If
    
    m_SQL = "SELECT Max(FechaFinPrevista) AS MaxFecha " & _
            "FROM " & m_NombreTabla & " " & _
            "WHERE IDAccionCorrectiva=" & p_ID & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If Not rcdDatos.EOF Then
        getFechaFinPrevistaUltimaCalculada = Nz(rcdDatos.Fields("MaxFecha"), "")
        
    End If


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo getFechaFinPrevistaUltimaCalculada ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function getFECHACIERRENCCalculada( _
                                            ByRef p_ID As String, _
                                            p_EsDeProyecto As EnumSino, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_NombreTabla As String
    
    On Error GoTo errores
    If p_EsDeProyecto = EnumSino.Sí Then
        m_SQL = "SELECT Max(FechaFinReal) AS MaxFecha " & _
                "FROM TbNCAccionCorrectivas INNER JOIN TbNCAccionesRealizadas " & _
                "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva " & _
                "WHERE IDNoConformidad=" & p_ID & ";"
    ElseIf p_EsDeProyecto = EnumSino.No Then
        m_SQL = "SELECT Max(FechaFinReal) AS MaxFecha " & _
                "FROM TbNCAuditoriaAccionCorrectivas INNER JOIN TbNCAuditoriaAccionesRealizadas " & _
                "ON TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva = TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva " & _
                "WHERE ID=" & p_ID & ";"
    Else
        Exit Function
    End If
    
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If Not rcdDatos.EOF Then
        getFECHACIERRENCCalculada = Nz(rcdDatos.Fields("MaxFecha"), "")
        
    End If


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo getFECHACIERRENCCalculada ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function getFPREVCIERRENCCalculada( _
                                            ByRef p_ID As String, _
                                            p_EsDeProyecto As EnumSino, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    
    On Error GoTo errores
    If p_EsDeProyecto = EnumSino.Sí Then
        m_SQL = "SELECT Max(FechaFinPrevista) AS MaxFecha " & _
                "FROM TbNCAccionCorrectivas INNER JOIN TbNCAccionesRealizadas " & _
                "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva " & _
                "WHERE IDNoConformidad=" & p_ID & ";"
    ElseIf p_EsDeProyecto = EnumSino.No Then
        m_SQL = "SELECT Max(FechaFinPrevista) AS MaxFecha " & _
                "FROM TbNCAuditoriaAccionCorrectivas INNER JOIN TbNCAuditoriaAccionesRealizadas " & _
                "ON TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva = TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva " & _
                "WHERE ID=" & p_ID & ";"
    Else
        Exit Function
    End If
    
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If Not rcdDatos.EOF Then
        getFPREVCIERRENCCalculada = Nz(rcdDatos.Fields("MaxFecha"), "")
        
    End If


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo getFPREVCIERRENCCalculada ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function getNAccionACCalculado( _
                                            ByRef p_ID As String, _
                                            p_EsDeProyecto As EnumSino, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    
    On Error GoTo errores
    If p_EsDeProyecto = EnumSino.Sí Then
         m_SQL = "SELECT Max(NAccion) AS MaxNAccion " & _
                "FROM TbNCAccionCorrectivas " & _
                "WHERE IDNoConformidad=" & p_ID & ";"
    ElseIf p_EsDeProyecto = EnumSino.No Then
        m_SQL = "SELECT Max(NAccion) AS MaxNAccion " & _
                "FROM TbNCAuditoriaAccionCorrectivas " & _
                "WHERE ID=" & p_ID & ";"
    Else
        Exit Function
    End If
    
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If Not rcdDatos.EOF Then
        If IsNumeric(Nz(rcdDatos.Fields("MaxNAccion"), "")) Then
            getNAccionACCalculado = CStr(rcdDatos.Fields("MaxNAccion") + 1)
        Else
            getNAccionACCalculado = "1"
        End If
        
        
    End If


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo getNAccionACCalculado ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function getTieneAccionesNCPorReplanificar( _
                                                    ByRef p_ID As String, _
                                                    p_EsDeProyecto As EnumSino, _
                                                    Optional ByRef p_Error As String _
                                                    ) As EnumSino
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    
    On Error GoTo errores
    If p_EsDeProyecto = EnumSino.Sí Then
        m_SQL = "SELECT IDNoConformidad " & _
                "FROM TbNCAccionCorrectivas INNER JOIN TbNCAccionesRealizadas " & _
                "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva " & _
                "WHERE IDNoConformidad=" & p_ID & " " & _
                "AND FechaFinReal Is Null AND FechaFinPrevista<Date() ;"
    ElseIf p_EsDeProyecto = EnumSino.No Then
        m_SQL = "SELECT ID " & _
                "FROM TbNCAuditoriaAccionCorrectivas INNER JOIN TbNCAuditoriaAccionesRealizadas " & _
                "ON TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva = TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva " & _
                "WHERE ID=" & p_ID & " " & _
                "AND FechaFinReal Is Null AND FechaFinPrevista<Date() ;"
    Else
        Exit Function
    End If
    
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If rcdDatos.EOF Then
        getTieneAccionesNCPorReplanificar = EnumSino.No
    Else
        getTieneAccionesNCPorReplanificar = EnumSino.Sí
    End If


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo getTieneAccionesNCPorReplanificar ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function getTodasLasACsSinFechas( _
                                            ByRef p_ID As String, _
                                            p_EsDeProyecto As EnumSino, _
                                            Optional ByRef p_Error As String _
                                            ) As EnumSino
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    
    On Error GoTo errores
    If p_EsDeProyecto = EnumSino.Sí Then
        m_SQL = "SELECT TbNCAccionCorrectivas.IDAccionCorrectiva " & _
                "FROM TbNCAccionCorrectivas INNER JOIN TbNCAccionesRealizadas " & _
                "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva " & _
                "WHERE IDNoConformidad=" & p_ID & " " & _
                "AND Not FechaInicio Is Null ;"
    ElseIf p_EsDeProyecto = EnumSino.No Then
        m_SQL = "SELECT TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva " & _
                "FROM TbNCAuditoriaAccionCorrectivas INNER JOIN TbNCAuditoriaAccionesRealizadas " & _
                "ON TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva = TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva " & _
                "WHERE ID=" & p_ID & " " & _
                "AND Not FechaInicio Is Null ;"
    Else
        Exit Function
    End If
    
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If rcdDatos.EOF Then
        getTodasLasACsSinFechas = EnumSino.Sí
    Else
        getTodasLasACsSinFechas = EnumSino.No
    End If


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo getTodasLasACsSinFechas ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function getTodasLasArsFinalizadas( _
                                            ByRef p_ID As String, _
                                            p_EsDeProyecto As EnumSino, _
                                            Optional ByRef p_Error As String _
                                            ) As EnumSino
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    
    On Error GoTo errores
    If p_EsDeProyecto = EnumSino.Sí Then
        m_SQL = "SELECT TbNCAccionCorrectivas.IDAccionCorrectiva " & _
                "FROM TbNCAccionCorrectivas INNER JOIN TbNCAccionesRealizadas " & _
                "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva " & _
                "WHERE IDNoConformidad=" & p_ID & " " & _
                "AND FechaFinReal Is Null ;"
    ElseIf p_EsDeProyecto = EnumSino.No Then
        m_SQL = "SELECT TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva " & _
                "FROM TbNCAuditoriaAccionCorrectivas INNER JOIN TbNCAuditoriaAccionesRealizadas " & _
                "ON TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva = TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva " & _
                "WHERE ID=" & p_ID & " " & _
                "AND FechaFinReal Is Null ;"
    Else
        Exit Function
    End If
    
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If rcdDatos.EOF Then
        getTodasLasArsFinalizadas = EnumSino.Sí
    Else
        getTodasLasArsFinalizadas = EnumSino.No
    End If


    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El metodo getTodasLasArsFinalizadas ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Public Function GenerarWordNoConformidades( _
                                            p_EsDeProyecto As EnumSino, _
                                            Optional p_col As Scripting.Dictionary, _
                                            Optional p_NC As Object, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    Dim m_Informe As Informe
    Dim m_URL As String
    
    On Error GoTo errores
    If p_EsDeProyecto = Empty Then
        p_Error = "No se sabe si es o no de proyecto"
        Err.Raise 1000
    End If
    If p_col Is Nothing And p_NC Is Nothing Then
        p_Error = "Falta una NC o una colección"
        Err.Raise 1000
    End If
    Set m_Informe = New Informe
    With m_Informe
        m_URL = .GenerarWordNoConformidades(p_EsDeProyecto, p_col, p_NC, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    Set m_Informe = Nothing
    If Not fso.FileExists(m_URL) Then
        p_Error = "No se ha podido obtener la url del documento"
        Err.Raise 1000
    End If
    Avance "Abriendo el informe..."
    Ejecutar 1, "open", m_URL, "", "", 1
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GenerarWordNoConformidades ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Public Function ExpedienteSeleccionado( _
                                        p_Exp As Expediente, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    
    Dim m_Form As Form
   
    On Error GoTo errores
    If FormularioAbierto("FormNCProyecto") Then
        If Forms("FormNCProyecto").Controls("FrmDetalle").SourceObject = "FormNCProyectoGeneral" Then
            Set m_Form = Forms("FormNCProyecto").Controls("FrmDetalle").Form
            With p_Exp
                m_Form.IDExpediente = .IDExpediente
                If .Nemotecnico <> "" Then
                    m_Form.Titulo = .Nemotecnico
                ElseIf .CodExp <> "" Then
                    m_Form.Titulo = .CodExp
                Else
                    m_Form.Titulo = .IDExpediente
                End If
                m_Form.PalabraClave = Null
            End With
        End If
    End If
    
   

    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ExpedienteSeleccionado ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function CapitalizarOracion(texto As String) As String
    Dim i As Integer
    Dim resultado As String
    Dim siguienteMayuscula As Boolean

    texto = LCase(texto)
    siguienteMayuscula = True
    resultado = ""

    For i = 1 To Len(texto)
        Dim c As String
        c = Mid(texto, i, 1)
        If siguienteMayuscula And c Like "[a-záéíóúüñ]" Then
            resultado = resultado & UCase(c)
            siguienteMayuscula = False
        Else
            resultado = resultado & c
        End If
        If c = "." Then
            siguienteMayuscula = True
        ElseIf c <> " " And c <> vbTab And c <> vbCr And c <> vbLf Then
            ' No activar mayúscula salvo tras punto
        End If
    Next i

    CapitalizarOracion = resultado
End Function
Public Function TareasAExcel(p_col As Scripting.Dictionary, Optional p_Tipo As String, Optional ByRef p_Error As String) As String
    
    
    Dim m_Tarea As ARProyecto
    Dim m_TareaSeg As SegTareasProyecto
    Dim m_ID As Variant
    Dim m_Valor As String
    Dim wbLibro As Excel.Workbook
    Dim wbHoja As Excel.Worksheet
    Dim MiRango As Excel.Range
    Dim intFila As Integer
    Dim intColumnas As Integer
    Dim m_URLExcel As String
    Dim m_NombreInforme As String
    Dim AppExcel As Excel.Application
    Dim i As Integer
    
    On Error GoTo errores
    
    
    
    If p_col Is Nothing Then
        p_Error = "No se ha obtenido ningún registro"
        Err.Raise 1000
    End If
    If p_Tipo = "" Then
        p_Tipo = "Activas"
    End If
    Avance "Obteniendo ruta final ...."
    
    m_NombreInforme = "Tareas_Filtradas_" & Format(Year(Now()), "yyyy") & "_" & Format(Month(Now()), "yyyy") & "_" & Format(Day(Now()), "dd") & ".xlsx"
    m_URLExcel = m_ObjEntorno.URLDirectorioLocal & "Informes\" & m_NombreInforme
    If Not fso.FolderExists(fso.GetParentFolderName(m_URLExcel)) Then
        fso.CreateFolder fso.GetParentFolderName(m_URLExcel)
    End If
    If fso.FileExists(m_URLExcel) Then
       
        If FicheroAbierto(m_URLExcel) Then
            p_Error = "Tiene abierto un informe anterior"
            Err.Raise 1000
        End If
    End If
    Avance "Abriendo Excel ...."
    Set AppExcel = New Excel.Application
    AppExcel.Visible = False
    Set wbLibro = AppExcel.Workbooks.Add
    Set wbHoja = wbLibro.Worksheets(1)
    
    
    intFila = 3
    
    
    
    With wbHoja
        .Cells(intFila, 1).Value = "Nemotécnico"
        .Cells(intFila, 2).Value = "NC"
        .Cells(intFila, 3).Value = "Nº Tarea"
        .Cells(intFila, 4).Value = "Tarea"
        .Cells(intFila, 5).Value = "Responsable"
        .Cells(intFila, 6).Value = "Estado"
        .Cells(intFila, 7).Value = "Fecha inicio"
        .Cells(intFila, 8).Value = "Fecha prev. cierre"
        .Cells(intFila, 9).Value = "Tipo NC"
        .Name = Format(Day(Date), "00") & "_" & Format(Month(Date), "00") & "_" & Format(Year(Date), "0000")
        intColumnas = 9
        Set MiRango = .Range(.Cells(intFila, 1), .Cells(intFila, intColumnas))
        With MiRango
            .Font.Bold = True
            .HorizontalAlignment = xlCenter
            .VerticalAlignment = xlCenter
            .WrapText = False
            .Orientation = 0
            .AddIndent = False
            .IndentLevel = 0
            .ShrinkToFit = False
            .ReadingOrder = xlContext
            .MergeCells = False
            With .Interior
                .Pattern = xlSolid
                .PatternColorIndex = xlAutomatic
                .ThemeColor = xlThemeColorAccent4
                .TintAndShade = 0
                .PatternTintAndShade = 0
            End With
        End With
    End With
    With wbHoja
        For Each m_ID In p_col
            intFila = intFila + 1
            'If intFila = 342 Then Stop
            Set m_TareaSeg = p_col(m_ID)
            Set m_Tarea = m_TareaSeg.AR
            
            
            'Debug.Print m_Tarea.CODPROYECTOS
            If Not m_Tarea.AC.nc.ExpedienteObj Is Nothing Then
                If m_Tarea.AC.nc.ExpedienteObj.Nemotecnico <> "" Then
                    m_Valor = m_Tarea.AC.nc.ExpedienteObj.Nemotecnico
                Else
                    m_Valor = m_Tarea.AC.nc.ExpedienteObj.CodExp
                End If
            Else
                m_Valor = ""
            End If
            .Cells(intFila, 1).Value = m_Valor
            .Cells(intFila, 2).Value = m_Tarea.AC.nc.CodigoNoConformidad
            .Cells(intFila, 3).Value = Format(m_Tarea.NAccion, "00")
            .Cells(intFila, 4).Value = m_Tarea.AccionRealizada
            If Not m_Tarea.ResponsableObj Is Nothing Then
                m_Valor = m_Tarea.ResponsableObj.Nombre
            Else
                m_Valor = ""
            End If
            Avance "Tarea " & Format(m_Tarea.NAccion, "00") & " de NC " & m_Tarea.AC.nc.CodigoNoConformidad & " AC " & _
                        Format(m_Tarea.AC.NAccion, "00") & " ..."
            .Cells(intFila, 5).Value = m_Valor
            .Cells(intFila, 6).Value = m_Tarea.EstadoCalculadoTexto
            If IsDate(m_Tarea.FechaInicio) Then
                m_Valor = Format(m_Tarea.FechaInicio, "mm/dd/yyyy")
                .Cells(intFila, 7).Value = m_Valor
                Set MiRango = .Range(.Cells(intFila, 7), .Cells(intFila, 7))
                MiRango.NumberFormat = "dd/mm/yyyy"
            End If
            If IsDate(m_Tarea.FechaFinPrevista) Then
                m_Valor = Format(m_Tarea.FechaFinPrevista, "mm/dd/yyyy")
                .Cells(intFila, 8).Value = m_Valor
                Set MiRango = .Range(.Cells(intFila, 8), .Cells(intFila, 8))
                MiRango.NumberFormat = "dd/mm/yyyy"
            End If
            If Not m_Tarea.AC.nc.TipoNCProyecto Is Nothing Then
                m_Valor = m_Tarea.AC.nc.TipoNCProyecto.Tipologia
            Else
                m_Valor = ""
            End If
            .Cells(intFila, 9).Value = m_Valor
            
            
            
            Set m_Tarea = Nothing
            Set m_TareaSeg = Nothing
        Next
    End With
    
    With wbHoja
        Set MiRango = .Range(.Cells(3, 1), .Cells(intFila, intColumnas))
        With MiRango
            .Borders(xlDiagonalDown).LineStyle = xlNone
            .Borders(xlDiagonalUp).LineStyle = xlNone
            With .Borders(xlEdgeLeft)
                .LineStyle = xlContinuous
                .ColorIndex = xlAutomatic
                .TintAndShade = 0
                .Weight = xlMedium
            End With
            With .Borders(xlEdgeTop)
                .LineStyle = xlContinuous
                .ColorIndex = xlAutomatic
                .TintAndShade = 0
                .Weight = xlMedium
            End With
            With .Borders(xlEdgeBottom)
                .LineStyle = xlContinuous
                .ColorIndex = xlAutomatic
                .TintAndShade = 0
                .Weight = xlMedium
            End With
            With .Borders(xlEdgeRight)
                .LineStyle = xlContinuous
                .ColorIndex = xlAutomatic
                .TintAndShade = 0
                .Weight = xlMedium
            End With
            With .Borders(xlInsideVertical)
                .LineStyle = xlContinuous
                .ColorIndex = xlAutomatic
                .TintAndShade = 0
                .Weight = xlThin
            End With
            With .Borders(xlInsideHorizontal)
                .LineStyle = xlContinuous
                .ColorIndex = xlAutomatic
                .TintAndShade = 0
                .Weight = xlThin
            End With
         End With
        Set MiRango = .Range(.Cells(3, 1), .Cells(2, intColumnas))
        With MiRango
            .Borders(xlDiagonalDown).LineStyle = xlNone
            .Borders(xlDiagonalUp).LineStyle = xlNone
            With .Borders(xlEdgeLeft)
                .LineStyle = xlContinuous
                .ColorIndex = xlAutomatic
                .TintAndShade = 0
                .Weight = xlMedium
            End With
            With .Borders(xlEdgeTop)
                .LineStyle = xlContinuous
                .ColorIndex = xlAutomatic
                .TintAndShade = 0
                .Weight = xlMedium
            End With
            With .Borders(xlEdgeBottom)
                .LineStyle = xlContinuous
                .ColorIndex = xlAutomatic
                .TintAndShade = 0
                .Weight = xlMedium
            End With
            With .Borders(xlEdgeRight)
                .LineStyle = xlContinuous
                .ColorIndex = xlAutomatic
                .TintAndShade = 0
                .Weight = xlMedium
            End With
            With .Borders(xlInsideVertical)
                .LineStyle = xlContinuous
                .ColorIndex = xlAutomatic
                .TintAndShade = 0
                .Weight = xlThin
            End With
            With .Borders(xlInsideHorizontal)
                .LineStyle = xlContinuous
                .ColorIndex = xlAutomatic
                .TintAndShade = 0
                .Weight = xlThin
            End With
         End With
        For i = 1 To intColumnas
            .Columns(i).EntireColumn.AutoFit
        Next
        
    End With
    
    AjustarCeldas p_Hoja:=wbHoja, p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    For i = 1 To 9
        With wbHoja
            .Columns(i).EntireColumn.AutoFit
        End With
    Next
    intFila = 1
    With wbHoja
        .Cells(intFila, 1).Value = "Exportación de Tareas " & p_Tipo & " de No Conformidades"
    End With
    With wbHoja
        .Columns(4).ColumnWidth = 30
        .Columns(5).ColumnWidth = 30
        .Columns(7).ColumnWidth = 30
    End With
    ConvertirATabla p_Hoja:=wbHoja, p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    AppExcel.ActiveWindow.FreezePanes = True

    
    If fso.FileExists(m_URLExcel) Then
        fso.DeleteFile m_URLExcel, True
    End If
    wbLibro.SaveAs m_URLExcel
    wbLibro.Close
    Set wbLibro = Nothing
    AppExcel.Quit
    Set AppExcel = Nothing
    
   
    TareasAExcel = m_URLExcel
    Exit Function
errores:
    
    If Err.Number <> 1000 Then
        p_Error = "El método TareasAExcel ha producido el error nº: " & Err.Number & _
    vbCrLf & "Detalle: " & Err.Description
    End If
    
    If Not wbLibro Is Nothing Then
        wbLibro.Close False
        Set wbLibro = Nothing
    End If
    If Not AppExcel Is Nothing Then
        AppExcel.Quit
        Set AppExcel = Nothing
    End If
    
End Function
Public Function GestionNCProyectosAExcel( _
    p_col As Scripting.Dictionary, _
    Optional ByRef p_Error As String, _
    Optional p_TipoInforme As String = "GENERAL") As String
    
    Dim m_NC As NCProyecto
    Dim m_ID As Variant
    Dim wbLibro As Object ' Excel.Workbook
    Dim wbHoja As Object  ' Excel.Worksheet
    Dim MiRango As Object ' Excel.Range
    Dim intFila As Integer
    Dim intColumnas As Integer
    Dim m_URLExcel As String
    Dim m_NombreInforme As String
    Dim AppExcel As Object ' Excel.Application
    
    ' Flags para columnas dinámicas
    Dim blnEsReplan As Boolean
    Dim blnEsRiesgo As Boolean
    
    On Error GoTo errores
    
    If p_col Is Nothing Then
        p_Error = "No se ha obtenido ningún registro"
        Err.Raise 1000
    End If
    
    ' Configurar flags según el tipo de informe solicitado
    blnEsReplan = (p_TipoInforme = "REPLAN")
    blnEsRiesgo = (p_TipoInforme = "RIESGO")
    
    Avance "Obteniendo ruta final ...."
    m_NombreInforme = "Informe_" & p_TipoInforme & "_" & Format(Now(), "yyyy_mm_dd_hhmmss") & ".xlsx"
    m_URLExcel = m_ObjEntorno.URLDirectorioLocal & "Informes\" & m_NombreInforme
    
    If Not fso.FolderExists(fso.GetParentFolderName(m_URLExcel)) Then
        fso.CreateFolder fso.GetParentFolderName(m_URLExcel)
    End If
    If fso.FileExists(m_URLExcel) Then
        If FicheroAbierto(m_URLExcel) Then
            p_Error = "Tiene abierto un informe anterior con el mismo nombre."
            Err.Raise 1000
        End If
    End If
    
    Avance "Abriendo Excel ...."
    Set AppExcel = CreateObject("Excel.Application")
    AppExcel.Visible = False
    Set wbLibro = AppExcel.Workbooks.Add
    Set wbHoja = wbLibro.Worksheets(1)
    
    intFila = 3
    
    ' --- CABECERAS ---
    With wbHoja
        .Cells(intFila, 1).Value = "Código NC"
        .Cells(intFila, 2).Value = "Descripción"
        .Cells(intFila, 3).Value = "Expediente"
        .Cells(intFila, 4).Value = "Resp. Calidad"
        .Cells(intFila, 5).Value = "Estado"
        .Cells(intFila, 6).Value = "F. Apertura"
        .Cells(intFila, 7).Value = "F. Prev. Cierre"
        .Cells(intFila, 8).Value = "F. Cierre"
        .Cells(intFila, 9).Value = "Tipología"
        .Cells(intFila, 10).Value = "Detectado Por"
        
        ' Columna 9 Dinámica
        If blnEsReplan Then
            .Cells(intFila, 11).Value = "Nº Replanif."
            intColumnas = 11
        ElseIf blnEsRiesgo Then
            .Cells(intFila, 11).Value = "Riesgos Asociados"
            intColumnas = 11
        Else
            intColumnas = 10
        End If
        
        ' Formato Cabecera
        Set MiRango = .Range(.Cells(intFila, 1), .Cells(intFila, intColumnas))
        With MiRango
            .Font.Bold = True
            .HorizontalAlignment = -4108 ' xlCenter
            .VerticalAlignment = -4108   ' xlCenter
            .Interior.Color = 14136213   ' Gris azulado suave
        End With
    End With
    
    ' --- DATOS ---
    With wbHoja
        For Each m_ID In p_col
            intFila = intFila + 1
            Set m_NC = p_col(m_ID)
            
            Avance "Procesando " & m_NC.CodigoNoConformidad & "..."
            
            .Cells(intFila, 1).Value = m_NC.CodigoNoConformidad
            .Cells(intFila, 2).Value = m_NC.Descripcion
            .Cells(intFila, 3).Value = m_NC.Nemotecnico
            .Cells(intFila, 4).Value = m_NC.RESPONSABLECALIDAD
            .Cells(intFila, 5).Value = m_NC.Estado
            
            ' Fechas
            If IsDate(m_NC.FechaApertura) Then
                .Cells(intFila, 6).Value = CDate(m_NC.FechaApertura)
            End If
            If IsDate(m_NC.FPREVCIERRE) Then
                .Cells(intFila, 7).Value = CDate(m_NC.FPREVCIERRE)
            End If
            If IsDate(m_NC.FECHACIERRE) Then
                .Cells(intFila, 8).Value = CDate(m_NC.FECHACIERRE)
            End If
            
            ' Tipología
            If Not m_NC.TipoNCProyecto Is Nothing Then
                 .Cells(intFila, 9).Value = m_NC.TipoNCProyecto.Tipologia
            Else
                 .Cells(intFila, 9).Value = ""
            End If
            .Cells(intFila, 10).Value = m_NC.DetectadoPor
            
            
            ' Columna 9 Dinámica: Datos específicos
            If blnEsReplan Then
                If m_NC.Replanificaciones Is Nothing Then
                    .Cells(intFila, 11).Value = 0
                Else
                    .Cells(intFila, 11).Value = m_NC.Replanificaciones.count
                End If
                
            ElseIf blnEsRiesgo Then
                ' Aquí accedemos a la propiedad que ya concatena los códigos (ej: "R-01 | R-05")
                ' Esto dispara el Lazy Loading si no estaba cargado
                .Cells(intFila, 11).Value = m_NC.CodRiesgosAsociados
            End If
            
            Set m_NC = Nothing
        Next
    End With
    
    ' --- FORMATO FINAL ---
    With wbHoja
        ' Bordes
        Set MiRango = .Range(.Cells(3, 1), .Cells(intFila, intColumnas))
        MiRango.Borders.LineStyle = 1 ' xlContinuous
        
        ' Ajuste de columnas
        .Columns(2).ColumnWidth = 50 ' Descripción ancha
        .Columns("A:I").EntireColumn.AutoFit
        
        ' Formato Fecha para columnas 6,7 y 8
        Set MiRango = .Range(.Cells(4, 6), .Cells(intFila, 8))
        MiRango.NumberFormat = "dd/mm/yyyy"
        
        ' Título superior
        .Cells(1, 1).Value = "Informe de Indicador: " & p_TipoInforme
        .Cells(1, 1).Font.Size = 14
        .Cells(1, 1).Font.Bold = True
        
        ' Tabla oficial
        On Error Resume Next
        .ListObjects.Add(1, .Range(.Cells(3, 1), .Cells(intFila, intColumnas)), , 1).Name = "TablaDatos"
        On Error GoTo errores
    End With
    
    AppExcel.ActiveWindow.FreezePanes = True
    
    If fso.FileExists(m_URLExcel) Then fso.DeleteFile m_URLExcel, True
    
    wbLibro.SaveAs m_URLExcel
    wbLibro.Close
    AppExcel.Quit
    
    Set wbLibro = Nothing
    Set AppExcel = Nothing
    
    GestionNCProyectosAExcel = m_URLExcel
    Exit Function

errores:
    If Not AppExcel Is Nothing Then AppExcel.Quit
    If Err.Number <> 1000 Then
        p_Error = "Error en GestionNCProyectosAExcel: " & Err.Description
    End If
End Function

Public Function ConvertirATabla( _
                                        p_Hoja As Excel.Worksheet, _
                                        Optional ByRef p_Error As String _
                                        ) As String
    Dim m_Rango As Excel.Range
    On Error GoTo errores
    Set m_Rango = p_Hoja.Range("A3").CurrentRegion
    p_Hoja.Application.CutCopyMode = False
    p_Hoja.ListObjects.Add(xlSrcRange, m_Rango, , xlYes).Name = "Tabla1"
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ConvertirATabla ha producido el error nº: " & Err.Number & vbCrLf & "Detalle: " & Err.Description
    End If
End Function

Public Function AjustarCeldas( _
                                p_Hoja As Excel.Worksheet, _
                                Optional ByRef p_Error As String _
                                ) As String
    
    On Error GoTo errores
    
   
    With p_Hoja.Cells
        .HorizontalAlignment = xlGeneral
        .VerticalAlignment = xlBottom
        .WrapText = False
        .Orientation = 0
        .AddIndent = False
        .IndentLevel = 0
        .ShrinkToFit = False
        .ReadingOrder = xlContext
        .MergeCells = False
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método AjustarCeldas ha producido el error nº: " & Err.Number & vbCrLf & "Detalle: " & Err.Description
    End If
End Function

