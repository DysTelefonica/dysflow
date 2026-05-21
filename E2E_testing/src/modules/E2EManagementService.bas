Attribute VB_Name = "E2EManagementService"
Option Compare Database
Option Explicit

Private Const TEMP_TABLE_NAME As String = "TbE2EExportSeleccionTemp"
Private Const BATCH_TABLE_NAME As String = "TbE2EExportBatch"
Private Const BATCH_DETAIL_TABLE_NAME As String = "TbE2EExportBatchDetalle"
Private Const DESTINATION_CONFIG_TABLE_NAME As String = "TbE2EJsonDestinationUserConfig"

Public Function GetE2EIntegratedStatusWhereClause( _
    Optional ByVal p_Status As String = "", _
    Optional ByRef p_Error As String) As String

    Dim normalized As String
    On Error GoTo ErrorHandler

    p_Error = ""
    normalized = LCase$(Trim$(p_Status))

    Select Case normalized
        Case "", "all"
            GetE2EIntegratedStatusWhereClause = "(e.OrdinalE2E IS NOT NULL)"
        Case "pending"
            GetE2EIntegratedStatusWhereClause = "(e.OrdinalE2E IS NOT NULL) AND ((Nz(e.HashUltimaExportacion,'')='') OR (Nz(e.HashActual,'')<>Nz(e.HashUltimaExportacion,'')))"
        Case "exported"
            GetE2EIntegratedStatusWhereClause = "(e.OrdinalE2E IS NOT NULL) AND (Nz(e.HashUltimaExportacion,'')<>'') AND (Nz(e.HashActual,'')=Nz(e.HashUltimaExportacion,''))"
        Case "changedsincelastexport"
            GetE2EIntegratedStatusWhereClause = "(e.OrdinalE2E IS NOT NULL) AND (Nz(e.HashUltimaExportacion,'')<>'') AND (Nz(e.HashActual,'')<>Nz(e.HashUltimaExportacion,''))"
        Case "neverexported"
            GetE2EIntegratedStatusWhereClause = "(e.OrdinalE2E IS NOT NULL) AND (Nz(e.HashUltimaExportacion,'')='')"
        Case Else
            p_Error = "GetE2EIntegratedStatusWhereClause: status not supported"
            GetE2EIntegratedStatusWhereClause = ""
    End Select
    Exit Function

ErrorHandler:
    p_Error = "GetE2EIntegratedStatusWhereClause: " & Err.Description
    GetE2EIntegratedStatusWhereClause = ""
End Function

Public Function BuildPickerAvailableCsv( _
    ByVal p_LeftCandidatesCsv As String, _
    ByVal p_RightSelectedCsv As String, _
    Optional ByRef p_Error As String) As String

    Dim leftIds As Collection
    Dim rightIds As Object
    Dim item As Variant
    Dim result As String

    On Error GoTo ErrorHandler
    p_Error = ""

    Set leftIds = ParseCsvToCollection(p_LeftCandidatesCsv)
    Set rightIds = ParseCsvToDict(p_RightSelectedCsv)

    For Each item In leftIds
        If Not rightIds.exists(CStr(item)) Then
            AppendCsvValue result, CStr(item)
        End If
    Next item

    BuildPickerAvailableCsv = result
    Exit Function

ErrorHandler:
    p_Error = "BuildPickerAvailableCsv: " & Err.Description
    BuildPickerAvailableCsv = ""
End Function

Public Function RehydrateFromRightRemoval( _
    ByVal p_RemovedId As Long, _
    ByVal p_MatchesActiveFilter As Boolean, _
    ByVal p_LeftCandidatesCsv As String, _
    Optional ByRef p_Error As String) As String

    Dim result As String
    Dim existing As Object
    On Error GoTo ErrorHandler

    p_Error = ""
    result = NormalizeCsv(p_LeftCandidatesCsv, p_Error)
    If p_Error <> "" Then Exit Function
    Set existing = ParseCsvToDict(result)

    If p_MatchesActiveFilter Then
        If Not existing.exists(CStr(p_RemovedId)) Then
            AppendCsvValue result, CStr(p_RemovedId)
        End If
    End If

    RehydrateFromRightRemoval = result
    Exit Function

