Attribute VB_Name = "TestFixtures"
Option Compare Database
Option Explicit

Private Const TEST_ID_BASE As Long = 994000000

Public Function CacheFixtureBaseId() As Long
    CacheFixtureBaseId = TEST_ID_BASE
End Function

Public Function SeedExpedienteLugarFixture(ByVal p_IDExp As Long, ByVal p_IDLugar As Long, ByRef p_Error As String) As Boolean
    On Error GoTo EH

    Dim m_Db As DAO.Database
    p_Error = ""
    SeedExpedienteLugarFixture = False

    If Not EnsureSandboxBackend(p_Error) Then Exit Function

    Set m_Db = getdb(p_Error)
    If m_Db Is Nothing Then
        If p_Error = "" Then p_Error = "No se pudo abrir backend sandbox"
        Exit Function
    End If

    m_Db.Execute "DELETE * FROM TbExpedientesLugaresEjecucion WHERE IDExpediente=" & p_IDExp & " AND IDLugarEjecucion=" & p_IDLugar & ";", dbFailOnError
    m_Db.Execute "DELETE * FROM TbExpedientes WHERE IDExpediente=" & p_IDExp & ";", dbFailOnError

    m_Db.Execute "INSERT INTO TbExpedientes (IDExpediente, CodExp, Nemotecnico) VALUES (" & p_IDExp & ", 'COD-PR3-LUGAR', 'NEMO-PR3-LUGAR');", dbFailOnError
    m_Db.Execute "INSERT INTO TbExpedientesLugaresEjecucion (IDExpedienteLugarEjecucion, IDExpediente, IDLugarEjecucion) VALUES (" & p_IDExp & ", " & p_IDExp & ", " & p_IDLugar & ");", dbFailOnError

    SeedExpedienteLugarFixture = True
    Exit Function

EH:
    p_Error = "SeedExpedienteLugarFixture: " & Err.Description
End Function

Public Function TeardownExpedienteLugarFixture(ByVal p_IDExp As Long, ByVal p_IDLugar As Long, ByRef p_Error As String) As Boolean
    On Error GoTo EH

    Dim m_Db As DAO.Database
    p_Error = ""
    TeardownExpedienteLugarFixture = False

    If Not EnsureSandboxBackend(p_Error) Then Exit Function

    Set m_Db = getdb(p_Error)
    If m_Db Is Nothing Then
        If p_Error = "" Then p_Error = "No se pudo abrir backend sandbox"
        Exit Function
    End If

    m_Db.Execute "DELETE * FROM TbExpedientesLugaresEjecucion WHERE IDExpediente=" & p_IDExp & " AND IDLugarEjecucion=" & p_IDLugar & ";", dbFailOnError
    m_Db.Execute "DELETE * FROM TbExpedientes WHERE IDExpediente=" & p_IDExp & ";", dbFailOnError

    TeardownExpedienteLugarFixture = True
    Exit Function

EH:
    p_Error = "TeardownExpedienteLugarFixture: " & Err.Description
End Function

Public Function SeedExpedienteRacFixture(ByVal p_IDExp As Long, ByVal p_IDRac As Long, ByRef p_Error As String) As Boolean
    On Error GoTo EH

    Dim m_Db As DAO.Database
    p_Error = ""
    SeedExpedienteRacFixture = False

    If Not EnsureSandboxBackend(p_Error) Then Exit Function

    Set m_Db = getdb(p_Error)
    If m_Db Is Nothing Then
        If p_Error = "" Then p_Error = "No se pudo abrir backend sandbox"
        Exit Function
    End If

    m_Db.Execute "DELETE * FROM TbExpedientesRACS WHERE IDExpediente=" & p_IDExp & " AND IDRAC=" & p_IDRac & ";", dbFailOnError
    m_Db.Execute "DELETE * FROM TbExpedientes WHERE IDExpediente=" & p_IDExp & ";", dbFailOnError

    m_Db.Execute "INSERT INTO TbExpedientes (IDExpediente, CodExp, Nemotecnico) VALUES (" & p_IDExp & ", 'COD-PR3-RAC', 'NEMO-PR3-RAC');", dbFailOnError
    m_Db.Execute "INSERT INTO TbExpedientesRACS (IDRACExpediente, IDExpediente, IDRAC) VALUES (" & p_IDExp & ", " & p_IDExp & ", " & p_IDRac & ");", dbFailOnError

    SeedExpedienteRacFixture = True
    Exit Function

EH:
    p_Error = "SeedExpedienteRacFixture: " & Err.Description
End Function

