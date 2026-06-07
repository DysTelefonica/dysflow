Attribute VB_Name = "Test_NCProyectoSeguimientoTareasListadoHelper"
Option Compare Database
Option Explicit

' ============================================
' TEST SKELETON — NC PROYECTO SEGUIMIENTO TAREAS LISTADO HELPER (R2)
' ============================================
' SDD: ncproyecto-seguimiento-tareas-helper
' Work Unit: R2 — source-only / in-memory-safe test skeleton.
' Do not seed backend NC/AC/AR fixtures in this slice. The concrete RED tests
' will fill these helpers only after live schema evidence is reliable.
' ============================================

Private Const TEST_ID_BASE As Long = 900600
Private Const TEST_ID_NC As Long = TEST_ID_BASE + 1
Private Const TEST_ID_AC As Long = TEST_ID_BASE + 2
Private Const TEST_ID_AR As Long = TEST_ID_BASE + 3
Private Const TEST_ID_AR_FILTER_2 As Long = TEST_ID_BASE + 4
Private Const TEST_ID_AR_FILTER_3 As Long = TEST_ID_BASE + 5
Private Const TEST_ID_AR_ESTADO_ACTIVA_1 As Long = TEST_ID_BASE + 6
Private Const TEST_ID_AR_ESTADO_ACTIVA_2 As Long = TEST_ID_BASE + 7
Private Const TEST_ID_AR_ESTADO_PTE As Long = TEST_ID_BASE + 8
Private Const TEST_ID_AR_NO_HYDRATION_1 As Long = TEST_ID_BASE + 9
Private Const TEST_ID_AR_NO_HYDRATION_2 As Long = TEST_ID_BASE + 10
Private Const TEST_ID_AR_DETERMINISTIC_1 As Long = TEST_ID_BASE + 11
Private Const TEST_ID_AR_DETERMINISTIC_2 As Long = TEST_ID_BASE + 12
Private Const TEST_ID_AR_DETERMINISTIC_3 As Long = TEST_ID_BASE + 13
Private Const LOG_OPERATION_TAREAS_FALLBACK As String = "TareasCacheFallback"
Private Const FALLBACK_REASON_CACHE_NOT_IMPLEMENTED As String = "Cache de tareas no implementada en esta slice"
Private Const FALLBACK_REASON_CACHE_DISABLED As String = "deshabilitada"
Private Const FALLBACK_REASON_CACHE_ERROR As String = "Cache error: R11 forced cache seam failure"

