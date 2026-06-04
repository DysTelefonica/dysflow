Attribute VB_Name = "Test_CacheListadoNC_ACAR"
Option Compare Database
Option Explicit

Private Const TEST_ID_BASE As Long = 900090

Public Function Test_CacheListado_ACAR_SearchPipeColumns_Atomic() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim col As Collection
    Dim previousCacheEnabled As Boolean

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_CacheListado_ACAR_SearchPipeColumns_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    If Not EnsureACARSchemaReady(db, logs, errMsg) Then Err.Raise 1000, , errMsg
    previousCacheEnabled = ReadCacheHabilitada(db)
    SetCacheHabilitada db, True
    TestHelper.AddLog logs, "Arrange: CacheHabilitada=True for GetListadoFiltradoSQL search path"
    CleanupCacheRows db
    SeedCacheRow db, TEST_ID_BASE, "AR-PIPE-001", "", "anomalia trazable"
    TestHelper.AddLog logs, "Arrange: seeded one cache row with AR pipe text"

    Set col = GetListadoFiltradoSQL(p_Google:="anomalia", p_Error:=errMsg)
    If errMsg <> "" Then Err.Raise 1000, , errMsg
    If col Is Nothing Then Err.Raise 1000, , "Expected one result collection, got Nothing"
    If col.count <> 1 Then Err.Raise 1000, , "Expected exactly 1 ACAR result, got " & CStr(col.count)

    Test_CacheListado_ACAR_SearchPipeColumns_Atomic = TestHelper.BuildJsonOk(logs, "acar-search")

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then
        CleanupCacheRows db
        SetCacheHabilitada db, previousCacheEnabled
    End If
    TestHelper.EndTestSession logs
    Exit Function
EH:
    Test_CacheListado_ACAR_SearchPipeColumns_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    Resume Cleanup
End Function

Private Function ReadCacheHabilitada(ByVal p_Db As DAO.Database) As Boolean
    Dim rs As DAO.Recordset

    On Error GoTo EH
    Set rs = p_Db.OpenRecordset("SELECT CacheHabilitada FROM TbConfiguracion WHERE ID=1", dbOpenSnapshot)
    If Not rs.EOF Then
        ReadCacheHabilitada = CBool(Nz(rs.Fields("CacheHabilitada").value, False))
    End If

Cleanup:
    On Error Resume Next
    If Not rs Is Nothing Then
        rs.Close
        Set rs = Nothing
    End If
    Exit Function

EH:
    ReadCacheHabilitada = False
    Resume Cleanup
End Function

Private Sub SetCacheHabilitada(ByVal p_Db As DAO.Database, ByVal p_Enabled As Boolean)
    Dim sqlValue As String

    If p_Enabled Then
        sqlValue = "True"
    Else
        sqlValue = "False"
    End If

    p_Db.Execute "UPDATE TbConfiguracion SET CacheHabilitada=" & sqlValue & " WHERE ID=1", dbFailOnError
End Sub

Public Function Test_PipeFlatten_MissingTable_Logs_ACAR_Atomic() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim errMsg As String
    Dim result As String

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_PipeFlatten_MissingTable_Logs_ACAR_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    CleanupLogRows db
    result = PipeFlatten("ZZZ_Missing_ACAR", "Valor", "IDNoConformidad", TEST_ID_BASE, db, errMsg)
    If result <> "" Then Err.Raise 1000, , "Expected empty result for missing table"
    If CountRows(db, "TbLogCache", "IDNoConformidad=" & TEST_ID_BASE & " AND TipoOperacion='PipeFlattenMissingTable'") <> 1 Then
        Err.Raise 1000, , "Expected one PipeFlattenMissingTable log row"
    End If

    Test_PipeFlatten_MissingTable_Logs_ACAR_Atomic = TestHelper.BuildJsonOk(logs, "missing-table-log")

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then CleanupLogRows db
    TestHelper.EndTestSession logs
    Exit Function
EH:
    Test_PipeFlatten_MissingTable_Logs_ACAR_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    Resume Cleanup
End Function

Public Function Test_NCProyectoOperaciones_ACAR_InvalidatesListing_Atomic() As String
    Dim logs As Collection
    Dim db As DAO.Database
    Dim op As NCProyectoOperaciones
    Dim errMsg As String

    On Error GoTo EH
    Set logs = TestHelper.NewLogs()
    If Not TestHelper.BeginTestSession(logs, errMsg) Then
        Test_NCProyectoOperaciones_ACAR_InvalidatesListing_Atomic = TestHelper.BuildJsonFail(errMsg, logs)
        Exit Function
    End If

    Set db = getdb(errMsg)
    If Not EnsureACARSchemaReady(db, logs, errMsg) Then Err.Raise 1000, , errMsg
    CleanupCacheRows db
    SeedCacheRow db, TEST_ID_BASE + 1, "AC-STALE-001", "AC texto", "AR texto"
    TestHelper.AddLog logs, "Arrange: seeded valid listing row"

    Set op = New NCProyectoOperaciones
    op.MarcarListadoStalePorAccion TEST_ID_BASE + 1, errMsg
    If errMsg <> "" Then Err.Raise 1000, , errMsg
    If CountRows(db, "TbCacheListadoNC", "IDNoConformidad=" & (TEST_ID_BASE + 1) & " AND CacheValida=False") <> 1 Then
        Err.Raise 1000, , "Expected CacheValida=False after NCProyectoOperaciones hook"
    End If

    Test_NCProyectoOperaciones_ACAR_InvalidatesListing_Atomic = TestHelper.BuildJsonOk(logs, "stale")

