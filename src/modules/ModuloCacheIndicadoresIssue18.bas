Attribute VB_Name = "ModuloCacheIndicadoresIssue18"
Option Compare Database
Option Explicit
' ============================================================
' ModuloCacheIndicadoresIssue18 — Issue #18 incremental cache API
'
' Extends ModuloCacheIndicadores.bas with:
'  - Per-NC transactional sync for both Proyecto and Auditoria domains
'  - AC->NC and AR/tarea->AC->NC resolution helpers (both domains)
'  - Explicit full rebuild (ReconstruirTodo)
'  - Read/filter API (CargarBucket, CargarDetalle)
'
' All public functions return JSON via TestHelper.BuildJsonOk/BuildJsonFail.
'
' ID ranges for fixtures: 993xxx (wu2 tests)
' ============================================================

' --- Constants for domain IDs (must match ModuloCacheIndicadores) ---
Private Const CACHE_PROYECTO_ID As Long = 1
Private Const CACHE_AUDITORIA_ID As Long = 2

' --- Constants for table names ---
Private Const CACHE_CONFIG As String = "TbCacheIndicadoresConfig"
Private Const CACHE_HEADER As String = "TbCacheIndicadoresProyectoHeader"
Private Const CACHE_DETALLE As String = "TbCacheIndicadoresProyectoDetalle"

' --- Domain names for the Dominio field ---
Private Const DOMINIO_PROYECTO As String = "PROYECTO"
Private Const DOMINIO_AUDITORIA As String = "AUDITORIA"

' --- Source tables (Proyecto) ---
Private Const TBL_NC_PROYECTO As String = "TbNoConformidades"
Private Const TBL_AC_PROYECTO As String = "TbNCAccionCorrectivas"
Private Const TBL_AR_PROYECTO As String = "TbNCAccionesRealizadas"
Private Const TBL_REPLAN_PROYECTO As String = "TbReplanificacionesProyecto"

' --- Source tables (Auditoria) ---
Private Const TBL_NC_AUDITORIA As String = "TbNoConformidadesAuditoria"
Private Const TBL_AC_AUDITORIA As String = "TbNCAuditoriaAccionCorrectivas"
Private Const TBL_AR_AUDITORIA As String = "TbNCAuditoriaAccionesRealizadas"
Private Const TBL_REPLAN_AUDITORIA As String = "TbReplanificacionesAuditoria"

' ============================================================
' PUBLIC API — Per-NC transactional sync
' ============================================================

' Synchronizes cache detail rows for a specific NC in the given domain.
' Domain is inferred from which source table the NC ID belongs to.
' Returns JSON string.
Public Function Cache_Indicadores_SincronizarNC( _
        ByVal p_IDNoConformidad As Long, _
        Optional ByRef p_Error As String = "" _
    ) As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim syncOk As Boolean
    Dim dominio As String

    Set logs = New Collection
    On Error GoTo errores
    p_Error = ""

    If p_IDNoConformidad <= 0 Then
        p_Error = "Cache_Indicadores_SincronizarNC: IDNoConformidad must be > 0"
        Cache_Indicadores_SincronizarNC = TestHelper.BuildJsonFail(p_Error, logs)
        Exit Function
    End If

    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Cache_Indicadores_SincronizarNC = TestHelper.BuildJsonFail("getdb failed: " & p_Error, logs)
        Exit Function
    End If

    ' Determine domain from NC ID
    dominio = DetectarDominioDesdeNC(db, p_IDNoConformidad, p_Error)
    If p_Error <> "" Then
        Cache_Indicadores_SincronizarNC = TestHelper.BuildJsonFail(p_Error, logs)
        Exit Function
    End If

    Set ws = DBEngine.Workspaces(0)

    If dominio = DOMINIO_PROYECTO Then
        syncOk = SyncNC_Proyecto(db, ws, p_IDNoConformidad, logs, p_Error)
    ElseIf dominio = DOMINIO_AUDITORIA Then
        syncOk = SyncNC_Auditoria(db, ws, p_IDNoConformidad, logs, p_Error)
    Else
        p_Error = "Cache_Indicadores_SincronizarNC: dominio no reconhecido: " & dominio
        syncOk = False
    End If

    If syncOk Then
        TestHelper.AddLog logs, "Cache_Indicadores_SincronizarNC(" & p_IDNoConformidad & ", " & dominio & ") OK"
        Cache_Indicadores_SincronizarNC = TestHelper.BuildJsonOk(logs, dominio & "_nc_synced")
    Else
        TestHelper.AddLog logs, "Cache_Indicadores_SincronizarNC failed: " & p_Error
        Cache_Indicadores_SincronizarNC = TestHelper.BuildJsonFail(p_Error, logs)
    End If

    Set db = Nothing
    Set ws = Nothing
    Exit Function

errores:
    p_Error = "Cache_Indicadores_SincronizarNC: " & Err.Description
    Cache_Indicadores_SincronizarNC = TestHelper.BuildJsonFail(p_Error, logs)
    On Error Resume Next
    Set db = Nothing
    Set ws = Nothing
End Function

' ============================================================
' PUBLIC API — AC -> NC resolution helpers
' ============================================================

' Resolves the parent NC ID from an AC ID for either domain.
' Returns 0 if not found.
Public Function Cache_Indicadores_ResolverNCDesdeAC( _
        ByVal p_Db As DAO.Database, _
        ByVal p_IDAccionCorrectiva As Long, _
        Optional ByRef p_Error As String = "" _
    ) As Long
    Dim rs As DAO.Recordset
    Dim sql As String
    Dim dominio As String

    On Error GoTo errores
    p_Error = ""
    Cache_Indicadores_ResolverNCDesdeAC = 0

    If p_IDAccionCorrectiva <= 0 Then
        p_Error = "Cache_Indicadores_ResolverNCDesdeAC: IDAccionCorrectiva must be > 0"
        Exit Function
    End If

    ' Try Proyecto tables first
    sql = "SELECT IDNoConformidad FROM " & TBL_AC_PROYECTO & _
          " WHERE IDAccionCorrectiva=" & CStr(p_IDAccionCorrectiva)
    Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)
    If Not rs.EOF Then
        Cache_Indicadores_ResolverNCDesdeAC = CLng(Nz(rs.Fields("IDNoConformidad").value, 0))
        rs.Close
        Set rs = Nothing
        Exit Function
    End If
    rs.Close
    Set rs = Nothing

    ' Try Auditoria tables
    sql = "SELECT ID FROM " & TBL_AC_AUDITORIA & _
          " WHERE IDAccionCorrectiva=" & CStr(p_IDAccionCorrectiva)
    Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)
    If Not rs.EOF Then
        Cache_Indicadores_ResolverNCDesdeAC = CLng(Nz(rs.Fields("ID").value, 0))
        rs.Close
        Set rs = Nothing
        Exit Function
    End If
    rs.Close
    Set rs = Nothing

    p_Error = "Cache_Indicadores_ResolverNCDesdeAC: AC not found: " & p_IDAccionCorrectiva
    Exit Function

errores:
    p_Error = "Cache_Indicadores_ResolverNCDesdeAC: " & Err.Description
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
End Function

