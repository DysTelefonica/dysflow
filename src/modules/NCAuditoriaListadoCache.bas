Attribute VB_Name = "NCAuditoriaListadoCache"
Option Compare Database
Option Explicit

Private Const CACHE_TABLE As String = "TbCacheListadoNCAuditoria"

Public Function EnsureNCAuditoriaListadoCacheSchema(Optional ByRef p_Error As String) As Boolean
    Dim db As DAO.Database

    On Error GoTo EH
    p_Error = ""
    Set db = getdb()

    If Not TableExists(db, CACHE_TABLE) Then
        db.Execute "CREATE TABLE " & CACHE_TABLE & " (ID LONG)", dbFailOnError
        db.TableDefs.Refresh
    End If

    EnsureField db, "IDAuditoria", dbLong
    EnsureField db, "Tipo", dbText, 255
    EnsureField db, "Numero", dbText, 255
    EnsureField db, "Descripcion", dbMemo
    EnsureField db, "CAUSARAIZ", dbMemo
    EnsureField db, "RESPONSABLEIMPLANTACION", dbText, 255
    EnsureField db, "Estado", dbText, 255
    EnsureField db, "FechaApertura", dbDate
    EnsureField db, "FECHACIERRE", dbDate
    EnsureField db, "RequiereControlEficacia", dbText, 25
    EnsureField db, "ControlEficacia", dbMemo
    EnsureField db, "Notas", dbMemo
    EnsureField db, "Cerrada", dbText, 10
    EnsureField db, "Borrado", dbBoolean
    EnsureField db, "AccionesCorrectivasConcatenadas", dbMemo
    EnsureField db, "AccionesRealizadasConcatenadas", dbMemo
    EnsureField db, "FechaCache", dbDate
    EnsureField db, "CacheValida", dbBoolean
    EnsureField db, "Version", dbLong
    db.TableDefs.Refresh

    EnsureIndex db, "PK_TbCacheListadoNCAuditoria", True, Array("ID")
    EnsureIndex db, "IX_TbCacheListadoNCAuditoria_AuditoriaValida", False, Array("IDAuditoria", "CacheValida")
    EnsureIndex db, "IX_TbCacheListadoNCAuditoria_EstadoValida", False, Array("Estado", "CacheValida")

    EnsureNCAuditoriaListadoCacheSchema = True
CleanExit:
    Set db = Nothing
    Exit Function
EH:
    p_Error = "EnsureNCAuditoriaListadoCacheSchema: " & Err.Description
    EnsureNCAuditoriaListadoCacheSchema = False
    Resume CleanExit
End Function

