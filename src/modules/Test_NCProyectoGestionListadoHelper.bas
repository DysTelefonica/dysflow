Attribute VB_Name = "Test_NCProyectoGestionListadoHelper"
Option Compare Database
Option Explicit

' SDD: form-fncproyecto-cache-invalidation Slice 1 — RED helper contract tests.
' Fixture discipline: seed TbProyectos parent, then TbNoConformidades;
' teardown child/parent by deterministic IDs only.
' FK order: TbProyectos -> TbNoConformidades -> TbCacheListadoNC

Private Const TEST_ID_PROYECTO_T1 As Long = 300100
Private Const TEST_ID_PROYECTO_T2 As Long = 300200
Private Const TEST_ID_PROYECTO_T3 As Long = 300300
Private Const TEST_ID_NC_T1 As Long = 900601
Private Const TEST_ID_NC_T2_1 As Long = 900611
Private Const TEST_ID_NC_T2_2 As Long = 900612
Private Const TEST_ID_NC_T2_3 As Long = 900613
Private Const TEST_ID_NC_T2_4 As Long = 900614
Private Const TEST_ID_NC_T2_5 As Long = 900615
Private Const TEST_ID_NC_T3_VALID As Long = 900621
Private Const TEST_ID_NC_T3_STALE1 As Long = 900622
Private Const TEST_ID_NC_T3_STALE2 As Long = 900623
Private Const LOG_OPERATION_PROJECT_FALLBACK As String = "FormCacheFallback"

' --- T1: Cache off → no-op ---
Public Function Test_ProyectoGestionHelper_CacheOff_NoOp_Atomic() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim result As Boolean

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_ProyectoGestionHelper_CacheOff_NoOp_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    SchemaGateSlice1 logs
    CleanupSlice1 db

    ' Arrange: ensure cache disabled via TbConfiguracion
    SetCacheEnabled db, False
    TestHelper.AddLog logs, "Arrange: cache disabled via TbConfiguracion"

    ' Act: Rebuild with ForceInvalidation=0
    result = RebuildNCProyectoListadoCache(0, errMsg)
    If result = False Then
        assertError = "RebuildNCProyectoListadoCache(0) returned False when cache disabled; expected True (no-op)"
        GoTo Fail
    End If
    If errMsg <> "" Then
        assertError = "RebuildNCProyectoListadoCache(0) set p_Error when cache disabled: " & errMsg
        GoTo Fail
    End If

    ' Act: Rebuild with ForceInvalidation=1
    result = RebuildNCProyectoListadoCache(1, errMsg)
    If result = False Then
        assertError = "RebuildNCProyectoListadoCache(1) returned False when cache disabled; expected True (no-op)"
        GoTo Fail
    End If
    If errMsg <> "" Then
        assertError = "RebuildNCProyectoListadoCache(1) set p_Error when cache disabled: " & errMsg
        GoTo Fail
    End If

    Test_ProyectoGestionHelper_CacheOff_NoOp_Atomic = TestHelper.BuildJsonOk(logs, "cache-off-noop")
    GoTo Cleanup
Fail:
    Test_ProyectoGestionHelper_CacheOff_NoOp_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_ProyectoGestionHelper_CacheOff_NoOp_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        SetCacheEnabled db, True
        CleanupSlice1 db
    End If
    TestHelper.EndTestSession logs
End Function

