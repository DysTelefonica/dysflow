Attribute VB_Name = "constructor"
Option Compare Database
Option Explicit

Public Function getUsuarioConectadoPorMaquina( _
                                                Optional ByRef p_Error As String _
                                                ) As USUARIO
    Dim objNetwork As Object
    On Error GoTo errores
    Set objNetwork = CreateObject("Wscript.Network")
    Set getUsuarioConectadoPorMaquina = constructor.getUsuario(, objNetwork.UserName, , , p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set objNetwork = Nothing
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getUsuarioConectadoPorMaquina ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function getUsuario( _
                            Optional p_ID As String, _
                            Optional p_UsuarioRed As String, _
                            Optional p_Nombre As String, _
                            Optional p_Correo As String, _
                            Optional ByRef p_Error As String _
                            ) As USUARIO

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NombreCampoID As String
    Dim m_EsNumeroID As Boolean
    Dim m_Where As String
    Dim m_ValorID As String
    Dim m_SQLInicial As String
    
    On Error GoTo errores
    If p_ID = "" And p_UsuarioRed = "" And p_Nombre = "" And p_Correo = "" Then
        Exit Function
    End If
    
    m_SQLInicial = "SELECT TbUsuariosAplicaciones.* " & _
                    "FROM TbUsuariosAplicaciones "
    
    If p_ID <> "" Then
        m_NombreCampoID = "ID"
        m_ValorID = p_ID
        m_EsNumeroID = True
    ElseIf p_UsuarioRed <> "" Then
        m_NombreCampoID = "UsuarioRed"
        m_ValorID = p_UsuarioRed
        m_EsNumeroID = False
    ElseIf p_Nombre <> "" Then
        m_NombreCampoID = "Nombre"
        m_ValorID = p_Nombre
        m_EsNumeroID = False
    ElseIf p_Correo <> "" Then
        m_NombreCampoID = "CorreoUsuario"
        m_ValorID = p_Correo
        m_EsNumeroID = False
    End If
    
    If m_EsNumeroID Then
        m_Where = m_NombreCampoID & "=" & m_ValorID & ";"
    Else
        m_Where = m_NombreCampoID & "='" & m_ValorID & "';"
    End If
    m_SQL = m_SQLInicial & "WHERE " & m_Where
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getUsuario = New USUARIO
        For Each m_Campo In getUsuario.ColCampos
            getUsuario.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                Err.Raise 1000
            End If
        Next
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getUsuario ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getAplicacionesPermisos( _
                                            p_CorreoUsuario As String, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ObjUsuarioAplicacionPermisos As UsuarioAplicacionPermisos
            
    On Error GoTo errores
    If p_CorreoUsuario = "" Then
        Exit Function
    End If
    m_SQL = "SELECT TbUsuariosAplicacionesPermisos.* " & _
            "FROM TbUsuariosAplicacionesPermisos " & _
            "WHERE CorreoUsuario='" & p_CorreoUsuario & "';"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ObjUsuarioAplicacionPermisos = New UsuarioAplicacionPermisos
            For Each m_Campo In m_ObjUsuarioAplicacionPermisos.ColCampos
                m_ObjUsuarioAplicacionPermisos.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            
            If getAplicacionesPermisos Is Nothing Then
                Set getAplicacionesPermisos = New Scripting.Dictionary
                getAplicacionesPermisos.CompareMode = TextCompare
            End If
            If Not getAplicacionesPermisos.exists(CStr(m_ObjUsuarioAplicacionPermisos.IDAplicacion)) Then
                getAplicacionesPermisos.Add m_ObjUsuarioAplicacionPermisos.IDAplicacion, m_ObjUsuarioAplicacionPermisos
            End If
            Set m_ObjUsuarioAplicacionPermisos = Nothing
            .MoveNext
        Loop
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getAplicacionesPermisos ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getUsuariosAdministradores( _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Usuario As USUARIO
    
    
    On Error GoTo errores
    
    
    
    m_SQL = "SELECT * " & _
            "FROM TbUsuariosAplicaciones " & _
            "WHERE EsAdministrador='Sí' AND FechaBaja Is Null;"

    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            .MoveFirst
            Do While Not .EOF
                Set m_Usuario = New USUARIO
                For Each m_Campo In m_Usuario.ColCampos
                    m_Usuario.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                     If p_Error <> "" Then
                         Err.Raise 1000
                     End If
                 Next
                 If getUsuariosAdministradores Is Nothing Then
                    Set getUsuariosAdministradores = New Scripting.Dictionary
                    getUsuariosAdministradores.CompareMode = TextCompare
                 End If
                 If Not getUsuariosAdministradores.exists(m_Usuario.ID) Then
                    getUsuariosAdministradores.Add m_Usuario.ID, m_Usuario
                 End If
                 
                 Set m_Usuario = Nothing
                .MoveNext
            Loop
        End If
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    m_SQL = "SELECT TbUsuariosAplicaciones.* " & _
            "FROM TbUsuariosAplicacionesPermisos INNER JOIN TbUsuariosAplicaciones " & _
            "ON TbUsuariosAplicacionesPermisos.CorreoUsuario = TbUsuariosAplicaciones.CorreoUsuario " & _
            "WHERE (((TbUsuariosAplicacionesPermisos.EsUsuarioAdministrador)='Sí') " & _
            "AND ((TbUsuariosAplicaciones.FechaBaja) Is Null) " & _
            "AND ((TbUsuariosAplicacionesPermisos.IDAplicacion)=" & IDAplicacion & "));"

    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            .MoveFirst
            Do While Not .EOF
                Set m_Usuario = New USUARIO
                For Each m_Campo In m_Usuario.ColCampos
                    m_Usuario.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                     If p_Error <> "" Then
                         Err.Raise 1000
                     End If
                 Next
                 If getUsuariosAdministradores Is Nothing Then
                    Set getUsuariosAdministradores = New Scripting.Dictionary
                    getUsuariosAdministradores.CompareMode = TextCompare
                 End If
                 If Not getUsuariosAdministradores.exists(m_Usuario.ID) Then
                    getUsuariosAdministradores.Add m_Usuario.ID, m_Usuario
                 End If
                 
                 Set m_Usuario = Nothing
                .MoveNext
            Loop
        End If
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getUsuariosAdministradores ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getUsuariosCalidad( _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    
    Dim m_Usuario As USUARIO
    Dim m_ColUsuariosRed As New Collection
    Dim m_ID As Variant
    
    On Error GoTo errores
    With m_ColUsuariosRed
        .Add "amrc"
        .Add "sgm"
        .Add "ncg"
        .Add "bng"
        .Add "mma"
    End With
    For Each m_ID In m_ColUsuariosRed
        Set m_Usuario = constructor.getUsuario(p_UsuarioRed:=CStr(m_ID), p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If Not m_Usuario Is Nothing Then
            If getUsuariosCalidad Is Nothing Then
               Set getUsuariosCalidad = New Scripting.Dictionary
               getUsuariosCalidad.CompareMode = TextCompare
            End If
            If Not getUsuariosCalidad.exists(m_Usuario.ID) Then
               getUsuariosCalidad.Add m_Usuario.ID, m_Usuario
            End If
        End If
        
        Set m_Usuario = Nothing
    Next
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getUsuariosCalidad ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getUsuariosTecnicos( _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Usuario As USUARIO
    
    
    On Error GoTo errores
    
    m_SQL = "SELECT * " & _
            "FROM TbUsuariosAplicaciones " & _
            "WHERE FechaBaja Is Null ORDER BY Nombre;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            .MoveFirst
            Do While Not .EOF
                Set m_Usuario = New USUARIO
                For Each m_Campo In m_Usuario.ColCampos
                    m_Usuario.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                     If p_Error <> "" Then
                         Err.Raise 1000
                     End If
                 Next
                 If getUsuariosTecnicos Is Nothing Then
                    Set getUsuariosTecnicos = New Scripting.Dictionary
                    getUsuariosTecnicos.CompareMode = TextCompare
                 End If
                 If Not getUsuariosTecnicos.exists(m_Usuario.ID) Then
                    getUsuariosTecnicos.Add m_Usuario.ID, m_Usuario
                 End If
                 
                 Set m_Usuario = Nothing
                .MoveNext
            Loop
        End If
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getUsuariosTecnicos ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getUsuarios( _
                                Optional ByRef p_Error As String _
                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Usuario As USUARIO
    
    
    On Error GoTo errores
    
    m_SQL = "SELECT * " & _
            "FROM TbUsuariosAplicaciones " & _
            "ORDER BY Nombre;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            .MoveFirst
            Do While Not .EOF
                Set m_Usuario = New USUARIO
                For Each m_Campo In m_Usuario.ColCampos
                    m_Usuario.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                     If p_Error <> "" Then
                         Err.Raise 1000
                     End If
                 Next
                 If getUsuarios Is Nothing Then
                    Set getUsuarios = New Scripting.Dictionary
                    getUsuarios.CompareMode = TextCompare
                 End If
                 If Not getUsuarios.exists(m_Usuario.ID) Then
                    getUsuarios.Add m_Usuario.ID, m_Usuario
                 End If
                 
                 Set m_Usuario = Nothing
                .MoveNext
            Loop
        End If
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getUsuarios ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getComercial( _
                                Optional p_IDComercial As String, _
                                Optional p_Comercial As String, _
                                Optional ByRef p_Error As String _
                                ) As Comercial
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDComercial = "" And p_Comercial = "" Then
        Exit Function
    End If
    If p_IDComercial <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbComerciales " & _
                "WHERE IDComercial=" & p_IDComercial & ";"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbComerciales " & _
                "WHERE Comercial='" & p_Comercial & "';"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getComercial = New Comercial
        For Each m_Campo In getComercial.ColCampos
            getComercial.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getComercial ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getCPV( _
                        Optional p_IDCPV As String, _
                        Optional p_CPV As String, _
                        Optional ByRef p_Error As String _
                        ) As CPV
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDCPV = "" And p_CPV = "" Then
        Exit Function
    End If
    If p_IDCPV <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbCPV " & _
                "WHERE IDCPV=" & p_IDCPV & ";"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbCPV " & _
                "WHERE CPV='" & p_CPV & "';"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getCPV = New CPV
        For Each m_Campo In getCPV.ColCampos
            getCPV.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getCPV ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getEjercito( _
                            Optional p_IDEjercito As String, _
                            Optional p_Ejercito As String, _
                            Optional ByRef p_Error As String _
                            ) As Ejercito
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDEjercito = "" And p_Ejercito = "" Then
        Exit Function
    End If
    If p_IDEjercito <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbEjercitos " & _
                "WHERE IDEjercito=" & p_IDEjercito & ";"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbEjercitos " & _
                "WHERE Ejercito='" & p_Ejercito & "';"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getEjercito = New Ejercito
        For Each m_Campo In getEjercito.ColCampos
            getEjercito.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getEjercito ha devuelto el error: " & Err.Description
    End If
End Function





Public Function getExpedienteEntidad( _
                                        p_IDExpediente As String, _
                                        Optional ByRef p_Error As String _
                                        ) As ExpedienteEntidad
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
    End If
     m_SQL = "SELECT * " & _
            "FROM TbExpedientesConEntidades " & _
            "WHERE IDExpediente=" & p_IDExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedienteEntidad = New ExpedienteEntidad
        For Each m_Campo In getExpedienteEntidad.ColCampos
            getExpedienteEntidad.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteEntidad ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getGradoClasificacion( _
                                        Optional p_IdGradoClasificacion As String, _
                                        Optional p_GradoClasificacion As String, _
                                        Optional ByRef p_Error As String _
                                        ) As GradoClasificacion
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IdGradoClasificacion = "" And p_GradoClasificacion = "" Then
        Exit Function
    End If
    If p_IdGradoClasificacion <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbGradosClasificacion " & _
                "WHERE IDGradoClasificacion=" & p_IdGradoClasificacion & ";"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbGradosClasificacion " & _
                "WHERE GradoClasificacion='" & p_GradoClasificacion & "';"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getGradoClasificacion = New GradoClasificacion
        For Each m_Campo In getGradoClasificacion.ColCampos
            getGradoClasificacion.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getGradoClasificacion ha devuelto el error: " & Err.Description
    End If
End Function



Public Function getUltimoCambio( _
                                Optional p_IDUsuario As String, _
                                Optional ByRef p_Error As String _
                                ) As UltimoCambio
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    If p_IDUsuario <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbUltimoCambio " & _
                "WHERE IDUsuarioCambio = " & p_IDUsuario & " " & _
                "ORDER BY FechaCambio DESC;"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbUltimoCambio " & _
                "ORDER BY FechaCambio DESC;"
    End If
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getUltimoCambio = New UltimoCambio
        For Each m_Campo In getUltimoCambio.ColCampos
            getUltimoCambio.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getUltimoCambio ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getLugarEjecucion( _
                                    Optional p_IDLugarEjecucion As String, _
                                    Optional p_LugarEjecucion As String, _
                                    Optional ByRef p_Error As String _
                                    ) As LugarEjecucion
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDLugarEjecucion = "" And p_LugarEjecucion = "" Then
        Exit Function
    End If
    If p_IDLugarEjecucion <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbLugaresEjecucion " & _
                "WHERE IDLugarEjecucion=" & p_IDLugarEjecucion & ";"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbLugaresEjecucion " & _
                "WHERE LugarEjecucion='" & p_LugarEjecucion & "';"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getLugarEjecucion = New LugarEjecucion
        For Each m_Campo In getLugarEjecucion.ColCampos
            getLugarEjecucion.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getLugarEjecucion ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getOficinaPrograma( _
                                    Optional p_IDOficinaPrograma As String, _
                                    Optional p_OficinaPrograma As String, _
                                    Optional ByRef p_Error As String _
                                    ) As OficinaPrograma
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDOficinaPrograma = "" And p_OficinaPrograma = "" Then
        Exit Function
    End If
    If p_IDOficinaPrograma <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbOficinasPrograma " & _
                "WHERE IDOficinaPrograma=" & p_IDOficinaPrograma & ";"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbOficinasPrograma " & _
                "WHERE OficinaPrograma='" & p_OficinaPrograma & "';"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getOficinaPrograma = New OficinaPrograma
        For Each m_Campo In getOficinaPrograma.ColCampos
            getOficinaPrograma.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getOficinaPrograma ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getOrganoContratacion( _
                                    Optional p_IDOrganoContratacion As String, _
                                    Optional p_OrganoContratacion As String, _
                                    Optional ByRef p_Error As String _
                                    ) As OrganoContratacion
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDOrganoContratacion = "" And p_OrganoContratacion = "" Then
        Exit Function
    End If
    If p_IDOrganoContratacion <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbOrganosContratacion " & _
                "WHERE IDOrganoContratacion=" & p_IDOrganoContratacion & ";"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbOrganosContratacion " & _
                "WHERE OrganoContratacion='" & p_OrganoContratacion & "';"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getOrganoContratacion = New OrganoContratacion
        For Each m_Campo In getOrganoContratacion.ColCampos
            getOrganoContratacion.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getOrganoContratacion ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getPecal( _
                            Optional p_IDPEcal As String, _
                            Optional p_PECAL As String, _
                            Optional ByRef p_Error As String _
                            ) As PECAL
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDPEcal = "" And p_PECAL = "" Then
        Exit Function
    End If
    If p_IDPEcal <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbPECAL " & _
                "WHERE IDPecal=" & p_IDPEcal & ";"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbPECAL " & _
                "WHERE Pecal='" & p_PECAL & "';"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getPecal = New PECAL
        For Each m_Campo In getPecal.ColCampos
            getPecal.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getPecal ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getRAC( _
                            Optional p_IDRac As String, _
                            Optional p_RAC As String, _
                            Optional ByRef p_Error As String _
                            ) As RAC
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDRac = "" And p_RAC = "" Then
        Exit Function
    End If
    If p_IDRac <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbRACS " & _
                "WHERE IDRAC=" & p_IDRac & ";"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbRACS " & _
                "WHERE RAC='" & p_RAC & "';"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getRAC = New RAC
        For Each m_Campo In getRAC.ColCampos
            getRAC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getRAC ha devuelto el error: " & Err.Description
    End If
End Function


Public Function getExpedienteHitos( _
                                    p_IDExpediente As String, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Hito As ExpedienteHito
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
    End If
    m_SQL = "SELECT * " & _
            "FROM TbExpedientesHitos " & _
            "WHERE IDExpediente=" & p_IDExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Hito = New ExpedienteHito
            For Each m_Campo In m_Hito.ColCampos
                m_Hito.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedienteHitos Is Nothing Then
                Set getExpedienteHitos = New Scripting.Dictionary
                getExpedienteHitos.CompareMode = TextCompare
             End If
             If Not getExpedienteHitos.exists(CStr(m_Hito.IDHitoExpediente)) Then
                getExpedienteHitos.Add CStr(m_Hito.IDHitoExpediente), m_Hito
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteHitos ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedienteContratistas( _
                                            p_IDExpediente As String, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Suministrador As Suministrador
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
    End If
    m_SQL = "SELECT TbSuministradores.* " & _
            "FROM TbExpedientesSuministradores INNER JOIN TbSuministradores " & _
            "ON TbExpedientesSuministradores.IDSuministrador = TbSuministradores.IDSuministrador " & _
            "WHERE TbExpedientesSuministradores.IDExpediente=" & p_IDExpediente & " AND ContratistaPrincipal='Sí';"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Suministrador = New Suministrador
            For Each m_Campo In m_Suministrador.ColCampos
                m_Suministrador.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedienteContratistas Is Nothing Then
                Set getExpedienteContratistas = New Scripting.Dictionary
                getExpedienteContratistas.CompareMode = TextCompare
             End If
             If Not getExpedienteContratistas.exists(CStr(m_Suministrador.IDSuministrador)) Then
                getExpedienteContratistas.Add CStr(m_Suministrador.IDSuministrador), m_Suministrador
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteContratistas ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedienteSubContratistas( _
                                            p_IDExpediente As String, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Suministrador As Suministrador
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
    End If
    m_SQL = "SELECT TbSuministradores.* " & _
            "FROM TbExpedientesSuministradores INNER JOIN TbSuministradores " & _
            "ON TbExpedientesSuministradores.IDSuministrador = TbSuministradores.IDSuministrador " & _
            "WHERE TbExpedientesSuministradores.IDExpediente=" & p_IDExpediente & " AND SubContratista='Sí';"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Suministrador = New Suministrador
            For Each m_Campo In m_Suministrador.ColCampos
                m_Suministrador.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedienteSubContratistas Is Nothing Then
                Set getExpedienteSubContratistas = New Scripting.Dictionary
                getExpedienteSubContratistas.CompareMode = TextCompare
             End If
             If Not getExpedienteSubContratistas.exists(CStr(m_Suministrador.IDSuministrador)) Then
                getExpedienteSubContratistas.Add CStr(m_Suministrador.IDSuministrador), m_Suministrador
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteSubContratistas ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedienteLugarEjecucion( _
                                            p_IDExpedienteLugarEjecucion As String, _
                                            Optional ByRef p_Error As String _
                                            ) As ExpedienteLugarEjecucion
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDExpedienteLugarEjecucion = "" Then
        Exit Function
    End If
    m_SQL = "SELECT * " & _
            "FROM TbExpedientesLugaresEjecucion " & _
            "WHERE IDExpedienteLugarEjecucion=" & p_IDExpedienteLugarEjecucion & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedienteLugarEjecucion = New ExpedienteLugarEjecucion
        For Each m_Campo In getExpedienteLugarEjecucion.ColCampos
            getExpedienteLugarEjecucion.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteLugarEjecucion ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedienteLugaresEjecucion( _
                                            p_IDExpediente As String, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_LugarEjecucion As LugarEjecucion
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
    End If
        m_SQL = "SELECT TbLugaresEjecucion.* " & _
                "FROM TbExpedientesLugaresEjecucion INNER JOIN TbLugaresEjecucion " & _
                "ON TbExpedientesLugaresEjecucion.IDLugarEjecucion = TbLugaresEjecucion.IDLugarEjecucion " & _
                "WHERE TbExpedientesLugaresEjecucion.IDExpediente=" & p_IDExpediente & ";"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_LugarEjecucion = New LugarEjecucion
            For Each m_Campo In m_LugarEjecucion.ColCampos
                m_LugarEjecucion.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedienteLugaresEjecucion Is Nothing Then
                Set getExpedienteLugaresEjecucion = New Scripting.Dictionary
                getExpedienteLugaresEjecucion.CompareMode = TextCompare
             End If
             If Not getExpedienteLugaresEjecucion.exists(CStr(m_LugarEjecucion.IDLugarEjecucion)) Then
                getExpedienteLugaresEjecucion.Add CStr(m_LugarEjecucion.IDLugarEjecucion), m_LugarEjecucion
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteLugaresEjecucion ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpediente( _
                                Optional p_IDExpediente As String, _
                                Optional p_Expediente As String, _
                                Optional p_Nemotecnico As String, _
                                Optional ByRef p_Error As String _
                                ) As Expediente
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" And p_Expediente = "" And p_Nemotecnico = "" Then
        Exit Function
    End If
    If p_IDExpediente <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbExpedientes " & _
                "WHERE IDExpediente=" & p_IDExpediente & ";"
    ElseIf p_Expediente <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbExpedientes " & _
                "WHERE Expediente='" & p_Expediente & "';"
    Else
        
        m_SQL = "SELECT * " & _
                "FROM TbExpedientes " & _
                "WHERE Nemotecnico='" & p_Nemotecnico & "';"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpediente = New Expediente
        For Each m_Campo In getExpediente.ColCampos
            'If CStr(m_Campo) = "IDResponsableSeguridad" Then Stop
            'If CStr(m_Campo) = "IDResponsableCalidad" Then Stop
            getExpediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpediente ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedienteCompleto( _
                                        Optional p_IDExpediente As String, _
                                        Optional ByRef p_Error As String _
                                        ) As ExpedienteCompleto
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
    End If
    m_SQL = "SELECT TbExpedientes.*, " & _
            "TbExpedientesConEntidades.Clasificacion, " & _
            "TbExpedientesConEntidades.OrganoContratacion, " & _
            "TbExpedientesConEntidades.OficinaPrograma, TbExpedientesConEntidades.Ejercito, " & _
            "TbExpedientesConEntidades.ResponsableCalidad,TbExpedientesConEntidades.ResponsableSeguridad, " & _
            "TbExpedientesConEntidades.CadenaContratistas, TbExpedientesConEntidades.CadenaComerciales, " & _
            "TbExpedientesConEntidades.CadenaJPs, TbExpedientesConEntidades.CadenaRACs, " & _
            "TbExpedientesConEntidades.CadenaCorreoRACs,TbExpedientesConEntidades.CadenaHitos " & _
            "FROM TbExpedientes LEFT JOIN TbExpedientesConEntidades " & _
            "ON TbExpedientes.IDExpediente = TbExpedientesConEntidades.IDExpediente " & _
            "WHERE  TbExpedientes.IDExpediente=" & p_IDExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedienteCompleto = New ExpedienteCompleto
        For Each m_Campo In getExpedienteCompleto.ColCampos
            'If CStr(m_Campo) = "ESTADO" Then Stop
            getExpedienteCompleto.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteCompleto ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientesCompletos(Optional ByRef p_Error As String) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ExpC As ExpedienteCompleto
    
    
    On Error GoTo errores
    
   
    m_SQL = "SELECT TbExpedientes.*, " & _
            "TbExpedientesConEntidades.Clasificacion, " & _
            "TbExpedientesConEntidades.OrganoContratacion, " & _
            "TbExpedientesConEntidades.OficinaPrograma, TbExpedientesConEntidades.Ejercito, " & _
            "TbExpedientesConEntidades.ResponsableCalidad,TbExpedientesConEntidades.ResponsableSeguridad, " & _
            "TbExpedientesConEntidades.CadenaContratistas, TbExpedientesConEntidades.CadenaComerciales, " & _
            "TbExpedientesConEntidades.CadenaJPs, TbExpedientesConEntidades.CadenaRACs, " & _
            "TbExpedientesConEntidades.CadenaCorreoRACs,TbExpedientesConEntidades.CadenaHitos, " & _
            "TbExpedientesConEntidades.TipoParaLista " & _
            "FROM TbExpedientes LEFT JOIN TbExpedientesConEntidades " & _
            "ON TbExpedientes.IDExpediente = TbExpedientesConEntidades.IDExpediente;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ExpC = New ExpedienteCompleto
            For Each m_Campo In m_ExpC.ColCampos
                m_ExpC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesCompletos Is Nothing Then
                Set getExpedientesCompletos = New Scripting.Dictionary
                getExpedientesCompletos.CompareMode = TextCompare
             End If
             If Not getExpedientesCompletos.exists(CStr(m_ExpC.IDExpediente)) Then
                getExpedientesCompletos.Add CStr(m_ExpC.IDExpediente), m_ExpC
             End If
            .MoveNext
        Loop
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteCompleto ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientesDerivadosCompletos( _
                                                    p_IDExpediente As String, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ExpC As ExpedienteCompleto
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
    End If
     m_SQL = "SELECT TbExpedientes.*, " & _
            "TbExpedientesConEntidades.Clasificacion, " & _
            "TbExpedientesConEntidades.OrganoContratacion, " & _
            "TbExpedientesConEntidades.OficinaPrograma, TbExpedientesConEntidades.Ejercito, " & _
            "TbExpedientesConEntidades.ResponsableCalidad,TbExpedientesConEntidades.ResponsableSeguridad, " & _
            "TbExpedientesConEntidades.CadenaContratistas, TbExpedientesConEntidades.CadenaComerciales, " & _
            "TbExpedientesConEntidades.CadenaJPs, TbExpedientesConEntidades.CadenaRACs, " & _
            "TbExpedientesConEntidades.CadenaCorreoRACs, " & _
            "TbExpedientesConEntidades.TipoParaLista,TbExpedientesConEntidades.CadenaHitos  " & _
            "FROM TbExpedientes LEFT JOIN TbExpedientesConEntidades " & _
            "ON TbExpedientes.IDExpediente = TbExpedientesConEntidades.IDExpediente " & _
            "WHERE IDExpedientePadre=" & p_IDExpediente & ";"
   
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ExpC = New ExpedienteCompleto
            For Each m_Campo In m_ExpC.ColCampos
                m_ExpC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesDerivadosCompletos Is Nothing Then
                Set getExpedientesDerivadosCompletos = New Scripting.Dictionary
                getExpedientesDerivadosCompletos.CompareMode = TextCompare
             End If
             If Not getExpedientesDerivadosCompletos.exists(CStr(m_ExpC.IDExpediente)) Then
                getExpedientesDerivadosCompletos.Add CStr(m_ExpC.IDExpediente), m_ExpC
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesDerivadosCompletos ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedienteUltimoLoteDerivado( _
                                                    Optional p_IDExpediente As String, _
                                                    Optional p_Expediente As Expediente, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Expediente
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" And p_Expediente Is Nothing Then
        Exit Function
    End If
    If p_IDExpediente = "" Then
        p_IDExpediente = p_Expediente.IDExpediente
        If p_IDExpediente = "" Then
            Exit Function
        End If
    End If
    m_SQL = "SELECT * " & _
            "FROM TbExpedientes " & _
            "WHERE IDExpedientePadre=" & p_IDExpediente & _
            " AND EsLote='Sí' " & _
            "ORDER BY Ordinal DESC;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedienteUltimoLoteDerivado = New Expediente
        For Each m_Campo In getExpedienteUltimoLoteDerivado.ColCampos
            'If CStr(m_Campo) = "TipoInforme" Then Stop
            getExpedienteUltimoLoteDerivado.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteUltimoLoteDerivado ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedienteUltimoBasadoDerivado( _
                                                    Optional p_IDExpediente As String, _
                                                    Optional p_Expediente As Expediente, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Expediente
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" And p_Expediente Is Nothing Then
        Exit Function
    End If
    If p_IDExpediente = "" Then
        p_IDExpediente = p_Expediente.IDExpediente
        If p_IDExpediente = "" Then
            Exit Function
        End If
    End If
    m_SQL = "SELECT * " & _
            "FROM TbExpedientes " & _
            "WHERE IDExpedientePadre=" & p_IDExpediente & _
            " AND EsBasado='Sí' " & _
            "ORDER BY Ordinal DESC;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedienteUltimoBasadoDerivado = New Expediente
        For Each m_Campo In getExpedienteUltimoBasadoDerivado.ColCampos
            'If CStr(m_Campo) = "TipoInforme" Then Stop
            getExpedienteUltimoBasadoDerivado.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteUltimoBasadoDerivado ha devuelto el error: " & Err.Description
    End If
End Function


Public Function getExpedientesEstadoDesconocido( _
                                                Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    m_SQL = "SELECT * " & _
            "FROM TbExpedientes " & _
            "WHERE " & _
            "APLICAESTADO='Sí' " & _
            "AND ESTADO='Desconocido';"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesEstadoDesconocido Is Nothing Then
                Set getExpedientesEstadoDesconocido = New Scripting.Dictionary
                getExpedientesEstadoDesconocido.CompareMode = TextCompare
             End If
             If Not getExpedientesEstadoDesconocido.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesEstadoDesconocido.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesEstadoDesconocido ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getColExpedientesAPuntoDeRecepcionar( _
                                                Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_expediente As Expediente
    Dim m_Col As Scripting.Dictionary
    
    On Error GoTo errores
    
    Set m_Col = getColExpedientesAPuntoDeRecepcionarCompleto(p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            Set m_expediente = m_Col(m_ID)
            If getColExpedientesAPuntoDeRecepcionar Is Nothing Then
                Set getColExpedientesAPuntoDeRecepcionar = New Scripting.Dictionary
                getColExpedientesAPuntoDeRecepcionar.CompareMode = TextCompare
             End If
             If Not getColExpedientesAPuntoDeRecepcionar.exists(CStr(m_expediente.IDExpediente)) Then
                getColExpedientesAPuntoDeRecepcionar.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            Set m_expediente = Nothing
        Next
    End If
    Set m_Col = getColExpedientesAPuntoDeRecepcionarHito(p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Col Is Nothing Then
        For Each m_ID In m_Col
            Set m_expediente = m_Col(m_ID)
            If getColExpedientesAPuntoDeRecepcionar Is Nothing Then
                Set getColExpedientesAPuntoDeRecepcionar = New Scripting.Dictionary
                getColExpedientesAPuntoDeRecepcionar.CompareMode = TextCompare
             End If
             If Not getColExpedientesAPuntoDeRecepcionar.exists(CStr(m_expediente.IDExpediente)) Then
                getColExpedientesAPuntoDeRecepcionar.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            Set m_expediente = Nothing
        Next
    End If
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColExpedientesAPuntoDeRecepcionar ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getColExpedientesAPuntoDeRecepcionarCompleto( _
                                                            Optional ByRef p_Error As String _
                                                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    m_SQL = "SELECT * " & _
            "FROM TbExpedientes " & _
            "WHERE (((DateDiff('d',Date(),[FechaFinContrato]))>-1 " & _
            "And (DateDiff('d',Date(),[FechaFinContrato]))<" & m_ObjEntorno.DiasParaAvisoFinExpediente & ") " & _
            "AND ((TbExpedientes.EsBasado)='Sí')) OR (((DateDiff('d',Date(),[FechaFinContrato]))>-1 " & _
            "And (DateDiff('d',Date(),[FechaFinContrato]))<" & m_ObjEntorno.DiasParaAvisoFinExpediente & ") " & _
            "AND ((TbExpedientes.EsExpediente)='Sí'));"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getColExpedientesAPuntoDeRecepcionarCompleto Is Nothing Then
                Set getColExpedientesAPuntoDeRecepcionarCompleto = New Scripting.Dictionary
                getColExpedientesAPuntoDeRecepcionarCompleto.CompareMode = TextCompare
             End If
             If Not getColExpedientesAPuntoDeRecepcionarCompleto.exists(CStr(m_expediente.IDExpediente)) Then
                getColExpedientesAPuntoDeRecepcionarCompleto.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColExpedientesAPuntoDeRecepcionarCompleto ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getColExpedientesAPuntoDeRecepcionarHito( _
                                                            Optional ByRef p_Error As String _
                                                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    m_SQL = "SELECT TbExpedientes.* " & _
                "FROM (TbExpedientesHitos INNER JOIN TbExpedientes " & _
                "ON TbExpedientesHitos.IDExpediente = TbExpedientes.IDExpediente) " & _
                "LEFT JOIN TbUsuariosAplicaciones ON TbExpedientes.IDResponsableCalidad = TbUsuariosAplicaciones.Id " & _
                "WHERE (((DateDiff('d',Date(),[FechaHito]))>-1 " & _
                "And (DateDiff('d',Date(),[FechaHito]))<" & m_ObjEntorno.DiasParaAvisoFinExpediente & "));"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getColExpedientesAPuntoDeRecepcionarHito Is Nothing Then
                Set getColExpedientesAPuntoDeRecepcionarHito = New Scripting.Dictionary
                getColExpedientesAPuntoDeRecepcionarHito.CompareMode = TextCompare
             End If
             If Not getColExpedientesAPuntoDeRecepcionarHito.exists(CStr(m_expediente.IDExpediente)) Then
                getColExpedientesAPuntoDeRecepcionarHito.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColExpedientesAPuntoDeRecepcionarHito ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getColExpedientesAdjudicadosSinContrato( _
                                                        Optional ByRef p_Error As String _
                                                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    m_SQL = "SELECT * " & _
            "FROM TbExpedientes " & _
            "WHERE FechaInicioContrato Is Null AND GARANTIAMESES Is Null AND FechaFinContrato Is Null " & _
            "AND Not FECHAADJUDICACION is Null AND APLICAESTADO<>'No';"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
            
             If getColExpedientesAdjudicadosSinContrato Is Nothing Then
                Set getColExpedientesAdjudicadosSinContrato = New Scripting.Dictionary
                getColExpedientesAdjudicadosSinContrato.CompareMode = TextCompare
             End If
             If Not getColExpedientesAdjudicadosSinContrato.exists(CStr(m_expediente.IDExpediente)) Then
                getColExpedientesAdjudicadosSinContrato.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColExpedientesAdjudicadosSinContrato ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getColExpedientesAdjudicadosTSOLSinCodS4H( _
                                                        Optional ByRef p_Error As String _
                                                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    m_SQL = "SELECT TbExpedientes.* " & _
            "FROM TbExpedientes INNER JOIN TbExpedientesConEntidades " & _
            "ON TbExpedientes.IDExpediente = TbExpedientesConEntidades.IDExpediente " & _
            "WHERE (((TbExpedientesConEntidades.CadenaContratistas)='TSOL') " & _
            "AND ((TbExpedientes.Adjudicado)='Sí')  " & _
            "AND ((TbExpedientes.CodS4H) Is Null) " & _
            "AND ((TbExpedientes.AplicaTareaS4H) <>'No'));"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
            
             If getColExpedientesAdjudicadosTSOLSinCodS4H Is Nothing Then
                Set getColExpedientesAdjudicadosTSOLSinCodS4H = New Scripting.Dictionary
                getColExpedientesAdjudicadosTSOLSinCodS4H.CompareMode = TextCompare
             End If
             If Not getColExpedientesAdjudicadosTSOLSinCodS4H.exists(CStr(m_expediente.IDExpediente)) Then
                getColExpedientesAdjudicadosTSOLSinCodS4H.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColExpedientesAdjudicadosTSOLSinCodS4H ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getColExpedientesFaseOfertaPorMuchoTiempo( _
                                                        Optional ByRef p_Error As String _
                                                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    m_SQL = "SELECT TbExpedientes.* " & _
            "FROM TbExpedientes INNER JOIN TbExpedientesConEntidades " & _
            "ON TbExpedientes.IDExpediente = TbExpedientesConEntidades.IDExpediente " & _
            "WHERE ((Not (TbExpedientes.FECHAOFERTA) Is Null) AND ((TbExpedientes.FECHAPERDIDA) Is Null) " & _
            "AND ((TbExpedientes.FECHADESESTIMADA) Is Null) AND ((TbExpedientes.FECHAADJUDICACION) Is Null) " & _
            "AND ((DateDiff('d',[FECHAOFERTA],Date()))>=" & m_ObjEntorno.DiasParaOfertasSinDecision & "));"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
            
             If getColExpedientesFaseOfertaPorMuchoTiempo Is Nothing Then
                Set getColExpedientesFaseOfertaPorMuchoTiempo = New Scripting.Dictionary
                getColExpedientesFaseOfertaPorMuchoTiempo.CompareMode = TextCompare
             End If
             If Not getColExpedientesFaseOfertaPorMuchoTiempo.exists(CStr(m_expediente.IDExpediente)) Then
                getColExpedientesFaseOfertaPorMuchoTiempo.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColExpedientesFaseOfertaPorMuchoTiempo ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientes( _
                                Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    m_SQL = "TbExpedientes"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientes Is Nothing Then
                Set getExpedientes = New Scripting.Dictionary
                getExpedientes.CompareMode = TextCompare
             End If
             If Not getExpedientes.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientes.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientes ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedientesEnGestionDeRiesgos( _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    m_SQL = "SELECT  TbExpedientes1.* " & _
            "FROM TbProyectos INNER JOIN TbExpedientes1 ON TbProyectos.IDExpediente = TbExpedientes1.IDExpediente;"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesEnGestionDeRiesgos Is Nothing Then
                Set getExpedientesEnGestionDeRiesgos = New Scripting.Dictionary
                getExpedientesEnGestionDeRiesgos.CompareMode = TextCompare
             End If
             If Not getExpedientesEnGestionDeRiesgos.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesEnGestionDeRiesgos.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesEnGestionDeRiesgos ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedientesNoEnEntidades( _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    m_SQL = "SELECT TbExpedientes.* " & _
            "FROM TbExpedientes LEFT JOIN TbExpedientesConEntidades " & _
            "ON TbExpedientes.IDExpediente = TbExpedientesConEntidades.IDExpediente " & _
            "WHERE (((TbExpedientesConEntidades.IDExpediente) Is Null));"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesNoEnEntidades Is Nothing Then
                Set getExpedientesNoEnEntidades = New Scripting.Dictionary
                getExpedientesNoEnEntidades.CompareMode = TextCompare
             End If
             If Not getExpedientesNoEnEntidades.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesNoEnEntidades.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesNoEnEntidades ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getLotes( _
                            p_IDExpediente As String, _
                            Optional ByRef p_Error As String _
                            ) As Scripting.Dictionary
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    m_SQL = "SELECT * " & _
            "FROM TbExpedientes " & _
            "WHERE " & _
            "IDExpedientePadre=" & p_IDExpediente & " " & _
            "AND EsLote='Sí' " & _
            "ORDER BY IDExpediente;"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getLotes Is Nothing Then
                Set getLotes = New Scripting.Dictionary
                getLotes.CompareMode = TextCompare
             End If
             If Not getLotes.exists(CStr(m_expediente.IDExpediente)) Then
                getLotes.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getLotes ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getBasados( _
                            p_IDExpediente As String, _
                            Optional ByRef p_Error As String _
                            ) As Scripting.Dictionary
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    m_SQL = "SELECT * " & _
            "FROM TbExpedientes " & _
            "WHERE " & _
            "IDExpedientePadre=" & p_IDExpediente & " " & _
            "AND EsBasado='Sí' " & _
            "ORDER BY IDEjercito, Ordinal;"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getBasados Is Nothing Then
                Set getBasados = New Scripting.Dictionary
                getBasados.CompareMode = TextCompare
             End If
             If Not getBasados.exists(CStr(m_expediente.IDExpediente)) Then
                getBasados.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getBasados ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getBasadosCompletos( _
                                        p_IDExpediente As String, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ExpedienteC As ExpedienteCompleto
    
    
    On Error GoTo errores
    m_SQL = "SELECT TbExpedientes.*, " & _
            "TbExpedientesConEntidades.Clasificacion, " & _
            "TbExpedientesConEntidades.OrganoContratacion, " & _
            "TbExpedientesConEntidades.OficinaPrograma, TbExpedientesConEntidades.Ejercito, " & _
            "TbExpedientesConEntidades.ResponsableCalidad,TbExpedientesConEntidades.ResponsableSeguridad, " & _
            "TbExpedientesConEntidades.CadenaContratistas, TbExpedientesConEntidades.CadenaComerciales, " & _
            "TbExpedientesConEntidades.CadenaJPs, TbExpedientesConEntidades.CadenaRACs, " & _
            "TbExpedientesConEntidades.CadenaCorreoRACs,TbExpedientesConEntidades.CadenaHitos " & _
            "FROM TbExpedientes LEFT JOIN TbExpedientesConEntidades " & _
            "ON TbExpedientes.IDExpediente = TbExpedientesConEntidades.IDExpediente " & _
            "WHERE " & _
            "TbExpedientes.IDExpedientePadre=" & p_IDExpediente & " " & _
            "AND TbExpedientes.EsBasado='Sí' " & _
            "ORDER BY TbExpedientes.IDEjercito, TbExpedientes.Ordinal;"
   
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ExpedienteC = New ExpedienteCompleto
            For Each m_Campo In m_ExpedienteC.ColCampos
                'If CStr(m_Campo) = "CadenaHitos" Then Stop
                m_ExpedienteC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getBasadosCompletos Is Nothing Then
                Set getBasadosCompletos = New Scripting.Dictionary
                getBasadosCompletos.CompareMode = TextCompare
             End If
             If Not getBasadosCompletos.exists(CStr(m_ExpedienteC.IDExpediente)) Then
                getBasadosCompletos.Add CStr(m_ExpedienteC.IDExpediente), m_ExpedienteC
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getBasadosCompletos ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedientesParaCombo( _
                                        Optional ByRef p_Error As String _
                                         ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    m_SQL = "SELECT * " & _
            "FROM TbExpedientes " & _
            "ORDER BY IDExpediente;"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesParaCombo Is Nothing Then
                Set getExpedientesParaCombo = New Scripting.Dictionary
                getExpedientesParaCombo.CompareMode = TextCompare
             End If
             If Not getExpedientesParaCombo.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesParaCombo.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesParaCombo ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedienteUltimoDerivado( _
                                            Optional p_ID As String, _
                                            Optional p_Expediente As Expediente, _
                                            Optional ByRef p_Error As String _
                                            ) As Expediente
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    
    m_SQL = getSQLUltimoDerivado(p_ID:=p_ID, p_Expediente:=p_Expediente, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_SQL = "" Then
        Exit Function
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedienteUltimoDerivado = New Expediente
        For Each m_Campo In getExpedienteUltimoDerivado.ColCampos
            getExpedienteUltimoDerivado.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteUltimoDerivado ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSQLLimitantePorTipoBusqueda( _
                                                p_TipoBusqueda As String, _
                                                Optional ByRef p_Error As String _
                                                ) As String
    Dim m_SQLInicial As String
    Dim m_Where As String
    
    On Error GoTo errores
    
    If p_TipoBusqueda = "" Then
        Exit Function
    End If
    
    
    If p_TipoBusqueda = "Acuerdo Marco" Then
        m_SQLInicial = "SELECT TbExpedientes.IDExpediente " & _
                "FROM TbExpedientes "
        m_Where = "EsAM='Sí' "
    ElseIf p_TipoBusqueda = "Lote" Then
        m_SQLInicial = "SELECT TbExpedientes.IDExpediente " & _
                "FROM TbExpedientes "
        m_Where = "EsLote='Sí' "
    ElseIf p_TipoBusqueda = "Basado" Then
        m_SQLInicial = "SELECT TbExpedientes.IDExpediente " & _
                "FROM TbExpedientes "
        m_Where = "EsBasado='Sí' "
    ElseIf p_TipoBusqueda = "Basado de Acuerdo Marco" Then
        m_SQLInicial = "SELECT TbExpedientes.IDExpediente " & _
                    "FROM TbExpedientes INNER JOIN TbExpedientes AS TbExpedientes_1 " & _
                    "ON TbExpedientes.IDExpedientePadre = TbExpedientes_1.IDExpediente "
        m_Where = "TbExpedientes.EsBasado='Sí' AND TbExpedientes_1.EsAM='Sí' "
    ElseIf p_TipoBusqueda = "Basado de Lote" Then
        m_SQLInicial = "SELECT TbExpedientes.IDExpediente " & _
                    "FROM TbExpedientes INNER JOIN TbExpedientes AS TbExpedientes_1 " & _
                    "ON TbExpedientes.IDExpedientePadre = TbExpedientes_1.IDExpediente "
        m_Where = "TbExpedientes.EsBasado='Sí' AND TbExpedientes_1.EsLote='Sí' "
    ElseIf p_TipoBusqueda = "Expediente" Then
        m_SQLInicial = "SELECT TbExpedientes.IDExpediente " & _
                "FROM TbExpedientes "
        m_Where = "EsExpediente='Sí' "
    Else
        Exit Function
    End If
    
    getSQLLimitantePorTipoBusqueda = m_SQLInicial & _
                                    "WHERE " & _
                                    m_Where & ";"
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSQLLimitantePorTipoBusqueda ha devuelto el error: " & Err.Description
    End If
End Function


Public Function getExpedientesBusquedaSimple( _
                                                Optional p_VerTodos As EnumSiNo = EnumSiNo.No, _
                                                Optional p_PalabraClave As String, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    Dim m_WhereTitulo As String
    Dim m_WhereCodExp As String
    Dim m_WhereCodExpLargo As String
    Dim m_WhereNemotecnico As String
    Dim m_WherePecal As String
    Dim m_WherEJuridica As String
    Dim m_WhereEstado As String
    Dim m_WhereTipo As String
    
    Dim m_SQLInicial As String
    Dim m_Where As String
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    
    m_SQLInicial = "SELECT * " & _
                    "FROM TbExpedientes "
    If p_VerTodos = EnumSiNo.Sí Then
         m_SQL = m_SQLInicial & _
                "ORDER BY IDExpediente DESC;"
    Else
        If p_PalabraClave = "" Then
            Exit Function
        End If
         m_WhereTitulo = "Titulo Like '*" & p_PalabraClave & "*' "
        m_WhereCodExp = "CodExp Like '*" & p_PalabraClave & "*' "
        m_WhereCodExpLargo = "CodExpLargo Like '*" & p_PalabraClave & "*' "
        m_WhereNemotecnico = "Nemotecnico Like '*" & p_PalabraClave & "*' "
        
        
        m_Where = "WHERE " & _
                m_WhereTitulo & " OR " & _
                m_WhereCodExp & " OR " & _
                m_WhereCodExpLargo & " OR " & _
                m_WhereNemotecnico
                
        m_SQL = m_SQLInicial & _
                m_Where & " " & _
                "ORDER BY IDExpediente DESC;"
    End If
   
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            
            For Each m_Campo In m_expediente.ColCampos
                
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getExpedientesBusquedaSimple Is Nothing Then
               Set getExpedientesBusquedaSimple = New Scripting.Dictionary
               getExpedientesBusquedaSimple.CompareMode = TextCompare
            End If
            If Not getExpedientesBusquedaSimple.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesBusquedaSimple.Add m_expediente.IDExpediente, m_expediente
             End If
             Set m_expediente = Nothing
            .MoveNext
        Loop
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesBusquedaSimple ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getGradosClasificacionesEnExpedientes( _
                                                        Optional ByRef p_Error As String _
                                                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_GradoClasificacion As GradoClasificacion
    
    
    On Error GoTo errores
    
   
    m_SQL = "SELECT distinct TbGradosClasificacion.* " & _
            "FROM TbExpedientes INNER JOIN TbGradosClasificacion " & _
            "ON TbExpedientes.GradoClasificacion = TbGradosClasificacion.GradoClasificacion;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_GradoClasificacion = New GradoClasificacion
            For Each m_Campo In m_GradoClasificacion.ColCampos
                m_GradoClasificacion.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getGradosClasificacionesEnExpedientes Is Nothing Then
                Set getGradosClasificacionesEnExpedientes = New Scripting.Dictionary
                getGradosClasificacionesEnExpedientes.CompareMode = TextCompare
             End If
             If Not getGradosClasificacionesEnExpedientes.exists(CStr(m_GradoClasificacion.IdGradoClasificacion)) Then
                getGradosClasificacionesEnExpedientes.Add CStr(m_GradoClasificacion.IdGradoClasificacion), m_GradoClasificacion
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getGradosClasificacionesEnExpedientes ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedientesConComercial( _
                                                p_IDComercial As String, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    
    If p_IDComercial = "" Then
        Exit Function
    End If
    m_SQL = "SELECT DISTINCT TbExpedientes.* " & _
            "FROM TbExpedientes INNER JOIN TbExpedientesComerciales  " & _
            "ON TbExpedientes.IDExpediente = TbExpedientesComerciales.IDExpediente " & _
            "WHERE TbExpedientesComerciales.IDComercial=" & p_IDComercial & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesConComercial Is Nothing Then
                Set getExpedientesConComercial = New Scripting.Dictionary
                getExpedientesConComercial.CompareMode = TextCompare
             End If
             If Not getExpedientesConComercial.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesConComercial.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesConComercial ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientesConSuministrador( _
                                                p_IDSuministrador As String, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Suministrador As Suministrador
    
    
    On Error GoTo errores
    
    If p_IDSuministrador = "" Then
        Exit Function
    End If
    m_SQL = "SELECT DISTINCT TbSuministradores.* " & _
            "FROM TbSuministradores INNER JOIN TbExpedientesSuministradores  " & _
            "ON TbSuministradores.IDSuministrador = TbExpedientesSuministradores.IDSuministrador " & _
            "WHERE TbExpedientesSuministradores.IDSuministrador=" & p_IDSuministrador & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Suministrador = New Suministrador
            For Each m_Campo In m_Suministrador.ColCampos
                m_Suministrador.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesConSuministrador Is Nothing Then
                Set getExpedientesConSuministrador = New Scripting.Dictionary
                getExpedientesConSuministrador.CompareMode = TextCompare
             End If
             If Not getExpedientesConSuministrador.exists(CStr(m_Suministrador.IDSuministrador)) Then
                getExpedientesConSuministrador.Add CStr(m_Suministrador.IDSuministrador), m_Suministrador
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesConSuministrador ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getJPs( _
                        Optional ByRef p_Error As String _
                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    
    On Error GoTo errores
    
    m_SQL = "SELECT DISTINCT TbUsuariosAplicaciones.Nombre " & _
            "FROM TbExpedientesResponsables INNER JOIN TbUsuariosAplicaciones " & _
            "ON TbExpedientesResponsables.IdUsuario = TbUsuariosAplicaciones.Id " & _
            "WHERE (((TbExpedientesResponsables.EsJefeProyecto)='Sí')) " & _
            "ORDER BY TbUsuariosAplicaciones.Nombre;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            
             If getJPs Is Nothing Then
                Set getJPs = New Scripting.Dictionary
                getJPs.CompareMode = TextCompare
             End If
             If Not getJPs.exists(.Fields("Nombre").value) Then
                getJPs.Add .Fields("Nombre").value, .Fields("Nombre").value
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getJPs ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getJPsPorExpediente( _
                                    p_IDExpediente As String, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    
    On Error GoTo errores
    If p_IDExpediente = "" Then
        Err.Raise 1000
    End If
    m_SQL = "SELECT TbUsuariosAplicaciones.Nombre " & _
            "FROM TbExpedientesResponsables INNER JOIN TbUsuariosAplicaciones " & _
            "ON TbExpedientesResponsables.IdUsuario = TbUsuariosAplicaciones.Id " & _
            "WHERE (((TbExpedientesResponsables.IdExpediente)=" & p_IDExpediente & "));"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            
             If getJPsPorExpediente Is Nothing Then
                Set getJPsPorExpediente = New Scripting.Dictionary
                getJPsPorExpediente.CompareMode = TextCompare
             End If
             If Not getJPsPorExpediente.exists(.Fields("Nombre").value) Then
                getJPsPorExpediente.Add .Fields("Nombre").value, .Fields("Nombre").value
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getJPsPorExpediente ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getComerciales( _
                                Optional p_Nombre As String, _
                                Optional ByRef p_Error As String _
                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Comercial As Comercial
    
    
    On Error GoTo errores
    
    If p_Nombre = "" Then
        m_SQL = "SELECT * " & _
                "FROM TbComerciales ORDER BY Comercial;"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbComerciales " & _
                "WHERE Comercial Like '*" & p_Nombre & "*' ORDER BY Comercial;"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Comercial = New Comercial
            For Each m_Campo In m_Comercial.ColCampos
                m_Comercial.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getComerciales Is Nothing Then
                Set getComerciales = New Scripting.Dictionary
                getComerciales.CompareMode = TextCompare
             End If
             If Not getComerciales.exists(CStr(m_Comercial.IDComercial)) Then
                getComerciales.Add CStr(m_Comercial.IDComercial), m_Comercial
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getComerciales ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientesConCPV( _
                                        p_IDCPV As String, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    
    If p_IDCPV = "" Then
        Exit Function
    End If
    m_SQL = "SELECT DISTINCT TbExpedientes.* " & _
            "FROM TbExpedientes INNER JOIN TbExpedientesCPVs ON TbExpedientes.IDExpediente = TbExpedientesCPVs.IDExpediente " & _
            "WHERE TbExpedientesCPVs.IDCPV=" & p_IDCPV & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesConCPV Is Nothing Then
                Set getExpedientesConCPV = New Scripting.Dictionary
                getExpedientesConCPV.CompareMode = TextCompare
             End If
             If Not getExpedientesConCPV.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesConCPV.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesConCPV ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getCPVs( _
                                Optional p_CPV As String, _
                                Optional ByRef p_Error As String _
                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_CPV As CPV
    
    
    On Error GoTo errores
    
    If p_CPV = "" Then
        m_SQL = "SELECT * " & _
                "FROM TbCPV ORDER BY CPV;"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbCPV " & _
                "WHERE CPV='" & p_CPV & "' ORDER BY CPV;"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_CPV = New CPV
            For Each m_Campo In m_CPV.ColCampos
                m_CPV.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getCPVs Is Nothing Then
                Set getCPVs = New Scripting.Dictionary
                getCPVs.CompareMode = TextCompare
             End If
             If Not getCPVs.exists(CStr(m_CPV.IDCPV)) Then
                getCPVs.Add CStr(m_CPV.IDCPV), m_CPV
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getCPVs ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getEjercitos( _
                                Optional p_Ejercito As String, _
                                Optional ByRef p_Error As String _
                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Ejercito As Ejercito
    
    
    On Error GoTo errores
    
    If p_Ejercito = "" Then
        m_SQL = "SELECT * " & _
                "FROM TbEjercitos;"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbEjercitos " & _
                "WHERE Ejercito='" & p_Ejercito & "';"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Ejercito = New Ejercito
            For Each m_Campo In m_Ejercito.ColCampos
                m_Ejercito.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getEjercitos Is Nothing Then
                Set getEjercitos = New Scripting.Dictionary
                getEjercitos.CompareMode = TextCompare
             End If
             If Not getEjercitos.exists(CStr(m_Ejercito.IDEjercito)) Then
                getEjercitos.Add CStr(m_Ejercito.IDEjercito), m_Ejercito
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getEjercitos ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getGradosClasificaciones( _
                                        Optional p_GradoClasificacion As String, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_GradoClasificacion As GradoClasificacion
    
    
    On Error GoTo errores
    
    If p_GradoClasificacion = "" Then
        m_SQL = "SELECT * " & _
                "FROM TbGradosClasificacion;"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbGradosClasificacion " & _
                "WHERE GradoClasificacion='" & p_GradoClasificacion & "';"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_GradoClasificacion = New GradoClasificacion
            For Each m_Campo In m_GradoClasificacion.ColCampos
                m_GradoClasificacion.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getGradosClasificaciones Is Nothing Then
                Set getGradosClasificaciones = New Scripting.Dictionary
                getGradosClasificaciones.CompareMode = TextCompare
             End If
             If Not getGradosClasificaciones.exists(CStr(m_GradoClasificacion.IdGradoClasificacion)) Then
                getGradosClasificaciones.Add CStr(m_GradoClasificacion.IdGradoClasificacion), m_GradoClasificacion
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getGradosClasificaciones ha devuelto el error: " & Err.Description
    End If
End Function



Public Function getRACs( _
                                Optional p_RAC As String, _
                                Optional ByRef p_Error As String _
                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_RAC As RAC
    
    
    On Error GoTo errores
    
    If p_RAC = "" Then
        m_SQL = "SELECT * " & _
                "FROM TbRACS ORDER BY RAC;"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbRACS " & _
                "WHERE RAC='" & p_RAC & "' ORDER BY RAC;"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_RAC = New RAC
            For Each m_Campo In m_RAC.ColCampos
                m_RAC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getRACs Is Nothing Then
                Set getRACs = New Scripting.Dictionary
                getRACs.CompareMode = TextCompare
             End If
             If Not getRACs.exists(CStr(m_RAC.IDRAC)) Then
                getRACs.Add CStr(m_RAC.IDRAC), m_RAC
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getRACs ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSuministradores( _
                                    Optional p_CIF As String, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Suministrador As Suministrador
    
    
    On Error GoTo errores
    
    If p_CIF = "" Then
        m_SQL = "SELECT * " & _
                "FROM TbSuministradores ORDER BY Nombre;"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbSuministradores " & _
                "WHERE CIF='" & p_CIF & "' ORDER BY Nombre;"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Suministrador = New Suministrador
            For Each m_Campo In m_Suministrador.ColCampos
                m_Suministrador.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getSuministradores Is Nothing Then
                Set getSuministradores = New Scripting.Dictionary
                getSuministradores.CompareMode = TextCompare
             End If
             If Not getSuministradores.exists(CStr(m_Suministrador.IDSuministrador)) Then
                getSuministradores.Add CStr(m_Suministrador.IDSuministrador), m_Suministrador
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSuministradores ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSuministradoresEnExpedientes( _
                                                Optional p_ID As String, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Suministrador As Suministrador
    
    
    On Error GoTo errores
    
    m_SQL = "SELECT distinct TbSuministradores.* " & _
            "FROM TbSuministradores INNER JOIN TbExpedientesSuministradores " & _
            "ON TbSuministradores.IDSuministrador = TbExpedientesSuministradores.IDSuministrador " & _
            "WHERE (((TbExpedientesSuministradores.IDSuministrador)=" & p_ID & "));"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Suministrador = New Suministrador
            For Each m_Campo In m_Suministrador.ColCampos
                m_Suministrador.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getSuministradoresEnExpedientes Is Nothing Then
                Set getSuministradoresEnExpedientes = New Scripting.Dictionary
                getSuministradoresEnExpedientes.CompareMode = TextCompare
             End If
             If Not getSuministradoresEnExpedientes.exists(CStr(m_Suministrador.IDSuministrador)) Then
                getSuministradoresEnExpedientes.Add CStr(m_Suministrador.IDSuministrador), m_Suministrador
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSuministradoresEnExpedientes ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getCadenaSuministradores( _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Suministrador As String
    'SON LOS QUE HAN FORMADO PARTE DE CONTRATISTA ALGUNA VEZ
    
    On Error GoTo errores
    m_SQL = "SELECT DISTINCT CadenaContratistas " & _
                "FROM TbExpedientesConEntidades " & _
                "WHERE Not CadenaContratistas Is Null;"
   
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            m_Suministrador = .Fields("CadenaContratistas")
             If getCadenaSuministradores Is Nothing Then
                Set getCadenaSuministradores = New Scripting.Dictionary
                getCadenaSuministradores.CompareMode = TextCompare
             End If
             If Not getCadenaSuministradores.exists(m_Suministrador) Then
                getCadenaSuministradores.Add m_Suministrador, m_Suministrador
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getCadenaSuministradores ha devuelto el error: " & Err.Description
    End If
End Function



Public Function getPELCALES( _
                                Optional p_PECAL As String, _
                                Optional ByRef p_Error As String _
                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Pecal As PECAL
    
    
    On Error GoTo errores
    
    If p_PECAL = "" Then
        m_SQL = "SELECT * " & _
                "FROM TbPECAL ORDER BY PECAL;"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbPECAL " & _
                "WHERE PECAL='" & p_PECAL & "' ORDER BY PECAL;"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Pecal = New PECAL
            For Each m_Campo In m_Pecal.ColCampos
                m_Pecal.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getPELCALES Is Nothing Then
                Set getPELCALES = New Scripting.Dictionary
                getPELCALES.CompareMode = TextCompare
             End If
             If Not getPELCALES.exists(CStr(m_Pecal.IDPECAL)) Then
                getPELCALES.Add CStr(m_Pecal.IDPECAL), m_Pecal
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getPELCALES ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getLugaresEjecucion( _
                                        Optional p_LugarEjecucion As String, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_LugarEjecucion As LugarEjecucion
    
    
    On Error GoTo errores
    
    If p_LugarEjecucion = "" Then
        m_SQL = "SELECT * " & _
                "FROM TbLugaresEjecucion ORDER BY LugarEjecucion;"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbLugaresEjecucion " & _
                "WHERE LugarEjecucion='" & p_LugarEjecucion & "' ORDER BY LugarEjecucion;"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_LugarEjecucion = New LugarEjecucion
            For Each m_Campo In m_LugarEjecucion.ColCampos
                m_LugarEjecucion.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getLugaresEjecucion Is Nothing Then
                Set getLugaresEjecucion = New Scripting.Dictionary
                getLugaresEjecucion.CompareMode = TextCompare
             End If
             If Not getLugaresEjecucion.exists(CStr(m_LugarEjecucion.IDLugarEjecucion)) Then
                getLugaresEjecucion.Add CStr(m_LugarEjecucion.IDLugarEjecucion), m_LugarEjecucion
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getLugaresEjecucion ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getOficinasPrograma( _
                                        Optional p_OficinaPrograma As String, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_OficinaPrograma As OficinaPrograma
    
    
    On Error GoTo errores
    
    If p_OficinaPrograma = "" Then
        m_SQL = "SELECT * " & _
                "FROM TbOficinasPrograma;"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbOficinasPrograma " & _
                "WHERE OficinaPrograma='" & p_OficinaPrograma & "';"
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_OficinaPrograma = New OficinaPrograma
            For Each m_Campo In m_OficinaPrograma.ColCampos
                m_OficinaPrograma.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getOficinasPrograma Is Nothing Then
                Set getOficinasPrograma = New Scripting.Dictionary
                getOficinasPrograma.CompareMode = TextCompare
             End If
             If Not getOficinasPrograma.exists(CStr(m_OficinaPrograma.IDOficinaPrograma)) Then
                getOficinasPrograma.Add CStr(m_OficinaPrograma.IDOficinaPrograma), m_OficinaPrograma
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getOficinasPrograma ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedientesConJuridica( _
                                                p_IDJuridica As String, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    
    If p_IDJuridica = "" Then
        Exit Function
    End If
    m_SQL = "SELECT distinct TbExpedientes.* " & _
            "FROM TbExpedientes INNER JOIN TbExpedientesJuridicas " & _
            "ON TbExpedientes.IDExpediente = TbExpedientesJuridicas.IDExpediente " & _
            "WHERE TbExpedientesJuridicas.IDJuridica=" & p_IDJuridica & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesConJuridica Is Nothing Then
                Set getExpedientesConJuridica = New Scripting.Dictionary
                getExpedientesConJuridica.CompareMode = TextCompare
             End If
             If Not getExpedientesConJuridica.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesConJuridica.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesConJuridica ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedientesConEjercito( _
                                            p_IDEjercito As String, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    
    If p_IDEjercito = "" Then
        Exit Function
    End If
    m_SQL = "SELECT distinct * " & _
            "FROM TbExpedientes " & _
            "WHERE IDEjercito=" & p_IDEjercito & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesConEjercito Is Nothing Then
                Set getExpedientesConEjercito = New Scripting.Dictionary
                getExpedientesConEjercito.CompareMode = TextCompare
             End If
             If Not getExpedientesConEjercito.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesConEjercito.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesConEjercito ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientesConJefatura( _
                                            p_IDJefatura As String, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    
    If p_IDJefatura = "" Then
        Exit Function
    End If
    m_SQL = "SELECT distinct TbExpedientes.* " & _
            "FROM TbExpedientes INNER JOIN TbExpedientesJefaturas ON TbExpedientes.IDExpediente = TbExpedientesJefaturas.IDExpediente " & _
            "WHERE TbExpedientesJefaturas.IDJefatura=" & p_IDJefatura & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesConJefatura Is Nothing Then
                Set getExpedientesConJefatura = New Scripting.Dictionary
                getExpedientesConJefatura.CompareMode = TextCompare
             End If
             If Not getExpedientesConJefatura.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesConJefatura.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesConJefatura ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedientesConLugarEjecucion( _
                                                p_IDLugarEjecucion As String, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    
    If p_IDLugarEjecucion = "" Then
        Exit Function
    End If
    m_SQL = "SELECT DISTINCT TbExpedientes.* " & _
            "FROM TbExpedientes INNER JOIN TbExpedientesLugaresEjecucion " & _
            "ON TbExpedientes.IDExpediente = TbExpedientesLugaresEjecucion.IDExpediente " & _
            "WHERE TbExpedientesLugaresEjecucion.IDLugarEjecucion=" & p_IDLugarEjecucion & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesConLugarEjecucion Is Nothing Then
                Set getExpedientesConLugarEjecucion = New Scripting.Dictionary
                getExpedientesConLugarEjecucion.CompareMode = TextCompare
             End If
             If Not getExpedientesConLugarEjecucion.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesConLugarEjecucion.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesConLugarEjecucion ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getOficinaProgramaSEnExpedientes( _
                                                p_IDOficinaPrograma As String, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_OficinaPrograma As OficinaPrograma
    
    
    On Error GoTo errores
    
    If p_IDOficinaPrograma = "" Then
        Exit Function
    End If
    m_SQL = "SELECT DISTINCT TbOficinasPrograma.* " & _
            "FROM TbExpedientes INNER JOIN TbOficinasPrograma " & _
            "ON TbExpedientes.OficinaPrograma = TbOficinasPrograma.OficinaPrograma " & _
            "WHERE TbOficinasPrograma.IDOficinaPrograma=" & p_IDOficinaPrograma & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_OficinaPrograma = New OficinaPrograma
            For Each m_Campo In m_OficinaPrograma.ColCampos
                m_OficinaPrograma.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getOficinaProgramaSEnExpedientes Is Nothing Then
                Set getOficinaProgramaSEnExpedientes = New Scripting.Dictionary
                getOficinaProgramaSEnExpedientes.CompareMode = TextCompare
             End If
             If Not getOficinaProgramaSEnExpedientes.exists(CStr(m_OficinaPrograma.IDOficinaPrograma)) Then
                getOficinaProgramaSEnExpedientes.Add CStr(m_OficinaPrograma.IDOficinaPrograma), m_OficinaPrograma
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getOficinaProgramaSEnExpedientes ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getOrganosContrataciones( _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_OrganoContratacion As OrganoContratacion
    
    
    On Error GoTo errores
    
   
    m_SQL = "SELECT * " & _
            "FROM TbOrganosContratacion;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_OrganoContratacion = New OrganoContratacion
            For Each m_Campo In m_OrganoContratacion.ColCampos
                m_OrganoContratacion.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getOrganosContrataciones Is Nothing Then
                Set getOrganosContrataciones = New Scripting.Dictionary
                getOrganosContrataciones.CompareMode = TextCompare
             End If
             If Not getOrganosContrataciones.exists(CStr(m_OrganoContratacion.IDOrganoContratacion)) Then
                getOrganosContrataciones.Add CStr(m_OrganoContratacion.IDOrganoContratacion), m_OrganoContratacion
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getOrganosContrataciones ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getOrganoContratacioneSEnExpedientes( _
                                                    p_IDOrganoContratacion As String, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_OrganoContratacion As OrganoContratacion
    
    
    On Error GoTo errores
    
    If p_IDOrganoContratacion = "" Then
        Exit Function
    End If
    m_SQL = "SELECT DISTINCT TbOrganosContratacion.* " & _
            "FROM TbExpedientes INNER JOIN TbOrganosContratacion " & _
            "ON TbExpedientes.OrganoContratacion = TbOrganosContratacion.OrganoContratacion " & _
            "WHERE TbOrganosContratacion.IDOrganoContratacion)=" & p_IDOrganoContratacion & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_OrganoContratacion = New OrganoContratacion
            For Each m_Campo In m_OrganoContratacion.ColCampos
                m_OrganoContratacion.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getOrganoContratacioneSEnExpedientes Is Nothing Then
                Set getOrganoContratacioneSEnExpedientes = New Scripting.Dictionary
                getOrganoContratacioneSEnExpedientes.CompareMode = TextCompare
             End If
             If Not getOrganoContratacioneSEnExpedientes.exists(CStr(m_OrganoContratacion.IDOrganoContratacion)) Then
                getOrganoContratacioneSEnExpedientes.Add CStr(m_OrganoContratacion.IDOrganoContratacion), m_OrganoContratacion
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getOrganoContratacioneSEnExpedientes ha devuelto el error: " & Err.Description
    End If
End Function


Public Function getPECALeSEnExpedientes( _
                                        p_IDPEcal As String, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Pecal As PECAL
    
    
    On Error GoTo errores
    
    If p_IDPEcal = "" Then
        Exit Function
    End If
    m_SQL = "SELECT DISTINCT TbPECAL.* " & _
            "FROM TbExpedientesPECAL INNER JOIN TbPECAL ON TbExpedientesPECAL.IDPECAL = TbPECAL.IDPECAL " & _
            "WHERE TbExpedientesPECAL.IDPECAL=" & p_IDPEcal & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Pecal = New PECAL
            For Each m_Campo In m_Pecal.ColCampos
                m_Pecal.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getPECALeSEnExpedientes Is Nothing Then
                Set getPECALeSEnExpedientes = New Scripting.Dictionary
                getPECALeSEnExpedientes.CompareMode = TextCompare
             End If
             If Not getPECALeSEnExpedientes.exists(CStr(m_Pecal.IDPECAL)) Then
                getPECALeSEnExpedientes.Add CStr(m_Pecal.IDPECAL), m_Pecal
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getPECALeSEnExpedientes ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedientesConRAC( _
                                        p_IDRac As String, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    
    If p_IDRac = "" Then
        Exit Function
    End If
    m_SQL = "SELECT DISTINCT TbExpedientes.* " & _
            "FROM TbExpedientes INNER JOIN TbExpedientesRACS ON TbExpedientes.IDExpediente = TbExpedientesRACS.IDExpediente " & _
            "WHERE (((TbExpedientesRACS.IDRAC)=" & p_IDRac & "));"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesConRAC Is Nothing Then
                Set getExpedientesConRAC = New Scripting.Dictionary
                getExpedientesConRAC.CompareMode = TextCompare
             End If
             If Not getExpedientesConRAC.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesConRAC.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesConRAC ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientesConPECAL( _
                                        p_IDPEcal As String, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    
    If p_IDPEcal = "" Then
        Exit Function
    End If
    m_SQL = "SELECT DISTINCT TbExpedientes.* " & _
            "FROM TbExpedientes INNER JOIN TbExpedientesPECAL ON TbExpedientes.IDExpediente = TbExpedientesPECAL.IDExpediente " & _
            "WHERE TbExpedientesPECAL.IDPECAL=" & p_IDPEcal & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesConPECAL Is Nothing Then
                Set getExpedientesConPECAL = New Scripting.Dictionary
                getExpedientesConPECAL.CompareMode = TextCompare
             End If
             If Not getExpedientesConPECAL.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesConPECAL.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesConPECAL ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientesConResponsable( _
                                                p_IDUsuario As String, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    
    If p_IDUsuario = "" Then
        Exit Function
    End If
    m_SQL = "SELECT DISTINCT TbExpedientes.* " & _
            "FROM TbExpedientes INNER JOIN TbExpedientesResponsables ON TbExpedientes.IDExpediente = TbExpedientesResponsables.IdExpediente " & _
            "WHERE TbExpedientesResponsables.IdUsuario=" & p_IDUsuario & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesConResponsable Is Nothing Then
                Set getExpedientesConResponsable = New Scripting.Dictionary
                getExpedientesConResponsable.CompareMode = TextCompare
             End If
             If Not getExpedientesConResponsable.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesConResponsable.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesConResponsable ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientesConCodigoCompra( _
                                                p_ID As String, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    
    If p_ID = "" Then
        Exit Function
    End If
    m_SQL = "SELECT DISTINCT TbExpedientes.* " & _
            "FROM TbExpedientes INNER JOIN TbExpedientesCodigoCompras " & _
            "ON TbExpedientes.IDExpediente = TbExpedientesCodigoCompras.IDExpediente " & _
            "WHERE TbExpedientesCodigoCompras.ID=" & p_ID & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesConCodigoCompra Is Nothing Then
                Set getExpedientesConCodigoCompra = New Scripting.Dictionary
                getExpedientesConCodigoCompra.CompareMode = TextCompare
             End If
             If Not getExpedientesConCodigoCompra.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesConCodigoCompra.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesConCodigoCompra ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientesDerivados( _
                                            p_IDExpediente As String, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
    End If
    
    m_SQL = "SELECT * " & _
            "FROM TbExpedientes " & _
            "WHERE IDExpedientePadre=" & p_IDExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesDerivados Is Nothing Then
                Set getExpedientesDerivados = New Scripting.Dictionary
                getExpedientesDerivados.CompareMode = TextCompare
             End If
             If Not getExpedientesDerivados.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesDerivados.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesDerivados ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedienteAnualidad( _
                                            p_IDAnualidad As String, _
                                            Optional ByRef p_Error As String _
                                            ) As ExpedienteAnualidad
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDAnualidad = "" Then
        Exit Function
    End If
   
    m_SQL = "SELECT * " & _
            "FROM TbExpedientesAnualidades " & _
            "WHERE IDAnualidad=" & p_IDAnualidad & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedienteAnualidad = New ExpedienteAnualidad
        For Each m_Campo In getExpedienteAnualidad.ColCampos
            getExpedienteAnualidad.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteAnualidad ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedienteHito( _
                                    p_IDExpediente As String, _
                                    Optional p_FechaHito As String, _
                                    Optional p_DESCRIPCION As String, _
                                    Optional ByRef p_Error As String _
                                    ) As ExpedienteHito
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Or (p_FechaHito = "" And p_DESCRIPCION = "") Then
        Exit Function
    End If
    If p_FechaHito <> "" Then
         m_SQL = "SELECT * " & _
                "FROM TbExpedientesHitos " & _
                "WHERE IDExpediente=" & p_IDExpediente & " AND FechaHito=#" & Format(p_FechaHito, "mm/dd/yyyy") & "#;"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbExpedientesHitos " & _
                "WHERE IDExpediente=" & p_IDExpediente & " AND DESCRIPCION='" & p_DESCRIPCION & "';"
    End If
   
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedienteHito = New ExpedienteHito
        For Each m_Campo In getExpedienteHito.ColCampos
            getExpedienteHito.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteHito ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedienteAnualidades( _
                                            p_IDExpediente As String, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ExpedienteAnualidad As ExpedienteAnualidad
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
    End If
    m_SQL = "SELECT * " & _
            "FROM TbExpedientesAnualidades " & _
            "WHERE IDExpediente=" & p_IDExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ExpedienteAnualidad = New ExpedienteAnualidad
            For Each m_Campo In m_ExpedienteAnualidad.ColCampos
                m_ExpedienteAnualidad.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedienteAnualidades Is Nothing Then
                Set getExpedienteAnualidades = New Scripting.Dictionary
                getExpedienteAnualidades.CompareMode = TextCompare
             End If
             If Not getExpedienteAnualidades.exists(CStr(m_ExpedienteAnualidad.IDAnualidad)) Then
                getExpedienteAnualidades.Add CStr(m_ExpedienteAnualidad.IDAnualidad), m_ExpedienteAnualidad
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteAnualidades ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedienteResponsable( _
                                            p_IDExpedienteResponsable As String, _
                                            Optional ByRef p_Error As String _
                                            ) As ExpedienteResponsable
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDExpedienteResponsable = "" Then
        Exit Function
    End If
    m_SQL = "SELECT * " & _
            "FROM TbExpedientesResponsables " & _
            "WHERE IDExpedienteResponsable=" & p_IDExpedienteResponsable & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedienteResponsable = New ExpedienteResponsable
        For Each m_Campo In getExpedienteResponsable.ColCampos
            getExpedienteResponsable.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteResponsable ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedienteResponsables( _
                                            p_IDExpediente As String, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ExpedienteResponsable As ExpedienteResponsable
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
    End If
    m_SQL = "SELECT * " & _
            "FROM TbExpedientesResponsables " & _
            "WHERE IDExpediente=" & p_IDExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ExpedienteResponsable = New ExpedienteResponsable
            For Each m_Campo In m_ExpedienteResponsable.ColCampos
                m_ExpedienteResponsable.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedienteResponsables Is Nothing Then
                Set getExpedienteResponsables = New Scripting.Dictionary
                getExpedienteResponsables.CompareMode = TextCompare
             End If
             If Not getExpedienteResponsables.exists(CStr(m_ExpedienteResponsable.IDExpedienteResponsable)) Then
                getExpedienteResponsables.Add CStr(m_ExpedienteResponsable.IDExpedienteResponsable), m_ExpedienteResponsable
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteResponsables ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedienteSuministradores( _
                                            p_IDExpediente As String, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Suministrador As Suministrador
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
    End If
    m_SQL = "SELECT  TbSuministradores.* " & _
            "FROM TbSuministradores INNER JOIN TbExpedientesSuministradores " & _
            "ON TbSuministradores.IDSuministrador = TbExpedientesSuministradores.IDSuministrador " & _
            "WHERE IDExpediente=" & p_IDExpediente & " AND ContratistaPrincipal='No' AND SubContratista='No';"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Suministrador = New Suministrador
            For Each m_Campo In m_Suministrador.ColCampos
                m_Suministrador.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedienteSuministradores Is Nothing Then
                Set getExpedienteSuministradores = New Scripting.Dictionary
                getExpedienteSuministradores.CompareMode = TextCompare
             End If
             If Not getExpedienteSuministradores.exists(CStr(m_Suministrador.IDSuministrador)) Then
                getExpedienteSuministradores.Add CStr(m_Suministrador.IDSuministrador), m_Suministrador
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteSuministradores ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedienteSuministradoresTotal( _
                                            p_IDExpediente As String, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Suministrador As Suministrador
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
    End If
    m_SQL = "SELECT  TbSuministradores.* " & _
            "FROM TbSuministradores INNER JOIN TbExpedientesSuministradores " & _
            "ON TbSuministradores.IDSuministrador = TbExpedientesSuministradores.IDSuministrador " & _
            "WHERE IDExpediente=" & p_IDExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Suministrador = New Suministrador
            For Each m_Campo In m_Suministrador.ColCampos
                m_Suministrador.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedienteSuministradoresTotal Is Nothing Then
                Set getExpedienteSuministradoresTotal = New Scripting.Dictionary
                getExpedienteSuministradoresTotal.CompareMode = TextCompare
             End If
             If Not getExpedienteSuministradoresTotal.exists(CStr(m_Suministrador.IDSuministrador)) Then
                getExpedienteSuministradoresTotal.Add CStr(m_Suministrador.IDSuministrador), m_Suministrador
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteSuministradoresTotal ha devuelto el error: " & Err.Description
    End If
End Function
'Public Function getExpedienteContratistas( _
'                                            p_IDExpediente As String, _
'                                            Optional ByRef p_Error As String _
'                                            ) As Scripting.Dictionary
'    Dim rcdDatos As DAO.Recordset
'    Dim m_SQL As String
'    Dim m_Campo As Variant
'    Dim m_Suministrador As Suministrador
'
'
'    On Error GoTo errores
'
'    If p_IDExpediente = "" Then
'        Exit Function
'    End If
'     m_SQL = "SELECT  TbSuministradores.* " & _
'            "FROM TbSuministradores INNER JOIN TbExpedientesSuministradores " & _
'            "ON TbSuministradores.IDSuministrador = TbExpedientesSuministradores.IDSuministrador " & _
'            "WHERE IDExpediente=" & p_IDExpediente & " AND ContratistaPrincipal='Sí';"
'    Set rcdDatos = getdb().OpenRecordset(m_SQL)
'    With rcdDatos
'        If .EOF Then
'            rcdDatos.Close
'            Set rcdDatos = Nothing
'            Exit Function
'        End If
'        .MoveFirst
'        Do While Not .EOF
'            Set m_Suministrador = New Suministrador
'            For Each m_Campo In m_Suministrador.ColCampos
'                m_Suministrador.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
'                 If p_Error <> "" Then
'                     Err.Raise 1000
'                 End If
'             Next
'             If getExpedienteContratistas Is Nothing Then
'                Set getExpedienteContratistas = New Scripting.Dictionary
'                getExpedienteContratistas.CompareMode = TextCompare
'             End If
'             If Not getExpedienteContratistas.Exists(CStr(m_Suministrador.IDSuministrador)) Then
'                getExpedienteContratistas.Add CStr(m_Suministrador.IDSuministrador), m_Suministrador
'             End If
'            .MoveNext
'        Loop
'
'    End With
'    rcdDatos.Close
'    Set rcdDatos = Nothing
'    Exit Function
'
'errores:
'    If Err.Number <> 1000 Then
'        p_Error = "El método getExpedienteContratistas ha devuelto el error: " & Err.Description
'    End If
'End Function
'Public Function getExpedienteSubContratistas( _
'                                            p_IDExpediente As String, _
'                                            Optional ByRef p_Error As String _
'                                            ) As Scripting.Dictionary
'    Dim rcdDatos As DAO.Recordset
'    Dim m_SQL As String
'    Dim m_Campo As Variant
'    Dim m_Suministrador As Suministrador
'
'
'    On Error GoTo errores
'
'    If p_IDExpediente = "" Then
'        Exit Function
'    End If
'     m_SQL = "SELECT  TbSuministradores.* " & _
'            "FROM TbSuministradores INNER JOIN TbExpedientesSuministradores " & _
'            "ON TbSuministradores.IDSuministrador = TbExpedientesSuministradores.IDSuministrador " & _
'            "WHERE IDExpediente=" & p_IDExpediente & " AND SubContratista='Sí';"
'    Set rcdDatos = getdb().OpenRecordset(m_SQL)
'    With rcdDatos
'        If .EOF Then
'            rcdDatos.Close
'            Set rcdDatos = Nothing
'            Exit Function
'        End If
'        .MoveFirst
'        Do While Not .EOF
'            Set m_Suministrador = New Suministrador
'            For Each m_Campo In m_Suministrador.ColCampos
'                m_Suministrador.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
'                 If p_Error <> "" Then
'                     Err.Raise 1000
'                 End If
'             Next
'             If getExpedienteSubContratistas Is Nothing Then
'                Set getExpedienteSubContratistas = New Scripting.Dictionary
'                getExpedienteSubContratistas.CompareMode = TextCompare
'             End If
'             If Not getExpedienteSubContratistas.Exists(CStr(m_Suministrador.IDSuministrador)) Then
'                getExpedienteSubContratistas.Add CStr(m_Suministrador.IDSuministrador), m_Suministrador
'             End If
'            .MoveNext
'        Loop
'
'    End With
'    rcdDatos.Close
'    Set rcdDatos = Nothing
'    Exit Function
'
'errores:
'    If Err.Number <> 1000 Then
'        p_Error = "El método getExpedienteSubContratistas ha devuelto el error: " & Err.Description
'    End If
'End Function

Public Function getExpedienteCodigoCompra( _
                                            p_ID As String, _
                                            Optional ByRef p_Error As String _
                                            ) As ExpedienteCodigoCompra
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_ID = "" Then
        Exit Function
    End If
    m_SQL = "SELECT * " & _
            "FROM TbExpedientesCodigoCompras " & _
            "WHERE ID=" & p_ID & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedienteCodigoCompra = New ExpedienteCodigoCompra
        For Each m_Campo In getExpedienteCodigoCompra.ColCampos
            getExpedienteCodigoCompra.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteCodigoCompra ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedienteCodigoCompras( _
                                            p_IDExpediente As String, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ExpedienteCodigoCompra As ExpedienteCodigoCompra
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
    End If
    m_SQL = "SELECT * " & _
            "FROM TbExpedientesCodigoCompras " & _
            "WHERE IDExpediente=" & p_IDExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ExpedienteCodigoCompra = New ExpedienteCodigoCompra
            For Each m_Campo In m_ExpedienteCodigoCompra.ColCampos
                m_ExpedienteCodigoCompra.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedienteCodigoCompras Is Nothing Then
                Set getExpedienteCodigoCompras = New Scripting.Dictionary
                getExpedienteCodigoCompras.CompareMode = TextCompare
             End If
             If Not getExpedienteCodigoCompras.exists(CStr(m_ExpedienteCodigoCompra.ID)) Then
                getExpedienteCodigoCompras.Add CStr(m_ExpedienteCodigoCompra.ID), m_ExpedienteCodigoCompra
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteCodigoCompras ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedienteComercial( _
                                            p_IDComercialExpediente As String, _
                                            Optional ByRef p_Error As String _
                                            ) As ExpedienteComercial
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDComercialExpediente = "" Then
        Exit Function
    End If
    m_SQL = "SELECT * " & _
            "FROM TbExpedientesComerciales " & _
            "WHERE IDComercialExpediente=" & p_IDComercialExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedienteComercial = New ExpedienteComercial
        For Each m_Campo In getExpedienteComercial.ColCampos
            getExpedienteComercial.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteComercial ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedienteComerciales( _
                                            p_IDExpediente As String, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Comercial As Comercial
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
        
    End If
    m_SQL = "SELECT TbComerciales.* " & _
            "FROM TbExpedientesComerciales INNER JOIN TbComerciales " & _
            "ON TbExpedientesComerciales.IDComercial = TbComerciales.IDComercial " & _
            "WHERE TbExpedientesComerciales.IDExpediente=" & p_IDExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Comercial = New Comercial
            For Each m_Campo In m_Comercial.ColCampos
                m_Comercial.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedienteComerciales Is Nothing Then
                Set getExpedienteComerciales = New Scripting.Dictionary
                getExpedienteComerciales.CompareMode = TextCompare
             End If
             If Not getExpedienteComerciales.exists(CStr(m_Comercial.IDComercial)) Then
                getExpedienteComerciales.Add CStr(m_Comercial.IDComercial), m_Comercial
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteComerciales ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedienteCPV( _
                                    p_IDCPVExpediente As String, _
                                    Optional ByRef p_Error As String _
                                    ) As ExpedienteCPV
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDCPVExpediente = "" Then
        Exit Function
    End If
    m_SQL = "SELECT * " & _
            "FROM TbExpedientesCPVs " & _
            "WHERE IDCPVExpediente=" & p_IDCPVExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedienteCPV = New ExpedienteCPV
        For Each m_Campo In getExpedienteCPV.ColCampos
            getExpedienteCPV.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteCPV ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedienteCPVS( _
                                    p_IDExpediente As String, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_CPV As CPV
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
    End If
    m_SQL = "SELECT TbCPV.* " & _
                "FROM TbExpedientesCPVs INNER JOIN TbCPV ON TbExpedientesCPVs.IDCPV = TbCPV.IDCPV " & _
                "WHERE TbExpedientesCPVs.IDExpediente=" & p_IDExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_CPV = New CPV
            For Each m_Campo In m_CPV.ColCampos
                m_CPV.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedienteCPVS Is Nothing Then
                Set getExpedienteCPVS = New Scripting.Dictionary
                getExpedienteCPVS.CompareMode = TextCompare
             End If
             If Not getExpedienteCPVS.exists(CStr(m_CPV.IDCPV)) Then
                getExpedienteCPVS.Add CStr(m_CPV.IDCPV), m_CPV
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteCPVS ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedienteDatosGenerales( _
                                            p_IDExpediente As String, _
                                            Optional ByRef p_Error As String _
                                            ) As Expediente
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
    End If
    m_SQL = "SELECT * " & _
            "FROM TbExpedientes " & _
            "WHERE IDExpediente=" & p_IDExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedienteDatosGenerales = New Expediente
        For Each m_Campo In getExpedienteDatosGenerales.ColCampos
            getExpedienteDatosGenerales.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteDatosGenerales ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedienteAnexo( _
                                        Optional p_IDDocumento As String, _
                                        Optional p_IDExpediente As String, _
                                        Optional p_NombreDocumento As String, _
                                        Optional ByRef p_Error As String _
                                        ) As ExpedienteAnexo
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDDocumento = "" And (p_IDExpediente = "" Or p_NombreDocumento = "") Then
        Exit Function
    End If
    If p_IDDocumento <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbExpedientesAnexos " & _
                "WHERE IDDocumento=" & p_IDDocumento & ";"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbExpedientesAnexos " & _
                "WHERE IDExpediente=" & p_IDExpediente & " AND NombreDocumento='" & p_NombreDocumento & "';"
    End If
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedienteAnexo = New ExpedienteAnexo
        For Each m_Campo In getExpedienteAnexo.ColCampos
            getExpedienteAnexo.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteAnexo ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedienteAnexos( _
                                            p_IDExpediente As String, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Anexo As ExpedienteAnexo
    
    
    On Error GoTo errores
    If p_IDExpediente = "" Then
        Exit Function
    End If
     m_SQL = "SELECT * " & _
                "FROM TbExpedientesAnexos " & _
                "WHERE IDExpediente=" & p_IDExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Anexo = New ExpedienteAnexo
            For Each m_Campo In m_Anexo.ColCampos
                m_Anexo.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedienteAnexos Is Nothing Then
                Set getExpedienteAnexos = New Scripting.Dictionary
                getExpedienteAnexos.CompareMode = TextCompare
             End If
             If Not getExpedienteAnexos.exists(CStr(m_Anexo.IDDocumento)) Then
                getExpedienteAnexos.Add CStr(m_Anexo.IDDocumento), m_Anexo
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteAnexos ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientePECAL( _
                                    p_IDPECALExpediente As String, _
                                    Optional ByRef p_Error As String _
                                    ) As ExpedientePECAL
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDPECALExpediente = "" Then
        Exit Function
    End If
    m_SQL = "SELECT * " & _
            "FROM TbExpedientesPECAL " & _
            "WHERE IDPECALExpediente=" & p_IDPECALExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedientePECAL = New ExpedientePECAL
        For Each m_Campo In getExpedientePECAL.ColCampos
            getExpedientePECAL.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientePECAL ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedienteAGEDYS( _
                                    Optional p_IDExpedienteAGEDYS As String, _
                                    Optional p_IDExpediente As String, _
                                    Optional ByRef p_Error As String _
                                    ) As ExpedienteAGEDYS
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDExpedienteAGEDYS = "" And p_IDExpediente = "" Then
        Exit Function
    End If
    If p_IDExpedienteAGEDYS <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbExpedientesDatosAGEDYS " & _
                "WHERE IDExpedienteAGEDYS=" & p_IDExpedienteAGEDYS & ";"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbExpedientesDatosAGEDYS " & _
                "WHERE IDExpediente=" & p_IDExpediente & ";"
    End If
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedienteAGEDYS = New ExpedienteAGEDYS
        For Each m_Campo In getExpedienteAGEDYS.ColCampos
            getExpedienteAGEDYS.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteAGEDYS ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientePECALES( _
                                    p_IDExpediente As String, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Pecal As PECAL
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
    End If
    m_SQL = "SELECT TbPECAL.* " & _
            "FROM TbExpedientesPECAL INNER JOIN TbPECAL ON TbExpedientesPECAL.IDPECAL = TbPECAL.IDPECAL " & _
            "WHERE TbExpedientesPECAL.IDExpediente=" & p_IDExpediente & ";"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Pecal = New PECAL
            For Each m_Campo In m_Pecal.ColCampos
                m_Pecal.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientePECALES Is Nothing Then
                Set getExpedientePECALES = New Scripting.Dictionary
                getExpedientePECALES.CompareMode = TextCompare
             End If
             If Not getExpedientePECALES.exists(CStr(m_Pecal.IDPECAL)) Then
                getExpedientePECALES.Add CStr(m_Pecal.IDPECAL), m_Pecal
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientePECALES ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedienteRAC( _
                                    p_IDRACExpediente As String, _
                                    Optional ByRef p_Error As String _
                                    ) As ExpedienteRAC
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDRACExpediente = "" Then
        Exit Function
    End If
    m_SQL = "SELECT * " & _
            "FROM TbExpedientesRACS " & _
            "WHERE IDRacExpediente=" & p_IDRACExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedienteRAC = New ExpedienteRAC
        For Each m_Campo In getExpedienteRAC.ColCampos
            getExpedienteRAC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteRAC ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedienteRACS( _
                                    p_IDExpediente As String, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_RAC As RAC
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
       Exit Function
    End If
    m_SQL = "SELECT TbRACS.* " & _
                "FROM TbExpedientesRACS INNER JOIN TbRACS ON TbExpedientesRACS.IDRAC = TbRACS.IDRAC " & _
                "WHERE TbExpedientesRACS.IDExpediente=" & p_IDExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_RAC = New RAC
            For Each m_Campo In m_RAC.ColCampos
                m_RAC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedienteRACS Is Nothing Then
                Set getExpedienteRACS = New Scripting.Dictionary
                getExpedienteRACS.CompareMode = TextCompare
             End If
             If Not getExpedienteRACS.exists(CStr(m_RAC.IDRAC)) Then
                getExpedienteRACS.Add CStr(m_RAC.IDRAC), m_RAC
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteRACS ha devuelto el error: " & Err.Description
    End If
End Function


Public Function getCambioPorID( _
                                p_IDCambio As String, _
                                Optional ByRef p_Error As String _
                                ) As Cambio
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDCambio = "" Then
        Exit Function
    End If
     m_SQL = "SELECT * " & _
            "FROM TbCambios " & _
            "WHERE IDCambio=" & p_IDCambio & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getCambioPorID = New Cambio
        For Each m_Campo In getCambioPorID.ColCampos
            getCambioPorID.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getCambioPorID ha devuelto el error: " & Err.Description
    End If
End Function
'Public Function getCambiosEnRegistroPorTabla( _
'                                                p_TipoObjeto As EnumObjetos, _
'                                                p_ValorID1 As String, _
'                                                Optional p_ValorID2 As String, _
'                                                Optional ByRef p_Error As String _
'                                                ) As Scripting.Dictionary
'    Dim rcdDatos As DAO.Recordset
'    Dim m_SQL As String
'    Dim m_Campo As Variant
'
'
'
'    On Error GoTo errores
'
'    If p_IDCambio = "" Then
'        Exit Function
'    End If
'     m_SQL = "SELECT * " & _
'            "FROM TbCambios " & _
'            "WHERE IDCambio=" & p_IDCambio & ";"
'    Set rcdDatos = getdb().OpenRecordset(m_SQL)
'    With rcdDatos
'        If .EOF Then
'            rcdDatos.Close
'            Set rcdDatos = Nothing
'            Exit Function
'        End If
'        Set getCambiosEnRegistroPorTabla = New Cambio
'        For Each m_Campo In getCambiosEnRegistroPorTabla.ColCampos
'            getCambiosEnRegistroPorTabla.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
'             If p_Error <> "" Then
'                 Err.Raise 1000
'             End If
'         Next
'    End With
'    rcdDatos.Close
'    Set rcdDatos = Nothing
'    Exit Function
'
'errores:
'    If Err.Number <> 1000 Then
'        p_Error = "El método getCambiosEnRegistroPorTabla ha devuelto el error: " & Err.Description
'    End If
'End Function
'
'Public Function getCambiosAltaEnExpediente( _
'                                                p_IDExpediente As String, _
'                                                Optional ByRef p_Error As String _
'                                                ) As Scripting.Dictionary
'    Dim rcdDatos As DAO.Recordset
'    Dim m_SQL As String
'    Dim m_Campo As Variant
'    Dim m_Cambio As Cambio
'    Dim m_nombreTabla As String
'    Dim m_NombreCampoID As String
'
'    Dim m_Accion As String
'
'    On Error GoTo errores
'
'    If p_IDExpediente = "" Then
'        Exit Function
'    End If
'    m_nombreTabla = "TbExpedientes"
'    m_NombreCampoID = "IDExpediente"
'    m_Accion = "Alta"
'
'     m_SQL = "SELECT * " & _
'            "FROM TbCambios " & _
'            "WHERE NombreTabla='" & m_nombreTabla & "' " & _
'            "AND NombreCampoID='" & m_NombreCampoID & "' " & _
'            "AND ValorCampoID=" & p_IDExpediente & " " & _
'            "AND Accion='" & m_Accion & "' " & _
'            "; "
'    Set rcdDatos = getdb().OpenRecordset(m_SQL)
'    With rcdDatos
'        If .EOF Then
'            rcdDatos.Close
'            Set rcdDatos = Nothing
'            Exit Function
'        End If
'        Set m_Cambio = New Cambio
'        For Each m_Campo In m_Cambio.ColCampos
'            m_Cambio.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
'             If p_Error <> "" Then
'                 Err.Raise 1000
'             End If
'         Next
'
'         Set m_Cambio = Nothing
'    End With
'    rcdDatos.Close
'    Set rcdDatos = Nothing
'    Exit Function
'
'errores:
'    If Err.Number <> 1000 Then
'        p_Error = "El método getCambiosAltaEnExpediente ha devuelto el error: " & Err.Description
'    End If
'End Function

Public Function getMostrarEstado( _
                                p_UsuarioRed As String, _
                                Optional ByRef p_Error As String _
                                ) As MostrarEstado
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_UsuarioRed = "" Then
        Exit Function
    End If
     m_SQL = "SELECT * " & _
                "FROM TbConfMostrarEstado " & _
                "WHERE UsuarioRed='" & p_UsuarioRed & "';"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getMostrarEstado = New MostrarEstado
        For Each m_Campo In getMostrarEstado.ColCampos
            getMostrarEstado.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getMostrarEstado ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getGestionRiesgos( _
                                    p_IDProyecto As String, _
                                    Optional ByRef p_Error As String _
                                    ) As GestionRiesgos
    
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    On Error GoTo errores
    
    If p_IDProyecto = "" Then
       Exit Function
    End If
    m_SQL = "SELECT * " & _
            "FROM TbProyectos " & _
            "WHERE IDProyecto=" & p_IDProyecto & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getGestionRiesgos = New GestionRiesgos
        For Each m_Campo In getGestionRiesgos.ColCampos
            getGestionRiesgos.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "EL método constructor.getGestionRiesgos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function getGestionRiesgosPorExpediente( _
                                                p_IDExpediente As String, _
                                                Optional ByRef p_Error As String _
                                                ) As GestionRiesgos
    
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        p_Error = "Falta la p_IDExpediente"
        Err.Raise 1000
    End If
    m_SQL = "SELECT * " & _
            "FROM TbProyectos " & _
            "WHERE IDExpediente=" & p_IDExpediente & ";"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getGestionRiesgosPorExpediente = New GestionRiesgos
        For Each m_Campo In getGestionRiesgosPorExpediente.ColCampos
            getGestionRiesgosPorExpediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "EL método constructor.getGestionRiesgosPorExpediente ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function getSuministradoresBusqueda( _
                                                Optional p_PalabraClave As String, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Suministrador As Suministrador
    
    On Error GoTo errores
    m_SQL = "SELECT * " & _
            "FROM TbSuministradores " & _
            "WHERE Nombre Like '" & p_PalabraClave & "*' " & _
            "OR Nemotecnico Like '*" & p_PalabraClave & "*' " & _
            "OR CIF Like '*" & p_PalabraClave & "*';"
       
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            .MoveFirst
            Do While Not .EOF
                Set m_Suministrador = New Suministrador
                For Each m_Campo In m_Suministrador.ColCampos
                    m_Suministrador.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                    If p_Error <> "" Then
                        Err.Raise 1000
                    End If
                Next
                

                If getSuministradoresBusqueda Is Nothing Then
                    Set getSuministradoresBusqueda = New Scripting.Dictionary
                    getSuministradoresBusqueda.CompareMode = TextCompare
                End If
                If Not getSuministradoresBusqueda.exists(CStr(m_Suministrador.IDSuministrador)) Then
                    getSuministradoresBusqueda.Add CStr(m_Suministrador.IDSuministrador), m_Suministrador
                End If
siguiente:
                .MoveNext
            Loop
        End If
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSuministradoresBusqueda ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSuministrador( _
                                Optional p_IDSuministrador As String, _
                                Optional p_CIF As String, _
                                Optional p_Nombre As String, _
                                Optional p_Nemotecnico As String, _
                                Optional ByRef p_Error As String _
                                ) As Suministrador
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDSuministrador = "" And p_CIF = "" And p_Nombre = "" And p_Nemotecnico = "" Then
        Exit Function
    End If
    
    
    If p_IDSuministrador <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbSuministradores " & _
                "WHERE IDSuministrador=" & p_IDSuministrador & ";"
    ElseIf p_CIF <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbSuministradores " & _
                "WHERE CIF='" & p_CIF & "';"
    ElseIf p_Nombre <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbSuministradores " & _
                "WHERE Nombre='" & p_Nombre & "';"
    ElseIf p_Nemotecnico <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbSuministradores " & _
                "WHERE Nemotecnico='" & p_Nemotecnico & "';"
    
    End If
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getSuministrador = New Suministrador
        For Each m_Campo In getSuministrador.ColCampos
            getSuministrador.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSuministrador ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedienteModificado( _
                                        Optional p_IDExpedienteModificado As String, _
                                        Optional p_IDExpediente As String, _
                                        Optional p_FechaFirmaModificado As String, _
                                        Optional p_DESCRIPCION As String, _
                                        Optional ByRef p_Error As String _
                                         ) As ExpedienteModificado
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    If p_IDExpedienteModificado = "" Then
        
        If p_IDExpediente = "" And p_FechaFirmaModificado = "" And p_DESCRIPCION = "" Then
            Exit Function
        End If
    End If
    If p_IDExpedienteModificado <> "" Then
         m_SQL = "SELECT * " & _
                "FROM TbExpedientesModificados " & _
                "WHERE IDExpedienteModificado=" & p_IDExpedienteModificado & ";"
    Else
        If p_FechaFirmaModificado <> "" Then
             m_SQL = "SELECT * " & _
                    "FROM TbExpedientesModificados " & _
                    "WHERE IDExpediente=" & p_IDExpediente & " AND FechaFirmaModificado=#" & Format(p_FechaFirmaModificado, "mm/dd/yyyy") & "#;"
        Else
            m_SQL = "SELECT * " & _
                    "FROM TbExpedientesModificados " & _
                    "WHERE IDExpediente=" & p_IDExpediente & " AND DESCRIPCION='" & p_DESCRIPCION & "';"
        End If
    End If
    
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedienteModificado = New ExpedienteModificado
        For Each m_Campo In getExpedienteModificado.ColCampos
            'If CStr(m_Campo) = "TipoInforme" Then Stop
            getExpedienteModificado.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
             If p_Error <> "" Then
                 Err.Raise 1000
             End If
         Next
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteModificado ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getExpedienteModificados( _
                                            p_IDExpediente As String, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ExpedienteModificado As ExpedienteModificado
    
    
    On Error GoTo errores
    m_SQL = "SELECT * " & _
                "FROM TbExpedientesModificados " & _
                "WHERE IDExpediente=" & p_IDExpediente & ";"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ExpedienteModificado = New ExpedienteModificado
            For Each m_Campo In m_ExpedienteModificado.ColCampos
                m_ExpedienteModificado.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedienteModificados Is Nothing Then
                Set getExpedienteModificados = New Scripting.Dictionary
                getExpedienteModificados.CompareMode = TextCompare
             End If
             If Not getExpedienteModificados.exists(CStr(m_ExpedienteModificado.IDExpedienteModificado)) Then
                getExpedienteModificados.Add CStr(m_ExpedienteModificado.IDExpedienteModificado), m_ExpedienteModificado
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteModificados ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientesConResponsableSeguridad( _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    m_SQL = "SELECT TbExpedientes.* " & _
            "FROM TbExpedientes INNER JOIN TbUsuariosAplicaciones " & _
            "ON TbExpedientes.IDResponsableSeguridad = TbUsuariosAplicaciones.Id;"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_expediente = New Expediente
            For Each m_Campo In m_expediente.ColCampos
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesConResponsableSeguridad Is Nothing Then
                Set getExpedientesConResponsableSeguridad = New Scripting.Dictionary
                getExpedientesConResponsableSeguridad.CompareMode = TextCompare
             End If
             If Not getExpedientesConResponsableSeguridad.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesConResponsableSeguridad.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesConResponsableSeguridad ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSuministradoresFiltrados( _
    Optional p_Texto As String, _
    Optional p_SoloPropias As Boolean, _
    Optional ByRef p_Error As String) As Scripting.Dictionary
    
    Dim rs As DAO.Recordset
    Dim m_SQL As String
    Dim sSum As Suministrador
    Dim dict As New Scripting.Dictionary
    
    On Error GoTo errores
    
    m_SQL = "SELECT * FROM TbSuministradores WHERE 1=1 "
    
    ' Filtro de texto (Nombre, CIF o Nemotécnico)
    If p_Texto <> "" Then
        m_SQL = m_SQL & " AND (Nombre LIKE '*" & p_Texto & "*' OR CIF LIKE '*" & p_Texto & "*' OR Nemotecnico LIKE '*" & p_Texto & "*')"
    End If
    
    ' Filtro de Consorcio
    If p_SoloPropias Then
        m_SQL = m_SQL & " AND (ConsorcioPropio = 'Sí')"
    End If
    
    m_SQL = m_SQL & " ORDER BY Nombre;"
    
    Set rs = getdb().OpenRecordset(m_SQL, dbOpenSnapshot)
    
    If Not rs.EOF Then
        Do While Not rs.EOF
            Set sSum = New Suministrador
            ' Hidratación rápida manual para no sobrecargar el constructor genérico en bucles grandes
            sSum.IDSuministrador = Nz(rs!IDSuministrador, "")
            sSum.Nombre = Nz(rs!Nombre, "")
            sSum.Nemotecnico = Nz(rs!Nemotecnico, "")
            sSum.CIF = Nz(rs!CIF, "")
            ' ... resto de campos si los necesitas para visualizar ...
            
            dict.Add CStr(sSum.IDSuministrador), sSum
            rs.MoveNext
        Loop
    End If
    
    rs.Close
    Set getSuministradoresFiltrados = dict
    Exit Function
errores:
    p_Error = Err.Description
End Function


