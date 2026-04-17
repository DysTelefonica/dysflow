Attribute VB_Name = "constructor"
Option Compare Database
Option Explicit
Public Function getRiesgosNC(p_IDNC As Long, Optional ByRef p_Error As String) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Riesgo As riesgo
    Dim m_Col As Scripting.Dictionary
    
    On Error GoTo errores
    Set m_Col = New Scripting.Dictionary
    m_Col.CompareMode = TextCompare
    
    ' Consulta de unión entre la tabla de enlace y el catálogo de riesgos [cite: 7, 8]
    m_SQL = "SELECT TbRiesgos.* " & _
            "FROM TbRiesgos INNER JOIN TbRiesgosNC ON TbRiesgos.IDRiesgo = TbRiesgosNC.IDRiesgo " & _
            "WHERE TbRiesgosNC.IDNoConformidad = " & p_IDNC & ";"
            
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    
    Do While Not rcdDatos.EOF
        Set m_Riesgo = New riesgo
        ' Mapeo de campos estándar del dominio Riesgo [cite: 5, 8]
        m_Riesgo.idRiesgo = rcdDatos!idRiesgo
        m_Riesgo.CodigoRiesgo = Nz(rcdDatos!CodigoRiesgo, "")
        m_Riesgo.Descripcion = Nz(rcdDatos!Descripcion, "")
        m_Riesgo.Estado = Nz(rcdDatos!Estado, "")
        
        m_Col.Add CStr(m_Riesgo.idRiesgo), m_Riesgo
        rcdDatos.MoveNext
    Loop
    
    Set getRiesgosNC = m_Col
    rcdDatos.Close
    Exit Function

errores:
    p_Error = "Error en constructor.getRiesgosNC: " & Err.Description
    Set getRiesgosNC = New Scripting.Dictionary
End Function
Public Function getUsuariosTecnicos( _
                                        Optional p_Activos As EnumSino = EnumSino.Sí, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Usuario As usuario
    
    
    On Error GoTo errores
    If p_Activos = EnumSino.Sí Then
        m_SQL = "SELECT * " & _
                "FROM TbUsuariosAplicaciones " & _
                "WHERE FechaBaja Is Null ORDER BY Nombre;"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbUsuariosAplicaciones " & _
                "ORDER BY Nombre;"
    End If
    
    Set rcdDatos = getdbLanzadera().OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            .MoveFirst
            Do While Not .EOF
                Set m_Usuario = New usuario
                For Each m_Campo In m_Usuario.ColCampos
                    m_Usuario.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                     If p_Error <> "" Then
                         Err.Raise 1000
                     End If
                 Next
                 If getUsuariosTecnicos Is Nothing Then
                    Set getUsuariosTecnicos = New Scripting.Dictionary
                    getUsuariosTecnicos.CompareMode = TextCompare
                 End If
                 If Not getUsuariosTecnicos.Exists(m_Usuario.id) Then
                    getUsuariosTecnicos.Add m_Usuario.id, m_Usuario
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

Public Function getUsuarioConectadoPorMaquina( _
                                                Optional ByRef p_Error As String _
                                                ) As usuario
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
                            ) As usuario

    Dim rcdDatos As DAO.Recordset
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
    Set rcdDatos = getdbLanzadera().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            Exit Function
            rcdDatos.Close
            Set rcdDatos = Nothing
        End If
        Set getUsuario = New usuario
        For Each m_Campo In getUsuario.ColCampos
            getUsuario.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
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
    Dim m_Campo As Variant
    Dim m_SQL As String
    Dim m_ObjUsuarioAplicacionPermisos As UsuarioAplicacionPermisos
            
    On Error GoTo errores
    If p_CorreoUsuario = "" Then
        Exit Function
    End If
    m_SQL = "SELECT TbUsuariosAplicacionesPermisos.* " & _
            "FROM TbUsuariosAplicacionesPermisos " & _
            "WHERE CorreoUsuario='" & p_CorreoUsuario & "';"
    Set rcdDatos = getdbLanzadera().OpenRecordset(m_SQL)
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
                m_ObjUsuarioAplicacionPermisos.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            
            If getAplicacionesPermisos Is Nothing Then
                Set getAplicacionesPermisos = New Scripting.Dictionary
                getAplicacionesPermisos.CompareMode = TextCompare
            End If
            If Not getAplicacionesPermisos.Exists(CStr(m_ObjUsuarioAplicacionPermisos.IDAplicacion)) Then
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

Public Function getDocumentosAyuda(Optional ByRef p_Error As String) As Scripting.Dictionary
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
       
    On Error GoTo errores
    
    m_SQL = "TbHerramientaDocAyuda"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            If getDocumentosAyuda Is Nothing Then
                Set getDocumentosAyuda = New Scripting.Dictionary
                getDocumentosAyuda.CompareMode = TextCompare
            End If
            If Not getDocumentosAyuda.Exists(.Fields("NombreFormulario").Value) Then
                getDocumentosAyuda.Add .Fields("NombreFormulario").Value, .Fields("NombreArchivoAyuda").Value
            End If
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getDocumentosAyuda ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
End Function

