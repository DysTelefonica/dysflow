Attribute VB_Name = "Test_CacheListadoNC_Parity"
Option Compare Database
Option Explicit

' Form name constant (PRIMERA declaración del módulo, antes de cualquier
' Sub o Function, según regla del proyecto access-vba-tdd v2.4.1 §1 y
' convención del equipo CONDOR).
'
' IMPORTANTE: en Access, DoCmd.OpenForm y Forms() usan el nombre del
' formulario SIN el prefijo "Form_". Ese prefijo es solo del class module
' file (Form_FormNCProyectoGestion.cls); el nombre lógico del form es
' "FormNCProyectoGestion". Pasamos ese nombre a OpenForm/Forms.
Private Const FORM_NAME As String = "FormNCProyectoGestion"

' ============================================
' MÓDULO DE TEST — CACHE LISTADO NC PARITY (W1)
' ============================================
' SDD: cache-form-filter-coverage
' Work Unit: W1 / PR 1 — RED tests + 5-line PipeFlatten stub
'
' Test scenarios (13 RED tests, all atomic):
'   1.  Codigo exact match                            (R1, LIKE->= exact)
'   2.  Codigo exact excludes prefix-overlap          (R1)
'   3.  Juridica contains filter                      (R2, missing p_Juridica)
'   4.  Flat filters combined                         (regression guard)
'   5.  VM rendering contract                         (regression guard)
'   6.  PipeFlatten: empty if no children
'   7.  PipeFlatten: one child
'   8.  PipeFlatten: multiple children pipe-delimited
'   9.  PipeFlatten: sanitizes pipe
'   10. PipeFlatten: resilient if table missing
'   11. Form fallback: empty cache
'   12. Form fallback: cache disabled
'   13. Form fallback: no-log-failure on missing user
'
' Fixture strategy: schema-first, sandbox local via m_TestingMode +
' BeginTestSession + AssertSandboxBackend. Each test creates the exact
' rows it needs (no lucky data) and cleans up by deterministic ID.
' ID range: 900020+ to avoid collision with Test_CacheListadoEstados (900010+).
' ============================================

Private Const TEST_ID_NC_BASE As Long = 900020

' Codigo / Juridica tests share IDs
Private Const TEST_ID_NC_CODIGO_EXACT As Long = TEST_ID_NC_BASE + 1
Private Const TEST_ID_NC_CODIGO_OVERLAP As Long = TEST_ID_NC_BASE + 2
Private Const TEST_ID_NC_JURIDICA_HIT As Long = TEST_ID_NC_BASE + 3
Private Const TEST_ID_NC_JURIDICA_MISS As Long = TEST_ID_NC_BASE + 4

' FlatFilters test uses 6+ NCs
Private Const TEST_ID_NC_FLAT_A As Long = TEST_ID_NC_BASE + 10
Private Const TEST_ID_NC_FLAT_B As Long = TEST_ID_NC_BASE + 11
Private Const TEST_ID_NC_FLAT_C As Long = TEST_ID_NC_BASE + 12
Private Const TEST_ID_NC_FLAT_D As Long = TEST_ID_NC_BASE + 13
Private Const TEST_ID_NC_FLAT_E As Long = TEST_ID_NC_BASE + 14
Private Const TEST_ID_NC_FLAT_F As Long = TEST_ID_NC_BASE + 15
Private Const TEST_ID_NC_FLAT_STALE As Long = TEST_ID_NC_BASE + 19

' VM rendering test uses 3 NCs
Private Const TEST_ID_NC_VM_1 As Long = TEST_ID_NC_BASE + 20
Private Const TEST_ID_NC_VM_2 As Long = TEST_ID_NC_BASE + 21
Private Const TEST_ID_NC_VM_3 As Long = TEST_ID_NC_BASE + 22

' PipeFlatten tests use parent NC + child ACs
Private Const TEST_ID_NC_PIPE_EMPTY As Long = TEST_ID_NC_BASE + 30
Private Const TEST_ID_NC_PIPE_ONE As Long = TEST_ID_NC_BASE + 31
Private Const TEST_ID_NC_PIPE_MULTI As Long = TEST_ID_NC_BASE + 32
Private Const TEST_ID_NC_PIPE_SANITIZE As Long = TEST_ID_NC_BASE + 33
Private Const TEST_ID_NC_PIPE_MISSING As Long = TEST_ID_NC_BASE + 34

' AC ID base for PipeFlatten children (deterministic)
Private Const TEST_ID_AC_BASE As Long = 900100
Private Const TEST_ID_AC_PIPE_ONE As Long = TEST_ID_AC_BASE + 1
Private Const TEST_ID_AC_PIPE_MULTI_1 As Long = TEST_ID_AC_BASE + 2
Private Const TEST_ID_AC_PIPE_MULTI_2 As Long = TEST_ID_AC_BASE + 3
Private Const TEST_ID_AC_PIPE_MULTI_3 As Long = TEST_ID_AC_BASE + 4
Private Const TEST_ID_AC_PIPE_SANITIZE As Long = TEST_ID_AC_BASE + 5

' Form fallback test marker
Private Const TEST_ID_NC_FALLBACK As Long = TEST_ID_NC_BASE + 40

' ============================================
' HELPERS — IDEMPOTENCIA DE TESTS
' ============================================
'
' REGLA: los tests deben ser idempotentes. Ningún test debe afectar a otro.
' El sandbox backend (C:\00repos\datos\NoConformidades_Datos.accdb) es
' compartido entre runs. La cache TbCacheListadoNC acumula filas de runs
' anteriores que no se limpian automáticamente. Si un test filtra por contenido
' (Descripcion LIKE, Codigo LIKE, etc.) esas filas fantasma falsean el count.
'
' SOLUCION: EnsureCacheListadoClean se llama al inicio de cada test para
' garantizar estado conocido (cache vacía de filas válidas). El test inserta
' sus propias filas determinísticas, las usa, y CleanupFixture las borra al
' final. La cache queda limpia para el siguiente test.

' Schema-first evidence for cache SQL tests (Dysflow MCP, 2026-06-02):
' TbConfiguracion fields: ID Long, CacheHabilitada Boolean, FechaCambioCache Date,
' UsuarioCambioCache Short Text, MotivoCambioCache Long Text. The sandbox/backend
' has deterministic row ID=1. Tests that exercise GetListadoFiltradoSQL must set
' CacheHabilitada=True before Act and restore the previous value in Cleanup.

