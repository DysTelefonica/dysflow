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
Private Const TEST_ID_PROYECTO_T8 As Long = 300800
Private Const TEST_ID_NC_T1 As Long = 900601
Private Const TEST_ID_NC_T2_1 As Long = 900611
Private Const TEST_ID_NC_T2_2 As Long = 900612
Private Const TEST_ID_NC_T2_3 As Long = 900613
Private Const TEST_ID_NC_T2_4 As Long = 900614
Private Const TEST_ID_NC_T2_5 As Long = 900615
Private Const TEST_ID_NC_T3_VALID As Long = 900621
Private Const TEST_ID_NC_T3_STALE1 As Long = 900622
Private Const TEST_ID_NC_T3_STALE2 As Long = 900623
Private Const TEST_ID_NC_T8_1 As Long = 900681
Private Const TEST_ID_NC_T8_2 As Long = 900682
Private Const TEST_ID_NC_T8_3 As Long = 900683
Private Const TEST_ID_NC_T8_4 As Long = 900684
Private Const TEST_ID_NC_T8_5 As Long = 900685
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
    Dim invalidPostCount As Long
    Dim oldPostCount As Long
    Dim rebuildStartedAt As Date

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

    ' Seed 3 pre-existing stale cache rows for deterministic T2 IDs.
    ' Full rebuild must replace/regenerate these rows instead of relying on global table size.
    SeedCacheRow db, TEST_ID_NC_T2_1, False, DateAdd("d", -1, Now())
    SeedCacheRow db, TEST_ID_NC_T2_2, False, DateAdd("d", -1, Now())
    SeedCacheRow db, TEST_ID_NC_T2_3, False, DateAdd("d", -1, Now())

    ' Seed 5 valid NCs in TbNoConformidades with IDProyecto=100
    SeedNC db, TEST_ID_NC_T2_1, TEST_ID_PROYECTO_T2, "FNCP-T2-1"
    SeedNC db, TEST_ID_NC_T2_2, TEST_ID_PROYECTO_T2, "FNCP-T2-2"
    SeedNC db, TEST_ID_NC_T2_3, TEST_ID_PROYECTO_T2, "FNCP-T2-3"
    SeedNC db, TEST_ID_NC_T2_4, TEST_ID_PROYECTO_T2, "FNCP-T2-4"
    SeedNC db, TEST_ID_NC_T2_5, TEST_ID_PROYECTO_T2, "FNCP-T2-5"

    preCount = CountT2FixtureCacheRows(db)
    TestHelper.AddLog logs, "Arrange: " & CStr(preCount) & " deterministic T2 cache rows before rebuild"
    If preCount <> 3 Then
        assertError = "Expected 3 deterministic T2 cache rows before rebuild, got " & CStr(preCount)
        GoTo Fail
    End If

    ' Act: ForceInvalidation=0 (full delete+regen)
    rebuildStartedAt = Now()
    result = RebuildNCProyectoListadoCache(0, errMsg)

    ' Assert
    If result = False Then
        assertError = "RebuildNCProyectoListadoCache(0) returned False: " & errMsg
        GoTo Fail
    End If

    postCount = CountT2FixtureCacheRows(db)
    TestHelper.AddLog logs, "Assert: " & CStr(postCount) & " deterministic T2 cache rows after rebuild"
    If postCount <> 5 Then
        assertError = "Expected 5 deterministic T2 cache rows after full rebuild, got " & CStr(postCount)
        GoTo Fail
    End If

    invalidPostCount = CountT2InvalidCacheRows(db)
    If invalidPostCount <> 0 Then
        assertError = "Expected all deterministic T2 cache rows to be valid after full rebuild, got " & CStr(invalidPostCount) & " invalid rows"
        GoTo Fail
    End If

    oldPostCount = CountT2OldCacheRows(db, rebuildStartedAt)
    If oldPostCount <> 0 Then
        assertError = "Expected deterministic T2 pre-existing cache rows to be regenerated, got " & CStr(oldPostCount) & " rows with old FechaCache"
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
    Dim postCount As Long

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

    postCount = CountCacheRowsWhere(db, T4FixtureIdPredicate())
    If postCount <> 3 Then
        assertError = "Expected 3 deterministic T4 cache rows after refresh, got " & CStr(postCount)
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

    ' Arrange: remove the sandbox cache table to force the controlled error path.
    If TableExistsInDb(db, NOMBRE_TABLA_LISTADO) Then
        db.Execute "DROP TABLE " & NOMBRE_TABLA_LISTADO, dbFailOnError
    End If
    TestHelper.AddLog logs, "Arrange: dropped TbCacheListadoNC in sandbox"

    ' Act
    errMsg = ""
    RefreshNCProyectoGestionCaches p_Error:=errMsg

    ' Assert: missing cache table should populate p_Error without relying on lucky data.
    If errMsg = "" Then
        assertError = "RefreshNCProyectoGestionCaches should populate p_Error when TbCacheListadoNC is missing"
        GoTo Fail
    End If
    If InStr(1, errMsg, "TbCacheListadoNC", vbTextCompare) = 0 Then
        assertError = "Expected p_Error to mention TbCacheListadoNC, got: " & errMsg
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
        EnsureCacheSchemaReadiness errMsg
        SetCacheEnabled db, True
        CleanupSlice1 db
    End If
    TestHelper.EndTestSession logs