Public Function getListaUsuarios( _
                                    p_Tipo As EnumTipoUsuario, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ObjUsuario As usuario
    Dim m_NombreCampo As String
    Dim m_Where As String
    Dim m_Particula As String
    Dim m_SQLInicial As String
    On Error GoTo errores
    
    m_SQLInicial = "SELECT TbUsuariosAplicaciones.* " & _
                    "FROM TbUsuariosAplicaciones INNER JOIN TbUsuariosAplicacionesPermisos ON " & _
                    "TbUsuariosAplicaciones.CorreoUsuario = TbUsuariosAplicacionesPermisos.CorreoUsuario "
    
    
    If p_Tipo = EnumTipoUsuario.Administrador Then
        m_Particula = "EsUsuarioAdministrador='Sí'"
    ElseIf p_Tipo = EnumTipoUsuario.Calidad Then
        m_Particula = "EsUsuarioCalidad='Sí'"
    ElseIf p_Tipo = EnumTipoUsuario.Economia Then
        m_Particula = "EsUsuarioEconomia='Sí'"
    ElseIf p_Tipo = EnumTipoUsuario.Secretaria Then
        m_Particula = "EsUsuarioSecretaria='Sí'"
    Else
        Exit Function
    End If
    m_Where = "WHERE " & _
            "Activado=True AND " & _
            "TbUsuariosAplicacionesPermisos.IDAplicacion=" & IDAplicacion & " AND " & _
            m_Particula & ";"
    m_SQL = m_SQLInicial & m_Where
    Set rcdDatos = getdbLanzadera().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ObjUsuario = New usuario
            For Each m_Campo In m_ObjUsuario.ColCampos
                m_ObjUsuario.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next

            
            If getListaUsuarios Is Nothing Then
                Set getListaUsuarios = New Scripting.Dictionary
                getListaUsuarios.CompareMode = TextCompare
            End If
            If Not getListaUsuarios.Exists(CStr(m_ObjUsuario.UsuarioRed)) Then
                getListaUsuarios.Add CStr(m_ObjUsuario.UsuarioRed), m_ObjUsuario
            End If
            Set m_ObjUsuario = Nothing
            .MoveNext
        Loop
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getListaUsuarios ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getUsuariosCalidad( _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ObjUsuario As usuario
    Dim m_NombreCampo As String
    Dim m_Where As String
    Dim m_Particula As String
    Dim m_SQLInicial As String
    On Error GoTo errores
    
    
    m_SQL = "SELECT TbUsuariosAplicaciones.* " & _
            "FROM TbUsuariosAplicaciones INNER JOIN TbUsuariosAplicacionesPermisos " & _
            "ON TbUsuariosAplicaciones.CorreoUsuario = TbUsuariosAplicacionesPermisos.CorreoUsuario " & _
            "WHERE (((TbUsuariosAplicacionesPermisos.IDAplicacion)=" & IDAplicacion & _
            ") AND ((TbUsuariosAplicacionesPermisos.EsUsuarioCalidad)='Sí'));"
    Set rcdDatos = getdbLanzadera().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ObjUsuario = New usuario
            For Each m_Campo In m_ObjUsuario.ColCampos
                m_ObjUsuario.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            
            
            If getUsuariosCalidad Is Nothing Then
                Set getUsuariosCalidad = New Scripting.Dictionary
                getUsuariosCalidad.CompareMode = TextCompare
            End If
            If Not getUsuariosCalidad.Exists(CStr(m_ObjUsuario.UsuarioRed)) Then
                getUsuariosCalidad.Add CStr(m_ObjUsuario.UsuarioRed), m_ObjUsuario
            End If
            Set m_ObjUsuario = Nothing
            .MoveNext
        Loop
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getUsuariosCalidad ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getNCProyecto( _
                                Optional p_IDNC As String, _
                                Optional p_IDAC As String, _
                                Optional p_Db As DAO.Database, _
                                Optional ByRef p_Error As String _
                                ) As NCProyecto

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
        
    
    On Error GoTo errores
    If p_IDNC = "" And p_IDAC = "" Then
        Exit Function
    End If
    ' --- INICIO INTEGRACIÓN CACHÉ (FASE 1) ---
    ' Intentamos carga desde caché si tenemos IDNC y no se especifica una DB externa
    If p_IDNC <> "" And p_Db Is Nothing Then
        If AplicarCache Then
            Set getNCProyecto = CacheNCProyecto.ObtenerNCConCache(p_IDNC, False, p_Error)
            If Not getNCProyecto Is Nothing Then
                Exit Function
            End If
            ' Si no se obtiene nada (error o no existe), limpiamos error y fallback a BD
            p_Error = ""
        End If
    End If
    ' --- FIN INTEGRACIÓN CACHÉ ---
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    If p_IDNC <> "" Then
         m_SQL = "SELECT * FROM " & _
            "TbNoConformidades " & _
            "WHERE IDNoConformidad=" & p_IDNC & ";"
    Else
        m_SQL = "SELECT TbNoConformidades.* " & _
                "FROM TbNoConformidades INNER JOIN TbNCAccionCorrectivas " & _
                "ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad " & _
                "WHERE (((TbNCAccionCorrectivas.IDAccionCorrectiva)=" & p_IDAC & "));"
    End If
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
       Set getNCProyecto = New NCProyecto
        For Each m_Campo In getNCProyecto.ColCampos
            getNCProyecto.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
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
        p_Error = "El método getNCProyecto ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getDocumentoProyecto( _
                                    Optional p_IDDocumento As String, _
                                    Optional p_NombreDoc As String, _
                                    Optional p_IDNC As String, _
                                    Optional p_IDNCResultante As String, _
                                    Optional p_Db As DAO.Database, _
                                    Optional ByRef p_Error As String _
                                    ) As DocumentoProyecto

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    On Error GoTo errores
    If p_IDDocumento = "" And p_NombreDoc = "" And p_IDNC = "" And p_IDNCResultante = "" Then
        Exit Function
    End If
    If p_IDDocumento = "" And p_IDNCResultante = "" Then
        If p_NombreDoc = "" Or p_IDNC = "" Then
            Exit Function
        End If
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    If p_IDNCResultante <> "" Then
         m_SQL = "SELECT * FROM " & _
                    "TbNCDocumentos " & _
                    "WHERE IDDocumento=" & p_IDNCResultante & ";"
    Else
        If p_IDDocumento <> "" Then
             m_SQL = "SELECT * FROM " & _
                    "TbNCDocumentos " & _
                    "WHERE IDDocumento=" & p_IDDocumento & ";"
        Else
             m_SQL = "SELECT * FROM " & _
                    "TbNCDocumentos " & _
                    "WHERE IDNoConformidad=" & p_IDNC & " AND Documento='" & p_NombreDoc & "' ;"
        End If
    End If
    
   
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getDocumentoProyecto = New DocumentoProyecto
        For Each m_Campo In getDocumentoProyecto.ColCampos
            getDocumentoProyecto.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
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
        p_Error = "El método getDocumentoProyecto ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getDocumentoAuditoria( _
                                    Optional p_IDDocumento As String, _
                                    Optional p_IDAuditoria As String, _
                                    Optional p_NombreDoc As String, _
                                    Optional p_Db As DAO.Database, _
                                    Optional ByRef p_Error As String _
                                    ) As DocumentoAuditoria

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    On Error GoTo errores
    If p_IDDocumento = "" And p_NombreDoc = "" And p_IDAuditoria = "" Then
        Exit Function
    End If
    If p_IDDocumento = "" Then
        If p_NombreDoc = "" Or p_IDAuditoria = "" Then
            Exit Function
        End If
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    If p_IDDocumento <> "" Then
         m_SQL = "SELECT * FROM " & _
                "TbDocumentosAuditorias " & _
                "WHERE IDDocumento=" & p_IDDocumento & ";"
    Else
         m_SQL = "SELECT * FROM " & _
                "TbDocumentosAuditorias " & _
                "WHERE Documento='" & p_NombreDoc & "' AND IDAuditoriaResultante=" & p_IDAuditoria & ";"
    End If
   
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getDocumentoAuditoria = New DocumentoAuditoria
        For Each m_Campo In getDocumentoAuditoria.ColCampos
            getDocumentoAuditoria.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
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
        p_Error = "El método getDocumentoAuditoria ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getDocumentosProyecto( _
                                        Optional p_IDNC As String, _
                                        Optional p_IDAR As String, _
                                        Optional p_Db As DAO.Database, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Documento As DocumentoProyecto
    
    On Error GoTo errores
    If p_IDNC = "" And p_IDAR = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    If p_IDNC <> "" Then
        m_SQL = "SELECT * FROM " & _
                "TbNCDocumentos " & _
                "WHERE IDNoConformidad=" & p_IDNC & ";"
    Else
        m_SQL = "SELECT * FROM " & _
                "TbNCDocumentos " & _
                "WHERE IDAccionRealizada=" & p_IDAR & ";"
    End If
    
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Documento = New DocumentoProyecto
            For Each m_Campo In m_Documento.ColCampos
                m_Documento.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getDocumentosProyecto Is Nothing Then
                Set getDocumentosProyecto = New Scripting.Dictionary
                getDocumentosProyecto.CompareMode = TextCompare
            End If
            If Not getDocumentosProyecto.Exists(CStr(m_Documento.IDDocumento)) Then
                getDocumentosProyecto.Add CStr(m_Documento.IDDocumento), m_Documento
            End If
            Set m_Documento = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getDocumentosProyecto ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getDocumentosCompletosProyecto( _
                                                Optional p_IDNC As String, _
                                                Optional p_Db As DAO.Database, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Documento As DocumentoProyecto
    
    On Error GoTo errores
    If p_IDNC = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * FROM " & _
            "TbNCDocumentos " & _
            "WHERE IDNoConformidad=" & p_IDNC & ";"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            .MoveFirst
            Do While Not .EOF
                Set m_Documento = New DocumentoProyecto
                For Each m_Campo In m_Documento.ColCampos
                    m_Documento.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                    If p_Error <> "" Then
                        Err.Raise 1000
                    End If
                Next
                If getDocumentosCompletosProyecto Is Nothing Then
                    Set getDocumentosCompletosProyecto = New Scripting.Dictionary
                    getDocumentosCompletosProyecto.CompareMode = TextCompare
                End If
                If Not getDocumentosCompletosProyecto.Exists(CStr(m_Documento.IDDocumento)) Then
                    getDocumentosCompletosProyecto.Add CStr(m_Documento.IDDocumento), m_Documento
                End If
                Set m_Documento = Nothing
                .MoveNext
            Loop
        End If
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    'parte de las tareas
    m_SQL = "SELECT TbNCDocumentos.* " & _
            "FROM (TbNCAccionCorrectivas INNER JOIN TbNCAccionesRealizadas " & _
            "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva) " & _
            "INNER JOIN TbNCDocumentos ON TbNCAccionesRealizadas.IDAccionRealizada = TbNCDocumentos.IDAccionRealizada " & _
            "WHERE (((TbNCAccionCorrectivas.IDNoConformidad)=" & p_IDNC & "));"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            .MoveFirst
            Do While Not .EOF
                Set m_Documento = New DocumentoProyecto
                For Each m_Campo In m_Documento.ColCampos
                    m_Documento.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                    If p_Error <> "" Then
                        Err.Raise 1000
                    End If
                Next
                If getDocumentosCompletosProyecto Is Nothing Then
                    Set getDocumentosCompletosProyecto = New Scripting.Dictionary
                    getDocumentosCompletosProyecto.CompareMode = TextCompare
                End If
                If Not getDocumentosCompletosProyecto.Exists(CStr(m_Documento.IDDocumento)) Then
                    getDocumentosCompletosProyecto.Add CStr(m_Documento.IDDocumento), m_Documento
                End If
                Set m_Documento = Nothing
                .MoveNext
            Loop
        End If
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getDocumentosCompletosProyecto ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getACProyecto( _
                        Optional p_IDAC As String, _
                        Optional p_Db As DAO.Database, _
                        Optional ByRef p_Error As String _
                        ) As ACProyecto

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
        
    
    On Error GoTo errores
    If p_IDAC = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * FROM " & _
            "TbNCAccionCorrectivas " & _
            "WHERE IDAccionCorrectiva=" & p_IDAC & ";"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
       Set getACProyecto = New ACProyecto
        For Each m_Campo In getACProyecto.ColCampos
            getACProyecto.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
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
        p_Error = "El método getACProyecto ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getACsProyecto( _
                                Optional p_IDNC As String, _
                                Optional p_EnumOrden As EnumOrden, _
                                Optional p_Db As DAO.Database, _
                                Optional ByRef p_Error As String _
                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ACProyecto As ACProyecto
    Dim m_OrderBy As String
    Dim m_Resultado As String
    On Error GoTo errores
    If p_IDNC = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    If p_EnumOrden = Empty Then
        p_EnumOrden = EnumOrden.PorNAccion
    End If
    If Not m_ObjEntorno.ColEnumOrdenOrderBy.Exists(CStr(p_EnumOrden)) Then
        p_Error = "No se puede saber el orden que se desea"
        Err.Raise 1000
    End If
    m_Resultado = m_ObjEntorno.ColEnumOrdenOrderBy(CStr(p_EnumOrden))
    If InStr(1, m_Resultado, "|") = 0 Then
        p_Error = "No se puede saber el orden que se desea"
        Err.Raise 1000
    End If
    dato = Split(m_Resultado, "|")
    m_OrderBy = dato(0)
    m_SQL = "SELECT * FROM " & _
            "TbNCAccionCorrectivas " & _
            "WHERE IDNoConformidad=" & p_IDNC & " " & _
            m_OrderBy & ";"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ACProyecto = New ACProyecto
            For Each m_Campo In m_ACProyecto.ColCampos
                m_ACProyecto.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getACsProyecto Is Nothing Then
                Set getACsProyecto = New Scripting.Dictionary
                getACsProyecto.CompareMode = TextCompare
            End If
            If Not getACsProyecto.Exists(CStr(m_ACProyecto.IdAccionCorrectiva)) Then
                getACsProyecto.Add CStr(m_ACProyecto.IdAccionCorrectiva), m_ACProyecto
            End If
            Set m_ACProyecto = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getACsProyecto ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getARProyecto( _
                                Optional p_IDAR As String, _
                                Optional p_Db As DAO.Database, _
                                Optional ByRef p_Error As String _
                                ) As ARProyecto

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
        
    
    On Error GoTo errores
    If p_IDAR = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * FROM " & _
            "TbNCAccionesRealizadas " & _
            "WHERE IDAccionRealizada=" & p_IDAR & ";"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
       Set getARProyecto = New ARProyecto
        For Each m_Campo In getARProyecto.ColCampos
            getARProyecto.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
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
        p_Error = "El método getARProyecto ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getARProyectoUltima( _
                                    Optional p_IDAC As String, _
                                    Optional p_Db As DAO.Database, _
                                    Optional ByRef p_Error As String _
                                    ) As ARProyecto

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_SQLUltima As String
    Dim m_Campo As Variant
        
    
    On Error GoTo errores
    If p_IDAC = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    
    m_SQLUltima = "SELECT Last(IDAccionRealizada) AS ÚltimoDeIDAccionRealizada " & _
                "FROM TbNCAccionesRealizadas " & _
                "WHERE IDAccionCorrectiva=" & p_IDAC & ";"
    m_SQL = "SELECT * FROM " & _
            "TbNCAccionesRealizadas " & _
            "WHERE IDAccionRealizada In(" & m_SQLUltima & ");"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
       Set getARProyectoUltima = New ARProyecto
        For Each m_Campo In getARProyectoUltima.ColCampos
            getARProyectoUltima.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
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
        p_Error = "El método getARProyectoUltima ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getARsProyecto( _
                                p_IDAC As String, _
                                Optional p_Db As DAO.Database, _
                                Optional ByRef p_Error As String _
                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ARProyecto As ARProyecto
    
    
    On Error GoTo errores
    If p_IDAC = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
     m_SQL = "SELECT * FROM " & _
             "TbNCAccionesRealizadas " & _
             "WHERE IDAccionCorrectiva=" & p_IDAC & ";"

    
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ARProyecto = New ARProyecto
            For Each m_Campo In m_ARProyecto.ColCampos
                m_ARProyecto.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getARsProyecto Is Nothing Then
                Set getARsProyecto = New Scripting.Dictionary
                getARsProyecto.CompareMode = TextCompare
            End If
            If Not getARsProyecto.Exists(CStr(m_ARProyecto.IDAccionRealizada)) Then
                getARsProyecto.Add CStr(m_ARProyecto.IDAccionRealizada), m_ARProyecto
            End If
            Set m_ARProyecto = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getARsProyecto ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getARsDeACProyecto( _
                                p_IDAC As String, _
                                Optional p_EnumOrden As EnumOrden, _
                                Optional p_Db As DAO.Database, _
                                Optional ByRef p_Error As String _
                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ARProyecto As ARProyecto
    Dim m_OrderBy As String
    Dim m_Resultado As String
    On Error GoTo errores
    If p_IDAC = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
   If p_EnumOrden = Empty Then
        p_EnumOrden = EnumOrden.PorNAccion
    End If
    If Not m_ObjEntorno.ColEnumOrdenOrderBy.Exists(CStr(p_EnumOrden)) Then
        p_Error = "No se puede saber el orden que se desea"
        Err.Raise 1000
    End If
    m_Resultado = m_ObjEntorno.ColEnumOrdenOrderBy(CStr(p_EnumOrden))
    If InStr(1, m_Resultado, "|") = 0 Then
        p_Error = "No se puede saber el orden que se desea"
        Err.Raise 1000
    End If
    dato = Split(m_Resultado, "|")
    m_OrderBy = dato(1)
     m_SQL = "SELECT * FROM " & _
             "TbNCAccionesRealizadas " & _
             "WHERE IDAccionCorrectiva=" & p_IDAC & " " & _
            m_OrderBy & ";"

    
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ARProyecto = New ARProyecto
            For Each m_Campo In m_ARProyecto.ColCampos
                m_ARProyecto.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getARsDeACProyecto Is Nothing Then
                Set getARsDeACProyecto = New Scripting.Dictionary
                getARsDeACProyecto.CompareMode = TextCompare
            End If
            If Not getARsDeACProyecto.Exists(CStr(m_ARProyecto.IDAccionRealizada)) Then
                getARsDeACProyecto.Add CStr(m_ARProyecto.IDAccionRealizada), m_ARProyecto
            End If
            Set m_ARProyecto = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getARsDeACProyecto ha devuelto el error: " & Err.Description
    End If
End Function


Public Function getID( _
                        p_NOmbreTabla As String, _
                        p_NombreCampoID As String, _
                        Optional ByRef db As DAO.Database, _
                        Optional ByRef p_Error As String _
                        ) As String
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim lngOrdinalMaximo As Long
    On Error GoTo errores
    If p_NOmbreTabla = "" Then
        p_Error = "No se introducido un nombre de tabla adecuado"
        Err.Raise 1000
    End If
    If p_NombreCampoID = "" Then
        p_Error = "No se introducido un nombre de tabla adecuado"
        Err.Raise 1000
    End If
    If db Is Nothing Then
        Set db = getdb()
    End If
    m_SQL = "SELECT Max(" & p_NOmbreTabla & "." & p_NombreCampoID & ") AS Maximo " & _
            "FROM " & p_NOmbreTabla & ";"
    Set rcdDatos = db.OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            If IsNumeric(Nz(.Fields("Maximo"), "")) Then
                lngOrdinalMaximo = .Fields("Maximo")
            End If
        End If
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    getID = CStr(lngOrdinalMaximo + 1)
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getID ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Public Function getLogsProyecto( _
                                p_Objeto As Object, _
                                Optional p_Db As DAO.Database, _
                                Optional ByRef p_Error As String _
                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Log  As LogNCProyecto
    Dim m_NombreCampoID As String
    Dim m_ValorID As String
    
    On Error GoTo errores
    If Not TypeOf p_Objeto Is NCProyecto And Not TypeOf p_Objeto Is ACProyecto And Not TypeOf p_Objeto Is ARProyecto Then
        p_Error = "Tipo de Objeto no válido"
        Err.Raise 1000
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    If TypeOf p_Objeto Is NCProyecto Then
        m_NombreCampoID = "IDNC"
        m_ValorID = p_Objeto.IDNoConformidad
    ElseIf TypeOf p_Objeto Is ACProyecto Then
        m_NombreCampoID = "IDAC"
        m_ValorID = p_Objeto.IdAccionCorrectiva
    ElseIf TypeOf p_Objeto Is ARProyecto Then
        m_NombreCampoID = "IDAR"
        m_ValorID = p_Objeto.IDAccionRealizada
    End If
    m_SQL = "SELECT TbLog.* " & _
                "FROM TbLog " & _
                "WHERE TbLog." & m_NombreCampoID & " =" & m_ValorID & " " & _
                "ORDER BY TbLog.Fecha;"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Log = New LogNCProyecto
            For Each m_Campo In m_Log.ColCampos
                m_Log.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getLogsProyecto Is Nothing Then
                Set getLogsProyecto = New Scripting.Dictionary
                getLogsProyecto.CompareMode = TextCompare
            End If
            If Not getLogsProyecto.Exists(CStr(m_Log.IDLog)) Then
                getLogsProyecto.Add CStr(m_Log.IDLog), m_Log
            End If
            Set m_Log = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getLogsProyecto ha devuelto el error: " & Err.Description
    End If
End Function


Public Function getLogsAuditoria( _
                                p_Objeto As Object, _
                                Optional p_Db As DAO.Database, _
                                Optional ByRef p_Error As String _
                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Log  As LogNCAuditoria
    Dim m_NombreCampoID As String
    Dim m_ValorID As String
    
    On Error GoTo errores
    If Not TypeOf p_Objeto Is NCAuditoria And Not TypeOf p_Objeto Is ACAuditoria And Not TypeOf p_Objeto Is ARAuditoria Then
        p_Error = "Tipo de Objeto no válido"
        Err.Raise 1000
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    If TypeOf p_Objeto Is NCAuditoria Then
        m_NombreCampoID = "IDNC"
        m_ValorID = p_Objeto.id
    ElseIf TypeOf p_Objeto Is ACAuditoria Then
        m_NombreCampoID = "IDAC"
        m_ValorID = p_Objeto.IdAccionCorrectiva
    ElseIf TypeOf p_Objeto Is ARAuditoria Then
        m_NombreCampoID = "IDAR"
        m_ValorID = p_Objeto.IDAccionRealizada
    End If
    m_SQL = "SELECT * " & _
                "FROM TbLogAuditoria " & _
                "WHERE TbLogAuditoria." & m_NombreCampoID & " =" & m_ValorID & " " & _
                "ORDER BY TbLogAuditoria.Fecha;"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Log = New LogNCAuditoria
            For Each m_Campo In m_Log.ColCampos
                m_Log.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getLogsAuditoria Is Nothing Then
                Set getLogsAuditoria = New Scripting.Dictionary
                getLogsAuditoria.CompareMode = TextCompare
            End If
            If Not getLogsAuditoria.Exists(CStr(m_Log.IDLog)) Then
                getLogsAuditoria.Add CStr(m_Log.IDLog), m_Log
            End If
            Set m_Log = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getLogsAuditoria ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getTipologiaNCProyecto( _
                                        Optional p_IDTipo As String, _
                                        Optional p_Tipologia As String, _
                                        Optional p_Db As DAO.Database, _
                                        Optional ByRef p_Error As String _
                                        ) As TipologiaNCProyectos

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
        
    
    On Error GoTo errores
    If p_IDTipo = "" And p_Tipologia = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    If p_IDTipo <> "" Then
        m_SQL = "SELECT * FROM " & _
            "TbTiposNCProyectos " & _
            "WHERE IDTipo=" & p_IDTipo & ";"
    Else
    
        m_SQL = "SELECT * FROM " & _
            "TbTiposNCProyectos " & _
            "WHERE Tipologia='" & p_Tipologia & "';"
    End If
    
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
       Set getTipologiaNCProyecto = New TipologiaNCProyectos
        For Each m_Campo In getTipologiaNCProyecto.ColCampos
            getTipologiaNCProyecto.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
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
        p_Error = "El método getTipologiaNCProyecto ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getTipologiasNCProyecto( _
                                        Optional p_Db As DAO.Database, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Tipologia As TipologiaNCProyectos
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * " & _
            "FROM TbTiposNCProyectos " & _
            "ORDER BY Tipologia;"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Tipologia = New TipologiaNCProyectos
            For Each m_Campo In m_Tipologia.ColCampos
                m_Tipologia.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getTipologiasNCProyecto Is Nothing Then
                Set getTipologiasNCProyecto = New Scripting.Dictionary
                getTipologiasNCProyecto.CompareMode = TextCompare
            End If
            If Not getTipologiasNCProyecto.Exists(CStr(m_Tipologia.IDTipo)) Then
                getTipologiasNCProyecto.Add CStr(m_Tipologia.IDTipo), m_Tipologia
            End If
            Set m_Tipologia = Nothing
            .MoveNext
        Loop
       
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getTipologiasNCProyecto ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientes( _
                                Optional p_Db As DAO.Database, _
                                Optional ByRef p_Error As String _
                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Expediente As Expediente
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdbExpedientes()
    End If
    m_SQL = "TbExpedientes"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Expediente = New Expediente
            For Each m_Campo In m_Expediente.ColCampos
                m_Expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getExpedientes Is Nothing Then
                Set getExpedientes = New Scripting.Dictionary
                getExpedientes.CompareMode = TextCompare
            End If
            If Not getExpedientes.Exists(m_Expediente.IDExpediente) Then
                getExpedientes.Add m_Expediente.IDExpediente, m_Expediente
            End If
            Set m_Expediente = Nothing
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
Public Function getNCsPorTipo( _
                                p_CodTipo As String, _
                                Optional p_Db As DAO.Database, _
                                Optional ByRef p_Error As String _
                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NC As NCProyecto
   
   
    
    On Error GoTo errores
    If p_CodTipo = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * " & _
            "FROM TbNoConformidades " & _
            "WHERE TIPO='" & p_CodTipo & "';"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_NC = New NCProyecto
            For Each m_Campo In m_NC.ColCampos
                m_NC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getNCsPorTipo Is Nothing Then
                Set getNCsPorTipo = New Scripting.Dictionary
                getNCsPorTipo.CompareMode = TextCompare
            End If
            If Not getNCsPorTipo.Exists(CStr(m_NC.IDNoConformidad)) Then
                getNCsPorTipo.Add CStr(m_NC.IDNoConformidad), m_NC
            End If
            Set m_NC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsPorTipo ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getNCsPorTipoNCProyecto( _
                                        p_IDTipo As String, _
                                        Optional p_Db As DAO.Database, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NC As NCProyecto
   
   
    
    On Error GoTo errores
    If p_IDTipo = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * " & _
            "FROM TbNoConformidades " & _
            "WHERE IDTipo=" & p_IDTipo & ";"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_NC = New NCProyecto
            For Each m_Campo In m_NC.ColCampos
                m_NC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getNCsPorTipoNCProyecto Is Nothing Then
                Set getNCsPorTipoNCProyecto = New Scripting.Dictionary
                getNCsPorTipoNCProyecto.CompareMode = TextCompare
            End If
            If Not getNCsPorTipoNCProyecto.Exists(CStr(m_NC.IDNoConformidad)) Then
                getNCsPorTipoNCProyecto.Add CStr(m_NC.IDNoConformidad), m_NC
            End If
            Set m_NC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsPorTipoNCProyecto ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getNCsProyecto( _
                                Optional p_Db As DAO.Database, _
                                Optional ByRef p_Error As String _
                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NC As NCProyecto
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * " & _
            "FROM TbNoConformidades " & _
            "WHERE Borrado=False " & _
            "ORDER BY FECHAAPERTURA DESC;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_NC = New NCProyecto
            For Each m_Campo In m_NC.ColCampos
                'If CStr(m_Campo) = "IDTipo" Then Stop
                'Debug.Print m_Campo
                m_NC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getNCsProyecto Is Nothing Then
                Set getNCsProyecto = New Scripting.Dictionary
                getNCsProyecto.CompareMode = TextCompare
            End If
            If Not getNCsProyecto.Exists(CStr(m_NC.IDNoConformidad)) Then
                getNCsProyecto.Add CStr(m_NC.IDNoConformidad), m_NC
            End If
            Set m_NC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsProyecto ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getNCsProyectoSeguimiento( _
                                            Optional p_Db As DAO.Database, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NC As NCProyecto
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * " & _
            "FROM TbNoConformidades " & _
            "WHERE (ESTADO='CERRADAPTECE' " & _
            "or ESTADO='CERRADAPTECECADUCADA' " & _
            "or ESTADO='CERRADACENOCONFORME' " & _
            "or ESTADO='ACSSINTAREAS' " & _
            "or ESTADO='REGISTRADA') AND  IDNCAsociada Is Null;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_NC = New NCProyecto
            For Each m_Campo In m_NC.ColCampos
                'If CStr(m_Campo) = "IDTipo" Then Stop
                'Debug.Print m_Campo
                m_NC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getNCsProyectoSeguimiento Is Nothing Then
                Set getNCsProyectoSeguimiento = New Scripting.Dictionary
                getNCsProyectoSeguimiento.CompareMode = TextCompare
            End If
            If Not getNCsProyectoSeguimiento.Exists(CStr(m_NC.IDNoConformidad)) Then
                getNCsProyectoSeguimiento.Add CStr(m_NC.IDNoConformidad), m_NC
            End If
            Set m_NC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsProyectoSeguimiento ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getNCsAuditoriaSeguimiento( _
                                            Optional p_Db As DAO.Database, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NC As NCAuditoria
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * " & _
            "FROM TbNoConformidadesAuditoria " & _
            "WHERE ESTADO='CERRADAPTECE' " & _
            "or ESTADO='CERRADAPTECECADUCADA' " & _
            "or ESTADO='CERRADACENOCONFORME' " & _
            "or ESTADO='ACSSINTAREAS' " & _
            "or ESTADO='REGISTRADA';"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_NC = New NCAuditoria
            For Each m_Campo In m_NC.ColCampos
                'If CStr(m_Campo) = "IDTipo" Then Stop
                'Debug.Print m_Campo
                m_NC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getNCsAuditoriaSeguimiento Is Nothing Then
                Set getNCsAuditoriaSeguimiento = New Scripting.Dictionary
                getNCsAuditoriaSeguimiento.CompareMode = TextCompare
            End If
            If Not getNCsAuditoriaSeguimiento.Exists(CStr(m_NC.id)) Then
                getNCsAuditoriaSeguimiento.Add CStr(m_NC.id), m_NC
            End If
            Set m_NC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsAuditoriaSeguimiento ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getNCsDeAuditoria( _
                                    Optional p_Db As DAO.Database, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NC As NCAuditoria
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * " & _
            "FROM TbNoConformidadesAuditoria " & _
            "WHERE Borrado=False " & _
            "ORDER BY Numero;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_NC = New NCAuditoria
            For Each m_Campo In m_NC.ColCampos
                'If CStr(m_Campo) = "IDTipo" Then Stop
                'Debug.Print m_Campo
                m_NC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getNCsDeAuditoria Is Nothing Then
                Set getNCsDeAuditoria = New Scripting.Dictionary
                getNCsDeAuditoria.CompareMode = TextCompare
            End If
            If Not getNCsDeAuditoria.Exists(CStr(m_NC.id)) Then
                getNCsDeAuditoria.Add CStr(m_NC.id), m_NC
            End If
            Set m_NC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsDeAuditoria ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getNCsProyectoAbiertas( _
                                         Optional p_Db As DAO.Database, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NC As NCProyecto
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If

    m_SQL = "SELECT DISTINCT TbNoConformidades.* " & _
            "FROM (TbNoConformidades INNER JOIN TbNCAccionCorrectivas " & _
            "ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad) " & _
            "INNER JOIN TbNCAccionesRealizadas " & _
            "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva " & _
            "WHERE (((TbNoConformidades.Borrado)=False) " & _
            "AND ((TbNCAccionesRealizadas.FechaFinReal) Is Null)) ORDER BY FECHAAPERTURA DESC;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_NC = New NCProyecto
            For Each m_Campo In m_NC.ColCampos
                'If CStr(m_Campo) = "IDTipo" Then Stop
                'Debug.Print m_Campo
                m_NC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getNCsProyectoAbiertas Is Nothing Then
                Set getNCsProyectoAbiertas = New Scripting.Dictionary
                getNCsProyectoAbiertas.CompareMode = TextCompare
            End If
            If Not getNCsProyectoAbiertas.Exists(CStr(m_NC.IDNoConformidad)) Then
                getNCsProyectoAbiertas.Add CStr(m_NC.IDNoConformidad), m_NC
            End If
            Set m_NC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsProyectoAbiertas ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getNCsAuditoriaAbiertas( _
                                             Optional p_Db As DAO.Database, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NC As NCAuditoria
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT distinct TbNoConformidadesAuditoria.* " & _
            "FROM TbNoConformidadesAuditoria INNER JOIN (TbNCAuditoriaAccionCorrectivas " & _
            "INNER JOIN TbNCAuditoriaAccionesRealizadas " & _
            "ON TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva = TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva) " & _
            "ON TbNoConformidadesAuditoria.ID = TbNCAuditoriaAccionCorrectivas.ID " & _
            "WHERE (((TbNoConformidadesAuditoria.Borrado)=False) " & _
            "AND ((TbNCAuditoriaAccionesRealizadas.FechaFinReal) Is Null)) ORDER BY Tipo,Numero;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_NC = New NCAuditoria
            For Each m_Campo In m_NC.ColCampos
                'If CStr(m_Campo) = "IDTipo" Then Stop
                'Debug.Print m_Campo
                m_NC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getNCsAuditoriaAbiertas Is Nothing Then
                Set getNCsAuditoriaAbiertas = New Scripting.Dictionary
                getNCsAuditoriaAbiertas.CompareMode = TextCompare
            End If
            If Not getNCsAuditoriaAbiertas.Exists(CStr(m_NC.id)) Then
                getNCsAuditoriaAbiertas.Add CStr(m_NC.id), m_NC
            End If
            Set m_NC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsAuditoriaAbiertas ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getNCsProyectosTotales( _
                                        Optional p_Db As DAO.Database, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NC As NCProyecto
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If

    m_SQL = "SELECT * " & _
            "FROM TbNoConformidades " & _
            "ORDER BY FECHAAPERTURA DESC;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_NC = New NCProyecto
            For Each m_Campo In m_NC.ColCampos
                m_NC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getNCsProyectosTotales Is Nothing Then
                Set getNCsProyectosTotales = New Scripting.Dictionary
                getNCsProyectosTotales.CompareMode = TextCompare
            End If
            If Not getNCsProyectosTotales.Exists(CStr(m_NC.IDNoConformidad)) Then
                getNCsProyectosTotales.Add CStr(m_NC.IDNoConformidad), m_NC
            End If
            Set m_NC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsProyectosTotales ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getNCsProyectosTotalesParaAbiertas( _
                                                    Optional p_Db As DAO.Database, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NC As NCProyecto
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If

    m_SQL = "SELECT * " & _
            "FROM TbNoConformidades " & _
            "ORDER BY FECHAAPERTURA DESC;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_NC = New NCProyecto
            For Each m_Campo In m_NC.ColCampos
                m_NC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getNCsProyectosTotalesParaAbiertas Is Nothing Then
                Set getNCsProyectosTotalesParaAbiertas = New Scripting.Dictionary
                getNCsProyectosTotalesParaAbiertas.CompareMode = TextCompare
            End If
            If Not getNCsProyectosTotalesParaAbiertas.Exists(CStr(m_NC.IDNoConformidad)) Then
                getNCsProyectosTotalesParaAbiertas.Add CStr(m_NC.IDNoConformidad), m_NC
            End If
            Set m_NC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsProyectosTotalesParaAbiertas ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getACsProyectoSinFinalizar( _
                                                p_IDNC As String, _
                                                Optional p_Db As DAO.Database, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ARProyecto As ARProyecto
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT TbNCAccionesRealizadas.* " & _
            "FROM TbNCAccionCorrectivas INNER JOIN TbNCAccionesRealizadas " & _
            "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva " & _
            "WHERE (((TbNCAccionCorrectivas.IDNoConformidad)=" & p_IDNC & ") " & _
            "AND ((TbNCAccionesRealizadas.FechaFinReal) Is Null));"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ARProyecto = New ARProyecto
            For Each m_Campo In m_ARProyecto.ColCampos
                m_ARProyecto.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getACsProyectoSinFinalizar Is Nothing Then
                Set getACsProyectoSinFinalizar = New Scripting.Dictionary
                getACsProyectoSinFinalizar.CompareMode = TextCompare
            End If
            If Not getACsProyectoSinFinalizar.Exists(CStr(m_ARProyecto.IDAccionRealizada)) Then
                getACsProyectoSinFinalizar.Add CStr(m_ARProyecto.IDAccionRealizada), m_ARProyecto
            End If
            Set m_ARProyecto = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getACsProyectoSinFinalizar ha devuelto el error: " & Err.Description
    End If
End Function


Public Function getExpedienteJuridicas( _
                                        p_IDExp As String, _
                                        Optional p_Db As DAO.Database, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Juridica As Juridica
    
    
    On Error GoTo errores
    
    If p_IDExp = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdbExpedientes()
    End If
    m_SQL = "SELECT TbJuridicas.* " & _
            "FROM TbExpedientesJuridicas INNER JOIN TbJuridicas " & _
            "ON TbExpedientesJuridicas.IDJuridica = TbJuridicas.IDJuridica " & _
            "WHERE TbExpedientesJuridicas.IDExpediente=" & p_IDExp & ";"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Juridica = New Juridica
            For Each m_Campo In m_Juridica.ColCampos
                m_Juridica.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedienteJuridicas Is Nothing Then
                Set getExpedienteJuridicas = New Scripting.Dictionary
                getExpedienteJuridicas.CompareMode = TextCompare
             End If
             If Not getExpedienteJuridicas.Exists(CStr(m_Juridica.IDJuridica)) Then
                getExpedienteJuridicas.Add CStr(m_Juridica.IDJuridica), m_Juridica
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedienteJuridicas ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpediente( _
                                p_IDExpediente As String, _
                                Optional p_Db As DAO.Database, _
                                Optional ByRef p_Error As String _
                                ) As Expediente
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    
    If p_IDExpediente = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdbExpedientes()
    End If
    m_SQL = "S"
    m_SQL = "SELECT * " & _
            "FROM TbExpedientes " & _
            "WHERE IDExpediente=" & p_IDExpediente & ";"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpediente = New Expediente
        For Each m_Campo In getExpediente.ColCampos
            'If CStr(m_Campo) = "TipoInforme" Then Stop
            getExpediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
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
Public Function getExpedientePorCodigo( _
                                        p_Cod As String, _
                                        Optional p_Db As DAO.Database, _
                                        Optional ByRef p_Error As String _
                                        ) As Expediente
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    
    
    
    On Error GoTo errores
    'p_Cod puede ser CodExp o CodigoActividad
    If p_Cod = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdbExpedientes()
    End If
    
    m_SQL = "SELECT * " & _
            "FROM TbExpedientes " & _
            "WHERE CodExp='" & p_Cod & "' OR CodigoActividad='" & p_Cod & "';"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        Set getExpedientePorCodigo = New Expediente
        For Each m_Campo In getExpedientePorCodigo.ColCampos
            'If CStr(m_Campo) = "TipoInforme" Then Stop
            getExpedientePorCodigo.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
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
        p_Error = "El método getExpedientePorCodigo ha devuelto el error: " & Err.Description
    End If
End Function


Public Function getExpedienteResponsables( _
                                            p_IDExp As String, _
                                            Optional p_Db As DAO.Database, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ExpedienteResponsable As ExpedienteResponsable
    
    
    On Error GoTo errores
    
    If p_IDExp = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdbExpedientes()
    End If
    
    m_SQL = "SELECT * " & _
            "FROM TbExpedientesResponsables " & _
            "WHERE IDExpediente=" & p_IDExp & ";"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
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
                m_ExpedienteResponsable.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedienteResponsables Is Nothing Then
                Set getExpedienteResponsables = New Scripting.Dictionary
                getExpedienteResponsables.CompareMode = TextCompare
             End If
             If Not getExpedienteResponsables.Exists(CStr(m_ExpedienteResponsable.IDExpedienteResponsable)) Then
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

Public Function getExpedientesBusqueda( _
                                        Optional p_PC As String, _
                                        Optional p_IDRC As String, _
                                        Optional p_Db As DAO.Database, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Expediente As Expediente
    
    On Error GoTo errores
    If p_IDRC <> "" Then
        m_SQL = "SELECT * " & _
                "FROM TbExpedientes " & _
                "WHERE IDResponsableCalidad =" & p_IDRC & ";"
    Else
        m_SQL = "SELECT * " & _
                "FROM TbExpedientes;"
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdbExpedientes()
    End If
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            .MoveFirst
            Do While Not .EOF
                Set m_Expediente = New Expediente
                For Each m_Campo In m_Expediente.ColCampos
                    m_Expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                    If p_Error <> "" Then
                        Err.Raise 1000
                    End If
                Next
                If p_PC <> "" Then
                    If p_PC <> m_Expediente.IDExpediente And _
                        InStr(1, m_Expediente.Nemotecnico, p_PC) = 0 And _
                        InStr(1, m_Expediente.Titulo, p_PC) = 0 Then
                        GoTo siguiente
                    End If
                End If

                If getExpedientesBusqueda Is Nothing Then
                    Set getExpedientesBusqueda = New Scripting.Dictionary
                    getExpedientesBusqueda.CompareMode = TextCompare
                End If
                If Not getExpedientesBusqueda.Exists(CStr(m_Expediente.IDExpediente)) Then
                    getExpedientesBusqueda.Add CStr(m_Expediente.IDExpediente), m_Expediente
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
        p_Error = "El método getExpedientesBusqueda ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getARsDeProyectoBusqueda( _
                                        Optional p_ResponsableCalidad As String, _
                                        Optional p_Responsable As String, _
                                        Optional p_Estado As String, _
                                        Optional p_IDExpediente As String, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary

    Dim m_Col As Scripting.Dictionary
    Dim m_AR As SegTareasProyecto
    Dim m_ID As Variant
    
    On Error GoTo errores
    
    If p_Estado = "ACTIVA" Then
        Set m_Col = m_ObjEntorno.ColSegsTareasProyectoActivas
    ElseIf p_Estado = "PENDIENTE DE REPLANIFICAR" Then
        Set m_Col = m_ObjEntorno.ColSegsTareasProyectoPteReplanificar
    
    
    Else
        Set m_Col = m_ObjEntorno.ColSegsTareasProyecto
    End If
  
    If m_Col Is Nothing Then
        Exit Function
    End If
     For Each m_ID In m_Col
        Set m_AR = m_Col(m_ID)
        If p_ResponsableCalidad <> "" Then 'usuariored
            If p_ResponsableCalidad <> m_AR.RespCalidad Then
                GoTo siguiente
            End If
        End If
        If p_Responsable <> "" Then 'usuariored
            If p_Responsable <> m_AR.Tecnico Then
                GoTo siguiente
            End If
        End If
        
        If p_IDExpediente <> "" Then
            If p_IDExpediente <> m_AR.IDExpediente Then
                GoTo siguiente
            End If
        End If
        If getARsDeProyectoBusqueda Is Nothing Then
            Set getARsDeProyectoBusqueda = New Scripting.Dictionary
            getARsDeProyectoBusqueda.CompareMode = TextCompare
        End If
        If Not getARsDeProyectoBusqueda.Exists(CStr(m_AR.IDAccionRealizada)) Then
            getARsDeProyectoBusqueda.Add CStr(m_AR.IDAccionRealizada), m_AR
        End If


siguiente:
        Set m_AR = Nothing
    Next
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getARsDeProyectoBusqueda ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getNCsDeProyectoBusqueda( _
                                        Optional p_ResponsableCalidad As String, _
                                        Optional p_Responsable As String, _
                                        Optional p_Estado As String, _
                                        Optional p_IDExpediente As String, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary

    
    Dim m_NC As SegNCProyecto
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    
    On Error GoTo errores
    
    If p_Estado = m_ObjEntorno.ColEstadosNCTitulo(CStr(EnumEstadoNC.REGISTRADA)) Then
        Set m_Col = m_ObjEntorno.ColSegsNCProyectoRegistradas
    ElseIf p_Estado = m_ObjEntorno.ColEstadosNCTitulo(CStr(EnumEstadoNC.CERRADAPTECE)) Then
        Set m_Col = m_ObjEntorno.ColSegsNCProyectoPteCE
    ElseIf p_Estado = m_ObjEntorno.ColEstadosNCTitulo(CStr(EnumEstadoNC.CERRADAPTECECADUCADA)) Then
        Set m_Col = m_ObjEntorno.ColSegsNCProyectoCECaducada
    ElseIf p_Estado = m_ObjEntorno.ColEstadosNCTitulo(CStr(EnumEstadoNC.ACSSINTAREAS)) Then
        Set m_Col = m_ObjEntorno.ColSegsNCProyectoAccionesSinTareas
    ElseIf p_Estado = m_ObjEntorno.ColEstadosNCTitulo(CStr(EnumEstadoNC.CERRADACENOCONFORME)) Then
        Set m_Col = m_ObjEntorno.ColSegsNCProyectoCENoConforme
    Else
        Set m_Col = m_ObjEntorno.ColSegsNCProyectoTotales
    End If
    
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_NC = m_Col(m_ID)
        If p_ResponsableCalidad <> "" Then 'nombre
            If p_ResponsableCalidad <> m_NC.NombreCalidad Then
                GoTo siguiente
            End If
        End If
        If p_Responsable <> "" Then 'nombre
            If p_Responsable <> m_NC.Tecnico Then
                GoTo siguiente
            End If
        End If
        
        If p_IDExpediente <> "" Then
            If p_IDExpediente <> m_NC.IDExpediente Then
                GoTo siguiente
            End If
        End If
        If getNCsDeProyectoBusqueda Is Nothing Then
            Set getNCsDeProyectoBusqueda = New Scripting.Dictionary
            getNCsDeProyectoBusqueda.CompareMode = TextCompare
        End If
        If Not getNCsDeProyectoBusqueda.Exists(CStr(m_NC.IDNoConformidad)) Then
            getNCsDeProyectoBusqueda.Add CStr(m_NC.IDNoConformidad), m_NC
        End If
siguiente:
        Set m_NC = Nothing
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsDeProyectoBusqueda ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getARsDeAuditoriaBusqueda( _
                                        Optional p_Auditoria As String, _
                                        Optional p_Responsable As String, _
                                        Optional p_Estado As String, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary

    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_AR As SegTareasAuditoria
    Dim m_ColActivas As Scripting.Dictionary
    Dim m_ColPtesReplan As Scripting.Dictionary
    Dim m_ColEstadoIrregular As Scripting.Dictionary
    
    On Error GoTo errores
    If p_Estado = "ACTIVA" Then
        Set m_Col = m_ObjEntorno.ColSegsTareasAuditoriaActivas
    ElseIf p_Estado = "PENDIENTE DE REPLANIFICAR" Then
        Set m_Col = m_ObjEntorno.ColSegsTareasAuditoriaPteReplanificar
    ElseIf p_Estado = "ESTADO IRREGULAR" Then
        Set m_Col = m_ObjEntorno.ColSegsTareasAuditoriaIrregulares
    
    Else
        Set m_Col = m_ObjEntorno.ColSegsTareasAuditoriaTotales
        
    End If
    
    If m_Col Is Nothing Then
        Exit Function
    End If
     For Each m_ID In m_Col
        Set m_AR = m_Col(m_ID)
        If p_Auditoria <> "" Then 'usuariored
            If p_Auditoria <> m_AR.Auditoria Then
                GoTo siguiente
            End If
        End If
        If p_Responsable <> "" Then 'usuariored
            If p_Responsable <> m_AR.Responsable Then
                GoTo siguiente
            End If
        End If
        
        
        If getARsDeAuditoriaBusqueda Is Nothing Then
            Set getARsDeAuditoriaBusqueda = New Scripting.Dictionary
            getARsDeAuditoriaBusqueda.CompareMode = TextCompare
        End If
        If Not getARsDeAuditoriaBusqueda.Exists(CStr(m_AR.IDAccionRealizada)) Then
            getARsDeAuditoriaBusqueda.Add CStr(m_AR.IDAccionRealizada), m_AR
        End If

siguiente:
        Set m_AR = Nothing
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getARsDeAuditoriaBusqueda ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getNCsDeAuditoriaBusqueda( _
                                        Optional p_IDAuditoria As String, _
                                        Optional p_Responsable As String, _
                                        Optional p_Estado As String, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary

   Dim m_NC As SegNCAuditoria
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    
    On Error GoTo errores
    
    If p_Estado = m_ObjEntorno.ColEstadosNCTitulo(CStr(EnumEstadoNC.REGISTRADA)) Then
        Set m_Col = m_ObjEntorno.ColSegsNCAuditoriaRegistradas
    ElseIf p_Estado = m_ObjEntorno.ColEstadosNCTitulo(CStr(EnumEstadoNC.CERRADAPTECE)) Then
        Set m_Col = m_ObjEntorno.ColSegsNCAuditoriaPteCE
    ElseIf p_Estado = m_ObjEntorno.ColEstadosNCTitulo(CStr(EnumEstadoNC.CERRADAPTECECADUCADA)) Then
        Set m_Col = m_ObjEntorno.ColSegsNCAuditoriaCECaducada
    ElseIf p_Estado = m_ObjEntorno.ColEstadosNCTitulo(CStr(EnumEstadoNC.ACSSINTAREAS)) Then
        Set m_Col = m_ObjEntorno.ColSegsNCAuditoriaAccionesSinTareas
    ElseIf p_Estado = m_ObjEntorno.ColEstadosNCTitulo(CStr(EnumEstadoNC.CERRADACENOCONFORME)) Then
        Set m_Col = m_ObjEntorno.ColSegsNCAuditoriaCENoConforme
    Else
        Set m_Col = m_ObjEntorno.ColSegsNCAuditoriaTotales
    End If
    
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_NC = m_Col(m_ID)
        If p_Responsable <> "" Then 'nombre
            If p_Responsable <> m_NC.Responsable Then
                GoTo siguiente
            End If
        End If
        If p_IDAuditoria <> "" Then
            If p_IDAuditoria <> m_NC.IDAuditoria Then
                GoTo siguiente
            End If
        End If
        If getNCsDeAuditoriaBusqueda Is Nothing Then
            Set getNCsDeAuditoriaBusqueda = New Scripting.Dictionary
            getNCsDeAuditoriaBusqueda.CompareMode = TextCompare
        End If
        If Not getNCsDeAuditoriaBusqueda.Exists(CStr(m_NC.id)) Then
            getNCsDeAuditoriaBusqueda.Add CStr(m_NC.id), m_NC
        End If
siguiente:
        Set m_NC = Nothing
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsDeAuditoriaBusqueda ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getRiesgo( _
                            p_IDProyecto As String, _
                            p_CodigoRiesgo As String, _
                            Optional p_Db As DAO.Database, _
                            Optional ByRef p_Error As String _
                            ) As riesgo

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
        
    
    On Error GoTo errores
    If p_IDProyecto = "" And p_CodigoRiesgo = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdbRiesgos()
    End If
    m_SQL = "SELECT TbRiesgos.* " & _
            "FROM TbRiesgos " & _
            "WHERE (((TbRiesgos.IDEdicion) In (SELECT Max(TbProyectosEdiciones.IDEdicion) AS MáxDeIDEdicion " & _
            "FROM TbProyectosEdiciones " & _
            "WHERE (((TbProyectosEdiciones.IDProyecto)=" & p_IDProyecto & "));)) " & _
            "AND ((TbRiesgos.CodigoRiesgo)='" & p_CodigoRiesgo & "'));"
    
    
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
       Set getRiesgo = New riesgo
        For Each m_Campo In getRiesgo.ColCampos
            getRiesgo.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
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
        p_Error = "El método getRiesgo ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getRiesgosDeExpediente( _
                                        p_IDExpediente As String, _
                                        Optional p_Db As DAO.Database, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Riesgo As riesgo
   
   
    
    On Error GoTo errores
    If p_IDExpediente = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdbRiesgos()
    End If
    m_SQL = "SELECT TbRiesgos.* " & _
            "FROM TbRiesgos " & _
            "WHERE (((TbRiesgos.IDEdicion) In (SELECT Max(TbProyectosEdiciones.IDEdicion) AS MáxDeIDEdicion " & _
            "FROM TbProyectos INNER JOIN TbProyectosEdiciones ON TbProyectos.IDProyecto = TbProyectosEdiciones.IDProyecto " & _
            "WHERE (((TbProyectos.IDExpediente)=" & p_IDExpediente & "));)));"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Riesgo = New riesgo
            For Each m_Campo In m_Riesgo.ColCampos
                m_Riesgo.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getRiesgosDeExpediente Is Nothing Then
                Set getRiesgosDeExpediente = New Scripting.Dictionary
                getRiesgosDeExpediente.CompareMode = TextCompare
            End If
            If Not getRiesgosDeExpediente.Exists(CStr(m_Riesgo.idRiesgo)) Then
                getRiesgosDeExpediente.Add CStr(m_Riesgo.idRiesgo), m_Riesgo
            End If
            Set m_Riesgo = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getRiesgosDeExpediente ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getUltimoProyecto( _
                                    p_IDExpediente As String, _
                                    Optional p_Db As DAO.Database, _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
        
    
    On Error GoTo errores
    If p_IDExpediente = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdbRiesgos()
    End If
    m_SQL = "SELECT IDProyecto " & _
            "FROM TbProyectos " & _
            "WHERE IDExpediente = " & p_IDExpediente & " " & _
            "ORDER BY IDProyecto DESC;"
    
    
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            getUltimoProyecto = Nz(.Fields("IDProyecto"), "")
        End If
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getUltimoProyecto ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getReplanificacionProyecto( _
                                            Optional p_IDRep As String, _
                                            Optional p_Db As DAO.Database, _
                                            Optional ByRef p_Error As String _
                                            ) As ReplanificacionesProyecto

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
        
    
    On Error GoTo errores
    If p_IDRep = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * " & _
            "FROM TbReplanificacionesProyecto " & _
            "WHERE IDReplanificacion=" & p_IDRep & ";"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
       Set getReplanificacionProyecto = New ReplanificacionesProyecto
        For Each m_Campo In getReplanificacionProyecto.ColCampos
            getReplanificacionProyecto.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
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
        p_Error = "El método getReplanificacionProyecto ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getReplanificacionAuditoria( _
                                            Optional p_IDRep As String, _
                                            Optional p_Db As DAO.Database, _
                                            Optional ByRef p_Error As String _
                                            ) As ReplanificacionesAuditoria

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
        
    
    On Error GoTo errores
    If p_IDRep = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * " & _
            "FROM TbReplanificacionesAuditoria " & _
            "WHERE IDReplanificacion=" & p_IDRep & ";"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
       Set getReplanificacionAuditoria = New ReplanificacionesAuditoria
        For Each m_Campo In getReplanificacionAuditoria.ColCampos
            getReplanificacionAuditoria.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
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
        p_Error = "El método getReplanificacionAuditoria ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getReplanificacionesDeNCProyecto( _
                                                    p_IDNC As String, _
                                                    Optional p_Db As DAO.Database, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Rep As ReplanificacionesProyecto
    
    On Error GoTo errores
    If p_IDNC = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    
    m_SQL = "SELECT * " & _
            "FROM TbReplanificacionesProyecto " & _
            "WHERE IDNoConformidad=" & p_IDNC & ";"
    
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Rep = New ReplanificacionesProyecto
            For Each m_Campo In m_Rep.ColCampos
                m_Rep.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getReplanificacionesDeNCProyecto Is Nothing Then
                Set getReplanificacionesDeNCProyecto = New Scripting.Dictionary
                getReplanificacionesDeNCProyecto.CompareMode = TextCompare
            End If
            If Not getReplanificacionesDeNCProyecto.Exists(CStr(m_Rep.IDReplanificacion)) Then
                getReplanificacionesDeNCProyecto.Add CStr(m_Rep.IDReplanificacion), m_Rep
            End If
            Set m_Rep = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getReplanificacionesDeNCProyecto ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getReplanificacionesDeNCAuditoria( _
                                                    p_IDNC As String, _
                                                    Optional p_Db As DAO.Database, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Rep As ReplanificacionesAuditoria
    
    On Error GoTo errores
    If p_IDNC = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    
    m_SQL = "SELECT * " & _
            "FROM TbReplanificacionesAuditoria " & _
            "WHERE IDNoConformidad=" & p_IDNC & ";"
    
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Rep = New ReplanificacionesAuditoria
            For Each m_Campo In m_Rep.ColCampos
                m_Rep.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getReplanificacionesDeNCAuditoria Is Nothing Then
                Set getReplanificacionesDeNCAuditoria = New Scripting.Dictionary
                getReplanificacionesDeNCAuditoria.CompareMode = TextCompare
            End If
            If Not getReplanificacionesDeNCAuditoria.Exists(CStr(m_Rep.IDReplanificacion)) Then
                getReplanificacionesDeNCAuditoria.Add CStr(m_Rep.IDReplanificacion), m_Rep
            End If
            Set m_Rep = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getReplanificacionesDeNCAuditoria ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getJuridicasDistintas( _
                                        Optional p_Db As DAO.Database, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Juridica As String
    
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT distinct Juridica " & _
            "FROM TbNoConformidades " & _
            "WHERE Not Juridica Is Null;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            m_Juridica = Nz(.Fields("Juridica").Value, "")
            
             If getJuridicasDistintas Is Nothing Then
                Set getJuridicasDistintas = New Scripting.Dictionary
                getJuridicasDistintas.CompareMode = TextCompare
             End If
             If Not getJuridicasDistintas.Exists(m_Juridica) Then
                getJuridicasDistintas.Add m_Juridica, m_Juridica
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getJuridicasDistintas ha devuelto el error: " & Err.Description
    End If
End Function


Public Function getNCsProyectoPorPalabraClave( _
                                                p_PC As String, _
                                                Optional p_Db As DAO.Database, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NC As NCProyecto
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT TbNoConformidades.* " & _
            "FROM (TbNoConformidades LEFT JOIN TbNCAccionCorrectivas " & _
            "ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad) " & _
            "LEFT JOIN TbNCAccionesRealizadas " & _
            "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva " & _
            "WHERE (((TbNoConformidades.DESCRIPCION) Like '*" & p_PC & "*')) " & _
            "OR (((TbNoConformidades.CausaYAnalisRaiz) Like '*" & p_PC & "*')) " & _
            "OR (((TbNCAccionCorrectivas.AccionCorrectiva) Like '*" & p_PC & "*')) " & _
            "OR (((TbNCAccionesRealizadas.AccionRealizada) Like '*" & p_PC & "*'));"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_NC = New NCProyecto
            For Each m_Campo In m_NC.ColCampos
                m_NC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getNCsProyectoPorPalabraClave Is Nothing Then
                Set getNCsProyectoPorPalabraClave = New Scripting.Dictionary
                getNCsProyectoPorPalabraClave.CompareMode = TextCompare
            End If
            If Not getNCsProyectoPorPalabraClave.Exists(CStr(m_NC.IDNoConformidad)) Then
                getNCsProyectoPorPalabraClave.Add CStr(m_NC.IDNoConformidad), m_NC
            End If
            Set m_NC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsProyectoPorPalabraClave ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getARsProyectoSeguimiento( _
                                            Optional p_Db As DAO.Database, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ARProyecto As ARProyecto
    'HAY QUE QUITAR LOS QUE TIENEN VÍNCULOS
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT TbNCAccionesRealizadas.* " & _
            "FROM TbNoConformidades INNER JOIN (TbNCAccionCorrectivas INNER JOIN TbNCAccionesRealizadas " & _
            "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva) " & _
            "ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad  " & _
            "WHERE (TbNCAccionesRealizadas.ESTADO='PTEREPLANIFICAR' OR TbNCAccionesRealizadas.ESTADO='IRREGULAR') " & _
            "AND  TbNoConformidades.IDNCAsociada Is Null;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ARProyecto = New ARProyecto
            For Each m_Campo In m_ARProyecto.ColCampos
                m_ARProyecto.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getARsProyectoSeguimiento Is Nothing Then
                Set getARsProyectoSeguimiento = New Scripting.Dictionary
                getARsProyectoSeguimiento.CompareMode = TextCompare
            End If
            If Not getARsProyectoSeguimiento.Exists(CStr(m_ARProyecto.IDAccionRealizada)) Then
                getARsProyectoSeguimiento.Add CStr(m_ARProyecto.IDAccionRealizada), m_ARProyecto
            End If
            Set m_ARProyecto = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getARsProyectoSeguimiento ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getSegsTareasProyecto( _
                                                Optional p_Db As DAO.Database, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegTareas As SegTareasProyecto
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    
    m_SQL = m_SQLAlInicioSegTareasProyectos & _
            ";"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_SegTareas = New SegTareasProyecto
            For Each m_Campo In m_SegTareas.ColCampos
                m_SegTareas.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getSegsTareasProyecto Is Nothing Then
                Set getSegsTareasProyecto = New Scripting.Dictionary
                getSegsTareasProyecto.CompareMode = TextCompare
            End If
            If Not getSegsTareasProyecto.Exists(CStr(m_SegTareas.IDAccionRealizada)) Then
                getSegsTareasProyecto.Add CStr(m_SegTareas.IDAccionRealizada), m_SegTareas
            End If
            Set m_SegTareas = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsTareasProyecto ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getSegsTareasProyectoActivas( _
                                                Optional p_Db As DAO.Database, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegTareas As SegTareasProyecto
    Dim m_NCProyecto As NCProyecto
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    
    m_SQL = m_SQLAlInicioSegTareasProyectos & _
            "WHERE Not FechaInicio Is Null " & _
            "AND Not FechaFinPrevista Is Null " & _
            "AND FechaFinReal Is Null;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_NCProyecto = constructor.getNCProyecto(p_IDNC:=rcdDatos.Fields("IDNoConformidad"), p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            m_NCProyecto.EstadoGrabar
            Set m_SegTareas = New SegTareasProyecto
            For Each m_Campo In m_SegTareas.ColCampos
                m_SegTareas.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            m_SegTareas.Estado = m_NCProyecto.Estado
            If getSegsTareasProyectoActivas Is Nothing Then
                Set getSegsTareasProyectoActivas = New Scripting.Dictionary
                getSegsTareasProyectoActivas.CompareMode = TextCompare
            End If
            If Not getSegsTareasProyectoActivas.Exists(CStr(m_SegTareas.IDAccionRealizada)) Then
                getSegsTareasProyectoActivas.Add CStr(m_SegTareas.IDAccionRealizada), m_SegTareas
            End If
            Set m_SegTareas = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsTareasProyectoActivas ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSegsTareasProyectoPteReplanificar( _
                                                    Optional p_Db As DAO.Database, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegTareas As SegTareasProyecto
    Dim m_NCProyecto As NCProyecto
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    
    m_SQL = m_SQLAlInicioSegTareasProyectos & _
            "WHERE Not FechaInicio Is Null " & _
            "AND FechaFinPrevista<=Date() " & _
            "AND FechaFinReal Is Null;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_NCProyecto = constructor.getNCProyecto(p_IDNC:=rcdDatos.Fields("IDNoConformidad"), p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            m_NCProyecto.EstadoGrabar
            Set m_SegTareas = New SegTareasProyecto
            For Each m_Campo In m_SegTareas.ColCampos
                m_SegTareas.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            m_SegTareas.Estado = m_NCProyecto.Estado
            
            If getSegsTareasProyectoPteReplanificar Is Nothing Then
                Set getSegsTareasProyectoPteReplanificar = New Scripting.Dictionary
                getSegsTareasProyectoPteReplanificar.CompareMode = TextCompare
            End If
            If Not getSegsTareasProyectoPteReplanificar.Exists(CStr(m_SegTareas.IDAccionRealizada)) Then
                getSegsTareasProyectoPteReplanificar.Add CStr(m_SegTareas.IDAccionRealizada), m_SegTareas
            End If
            Set m_SegTareas = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsTareasProyectoPteReplanificar ha devuelto el error: " & Err.Description
    End If
End Function


Public Function getSegsTareasAuditoriaActivas( _
                                                    Optional p_Db As DAO.Database, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegTareas As SegTareasAuditoria
    Dim m_NCProyecto As NCProyecto
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    
    m_SQL = m_SQLAlInicioSegTareasAuditorias & _
            "WHERE Not TbNCAuditoriaAccionesRealizadas.FechaInicio Is Null " & _
            "AND Not FechaFinPrevista Is Null " & _
            "AND FechaFinReal Is Null;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_SegTareas = New SegTareasAuditoria
            For Each m_Campo In m_SegTareas.ColCampos
                m_SegTareas.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getSegsTareasAuditoriaActivas Is Nothing Then
                Set getSegsTareasAuditoriaActivas = New Scripting.Dictionary
                getSegsTareasAuditoriaActivas.CompareMode = TextCompare
            End If
            If Not getSegsTareasAuditoriaActivas.Exists(CStr(m_SegTareas.IDAccionRealizada)) Then
                getSegsTareasAuditoriaActivas.Add CStr(m_SegTareas.IDAccionRealizada), m_SegTareas
            End If
            Set m_SegTareas = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsTareasAuditoriaActivas ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSegsTareasAuditoriaTotales( _
                                                    Optional p_Db As DAO.Database, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegTareas As SegTareasAuditoria
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    
    m_SQL = m_SQLAlInicioSegTareasAuditorias & _
            ";"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_SegTareas = New SegTareasAuditoria
            For Each m_Campo In m_SegTareas.ColCampos
                m_SegTareas.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getSegsTareasAuditoriaTotales Is Nothing Then
                Set getSegsTareasAuditoriaTotales = New Scripting.Dictionary
                getSegsTareasAuditoriaTotales.CompareMode = TextCompare
            End If
            If Not getSegsTareasAuditoriaTotales.Exists(CStr(m_SegTareas.IDAccionRealizada)) Then
                getSegsTareasAuditoriaTotales.Add CStr(m_SegTareas.IDAccionRealizada), m_SegTareas
            End If
            Set m_SegTareas = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsTareasAuditoriaTotales ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSegsTareasAuditoriaPteReplanificar( _
                                                    Optional p_Db As DAO.Database, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_CampoTabla As String
    Dim m_SegTareas As SegTareasAuditoria
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    
    m_SQL = m_SQLAlInicioSegTareasAuditorias & _
            "WHERE Not TbNCAuditoriaAccionesRealizadas.FechaInicio Is Null " & _
            "AND FechaFinPrevista<=Date() " & _
            "AND FechaFinReal Is Null;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_SegTareas = New SegTareasAuditoria
            For Each m_Campo In m_SegTareas.ColCampos
                'Debug.Print m_Campo
                'If CStr(m_Campo) = "FechaInicio" Then Stop
                m_SegTareas.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getSegsTareasAuditoriaPteReplanificar Is Nothing Then
                Set getSegsTareasAuditoriaPteReplanificar = New Scripting.Dictionary
                getSegsTareasAuditoriaPteReplanificar.CompareMode = TextCompare
            End If
            If Not getSegsTareasAuditoriaPteReplanificar.Exists(CStr(m_SegTareas.IDAccionRealizada)) Then
                getSegsTareasAuditoriaPteReplanificar.Add CStr(m_SegTareas.IDAccionRealizada), m_SegTareas
            End If
            Set m_SegTareas = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsTareasAuditoriaPteReplanificar ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getSegsTareasAuditoriaIrregulares( _
                                                    Optional p_Db As DAO.Database, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegTareas As SegTareasAuditoria
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    
    m_SQL = m_SQLAlInicioSegTareasAuditorias & _
            "WHERE " & _
            "TbNCAuditoriaAccionesRealizadas.FechaInicio Is Null AND (Not FechaFinPrevista Is Null or Not FechaFinReal Is Null) AND TbNoConformidadesAuditoria.Borrado=False;"

            
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
             .MoveFirst
            Do While Not .EOF
                Set m_SegTareas = New SegTareasAuditoria
                For Each m_Campo In m_SegTareas.ColCampos
                    m_SegTareas.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                    If p_Error <> "" Then
                        Err.Raise 1000
                    End If
                Next
                If getSegsTareasAuditoriaIrregulares Is Nothing Then
                    Set getSegsTareasAuditoriaIrregulares = New Scripting.Dictionary
                    getSegsTareasAuditoriaIrregulares.CompareMode = TextCompare
                End If
                If Not getSegsTareasAuditoriaIrregulares.Exists(CStr(m_SegTareas.IDAccionRealizada)) Then
                    getSegsTareasAuditoriaIrregulares.Add CStr(m_SegTareas.IDAccionRealizada), m_SegTareas
                End If
                Set m_SegTareas = Nothing
                .MoveNext
            Loop
        End If
       
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    m_SQL = m_SQLAlInicioSegTareasAuditorias & _
            "WHERE " & _
            "FechaFinPrevista Is Null AND (Not TbNCAuditoriaAccionesRealizadas.FechaInicio Is Null or Not FechaFinReal Is Null)AND TbNoConformidadesAuditoria.Borrado=False;"

            
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
             .MoveFirst
            Do While Not .EOF
                Set m_SegTareas = New SegTareasAuditoria
                For Each m_Campo In m_SegTareas.ColCampos
                    m_SegTareas.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                    If p_Error <> "" Then
                        Err.Raise 1000
                    End If
                Next
                If getSegsTareasAuditoriaIrregulares Is Nothing Then
                    Set getSegsTareasAuditoriaIrregulares = New Scripting.Dictionary
                    getSegsTareasAuditoriaIrregulares.CompareMode = TextCompare
                End If
                If Not getSegsTareasAuditoriaIrregulares.Exists(CStr(m_SegTareas.IDAccionRealizada)) Then
                    getSegsTareasAuditoriaIrregulares.Add CStr(m_SegTareas.IDAccionRealizada), m_SegTareas
                End If
                Set m_SegTareas = Nothing
                .MoveNext
            Loop
        End If
       
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsTareasAuditoriaIrregulares ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSegsNCProyectoRegistradas( _
                                                Optional p_Db As DAO.Database, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegNC As SegNCProyecto
    
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT TbNoConformidades.IDNoConformidad, TbNoConformidades.CodigoNoConformidad, " & _
                "TbNoConformidades.DESCRIPCION, TbExpedientes.Nemotecnico, TbNoConformidades.ESTADO, " & _
                "TbNoConformidades.RESPONSABLECALIDAD AS NombreCalidad, TbUsuariosAplicaciones.Nombre AS Tecnico, " & _
                "TbNoConformidades.IDExpediente, TbNoConformidades.RequiereControlEficacia, " & _
                "TbNoConformidades.ResultadoControlEficacia, TbNoConformidades.FECHACIERRE " & _
                "FROM ((TbNoConformidades INNER JOIN TbExpedientes " & _
                "ON TbNoConformidades.IDExpediente = TbExpedientes.IDExpediente) LEFT JOIN TbUsuariosAplicaciones " & _
                "ON TbNoConformidades.RESPONSABLETELEFONICA = TbUsuariosAplicaciones.UsuarioRed) " & _
                "LEFT JOIN TbNCAccionCorrectivas ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad " & _
                "WHERE TbNCAccionCorrectivas.IDAccionCorrectiva Is Null AND TbNoConformidades.Borrado=False;"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_SegNC = New SegNCProyecto
            For Each m_Campo In m_SegNC.ColCampos
                m_SegNC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getSegsNCProyectoRegistradas Is Nothing Then
                Set getSegsNCProyectoRegistradas = New Scripting.Dictionary
                getSegsNCProyectoRegistradas.CompareMode = TextCompare
            End If
            If Not getSegsNCProyectoRegistradas.Exists(CStr(m_SegNC.IDNoConformidad)) Then
                getSegsNCProyectoRegistradas.Add CStr(m_SegNC.IDNoConformidad), m_SegNC
            End If
            Set m_SegNC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsNCProyectoRegistradas ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSegsNCProyectoTotales( _
                                                Optional p_Db As DAO.Database, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegNC As SegNCProyecto
    
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT TbNoConformidades.IDNoConformidad, TbNoConformidades.CodigoNoConformidad, " & _
            "TbNoConformidades.DESCRIPCION, TbExpedientes.Nemotecnico, TbNoConformidades.ESTADO, " & _
            "TbNoConformidades.RESPONSABLECALIDAD AS NombreCalidad, TbUsuariosAplicaciones.Nombre AS Tecnico, " & _
            "TbNoConformidades.IDExpediente, TbNoConformidades.RequiereControlEficacia, " & _
            "TbNoConformidades.ResultadoControlEficacia, TbNoConformidades.FECHACIERRE " & _
            "FROM ((TbNoConformidades INNER JOIN TbExpedientes " & _
            "ON TbNoConformidades.IDExpediente = TbExpedientes.IDExpediente) LEFT JOIN TbUsuariosAplicaciones " & _
            "ON TbNoConformidades.RESPONSABLETELEFONICA = TbUsuariosAplicaciones.UsuarioRed) " & _
            "LEFT JOIN TbNCAccionCorrectivas ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad " & _
            "WHERE (((TbNoConformidades.Borrado)=False));"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_SegNC = New SegNCProyecto
            For Each m_Campo In m_SegNC.ColCampos
                m_SegNC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getSegsNCProyectoTotales Is Nothing Then
                Set getSegsNCProyectoTotales = New Scripting.Dictionary
                getSegsNCProyectoTotales.CompareMode = TextCompare
            End If
            If Not getSegsNCProyectoTotales.Exists(CStr(m_SegNC.IDNoConformidad)) Then
                getSegsNCProyectoTotales.Add CStr(m_SegNC.IDNoConformidad), m_SegNC
            End If
            Set m_SegNC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsNCProyectoTotales ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSegsNCProyectoAccionesSinTareas( _
                                                Optional p_Db As DAO.Database, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegNC As SegNCProyecto
    
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT distinct TbNoConformidades.IDNoConformidad, TbNoConformidades.CodigoNoConformidad, " & _
            "TbNoConformidades.DESCRIPCION, TbExpedientes.Nemotecnico, TbNoConformidades.ESTADO, " & _
            "TbNoConformidades.RESPONSABLECALIDAD AS NombreCalidad, TbUsuariosAplicaciones.Nombre AS Tecnico, " & _
            "TbNoConformidades.IDExpediente, TbNoConformidades.RequiereControlEficacia, " & _
            "TbNoConformidades.ResultadoControlEficacia, TbNoConformidades.FECHACIERRE " & _
            "FROM (((TbNoConformidades INNER JOIN TbExpedientes " & _
            "ON TbNoConformidades.IDExpediente = TbExpedientes.IDExpediente) LEFT JOIN TbUsuariosAplicaciones " & _
            "ON TbNoConformidades.RESPONSABLETELEFONICA = TbUsuariosAplicaciones.UsuarioRed) " & _
            "INNER JOIN TbNCAccionCorrectivas ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad) " & _
            "LEFT JOIN TbNCAccionesRealizadas " & _
            "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva " & _
            "WHERE (((TbNCAccionesRealizadas.IDAccionRealizada) Is Null) AND TbNoConformidades.FECHACIERRE Is Null);"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_SegNC = New SegNCProyecto
            For Each m_Campo In m_SegNC.ColCampos
                m_SegNC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getSegsNCProyectoAccionesSinTareas Is Nothing Then
                Set getSegsNCProyectoAccionesSinTareas = New Scripting.Dictionary
                getSegsNCProyectoAccionesSinTareas.CompareMode = TextCompare
            End If
            If Not getSegsNCProyectoAccionesSinTareas.Exists(CStr(m_SegNC.IDNoConformidad)) Then
                getSegsNCProyectoAccionesSinTareas.Add CStr(m_SegNC.IDNoConformidad), m_SegNC
            End If
            Set m_SegNC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsNCProyectoAccionesSinTareas ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getSegsNCProyectoCENoConforme( _
                                                Optional p_Db As DAO.Database, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegNC As SegNCProyecto
    
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT TbNoConformidades.IDNoConformidad, TbNoConformidades.CodigoNoConformidad, " & _
            "TbNoConformidades.DESCRIPCION, TbExpedientes.Nemotecnico, TbNoConformidades.ESTADO, " & _
            "TbNoConformidades.RESPONSABLECALIDAD AS NombreCalidad, TbUsuariosAplicaciones.Nombre AS Tecnico, " & _
            "TbNoConformidades.IDExpediente, TbNoConformidades.RequiereControlEficacia, " & _
            "TbNoConformidades.ResultadoControlEficacia, TbNoConformidades.FECHACIERRE " & _
            "FROM (((TbNoConformidades INNER JOIN TbExpedientes ON TbNoConformidades.IDExpediente = TbExpedientes.IDExpediente) " & _
            "LEFT JOIN TbUsuariosAplicaciones ON TbNoConformidades.RESPONSABLETELEFONICA = TbUsuariosAplicaciones.UsuarioRed) " & _
            "INNER JOIN TbNCAccionCorrectivas ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad) " & _
            "INNER JOIN TbNCAccionesRealizadas ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva " & _
            "WHERE (((TbNoConformidades.ConformeControlEficacia)='No') " & _
            "AND (NOt(TbNCAccionesRealizadas.FechaFinReal) Is Null));"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_SegNC = New SegNCProyecto
            For Each m_Campo In m_SegNC.ColCampos
                m_SegNC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getSegsNCProyectoCENoConforme Is Nothing Then
                Set getSegsNCProyectoCENoConforme = New Scripting.Dictionary
                getSegsNCProyectoCENoConforme.CompareMode = TextCompare
            End If
            If Not getSegsNCProyectoCENoConforme.Exists(CStr(m_SegNC.IDNoConformidad)) Then
                getSegsNCProyectoCENoConforme.Add CStr(m_SegNC.IDNoConformidad), m_SegNC
            End If
            Set m_SegNC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsNCProyectoCENoConforme ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSegsNCProyectoCECaducada( _
                                                Optional p_Db As DAO.Database, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegNC As SegNCProyecto
    
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT TbNoConformidades.IDNoConformidad, TbNoConformidades.CodigoNoConformidad, " & _
            "TbNoConformidades.DESCRIPCION, TbExpedientes.Nemotecnico, TbNoConformidades.ESTADO, " & _
            "TbNoConformidades.RESPONSABLECALIDAD AS NombreCalidad, TbUsuariosAplicaciones.Nombre AS Tecnico, " & _
            "TbNoConformidades.IDExpediente, TbNoConformidades.RequiereControlEficacia, " & _
            "TbNoConformidades.ResultadoControlEficacia, TbNoConformidades.FECHACIERRE " & _
            "FROM (((TbNoConformidades INNER JOIN TbExpedientes " & _
            "ON TbNoConformidades.IDExpediente = TbExpedientes.IDExpediente) LEFT JOIN TbUsuariosAplicaciones " & _
            "ON TbNoConformidades.RESPONSABLETELEFONICA = TbUsuariosAplicaciones.UsuarioRed) " & _
            "INNER JOIN TbNCAccionCorrectivas ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad) " & _
            "INNER JOIN TbNCAccionesRealizadas " & _
            "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva " & _
            "WHERE ((Not(TbNCAccionesRealizadas.FechaFinReal) Is Null) " & _
            "AND ((TbNoConformidades.FechaControlEficacia) Is Null) " & _
            "AND ((TbNoConformidades.FechaPrevistaControlEficacia)<=Date()));"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_SegNC = New SegNCProyecto
            For Each m_Campo In m_SegNC.ColCampos
                m_SegNC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getSegsNCProyectoCECaducada Is Nothing Then
                Set getSegsNCProyectoCECaducada = New Scripting.Dictionary
                getSegsNCProyectoCECaducada.CompareMode = TextCompare
            End If
            If Not getSegsNCProyectoCECaducada.Exists(CStr(m_SegNC.IDNoConformidad)) Then
                getSegsNCProyectoCECaducada.Add CStr(m_SegNC.IDNoConformidad), m_SegNC
            End If
            Set m_SegNC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsNCProyectoCECaducada ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getSegsNCProyectoPteCE( _
                                                Optional p_Db As DAO.Database, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegNC As SegNCProyecto
    
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT TbNoConformidades.IDNoConformidad, TbNoConformidades.CodigoNoConformidad, " & _
            "TbNoConformidades.DESCRIPCION, TbExpedientes.Nemotecnico, TbNoConformidades.ESTADO, " & _
            "TbNoConformidades.RESPONSABLECALIDAD AS NombreCalidad, TbUsuariosAplicaciones.Nombre AS Tecnico, " & _
            "TbNoConformidades.IDExpediente, TbNoConformidades.RequiereControlEficacia, " & _
            "TbNoConformidades.ResultadoControlEficacia, TbNoConformidades.FECHACIERRE " & _
            "FROM (((TbNoConformidades INNER JOIN TbExpedientes " & _
            "ON TbNoConformidades.IDExpediente = TbExpedientes.IDExpediente) LEFT JOIN TbUsuariosAplicaciones " & _
            "ON TbNoConformidades.RESPONSABLETELEFONICA = TbUsuariosAplicaciones.UsuarioRed) " & _
            "INNER JOIN TbNCAccionCorrectivas ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad) " & _
            "INNER JOIN TbNCAccionesRealizadas " & _
            "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva " & _
            "WHERE ((Not(TbNCAccionesRealizadas.FechaFinReal) Is Null) " & _
            "AND ((TbNoConformidades.FechaControlEficacia) Is Null) " & _
            " AND (Not (TbNoConformidades.FechaPrevistaControlEficacia) Is Null));"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_SegNC = New SegNCProyecto
            For Each m_Campo In m_SegNC.ColCampos
                m_SegNC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getSegsNCProyectoPteCE Is Nothing Then
                Set getSegsNCProyectoPteCE = New Scripting.Dictionary
                getSegsNCProyectoPteCE.CompareMode = TextCompare
            End If
            If Not getSegsNCProyectoPteCE.Exists(CStr(m_SegNC.IDNoConformidad)) Then
                getSegsNCProyectoPteCE.Add CStr(m_SegNC.IDNoConformidad), m_SegNC
            End If
            Set m_SegNC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsNCProyectoPteCE ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSegsNCAuditoriaRegistradas( _
                                                Optional p_Db As DAO.Database, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegNC As SegNCAuditoria
    
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT TbNoConformidadesAuditoria.ID,TbNoConformidadesAuditoria.Numero,TbAuditorias.IDAuditoria, " & _
            "Format(Year([TbAuditorias].[FechaInicio]),'0000') & '_' & TbAuditorias.Tipo AS Auditoria, " & _
            "TbNoConformidadesAuditoria.Numero, TbNoConformidadesAuditoria.DESCRIPCION,TbNoConformidadesAuditoria.FECHACIERRE, " & _
            "TbNoConformidadesAuditoria.RESPONSABLEIMPLANTACION as responsable, TbNoConformidadesAuditoria.ESTADO " & _
            "FROM (TbAuditorias INNER JOIN TbNoConformidadesAuditoria " & _
            "ON TbAuditorias.IDAuditoria = TbNoConformidadesAuditoria.IDAuditoria) " & _
            "LEFT JOIN TbNCAuditoriaAccionCorrectivas " & _
            "ON TbNoConformidadesAuditoria.ID = TbNCAuditoriaAccionCorrectivas.ID " & _
            "WHERE (((TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva) Is Null) " & _
            "AND ((TbNoConformidadesAuditoria.RequiereAccionCorrectiva)='Sí')AND TbNoConformidadesAuditoria.Borrado=False);"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_SegNC = New SegNCAuditoria
            For Each m_Campo In m_SegNC.ColCampos
                m_SegNC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getSegsNCAuditoriaRegistradas Is Nothing Then
                Set getSegsNCAuditoriaRegistradas = New Scripting.Dictionary
                getSegsNCAuditoriaRegistradas.CompareMode = TextCompare
            End If
            If Not getSegsNCAuditoriaRegistradas.Exists(CStr(m_SegNC.id)) Then
                getSegsNCAuditoriaRegistradas.Add CStr(m_SegNC.id), m_SegNC
            End If
            Set m_SegNC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsNCAuditoriaRegistradas ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSegsNCAuditoriaTotales( _
                                                Optional p_Db As DAO.Database, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegNC As SegNCAuditoria
    
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT TbNoConformidadesAuditoria.ID, TbNoConformidadesAuditoria.Numero, TbAuditorias.IDAuditoria, " & _
            "Format(Year([TbAuditorias].[FechaInicio]),'0000') & '_' & TbAuditorias.Tipo AS Auditoria, " & _
            "TbNoConformidadesAuditoria.Numero, TbNoConformidadesAuditoria.DESCRIPCION, " & _
            "TbNoConformidadesAuditoria.FECHACIERRE, TbNoConformidadesAuditoria.RESPONSABLEIMPLANTACION AS responsable, " & _
            "TbNoConformidadesAuditoria.ESTADO " & _
            "FROM (TbAuditorias INNER JOIN TbNoConformidadesAuditoria " & _
            "ON TbAuditorias.IDAuditoria = TbNoConformidadesAuditoria.IDAuditoria) " & _
            "LEFT JOIN TbNCAuditoriaAccionCorrectivas ON TbNoConformidadesAuditoria.ID = TbNCAuditoriaAccionCorrectivas.ID " & _
            "WHERE (((TbNoConformidadesAuditoria.Borrado)=False));"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_SegNC = New SegNCAuditoria
            For Each m_Campo In m_SegNC.ColCampos
                m_SegNC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getSegsNCAuditoriaTotales Is Nothing Then
                Set getSegsNCAuditoriaTotales = New Scripting.Dictionary
                getSegsNCAuditoriaTotales.CompareMode = TextCompare
            End If
            If Not getSegsNCAuditoriaTotales.Exists(CStr(m_SegNC.id)) Then
                getSegsNCAuditoriaTotales.Add CStr(m_SegNC.id), m_SegNC
            End If
            Set m_SegNC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsNCAuditoriaTotales ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSegsNCAuditoriaAccionesSinTareas( _
                                                    Optional p_Db As DAO.Database, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegNC As SegNCAuditoria
    
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT TbNoConformidadesAuditoria.ID,TbNoConformidadesAuditoria.Numero, TbAuditorias.IDAuditoria, " & _
            "Format(Year([TbAuditorias].[FechaInicio]),'0000') & '_' & TbAuditorias.Tipo AS Auditoria, " & _
            "TbNoConformidadesAuditoria.Numero, TbNoConformidadesAuditoria.DESCRIPCION,TbNoConformidadesAuditoria.FECHACIERRE, " & _
            "TbNoConformidadesAuditoria.RESPONSABLEIMPLANTACION as responsable, TbNoConformidadesAuditoria.ESTADO " & _
            "FROM ((TbAuditorias INNER JOIN TbNoConformidadesAuditoria " & _
            "ON TbAuditorias.IDAuditoria = TbNoConformidadesAuditoria.ID) " & _
            "INNER JOIN TbNCAuditoriaAccionCorrectivas " & _
            "ON TbNoConformidadesAuditoria.ID = TbNCAuditoriaAccionCorrectivas.ID) " & _
            "LEFT JOIN TbNCAuditoriaAccionesRealizadas " & _
            "ON TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva = TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva " & _
            "WHERE (((TbNoConformidadesAuditoria.RequiereAccionCorrectiva)='Sí') " & _
            "AND ((TbNCAuditoriaAccionesRealizadas.IDAccionRealizada) Is Null));"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_SegNC = New SegNCAuditoria
            For Each m_Campo In m_SegNC.ColCampos
                m_SegNC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getSegsNCAuditoriaAccionesSinTareas Is Nothing Then
                Set getSegsNCAuditoriaAccionesSinTareas = New Scripting.Dictionary
                getSegsNCAuditoriaAccionesSinTareas.CompareMode = TextCompare
            End If
            If Not getSegsNCAuditoriaAccionesSinTareas.Exists(CStr(m_SegNC.id)) Then
                getSegsNCAuditoriaAccionesSinTareas.Add CStr(m_SegNC.id), m_SegNC
            End If
            Set m_SegNC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsNCAuditoriaAccionesSinTareas ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSegsNCAuditoriaPteCE( _
                                            Optional p_Db As DAO.Database, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegNC As SegNCAuditoria
    
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT TbNoConformidadesAuditoria.ID,TbNoConformidadesAuditoria.Numero, TbAuditorias.IDAuditoria, " & _
            "Format(Year([TbAuditorias].[FechaInicio]),'0000') & '_' & TbAuditorias.Tipo AS Auditoria, " & _
            "TbNoConformidadesAuditoria.Numero, TbNoConformidadesAuditoria.DESCRIPCION,TbNoConformidadesAuditoria.FECHACIERRE, " & _
            "TbNoConformidadesAuditoria.RESPONSABLEIMPLANTACION as responsable, TbNoConformidadesAuditoria.ESTADO " & _
            "FROM ((TbAuditorias INNER JOIN TbNoConformidadesAuditoria " & _
            "ON TbAuditorias.IDAuditoria = TbNoConformidadesAuditoria.ID) " & _
            "INNER JOIN TbNCAuditoriaAccionCorrectivas " & _
            "ON TbNoConformidadesAuditoria.ID = TbNCAuditoriaAccionCorrectivas.ID) " & _
            "INNER JOIN TbNCAuditoriaAccionesRealizadas " & _
            "ON TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva = TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva " & _
            "WHERE (((TbNoConformidadesAuditoria.RequiereControlEficacia)='Sí') " & _
            "AND (Not(TbNCAuditoriaAccionesRealizadas.FechaFinReal) Is Null) " & _
            "AND ((TbNoConformidadesAuditoria.ResultadoControlEficacia) Is Null));"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_SegNC = New SegNCAuditoria
            For Each m_Campo In m_SegNC.ColCampos
                m_SegNC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getSegsNCAuditoriaPteCE Is Nothing Then
                Set getSegsNCAuditoriaPteCE = New Scripting.Dictionary
                getSegsNCAuditoriaPteCE.CompareMode = TextCompare
            End If
            If Not getSegsNCAuditoriaPteCE.Exists(CStr(m_SegNC.id)) Then
                getSegsNCAuditoriaPteCE.Add CStr(m_SegNC.id), m_SegNC
            End If
            Set m_SegNC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsNCAuditoriaPteCE ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSegsNCAuditoriaCECaducada( _
                                                    Optional p_Db As DAO.Database, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegNC As SegNCAuditoria
    
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT TbNoConformidadesAuditoria.ID,TbNoConformidadesAuditoria.Numero, TbAuditorias.IDAuditoria, " & _
            "Format(Year([TbAuditorias].[FechaInicio]),'0000') & '_' & TbAuditorias.Tipo AS Auditoria, " & _
            "TbNoConformidadesAuditoria.Numero, TbNoConformidadesAuditoria.DESCRIPCION,TbNoConformidadesAuditoria.FECHACIERRE, " & _
            "TbNoConformidadesAuditoria.RESPONSABLEIMPLANTACION as responsable, TbNoConformidadesAuditoria.ESTADO " & _
            "FROM ((TbAuditorias INNER JOIN TbNoConformidadesAuditoria " & _
            "ON TbAuditorias.IDAuditoria = TbNoConformidadesAuditoria.ID) " & _
            "INNER JOIN TbNCAuditoriaAccionCorrectivas " & _
            "ON TbNoConformidadesAuditoria.ID = TbNCAuditoriaAccionCorrectivas.ID) " & _
            "INNER JOIN TbNCAuditoriaAccionesRealizadas " & _
            "ON TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva = TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva " & _
            "WHERE (((TbNoConformidadesAuditoria.RequiereControlEficacia)='Sí') " & _
            "AND (Not(TbNCAuditoriaAccionesRealizadas.FechaFinReal) Is Null) " & _
            "AND ((TbNoConformidadesAuditoria.FechaControlEficacia) Is Null) " & _
            "AND ((TbNoConformidadesAuditoria.FechaPrevistaControlEficacia)<=Date()));"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_SegNC = New SegNCAuditoria
            For Each m_Campo In m_SegNC.ColCampos
                m_SegNC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getSegsNCAuditoriaCECaducada Is Nothing Then
                Set getSegsNCAuditoriaCECaducada = New Scripting.Dictionary
                getSegsNCAuditoriaCECaducada.CompareMode = TextCompare
            End If
            If Not getSegsNCAuditoriaCECaducada.Exists(CStr(m_SegNC.id)) Then
                getSegsNCAuditoriaCECaducada.Add CStr(m_SegNC.id), m_SegNC
            End If
            Set m_SegNC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsNCAuditoriaCECaducada ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getSegsNCAuditoriaCENoConforme( _
                                                    Optional p_Db As DAO.Database, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_SegNC As SegNCAuditoria
    
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT TbNoConformidadesAuditoria.ID,TbNoConformidadesAuditoria.Numero, TbAuditorias.IDAuditoria, " & _
            "Format(Year([TbAuditorias].[FechaInicio]),'0000') & '_' & TbAuditorias.Tipo AS Auditoria, " & _
            "TbNoConformidadesAuditoria.Numero, TbNoConformidadesAuditoria.DESCRIPCION,TbNoConformidadesAuditoria.FECHACIERRE, " & _
            "TbNoConformidadesAuditoria.RESPONSABLEIMPLANTACION as responsable, TbNoConformidadesAuditoria.ESTADO " & _
            "FROM ((TbAuditorias INNER JOIN TbNoConformidadesAuditoria " & _
            "ON TbAuditorias.IDAuditoria = TbNoConformidadesAuditoria.ID) " & _
            "INNER JOIN TbNCAuditoriaAccionCorrectivas " & _
            "ON TbNoConformidadesAuditoria.ID = TbNCAuditoriaAccionCorrectivas.ID) " & _
            "INNER JOIN TbNCAuditoriaAccionesRealizadas " & _
            "ON TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva = TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva " & _
            "WHERE (((TbNoConformidadesAuditoria.RequiereControlEficacia)='Sí') " & _
            "AND (Not(TbNCAuditoriaAccionesRealizadas.FechaFinReal) Is Null) " & _
            "AND (Not (TbNoConformidadesAuditoria.FechaControlEficacia) Is Null) " & _
            "AND ((TbNoConformidadesAuditoria.ConformeControlEficacia)='No'));"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_SegNC = New SegNCAuditoria
            For Each m_Campo In m_SegNC.ColCampos
                m_SegNC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getSegsNCAuditoriaCENoConforme Is Nothing Then
                Set getSegsNCAuditoriaCENoConforme = New Scripting.Dictionary
                getSegsNCAuditoriaCENoConforme.CompareMode = TextCompare
            End If
            If Not getSegsNCAuditoriaCENoConforme.Exists(CStr(m_SegNC.id)) Then
                getSegsNCAuditoriaCENoConforme.Add CStr(m_SegNC.id), m_SegNC
            End If
            Set m_SegNC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getSegsNCAuditoriaCENoConforme ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getARsAuditoriaSeguimiento( _
                                            Optional p_Db As DAO.Database, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ARAuditoria As ARAuditoria
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * " & _
            "FROM TbNCAuditoriaAccionesRealizadas  " & _
            "WHERE ESTADO='PTEREPLANIFICAR' OR ESTADO='IRREGULAR' ;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ARAuditoria = New ARAuditoria
            For Each m_Campo In m_ARAuditoria.ColCampos
                m_ARAuditoria.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getARsAuditoriaSeguimiento Is Nothing Then
                Set getARsAuditoriaSeguimiento = New Scripting.Dictionary
                getARsAuditoriaSeguimiento.CompareMode = TextCompare
            End If
            If Not getARsAuditoriaSeguimiento.Exists(CStr(m_ARAuditoria.IDAccionRealizada)) Then
                getARsAuditoriaSeguimiento.Add CStr(m_ARAuditoria.IDAccionRealizada), m_ARAuditoria
            End If
            Set m_ARAuditoria = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getARsAuditoriaSeguimiento ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getARsAuditoriaSeguimientoActivas( _
                                                    Optional p_Db As DAO.Database, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ARAuditoria As ARAuditoria
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * " & _
            "FROM TbNCAuditoriaAccionesRealizadas  " & _
            "WHERE Not ESTADO Like 'FINALIZADA' ;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ARAuditoria = New ARAuditoria
            For Each m_Campo In m_ARAuditoria.ColCampos
                m_ARAuditoria.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getARsAuditoriaSeguimientoActivas Is Nothing Then
                Set getARsAuditoriaSeguimientoActivas = New Scripting.Dictionary
                getARsAuditoriaSeguimientoActivas.CompareMode = TextCompare
            End If
            If Not getARsAuditoriaSeguimientoActivas.Exists(CStr(m_ARAuditoria.IDAccionRealizada)) Then
                getARsAuditoriaSeguimientoActivas.Add CStr(m_ARAuditoria.IDAccionRealizada), m_ARAuditoria
            End If
            Set m_ARAuditoria = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getARsAuditoriaSeguimientoActivas ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getARsAuditorias( _
                                    Optional p_Db As DAO.Database, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_AR As ARAuditoria
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "TbNCAuditoriaAccionesRealizadas"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_AR = New ARAuditoria
            For Each m_Campo In m_AR.ColCampos
                m_AR.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getARsAuditorias Is Nothing Then
                Set getARsAuditorias = New Scripting.Dictionary
                getARsAuditorias.CompareMode = TextCompare
            End If
            If Not getARsAuditorias.Exists(CStr(m_AR.IDAccionRealizada)) Then
                getARsAuditorias.Add CStr(m_AR.IDAccionRealizada), m_AR
            End If
            Set m_AR = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getARsAuditorias ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getJefesProyecto( _
                                    Optional p_Db As DAO.Database, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    'aquellos usuarios que están como Jefes de proyecto en todos los expedientes con Pecal,además hay que meter a los de calidad
    
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_JP As usuario
    
    
    On Error GoTo errores
   If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
     m_SQL = "SELECT DISTINCT TbUsuariosAplicaciones.* " & _
            "FROM (TbExpedientesResponsables INNER JOIN TbExpedientes " & _
            "ON TbExpedientesResponsables.IdExpediente = TbExpedientes.IDExpediente) " & _
            "INNER JOIN TbUsuariosAplicaciones ON TbExpedientesResponsables.IdUsuario = TbUsuariosAplicaciones.Id " & _
            "ORDER BY TbUsuariosAplicaciones.Nombre;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            .MoveFirst
            Do While Not .EOF
                Set m_JP = New usuario
                For Each m_Campo In m_JP.ColCampos
                    m_JP.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                    If p_Error <> "" Then
                        Err.Raise 1000
                    End If
                Next
                If getJefesProyecto Is Nothing Then
                    Set getJefesProyecto = New Scripting.Dictionary
                    getJefesProyecto.CompareMode = TextCompare
                End If
                If Not getJefesProyecto.Exists(CStr(m_JP.UsuarioRed)) Then
                    getJefesProyecto.Add CStr(m_JP.UsuarioRed), m_JP
                End If
                Set m_JP = Nothing
                .MoveNext
            Loop
        End If
        
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    'ahora los que ya son responsables en las NoConformidades existentes
   m_SQL = "SELECT distinct TbUsuariosAplicaciones.* " & _
            "FROM TbNoConformidades INNER JOIN TbUsuariosAplicaciones " & _
            "ON TbNoConformidades.RESPONSABLETELEFONICA = TbUsuariosAplicaciones.UsuarioRed " & _
            "ORDER BY TbUsuariosAplicaciones.Nombre; "
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            .MoveFirst
            Do While Not .EOF
                Set m_JP = New usuario
                For Each m_Campo In m_JP.ColCampos
                    m_JP.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                    If p_Error <> "" Then
                        Err.Raise 1000
                    End If
                Next
                If getJefesProyecto Is Nothing Then
                    Set getJefesProyecto = New Scripting.Dictionary
                    getJefesProyecto.CompareMode = TextCompare
                End If
                If Not getJefesProyecto.Exists(CStr(m_JP.UsuarioRed)) Then
                    getJefesProyecto.Add CStr(m_JP.UsuarioRed), m_JP
                End If
                Set m_JP = Nothing
                .MoveNext
            Loop
        End If
        
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getJefesProyecto ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getAuditoria( _
                                Optional p_ID As String, _
                                Optional p_Db As DAO.Database, _
                                Optional ByRef p_Error As String _
                                ) As Auditoria

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
        
    
    On Error GoTo errores
    If p_ID = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * FROM " & _
            "TbAuditorias " & _
            "WHERE IDAuditoria=" & p_ID & ";"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
       Set getAuditoria = New Auditoria
        For Each m_Campo In getAuditoria.ColCampos
            getAuditoria.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
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
        p_Error = "El método getAuditoria ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getAuditorias( _
                                Optional p_Db As DAO.Database, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary

    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Auditoria As Auditoria
    
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
     m_SQL = "SELECT * " & _
            "FROM TbAuditorias ORDER BY IDAuditoria DESC;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Auditoria = New Auditoria
            For Each m_Campo In m_Auditoria.ColCampos
                m_Auditoria.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getAuditorias Is Nothing Then
                Set getAuditorias = New Scripting.Dictionary
                getAuditorias.CompareMode = TextCompare
            End If
            If Not getAuditorias.Exists(CStr(m_Auditoria.IDAuditoria)) Then
                getAuditorias.Add CStr(m_Auditoria.IDAuditoria), m_Auditoria
            End If
            Set m_Auditoria = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getAuditorias ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getDocumentosAuditoria( _
                                        Optional p_IDAuditoria As String, _
                                        Optional p_IDNC As String, _
                                        Optional p_IDAR As String, _
                                        Optional p_Db As DAO.Database, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Documento As DocumentoAuditoria
    
    On Error GoTo errores
    If p_IDAuditoria = "" And p_IDNC = "" And p_IDAR = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    If p_IDAuditoria <> "" Then
        m_SQL = "SELECT * FROM " & _
                "TbDocumentosAuditorias " & _
                "WHERE IDAuditoria=" & p_IDAuditoria & ";"
    ElseIf p_IDNC <> "" Then
        m_SQL = "SELECT * FROM " & _
                "TbDocumentosAuditorias " & _
                "WHERE IDNoConformidad=" & p_IDNC & ";"
    Else
        m_SQL = "SELECT * FROM " & _
                "TbDocumentosAuditorias " & _
                "WHERE IDAccionRealizada=" & p_IDAR & ";"
    End If
    
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_Documento = New DocumentoAuditoria
            For Each m_Campo In m_Documento.ColCampos
                m_Documento.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getDocumentosAuditoria Is Nothing Then
                Set getDocumentosAuditoria = New Scripting.Dictionary
                getDocumentosAuditoria.CompareMode = TextCompare
            End If
            If Not getDocumentosAuditoria.Exists(CStr(m_Documento.IDDocumento)) Then
                getDocumentosAuditoria.Add CStr(m_Documento.IDDocumento), m_Documento
            End If
            Set m_Documento = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getDocumentosAuditoria ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getDocumentosCompletosAuditoria( _
                                                    Optional p_IDNC As String, _
                                                    Optional p_Db As DAO.Database, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_Documento As DocumentoAuditoria
    
    On Error GoTo errores
    If p_IDNC = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
     m_SQL = "SELECT * FROM " & _
            "TbDocumentosAuditorias " & _
            "WHERE IDNoConformidad=" & p_IDNC & ";"
    
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            .MoveFirst
            Do While Not .EOF
                Set m_Documento = New DocumentoAuditoria
                For Each m_Campo In m_Documento.ColCampos
                    m_Documento.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                    If p_Error <> "" Then
                        Err.Raise 1000
                    End If
                Next
                If getDocumentosCompletosAuditoria Is Nothing Then
                    Set getDocumentosCompletosAuditoria = New Scripting.Dictionary
                    getDocumentosCompletosAuditoria.CompareMode = TextCompare
                End If
                If Not getDocumentosCompletosAuditoria.Exists(CStr(m_Documento.IDDocumento)) Then
                    getDocumentosCompletosAuditoria.Add CStr(m_Documento.IDDocumento), m_Documento
                End If
                Set m_Documento = Nothing
                .MoveNext
            Loop
        End If
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    m_SQL = "SELECT TbDocumentosAuditorias.* " & _
            "FROM (TbNCAuditoriaAccionCorrectivas INNER JOIN TbNCAuditoriaAccionesRealizadas " & _
            "ON TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva = TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva) " & _
            "INNER JOIN TbDocumentosAuditorias " & _
            "ON TbNCAuditoriaAccionesRealizadas.IDAccionRealizada = TbDocumentosAuditorias.IDAccionRealizada " & _
            "WHERE (((TbNCAuditoriaAccionCorrectivas.ID)=" & p_IDNC & "));"
    
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If Not .EOF Then
            .MoveFirst
            Do While Not .EOF
                Set m_Documento = New DocumentoAuditoria
                For Each m_Campo In m_Documento.ColCampos
                    m_Documento.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                    If p_Error <> "" Then
                        Err.Raise 1000
                    End If
                Next
                If getDocumentosCompletosAuditoria Is Nothing Then
                    Set getDocumentosCompletosAuditoria = New Scripting.Dictionary
                    getDocumentosCompletosAuditoria.CompareMode = TextCompare
                End If
                If Not getDocumentosCompletosAuditoria.Exists(CStr(m_Documento.IDDocumento)) Then
                    getDocumentosCompletosAuditoria.Add CStr(m_Documento.IDDocumento), m_Documento
                End If
                Set m_Documento = Nothing
                .MoveNext
            Loop
        End If
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getDocumentosCompletosAuditoria ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getACAuditoria( _
                                Optional p_IDAC As String, _
                                Optional p_Db As DAO.Database, _
                                Optional ByRef p_Error As String _
                                ) As ACAuditoria

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
        
    
    On Error GoTo errores
    If p_IDAC = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * FROM " & _
            "TbNCAuditoriaAccionCorrectivas " & _
            "WHERE IDAccionCorrectiva=" & p_IDAC & ";"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
       Set getACAuditoria = New ACAuditoria
        For Each m_Campo In getACAuditoria.ColCampos
            getACAuditoria.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
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
        p_Error = "El método getACAuditoria ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getACsAuditoria( _
                                Optional p_IDNC As String, _
                                Optional p_EnumOrden As EnumOrden, _
                                Optional p_Db As DAO.Database, _
                                Optional ByRef p_Error As String _
                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ACAuditoria As ACAuditoria
     Dim m_OrderBy As String
    Dim m_Resultado As String
    On Error GoTo errores
    If p_IDNC = "" Then
        Exit Function
    End If
    
    If p_EnumOrden = Empty Then
        p_EnumOrden = EnumOrden.PorNAccion
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    If Not m_ObjEntorno.ColEnumOrdenOrderBy.Exists(CStr(p_EnumOrden)) Then
        p_Error = "No se puede saber el orden que se desea"
        Err.Raise 1000
    End If
    m_Resultado = m_ObjEntorno.ColEnumOrdenOrderBy(CStr(p_EnumOrden))
    If InStr(1, m_Resultado, "|") = 0 Then
        p_Error = "No se puede saber el orden que se desea"
        Err.Raise 1000
    End If
    dato = Split(m_Resultado, "|")
    m_OrderBy = dato(0)
    m_SQL = "SELECT * FROM " & _
            "TbNCAuditoriaAccionCorrectivas " & _
            "WHERE ID=" & p_IDNC & " " & _
            m_OrderBy & ";"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ACAuditoria = New ACAuditoria
            For Each m_Campo In m_ACAuditoria.ColCampos
                m_ACAuditoria.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getACsAuditoria Is Nothing Then
                Set getACsAuditoria = New Scripting.Dictionary
                getACsAuditoria.CompareMode = TextCompare
            End If
            If Not getACsAuditoria.Exists(CStr(m_ACAuditoria.IdAccionCorrectiva)) Then
                getACsAuditoria.Add CStr(m_ACAuditoria.IdAccionCorrectiva), m_ACAuditoria
            End If
            Set m_ACAuditoria = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getACsAuditoria ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getACsAuditoriasSinFinalizar( _
                                                p_IDNC As String, _
                                                Optional p_Db As DAO.Database, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ARAuditoria As ARAuditoria
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT TbNCAuditoriaAccionesRealizadas.* " & _
            "FROM TbNCAuditoriaAccionCorrectivas INNER JOIN TbNCAuditoriaAccionesRealizadas " & _
            "ON TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva = TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva " & _
            "WHERE (((TbNCAuditoriaAccionCorrectivas.ID)=" & p_IDNC & ") " & _
            "AND ((TbNCAuditoriaAccionesRealizadas.FechaFinReal) Is Null));"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ARAuditoria = New ARAuditoria
            For Each m_Campo In m_ARAuditoria.ColCampos
                m_ARAuditoria.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getACsAuditoriasSinFinalizar Is Nothing Then
                Set getACsAuditoriasSinFinalizar = New Scripting.Dictionary
                getACsAuditoriasSinFinalizar.CompareMode = TextCompare
            End If
            If Not getACsAuditoriasSinFinalizar.Exists(CStr(m_ARAuditoria.IDAccionRealizada)) Then
                getACsAuditoriasSinFinalizar.Add CStr(m_ARAuditoria.IDAccionRealizada), m_ARAuditoria
            End If
            Set m_ARAuditoria = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getACsAuditoriasSinFinalizar ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getACsDeAuditorias( _
                                    Optional p_Db As DAO.Database, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_AC As ACAuditoria
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "TbNCAuditoriaAccionCorrectivas"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_AC = New ACAuditoria
            For Each m_Campo In m_AC.ColCampos
                m_AC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getACsDeAuditorias Is Nothing Then
                Set getACsDeAuditorias = New Scripting.Dictionary
                getACsDeAuditorias.CompareMode = TextCompare
            End If
            If Not getACsDeAuditorias.Exists(CStr(m_AC.IdAccionCorrectiva)) Then
                getACsDeAuditorias.Add CStr(m_AC.IdAccionCorrectiva), m_AC
            End If
            Set m_AC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getACsDeAuditorias ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getACsAuditoriasSinAR( _
                                        p_IDNC As String, _
                                        Optional p_Db As DAO.Database, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_AC As ACAuditoria
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT DISTINCT TbNCAuditoriaAccionCorrectivas.* " & _
            "FROM TbNCAuditoriaAccionCorrectivas LEFT JOIN TbNCAuditoriaAccionesRealizadas " & _
            "ON TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva = TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva " & _
            "WHERE (((TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva) Is Null) " & _
            "AND ((TbNCAuditoriaAccionCorrectivas.ID)=" & p_IDNC & "));"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_AC = New ACAuditoria
            For Each m_Campo In m_AC.ColCampos
                m_AC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getACsAuditoriasSinAR Is Nothing Then
                Set getACsAuditoriasSinAR = New Scripting.Dictionary
                getACsAuditoriasSinAR.CompareMode = TextCompare
            End If
            If Not getACsAuditoriasSinAR.Exists(CStr(m_AC.IdAccionCorrectiva)) Then
                getACsAuditoriasSinAR.Add CStr(m_AC.IdAccionCorrectiva), m_AC
            End If
            Set m_AC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getACsAuditoriasSinAR ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getACsProyectosSinAR( _
                                        p_IDNC As String, _
                                        Optional p_Db As DAO.Database, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_AC As ACProyecto
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT DISTINCT TbNCAccionCorrectivas.* " & _
            "FROM TbNCAccionCorrectivas LEFT JOIN TbNCAccionesRealizadas " & _
            "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva " & _
            "WHERE (((TbNCAccionesRealizadas.IDAccionCorrectiva) Is Null) " & _
            "AND ((TbNCAccionCorrectivas.IDNoConformidad)=" & p_IDNC & "));"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_AC = New ACProyecto
            For Each m_Campo In m_AC.ColCampos
                m_AC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getACsProyectosSinAR Is Nothing Then
                Set getACsProyectosSinAR = New Scripting.Dictionary
                getACsProyectosSinAR.CompareMode = TextCompare
            End If
            If Not getACsProyectosSinAR.Exists(CStr(m_AC.IdAccionCorrectiva)) Then
                getACsProyectosSinAR.Add CStr(m_AC.IdAccionCorrectiva), m_AC
            End If
            Set m_AC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getACsProyectosSinAR ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getCodRiesgosAsociados( _
                                        p_IDNC As String, _
                                        Optional p_Db As DAO.Database, _
                                        Optional ByRef p_Error As String _
                                        ) As String

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_CodRiesgo As String
    Dim m_Resultado As String
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT TbRiesgos.CodigoRiesgo " & _
            "FROM TbRiesgos INNER JOIN TbRiesgosNC ON TbRiesgos.IDRiesgo = TbRiesgosNC.IDRiesgo " & _
            "WHERE (((TbRiesgosNC.IDNC)=" & p_IDNC & "));"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            m_CodRiesgo = Nz(.Fields("CodigoRiesgo"), "")
            
            If m_CodRiesgo <> "" Then
                If m_Resultado = "" Then
                    m_Resultado = m_CodRiesgo
                Else
                    m_Resultado = m_Resultado & "|" & m_CodRiesgo
                End If
               
            End If
            
            
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    getCodRiesgosAsociados = m_Resultado
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getCodRiesgosAsociados ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getNCAuditoria( _
                                Optional p_IDNC As String, _
                                Optional p_IDAC As String, _
                                Optional p_Db As DAO.Database, _
                                Optional ByRef p_Error As String _
                                ) As NCAuditoria

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
        
    
    On Error GoTo errores
    If p_IDNC = "" And p_IDAC = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    If p_IDNC <> "" Then
         m_SQL = "SELECT * FROM " & _
            "TbNoConformidadesAuditoria " & _
            "WHERE ID=" & p_IDNC & ";"
    Else
        m_SQL = "SELECT TbNoConformidadesAuditoria.* " & _
                "FROM TbNoConformidadesAuditoria INNER JOIN TbNCAuditoriaAccionCorrectivas " & _
                "ON TbNoConformidadesAuditoria.ID = TbNCAuditoriaAccionCorrectivas.ID " & _
                "WHERE (((TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva)=" & p_IDAC & "));"
    End If
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
       Set getNCAuditoria = New NCAuditoria
        For Each m_Campo In getNCAuditoria.ColCampos
            getNCAuditoria.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
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
        p_Error = "El método getNCAuditoria ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getARsDeACAuditoria( _
                                        p_IDAC As String, _
                                        Optional p_EnumOrden As EnumOrden, _
                                        Optional p_Db As DAO.Database, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ARAuditoria As ARAuditoria
    Dim m_OrderBy As String
    Dim m_Resultado As String
    Dim dato As Variant
    On Error GoTo errores
    If p_IDAC = "" Then
        Exit Function
    End If
    If p_EnumOrden = Empty Then
        p_EnumOrden = EnumOrden.PorNAccion
    End If
    If Not m_ObjEntorno.ColEnumOrdenOrderBy.Exists(CStr(p_EnumOrden)) Then
        p_Error = "No se puede saber el orden que se desea"
        Err.Raise 1000
    End If
    m_Resultado = m_ObjEntorno.ColEnumOrdenOrderBy(CStr(p_EnumOrden))
    If InStr(1, m_Resultado, "|") = 0 Then
        p_Error = "No se puede saber el orden que se desea"
        Err.Raise 1000
    End If
    dato = Split(m_Resultado, "|")
    m_OrderBy = dato(1)
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
     m_SQL = "SELECT * FROM " & _
             "TbNCAuditoriaAccionesRealizadas " & _
             "WHERE IDAccionCorrectiva=" & p_IDAC & " " & _
            m_OrderBy & ";"

    
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ARAuditoria = New ARAuditoria
            For Each m_Campo In m_ARAuditoria.ColCampos
                m_ARAuditoria.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getARsDeACAuditoria Is Nothing Then
                Set getARsDeACAuditoria = New Scripting.Dictionary
                getARsDeACAuditoria.CompareMode = TextCompare
            End If
            If Not getARsDeACAuditoria.Exists(CStr(m_ARAuditoria.IDAccionRealizada)) Then
                getARsDeACAuditoria.Add CStr(m_ARAuditoria.IDAccionRealizada), m_ARAuditoria
            End If
            Set m_ARAuditoria = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getARsDeACAuditoria ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getARAuditoria( _
                                    Optional p_IDAR As String, _
                                     Optional p_Db As DAO.Database, _
                                    Optional ByRef p_Error As String _
                                    ) As ARAuditoria

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
        
    
    On Error GoTo errores
    If p_IDAR = "" Then
        Exit Function
    End If
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * FROM " & _
            "TbNCAuditoriaAccionesRealizadas " & _
            "WHERE IDAccionRealizada=" & p_IDAR & ";"
   
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
       Set getARAuditoria = New ARAuditoria
        For Each m_Campo In getARAuditoria.ColCampos
            getARAuditoria.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
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
        p_Error = "El método getARAuditoria ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getAuditoriasNombres( _
                                    p_col As Scripting.Dictionary, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary

    
    Dim m_ID As Variant
    Dim m_Auditoria As Auditoria
    Dim m_Nombre As String
    
    On Error GoTo errores
   
    If p_col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In p_col
        Set m_Auditoria = p_col(m_ID)
        m_Nombre = m_Auditoria.NombreAuditoria
        p_Error = m_Auditoria.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_Nombre <> "" Then
            If getAuditoriasNombres Is Nothing Then
                Set getAuditoriasNombres = New Scripting.Dictionary
                getAuditoriasNombres.CompareMode = TextCompare
            End If
            If Not getAuditoriasNombres.Exists(m_Nombre) Then
                getAuditoriasNombres.Add m_Nombre, m_Nombre
            End If
        End If
        
        Set m_Auditoria = Nothing
    Next
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getAuditoriasNombres ha devuelto el error: " & Err.Description
    End If
End Function


Public Function getNCsAuditoria( _
                                p_ID As String, _
                                Optional p_Db As DAO.Database, _
                                Optional ByRef p_Error As String _
                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NC As NCAuditoria
  
    On Error GoTo errores
    
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
     m_SQL = "SELECT *  " & _
            "FROM TbNoConformidadesAuditoria " & _
            "WHERE IDAuditoria=" & p_ID & ";"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_NC = New NCAuditoria
            For Each m_Campo In m_NC.ColCampos
                m_NC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getNCsAuditoria Is Nothing Then
                Set getNCsAuditoria = New Scripting.Dictionary
                getNCsAuditoria.CompareMode = TextCompare
            End If
            If Not getNCsAuditoria.Exists(CStr(m_NC.id)) Then
                getNCsAuditoria.Add CStr(m_NC.id), m_NC
            End If
            Set m_NC = Nothing
            .MoveNext
        Loop
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsAuditoria ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getNCsAuditoriasTotales( _
                                        Optional p_Db As DAO.Database, _
                                        Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NC As NCAuditoria
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT * " & _
            "FROM TbNoConformidadesAuditoria " & _
            "ORDER BY Tipo,Numero;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_NC = New NCAuditoria
            For Each m_Campo In m_NC.ColCampos
               ' Debug.Print m_Campo
               'If CStr(m_Campo) = "ResultadoControlEficacia" Then Stop
                m_NC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getNCsAuditoriasTotales Is Nothing Then
                Set getNCsAuditoriasTotales = New Scripting.Dictionary
                getNCsAuditoriasTotales.CompareMode = TextCompare
            End If
            If Not getNCsAuditoriasTotales.Exists(CStr(m_NC.id)) Then
                getNCsAuditoriasTotales.Add CStr(m_NC.id), m_NC
            End If
            Set m_NC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsAuditoriasTotales ha devuelto el error: " & Err.Description
    End If
End Function


Public Function getNCsAuditoriaPorPalabraClave( _
                                                p_PC As String, _
                                                Optional p_Db As DAO.Database, _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NC As NCAuditoria
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT TbNoConformidadesAuditoria.* " & _
            "FROM (TbNoConformidadesAuditoria LEFT JOIN TbNCAuditoriaAccionCorrectivas " & _
            "ON TbNoConformidadesAuditoria.ID = TbNCAuditoriaAccionCorrectivas.ID) " & _
            "LEFT JOIN TbNCAuditoriaAccionesRealizadas " & _
            "ON TbNCAuditoriaAccionCorrectivas.IDAccionCorrectiva = TbNCAuditoriaAccionesRealizadas.IDAccionCorrectiva " & _
            "WHERE (((TbNoConformidadesAuditoria.DESCRIPCION) Like '*" & p_PC & "*')) " & _
            "OR (((TbNoConformidadesAuditoria.CAUSARAIZ) Like '*" & p_PC & "*')) " & _
            "OR (((TbNCAuditoriaAccionCorrectivas.AccionCorrectiva) Like '*" & p_PC & "*')) " & _
            "OR (((TbNCAuditoriaAccionesRealizadas.AccionRealizada) Like '*" & p_PC & "*')) " & _
            "ORDER BY TbNoConformidadesAuditoria.Tipo,TbNoConformidadesAuditoria.Numero;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_NC = New NCAuditoria
            For Each m_Campo In m_NC.ColCampos
                m_NC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getNCsAuditoriaPorPalabraClave Is Nothing Then
                Set getNCsAuditoriaPorPalabraClave = New Scripting.Dictionary
                getNCsAuditoriaPorPalabraClave.CompareMode = TextCompare
            End If
            If Not getNCsAuditoriaPorPalabraClave.Exists(CStr(m_NC.id)) Then
                getNCsAuditoriaPorPalabraClave.Add CStr(m_NC.id), m_NC
            End If
            Set m_NC = Nothing
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCsAuditoriaPorPalabraClave ha devuelto el error: " & Err.Description
    End If
End Function


Public Function getResponsablesImplantacionDistintos( _
                                                        Optional p_Db As DAO.Database, _
                                                        Optional ByRef p_Error As String _
                                                        ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_RESPONSABLEIMPLANTACION As String
   
   
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
    m_SQL = "SELECT distinct RESPONSABLEIMPLANTACION " & _
            "FROM TbNoConformidadesAuditoria " & _
            "WHERE Not RESPONSABLEIMPLANTACION Is Null;"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            m_RESPONSABLEIMPLANTACION = .Fields("RESPONSABLEIMPLANTACION").Value
            If getResponsablesImplantacionDistintos Is Nothing Then
                Set getResponsablesImplantacionDistintos = New Scripting.Dictionary
                getResponsablesImplantacionDistintos.CompareMode = TextCompare
            End If
            If Not getResponsablesImplantacionDistintos.Exists(m_RESPONSABLEIMPLANTACION) Then
                getResponsablesImplantacionDistintos.Add m_RESPONSABLEIMPLANTACION, m_RESPONSABLEIMPLANTACION
            End If
            
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getResponsablesImplantacionDistintos ha devuelto el error: " & Err.Description
    End If
End Function



Public Function getColPuntosNormaAuditoria( _
                                            Optional p_Db As DAO.Database, _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary

    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Punto As String
    
    
    On Error GoTo errores
    If p_Db Is Nothing Then
        Set p_Db = getdb()
    End If
     m_SQL = "TbAuxPuntoNorma"
    Set rcdDatos = p_Db.OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            m_Punto = .Fields("PuntoNorma")
            If getColPuntosNormaAuditoria Is Nothing Then
                Set getColPuntosNormaAuditoria = New Scripting.Dictionary
                getColPuntosNormaAuditoria.CompareMode = TextCompare
            End If
            If Not getColPuntosNormaAuditoria.Exists(CStr(m_Punto)) Then
                getColPuntosNormaAuditoria.Add CStr(m_Punto), m_Punto
            End If
            
            .MoveNext
        Loop
       
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getColPuntosNormaAuditoria ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getNCAuditorias( _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NCAuditoria As NCAuditoria


    On Error GoTo errores
    
    m_SQL = "SELECT * " & _
            "FROM TbNoConformidadesAuditoria ;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
     With rcdDatos
         If .EOF Then
             rcdDatos.Close
             Set rcdDatos = Nothing
             Exit Function
         End If
         .MoveFirst
         Do While Not .EOF
            Set m_NCAuditoria = New NCAuditoria
            For Each m_Campo In m_NCAuditoria.ColCampos
               m_NCAuditoria.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            Next
            If getNCAuditorias Is Nothing Then
                Set getNCAuditorias = New Scripting.Dictionary
                getNCAuditorias.CompareMode = TextCompare
            End If
            If Not getNCAuditorias.Exists(CStr(m_NCAuditoria.id)) Then
                getNCAuditorias.Add m_NCAuditoria.id, m_NCAuditoria
            End If
            Set m_NCAuditoria = Nothing
            .MoveNext
         Loop
         
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing



    Exit Function

errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getNCAuditorias ha devuelto el error: " & Err.Description
    End If
End Function
