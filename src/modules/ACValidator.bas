Option Compare Database
Option Explicit

Public Function ValidarAlta(ByRef p_AC As ACProyecto, Optional ByRef p_Error As String) As Boolean
    Dim m_AccionRepetida As EnumSino
    Dim blnComprobar As Boolean
    On Error GoTo errores
    p_Error = ""
    
    If p_AC Is Nothing Then
        p_Error = "AC no puede ser Nothing"
        Exit Function
    End If
    
    With p_AC
        If .IDNoConformidad = "" Then
            p_Error = "No se conoce la NC/Obs"
            Exit Function
        End If
        
        If .AccionCorrectiva = "" Then
            p_Error = "No se conoce la Acción Correctiva"
            Exit Function
        End If
        
        If .Responsable <> "" Then
            If .ResponsableObj Is Nothing Then
                p_Error = "Se ha introducido un responsable que no aparece en la lista de usuarios"
                Exit Function
            End If
        End If
        
        blnComprobar = True
        If blnComprobar Then
            m_AccionRepetida = AccionRepetida(p_AC, p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If m_AccionRepetida = EnumSino.Sí Then
                p_Error = "Existe otra acción correctiva con el mismo nombre para la misma NC/Obs"
                Exit Function
            End If
        End If
    End With
    
    ValidarAlta = True
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "ACValidator.ValidarAlta: " & Err.Description
    End If
End Function

Public Function ValidarEdicion(ByRef p_AC As ACProyecto, Optional ByRef p_Error As String) As Boolean
    On Error GoTo errores
    p_Error = ""
    
    If p_AC Is Nothing Then
        p_Error = "AC no puede ser Nothing"
        Exit Function
    End If
    
    With p_AC
        If .IDNoConformidad = "" Then
            p_Error = "No se conoce la NC/Obs"
            Exit Function
        End If
        
        If .AccionCorrectiva = "" Then
            p_Error = "No se conoce la Acción Correctiva"
            Exit Function
        End If
        
        If .Responsable <> "" Then
            If .ResponsableObj Is Nothing Then
                p_Error = "Se ha introducido un responsable que no aparece en la lista de usuarios"
                Exit Function
            End If
        End If
    End With
    
    ValidarEdicion = True
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "ACValidator.ValidarEdicion: " & Err.Description
    End If
End Function

Public Function Validar(ByRef p_AC As ACProyecto, Optional ByRef p_Error As String) As Boolean
    On Error GoTo errores
    p_Error = ""
    
    If p_AC Is Nothing Then
        p_Error = "AC no puede ser Nothing"
        Exit Function
    End If
    
    With p_AC
        If .IDNoConformidad = "" Then
            p_Error = "No se conoce la NC/Obs"
            Exit Function
        End If
        
        If .AccionCorrectiva = "" Then
            p_Error = "No se conoce la Acción Correctiva"
            Exit Function
        End If
        
        If .Responsable <> "" Then
            If .ResponsableObj Is Nothing Then
                p_Error = "Se ha introducido un responsable que no aparece en la lista de usuarios"
                Exit Function
            End If
        End If
    End With
    
    Validar = True
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "ACValidator.Validar: " & Err.Description
    End If
End Function

Private Function AccionRepetida( _
                            ByRef p_AC As ACProyecto, _
                            Optional ByRef p_Error As String _
                            ) As EnumSino
    Dim rs As DAO.Recordset
    Dim SQL As String
    Dim m_Count As Long
    
    On Error GoTo errores
    AccionRepetida = EnumSino.No
    
    If p_AC.AccionCorrectiva = "" Then
        p_Error = "No se ha introducido una Acción"
        Err.Raise 1000
    End If
    
    If p_AC.IDNoConformidad = "" Then
        AccionRepetida = EnumSino.No
        Exit Function
    End If
    
    SQL = "SELECT COUNT(*) AS Cuantos FROM TbNCAccionCorrectivas " & _
          "WHERE IDNoConformidad = " & p_AC.IDNoConformidad & " " & _
          "AND AccionCorrectiva = '" & Replace(p_AC.AccionCorrectiva, "'", "''") & "' "
    
    If p_AC.IdAccionCorrectiva <> "" Then
        SQL = SQL & "AND IDAccionCorrectiva <> " & p_AC.IdAccionCorrectiva & " "
    End If
    
    SQL = SQL & ";"
    
    Set rs = getdb().OpenRecordset(SQL)
    
    If Not rs.EOF Then
        m_Count = Nz(rs!Cuantos, 0)
        If m_Count > 0 Then
            AccionRepetida = EnumSino.Sí
        End If
    End If
    
    rs.Close
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "ACValidator.AccionRepetida ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function
