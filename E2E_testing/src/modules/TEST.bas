Attribute VB_Name = "TEST"
Option Compare Database
Option Explicit


Public Function GetjsonLugares(p_IDLugar As String, Optional ByRef p_Error As String) As String
    Dim m_Lugar As LugarEjecucion
    
    On Error GoTo errores
    Set m_Lugar = getLugarEjecucion(p_IDLugarEjecucion:=p_IDLugar, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Lugar Is Nothing Then
        Exit Function
    End If
    GetjsonLugares = m_Lugar.json
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GetjsonLugares ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function

Public Function Prueba(p_ID As String, Optional ByRef p_Error As String) As String
    Dim m_ExpedienteC As ExpedienteCompleto
    
    On Error GoTo errores
    
    Set m_ExpedienteC = constructor.getExpedienteCompleto(p_IDExpediente:=p_ID, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ExpedienteC Is Nothing Then
        p_Error = "No se ha encontrado el Expediente"
        Err.Raise 1000
    End If
    
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Prueba ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function

Public Function Prueba2( _
                            p_IDExp As String, _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim m_expediente As Expediente
    On Error GoTo errores
    Set m_expediente = constructor.getExpediente(p_IDExp, , , p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Prueba2 = m_expediente.NemotecnicoCalculado
    p_Error = m_expediente.Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Prueba2 ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function Prueba3( _
                            p_IDOrigen As String, _
                            p_IDDestino As String, _
                            Optional ByRef p_Error As String _
                            ) As String
    
    Dim m_ExOrigen As Expediente
    Dim m_ExDestino As Expediente
    On Error GoTo errores
    Set m_ExOrigen = constructor.getExpediente(p_IDOrigen, , , p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ExDestino = constructor.getExpediente(p_IDDestino, , , p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    CopiarAnualidades m_ExOrigen, m_ExDestino, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método Prueba3 ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function getDatoJson(Optional ByRef p_Error As String) As String
    
    Dim m_JSON As Object
    Dim m_Col As Collection
    Dim i As Long
    Dim m_NDPD As String
    Dim m_Cadena As String
    
    On Error GoTo errores
    
    Set m_JSON = getJSonDeTabla("TbProyectos", "IDExpediente", "210", getdb(), p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_JSON Is Nothing Then
        Exit Function
    End If
    Set m_Col = m_JSON
    For i = 1 To m_Col.Count
        m_NDPD = m_JSON(i)("CODPROYECTOS")
        If m_Cadena = "" Then
            m_Cadena = m_NDPD
        Else
            m_Cadena = m_Cadena & vbNewLine & m_NDPD
        End If
    Next
    getDatoJson = m_Cadena
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getDatoJson ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function

Public Function GenerarJSONExpedienteCompleto( _
                                                p_IDExp As String, _
                                                Optional p_EnUnArchivo As EnumSiNo = EnumSiNo.No, _
                                                Optional ByRef p_Error As String _
                                                ) As String
    
    Dim m_ExpedienteSerializado As Object
    Dim JsonString As String
    Dim JsonStringParseado As String
    Dim m_URLArchivo As String
    
    On Error GoTo errores
    If p_EnUnArchivo = Empty Then
        p_EnUnArchivo = EnumSiNo.Sí
    End If
    Set m_ExpedienteSerializado = getExpedienteSerializado1(p_IDExp:=p_IDExp, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    JsonString = JsonConverter.ConvertToJson(m_ExpedienteSerializado, Whitespace:=2)
    JsonStringParseado = TextoParsedoParaTxt(JsonString)
    If p_EnUnArchivo = EnumSiNo.Sí Then
        m_URLArchivo = m_ObjEntorno.URLDirectorioLocal & fso.GetBaseName(fso.GetTempName) & ".json"
        EscribirTextoAArchivo p_Texto:=JsonStringParseado, p_URLArchivo:=m_URLArchivo, p_Error:=p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        GenerarJSONExpedienteCompleto = m_URLArchivo
    Else
        GenerarJSONExpedienteCompleto = JsonStringParseado
    End If
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GenerarJSONExpedienteCompleto ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function GenerarJSONExpedientesPorSQL( _
                                                p_SQL As String, _
                                                Optional p_EnUnArchivo As EnumSiNo = EnumSiNo.No, _
                                                Optional ByRef p_Error As String _
                                                ) As String
    Dim rcdDatos As DAO.Recordset
    Dim m_expediente As Expediente
    
    Dim m_ExpedientesSerializados As Object
    Dim JsonString As String
    Dim JsonStringParseado As String
    Dim m_URLArchivo As String
    Dim m_Col As New Collection
    Dim item As Object
    Dim stream As ADODB.stream
    Dim i As Long
    Dim j As Long
    On Error GoTo errores
    If p_EnUnArchivo = Empty Then
        p_EnUnArchivo = EnumSiNo.Sí
    End If
    
    Set rcdDatos = getdb().OpenRecordset(p_SQL)
    With rcdDatos
        If .EOF Then
            Exit Function
        End If
'        If p_EnUnArchivo = EnumSiNo.Sí Then
'            Set stream = New ADODB.stream
'            With stream
'                .Type = 2 ' 2 indica texto
'                .Charset = "UTF-8"
'                .Open
'            End With
'        End If
        .MoveFirst
        i = 1
        Do While Not .EOF
            'If i > 5 Then GoTo siguiente
            
            Set item = getExpedienteSerializado1(p_IDExp:=rcdDatos.Fields("IDExpediente"), p_Error:=p_Error)
            If p_Error <> "" Then
                VBA.DoEvents
                Debug.Print p_Error
                VBA.DoEvents
            End If
            If Not item Is Nothing Then
                m_Col.Add item
'                VBA.DoEvents
'                Debug.Print j, i
'                VBA.DoEvents
'                j = j + 1
            End If
            i = i + 1
            .MoveNext
        Loop
    End With
siguiente:
    If m_Col Is Nothing Then
        Exit Function
    End If
    
    JsonString = JsonConverter.ConvertToJson(m_Col, Whitespace:=2)
    JsonStringParseado = TextoParsedoParaTxt(JsonString)
    If p_EnUnArchivo = EnumSiNo.Sí Then
        m_URLArchivo = m_ObjEntorno.URLDirectorioLocal & fso.GetBaseName(fso.GetTempName) & ".json"
        EscribirTextoAArchivo p_Texto:=JsonStringParseado, p_URLArchivo:=m_URLArchivo, p_Error:=p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        GenerarJSONExpedientesPorSQL = m_URLArchivo
    Else
        GenerarJSONExpedientesPorSQL = JsonStringParseado
    End If
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GenerarJSONExpedientesPorSQL ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function getExpedienteSerializado1( _
                                        Optional p_IDExp As String, _
                                        Optional p_Exp As Expediente, _
                                        Optional ByRef p_Error As String _
                                        ) As Object
    
   
    Dim m_Col As New Collection
    Dim m_ID As Variant
    Dim m_CampoEx As Variant
    Dim m_CampoExParseado As String
    Dim m_Valor As String
    Dim m_valorParseado As String
    Dim item As New Scripting.Dictionary
    Dim SubItem As New Scripting.Dictionary
    Dim m_Objeto As Object
    Dim m_Usuario As USUARIO
    Dim m_Derivados As Scripting.Dictionary
    Dim m_Apartado As String
    On Error GoTo errores
    If m_ObjEntorno Is Nothing Then
        EVE
    End If
    If p_Exp Is Nothing Then
        Set p_Exp = constructor.getExpediente(p_IDExpediente:=p_IDExp, p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    
    For Each m_CampoEx In p_Exp.ColCampos
        m_Apartado = "Campos simples " & m_CampoEx
        'If p_IDExp = "353" And CStr(m_CampoEx) = "CodigoActividad" Then Stop
        'Debug.Print m_CampoEx
        'If CStr(m_CampoEx) = "CodigoActividad" Then Stop
        Set SubItem = New Scripting.Dictionary
        If CStr(m_CampoEx) = "IdGradoClasificacion" Then
            m_CampoExParseado = TextoParsedoParaJSON(CStr(m_CampoEx))
            m_Valor = p_Exp.getPropiedad(m_CampoEx, p_Error)
            If p_Error <> "" Then
                Stop
            End If
            Set m_Objeto = constructor.getGradoClasificacion(p_IdGradoClasificacion:=m_Valor)
            If Not m_Objeto Is Nothing Then
                Set SubItem = JsonConverter.SubItem(m_Objeto)
                item.Add m_CampoExParseado, SubItem
            End If
            
            GoTo siguiente
        ElseIf CStr(m_CampoEx) = "IDOrganoContratacion" Then
            m_CampoExParseado = TextoParsedoParaJSON(CStr(m_CampoEx))
            m_Valor = p_Exp.getPropiedad(m_CampoEx, p_Error)
            If p_Error <> "" Then
                Stop
            End If
            Set m_Objeto = constructor.getOrganoContratacion(p_IDOrganoContratacion:=m_Valor)
            Set SubItem = JsonConverter.SubItem(m_Objeto)
            item.Add m_CampoExParseado, SubItem
            GoTo siguiente
        ElseIf CStr(m_CampoEx) = "IDUsuarioCreacion" Then
            m_CampoExParseado = TextoParsedoParaJSON(CStr(m_CampoEx))
            m_Valor = p_Exp.getPropiedad(m_CampoEx, p_Error)
            If p_Error <> "" Then
                Stop
            End If
            Set m_Objeto = constructor.getUsuario(p_ID:=m_Valor)
            If Not m_Objeto Is Nothing Then
                SubItem("Nombre") = TextoParsedoParaJSON(m_Objeto.Nombre)
                SubItem("CorreoUsuario") = TextoParsedoParaJSON(m_Objeto.CorreoUsuario)
                item.Add m_CampoExParseado, SubItem
            End If
            
            GoTo siguiente
        ElseIf CStr(m_CampoEx) = "IDUsuarioUltimoCambio" Then
            m_CampoExParseado = TextoParsedoParaJSON(CStr(m_CampoEx))
            m_Valor = p_Exp.getPropiedad(m_CampoEx, p_Error)
            If p_Error <> "" Then
                Stop
            End If
            Set m_Objeto = constructor.getUsuario(p_ID:=m_Valor)
            If Not m_Objeto Is Nothing Then
                SubItem("Nombre") = TextoParsedoParaJSON(m_Objeto.Nombre)
                SubItem("CorreoUsuario") = TextoParsedoParaJSON(m_Objeto.CorreoUsuario)
                item.Add m_CampoExParseado, SubItem
            End If
            GoTo siguiente
        ElseIf CStr(m_CampoEx) = "IDResponsableCalidad" Then
            m_CampoExParseado = TextoParsedoParaJSON(CStr(m_CampoEx))
            m_Valor = p_Exp.getPropiedad(m_CampoEx, p_Error)
            If p_Error <> "" Then
                Stop
            End If
            Set m_Objeto = constructor.getUsuario(p_ID:=m_Valor)
            If Not m_Objeto Is Nothing Then
                SubItem("Nombre") = TextoParsedoParaJSON(m_Objeto.Nombre)
                SubItem("CorreoUsuario") = TextoParsedoParaJSON(m_Objeto.CorreoUsuario)
                item.Add m_CampoExParseado, SubItem
            End If
            GoTo siguiente
        ElseIf CStr(m_CampoEx) = "IDResponsableSeguridad" Then
            m_CampoExParseado = TextoParsedoParaJSON(CStr(m_CampoEx))
            m_Valor = p_Exp.getPropiedad(m_CampoEx, p_Error)
            If p_Error <> "" Then
                Stop
            End If
            Set m_Objeto = constructor.getUsuario(p_ID:=m_Valor)
            If Not m_Objeto Is Nothing Then
                SubItem("Nombre") = TextoParsedoParaJSON(m_Objeto.Nombre)
                SubItem("CorreoUsuario") = TextoParsedoParaJSON(m_Objeto.CorreoUsuario)
                item.Add m_CampoExParseado, SubItem
            End If
            GoTo siguiente
        ElseIf CStr(m_CampoEx) = "ESTADO" Then
            m_CampoExParseado = TextoParsedoParaJSON(CStr(m_CampoEx))
            m_Valor = p_Exp.ESTADOCalculadoTexto
            p_Error = p_Exp.Error
            If p_Error <> "" Then
                Stop
            End If
            m_valorParseado = TextoParsedoParaJSON(m_Valor)
            
            item(m_CampoExParseado) = m_valorParseado
            GoTo siguiente
        End If
        m_CampoExParseado = TextoParsedoParaJSON(CStr(m_CampoEx))
        m_Valor = p_Exp.getPropiedad(m_CampoEx, p_Error)
        If p_Error <> "" Then
            Stop
        End If
        If m_Valor <> "" Then
            m_valorParseado = TextoParsedoParaJSON(m_Valor)
        Else
            m_valorParseado = m_Valor
        End If
        
        item(m_CampoExParseado) = m_valorParseado
siguiente:
    Next
    'anualidades
    m_Apartado = "anualidades"
    Set m_Derivados = p_Exp.Anualidades
    If Not m_Derivados Is Nothing Then
        Set m_Col = New Collection
        For Each m_ID In m_Derivados
            Set SubItem = New Scripting.Dictionary
            Set m_Objeto = m_Derivados(m_ID)
            Set SubItem = JsonConverter.SubItem(m_Objeto)
            m_Col.Add SubItem
        Next
        item.Add "Anualidades", m_Col
    Else
        item("Anualidades") = "NULL"
    End If
    m_Apartado = "Comerciales"
    'Comerciales
    Set m_Derivados = p_Exp.Comerciales
    If Not m_Derivados Is Nothing Then
        Set m_Col = New Collection
        For Each m_ID In m_Derivados
            Set SubItem = New Scripting.Dictionary
            Set m_Objeto = m_Derivados(m_ID)
            Set SubItem = JsonConverter.SubItem(m_Objeto)
            m_Col.Add SubItem
        Next
        item.Add "Comerciales", m_Col
    Else
        item("Comerciales") = "NULL"
    End If
    'CPV
    m_Apartado = "CPV"
    Set m_Derivados = p_Exp.CPVs
    If Not m_Derivados Is Nothing Then
        Set m_Col = New Collection
        For Each m_ID In m_Derivados
            Set SubItem = New Scripting.Dictionary
            Set m_Objeto = m_Derivados(m_ID)
            Set SubItem = JsonConverter.SubItem(m_Objeto)
            m_Col.Add SubItem
        Next
        item.Add "CPVS", m_Col
    Else
        item("CPVS") = "NULL"
    End If
    'Hitos
    m_Apartado = "Hitos"
    Set m_Derivados = p_Exp.Hitos
    If Not m_Derivados Is Nothing Then
        Set m_Col = New Collection
        For Each m_ID In m_Derivados
            Set SubItem = New Scripting.Dictionary
            Set m_Objeto = m_Derivados(m_ID)
            Set SubItem = JsonConverter.SubItem(m_Objeto)
            m_Col.Add SubItem
        Next
        item.Add "Hitos", m_Col
    Else
        item("Hitos") = "NULL"
    End If
    
    m_Apartado = "Juridicas"
    Set m_Derivados = p_Exp.Contratistas
    If Not m_Derivados Is Nothing Then
        Set m_Col = New Collection
        For Each m_ID In m_Derivados
            Set SubItem = New Scripting.Dictionary
            Set m_Objeto = m_Derivados(m_ID)
            Set SubItem = JsonConverter.SubItem(m_Objeto)
            m_Col.Add SubItem
        Next
        item.Add "Contratistas", m_Col
    Else
        item("Contratistas") = "NULL"
    End If
    'Lugares Ejecución
    m_Apartado = "Lugares Ejecución"
    Set m_Derivados = p_Exp.LugaresEjecucion
    If Not m_Derivados Is Nothing Then
        Set m_Col = New Collection
        For Each m_ID In m_Derivados
            Set SubItem = New Scripting.Dictionary
            Set m_Objeto = m_Derivados(m_ID)
            Set SubItem = JsonConverter.SubItem(m_Objeto)
            m_Col.Add SubItem
        Next
        item.Add "Lugares Ejecución", m_Col
    Else
        item("Lugares Ejecución") = "NULL"
    End If
    'PECALES
    m_Apartado = "PECALES"
    Set m_Derivados = p_Exp.PECALES
    If Not m_Derivados Is Nothing Then
        Set m_Col = New Collection
        For Each m_ID In m_Derivados
            Set SubItem = New Scripting.Dictionary
            Set m_Objeto = m_Derivados(m_ID)
            Set SubItem = JsonConverter.SubItem(m_Objeto)
            m_Col.Add SubItem
        Next
        item.Add "PECALES", m_Col
    Else
        item("PECALES") = "NULL"
    End If
    'RACS
    m_Apartado = "RACS"
    Set m_Derivados = p_Exp.RACs
    If Not m_Derivados Is Nothing Then
        Set m_Col = New Collection
        For Each m_ID In m_Derivados
            Set SubItem = New Scripting.Dictionary
            Set m_Objeto = m_Derivados(m_ID)
            Set SubItem = JsonConverter.SubItem(m_Objeto)
            m_Col.Add SubItem
        Next
        item.Add "RACS", m_Col
    Else
        item("RACS") = "NULL"
    End If
    'If p_IDExp = "344" Then Stop
    'Responsables
    m_Apartado = "Responsables"
    Set m_Derivados = p_Exp.Responsables
    If Not m_Derivados Is Nothing Then
        Set m_Col = New Collection
        For Each m_ID In m_Derivados
            'On Error Resume Next
            'If Err.Number <> 0 Then Stop
            Set SubItem = New Scripting.Dictionary
            Set m_Objeto = m_Derivados(m_ID)
            m_CampoExParseado = TextoParsedoParaJSON(CStr("Usuario"))
            If Not m_Objeto.USUARIO Is Nothing Then
                m_Valor = m_Objeto.USUARIO.Nombre
            Else
                m_Valor = "Desconocido"
            End If
            
            m_valorParseado = TextoParsedoParaJSON(m_Valor)
            SubItem.Add m_CampoExParseado, m_valorParseado
            m_CampoExParseado = TextoParsedoParaJSON(CStr("CorreoSiempre"))
            m_Valor = m_Objeto.CorreoSiempre
            m_valorParseado = TextoParsedoParaJSON(m_Valor)
            SubItem.Add m_CampoExParseado, m_valorParseado
            m_CampoExParseado = TextoParsedoParaJSON(CStr("EsJefeProyecto"))
            m_Valor = m_Objeto.EsJefeProyecto
            m_valorParseado = TextoParsedoParaJSON(m_Valor)
            SubItem.Add m_CampoExParseado, m_valorParseado
           
            m_Col.Add SubItem
        Next
        item.Add "Responsables", m_Col
    Else
        item("Responsables") = "NULL"
    End If
    'SUMINISTRADORES
    m_Apartado = "SUMINISTRADORES"
    Set m_Derivados = p_Exp.Suministradores
    If Not m_Derivados Is Nothing Then
        Set m_Col = New Collection
        For Each m_ID In m_Derivados
            Set SubItem = New Scripting.Dictionary
            Set m_Objeto = m_Derivados(m_ID)
            Set SubItem = JsonConverter.SubItem(m_Objeto)
            m_Col.Add SubItem
        Next
        item.Add "SUMINISTRADORES", m_Col
    Else
        item("SUMINISTRADORES") = "NULL"
    End If
    m_Apartado = "Ultima"
    Set getExpedienteSerializado1 = item
    Exit Function
errores:
    If Err.Number <> 1000 Then
        
        'p_Error = "El método getExpedienteSerializado1 ha devuelto" & vbNewLine & Err.Description
    End If
    p_Error = p_IDExp & vbTab & m_Apartado
    Debug.Print p_Error
End Function
Public Function getExpedientesSerializadosPorSQL( _
                                                    p_SQL As String, _
                                                    Optional ByRef p_Error As String _
                                                    ) As Collection
                
    Dim rcdDatos As DAO.Recordset
    Dim m_Campo As Variant
    Dim m_Expedientes As Scripting.Dictionary
    Dim m_expediente As Expediente
    Dim m_ID As Variant
    Dim m_Col As New Collection
    Dim m_ExpedienteSerializado As Scripting.Dictionary
    
    On Error GoTo errores
    Set rcdDatos = getdb().OpenRecordset(p_SQL)
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
                'Debug.Print m_Campo
                m_expediente.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             Set m_ExpedienteSerializado = getExpedienteSerializado1(p_Exp:=m_expediente, p_Error:=p_Error)
             If p_Error <> "" Then
                Err.Raise 1000
            End If
            m_Col.Add m_ExpedienteSerializado
            'Set m_ExpedienteSerializado = Nothing
            Set m_expediente = Nothing
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Set getExpedientesSerializadosPorSQL = m_Col
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesSerializadosPorSQL ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function



Public Function TituloExpedientePorJSON(p_IDExp As Variant, Optional ByRef p_Error As String) As String
    
    Dim m_JSONTexto As String
    Dim m_JSON As Object
    On Error GoTo errores
    
    Set m_JSON = JsonConverter.ParseJson(GenerarJSONExpedienteCompleto(CStr(p_IDExp)))
    If Not m_JSON Is Nothing Then
        TituloExpedientePorJSON = m_JSON("Titulo")
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método TituloExpedientePorJSON ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
    
Public Function GenerarJSONExpedientes(Optional ByRef p_Error As String) As String
    
    Dim m_JSONTexto As String
    Dim m_JSON As Object
    Dim item As Collection
    Dim m_URLArchivo As String
    On Error GoTo errores
    If m_ObjEntorno Is Nothing Then
        EVE
    End If
    m_URLArchivo = GenerarJSONExpedientesPorSQL("TbExpedientes", EnumSiNo.Sí, p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método GenerarJSONExpedientes ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function

Public Function TextArchivoJSONColExpedientes( _
                                                Optional p_EnUnArchivo As EnumSiNo = EnumSiNo.No, _
                                                Optional ByRef p_Error As String _
                                                ) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_Exp As Expediente
    
    Dim m_URLArchivo As String
    
    On Error GoTo errores
    
    Set m_Col = New Scripting.Dictionary
    m_Col.CompareMode = TextCompare
    Set m_Exp = constructor.getExpediente(p_IDExpediente:="424", p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Exp Is Nothing Then
        m_Col.Add CStr(m_Exp.IDExpediente), m_Exp
    End If
    Set m_Exp = constructor.getExpediente(p_IDExpediente:="419", p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_Exp Is Nothing Then
        m_Col.Add CStr(m_Exp.IDExpediente), m_Exp
    End If
    
    m_URLArchivo = RellenarArchivoJSONConColExpedientes(p_Col:=m_Col, p_EnUnArchivo:=p_EnUnArchivo, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método TextArchivoJSONColExpedientes ha devuelto" & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function