ErrorHandler:
    p_Error = "RehydrateFromRightRemoval: " & Err.Description
    RehydrateFromRightRemoval = ""
End Function

Public Function EnsureE2ESelectionTempTable(Optional ByRef p_Error As String) As Boolean
    Dim db As DAO.Database

    On Error GoTo ErrorHandler
    p_Error = ""

    Set db = getdb(p_Error)
    If p_Error <> "" Then Exit Function
    If db Is Nothing Then
        p_Error = "EnsureE2ESelectionTempTable: getdb returned Nothing"
        Exit Function
    End If

    If Not LocalTableExists(db, TEMP_TABLE_NAME) Then
        On Error Resume Next
        db.Execute "CREATE TABLE " & TEMP_TABLE_NAME & " (" & _
                   "IDTemp AUTOINCREMENT CONSTRAINT PK_" & TEMP_TABLE_NAME & " PRIMARY KEY, " & _
                   "UsuarioConectado TEXT(255) NOT NULL, " & _
                   "SessionId TEXT(100) NOT NULL, " & _
                   "IDExpediente LONG NOT NULL, " & _
                   "CreatedAt DATETIME)", dbFailOnError
        If Err.Number <> 0 Then
            If Err.Number <> 3010 Then
                p_Error = "EnsureE2ESelectionTempTable: " & Err.Description
                EnsureE2ESelectionTempTable = False
                Err.Clear
                On Error GoTo ErrorHandler
                Exit Function
            End If
            Err.Clear
        End If
        On Error GoTo ErrorHandler
    End If

    EnsureE2ESelectionTempTable = True
    Exit Function

ErrorHandler:
    p_Error = "EnsureE2ESelectionTempTable: " & Err.Description
    EnsureE2ESelectionTempTable = False
End Function

Public Function EnsureE2EBatchManagementSchema(Optional ByRef p_Error As String) As Boolean
    Dim db As DAO.Database

    On Error GoTo ErrorHandler
    p_Error = ""

    Set db = getdb(p_Error)
    If p_Error <> "" Then Exit Function
    If db Is Nothing Then
        p_Error = "EnsureE2EBatchManagementSchema: getdb returned Nothing"
        Exit Function
    End If

    If Not EnsureE2ESelectionTempTable(p_Error) Then Exit Function
    If Not EnsureE2EJsonDestinationConfigSchema(p_Error) Then Exit Function
    If Not EnsureIndex(db, TEMP_TABLE_NAME, "IX_TbE2EExportSeleccionTemp_Session", "UsuarioConectado, SessionId, IDExpediente", True, p_Error) Then Exit Function
    If Not EnsureE2EBatchHeaderTable(db, p_Error) Then Exit Function
    If Not EnsureE2EBatchDetailTable(db, p_Error) Then Exit Function

    EnsureE2EBatchManagementSchema = True
    Exit Function

ErrorHandler:
    p_Error = "EnsureE2EBatchManagementSchema: " & Err.Description
    EnsureE2EBatchManagementSchema = False
End Function

Public Function EnsureE2EJsonDestinationConfigSchema(Optional ByRef p_Error As String) As Boolean
    Dim db As DAO.Database

    On Error GoTo ErrorHandler
    p_Error = ""

    Set db = getdb(p_Error)
    If p_Error <> "" Then Exit Function
    If db Is Nothing Then
        p_Error = "EnsureE2EJsonDestinationConfigSchema: getdb returned Nothing"
        Exit Function
    End If

    If Not LocalTableExists(db, DESTINATION_CONFIG_TABLE_NAME) Then
        db.Execute "CREATE TABLE " & DESTINATION_CONFIG_TABLE_NAME & " (" & _
                   "IDConfig AUTOINCREMENT CONSTRAINT PK_" & DESTINATION_CONFIG_TABLE_NAME & " PRIMARY KEY, " & _
                   "UsuarioRed TEXT(255) NOT NULL, " & _
                   "RutaDestino MEMO NOT NULL, " & _
                   "CreatedAt DATETIME, " & _
                   "UpdatedAt DATETIME)", dbFailOnError
    End If

    If Not EnsureIndex(db, DESTINATION_CONFIG_TABLE_NAME, "UX_TbE2EJsonDestinationUserConfig_UsuarioRed", "UsuarioRed", True, p_Error) Then Exit Function

    EnsureE2EJsonDestinationConfigSchema = True
    Exit Function