Public Function TryReadNCAuditoriaListadoCache( _
    Optional ByVal p_IDAuditoria As Long = 0, _
    Optional ByVal p_Tipo As String = "", _
    Optional ByVal p_Descripcion As String = "", _
    Optional ByVal p_ResponsableImplantacion As String = "", _
    Optional ByVal p_Estado As String = "", _
    Optional ByVal p_PalabraClave As String = "", _
    Optional ByVal p_RequiereControlEficacia As String = "", _
    Optional ByVal p_ControlEficaciaRelleno As String = "", _
    Optional ByRef p_FallbackReason As String, _
    Optional ByRef p_Error As String _
    ) As Collection

    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim sql As String
    Dim col As Collection

    On Error GoTo EH
    p_Error = ""
    p_FallbackReason = ""
    Set db = getdb()

    If Not TableExists(db, CACHE_TABLE) Then
        p_FallbackReason = "Audit cache source not available: " & CACHE_TABLE
        GoTo CleanExit
    End If

    sql = "SELECT ID, IDAuditoria, Tipo, Numero, Descripcion, CAUSARAIZ, RESPONSABLEIMPLANTACION, Estado, " & _
          "FechaApertura, FECHACIERRE, RequiereControlEficacia, ControlEficacia, Notas, Cerrada, Borrado, " & _
          "AccionesCorrectivasConcatenadas, AccionesRealizadasConcatenadas, FechaCache, CacheValida, Version " & _
          "FROM " & CACHE_TABLE & " WHERE CacheValida=True "
    If p_IDAuditoria > 0 Then sql = sql & "AND IDAuditoria=" & CStr(p_IDAuditoria) & " "
    If p_Tipo <> "" Then sql = sql & "AND Tipo=" & SqlText(p_Tipo) & " "
    If p_Descripcion <> "" Then sql = sql & "AND Descripcion LIKE " & LikeText(p_Descripcion) & " "
    If p_ResponsableImplantacion <> "" Then sql = sql & "AND RESPONSABLEIMPLANTACION=" & SqlText(p_ResponsableImplantacion) & " "
    If p_Estado <> "" Then
        If p_Estado = "Abiertas" Then
            If p_PalabraClave = "" Then sql = sql & "AND Cerrada='No' "
        Else
            sql = sql & "AND Estado=" & SqlText(p_Estado) & " "
        End If
    End If
    If p_PalabraClave <> "" Then
        sql = sql & "AND (Descripcion LIKE " & LikeText(p_PalabraClave) & _
              " OR CAUSARAIZ LIKE " & LikeText(p_PalabraClave) & _
              " OR AccionesCorrectivasConcatenadas LIKE " & LikeText(p_PalabraClave) & _
              " OR AccionesRealizadasConcatenadas LIKE " & LikeText(p_PalabraClave) & ") "
    End If
    If p_RequiereControlEficacia <> "" Then sql = sql & "AND RequiereControlEficacia=" & SqlText(p_RequiereControlEficacia) & " "
    If p_ControlEficaciaRelleno = "Sí" Then
        sql = sql & "AND ControlEficacia IS NOT NULL AND ControlEficacia<>'' "
    ElseIf p_ControlEficaciaRelleno = "No" Then
        sql = sql & "AND (ControlEficacia IS NULL OR ControlEficacia='') "
    End If
    sql = sql & "ORDER BY FechaApertura DESC, ID DESC"

    Set rs = db.OpenRecordset(sql, dbOpenSnapshot)
    Set col = New Collection
    Do While Not rs.EOF
        col.Add CacheRowFromRecordset(rs)
        rs.MoveNext
    Loop
    If col.count > 0 Then
        Set TryReadNCAuditoriaListadoCache = col
    Else
        p_FallbackReason = "Audit cache source has no valid matching rows"
    End If

CleanExit:
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
    Exit Function
EH:
    p_Error = "TryReadNCAuditoriaListadoCache: " & Err.Description
    p_FallbackReason = "Audit cache read failed safely"
    Resume CleanExit
End Function

