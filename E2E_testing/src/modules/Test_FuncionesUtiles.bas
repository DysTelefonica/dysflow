Attribute VB_Name = "Test_FuncionesUtiles"
Option Compare Database
Option Explicit

' =============================================================================
' Test_FuncionesUtiles — TDD RED phase scaffold
' Tests for getExpedienteEsDerivable
' =============================================================================

Private Function NextE2ETestExpedienteId(ByVal p_Db As DAO.Database) As Long
    Static nextId As Long
    Dim rs As DAO.Recordset

    If nextId = 0 Then
        Set rs = p_Db.OpenRecordset("SELECT MAX(IDExpediente) AS MaxId FROM TbExpedientes", dbOpenSnapshot)
        If rs.EOF Or IsNull(rs.Fields("MaxId").value) Then
            nextId = 900000
        Else
            nextId = CLng(rs.Fields("MaxId").value) + 100000
        End If
        rs.Close
        Set rs = Nothing
    Else
        nextId = nextId + 1
    End If

    NextE2ETestExpedienteId = nextId
End Function

Private Function NextE2ETestOrdinal(ByVal p_Db As DAO.Database) As Long
    Dim rs As DAO.Recordset
    Dim maxOrdinal As Long

    Set rs = p_Db.OpenRecordset("SELECT MAX(OrdinalE2E) AS MaxOrdinalE2E FROM TbExpedientes WHERE OrdinalE2E IS NOT NULL", dbOpenSnapshot)
    If Not rs.EOF Then
        If Not IsNull(rs.Fields("MaxOrdinalE2E").value) Then
            maxOrdinal = CLng(rs.Fields("MaxOrdinalE2E").value)
        End If
    End If
    rs.Close
    Set rs = Nothing

    NextE2ETestOrdinal = maxOrdinal + 1000
End Function

Private Function CountE2EExportableRows(ByVal p_Db As DAO.Database) As Long
    Dim rs As DAO.Recordset

    Set rs = p_Db.OpenRecordset("SELECT COUNT(*) AS Cnt FROM TbExpedientes WHERE OrdinalE2E IS NOT NULL", dbOpenSnapshot)
    If Not rs.EOF Then CountE2EExportableRows = CLng(rs.Fields("Cnt").value)
    rs.Close
    Set rs = Nothing
End Function

Private Function E2ETextFlagScalarKeys() As Variant
    E2ETextFlagScalarKeys = Array( _
        "esam", "eslote", "esbasado", "esexpediente", "ordinal", "accesosharepoint", _
        "observaciones", "ambito", "npedido", "adjudicado", "enperiododeadjudicacion", _
        "tipo", "garantiameses", "estado", "objetocontrato", "gradoclasificacion", "organocontratacion")
End Function

Private Function CanonicalExpedienteRootKeys() As Variant
    CanonicalExpedienteRootKeys = Array( _
        "idexpediente", "idexpedientepadre", "OrdinalE2E", "nemotecnico", "titulo", "importelicitacion", "importecontratacion", _
        "codproyecto", "codexp", "codexplargo", "cods4h", "fechainiciocontrato", "fechafincontrato", "fechafingarantia", _
        "esam", "eslote", "esbasado", "esexpediente", "ordinal", "accesosharepoint", "observaciones", "ambito", "npedido", _
        "adjudicado", "enperiododeadjudicacion", "tipo", "fechapreoferta", "fechainiciolicitacion", "fechaoferta", "fechaadjudicacion", _
        "fechafirmacontrato", "garantiameses", "fechacertificacion", "fechaperdida", "fechadesestimada", "estado", "objetocontrato", _
        "gradoclasificacion", "organocontratacion", "responsableCalidad", "responsableSeguridad", "anualidades", "comerciales", _
        "lugaresEjecucion", "pecal", "racs", "responsables", "suministradores", "modificados", "hitos")
End Function

Private Function HasOnlyKeys(ByVal p_Row As Object, ByVal p_Keys As Variant) As Boolean
    Dim key As Variant
    If p_Row.Count <> (UBound(p_Keys) - LBound(p_Keys) + 1) Then Exit Function
    For Each key In p_Keys
        If Not p_Row.exists(CStr(key)) Then Exit Function
    Next key
    HasOnlyKeys = True
End Function

Private Function HasAllKeys(ByVal p_Row As Object, ByVal p_Keys As Variant) As Boolean
    Dim key As Variant
    For Each key In p_Keys
        If Not p_Row.exists(CStr(key)) Then
            HasAllKeys = False
            Exit Function
        End If
    Next key
    HasAllKeys = True
End Function

Private Function AllKeysAreJsonNull(ByVal p_Row As Object, ByVal p_Keys As Variant) As Boolean
    Dim key As Variant
    For Each key In p_Keys
        If Not IsNull(p_Row(CStr(key))) Then
            AllKeysAreJsonNull = False
            Exit Function
        End If
    Next key
    AllKeysAreJsonNull = True
End Function

Private Function CanonicalFixturePath() As String
    CanonicalFixturePath = CurrentProject.Path & "\\expedientes_relacion.json"
End Function

Private Function BuildDeterministicExpedienteIdCsv(ByVal p_Db As DAO.Database, ByVal p_TopN As Long, ByRef p_Error As String) As String
    On Error GoTo EH

    Dim rs As DAO.Recordset
    Dim sql As String
    Dim csv As String

    If p_TopN <= 0 Then p_TopN = 3

    sql = "SELECT TOP " & p_TopN & " IDExpediente FROM TbExpedientes " & _
          "WHERE OrdinalE2E IS NOT NULL ORDER BY IDExpediente"
    Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)

    Do While Not rs.EOF
        csv = csv & IIf(csv = "", "", ",") & CStr(rs!IDExpediente)
        rs.MoveNext
    Loop
    rs.Close
    Set rs = Nothing

    If csv = "" Then
        sql = "SELECT TOP " & p_TopN & " IDExpediente FROM TbExpedientes ORDER BY IDExpediente"
        Set rs = p_Db.OpenRecordset(sql, dbOpenSnapshot)
        Do While Not rs.EOF
            csv = csv & IIf(csv = "", "", ",") & CStr(rs!IDExpediente)
            rs.MoveNext
        Loop
        rs.Close
        Set rs = Nothing
    End If

    If csv = "" Then
        p_Error = "TESTS BLOCKED: no hay expedientes en TbExpedientes para validar contrato E2E"
        BuildDeterministicExpedienteIdCsv = ""
        Exit Function
    End If

    BuildDeterministicExpedienteIdCsv = csv
    Exit Function

EH:
    p_Error = "error obteniendo IDs determinísticos E2E: " & Err.Description
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    BuildDeterministicExpedienteIdCsv = ""
End Function

Private Function CompareKeysetExact(ByVal p_Expected As Object, ByVal p_Actual As Object) As Boolean
    Dim key As Variant

    If p_Expected.Count <> p_Actual.Count Then Exit Function
    For Each key In p_Expected.keys
        If Not p_Actual.exists(CStr(key)) Then Exit Function
    Next key
    CompareKeysetExact = True
End Function

Private Function CompareJsonStructureRecursive(ByVal p_Expected As Variant, ByVal p_Actual As Variant, ByRef p_Error As String, ByVal p_Path As String) As Boolean
    Dim expectedType As String
    Dim actualType As String
    Dim key As Variant
    Dim expectedObj As Object
    Dim actualObj As Object
    Dim expectedArr As Collection
    Dim actualArr As Collection

    expectedType = TypeName(p_Expected)
    actualType = TypeName(p_Actual)

    If expectedType = "Dictionary" Then
        If actualType <> "Dictionary" Then
            p_Error = p_Path & ": expected object, got " & actualType
            Exit Function
        End If

        Set expectedObj = p_Expected
        Set actualObj = p_Actual
        If Not CompareKeysetExact(expectedObj, actualObj) Then
            p_Error = p_Path & ": keyset mismatch"
            Exit Function
        End If

        For Each key In expectedObj.keys
            If Not CompareJsonStructureRecursive(expectedObj(CStr(key)), actualObj(CStr(key)), p_Error, p_Path & "." & CStr(key)) Then Exit Function
        Next key

        CompareJsonStructureRecursive = True
        Exit Function
    End If

    If expectedType = "Collection" Then
        If actualType <> "Collection" Then
            p_Error = p_Path & ": expected array, got " & actualType
            Exit Function
        End If

        Set expectedArr = p_Expected
        Set actualArr = p_Actual

        ' Contract for arrays: key/container must exist and be array-like.
        ' Cardinality is intentionally not enforced.
        If actualArr.Count = 0 Then
            ' Generated array empty: pass container contract without forcing keyset checks.
            CompareJsonStructureRecursive = True
            Exit Function
        End If

        If expectedArr.Count = 0 Then
            ' Fixture limitation: canonical array has no representative item.
            ' Skip item-level structure comparison to avoid false negatives.
            CompareJsonStructureRecursive = True
            Exit Function
        End If

        ' Both have representative items: compare nested item structure/key/casing.
        If Not CompareJsonStructureRecursive(expectedArr(1), actualArr(1), p_Error, p_Path & "[1]") Then Exit Function

        CompareJsonStructureRecursive = True
        Exit Function
    End If

    CompareJsonStructureRecursive = True
