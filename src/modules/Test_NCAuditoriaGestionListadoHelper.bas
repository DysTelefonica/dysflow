Attribute VB_Name = "Test_NCAuditoriaGestionListadoHelper"
Option Compare Database
Option Explicit

' SDD: audit-gestion-cache-helper Slice 1 — RED helper contract tests.
' Fixture discipline: seed TbAuditorias parent, then TbNoConformidadesAuditoria;
' teardown log/child/parent by deterministic IDs only.

Private Const TEST_AUD_ID As Long = 900490
Private Const TEST_NC_CACHE_EXPECTED As Long = 900491
Private Const TEST_NC_FALLBACK As Long = 900492
Private Const TEST_NC_ROW As Long = 900493
Private Const TEST_NC_KEYWORD_CLOSED As Long = 900494
Private Const LOG_OPERATION_AUDIT_FALLBACK As String = "FormAuditCacheFallback"
Private Const AUDIT_LIST_CACHE_TABLE As String = "TbCacheListadoNCAuditoria"

Public Function Test_AuditListadoCache_BackendSchemaContract_RED() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_AuditListadoCache_BackendSchemaContract_RED = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    SchemaGateSlice1 logs
    TestHelper.AddLog logs, "Act: ensure audit list-cache schema through backend getdb(), never frontend CurrentDb"
    If Not EnsureNCAuditoriaListadoCacheSchema(errMsg) Then Err.Raise 1000, , errMsg

    If Not TableExistsInDb(db, AUDIT_LIST_CACHE_TABLE) Then assertError = "Missing backend table " & AUDIT_LIST_CACHE_TABLE: GoTo Fail
    If FrontendHasLocalTable(AUDIT_LIST_CACHE_TABLE) Then assertError = "Frontend local table must not satisfy backend cache contract": GoTo Fail
    If Not AssertField(db, "ID", dbLong, 0, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "IDAuditoria", dbLong, 0, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "Tipo", dbText, 255, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "Numero", dbText, 255, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "Descripcion", dbMemo, 0, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "CAUSARAIZ", dbMemo, 0, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "RESPONSABLEIMPLANTACION", dbText, 255, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "Estado", dbText, 255, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "FechaApertura", dbDate, 0, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "FECHACIERRE", dbDate, 0, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "RequiereControlEficacia", dbText, 25, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "ControlEficacia", dbMemo, 0, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "Notas", dbMemo, 0, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "Cerrada", dbText, 10, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "Borrado", dbBoolean, 0, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "AccionesCorrectivasConcatenadas", dbMemo, 0, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "AccionesRealizadasConcatenadas", dbMemo, 0, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "FechaCache", dbDate, 0, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "CacheValida", dbBoolean, 0, logs, assertError) Then GoTo Fail
    If Not AssertField(db, "Version", dbLong, 0, logs, assertError) Then GoTo Fail

    Test_AuditListadoCache_BackendSchemaContract_RED = TestHelper.BuildJsonOk(logs, "audit-list-cache-backend-schema")
    GoTo Cleanup
Fail:
    Test_AuditListadoCache_BackendSchemaContract_RED = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_AuditListadoCache_BackendSchemaContract_RED = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    TestHelper.EndTestSession logs
End Function

Public Function Test_AuditListadoCache_IdempotentIndexesContract_RED() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_AuditListadoCache_IdempotentIndexesContract_RED = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    SchemaGateSlice1 logs
    If Not EnsureNCAuditoriaListadoCacheSchema(errMsg) Then Err.Raise 1000, , errMsg
    If Not EnsureNCAuditoriaListadoCacheSchema(errMsg) Then Err.Raise 1000, , errMsg
    TestHelper.AddLog logs, "Act: ensured schema twice to prove non-destructive idempotence"

    If Not IndexIsUnique(db, AUDIT_LIST_CACHE_TABLE, "PK_TbCacheListadoNCAuditoria", "ID") Then
        assertError = "Expected unique ID index PK_TbCacheListadoNCAuditoria"
        GoTo Fail
    End If
    If Not IndexExistsInDb(db, AUDIT_LIST_CACHE_TABLE, "IX_TbCacheListadoNCAuditoria_AuditoriaValida") Then assertError = "Missing AuditoriaValida index": GoTo Fail
    If Not IndexExistsInDb(db, AUDIT_LIST_CACHE_TABLE, "IX_TbCacheListadoNCAuditoria_EstadoValida") Then assertError = "Missing EstadoValida index": GoTo Fail

    Test_AuditListadoCache_IdempotentIndexesContract_RED = TestHelper.BuildJsonOk(logs, "audit-list-cache-idempotent-indexes")
    GoTo Cleanup