Public Function UpsertListadoItem(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    Dim db As DAO.Database

    On Error GoTo EH
    p_Error = ""
    Set db = getdb()
    If Not EnsureNCAuditoriaListadoCacheSchema(p_Error) Then GoTo CleanExit
    UpsertListadoItem = UpsertListadoItemInDb(db, p_IDNC, p_Error)

CleanExit:
    Set db = Nothing
    Exit Function
EH:
    p_Error = "UpsertListadoItem: " & Err.Description
    Resume CleanExit
End Function

Private Function UpsertListadoItemInDb(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    Dim db As DAO.Database
    Dim rsSrc As DAO.Recordset
    Dim rsCache As DAO.Recordset
    Dim sql As String

    On Error GoTo EH
    p_Error = ""
    If p_IDNC <= 0 Then Exit Function
    Set db = p_Db

    sql = "SELECT ID, IDAuditoria, Tipo, Numero, DESCRIPCION, CAUSARAIZ, RESPONSABLEIMPLANTACION, ESTADO, " & _
          "FechaApertura, FECHACIERRE, RequiereControlEficacia, ControlEficacia, Borrado " & _
          "FROM TbNoConformidadesAuditoria WHERE ID=" & CStr(p_IDNC)
    Set rsSrc = db.OpenRecordset(sql, dbOpenSnapshot)
    If rsSrc.EOF Then GoTo CleanExit

    Set rsCache = db.OpenRecordset("SELECT * FROM " & CACHE_TABLE & " WHERE ID=" & CStr(p_IDNC), dbOpenDynaset)
    If rsCache.EOF Then
        rsCache.AddNew
        rsCache!ID = p_IDNC
        rsCache!Version = 1
    Else
        rsCache.Edit
        rsCache!Version = CLng(Nz(rsCache!Version, 0)) + 1
    End If
    rsCache!IDAuditoria = Nz(rsSrc!IDAuditoria, 0)
    rsCache!Tipo = NullIfEmptyText(rsSrc!Tipo)
    rsCache!Numero = NullIfEmptyText(rsSrc!Numero)
    rsCache!Descripcion = NullIfEmptyText(rsSrc!DESCRIPCION)
    rsCache!CAUSARAIZ = NullIfEmptyText(rsSrc!CAUSARAIZ)
    rsCache!RESPONSABLEIMPLANTACION = NullIfEmptyText(rsSrc!RESPONSABLEIMPLANTACION)
    rsCache!Estado = NullIfEmptyText(rsSrc!ESTADO)
    rsCache!FechaApertura = Nz(rsSrc!FechaApertura, Null)
    rsCache!FECHACIERRE = Nz(rsSrc!FECHACIERRE, Null)
    rsCache!RequiereControlEficacia = NullIfEmptyText(rsSrc!RequiereControlEficacia)
    rsCache!ControlEficacia = NullIfEmptyText(rsSrc!ControlEficacia)
    rsCache!Cerrada = IIf(IsNull(rsSrc!FECHACIERRE), "No", "Sí")
    rsCache!Borrado = CBool(Nz(rsSrc!Borrado, False))
    rsCache!AccionesCorrectivasConcatenadas = NullIfEmptyText(JoinAuditCorrectiveActions(db, p_IDNC))
    rsCache!AccionesRealizadasConcatenadas = NullIfEmptyText(JoinAuditRealizedActions(db, p_IDNC))
    rsCache!FechaCache = Now()
    rsCache!CacheValida = True
    rsCache.Update
    UpsertListadoItemInDb = True

CleanExit:
    On Error Resume Next
    If Not rsCache Is Nothing Then rsCache.Close
    If Not rsSrc Is Nothing Then rsSrc.Close
    Set rsCache = Nothing
    Set rsSrc = Nothing
    Exit Function
EH:
    p_Error = "UpsertListadoItemInDb: " & Err.Description
    Resume CleanExit
End Function

Public Function RebuildNCAuditoriaListadoCache(Optional ByVal p_IDAuditoria As Long = 0, Optional ByRef p_Error As String) As Boolean
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim sql As String
    Dim transactionStarted As Boolean

    On Error GoTo EH
    p_Error = ""
    Set db = getdb()
    If Not EnsureNCAuditoriaListadoCacheSchema(p_Error) Then Exit Function

    db.BeginTrans
    transactionStarted = True

    sql = "UPDATE " & CACHE_TABLE & " SET CacheValida=False, FechaCache=Now()"
    If p_IDAuditoria > 0 Then sql = sql & " WHERE IDAuditoria=" & CStr(p_IDAuditoria)
    db.Execute sql, dbFailOnError

    sql = "SELECT ID FROM TbNoConformidadesAuditoria WHERE Nz(Borrado,False)=False "
    If p_IDAuditoria > 0 Then sql = sql & "AND IDAuditoria=" & CStr(p_IDAuditoria) & " "
    Set rs = db.OpenRecordset(sql, dbOpenSnapshot)
    Do While Not rs.EOF
        If Not UpsertListadoItemInDb(db, CLng(rs!ID), p_Error) Then GoTo RollbackRebuild
        rs.MoveNext
    Loop
    db.CommitTrans
    transactionStarted = False
    RebuildNCAuditoriaListadoCache = True

CleanExit:
    On Error Resume Next
    If transactionStarted Then db.Rollback
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
    Exit Function
RollbackRebuild:
    p_Error = "RebuildNCAuditoriaListadoCache: " & p_Error
    Resume CleanExit
EH:
    p_Error = "RebuildNCAuditoriaListadoCache: " & Err.Description
    Resume CleanExit
End Function

Public Function InvalidateNCAuditoriaListadoCacheItem(ByVal p_IDNC As Long, Optional ByRef p_Error As String) As Boolean
    On Error GoTo EH
    p_Error = ""
    If p_IDNC <= 0 Then Exit Function
    getdb().Execute "UPDATE " & CACHE_TABLE & " SET CacheValida=False, FechaCache=Now() WHERE ID=" & CStr(p_IDNC), dbFailOnError
    InvalidateNCAuditoriaListadoCacheItem = True
    Exit Function
EH:
    p_Error = "InvalidateNCAuditoriaListadoCacheItem: " & Err.Description
End Function

Public Function InvalidateNCAuditoriaListadoCacheAll(Optional ByVal p_IDAuditoria As Long = 0, Optional ByRef p_Error As String) As Boolean
    Dim sql As String

    On Error GoTo EH
    p_Error = ""
    sql = "UPDATE " & CACHE_TABLE & " SET CacheValida=False, FechaCache=Now()"
    If p_IDAuditoria > 0 Then sql = sql & " WHERE IDAuditoria=" & CStr(p_IDAuditoria)
    getdb().Execute sql, dbFailOnError
    InvalidateNCAuditoriaListadoCacheAll = True
    Exit Function
EH:
    p_Error = "InvalidateNCAuditoriaListadoCacheAll: " & Err.Description
End Function

Private Function CacheRowFromRecordset(ByVal p_Rs As DAO.Recordset) As Scripting.Dictionary
    Dim row As Scripting.Dictionary

    Set row = New Scripting.Dictionary
    row.CompareMode = TextCompare
    row.Add "ID", Nz(p_Rs!ID, "")
    row.Add "IDAuditoria", Nz(p_Rs!IDAuditoria, "")
    row.Add "Tipo", Nz(p_Rs!Tipo, "")
    row.Add "Numero", Nz(p_Rs!Numero, "")
    row.Add "Descripcion", Nz(p_Rs!Descripcion, "")
    row.Add "CAUSARAIZ", Nz(p_Rs!CAUSARAIZ, "")
    row.Add "RESPONSABLEIMPLANTACION", Nz(p_Rs!RESPONSABLEIMPLANTACION, "")
    row.Add "Estado", Nz(p_Rs!Estado, "")
    row.Add "FechaApertura", Nz(p_Rs!FechaApertura, "")
    row.Add "FECHACIERRE", Nz(p_Rs!FECHACIERRE, "")
    row.Add "RequiereControlEficacia", Nz(p_Rs!RequiereControlEficacia, "")
    row.Add "ControlEficacia", Nz(p_Rs!ControlEficacia, "")
    row.Add "Notas", Nz(p_Rs!Notas, "")
    row.Add "Cerrada", Nz(p_Rs!Cerrada, "")
    row.Add "Borrado", Nz(p_Rs!Borrado, "")
    row.Add "AccionesCorrectivasConcatenadas", Nz(p_Rs!AccionesCorrectivasConcatenadas, "")
    row.Add "AccionesRealizadasConcatenadas", Nz(p_Rs!AccionesRealizadasConcatenadas, "")
    row.Add "FechaCache", Nz(p_Rs!FechaCache, "")
    row.Add "CacheValida", Nz(p_Rs!CacheValida, "")
    row.Add "Version", Nz(p_Rs!Version, "")
    Set CacheRowFromRecordset = row
End Function

Private Function JoinAuditCorrectiveActions(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long) As String
    JoinAuditCorrectiveActions = JoinMemoValues(p_Db, "SELECT AccionCorrectiva AS Txt FROM TbNCAuditoriaAccionCorrectivas WHERE ID=" & CStr(p_IDNC) & " ORDER BY NAccion, IDAccionCorrectiva")
End Function

Private Function JoinAuditRealizedActions(ByVal p_Db As DAO.Database, ByVal p_IDNC As Long) As String
    JoinAuditRealizedActions = JoinMemoValues(p_Db, "SELECT TbNCAuditoriaAccionesRealizadas.AccionRealizada AS Txt " & _
        "FROM TbNCAuditoriaAccionCorrectivas INNER JOIN TbNCAuditoriaAccionesRealizadas " & _
        "ON TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva=TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva " & _
        "WHERE TbNCAuditoriaAccionCorrectivas.ID=" & CStr(p_IDNC) & " ORDER BY TbNCAuditoriaAccionesRealizadas.NAccion, TbNCAuditoriaAccionesRealizadas.IDAccionRealizada")
End Function

Private Function JoinMemoValues(ByVal p_Db As DAO.Database, ByVal p_Sql As String) As String
    Dim rs As DAO.Recordset
    Dim result As String
    Dim value As String

    Set rs = p_Db.OpenRecordset(p_Sql, dbOpenSnapshot)
    Do While Not rs.EOF
        value = Nz(rs!Txt, "")
        If value <> "" Then
            If result <> "" Then result = result & " | "
            result = result & value
        End If
        rs.MoveNext
    Loop
    rs.Close
    Set rs = Nothing
    JoinMemoValues = result
End Function

Private Function NullIfEmptyText(ByVal p_Value As Variant) As Variant
    Dim value As String

    value = Trim$(Nz(p_Value, ""))
    If value = "" Then
        NullIfEmptyText = Null
    Else
        NullIfEmptyText = p_Value
    End If
End Function

Private Sub EnsureField(ByVal p_Db As DAO.Database, ByVal p_FieldName As String, ByVal p_Type As Long, Optional ByVal p_Size As Long = 0)
    Dim tdf As DAO.TableDef
    Dim fld As DAO.Field

    If FieldExists(p_Db, p_FieldName) Then Exit Sub
    Set tdf = p_Db.TableDefs(CACHE_TABLE)
    If p_Size > 0 Then
        Set fld = tdf.CreateField(p_FieldName, p_Type, p_Size)
    Else
        Set fld = tdf.CreateField(p_FieldName, p_Type)
    End If
    tdf.Fields.Append fld
    p_Db.TableDefs.Refresh
End Sub

Private Sub EnsureIndex(ByVal p_Db As DAO.Database, ByVal p_IndexName As String, ByVal p_Unique As Boolean, ByVal p_Fields As Variant)
    Dim tdf As DAO.TableDef
    Dim idx As DAO.Index
    Dim fieldName As Variant

    If IndexExists(p_Db, p_IndexName) Then Exit Sub
    Set tdf = p_Db.TableDefs(CACHE_TABLE)
    Set idx = tdf.CreateIndex(p_IndexName)
    idx.Unique = p_Unique
    For Each fieldName In p_Fields
        idx.Fields.Append idx.CreateField(CStr(fieldName))
    Next fieldName
    tdf.Indexes.Append idx
    p_Db.TableDefs.Refresh
End Sub

Private Function TableExists(ByVal p_Db As DAO.Database, ByVal p_TableName As String) As Boolean
    Dim tdf As DAO.TableDef
    On Error GoTo notfound
    Set tdf = p_Db.TableDefs(p_TableName)
    TableExists = True
    Exit Function
notfound:
    TableExists = False
End Function

Private Function FieldExists(ByVal p_Db As DAO.Database, ByVal p_FieldName As String) As Boolean
    Dim fld As DAO.Field
    On Error GoTo notfound
    Set fld = p_Db.TableDefs(CACHE_TABLE).Fields(p_FieldName)
    FieldExists = True
    Exit Function
notfound:
    FieldExists = False
End Function

Private Function IndexExists(ByVal p_Db As DAO.Database, ByVal p_IndexName As String) As Boolean
    Dim idx As DAO.Index
    On Error GoTo notfound
    Set idx = p_Db.TableDefs(CACHE_TABLE).Indexes(p_IndexName)
    IndexExists = True
    Exit Function
notfound:
    IndexExists = False
End Function

Private Function SqlText(ByVal p_Value As String) As String
    SqlText = "'" & Replace(p_Value, "'", "''") & "'"
End Function

Private Function LikeText(ByVal p_Value As String) As String
    LikeText = SqlText("*" & Replace(p_Value, "*", "[*]") & "*")
End Function