End Function

Private Function ReadUtf8TextFile(ByVal p_FilePath As String, ByRef p_Error As String) As String
    On Error GoTo EH

    Dim stream As Object
    Set stream = CreateObject("ADODB.Stream")
    stream.Open
    stream.Type = 2
    stream.Charset = "utf-8"
    stream.LoadFromFile p_FilePath
    ReadUtf8TextFile = stream.ReadText
    stream.Close
    Set stream = Nothing
    Exit Function

EH:
    p_Error = "read fixture failed: " & Err.Description
    On Error Resume Next
    If Not stream Is Nothing Then stream.Close
    Set stream = Nothing
End Function

' -----------------------------------------------------------------------
' Test_FuncionesUtiles_getExpedienteEsDerivable_AM_is_Si
' -----------------------------------------------------------------------
Public Function Test_FuncionesUtiles_getExpedienteEsDerivable_AM_is_Si() As String
    Dim logs As String
    logs = ""

    Dim result As EnumSiNo
    Dim p_Error As String
    p_Error = ""
    result = getExpedienteEsDerivable(EnumTipoExpediente.AM, p_Error)

    If p_Error <> "" Then
        Test_FuncionesUtiles_getExpedienteEsDerivable_AM_is_Si = JsonOK(False, "unexpected error: " & p_Error, logs)
        Exit Function
    End If

    If result = EnumSiNo.Sí Then
        Test_FuncionesUtiles_getExpedienteEsDerivable_AM_is_Si = JsonOK(True, "AM is derivable", logs)
    Else
        Test_FuncionesUtiles_getExpedienteEsDerivable_AM_is_Si = JsonOK(False, "AM should be derivable but got " & result, logs)
    End If
End Function

' -----------------------------------------------------------------------
' Test_Expediente_OrdinalE2E_DefaultIsNull
' -----------------------------------------------------------------------
Public Function Test_Expediente_OrdinalE2E_DefaultIsNull() As String
    Dim exp As Expediente
    Set exp = New Expediente

    If IsNull(exp.OrdinalE2E) Then
        Test_Expediente_OrdinalE2E_DefaultIsNull = JsonOK(True, "default is Null", "")
    Else
        Test_Expediente_OrdinalE2E_DefaultIsNull = JsonOK(False, "default should be Null", "")
    End If
End Function

' -----------------------------------------------------------------------
' Test_Expediente_OrdinalE2E_LetAcceptsNull
' -----------------------------------------------------------------------
Public Function Test_Expediente_OrdinalE2E_LetAcceptsNull() As String
    Dim exp As Expediente
    Set exp = New Expediente

    exp.OrdinalE2E = Null

    If IsNull(exp.OrdinalE2E) Then
        Test_Expediente_OrdinalE2E_LetAcceptsNull = JsonOK(True, "null accepted", "")
    Else
        Test_Expediente_OrdinalE2E_LetAcceptsNull = JsonOK(False, "null should be preserved", "")
    End If
End Function

' -----------------------------------------------------------------------
' Test_Expediente_OrdinalE2E_LetAcceptsNumericAndReturnsLong
' -----------------------------------------------------------------------
Public Function Test_Expediente_OrdinalE2E_LetAcceptsNumericAndReturnsLong() As String
    Dim exp As Expediente
    Set exp = New Expediente

    exp.OrdinalE2E = "12"

    If IsNull(exp.OrdinalE2E) Then
        Test_Expediente_OrdinalE2E_LetAcceptsNumericAndReturnsLong = JsonOK(False, "expected Long value", "")
        Exit Function
    End If

    If CLng(exp.OrdinalE2E) = 12 Then
        Test_Expediente_OrdinalE2E_LetAcceptsNumericAndReturnsLong = JsonOK(True, "numeric accepted as Long", "")
    Else
        Test_Expediente_OrdinalE2E_LetAcceptsNumericAndReturnsLong = JsonOK(False, "unexpected numeric conversion", "")
    End If
End Function

' -----------------------------------------------------------------------
' Test_Expediente_SetPropiedad_OrdinalE2E_MapsCorrectly
' -----------------------------------------------------------------------
Public Function Test_Expediente_SetPropiedad_OrdinalE2E_MapsCorrectly() As String
    Dim exp As Expediente
    Dim errMsg As String
    Set exp = New Expediente

    errMsg = ""
    exp.SetPropiedad "OrdinalE2E", 21, errMsg

    If errMsg <> "" Then
        Test_Expediente_SetPropiedad_OrdinalE2E_MapsCorrectly = JsonOK(False, "unexpected error: " & errMsg, "")
        Exit Function
    End If

    If CLng(exp.OrdinalE2E) = 21 Then
        Test_Expediente_SetPropiedad_OrdinalE2E_MapsCorrectly = JsonOK(True, "SetPropiedad maps OrdinalE2E", "")
    Else
        Test_Expediente_SetPropiedad_OrdinalE2E_MapsCorrectly = JsonOK(False, "SetPropiedad did not map OrdinalE2E", "")
    End If
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteE2EUtils_GetMaxOrdinalE2E_ReturnsHighestIgnoringNull
' -----------------------------------------------------------------------
Public Function Test_ExpedienteE2EUtils_GetMaxOrdinalE2E_ReturnsHighestIgnoringNull() As String
    On Error GoTo EH

    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim p_Error As String
    Dim maxVal As Long
    Dim baseOrdinal As Long
    Dim testId1 As Long
    Dim testId2 As Long
    Dim testId3 As Long

    p_Error = ""
    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Test_ExpedienteE2EUtils_GetMaxOrdinalE2E_ReturnsHighestIgnoringNull = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    testId1 = NextE2ETestExpedienteId(db)
    testId2 = NextE2ETestExpedienteId(db)
    testId3 = NextE2ETestExpedienteId(db)
    baseOrdinal = NextE2ETestOrdinal(db)

    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E) VALUES (" & testId1 & ", " & baseOrdinal & ")", dbFailOnError
    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E) VALUES (" & testId2 & ", Null)", dbFailOnError
    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E) VALUES (" & testId3 & ", " & (baseOrdinal + 6) & ")", dbFailOnError

    p_Error = ""
    maxVal = GetMaxOrdinalE2E(p_Error)

    db.Execute "DELETE FROM TbExpedientes WHERE IDExpediente IN (" & testId1 & "," & testId2 & "," & testId3 & ")", dbFailOnError

    If p_Error <> "" Then
        Test_ExpedienteE2EUtils_GetMaxOrdinalE2E_ReturnsHighestIgnoringNull = JsonOK(False, "unexpected error: " & p_Error, "")
        Exit Function
    End If

    If maxVal >= (baseOrdinal + 6) Then
        Test_ExpedienteE2EUtils_GetMaxOrdinalE2E_ReturnsHighestIgnoringNull = JsonOK(True, "max ordinal returned", "")
    Else
        Test_ExpedienteE2EUtils_GetMaxOrdinalE2E_ReturnsHighestIgnoringNull = JsonOK(False, "expected max >= test ordinal", "")
    End If
    Exit Function
EH:
    On Error Resume Next
    If Not db Is Nothing Then db.Execute "DELETE FROM TbExpedientes WHERE IDExpediente IN (" & testId1 & "," & testId2 & "," & testId3 & ")"
    Test_ExpedienteE2EUtils_GetMaxOrdinalE2E_ReturnsHighestIgnoringNull = JsonOK(False, "dao setup failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteE2EUtils_ValidateOrdinalE2EUniqueness_Cases
' -----------------------------------------------------------------------
Public Function Test_ExpedienteE2EUtils_ValidateOrdinalE2EUniqueness_Cases() As String
    On Error GoTo EH

    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim p_Error As String
    Dim testId1 As Long
    Dim testId2 As Long
    Dim uniqueOk As Boolean
    Dim duplicateKo As Boolean
    Dim sameExpOk As Boolean
    Dim zeroOk As Boolean
    Dim duplicateOrdinal As Long
    Dim uniqueOrdinal As Long

    p_Error = ""
    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Test_ExpedienteE2EUtils_ValidateOrdinalE2EUniqueness_Cases = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    testId1 = NextE2ETestExpedienteId(db)
    testId2 = NextE2ETestExpedienteId(db)
    duplicateOrdinal = NextE2ETestOrdinal(db)
    uniqueOrdinal = duplicateOrdinal + 1

    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E) VALUES (" & testId1 & ", " & duplicateOrdinal & ")", dbFailOnError
    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E) VALUES (" & testId2 & ", Null)", dbFailOnError

    p_Error = ""
    uniqueOk = ValidateOrdinalE2EUniqueness(testId2, uniqueOrdinal, p_Error)
    If p_Error <> "" Then GoTo ASSERT_FAIL

    p_Error = ""
    duplicateKo = ValidateOrdinalE2EUniqueness(testId2, duplicateOrdinal, p_Error)
    If p_Error <> "" Then GoTo ASSERT_FAIL

    p_Error = ""
    sameExpOk = ValidateOrdinalE2EUniqueness(testId1, duplicateOrdinal, p_Error)
    If p_Error <> "" Then GoTo ASSERT_FAIL

    p_Error = ""
    zeroOk = ValidateOrdinalE2EUniqueness(testId2, 0, p_Error)
    If p_Error <> "" Then GoTo ASSERT_FAIL

    db.Execute "DELETE FROM TbExpedientes WHERE IDExpediente IN (" & testId1 & "," & testId2 & ")", dbFailOnError

    If uniqueOk And (Not duplicateKo) And sameExpOk And zeroOk Then
        Test_ExpedienteE2EUtils_ValidateOrdinalE2EUniqueness_Cases = JsonOK(True, "uniqueness behavior ok", "")
    Else
        Test_ExpedienteE2EUtils_ValidateOrdinalE2EUniqueness_Cases = JsonOK(False, "unexpected uniqueness behavior", "")
    End If
    Exit Function