End Function

' --- T8: No-UI helper happy path refreshes cache and invalidates entorno combos ---
Public Function Test_ProyectoGestionForm_ActualizarLista_SequenceHappyPath_Atomic() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim postCount As Long
    Dim entorno As Entorno
    Dim result As Scripting.Dictionary

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_ProyectoGestionForm_ActualizarLista_SequenceHappyPath_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    SchemaGateSlice1 logs
    CleanupSlice1 db
    SetCacheEnabled db, True
    If Not EnsureCacheSchemaReadiness(errMsg) Then Err.Raise 1000, , errMsg

    SeedNC db, TEST_ID_NC_T8_1, TEST_ID_PROYECTO_T8, "FNCP-T8-1"
    SeedNC db, TEST_ID_NC_T8_2, TEST_ID_PROYECTO_T8, "FNCP-T8-2"
    SeedNC db, TEST_ID_NC_T8_3, TEST_ID_PROYECTO_T8, "FNCP-T8-3"
    SeedNC db, TEST_ID_NC_T8_4, TEST_ID_PROYECTO_T8, "FNCP-T8-4"
    SeedNC db, TEST_ID_NC_T8_5, TEST_ID_PROYECTO_T8, "FNCP-T8-5"
    TestHelper.AddLog logs, "Arrange: 5 deterministic T8 NC rows seeded"

    Set entorno = New Entorno

    Set result = PrepareNCProyectoGestionRefresh(entorno, errMsg)

    If result Is Nothing Then
        assertError = "PrepareNCProyectoGestionRefresh returned Nothing"
        GoTo Fail
    End If
    If Not CBool(result("Success")) Then
        assertError = "Expected helper Success=True, failed at " & CStr(result("FailedStep")) & ": " & errMsg
        GoTo Fail
    End If
    If Not CBool(result("CacheRefreshed")) Then
        assertError = "Expected CacheRefreshed=True"
        GoTo Fail
    End If
    If Not CBool(result("EntornoInvalidated")) Then
        assertError = "Expected EntornoInvalidated=True"
        GoTo Fail
    End If
    If CStr(result("FeedbackCaption")) <> "Cache recargado" Then
        assertError = "Expected FeedbackCaption='Cache recargado', got '" & CStr(result("FeedbackCaption")) & "'"
        GoTo Fail
    End If

    postCount = CountCacheRowsWhere(db, T8FixtureIdPredicate())
    If postCount <> 5 Then
        assertError = "Expected 5 deterministic T8 cache rows after helper refresh, got " & CStr(postCount)
        GoTo Fail
    End If

    Test_ProyectoGestionForm_ActualizarLista_SequenceHappyPath_Atomic = TestHelper.BuildJsonOk(logs, "helper-refresh-happy-path")
    GoTo Cleanup
Fail:
    Test_ProyectoGestionForm_ActualizarLista_SequenceHappyPath_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_ProyectoGestionForm_ActualizarLista_SequenceHappyPath_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then CleanupSlice1 db
    TestHelper.EndTestSession logs
End Function