' Convenience wrapper for AC write hooks (task 3.2).
' Resolves AC -> parent NC and synchronizes only that NC's indicator cache.
' Returns JSON string.
Public Function Cache_Indicadores_SincronizarDesdeAC( _
        ByVal p_IDAccionCorrectiva As Long, _
        Optional ByRef p_Error As String = "" _
    ) As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim parentNcId As Long

    Set logs = New Collection
    On Error GoTo errores
    p_Error = ""

    If p_IDAccionCorrectiva <= 0 Then
        p_Error = "Cache_Indicadores_SincronizarDesdeAC: IDAccionCorrectiva must be > 0"
        Cache_Indicadores_SincronizarDesdeAC = TestHelper.BuildJsonFail(p_Error, logs)
        Exit Function
    End If

    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Cache_Indicadores_SincronizarDesdeAC = TestHelper.BuildJsonFail("getdb failed: " & p_Error, logs)
        Exit Function
    End If

    parentNcId = Cache_Indicadores_ResolverNCDesdeAC(db, p_IDAccionCorrectiva, p_Error)
    If p_Error <> "" Then
        Cache_Indicadores_SincronizarDesdeAC = TestHelper.BuildJsonFail(p_Error, logs)
        Exit Function
    End If
    If parentNcId <= 0 Then
        p_Error = "Cache_Indicadores_SincronizarDesdeAC: no parent NC found for AC " & p_IDAccionCorrectiva
        Cache_Indicadores_SincronizarDesdeAC = TestHelper.BuildJsonFail(p_Error, logs)
        Exit Function
    End If

    TestHelper.AddLog logs, "Resolved AC " & p_IDAccionCorrectiva & " -> NC " & parentNcId

    Dim syncResult As String
    syncResult = Cache_Indicadores_SincronizarNC(parentNcId, p_Error)
    If p_Error <> "" Then
        Cache_Indicadores_SincronizarDesdeAC = TestHelper.BuildJsonFail(p_Error, logs)
        Exit Function
    End If

    TestHelper.AddLog logs, "Cache_Indicadores_SincronizarDesdeAC(" & p_IDAccionCorrectiva & ") OK"
    Cache_Indicadores_SincronizarDesdeAC = TestHelper.BuildJsonOk(logs, "ac_sync_ok")
    Set db = Nothing
    Exit Function

errores:
    p_Error = "Cache_Indicadores_SincronizarDesdeAC: " & Err.Description
    Cache_Indicadores_SincronizarDesdeAC = TestHelper.BuildJsonFail(p_Error, logs)
    On Error Resume Next
    Set db = Nothing
End Function

' Convenience wrapper for AR/tarea write hooks (task 3.3).
' Resolves AR -> AC -> parent NC and synchronizes only that NC's indicator cache.
' Returns JSON string.
Public Function Cache_Indicadores_SincronizarDesdeAR( _
        ByVal p_IDAccionRealizada As Long, _
        Optional ByRef p_Error As String = "" _
    ) As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim parentNcId As Long

    Set logs = New Collection
    On Error GoTo errores
    p_Error = ""

    If p_IDAccionRealizada <= 0 Then
        p_Error = "Cache_Indicadores_SincronizarDesdeAR: IDAccionRealizada must be > 0"
        Cache_Indicadores_SincronizarDesdeAR = TestHelper.BuildJsonFail(p_Error, logs)
        Exit Function
    End If

    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Cache_Indicadores_SincronizarDesdeAR = TestHelper.BuildJsonFail("getdb failed: " & p_Error, logs)
        Exit Function
    End If

    parentNcId = Cache_Indicadores_ResolverNCDesdeAR(db, p_IDAccionRealizada, p_Error)
    If p_Error <> "" Then
        Cache_Indicadores_SincronizarDesdeAR = TestHelper.BuildJsonFail(p_Error, logs)
        Exit Function
    End If
    If parentNcId <= 0 Then
        p_Error = "Cache_Indicadores_SincronizarDesdeAR: no parent NC found for AR " & p_IDAccionRealizada
        Cache_Indicadores_SincronizarDesdeAR = TestHelper.BuildJsonFail(p_Error, logs)
        Exit Function
    End If

    TestHelper.AddLog logs, "Resolved AR " & p_IDAccionRealizada & " -> NC " & parentNcId

    Dim syncResult As String
    syncResult = Cache_Indicadores_SincronizarNC(parentNcId, p_Error)
    If p_Error <> "" Then
        Cache_Indicadores_SincronizarDesdeAR = TestHelper.BuildJsonFail(p_Error, logs)
        Exit Function
    End If

    TestHelper.AddLog logs, "Cache_Indicadores_SincronizarDesdeAR(" & p_IDAccionRealizada & ") OK"
    Cache_Indicadores_SincronizarDesdeAR = TestHelper.BuildJsonOk(logs, "ar_sync_ok")
    Set db = Nothing
    Exit Function

errores:
    p_Error = "Cache_Indicadores_SincronizarDesdeAR: " & Err.Description
    Cache_Indicadores_SincronizarDesdeAR = TestHelper.BuildJsonFail(p_Error, logs)
    On Error Resume Next
    Set db = Nothing
End Function

' ============================================================
' PUBLIC API — AR/tarea -> AC -> NC resolution helpers
' ============================================================

' Resolves the parent NC ID from an AR ID (Proyecto domain).
' AR -> AC -> NC chain for Proyecto.
Public Function Cache_Indicadores_ResolverNCDesdeAR( _
        ByVal p_Db As DAO.Database, _
        ByVal p_IDAccionRealizada As Long, _
        Optional ByRef p_Error As String = "" _
    ) As Long
    Dim rs As DAO.Recordset
    Dim sql As String

    On Error GoTo errores
    p_Error = ""
    Cache_Indicadores_ResolverNCDesdeAR = 0

    If p_IDAccionRealizada <= 0 Then
        p_Error = "Cache_Indicadores_ResolverNCDesdeAR: IDAccionRealizada must be > 0"
        Exit Function
    End If

    ' AR -> AC -> NC for Proyecto
    sql = "SELECT AC.IDNoConformidad " & _
          "FROM " & TBL_AR_PROYECTO & " AS AR " & _
          "INNER JOIN " & TBL_AC_PROYECTO & " AS AC ON AR.IDAccionCorrectiva=AC.IDAccionCorrectiva " & _
          "WHERE AR.IDAccionRealizada=" & CStr(p_IDAccionRealizada)
    Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)
    If Not rs.EOF Then
        Cache_Indicadores_ResolverNCDesdeAR = CLng(Nz(rs.Fields("IDNoConformidad").value, 0))
        rs.Close
        Set rs = Nothing
        Exit Function
    End If
    rs.Close
    Set rs = Nothing

    ' Try AR -> AC -> NC for Auditoria
    sql = "SELECT AC.ID " & _
          "FROM " & TBL_AR_AUDITORIA & " AS AR " & _
          "INNER JOIN " & TBL_AC_AUDITORIA & " AS AC ON AR.IDAccionCorrectiva=AC.IDAccionCorrectiva " & _
          "WHERE AR.IDAccionRealizada=" & CStr(p_IDAccionRealizada)
    Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)
    If Not rs.EOF Then
        Cache_Indicadores_ResolverNCDesdeAR = CLng(Nz(rs.Fields("ID").value, 0))
        rs.Close
        Set rs = Nothing
        Exit Function
    End If
    rs.Close
    Set rs = Nothing

    p_Error = "Cache_Indicadores_ResolverNCDesdeAR: AR not found: " & p_IDAccionRealizada
    Exit Function

errores:
    p_Error = "Cache_Indicadores_ResolverNCDesdeAR: " & Err.Description
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
End Function

' ============================================================
' PUBLIC API — Full rebuild operation
' ============================================================

