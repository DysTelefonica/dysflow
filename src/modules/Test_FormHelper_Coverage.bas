Attribute VB_Name = "Test_FormHelper_Coverage"
Option Compare Database
Option Explicit

' ============================================
' MÓDULO DE TEST — FORM NCProyecto HELPER COVERAGE (W1 — canary)
' ============================================
' SDD: form-ncproyecto-helper-coverage
' GitHub issue: #40
' Work Unit: W1 / PR 1
' Test marker: FNHC-2026-06-03
'
' This first drop contains ONLY the skeleton (T-1.2):
'   - BeginTestSession / EndTestSession plumbing
'   - PreCallEnsureCacheListadoSchema helper (idempotent W3 pipe-column migration)
'   - RunFormHelperCoverage JSON-returning harness
'   - Canary test that returns {"status":"ok"} to validate the import + compile + run path
'
' Listing tests (SC-1.1..SC-1.7) and open-path tests (SC-2.1..SC-2.4) will be
' added in subsequent W1 drops once the canary is GREEN.
'
' Schema context (verified 2026-06-03 via dysflow.get_schema):
'   - TbNoConformidades (backend, 44 cols, PK IDNoConformidad Long required)
'   - TbCacheListadoNC (backend, 21 cols; pipe cols added by EnsureTbCacheListadoNC)
'   - TbCacheNCProyecto (backend, 11 cols)
'   - TbConfiguracion (backend, 5 cols, holds CacheHabilitada YesNo at ID=1)
'   - TbExpedientes (backend, ~50 cols, joined by constructor.getNCProyecto)
'   - TbConfiguracionBackends (frontend, 11 cols)
'
' Dysflow quirk: use databasePath: "NoConformidades_Datos.accdb" for backend queries.
' The backend binary does NOT yet have AccionesCorrectivasConcatenadas /
' AccionesRealizadasConcatenadas; EnsureTbCacheListadoNC adds them idempotently.
' ============================================

Private Const TEST_MARKER As String = "FNHC-2026-06-03"
Private Const TEST_ID_NC_BASE As Long = 900200
Private Const TEST_ID_NC_MATCH As Long = 900201
Private Const TEST_ID_NC_JURIDICA As Long = 900202
Private Const TEST_ID_NC_OTHER As Long = 900203
Private Const TEST_ID_NC_OPEN_EXISTS As Long = 900211
Private Const TEST_ID_NC_OPEN_BORRADO As Long = 900212
Private Const TEST_ID_NC_OPEN_NOT_FOUND As Long = 900213
Private Const TEST_ID_NC_FALLBACK_EMPTY As Long = 900221
Private Const TEST_ID_NC_FALLBACK_DISABLED As Long = 900222
Private Const TEST_ID_NC_FALLBACK_CACHE_IGNORED As Long = 900223
Private Const TEST_ID_EXP_OPEN_EXISTS As Long = 910211
Private Const TEST_ID_EXP_OPEN_BORRADO As Long = 910212

' ============================================
' HELPERS
' ============================================

' Pre-call for the W3 pipe-column migration. Idempotent. Safe to call at the
' top of any test that exercises GetListadoFiltradoSQL / SC-1.6.
'
' We CANNOT call CacheNCProyecto.EnsureTbCacheListadoNC directly: it is
' Private (src/modules/CacheNCProyecto.bas:220). Instead, we flip
' TbConfiguracion.CacheHabilitada = True on the backend (ID=1) and call the
' Public CacheNCProyecto.GetListadoFiltradoSQL() with no params. The SQL
' function itself calls EnsureTbCacheListadoNC at line 1689, which adds
' AccionesCorrectivasConcatenadas and AccionesRealizadasConcatenadas to
' TbCacheListadoNC if they are not already present. Then we restore the
' previous CacheHabilitada value so the test environment is not perturbed.
'
' Pipe-column EnsureListadoField calls in source: lines 256-257.
Public Sub PreCallEnsureCacheListadoSchema(ByRef logs As Collection, ByRef previousCacheHabilitada As Boolean)
    Dim db As DAO.Database
    Dim kickedCol As Collection
    Dim kickErr As String
    Dim restored As Boolean

    On Error GoTo EH
    Set db = getdb()

    previousCacheHabilitada = ReadCacheHabilitadaFromDb(db)
    TestHelper.AddLog logs, "PreCall: previous CacheHabilitada=" & previousCacheHabilitada

    Call WriteCacheHabilitadaToDb(db, True)
    TestHelper.AddLog logs, "PreCall: forced CacheHabilitada=True for Ensure migration"

    Set kickedCol = CacheNCProyecto.GetListadoFiltradoSQL(p_Error:=kickErr)
    If kickErr <> "" Then
        TestHelper.AddLog logs, "PreCall: GetListadoFiltradoSQL kick returned error: " & kickErr
        Err.Raise 1000, , "PreCall kick: " & kickErr
    End If
    TestHelper.AddLog logs, "PreCall: GetListadoFiltradoSQL kick OK (Ensure migration triggered as side effect)"

    restored = False
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "PreCallEnsureCacheListadoSchema Error: " & Err.Description
    Err.Raise Err.Number, , Err.Description
    GoTo Cleanup

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        If previousCacheHabilitada <> True Then
            Call WriteCacheHabilitadaToDb(db, previousCacheHabilitada)
            TestHelper.AddLog logs, "PreCall: restored CacheHabilitada=" & previousCacheHabilitada
        End If
    End If
    Set kickedCol = Nothing
    Set db = Nothing
End Sub

