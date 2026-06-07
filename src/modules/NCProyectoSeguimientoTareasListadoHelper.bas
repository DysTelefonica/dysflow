Attribute VB_Name = "NCProyectoSeguimientoTareasListadoHelper"
Option Compare Database
Option Explicit

' SDD ncproyecto-seguimiento-tareas-helper G1.
' UI-free helper for Form_FormNCProyectoSeguimientoTareas listing behavior.
' Owns cache seam, fallback logging, source selection, and lightweight predicates.

Private Const LOG_TABLE As String = "TbLogCache"
Private Const LOG_OPERATION_FALLBACK As String = "TareasCacheFallback"
Private Const FALLBACK_REASON_CACHE_NOT_IMPLEMENTED As String = "Cache de tareas no implementada en esta slice"
Private Const FALLBACK_REASON_CACHE_DISABLED As String = "Cache de tareas deshabilitada"

Public Function GetARsProyectoSeguimientoTareasFiltrados( _
    Optional ByVal p_ResponsableCalidad As String = "", _
    Optional ByVal p_Responsable As String = "", _
    Optional ByVal p_Estado As String = "", _
    Optional ByVal p_IDExpediente As String = "", _
    Optional ByRef p_Error As String _
    ) As Scripting.Dictionary

    Dim useCache As Boolean
    Dim cacheErr As String
    Dim cacheCol As Scripting.Dictionary
    Dim fallbackReason As String

    On Error GoTo errores

    p_Error = ""
    CaptureTestDelegationCall p_ResponsableCalidad, p_Responsable, p_Estado, p_IDExpediente
    useCache = IsCacheEnabled()

    If useCache Then
        Set cacheCol = TryListadoFiltradoSQL( _
                            p_ResponsableCalidad:=p_ResponsableCalidad, _
                            p_Responsable:=p_Responsable, _
                            p_Estado:=p_Estado, _
                            p_IDExpediente:=p_IDExpediente, _
                            p_Error:=cacheErr)
        If cacheErr = "" Then
            If Not cacheCol Is Nothing Then
                If cacheCol.count > 0 Then
                    Set GetARsProyectoSeguimientoTareasFiltrados = cacheCol
                    Exit Function
                End If
            End If
        End If

        If cacheErr <> "" Then
            fallbackReason = "Cache error: " & cacheErr
        Else
            fallbackReason = FALLBACK_REASON_CACHE_NOT_IMPLEMENTED
        End If
    Else
        fallbackReason = FALLBACK_REASON_CACHE_DISABLED
    End If

    LogFallback fallbackReason
    Set GetARsProyectoSeguimientoTareasFiltrados = GetARsProyectoSeguimientoTareasFallback( _
                                                    p_ResponsableCalidad:=p_ResponsableCalidad, _
                                                    p_Responsable:=p_Responsable, _
                                                    p_Estado:=p_Estado, _
                                                    p_IDExpediente:=p_IDExpediente, _
                                                    p_Error:=p_Error)
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GetARsProyectoSeguimientoTareasFiltrados ha devuelto el error: " & Err.Description
    End If
End Function

Public Function ApplySeguimientoTareasFormFilters( _
    ByRef p_FormFilteredTareas As Scripting.Dictionary, _
    Optional ByVal p_ResponsableCalidad As String = "", _
    Optional ByVal p_Responsable As String = "", _
    Optional ByVal p_Estado As String = "", _
    Optional ByVal p_IDExpediente As String = "", _
    Optional ByRef p_Error As String _
    ) As Scripting.Dictionary

    Set p_FormFilteredTareas = GetARsProyectoSeguimientoTareasFiltrados( _
                                            p_ResponsableCalidad:=p_ResponsableCalidad, _
                                            p_Responsable:=p_Responsable, _
                                            p_Estado:=p_Estado, _
                                            p_IDExpediente:=p_IDExpediente, _
                                            p_Error:=p_Error)
    Set ApplySeguimientoTareasFormFilters = p_FormFilteredTareas
End Function