' Rebuilds the entire cache for all domains.
' Safe to call repeatedly; idempotent.
' Returns JSON string.
Public Function Cache_Indicadores_ReconstruirTodo( _
        Optional ByRef p_Error As String = "" _
    ) As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim okProyecto As Boolean
    Dim okAuditoria As Boolean
    Dim okConfig As Boolean

    Set logs = New Collection
    On Error GoTo errores
    p_Error = ""

    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Cache_Indicadores_ReconstruirTodo = TestHelper.BuildJsonFail("getdb failed: " & p_Error, logs)
        Exit Function
    End If

    Set ws = DBEngine.Workspaces(0)

    ' Ensure config rows exist for both domains
    okConfig = EnsureCacheConfig(db, logs, p_Error)
    TestHelper.AddLog logs, "ReconstruirTodo: config " & IIf(okConfig, "OK", "FAILED: " & p_Error)

    ' Sync all NCs for each domain
    okProyecto = RebuildDomain(db, ws, DOMINIO_PROYECTO, logs, p_Error)
    TestHelper.AddLog logs, "ReconstruirTodo: PROYECTO " & IIf(okProyecto, "OK", "FAILED")

    okAuditoria = RebuildDomain(db, ws, DOMINIO_AUDITORIA, logs, p_Error)
    TestHelper.AddLog logs, "ReconstruirTodo: AUDITORIA " & IIf(okAuditoria, "OK", "FAILED")

    If okProyecto And okAuditoria Then
        TestHelper.AddLog logs, "Cache_Indicadores_ReconstruirTodo completed successfully"
        Cache_Indicadores_ReconstruirTodo = TestHelper.BuildJsonOk(logs, "full_rebuild_ok")
    Else
        p_Error = "ReconstruirTodo: one or more domains failed"
        Cache_Indicadores_ReconstruirTodo = TestHelper.BuildJsonFail(p_Error, logs)
    End If

    Set db = Nothing
    Set ws = Nothing
    Exit Function

errores:
    p_Error = "Cache_Indicadores_ReconstruirTodo: " & Err.Description
    Cache_Indicadores_ReconstruirTodo = TestHelper.BuildJsonFail(p_Error, logs)
    On Error Resume Next
    Set db = Nothing
    Set ws = Nothing
End Function

' ============================================================
' PUBLIC API — Read/Filter API
' ============================================================

