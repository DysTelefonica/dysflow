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
Private Const LOG_OPERATION_AUDIT_FALLBACK As String = "FormAuditCacheFallback"

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

    If InStr(1, src, "Set m_NCSeleccionada = constructor.getNCProyecto", vbTextCompare) = 0 Then
        Test_AuditGestionForm_ReportConstructorPath_Characterization = TestHelper.BuildJsonFail("Expected current suspicious getNCProyecto report path not found", logs)
    Else
        Test_AuditGestionForm_ReportConstructorPath_Characterization = TestHelper.BuildJsonOk(logs, "current-report-path-uses-getNCProyecto")
    End If
    Exit Function
EH:
    Test_AuditGestionForm_ReportConstructorPath_Characterization = TestHelper.BuildJsonFail(Err.Description, logs)
End Function

Private Sub SchemaGateSlice1(ByVal p_Logs As Collection)
    TestHelper.AddLog p_Logs, "Schema gate: TbAuditorias required IDAuditoria; TbNoConformidadesAuditoria required ID, CAUSARAIZ, RequiereControlEficacia; TbLogCache requires IDNoConformidad. No TbCacheListadoNCAuditoria exists; TbCacheListadoNC is project-side only. FK order: TbAuditorias -> TbNoConformidadesAuditoria."
End Sub

Private Sub SeedAuditFixture(ByVal p_Db As DAO.Database, ByVal p_IDAuditoria As Long, ByVal p_IDNC As Long, ByVal p_Numero As String, ByVal p_Descripcion As String, ByVal p_Responsable As String)
    p_Db.Execute "DELETE FROM TbNoConformidadesAuditoria WHERE ID=" & CStr(p_IDNC), dbFailOnError
    p_Db.Execute "DELETE FROM TbAuditorias WHERE IDAuditoria=" & CStr(p_IDAuditoria), dbFailOnError
    p_Db.Execute "INSERT INTO TbAuditorias (IDAuditoria, Tipo, FechaInicio, FechaFin) VALUES (" & CStr(p_IDAuditoria) & ", 'AUD-SLICE1', Date(), Date())", dbFailOnError
    p_Db.Execute "INSERT INTO TbNoConformidadesAuditoria " & _
                 "(ID, IDAuditoria, FechaApertura, Numero, DESCRIPCION, CAUSARAIZ, RESPONSABLEIMPLANTACION, RequiereControlEficacia, Tipo, ESTADO, Borrado) VALUES (" & _
                 CStr(p_IDNC) & ", " & CStr(p_IDAuditoria) & ", Date(), " & TestHelper.SqlText(p_Numero) & ", " & TestHelper.SqlText(p_Descripcion) & ", " & _
                 TestHelper.SqlText("Causa slice1") & ", " & TestHelper.SqlText(p_Responsable) & ", 'No', 'Auditoria', 'Abierta', 0)", dbFailOnError
End Sub

Private Sub CleanupSlice1(ByVal p_Db As DAO.Database)
    p_Db.Execute "DELETE FROM TbLogCache WHERE TipoOperacion='" & LOG_OPERATION_AUDIT_FALLBACK & "'", dbFailOnError
    p_Db.Execute "DELETE FROM TbNoConformidadesAuditoria WHERE ID BETWEEN " & CStr(TEST_NC_CACHE_EXPECTED) & " AND " & CStr(TEST_NC_ROW), dbFailOnError
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