Public Function TestHook_SeguimientoTareasFormDelegationPath( _
    ByVal p_Path As String, _
    Optional ByVal p_ResponsableCalidad As String = "", _
    Optional ByVal p_Responsable As String = "", _
    Optional ByVal p_Estado As String = "", _
    Optional ByVal p_IDExpediente As String = "", _
    Optional ByRef p_Error As String _
    ) As Scripting.Dictionary

    If Not m_TestingMode Then
        p_Error = "TestHook_SeguimientoTareasFormDelegationPath requires m_TestingMode=True"
        Exit Function
    End If
    If Not m_TestFormSeguimientoTareasDelegationHookEnabled Then
        p_Error = "TestHook_SeguimientoTareasFormDelegationPath requires explicit test hook flag"
        Exit Function
    End If

    Select Case p_Path
        Case "Filtrar", "Form_Load", "ComandoLimpiarEstado", "ComandoLimpiarIDExpediente", "ComandoLimpiarResposable", "ComandoLimpiarResposableCalidad", "ComandoLimpiarResponsable", "ComandoLimpiarResponsableCalidad"
            Set TestHook_SeguimientoTareasFormDelegationPath = ApplySeguimientoTareasFormFilters( _
                                                            p_FormFilteredTareas:=m_ColFiltradoTareasNCProyectos, _
                                                            p_ResponsableCalidad:=p_ResponsableCalidad, _
                                                            p_Responsable:=p_Responsable, _
                                                            p_Estado:=p_Estado, _
                                                            p_IDExpediente:=p_IDExpediente, _
                                                            p_Error:=p_Error)
        Case Else
            p_Error = "Unsupported seguimiento tareas delegation test path: " & p_Path
    End Select
End Function

Private Function TryListadoFiltradoSQL( _
    Optional ByVal p_ResponsableCalidad As String = "", _
    Optional ByVal p_Responsable As String = "", _
    Optional ByVal p_Estado As String = "", _
    Optional ByVal p_IDExpediente As String = "", _
    Optional ByRef p_Error As String _
    ) As Scripting.Dictionary

    p_Error = ""
    If m_TestingMode Then
        If m_TestTareasHelperCacheErrorSeamEnabled Then
            p_Error = m_TestTareasHelperCacheErrorText
            If p_Error = "" Then p_Error = "forced test cache failure"
            Set TryListadoFiltradoSQL = Nothing
            Exit Function
        End If
    End If

    Set TryListadoFiltradoSQL = Nothing
End Function

Private Sub CaptureTestDelegationCall( _
    ByVal p_ResponsableCalidad As String, _
    ByVal p_Responsable As String, _
    ByVal p_Estado As String, _
    ByVal p_IDExpediente As String)

    If m_TestingMode Then
        If m_TestSeguimientoTareasHelperDelegationSeamEnabled Then
            m_TestSeguimientoTareasHelperDelegationCallCount = m_TestSeguimientoTareasHelperDelegationCallCount + 1
            m_TestSeguimientoTareasHelperLastResponsableCalidad = p_ResponsableCalidad
            m_TestSeguimientoTareasHelperLastResponsable = p_Responsable
            m_TestSeguimientoTareasHelperLastEstado = p_Estado
            m_TestSeguimientoTareasHelperLastIDExpediente = p_IDExpediente
        End If
    End If
End Sub

Private Function GetARsProyectoSeguimientoTareasFallback( _
    Optional ByVal p_ResponsableCalidad As String = "", _
    Optional ByVal p_Responsable As String = "", _
    Optional ByVal p_Estado As String = "", _
    Optional ByVal p_IDExpediente As String = "", _
    Optional ByRef p_Error As String _
    ) As Scripting.Dictionary

    Dim sourceCol As Scripting.Dictionary
    Dim resultCol As Scripting.Dictionary
    Dim id As Variant
    Dim tarea As SegTareasProyecto

    On Error GoTo errores

    p_Error = ""
    Set resultCol = New Scripting.Dictionary
    resultCol.CompareMode = TextCompare

    Set sourceCol = ResolveEstadoFuente(p_Estado:=p_Estado)
    If sourceCol Is Nothing Then
        Set GetARsProyectoSeguimientoTareasFallback = resultCol
        Exit Function
    End If

    For Each id In sourceCol
        Set tarea = sourceCol(id)
        If ShouldIncludeTarea( _
                p_Tarea:=tarea, _
                p_ResponsableCalidad:=p_ResponsableCalidad, _
                p_Responsable:=p_Responsable, _
                p_IDExpediente:=p_IDExpediente) Then
            If Not resultCol.Exists(CStr(tarea.IDAccionRealizada)) Then
                resultCol.Add CStr(tarea.IDAccionRealizada), tarea
            End If
        End If
        Set tarea = Nothing
    Next id

    Set GetARsProyectoSeguimientoTareasFallback = resultCol
    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GetARsProyectoSeguimientoTareasFallback ha devuelto el error: " & Err.Description
    End If