ErrorHandler:
    p_Error = "EnsureE2EJsonDestinationConfigSchema: " & Err.Description
    EnsureE2EJsonDestinationConfigSchema = False
End Function

Public Function GetConnectedUsuarioRed(Optional ByRef p_Error As String) As String
    Dim usr As USUARIO

    On Error GoTo ErrorHandler
    p_Error = ""

    If Not m_ObjUsuarioConectado Is Nothing Then
        GetConnectedUsuarioRed = Trim$(Nz(m_ObjUsuarioConectado.usuarioRed, ""))
    End If

    If GetConnectedUsuarioRed = "" Then
        Set usr = constructor.getUsuarioConectadoPorMaquina(p_Error)
        If p_Error <> "" Then Exit Function
        If Not usr Is Nothing Then GetConnectedUsuarioRed = Trim$(Nz(usr.usuarioRed, ""))
    End If

    If GetConnectedUsuarioRed = "" Then
        p_Error = "GetConnectedUsuarioRed: usuario conectado sin UsuarioRed"
    End If
    Exit Function

ErrorHandler:
    p_Error = "GetConnectedUsuarioRed: " & Err.Description
    GetConnectedUsuarioRed = ""
End Function

Public Function GetE2EJsonDestination(ByVal p_UsuarioRed As String, Optional ByRef p_Error As String) As String
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim sql As String

    On Error GoTo ErrorHandler
    p_Error = ""

    If Not EnsureE2EJsonDestinationConfigSchema(p_Error) Then Exit Function
    If Trim$(Nz(p_UsuarioRed, "")) = "" Then
        p_Error = "GetE2EJsonDestination: UsuarioRed requerido"
        Exit Function
    End If

    Set db = getdb(p_Error)
    If p_Error <> "" Then Exit Function
    If db Is Nothing Then
        p_Error = "GetE2EJsonDestination: getdb returned Nothing"
        Exit Function
    End If

    sql = "SELECT TOP 1 RutaDestino FROM " & DESTINATION_CONFIG_TABLE_NAME & _
          " WHERE UsuarioRed='" & SqlStr(p_UsuarioRed) & "'"
    Set rs = db.OpenRecordset(sql, dbOpenSnapshot)
    If Not rs.EOF Then GetE2EJsonDestination = Trim$(Nz(rs.Fields("RutaDestino").value, ""))

    rs.Close
    Set rs = Nothing
    Exit Function

ErrorHandler:
    p_Error = "GetE2EJsonDestination: " & Err.Description
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    GetE2EJsonDestination = ""
End Function

Public Function SetE2EJsonDestination( _
    ByVal p_UsuarioRed As String, _
    ByVal p_RutaDestino As String, _
    Optional ByRef p_Error As String) As Boolean

    Dim db As DAO.Database
    Dim usuarioRed As String
    Dim rutaDestino As String
    Dim sql As String

    On Error GoTo ErrorHandler
    p_Error = ""

    If Not EnsureE2EJsonDestinationConfigSchema(p_Error) Then Exit Function

    usuarioRed = Trim$(Nz(p_UsuarioRed, ""))
    rutaDestino = Trim$(Nz(p_RutaDestino, ""))

    If usuarioRed = "" Then
        p_Error = "SetE2EJsonDestination: UsuarioRed requerido"
        Exit Function
    End If
    If rutaDestino = "" Then
        p_Error = "SetE2EJsonDestination: RutaDestino requerida"
        Exit Function
    End If

    Set db = getdb(p_Error)
    If p_Error <> "" Then Exit Function
    If db Is Nothing Then
        p_Error = "SetE2EJsonDestination: getdb returned Nothing"
        Exit Function
    End If

    db.Execute "DELETE FROM " & DESTINATION_CONFIG_TABLE_NAME & " WHERE UsuarioRed='" & SqlStr(usuarioRed) & "'", dbFailOnError

    sql = "INSERT INTO " & DESTINATION_CONFIG_TABLE_NAME & " (UsuarioRed, RutaDestino, CreatedAt, UpdatedAt) VALUES (" & _
          "'" & SqlStr(usuarioRed) & "', " & _
          "'" & SqlStr(rutaDestino) & "', " & _
          "Now(), Now())"
    db.Execute sql, dbFailOnError

    SetE2EJsonDestination = True
    Exit Function