' Returns bucket counts (total + per responsible) for a domain.
' Returns JSON string.
Public Function Cache_Indicadores_CargarBucket( _
        ByVal p_Db As DAO.Database, _
        ByVal p_Usuario As usuario, _
        ByVal p_Dominio As String, _
        Optional ByRef p_Error As String = "" _
    ) As String
    Dim logs As Collection
    Dim conteos As Scripting.Dictionary
    Dim lastCountLabel As String

    Set logs = New Collection
    On Error GoTo errores
    p_Error = ""

    If p_Db Is Nothing Then
        p_Error = "Cache_Indicadores_CargarBucket: db is Nothing"
        Cache_Indicadores_CargarBucket = TestHelper.BuildJsonFail(p_Error, logs)
        Exit Function
    End If
    If p_Usuario Is Nothing Then
        p_Error = "Cache_Indicadores_CargarBucket: usuario is Nothing"
        Cache_Indicadores_CargarBucket = TestHelper.BuildJsonFail(p_Error, logs)
        Exit Function
    End If

    Set conteos = New Scripting.Dictionary
    conteos.CompareMode = TextCompare

    If p_Dominio = "PROYECTO" Then
        lastCountLabel = "PROYECTO/TareasPteReplanificarTotal"
        conteos("TareasPteReplanificarTotal") = CountBucket(p_Db, CACHE_PROYECTO_ID, BUCKET_TAR_PROY_PTE_REPLAN, "", p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "PROYECTO/TareasPteReplanificarUsuario"
        conteos("TareasPteReplanificarUsuario") = CountBucket(p_Db, CACHE_PROYECTO_ID, BUCKET_TAR_PROY_PTE_REPLAN, p_Usuario.Nombre, p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "PROYECTO/NCRegistradasTotal"
        conteos("NCRegistradasTotal") = CountBucket(p_Db, CACHE_PROYECTO_ID, BUCKET_NC_PROY_REGISTRADAS, "", p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "PROYECTO/NCRegistradasUsuario"
        conteos("NCRegistradasUsuario") = CountBucket(p_Db, CACHE_PROYECTO_ID, BUCKET_NC_PROY_REGISTRADAS, p_Usuario.Nombre, p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "PROYECTO/NCAccionesSinTareasTotal"
        conteos("NCAccionesSinTareasTotal") = CountBucket(p_Db, CACHE_PROYECTO_ID, BUCKET_NC_PROY_SIN_TAREAS, "", p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "PROYECTO/NCAccionesSinTareasUsuario"
        conteos("NCAccionesSinTareasUsuario") = CountBucket(p_Db, CACHE_PROYECTO_ID, BUCKET_NC_PROY_SIN_TAREAS, p_Usuario.Nombre, p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "PROYECTO/NCPteCETotal"
        conteos("NCPteCETotal") = CountBucket(p_Db, CACHE_PROYECTO_ID, BUCKET_NC_PROY_PTE_CE, "", p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "PROYECTO/NCPteCEUsuario"
        conteos("NCPteCEUsuario") = CountBucket(p_Db, CACHE_PROYECTO_ID, BUCKET_NC_PROY_PTE_CE, p_Usuario.Nombre, p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "PROYECTO/NCCECaducadaTotal"
        conteos("NCCECaducadaTotal") = CountBucket(p_Db, CACHE_PROYECTO_ID, BUCKET_NC_PROY_CE_CADUCADA, "", p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "PROYECTO/NCCECaducadaUsuario"
        conteos("NCCECaducadaUsuario") = CountBucket(p_Db, CACHE_PROYECTO_ID, BUCKET_NC_PROY_CE_CADUCADA, p_Usuario.Nombre, p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "PROYECTO/NCCENoConformeTotal"
        conteos("NCCENoConformeTotal") = CountBucket(p_Db, CACHE_PROYECTO_ID, BUCKET_NC_PROY_CE_NO_CONFORME, "", p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "PROYECTO/NCCENoConformeUsuario"
        conteos("NCCENoConformeUsuario") = CountBucket(p_Db, CACHE_PROYECTO_ID, BUCKET_NC_PROY_CE_NO_CONFORME, p_Usuario.Nombre, p_Error)
        If p_Error <> "" Then GoTo conteo_err
    ElseIf p_Dominio = "AUDITORIA" Then
        lastCountLabel = "AUDITORIA/TareasPteReplanificarTotal"
        conteos("TareasPteReplanificarTotal") = CountBucket(p_Db, CACHE_AUDITORIA_ID, BUCKET_TAR_AUD_PTE_REPLAN, "", p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "AUDITORIA/TareasPteReplanificarUsuario"
        conteos("TareasPteReplanificarUsuario") = CountBucket(p_Db, CACHE_AUDITORIA_ID, BUCKET_TAR_AUD_PTE_REPLAN, p_Usuario.Nombre, p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "AUDITORIA/NCRegistradasTotal"
        conteos("NCRegistradasTotal") = CountBucket(p_Db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_REGISTRADAS, "", p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "AUDITORIA/NCRegistradasUsuario"
        conteos("NCRegistradasUsuario") = CountBucket(p_Db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_REGISTRADAS, p_Usuario.Nombre, p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "AUDITORIA/NCAccionesSinTareasTotal"
        conteos("NCAccionesSinTareasTotal") = CountBucket(p_Db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_SIN_TAREAS, "", p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "AUDITORIA/NCAccionesSinTareasUsuario"
        conteos("NCAccionesSinTareasUsuario") = CountBucket(p_Db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_SIN_TAREAS, p_Usuario.Nombre, p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "AUDITORIA/NCPteCETotal"
        conteos("NCPteCETotal") = CountBucket(p_Db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_PTE_CE, "", p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "AUDITORIA/NCPteCEUsuario"
        conteos("NCPteCEUsuario") = CountBucket(p_Db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_PTE_CE, p_Usuario.Nombre, p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "AUDITORIA/NCCECaducadaTotal"
        conteos("NCCECaducadaTotal") = CountBucket(p_Db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_CE_CADUCADA, "", p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "AUDITORIA/NCCECaducadaUsuario"
        conteos("NCCECaducadaUsuario") = CountBucket(p_Db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_CE_CADUCADA, p_Usuario.Nombre, p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "AUDITORIA/NCCENoConformeTotal"
        conteos("NCCENoConformeTotal") = CountBucket(p_Db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_CE_NO_CONFORME, "", p_Error)
        If p_Error <> "" Then GoTo conteo_err

        lastCountLabel = "AUDITORIA/NCCENoConformeUsuario"
        conteos("NCCENoConformeUsuario") = CountBucket(p_Db, CACHE_AUDITORIA_ID, BUCKET_NC_AUD_CE_NO_CONFORME, p_Usuario.Nombre, p_Error)
        If p_Error <> "" Then GoTo conteo_err
    Else
        p_Error = "Cache_Indicadores_CargarBucket: dominio no reconhecido: " & p_Dominio
        Cache_Indicadores_CargarBucket = TestHelper.BuildJsonFail(p_Error, logs)
        Exit Function
    End If

    TestHelper.AddLog logs, "Cache_Indicadores_CargarBucket(" & p_Dominio & ", " & p_Usuario.Nombre & ") returned counts"
    Cache_Indicadores_CargarBucket = TestHelper.BuildJsonOk(logs, conteos)
    Exit Function

conteo_err:
    TestHelper.AddLog logs, "Cache_Indicadores_CargarBucket: failed during count for " & lastCountLabel & " -> " & p_Error
    Cache_Indicadores_CargarBucket = TestHelper.BuildJsonFail(p_Error, logs)
    Exit Function

errores:
    p_Error = "Cache_Indicadores_CargarBucket: " & Err.Description
    Cache_Indicadores_CargarBucket = TestHelper.BuildJsonFail(p_Error, logs)
End Function

' Returns detail rows for a domain + bucket + optional responsible filter.
' Returns JSON string.
Public Function Cache_Indicadores_CargarDetalle( _
        ByVal p_Db As DAO.Database, _
        ByVal p_Usuario As usuario, _
        ByVal p_Dominio As String, _
        ByVal p_Bucket As String, _
        Optional ByRef p_Error As String = "" _
    ) As String
    Dim logs As Collection
    Dim rs As DAO.Recordset
    Dim sql As String
    Dim cacheId As Long
    Dim rows As String

    Set logs = New Collection
    On Error GoTo errores
    p_Error = ""

    If p_Db Is Nothing Then
        p_Error = "Cache_Indicadores_CargarDetalle: db is Nothing"
        Cache_Indicadores_CargarDetalle = TestHelper.BuildJsonFail(p_Error, logs)
        Exit Function
    End If

    If p_Dominio = "PROYECTO" Then
        cacheId = CACHE_PROYECTO_ID
    ElseIf p_Dominio = "AUDITORIA" Then
        cacheId = CACHE_AUDITORIA_ID
    Else
        p_Error = "Cache_Indicadores_CargarDetalle: dominio no reconhecimento: " & p_Dominio
        Cache_Indicadores_CargarDetalle = TestHelper.BuildJsonFail(p_Error, logs)
        Exit Function
    End If

    sql = "SELECT IDEntidad, Bucket, TipoFila, ResponsableCalidad, DisplayTitulo, " & _
          "DisplaySubtitulo, FechaActualizacionEntidad " & _
          "FROM " & CACHE_DETALLE & _
          " WHERE IDCacheIndicadorProyecto=" & CStr(cacheId) & _
          " AND Bucket=" & SqlText(p_Bucket)
    If Not p_Usuario Is Nothing Then
        If Len(p_Usuario.Nombre) > 0 Then
            sql = sql & " AND ResponsableCalidad=" & SqlText(p_Usuario.Nombre)
        End If
    End If

    Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)
    rows = RecordsetToJson(rs, logs)
    rs.Close
    Set rs = Nothing

    TestHelper.AddLog logs, "Cache_Indicadores_CargarDetalle(" & p_Dominio & ", " & p_Bucket & ") returned detail rows"
    Cache_Indicadores_CargarDetalle = TestHelper.BuildJsonOk(logs, rows)
    Exit Function

errores:
    p_Error = "Cache_Indicadores_CargarDetalle: " & Err.Description
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Cache_Indicadores_CargarDetalle = TestHelper.BuildJsonFail(p_Error, logs)
End Function

' ============================================================
' PRIVATE — Per-domain sync
' ============================================================

Private Function SyncNC_Proyecto( _
        ByVal p_Db As DAO.Database, _
        ByVal p_Ws As DAO.Workspace, _
        ByVal p_IDNoConformidad As Long, _
        ByRef p_Logs As Collection, _
        Optional ByRef p_Error As String = "" _
    ) As Boolean
    Dim snapFecha As Date
    Dim cacheId As Long
    Dim configId As Long

    On Error GoTo errores
    p_Error = ""
    SyncNC_Proyecto = False
    cacheId = CACHE_PROYECTO_ID

    ' Resolve config ID for Proyecto
    configId = GetConfigId(p_Db, DOMINIO_PROYECTO, p_Error)
    If p_Error <> "" Then Exit Function

    snapFecha = Now()
    p_Ws.BeginTrans

    Call EnsureIncrementalHeader(p_Db, cacheId, configId, DOMINIO_PROYECTO, p_IDNoConformidad, p_Error)
    If p_Error <> "" Then Err.Raise 1000

    ' Delete existing detail rows for this NC in Proyecto domain
    p_Db.Execute "DELETE FROM " & CACHE_DETALLE & _
                  " WHERE IDCacheIndicadorProyecto=" & CStr(cacheId) & _
                  " AND IDNoConformidad=" & CStr(p_IDNoConformidad), dbFailOnError

    ' Insert new detail rows from constructors
    Call InsertNCBucketsFromConstructor(p_Db, cacheId, configId, p_IDNoConformidad, snapFecha, p_Error)
    If p_Error <> "" Then Err.Raise 1000

    ' Update header sync metadata
    p_Db.Execute "UPDATE " & CACHE_HEADER & _
                  " SET IDCacheConfig=" & CStr(configId) & ", " & _
                  " Dominio=" & SqlText(DOMINIO_PROYECTO) & ", " & _
                  " FechaSincronizacion=Now(), Estado='OK', " & _
                  " MotivoSincronizacion='INCIDENTAL', " & _
                  " VersionRegla='1.0', " & _
                  " IDNoConformidadUltimaSync=" & CStr(p_IDNoConformidad) & ", " & _
                  " OperadorSync=" & SqlText(getNombreUsuarioConectado()) & ", " & _
                  " ErrorUltimaSincronizacion=Null " & _
                  " WHERE IDCacheIndicadorProyecto=" & CStr(cacheId), dbFailOnError

    p_Ws.CommitTrans
    SyncNC_Proyecto = True
    TestHelper.AddLog p_Logs, "SyncNC_Proyecto(" & p_IDNoConformidad & ") committed"
    Exit Function

errores:
    On Error Resume Next
    p_Ws.Rollback
    On Error GoTo 0
    p_Error = "SyncNC_Proyecto: " & Err.Description
    SyncNC_Proyecto = False
End Function

Private Function SyncNC_Auditoria( _
        ByVal p_Db As DAO.Database, _
        ByVal p_Ws As DAO.Workspace, _
        ByVal p_IDNoConformidad As Long, _
        ByRef p_Logs As Collection, _
        Optional ByRef p_Error As String = "" _
    ) As Boolean
    Dim snapFecha As Date
    Dim cacheId As Long
    Dim configId As Long

    On Error GoTo errores
    p_Error = ""
    SyncNC_Auditoria = False
    cacheId = CACHE_AUDITORIA_ID

    configId = GetConfigId(p_Db, DOMINIO_AUDITORIA, p_Error)
    If p_Error <> "" Then Exit Function

    snapFecha = Now()
    p_Ws.BeginTrans

    Call EnsureIncrementalHeader(p_Db, cacheId, configId, DOMINIO_AUDITORIA, p_IDNoConformidad, p_Error)
    If p_Error <> "" Then Err.Raise 1000

    ' Delete existing detail rows for this NC in Auditoria domain
    p_Db.Execute "DELETE FROM " & CACHE_DETALLE & _
                  " WHERE IDCacheIndicadorProyecto=" & CStr(cacheId) & _
                  " AND IDNoConformidad=" & CStr(p_IDNoConformidad), dbFailOnError

    ' Insert new detail rows for Auditoria NC
    Call InsertNCAuditoriaBucketsFromConstructor(p_Db, cacheId, configId, p_IDNoConformidad, snapFecha, p_Error)
    If p_Error <> "" Then Err.Raise 1000

    ' Update header sync metadata
    p_Db.Execute "UPDATE " & CACHE_HEADER & _
                  " SET IDCacheConfig=" & CStr(configId) & ", " & _
                  " Dominio=" & SqlText(DOMINIO_AUDITORIA) & ", " & _
                  " FechaSincronizacion=Now(), Estado='OK', " & _
                  " MotivoSincronizacion='INCIDENTAL', " & _
                  " VersionRegla='1.0', " & _
                  " IDNoConformidadUltimaSync=" & CStr(p_IDNoConformidad) & ", " & _
                  " OperadorSync=" & SqlText(getNombreUsuarioConectado()) & ", " & _
                  " ErrorUltimaSincronizacion=Null " & _
                  " WHERE IDCacheIndicadorProyecto=" & CStr(cacheId), dbFailOnError

    p_Ws.CommitTrans
    SyncNC_Auditoria = True
    TestHelper.AddLog p_Logs, "SyncNC_Auditoria(" & p_IDNoConformidad & ") committed"
    Exit Function

errores:
    On Error Resume Next
    p_Ws.Rollback
    On Error GoTo 0
    p_Error = "SyncNC_Auditoria: " & Err.Description
    SyncNC_Auditoria = False
End Function

Private Sub EnsureIncrementalHeader( _
        ByVal p_Db As DAO.Database, _
        ByVal p_CacheId As Long, _
        ByVal p_ConfigId As Long, _
        ByVal p_Dominio As String, _
        ByVal p_IDNoConformidad As Long, _
        Optional ByRef p_Error As String = "" _
    )
    On Error GoTo errores
    If p_Error <> "" Then Exit Sub

    p_Db.Execute "UPDATE " & CACHE_HEADER & _
                 " SET IDCacheConfig=" & CStr(p_ConfigId) & ", " & _
                 " Dominio=" & SqlText(p_Dominio) & ", " & _
                 " FechaSincronizacion=Now(), " & _
                 " UsuarioSincronizacion=" & SqlText(getNombreUsuarioConectado()) & ", " & _
                 " Estado='SYNCING', " & _
                 " MotivoSincronizacion='INCIDENTAL', " & _
                 " VersionRegla='1.0', " & _
                 " IDNoConformidadUltimaSync=" & CStr(p_IDNoConformidad) & ", " & _
                 " OperadorSync=" & SqlText(getNombreUsuarioConectado()) & ", " & _
                 " ErrorUltimaSincronizacion=Null " & _
                 " WHERE IDCacheIndicadorProyecto=" & CStr(p_CacheId), dbFailOnError

    If p_Db.RecordsAffected = 0 Then
        p_Db.Execute "INSERT INTO " & CACHE_HEADER & _
                     " (IDCacheIndicadorProyecto, IDCacheConfig, Dominio, FechaSincronizacion, " & _
                     " UsuarioSincronizacion, Estado, MotivoSincronizacion, VersionRegla, " & _
                     " IDNoConformidadUltimaSync, OperadorSync, ErrorUltimaSincronizacion) VALUES (" & _
                     CStr(p_CacheId) & ", " & _
                     CStr(p_ConfigId) & ", " & _
                     SqlText(p_Dominio) & ", Now(), " & _
                     SqlText(getNombreUsuarioConectado()) & ", " & _
                     "'SYNCING', 'INCIDENTAL', '1.0', " & _
                     CStr(p_IDNoConformidad) & ", " & _
                     SqlText(getNombreUsuarioConectado()) & ", Null)", dbFailOnError
    End If
    Exit Sub

errores:
    p_Error = "EnsureIncrementalHeader: " & Err.Description
End Sub

' ============================================================
' PRIVATE — Full domain rebuild
' ============================================================

Private Function RebuildDomain( _
        ByVal p_Db As DAO.Database, _
        ByVal p_Ws As DAO.Workspace, _
        ByVal p_Dominio As String, _
        ByRef p_Logs As Collection, _
        Optional ByRef p_Error As String = "" _
    ) As Boolean
    Dim cacheId As Long
    Dim configId As Long
    Dim rsNC As DAO.Recordset
    Dim sql As String

    On Error GoTo errores
    p_Error = ""
    RebuildDomain = False
    cacheId = IIf(p_Dominio = DOMINIO_PROYECTO, CACHE_PROYECTO_ID, CACHE_AUDITORIA_ID)

    configId = GetConfigId(p_Db, p_Dominio, p_Error)
    If p_Error <> "" Then Exit Function

    p_Ws.BeginTrans

    ' Clear existing detail and header for this domain
    p_Db.Execute "DELETE FROM " & CACHE_DETALLE & _
                  " WHERE IDCacheIndicadorProyecto=" & CStr(cacheId), dbFailOnError
    p_Db.Execute "DELETE FROM " & CACHE_HEADER & _
                  " WHERE IDCacheIndicadorProyecto=" & CStr(cacheId), dbFailOnError

    ' Insert new header
    p_Db.Execute "INSERT INTO " & CACHE_HEADER & _
                 " (IDCacheIndicadorProyecto, IDCacheConfig, Dominio, FechaSincronizacion, " & _
                 " UsuarioSincronizacion, Estado, MotivoSincronizacion, " & _
                 " VersionRegla, OperadorSync) VALUES (" & _
                 CStr(cacheId) & ", " & CStr(configId) & ", " & _
                 SqlText(p_Dominio) & ", Now(), " & _
                 SqlText(getNombreUsuarioConectado()) & ", 'SYNCING', " & _
                 "'REBUILD', '1.0', " & SqlText(getNombreUsuarioConectado()) & ")", dbFailOnError

    ' Get all NCs for this domain
    If p_Dominio = DOMINIO_PROYECTO Then
        sql = "SELECT IDNoConformidad FROM " & TBL_NC_PROYECTO & " WHERE Borrado=False"
    Else
        sql = "SELECT ID AS IDNoConformidad FROM " & TBL_NC_AUDITORIA & " WHERE Borrado=False"
    End If

    Set rsNC = p_Db.OpenRecordset(sql, dbOpenSnapshot)
    Do Until rsNC.EOF
        Dim ncId As Long
        ncId = CLng(Nz(rsNC.Fields("IDNoConformidad").value, 0))
        If ncId > 0 Then
            If p_Dominio = DOMINIO_PROYECTO Then
                Call InsertNCBucketsFromConstructor(p_Db, cacheId, configId, ncId, Now(), p_Error)
            Else
                Call InsertNCAuditoriaBucketsFromConstructor(p_Db, cacheId, configId, ncId, Now(), p_Error)
            End If
            If p_Error <> "" Then Exit Function
        End If
        rsNC.MoveNext
    Loop
    rsNC.Close
    Set rsNC = Nothing

    ' Mark header OK
    p_Db.Execute "UPDATE " & CACHE_HEADER & _
                  " SET Estado='OK', ErrorUltimaSincronizacion=Null, " & _
                  " MotivoSincronizacion='REBUILD' " & _
                  " WHERE IDCacheIndicadorProyecto=" & CStr(cacheId), dbFailOnError

    p_Ws.CommitTrans
    RebuildDomain = True
    TestHelper.AddLog p_Logs, "RebuildDomain(" & p_Dominio & ") committed"
    Exit Function

errores:
    On Error Resume Next
    p_Ws.Rollback
    On Error GoTo 0
    If Not rsNC Is Nothing Then rsNC.Close
    Set rsNC = Nothing
    p_Error = "RebuildDomain: " & Err.Description
    RebuildDomain = False
End Function

' ============================================================
' PRIVATE — Insert detail rows from constructor getters
' ============================================================

Private Sub InsertNCBucketsFromConstructor( _
        ByVal p_Db As DAO.Database, _
        ByVal p_CacheId As Long, _
        ByVal p_ConfigId As Long, _
        ByVal p_IDNoConformidad As Long, _
        ByVal p_SnapFecha As Date, _
        Optional ByRef p_Error As String = "" _
    )
    Dim items As Scripting.Dictionary
    Dim key As Variant

    On Error GoTo errores
    If p_Error <> "" Then Exit Sub

    ' NC Registradas
    Set items = constructor.getSegsNCProyectoRegistradas(p_Error:=p_Error)
    If p_Error <> "" Then Exit Sub
    If Not items Is Nothing Then
        For Each key In items.keys
            Dim nc As SegNCProyecto
            Set nc = items(key)
            If Not nc Is Nothing Then
                If CLng(Nz(nc.IDNoConformidad, 0)) = p_IDNoConformidad Then
                    Call InsertItemIntoCache(p_Db, p_CacheId, p_ConfigId, BUCKET_NC_PROY_REGISTRADAS, "NC", nc, p_SnapFecha, p_Error)
                    If p_Error <> "" Then Exit Sub
                End If
            End If
        Next key
    End If

    ' NC Pte CE
    Set items = constructor.getSegsNCProyectoPteCE(p_Error:=p_Error)
    If p_Error <> "" Then Exit Sub
    If Not items Is Nothing Then
        For Each key In items.keys
            Set nc = items(key)
            If Not nc Is Nothing Then
                If CLng(Nz(nc.IDNoConformidad, 0)) = p_IDNoConformidad Then
                    Call InsertItemIntoCache(p_Db, p_CacheId, p_ConfigId, BUCKET_NC_PROY_PTE_CE, "NC", nc, p_SnapFecha, p_Error)
                    If p_Error <> "" Then Exit Sub
                End If
            End If
        Next key
    End If

    ' NC CE Caducada
    Set items = constructor.getSegsNCProyectoCECaducada(p_Error:=p_Error)
    If p_Error <> "" Then Exit Sub
    If Not items Is Nothing Then
        For Each key In items.keys
            Set nc = items(key)
            If Not nc Is Nothing Then
                If CLng(Nz(nc.IDNoConformidad, 0)) = p_IDNoConformidad Then
                    Call InsertItemIntoCache(p_Db, p_CacheId, p_ConfigId, BUCKET_NC_PROY_CE_CADUCADA, "NC", nc, p_SnapFecha, p_Error)
                    If p_Error <> "" Then Exit Sub
                End If
            End If
        Next key
    End If

    ' NC CE No Conforme
    Set items = constructor.getSegsNCProyectoCENoConforme(p_Error:=p_Error)
    If p_Error <> "" Then Exit Sub
    If Not items Is Nothing Then
        For Each key In items.keys
            Set nc = items(key)
            If Not nc Is Nothing Then
                If CLng(Nz(nc.IDNoConformidad, 0)) = p_IDNoConformidad Then
                    Call InsertItemIntoCache(p_Db, p_CacheId, p_ConfigId, BUCKET_NC_PROY_CE_NO_CONFORME, "NC", nc, p_SnapFecha, p_Error)
                    If p_Error <> "" Then Exit Sub
                End If
            End If
        Next key
    End If

    Exit Sub

errores:
    p_Error = "InsertNCBucketsFromConstructor: " & Err.Description
End Sub

Private Sub InsertNCAuditoriaBucketsFromConstructor( _
        ByVal p_Db As DAO.Database, _
        ByVal p_CacheId As Long, _
        ByVal p_ConfigId As Long, _
        ByVal p_IDNoConformidad As Long, _
        ByVal p_SnapFecha As Date, _
        Optional ByRef p_Error As String = "" _
    )
    Dim items As Scripting.Dictionary
    Dim key As Variant

    On Error GoTo errores
    If p_Error <> "" Then Exit Sub

    ' NC Registradas
    Set items = constructor.getSegsNCAuditoriaRegistradas(p_Error:=p_Error)
    If p_Error <> "" Then Exit Sub
    If Not items Is Nothing Then
        For Each key In items.keys
            Dim ncAud As SegNCAuditoria
            Set ncAud = items(key)
            If Not ncAud Is Nothing Then
                If CLng(Nz(ncAud.id, 0)) = p_IDNoConformidad Then
                    Call InsertItemIntoCacheAuditoria(p_Db, p_CacheId, p_ConfigId, BUCKET_NC_AUD_REGISTRADAS, "NC", ncAud, p_SnapFecha, p_Error)
                    If p_Error <> "" Then Exit Sub
                End If
            End If
        Next key
    End If

    ' NC Pte CE
    Set items = constructor.getSegsNCAuditoriaPteCE(p_Error:=p_Error)
    If p_Error <> "" Then Exit Sub
    If Not items Is Nothing Then
        For Each key In items.keys
            Set ncAud = items(key)
            If Not ncAud Is Nothing Then
                If CLng(Nz(ncAud.id, 0)) = p_IDNoConformidad Then
                    Call InsertItemIntoCacheAuditoria(p_Db, p_CacheId, p_ConfigId, BUCKET_NC_AUD_PTE_CE, "NC", ncAud, p_SnapFecha, p_Error)
                    If p_Error <> "" Then Exit Sub
                End If
            End If
        Next key
    End If

    ' NC CE Caducada
    Set items = constructor.getSegsNCAuditoriaCECaducada(p_Error:=p_Error)
    If p_Error <> "" Then Exit Sub
    If Not items Is Nothing Then
        For Each key In items.keys
            Set ncAud = items(key)
            If Not ncAud Is Nothing Then
                If CLng(Nz(ncAud.id, 0)) = p_IDNoConformidad Then
                    Call InsertItemIntoCacheAuditoria(p_Db, p_CacheId, p_ConfigId, BUCKET_NC_AUD_CE_CADUCADA, "NC", ncAud, p_SnapFecha, p_Error)
                    If p_Error <> "" Then Exit Sub
                End If
            End If
        Next key
    End If

    ' NC CE No Conforme
    Set items = constructor.getSegsNCAuditoriaCENoConforme(p_Error:=p_Error)
    If p_Error <> "" Then Exit Sub
    If Not items Is Nothing Then
        For Each key In items.keys
            Set ncAud = items(key)
            If Not ncAud Is Nothing Then
                If CLng(Nz(ncAud.id, 0)) = p_IDNoConformidad Then
                    Call InsertItemIntoCacheAuditoria(p_Db, p_CacheId, p_ConfigId, BUCKET_NC_AUD_CE_NO_CONFORME, "NC", ncAud, p_SnapFecha, p_Error)
                    If p_Error <> "" Then Exit Sub
                End If
            End If
        Next key
    End If

    Exit Sub

errores:
    p_Error = "InsertNCAuditoriaBucketsFromConstructor: " & Err.Description
End Sub

Private Sub InsertItemIntoCache( _
        ByVal p_Db As DAO.Database, _
        ByVal p_CacheId As Long, _
        ByVal p_ConfigId As Long, _
        ByVal p_Bucket As String, _
        ByVal p_TipoFila As String, _
        ByVal p_Item As Object, _
        ByVal p_SnapFecha As Date, _
        Optional ByRef p_Error As String = "" _
    )
    Dim rs As DAO.Recordset
    Dim nc As SegNCProyecto
    Dim Tarea As SegTareasProyecto

    On Error GoTo errores
    If p_Error <> "" Then Exit Sub
    If p_Item Is Nothing Then Exit Sub

    Set rs = p_Db.OpenRecordset(CACHE_DETALLE, dbOpenDynaset)
    rs.AddNew
    rs!IDCacheIndicadorProyecto = p_CacheId
    rs!IDCacheConfig = p_ConfigId
    rs!dominio = DOMINIO_PROYECTO
    rs!Bucket = p_Bucket
    rs!TipoFila = p_TipoFila
    rs!FechaSnapshot = p_SnapFecha
    rs!VersionRegla = "1.0"
    rs!FechaActualizacionEntidad = p_SnapFecha

    If TypeOf p_Item Is SegNCProyecto Then
        Set nc = p_Item
        rs!IDEntidad = CLng(Nz(nc.IDNoConformidad, 0))
        rs!IDNoConformidad = CLng(Nz(nc.IDNoConformidad, 0))
        rs!RESPONSABLECALIDAD = Nz(nc.NombreCalidad, vbNullString)
        rs!ResponsableUsuarioRed = Nz(nc.NombreCalidad, vbNullString)
        rs!CodigoNoConformidad = Nz(nc.CodigoNoConformidad, vbNullString)
        rs!Descripcion = Nz(nc.Descripcion, vbNullString)
        rs!Nemotecnico = Nz(nc.Nemotecnico, vbNullString)
        rs!Estado = Nz(nc.Estado, vbNullString)
        rs!Tecnico = Nz(nc.Tecnico, vbNullString)
        rs!IDExpediente = CLng(Nz(nc.IDExpediente, 0))
        rs!DisplayTitulo = Nz(nc.CodigoNoConformidad, vbNullString)
        rs!DisplaySubtitulo = Nz(nc.Descripcion, vbNullString)
        rs!ClaveEntidad = "NC-" & CStr(nc.IDNoConformidad)
    ElseIf TypeOf p_Item Is SegTareasProyecto Then
        Set Tarea = p_Item
        rs!IDEntidad = CLng(Nz(Tarea.IDAccionRealizada, 0))
        rs!IDNoConformidad = CLng(Nz(Tarea.IDNoConformidad, 0))
        rs!IDAccionRealizada = CLng(Nz(Tarea.IDAccionRealizada, 0))
        rs!IdAccionCorrectiva = CLng(Nz(Tarea.IdAccionCorrectiva, 0))
        rs!RESPONSABLECALIDAD = Nz(Tarea.RespCalidad, vbNullString)
        rs!ResponsableUsuarioRed = Nz(Tarea.RespCalidad, vbNullString)
        rs!Tarea = Nz(Tarea.Tarea, vbNullString)
        rs!Estado = Nz(Tarea.Estado, vbNullString)
        rs!Tecnico = Nz(Tarea.Tecnico, vbNullString)
        rs!TipoNC = Nz(Tarea.TipoNC, vbNullString)
        rs!IDExpediente = CLng(Nz(Tarea.IDExpediente, 0))
        rs!NAccion = Nz(Tarea.NAccion, vbNullString)
        rs!DisplayTitulo = Nz(Tarea.Tarea, vbNullString)
        rs!DisplaySubtitulo = Nz(Tarea.Estado, vbNullString)
        rs!ClaveEntidad = "TAR-" & CStr(Tarea.IDAccionRealizada)
        If IsDate(Tarea.FechaInicio) Then rs!FechaInicio = CDate(Tarea.FechaInicio)
        If IsDate(Tarea.FechaFinPrevista) Then rs!FechaFinPrevista = CDate(Tarea.FechaFinPrevista)
        If IsDate(Tarea.FechaFinReal) Then rs!FechaFinReal = CDate(Tarea.FechaFinReal)
    End If

    rs.Update
    rs.Close
    Set rs = Nothing
    Exit Sub

errores:
    p_Error = "InsertItemIntoCache: " & Err.Description
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
End Sub

Private Sub InsertItemIntoCacheAuditoria( _
        ByVal p_Db As DAO.Database, _
        ByVal p_CacheId As Long, _
        ByVal p_ConfigId As Long, _
        ByVal p_Bucket As String, _
        ByVal p_TipoFila As String, _
        ByVal p_Item As Object, _
        ByVal p_SnapFecha As Date, _
        Optional ByRef p_Error As String = "" _
    )
    Dim rs As DAO.Recordset
    Dim ncAud As SegNCAuditoria
    Dim tareaAud As SegTareasAuditoria

    On Error GoTo errores
    If p_Error <> "" Then Exit Sub
    If p_Item Is Nothing Then Exit Sub

    Set rs = p_Db.OpenRecordset(CACHE_DETALLE, dbOpenDynaset)
    rs.AddNew
    rs!IDCacheIndicadorProyecto = p_CacheId
    rs!IDCacheConfig = p_ConfigId
    rs!dominio = DOMINIO_AUDITORIA
    rs!Bucket = p_Bucket
    rs!TipoFila = p_TipoFila
    rs!FechaSnapshot = p_SnapFecha
    rs!VersionRegla = "1.0"
    rs!FechaActualizacionEntidad = p_SnapFecha

    If TypeOf p_Item Is SegNCAuditoria Then
        Set ncAud = p_Item
        rs!IDEntidad = CLng(Nz(ncAud.id, 0))
        rs!IDNoConformidad = CLng(Nz(ncAud.id, 0))
        rs!RESPONSABLECALIDAD = Nz(ncAud.Responsable, vbNullString)
        rs!ResponsableUsuarioRed = Nz(ncAud.Responsable, vbNullString)
        rs!CodigoNoConformidad = Nz(ncAud.Numero, vbNullString)
        rs!Descripcion = Nz(ncAud.Descripcion, vbNullString)
        rs!Nemotecnico = Nz(ncAud.Auditoria, vbNullString)
        rs!Estado = Nz(ncAud.Estado, vbNullString)
        rs!DisplayTitulo = Nz(ncAud.Numero, vbNullString)
        rs!DisplaySubtitulo = Nz(ncAud.Descripcion, vbNullString)
        rs!ClaveEntidad = "NC-AUD-" & CStr(ncAud.id)
    ElseIf TypeOf p_Item Is SegTareasAuditoria Then
        Set tareaAud = p_Item
        rs!IDEntidad = CLng(Nz(tareaAud.IDAccionRealizada, 0))
        rs!IDNoConformidad = CLng(Nz(tareaAud.id, 0))
        rs!IDAccionRealizada = CLng(Nz(tareaAud.IDAccionRealizada, 0))
        rs!IdAccionCorrectiva = CLng(Nz(tareaAud.IdAccionCorrectiva, 0))
        rs!RESPONSABLECALIDAD = Nz(tareaAud.Responsable, vbNullString)
        rs!ResponsableUsuarioRed = Nz(tareaAud.Responsable, vbNullString)
        rs!Tarea = Nz(tareaAud.Tarea, vbNullString)
        rs!Estado = Nz(tareaAud.Estado, vbNullString)
        rs!TipoNC = Nz(tareaAud.TipoNC, vbNullString)
        rs!NAccion = Nz(tareaAud.NAccion, vbNullString)
        rs!CodigoNoConformidad = Nz(tareaAud.Numero, vbNullString)
        rs!Nemotecnico = Nz(tareaAud.Auditoria, vbNullString)
        rs!DisplayTitulo = Nz(tareaAud.Tarea, vbNullString)
        rs!DisplaySubtitulo = Nz(tareaAud.Estado, vbNullString)
        rs!ClaveEntidad = "TAR-AUD-" & CStr(tareaAud.IDAccionRealizada)
        If IsDate(tareaAud.FechaInicio) Then rs!FechaInicio = CDate(tareaAud.FechaInicio)
        If IsDate(tareaAud.FechaFinPrevista) Then rs!FechaFinPrevista = CDate(tareaAud.FechaFinPrevista)
        If IsDate(tareaAud.FechaFinReal) Then rs!FechaFinReal = CDate(tareaAud.FechaFinReal)
    End If

    rs.Update
    rs.Close
    Set rs = Nothing
    Exit Sub

errores:
    p_Error = "InsertItemIntoCacheAuditoria: " & Err.Description
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
End Sub

' ============================================================
' PRIVATE — Domain detection
' ============================================================

Private Function DetectarDominioDesdeNC( _
        ByVal p_Db As DAO.Database, _
        ByVal p_IDNoConformidad As Long, _
        Optional ByRef p_Error As String = "" _
    ) As String
    Dim rs As DAO.Recordset
    Dim sql As String

    On Error GoTo errores
    p_Error = ""
    DetectarDominioDesdeNC = ""

    ' Try Proyecto NC table
    sql = "SELECT IDNoConformidad FROM " & TBL_NC_PROYECTO & _
          " WHERE IDNoConformidad=" & CStr(p_IDNoConformidad)
    Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)
    If Not rs.EOF Then
        DetectarDominioDesdeNC = DOMINIO_PROYECTO
        rs.Close
        Set rs = Nothing
        Exit Function
    End If
    rs.Close
    Set rs = Nothing

    ' Try Auditoria NC table
    sql = "SELECT ID FROM " & TBL_NC_AUDITORIA & _
          " WHERE ID=" & CStr(p_IDNoConformidad)
    Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)
    If Not rs.EOF Then
        DetectarDominioDesdeNC = DOMINIO_AUDITORIA
        rs.Close
        Set rs = Nothing
        Exit Function
    End If
    rs.Close
    Set rs = Nothing

    p_Error = "DetectarDominioDesdeNC: NC not found: " & p_IDNoConformidad
    DetectarDominioDesdeNC = ""
    Exit Function

errores:
    p_Error = "DetectarDominioDesdeNC: " & Err.Description
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
End Function

' ============================================================
' PRIVATE — Config helpers
' ============================================================

Private Function GetConfigId( _
        ByVal p_Db As DAO.Database, _
        ByVal p_Dominio As String, _
        Optional ByRef p_Error As String = "" _
    ) As Long
    Dim rs As DAO.Recordset
    Dim sql As String

    On Error GoTo errores
    p_Error = ""
    GetConfigId = 0

    sql = "SELECT IDCacheConfig FROM " & CACHE_CONFIG & _
          " WHERE Dominio=" & SqlText(p_Dominio) & " AND Activo=True"
    Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)
    If Not rs.EOF Then
        GetConfigId = CLng(Nz(rs.Fields("IDCacheConfig").value, 0))
    End If
    rs.Close
    Set rs = Nothing

    If GetConfigId = 0 Then p_Error = "GetConfigId: no active config for " & p_Dominio
    Exit Function

errores:
    p_Error = "GetConfigId: " & Err.Description
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
End Function

Private Function EnsureCacheConfig( _
        ByVal p_Db As DAO.Database, _
        ByRef p_Logs As Collection, _
        Optional ByRef p_Error As String = "" _
    ) As Boolean
    Dim rs As DAO.Recordset
    Dim nextId As Long

    On Error GoTo errores
    p_Error = ""
    EnsureCacheConfig = False

    ' Check if PROYECTO config exists
    Set rs = p_Db.OpenRecordset( _
        "SELECT IDCacheConfig FROM " & CACHE_CONFIG & " WHERE Dominio=" & SqlText(DOMINIO_PROYECTO), _
        dbOpenSnapshot)
    If rs.EOF Then
        rs.Close
        Set rs = Nothing
        nextId = NextConfigId(p_Db)
        p_Db.Execute "INSERT INTO " & CACHE_CONFIG & _
                     " (IDCacheConfig, Dominio, Activo, VersionRegla, FechaConfiguracion) VALUES (" & _
                     CStr(nextId) & ", " & SqlText(DOMINIO_PROYECTO) & ", True, '1.0', Now())", dbFailOnError
        TestHelper.AddLog p_Logs, "EnsureCacheConfig: created PROYECTO config (ID=" & nextId & ")"
    Else
        rs.Close
        Set rs = Nothing
    End If

    ' Check if AUDITORIA config exists
    Set rs = p_Db.OpenRecordset( _
        "SELECT IDCacheConfig FROM " & CACHE_CONFIG & " WHERE Dominio=" & SqlText(DOMINIO_AUDITORIA), _
        dbOpenSnapshot)
    If rs.EOF Then
        rs.Close
        Set rs = Nothing
        nextId = NextConfigId(p_Db)
        p_Db.Execute "INSERT INTO " & CACHE_CONFIG & _
                     " (IDCacheConfig, Dominio, Activo, VersionRegla, FechaConfiguracion) VALUES (" & _
                     CStr(nextId) & ", " & SqlText(DOMINIO_AUDITORIA) & ", True, '1.0', Now())", dbFailOnError
        TestHelper.AddLog p_Logs, "EnsureCacheConfig: created AUDITORIA config (ID=" & nextId & ")"
    Else
        rs.Close
        Set rs = Nothing
    End If

    EnsureCacheConfig = True
    Exit Function

errores:
    p_Error = "EnsureCacheConfig: " & Err.Description
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
End Function

Private Function NextConfigId(ByVal p_Db As DAO.Database) As Long
    Dim rs As DAO.Recordset
    On Error Resume Next
    Set rs = p_Db.OpenRecordset("SELECT MAX(IDCacheConfig) AS MaxId FROM " & CACHE_CONFIG, dbOpenSnapshot)
    If rs.EOF Then
        NextConfigId = 1
    Else
        NextConfigId = CLng(Nz(rs.Fields("MaxId").value, 0)) + 1
    End If
    rs.Close
    Set rs = Nothing
End Function

' ============================================================
' PRIVATE — Count bucket helper
' ============================================================

Private Function CountBucket( _
        ByVal p_Db As DAO.Database, _
        ByVal p_CacheId As Long, _
        ByVal p_Bucket As String, _
        ByVal p_Responsable As String, _
        Optional ByRef p_Error As String = "" _
    ) As Long
    Dim rs As DAO.Recordset
    Dim sql As String

    On Error GoTo errores
    If p_Error <> "" Then Exit Function
    CountBucket = 0

    sql = "SELECT COUNT(*) AS Total FROM " & CACHE_DETALLE & _
          " WHERE IDCacheIndicadorProyecto=" & CStr(p_CacheId) & _
          " AND Bucket=" & SqlText(p_Bucket)
    If Len(p_Responsable) > 0 Then
        sql = sql & " AND ResponsableCalidad=" & SqlText(p_Responsable)
    End If

    Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)
    If Not rs.EOF Then
        CountBucket = CLng(Nz(rs.Fields("Total").value, 0))
    End If
    rs.Close
    Set rs = Nothing
    Exit Function

errores:
    p_Error = "CountBucket: " & Err.Description
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
End Function

' ============================================================
' PRIVATE — JSON helpers
' ============================================================

Private Function SqlText(ByVal p_Value As String) As String
    SqlText = "'" & Replace(Nz(p_Value, vbNullString), "'", "''") & "'"
End Function

Private Function RecordsetToJson(ByVal p_Rs As DAO.Recordset, ByRef p_Logs As Collection) As String
    Dim dict As Scripting.Dictionary
    Dim arr() As String
    Dim i As Long
    Dim col As DAO.Field

    On Error Resume Next
    If p_Rs Is Nothing Then
        RecordsetToJson = "[]"
        Exit Function
    End If
    If p_Rs.EOF Then
        RecordsetToJson = "[]"
        Exit Function
    End If

    p_Rs.MoveFirst
    i = 0
    ReDim arr(0 To p_Rs.RecordCount - 1)

    Do Until p_Rs.EOF
        Set dict = New Scripting.Dictionary
        dict.CompareMode = TextCompare
        For Each col In p_Rs.Fields
            Dim val As Variant
            val = p_Rs.Fields(col.name).value
            If IsNull(val) Then
                dict(col.name) = ""
            ElseIf IsDate(val) Then
                dict(col.name) = Format(CDate(val), "yyyy-mm-dd hh:nn:ss")
            Else
                dict(col.name) = val
            End If
        Next col
        arr(i) = JsonConverter.ConvertToJson(dict)
        i = i + 1
        p_Rs.MoveNext
    Loop

    RecordsetToJson = "[" & Join(arr, ",") & "]"
    Set dict = Nothing
End Function