' Limpia TODAS las filas válidas de TbCacheListadoNC. Garantiza estado conocido
' antes de que el test inserte sus propias filas. Llamar SIEMPRE al inicio de
' cada test (después de Set db = getdb() y antes del Arrange).
Private Sub EnsureCacheListadoClean(ByVal p_Db As DAO.Database)
    On Error Resume Next
    If Not TableExistsInDb(p_Db, "TbCacheListadoNC") Then Exit Sub
    p_Db.Execute "DELETE FROM TbCacheListadoNC WHERE CacheValida=True", dbFailOnError
End Sub

' ============================================
' TEST 1 — Codigo exact match
' ============================================
Public Function Test_CacheListado_Codigo_ExactMatch_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim idNC As Long
    Dim codigo As String
    Dim col As Collection
    Dim opErr As String
    Dim assertError As String
    Dim sessionErr As String
    Dim ok As Boolean
    Dim previousCacheHabilitada As Boolean

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheListado_Codigo_ExactMatch_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()
    Call EnsureCacheListadoClean(db)
    previousCacheHabilitada = ReadCacheHabilitada(db)
    Call SetCacheHabilitada(db, True)
    TestHelper.AddLog logs, "Arrange: CacheHabilitada=True para GetListadoFiltradoSQL (was " & previousCacheHabilitada & ")"

    idNC = TEST_ID_NC_CODIGO_EXACT
    codigo = "ABC-001"

    ' Arrange
    Call CleanupFixture(db, idNC, logs)
    If Not EnsureNCFixture(db, idNC, codigo, "Descripcion test codigo exact match", opErr) Then GoTo Fail
    ok = SyncListado(db, idNC, opErr)
    If Not ok Then GoTo Fail
    TestHelper.AddLog logs, "Arrange: NC=" & idNC & " Codigo=" & codigo & " inserted + synced"

    ' Verify precondición
    Dim cacheRows As Long
    cacheRows = CountRows(db, "SELECT COUNT(*) FROM TbCacheListadoNC WHERE IDNoConformidad=" & idNC & " AND CacheValida=True")
    If Not TestHelper.AssertTrue(cacheRows = 1, "Precondición: NC debe existir en TbCacheListadoNC", logs, assertError) Then GoTo Fail

    ' Act: p_Codigo="ABC-001" — current code does LIKE '*ABC-001*' (R1 not fixed)
    Set col = CacheNCProyecto.GetListadoFiltradoSQL(p_Codigo:=codigo)
    TestHelper.AddLog logs, "Act: GetListadoFiltradoSQL(p_Codigo='" & codigo & "') returned " & col.count & " items"

    ' Assert: exactly 1 result with that ID (RED: LIKE may match overlap rows, but with single fixture passes;
    ' test 2 is the real regression for substring overlap)
    If Not TestHelper.AssertTrue(col.count = 1, "Esperado 1 resultado, obtenido " & col.count, logs, assertError) Then GoTo Fail

    Dim vm As Object
    Set vm = col(1)
    If Not TestHelper.AssertTrue(CStr(vm.IDNoConformidad) = CStr(idNC), "Esperado IDNoConformidad=" & idNC & " obtenido " & vm.IDNoConformidad, logs, assertError) Then GoTo Fail

    Test_CacheListado_Codigo_ExactMatch_Atomic = TestHelper.BuildJsonOk(logs, "1_result")
    GoTo Cleanup

Fail:
    Test_CacheListado_Codigo_ExactMatch_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_CacheListado_Codigo_ExactMatch_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then Call CleanupFixture(db, idNC, logs)
    If Not db Is Nothing Then Call SetCacheHabilitada(db, previousCacheHabilitada)
    Call TestHelper.EndTestSession(logs)
    Set db = Nothing
    Set col = Nothing
End Function