ErrorHandler:
    p_Error = "SetE2EJsonDestination: " & Err.Description
    SetE2EJsonDestination = False
End Function

Public Function GetE2EJsonDestinationStatus(ByVal p_UsuarioRed As String, Optional ByRef p_Error As String) As String
    Dim rutaDestino As String
    Dim validarError As String

    On Error GoTo ErrorHandler
    p_Error = ""

    rutaDestino = GetE2EJsonDestination(p_UsuarioRed, p_Error)
    If p_Error <> "" Then Exit Function
    If rutaDestino = "" Then
        GetE2EJsonDestinationStatus = "missing"
        Exit Function
    End If

    validarError = ""
    Call ValidarCarpetaEscribible(rutaDestino, "destino JSON E2E", validarError)
    If validarError <> "" Then
        GetE2EJsonDestinationStatus = "invalid"
        Exit Function
    End If

    GetE2EJsonDestinationStatus = "ok"
    Exit Function

ErrorHandler:
    p_Error = "GetE2EJsonDestinationStatus: " & Err.Description
    GetE2EJsonDestinationStatus = "invalid"
End Function

Public Function CanRunManualE2EJsonGeneration(ByVal p_UsuarioRed As String, Optional ByRef p_Error As String) As Boolean
    Dim status As String

    On Error GoTo ErrorHandler
    p_Error = ""

    status = GetE2EJsonDestinationStatus(p_UsuarioRed, p_Error)
    If p_Error <> "" Then Exit Function

    CanRunManualE2EJsonGeneration = (status = "ok")
    Exit Function

ErrorHandler:
    p_Error = "CanRunManualE2EJsonGeneration: " & Err.Description
    CanRunManualE2EJsonGeneration = False
End Function