Cleanup:
    On Error Resume Next
    If Not db Is Nothing Then CleanupCacheRows db
    TestHelper.EndTestSession logs
    Exit Function
EH:
    Test_NCProyectoOperaciones_ACAR_InvalidatesListing_Atomic = TestHelper.BuildJsonFail(Err.Description, logs)
    Resume Cleanup
End Function

Private Function EnsureACARSchemaReady(ByVal p_Db As DAO.Database, ByVal p_Logs As Collection, ByRef p_Error As String) As Boolean
    On Error GoTo EH

    p_Error = ""
    EnsureACARSchemaReady = False

    TestHelper.AddLog p_Logs, "Schema-first: invoking production EnsureCacheSchemaReadiness before ACAR fixture inserts"
    If Not EnsureCacheSchemaReadiness(p_Error) Then
        If p_Error = "" Then p_Error = "EnsureCacheSchemaReadiness returned False"
        Exit Function
    End If

    If Not FieldExistsInDb(p_Db, "TbCacheListadoNC", "AccionesCorrectivasConcatenadas") Then
        p_Error = "Schema-first failure: TbCacheListadoNC lacks AccionesCorrectivasConcatenadas after ensure"
        Exit Function
    End If

    If Not FieldExistsInDb(p_Db, "TbCacheListadoNC", "AccionesRealizadasConcatenadas") Then
        p_Error = "Schema-first failure: TbCacheListadoNC lacks AccionesRealizadasConcatenadas after ensure"
        Exit Function
    End If

    TestHelper.AddLog p_Logs, "Schema-first: ACAR LONGTEXT columns present in TbCacheListadoNC"
    EnsureACARSchemaReady = True
    Exit Function

EH:
    p_Error = "EnsureACARSchemaReady: " & Err.Description
    EnsureACARSchemaReady = False
End Function

Private Function FieldExistsInDb(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_FieldName As String) As Boolean
    Dim tdf As DAO.TableDef
    Dim fld As DAO.Field

    On Error GoTo NotFound
    Set tdf = p_Db.TableDefs(p_TableName)
    For Each fld In tdf.Fields
        If StrComp(fld.Name, p_FieldName, vbTextCompare) = 0 Then
            FieldExistsInDb = True
            Exit Function
        End If
    Next fld

    FieldExistsInDb = False
    Exit Function

NotFound:
    FieldExistsInDb = False
End Function

Private Sub SeedCacheRow(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long, ByVal p_Codigo As String, ByVal p_AC As String, ByVal p_AR As String)
    p_Db.Execute "INSERT INTO TbCacheListadoNC " & _
                 "(IDNoConformidad, CodigoNoConformidad, Descripcion, Notas, CacheValida, FechaCache, Version, AccionesCorrectivasConcatenadas, AccionesRealizadasConcatenadas) VALUES (" & _
                 CStr(p_IDNC) & ", " & TestHelper.SqlText(p_Codigo) & ", '', '', True, Now(), 1, " & _
                 TestHelper.SqlText(p_AC) & ", " & TestHelper.SqlText(p_AR) & ")", dbFailOnError
End Sub

Private Sub CleanupCacheRows(ByVal p_Db As DAO.Database)
    p_Db.Execute "DELETE FROM TbCacheListadoNC WHERE IDNoConformidad BETWEEN " & TEST_ID_BASE & " AND " & (TEST_ID_BASE + 20), dbFailOnError
End Sub

Private Sub CleanupLogRows(ByVal p_Db As DAO.Database)
    p_Db.Execute "DELETE FROM TbLogCache WHERE IDNoConformidad BETWEEN " & TEST_ID_BASE & " AND " & (TEST_ID_BASE + 20) & " AND TipoOperacion='PipeFlattenMissingTable'", dbFailOnError
End Sub

Private Function CountRows(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_Where As String) As Long
    Dim rs As DAO.Recordset
    Set rs = p_Db.OpenRecordset("SELECT COUNT(*) AS C FROM " & p_TableName & " WHERE " & p_Where, dbOpenSnapshot)
    CountRows = CLng(rs!C)
    rs.Close
    Set rs = Nothing
End Function