ASSERT_FAIL:
    db.Execute "DELETE FROM TbExpedientes WHERE IDExpediente IN (" & testId1 & "," & testId2 & ")", dbFailOnError
    Test_ExpedienteE2EUtils_ValidateOrdinalE2EUniqueness_Cases = JsonOK(False, "unexpected error: " & p_Error, "")
    Exit Function

EH:
    On Error Resume Next
    If Not db Is Nothing Then db.Execute "DELETE FROM TbExpedientes WHERE IDExpediente IN (" & testId1 & "," & testId2 & ")"
    Test_ExpedienteE2EUtils_ValidateOrdinalE2EUniqueness_Cases = JsonOK(False, "dao setup failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_Constructor_getExpediente_OrdinalE2E_NullDbMapsToNull
' -----------------------------------------------------------------------
Public Function Test_Constructor_getExpediente_OrdinalE2E_NullDbMapsToNull() As String
    On Error GoTo EH

    Dim db As DAO.Database
    Dim exp As Expediente
    Dim p_Error As String
    Dim testId As Long

    p_Error = ""
    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Test_Constructor_getExpediente_OrdinalE2E_NullDbMapsToNull = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    testId = NextE2ETestExpedienteId(db)

    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E) VALUES (" & testId & ", Null)", dbFailOnError

    Set exp = constructor.getExpediente(p_IDExpediente:=CStr(testId), p_Error:=p_Error)

    db.Execute "DELETE FROM TbExpedientes WHERE IDExpediente=" & testId, dbFailOnError

    If p_Error <> "" Then
        Test_Constructor_getExpediente_OrdinalE2E_NullDbMapsToNull = JsonOK(False, "unexpected error: " & p_Error, "")
        Exit Function
    End If

    If exp Is Nothing Then
        Test_Constructor_getExpediente_OrdinalE2E_NullDbMapsToNull = JsonOK(False, "expected expediente", "")
    ElseIf IsNull(exp.OrdinalE2E) Then
        Test_Constructor_getExpediente_OrdinalE2E_NullDbMapsToNull = JsonOK(True, "Null DB maps to Null object property", "")
    Else
        Test_Constructor_getExpediente_OrdinalE2E_NullDbMapsToNull = JsonOK(False, "expected OrdinalE2E Null", "")
    End If
    Exit Function

EH:
    On Error Resume Next
    If Not db Is Nothing Then db.Execute "DELETE FROM TbExpedientes WHERE IDExpediente=" & testId
    Test_Constructor_getExpediente_OrdinalE2E_NullDbMapsToNull = JsonOK(False, "dao setup failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_FuncionesUtiles_getExpedienteEsDerivable_regular_is_No
' -----------------------------------------------------------------------
Public Function Test_FuncionesUtiles_getExpedienteEsDerivable_regular_is_No() As String
    Dim logs As String
    logs = ""

    Dim result As EnumSiNo
    Dim p_Error As String
    p_Error = ""
    result = getExpedienteEsDerivable(EnumTipoExpediente.EXPIndividual, p_Error)

    If p_Error <> "" Then
        Test_FuncionesUtiles_getExpedienteEsDerivable_regular_is_No = JsonOK(False, "unexpected error: " & p_Error, logs)
        Exit Function
    End If

    If result = EnumSiNo.No Then
        Test_FuncionesUtiles_getExpedienteEsDerivable_regular_is_No = JsonOK(True, "EXPIndividual is not derivable", logs)
    Else
        Test_FuncionesUtiles_getExpedienteEsDerivable_regular_is_No = JsonOK(False, "EXPIndividual should NOT be derivable but got " & result, logs)
    End If
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteJsonExporter_ExportAllE2E_ReturnsMetaAndDataTopLevel
' -----------------------------------------------------------------------
Public Function Test_ExpedienteJsonExporter_ExportAllE2E_ReturnsMetaAndDataTopLevel() As String
    On Error GoTo EH

    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim p_Error As String
    Dim generatedAt As String
    Dim jsonText As String
    Dim parsed As Object
    Dim meta As Object
    Dim dataCol As Collection
    Dim testId As Long
    Dim testOrdinal As Long
    Dim baselineCount As Long
    Dim inTransaction As Boolean

    p_Error = ""
    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_ReturnsMetaAndDataTopLevel = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    testId = NextE2ETestExpedienteId(db)
    testOrdinal = NextE2ETestOrdinal(db)
    baselineCount = CountE2EExportableRows(db)
    Set ws = getWorkspace(p_Error)
    If p_Error <> "" Or ws Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_ReturnsMetaAndDataTopLevel = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    ws.BeginTrans
    inTransaction = True
    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E, Nemotecnico, Titulo) VALUES (" & testId & ", " & testOrdinal & ", 'E2E-SHAPE', 'Shape contract')", dbFailOnError

    generatedAt = "2030-01-01T00:00:00Z"
    p_Error = ""
    jsonText = ExportAllE2E(generatedAt, p_Error)

    ws.Rollback
    inTransaction = False

    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_ExportAllE2E_ReturnsMetaAndDataTopLevel = JsonOK(False, "unexpected exporter error: " & p_Error, "")
        Exit Function
    End If

    Set parsed = JsonConverter.ParseJson(jsonText)
    If (Not parsed.exists("meta")) Or (Not parsed.exists("data")) Then
        Test_ExpedienteJsonExporter_ExportAllE2E_ReturnsMetaAndDataTopLevel = JsonOK(False, "expected top-level meta and data keys", "")
        Exit Function
    End If

    Set dataCol = parsed("data")
    Set meta = parsed("meta")
    If dataCol Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_ReturnsMetaAndDataTopLevel = JsonOK(False, "data must be a JSON array", "")
        Exit Function
    End If

    If meta.Count <> 5 Then
        Test_ExpedienteJsonExporter_ExportAllE2E_ReturnsMetaAndDataTopLevel = JsonOK(False, "meta must contain exactly 5 keys", "")
        Exit Function
    End If

    If (Not meta.exists("apiVersion")) Or (Not meta.exists("generatedAt")) Or (Not meta.exists("generator")) Or (Not meta.exists("user")) Or (Not meta.exists("totalExpedientes")) Then
        Test_ExpedienteJsonExporter_ExportAllE2E_ReturnsMetaAndDataTopLevel = JsonOK(False, "meta keyset mismatch", "")
        Exit Function
    End If

    If meta("generatedAt") <> generatedAt Then
        Test_ExpedienteJsonExporter_ExportAllE2E_ReturnsMetaAndDataTopLevel = JsonOK(False, "generatedAt must preserve injected timestamp", "")
        Exit Function
    End If

    If CLng(meta("totalExpedientes")) <> baselineCount + 1 Then
        Test_ExpedienteJsonExporter_ExportAllE2E_ReturnsMetaAndDataTopLevel = JsonOK(False, "meta.totalExpedientes must include seeded E2E row", "")
        Exit Function
    End If

    Test_ExpedienteJsonExporter_ExportAllE2E_ReturnsMetaAndDataTopLevel = JsonOK(True, "meta+data top-level canonical shape is present", "")
    Exit Function