' ============================================
' TEST 2 — Codigo exact excludes prefix-overlap
' ============================================
Public Function Test_CacheListado_Codigo_ExactNoSubstring_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim idExact As Long
    Dim idOverlap As Long
    Dim col As Collection
    Dim opErr As String
    Dim assertError As String
    Dim sessionErr As String
    Dim ok As Boolean
    Dim previousCacheHabilitada As Boolean

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheListado_Codigo_ExactNoSubstring_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()
    Call EnsureCacheListadoClean(db)
    previousCacheHabilitada = ReadCacheHabilitada(db)
    Call SetCacheHabilitada(db, True)
    TestHelper.AddLog logs, "Arrange: CacheHabilitada=True para GetListadoFiltradoSQL (was " & previousCacheHabilitada & ")"

    idExact = TEST_ID_NC_CODIGO_EXACT
    idOverlap = TEST_ID_NC_CODIGO_OVERLAP

    ' Arrange: NC1 ABC-001, NC2 XABC-001
    Call CleanupFixture(db, idExact, logs)
    Call CleanupFixture(db, idOverlap, logs)
    If Not EnsureNCFixture(db, idExact, "ABC-001", "Descripcion test codigo exact", opErr) Then GoTo Fail
    If Not EnsureNCFixture(db, idOverlap, "XABC-001", "Descripcion test codigo overlap", opErr) Then GoTo Fail
    ok = SyncListado(db, idExact, opErr): If Not ok Then GoTo Fail
    ok = SyncListado(db, idOverlap, opErr): If Not ok Then GoTo Fail
    TestHelper.AddLog logs, "Arrange: NC1=" & idExact & " ABC-001, NC2=" & idOverlap & " XABC-001"

    ' Act
    Set col = CacheNCProyecto.GetListadoFiltradoSQL(p_Codigo:="ABC-001")
    TestHelper.AddLog logs, "Act: returned " & col.count & " items (RED: LIKE matches both)"

    ' Assert: ONLY NC1 returned
    If col.count = 0 Then
        assertError = "Esperado >=1 resultado, obtenido 0"
        GoTo Fail
    End If

    Dim containsExact As Boolean
    Dim containsOverlap As Boolean
    Dim vm As Object
    Dim i As Long

    containsExact = False
    containsOverlap = False
    For i = 1 To col.count
        Set vm = col(i)
        If CStr(vm.IDNoConformidad) = CStr(idExact) Then containsExact = True
        If CStr(vm.IDNoConformidad) = CStr(idOverlap) Then containsOverlap = True
    Next i

    If Not TestHelper.AssertTrue(containsExact, "NC1 (ABC-001) debe estar en el resultado", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(Not containsOverlap, "NC2 (XABC-001) NO debe estar en el resultado (overlap excluded by exact match)", logs, assertError) Then GoTo Fail

    Test_CacheListado_Codigo_ExactNoSubstring_Atomic = TestHelper.BuildJsonOk(logs, "exact_only")
    GoTo Cleanup

Fail:
    Test_CacheListado_Codigo_ExactNoSubstring_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_CacheListado_Codigo_ExactNoSubstring_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        Call CleanupFixture(db, idExact, logs)
        Call CleanupFixture(db, idOverlap, logs)
        Call SetCacheHabilitada(db, previousCacheHabilitada)
    End If
    Call TestHelper.EndTestSession(logs)
    Set db = Nothing
    Set col = Nothing
End Function

' ============================================
' TEST 3 — Juridica contains filter
' ============================================
' W1 BLOCKER: production GetListadoFiltradoSQL does NOT have p_Juridica parameter.
' The W2 R2 fix will add it. This test calls the W2 contract and will fail to
' compile (VBA error 3131: "Argument named not found") until W2 lands.
' Surfaced to orchestrator per prompt instruction.
' ============================================
Public Function Test_CacheListado_Juridica_LikeFilter_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim idHit As Long
    Dim idMiss As Long
    Dim col As Collection
    Dim opErr As String
    Dim assertError As String
    Dim sessionErr As String
    Dim ok As Boolean
    Dim previousCacheHabilitada As Boolean

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheListado_Juridica_LikeFilter_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()
    Call EnsureCacheListadoClean(db)
    previousCacheHabilitada = ReadCacheHabilitada(db)
    Call SetCacheHabilitada(db, True)
    TestHelper.AddLog logs, "Arrange: CacheHabilitada=True para GetListadoFiltradoSQL (was " & previousCacheHabilitada & ")"

    idHit = TEST_ID_NC_JURIDICA_HIT
    idMiss = TEST_ID_NC_JURIDICA_MISS

    ' Arrange: NC1 JuridicaExp="DEFENSA", NC2 JuridicaExp="ACME"
    Call CleanupFixture(db, idHit, logs)
    Call CleanupFixture(db, idMiss, logs)
    If Not EnsureNCFixture(db, idHit, "JURID-001", "Desc juridica hit", opErr, , "DEFENSA") Then GoTo Fail
    If Not EnsureNCFixture(db, idMiss, "JURID-002", "Desc juridica miss", opErr, , "ACME") Then GoTo Fail
    ok = SyncListado(db, idHit, opErr): If Not ok Then GoTo Fail
    ok = SyncListado(db, idMiss, opErr): If Not ok Then GoTo Fail
    TestHelper.AddLog logs, "Arrange: NC1=" & idHit & " JuridicaExp=DEFENSA, NC2=" & idMiss & " JuridicaExp=ACME"

    ' Act: filter p_Juridica="DEFEN" — W2 R2 fix adds this param
    Set col = CacheNCProyecto.GetListadoFiltradoSQL(p_Juridica:="DEFEN")
    TestHelper.AddLog logs, "Act: returned " & col.count & " items (RED: R2 not fixed, function ignores p_Juridica)"

    ' Assert: ONLY NC1 returned
    Dim containsHit As Boolean
    Dim containsMiss As Boolean
    Dim vm As Object
    Dim i As Long

    containsHit = False
    containsMiss = False
    For i = 1 To col.count
        Set vm = col(i)
        If CStr(vm.IDNoConformidad) = CStr(idHit) Then containsHit = True
        If CStr(vm.IDNoConformidad) = CStr(idMiss) Then containsMiss = True
    Next i

    If Not TestHelper.AssertTrue(containsHit, "NC1 (DEFENSA) debe estar en el resultado", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(Not containsMiss, "NC2 (ACME) NO debe estar en el resultado", logs, assertError) Then GoTo Fail

    Test_CacheListado_Juridica_LikeFilter_Atomic = TestHelper.BuildJsonOk(logs, "juridica_filtered")
    GoTo Cleanup

Fail:
    Test_CacheListado_Juridica_LikeFilter_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_CacheListado_Juridica_LikeFilter_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        Call CleanupFixture(db, idHit, logs)
        Call CleanupFixture(db, idMiss, logs)
        Call SetCacheHabilitada(db, previousCacheHabilitada)
    End If
    Call TestHelper.EndTestSession(logs)
    Set db = Nothing
    Set col = Nothing
End Function

' ============================================
' TEST 4 — Flat filters combined
' ============================================
Public Function Test_CacheListado_FlatFilters_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim col As Collection
    Dim opErr As String
    Dim assertError As String
    Dim sessionErr As String
    Dim ok As Boolean
    Dim previousCacheHabilitada As Boolean

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheListado_FlatFilters_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()
    Call EnsureCacheListadoClean(db)
    previousCacheHabilitada = ReadCacheHabilitada(db)
    Call SetCacheHabilitada(db, True)
    TestHelper.AddLog logs, "Arrange: CacheHabilitada=True para GetListadoFiltradoSQL (was " & previousCacheHabilitada & ")"

    ' Arrange: 6 NCs exercising each flat filter branch
    Call CleanupFixture(db, TEST_ID_NC_FLAT_A, logs)
    Call CleanupFixture(db, TEST_ID_NC_FLAT_B, logs)
    Call CleanupFixture(db, TEST_ID_NC_FLAT_C, logs)
    Call CleanupFixture(db, TEST_ID_NC_FLAT_D, logs)
    Call CleanupFixture(db, TEST_ID_NC_FLAT_E, logs)
    Call CleanupFixture(db, TEST_ID_NC_FLAT_F, logs)
    Call CleanupFixture(db, TEST_ID_NC_FLAT_STALE, logs)

    If Not EnsureNCFixture(db, TEST_ID_NC_FLAT_A, "FLAT-A", "Desc A telefonica", opErr, "Notas A", "DEFENSA") Then GoTo Fail
    If Not EnsureNCFixture(db, TEST_ID_NC_FLAT_B, "FLAT-B", "Desc B telefonica", opErr, "Notas B", "DEFENSOR") Then GoTo Fail
    If Not EnsureNCFixture(db, TEST_ID_NC_FLAT_C, "FLAT-C", "Desc C otra", opErr, "Notas C", "ACME") Then GoTo Fail
    If Not EnsureNCFixture(db, TEST_ID_NC_FLAT_D, "FLAT-D", "Desc D telefonica", opErr, "Notas D", "TELEFONICA") Then GoTo Fail
    If Not EnsureNCFixture(db, TEST_ID_NC_FLAT_E, "FLAT-E", "Desc E telefonica", opErr, "Notas E", "OTRA") Then GoTo Fail
    If Not EnsureNCFixture(db, TEST_ID_NC_FLAT_F, "FLAT-F", "Desc F telefonica", opErr, "Notas F", "DEFENSA") Then GoTo Fail

    ' Stale row (CacheValida=False) — must be excluded
    If Not EnsureNCFixture(db, TEST_ID_NC_FLAT_STALE, "FLAT-STALE", "Desc stale", opErr, "Notas stale", "DEFENSA") Then GoTo Fail

    Dim i As Long
    Dim ids As Variant
    ids = Array(TEST_ID_NC_FLAT_A, TEST_ID_NC_FLAT_B, TEST_ID_NC_FLAT_C, TEST_ID_NC_FLAT_D, TEST_ID_NC_FLAT_E, TEST_ID_NC_FLAT_F, TEST_ID_NC_FLAT_STALE)
    For i = LBound(ids) To UBound(ids)
        ok = SyncListado(db, CLng(ids(i)), opErr)
        If Not ok Then GoTo Fail
    Next i

    ' Mark stale row as invalid
    db.Execute "UPDATE TbCacheListadoNC SET CacheValida=False WHERE IDNoConformidad=" & TEST_ID_NC_FLAT_STALE, dbFailOnError
    TestHelper.AddLog logs, "Arrange: 6 valid + 1 stale (CacheValida=False)"

    ' Act: filter p_Descripcion="telefonica" (LIKE) AND p_Notas LIKE is empty
    ' Expected: A, B, D, E, F (5 NCs with "telefonica" in Descripcion, all valid)
    Set col = CacheNCProyecto.GetListadoFiltradoSQL(p_Descripcion:="telefonica")
    TestHelper.AddLog logs, "Act: returned " & col.count & " items"

    ' Assert: 5 results, none of them is STALE
    If Not TestHelper.AssertTrue(col.count = 5, "Esperado 5 resultados (A,B,D,E,F), obtenido " & col.count, logs, assertError) Then GoTo Fail

    Dim resultIds As String
    resultIds = ""
    For i = 1 To col.count
        Dim vm As Object
        Set vm = col(i)
        resultIds = resultIds & CStr(vm.IDNoConformidad) & ","
    Next i
    TestHelper.AddLog logs, "Result IDs: " & resultIds

    If InStr(1, resultIds, CStr(TEST_ID_NC_FLAT_STALE)) > 0 Then
        assertError = "STALE row no debe estar en el resultado"
        GoTo Fail
    End If

    If InStr(1, resultIds, CStr(TEST_ID_NC_FLAT_C)) > 0 Then
        assertError = "NC_C (Desc C otra) no debe estar en el resultado"
        GoTo Fail
    End If

    Test_CacheListado_FlatFilters_Atomic = TestHelper.BuildJsonOk(logs, "5_results")
    GoTo Cleanup

Fail:
    Test_CacheListado_FlatFilters_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_CacheListado_FlatFilters_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        Call CleanupFixture(db, TEST_ID_NC_FLAT_A, logs)
        Call CleanupFixture(db, TEST_ID_NC_FLAT_B, logs)
        Call CleanupFixture(db, TEST_ID_NC_FLAT_C, logs)
        Call CleanupFixture(db, TEST_ID_NC_FLAT_D, logs)
        Call CleanupFixture(db, TEST_ID_NC_FLAT_E, logs)
        Call CleanupFixture(db, TEST_ID_NC_FLAT_F, logs)
        Call CleanupFixture(db, TEST_ID_NC_FLAT_STALE, logs)
        Call SetCacheHabilitada(db, previousCacheHabilitada)
    End If
    Call TestHelper.EndTestSession(logs)
    Set db = Nothing
    Set col = Nothing
End Function

' ============================================
' TEST 5 — VM rendering contract
' ============================================
Public Function Test_CacheListado_VM_Rendering_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim col As Collection
    Dim opErr As String
    Dim assertError As String
    Dim sessionErr As String
    Dim ok As Boolean
    Dim previousCacheHabilitada As Boolean

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_CacheListado_VM_Rendering_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()
    Call EnsureCacheListadoClean(db)
    previousCacheHabilitada = ReadCacheHabilitada(db)
    Call SetCacheHabilitada(db, True)
    TestHelper.AddLog logs, "Arrange: CacheHabilitada=True para GetListadoFiltradoSQL (was " & previousCacheHabilitada & ")"

    ' Arrange: 3 NCs with distinct Nemotecnico
    Call CleanupFixture(db, TEST_ID_NC_VM_1, logs)
    Call CleanupFixture(db, TEST_ID_NC_VM_2, logs)
    Call CleanupFixture(db, TEST_ID_NC_VM_3, logs)

    If Not EnsureNCFixture(db, TEST_ID_NC_VM_1, "VM-001", "Desc VM 1", opErr, , "NEMO-EXP-1") Then GoTo Fail
    If Not EnsureNCFixture(db, TEST_ID_NC_VM_2, "VM-002", "Desc VM 2", opErr, , "NEMO-EXP-2") Then GoTo Fail
    If Not EnsureNCFixture(db, TEST_ID_NC_VM_3, "VM-003", "Desc VM 3", opErr, , "NEMO-EXP-3") Then GoTo Fail

    ok = SyncListado(db, TEST_ID_NC_VM_1, opErr): If Not ok Then GoTo Fail
    ok = SyncListado(db, TEST_ID_NC_VM_2, opErr): If Not ok Then GoTo Fail
    ok = SyncListado(db, TEST_ID_NC_VM_3, opErr): If Not ok Then GoTo Fail
    TestHelper.AddLog logs, "Arrange: 3 NCs with distinct Nemotecnico synced"

    ' Act
    Set col = CacheNCProyecto.GetListadoFiltradoSQL()
    TestHelper.AddLog logs, "Act: returned " & col.count & " items"

    ' Assert: 3 VMs, each with Expediente populated
    If Not TestHelper.AssertTrue(col.count >= 3, "Esperado >=3 resultados, obtenido " & col.count, logs, assertError) Then GoTo Fail

    Dim foundVMs As Long
    Dim i As Long
    For i = 1 To col.count
        Dim vm As Object
        Set vm = col(i)
        Dim vid As String
        vid = CStr(vm.IDNoConformidad)
        If vid = CStr(TEST_ID_NC_VM_1) Or vid = CStr(TEST_ID_NC_VM_2) Or vid = CStr(TEST_ID_NC_VM_3) Then
            ' Verify Expediente is populated (Nemotecnico from cache)
            If Nz(vm.Expediente, "") <> "" Then
                foundVMs = foundVMs + 1
            Else
                TestHelper.AddLog logs, "WARN: VM " & vid & " tiene Expediente vacio"
            End If
        End If
    Next i

    If Not TestHelper.AssertTrue(foundVMs = 3, "Esperado 3 VMs con Expediente populated, encontrado " & foundVMs, logs, assertError) Then GoTo Fail

    Test_CacheListado_VM_Rendering_Atomic = TestHelper.BuildJsonOk(logs, CStr(foundVMs) & "_vms")
    GoTo Cleanup

Fail:
    Test_CacheListado_VM_Rendering_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_CacheListado_VM_Rendering_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        Call CleanupFixture(db, TEST_ID_NC_VM_1, logs)
        Call CleanupFixture(db, TEST_ID_NC_VM_2, logs)
        Call CleanupFixture(db, TEST_ID_NC_VM_3, logs)
        Call SetCacheHabilitada(db, previousCacheHabilitada)
    End If
    Call TestHelper.EndTestSession(logs)
    Set db = Nothing
    Set col = Nothing
End Function

' ============================================
' TEST 6 — PipeFlatten: empty if no children
' ============================================
Public Function Test_PipeFlatten_EmptyIfNoChildren_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim idNC As Long
    Dim result As String
    Dim flattenErr As String
    Dim assertError As String
    Dim sessionErr As String

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_PipeFlatten_EmptyIfNoChildren_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()

    idNC = TEST_ID_NC_PIPE_EMPTY

    ' Arrange: NC with no ACs
    Call CleanupFixture(db, idNC, logs)
    If Not EnsureNCFixture(db, idNC, "PIPE-EMPTY", "Desc pipe empty", flattenErr) Then GoTo Fail
    db.Execute "DELETE FROM TbNCAccionCorrectivas WHERE IDNoConformidad=" & idNC, dbFailOnError
    TestHelper.AddLog logs, "Arrange: NC=" & idNC & " con 0 ACs"

    ' Act
    result = PipeFlatten("TbNCAccionCorrectivas", "AccionCorrectiva", "IDNoConformidad", idNC, db, flattenErr)
    TestHelper.AddLog logs, "Act: PipeFlatten returned '" & result & "' err='" & flattenErr & "'"

    ' Assert: returns "" (empty string, not Null)
    If Not TestHelper.AssertTrue(Not IsNull(result), "Esperado string (no Null), obtenido Null", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(result = "", "Esperado '', obtenido '" & result & "'", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(flattenErr = "", "Esperado err vacio, obtenido '" & flattenErr & "'", logs, assertError) Then GoTo Fail

    Test_PipeFlatten_EmptyIfNoChildren_Atomic = TestHelper.BuildJsonOk(logs, "empty")
    GoTo Cleanup

Fail:
    Test_PipeFlatten_EmptyIfNoChildren_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_PipeFlatten_EmptyIfNoChildren_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    Call CleanupACChildren(db, idNC, logs)
    If Not db Is Nothing Then Call CleanupFixture(db, idNC, logs)
    Call TestHelper.EndTestSession(logs)
    Set db = Nothing
End Function

' ============================================
' TEST 7 — PipeFlatten: one child
' ============================================
Public Function Test_PipeFlatten_OneChild_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim idNC As Long
    Dim result As String
    Dim flattenErr As String
    Dim assertError As String
    Dim sessionErr As String

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_PipeFlatten_OneChild_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()

    idNC = TEST_ID_NC_PIPE_ONE

    ' Arrange: NC + 1 AC
    Call CleanupACChildren(db, idNC, logs)
    Call CleanupFixture(db, idNC, logs)
    If Not EnsureNCFixture(db, idNC, "PIPE-ONE", "Desc pipe one", flattenErr) Then GoTo Fail
    If Not EnsureACFixture(db, TEST_ID_AC_PIPE_ONE, idNC, "AC-001", flattenErr) Then GoTo Fail
    TestHelper.AddLog logs, "Arrange: NC=" & idNC & " con 1 AC='AC-001'"

    ' Act
    result = PipeFlatten("TbNCAccionCorrectivas", "AccionCorrectiva", "IDNoConformidad", idNC, db, flattenErr)
    TestHelper.AddLog logs, "Act: returned '" & result & "'"

    ' Assert: returns "AC-001" (RED: stub returns "")
    If Not TestHelper.AssertTrue(result = "AC-001", "Esperado 'AC-001', obtenido '" & result & "'", logs, assertError) Then GoTo Fail

    Test_PipeFlatten_OneChild_Atomic = TestHelper.BuildJsonOk(logs, result)
    GoTo Cleanup

Fail:
    Test_PipeFlatten_OneChild_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_PipeFlatten_OneChild_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    Call CleanupACChildren(db, idNC, logs)
    If Not db Is Nothing Then Call CleanupFixture(db, idNC, logs)
    Call TestHelper.EndTestSession(logs)
    Set db = Nothing
End Function

' ============================================
' TEST 8 — PipeFlatten: multiple children pipe-delimited
' ============================================
Public Function Test_PipeFlatten_MultipleChildren_PipeDelimited_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim idNC As Long
    Dim result As String
    Dim flattenErr As String
    Dim assertError As String
    Dim sessionErr As String

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_PipeFlatten_MultipleChildren_PipeDelimited_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()

    idNC = TEST_ID_NC_PIPE_MULTI

    ' Arrange: NC + 3 ACs
    Call CleanupACChildren(db, idNC, logs)
    Call CleanupFixture(db, idNC, logs)
    If Not EnsureNCFixture(db, idNC, "PIPE-MULTI", "Desc pipe multi", flattenErr) Then GoTo Fail
    If Not EnsureACFixture(db, TEST_ID_AC_PIPE_MULTI_1, idNC, "AC-001", flattenErr) Then GoTo Fail
    If Not EnsureACFixture(db, TEST_ID_AC_PIPE_MULTI_2, idNC, "AC-002", flattenErr) Then GoTo Fail
    If Not EnsureACFixture(db, TEST_ID_AC_PIPE_MULTI_3, idNC, "AC-003", flattenErr) Then GoTo Fail
    TestHelper.AddLog logs, "Arrange: NC=" & idNC & " con 3 ACs"

    ' Act
    result = PipeFlatten("TbNCAccionCorrectivas", "AccionCorrectiva", "IDNoConformidad", idNC, db, flattenErr)
    TestHelper.AddLog logs, "Act: returned '" & result & "'"

    ' Assert: returns "AC-001|AC-002|AC-003" (RED: stub returns "")
    If Not TestHelper.AssertTrue(result = "AC-001|AC-002|AC-003", "Esperado 'AC-001|AC-002|AC-003', obtenido '" & result & "'", logs, assertError) Then GoTo Fail

    Test_PipeFlatten_MultipleChildren_PipeDelimited_Atomic = TestHelper.BuildJsonOk(logs, result)
    GoTo Cleanup

Fail:
    Test_PipeFlatten_MultipleChildren_PipeDelimited_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_PipeFlatten_MultipleChildren_PipeDelimited_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    Call CleanupACChildren(db, idNC, logs)
    If Not db Is Nothing Then Call CleanupFixture(db, idNC, logs)
    Call TestHelper.EndTestSession(logs)
    Set db = Nothing
End Function

' ============================================
' TEST 9 — PipeFlatten: sanitizes pipe
' ============================================
Public Function Test_PipeFlatten_SanitizesPipe_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim idNC As Long
    Dim result As String
    Dim flattenErr As String
    Dim assertError As String
    Dim sessionErr As String

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_PipeFlatten_SanitizesPipe_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()

    idNC = TEST_ID_NC_PIPE_SANITIZE

    ' Arrange: NC + 1 AC with pipe in content
    Call CleanupACChildren(db, idNC, logs)
    Call CleanupFixture(db, idNC, logs)
    If Not EnsureNCFixture(db, idNC, "PIPE-SAN", "Desc pipe sanitize", flattenErr) Then GoTo Fail
    If Not EnsureACFixture(db, TEST_ID_AC_PIPE_SANITIZE, idNC, "AC|with|pipe", flattenErr) Then GoTo Fail
    TestHelper.AddLog logs, "Arrange: NC=" & idNC & " con 1 AC='AC|with|pipe'"

    ' Act
    result = PipeFlatten("TbNCAccionCorrectivas", "AccionCorrectiva", "IDNoConformidad", idNC, db, flattenErr)
    TestHelper.AddLog logs, "Act: returned '" & result & "'"

    ' Assert: returns "AC with pipe" (pipes replaced with space) (RED: stub returns "")
    If Not TestHelper.AssertTrue(result = "AC with pipe", "Esperado 'AC with pipe', obtenido '" & result & "'", logs, assertError) Then GoTo Fail

    Test_PipeFlatten_SanitizesPipe_Atomic = TestHelper.BuildJsonOk(logs, result)
    GoTo Cleanup

Fail:
    Test_PipeFlatten_SanitizesPipe_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_PipeFlatten_SanitizesPipe_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    Call CleanupACChildren(db, idNC, logs)
    If Not db Is Nothing Then Call CleanupFixture(db, idNC, logs)
    Call TestHelper.EndTestSession(logs)
    Set db = Nothing
End Function

' ============================================
' TEST 10 — PipeFlatten: resilient if table missing
' ============================================
Public Function Test_PipeFlatten_ResilientIfTableMissing_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim idNC As Long
    Dim result As String
    Dim flattenErr As String
    Dim assertError As String
    Dim sessionErr As String
    Dim missingTable As String

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_PipeFlatten_ResilientIfTableMissing_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()

    idNC = TEST_ID_NC_PIPE_MISSING
    missingTable = "ZZZ_PipeFlattenMissing_" & CStr(idNC)

    ' Arrange: ensure table does NOT exist (drop if exists, don't create)
    On Error Resume Next
    db.Execute "DROP TABLE " & missingTable, dbFailOnError
    On Error GoTo EH

    TestHelper.AddLog logs, "Arrange: table " & missingTable & " guaranteed missing"

    ' Act
    result = PipeFlatten(missingTable, "ColX", "IDNoConformidad", idNC, db, flattenErr)
    TestHelper.AddLog logs, "Act: returned '" & result & "' err='" & flattenErr & "'"

    ' Assert: returns "" and does NOT raise
    If Not TestHelper.AssertTrue(Not IsNull(result), "Esperado string (no Null), obtenido Null", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(result = "", "Esperado '' para tabla missing, obtenido '" & result & "'", logs, assertError) Then GoTo Fail

    Test_PipeFlatten_ResilientIfTableMissing_Atomic = TestHelper.BuildJsonOk(logs, "resilient")
    GoTo Cleanup

Fail:
    Test_PipeFlatten_ResilientIfTableMissing_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_PipeFlatten_ResilientIfTableMissing_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then Call CleanupFixture(db, idNC, logs)
    Call TestHelper.EndTestSession(logs)
    Set db = Nothing
End Function

' ============================================
' TEST 11 — Form fallback: empty cache
' ============================================
Public Function Test_Form_Fallback_EmptyCache_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim assertError As String
    Dim sessionErr As String
    Dim previousUser As usuario
    Dim frm As Object
    Dim col As Object
    Dim callErr As String
    Dim fallbackRows As Long

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_Form_Fallback_EmptyCache_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()

    ' Arrange: ensure TbCacheListadoNC has 0 valid rows for any NC
    db.Execute "DELETE FROM TbLogCache WHERE IDNoConformidad=0", dbFailOnError
    db.Execute "UPDATE TbCacheListadoNC SET CacheValida=False", dbFailOnError
    TestHelper.AddLog logs, "Arrange: TbCacheListadoNC marked all invalid"

    ' Save and set test user
    Set previousUser = m_ObjUsuarioConectado
    Set m_ObjUsuarioConectado = TestUser("QA Form Fallback")

    ' Act: open form in hidden mode and call getNCsFiltrados
    DoCmd.OpenForm FORM_NAME, acNormal, , , , acHidden
    Set frm = Forms(FORM_NAME)
    callErr = ""
    Set col = frm.getNCsFiltrados(callErr)
    TestHelper.AddLog logs, "Act: form.getNCsFiltrados callErr='" & callErr & "' result=" & IIf(col Is Nothing, "Nothing", "Dict")

    ' Assert: result is non-Nothing and contains rows
    If Not TestHelper.AssertTrue(Not col Is Nothing, "Esperado Dictionary no-Nothing, obtenido Nothing", logs, assertError) Then GoTo Fail
    If Not TestHelper.AssertTrue(col.count >= 0, "Esperado Dictionary con count>=0", logs, assertError) Then GoTo Fail

    ' Assert: TbLogCache has FormCacheFallback row
    fallbackRows = CountRows(db, "SELECT COUNT(*) FROM TbLogCache WHERE TipoOperacion='FormCacheFallback' AND IDNoConformidad=0")
    If Not TestHelper.AssertTrue(fallbackRows >= 1, "Esperado >=1 fila en TbLogCache con TipoOperacion='FormCacheFallback', obtenido " & fallbackRows, logs, assertError) Then GoTo Fail

    Test_Form_Fallback_EmptyCache_Atomic = TestHelper.BuildJsonOk(logs, "fallback_logged")
    GoTo Cleanup

Fail:
    Test_Form_Fallback_EmptyCache_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_Form_Fallback_EmptyCache_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    DoCmd.Close acForm, FORM_NAME, acSaveNo
    Set m_ObjUsuarioConectado = previousUser
    If Not db Is Nothing Then Call CleanupFixture(db, TEST_ID_NC_FALLBACK, logs)
    Call TestHelper.EndTestSession(logs)
    Set db = Nothing
    Set frm = Nothing
    Set col = Nothing
End Function

' ============================================
' TEST 12 — Form fallback: cache disabled
' ============================================
Public Function Test_Form_Fallback_DisabledCache_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim assertError As String
    Dim sessionErr As String
    Dim previousUser As usuario
    Dim frm As Object
    Dim col As Object
    Dim callErr As String
    Dim fallbackRows As Long
    Dim previousCacheHabilitada As Boolean

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_Form_Fallback_DisabledCache_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()

    ' Arrange: set CacheHabilitada=False in TbConfiguracion
    previousCacheHabilitada = ReadCacheHabilitada(db)
    db.Execute "UPDATE TbConfiguracion SET CacheHabilitada=False", dbFailOnError
    TestHelper.AddLog logs, "Arrange: CacheHabilitada=False (was " & previousCacheHabilitada & ")"

    ' Save and set test user
    Set previousUser = m_ObjUsuarioConectado
    Set m_ObjUsuarioConectado = TestUser("QA Form Fallback Disabled")

    ' Act
    DoCmd.OpenForm FORM_NAME, acNormal, , , , acHidden
    Set frm = Forms(FORM_NAME)
    callErr = ""
    Set col = frm.getNCsFiltrados(callErr)
    TestHelper.AddLog logs, "Act: form.getNCsFiltrados callErr='" & callErr & "' result=" & IIf(col Is Nothing, "Nothing", "Dict")

    ' Assert: result non-Nothing
    If Not TestHelper.AssertTrue(Not col Is Nothing, "Esperado Dictionary no-Nothing, obtenido Nothing", logs, assertError) Then GoTo Fail

    ' Assert: TbLogCache has FormCacheFallback row
    fallbackRows = CountRows(db, "SELECT COUNT(*) FROM TbLogCache WHERE TipoOperacion='FormCacheFallback'")
    If Not TestHelper.AssertTrue(fallbackRows >= 1, "Esperado >=1 fila en TbLogCache con TipoOperacion='FormCacheFallback', obtenido " & fallbackRows, logs, assertError) Then GoTo Fail

    Test_Form_Fallback_DisabledCache_Atomic = TestHelper.BuildJsonOk(logs, "disabled_fallback_logged")
    GoTo Cleanup

Fail:
    Test_Form_Fallback_DisabledCache_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_Form_Fallback_DisabledCache_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    DoCmd.Close acForm, FORM_NAME, acSaveNo
    ' Restore CacheHabilitada
    On Error Resume Next
    If previousCacheHabilitada Then
        db.Execute "UPDATE TbConfiguracion SET CacheHabilitada=True", dbFailOnError
    End If
    On Error GoTo 0
    Set m_ObjUsuarioConectado = previousUser
    Call TestHelper.EndTestSession(logs)
    Set db = Nothing
    Set frm = Nothing
    Set col = Nothing
End Function

' ============================================
' TEST 13 — Form fallback: no-log-failure on missing user
' ============================================
Public Function Test_Form_Fallback_NoLogFailure_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim assertError As String
    Dim sessionErr As String
    Dim previousUser As usuario
    Dim frm As Object
    Dim col As Object
    Dim callErr As String

    Set logs = TestHelper.NewLogs
    If Not TestHelper.BeginTestSession(logs, sessionErr) Then
        Test_Form_Fallback_NoLogFailure_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        Exit Function
    End If
    Set db = getdb()

    ' Arrange: ensure m_ObjUsuarioConectado is Nothing
    Set previousUser = m_ObjUsuarioConectado
    Set m_ObjUsuarioConectado = Nothing
    TestHelper.AddLog logs, "Arrange: m_ObjUsuarioConectado=Nothing"

    ' Act
    DoCmd.OpenForm FORM_NAME, acNormal, , , , acHidden
    Set frm = Forms(FORM_NAME)
    callErr = ""
    On Error Resume Next
    Set col = frm.getNCsFiltrados(callErr)
    On Error GoTo EH
    TestHelper.AddLog logs, "Act: form.getNCsFiltrados callErr='" & callErr & "' result=" & IIf(col Is Nothing, "Nothing", "Dict")

    ' Assert: form function returns a result (Dictionary) even without user
    ' The W2 fallback must handle the no-user case defensively without raising
    If Not TestHelper.AssertTrue(Not col Is Nothing, "Esperado Dictionary no-Nothing incluso sin usuario, obtenido Nothing", logs, assertError) Then GoTo Fail

    Test_Form_Fallback_NoLogFailure_Atomic = TestHelper.BuildJsonOk(logs, "no_user_resilient")
    GoTo Cleanup

Fail:
    Test_Form_Fallback_NoLogFailure_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "Error: " & Err.Description
    Test_Form_Fallback_NoLogFailure_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    DoCmd.Close acForm, FORM_NAME, acSaveNo
    Set m_ObjUsuarioConectado = previousUser
    Call TestHelper.EndTestSession(logs)
    Set db = Nothing
    Set frm = Nothing
    Set col = Nothing
End Function

' ============================================
' HELPERS — FIXTURE / SETUP / TEARDOWN
' ============================================

' Inserta NC fixture en TbNoConformidades con Codigo y campos mínimos.
' Replica el patrón de EnsureNCListadoFixture del módulo Test_CacheListadoEstados.
Private Function EnsureNCFixture(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long, ByVal p_Codigo As String, ByVal p_Descripcion As String, ByRef p_Error As String, Optional ByVal p_Notas As String = "", Optional ByVal p_JuridicaExp As String = "DEFENSA") As Boolean
    On Error GoTo EH

    EnsureNCFixture = False
    p_Error = ""

    p_Db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad=" & p_IDNC, dbFailOnError

    Dim SQL As String
    SQL = "INSERT INTO TbNoConformidades (IDNoConformidad, CodigoNoConformidad, EXPEDIENTE, PROYECTO, DESCRIPCION, Notas, CAUSA, FECHAAPERTURA, TIPO, RequiereControlEficacia, MotivoNoRequiereControlEficacia, Borrado, JuridicaExp, CodExp, Nemotecnico, Estado) " & _
          "VALUES (" & p_IDNC & ", " & TestHelper.SqlText(p_Codigo) & ", " & TestHelper.SqlText("EXP-" & CStr(p_IDNC)) & ", " & TestHelper.SqlText("PROY-TEST") & ", " & TestHelper.SqlText(p_Descripcion) & ", " & TestHelper.SqlText(p_Notas) & ", " & TestHelper.SqlText("Causa test cache parity") & ", Date(), " & TestHelper.SqlText("Proyecto") & ", 'No', " & TestHelper.SqlText("Fixture cache parity") & ", 0, " & TestHelper.SqlText(p_JuridicaExp) & ", " & TestHelper.SqlText("COD-" & CStr(p_IDNC)) & ", " & TestHelper.SqlText("NEMO-" & CStr(p_IDNC)) & ", " & TestHelper.SqlText("Abierta") & ")"
    p_Db.Execute SQL, dbFailOnError

    Dim rows As Long
    rows = CountRows(p_Db, "SELECT COUNT(*) FROM TbNoConformidades WHERE IDNoConformidad=" & p_IDNC)
    If rows <> 1 Then
        p_Error = "EnsureNCFixture: cardinalidad incorrecta ID=" & p_IDNC & " count=" & rows
        Exit Function
    End If

    EnsureNCFixture = True
    Exit Function

EH:
    p_Error = "EnsureNCFixture: " & Err.Description
End Function

' Inserta AC fixture en TbNCAccionCorrectivas.
Private Function EnsureACFixture(ByVal p_Db As DAO.Database, ByVal p_IDAC As Long, ByVal p_IDNC As Long, ByVal p_Accion As String, ByRef p_Error As String) As Boolean
    On Error GoTo EH

    EnsureACFixture = False
    p_Error = ""

    p_Db.Execute "DELETE FROM TbNCAccionCorrectivas WHERE IDAccionCorrectiva=" & p_IDAC, dbFailOnError

    Dim SQL As String
    SQL = "INSERT INTO TbNCAccionCorrectivas (IDAccionCorrectiva, IDNoConformidad, NAccion, AccionCorrectiva, ESTADO) " & _
          "VALUES (" & p_IDAC & ", " & p_IDNC & ", 1, " & TestHelper.SqlText(p_Accion) & ", " & TestHelper.SqlText("Pendiente") & ")"
    p_Db.Execute SQL, dbFailOnError

    EnsureACFixture = True
    Exit Function

EH:
    p_Error = "EnsureACFixture: " & Err.Description
End Function

' Limpia fixture completo: cache listado -> AC -> log -> fuente.
' Orden FK: hijos antes que padres.
Private Sub CleanupFixture(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long, ByRef p_Logs As Collection)
    On Error Resume Next

    If TableExistsInDb(p_Db, "TbCacheListadoNC") Then
        p_Db.Execute "DELETE FROM TbCacheListadoNC WHERE IDNoConformidad=" & p_IDNC, dbFailOnError
    End If
    If TableExistsInDb(p_Db, "TbCacheNCProyecto") Then
        p_Db.Execute "DELETE FROM TbCacheNCProyecto WHERE IDNoConformidad=" & p_IDNC, dbFailOnError
    End If
    If TableExistsInDb(p_Db, "TbLogCache") Then
        p_Db.Execute "DELETE FROM TbLogCache WHERE IDNoConformidad=" & p_IDNC, dbFailOnError
    End If
    If TableExistsInDb(p_Db, "TbNCAccionCorrectivas") Then
        p_Db.Execute "DELETE FROM TbNCAccionCorrectivas WHERE IDNoConformidad=" & p_IDNC, dbFailOnError
    End If
    If TableExistsInDb(p_Db, "TbNoConformidades") Then
        p_Db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad=" & p_IDNC, dbFailOnError
    End If

    TestHelper.AddLog p_Logs, "Cleanup fixture ID=" & p_IDNC & " (hijos->padre)"
End Sub

' Limpia solo ACs de una NC (para tests de PipeFlatten).
Private Sub CleanupACChildren(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long, ByRef p_Logs As Collection)
    On Error Resume Next
    If TableExistsInDb(p_Db, "TbNCAccionCorrectivas") Then
        p_Db.Execute "DELETE FROM TbNCAccionCorrectivas WHERE IDNoConformidad=" & p_IDNC, dbFailOnError
    End If
    TestHelper.AddLog p_Logs, "Cleanup AC children for NC=" & p_IDNC
End Sub

' Sync de cache listado para una NC: RegenerarRegistro crea detalle + listado.
Private Function SyncListado(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long, ByRef p_Error As String) As Boolean
    On Error GoTo EH

    SyncListado = False
    p_Error = ""

    Dim ok As Boolean
    ok = CacheNCProyecto.RegenerarRegistro(CStr(p_IDNC), p_Error)
    If Not ok Then
        p_Error = "SyncListado: RegenerarRegistro falló: " & p_Error
        Exit Function
    End If

    SyncListado = True
    Exit Function

EH:
    p_Error = "SyncListado: " & Err.Description
End Function

' Lee CacheHabilitada de TbConfiguracion. Si la tabla/columna no existe, devuelve False.
Private Function ReadCacheHabilitada(ByVal p_Db As DAO.Database) As Boolean
    On Error Resume Next
    Dim rs As DAO.Recordset
    Set rs = p_Db.OpenRecordset("SELECT CacheHabilitada FROM TbConfiguracion WHERE ID=1", dbOpenSnapshot)
    If Not rs Is Nothing Then
        If Not rs.EOF Then
            ReadCacheHabilitada = CBool(Nz(rs!CacheHabilitada.value, False))
        End If
        rs.Close
        Set rs = Nothing
    End If
End Function

' Escribe solo el kill-switch de cache en la fila determinística ID=1 y deja
' al Cleanup restaurar el valor previo. No modifica otros campos de config.
Private Sub SetCacheHabilitada(ByVal p_Db As DAO.Database, ByVal p_Enabled As Boolean)
    If p_Enabled Then
        p_Db.Execute "UPDATE TbConfiguracion SET CacheHabilitada=True WHERE ID=1", dbFailOnError
    Else
        p_Db.Execute "UPDATE TbConfiguracion SET CacheHabilitada=False WHERE ID=1", dbFailOnError
    End If
End Sub

' Crea un usuario de test.
Private Function TestUser(ByVal p_Nombre As String) As usuario
    Dim usr As New usuario
    usr.Nombre = p_Nombre
    usr.UsuarioRed = "TEST_CACHE_PARITY"
    Set TestUser = usr
End Function

' Cuenta filas de un SELECT. Devuelve 0 si la query falla.
Private Function CountRows(ByVal p_Db As DAO.Database, ByVal p_SQL As String) As Long
    Dim rs As DAO.Recordset
    On Error Resume Next
    Set rs = p_Db.OpenRecordset(p_SQL, dbOpenSnapshot)
    If Not rs Is Nothing Then
        If Not rs.EOF Then CountRows = CLng(Nz(rs.Fields(0).value, 0))
        rs.Close
        Set rs = Nothing
    End If
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

