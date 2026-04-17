VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "ARValidator"
Option Compare Database
Option Explicit

Public Function ValidarAlta(ByRef p_AR As ARProyecto, Optional ByRef p_Error As String) As Boolean
    Dim m_AccionRepetida As EnumSino
    Dim blnComprobar As Boolean
    On Error GoTo errores
    p_Error = ""
    
    If p_AR Is Nothing Then
        p_Error = "AR no puede ser Nothing"
        Exit Function
    End If
    
    With p_AR
        If .IdAccionCorrectiva = "" Then
            p_Error = "No se conoce la Acción Correctiva"
            Exit Function
        End If
        
        If .AccionRealizada = "" Then
            p_Error = "No se conoce la Acción Realizada"
            Exit Function
        End If
        
        If IsDate(.FechaFinReal) Then
            If Not IsDate(.FechaFinPrevista) Then
                p_Error = "Tiene fecha de fin real y no fecha fin prevista"
                Exit Function
            End If
        End If
        
        If IsDate(.FechaFinPrevista) Then
            If Not IsDate(.FechaInicio) Then
                p_Error = "Tiene fecha de fin prevista y no fecha de inicio"
                Exit Function
            End If
        End If
        
        If IsDate(.FechaInicio) Then
            If Not IsDate(.FechaFinPrevista) Then
                p_Error = "Tiene fecha de fin de inicio y no fecha de fin prevista"
                Exit Function
            End If
        End If
        
        If Not BuenaFecha(p_AR, p_Error) Then
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            p_Error = "Fecha inconsistency"
            Exit Function
        End If
        
        If IsDate(.FechaFinReal) Then
            If .Documentos Is Nothing Then
                p_Error = "Para cerrar una acción hay que adjuntar una evidencia"
                Exit Function
            End If
        End If
        
        blnComprobar = True
        If blnComprobar Then
            m_AccionRepetida = AccionRepetida(p_AR, p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If m_AccionRepetida = EnumSino.Sí Then
                p_Error = "Existe otra acción realizada con el mismo nombre para la misma Acción Correctiva"
                Exit Function
            End If
        End If
    End With
    
    ValidarAlta = True
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "ARValidator.ValidarAlta: " & Err.Description
    End If
End Function

Public Function ValidarEdicion(ByRef p_AR As ARProyecto, Optional ByRef p_Error As String) As Boolean
    Dim m_AccionRepetida As EnumSino
    Dim blnComprobar As Boolean
    On Error GoTo errores
    p_Error = ""
    
    If p_AR Is Nothing Then
        p_Error = "AR no puede ser Nothing"
        Exit Function
    End If
    
    With p_AR
        If .IdAccionCorrectiva = "" Then
            p_Error = "No se conoce la Acción Correctiva"
            Exit Function
        End If
        
        If .AccionRealizada = "" Then
            p_Error = "No se conoce la Acción Realizada"
            Exit Function
        End If
        
        If IsDate(.FechaFinReal) Then
            If Not IsDate(.FechaFinPrevista) Then
                p_Error = "Tiene fecha de fin real y no fecha fin prevista"
                Exit Function
            End If
        End If
        
        If IsDate(.FechaFinPrevista) Then
            If Not IsDate(.FechaInicio) Then
                p_Error = "Tiene fecha de fin prevista y no fecha de inicio"
                Exit Function
            End If
        End If
        
        If IsDate(.FechaInicio) Then
            If Not IsDate(.FechaFinPrevista) Then
                p_Error = "Tiene fecha de fin de inicio y no fecha de fin prevista"
                Exit Function
            End If
        End If
        
        If Not BuenaFecha(p_AR, p_Error) Then
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            p_Error = "Fecha inconsistency"
            Exit Function
        End If
        
        If IsDate(.FechaFinReal) Then
            If .Documentos Is Nothing Then
                p_Error = "Para cerrar una acción hay que adjuntar una evidencia"
                Exit Function
            End If
        End If
    End With
    
    ValidarEdicion = True
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "ARValidator.ValidarEdicion: " & Err.Description
    End If
End Function

Public Function Validar(ByRef p_AR As ARProyecto, Optional ByRef p_Error As String) As Boolean
    On Error GoTo errores
    p_Error = ""
    
    If p_AR Is Nothing Then
        p_Error = "AR no puede ser Nothing"
        Exit Function
    End If
    
    With p_AR
        If .IdAccionCorrectiva = "" Then
            p_Error = "No se conoce la Acción Correctiva"
            Exit Function
        End If
        
        If .AccionRealizada = "" Then
            p_Error = "No se conoce la Acción Realizada"
            Exit Function
        End If
        
        If IsDate(.FechaFinReal) Then
            If Not IsDate(.FechaFinPrevista) Then
                p_Error = "Tiene fecha de fin real y no fecha fin prevista"
                Exit Function
            End If
        End If
        
        If IsDate(.FechaFinPrevista) Then
            If Not IsDate(.FechaInicio) Then
                p_Error = "Tiene fecha de fin prevista y no fecha de inicio"
                Exit Function
            End If
        End If
        
        If IsDate(.FechaInicio) Then
            If Not IsDate(.FechaFinPrevista) Then
                p_Error = "Tiene fecha de fin de inicio y no fecha de fin prevista"
                Exit Function
            End If
        End If
        
        If Not BuenaFecha(p_AR, p_Error) Then
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            p_Error = "Fecha inconsistency"
            Exit Function
        End If
    End With
    
    Validar = True
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "ARValidator.Validar: " & Err.Description
    End If
End Function

Private Function BuenaFecha( _
                            ByRef p_AR As ARProyecto, _
                            Optional ByRef p_Error As String _
                            ) As Boolean
    BuenaFecha = False
    On Error GoTo errores
    
    With p_AR
        If IsDate(.FechaInicio) Then
            If IsDate(.FechaFinReal) Then
                If CDate(.FechaFinReal) < CDate(.FechaInicio) Then
                    p_Error = "La fecha Final real es anterior a la inicial"
                    Err.Raise 1000
                End If
            End If
        Else
            If IsDate(.FechaFinReal) Then
                p_Error = "No se puede rellenar la fecha final sin haber indicado la fecha inicial"
                Err.Raise 1000
            End If
        End If
    End With
    
    BuenaFecha = True
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "ARValidator.BuenaFecha ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Private Function AccionRepetida( _
                                ByRef p_AR As ARProyecto, _
                                Optional ByRef p_Error As String _
                                ) As EnumSino
    Dim rs As DAO.Recordset
    Dim SQL As String
    Dim m_Count As Long
    
    On Error GoTo errores
    AccionRepetida = EnumSino.No
    
    If p_AR.AccionRealizada = "" Then
        p_Error = "No se ha introducido una Acción"
        Err.Raise 1000
    End If
    
    If p_AR.IdAccionCorrectiva = "" Then
        AccionRepetida = EnumSino.No
        Exit Function
    End If
    
    SQL = "SELECT COUNT(*) AS Cuantos FROM TbNCAccionesRealizadas " & _
          "WHERE IDAccionCorrectiva = " & p_AR.IdAccionCorrectiva & " " & _
          "AND AccionRealizada = '" & Replace(p_AR.AccionRealizada, "'", "''") & "' "
    
    If p_AR.IDAccionRealizada <> "" Then
        SQL = SQL & "AND IDAccionRealizada <> " & p_AR.IDAccionRealizada & " "
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
        p_Error = "ARValidator.AccionRepetida ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function