EH:
    On Error Resume Next
    If inTransaction Then ws.Rollback
    Test_ExpedienteJsonExporter_ExportAllE2E_ReturnsMetaAndDataTopLevel = JsonOK(False, "dao/setup failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteJsonExporter_ExportAllE2E_FiltersOrdinalE2ENullRows
' -----------------------------------------------------------------------
Public Function Test_ExpedienteJsonExporter_ExportAllE2E_FiltersOrdinalE2ENullRows() As String
    On Error GoTo EH

    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim p_Error As String
    Dim jsonText As String
    Dim parsed As Object
    Dim dataCol As Collection
    Dim row As Variant
    Dim includeId As Long
    Dim excludeId As Long
    Dim includeOrdinal As Long
    Dim foundIncluded As Boolean
    Dim foundExcluded As Boolean
    Dim inTransaction As Boolean

    p_Error = ""
    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_FiltersOrdinalE2ENullRows = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    includeId = NextE2ETestExpedienteId(db)
    excludeId = NextE2ETestExpedienteId(db)
    includeOrdinal = NextE2ETestOrdinal(db)

    Set ws = getWorkspace(p_Error)
    If p_Error <> "" Or ws Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_FiltersOrdinalE2ENullRows = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    ws.BeginTrans
    inTransaction = True

    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E, Nemotecnico, Titulo) VALUES (" & includeId & ", " & includeOrdinal & ", 'E2E-FILTER-IN', 'Included row')", dbFailOnError
    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E, Nemotecnico, Titulo) VALUES (" & excludeId & ", Null, 'E2E-FILTER-OUT', 'Excluded row')", dbFailOnError

    p_Error = ""
    jsonText = ExportAllE2E("2030-01-01T00:00:00Z", p_Error)

    ws.Rollback
    inTransaction = False

    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_ExportAllE2E_FiltersOrdinalE2ENullRows = JsonOK(False, "unexpected exporter error: " & p_Error, "")
        Exit Function
    End If

    Set parsed = JsonConverter.ParseJson(jsonText)
    Set dataCol = parsed("data")
    For Each row In dataCol
        If CLng(row("idexpediente")) = includeId Then foundIncluded = True
        If CLng(row("idexpediente")) = excludeId Then foundExcluded = True
    Next row

    If foundIncluded And (Not foundExcluded) Then
        Test_ExpedienteJsonExporter_ExportAllE2E_FiltersOrdinalE2ENullRows = JsonOK(True, "filter excludes OrdinalE2E null rows", "")
    Else
        Test_ExpedienteJsonExporter_ExportAllE2E_FiltersOrdinalE2ENullRows = JsonOK(False, "OrdinalE2E filter mismatch", "")
    End If
    Exit Function