' --- T9: No-UI helper returns controlled error when refresh fails ---
Public Function Test_ProyectoGestionForm_ActualizarLista_RefreshError_RaiseAndCleanup_Atomic() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim entorno As Entorno
    Dim result As Scripting.Dictionary

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_ProyectoGestionForm_ActualizarLista_RefreshError_RaiseAndCleanup_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    SchemaGateSlice1 logs
    CleanupSlice1 db
    SetCacheEnabled db, True
    If Not EnsureCacheSchemaReadiness(errMsg) Then Err.Raise 1000, , errMsg

    db.Execute "DROP TABLE " & NOMBRE_TABLA_LISTADO, dbFailOnError
    TestHelper.AddLog logs, "Arrange: dropped TbCacheListadoNC to force refresh failure without UI"

    Set entorno = New Entorno
    Set result = PrepareNCProyectoGestionRefresh(entorno, errMsg)

    If result Is Nothing Then
        assertError = "PrepareNCProyectoGestionRefresh returned Nothing on refresh error"
        GoTo Fail
    End If
    If CBool(result("Success")) Then
        assertError = "Expected helper Success=False when TbCacheListadoNC is missing"
        GoTo Fail
    End If
    If CBool(result("CacheRefreshed")) Then
        assertError = "Expected CacheRefreshed=False when refresh fails"
        GoTo Fail
    End If
    If CBool(result("EntornoInvalidated")) Then
        assertError = "Expected EntornoInvalidated=False when refresh fails before invalidation"
        GoTo Fail
    End If
    If CStr(result("FailedStep")) <> "RefreshNCProyectoGestionCaches" Then
        assertError = "Expected FailedStep='RefreshNCProyectoGestionCaches', got '" & CStr(result("FailedStep")) & "'"
        GoTo Fail
    End If
    If InStr(1, errMsg, "TbCacheListadoNC", vbTextCompare) = 0 Then
        assertError = "Expected p_Error to mention TbCacheListadoNC, got: " & errMsg
        GoTo Fail
    End If

    Test_ProyectoGestionForm_ActualizarLista_RefreshError_RaiseAndCleanup_Atomic = TestHelper.BuildJsonOk(logs, "helper-refresh-error")
    GoTo Cleanup
Fail:
    Test_ProyectoGestionForm_ActualizarLista_RefreshError_RaiseAndCleanup_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_ProyectoGestionForm_ActualizarLista_RefreshError_RaiseAndCleanup_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then EnsureCacheSchemaReadiness errMsg
    If Not db Is Nothing Then CleanupSlice1 db
    TestHelper.EndTestSession logs
End Function

' --- T10: Audit handler rename source contract, no UI ---
Public Function Test_AuditGestionForm_RenameHandler_NoRegression_Atomic() As String
    Dim logs As Collection
    Dim assertError As String
    Dim clsText As String
    Dim formText As String
    Dim auditTestText As String
    Dim clsPath As String
    Dim formPath As String
    Dim auditTestPath As String
    Dim fso As Object
    Dim controlPos As Long
    Dim mappingWindow As String

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    Set fso = CreateObject("Scripting.FileSystemObject")
    clsPath = CurrentProject.Path & "\src\forms\Form_FormNCAuditoriaGestion.cls"
    formPath = CurrentProject.Path & "\src\forms\Form_FormNCAuditoriaGestion.form.txt"
    auditTestPath = CurrentProject.Path & "\src\modules\Test_NCAuditoriaGestionListadoHelper.bas"

    clsText = fso.OpenTextFile(clsPath, 1, False).ReadAll
    formText = fso.OpenTextFile(formPath, 1, False).ReadAll
    auditTestText = fso.OpenTextFile(auditTestPath, 1, False).ReadAll
    TestHelper.AddLog logs, "Arrange: inspected exported audit form cls/form artifacts without opening UI"

    If InStr(1, clsText, "Private Sub ComandoActualizar_Click()", vbTextCompare) > 0 Then
        assertError = "Old audit handler signature still exists in exported cls"
        GoTo Fail
    End If
    If InStr(1, clsText, "Al ComandoActualizar_Click se ha producido", vbTextCompare) > 0 Then
        assertError = "Old audit handler error message still exists in exported cls"
        GoTo Fail
    End If
    If InStr(1, clsText, "Private Sub ComandoActualizarLista_Click()", vbTextCompare) = 0 Then
        assertError = "Renamed audit handler signature was not found in exported cls"
        GoTo Fail
    End If
    If InStr(1, clsText, "Al ComandoActualizarLista_Click se ha producido", vbTextCompare) = 0 Then
        assertError = "Renamed audit handler error message was not found in exported cls"
        GoTo Fail
    End If
    If InStr(1, formText, "Private Sub ComandoActualizar_Click()", vbTextCompare) > 0 Then
        assertError = "Old audit handler signature still exists in exported form artifact"
        GoTo Fail
    End If
    If InStr(1, formText, "Al ComandoActualizar_Click se ha producido", vbTextCompare) > 0 Then
        assertError = "Old audit handler error message still exists in exported form artifact"
        GoTo Fail
    End If
    If InStr(1, formText, "Private Sub ComandoActualizarLista_Click()", vbTextCompare) = 0 Then
        assertError = "Renamed audit handler signature was not found in exported form artifact"
        GoTo Fail
    End If
    If InStr(1, formText, "Al ComandoActualizarLista_Click se ha producido", vbTextCompare) = 0 Then
        assertError = "Renamed audit handler error message was not found in exported form artifact"
        GoTo Fail
    End If
    If InStr(1, formText, "Name =""ComandoActualizar""", vbTextCompare) > 0 Then
        assertError = "Old audit form control Name=""ComandoActualizar"" still exists"
        GoTo Fail
    End If
    If InStr(1, formText, "Name =""ComandoActualizarLista""", vbTextCompare) = 0 Then
        assertError = "Audit form control Name=""ComandoActualizarLista"" was not found"
        GoTo Fail
    End If
    controlPos = InStr(1, formText, "Name =""ComandoActualizarLista""", vbTextCompare)
    mappingWindow = Mid$(formText, controlPos, 500)
    If InStr(1, mappingWindow, "OnClick =""[Event Procedure]""", vbTextCompare) = 0 Then
        assertError = "Audit form control OnClick event procedure mapping was not found near renamed control"
        GoTo Fail
    End If
    If InStr(1, auditTestText, "Public Function Test_AuditListadoHelper_CacheOn_SourceContract_RED() As String", vbTextCompare) = 0 Then
        assertError = "Audit cache-on source contract regression test marker is missing"
        GoTo Fail
    End If

    Test_AuditGestionForm_RenameHandler_NoRegression_Atomic = TestHelper.BuildJsonOk(logs, "audit-rename-source-contract")
    Exit Function
