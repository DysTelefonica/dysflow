Attribute VB_Name = "ACRepository"
Option Compare Database
Option Explicit

Public Function GetById(ByVal p_IDAC As String, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As ACProyecto
    Dim rs As DAO.Recordset
    Dim SQL As String
    Dim m_AC As ACProyecto
    
    On Error GoTo errores
    p_Error = ""
    
    If p_IDAC = "" Then
        Set GetById = Nothing
        Exit Function
    End If
    
    SQL = "SELECT * FROM TbNCAccionCorrectivas WHERE IDAccionCorrectiva = " & p_IDAC & ";"
    Set rs = p_Db.OpenRecordset(SQL)
    
    If rs.EOF Then
        rs.Close
        Set GetById = Nothing
        Exit Function
    End If
    
    Set m_AC = New ACProyecto
    
    With m_AC
        .IdAccionCorrectiva = Nz(rs!IdAccionCorrectiva, "")
        .IDNoConformidad = Nz(rs!IDNoConformidad, "")
        .NAccion = Nz(rs!NAccion, "")
        .AccionCorrectiva = Nz(rs!AccionCorrectiva, "")
        .FechaAccionCorrectiva = Nz(rs!FechaAccionCorrectiva, "")
        .Estado = Nz(rs!Estado, "")
        .FechaInicialMinima = Nz(rs!FechaInicialMinima, "")
        .FechaFinalUltima = Nz(rs!FechaFinalUltima, "")
        .FechaFinPrevistaUltima = Nz(rs!FechaFinPrevistaUltima, "")
        .Notas = Nz(rs!Notas, "")
        .Responsable = Nz(rs!Responsable, "")
    End With
    
    rs.Close
    Set GetById = m_AC
    Exit Function
    
errores:
    p_Error = "ACRepository.GetById: " & Err.Description
    Set GetById = Nothing
End Function

Public Function GetByIdNC(ByVal p_IDNC As String, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Collection
    Dim rs As DAO.Recordset
    Dim SQL As String
    Dim col As Collection
    Dim m_AC As ACProyecto
    
    On Error GoTo errores
    p_Error = ""
    
    If p_IDNC = "" Then
        Set GetByIdNC = New Collection
        Exit Function
    End If
    
    SQL = "SELECT * FROM TbNCAccionCorrectivas WHERE IDNoConformidad = " & p_IDNC & ";"
    Set rs = p_Db.OpenRecordset(SQL)
    Set col = New Collection
    
    Do While Not rs.EOF
        Set m_AC = New ACProyecto
        
        With m_AC
            .IdAccionCorrectiva = Nz(rs!IdAccionCorrectiva, "")
            .IDNoConformidad = Nz(rs!IDNoConformidad, "")
            .NAccion = Nz(rs!NAccion, "")
            .AccionCorrectiva = Nz(rs!AccionCorrectiva, "")
            .FechaAccionCorrectiva = Nz(rs!FechaAccionCorrectiva, "")
            .Estado = Nz(rs!Estado, "")
            .FechaInicialMinima = Nz(rs!FechaInicialMinima, "")
            .FechaFinalUltima = Nz(rs!FechaFinalUltima, "")
            .FechaFinPrevistaUltima = Nz(rs!FechaFinPrevistaUltima, "")
            .Notas = Nz(rs!Notas, "")
            .Responsable = Nz(rs!Responsable, "")
        End With
        
        col.Add m_AC
        rs.MoveNext
    Loop
    
    rs.Close
    Set GetByIdNC = col
    Exit Function
    
errores:
    p_Error = "ACRepository.GetByIdNC: " & Err.Description
    Set GetByIdNC = New Collection
End Function

Public Function Insert(ByRef p_AC As ACProyecto, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim rs As DAO.Recordset
    Dim SQL As String
    
    On Error GoTo errores
    p_Error = ""
    Insert = False
    
    If p_AC Is Nothing Then
        p_Error = "AC no puede ser Nothing"
        Exit Function
    End If
    
    SQL = "TbNCAccionCorrectivas"
    Set rs = p_Db.OpenRecordset(SQL)
    
    rs.AddNew
        rs!IdAccionCorrectiva = p_AC.IdAccionCorrectiva
        rs!IDNoConformidad = p_AC.IDNoConformidad
        
        If p_AC.NAccion <> "" Then
            rs!NAccion = p_AC.NAccion
        End If
        
        rs!AccionCorrectiva = p_AC.AccionCorrectiva
        
        If p_AC.FechaAccionCorrectiva <> "" Then
            rs!FechaAccionCorrectiva = p_AC.FechaAccionCorrectiva
        End If
        
        If p_AC.Estado <> "" Then
            rs!Estado = p_AC.Estado
        End If
        
        If p_AC.Notas <> "" Then
            rs!Notas = p_AC.Notas
        End If
        
        If p_AC.Responsable <> "" Then
            rs!Responsable = p_AC.Responsable
        End If
        
        If p_AC.FechaInicialMinima <> "" Then
            rs!FechaInicialMinima = p_AC.FechaInicialMinima
        End If
        
        If p_AC.FechaFinalUltima <> "" Then
            rs!FechaFinalUltima = p_AC.FechaFinalUltima
        End If
        
        If p_AC.FechaFinPrevistaUltima <> "" Then
            rs!FechaFinPrevistaUltima = p_AC.FechaFinPrevistaUltima
        End If
    rs.Update
    rs.Close
    
    Insert = True
    Exit Function
    
errores:
    p_Error = "ACRepository.Insert: " & Err.Description
    Insert = False
End Function

Public Function Update(ByRef p_AC As ACProyecto, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim rs As DAO.Recordset
    Dim SQL As String
    
    On Error GoTo errores
    p_Error = ""
    Update = False
    
    If p_AC Is Nothing Then
        p_Error = "AC no puede ser Nothing"
        Exit Function
    End If
    
    If p_AC.IdAccionCorrectiva = "" Then
        p_Error = "IdAccionCorrectiva no puede estar vacío"
        Exit Function
    End If
    
    SQL = "SELECT * FROM TbNCAccionCorrectivas WHERE IDAccionCorrectiva = " & p_AC.IdAccionCorrectiva & ";"
    Set rs = p_Db.OpenRecordset(SQL)
    
    If rs.EOF Then
        rs.Close
        p_Error = "No se encontró la AC"
        Exit Function
    End If
    
    rs.Edit
        rs!IDNoConformidad = p_AC.IDNoConformidad
        
        If p_AC.NAccion <> "" Then
            rs!NAccion = p_AC.NAccion
        Else
            rs!NAccion = Null
        End If
        
        rs!AccionCorrectiva = p_AC.AccionCorrectiva
        
        If p_AC.FechaAccionCorrectiva <> "" Then
            rs!FechaAccionCorrectiva = p_AC.FechaAccionCorrectiva
        Else
            rs!FechaAccionCorrectiva = Null
        End If
        
        If p_AC.Estado <> "" Then
            rs!Estado = p_AC.Estado
        Else
            rs!Estado = Null
        End If
        
        If p_AC.Notas <> "" Then
            rs!Notas = p_AC.Notas
        Else
            rs!Notas = Null
        End If
        
        If p_AC.Responsable <> "" Then
            rs!Responsable = p_AC.Responsable
        Else
            rs!Responsable = Null
        End If
        
        If p_AC.FechaInicialMinima <> "" Then
            rs!FechaInicialMinima = p_AC.FechaInicialMinima
        Else
            rs!FechaInicialMinima = Null
        End If
        
        If p_AC.FechaFinalUltima <> "" Then
            rs!FechaFinalUltima = p_AC.FechaFinalUltima
        Else
            rs!FechaFinalUltima = Null
        End If
        
        If p_AC.FechaFinPrevistaUltima <> "" Then
            rs!FechaFinPrevistaUltima = p_AC.FechaFinPrevistaUltima
        Else
            rs!FechaFinPrevistaUltima = Null
        End If
    rs.Update
    rs.Close
    
    Update = True
    Exit Function
    
errores:
    p_Error = "ACRepository.Update: " & Err.Description
    Update = False
End Function

Public Function Delete(ByVal p_IDAC As String, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim SQL As String
    
    On Error GoTo errores
    p_Error = ""
    Delete = False
    
    If p_IDAC = "" Then
        p_Error = "IdAccionCorrectiva no puede estar vacío"
        Exit Function
    End If
    
    SQL = "DELETE FROM TbNCAccionCorrectivas WHERE IDAccionCorrectiva = " & p_IDAC & ";"
    p_Db.Execute SQL
    
    Delete = True
    Exit Function
    
errores:
    p_Error = "ACRepository.Delete: " & Err.Description
    Delete = False
End Function