End Function

Private Function ResolveEstadoFuente(ByVal p_Estado As String) As Scripting.Dictionary
    On Error GoTo errores

    If m_ObjEntorno Is Nothing Then Exit Function

    If p_Estado = "ACTIVA" Then
        Set ResolveEstadoFuente = m_ObjEntorno.ColSegsTareasProyectoActivas
    ElseIf p_Estado = "PENDIENTE DE REPLANIFICAR" Then
        Set ResolveEstadoFuente = m_ObjEntorno.ColSegsTareasProyectoPteReplanificar
    Else
        Set ResolveEstadoFuente = m_ObjEntorno.ColSegsTareasProyecto
    End If
    Exit Function

errores:
    Set ResolveEstadoFuente = Nothing
End Function

Private Function ShouldIncludeTarea( _
    ByVal p_Tarea As SegTareasProyecto, _
    ByVal p_ResponsableCalidad As String, _
    ByVal p_Responsable As String, _
    ByVal p_IDExpediente As String _
    ) As Boolean

    On Error GoTo errores

    If p_Tarea Is Nothing Then Exit Function
    If p_ResponsableCalidad <> "" Then
        If p_ResponsableCalidad <> p_Tarea.RespCalidad Then Exit Function
    End If
    If p_Responsable <> "" Then
        If p_Responsable <> p_Tarea.Tecnico Then Exit Function
    End If
    If p_IDExpediente <> "" Then
        If p_IDExpediente <> p_Tarea.IDExpediente Then Exit Function
    End If

    ShouldIncludeTarea = True
    Exit Function

errores:
    ShouldIncludeTarea = False
End Function

Private Sub LogFallback(ByVal p_Detalle As String)
    Dim db As DAO.Database
    Dim dbError As String
    Dim usuarioLog As String
    Dim SQL As String

    usuarioLog = SafeFallbackUser()
    SQL = "INSERT INTO " & LOG_TABLE & " " & _
          "(IDNoConformidad, TipoOperacion, Detalles, Usuario, Exito, DuracionMs, FechaOperacion) VALUES (" & _
          "0, " & SqlLiteral(LOG_OPERATION_FALLBACK) & ", " & SqlLiteral(p_Detalle) & ", " & _
          SqlLiteral(usuarioLog) & ", True, 0, Now());"

    On Error Resume Next
    Set db = getdb(p_Error:=dbError)
    If Err.Number <> 0 Then
        Err.Clear
        On Error GoTo 0
        Exit Sub
    End If
    If db Is Nothing Then
        On Error GoTo 0
        Exit Sub
    End If
    db.Execute SQL, dbFailOnError
    If Err.Number <> 0 Then Err.Clear
    On Error GoTo 0
End Sub

Private Function SafeFallbackUser() As String
    On Error GoTo fallback

    SafeFallbackUser = "Sistema"
    If m_ObjUsuarioConectado Is Nothing Then Exit Function

    If Nz(m_ObjUsuarioConectado.UsuarioRed, "") <> "" Then
        SafeFallbackUser = m_ObjUsuarioConectado.UsuarioRed
    ElseIf Nz(m_ObjUsuarioConectado.Nombre, "") <> "" Then
        SafeFallbackUser = m_ObjUsuarioConectado.Nombre
    End If
    If SafeFallbackUser = "" Then SafeFallbackUser = "Sistema"
    Exit Function

fallback:
    SafeFallbackUser = "Sistema"
End Function

Private Function SqlLiteral(ByVal p_Value As String) As String
    SqlLiteral = "'" & Replace(p_Value, "'", "''") & "'"
End Function