Fail:
    Test_AuditGestionForm_RenameHandler_NoRegression_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    Exit Function
EH:
    Test_AuditGestionForm_RenameHandler_NoRegression_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

' ===== Private Helpers =====

Private Sub SchemaGateSlice1(ByVal p_Logs As Collection)
    TestHelper.AddLog p_Logs, "Schema gate: TbCacheListadoNC uses IDNoConformidad Long PK; TbNoConformidades IDNoConformidad, CodigoNoConformidad, EXPEDIENTE required; TbProyectos IDProyecto Long required. FK order: TbProyectos -> TbNoConformidades -> TbCacheListadoNC."
End Sub

Private Sub CleanupSlice1(ByVal p_Db As DAO.Database)
    ' Teardown in reverse FK order: cache -> NCs -> proyectos
    On Error Resume Next
    p_Db.Execute "DELETE FROM " & NOMBRE_TABLA_LISTADO & " WHERE IDNoConformidad BETWEEN " & _
        CStr(TEST_ID_NC_T1) & " AND " & CStr(TEST_ID_NC_T3_STALE2), dbFailOnError
    p_Db.Execute "DELETE FROM " & NOMBRE_TABLA_LISTADO & " WHERE " & T8FixtureIdPredicate(), dbFailOnError
    p_Db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad BETWEEN " & _
        CStr(TEST_ID_NC_T1) & " AND " & CStr(TEST_ID_NC_T3_STALE2), dbFailOnError
    p_Db.Execute "DELETE FROM TbNoConformidades WHERE " & T8FixtureIdPredicate(), dbFailOnError
    p_Db.Execute "DELETE FROM TbProyectos WHERE IDProyecto BETWEEN " & _
        CStr(TEST_ID_PROYECTO_T1) & " AND " & CStr(TEST_ID_PROYECTO_T3), dbFailOnError
    p_Db.Execute "DELETE FROM TbProyectos WHERE IDProyecto=" & CStr(TEST_ID_PROYECTO_T8), dbFailOnError
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
    On Error GoTo EH

    ' Ensure parent exists
    SeedProyecto p_Db, p_IDProyecto, "PROY-" & CStr(p_IDProyecto)
    p_Db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad=" & CStr(p_IDNC), dbFailOnError
    p_Db.Execute "INSERT INTO TbNoConformidades (IDNoConformidad, IDProyecto, CodigoNoConformidad, EXPEDIENTE, Descripcion, Estado, FechaApertura, Borrado) VALUES (" & _
        CStr(p_IDNC) & ", " & CStr(p_IDProyecto) & ", " & TestHelper.SqlText(p_Marker) & ", " & _
        TestHelper.SqlText("EXP-" & p_Marker) & ", " & _
        TestHelper.SqlText("Test NC " & p_Marker) & ", 'Abierta', Date(), 0)", dbFailOnError
    Exit Sub

