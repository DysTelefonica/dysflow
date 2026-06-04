Attribute VB_Name = "modPipeFlatten"
Option Compare Database
Option Explicit

' ============================================
' PipeFlatten helper — concat 1-to-N rows into a pipe-delimited string
' ============================================
' W2 implementation. Replaces the W1 5-line observable no-op stub.
'
' Contract (REQ-PIPEFLATTEN):
'   - Query p_SourceTable for rows where p_IDColumn = p_IDValue
'   - Concatenate p_Column values with "|" separator
'   - Sanitize: replace "|" in content with " " (space)
'   - Return "" if zero rows match
'   - Resilient: return "" if p_SourceTable doesn't exist (never raises)
'   - If p_Db is Nothing, opens the default backend via getdb()
'
' Project-agnostic: works on any DAO table the caller names. Used by
' SDD cache-form-filter-coverage WU2 to flatten 1-to-N children
' (AccionesCorrectivas, AccionesRealizadas) for Google/PC search.
' ============================================

Public Function PipeFlatten( _
                            ByVal p_SourceTable As String, _
                            ByVal p_Column As String, _
                            ByVal p_IDColumn As String, _
                            ByVal p_IDValue As Long, _
                            p_Db As DAO.Database, _
                            ByRef p_Error As String _
                            ) As String
    On Error GoTo errores

    Dim dbLocal As DAO.Database
    Dim rs As DAO.Recordset
    Dim sql As String
    Dim result As String
    Dim first As Boolean

    p_Error = ""
    result = ""
    first = True

    ' Resolver db: usar el inyectado, o abrir el default si Nothing
    If p_Db Is Nothing Then
        Set dbLocal = getdb(p_Error)
        If p_Error <> "" Or dbLocal Is Nothing Then
            PipeFlatten = ""
            Exit Function
        End If
    Else
        Set dbLocal = p_Db
    End If

    ' REQ-PIPEFLATTEN-RESILIENT: si la tabla no existe, devolver "" sin raise
    ' y registrar el evento trazable exigido por la spec.
    If Not TableExistsInDb(dbLocal, p_SourceTable) Then
        LogPipeFlattenMissingTable dbLocal, p_SourceTable, p_IDValue
        PipeFlatten = ""
        Exit Function
    End If

    ' Concatenar p_Column de todas las filas donde p_IDColumn = p_IDValue
    sql = "SELECT [" & p_Column & "] AS C FROM [" & p_SourceTable & "] WHERE [" & p_IDColumn & "] = " & p_IDValue
    Set rs = dbLocal.OpenRecordset(sql, dbOpenSnapshot)

    Do While Not rs.EOF
        Dim v As String
        v = Nz(rs.Fields("C").Value, "")
        ' REQ-PIPEFLATTEN-SANITIZE: reemplazar "|" en el contenido con espacio
        v = Replace(v, "|", " ")
        If first Then
            result = v
            first = False
        Else
            result = result & "|" & v
        End If
        rs.MoveNext
    Loop
    rs.Close
    Set rs = Nothing

    PipeFlatten = result
    Exit Function

errores:
    p_Error = "PipeFlatten: " & Err.Number & " - " & Err.Description
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    PipeFlatten = ""
End Function

' Helper local: ¿la tabla existe en el db? Nunca raises.
Private Function TableExistsInDb(ByVal p_Db As DAO.Database, ByVal p_TableName As String) As Boolean
    Dim tdf As DAO.TableDef
    On Error GoTo notfound
    If p_Db Is Nothing Then
        TableExistsInDb = False
        Exit Function
    End If
    Set tdf = p_Db.TableDefs(p_TableName)
    TableExistsInDb = True
    Exit Function
notfound:
    TableExistsInDb = False
End Function

Private Sub LogPipeFlattenMissingTable( _
                                      ByVal p_Db As DAO.Database, _
                                      ByVal p_SourceTable As String, _
                                      ByVal p_IDValue As Long _
                                      )
    On Error Resume Next

    If p_Db Is Nothing Then Exit Sub
    If Not TableExistsInDb(p_Db, "TbLogCache") Then Exit Sub

    p_Db.Execute "INSERT INTO TbLogCache " & _
                 "(IDNoConformidad, TipoOperacion, SeccionCache, Detalles, FechaOperacion, Usuario, DuracionMs, Exito) VALUES (" & _
                 CStr(p_IDValue) & ", 'PipeFlattenMissingTable', 'PipeFlatten', " & _
                 "'Missing source table: " & Replace(p_SourceTable, "'", "''") & "', Now(), 'Sistema', 0, True)", dbFailOnError
End Sub

