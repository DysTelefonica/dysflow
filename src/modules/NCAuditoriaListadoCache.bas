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