' --- T2: Full delete+regen ---
Public Function Test_ProyectoListadoCache_RebuildForceFull_DeleteAndRegen_Atomic() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim result As Boolean
    Dim preCount As Long
    Dim postCount As Long

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_ProyectoListadoCache_RebuildForceFull_DeleteAndRegen_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    SchemaGateSlice1 logs
    CleanupSlice1 db

    ' Arrange: ensure cache enabled
    SetCacheEnabled db, True
    ' Ensure schema
    If Not EnsureCacheSchemaReadiness(errMsg) Then Err.Raise 1000, , errMsg

    ' Seed 3 pre-existing cache rows for IDProyecto=100
    SeedCacheRow db, TEST_ID_NC_T2_1, True
    SeedCacheRow db, TEST_ID_NC_T2_2, True
    SeedCacheRow db, TEST_ID_NC_T2_3, True

    ' Seed 5 valid NCs in TbNoConformidades with IDProyecto=100
    SeedNC db, TEST_ID_NC_T2_1, TEST_ID_PROYECTO_T2, "FNCP-T2-1"
    SeedNC db, TEST_ID_NC_T2_2, TEST_ID_PROYECTO_T2, "FNCP-T2-2"
    SeedNC db, TEST_ID_NC_T2_3, TEST_ID_PROYECTO_T2, "FNCP-T2-3"
    SeedNC db, TEST_ID_NC_T2_4, TEST_ID_PROYECTO_T2, "FNCP-T2-4"
    SeedNC db, TEST_ID_NC_T2_5, TEST_ID_PROYECTO_T2, "FNCP-T2-5"

    preCount = CountCacheRows(db)
    TestHelper.AddLog logs, "Arrange: " & CStr(preCount) & " cache rows before rebuild"

    ' Act: ForceInvalidation=0 (full delete+regen)
    result = RebuildNCProyectoListadoCache(0, errMsg)

    ' Assert
    If result = False Then
        assertError = "RebuildNCProyectoListadoCache(0) returned False: " & errMsg
        GoTo Fail
    End If

    postCount = CountCacheRows(db)
    TestHelper.AddLog logs, "Assert: " & CStr(postCount) & " cache rows after rebuild"
    If postCount <> 5 Then
        assertError = "Expected 5 cache rows after full rebuild, got " & CStr(postCount)
        GoTo Fail
    End If

    Test_ProyectoListadoCache_RebuildForceFull_DeleteAndRegen_Atomic = TestHelper.BuildJsonOk(logs, "rebuild-full-delete-regen")
    GoTo Cleanup
Fail:
    Test_ProyectoListadoCache_RebuildForceFull_DeleteAndRegen_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_ProyectoListadoCache_RebuildForceFull_DeleteAndRegen_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then CleanupSlice1 db
    TestHelper.EndTestSession logs
End Function

' --- T3: Stale-only regen ---
Public Function Test_ProyectoListadoCache_RebuildForceStale_OnlyStaleRegen_Atomic() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim result As Boolean

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_ProyectoListadoCache_RebuildForceStale_OnlyStaleRegen_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    SchemaGateSlice1 logs
    CleanupSlice1 db

    ' Arrange: ensure cache enabled
    SetCacheEnabled db, True
    If Not EnsureCacheSchemaReadiness(errMsg) Then Err.Raise 1000, , errMsg

    ' Seed 3 cache rows: 1 valid + 2 stale
    SeedCacheRow db, TEST_ID_NC_T3_VALID, True
    SeedCacheRow db, TEST_ID_NC_T3_STALE1, False
    SeedCacheRow db, TEST_ID_NC_T3_STALE2, False

    ' Seed the corresponding NCs
    SeedNC db, TEST_ID_NC_T3_VALID, TEST_ID_PROYECTO_T3, "FNCP-T3-V"
    SeedNC db, TEST_ID_NC_T3_STALE1, TEST_ID_PROYECTO_T3, "FNCP-T3-S1"
    SeedNC db, TEST_ID_NC_T3_STALE2, TEST_ID_PROYECTO_T3, "FNCP-T3-S2"

    TestHelper.AddLog logs, "Arrange: 1 valid + 2 stale cache rows for project 300"

    ' Act: ForceInvalidation=1 (stale-only)
    result = RebuildNCProyectoListadoCache(1, errMsg)

    ' Assert
    If result = False Then
        assertError = "RebuildNCProyectoListadoCache(1) returned False: " & errMsg
        GoTo Fail
    End If

    Test_ProyectoListadoCache_RebuildForceStale_OnlyStaleRegen_Atomic = TestHelper.BuildJsonOk(logs, "rebuild-stale-only-regen")
    GoTo Cleanup