' Reads TbConfiguracion.CacheHabilitada (backend, ID=1). Returns False on any
' error or empty result so the caller can always rely on a Boolean.
Private Function ReadCacheHabilitadaFromDb(ByVal p_Db As DAO.Database) As Boolean
    Dim rs As DAO.Recordset
    On Error GoTo NotFound
    Set rs = p_Db.OpenRecordset("SELECT CacheHabilitada FROM TbConfiguracion WHERE ID=1", dbOpenSnapshot)
    If rs.EOF Then GoTo NotFound
    ReadCacheHabilitadaFromDb = CBool(Nz(rs.Fields("CacheHabilitada").value, False))
    rs.Close
    Set rs = Nothing
    Exit Function
NotFound:
    ReadCacheHabilitadaFromDb = False
End Function

' ============================================
' TEST SC-2.1..SC-2.5 — Form_FormNCProyecto open path
' ============================================
' SC-2.5 structural assertion: the detail open path is orthogonal to the
' listing-cache path. The production call site in Form_FormNCProyecto.EstablecerDatos
' calls constructor.getNCProyecto directly and does not call TbCacheListadoNC /
' NCProyectoGestionListadoHelper. This is enforced by code review; these runtime
' tests characterize the callable seam without DoCmd.OpenForm.
Public Function Test_FormHelper_Open_AltaMode_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim sessionErr As String
    Dim assertError As String
    Dim openErr As String
    Dim nc As ncProyecto
    Dim emptyActive As ncProyecto

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_FormHelper_Open_AltaMode_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()

    Set nc = OpenNCProyectoViaCurrentSeam(emptyActive, db, openErr)
    If openErr <> "" Then Err.Raise 1000, , openErr

    If Not TestHelper.AssertTrue(Not nc Is Nothing, "Alta mode returns a fresh NCProyecto", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(nc.IDNoConformidad = "", "Alta mode fresh object has empty IDNoConformidad", logs, assertError) Then GoTo Fail
    TestHelper.AddLog logs, "SC-2.1 OK: alta mode does not require a persisted row"

    Test_FormHelper_Open_AltaMode_Atomic = TestHelper.BuildJsonOk(logs, "open_alta_ok")
    GoTo Cleanup

Fail:
    Test_FormHelper_Open_AltaMode_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_FormHelper_Open_AltaMode_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set nc = Nothing
    Set emptyActive = Nothing
    Set db = Nothing
    Call TestHelper.EndTestSession(logs)
End Function

Public Function Test_FormHelper_Open_EdicionMode_Exists_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim sessionErr As String
    Dim assertError As String
    Dim openErr As String
    Dim nc As ncProyecto
    Dim activeNc As ncProyecto

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_FormHelper_Open_EdicionMode_Exists_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()

    Call TeardownOpenPathFixture(db, logs)
    Call SeedOpenPathFixture(db, TEST_ID_EXP_OPEN_EXISTS, TEST_ID_NC_OPEN_EXISTS, "FNHC-OPEN-EXISTS", False, logs)
    Set activeNc = BuildActiveNC(TEST_ID_NC_OPEN_EXISTS)

    Set nc = OpenNCProyectoViaCurrentSeam(activeNc, db, openErr)
    If openErr <> "" Then Err.Raise 1000, , openErr

    If Not TestHelper.AssertTrue(Not nc Is Nothing, "Edicion mode existing row returns NCProyecto", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(CLng(nc.IDNoConformidad) = TEST_ID_NC_OPEN_EXISTS, "Edicion existing row preserves IDNoConformidad", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(nc.CodigoNoConformidad = "FNHC-OPEN-EXISTS", "Edicion existing row preserves CodigoNoConformidad", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(nc.Borrado = False, "Edicion existing row has Borrado=False", logs, assertError) Then GoTo Fail
    TestHelper.AddLog logs, "SC-2.2 OK: constructor.getNCProyecto callable in isolation with explicit DB"

    Test_FormHelper_Open_EdicionMode_Exists_Atomic = TestHelper.BuildJsonOk(logs, "open_exists_ok")
    GoTo Cleanup

Fail:
    Test_FormHelper_Open_EdicionMode_Exists_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_FormHelper_Open_EdicionMode_Exists_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then Call TeardownOpenPathFixture(db, logs)
    Set nc = Nothing
    Set activeNc = Nothing
    Set db = Nothing
    Call TestHelper.EndTestSession(logs)
End Function

Public Function Test_FormHelper_Open_EdicionMode_NotFound_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim sessionErr As String
    Dim assertError As String
    Dim openErr As String
    Dim nc As ncProyecto
    Dim activeNc As ncProyecto

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_FormHelper_Open_EdicionMode_NotFound_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()

    Call TeardownOpenPathFixture(db, logs)
    Set activeNc = BuildActiveNC(TEST_ID_NC_OPEN_NOT_FOUND)
    Set nc = OpenNCProyectoViaCurrentSeam(activeNc, db, openErr)

    If Not TestHelper.AssertTrue(nc Is Nothing, "Edicion not-found returns Nothing", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(openErr <> "", "Edicion not-found sets p_Error", logs, assertError) Then GoTo Fail
    TestHelper.AddLog logs, "SC-2.3 OK: missing ID produces Nothing plus error"

    Test_FormHelper_Open_EdicionMode_NotFound_Atomic = TestHelper.BuildJsonOk(logs, "open_not_found_ok")
    GoTo Cleanup

Fail:
    Test_FormHelper_Open_EdicionMode_NotFound_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_FormHelper_Open_EdicionMode_NotFound_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then Call TeardownOpenPathFixture(db, logs)
    Set nc = Nothing
    Set activeNc = Nothing
    Set db = Nothing
    Call TestHelper.EndTestSession(logs)
End Function

Public Function Test_FormHelper_Open_EdicionMode_Borrado_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim sessionErr As String
    Dim assertError As String
    Dim openErr As String
    Dim nc As ncProyecto
    Dim activeNc As ncProyecto

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_FormHelper_Open_EdicionMode_Borrado_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()

    Call TeardownOpenPathFixture(db, logs)
    Call SeedOpenPathFixture(db, TEST_ID_EXP_OPEN_BORRADO, TEST_ID_NC_OPEN_BORRADO, "FNHC-OPEN-BORRADO", True, logs)
    Set activeNc = BuildActiveNC(TEST_ID_NC_OPEN_BORRADO)

    Set nc = OpenNCProyectoViaCurrentSeam(activeNc, db, openErr)
    If openErr <> "" Then Err.Raise 1000, , openErr

    If Not TestHelper.AssertTrue(Not nc Is Nothing, "Edicion borrado row returns NCProyecto", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(nc.Borrado = True, "Edicion borrado row preserves Borrado=True", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(CLng(nc.IDNoConformidad) = TEST_ID_NC_OPEN_BORRADO, "Edicion borrado row preserves IDNoConformidad", logs, assertError) Then GoTo Fail
    TestHelper.AddLog logs, "SC-2.4 OK: borrado row does not raise in the open seam"

    Test_FormHelper_Open_EdicionMode_Borrado_Atomic = TestHelper.BuildJsonOk(logs, "open_borrado_ok")
    GoTo Cleanup

Fail:
    Test_FormHelper_Open_EdicionMode_Borrado_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_FormHelper_Open_EdicionMode_Borrado_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then Call TeardownOpenPathFixture(db, logs)
    Set nc = Nothing
    Set activeNc = Nothing
    Set db = Nothing
    Call TestHelper.EndTestSession(logs)
End Function

' ============================================
' TEST SC-1.2 / SC-1.4 / SC-1.5 / SC-1.6 / SC-1.7 — cache listing path
' ============================================
Public Function Test_FormHelper_Listing_EmptyCacheFallback_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim sessionErr As String
    Dim assertError As String
    Dim helperErr As String
    Dim previousCacheHabilitada As Boolean
    Dim previousUser As usuario
    Dim col As Collection

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_FormHelper_Listing_EmptyCacheFallback_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If

    Set db = getdb()
    Call SchemaGateFormHelperFallback(logs)
    previousCacheHabilitada = ReadCacheHabilitadaFromDb(db)
    Set previousUser = m_ObjUsuarioConectado

    Call CleanupFallbackFixture(db, logs)
    Call WriteCacheHabilitadaToDb(db, True)
    Call SeedFallbackNCFixture(db, TEST_ID_NC_FALLBACK_EMPTY, "FNHC-FALLBACK-EMPTY", "SC-1.1 empty cache source row", logs)
    Set m_ObjUsuarioConectado = BuildTestUser("QA FNHC Empty")
    TestHelper.AddLog logs, "Arrange SC-1.1: cache enabled, one deterministic source NC, zero matching valid cache rows"

    Set col = NCProyectoGestionListadoHelper.GetNCsProyectoGestionFiltrados( _
                    p_Codigo:="FNHC-FALLBACK-EMPTY", _
                    p_Error:=helperErr)
    If helperErr <> "" Then Err.Raise 1000, , helperErr

    If Not AssertCollectionHasOnlyIdLocal(col, TEST_ID_NC_FALLBACK_EMPTY, logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(CountRowsWhereLocal(db, "TbLogCache", "IDNoConformidad=0 AND TipoOperacion='FormCacheFallback'") = 1, "SC-1.1 writes exactly one FormCacheFallback log", logs, assertError) Then GoTo Fail
    TestHelper.AddLog logs, "SC-1.1 OK: empty cache path falls back to legacy source selection"

    Test_FormHelper_Listing_EmptyCacheFallback_Atomic = TestHelper.BuildJsonOk(logs, "empty_cache_fallback_ok")
    GoTo Cleanup

Fail:
    Test_FormHelper_Listing_EmptyCacheFallback_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_FormHelper_Listing_EmptyCacheFallback_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        Call CleanupFallbackFixture(db, logs)
        Call WriteCacheHabilitadaToDb(db, previousCacheHabilitada)
    End If
    Set m_ObjUsuarioConectado = previousUser
    Set col = Nothing
    Set db = Nothing
    Call TestHelper.EndTestSession(logs)
End Function

Public Function Test_FormHelper_Listing_DisabledCacheFallback_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim sessionErr As String
    Dim assertError As String
    Dim helperErr As String
    Dim previousCacheHabilitada As Boolean
    Dim previousUser As usuario
    Dim col As Collection

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_FormHelper_Listing_DisabledCacheFallback_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If

    Set db = getdb()
    Call SchemaGateFormHelperFallback(logs)
    previousCacheHabilitada = ReadCacheHabilitadaFromDb(db)
    Set previousUser = m_ObjUsuarioConectado

    Call CleanupFallbackFixture(db, logs)
    Call WriteCacheHabilitadaToDb(db, False)
    Call SeedFallbackNCFixture(db, TEST_ID_NC_FALLBACK_DISABLED, "FNHC-FALLBACK-DISABLED", "SC-1.3 disabled cache source row", logs)
    Call SeedIgnoredFallbackCacheRow(db, TEST_ID_NC_FALLBACK_CACHE_IGNORED, "FNHC-FALLBACK-DISABLED", logs)
    Set m_ObjUsuarioConectado = BuildTestUser("QA FNHC Disabled")
    TestHelper.AddLog logs, "Arrange SC-1.3: cache disabled, source row and distinguishable cache row both exist"

    Set col = NCProyectoGestionListadoHelper.GetNCsProyectoGestionFiltrados( _
                    p_Codigo:="FNHC-FALLBACK-DISABLED", _
                    p_Error:=helperErr)
    If helperErr <> "" Then Err.Raise 1000, , helperErr

    If Not AssertCollectionHasOnlyIdLocal(col, TEST_ID_NC_FALLBACK_DISABLED, logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(Not CollectionContainsId(col, TEST_ID_NC_FALLBACK_CACHE_IGNORED), "SC-1.3 ignores matching cache row while cache is disabled", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(CountRowsWhereLocal(db, "TbLogCache", "IDNoConformidad=0 AND TipoOperacion='FormCacheFallback'") = 1, "SC-1.3 writes exactly one FormCacheFallback log", logs, assertError) Then GoTo Fail
    TestHelper.AddLog logs, "SC-1.3 OK: disabled cache path falls back to legacy source selection"

    Test_FormHelper_Listing_DisabledCacheFallback_Atomic = TestHelper.BuildJsonOk(logs, "disabled_cache_fallback_ok")
    GoTo Cleanup

Fail:
    Test_FormHelper_Listing_DisabledCacheFallback_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_FormHelper_Listing_DisabledCacheFallback_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        Call CleanupFallbackFixture(db, logs)
        Call WriteCacheHabilitadaToDb(db, previousCacheHabilitada)
    End If
    Set m_ObjUsuarioConectado = previousUser
    Set col = Nothing
    Set db = Nothing
    Call TestHelper.EndTestSession(logs)
End Function

Public Function Test_FormHelper_Listing_CacheFilters_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim sessionErr As String
    Dim assertError As String
    Dim helperErr As String
    Dim previousCacheHabilitada As Boolean
    Dim col As Collection

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_FormHelper_Listing_CacheFilters_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If

    Set db = getdb()

    ' Arrange: Ensure schema, remove only deterministic fixture rows, seed cache rows.
    Call PreCallEnsureCacheListadoSchema(logs, previousCacheHabilitada)
    Call TeardownCacheListadoFixture(db, logs)
    Call SeedCacheListadoFixture(db, logs)
    Call WriteCacheHabilitadaToDb(db, True)
    TestHelper.AddLog logs, "Arrange: CacheHabilitada=True and deterministic cache rows seeded"

    ' SC-1.2 + SC-1.4: Codigo is exact match, not LIKE.
    Set col = NCProyectoGestionListadoHelper.GetNCsProyectoGestionFiltrados( _
                    p_Codigo:="FNHC-CACHE-MATCH", _
                    p_Error:=helperErr)
    If helperErr <> "" Then Err.Raise 1000, , helperErr
    If Not TestHelper.AssertTrue(Not col Is Nothing, "Codigo filter returns a Collection", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(col.count = 1, "Codigo exact filter returns exactly one seeded row", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(CollectionContainsId(col, TEST_ID_NC_MATCH), "Codigo exact filter returns TEST_ID_NC_MATCH", logs, assertError) Then GoTo Fail
    TestHelper.AddLog logs, "SC-1.2/SC-1.4 OK: Codigo exact match returned seeded cache row"

    ' SC-1.5: JuridicaExp is case-insensitive contains/LIKE semantics.
    helperErr = ""
    Set col = NCProyectoGestionListadoHelper.GetNCsProyectoGestionFiltrados( _
                    p_Juridica:="juridica-shared", _
                    p_Error:=helperErr)
    If helperErr <> "" Then Err.Raise 1000, , helperErr
    If Not TestHelper.AssertTrue(Not col Is Nothing, "Juridica filter returns a Collection", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(CollectionContainsId(col, TEST_ID_NC_MATCH), "Juridica contains filter includes TEST_ID_NC_MATCH", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(CollectionContainsId(col, TEST_ID_NC_JURIDICA), "Juridica contains filter includes TEST_ID_NC_JURIDICA", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(Not CollectionContainsId(col, TEST_ID_NC_OTHER), "Juridica contains filter excludes unrelated seeded row", logs, assertError) Then GoTo Fail
    TestHelper.AddLog logs, "SC-1.5 OK: JuridicaExp LIKE semantics verified"

    ' SC-1.6: Google search must include pipe-delimited AC/AR flattened columns.
    helperErr = ""
    Set col = NCProyectoGestionListadoHelper.GetNCsProyectoGestionFiltrados( _
                    p_Google:="FNHC-PIPE-AC-ONLY", _
                    p_Error:=helperErr)
    If helperErr <> "" Then Err.Raise 1000, , helperErr
    If Not TestHelper.AssertTrue(Not col Is Nothing, "Google pipe-column filter returns a Collection", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(col.count = 1, "Google pipe-column filter returns exactly one seeded row", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(CollectionContainsId(col, TEST_ID_NC_MATCH), "Google pipe-column filter returns TEST_ID_NC_MATCH", logs, assertError) Then GoTo Fail
    TestHelper.AddLog logs, "SC-1.6 OK: Google filter matched AccionesCorrectivasConcatenadas"

    ' SC-1.7: no filters should not exclude seeded valid-cache rows.
    helperErr = ""
    Set col = NCProyectoGestionListadoHelper.GetNCsProyectoGestionFiltrados(p_Error:=helperErr)
    If helperErr <> "" Then Err.Raise 1000, , helperErr
    If Not TestHelper.AssertTrue(Not col Is Nothing, "No-filter cache call returns a Collection", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(CountSeededCacheItems(col) = 3, "No-filter cache call includes all three seeded rows", logs, assertError) Then GoTo Fail
    TestHelper.AddLog logs, "SC-1.7 OK: no-filter cache path includes all deterministic seeded rows"

    Test_FormHelper_Listing_CacheFilters_Atomic = TestHelper.BuildJsonOk(logs, "cache_filters_ok")
    GoTo Cleanup

Fail:
    Test_FormHelper_Listing_CacheFilters_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_FormHelper_Listing_CacheFilters_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        Call TeardownCacheListadoFixture(db, logs)
        Call WriteCacheHabilitadaToDb(db, previousCacheHabilitada)
    End If
    Set col = Nothing
    Set db = Nothing
    Call TestHelper.EndTestSession(logs)
End Function

' Writes TbConfiguracion.CacheHabilitada (backend, ID=1).
Private Sub WriteCacheHabilitadaToDb(ByVal p_Db As DAO.Database, ByVal p_Value As Boolean)
    On Error Resume Next
    p_Db.Execute "UPDATE TbConfiguracion SET CacheHabilitada=" & IIf(p_Value, "True", "False") & " WHERE ID=1", dbFailOnError
End Sub

' ============================================
' TEST 0 — Canary (skeleton validation)
' ============================================
Public Function Test_FormHelper_Coverage_Canary_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim sessionErr As String
    Dim assertError As String
    Dim ok As Boolean

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_FormHelper_Coverage_Canary_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If

    ok = TestHelper.AssertTrue(Not logs Is Nothing, "Canary initialized the log collection", logs, assertError)
    If Not ok Then
        Test_FormHelper_Coverage_Canary_Atomic = TestHelper.BuildJsonFail(assertError, logs)
        GoTo Cleanup
    End If

    Test_FormHelper_Coverage_Canary_Atomic = TestHelper.BuildJsonOk(logs, "canary_ok")
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_FormHelper_Coverage_Canary_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    Call TestHelper.EndTestSession(logs)
End Function

' ============================================
' TEST SC-1.0 — EnsureTbCacheListadoNC precondition
' ============================================
Public Function Test_FormHelper_Listing_EnsureSchema_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim sessionErr As String
    Dim assertError As String
    Dim hasPipeAC As Boolean
    Dim hasPipeAR As Boolean
    Dim previousCacheHabilitada As Boolean

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_FormHelper_Listing_EnsureSchema_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()

    ' Arrange + Act: pre-call Ensure.
    Call PreCallEnsureCacheListadoSchema(logs, previousCacheHabilitada)

    ' Assert: both pipe columns exist after Ensure.
    hasPipeAC = ColumnExistsInDb(db, "TbCacheListadoNC", "AccionesCorrectivasConcatenadas")
    hasPipeAR = ColumnExistsInDb(db, "TbCacheListadoNC", "AccionesRealizadasConcatenadas")
    TestHelper.AddLog logs, "After Ensure: AccionesCorrectivasConcatenadas=" & hasPipeAC & _
                              " AccionesRealizadasConcatenadas=" & hasPipeAR

    If Not TestHelper.AssertTrue(hasPipeAC, "TbCacheListadoNC.AccionesCorrectivasConcatenadas debe existir tras Ensure", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(hasPipeAR, "TbCacheListadoNC.AccionesRealizadasConcatenadas debe existir tras Ensure", logs, assertError) Then GoTo Fail

    Test_FormHelper_Listing_EnsureSchema_Atomic = TestHelper.BuildJsonOk(logs, "ensure_schema_ok")
    GoTo Cleanup

Fail:
    Test_FormHelper_Listing_EnsureSchema_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_FormHelper_Listing_EnsureSchema_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    Set db = Nothing
    Call TestHelper.EndTestSession(logs)
End Function

' ============================================
' LOCAL ADOX HELPERS
' ============================================

' True if the named column exists in the named table within the given DB.
' Uses DAO TableDefs (native to Access, no extra reference required). If the
' table itself is missing, returns False. If the column is missing, returns
' False. Otherwise True.
Private Function ColumnExistsInDb(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_ColumnName As String) As Boolean
    Dim td As DAO.TableDef
    Dim fld As DAO.Field

    On Error GoTo NotFound
    Set td = p_Db.TableDefs(p_TableName)
    For Each fld In td.Fields
        If LCase$(fld.Name) = LCase$(p_ColumnName) Then
            ColumnExistsInDb = True
            Exit Function
        End If
    Next fld
    ColumnExistsInDb = False
    Exit Function

NotFound:
    ColumnExistsInDb = False
End Function

Private Sub SeedCacheListadoFixture(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection)
    Call InsertCacheListadoFixtureRow(p_Db, TEST_ID_NC_MATCH, "FNHC-CACHE-MATCH", "Juridica-Shared Norte", "FNHC-PIPE-AC-ONLY|AC-002", "")
    Call InsertCacheListadoFixtureRow(p_Db, TEST_ID_NC_JURIDICA, "FNHC-CACHE-JUR", "Juridica-Shared Sur", "", "")
    Call InsertCacheListadoFixtureRow(p_Db, TEST_ID_NC_OTHER, "FNHC-CACHE-OTHER", "Juridica-Otra", "", "FNHC-PIPE-AR-OTHER")
    TestHelper.AddLog p_Logs, "Seed: inserted 3 deterministic TbCacheListadoNC rows"
End Sub

Private Sub InsertCacheListadoFixtureRow( _
    ByVal p_Db As DAO.Database, _
    ByVal p_IDNoConformidad As Long, _
    ByVal p_Codigo As String, _
    ByVal p_Juridica As String, _
    ByVal p_AccionesCorrectivas As String, _
    ByVal p_AccionesRealizadas As String)

    Dim SQL As String

    SQL = "INSERT INTO TbCacheListadoNC " & _
          "(IDNoConformidad, CodigoNoConformidad, IDExpediente, Nemotecnico, CodExp, IDTipo, " & _
          "Descripcion, Notas, Estado, FechaApertura, FechaCierre, RequiereControlEficacia, " & _
          "ControlEficacia, ResponsableTelefonica, RESPONSABLECALIDAD, ACR, Cerrada, FechaCache, " & _
          "CacheValida, Version, JuridicaExp, AccionesCorrectivasConcatenadas, AccionesRealizadasConcatenadas) VALUES (" & _
          p_IDNoConformidad & ", " & SqlLiteralLocal(p_Codigo) & ", 910001, " & _
          SqlLiteralLocal("FNHC-NEMO") & ", " & SqlLiteralLocal("FNHC-CODEXP") & ", 1, " & _
          SqlLiteralLocal(TEST_MARKER & " descripcion " & p_Codigo) & ", " & _
          SqlLiteralLocal(TEST_MARKER & " notas") & ", " & SqlLiteralLocal("Abierta") & ", " & _
          "#2026-06-01#, Null, " & SqlLiteralLocal("Sí") & ", " & SqlLiteralLocal("") & ", " & _
          SqlLiteralLocal("RespTel FNHC") & ", " & SqlLiteralLocal("RespCal FNHC") & ", " & _
          SqlLiteralLocal("ACR FNHC") & ", " & SqlLiteralLocal("No") & ", Now(), True, 1, " & _
          SqlLiteralLocal(p_Juridica) & ", " & SqlLiteralLocal(p_AccionesCorrectivas) & ", " & _
          SqlLiteralLocal(p_AccionesRealizadas) & ")"
    p_Db.Execute SQL, dbFailOnError
End Sub

Private Sub TeardownCacheListadoFixture(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection)
    On Error Resume Next
    p_Db.Execute "DELETE FROM TbCacheListadoNC WHERE IDNoConformidad IN (" & _
                 TEST_ID_NC_MATCH & "," & TEST_ID_NC_JURIDICA & "," & TEST_ID_NC_OTHER & ")", dbFailOnError
    TestHelper.AddLog p_Logs, "Teardown: deleted deterministic TbCacheListadoNC rows by ID marker range"
End Sub

Private Function CollectionContainsId(ByVal p_Collection As Collection, ByVal p_IDNoConformidad As Long) As Boolean
    Dim item As Variant

    If p_Collection Is Nothing Then Exit Function
    For Each item In p_Collection
        If CLng(CallByName(item, "IDNoConformidad", VbGet)) = p_IDNoConformidad Then
            CollectionContainsId = True
            Exit Function
        End If
    Next item
End Function

Private Function CountSeededCacheItems(ByVal p_Collection As Collection) As Long
    If CollectionContainsId(p_Collection, TEST_ID_NC_MATCH) Then CountSeededCacheItems = CountSeededCacheItems + 1
    If CollectionContainsId(p_Collection, TEST_ID_NC_JURIDICA) Then CountSeededCacheItems = CountSeededCacheItems + 1
    If CollectionContainsId(p_Collection, TEST_ID_NC_OTHER) Then CountSeededCacheItems = CountSeededCacheItems + 1
End Function

Private Sub SchemaGateFormHelperFallback(ByRef p_Logs As Collection)
    TestHelper.AddLog p_Logs, "Schema gate SC-1.1/SC-1.3: TbNoConformidades requires IDNoConformidad, CodigoNoConformidad, EXPEDIENTE; TbCacheListadoNC fallback fixture uses nullable listing fields; TbLogCache requires IDNoConformidad; TbConfiguracion uses CacheHabilitada. Seed order: source NC then optional cache row. Teardown order: cache/log then source NC."
End Sub

Private Sub SeedFallbackNCFixture( _
    ByVal p_Db As DAO.Database, _
    ByVal p_IDNC As Long, _
    ByVal p_Codigo As String, _
    ByVal p_Descripcion As String, _
    ByRef p_Logs As Collection)

    p_Db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad=" & CStr(p_IDNC), dbFailOnError
    p_Db.Execute "INSERT INTO TbNoConformidades " & _
                 "(IDNoConformidad, CodigoNoConformidad, EXPEDIENTE, PROYECTO, DESCRIPCION, CAUSA, FECHAAPERTURA, TIPO, RequiereControlEficacia, MotivoNoRequiereControlEficacia, Borrado, JuridicaExp, CodExp, Nemotecnico, Estado) VALUES (" & _
                 CStr(p_IDNC) & ", " & SqlLiteralLocal(p_Codigo) & ", " & SqlLiteralLocal("EXP-FNHC-FB-" & CStr(p_IDNC)) & ", " & SqlLiteralLocal("PROY-FNHC-FB") & ", " & _
                 SqlLiteralLocal(p_Descripcion) & ", " & SqlLiteralLocal("Causa fallback") & ", Date(), " & SqlLiteralLocal("Proyecto") & ", " & SqlLiteralLocal("No") & ", " & _
                 SqlLiteralLocal("Fixture fallback") & ", False, " & SqlLiteralLocal("Juridica FNHC Fallback") & ", " & SqlLiteralLocal("CODEXP-FNHC-FB") & ", " & _
                 SqlLiteralLocal("NEMO-FNHC-FB") & ", " & SqlLiteralLocal("Abierta") & ")", dbFailOnError
    TestHelper.AddLog p_Logs, "Seed: fallback source NC=" & CStr(p_IDNC) & " Codigo=" & p_Codigo
End Sub

Private Sub SeedIgnoredFallbackCacheRow( _
    ByVal p_Db As DAO.Database, _
    ByVal p_IDNC As Long, _
    ByVal p_Codigo As String, _
    ByRef p_Logs As Collection)

    p_Db.Execute "DELETE FROM TbCacheListadoNC WHERE IDNoConformidad=" & CStr(p_IDNC), dbFailOnError
    p_Db.Execute "INSERT INTO TbCacheListadoNC " & _
                 "(IDNoConformidad, CodigoNoConformidad, IDExpediente, Nemotecnico, CodExp, IDTipo, Descripcion, Notas, Estado, FechaApertura, RequiereControlEficacia, ControlEficacia, ResponsableTelefonica, RESPONSABLECALIDAD, ACR, Cerrada, FechaCache, CacheValida, Version, JuridicaExp) VALUES (" & _
                 CStr(p_IDNC) & ", " & SqlLiteralLocal(p_Codigo) & ", 0, " & SqlLiteralLocal("NEMO-FNHC-FB-CACHE") & ", " & SqlLiteralLocal("CODEXP-FNHC-FB-CACHE") & ", 0, " & _
                 SqlLiteralLocal("cache row must be ignored when disabled") & ", " & SqlLiteralLocal("") & ", " & SqlLiteralLocal("Abierta") & ", Date(), " & SqlLiteralLocal("No") & ", " & _
                 SqlLiteralLocal("") & ", " & SqlLiteralLocal("") & ", " & SqlLiteralLocal("") & ", " & SqlLiteralLocal("") & ", " & SqlLiteralLocal("No") & ", Now(), True, 1, " & _
                 SqlLiteralLocal("Juridica FNHC Fallback") & ")", dbFailOnError
    TestHelper.AddLog p_Logs, "Seed: ignored cache row NC=" & CStr(p_IDNC) & " Codigo=" & p_Codigo
End Sub

Private Sub CleanupFallbackFixture(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection)
    On Error Resume Next
    p_Db.Execute "DELETE FROM TbCacheListadoNC WHERE IDNoConformidad IN (" & _
                 TEST_ID_NC_FALLBACK_EMPTY & "," & TEST_ID_NC_FALLBACK_DISABLED & "," & TEST_ID_NC_FALLBACK_CACHE_IGNORED & ")", dbFailOnError
    p_Db.Execute "DELETE FROM TbCacheListadoNC WHERE CodigoNoConformidad IN ('FNHC-FALLBACK-EMPTY','FNHC-FALLBACK-DISABLED')", dbFailOnError
    p_Db.Execute "DELETE FROM TbLogCache WHERE IDNoConformidad=0 AND TipoOperacion='FormCacheFallback'", dbFailOnError
    p_Db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad IN (" & _
                 TEST_ID_NC_FALLBACK_EMPTY & "," & TEST_ID_NC_FALLBACK_DISABLED & ")", dbFailOnError
    TestHelper.AddLog p_Logs, "Teardown: deleted deterministic fallback fixtures"
End Sub

Private Function BuildTestUser(ByVal p_Nombre As String) As usuario
    Dim usr As usuario

    Set usr = New usuario
    usr.Nombre = p_Nombre
    usr.UsuarioRed = "TEST_FNHC_HELPER"
    Set BuildTestUser = usr
End Function

Private Function CountRowsWhereLocal(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_Where As String) As Long
    Dim rs As DAO.Recordset

    Set rs = p_Db.OpenRecordset("SELECT COUNT(*) AS C FROM " & p_TableName & " WHERE " & p_Where, dbOpenSnapshot)
    CountRowsWhereLocal = CLng(rs!c)
    rs.Close
    Set rs = Nothing
End Function

Private Function AssertCollectionHasOnlyIdLocal(ByVal p_Collection As Collection, ByVal p_ExpectedId As Long, ByRef p_Logs As Collection, ByRef p_Error As String) As Boolean
    Dim actualId As Long

    If p_Collection Is Nothing Then
        p_Error = "Expected collection, got Nothing"
        Exit Function
    End If
    If p_Collection.count <> 1 Then
        p_Error = "Expected exactly one row, got " & CStr(p_Collection.count)
        Exit Function
    End If

    actualId = CLng(CallByName(p_Collection(1), "IDNoConformidad", VbGet))
    If actualId <> p_ExpectedId Then
        p_Error = "Expected IDNoConformidad=" & CStr(p_ExpectedId) & ", got " & CStr(actualId)
        Exit Function
    End If

    TestHelper.AddLog p_Logs, "Assert: collection contains only ID=" & CStr(p_ExpectedId)
    AssertCollectionHasOnlyIdLocal = True
End Function

Private Function OpenNCProyectoViaCurrentSeam( _
    ByVal p_ActiveNC As ncProyecto, _
    ByVal p_Db As DAO.Database, _
    ByRef p_Error As String) As ncProyecto

    Dim loadedNc As ncProyecto

    p_Error = ""
    If p_ActiveNC Is Nothing Then
        Set OpenNCProyectoViaCurrentSeam = New ncProyecto
        Exit Function
    End If

    Set loadedNc = constructor.getNCProyecto( _
                    p_IDNC:=p_ActiveNC.IDNoConformidad, _
                    p_Db:=p_Db, _
                    p_Error:=p_Error)
    If p_Error <> "" Then
        Set OpenNCProyectoViaCurrentSeam = Nothing
        Exit Function
    End If
    If loadedNc Is Nothing Then
        p_Error = "Parece que no se ha podido encontrar la NC de proyecto registrada"
        Set OpenNCProyectoViaCurrentSeam = Nothing
        Exit Function
    End If

    Set OpenNCProyectoViaCurrentSeam = loadedNc
End Function

Private Function BuildActiveNC(ByVal p_IDNC As Long) As ncProyecto
    Dim nc As ncProyecto

    Set nc = New ncProyecto
    nc.IDNoConformidad = CStr(p_IDNC)
    nc.CodigoNoConformidad = "FNHC-ACTIVE-" & CStr(p_IDNC)
    Set BuildActiveNC = nc
End Function

Private Sub SeedOpenPathFixture( _
    ByVal p_Db As DAO.Database, _
    ByVal p_IDExpediente As Long, _
    ByVal p_IDNC As Long, _
    ByVal p_Codigo As String, _
    ByVal p_Borrado As Boolean, _
    ByRef p_Logs As Collection)

    Dim sqlExpediente As String
    Dim sqlNC As String
    Dim borradoSql As String

    If p_Borrado Then
        borradoSql = "True"
    Else
        borradoSql = "False"
    End If

    Call DeleteOpenPathNC(p_Db, p_IDNC)
    p_Db.Execute "DELETE FROM TbExpedientes WHERE IDExpediente=" & CStr(p_IDExpediente), dbFailOnError

    sqlExpediente = "INSERT INTO TbExpedientes (IDExpediente, Nemotecnico, Titulo) VALUES (" & _
                    CStr(p_IDExpediente) & ", " & SqlLiteralLocal("FNHC-EXP-" & CStr(p_IDExpediente)) & ", " & _
                    SqlLiteralLocal(TEST_MARKER & " open path expediente") & ")"
    p_Db.Execute sqlExpediente, dbFailOnError

    sqlNC = "INSERT INTO TbNoConformidades " & _
            "(IDNoConformidad, CodigoNoConformidad, EXPEDIENTE, PROYECTO, DESCRIPCION, Notas, " & _
            "CAUSA, FECHAAPERTURA, TIPO, RequiereControlEficacia, MotivoNoRequiereControlEficacia, " & _
            "Borrado, Juridica, JuridicaExp, CodExp, Nemotecnico, IDExpediente, Estado, RESPONSABLECALIDAD, RESPONSABLETELEFONICA) VALUES (" & _
            CStr(p_IDNC) & ", " & SqlLiteralLocal(p_Codigo) & ", " & _
            SqlLiteralLocal("EXP-FNHC-" & CStr(p_IDNC)) & ", " & SqlLiteralLocal("PROY-FNHC") & ", " & _
            SqlLiteralLocal(TEST_MARKER & " open path descripcion") & ", " & SqlLiteralLocal(TEST_MARKER & " open path notas") & ", " & _
            SqlLiteralLocal("Causa open path") & ", Date(), " & SqlLiteralLocal("Proyecto") & ", " & _
            SqlLiteralLocal("No") & ", " & SqlLiteralLocal("Fixture open path") & ", " & borradoSql & ", " & _
            SqlLiteralLocal("Juridica FNHC") & ", " & SqlLiteralLocal("JuridicaExp FNHC") & ", " & _
            SqlLiteralLocal("CODEXP-FNHC") & ", " & SqlLiteralLocal("NEMO-FNHC") & ", " & _
            CStr(p_IDExpediente) & ", " & SqlLiteralLocal("Abierta") & ", " & _
            SqlLiteralLocal("QA FNHC") & ", " & SqlLiteralLocal("RespTel FNHC") & ")"
    p_Db.Execute sqlNC, dbFailOnError
    TestHelper.AddLog p_Logs, "Seed: open path fixture NC=" & CStr(p_IDNC) & " EXP=" & CStr(p_IDExpediente)
End Sub

Private Sub TeardownOpenPathFixture(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection)
    On Error Resume Next
    Call DeleteOpenPathNC(p_Db, TEST_ID_NC_OPEN_EXISTS)
    Call DeleteOpenPathNC(p_Db, TEST_ID_NC_OPEN_BORRADO)
    Call DeleteOpenPathNC(p_Db, TEST_ID_NC_OPEN_NOT_FOUND)
    p_Db.Execute "DELETE FROM TbExpedientes WHERE IDExpediente IN (" & _
                 TEST_ID_EXP_OPEN_EXISTS & "," & TEST_ID_EXP_OPEN_BORRADO & ")", dbFailOnError
    TestHelper.AddLog p_Logs, "Teardown: deleted open path fixtures in reverse FK order"
End Sub

Private Sub DeleteOpenPathNC(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long)
    On Error Resume Next
    p_Db.Execute "DELETE FROM TbCacheListadoNC WHERE IDNoConformidad=" & CStr(p_IDNC), dbFailOnError
    p_Db.Execute "DELETE FROM TbCacheNCProyecto WHERE IDNoConformidad=" & CStr(p_IDNC), dbFailOnError
    p_Db.Execute "DELETE FROM TbLogCache WHERE IDNoConformidad=" & CStr(p_IDNC), dbFailOnError
    p_Db.Execute "DELETE FROM TbNCAccionesRealizadas WHERE IDAccionCorrectiva IN (SELECT IDAccionCorrectiva FROM TbNCAccionCorrectivas WHERE IDNoConformidad=" & CStr(p_IDNC) & ")", dbFailOnError
    p_Db.Execute "DELETE FROM TbNCAccionCorrectivas WHERE IDNoConformidad=" & CStr(p_IDNC), dbFailOnError
    p_Db.Execute "DELETE FROM TbNCDocumentos WHERE IDNoConformidad=" & CStr(p_IDNC), dbFailOnError
    p_Db.Execute "DELETE FROM TbNCInformacionRAC WHERE IDNoConformidad=" & CStr(p_IDNC), dbFailOnError
    p_Db.Execute "DELETE FROM TbAnexos WHERE IDNoConformidad=" & CStr(p_IDNC), dbFailOnError
    p_Db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad=" & CStr(p_IDNC), dbFailOnError
End Sub

Private Function SqlLiteralLocal(ByVal p_Value As String) As String
    SqlLiteralLocal = "'" & Replace(p_Value, "'", "''") & "'"
End Function