EH:
    Err.Raise Err.Number, "Test_NCProyectoGestionListadoHelper.SeedNC", _
        "SeedNC failed for IDNoConformidad=" & CStr(p_IDNC) & ", marker=" & p_Marker & ": " & Err.Description
End Sub

Private Sub SeedCacheRow(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long, ByVal p_Valida As Boolean, Optional ByVal p_FechaCache As Date = 0)
    Dim fechaSql As String

    On Error Resume Next
    If p_FechaCache = 0 Then
        fechaSql = "Now()"
    Else
        fechaSql = "#" & Format$(p_FechaCache, "yyyy-mm-dd hh:nn:ss") & "#"
    End If

    p_Db.Execute "DELETE FROM " & NOMBRE_TABLA_LISTADO & " WHERE IDNoConformidad=" & CStr(p_IDNC), dbFailOnError
    p_Db.Execute "INSERT INTO " & NOMBRE_TABLA_LISTADO & " (IDNoConformidad, CacheValida, FechaCache) VALUES (" & _
        CStr(p_IDNC) & ", " & IIf(p_Valida, "True", "False") & ", " & fechaSql & ")", dbFailOnError
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

Private Function CountT2FixtureCacheRows(ByVal p_Db As DAO.Database) As Long
    CountT2FixtureCacheRows = CountCacheRowsWhere(p_Db, T2FixtureIdPredicate())
End Function

Private Function CountT2InvalidCacheRows(ByVal p_Db As DAO.Database) As Long
    CountT2InvalidCacheRows = CountCacheRowsWhere(p_Db, T2FixtureIdPredicate() & " AND Nz(CacheValida,False)=False")
End Function

Private Function CountT2OldCacheRows(ByVal p_Db As DAO.Database, ByVal p_RebuildStartedAt As Date) As Long
    CountT2OldCacheRows = CountCacheRowsWhere(p_Db, T2FixtureIdPredicate() & _
        " AND FechaCache < #" & Format$(p_RebuildStartedAt, "yyyy-mm-dd hh:nn:ss") & "#")
End Function

Private Function T2FixtureIdPredicate() As String
    T2FixtureIdPredicate = "IDNoConformidad IN (" & _
        CStr(TEST_ID_NC_T2_1) & "," & _
        CStr(TEST_ID_NC_T2_2) & "," & _
        CStr(TEST_ID_NC_T2_3) & "," & _
        CStr(TEST_ID_NC_T2_4) & "," & _
        CStr(TEST_ID_NC_T2_5) & ")"
End Function

Private Function T4FixtureIdPredicate() As String
    T4FixtureIdPredicate = "IDNoConformidad IN (" & _
        CStr(TEST_ID_NC_T2_1) & "," & _
        CStr(TEST_ID_NC_T2_2) & "," & _
        CStr(TEST_ID_NC_T2_3) & ")"
End Function

Private Function T8FixtureIdPredicate() As String
    T8FixtureIdPredicate = "IDNoConformidad IN (" & _
        CStr(TEST_ID_NC_T8_1) & "," & _
        CStr(TEST_ID_NC_T8_2) & "," & _
        CStr(TEST_ID_NC_T8_3) & "," & _
        CStr(TEST_ID_NC_T8_4) & "," & _
        CStr(TEST_ID_NC_T8_5) & ")"
End Function

Private Function TableExistsInDb(ByVal p_Db As DAO.Database, ByVal p_TableName As String) As Boolean
    Dim tdf As DAO.TableDef

    On Error GoTo EH
    Set tdf = p_Db.TableDefs(p_TableName)
    TableExistsInDb = True
    Exit Function
EH:
    TableExistsInDb = False
End Function

Private Function CountCacheRowsWhere(ByVal p_Db As DAO.Database, ByVal p_WhereClause As String) As Long
    Dim rs As DAO.Recordset

    On Error GoTo emptyTable
    Set rs = p_Db.OpenRecordset("SELECT COUNT(*) AS C FROM " & NOMBRE_TABLA_LISTADO & " WHERE " & p_WhereClause, dbOpenSnapshot)
    CountCacheRowsWhere = CLng(rs!C)
    rs.Close
    Set rs = Nothing
    Exit Function
emptyTable:
    CountCacheRowsWhere = 0
End Function