Public Function TeardownExpedienteRacFixture(ByVal p_IDExp As Long, ByVal p_IDRac As Long, ByRef p_Error As String) As Boolean
    On Error GoTo EH

    Dim m_Db As DAO.Database
    p_Error = ""
    TeardownExpedienteRacFixture = False

    If Not EnsureSandboxBackend(p_Error) Then Exit Function

    Set m_Db = getdb(p_Error)
    If m_Db Is Nothing Then
        If p_Error = "" Then p_Error = "No se pudo abrir backend sandbox"
        Exit Function
    End If

    m_Db.Execute "DELETE * FROM TbExpedientesRACS WHERE IDExpediente=" & p_IDExp & " AND IDRAC=" & p_IDRac & ";", dbFailOnError
    m_Db.Execute "DELETE * FROM TbExpedientes WHERE IDExpediente=" & p_IDExp & ";", dbFailOnError

    TeardownExpedienteRacFixture = True
    Exit Function

EH:
    p_Error = "TeardownExpedienteRacFixture: " & Err.Description
End Function

Public Function SetupE2EBatchSchemaSandbox(ByRef p_Error As String) As Boolean
    On Error GoTo EH

    p_Error = ""
    SetupE2EBatchSchemaSandbox = False

    If Not EnsureSandboxBackend(p_Error) Then Exit Function
    If Not EnsureE2EBatchManagementSchema(p_Error) Then Exit Function
    If Not TeardownE2EBatchSchemaSandbox(p_Error) Then Exit Function

    SetupE2EBatchSchemaSandbox = True
    Exit Function

EH:
    p_Error = "SetupE2EBatchSchemaSandbox: " & Err.Description
End Function

Public Function TeardownE2EBatchSchemaSandbox(ByRef p_Error As String) As Boolean
    On Error GoTo EH

    Dim m_Db As DAO.Database
    p_Error = ""
    TeardownE2EBatchSchemaSandbox = False

    If Not EnsureSandboxBackend(p_Error) Then Exit Function

    Set m_Db = getdb(p_Error)
    If m_Db Is Nothing Then
        If p_Error = "" Then p_Error = "No se pudo abrir backend sandbox"
        Exit Function
    End If

    m_Db.Execute "DELETE * FROM TbE2EExportBatchDetalle;", dbFailOnError
    m_Db.Execute "DELETE * FROM TbE2EExportBatch;", dbFailOnError
    m_Db.Execute "DELETE * FROM TbE2EExportSeleccionTemp;", dbFailOnError
    m_Db.Execute "DELETE * FROM TbE2EJsonDestinationUserConfig WHERE UsuarioRed LIKE 'qa.user%';", dbFailOnError

    TeardownE2EBatchSchemaSandbox = True
    Exit Function

EH:
    p_Error = "TeardownE2EBatchSchemaSandbox: " & Err.Description
End Function

Public Function SetupE2ESelectionFixture( _
    ByVal p_Usuario As String, _
    ByVal p_SessionId As String, _
    ByVal p_IdsCsv As String, _
    ByRef p_Error As String) As Boolean

    On Error GoTo EH

    Dim m_Db As DAO.Database
    Dim m_Ids As Collection
    Dim m_Item As Variant

    p_Error = ""
    SetupE2ESelectionFixture = False

    If Not EnsureSandboxBackend(p_Error) Then Exit Function
    If Not EnsureE2EBatchManagementSchema(p_Error) Then Exit Function

    Set m_Db = getdb(p_Error)
    If m_Db Is Nothing Then
        If p_Error = "" Then p_Error = "No se pudo abrir backend sandbox"
        Exit Function
    End If

    Set m_Ids = ParseCsvToCollection(p_IdsCsv)
    For Each m_Item In m_Ids
        m_Db.Execute "INSERT INTO TbE2EExportSeleccionTemp (UsuarioConectado, SessionId, IDExpediente, CreatedAt) VALUES ('" & _
                     SqlStr(p_Usuario) & "','" & SqlStr(p_SessionId) & "'," & CLng(m_Item) & ", Now());", dbFailOnError
    Next m_Item

    SetupE2ESelectionFixture = True
    Exit Function

EH:
    p_Error = "SetupE2ESelectionFixture: " & Err.Description
End Function

Public Function ParseCsvToCollection(ByVal p_Csv As String) As Collection
    Dim parts() As String
    Dim i As Long
    Dim value As String
    Dim c As Collection

    Set c = New Collection
    If Trim$(p_Csv) = "" Then
        Set ParseCsvToCollection = c
        Exit Function
    End If

    parts = Split(p_Csv, ",")
    For i = LBound(parts) To UBound(parts)
        value = Trim$(parts(i))
        If value <> "" Then c.Add value
    Next i
    Set ParseCsvToCollection = c
End Function

