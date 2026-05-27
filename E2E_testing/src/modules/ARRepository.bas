Attribute VB_Name = "ARRepository"
Option Compare Database
Option Explicit

Public Function GetById(ByVal p_IDAR As String, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As ARProyecto
    Dim rs As DAO.Recordset
    Dim sql As String
    Dim m_AR As ARProyecto
    
    On Error GoTo errores
    p_Error = ""
    
    If p_IDAR = "" Then
        Set GetById = Nothing
        Exit Function
    End If
    
    sql = "SELECT * FROM TbNCAccionesRealizadas WHERE IDAccionRealizada = " & p_IDAR & ";"
    Set rs = p_Db.OpenRecordset(sql)
    
    If rs.EOF Then
        rs.Close
        Set GetById = Nothing
        Exit Function
    End If
    
    Set m_AR = New ARProyecto
    
    With m_AR
        .IDAccionRealizada = Nz(rs!IDAccionRealizada, "")
        .IdAccionCorrectiva = Nz(rs!IdAccionCorrectiva, "")
        .NAccion = Nz(rs!NAccion, "")
        .AccionRealizada = Nz(rs!AccionRealizada, "")
        .FechaAccionRealizada = Nz(rs!FechaAccionRealizada, "")
        .FechaInicio = Nz(rs!FechaInicio, "")
        .FechaFinPrevista = Nz(rs!FechaFinPrevista, "")
        .FechaFinReal = Nz(rs!FechaFinReal, "")
        .Estado = Nz(rs!Estado, "")
        .Notas = Nz(rs!Notas, "")
        .Responsable = Nz(rs!Responsable, "")
    End With
    
    rs.Close
    Set GetById = m_AR
    Exit Function
    
errores:
    p_Error = "ARRepository.GetById: " & Err.Description
    Set GetById = Nothing
End Function

Public Function GetByIdAC(ByVal p_IDAC As String, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Collection
    Dim rs As DAO.Recordset
    Dim sql As String
    Dim col As Collection
    Dim m_AR As ARProyecto
    
    On Error GoTo errores
    p_Error = ""
    
    If p_IDAC = "" Then
        Set GetByIdAC = New Collection
        Exit Function
    End If
    
    sql = "SELECT * FROM TbNCAccionesRealizadas WHERE IDAccionCorrectiva = " & p_IDAC & ";"
    Set rs = p_Db.OpenRecordset(sql)
    Set col = New Collection
    
    Do While Not rs.EOF
        Set m_AR = New ARProyecto
        
        With m_AR
            .IDAccionRealizada = Nz(rs!IDAccionRealizada, "")
            .IdAccionCorrectiva = Nz(rs!IdAccionCorrectiva, "")
            .NAccion = Nz(rs!NAccion, "")
            .AccionRealizada = Nz(rs!AccionRealizada, "")
            .FechaAccionRealizada = Nz(rs!FechaAccionRealizada, "")
            .FechaInicio = Nz(rs!FechaInicio, "")
            .FechaFinPrevista = Nz(rs!FechaFinPrevista, "")
            .FechaFinReal = Nz(rs!FechaFinReal, "")
            .Estado = Nz(rs!Estado, "")
            .Notas = Nz(rs!Notas, "")
            .Responsable = Nz(rs!Responsable, "")
        End With
        
        col.Add m_AR
        rs.MoveNext
    Loop
    
    rs.Close
    Set GetByIdAC = col
    Exit Function
    
errores:
    p_Error = "ARRepository.GetByIdAC: " & Err.Description
    Set GetByIdAC = New Collection
End Function

Public Function Insert(ByRef p_AR As ARProyecto, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim rs As DAO.Recordset
    Dim sql As String
    
    On Error GoTo errores
    p_Error = ""
    Insert = False
    
    If p_AR Is Nothing Then
        p_Error = "AR no puede ser Nothing"
        Exit Function
    End If
    
    sql = "TbNCAccionesRealizadas"
    Set rs = p_Db.OpenRecordset(sql)
    
    rs.AddNew
        rs!IDAccionRealizada = p_AR.IDAccionRealizada
        rs!IdAccionCorrectiva = p_AR.IdAccionCorrectiva
        
        If p_AR.NAccion <> "" Then
            rs!NAccion = p_AR.NAccion
        End If
        
        rs!AccionRealizada = p_AR.AccionRealizada
        
        If p_AR.FechaAccionRealizada <> "" Then
            rs!FechaAccionRealizada = p_AR.FechaAccionRealizada
        End If
        
        If IsDate(p_AR.FechaInicio) Then
            rs!FechaInicio = p_AR.FechaInicio
        Else
            rs!FechaInicio = Null
        End If
        
        If IsDate(p_AR.FechaFinPrevista) Then
            rs!FechaFinPrevista = p_AR.FechaFinPrevista
        Else
            rs!FechaFinPrevista = Null
        End If
        
        If IsDate(p_AR.FechaFinReal) Then
            rs!FechaFinReal = p_AR.FechaFinReal
        Else
            rs!FechaFinReal = Null
        End If
        
        If p_AR.Notas <> "" Then
            rs!Notas = p_AR.Notas
        End If
        
        If p_AR.Responsable <> "" Then
            rs!Responsable = p_AR.Responsable
        End If
        
        If p_AR.Estado <> "" Then
            rs!Estado = p_AR.Estado
        End If
    rs.Update
    rs.Close
    
    Insert = True
    Exit Function
    
errores:
    p_Error = "ARRepository.Insert: " & Err.Description
    Insert = False
End Function

Public Function Update(ByRef p_AR As ARProyecto, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim rs As DAO.Recordset
    Dim sql As String
    
    On Error GoTo errores
    p_Error = ""
    Update = False
    
    If p_AR Is Nothing Then
        p_Error = "AR no puede ser Nothing"
        Exit Function
    End If
    
    If p_AR.IDAccionRealizada = "" Then
        p_Error = "IDAccionRealizada no puede estar vacío"
        Exit Function
    End If
    
    sql = "SELECT * FROM TbNCAccionesRealizadas WHERE IDAccionRealizada = " & p_AR.IDAccionRealizada & ";"
    Set rs = p_Db.OpenRecordset(sql)
    
    If rs.EOF Then
        rs.Close
        p_Error = "No se encontró la AR"
        Exit Function
    End If
    
    rs.Edit
        If p_AR.NAccion <> "" Then
            rs!NAccion = p_AR.NAccion
        Else
            rs!NAccion = Null
        End If
        
        rs!AccionRealizada = p_AR.AccionRealizada
        
        If IsDate(p_AR.FechaInicio) Then
            rs!FechaInicio = p_AR.FechaInicio
        Else
            rs!FechaInicio = Null
        End If
        
        If IsDate(p_AR.FechaFinPrevista) Then
            rs!FechaFinPrevista = p_AR.FechaFinPrevista
        Else
            rs!FechaFinPrevista = Null
        End If
        
        If IsDate(p_AR.FechaFinReal) Then
            rs!FechaFinReal = p_AR.FechaFinReal
        Else
            rs!FechaFinReal = Null
        End If
        
        If p_AR.Notas <> "" Then
            rs!Notas = p_AR.Notas
        Else
            rs!Notas = Null
        End If
        
        If p_AR.Responsable <> "" Then
            rs!Responsable = p_AR.Responsable
        Else
            rs!Responsable = Null
        End If
        
        If p_AR.Estado <> "" Then
            rs!Estado = p_AR.Estado
        Else
            rs!Estado = Null
        End If
    rs.Update
    rs.Close
    
    Update = True
    Exit Function
    
errores:
    p_Error = "ARRepository.Update: " & Err.Description
    Update = False
End Function

Public Function Delete(ByVal p_IDAR As String, ByRef p_Db As DAO.Database, Optional ByRef p_Error As String) As Boolean
    Dim sql As String
    
    On Error GoTo errores
    p_Error = ""
    Delete = False
    
    If p_IDAR = "" Then
        p_Error = "IDAccionRealizada no puede estar vacío"
        Exit Function
    End If
    
    sql = "DELETE FROM TbNCAccionesRealizadas WHERE IDAccionRealizada = " & p_IDAR & ";"
    p_Db.Execute sql
    
    Delete = True
    Exit Function
    
errores:
    p_Error = "ARRepository.Delete: " & Err.Description
    Delete = False
End Function
