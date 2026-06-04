Attribute VB_Name = "Test_EstadoCatalogoBootstrap"
Option Compare Database
Option Explicit

' Strict-TDD RED suite for SDD change estado-cache-bootstrap / GitHub issue #47.
' These tests intentionally call the not-yet-implemented bootstrap contract via
' Application.Run/CallByName so the module compiles before GREEN implementation.

Private Const CATALOG_TABLE As String = "TbEstadoCatalogo"
Private Const TEST_ID_NC_BOOTSTRAP As Long = 900470
Private Const EXPECTED_VERSION As Long = 1

Public Function Test_EstadoCatalogo_SchemaCreation_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim sessionErr As String
    Dim opErr As String
    Dim assertError As String
    Dim ok As Boolean

    Set logs = TestHelper.NewLogs
    If Not BeginCatalogoSession(logs, db, sessionErr) Then
        Test_EstadoCatalogo_SchemaCreation_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        GoTo Cleanup
    End If

    DropCatalogTableIfExists db, logs
    TestHelper.AddLog logs, "Arrange: sandbox without TbEstadoCatalogo; required schema recorded in SDD task 1.1"

    ok = CBool(Application.Run("EnsureEstadoCatalogoSchema", db, opErr))
    Call TestHelper.AssertTrue(ok, "EnsureEstadoCatalogoSchema must return True", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(opErr = "", "EnsureEstadoCatalogoSchema must not return error: " & opErr, logs, assertError)
    If assertError <> "" Then GoTo Fail

    If Not AssertCatalogSchema(db, logs, assertError) Then GoTo Fail
    Test_EstadoCatalogo_SchemaCreation_Atomic = TestHelper.BuildJsonOk(logs, "schema_ok")
    GoTo Cleanup

Fail:
    Test_EstadoCatalogo_SchemaCreation_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "RED expected until production contract exists: " & Err.Description
    Test_EstadoCatalogo_SchemaCreation_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then DropCatalogTableIfExists db, logs
    TestHelper.EndTestSession logs
    Set db = Nothing
End Function

Public Function Test_EstadoCatalogo_ProductionGuard_BlocksUnsafe_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim previousBackendActivo As Variant
    Dim previousBackendPath As Variant
    Dim opErr As String
    Dim assertError As String
    Dim ok As Boolean

    Set logs = TestHelper.NewLogs
    CaptureTempVar "BackendActivo", previousBackendActivo
    CaptureTempVar "BackendPathConfigurado", previousBackendPath

    TestHelper.ResetTestSession opErr
    Application.TempVars("BackendActivo") = "PROD"
    Application.TempVars("BackendPathConfigurado") = "\\datoste\NoConformidades\NoConformidades_Datos.accdb"
    TestHelper.AddLog logs, "Arrange: production-like TempVars configured; no sandbox session active"

    ok = CBool(Application.Run("AssertEstadoBootstrapEnvironment", opErr))
    Call TestHelper.AssertTrue(Not ok, "AssertEstadoBootstrapEnvironment must block production-like target", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(InStr(1, opErr, "prod", vbTextCompare) > 0 Or InStr(1, opErr, "unsafe", vbTextCompare) > 0 Or InStr(1, opErr, "UNC", vbTextCompare) > 0, "Guard error must identify unsafe backend reason: " & opErr, logs, assertError)
    If assertError <> "" Then GoTo Fail

    Test_EstadoCatalogo_ProductionGuard_BlocksUnsafe_Atomic = TestHelper.BuildJsonOk(logs, opErr)
    GoTo Cleanup

Fail:
    Test_EstadoCatalogo_ProductionGuard_BlocksUnsafe_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "RED expected until production guard exists: " & Err.Description
    Test_EstadoCatalogo_ProductionGuard_BlocksUnsafe_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    RestoreTempVar "BackendActivo", previousBackendActivo
    RestoreTempVar "BackendPathConfigurado", previousBackendPath
    TestHelper.ResetTestSession opErr
End Function

Public Function Test_EstadoCatalogo_IdempotentDoubleRun_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim sessionErr As String
    Dim opErr As String
    Dim assertError As String
    Dim firstOk As Boolean
    Dim secondOk As Boolean

    Set logs = TestHelper.NewLogs
    If Not BeginCatalogoSession(logs, db, sessionErr) Then
        Test_EstadoCatalogo_IdempotentDoubleRun_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        GoTo Cleanup
    End If

    DropCatalogTableIfExists db, logs
    firstOk = CBool(Application.Run("BootstrapEstadoCatalogo", opErr))
    Call TestHelper.AssertTrue(firstOk, "First BootstrapEstadoCatalogo run must pass", logs, assertError)
    If assertError <> "" Then GoTo Fail

    opErr = ""
    secondOk = CBool(Application.Run("BootstrapEstadoCatalogo", opErr))
    Call TestHelper.AssertTrue(secondOk, "Second BootstrapEstadoCatalogo run must pass", logs, assertError)
    If assertError <> "" Then GoTo Fail
    If Not AssertExpectedCardinality(db, logs, assertError) Then GoTo Fail
    If Not AssertNoDuplicateStableCodes(db, logs, assertError) Then GoTo Fail

    Test_EstadoCatalogo_IdempotentDoubleRun_Atomic = TestHelper.BuildJsonOk(logs, "idempotent_ok")
    GoTo Cleanup

Fail:
    Test_EstadoCatalogo_IdempotentDoubleRun_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "RED expected until bootstrap exists: " & Err.Description
    Test_EstadoCatalogo_IdempotentDoubleRun_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then DropCatalogTableIfExists db, logs
    TestHelper.EndTestSession logs
    Set db = Nothing
End Function

Public Function Test_EstadoCatalogo_ParityExpectedCodes_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim sessionErr As String
    Dim opErr As String
    Dim assertError As String
    Dim ok As Boolean

    Set logs = TestHelper.NewLogs
    If Not BeginCatalogoSession(logs, db, sessionErr) Then
        Test_EstadoCatalogo_ParityExpectedCodes_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        GoTo Cleanup
    End If

    DropCatalogTableIfExists db, logs
    ok = CBool(Application.Run("BootstrapEstadoCatalogo", opErr))
    Call TestHelper.AssertTrue(ok, "BootstrapEstadoCatalogo must create expected rows", logs, assertError)
    If assertError <> "" Then GoTo Fail
    If Not AssertExpectedCardinality(db, logs, assertError) Then GoTo Fail
    If Not AssertExpectedCodes(db, logs, assertError) Then GoTo Fail

    Test_EstadoCatalogo_ParityExpectedCodes_Atomic = TestHelper.BuildJsonOk(logs, "parity_ok")
    GoTo Cleanup

Fail:
    Test_EstadoCatalogo_ParityExpectedCodes_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "RED expected until parity implementation exists: " & Err.Description
    Test_EstadoCatalogo_ParityExpectedCodes_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then DropCatalogTableIfExists db, logs
    TestHelper.EndTestSession logs
    Set db = Nothing
End Function

Public Function Test_EstadoCatalogo_DictionaryReload_FromFixture_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim sessionErr As String
    Dim opErr As String
    Dim assertError As String
    Dim reloadOk As Boolean

    Set logs = TestHelper.NewLogs
    If Not BeginCatalogoSession(logs, db, sessionErr) Then
        Test_EstadoCatalogo_DictionaryReload_FromFixture_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        GoTo Cleanup
    End If

    RecreateCatalogFixture db, logs
    If m_ObjEntorno Is Nothing Then Set m_ObjEntorno = New Entorno
    reloadOk = CBool(CallByName(m_ObjEntorno, "ReloadEstadoDictionariesFromCatalogo", VbMethod, opErr))
    Call TestHelper.AssertTrue(reloadOk, "Entorno.ReloadEstadoDictionariesFromCatalogo must return True", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Call TestHelper.AssertTrue(m_ObjEntorno.ColEstadosNC.Count = 10, "NC dictionary must contain 10 catalogue rows", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(m_ObjEntorno.ColEstadosAC.Count = 6, "AC dictionary must contain 6 catalogue rows", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(m_ObjEntorno.ColEstadosAR.Count = 5, "AR dictionary must contain 5 catalogue rows", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(m_ObjEntorno.ColEstadosNC(CStr(4)) = "ENEJECUCION", "NC id-to-code dictionary must come from catalogue", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Test_EstadoCatalogo_DictionaryReload_FromFixture_Atomic = TestHelper.BuildJsonOk(logs, "dictionary_ok")
    GoTo Cleanup

Fail:
    Test_EstadoCatalogo_DictionaryReload_FromFixture_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "RED expected until Entorno reload exists: " & Err.Description
    Test_EstadoCatalogo_DictionaryReload_FromFixture_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then DropCatalogTableIfExists db, logs
    TestHelper.EndTestSession logs
    Set db = Nothing
End Function

Public Function Test_EstadoCatalogo_DictionaryReload_FailsOnMissingCode_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim sessionErr As String
    Dim opErr As String
    Dim assertError As String
    Dim reloadOk As Boolean

    Set logs = TestHelper.NewLogs
    If Not BeginCatalogoSession(logs, db, sessionErr) Then
        Test_EstadoCatalogo_DictionaryReload_FailsOnMissingCode_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        GoTo Cleanup
    End If

    RecreateCatalogFixture db, logs
    db.Execute "DELETE FROM TbEstadoCatalogo WHERE TipoEntidad = 'NC' AND Codigo = 'ENEJECUCION'", dbFailOnError
    TestHelper.AddLog logs, "Arrange: explicit catalogue fixture missing required NC/ENEJECUCION code"

    If m_ObjEntorno Is Nothing Then Set m_ObjEntorno = New Entorno
    reloadOk = CBool(CallByName(m_ObjEntorno, "ReloadEstadoDictionariesFromCatalogo", VbMethod, opErr))
    Call TestHelper.AssertTrue(Not reloadOk, "Entorno reload must fail fast when a required stable code is missing", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(InStr(1, opErr, "ENEJECUCION", vbTextCompare) > 0 Or InStr(1, opErr, "NC", vbTextCompare) > 0, "Reload error must identify missing code/family: " & opErr, logs, assertError)
    If assertError <> "" Then GoTo Fail

    Test_EstadoCatalogo_DictionaryReload_FailsOnMissingCode_Atomic = TestHelper.BuildJsonOk(logs, opErr)
    GoTo Cleanup

Fail:
    Test_EstadoCatalogo_DictionaryReload_FailsOnMissingCode_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "RED expected until Entorno reload fail-fast exists: " & Err.Description
    Test_EstadoCatalogo_DictionaryReload_FailsOnMissingCode_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then DropCatalogTableIfExists db, logs
    TestHelper.EndTestSession logs
    Set db = Nothing
End Function

Public Function Test_EstadoCatalogo_CacheWarmup_UsesCatalogBackedState_Atomic() As String
    On Error GoTo EH

    Dim logs As Collection
    Dim db As DAO.Database
    Dim sessionErr As String
    Dim opErr As String
    Dim assertError As String
    Dim ok As Boolean
    Dim cacheRows As Long
    Dim logRows As Long

    Set logs = TestHelper.NewLogs
    If Not BeginCatalogoSession(logs, db, sessionErr) Then
        Test_EstadoCatalogo_CacheWarmup_UsesCatalogBackedState_Atomic = TestHelper.BuildJsonFail("TESTS BLOCKED: " & sessionErr, logs)
        GoTo Cleanup
    End If

    RecreateCatalogFixture db, logs
    CleanupCacheFixture db, logs
    SeedNCFixture db, TEST_ID_NC_BOOTSTRAP, "ENEJECUCION", logs

    ok = CBool(Application.Run("SetCacheEnabled", True, opErr))
    Call TestHelper.AssertTrue(ok, "Cache must be explicitly enabled for warm-up fixture", logs, assertError)
    If assertError <> "" Then GoTo Fail
    Call TestHelper.AssertTrue(opErr = "", "SetCacheEnabled must not return error: " & opErr, logs, assertError)
    If assertError <> "" Then GoTo Fail
    opErr = ""

    ok = CBool(Application.Run("BootstrapEstadoCatalogo", opErr))
    Call TestHelper.AssertTrue(ok, "BootstrapEstadoCatalogo must warm cache from catalogue-backed state", logs, assertError)
    If assertError <> "" Then GoTo Fail

    cacheRows = CountRowsBySql(db, "SELECT COUNT(*) FROM TbCacheListadoNC WHERE IDNoConformidad = " & TEST_ID_NC_BOOTSTRAP & " AND Estado = 'ENEJECUCION' AND CacheValida = True")
    Call TestHelper.AssertTrue(cacheRows = 1, "TbCacheListadoNC must contain one exact catalogue-backed fixture row", logs, assertError)
    If assertError <> "" Then GoTo Fail
    logRows = CountRowsBySql(db, "SELECT COUNT(*) FROM TbLogCache WHERE IDNoConformidad = 0 AND TipoOperacion LIKE '*Bootstrap*' AND Exito = True")
    Call TestHelper.AssertTrue(logRows >= 1, "TbLogCache must record global bootstrap/warm-up evidence", logs, assertError)
    If assertError <> "" Then GoTo Fail

    Test_EstadoCatalogo_CacheWarmup_UsesCatalogBackedState_Atomic = TestHelper.BuildJsonOk(logs, "cache_warmup_ok")
    GoTo Cleanup

Fail:
    Test_EstadoCatalogo_CacheWarmup_UsesCatalogBackedState_Atomic = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup

EH:
    TestHelper.AddLog logs, "RED expected until cache warm-up integration exists: " & Err.Description
    Test_EstadoCatalogo_CacheWarmup_UsesCatalogBackedState_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)

Cleanup:
    On Error Resume Next
    opErr = ""
    Application.Run "SetCacheEnabled", False, opErr
    If Not db Is Nothing Then
        CleanupCacheFixture db, logs
        DropCatalogTableIfExists db, logs
    End If
    TestHelper.EndTestSession logs
    Set db = Nothing
End Function

Private Function BeginCatalogoSession(ByRef p_Logs As Collection, ByRef p_Db As DAO.Database, ByRef p_Error As String) As Boolean
    p_Error = ""
    If Not TestHelper.BeginTestSession(p_Logs, p_Error) Then Exit Function
    If Not TestHelper.AssertSandboxBackend(p_Logs, p_Error) Then Exit Function
    Set p_Db = getdb(p_Error)
    If p_Db Is Nothing Then Exit Function
    BeginCatalogoSession = True
End Function

Private Function AssertCatalogSchema(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection, ByRef p_Error As String) As Boolean
    If Not TableExistsInDb(p_Db, CATALOG_TABLE) Then p_Error = CATALOG_TABLE & " does not exist": Exit Function
    If Not FieldExists(p_Db, CATALOG_TABLE, "TipoEntidad") Then p_Error = "Missing TipoEntidad": Exit Function
    If Not FieldExists(p_Db, CATALOG_TABLE, "EnumValor") Then p_Error = "Missing EnumValor": Exit Function
    If Not FieldExists(p_Db, CATALOG_TABLE, "Codigo") Then p_Error = "Missing Codigo": Exit Function
    If Not FieldExists(p_Db, CATALOG_TABLE, "Titulo") Then p_Error = "Missing Titulo": Exit Function
    If Not FieldExists(p_Db, CATALOG_TABLE, "Texto") Then p_Error = "Missing Texto": Exit Function
    If Not FieldExists(p_Db, CATALOG_TABLE, "Version") Then p_Error = "Missing Version": Exit Function
    If Not FieldExists(p_Db, CATALOG_TABLE, "Activo") Then p_Error = "Missing Activo": Exit Function
    If Not FieldExists(p_Db, CATALOG_TABLE, "FechaBootstrap") Then p_Error = "Missing FechaBootstrap": Exit Function
    If Not FieldExists(p_Db, CATALOG_TABLE, "UsuarioBootstrap") Then p_Error = "Missing UsuarioBootstrap": Exit Function
    If Not IndexExists(p_Db, CATALOG_TABLE, "UX_TbEstadoCatalogo_Tipo_Codigo") Then p_Error = "Missing UX_TbEstadoCatalogo_Tipo_Codigo": Exit Function
    TestHelper.AddLog p_Logs, "Assert schema OK for " & CATALOG_TABLE
    AssertCatalogSchema = True
End Function

Private Function AssertExpectedCardinality(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection, ByRef p_Error As String) As Boolean
    Call TestHelper.AssertTrue(CountCatalogRows(p_Db, "NC") = 10, "NC active rows must be exactly 10", p_Logs, p_Error)
    If p_Error <> "" Then Exit Function
    Call TestHelper.AssertTrue(CountCatalogRows(p_Db, "AC") = 6, "AC active rows must be exactly 6", p_Logs, p_Error)
    If p_Error <> "" Then Exit Function
    Call TestHelper.AssertTrue(CountCatalogRows(p_Db, "AR") = 5, "AR active rows must be exactly 5", p_Logs, p_Error)
    If p_Error <> "" Then Exit Function
    AssertExpectedCardinality = True
End Function

Private Function AssertNoDuplicateStableCodes(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection, ByRef p_Error As String) As Boolean
    Dim duplicates As Long
    duplicates = CountRowsBySql(p_Db, "SELECT COUNT(*) FROM (SELECT TipoEntidad, Codigo FROM TbEstadoCatalogo WHERE Activo = True GROUP BY TipoEntidad, Codigo HAVING COUNT(*) > 1)")
    Call TestHelper.AssertTrue(duplicates = 0, "No duplicate (TipoEntidad, Codigo) rows are allowed", p_Logs, p_Error)
    AssertNoDuplicateStableCodes = (p_Error = "")
End Function

Private Function AssertExpectedCodes(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection, ByRef p_Error As String) As Boolean
    AssertExpectedCodes = _
        AssertCodesForFamily(p_Db, p_Logs, p_Error, "NC", "BORRADA|REGISTRADA|PLANIFICADA|ENEJECUCION|ENEJECUCIONFUERADEPLAZO|ACSSINTAREAS|Cerrada|CERRADAPTECE|CERRADAPTECECADUCADA|CERRADACENOCONFORME") And _
        AssertCodesForFamily(p_Db, p_Logs, p_Error, "AC", "ACTIVA|SINACCIONES|FINALIZADA|PTEREPLANIFICAR|PTEREREGULARIZAR|REGISTRADA") And _
        AssertCodesForFamily(p_Db, p_Logs, p_Error, "AR", "ACTIVA|FINALIZADA|PTEREPLANIFICAR|IRREGULAR|REGISTRADA")
End Function

Private Function AssertCodesForFamily(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection, ByRef p_Error As String, ByVal p_Family As String, ByVal p_CodesPipe As String) As Boolean
    Dim codes() As String
    Dim i As Long
    codes = Split(p_CodesPipe, "|")
    For i = LBound(codes) To UBound(codes)
        If CountRowsBySql(p_Db, "SELECT COUNT(*) FROM TbEstadoCatalogo WHERE TipoEntidad = " & TestHelper.SqlText(p_Family) & " AND Codigo = " & TestHelper.SqlText(codes(i)) & " AND Activo = True") <> 1 Then
            p_Error = "Missing expected code " & p_Family & "/" & codes(i)
            Exit Function
        End If
    Next i
    TestHelper.AddLog p_Logs, "Assert expected codes OK for " & p_Family
    AssertCodesForFamily = True
End Function

Private Sub RecreateCatalogFixture(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection)
    DropCatalogTableIfExists p_Db, p_Logs
    p_Db.Execute "CREATE TABLE TbEstadoCatalogo (TipoEntidad TEXT(10), EnumValor LONG, Codigo TEXT(100), Titulo TEXT(255), Texto TEXT(100), Version LONG, Activo YESNO, FechaBootstrap DATETIME, UsuarioBootstrap TEXT(255))", dbFailOnError
    p_Db.Execute "CREATE UNIQUE INDEX UX_TbEstadoCatalogo_Tipo_Codigo ON TbEstadoCatalogo (TipoEntidad, Codigo)", dbFailOnError
    InsertCatalogFamily p_Db, "NC", "BORRADA|REGISTRADA|PLANIFICADA|ENEJECUCION|ENEJECUCIONFUERADEPLAZO|ACSSINTAREAS|Cerrada|CERRADAPTECE|CERRADAPTECECADUCADA|CERRADACENOCONFORME"
    InsertCatalogFamily p_Db, "AC", "ACTIVA|SINACCIONES|FINALIZADA|PTEREPLANIFICAR|PTEREREGULARIZAR|REGISTRADA"
    InsertCatalogFamily p_Db, "AR", "ACTIVA|FINALIZADA|PTEREPLANIFICAR|IRREGULAR|REGISTRADA"
    TestHelper.AddLog p_Logs, "Arrange: explicit TbEstadoCatalogo fixture seeded NC=10 AC=6 AR=5"
End Sub

Private Sub InsertCatalogFamily(ByVal p_Db As DAO.Database, ByVal p_Family As String, ByVal p_CodesPipe As String)
    Dim codes() As String
    Dim i As Long
    codes = Split(p_CodesPipe, "|")
    For i = LBound(codes) To UBound(codes)
        p_Db.Execute "INSERT INTO TbEstadoCatalogo (TipoEntidad, EnumValor, Codigo, Titulo, Texto, Version, Activo, FechaBootstrap, UsuarioBootstrap) VALUES (" & _
            TestHelper.SqlText(p_Family) & ", " & CStr(i + 1) & ", " & TestHelper.SqlText(codes(i)) & ", " & TestHelper.SqlText(codes(i)) & ", " & TestHelper.SqlText(codes(i)) & ", " & CStr(EXPECTED_VERSION) & ", True, Now(), 'SDD-47')", dbFailOnError
    Next i
End Sub

Private Sub SeedNCFixture(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long, ByVal p_Estado As String, ByRef p_Logs As Collection)
    p_Db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad = " & p_IDNC, dbFailOnError
    p_Db.Execute "INSERT INTO TbNoConformidades (IDNoConformidad, CodigoNoConformidad, EXPEDIENTE, PROYECTO, DESCRIPCION, CAUSA, FECHAAPERTURA, TIPO, RequiereControlEficacia, MotivoNoRequiereControlEficacia, Borrado, ESTADO) VALUES (" & _
        p_IDNC & ", " & TestHelper.SqlText("ECAT-" & CStr(p_IDNC)) & ", 'EXP-ECAT', 'PROY-ECAT', 'Fixture estado catalogo cache', 'Causa fixture', Date(), 'Proyecto', 'No', 'Fixture estado catalogo', 0, " & TestHelper.SqlText(p_Estado) & ")", dbFailOnError
    TestHelper.AddLog p_Logs, "Arrange: controlled TbNoConformidades fixture ID=" & CStr(p_IDNC) & " Estado=" & p_Estado
End Sub

Private Sub CleanupCacheFixture(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection)
    On Error Resume Next
    If TableExistsInDb(p_Db, "TbCacheListadoNC") Then p_Db.Execute "DELETE FROM TbCacheListadoNC WHERE IDNoConformidad = " & TEST_ID_NC_BOOTSTRAP, dbFailOnError
    If TableExistsInDb(p_Db, "TbCacheNCProyecto") Then p_Db.Execute "DELETE FROM TbCacheNCProyecto WHERE IDNoConformidad = " & TEST_ID_NC_BOOTSTRAP, dbFailOnError
    If TableExistsInDb(p_Db, "TbLogCache") Then p_Db.Execute "DELETE FROM TbLogCache WHERE IDNoConformidad IN (0, " & TEST_ID_NC_BOOTSTRAP & ") AND TipoOperacion LIKE '*Bootstrap*'", dbFailOnError
    If TableExistsInDb(p_Db, "TbNoConformidades") Then p_Db.Execute "DELETE FROM TbNoConformidades WHERE IDNoConformidad = " & TEST_ID_NC_BOOTSTRAP, dbFailOnError
    TestHelper.AddLog p_Logs, "Cleanup: cache fixture children -> source"
End Sub

Private Sub DropCatalogTableIfExists(ByVal p_Db As DAO.Database, ByRef p_Logs As Collection)
    On Error Resume Next
    If TableExistsInDb(p_Db, CATALOG_TABLE) Then p_Db.Execute "DROP TABLE " & CATALOG_TABLE, dbFailOnError
    TestHelper.AddLog p_Logs, "Cleanup: " & CATALOG_TABLE & " dropped if present"
End Sub

Private Function CountCatalogRows(ByVal p_Db As DAO.Database, ByVal p_Family As String) As Long
    CountCatalogRows = CountRowsBySql(p_Db, "SELECT COUNT(*) FROM TbEstadoCatalogo WHERE TipoEntidad = " & TestHelper.SqlText(p_Family) & " AND Activo = True AND Version = " & EXPECTED_VERSION)
End Function

Private Function CountRowsBySql(ByVal p_Db As DAO.Database, ByVal p_SQL As String) As Long
    Dim rs As DAO.Recordset
    Set rs = p_Db.OpenRecordset(p_SQL, dbOpenSnapshot)
    If Not rs.EOF Then CountRowsBySql = CLng(Nz(rs.Fields(0).Value, 0))
    rs.Close
    Set rs = Nothing
End Function

Private Function TableExistsInDb(ByVal p_Db As DAO.Database, ByVal p_TableName As String) As Boolean
    On Error GoTo EH
    Dim tdf As DAO.TableDef
    Set tdf = p_Db.TableDefs(p_TableName)
    TableExistsInDb = True
    Exit Function
EH:
    TableExistsInDb = False
End Function

Private Function FieldExists(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_FieldName As String) As Boolean
    On Error GoTo EH
    Dim fld As DAO.Field
    Set fld = p_Db.TableDefs(p_TableName).Fields(p_FieldName)
    FieldExists = True
    Exit Function
EH:
    FieldExists = False
End Function

Private Function IndexExists(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_IndexName As String) As Boolean
    On Error GoTo EH
    Dim idx As DAO.Index
    Set idx = p_Db.TableDefs(p_TableName).Indexes(p_IndexName)
    IndexExists = True
    Exit Function
EH:
    IndexExists = False
End Function

Private Sub CaptureTempVar(ByVal p_Name As String, ByRef p_Value As Variant)
    On Error GoTo Missing
    p_Value = Application.TempVars(p_Name).Value
    Exit Sub
Missing:
    p_Value = Null
End Sub

Private Sub RestoreTempVar(ByVal p_Name As String, ByVal p_Value As Variant)
    On Error Resume Next
    Application.TempVars.Remove p_Name
    If Not IsNull(p_Value) Then Application.TempVars(p_Name) = p_Value
End Sub
