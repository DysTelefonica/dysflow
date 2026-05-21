VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "SuministradorOperaciones"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = False
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Public Suministrador As Suministrador
Public Function Registrar( _
                            Optional p_SuministradorAlInicio As Suministrador, _
                            Optional ByRef p_Error As String _
                            ) As String

    Dim m_SQL As String
    Dim rcdDatos As DAO.Recordset
    Dim m_Suministrador As Suministrador
    Dim m_Comprobar As Boolean
    
    On Error GoTo errores
    With Me.Suministrador
        If .Nombre = "" Then
            p_Error = "Falta el campo Nombre"
            Err.Raise 1000
        End If
        If .CIF = "" Then
            p_Error = "Falta el campo CIF"
            Err.Raise 1000
        End If
        If .TramitadoraHPS <> "Sí" And .TramitadoraHPS <> "No" Then
            .TramitadoraHPS = "No"
        End If
        If Not p_SuministradorAlInicio Is Nothing Then
            If .CIF <> p_SuministradorAlInicio.CIF Then
                m_Comprobar = True
            End If
        Else
            m_Comprobar = True
        End If
        If m_Comprobar = True Then
            Set m_Suministrador = constructor.getSuministrador(p_CIF:=.CIF, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If Not m_Suministrador Is Nothing Then
                p_Error = "Ese CIF de Suministrador ya está registrado"
                Err.Raise 1000
            End If
        End If
        m_Comprobar = False
        If p_SuministradorAlInicio Is Nothing Then
            If .Nemotecnico <> "" Then
                m_Comprobar = True
            End If
        Else
            If p_SuministradorAlInicio.Nemotecnico <> .Nemotecnico Then
                m_Comprobar = True
            End If
        End If
        If m_Comprobar = True Then
            Set m_Suministrador = constructor.getSuministrador(p_Nemotecnico:=.Nemotecnico, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If Not m_Suministrador Is Nothing Then
                p_Error = "Ese Nemotécnico de Suministrador ya está registrado"
                Err.Raise 1000
            End If
        End If
        If p_SuministradorAlInicio Is Nothing Then
            .IDSuministrador = .IDSuministradorCalculado
            m_SQL = "TbSuministradores"
        Else
            m_SQL = "SELECT * " & _
                "FROM TbSuministradores " & _
                "WHERE IDSuministrador=" & .IDSuministrador & ";"
        End If
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If p_SuministradorAlInicio Is Nothing Then
            rcdDatos.AddNew
                rcdDatos.Fields("IDSuministrador") = .IDSuministrador
                rcdDatos.Fields("Nombre") = .Nombre
                rcdDatos.Fields("CIF") = .CIF
                If .DESCRIPCION <> "" Then
                    rcdDatos.Fields("Descripcion") = .DESCRIPCION
                End If
                If .TramitadoraHPS <> "" Then
                    rcdDatos.Fields("TramitadoraHPS") = .TramitadoraHPS
                End If
                If .Nemotecnico <> "" Then
                    rcdDatos.Fields("Nemotecnico") = .Nemotecnico
                End If
                If .Direccion <> "" Then
                    rcdDatos.Fields("Direccion") = .Direccion
                End If
                If .CP <> "" Then
                    rcdDatos.Fields("CP") = .CP
                End If
                If .Ciudad <> "" Then
                    rcdDatos.Fields("Ciudad") = .Ciudad
                End If
            rcdDatos.Update
        Else
            rcdDatos.Edit
                rcdDatos.Fields("Nombre") = .Nombre
                rcdDatos.Fields("CIF") = .CIF
                If .DESCRIPCION <> "" Then
                    rcdDatos.Fields("Descripcion") = .DESCRIPCION
                Else
                    rcdDatos.Fields("Descripcion") = Null
                End If
                If .TramitadoraHPS <> "" Then
                    rcdDatos.Fields("TramitadoraHPS") = .TramitadoraHPS
                Else
                    rcdDatos.Fields("TramitadoraHPS") = Null
                End If
                If .Nemotecnico <> "" Then
                    rcdDatos.Fields("Nemotecnico") = .Nemotecnico
                Else
                    rcdDatos.Fields("Nemotecnico") = Null
                End If
                If .Direccion <> "" Then
                    rcdDatos.Fields("Direccion") = .Direccion
                Else
                    rcdDatos.Fields("Direccion") = Null
                End If
                If .CP <> "" Then
                    rcdDatos.Fields("CP") = .CP
                Else
                    rcdDatos.Fields("CP") = Null
                End If
                If .Ciudad <> "" Then
                    rcdDatos.Fields("Ciudad") = .Ciudad
                Else
                    rcdDatos.Fields("Ciudad") = Null
                End If
            rcdDatos.Update
        End If
        rcdDatos.Close
        Set rcdDatos = Nothing
    End With
    Set m_ObjEntorno.Suministradores = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SuministradorOperaciones.Registrar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If
    
End Function

Public Function MotivoEliminarNoOK( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
   
    Dim m_Suministrador As Suministrador
    On Error GoTo errores
    
    If Me.Suministrador Is Nothing Then
        p_Error = "Suministrador no registrado"
        Err.Raise 1000
    End If
    If Me.Suministrador.IDSuministrador = "" Then
        p_Error = "Suministrador no registrado"
        Err.Raise 1000
    End If
    
    
    With Me.Suministrador
        
        Set m_Suministrador = constructor.getSuministradoresEnExpedientes(p_ID:=.IDSuministrador, p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If Not m_Suministrador Is Nothing Then
            MotivoEliminarNoOK = "Este Suministrador ha sido usado en algún Expediente"
            Exit Function
        End If
        
    End With
    
    Exit Function
     
errores:
     If Err.Number <> 1000 Then
         p_Error = "El método ExpedienteOperaciones.MotivoEliminarNoOK ha devuelto el error: " & Err.Description
     End If
                                
End Function

Public Function Eliminar(Optional ByRef p_Error As String) As String
    
    Dim m_MotivoNoOK As String
    Dim m_SQL As String
    
    
    
    On Error GoTo errores
    
    m_MotivoNoOK = MotivoEliminarNoOK(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    p_Error = m_MotivoNoOK
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    m_SQL = "DELETE * " & _
            "FROM TbSuministradores " & _
            "WHERE IDSuministrador=" & Me.Suministrador.IDSuministrador & ";"
    getdb().Execute m_SQL
    Set m_ObjEntorno.Suministradores = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SuministradorOperaciones.Eliminar ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function



Private Function CadenaHPSUsuariosParaSuministrador(p_IDSuministrador As String, Optional ByRef p_Error As String) As String
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Cadena As String
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    
    On Error GoTo errores
    If m_EnOficina <> EnumSiNo.Sí Then
        p_Error = "Para poder eliminar un sumininstrador se ha de comprobar que no lo esté usando HPS y no estamos en la oficina"
        Err.Raise 1000
    End If
    m_SQL = "SELECT TbUsuarios.ID " & _
                "FROM TbUsuarios " & _
                "WHERE (((TbUsuarios.IDEmpresaUsuario) =" & p_IDSuministrador & ")) " & _
                    "Or (((TbUsuarios.IDEmpresaHPS) =" & p_IDSuministrador & "));"
               
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            m_ID = .Fields("ID")
            If IsNumeric(m_ID) Then
                If m_Col Is Nothing Then
                   Set m_Col = New Scripting.Dictionary
                   m_Col.CompareMode = TextCompare
                End If
                If Not m_Col.exists(CStr(m_ID)) Then
                   m_Col.Add CStr(m_ID), m_ID
                End If
                
            End If
            
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
     
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        If m_Cadena = "" Then
            m_Cadena = CStr(m_ID)
        Else
            m_Cadena = m_Cadena & vbNewLine & CStr(m_ID)
        End If
    Next
    CadenaHPSUsuariosParaSuministrador = m_Cadena
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SuministradorOperaciones.CadenaHPSUsuariosParaSuministrador ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function
Private Function CadenaHPSUsuariosHistoricosParaSuministrador(p_IDSuministrador As String, Optional ByRef p_Error As String) As String
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Cadena As String
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    
    On Error GoTo errores
    If m_EnOficina <> EnumSiNo.Sí Then
        p_Error = "Para poder eliminar un sumininstrador se ha de comprobar que no lo esté usando HPS y no estamos en la oficina"
        Err.Raise 1000
    End If
    
     m_SQL = "SELECT TbUsuariosHistoricos.ID " & _
                "FROM TbUsuariosHistoricos " & _
                "WHERE (((TbUsuariosHistoricos.IDEmpresaUsuario)= " & p_IDSuministrador & ")) " & _
                    "OR (((TbUsuariosHistoricos.IDEmpresaHPS)=" & p_IDSuministrador & "));"
               
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            m_ID = .Fields("ID")
            If IsNumeric(m_ID) Then
                If m_Col Is Nothing Then
                   Set m_Col = New Scripting.Dictionary
                   m_Col.CompareMode = TextCompare
                End If
                If Not m_Col.exists(CStr(m_ID)) Then
                   m_Col.Add CStr(m_ID), m_ID
                End If
                
            End If
            
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        If m_Cadena = "" Then
            m_Cadena = CStr(m_ID)
        Else
            m_Cadena = m_Cadena & vbNewLine & CStr(m_ID)
        End If
    Next
    CadenaHPSUsuariosHistoricosParaSuministrador = m_Cadena
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método SuministradorOperaciones.CadenaHPSUsuariosHistoricosParaSuministrador ha producido el error nº: " & Err.Number & _
        vbCrLf & "Detalle: " & Err.Description
    End If

End Function