EH:
    On Error Resume Next
    If inTransaction Then ws.Rollback
    Test_ExpedienteJsonExporter_ExportAllE2E_FiltersOrdinalE2ENullRows = JsonOK(False, "dao/setup failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteJsonExporter_ExportAllE2E_IncludesRequiredScalarKeys
' -----------------------------------------------------------------------
Public Function Test_ExpedienteJsonExporter_ExportAllE2E_IncludesRequiredScalarKeys() As String
    On Error GoTo EH

    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim p_Error As String
    Dim jsonText As String
    Dim parsed As Object
    Dim dataCol As Collection
    Dim row As Object
    Dim testId As Long
    Dim testOrdinal As Long
    Dim inTransaction As Boolean
    Dim expectedKeys As Variant

    p_Error = ""
    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_IncludesRequiredScalarKeys = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    testId = NextE2ETestExpedienteId(db)
    testOrdinal = NextE2ETestOrdinal(db)
    expectedKeys = CanonicalExpedienteRootKeys()

    Set ws = getWorkspace(p_Error)
    If p_Error <> "" Or ws Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_IncludesRequiredScalarKeys = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    ws.BeginTrans
    inTransaction = True
    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E, Nemotecnico, Titulo, IDExpedientePadre, ImporteLicitacion, ImporteContratacion, CodProyecto, CodExp, CodExpLargo, CodS4H) VALUES (" & _
               testId & ", " & testOrdinal & ", 'E2E-KEYS', 'Keys contract', " & (testId - 1) & ", 1234.56, 7890.12, 'PRJ-001', 'EXP-001', 'EXP-001-LONG', 'S4H-001')", dbFailOnError

    p_Error = ""
    jsonText = ExportAllE2E("2030-01-01T00:00:00Z", p_Error)

    ws.Rollback
    inTransaction = False

    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_ExportAllE2E_IncludesRequiredScalarKeys = JsonOK(False, "unexpected exporter error: " & p_Error, "")
        Exit Function
    End If

    Set parsed = JsonConverter.ParseJson(jsonText)
    Set dataCol = parsed("data")

    For Each row In dataCol
        If CLng(row("idexpediente")) = testId Then
            If HasOnlyKeys(row, expectedKeys) And (Not row.exists("ordinale2e")) Then
                Test_ExpedienteJsonExporter_ExportAllE2E_IncludesRequiredScalarKeys = JsonOK(True, "expediente root keyset/casing matches canonical without extras", "")
            Else
                Test_ExpedienteJsonExporter_ExportAllE2E_IncludesRequiredScalarKeys = JsonOK(False, "root keyset mismatch or non-canonical ordinale2e detected", "")
            End If
            Exit Function
        End If
    Next row

    Test_ExpedienteJsonExporter_ExportAllE2E_IncludesRequiredScalarKeys = JsonOK(False, "seeded row was not exported", "")
    Exit Function

EH:
    On Error Resume Next
    If inTransaction Then ws.Rollback
    Test_ExpedienteJsonExporter_ExportAllE2E_IncludesRequiredScalarKeys = JsonOK(False, "dao/setup failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteJsonExporter_ExportAllE2E_SerializesNullScalarsAsJsonNull
' -----------------------------------------------------------------------
Public Function Test_ExpedienteJsonExporter_ExportAllE2E_SerializesNullScalarsAsJsonNull() As String
    On Error GoTo EH

    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim p_Error As String
    Dim jsonText As String
    Dim parsed As Object
    Dim dataCol As Collection
    Dim row As Object
    Dim testId As Long
    Dim testOrdinal As Long
    Dim inTransaction As Boolean

    p_Error = ""
    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_SerializesNullScalarsAsJsonNull = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    testId = NextE2ETestExpedienteId(db)
    testOrdinal = NextE2ETestOrdinal(db)

    Set ws = getWorkspace(p_Error)
    If p_Error <> "" Or ws Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_SerializesNullScalarsAsJsonNull = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    ws.BeginTrans
    inTransaction = True
    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E, Nemotecnico, Titulo, IDExpedientePadre, ImporteLicitacion, ImporteContratacion, CodProyecto, CodExp, CodExpLargo, CodS4H) VALUES (" & _
               testId & ", " & testOrdinal & ", Null, Null, Null, Null, Null, Null, Null, Null, Null)", dbFailOnError

    p_Error = ""
    jsonText = ExportAllE2E("2030-01-01T00:00:00Z", p_Error)

    ws.Rollback
    inTransaction = False

    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_ExportAllE2E_SerializesNullScalarsAsJsonNull = JsonOK(False, "unexpected exporter error: " & p_Error, "")
        Exit Function
    End If

    Set parsed = JsonConverter.ParseJson(jsonText)
    Set dataCol = parsed("data")

    For Each row In dataCol
        If CLng(row("idexpediente")) = testId Then
            If IsNull(row("nemotecnico")) And IsNull(row("titulo")) And IsNull(row("idexpedientepadre")) And _
               IsNull(row("importelicitacion")) And IsNull(row("importecontratacion")) And IsNull(row("codproyecto")) And _
               IsNull(row("codexp")) And IsNull(row("codexplargo")) And IsNull(row("cods4h")) Then
                Test_ExpedienteJsonExporter_ExportAllE2E_SerializesNullScalarsAsJsonNull = JsonOK(True, "null scalars serialized as JSON null", "")
            Else
                Test_ExpedienteJsonExporter_ExportAllE2E_SerializesNullScalarsAsJsonNull = JsonOK(False, "expected null nemotecnico/titulo", "")
            End If
            Exit Function
        End If
    Next row

    Test_ExpedienteJsonExporter_ExportAllE2E_SerializesNullScalarsAsJsonNull = JsonOK(False, "seeded row was not exported", "")
    Exit Function

EH:
    On Error Resume Next
    If inTransaction Then ws.Rollback
    Test_ExpedienteJsonExporter_ExportAllE2E_SerializesNullScalarsAsJsonNull = JsonOK(False, "dao/setup failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteJsonExporter_ExportAllE2E_MapsScalarValuesWithTypes
' -----------------------------------------------------------------------
Public Function Test_ExpedienteJsonExporter_ExportAllE2E_MapsScalarValuesWithTypes() As String
    On Error GoTo EH

    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim p_Error As String
    Dim jsonText As String
    Dim parsed As Object
    Dim dataCol As Collection
    Dim row As Object
    Dim testId As Long
    Dim testOrdinal As Long
    Dim inTransaction As Boolean

    p_Error = ""
    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_MapsScalarValuesWithTypes = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    testId = NextE2ETestExpedienteId(db)
    testOrdinal = NextE2ETestOrdinal(db)

    Set ws = getWorkspace(p_Error)
    If p_Error <> "" Or ws Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_MapsScalarValuesWithTypes = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    ws.BeginTrans
    inTransaction = True
    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E, Nemotecnico, Titulo, IDExpedientePadre, ImporteLicitacion, ImporteContratacion, CodProyecto, CodExp, CodExpLargo, CodS4H) VALUES (" & _
               testId & ", " & testOrdinal & ", 'E2E-TYPES', 'Types contract', " & (testId - 10) & ", 4321.5, 9876.25, 'PROJ-T', 'EXP-T', 'EXP-T-LONG', 'S4H-T')", dbFailOnError

    p_Error = ""
    jsonText = ExportAllE2E("2030-01-01T00:00:00Z", p_Error)

    ws.Rollback
    inTransaction = False

    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_ExportAllE2E_MapsScalarValuesWithTypes = JsonOK(False, "unexpected exporter error: " & p_Error, "")
        Exit Function
    End If

    Set parsed = JsonConverter.ParseJson(jsonText)
    Set dataCol = parsed("data")

    For Each row In dataCol
        If CLng(row("idexpediente")) = testId Then
            If IsNumeric(row("importelicitacion")) And IsNumeric(row("importecontratacion")) And _
               CStr(row("codproyecto")) = "PROJ-T" And CStr(row("codexp")) = "EXP-T" And _
               CStr(row("codexplargo")) = "EXP-T-LONG" And CStr(row("cods4h")) = "S4H-T" Then
                Test_ExpedienteJsonExporter_ExportAllE2E_MapsScalarValuesWithTypes = JsonOK(True, "scalar values preserve numeric and string fidelity", "")
            Else
                Test_ExpedienteJsonExporter_ExportAllE2E_MapsScalarValuesWithTypes = JsonOK(False, "scalar fidelity mismatch", "")
            End If
            Exit Function
        End If
    Next row

    Test_ExpedienteJsonExporter_ExportAllE2E_MapsScalarValuesWithTypes = JsonOK(False, "seeded row was not exported", "")
    Exit Function

EH:
    On Error Resume Next
    If inTransaction Then ws.Rollback
    Test_ExpedienteJsonExporter_ExportAllE2E_MapsScalarValuesWithTypes = JsonOK(False, "dao/setup failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteJsonExporter_ExportAllE2E_MetaTotalMatchesDataCount
' -----------------------------------------------------------------------
Public Function Test_ExpedienteJsonExporter_ExportAllE2E_MetaTotalMatchesDataCount() As String
    On Error GoTo EH

    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim p_Error As String
    Dim jsonText As String
    Dim parsed As Object
    Dim dataCol As Collection
    Dim meta As Object
    Dim testId1 As Long
    Dim testId2 As Long
    Dim testOrdinal As Long
    Dim baselineCount As Long
    Dim inTransaction As Boolean

    p_Error = ""
    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_MetaTotalMatchesDataCount = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    testId1 = NextE2ETestExpedienteId(db)
    testId2 = NextE2ETestExpedienteId(db)
    testOrdinal = NextE2ETestOrdinal(db)
    baselineCount = CountE2EExportableRows(db)

    Set ws = getWorkspace(p_Error)
    If p_Error <> "" Or ws Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_MetaTotalMatchesDataCount = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    ws.BeginTrans
    inTransaction = True

    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E, Nemotecnico, Titulo) VALUES (" & testId1 & ", " & testOrdinal & ", 'E2E-TOTAL-A', 'Meta total A')", dbFailOnError
    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E, Nemotecnico, Titulo) VALUES (" & testId2 & ", " & (testOrdinal + 1) & ", 'E2E-TOTAL-B', 'Meta total B')", dbFailOnError

    p_Error = ""
    jsonText = ExportAllE2E("2030-01-01T00:00:00Z", p_Error)

    ws.Rollback
    inTransaction = False

    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_ExportAllE2E_MetaTotalMatchesDataCount = JsonOK(False, "unexpected exporter error: " & p_Error, "")
        Exit Function
    End If

    Set parsed = JsonConverter.ParseJson(jsonText)
    Set dataCol = parsed("data")
    Set meta = parsed("meta")

    If CLng(meta("totalExpedientes")) = CLng(dataCol.Count) And CLng(meta("totalExpedientes")) = (baselineCount + 2) Then
        Test_ExpedienteJsonExporter_ExportAllE2E_MetaTotalMatchesDataCount = JsonOK(True, "meta.total matches data count", "")
    Else
        Test_ExpedienteJsonExporter_ExportAllE2E_MetaTotalMatchesDataCount = JsonOK(False, "meta.total mismatch against data count or fixture baseline", "")
    End If
    Exit Function

EH:
    On Error Resume Next
    If inTransaction Then ws.Rollback
    Test_ExpedienteJsonExporter_ExportAllE2E_MetaTotalMatchesDataCount = JsonOK(False, "dao/setup failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteJsonExporter_ExportAllE2E_DefaultGeneratedAtDoesNotError
' -----------------------------------------------------------------------
Public Function Test_ExpedienteJsonExporter_ExportAllE2E_DefaultGeneratedAtDoesNotError() As String
    On Error GoTo EH

    Dim p_Error As String
    Dim jsonText As String
    Dim parsed As Object
    Dim meta As Object

    p_Error = ""
    jsonText = ExportAllE2E(, p_Error)

    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_ExportAllE2E_DefaultGeneratedAtDoesNotError = JsonOK(False, "unexpected exporter error: " & p_Error, "")
        Exit Function
    End If

    If Len(jsonText) = 0 Then
        Test_ExpedienteJsonExporter_ExportAllE2E_DefaultGeneratedAtDoesNotError = JsonOK(False, "expected JSON output", "")
        Exit Function
    End If

    Set parsed = JsonConverter.ParseJson(jsonText)
    Set meta = parsed("meta")

    If meta("apiVersion") <> "1.0" Then
        Test_ExpedienteJsonExporter_ExportAllE2E_DefaultGeneratedAtDoesNotError = JsonOK(False, "unexpected apiVersion", "")
    ElseIf Len(CStr(meta("generatedAt"))) = 0 Then
        Test_ExpedienteJsonExporter_ExportAllE2E_DefaultGeneratedAtDoesNotError = JsonOK(False, "generatedAt must not be empty", "")
    ElseIf InStr(1, CStr(meta("generatedAt")), "Z", vbBinaryCompare) = 0 Then
        Test_ExpedienteJsonExporter_ExportAllE2E_DefaultGeneratedAtDoesNotError = JsonOK(False, "generatedAt must end with Z", "")
    Else
        Test_ExpedienteJsonExporter_ExportAllE2E_DefaultGeneratedAtDoesNotError = JsonOK(True, "default generatedAt does not error", "")
    End If
    Exit Function

EH:
    Test_ExpedienteJsonExporter_ExportAllE2E_DefaultGeneratedAtDoesNotError = JsonOK(False, "default generatedAt failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_NullAsJsonNull
' -----------------------------------------------------------------------
Public Function Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_NullAsJsonNull() As String
    On Error GoTo EH

    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim p_Error As String
    Dim jsonText As String
    Dim parsed As Object
    Dim dataCol As Collection
    Dim row As Object
    Dim testId As Long
    Dim testOrdinal As Long
    Dim inTransaction As Boolean

    p_Error = ""
    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_NullAsJsonNull = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    testId = NextE2ETestExpedienteId(db)
    testOrdinal = NextE2ETestOrdinal(db)

    Set ws = getWorkspace(p_Error)
    If p_Error <> "" Or ws Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_NullAsJsonNull = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    ws.BeginTrans
    inTransaction = True
    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E, Nemotecnico, Titulo, FechaInicioContrato, FechaFinContrato, FechaFinGarantia, FechaPreOferta, FechaInicioLicitacion, FechaOferta, FechaAdjudicacion, FechaFirmaContrato, FechaCertificacion, FechaPerdida, FechaDesestimada) VALUES (" & _
               testId & ", " & testOrdinal & ", 'E2E-DATE-NULL', 'Date null contract', Null, Null, Null, Null, Null, Null, Null, Null, Null, Null, Null)", dbFailOnError

    p_Error = ""
    jsonText = ExportAllE2E("2030-01-01T00:00:00Z", p_Error)

    ws.Rollback
    inTransaction = False

    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_NullAsJsonNull = JsonOK(False, "unexpected exporter error: " & p_Error, "")
        Exit Function
    End If

    Set parsed = JsonConverter.ParseJson(jsonText)
    Set dataCol = parsed("data")

    For Each row In dataCol
        If CLng(row("idexpediente")) = testId Then
            If row.exists("fechainiciocontrato") And row.exists("fechafincontrato") And row.exists("fechafingarantia") And _
               row.exists("fechapreoferta") And row.exists("fechainiciolicitacion") And row.exists("fechaoferta") And _
               row.exists("fechaadjudicacion") And row.exists("fechafirmacontrato") And row.exists("fechacertificacion") And _
               row.exists("fechaperdida") And row.exists("fechadesestimada") Then

                If IsNull(row("fechainiciocontrato")) And IsNull(row("fechafincontrato")) And IsNull(row("fechafingarantia")) And _
                   IsNull(row("fechapreoferta")) And IsNull(row("fechainiciolicitacion")) And IsNull(row("fechaoferta")) And _
                   IsNull(row("fechaadjudicacion")) And IsNull(row("fechafirmacontrato")) And IsNull(row("fechacertificacion")) And _
                   IsNull(row("fechaperdida")) And IsNull(row("fechadesestimada")) Then
                    Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_NullAsJsonNull = JsonOK(True, "date scalar keys present and nulls serialize as JSON null", "")
                Else
                    Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_NullAsJsonNull = JsonOK(False, "expected all date scalars to be JSON null", "")
                End If
            Else
                Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_NullAsJsonNull = JsonOK(False, "missing one or more canonical date scalar keys", "")
            End If
            Exit Function
        End If
    Next row

    Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_NullAsJsonNull = JsonOK(False, "seeded row was not exported", "")
    Exit Function

EH:
    On Error Resume Next
    If inTransaction Then ws.Rollback
    Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_NullAsJsonNull = JsonOK(False, "dao/setup failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_FormatDeterministic
' -----------------------------------------------------------------------
Public Function Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_FormatDeterministic() As String
    On Error GoTo EH

    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim p_Error As String
    Dim jsonText As String
    Dim parsed As Object
    Dim dataCol As Collection
    Dim row As Object
    Dim testId As Long
    Dim testOrdinal As Long
    Dim inTransaction As Boolean

    p_Error = ""
    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_FormatDeterministic = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    testId = NextE2ETestExpedienteId(db)
    testOrdinal = NextE2ETestOrdinal(db)

    Set ws = getWorkspace(p_Error)
    If p_Error <> "" Or ws Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_FormatDeterministic = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    ws.BeginTrans
    inTransaction = True
    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E, Nemotecnico, Titulo, FechaInicioContrato, FechaFinContrato, FechaFinGarantia, FechaPreOferta, FechaInicioLicitacion, FechaOferta, FechaAdjudicacion, FechaFirmaContrato, FechaCertificacion, FechaPerdida, FechaDesestimada) VALUES (" & _
               testId & ", " & testOrdinal & ", 'E2E-DATE-FMT', 'Date fmt contract', DateSerial(2028,1,2), DateSerial(2028,2,3), DateSerial(2028,3,4), DateSerial(2028,4,5), DateSerial(2028,5,6), DateSerial(2028,6,7), DateSerial(2028,7,8), DateSerial(2028,8,9), DateSerial(2028,9,10), DateSerial(2028,10,11), DateSerial(2028,11,12))", dbFailOnError

    p_Error = ""
    jsonText = ExportAllE2E("2030-01-01T00:00:00Z", p_Error)

    ws.Rollback
    inTransaction = False

    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_FormatDeterministic = JsonOK(False, "unexpected exporter error: " & p_Error, "")
        Exit Function
    End If

    Set parsed = JsonConverter.ParseJson(jsonText)
    Set dataCol = parsed("data")

    For Each row In dataCol
        If CLng(row("idexpediente")) = testId Then
            If CStr(row("fechainiciocontrato")) = "2028-01-02" And CStr(row("fechafincontrato")) = "2028-02-03" And _
               CStr(row("fechafingarantia")) = "2028-03-04" And CStr(row("fechapreoferta")) = "2028-04-05" And _
               CStr(row("fechainiciolicitacion")) = "2028-05-06" And CStr(row("fechaoferta")) = "2028-06-07" And _
               CStr(row("fechaadjudicacion")) = "2028-07-08" And CStr(row("fechafirmacontrato")) = "2028-08-09" And _
               CStr(row("fechacertificacion")) = "2028-09-10" And CStr(row("fechaperdida")) = "2028-10-11" And _
               CStr(row("fechadesestimada")) = "2028-11-12" Then
                Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_FormatDeterministic = JsonOK(True, "date scalars serialize deterministically as yyyy-mm-dd", "")
            Else
                Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_FormatDeterministic = JsonOK(False, "date scalar deterministic format mismatch", "")
            End If
            Exit Function
        End If
    Next row

    Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_FormatDeterministic = JsonOK(False, "seeded row was not exported", "")
    Exit Function

EH:
    On Error Resume Next
    If inTransaction Then ws.Rollback
    Test_ExpedienteJsonExporter_ExportAllE2E_DateScalars_FormatDeterministic = JsonOK(False, "dao/setup failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_IncludesCanonicalKeys
' -----------------------------------------------------------------------
Public Function Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_IncludesCanonicalKeys() As String
    On Error GoTo EH

    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim p_Error As String
    Dim jsonText As String
    Dim parsed As Object
    Dim dataCol As Collection
    Dim row As Object
    Dim testId As Long
    Dim testOrdinalE2E As Long
    Dim inTransaction As Boolean
    Dim keys As Variant

    p_Error = ""
    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_IncludesCanonicalKeys = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    testId = NextE2ETestExpedienteId(db)
    testOrdinalE2E = NextE2ETestOrdinal(db)
    keys = E2ETextFlagScalarKeys()

    Set ws = getWorkspace(p_Error)
    If p_Error <> "" Or ws Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_IncludesCanonicalKeys = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    ws.BeginTrans
    inTransaction = True
    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E, EsAM, EsLote, EsBasado, EsExpediente, [Ordinal], AccesoSharePoint, Observaciones, Ambito, NPedido, Adjudicado, EnPeriodoDeAdjudicacion, Tipo, GarantiaMeses, Estado, ObjetoContrato, IDGradoClasificacion, IDOrganoContratacion) VALUES (" & _
               testId & ", " & testOrdinalE2E & ", True, False, True, False, 13, 'https://sharepoint/item/13', 'obs-13', 'Internacional', 'PED-13', True, False, 'Servicio', 24, 'adjudicado', 'objeto-13', 101, 202)", dbFailOnError

    p_Error = ""
    jsonText = ExportAllE2E("2030-01-01T00:00:00Z", p_Error)

    ws.Rollback
    inTransaction = False

    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_IncludesCanonicalKeys = JsonOK(False, "unexpected exporter error: " & p_Error, "")
        Exit Function
    End If

    Set parsed = JsonConverter.ParseJson(jsonText)
    Set dataCol = parsed("data")
    For Each row In dataCol
        If CLng(row("idexpediente")) = testId Then
            If HasAllKeys(row, keys) Then
                Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_IncludesCanonicalKeys = JsonOK(True, "all canonical text/flag scalar keys are present", "")
            Else
                Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_IncludesCanonicalKeys = JsonOK(False, "missing one or more canonical text/flag scalar keys", "")
            End If
            Exit Function
        End If
    Next row

    Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_IncludesCanonicalKeys = JsonOK(False, "seeded row was not exported", "")
    Exit Function

EH:
    On Error Resume Next
    If inTransaction Then ws.Rollback
    Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_IncludesCanonicalKeys = JsonOK(False, "dao/setup failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_NullAsJsonNull
' -----------------------------------------------------------------------
Public Function Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_NullAsJsonNull() As String
    On Error GoTo EH

    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim p_Error As String
    Dim jsonText As String
    Dim parsed As Object
    Dim dataCol As Collection
    Dim row As Object
    Dim testId As Long
    Dim testOrdinalE2E As Long
    Dim inTransaction As Boolean
    Dim keys As Variant

    p_Error = ""
    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_NullAsJsonNull = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    testId = NextE2ETestExpedienteId(db)
    testOrdinalE2E = NextE2ETestOrdinal(db)
    keys = E2ETextFlagScalarKeys()

    Set ws = getWorkspace(p_Error)
    If p_Error <> "" Or ws Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_NullAsJsonNull = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    ws.BeginTrans
    inTransaction = True
    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E, EsAM, EsLote, EsBasado, EsExpediente, [Ordinal], AccesoSharePoint, Observaciones, Ambito, NPedido, Adjudicado, EnPeriodoDeAdjudicacion, Tipo, GarantiaMeses, Estado, ObjetoContrato, IDGradoClasificacion, IDOrganoContratacion) VALUES (" & _
               testId & ", " & testOrdinalE2E & ", Null, Null, Null, Null, Null, Null, Null, Null, Null, Null, Null, Null, Null, Null, Null, Null, Null)", dbFailOnError

    p_Error = ""
    jsonText = ExportAllE2E("2030-01-01T00:00:00Z", p_Error)

    ws.Rollback
    inTransaction = False

    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_NullAsJsonNull = JsonOK(False, "unexpected exporter error: " & p_Error, "")
        Exit Function
    End If

    Set parsed = JsonConverter.ParseJson(jsonText)
    Set dataCol = parsed("data")
    For Each row In dataCol
        If CLng(row("idexpediente")) = testId Then
            If HasAllKeys(row, keys) And AllKeysAreJsonNull(row, keys) Then
                Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_NullAsJsonNull = JsonOK(True, "canonical text/flag scalar keys serialize DB Null as JSON null", "")
            Else
                Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_NullAsJsonNull = JsonOK(False, "canonical text/flag scalar keys missing or non-null", "")
            End If
            Exit Function
        End If
    Next row

    Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_NullAsJsonNull = JsonOK(False, "seeded row was not exported", "")
    Exit Function

EH:
    On Error Resume Next
    If inTransaction Then ws.Rollback
    Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_NullAsJsonNull = JsonOK(False, "dao/setup failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_ValueFidelity
' -----------------------------------------------------------------------
Public Function Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_ValueFidelity() As String
    On Error GoTo EH

    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim p_Error As String
    Dim jsonText As String
    Dim parsed As Object
    Dim dataCol As Collection
    Dim row As Object
    Dim testId As Long
    Dim testOrdinalE2E As Long
    Dim testGradoId As Long
    Dim testOrganoId As Long
    Dim inTransaction As Boolean

    p_Error = ""
    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_ValueFidelity = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    testId = NextE2ETestExpedienteId(db)
    testOrdinalE2E = NextE2ETestOrdinal(db)
    testGradoId = 990001
    testOrganoId = 990002

    Set ws = getWorkspace(p_Error)
    If p_Error <> "" Or ws Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_ValueFidelity = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    ws.BeginTrans
    inTransaction = True
    db.Execute "INSERT INTO TbGradosClasificacion (IDGradoClasificacion, GradoClasificacion) VALUES (" & testGradoId & ", 'GRADO-LOOKUP-E2E')", dbFailOnError
    db.Execute "INSERT INTO TbOrganosContratacion (IDOrganoContratacion, OrganoContratacion) VALUES (" & testOrganoId & ", 'ORGANO-LOOKUP-E2E')", dbFailOnError
    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E, EsAM, EsLote, EsBasado, EsExpediente, [Ordinal], AccesoSharePoint, Observaciones, Ambito, NPedido, Adjudicado, EnPeriodoDeAdjudicacion, Tipo, GarantiaMeses, Estado, ObjetoContrato, IDGradoClasificacion, IDOrganoContratacion) VALUES (" & _
               testId & ", " & testOrdinalE2E & ", True, False, True, False, 77, 'https://sharepoint/fidelity', 'obs fidelity', 'AMBA', 'PED-7788', True, False, 'Obra', 36, 'en-tramite', 'objeto fidelity', " & testGradoId & ", " & testOrganoId & ")", dbFailOnError

    p_Error = ""
    jsonText = ExportAllE2E("2030-01-01T00:00:00Z", p_Error)

    ws.Rollback
    inTransaction = False

    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_ValueFidelity = JsonOK(False, "unexpected exporter error: " & p_Error, "")
        Exit Function
    End If

    Set parsed = JsonConverter.ParseJson(jsonText)
    Set dataCol = parsed("data")
    For Each row In dataCol
        If CLng(row("idexpediente")) = testId Then
            If CBool(row("esam")) = True And CBool(row("eslote")) = False And CBool(row("esbasado")) = True And CBool(row("esexpediente")) = False And _
               CLng(row("ordinal")) = 77 And CStr(row("accesosharepoint")) = "https://sharepoint/fidelity" And _
               CStr(row("observaciones")) = "obs fidelity" And CStr(row("ambito")) = "AMBA" And _
               CStr(row("npedido")) = "PED-7788" And CBool(row("adjudicado")) = True And CBool(row("enperiododeadjudicacion")) = False And _
               CStr(row("tipo")) = "Obra" And CLng(row("garantiameses")) = 36 And _
               CStr(row("estado")) = "en-tramite" And CStr(row("objetocontrato")) = "objeto fidelity" And _
               CStr(row("gradoclasificacion")) = "GRADO-LOOKUP-E2E" And CStr(row("organocontratacion")) = "ORGANO-LOOKUP-E2E" And _
               Not IsObject(row("gradoclasificacion")) And Not IsObject(row("organocontratacion")) Then
                Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_ValueFidelity = JsonOK(True, "text/flag scalar values preserve fidelity with lookup text scalars", "")
            Else
                Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_ValueFidelity = JsonOK(False, "text/flag scalar fidelity mismatch", "")
            End If
            Exit Function
        End If
    Next row

    Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_ValueFidelity = JsonOK(False, "seeded row was not exported", "")
    Exit Function

EH:
    On Error Resume Next
    If inTransaction Then ws.Rollback
    Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_ValueFidelity = JsonOK(False, "dao/setup failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_OrphanLookupAsJsonNull
' -----------------------------------------------------------------------
Public Function Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_OrphanLookupAsJsonNull() As String
    On Error GoTo EH

    Dim db As DAO.Database
    Dim ws As DAO.Workspace
    Dim p_Error As String
    Dim jsonText As String
    Dim parsed As Object
    Dim dataCol As Collection
    Dim row As Object
    Dim testId As Long
    Dim testOrdinalE2E As Long
    Dim orphanGradoId As Long
    Dim orphanOrganoId As Long
    Dim inTransaction As Boolean

    p_Error = ""
    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_OrphanLookupAsJsonNull = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    testId = NextE2ETestExpedienteId(db)
    testOrdinalE2E = NextE2ETestOrdinal(db)
    orphanGradoId = 999991
    orphanOrganoId = 999992

    Set ws = getWorkspace(p_Error)
    If p_Error <> "" Or ws Is Nothing Then
        Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_OrphanLookupAsJsonNull = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    ws.BeginTrans
    inTransaction = True
    db.Execute "INSERT INTO TbExpedientes (IDExpediente, OrdinalE2E, EsAM, EsLote, EsBasado, EsExpediente, [Ordinal], AccesoSharePoint, Observaciones, Ambito, NPedido, Adjudicado, EnPeriodoDeAdjudicacion, Tipo, GarantiaMeses, Estado, ObjetoContrato, IDGradoClasificacion, IDOrganoContratacion) VALUES (" & _
               testId & ", " & testOrdinalE2E & ", True, False, True, False, 78, 'https://sharepoint/orphan', 'obs orphan', 'AMBA', 'PED-7799', True, False, 'Obra', 12, 'en-tramite', 'objeto orphan', " & orphanGradoId & ", " & orphanOrganoId & ")", dbFailOnError

    p_Error = ""
    jsonText = ExportAllE2E("2030-01-01T00:00:00Z", p_Error)

    ws.Rollback
    inTransaction = False

    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_OrphanLookupAsJsonNull = JsonOK(False, "unexpected exporter error: " & p_Error, "")
        Exit Function
    End If

    Set parsed = JsonConverter.ParseJson(jsonText)
    Set dataCol = parsed("data")
    For Each row In dataCol
        If CLng(row("idexpediente")) = testId Then
            If IsNull(row("gradoclasificacion")) And IsNull(row("organocontratacion")) Then
                Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_OrphanLookupAsJsonNull = JsonOK(True, "orphan lookup ids serialize as JSON null", "")
            Else
                Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_OrphanLookupAsJsonNull = JsonOK(False, "expected orphan lookup ids to serialize as JSON null", "")
            End If
            Exit Function
        End If
    Next row

    Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_OrphanLookupAsJsonNull = JsonOK(False, "seeded row was not exported", "")
    Exit Function

EH:
    On Error Resume Next
    If inTransaction Then ws.Rollback
    Test_ExpedienteJsonExporter_ExportAllE2E_TextFlagScalars_OrphanLookupAsJsonNull = JsonOK(False, "dao/setup failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_FuncionesUtiles_getExpedienteEsDerivable_Empty_is_No
' -----------------------------------------------------------------------
Public Function Test_FuncionesUtiles_getExpedienteEsDerivable_Empty_is_No() As String
    Dim logs As String
    logs = ""

    Dim result As EnumSiNo
    Dim p_Error As String
    p_Error = ""
    result = getExpedienteEsDerivable(Empty, p_Error)

    If p_Error <> "" Then
        Test_FuncionesUtiles_getExpedienteEsDerivable_Empty_is_No = JsonOK(False, "unexpected error: " & p_Error, logs)
        Exit Function
    End If

    If result = EnumSiNo.No Then
        Test_FuncionesUtiles_getExpedienteEsDerivable_Empty_is_No = JsonOK(True, "Empty returns No", logs)
    Else
        Test_FuncionesUtiles_getExpedienteEsDerivable_Empty_is_No = JsonOK(False, "Empty should return No but got " & result, logs)
    End If
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteJsonExporter_GuardarJsonEnArchivo_WritesUtf8LiteralChars
' -----------------------------------------------------------------------
Public Function Test_ExpedienteJsonExporter_GuardarJsonEnArchivo_WritesUtf8LiteralChars() As String
    On Error GoTo EH

    Dim tmpPath As String
    Dim jsonEscaped As String
    Dim stream As Object
    Dim content As String

    tmpPath = Environ$("TEMP") & "\\expedientes-e2e-utf8-test.json"
    jsonEscaped = "{""texto"":""S\u00ed"",""a\u00f1o"":2026}"

    GuardarJsonEnArchivo jsonEscaped, tmpPath

    Set stream = CreateObject("ADODB.Stream")
    stream.Open
    stream.Type = 2
    stream.Charset = "utf-8"
    stream.LoadFromFile tmpPath
    content = stream.ReadText
    stream.Close
    Set stream = Nothing

    On Error Resume Next
    Kill tmpPath
    On Error GoTo EH

    If InStr(1, content, "Sí", vbBinaryCompare) = 0 Then
        Test_ExpedienteJsonExporter_GuardarJsonEnArchivo_WritesUtf8LiteralChars = JsonOK(False, "expected literal Sí in UTF-8 file content", "")
    ElseIf InStr(1, content, "año", vbBinaryCompare) = 0 Then
        Test_ExpedienteJsonExporter_GuardarJsonEnArchivo_WritesUtf8LiteralChars = JsonOK(False, "expected literal año key in UTF-8 file content", "")
    ElseIf InStr(1, content, "\\u00", vbBinaryCompare) > 0 Then
        Test_ExpedienteJsonExporter_GuardarJsonEnArchivo_WritesUtf8LiteralChars = JsonOK(False, "unicode escapes should be unescaped in file", "")
    Else
        Test_ExpedienteJsonExporter_GuardarJsonEnArchivo_WritesUtf8LiteralChars = JsonOK(True, "utf-8 file keeps literal unicode chars", "")
    End If
    Exit Function

EH:
    On Error Resume Next
    Kill tmpPath
    Test_ExpedienteJsonExporter_GuardarJsonEnArchivo_WritesUtf8LiteralChars = JsonOK(False, "utf-8 file assertion failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_MetaAndRootContract
' -----------------------------------------------------------------------
Public Function Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_MetaAndRootContract() As String
    On Error GoTo EH

    Dim db As DAO.Database
    Dim fixtureText As String
    Dim generatedJson As String
    Dim idsCsv As String
    Dim p_Error As String
    Dim fixtureParsed As Object
    Dim generatedParsed As Object
    Dim fixtureRows As Collection
    Dim generatedRows As Collection
    Dim fixtureRow As Object
    Dim generatedRow As Object
    Dim fixturePath As String

    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_MetaAndRootContract = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    p_Error = ""
    idsCsv = BuildDeterministicExpedienteIdCsv(db, 3, p_Error)
    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_MetaAndRootContract = JsonOK(False, p_Error, "")
        Exit Function
    End If

    p_Error = ""
    generatedJson = GenerarJsonE2ECanonicoPorLista(idsCsv, p_Error)
    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_MetaAndRootContract = JsonOK(False, p_Error, "")
        Exit Function
    End If

    fixturePath = CanonicalFixturePath()
    p_Error = ""
    fixtureText = ReadUtf8TextFile(fixturePath, p_Error)

    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_MetaAndRootContract = JsonOK(False, p_Error, "")
        Exit Function
    End If

    Set fixtureParsed = JsonConverter.ParseJson(fixtureText)
    Set generatedParsed = JsonConverter.ParseJson(generatedJson)

    If Not generatedParsed.exists("meta") Or Not generatedParsed.exists("data") Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_MetaAndRootContract = JsonOK(False, "expected top-level meta/data", "")
        Exit Function
    End If

    If generatedParsed("meta").Count <> 5 Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_MetaAndRootContract = JsonOK(False, "meta must contain exactly 5 keys", "")
        Exit Function
    End If

    If Not HasAllKeys(generatedParsed("meta"), Array("apiVersion", "generatedAt", "generator", "user", "totalExpedientes")) Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_MetaAndRootContract = JsonOK(False, "meta keyset mismatch", "")
        Exit Function
    End If

    If Right$(CStr(generatedParsed("meta")("generatedAt")), 5) <> ".000Z" Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_MetaAndRootContract = JsonOK(False, "generatedAt must end with .000Z", "")
        Exit Function
    End If

    Set fixtureRows = fixtureParsed("data")
    If fixtureRows.Count = 0 Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_MetaAndRootContract = JsonOK(False, "fixture must contain at least one data row", "")
        Exit Function
    End If

    Set generatedRows = generatedParsed("data")
    If generatedRows.Count = 0 Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_MetaAndRootContract = JsonOK(False, "expected at least one data row for provided IDs", "")
        Exit Function
    End If

    Set fixtureRow = fixtureRows(1)
    Set generatedRow = generatedRows(1)
    If CompareKeysetExact(fixtureRow, generatedRow) And HasOnlyKeys(generatedRow, CanonicalExpedienteRootKeys()) And generatedRow.exists("OrdinalE2E") Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_MetaAndRootContract = JsonOK(True, "exported root contract matches canonical fixture structure", "")
    Else
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_MetaAndRootContract = JsonOK(False, "row root keyset/casing mismatch", "")
    End If
    Exit Function

EH:
    Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_MetaAndRootContract = JsonOK(False, "canonical list root test failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_NestedContractKeys
' -----------------------------------------------------------------------
Public Function Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_NestedContractKeys() As String
    On Error GoTo EH

    Dim db As DAO.Database
    Dim fixtureText As String
    Dim generatedJson As String
    Dim idsCsv As String
    Dim p_Error As String
    Dim fixtureParsed As Object
    Dim generatedParsed As Object
    Dim fixtureRows As Collection
    Dim generatedRows As Collection
    Dim fixturePath As String

    Set db = getdb(p_Error)
    If p_Error <> "" Or db Is Nothing Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_NestedContractKeys = JsonOK(False, "TESTS BLOCKED: " & p_Error, "")
        Exit Function
    End If

    p_Error = ""
    idsCsv = BuildDeterministicExpedienteIdCsv(db, 3, p_Error)
    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_NestedContractKeys = JsonOK(False, p_Error, "")
        Exit Function
    End If

    p_Error = ""
    generatedJson = GenerarJsonE2ECanonicoPorLista(idsCsv, p_Error)
    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_NestedContractKeys = JsonOK(False, p_Error, "")
        Exit Function
    End If

    fixturePath = CanonicalFixturePath()
    p_Error = ""
    fixtureText = ReadUtf8TextFile(fixturePath, p_Error)

    If p_Error <> "" Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_NestedContractKeys = JsonOK(False, p_Error, "")
        Exit Function
    End If

    Set fixtureParsed = JsonConverter.ParseJson(fixtureText)
    Set generatedParsed = JsonConverter.ParseJson(generatedJson)
    Set fixtureRows = fixtureParsed("data")
    Set generatedRows = generatedParsed("data")

    If fixtureRows.Count = 0 Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_NestedContractKeys = JsonOK(False, "fixture must contain one data row", "")
        Exit Function
    End If

    If generatedRows.Count = 0 Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_NestedContractKeys = JsonOK(False, "expected one data row", "")
        Exit Function
    End If

    If Not CompareJsonStructureRecursive(fixtureRows(1), generatedRows(1), p_Error, "data[1]") Then
        Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_NestedContractKeys = JsonOK(False, p_Error, "")
        Exit Function
    End If

    Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_NestedContractKeys = JsonOK(True, "exported nested contracts match canonical fixture structure", "")
    Exit Function

EH:
    Test_ExpedienteJsonExporter_GenerarJsonE2ECanonicoPorLista_NestedContractKeys = JsonOK(False, "canonical list nested test failed: " & Err.Description, "")
End Function

' -----------------------------------------------------------------------
' JsonOK — helper that returns a JSON string for test results
' -----------------------------------------------------------------------
Private Function JsonOK(ByVal p_Ok As Boolean, ByVal p_Value As String, ByRef p_Logs As String) As String
    Dim result As String
    result = "{""ok"": " & IIf(p_Ok, "true", "false") & "," & _
             " ""value"": """ & EscapeJsonString(p_Value) & """," & _
             " ""error"": null," & _
             " ""logs"": [""" & EscapeJsonString(p_Logs) & """]}"
    JsonOK = result
End Function

' -----------------------------------------------------------------------
' EscapeJsonString — escapes double quotes and backslashes for JSON string
' -----------------------------------------------------------------------
Private Function EscapeJsonString(ByVal p_Text As String) As String
    Dim result As String
    result = p_Text
    result = Replace(result, "\", "\\")
    result = Replace(result, """", "\""")
    result = Replace(result, vbNewLine, "\n")
    result = Replace(result, Chr(13), "\r")
    result = Replace(result, Chr(10), "\n")
    EscapeJsonString = result
End Function

