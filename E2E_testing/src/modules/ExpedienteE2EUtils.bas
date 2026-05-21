Attribute VB_Name = "ExpedienteE2EUtils"
Option Compare Database
Option Explicit

Public Function GetMaxOrdinalE2E(Optional ByRef p_Error As String) As Long
    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim maxVal As Long

    On Error GoTo errores

    p_Error = ""
    maxVal = 0

    Set db = getdb()
    Set rs = db.OpenRecordset( _
        "SELECT MAX(OrdinalE2E) AS MaxOrdinalE2E " & _
        "FROM TbExpedientes " & _
        "WHERE OrdinalE2E IS NOT NULL", _
        dbOpenSnapshot)

    If Not rs.EOF Then
        If Not IsNull(rs.Fields("MaxOrdinalE2E").value) Then
            maxVal = CLng(rs.Fields("MaxOrdinalE2E").value)
        End If
    End If

    rs.Close
    Set rs = Nothing
    Set db = Nothing

    GetMaxOrdinalE2E = maxVal
    Exit Function

errores:
    p_Error = "GetMaxOrdinalE2E error: " & Err.Description
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
    GetMaxOrdinalE2E = 0
End Function

Public Function ValidateOrdinalE2EUniqueness( _
    ByVal p_IDExpediente As Long, _
    ByVal p_OrdinalE2E As Long, _
    Optional ByRef p_Error As String) As Boolean

    Dim db As DAO.Database
    Dim rs As DAO.Recordset
    Dim sql As String
    Dim rowCount As Long

    On Error GoTo errores

    p_Error = ""
    ValidateOrdinalE2EUniqueness = True

    If p_OrdinalE2E <= 0 Then Exit Function

    sql = "SELECT COUNT(*) AS Cnt FROM TbExpedientes " & _
          "WHERE OrdinalE2E=" & p_OrdinalE2E & " " & _
          "AND IDExpediente<>" & p_IDExpediente & ";"

    Set db = getdb()
    Set rs = db.OpenRecordset(sql, dbOpenSnapshot)

    rowCount = 0
    If Not rs.EOF Then rowCount = CLng(rs.Fields("Cnt").value)

    rs.Close
    Set rs = Nothing
    Set db = Nothing

    ValidateOrdinalE2EUniqueness = (rowCount = 0)
    Exit Function

errores:
    p_Error = "ValidateOrdinalE2EUniqueness error: " & Err.Description
    On Error Resume Next
    If Not rs Is Nothing Then rs.Close
    Set rs = Nothing
    Set db = Nothing
    ValidateOrdinalE2EUniqueness = False
End Function