Public Function Test_TareasHelper_Fallback_EmptyCache_Logs() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim result As Scripting.Dictionary
    Dim previousEntorno As Entorno
    Dim originalCacheConfig As Scripting.Dictionary
    Dim cacheStateCaptured As Boolean
    Dim sessionStarted As Boolean

    Set logs = NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_TareasHelper_Fallback_EmptyCache_Logs = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If
    sessionStarted = True

    Set db = getdb(errMsg)
    If db Is Nothing Then
        Test_TareasHelper_Fallback_EmptyCache_Logs = BuildJsonFail("TESTS BLOCKED: getdb no devolvió sandbox: " & errMsg, logs)
        GoTo Cleanup
    End If
    If Not TestHelper.AssertSandboxBackend(logs, errMsg) Then
        Test_TareasHelper_Fallback_EmptyCache_Logs = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If

    SchemaGateW4b logs
    CleanupTareasCacheFallbackRows db, logs, FALLBACK_REASON_CACHE_NOT_IMPLEMENTED
    If Not SnapshotCacheConfigR3(db, originalCacheConfig, logs, errMsg) Then
        Test_TareasHelper_Fallback_EmptyCache_Logs = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If
    cacheStateCaptured = True
    If Not SetCacheConfigEnabledR3(db, True, logs, errMsg) Then
        Test_TareasHelper_Fallback_EmptyCache_Logs = BuildJsonFail("TESTS BLOCKED: no se pudo activar cache para R3: " & errMsg, logs)
        GoTo Cleanup
    End If

    Set previousEntorno = m_ObjEntorno
    ArrangeTareasFallbackEnvironment logs
    TestHelper.AddLog logs, "Act: call NCProyectoSeguimientoTareasListadoHelper.GetARsProyectoSeguimientoTareasFiltrados behavior"

    Set result = Application.Run("GetARsProyectoSeguimientoTareasFiltrados", "", "", "", "", errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    If result Is Nothing Then
        assertError = "Expected fallback result dictionary, got Nothing"
        GoTo Fail
    End If
    If result.count <> 1 Then
        assertError = "Expected exactly one fallback task, got " & CStr(result.count)
        GoTo Fail
    End If
    If Not result.Exists(CStr(TEST_ID_AR)) Then
        assertError = "Expected fallback result keyed by deterministic IDAccionRealizada=" & CStr(TEST_ID_AR)
        GoTo Fail
    End If
    If CountTareasCacheFallbackRows(db, FALLBACK_REASON_CACHE_NOT_IMPLEMENTED) <> 1 Then
        assertError = "Expected exactly one scoped TbLogCache row for " & LOG_OPERATION_TAREAS_FALLBACK
        GoTo Fail
    End If
    If Not AssertTareasFallbackLog(db, logs, assertError, FALLBACK_REASON_CACHE_NOT_IMPLEMENTED) Then GoTo Fail

    Test_TareasHelper_Fallback_EmptyCache_Logs = BuildJsonOk(logs, "tareas-empty-cache-fallback-logged")
    GoTo Cleanup

Fail:
    Test_TareasHelper_Fallback_EmptyCache_Logs = BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    If Not logs Is Nothing Then TestHelper.AddLog logs, "RED expected until production helper exists: " & Err.Description
    Test_TareasHelper_Fallback_EmptyCache_Logs = BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If cacheStateCaptured Then Call RestoreCacheConfigR3(db, originalCacheConfig, logs)
    Set m_ObjEntorno = previousEntorno
    If Not db Is Nothing Then CleanupTareasCacheFallbackRows db, logs, FALLBACK_REASON_CACHE_NOT_IMPLEMENTED
    If sessionStarted Then TestHelper.EndTestSession logs
    Set db = Nothing
End Function

Public Function Test_TareasHelper_Fallback_CacheError_Logs() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim result As Scripting.Dictionary
    Dim previousEntorno As Entorno
    Dim originalCacheConfig As Scripting.Dictionary
    Dim cacheStateCaptured As Boolean
    Dim sessionStarted As Boolean

    Set logs = NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_TareasHelper_Fallback_CacheError_Logs = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If
    sessionStarted = True

    Set db = getdb(errMsg)
    If db Is Nothing Then
        Test_TareasHelper_Fallback_CacheError_Logs = BuildJsonFail("TESTS BLOCKED: getdb no devolvió sandbox: " & errMsg, logs)
        GoTo Cleanup
    End If
    If Not TestHelper.AssertSandboxBackend(logs, errMsg) Then
        Test_TareasHelper_Fallback_CacheError_Logs = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If

    SchemaGateW4b logs
    CleanupTareasCacheFallbackRows db, logs, FALLBACK_REASON_CACHE_ERROR
    If Not SnapshotCacheConfigR3(db, originalCacheConfig, logs, errMsg) Then
        Test_TareasHelper_Fallback_CacheError_Logs = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If
    cacheStateCaptured = True
    If Not SetCacheConfigEnabledR3(db, True, logs, errMsg, "R11 forced cache-error fallback test") Then
        Test_TareasHelper_Fallback_CacheError_Logs = BuildJsonFail("TESTS BLOCKED: no se pudo activar cache para R11: " & errMsg, logs)
        GoTo Cleanup
    End If

    Set previousEntorno = m_ObjEntorno
    ArrangeTareasFallbackEnvironment logs, "R11 forced cache error"
    m_TestTareasHelperCacheErrorText = "R11 forced cache seam failure"
    m_TestTareasHelperCacheErrorSeamEnabled = True
    TestHelper.AddLog logs, "Act: force TryListadoFiltradoSQL cache seam error through double-gated testing seam"

    Set result = Application.Run("GetARsProyectoSeguimientoTareasFiltrados", "", "", "", "", errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    If result Is Nothing Then
        assertError = "Expected cache-error fallback result dictionary, got Nothing"
        GoTo Fail
    End If
    If result.count <> 1 Then
        assertError = "Expected exactly one cache-error fallback task, got " & CStr(result.count)
        GoTo Fail
    End If
    If Not result.Exists(CStr(TEST_ID_AR)) Then
        assertError = "Expected cache-error fallback result keyed by deterministic IDAccionRealizada=" & CStr(TEST_ID_AR)
        GoTo Fail
    End If
    If CountTareasCacheFallbackRows(db, FALLBACK_REASON_CACHE_ERROR) <> 1 Then
        assertError = "Expected exactly one scoped TbLogCache row for forced cache-error fallback"
        GoTo Fail
    End If
    If Not AssertTareasFallbackLog(db, logs, assertError, FALLBACK_REASON_CACHE_ERROR) Then GoTo Fail

    Test_TareasHelper_Fallback_CacheError_Logs = BuildJsonOk(logs, "tareas-cache-error-fallback-logged")
    GoTo Cleanup

Fail:
    Test_TareasHelper_Fallback_CacheError_Logs = BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    If Not logs Is Nothing Then TestHelper.AddLog logs, "Cache-error fallback runtime test failed: " & Err.Description
    Test_TareasHelper_Fallback_CacheError_Logs = BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    m_TestTareasHelperCacheErrorSeamEnabled = False
    m_TestTareasHelperCacheErrorText = ""
    If cacheStateCaptured Then Call RestoreCacheConfigR3(db, originalCacheConfig, logs)
    Set m_ObjEntorno = previousEntorno
    If Not db Is Nothing Then CleanupTareasCacheFallbackRows db, logs, FALLBACK_REASON_CACHE_ERROR
    If sessionStarted Then TestHelper.EndTestSession logs
    Set db = Nothing
End Function

Public Function Test_TareasHelper_Fallback_DisabledCache_Logs() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim result As Scripting.Dictionary
    Dim previousEntorno As Entorno
    Dim originalCacheConfig As Scripting.Dictionary
    Dim cacheStateCaptured As Boolean
    Dim sessionStarted As Boolean

    Set logs = NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_TareasHelper_Fallback_DisabledCache_Logs = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If
    sessionStarted = True

    Set db = getdb(errMsg)
    If db Is Nothing Then
        Test_TareasHelper_Fallback_DisabledCache_Logs = BuildJsonFail("TESTS BLOCKED: getdb no devolvió sandbox: " & errMsg, logs)
        GoTo Cleanup
    End If
    If Not TestHelper.AssertSandboxBackend(logs, errMsg) Then
        Test_TareasHelper_Fallback_DisabledCache_Logs = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If

    SchemaGateW4b logs
    CleanupTareasCacheFallbackRows db, logs, FALLBACK_REASON_CACHE_DISABLED
    If Not SnapshotCacheConfigR3(db, originalCacheConfig, logs, errMsg) Then
        Test_TareasHelper_Fallback_DisabledCache_Logs = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If
    cacheStateCaptured = True
    If Not SetCacheConfigEnabledR3(db, False, logs, errMsg, "R4 disabled cache fallback test") Then
        Test_TareasHelper_Fallback_DisabledCache_Logs = BuildJsonFail("TESTS BLOCKED: no se pudo desactivar cache para R4: " & errMsg, logs)
        GoTo Cleanup
    End If

    Set previousEntorno = m_ObjEntorno
    ArrangeTareasFallbackEnvironment logs, "R4 disabled cache"
    TestHelper.AddLog logs, "Act: call NCProyectoSeguimientoTareasListadoHelper.GetARsProyectoSeguimientoTareasFiltrados behavior with CacheHabilitada=False"

    Set result = Application.Run("GetARsProyectoSeguimientoTareasFiltrados", "", "", "", "", errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    If result Is Nothing Then
        assertError = "Expected disabled-cache fallback result dictionary, got Nothing"
        GoTo Fail
    End If
    If result.count <> 1 Then
        assertError = "Expected exactly one disabled-cache fallback task, got " & CStr(result.count)
        GoTo Fail
    End If
    If Not result.Exists(CStr(TEST_ID_AR)) Then
        assertError = "Expected disabled-cache fallback result keyed by deterministic IDAccionRealizada=" & CStr(TEST_ID_AR)
        GoTo Fail
    End If
    If CountTareasCacheFallbackRows(db, FALLBACK_REASON_CACHE_DISABLED) <> 1 Then
        assertError = "Expected exactly one scoped TbLogCache row for disabled cache fallback"
        GoTo Fail
    End If
    If Not AssertTareasFallbackLog(db, logs, assertError, FALLBACK_REASON_CACHE_DISABLED) Then GoTo Fail

    Test_TareasHelper_Fallback_DisabledCache_Logs = BuildJsonOk(logs, "tareas-disabled-cache-fallback-logged")
    GoTo Cleanup

Fail:
    Test_TareasHelper_Fallback_DisabledCache_Logs = BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    If Not logs Is Nothing Then TestHelper.AddLog logs, "RED expected until production helper exists: " & Err.Description
    Test_TareasHelper_Fallback_DisabledCache_Logs = BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If cacheStateCaptured Then Call RestoreCacheConfigR3(db, originalCacheConfig, logs)
    Set m_ObjEntorno = previousEntorno
    If Not db Is Nothing Then CleanupTareasCacheFallbackRows db, logs, FALLBACK_REASON_CACHE_DISABLED
    If sessionStarted Then TestHelper.EndTestSession logs
    Set db = Nothing
End Function

Public Function Test_TareasHelper_Fallback_NoUser_SafeLog() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim result As Scripting.Dictionary
    Dim previousEntorno As Entorno
    Dim previousUsuario As usuario
    Dim originalCacheConfig As Scripting.Dictionary
    Dim cacheStateCaptured As Boolean
    Dim sessionStarted As Boolean
    Dim usuarioCaptured As Boolean

    Set logs = NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_TareasHelper_Fallback_NoUser_SafeLog = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If
    sessionStarted = True

    Set db = getdb(errMsg)
    If db Is Nothing Then
        Test_TareasHelper_Fallback_NoUser_SafeLog = BuildJsonFail("TESTS BLOCKED: getdb no devolvió sandbox: " & errMsg, logs)
        GoTo Cleanup
    End If
    If Not TestHelper.AssertSandboxBackend(logs, errMsg) Then
        Test_TareasHelper_Fallback_NoUser_SafeLog = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If

    SchemaGateW4b logs
    CleanupTareasCacheFallbackRows db, logs, FALLBACK_REASON_CACHE_NOT_IMPLEMENTED, "Sistema"
    If Not SnapshotCacheConfigR3(db, originalCacheConfig, logs, errMsg) Then
        Test_TareasHelper_Fallback_NoUser_SafeLog = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If
    cacheStateCaptured = True
    If Not SetCacheConfigEnabledR3(db, True, logs, errMsg, "R5 no-user safe log fallback test") Then
        Test_TareasHelper_Fallback_NoUser_SafeLog = BuildJsonFail("TESTS BLOCKED: no se pudo activar cache para R5: " & errMsg, logs)
        GoTo Cleanup
    End If

    Set previousEntorno = m_ObjEntorno
    Set previousUsuario = m_ObjUsuarioConectado
    usuarioCaptured = True
    Set m_ObjUsuarioConectado = Nothing
    ArrangeTareasFallbackEnvironment logs, "R5 no-user safe log"
    TestHelper.AddLog logs, "Act: call NCProyectoSeguimientoTareasListadoHelper.GetARsProyectoSeguimientoTareasFiltrados behavior with m_ObjUsuarioConectado=Nothing"

    Set result = Application.Run("GetARsProyectoSeguimientoTareasFiltrados", "", "", "", "", errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    If result Is Nothing Then
        assertError = "Expected no-user fallback result dictionary, got Nothing"
        GoTo Fail
    End If
    If result.count <> 1 Then
        assertError = "Expected exactly one no-user fallback task, got " & CStr(result.count)
        GoTo Fail
    End If
    If Not result.Exists(CStr(TEST_ID_AR)) Then
        assertError = "Expected no-user fallback result keyed by deterministic IDAccionRealizada=" & CStr(TEST_ID_AR)
        GoTo Fail
    End If
    If CountTareasCacheFallbackRows(db, FALLBACK_REASON_CACHE_NOT_IMPLEMENTED, "Sistema") <> 1 Then
        assertError = "Expected exactly one scoped TbLogCache row for no-user fallback with Usuario=Sistema"
        GoTo Fail
    End If
    If Not AssertTareasFallbackLog(db, logs, assertError, FALLBACK_REASON_CACHE_NOT_IMPLEMENTED, "Sistema") Then GoTo Fail

    Test_TareasHelper_Fallback_NoUser_SafeLog = BuildJsonOk(logs, "tareas-no-user-fallback-logged-as-sistema")
    GoTo Cleanup

Fail:
    Test_TareasHelper_Fallback_NoUser_SafeLog = BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    If Not logs Is Nothing Then TestHelper.AddLog logs, "RED expected until production helper exists: " & Err.Description
    Test_TareasHelper_Fallback_NoUser_SafeLog = BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If usuarioCaptured Then Set m_ObjUsuarioConectado = previousUsuario
    If cacheStateCaptured Then Call RestoreCacheConfigR3(db, originalCacheConfig, logs)
    Set m_ObjEntorno = previousEntorno
    If Not db Is Nothing Then CleanupTareasCacheFallbackRows db, logs, FALLBACK_REASON_CACHE_NOT_IMPLEMENTED, "Sistema"
    If sessionStarted Then TestHelper.EndTestSession logs
    Set db = Nothing
End Function

Public Function Test_TareasHelper_FilterParity_AllPredicates_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim errMsg As String
    Dim assertError As String
    Dim previousEntorno As Entorno
    Dim sessionStarted As Boolean

    Set logs = NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_TareasHelper_FilterParity_AllPredicates_Atomic = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If
    sessionStarted = True

    If Not TestHelper.AssertSandboxBackend(logs, errMsg) Then
        Test_TareasHelper_FilterParity_AllPredicates_Atomic = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If

    SchemaGateW4b logs
    Set previousEntorno = m_ObjEntorno
    ArrangeTareasFilterParityEnvironment logs

    If Not AssertTareasFilterParityScenario( _
            p_Label:="responsable_calidad", _
            p_ResponsableCalidad:="R6_QA_A", _
            p_Responsable:="", _
            p_IDExpediente:="", _
            p_ExpectedKeys:=Array(CStr(TEST_ID_AR), CStr(TEST_ID_AR_FILTER_2)), _
            p_Logs:=logs, _
            p_Error:=assertError) Then GoTo Fail

    If Not AssertTareasFilterParityScenario( _
            p_Label:="responsable", _
            p_ResponsableCalidad:="", _
            p_Responsable:="R6_TECH_A", _
            p_IDExpediente:="", _
            p_ExpectedKeys:=Array(CStr(TEST_ID_AR), CStr(TEST_ID_AR_FILTER_3)), _
            p_Logs:=logs, _
            p_Error:=assertError) Then GoTo Fail

    If Not AssertTareasFilterParityScenario( _
            p_Label:="IDExpediente", _
            p_ResponsableCalidad:="", _
            p_Responsable:="", _
            p_IDExpediente:="R6_EXP_A", _
            p_ExpectedKeys:=Array(CStr(TEST_ID_AR), CStr(TEST_ID_AR_FILTER_3)), _
            p_Logs:=logs, _
            p_Error:=assertError) Then GoTo Fail

    If Not AssertTareasFilterParityScenario( _
            p_Label:="all predicates", _
            p_ResponsableCalidad:="R6_QA_A", _
            p_Responsable:="R6_TECH_A", _
            p_IDExpediente:="R6_EXP_A", _
            p_ExpectedKeys:=Array(CStr(TEST_ID_AR)), _
            p_Logs:=logs, _
            p_Error:=assertError) Then GoTo Fail

    Test_TareasHelper_FilterParity_AllPredicates_Atomic = BuildJsonOk(logs, "tareas-filter-parity-all-predicates")
    GoTo Cleanup

Fail:
    Test_TareasHelper_FilterParity_AllPredicates_Atomic = BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    If Not logs Is Nothing Then TestHelper.AddLog logs, "RED expected until production helper exists: " & Err.Description
    Test_TareasHelper_FilterParity_AllPredicates_Atomic = BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set m_ObjEntorno = previousEntorno
    If sessionStarted Then TestHelper.EndTestSession logs
End Function

Public Function Test_TareasHelper_Estado_SelectsSource() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim errMsg As String
    Dim assertError As String
    Dim previousEntorno As Entorno
    Dim sessionStarted As Boolean

    Set logs = NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_TareasHelper_Estado_SelectsSource = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If
    sessionStarted = True

    If Not TestHelper.AssertSandboxBackend(logs, errMsg) Then
        Test_TareasHelper_Estado_SelectsSource = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If

    SchemaGateW4b logs
    Set previousEntorno = m_ObjEntorno
    ArrangeTareasEstadoEnvironment logs

    If Not AssertTareasEstadoScenario( _
            p_Label:="Activas", _
            p_Estado:="ACTIVA", _
            p_ExpectedKeys:=Array(CStr(TEST_ID_AR_ESTADO_ACTIVA_1), CStr(TEST_ID_AR_ESTADO_ACTIVA_2)), _
            p_Logs:=logs, _
            p_Error:=assertError) Then GoTo Fail

    If Not AssertTareasEstadoScenario( _
            p_Label:="PteReplanificar", _
            p_Estado:="PENDIENTE DE REPLANIFICAR", _
            p_ExpectedKeys:=Array(CStr(TEST_ID_AR_ESTADO_PTE)), _
            p_Logs:=logs, _
            p_Error:=assertError) Then GoTo Fail

    If Not AssertTareasEstadoScenario( _
            p_Label:="default full", _
            p_Estado:="", _
            p_ExpectedKeys:=Array(CStr(TEST_ID_AR_ESTADO_ACTIVA_1), CStr(TEST_ID_AR_ESTADO_ACTIVA_2), CStr(TEST_ID_AR_ESTADO_PTE)), _
            p_Logs:=logs, _
            p_Error:=assertError) Then GoTo Fail

    Test_TareasHelper_Estado_SelectsSource = BuildJsonOk(logs, "tareas-estado-selects-source")
    GoTo Cleanup

Fail:
    Test_TareasHelper_Estado_SelectsSource = BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    If Not logs Is Nothing Then TestHelper.AddLog logs, "RED expected until production helper exists: " & Err.Description
    Test_TareasHelper_Estado_SelectsSource = BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set m_ObjEntorno = previousEntorno
    If sessionStarted Then TestHelper.EndTestSession logs
End Function

Public Function Test_TareasHelper_NoARPerRowHydration() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim errMsg As String
    Dim assertError As String
    Dim previousEntorno As Entorno
    Dim sessionStarted As Boolean
    Dim result As Scripting.Dictionary

    Set logs = NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_TareasHelper_NoARPerRowHydration = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If
    sessionStarted = True

    If Not TestHelper.AssertSandboxBackend(logs, errMsg) Then
        Test_TareasHelper_NoARPerRowHydration = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If

    SchemaGateW4b logs
    Set previousEntorno = m_ObjEntorno
    ArrangeTareasNoHydrationEnvironment logs
    ResetSegTareasHydrationCounters
    m_TestSegTareasProyectoHydrationCountersEnabled = True
    TestHelper.AddLog logs, "Act: call helper with hydration counters enabled on SegTareasProyecto.AR/AC/NC getters"

    Set result = Application.Run("GetARsProyectoSeguimientoTareasFiltrados", "", "", "", "", errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    If Not AssertDictionaryKeysInOrder(result, Array(CStr(TEST_ID_AR_NO_HYDRATION_1), CStr(TEST_ID_AR_NO_HYDRATION_2)), "no-hydration helper result", assertError) Then GoTo Fail
    If Not AssertSegTareasHydrationCountersZero(assertError) Then GoTo Fail

    TestHelper.AddLog logs, "Assert: helper did not touch SegTareasProyecto.AR/AC/NC getters per row"
    Test_TareasHelper_NoARPerRowHydration = BuildJsonOk(logs, "tareas-no-ar-per-row-hydration")
    GoTo Cleanup

Fail:
    Test_TareasHelper_NoARPerRowHydration = BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    If Not logs Is Nothing Then TestHelper.AddLog logs, "RED expected until production helper exists: " & Err.Description
    Test_TareasHelper_NoARPerRowHydration = BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    m_TestSegTareasProyectoHydrationCountersEnabled = False
    ResetSegTareasHydrationCounters
    Set m_ObjEntorno = previousEntorno
    If sessionStarted Then TestHelper.EndTestSession logs
End Function

Public Function Test_TareasHelper_DeterministicOrder_ExportInput() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim errMsg As String
    Dim assertError As String
    Dim previousEntorno As Entorno
    Dim previousExportInput As Scripting.Dictionary
    Dim sessionStarted As Boolean
    Dim firstResult As Scripting.Dictionary
    Dim secondResult As Scripting.Dictionary

    Set logs = NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_TareasHelper_DeterministicOrder_ExportInput = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If
    sessionStarted = True

    If Not TestHelper.AssertSandboxBackend(logs, errMsg) Then
        Test_TareasHelper_DeterministicOrder_ExportInput = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If

    SchemaGateW4b logs
    Set previousEntorno = m_ObjEntorno
    Set previousExportInput = m_ColFiltradoTareasNCProyectos
    ArrangeTareasDeterministicOrderEnvironment logs
    TestHelper.AddLog logs, "Act: call helper twice with identical in-memory input and filters for export determinism"

    Set firstResult = Application.Run("GetARsProyectoSeguimientoTareasFiltrados", "", "", "ACTIVA", "", errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg
    Set secondResult = Application.Run("GetARsProyectoSeguimientoTareasFiltrados", "", "", "ACTIVA", "", errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    If Not AssertDictionaryKeysInOrder( _
            firstResult, _
            Array(CStr(TEST_ID_AR_DETERMINISTIC_1), CStr(TEST_ID_AR_DETERMINISTIC_2), CStr(TEST_ID_AR_DETERMINISTIC_3)), _
            "deterministic first helper result", _
            assertError) Then GoTo Fail
    If Not AssertDictionariesSameKeysAndOrder(firstResult, secondResult, "deterministic repeated helper result", assertError) Then GoTo Fail

    Set m_ColFiltradoTareasNCProyectos = firstResult
    If Not AssertExportInputHoldsSameDictionary(firstResult, assertError) Then GoTo Fail

    TestHelper.AddLog logs, "Assert: repeated helper calls enumerate keys in the same order and export input holds helper dictionary by reference"
    Test_TareasHelper_DeterministicOrder_ExportInput = BuildJsonOk(logs, "tareas-deterministic-order-export-input")
    GoTo Cleanup

Fail:
    Test_TareasHelper_DeterministicOrder_ExportInput = BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    If Not logs Is Nothing Then TestHelper.AddLog logs, "RED expected until production helper exists: " & Err.Description
    Test_TareasHelper_DeterministicOrder_ExportInput = BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set m_ColFiltradoTareasNCProyectos = previousExportInput
    Set m_ObjEntorno = previousEntorno
    If sessionStarted Then TestHelper.EndTestSession logs
End Function

Public Function Test_TareasForm_Delegates_FilterPaths() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim previousEntorno As Entorno
    Dim previousExportInput As Scripting.Dictionary
    Dim originalCacheConfig As Scripting.Dictionary
    Dim cacheStateCaptured As Boolean
    Dim sessionStarted As Boolean
    Dim result As Scripting.Dictionary

    Set logs = NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_TareasForm_Delegates_FilterPaths = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If
    sessionStarted = True

    Set db = getdb(errMsg)
    If db Is Nothing Then
        Test_TareasForm_Delegates_FilterPaths = BuildJsonFail("TESTS BLOCKED: getdb no devolvió sandbox: " & errMsg, logs)
        GoTo Cleanup
    End If
    If Not TestHelper.AssertSandboxBackend(logs, errMsg) Then
        Test_TareasForm_Delegates_FilterPaths = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If

    SchemaGateW4b logs
    CleanupTareasCacheFallbackRows db, logs, FALLBACK_REASON_CACHE_DISABLED
    If Not SnapshotCacheConfigR3(db, originalCacheConfig, logs, errMsg) Then
        Test_TareasForm_Delegates_FilterPaths = BuildJsonFail("TESTS BLOCKED: " & errMsg, logs)
        GoTo Cleanup
    End If
    cacheStateCaptured = True
    If Not SetCacheConfigEnabledR3(db, False, logs, errMsg, "R12 form delegation path test") Then
        Test_TareasForm_Delegates_FilterPaths = BuildJsonFail("TESTS BLOCKED: no se pudo desactivar cache para R12: " & errMsg, logs)
        GoTo Cleanup
    End If

    Set previousEntorno = m_ObjEntorno
    Set previousExportInput = m_ColFiltradoTareasNCProyectos
    ArrangeTareasDeterministicOrderEnvironment logs
    ResetTareasHelperDelegationCapture
    m_TestSeguimientoTareasHelperDelegationSeamEnabled = True
    m_TestFormSeguimientoTareasDelegationHookEnabled = True

    Set result = NCProyectoSeguimientoTareasListadoHelper.TestHook_SeguimientoTareasFormDelegationPath("Filtrar", "", "", "ACTIVA", "", errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg
    If Not AssertDictionaryKeysInOrder(result, Array(CStr(TEST_ID_AR_DETERMINISTIC_1), CStr(TEST_ID_AR_DETERMINISTIC_2), CStr(TEST_ID_AR_DETERMINISTIC_3)), "form Filtrar helper result", assertError) Then GoTo Fail
    If Not AssertHelperDelegationCapture(1, "", "", "ACTIVA", "", "Filtrar", assertError) Then GoTo Fail
    If Not AssertExportInputHoldsSameDictionary(result, assertError) Then GoTo Fail

    Set result = NCProyectoSeguimientoTareasListadoHelper.TestHook_SeguimientoTareasFormDelegationPath("Form_Load", "", "", "ACTIVA", "", errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg
    If Not AssertHelperDelegationCapture(2, "", "", "ACTIVA", "", "Form_Load", assertError) Then GoTo Fail

    Set result = NCProyectoSeguimientoTareasListadoHelper.TestHook_SeguimientoTareasFormDelegationPath("ComandoLimpiarEstado", "", "", "", "", errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg
    If Not AssertHelperDelegationCapture(3, "", "", "", "", "ComandoLimpiarEstado", assertError) Then GoTo Fail

    Set result = NCProyectoSeguimientoTareasListadoHelper.TestHook_SeguimientoTareasFormDelegationPath("ComandoLimpiarIDExpediente", "", "", "ACTIVA", "", errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg
    If Not AssertHelperDelegationCapture(4, "", "", "ACTIVA", "", "ComandoLimpiarIDExpediente", assertError) Then GoTo Fail

    Set result = NCProyectoSeguimientoTareasListadoHelper.TestHook_SeguimientoTareasFormDelegationPath("ComandoLimpiarResposable", "", "", "ACTIVA", "", errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg
    If Not AssertHelperDelegationCapture(5, "", "", "ACTIVA", "", "ComandoLimpiarResposable", assertError) Then GoTo Fail

    Set result = NCProyectoSeguimientoTareasListadoHelper.TestHook_SeguimientoTareasFormDelegationPath("ComandoLimpiarResposableCalidad", "", "", "ACTIVA", "", errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg
    If Not AssertHelperDelegationCapture(6, "", "", "ACTIVA", "", "ComandoLimpiarResposableCalidad", assertError) Then GoTo Fail

    TestHelper.AddLog logs, "Assert: safe module-level form delegation hook exercised Filtrar, Form_Load, and limpar command delegation paths through the helper"
    Test_TareasForm_Delegates_FilterPaths = BuildJsonOk(logs, "tareas-form-delegates-filter-paths")
    GoTo Cleanup

Fail:
    Test_TareasForm_Delegates_FilterPaths = BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    If Not logs Is Nothing Then TestHelper.AddLog logs, "Form delegation runtime test failed: " & Err.Description
    Test_TareasForm_Delegates_FilterPaths = BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    m_TestFormSeguimientoTareasDelegationHookEnabled = False
    m_TestSeguimientoTareasHelperDelegationSeamEnabled = False
    ResetTareasHelperDelegationCapture
    If cacheStateCaptured Then Call RestoreCacheConfigR3(db, originalCacheConfig, logs)
    Set m_ColFiltradoTareasNCProyectos = previousExportInput
    Set m_ObjEntorno = previousEntorno
    If Not db Is Nothing Then CleanupTareasCacheFallbackRows db, logs, FALLBACK_REASON_CACHE_DISABLED
    If sessionStarted Then TestHelper.EndTestSession logs
    Set db = Nothing
End Function

Private Function NewLogs() As Collection
    Set NewLogs = TestHelper.NewLogs()
End Function

Private Function BeginTestSession(ByRef p_Logs As Collection, Optional ByRef p_Error As String = "") As Boolean
    BeginTestSession = TestHelper.BeginTestSession(p_Logs, p_Error)
End Function

Private Sub EndTestSession(ByRef p_Logs As Collection)
    TestHelper.EndTestSession p_Logs
End Sub

Private Function BuildJsonOk(ByRef p_Logs As Collection, Optional ByVal p_Value As Variant) As String
    If IsMissing(p_Value) Then
        BuildJsonOk = TestHelper.BuildJsonOk(p_Logs)
    Else
        BuildJsonOk = TestHelper.BuildJsonOk(p_Logs, p_Value)
    End If
End Function

Private Function BuildJsonFail(ByVal p_Error As String, ByRef p_Logs As Collection) As String
    BuildJsonFail = TestHelper.BuildJsonFail(p_Error, p_Logs)
End Function

Private Sub EnsureNCFixture(ByVal p_Db As DAO.Database, ByVal p_IDNoConformidad As Long, Optional ByVal p_Marker As String = "")
    Err.Raise 1000, "Test_NCProyectoSeguimientoTareasListadoHelper.EnsureNCFixture", _
              "Not implemented in R2: backend NC fixture inserts require fresh live schema evidence"
End Sub

Private Sub EnsureACFixture(ByVal p_Db As DAO.Database, ByVal p_IDAccionCorrectiva As Long, ByVal p_IDNoConformidad As Long, Optional ByVal p_Marker As String = "")
    Err.Raise 1000, "Test_NCProyectoSeguimientoTareasListadoHelper.EnsureACFixture", _
              "Not implemented in R2: backend AC fixture inserts require fresh live schema evidence"
End Sub

Private Sub EnsureARFixture(ByVal p_Db As DAO.Database, ByVal p_IDAccionRealizada As Long, ByVal p_IDAccionCorrectiva As Long, Optional ByVal p_Marker As String = "")
    Err.Raise 1000, "Test_NCProyectoSeguimientoTareasListadoHelper.EnsureARFixture", _
              "Not implemented in R2: backend AR fixture inserts require fresh live schema evidence"
End Sub

Private Sub CleanupW4bFixtures(Optional ByVal p_Db As Variant)
    ' R2 is source-only: do not DELETE backend rows until RED tests own explicit fixtures.
End Sub

Private Sub SetCacheHabilitada(ByVal p_Db As DAO.Database, ByVal p_Enabled As Boolean)
    Err.Raise 1000, "Test_NCProyectoSeguimientoTareasListadoHelper.SetCacheHabilitada", _
              "Not implemented in R2: cache flag writes are deferred to data-touching RED tests"
End Sub

Private Function ReadCacheHabilitada(ByVal p_Db As DAO.Database) As Boolean
    Err.Raise 1000, "Test_NCProyectoSeguimientoTareasListadoHelper.ReadCacheHabilitada", _
              "Not implemented in R2: cache flag reads are deferred to data-touching RED tests"
End Function

Private Function SafeLogCacheRowCount(ByVal p_Db As DAO.Database) As Long
    SafeLogCacheRowCount = CountTareasCacheFallbackRows(p_Db)
End Function

Private Function TestUser(ByVal p_Nombre As String) As usuario
    Dim usr As New usuario

    usr.Nombre = p_Nombre
    usr.UsuarioRed = "TEST_W4B_HELPER"
    Set TestUser = usr
End Function

Private Sub SchemaGateW4b(ByVal p_Logs As Collection)
    TestHelper.AddLog p_Logs, "Schema gate documented: TbNoConformidades IDNoConformidad/CodigoNoConformidad/EXPEDIENTE; TbNCAccionCorrectivas IDAccionCorrectiva/IDNoConformidad; TbNCAccionesRealizadas IDAccionRealizada/IdAccionCorrectiva; TbLogCache IDNoConformidad/TipoOperacion; TbConfiguracion ID/CacheHabilitada/FechaCambioCache/UsuarioCambioCache/MotivoCambioCache. Teardown: AR then AC then NC then log rows; restore config fields for ID=1."
End Sub

Private Function SnapshotCacheConfigR3(ByVal p_Db As DAO.Database, ByRef p_Snapshot As Scripting.Dictionary, ByVal p_Logs As Collection, ByRef p_Error As String) As Boolean
    On Error GoTo EH

    Dim rs As DAO.Recordset

    Set rs = p_Db.OpenRecordset( _
        "SELECT CacheHabilitada, FechaCambioCache, UsuarioCambioCache, MotivoCambioCache FROM TbConfiguracion WHERE ID=1", _
        dbOpenSnapshot)
    If rs.EOF Then
        p_Error = "TbConfiguracion.ID=1 not found; R3 cannot safely toggle cache without hidden schema readiness side effects"
        GoTo Cleanup
    End If

    Set p_Snapshot = New Scripting.Dictionary
    p_Snapshot.CompareMode = TextCompare
    p_Snapshot.Add "CacheHabilitada", rs.Fields("CacheHabilitada").value
    p_Snapshot.Add "FechaCambioCache", rs.Fields("FechaCambioCache").value
    p_Snapshot.Add "UsuarioCambioCache", rs.Fields("UsuarioCambioCache").value
    p_Snapshot.Add "MotivoCambioCache", rs.Fields("MotivoCambioCache").value

    TestHelper.AddLog p_Logs, "Arrange: snapshotted TbConfiguracion.ID=1 cache fields without calling cache readiness helpers"
    SnapshotCacheConfigR3 = True

Cleanup:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Exit Function

EH:
    p_Error = "SnapshotCacheConfigR3 failed: " & Err.Number & " - " & Err.Description
    Resume Cleanup
End Function

Private Function SetCacheConfigEnabledR3(ByVal p_Db As DAO.Database, ByVal p_Enabled As Boolean, ByVal p_Logs As Collection, ByRef p_Error As String, Optional ByVal p_Motivo As String = "R3 empty cache fallback test") As Boolean
    On Error GoTo EH

    Dim rs As DAO.Recordset

    Set rs = p_Db.OpenRecordset("SELECT * FROM TbConfiguracion WHERE ID=1", dbOpenDynaset)
    If rs.EOF Then
        p_Error = "TbConfiguracion.ID=1 not found; R3 cannot safely set cache state"
        GoTo Cleanup
    End If

    rs.Edit
    rs.Fields("CacheHabilitada").value = p_Enabled
    rs.Fields("FechaCambioCache").value = Now()
    rs.Fields("UsuarioCambioCache").value = "TEST_R3_TAREAS_HELPER"
    rs.Fields("MotivoCambioCache").value = p_Motivo
    rs.Update

    TestHelper.AddLog p_Logs, "Arrange: set TbConfiguracion.ID=1 cache fields via DAO only; no IsCacheEnabled/CacheConfig_SetEnabled call; CacheHabilitada=" & CStr(p_Enabled)
    SetCacheConfigEnabledR3 = True

Cleanup:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Exit Function

EH:
    p_Error = "SetCacheConfigEnabledR3 failed: " & Err.Number & " - " & Err.Description
    Resume Cleanup
End Function

Private Sub RestoreCacheConfigR3(ByVal p_Db As DAO.Database, ByVal p_Snapshot As Scripting.Dictionary, ByVal p_Logs As Collection)
    On Error GoTo Cleanup

    Dim rs As DAO.Recordset

    If p_Db Is Nothing Then GoTo Cleanup
    If p_Snapshot Is Nothing Then GoTo Cleanup

    Set rs = p_Db.OpenRecordset("SELECT * FROM TbConfiguracion WHERE ID=1", dbOpenDynaset)
    If rs.EOF Then GoTo Cleanup

    rs.Edit
    rs.Fields("CacheHabilitada").value = p_Snapshot("CacheHabilitada")
    rs.Fields("FechaCambioCache").value = p_Snapshot("FechaCambioCache")
    rs.Fields("UsuarioCambioCache").value = p_Snapshot("UsuarioCambioCache")
    rs.Fields("MotivoCambioCache").value = p_Snapshot("MotivoCambioCache")
    rs.Update
    TestHelper.AddLog p_Logs, "Cleanup: restored TbConfiguracion.ID=1 cache fields including Null values"

Cleanup:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
End Sub

Private Sub ArrangeTareasFallbackEnvironment(ByVal p_Logs As Collection, Optional ByVal p_Label As String = "R3 empty cache")
    Dim fullCol As Scripting.Dictionary
    Dim activasCol As Scripting.Dictionary
    Dim pteCol As Scripting.Dictionary
    Dim item As SegTareasProyecto

    Set fullCol = New Scripting.Dictionary
    fullCol.CompareMode = TextCompare
    Set activasCol = New Scripting.Dictionary
    activasCol.CompareMode = TextCompare
    Set pteCol = New Scripting.Dictionary
    pteCol.CompareMode = TextCompare

    Set item = New SegTareasProyecto
    item.IDAccionRealizada = CStr(TEST_ID_AR)
    item.IdAccionCorrectiva = CStr(TEST_ID_AC)
    item.IDNoConformidad = CStr(TEST_ID_NC)
    item.Tarea = p_Label & " fallback task"
    item.Tecnico = "R3_TECH"
    item.Estado = "ACTIVA"
    item.FechaInicio = CStr(Date)
    item.FechaFinPrevista = CStr(Date)
    item.TipoNC = "Proyecto"
    item.RespCalidad = "R3_QA"
    item.IDExpediente = "R3_EXP"
    item.NAccion = "1"

    fullCol.Add CStr(TEST_ID_AR), item
    activasCol.Add CStr(TEST_ID_AR), item

    Set m_ObjEntorno = New Entorno
    Set m_ObjEntorno.ColSegsTareasProyecto = fullCol
    Set m_ObjEntorno.ColSegsTareasProyectoActivas = activasCol
    Set m_ObjEntorno.ColSegsTareasProyectoPteReplanificar = pteCol
    TestHelper.AddLog p_Logs, "Arrange: seeded in-memory SegTareasProyecto dictionaries for " & p_Label & "; backend writes are scoped to TbLogCache cleanup/assertions and restore-safe TbConfiguracion.ID=1 cache fields"
End Sub

Private Sub ArrangeTareasFilterParityEnvironment(ByVal p_Logs As Collection)
    Dim fullCol As Scripting.Dictionary
    Dim activasCol As Scripting.Dictionary
    Dim pteCol As Scripting.Dictionary

    Set fullCol = New Scripting.Dictionary
    fullCol.CompareMode = TextCompare
    Set activasCol = New Scripting.Dictionary
    activasCol.CompareMode = TextCompare
    Set pteCol = New Scripting.Dictionary
    pteCol.CompareMode = TextCompare

    AddTareasParityItem fullCol, TEST_ID_AR, "R6_QA_A", "R6_TECH_A", "R6_EXP_A", "R6 parity first AR"
    AddTareasParityItem fullCol, TEST_ID_AR_FILTER_2, "R6_QA_A", "R6_TECH_B", "R6_EXP_B", "R6 parity second AR"
    AddTareasParityItem fullCol, TEST_ID_AR_FILTER_3, "R6_QA_B", "R6_TECH_A", "R6_EXP_A", "R6 parity third AR"

    Set m_ObjEntorno = New Entorno
    Set m_ObjEntorno.ColSegsTareasProyecto = fullCol
    Set m_ObjEntorno.ColSegsTareasProyectoActivas = activasCol
    Set m_ObjEntorno.ColSegsTareasProyectoPteReplanificar = pteCol
    TestHelper.AddLog p_Logs, "Arrange: seeded one in-memory NC/AC identity and three AR task rows; no backend NC/AC/AR INSERTs were used"
End Sub

Private Sub ArrangeTareasEstadoEnvironment(ByVal p_Logs As Collection)
    Dim fullCol As Scripting.Dictionary
    Dim activasCol As Scripting.Dictionary
    Dim pteCol As Scripting.Dictionary

    Set fullCol = New Scripting.Dictionary
    fullCol.CompareMode = TextCompare
    Set activasCol = New Scripting.Dictionary
    activasCol.CompareMode = TextCompare
    Set pteCol = New Scripting.Dictionary
    pteCol.CompareMode = TextCompare

    AddTareasEstadoItem fullCol, TEST_ID_AR_ESTADO_ACTIVA_1, "ACTIVA", "R7_QA_A", "R7_TECH_A", "R7_EXP_A", "R7 active first AR"
    AddTareasEstadoItem fullCol, TEST_ID_AR_ESTADO_ACTIVA_2, "ACTIVA", "R7_QA_B", "R7_TECH_B", "R7_EXP_B", "R7 active second AR"
    AddTareasEstadoItem fullCol, TEST_ID_AR_ESTADO_PTE, "PENDIENTE DE REPLANIFICAR", "R7_QA_C", "R7_TECH_C", "R7_EXP_C", "R7 pte replanificar AR"

    activasCol.Add CStr(TEST_ID_AR_ESTADO_ACTIVA_1), fullCol(CStr(TEST_ID_AR_ESTADO_ACTIVA_1))
    activasCol.Add CStr(TEST_ID_AR_ESTADO_ACTIVA_2), fullCol(CStr(TEST_ID_AR_ESTADO_ACTIVA_2))
    pteCol.Add CStr(TEST_ID_AR_ESTADO_PTE), fullCol(CStr(TEST_ID_AR_ESTADO_PTE))

    Set m_ObjEntorno = New Entorno
    Set m_ObjEntorno.ColSegsTareasProyecto = fullCol
    Set m_ObjEntorno.ColSegsTareasProyectoActivas = activasCol
    Set m_ObjEntorno.ColSegsTareasProyectoPteReplanificar = pteCol
    TestHelper.AddLog p_Logs, "Arrange: seeded separate in-memory full/Activas/PteReplanificar SegTareasProyecto collections; no backend NC/AC/AR INSERTs were used"
End Sub

Private Sub ArrangeTareasNoHydrationEnvironment(ByVal p_Logs As Collection)
    Dim fullCol As Scripting.Dictionary
    Dim activasCol As Scripting.Dictionary
    Dim pteCol As Scripting.Dictionary

    Set fullCol = New Scripting.Dictionary
    fullCol.CompareMode = TextCompare
    Set activasCol = New Scripting.Dictionary
    activasCol.CompareMode = TextCompare
    Set pteCol = New Scripting.Dictionary
    pteCol.CompareMode = TextCompare

    AddTareasEstadoItem fullCol, TEST_ID_AR_NO_HYDRATION_1, "ACTIVA", "R8_QA_A", "R8_TECH_A", "R8_EXP_A", "R8 no hydration first AR"
    AddTareasEstadoItem fullCol, TEST_ID_AR_NO_HYDRATION_2, "ACTIVA", "R8_QA_B", "R8_TECH_B", "R8_EXP_B", "R8 no hydration second AR"
    activasCol.Add CStr(TEST_ID_AR_NO_HYDRATION_1), fullCol(CStr(TEST_ID_AR_NO_HYDRATION_1))
    activasCol.Add CStr(TEST_ID_AR_NO_HYDRATION_2), fullCol(CStr(TEST_ID_AR_NO_HYDRATION_2))

    Set m_ObjEntorno = New Entorno
    Set m_ObjEntorno.ColSegsTareasProyecto = fullCol
    Set m_ObjEntorno.ColSegsTareasProyectoActivas = activasCol
    Set m_ObjEntorno.ColSegsTareasProyectoPteReplanificar = pteCol
    TestHelper.AddLog p_Logs, "Arrange: seeded two in-memory SegTareasProyecto rows for no-hydration; no backend NC/AC/AR INSERTs were used"
End Sub

Private Sub ArrangeTareasDeterministicOrderEnvironment(ByVal p_Logs As Collection)
    Dim fullCol As Scripting.Dictionary
    Dim activasCol As Scripting.Dictionary
    Dim pteCol As Scripting.Dictionary

    Set fullCol = New Scripting.Dictionary
    fullCol.CompareMode = TextCompare
    Set activasCol = New Scripting.Dictionary
    activasCol.CompareMode = TextCompare
    Set pteCol = New Scripting.Dictionary
    pteCol.CompareMode = TextCompare

    AddTareasEstadoItem fullCol, TEST_ID_AR_DETERMINISTIC_1, "ACTIVA", "R9_QA_A", "R9_TECH_A", "R9_EXP_A", "R9 deterministic first AR"
    AddTareasEstadoItem fullCol, TEST_ID_AR_DETERMINISTIC_2, "ACTIVA", "R9_QA_B", "R9_TECH_B", "R9_EXP_B", "R9 deterministic second AR"
    AddTareasEstadoItem fullCol, TEST_ID_AR_DETERMINISTIC_3, "ACTIVA", "R9_QA_C", "R9_TECH_C", "R9_EXP_C", "R9 deterministic third AR"
    activasCol.Add CStr(TEST_ID_AR_DETERMINISTIC_1), fullCol(CStr(TEST_ID_AR_DETERMINISTIC_1))
    activasCol.Add CStr(TEST_ID_AR_DETERMINISTIC_2), fullCol(CStr(TEST_ID_AR_DETERMINISTIC_2))
    activasCol.Add CStr(TEST_ID_AR_DETERMINISTIC_3), fullCol(CStr(TEST_ID_AR_DETERMINISTIC_3))

    Set m_ObjEntorno = New Entorno
    Set m_ObjEntorno.ColSegsTareasProyecto = fullCol
    Set m_ObjEntorno.ColSegsTareasProyectoActivas = activasCol
    Set m_ObjEntorno.ColSegsTareasProyectoPteReplanificar = pteCol
    TestHelper.AddLog p_Logs, "Arrange: seeded three in-memory SegTareasProyecto rows for deterministic export input; no UI/form automation and no backend NC/AC/AR INSERTs were used"
End Sub

Private Sub ResetSegTareasHydrationCounters()
    m_TestSegTareasProyectoARHydrationCount = 0
    m_TestSegTareasProyectoACHydrationCount = 0
    m_TestSegTareasProyectoNCHydrationCount = 0
End Sub

Private Sub ResetTareasHelperDelegationCapture()
    m_TestSeguimientoTareasHelperDelegationCallCount = 0
    m_TestSeguimientoTareasHelperLastResponsableCalidad = ""
    m_TestSeguimientoTareasHelperLastResponsable = ""
    m_TestSeguimientoTareasHelperLastEstado = ""
    m_TestSeguimientoTareasHelperLastIDExpediente = ""
End Sub

Private Function AssertHelperDelegationCapture( _
    ByVal p_ExpectedCallCount As Long, _
    ByVal p_ExpectedResponsableCalidad As String, _
    ByVal p_ExpectedResponsable As String, _
    ByVal p_ExpectedEstado As String, _
    ByVal p_ExpectedIDExpediente As String, _
    ByVal p_Label As String, _
    ByRef p_Error As String) As Boolean

    If m_TestSeguimientoTareasHelperDelegationCallCount <> p_ExpectedCallCount Then
        p_Error = "Expected helper delegation call count " & CStr(p_ExpectedCallCount) & " for " & p_Label & ", got " & CStr(m_TestSeguimientoTareasHelperDelegationCallCount)
        Exit Function
    End If
    If m_TestSeguimientoTareasHelperLastResponsableCalidad <> p_ExpectedResponsableCalidad Then
        p_Error = "Expected helper responsable_calidad=" & p_ExpectedResponsableCalidad & " for " & p_Label & ", got " & m_TestSeguimientoTareasHelperLastResponsableCalidad
        Exit Function
    End If
    If m_TestSeguimientoTareasHelperLastResponsable <> p_ExpectedResponsable Then
        p_Error = "Expected helper responsable=" & p_ExpectedResponsable & " for " & p_Label & ", got " & m_TestSeguimientoTareasHelperLastResponsable
        Exit Function
    End If
    If m_TestSeguimientoTareasHelperLastEstado <> p_ExpectedEstado Then
        p_Error = "Expected helper estado=" & p_ExpectedEstado & " for " & p_Label & ", got " & m_TestSeguimientoTareasHelperLastEstado
        Exit Function
    End If
    If m_TestSeguimientoTareasHelperLastIDExpediente <> p_ExpectedIDExpediente Then
        p_Error = "Expected helper IDExpediente=" & p_ExpectedIDExpediente & " for " & p_Label & ", got " & m_TestSeguimientoTareasHelperLastIDExpediente
        Exit Function
    End If

    AssertHelperDelegationCapture = True
End Function

Private Function AssertSegTareasHydrationCountersZero(ByRef p_Error As String) As Boolean
    If m_TestSegTareasProyectoARHydrationCount <> 0 Then
        p_Error = "Expected SegTareasProyecto.AR getter count=0, got " & CStr(m_TestSegTareasProyectoARHydrationCount)
        Exit Function
    End If
    If m_TestSegTareasProyectoACHydrationCount <> 0 Then
        p_Error = "Expected SegTareasProyecto.AC getter count=0, got " & CStr(m_TestSegTareasProyectoACHydrationCount)
        Exit Function
    End If
    If m_TestSegTareasProyectoNCHydrationCount <> 0 Then
        p_Error = "Expected SegTareasProyecto.NC getter count=0, got " & CStr(m_TestSegTareasProyectoNCHydrationCount)
        Exit Function
    End If

    AssertSegTareasHydrationCountersZero = True
End Function

Private Function AssertExportInputHoldsSameDictionary(ByVal p_Result As Scripting.Dictionary, ByRef p_Error As String) As Boolean
    If p_Result Is Nothing Then
        p_Error = "Expected helper result dictionary before assigning export input, got Nothing"
        Exit Function
    End If
    If m_ColFiltradoTareasNCProyectos Is Nothing Then
        p_Error = "Expected m_ColFiltradoTareasNCProyectos to hold helper result, got Nothing"
        Exit Function
    End If
    If Not m_ColFiltradoTareasNCProyectos Is p_Result Then
        p_Error = "Expected m_ColFiltradoTareasNCProyectos to be the same dictionary instance returned by helper"
        Exit Function
    End If

    AssertExportInputHoldsSameDictionary = True
End Function

Private Sub AddTareasParityItem( _
    ByVal p_Target As Scripting.Dictionary, _
    ByVal p_IDAccionRealizada As Long, _
    ByVal p_ResponsableCalidad As String, _
    ByVal p_Responsable As String, _
    ByVal p_IDExpediente As String, _
    ByVal p_Tarea As String)

    Dim item As SegTareasProyecto

    Set item = New SegTareasProyecto
    item.IDAccionRealizada = CStr(p_IDAccionRealizada)
    item.IdAccionCorrectiva = CStr(TEST_ID_AC)
    item.IDNoConformidad = CStr(TEST_ID_NC)
    item.Tarea = p_Tarea
    item.Tecnico = p_Responsable
    item.Estado = "ACTIVA"
    item.FechaInicio = CStr(Date)
    item.FechaFinPrevista = CStr(Date)
    item.TipoNC = "Proyecto"
    item.RespCalidad = p_ResponsableCalidad
    item.IDExpediente = p_IDExpediente
    item.NAccion = "1"

    p_Target.Add CStr(p_IDAccionRealizada), item
End Sub

Private Sub AddTareasEstadoItem( _
    ByVal p_Target As Scripting.Dictionary, _
    ByVal p_IDAccionRealizada As Long, _
    ByVal p_Estado As String, _
    ByVal p_ResponsableCalidad As String, _
    ByVal p_Responsable As String, _
    ByVal p_IDExpediente As String, _
    ByVal p_Tarea As String)

    Dim item As SegTareasProyecto

    Set item = New SegTareasProyecto
    item.IDAccionRealizada = CStr(p_IDAccionRealizada)
    item.IdAccionCorrectiva = CStr(TEST_ID_AC)
    item.IDNoConformidad = CStr(TEST_ID_NC)
    item.Tarea = p_Tarea
    item.Tecnico = p_Responsable
    item.Estado = p_Estado
    item.FechaInicio = CStr(Date)
    item.FechaFinPrevista = CStr(Date)
    item.TipoNC = "Proyecto"
    item.RespCalidad = p_ResponsableCalidad
    item.IDExpediente = p_IDExpediente
    item.NAccion = "1"

    p_Target.Add CStr(p_IDAccionRealizada), item
End Sub

Private Function AssertTareasEstadoScenario( _
    ByVal p_Label As String, _
    ByVal p_Estado As String, _
    ByVal p_ExpectedKeys As Variant, _
    ByVal p_Logs As Collection, _
    ByRef p_Error As String) As Boolean

    Dim helperError As String
    Dim actual As Scripting.Dictionary

    Set actual = Application.Run("GetARsProyectoSeguimientoTareasFiltrados", "", "", p_Estado, "", helperError)
    If helperError <> "" Then
        p_Error = "Helper returned error for Estado " & p_Label & ": " & helperError
        Exit Function
    End If

    If Not AssertDictionaryKeysInOrder(actual, p_ExpectedKeys, p_Label & " helper Estado source", p_Error) Then Exit Function

    TestHelper.AddLog p_Logs, "Assert: helper selects " & p_Label & " source for p_Estado=" & p_Estado
    AssertTareasEstadoScenario = True
End Function

Private Function AssertTareasFilterParityScenario( _
    ByVal p_Label As String, _
    ByVal p_ResponsableCalidad As String, _
    ByVal p_Responsable As String, _
    ByVal p_IDExpediente As String, _
    ByVal p_ExpectedKeys As Variant, _
    ByVal p_Logs As Collection, _
    ByRef p_Error As String) As Boolean

    Dim legacyError As String
    Dim helperError As String
    Dim expected As Scripting.Dictionary
    Dim actual As Scripting.Dictionary

    Set expected = constructor.getARsDeProyectoBusqueda( _
                    p_ResponsableCalidad:=p_ResponsableCalidad, _
                    p_Responsable:=p_Responsable, _
                    p_Estado:="", _
                    p_IDExpediente:=p_IDExpediente, _
                    p_Error:=legacyError)
    If legacyError <> "" Then
        p_Error = "Legacy oracle failed for " & p_Label & ": " & legacyError
        Exit Function
    End If

    If Not AssertDictionaryKeysInOrder(expected, p_ExpectedKeys, p_Label & " legacy oracle", p_Error) Then Exit Function

    Set actual = Application.Run("GetARsProyectoSeguimientoTareasFiltrados", p_ResponsableCalidad, p_Responsable, "", p_IDExpediente, helperError)
    If helperError <> "" Then
        p_Error = "Helper returned error for " & p_Label & ": " & helperError
        Exit Function
    End If

    If Not AssertDictionariesSameKeysAndOrder(expected, actual, p_Label, p_Error) Then Exit Function

    TestHelper.AddLog p_Logs, "Assert: helper preserves legacy getARsDeProyectoBusqueda order for " & p_Label
    AssertTareasFilterParityScenario = True
End Function

Private Function AssertDictionariesSameKeysAndOrder( _
    ByVal p_Expected As Scripting.Dictionary, _
    ByVal p_Actual As Scripting.Dictionary, _
    ByVal p_Label As String, _
    ByRef p_Error As String) As Boolean

    Dim expectedKey As Variant
    Dim actualKeys As Variant
    Dim index As Long

    If p_Expected Is Nothing Then
        p_Error = "Expected legacy dictionary for " & p_Label & ", got Nothing"
        Exit Function
    End If
    If p_Actual Is Nothing Then
        p_Error = "Expected helper dictionary for " & p_Label & ", got Nothing"
        Exit Function
    End If
    If p_Actual.count <> p_Expected.count Then
        p_Error = "Expected helper count " & CStr(p_Expected.count) & " for " & p_Label & ", got " & CStr(p_Actual.count)
        Exit Function
    End If

    actualKeys = p_Actual.Keys
    index = 0
    For Each expectedKey In p_Expected
        If CStr(actualKeys(index)) <> CStr(expectedKey) Then
            p_Error = "Expected key order[" & CStr(index) & "]=" & CStr(expectedKey) & " for " & p_Label & ", got " & CStr(actualKeys(index))
            Exit Function
        End If
        index = index + 1
    Next expectedKey

    AssertDictionariesSameKeysAndOrder = True
End Function

Private Function AssertDictionaryKeysInOrder( _
    ByVal p_Dictionary As Scripting.Dictionary, _
    ByVal p_ExpectedKeys As Variant, _
    ByVal p_Label As String, _
    ByRef p_Error As String) As Boolean

    Dim keys As Variant
    Dim index As Long

    If p_Dictionary Is Nothing Then
        p_Error = "Expected dictionary for " & p_Label & ", got Nothing"
        Exit Function
    End If
    If p_Dictionary.count <> UBound(p_ExpectedKeys) - LBound(p_ExpectedKeys) + 1 Then
        p_Error = "Expected " & CStr(UBound(p_ExpectedKeys) - LBound(p_ExpectedKeys) + 1) & " keys for " & p_Label & ", got " & CStr(p_Dictionary.count)
        Exit Function
    End If

    keys = p_Dictionary.Keys
    For index = LBound(p_ExpectedKeys) To UBound(p_ExpectedKeys)
        If CStr(keys(index - LBound(p_ExpectedKeys))) <> CStr(p_ExpectedKeys(index)) Then
            p_Error = "Expected key order[" & CStr(index) & "]=" & CStr(p_ExpectedKeys(index)) & " for " & p_Label & ", got " & CStr(keys(index - LBound(p_ExpectedKeys)))
            Exit Function
        End If
    Next index

    AssertDictionaryKeysInOrder = True
End Function

Private Sub CleanupTareasCacheFallbackRows(ByVal p_Db As DAO.Database, ByVal p_Logs As Collection, Optional ByVal p_Reason As String = FALLBACK_REASON_CACHE_NOT_IMPLEMENTED, Optional ByVal p_Usuario As String = "")
    Dim whereClause As String
    Dim scopeText As String

    whereClause = "IDNoConformidad=0 AND TipoOperacion=" & TestHelper.SqlText(LOG_OPERATION_TAREAS_FALLBACK) & _
                  " AND Detalles LIKE " & TestHelper.SqlText("*" & p_Reason & "*")
    scopeText = ""
    If p_Usuario <> "" Then
        whereClause = whereClause & " AND Usuario=" & TestHelper.SqlText(p_Usuario)
        scopeText = " / Usuario=" & p_Usuario
    End If

    p_Db.Execute "DELETE FROM TbLogCache WHERE " & whereClause, dbFailOnError
    TestHelper.AddLog p_Logs, "Cleanup: scoped TbLogCache rows removed for " & LOG_OPERATION_TAREAS_FALLBACK & " / reason containing " & p_Reason & scopeText
End Sub

Private Function CountTareasCacheFallbackRows(ByVal p_Db As DAO.Database, Optional ByVal p_Reason As String = FALLBACK_REASON_CACHE_NOT_IMPLEMENTED, Optional ByVal p_Usuario As String = "") As Long
    Dim rs As DAO.Recordset
    Dim whereClause As String

    whereClause = "IDNoConformidad=0 AND TipoOperacion=" & TestHelper.SqlText(LOG_OPERATION_TAREAS_FALLBACK) & _
                  " AND Detalles LIKE " & TestHelper.SqlText("*" & p_Reason & "*")
    If p_Usuario <> "" Then whereClause = whereClause & " AND Usuario=" & TestHelper.SqlText(p_Usuario)

    Set rs = p_Db.OpenRecordset( _
        "SELECT COUNT(*) AS C FROM TbLogCache WHERE " & whereClause, dbOpenSnapshot)
    CountTareasCacheFallbackRows = CLng(Nz(rs.Fields("C").value, 0))
    rs.Close
    Set rs = Nothing
End Function

Private Function AssertTareasFallbackLog(ByVal p_Db As DAO.Database, ByVal p_Logs As Collection, ByRef p_Error As String, Optional ByVal p_Reason As String = FALLBACK_REASON_CACHE_NOT_IMPLEMENTED, Optional ByVal p_ExpectedUsuario As String = "") As Boolean
    Dim rs As DAO.Recordset
    Dim whereClause As String

    whereClause = "IDNoConformidad=0 AND TipoOperacion=" & TestHelper.SqlText(LOG_OPERATION_TAREAS_FALLBACK) & _
                  " AND Detalles LIKE " & TestHelper.SqlText("*" & p_Reason & "*")
    If p_ExpectedUsuario <> "" Then whereClause = whereClause & " AND Usuario=" & TestHelper.SqlText(p_ExpectedUsuario)

    Set rs = p_Db.OpenRecordset( _
        "SELECT IDNoConformidad, TipoOperacion, Detalles, Usuario, DuracionMs, Exito FROM TbLogCache WHERE " & whereClause, dbOpenSnapshot)

    If rs.EOF Then
        p_Error = "Expected scoped TbLogCache row, got none"
        GoTo Cleanup
    End If
    If CLng(Nz(rs.Fields("IDNoConformidad").value, -1)) <> 0 Then
        p_Error = "Expected IDNoConformidad=0 in fallback log"
        GoTo Cleanup
    End If
    If CStr(Nz(rs.Fields("TipoOperacion").value, "")) <> LOG_OPERATION_TAREAS_FALLBACK Then
        p_Error = "Expected TipoOperacion=" & LOG_OPERATION_TAREAS_FALLBACK
        GoTo Cleanup
    End If
    If InStr(1, CStr(Nz(rs.Fields("Detalles").value, "")), p_Reason, vbTextCompare) = 0 Then
        p_Error = "Expected Detalles containing fallback reason substring: " & p_Reason
        GoTo Cleanup
    End If
    If p_ExpectedUsuario <> "" Then
        If CStr(Nz(rs.Fields("Usuario").value, "")) <> p_ExpectedUsuario Then
            p_Error = "Expected Usuario=" & p_ExpectedUsuario & " in fallback log"
            GoTo Cleanup
        End If
    End If
    If CLng(Nz(rs.Fields("DuracionMs").value, -1)) <> 0 Then
        p_Error = "Expected DuracionMs=0 in fallback log"
        GoTo Cleanup
    End If
    If CBool(Nz(rs.Fields("Exito").value, False)) <> True Then
        p_Error = "Expected Exito=True in fallback log"
        GoTo Cleanup
    End If

    TestHelper.AddLog p_Logs, "Assert: exactly one scoped TbLogCache TareasCacheFallback row contains reason substring: " & p_Reason
    AssertTareasFallbackLog = True

Cleanup:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
End Function