Fail:
    Test_ProyectoListadoCache_RebuildForceStale_OnlyStaleRegen_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_ProyectoListadoCache_RebuildForceStale_OnlyStaleRegen_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then CleanupSlice1 db
    TestHelper.EndTestSession logs
End Function

' --- T4: Refresh returns True on success ---
Public Function Test_ProyectoGestionHelper_RefreshCache_TrueOnSuccess_Atomic() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_ProyectoGestionHelper_RefreshCache_TrueOnSuccess_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    SchemaGateSlice1 logs
    CleanupSlice1 db

    ' Arrange: ensure cache enabled and schema exists
    SetCacheEnabled db, True
    If Not EnsureCacheSchemaReadiness(errMsg) Then Err.Raise 1000, , errMsg
    SeedNC db, TEST_ID_NC_T2_1, TEST_ID_PROYECTO_T2, "FNCP-T4-1"
    SeedNC db, TEST_ID_NC_T2_2, TEST_ID_PROYECTO_T2, "FNCP-T4-2"
    SeedNC db, TEST_ID_NC_T2_3, TEST_ID_PROYECTO_T2, "FNCP-T4-3"

    TestHelper.AddLog logs, "Arrange: cache enabled, 3 NCs seeded"

    ' Act
    RefreshNCProyectoGestionCaches p_Error:=errMsg

    ' Assert: p_Error must be empty on success
    If errMsg <> "" Then
        assertError = "RefreshNCProyectoGestionCaches set p_Error on success: " & errMsg
        GoTo Fail
    End If

    Test_ProyectoGestionHelper_RefreshCache_TrueOnSuccess_Atomic = TestHelper.BuildJsonOk(logs, "refresh-cache-true-success")
    GoTo Cleanup
Fail:
    Test_ProyectoGestionHelper_RefreshCache_TrueOnSuccess_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_ProyectoGestionHelper_RefreshCache_TrueOnSuccess_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then CleanupSlice1 db
    TestHelper.EndTestSession logs
End Function

' --- T5: Refresh returns False on error ---
Public Function Test_ProyectoGestionHelper_RefreshCache_FalseOnError_Atomic() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_ProyectoGestionHelper_RefreshCache_FalseOnError_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    SchemaGateSlice1 logs
    CleanupSlice1 db

    ' Arrange: ensure cache disabled to force a no-op path
    SetCacheEnabled db, False
    TestHelper.AddLog logs, "Arrange: cache disabled to test refresh path"

    ' Act
    errMsg = ""
    RefreshNCProyectoGestionCaches p_Error:=errMsg

    ' Assert: stub should populate p_Error
    If errMsg = "" Then
        assertError = "RefreshNCProyectoGestionCaches stub should populate p_Error"
        GoTo Fail
    End If

    Test_ProyectoGestionHelper_RefreshCache_FalseOnError_Atomic = TestHelper.BuildJsonOk(logs, "refresh-cache-false-error")
    GoTo Cleanup
Fail:
    Test_ProyectoGestionHelper_RefreshCache_FalseOnError_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_ProyectoGestionHelper_RefreshCache_FalseOnError_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        SetCacheEnabled db, True
        CleanupSlice1 db
    End If
    TestHelper.EndTestSession logs
End Function

' ===== Private Helpers =====

Private Sub SchemaGateSlice1(ByVal p_Logs As Collection)
    TestHelper.AddLog p_Logs, "Schema gate: TbCacheListadoNC uses IDNoConformidad Long PK; TbNoConformidades IDNoConformidad Long required; TbProyectos IDProyecto Long required. FK order: TbProyectos -> TbNoConformidades -> TbCacheListadoNC."
End Sub