Fail:
    Test_AuditListadoCache_IdempotentIndexesContract_RED = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_AuditListadoCache_IdempotentIndexesContract_RED = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    TestHelper.EndTestSession logs
End Function

Public Function Test_AuditListadoHelper_CacheOn_SourceContract_RED() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim col As Collection

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_AuditListadoHelper_CacheOn_SourceContract_RED = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    SchemaGateSlice1 logs
    CleanupSlice1 db
    SeedAuditFixture db, TEST_AUD_ID, TEST_NC_CACHE_EXPECTED, "AUD-CACHE", "cache row should win", "QA CACHE"
    TestHelper.AddLog logs, "Arrange: cache enabled but audit cache table absent; helper must use observable fallback source"

    Set col = GetNCAuditoriaGestionFiltradas(p_IDAuditoria:=TEST_AUD_ID, p_Descripcion:="cache row", p_CacheEnabled:=True, p_Error:=errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg
    If Not AssertCollectionHasOnlyAuditId(col, TEST_NC_CACHE_EXPECTED, logs, assertError) Then GoTo Fail
    If CountRows(db, "TbLogCache", "TipoOperacion='" & LOG_OPERATION_AUDIT_FALLBACK & "'") <> 1 Then
        assertError = "Cache ON without validated audit cache source must log exactly one audit fallback"
        GoTo Fail
    End If

    Test_AuditListadoHelper_CacheOn_SourceContract_RED = TestHelper.BuildJsonOk(logs, "audit-cache-on-contract")
    GoTo Cleanup
Fail:
    Test_AuditListadoHelper_CacheOn_SourceContract_RED = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_AuditListadoHelper_CacheOn_SourceContract_RED = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then CleanupSlice1 db
    TestHelper.EndTestSession logs
End Function

Public Function Test_AuditListadoHelper_Fallback_Observable_RED() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim col As Collection

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_AuditListadoHelper_Fallback_Observable_RED = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    SchemaGateSlice1 logs
    CleanupSlice1 db
    SeedAuditFixture db, TEST_AUD_ID, TEST_NC_FALLBACK, "AUD-FALL", "fallback source row", "QA FALLBACK"
    TestHelper.AddLog logs, "Arrange: cache disabled contract must return seeded fallback row and log fallback"

    Set col = GetNCAuditoriaGestionFiltradas(p_IDAuditoria:=TEST_AUD_ID, p_Descripcion:="fallback", p_CacheEnabled:=False, p_Error:=errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg
    If Not AssertCollectionHasOnlyAuditId(col, TEST_NC_FALLBACK, logs, assertError) Then GoTo Fail
    If CountRows(db, "TbLogCache", "TipoOperacion='" & LOG_OPERATION_AUDIT_FALLBACK & "'") <> 1 Then
        assertError = "Expected exactly one observable FormAuditCacheFallback log"
        GoTo Fail
    End If

    Test_AuditListadoHelper_Fallback_Observable_RED = TestHelper.BuildJsonOk(logs, "audit-fallback-observable")
    GoTo Cleanup
Fail:
    Test_AuditListadoHelper_Fallback_Observable_RED = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_AuditListadoHelper_Fallback_Observable_RED = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then CleanupSlice1 db
    TestHelper.EndTestSession logs
End Function

Public Function Test_AuditListadoHelper_RowAndReportContracts_RED() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim nc As NCAuditoria
    Dim listed As Collection
    Dim reportCol As Scripting.Dictionary
    Dim selected As NCAuditoria
    Dim rowText As String

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_AuditListadoHelper_RowAndReportContracts_RED = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    SchemaGateSlice1 logs
    CleanupSlice1 db
    SeedAuditFixture db, TEST_AUD_ID, TEST_NC_ROW, "AUD-ROW", "description;must sanitize", "QA ROW"
    Set nc = constructor.getNCAuditoria(p_IDNC:=CStr(TEST_NC_ROW), p_db:=db, p_Error:=errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg

    rowText = BuildNCAuditoriaGestionListRow(p_Item:=nc, p_Error:=errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg
    If InStr(1, rowText, CStr(TEST_NC_ROW) & ";", vbTextCompare) <> 1 Then
        assertError = "Expected row to start with audit NC ID"
        GoTo Fail
    End If
    If InStr(1, rowText, "description:must sanitize", vbTextCompare) = 0 Then
        assertError = "Expected semicolon sanitization in row text"
        GoTo Fail
    End If

    Set selected = ResolveNCAuditoriaGestionSelection(p_Current:=nc, p_SelectedID:=CStr(TEST_NC_ROW), p_Error:=errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg
    If selected Is Nothing Then
        assertError = "Expected selected audit NC to resolve without full-list reload"
        GoTo Fail
    End If

    Set listed = New Collection
    listed.Add nc
    Set reportCol = BuildNCAuditoriaGestionReportCollection(p_ListedItems:=listed, p_Error:=errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg
    If reportCol Is Nothing Then
        assertError = "Expected report collection for listed audit NC"
        GoTo Fail
    End If
    If Not reportCol.Exists(CStr(TEST_NC_ROW)) Then
        assertError = "Expected report collection keyed by audit NC ID"
        GoTo Fail
    End If

    Test_AuditListadoHelper_RowAndReportContracts_RED = TestHelper.BuildJsonOk(logs, "audit-row-contract")
    GoTo Cleanup
Fail:
    Test_AuditListadoHelper_RowAndReportContracts_RED = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_AuditListadoHelper_RowAndReportContracts_RED = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then CleanupSlice1 db
    TestHelper.EndTestSession logs
End Function

Public Function Test_AuditGestionForm_ReportConstructorPath_Characterization() As String
    Dim logs As Collection
    Dim src As String
    Dim path As String

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    path = CurrentProject.Path & "\src\forms\Form_FormNCAuditoriaGestion.cls"
    src = CreateObject("Scripting.FileSystemObject").OpenTextFile(path, 1, False).ReadAll
    TestHelper.AddLog logs, "Characterization: inspected exported form source for ComandoInforme_Click constructor path"

    If InStr(1, src, "EnsureNCAuditoriaGestionSelected p_EmptyMessage:=", vbTextCompare) = 0 Then
        Test_AuditGestionForm_ReportConstructorPath_Characterization = TestHelper.BuildJsonFail("Expected report path to delegate selected audit NC resolution", logs)
    ElseIf InStr(1, src, "Set m_NCSeleccionada = constructor.getNCProyecto", vbTextCompare) > 0 Then
        Test_AuditGestionForm_ReportConstructorPath_Characterization = TestHelper.BuildJsonFail("Report path must not hydrate audit NC through constructor.getNCProyecto", logs)
    Else
        Test_AuditGestionForm_ReportConstructorPath_Characterization = TestHelper.BuildJsonOk(logs, "report-path-delegates-audit-selection")
    End If
    Exit Function
EH:
    Test_AuditGestionForm_ReportConstructorPath_Characterization = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Public Function Test_AuditListadoHelper_LegacyKeywordAbiertasParity() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim assertError As String
    Dim col As Collection

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_AuditListadoHelper_LegacyKeywordAbiertasParity = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    SchemaGateSlice1 logs
    CleanupSlice1 db
    SeedAuditFixture db, TEST_AUD_ID, TEST_NC_KEYWORD_CLOSED, "AUD-KEY", "legacy keyword abiertas parity", "QA KEY", "Cerrada"
    TestHelper.AddLog logs, "Arrange: legacy form selected keyword source before Estado='Abiertas'; Abiertas must not narrow keyword results"

    Set col = GetNCAuditoriaGestionFiltradas( _
                p_IDAuditoria:=TEST_AUD_ID, _
                p_PalabraClave:="legacy keyword abiertas parity", _
                p_Estado:="Abiertas", _
                p_CacheEnabled:=False, _
                p_Error:=errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg
    If Not AssertCollectionHasOnlyAuditId(col, TEST_NC_KEYWORD_CLOSED, logs, assertError) Then GoTo Fail

    Test_AuditListadoHelper_LegacyKeywordAbiertasParity = TestHelper.BuildJsonOk(logs, "legacy-keyword-abiertas-parity")
    GoTo Cleanup
Fail:
    Test_AuditListadoHelper_LegacyKeywordAbiertasParity = TestHelper.BuildJsonFail(assertError, logs)
    GoTo Cleanup
EH:
    Test_AuditListadoHelper_LegacyKeywordAbiertasParity = TestHelper.BuildJsonFail(Err.Description, logs)
Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then CleanupSlice1 db
    TestHelper.EndTestSession logs
End Function

Private Sub SchemaGateSlice1(ByVal p_Logs As Collection)
    TestHelper.AddLog p_Logs, "Schema gate: TbAuditorias IDAuditoria Long required; TbNoConformidadesAuditoria ID Long required, CAUSARAIZ LongText required, RequiereControlEficacia Text(25) required, ControlEficacia LongText; audit AC IDAccionCorrectiva Long required and ID parent Long; audit AR IDAccionRealizada Long required and IDAccionCorrectiva parent Long; TbLogCache IDNoConformidad Long required; TbCacheListadoNC uses RequiereControlEficacia Text(10) and ControlEficacia Text(255), so audit cache must diverge. FK order: TbAuditorias -> TbNoConformidadesAuditoria -> TbNCAuditoriaAccionCorrectivas -> TbNCAuditoriaAccionesRealizadas."
End Sub

Private Function AssertField(ByVal p_Db As DAO.Database, ByVal p_FieldName As String, ByVal p_Type As Long, ByVal p_Size As Long, ByVal p_Logs As Collection, ByRef p_Error As String) As Boolean
    Dim fld As DAO.Field
    On Error GoTo missing
    Set fld = p_Db.TableDefs(AUDIT_LIST_CACHE_TABLE).Fields(p_FieldName)
    If fld.Type <> p_Type Then p_Error = "Unexpected type for " & p_FieldName & ": " & CStr(fld.Type): Exit Function
    If p_Size > 0 Then
        If fld.Size <> p_Size Then p_Error = "Unexpected size for " & p_FieldName & ": " & CStr(fld.Size): Exit Function
    End If
    TestHelper.AddLog p_Logs, "Assert schema: " & p_FieldName & " type=" & CStr(p_Type) & " size=" & CStr(p_Size)
    AssertField = True
    Exit Function
missing:
    p_Error = "Missing field " & p_FieldName
End Function

Private Function TableExistsInDb(ByVal p_Db As DAO.Database, ByVal p_TableName As String) As Boolean
    Dim tdf As DAO.TableDef
    On Error GoTo notfound
    Set tdf = p_Db.TableDefs(p_TableName)
    TableExistsInDb = True
    Exit Function
notfound:
    TableExistsInDb = False
End Function

Private Function FrontendHasLocalTable(ByVal p_TableName As String) As Boolean
    Dim tdf As DAO.TableDef
    On Error GoTo done
    For Each tdf In CurrentDb.TableDefs
        If StrComp(tdf.Name, p_TableName, vbTextCompare) = 0 Then
            If Len(tdf.Connect) = 0 Then FrontendHasLocalTable = True
            Exit Function
        End If
    Next tdf
done:
End Function

Private Function IndexExistsInDb(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_IndexName As String) As Boolean
    Dim idx As DAO.Index
    On Error GoTo notfound
    Set idx = p_Db.TableDefs(p_TableName).Indexes(p_IndexName)
    IndexExistsInDb = True
    Exit Function
notfound:
    IndexExistsInDb = False
End Function

Private Function IndexIsUnique(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_IndexName As String, ByVal p_FieldName As String) As Boolean
    Dim idx As DAO.Index
    On Error GoTo notfound
    Set idx = p_Db.TableDefs(p_TableName).Indexes(p_IndexName)
    If Not idx.Unique Then Exit Function
    If idx.Fields.count <> 1 Then Exit Function
    If StrComp(idx.Fields(0).Name, p_FieldName, vbTextCompare) <> 0 Then Exit Function
    IndexIsUnique = True
    Exit Function
notfound:
    IndexIsUnique = False
End Function

Private Sub SeedAuditFixture(ByVal p_Db As DAO.Database, ByVal p_IDAuditoria As Long, ByVal p_IDNC As Long, ByVal p_Numero As String, ByVal p_Descripcion As String, ByVal p_Responsable As String, Optional ByVal p_Estado As String = "Abierta")
    p_Db.Execute "DELETE FROM TbNoConformidadesAuditoria WHERE ID=" & CStr(p_IDNC), dbFailOnError
    p_Db.Execute "DELETE FROM TbAuditorias WHERE IDAuditoria=" & CStr(p_IDAuditoria), dbFailOnError
    p_Db.Execute "INSERT INTO TbAuditorias (IDAuditoria, Tipo, FechaInicio, FechaFin) VALUES (" & CStr(p_IDAuditoria) & ", 'AUD-SLICE1', Date(), Date())", dbFailOnError
    p_Db.Execute "INSERT INTO TbNoConformidadesAuditoria " & _
                 "(ID, IDAuditoria, FechaApertura, Numero, DESCRIPCION, CAUSARAIZ, RESPONSABLEIMPLANTACION, RequiereControlEficacia, Tipo, ESTADO, Borrado) VALUES (" & _
                 CStr(p_IDNC) & ", " & CStr(p_IDAuditoria) & ", Date(), " & TestHelper.SqlText(p_Numero) & ", " & TestHelper.SqlText(p_Descripcion) & ", " & _
                 TestHelper.SqlText("Causa slice1") & ", " & TestHelper.SqlText(p_Responsable) & ", 'No', 'Auditoria', " & TestHelper.SqlText(p_Estado) & ", 0)", dbFailOnError
End Sub

Private Sub CleanupSlice1(ByVal p_Db As DAO.Database)
    p_Db.Execute "DELETE FROM TbLogCache WHERE TipoOperacion='" & LOG_OPERATION_AUDIT_FALLBACK & "'", dbFailOnError
    p_Db.Execute "DELETE FROM TbNoConformidadesAuditoria WHERE ID BETWEEN " & CStr(TEST_NC_CACHE_EXPECTED) & " AND " & CStr(TEST_NC_KEYWORD_CLOSED), dbFailOnError
    p_Db.Execute "DELETE FROM TbAuditorias WHERE IDAuditoria=" & CStr(TEST_AUD_ID), dbFailOnError
End Sub

Private Function CountRows(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_Where As String) As Long
    Dim rs As DAO.Recordset
    Set rs = p_Db.OpenRecordset("SELECT COUNT(*) AS C FROM " & p_TableName & " WHERE " & p_Where, dbOpenSnapshot)
    CountRows = CLng(rs!C)
    rs.Close
    Set rs = Nothing
End Function

Private Function AssertCollectionHasOnlyAuditId(ByVal p_Col As Collection, ByVal p_ExpectedID As Long, ByVal p_Logs As Collection, ByRef p_Error As String) As Boolean
    Dim item As Object
    Dim nc As NCAuditoria
    Dim actualId As String

    If p_Col Is Nothing Then
        p_Error = "Expected collection, got Nothing"
        Exit Function
    End If
    If p_Col.count <> 1 Then
        p_Error = "Expected exactly 1 row, got " & CStr(p_Col.count)
        Exit Function
    End If
    Set item = p_Col(1)
    If TypeOf item Is NCAuditoria Then
        Set nc = item
        actualId = CStr(nc.id)
    Else
        actualId = CStr(CallByName(item, "ID", VbGet))
    End If
    If actualId <> CStr(p_ExpectedID) Then
        p_Error = "Expected audit NC ID=" & CStr(p_ExpectedID) & ", got " & actualId
        Exit Function
    End If
    TestHelper.AddLog p_Logs, "Assert: collection contains only audit ID=" & CStr(p_ExpectedID)
    AssertCollectionHasOnlyAuditId = True
End Function