Private Function EnsureE2EBatchHeaderTable(ByVal p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    On Error GoTo ErrorHandler

    If Not LocalTableExists(p_Db, BATCH_TABLE_NAME) Then
        p_Db.Execute "CREATE TABLE " & BATCH_TABLE_NAME & " (" & _
                     "IDBatch AUTOINCREMENT CONSTRAINT PK_" & BATCH_TABLE_NAME & " PRIMARY KEY, " & _
                     "SessionId TEXT(100) NOT NULL, " & _
                     "UsuarioConectado TEXT(255) NOT NULL, " & _
                     "Estado TEXT(50) NOT NULL, " & _
                     "CreatedAt DATETIME, " & _
                     "StartedAt DATETIME, " & _
                     "CompletedAt DATETIME, " & _
                     "TotalSeleccionados LONG, " & _
                     "TotalExportados LONG, " & _
                     "ErrorMessage MEMO)", dbFailOnError
    End If

    If Not EnsureIndex(p_Db, BATCH_TABLE_NAME, "IX_TbE2EExportBatch_Session", "SessionId, UsuarioConectado", False, p_Error) Then Exit Function

    EnsureE2EBatchHeaderTable = True
    Exit Function

ErrorHandler:
    p_Error = "EnsureE2EBatchHeaderTable: " & Err.Description
    EnsureE2EBatchHeaderTable = False
End Function

Private Function EnsureE2EBatchDetailTable(ByVal p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    On Error GoTo ErrorHandler

    If Not LocalTableExists(p_Db, BATCH_DETAIL_TABLE_NAME) Then
        p_Db.Execute "CREATE TABLE " & BATCH_DETAIL_TABLE_NAME & " (" & _
                     "IDBatchDetalle AUTOINCREMENT CONSTRAINT PK_" & BATCH_DETAIL_TABLE_NAME & " PRIMARY KEY, " & _
                     "IDBatch LONG NOT NULL, " & _
                     "IDExpediente LONG NOT NULL, " & _
                     "OrdinalSeleccion LONG, " & _
                     "HashExportado TEXT(64), " & _
                     "Estado TEXT(50) NOT NULL, " & _
                     "CreatedAt DATETIME, " & _
                     "ExportedAt DATETIME)", dbFailOnError
    End If

    If Not EnsureIndex(p_Db, BATCH_DETAIL_TABLE_NAME, "IX_TbE2EExportBatchDetalle_BatchExpediente", "IDBatch, IDExpediente", True, p_Error) Then Exit Function

    EnsureE2EBatchDetailTable = True
    Exit Function

ErrorHandler:
    p_Error = "EnsureE2EBatchDetailTable: " & Err.Description
    EnsureE2EBatchDetailTable = False
End Function

Private Function LocalTableExists(ByVal p_Db As DAO.Database, ByVal p_TableName As String) As Boolean
    Dim tdf As DAO.TableDef

    On Error Resume Next
    Set tdf = p_Db.TableDefs(p_TableName)
    LocalTableExists = (Err.Number = 0 And Not tdf Is Nothing)
    Err.Clear
    Set tdf = Nothing
End Function

Private Function EnsureIndex( _
    ByVal p_Db As DAO.Database, _
    ByVal p_TableName As String, _
    ByVal p_IndexName As String, _
    ByVal p_FieldsCsv As String, _
    ByVal p_Unique As Boolean, _
    Optional ByRef p_Error As String) As Boolean

    On Error GoTo ErrorHandler

    If Not LocalIndexExists(p_Db, p_TableName, p_IndexName) Then
        p_Db.Execute "CREATE " & IIf(p_Unique, "UNIQUE ", "") & "INDEX " & p_IndexName & _
                     " ON " & p_TableName & " (" & p_FieldsCsv & ")", dbFailOnError
    ElseIf p_Db.TableDefs(p_TableName).Indexes(p_IndexName).Unique <> p_Unique Then
        p_Db.Execute "DROP INDEX " & p_IndexName & " ON " & p_TableName, dbFailOnError
        p_Db.Execute "CREATE " & IIf(p_Unique, "UNIQUE ", "") & "INDEX " & p_IndexName & _
                     " ON " & p_TableName & " (" & p_FieldsCsv & ")", dbFailOnError
    End If
    p_Db.TableDefs.Refresh

    EnsureIndex = True
    Exit Function

ErrorHandler:
    p_Error = "EnsureIndex(" & p_TableName & "." & p_IndexName & "): " & Err.Description
    EnsureIndex = False
End Function

Private Function LocalIndexExists(ByVal p_Db As DAO.Database, ByVal p_TableName As String, ByVal p_IndexName As String) As Boolean
    Dim idx As DAO.Index

    On Error Resume Next
    Set idx = p_Db.TableDefs(p_TableName).Indexes(p_IndexName)
    LocalIndexExists = (Err.Number = 0 And Not idx Is Nothing)
    Err.Clear
    Set idx = Nothing
End Function

Public Function AddSelectionTempRow( _
    ByVal p_UsuarioConectado As String, _
    ByVal p_SessionId As String, _
    ByVal p_IDExpediente As Long, _
    Optional ByRef p_Error As String) As Boolean

    Dim db As DAO.Database
    Dim sql As String
    On Error GoTo ErrorHandler

    p_Error = ""
    If Not EnsureE2ESelectionTempTable(p_Error) Then Exit Function

    Set db = getdb(p_Error)
    If p_Error <> "" Then Exit Function
    If db Is Nothing Then
        p_Error = "AddSelectionTempRow: getdb returned Nothing"
        Exit Function
    End If

    sql = "DELETE FROM " & TEMP_TABLE_NAME & _
          " WHERE UsuarioConectado='" & SqlStr(p_UsuarioConectado) & _
          "' AND SessionId='" & SqlStr(p_SessionId) & _
          "' AND IDExpediente=" & CLng(p_IDExpediente)
    db.Execute sql, dbFailOnError

    sql = "INSERT INTO " & TEMP_TABLE_NAME & " (UsuarioConectado, SessionId, IDExpediente, CreatedAt) VALUES (" & _
          "'" & SqlStr(p_UsuarioConectado) & "', " & _
          "'" & SqlStr(p_SessionId) & "', " & _
          CLng(p_IDExpediente) & ", Now())"
    db.Execute sql, dbFailOnError

    AddSelectionTempRow = True
    Exit Function

ErrorHandler:
    p_Error = "AddSelectionTempRow: " & Err.Description
    AddSelectionTempRow = False
End Function

Public Function CountSelectionTempRows( _
    ByVal p_UsuarioConectado As String, _
    ByVal p_SessionId As String, _
    Optional ByRef p_Error As String) As Long

    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim sql As String
    On Error GoTo ErrorHandler

    p_Error = ""
    If Not EnsureE2ESelectionTempTable(p_Error) Then Exit Function

    Set db = getdb(p_Error)
    If p_Error <> "" Then Exit Function
    If db Is Nothing Then
        p_Error = "CountSelectionTempRows: getdb returned Nothing"
        Exit Function
    End If

    sql = "SELECT COUNT(*) AS Cnt FROM " & TEMP_TABLE_NAME & _
          " WHERE UsuarioConectado='" & SqlStr(p_UsuarioConectado) & _
          "' AND SessionId='" & SqlStr(p_SessionId) & "'"
    Set rs = db.OpenRecordset(sql, dbOpenSnapshot)

    If Not rs.EOF Then CountSelectionTempRows = CLng(Nz(rs.Fields("Cnt").value, 0))
    rs.Close
    Set rs = Nothing
    Exit Function

ErrorHandler:
    p_Error = "CountSelectionTempRows: " & Err.Description
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    CountSelectionTempRows = 0
End Function

Public Function ClearSelectionTempRows( _
    ByVal p_UsuarioConectado As String, _
    ByVal p_SessionId As String, _
    Optional ByRef p_Error As String) As Boolean

    Dim db As DAO.Database
    On Error GoTo ErrorHandler

    p_Error = ""
    If Not EnsureE2ESelectionTempTable(p_Error) Then Exit Function

    Set db = getdb(p_Error)
    If p_Error <> "" Then Exit Function
    If db Is Nothing Then
        p_Error = "ClearSelectionTempRows: getdb returned Nothing"
        Exit Function
    End If

    db.Execute "DELETE FROM " & TEMP_TABLE_NAME & _
               " WHERE UsuarioConectado='" & SqlStr(p_UsuarioConectado) & _
               "' AND SessionId='" & SqlStr(p_SessionId) & "'", dbFailOnError

    ClearSelectionTempRows = True
    Exit Function

ErrorHandler:
    p_Error = "ClearSelectionTempRows: " & Err.Description
    ClearSelectionTempRows = False
End Function

Public Function BuildDetailPreviewRoute(ByVal p_IDExpediente As Long, Optional ByRef p_Error As String) As String
    On Error GoTo ErrorHandler
    p_Error = ""
    BuildDetailPreviewRoute = "expediente=" & CStr(p_IDExpediente) & "|actions=detail,preview"
    Exit Function
ErrorHandler:
    p_Error = "BuildDetailPreviewRoute: " & Err.Description
    BuildDetailPreviewRoute = ""
End Function

Private Function ParseCsvToCollection(ByVal p_Csv As String) As Collection
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

Private Function ParseCsvToDict(ByVal p_Csv As String) As Object
    Dim dict As Object
    Dim parts() As String
    Dim i As Long
    Dim value As String

    Set dict = CreateObject("Scripting.Dictionary")
    If Trim$(p_Csv) = "" Then
        Set ParseCsvToDict = dict
        Exit Function
    End If

    parts = Split(p_Csv, ",")
    For i = LBound(parts) To UBound(parts)
        value = Trim$(parts(i))
        If value <> "" Then
            If Not dict.exists(value) Then dict.Add value, True
        End If
    Next i
    Set ParseCsvToDict = dict
End Function

Private Sub AppendCsvValue(ByRef p_Csv As String, ByVal p_Value As String)
    If Trim$(p_Csv) = "" Then
        p_Csv = p_Value
    Else
        p_Csv = p_Csv & "," & p_Value
    End If
End Sub

Private Function NormalizeCsv(ByVal p_Csv As String, Optional ByRef p_Error As String) As String
    NormalizeCsv = BuildPickerAvailableCsv(p_Csv, "", p_Error)
End Function

Private Function SqlStr(ByVal p_Value As String) As String
    SqlStr = Replace(Nz(p_Value, ""), "'", "''")
End Function