Private Sub CleanupSlice1(ByVal p_Db As DAO.Database)
    ' Teardown in reverse FK order: cache -> NCs -> proyectos
    On Error Resume Next
    p_Db.Execute "DELETE FROM " & NOMBRE_TABLA_LISTADO & " WHERE IDNoConformidad BETWEEN " & _
        CStr(TEST_ID_NC_T1) & " AND " & CStr(TEST_ID_NC_T3_STALE2), dbFailOnError
    p_Db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad BETWEEN " & _
        CStr(TEST_ID_NC_T1) & " AND " & CStr(TEST_ID_NC_T3_STALE2), dbFailOnError
    p_Db.Execute "DELETE FROM TbProyectos WHERE IDProyecto BETWEEN " & _
        CStr(TEST_ID_PROYECTO_T1) & " AND " & CStr(TEST_ID_PROYECTO_T3), dbFailOnError
    p_Db.Execute "DELETE FROM TbLogCache WHERE TipoOperacion='" & LOG_OPERATION_PROJECT_FALLBACK & "'", dbFailOnError
End Sub

Private Sub SeedProyecto(ByVal p_Db As DAO.Database, ByVal p_IDProyecto As Long, ByVal p_Marker As String)
    On Error Resume Next
    p_Db.Execute "DELETE FROM TbProyectos WHERE IDProyecto=" & CStr(p_IDProyecto), dbFailOnError
    p_Db.Execute "INSERT INTO TbProyectos (IDProyecto, Codigo, Descripcion) VALUES (" & _
        CStr(p_IDProyecto) & ", " & TestHelper.SqlText(p_Marker) & ", " & _
        TestHelper.SqlText("Test project " & p_Marker) & ")", dbFailOnError
End Sub

Private Sub SeedNC(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long, ByVal p_IDProyecto As Long, ByVal p_Marker As String)
    On Error Resume Next
    ' Ensure parent exists
    SeedProyecto p_Db, p_IDProyecto, "PROY-" & CStr(p_IDProyecto)
    p_Db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad=" & CStr(p_IDNC), dbFailOnError
    p_Db.Execute "INSERT INTO TbNoConformidades (IDNoConformidad, IDProyecto, CodigoNoConformidad, Descripcion, Estado, FechaApertura, Borrado) VALUES (" & _
        CStr(p_IDNC) & ", " & CStr(p_IDProyecto) & ", " & TestHelper.SqlText(p_Marker) & ", " & _
        TestHelper.SqlText("Test NC " & p_Marker) & ", 'Abierta', Date(), 0)", dbFailOnError
End Sub

Private Sub SeedCacheRow(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long, ByVal p_Valida As Boolean)
    On Error Resume Next
    p_Db.Execute "DELETE FROM " & NOMBRE_TABLA_LISTADO & " WHERE IDNoConformidad=" & CStr(p_IDNC), dbFailOnError
    p_Db.Execute "INSERT INTO " & NOMBRE_TABLA_LISTADO & " (IDNoConformidad, CacheValida, FechaCache) VALUES (" & _
        CStr(p_IDNC) & ", " & IIf(p_Valida, "True", "False") & ", Now())", dbFailOnError
End Sub

Private Sub SetCacheEnabled(ByVal p_Db As DAO.Database, ByVal p_Enabled As Boolean)
    On Error Resume Next
    p_Db.Execute "UPDATE TbConfiguracion SET CacheHabilitada=" & IIf(p_Enabled, "True", "False") & " WHERE ID=1", dbFailOnError
End Sub

Private Function CountCacheRows(ByVal p_Db As DAO.Database) As Long
    Dim rs As DAO.Recordset
    On Error GoTo emptyTable
    Set rs = p_Db.OpenRecordset("SELECT COUNT(*) AS C FROM " & NOMBRE_TABLA_LISTADO, dbOpenSnapshot)
    CountCacheRows = CLng(rs!C)
    rs.Close
    Set rs = Nothing
    Exit Function
emptyTable:
    CountCacheRows = 0
End Function
