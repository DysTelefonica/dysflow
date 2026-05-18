Attribute VB_Name = "Instalador"
Option Compare Database
Option Explicit


Public Function InstalarProyecto(Optional ByRef p_Error As String) As String
    On Error GoTo errores
    '*********************************************************************************************************************
    'RECORDAR DE EN EXPEDIENTES CAMBIAR LAS VARIABLES DE ENTORNO DE QUE CAMBIE RESP CALIDAD Y RESP TECNICO EN ORIGINAL
    '*********************************************************************************************************************
    RellenarDatosExpediente p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarResponsableDeCalidad p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
'    ActualizarRespTecnicoNC p_Error
'    If p_Error <> "" Then
'        Err.Raise 1000
'    End If
    RellenarNAccionesProyecto p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarNAccionesAuditoria p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    CerrrarARAbiertasDeNCCerrados p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarNumeroNCAuditoria p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarEstadoARProyectos p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarEstadoARAuditorias p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarEstadoACProyecto p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarEstadoACAuditoria
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarEstadoNCProyecto p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarEstadoNCAuditoria p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarFechasACProyecto p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarFechasARProyecto p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarNAccionACProyectoConSoloUna p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarNAccionARProyectoConSoloUna p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    RellenarTipologia p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    UnificarCausaConAnalisis p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarRequiereACProyecto p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarResponsablesDeACsProyecto p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarResponsablesDeARs p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    RellenarAnexosAuditorias p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
   
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método InstalarProyecto ha devuelto el error " & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function RellenarAnexosAuditorias( _
                                                Optional ByRef p_Error As String _
                                                ) As String
                        
    Dim rcdDatosOrigen As DAO.Recordset
    Dim rcdDatosDestino As DAO.Recordset
    Dim m_IDAuditoria As String
    Dim m_IDDOcumento As String
    Dim m_SQL As String
    Dim m_URLAnexo As String
    Dim m_Documento As DocumentoAuditoria
    Dim m_NombreDocumento As String
    Dim m_IDNC As String
    On Error GoTo errores
    m_SQL = "TbAnexosAuditoria"
    Set rcdDatosOrigen = getdb().OpenRecordset(m_SQL)
    If Not rcdDatosOrigen.EOF Then
        Do While Not rcdDatosOrigen.EOF
            m_IDAuditoria = Nz(rcdDatosOrigen.Fields("IDAuditoria"), "")
            If IsNumeric(m_IDAuditoria) Then
                m_NombreDocumento = rcdDatosOrigen.Fields("NombreArchivo")
                m_NombreDocumento = fso.GetBaseName(m_NombreDocumento)
                m_SQL = "SELECT * " & _
                    "FROM TbDocumentosAuditorias " & _
                    "WHERE IDAuditoria=" & m_IDAuditoria & " " & _
                    "AND Documento='" & m_NombreDocumento & "';"
                Set rcdDatosDestino = getdb().OpenRecordset(m_SQL)
                If rcdDatosDestino.EOF Then
                    Set m_Documento = New DocumentoAuditoria
                    With m_Documento
                        .IDDocumento = .IDDocumentoCalculado
                        .IDAuditoria = m_IDAuditoria
                        .Documento = rcdDatosOrigen.Fields("NombreArchivo")
                        m_URLAnexo = .getURLAnexoFinal(.Documento)
                        .NombreAnexo = fso.GetFileName(m_URLAnexo)
                    End With
                   
                    
                    rcdDatosDestino.AddNew
                        rcdDatosDestino.Fields("IDDocumento") = m_Documento.IDDocumento
                        rcdDatosDestino.Fields("IDAuditoria") = m_Documento.IDAuditoria
                       ' rcdDatosDestino.Fields("IDAuditoriaResultante") = m_Documento.IDAuditoria
                        rcdDatosDestino.Fields("Documento") = fso.GetBaseName(m_Documento.Documento)
                        rcdDatosDestino.Fields("NombreAnexo") = m_Documento.NombreAnexo
                    rcdDatosDestino.Update
                
                End If
            End If
            
            rcdDatosOrigen.MoveNext
        Loop
        rcdDatosOrigen.Close
        Set rcdDatosOrigen = Nothing
        rcdDatosDestino.Close
        Set rcdDatosDestino = Nothing
    
    End If
    
    m_SQL = "TbAnexosNCAuditorias"
    Set rcdDatosOrigen = getdb().OpenRecordset(m_SQL)
    If Not rcdDatosOrigen.EOF Then
        Do While Not rcdDatosOrigen.EOF
            m_IDNC = Nz(rcdDatosOrigen.Fields("IDNoConformidad"), "")
            If IsNumeric(m_IDNC) Then
                m_NombreDocumento = rcdDatosOrigen.Fields("NombreArchivo")
                m_NombreDocumento = fso.GetBaseName(m_NombreDocumento)
                m_SQL = "SELECT * " & _
                    "FROM TbDocumentosAuditorias " & _
                    "WHERE IDNoConformidad=" & m_IDNC & " " & _
                    "AND Documento='" & m_NombreDocumento & "';"
                Set rcdDatosDestino = getdb().OpenRecordset(m_SQL)
                If rcdDatosDestino.EOF Then
                    Set m_Documento = New DocumentoAuditoria
                    With m_Documento
                        .IDDocumento = .IDDocumentoCalculado
                        .IDNoConformidad = m_IDNC
                        .Documento = rcdDatosOrigen.Fields("NombreArchivo")
                        m_URLAnexo = .getURLAnexoFinal(.Documento)
                        .NombreAnexo = fso.GetFileName(m_URLAnexo)
                    End With
                   
                    
                    rcdDatosDestino.AddNew
                        rcdDatosDestino.Fields("IDDocumento") = m_Documento.IDDocumento
                        rcdDatosDestino.Fields("IDNoConformidad") = m_Documento.IDNoConformidad
                       ' rcdDatosDestino.Fields("IDAuditoriaResultante") = m_Documento.IDAuditoria
                        rcdDatosDestino.Fields("Documento") = fso.GetBaseName(m_Documento.Documento)
                        rcdDatosDestino.Fields("NombreAnexo") = m_Documento.NombreAnexo
                    rcdDatosDestino.Update
                
                End If
            End If
            
            rcdDatosOrigen.MoveNext
        Loop
        rcdDatosOrigen.Close
        Set rcdDatosOrigen = Nothing
        rcdDatosDestino.Close
        Set rcdDatosDestino = Nothing
    End If
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarAnexosAuditorias ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function RellenarResponsableDeCalidad( _
                                                Optional ByRef p_Error As String _
                                                ) As String
                        
    
    Dim m_SQL As String
    
    On Error GoTo errores
    
    
    m_SQL = "UPDATE (TbNoConformidades INNER JOIN TbExpedientes " & _
            "ON TbNoConformidades.IDExpediente = TbExpedientes.IDExpediente) " & _
            "INNER JOIN TbUsuariosAplicaciones ON TbExpedientes.IDResponsableCalidad = TbUsuariosAplicaciones.Id " & _
            "SET TbNoConformidades.RESPONSABLECALIDAD = [TbUsuariosAplicaciones].[Nombre];"
    getdb().Execute m_SQL
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarResponsableDeCalidad ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
'Public Function ActualizarRespTecnicoNC( _
'                                            Optional ByRef p_Error As String _
'                                            ) As String
'
'
'    Dim m_SQL As String
'
'    On Error GoTo errores
'
'
'    m_SQL = "UPDATE ((TbNoConformidades INNER JOIN TbExpedientes " & _
'            "ON TbNoConformidades.IDExpediente = TbExpedientes.IDExpediente) " & _
'            "INNER JOIN TbExpedientesResponsables ON TbExpedientes.IDExpediente = TbExpedientesResponsables.IdExpediente) " & _
'            "INNER JOIN TbUsuariosAplicaciones ON TbExpedientesResponsables.IdUsuario = TbUsuariosAplicaciones.Id " & _
'            "SET TbNoConformidades.RESPONSABLETELEFONICA = [TbUsuariosAplicaciones].[UsuarioRed];"
'    getdb().Execute m_SQL
'
'
'    Exit Function
'
'errores:
'    If Err.Number <> 1000 Then
'        p_Error = "El método ActualizarRespTecnicoNC ha devuelto el error: " & Err.Description
'    End If
'    Debug.Print p_Error
'End Function
Public Function InstalarAuditoria(Optional ByRef p_Error As String) As String
    On Error GoTo errores
    
'    RellenarACAuditoria p_Error
'    If p_Error <> "" Then
'        Err.Raise 1000
'    End If
    
   
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método InstalarAuditoria ha devuelto el error " & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function RellenarIDCalculadaEnDocumentosProyecto( _
                                                        Optional ByRef p_Error As String _
                                                        ) As String
                        
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_AR As ARProyecto
    Dim m_IDCalculado As String
    Dim m_IDDOC As String
    On Error GoTo errores
    
    
    m_SQL = "SELECT * " & _
            "FROM TbNCDocumentos " & _
            "WHERE IDNoConformidadCalculada iS Null;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If rcdDatos.EOF Then
        rcdDatos.Close
        Set rcdDatos = Nothing
        Exit Function
    End If
    
    With rcdDatos
        rcdDatos.MoveFirst
        Do While Not .EOF
            
            m_IDDOC = .Fields("IDDocumento")
            If Nz(.Fields("IDNoConformidad"), "") <> "" Then
                m_IDCalculado = .Fields("IDNoConformidad")
            Else
                Set m_AR = constructor.getARProyecto(p_IDAR:=Nz(.Fields("IDAccionRealizada"), ""), p_Error:=p_Error)
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                If Not m_AR Is Nothing Then
                    m_IDCalculado = m_AR.AC.nc.IDNoConformidad
                Else
                    m_IDCalculado = ""
                End If
            End If
            If IsNumeric(m_IDCalculado) Then
                m_SQL = "UPDATE TbNCDocumentos " & _
                        "SET  IDNoConformidadCalculada=" & m_IDCalculado & " " & _
                        "WHERE IDDocumento=" & m_IDDOC & ";"
                getdb().Execute m_SQL
                VBA.DoEvents
                Debug.Print rcdDatos("NombreAnexo"), "IDResultante:" & m_IDCalculado
                VBA.DoEvents
            End If
            .MoveNext
        Loop
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarIDCalculadaEnDocumentosProyecto ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function RellenarNAccionACProyectoConSoloUna( _
                                                        Optional ByRef p_Error As String _
                                                        ) As String
                        
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_SQL As String
    Dim m_AC As ACProyecto
 
    On Error GoTo errores
    
    
    On Error GoTo errores
    
    Set m_Col = getACsDeProyectosSolo1Accion(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_AC = m_Col(m_ID)
            m_SQL = "UPDATE TbNCAccionCorrectivas " & _
                    " SET NAccion = 1 " & _
                    "WHERE IDAccionCorrectiva=" & m_ID & ";"
            getdb().Execute m_SQL
           
            
            VBA.DoEvents
            Debug.Print m_AC.IdAccionCorrectiva
            VBA.DoEvents
        Set m_AC = Nothing
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarNAccionACProyectoConSoloUna ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function RellenarNAccionARProyectoConSoloUna( _
                                                        Optional ByRef p_Error As String _
                                                        ) As String
                        
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_SQL As String
    Dim m_AR As ARProyecto
 
    On Error GoTo errores
    
    
    On Error GoTo errores
    
    Set m_Col = getARsDeProyectosSolo1Accion(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_AR = m_Col(m_ID)
            m_SQL = "UPDATE TbNCAccionesRealizadas " & _
                    " SET NAccion = 1 " & _
                    "WHERE IDAccionRealizada=" & m_ID & ";"
            getdb().Execute m_SQL
           
            
            VBA.DoEvents
            Debug.Print m_AR.IDAccionRealizada
            VBA.DoEvents
        Set m_AR = Nothing
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarNAccionARProyectoConSoloUna ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function NormalizarResponsablesACProyectos( _
                                                        Optional ByRef p_Error As String _
                                                        ) As String
                        
    Dim m_SQL As String
   
    On Error GoTo errores
    
    
    m_SQL = "UPDATE TbNCAccionCorrectivas " & _
            "SET Responsable='arp' " & _
            "WHERE Responsable='ar';"
    getdb().Execute m_SQL
    m_SQL = "UPDATE TbNCAccionCorrectivas " & _
            "SET Responsable='TF04898' " & _
            "WHERE Responsable='fld';"
    getdb().Execute m_SQL
    m_SQL = "UPDATE TbNCAccionCorrectivas " & _
            "SET Responsable='ds00275' " & _
            "WHERE Responsable='AST';"
    getdb().Execute m_SQL
     
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NormalizarResponsablesACProyectos ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function NormalizarResponsablesAuditorias( _
                                                        Optional ByRef p_Error As String _
                                                        ) As String
                        
    Dim m_SQL As String
   
    On Error GoTo errores
    
    
    m_SQL = "UPDATE TbNoConformidadesAuditoria " & _
            "SET RESPONSABLEIMPLANTACION='Ana Rubio Canales' " & _
            "WHERE RESPONSABLEIMPLANTACION='Ana Rubio';"
    getdb().Execute m_SQL
    m_SQL = "UPDATE TbNoConformidadesAuditoria " & _
            "SET RESPONSABLEIMPLANTACION='Beatriz Noval Gutiérrez' " & _
            "WHERE RESPONSABLEIMPLANTACION='Beatriz Noval';"
    getdb().Execute m_SQL
    m_SQL = "UPDATE TbNoConformidadesAuditoria " & _
            "SET RESPONSABLEIMPLANTACION='Natalia Casán García' " & _
            "WHERE RESPONSABLEIMPLANTACION='Natalia Casán';"
    getdb().Execute m_SQL
     
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método NormalizarResponsablesAuditorias ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function RellenarEstadoNCProyecto( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_NC As NCProyecto
    Dim m_NCOp As NCProyectoOperaciones
    Dim m_Estados As String
    Dim m_EstadoAlInicio As String
    On Error GoTo errores
    'Set m_Col = getACsDeProyectosAbiertos(p_Error)
    Set m_Col = getNCsDeProyectos(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    Set m_NCOp = New NCProyectoOperaciones
    For Each m_ID In m_Col
        Set m_NC = m_Col(m_ID)
            m_EstadoAlInicio = m_NC.Estado
            Set m_NCOp.nc = m_NC
            m_NCOp.ActualizarDatosCalculados p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            
            VBA.DoEvents
            Debug.Print m_NC.IDNoConformidad, m_EstadoAlInicio, m_NC.Estado
            VBA.DoEvents
        Set m_NC = Nothing
    Next
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarEstadoNCProyecto ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function RellenarEstadoNCAuditoria( _
                                        Optional ByRef p_Error As String _
                                        ) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_NC As NCAuditoria
    Dim m_NCOp As NCaUDITORIAOperaciones
    Dim m_Estados As String
    
    On Error GoTo errores
    'Set m_Col = getACsDeAuditoriasAbiertos(p_Error)
    Set m_Col = getNCsDeAuditorias(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    Set m_NCOp = New NCaUDITORIAOperaciones
    For Each m_ID In m_Col
        Set m_NC = m_Col(m_ID)
            Set m_NCOp.nc = m_NC
            m_NCOp.ActualizarDatosCalculados p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            
            VBA.DoEvents
            Debug.Print m_NC.id, m_NC.Estado
            VBA.DoEvents
        Set m_NC = Nothing
    Next
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarEstadoNCAuditoria ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function RellenarEstadoACProyecto( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_ACProyecto As ACProyecto
   
    
    On Error GoTo errores
    'Set m_Col = getACsDeProyectosAbiertos(p_Error)
    Set m_Col = getACsDeProyectos(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_ACProyecto = m_Col(m_ID)
            ActualizarDatosACProyecto m_ACProyecto, p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            VBA.DoEvents
            Debug.Print m_ACProyecto.IdAccionCorrectiva, m_ACProyecto.Estado, m_ACProyecto.FechaInicialMinima, m_ACProyecto.FechaFinPrevistaUltima, m_ACProyecto.FechaFinalUltima
            VBA.DoEvents
        Set m_ACProyecto = Nothing
    Next
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarEstadoACProyecto ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function RellenarEstadoACAuditoria( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_AC As ACAuditoria
   
    
    On Error GoTo errores
    'Set m_Col = getACsDeAuditoriasAbiertos(p_Error)
    Set m_Col = getACsDeAuditorias(p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_AC = m_Col(m_ID)
            ActualizarDatosACAuditoria m_AC, p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            VBA.DoEvents
            Debug.Print m_AC.IdAccionCorrectiva, m_AC.Estado, m_AC.FechaInicialMinima, m_AC.FechaFinPrevistaUltima, m_AC.FechaFinalUltima
            VBA.DoEvents
        Set m_AC = Nothing
    Next
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarEstadoACAuditoria ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function RellenarTablaTipologia( _
                                        Optional ByRef p_Error As String _
                                        ) As String
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_ColDistintosTipos As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_Tipologia As TipologiaNCProyectos
    
    On Error GoTo errores
    
    m_SQL = "SELECT distinct TbTipologia.Tipologia " & _
            "FROM TbNoConformidades INNER JOIN TbTipologia ON TbNoConformidades.TIPO = TbTipologia.CodTipologia;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If Not rcdDatos Is Nothing Then
        rcdDatos.MoveFirst
        Do While Not rcdDatos.EOF
            If m_ColDistintosTipos Is Nothing Then
                Set m_ColDistintosTipos = New Scripting.Dictionary
                m_ColDistintosTipos.CompareMode = TextCompare
            End If
            If Not m_ColDistintosTipos.Exists(rcdDatos.Fields("Tipologia").Value) Then
                m_ColDistintosTipos.Add rcdDatos.Fields("Tipologia").Value, rcdDatos.Fields("Tipologia").Value
            End If
            rcdDatos.MoveNext
        Loop
    End If
    rcdDatos.Close
    Set rcdDatos = Nothing
    If m_ColDistintosTipos Is Nothing Then
        Exit Function
    End If
    
    For Each m_ID In m_ColDistintosTipos
        Set m_Tipologia = constructor.getTipologiaNCProyecto(p_Tipologia:=CStr(m_ID), p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_Tipologia Is Nothing Then
            Set m_Tipologia = New TipologiaNCProyectos
            m_Tipologia.Tipologia = CStr(m_ID)
            m_Tipologia.Registrar , p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            Set m_Tipologia = Nothing
        End If
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarTablaTipologia ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function

Public Function RellenarTipologia( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_SQL As String
   
    
    On Error GoTo errores
    RellenarTablaTipologia p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    
    m_SQL = "UPDATE (TbNoConformidades INNER JOIN TbTipologia ON TbNoConformidades.TIPO = TbTipologia.CodTipologia) " & _
            "INNER JOIN TbTiposNCProyectos ON TbTipologia.Tipologia = TbTiposNCProyectos.Tipologia " & _
            "SET TbNoConformidades.IDTipo = [TbTiposNCProyectos].[IDTipo] " & _
            "WHERE (((TbNoConformidades.IDTipo) Is Null));"

    getdb().Execute m_SQL
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarTipologia ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function

Public Function RellenarEstadoARProyectos( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_AR As ARProyecto
   
    
    On Error GoTo errores
    'Set m_Col = getARsDeProyectosAbiertos(p_Error)
    Set m_Col = getARsDeProyectos(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_AR = m_Col(m_ID)
            ActualizarDatosARProyecto m_AR, p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            VBA.DoEvents
            Debug.Print m_AR.IDAccionRealizada, m_AR.Estado
            VBA.DoEvents
        Set m_AR = Nothing
    Next
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarEstadoARProyectos ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function RellenarEstadoARAuditorias( _
                                            Optional ByRef p_Error As String _
                                            ) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_AR As ARAuditoria
   
    
    On Error GoTo errores
    
    Set m_Col = getARsAuditorias(p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_AR = m_Col(m_ID)
            ActualizarDatosARAuditoria m_AR, p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            VBA.DoEvents
            Debug.Print m_AR.IDAccionRealizada, m_AR.Estado
            VBA.DoEvents
        Set m_AR = Nothing
    Next
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarEstadoARAuditorias ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function CerrrarARAbiertasDeNCCerrados( _
                                                Optional ByRef p_Error As String _
                                                ) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_ARProyecto As ARProyecto
    Dim m_SQL As String
    
    On Error GoTo errores
    'Set m_Col = getARsDeProyectosAbiertos(p_Error)
    Set m_Col = getARsAbiertasDeNCCerrados(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_ARProyecto = m_Col(m_ID)
            m_SQL = "UPDATE TbNCAccionesRealizadas SET FechaFinReal = #" & Format(m_ARProyecto.AC.nc.FECHACIERRE, "mm/dd/yyyy") & "# " & _
                    "WHERE IDAccionRealizada=" & m_ID & ";"
            getdb().Execute m_SQL
            m_ARProyecto.FechaFinReal = m_ARProyecto.AC.nc.FECHACIERRE
            m_ARProyecto.EstadoGrabar
            
            
            VBA.DoEvents
            Debug.Print m_ARProyecto.IDAccionRealizada, m_ARProyecto.FechaFinReal, m_ARProyecto.Estado
            VBA.DoEvents
        Set m_ARProyecto = Nothing
    Next
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método CerrrarARAbiertasDeNCCerrados ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function RellenarDatosExpediente(Optional ByRef p_Error As String) As String
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_NC As NCProyecto
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Expediente As Expediente
    
    On Error GoTo errores
    Set m_Col = getNCsProyectosTotales(p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_NC = m_Col(m_ID)
            If m_NC.Expediente <> "" Then
                Set m_Expediente = constructor.getExpedientePorCodigo(p_Cod:=m_NC.Expediente, p_Error:=p_Error)
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            End If
            If m_Expediente Is Nothing Then
                GoTo siguiente
            End If
            m_SQL = "SELECT * FROM TbNoConformidades " & _
                    "WHERE IDNoConformidad=" & m_NC.IDNoConformidad & ";"
            Set rcdDatos = getdb().OpenRecordset(m_SQL)
            With rcdDatos
                If Not .EOF Then
                    .Edit
                        rcdDatos.Fields("IDExpediente") = m_Expediente.IDExpediente
                        rcdDatos.Fields("CodExp") = m_Expediente.CodExp
                        rcdDatos.Fields("EXPEDIENTE") = m_Expediente.CodExp
                        rcdDatos.Fields("Juridica") = m_Expediente.CadenaJuridicas
                        rcdDatos.Fields("JuridicaExp") = m_Expediente.CadenaJuridicas
                        If m_Expediente.Nemotecnico <> "" Then
                            rcdDatos.Fields("Nemotecnico") = m_Expediente.Nemotecnico
                        End If
                        
                    .Update
                End If
            End With
            rcdDatos.Close
            Set rcdDatos = Nothing
            
            'Debug.Print m_NC.CodigoNoConformidad, m_Expediente.CodExp
            VBA.DoEvents
siguiente:
        Set m_NC = Nothing
    Next
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarDatosExpediente ha devuelto el error " & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function

Public Function getACsDeProyectoSinEstado( _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ACProyecto As ACProyecto
    On Error GoTo errores
    
    m_SQL = "SELECT * " & _
            "FROM TbNCAccionCorrectivas " & _
            "WHERE Estado Is Null;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
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
            If getACsDeProyectoSinEstado Is Nothing Then
                Set getACsDeProyectoSinEstado = New Scripting.Dictionary
                getACsDeProyectoSinEstado.CompareMode = TextCompare
            End If
            If Not getACsDeProyectoSinEstado.Exists(CStr(m_ACProyecto.IdAccionCorrectiva)) Then
                getACsDeProyectoSinEstado.Add CStr(m_ACProyecto.IdAccionCorrectiva), m_ACProyecto
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
        p_Error = "El método getACsDeProyectoSinEstado ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getACsDeProyectosAbiertos( _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ACProyecto As ACProyecto
    On Error GoTo errores
    
    m_SQL = "SELECT TbNCAccionCorrectivas.* " & _
            "FROM TbNoConformidades INNER JOIN TbNCAccionCorrectivas " & _
            "ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad " & _
            "WHERE Borrado=False AND FECHACIERRE Is Null;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
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
            If getACsDeProyectosAbiertos Is Nothing Then
                Set getACsDeProyectosAbiertos = New Scripting.Dictionary
                getACsDeProyectosAbiertos.CompareMode = TextCompare
            End If
            If Not getACsDeProyectosAbiertos.Exists(CStr(m_ACProyecto.IdAccionCorrectiva)) Then
                getACsDeProyectosAbiertos.Add CStr(m_ACProyecto.IdAccionCorrectiva), m_ACProyecto
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
        p_Error = "El método getACsDeProyectosAbiertos ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getACsDeProyectoAbiertosSinEstado( _
                                                        Optional ByRef p_Error As String _
                                                        ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ACProyecto As ACProyecto
    On Error GoTo errores
    
    
    m_SQL = "SELECT TbNCAccionCorrectivas.* " & _
            "FROM TbNoConformidades INNER JOIN TbNCAccionCorrectivas " & _
            "ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad " & _
            "WHERE Borrado=False) AND FECHACIERRE Is Null AND TbNCAccionCorrectivas.Estado Is Null;"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
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
            If getACsDeProyectoAbiertosSinEstado Is Nothing Then
                Set getACsDeProyectoAbiertosSinEstado = New Scripting.Dictionary
                getACsDeProyectoAbiertosSinEstado.CompareMode = TextCompare
            End If
            If Not getACsDeProyectoAbiertosSinEstado.Exists(CStr(m_ACProyecto.IdAccionCorrectiva)) Then
                getACsDeProyectoAbiertosSinEstado.Add CStr(m_ACProyecto.IdAccionCorrectiva), m_ACProyecto
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
        p_Error = "El método getACsDeProyectoAbiertosSinEstado ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getNCsDeProyectos( _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NC As NCProyecto
    On Error GoTo errores
    
    
    m_SQL = "TbNoConformidades"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
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
               ' Debug.Print m_Campo
               'If CStr(m_Campo) = "ESTADO" Then Stop
                On Error Resume Next
                
                m_NC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                If Err.Number <> 0 Then
                    On Error GoTo errores
                    p_Error = "Nombre Campo de la tabla " & m_Campo & vbNewLine & "Error en el método Instalador.getNCsDeProyectos"
                    Err.Raise 1000
                End If
                On Error GoTo errores
            Next
            If getNCsDeProyectos Is Nothing Then
                Set getNCsDeProyectos = New Scripting.Dictionary
                getNCsDeProyectos.CompareMode = TextCompare
            End If
            If Not getNCsDeProyectos.Exists(CStr(m_NC.IDNoConformidad)) Then
                getNCsDeProyectos.Add CStr(m_NC.IDNoConformidad), m_NC
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
        p_Error = "El método getNCsDeProyectos ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getNCsDeAuditorias( _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NC As NCAuditoria
    On Error GoTo errores
    
    
    m_SQL = "TbNoConformidadesAuditoria"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
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
               'If CStr(m_Campo) = "ESTADO" Then Stop
                On Error Resume Next
                
                m_NC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                If Err.Number <> 0 Then
                    On Error GoTo errores
                    p_Error = "Nombre Campo de la tabla " & m_Campo & vbNewLine & "Error en el método Instalador.getNCsDeAuditorias"
                    Err.Raise 1000
                End If
                On Error GoTo errores
            Next
            If getNCsDeAuditorias Is Nothing Then
                Set getNCsDeAuditorias = New Scripting.Dictionary
                getNCsDeAuditorias.CompareMode = TextCompare
            End If
            If Not getNCsDeAuditorias.Exists(CStr(m_NC.id)) Then
                getNCsDeAuditorias.Add CStr(m_NC.id), m_NC
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
        p_Error = "El método getNCsDeAuditorias ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getNCsDeProyectosSinExpediente( _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_NC As NCProyecto
    On Error GoTo errores
    
    
    m_SQL = "SELECT * " & _
            "FROM TbNoConformidades " & _
            "WHERE IDExpediente Is Null;"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
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
               ' Debug.Print m_Campo
               'If CStr(m_Campo) = "ESTADO" Then Stop
                On Error Resume Next
                
                m_NC.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                If Err.Number <> 0 Then
                    On Error GoTo errores
                    p_Error = "Nombre Campo de la tabla " & m_Campo & vbNewLine & "Error en el método Instalador.getNCsDeProyectosSinExpediente"
                    Err.Raise 1000
                End If
                On Error GoTo errores
            Next
            If getNCsDeProyectosSinExpediente Is Nothing Then
                Set getNCsDeProyectosSinExpediente = New Scripting.Dictionary
                getNCsDeProyectosSinExpediente.CompareMode = TextCompare
            End If
            If Not getNCsDeProyectosSinExpediente.Exists(CStr(m_NC.IDNoConformidad)) Then
                getNCsDeProyectosSinExpediente.Add CStr(m_NC.IDNoConformidad), m_NC
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
        p_Error = "El método getNCsDeProyectosSinExpediente ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getARsAbiertasDeNCCerrados( _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ARProyecto As ARProyecto
    On Error GoTo errores
    
    
    m_SQL = "SELECT TbNCAccionesRealizadas.* " & _
            "FROM TbNoConformidades INNER JOIN (TbNCAccionCorrectivas INNER JOIN TbNCAccionesRealizadas " & _
            "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva) " & _
            "ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad " & _
            "WHERE ((Not (TbNoConformidades.FECHACIERRE) Is Null) " & _
            "AND ((TbNCAccionesRealizadas.FechaFinReal) Is Null) AND ((TbNoConformidades.Borrado)=False));"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
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
               ' Debug.Print m_Campo
               'If CStr(m_Campo) = "ESTADO" Then Stop
                On Error Resume Next
                
                m_ARProyecto.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                If Err.Number <> 0 Then
                    On Error GoTo errores
                    p_Error = "Nombre Campo de la tabla " & m_Campo & vbNewLine & "Error en el método Instalador.getARsAbiertasDeNCCerrados"
                    Err.Raise 1000
                End If
                On Error GoTo errores
            Next
            If getARsAbiertasDeNCCerrados Is Nothing Then
                Set getARsAbiertasDeNCCerrados = New Scripting.Dictionary
                getARsAbiertasDeNCCerrados.CompareMode = TextCompare
            End If
            If Not getARsAbiertasDeNCCerrados.Exists(CStr(m_ARProyecto.IDAccionRealizada)) Then
                getARsAbiertasDeNCCerrados.Add CStr(m_ARProyecto.IDAccionRealizada), m_ARProyecto
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
        p_Error = "El método getARsAbiertasDeNCCerrados ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getARsSinAlgunaFechaDeNCCerrados( _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ARProyecto As ARProyecto
    On Error GoTo errores
    
    
    m_SQL = "SELECT TbNCAccionesRealizadas.* " & _
            "FROM TbNoConformidades INNER JOIN (TbNCAccionCorrectivas INNER JOIN TbNCAccionesRealizadas " & _
            "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva) " & _
            "ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad " & _
            "WHERE ((Not (TbNoConformidades.FECHACIERRE) Is Null) " & _
            "AND ((TbNCAccionesRealizadas.FechaFinReal) Is Null) AND ((TbNoConformidades.Borrado)=False));"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
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
               ' Debug.Print m_Campo
               'If CStr(m_Campo) = "ESTADO" Then Stop
                On Error Resume Next
                
                m_ARProyecto.SetPropiedad m_Campo, Nz(.Fields(m_Campo).Value, ""), p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                If Err.Number <> 0 Then
                    On Error GoTo errores
                    p_Error = "Nombre Campo de la tabla " & m_Campo & vbNewLine & "Error en el método Instalador.getARsSinAlgunaFechaDeNCCerrados"
                    Err.Raise 1000
                End If
                On Error GoTo errores
            Next
            If getARsSinAlgunaFechaDeNCCerrados Is Nothing Then
                Set getARsSinAlgunaFechaDeNCCerrados = New Scripting.Dictionary
                getARsSinAlgunaFechaDeNCCerrados.CompareMode = TextCompare
            End If
            If Not getARsSinAlgunaFechaDeNCCerrados.Exists(CStr(m_ARProyecto.IDAccionRealizada)) Then
                getARsSinAlgunaFechaDeNCCerrados.Add CStr(m_ARProyecto.IDAccionRealizada), m_ARProyecto
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
        p_Error = "El método getARsSinAlgunaFechaDeNCCerrados ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getACsDeProyectos( _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ACProyecto As ACProyecto
    On Error GoTo errores
    
    
    m_SQL = "TbNCAccionCorrectivas"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
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
            If getACsDeProyectos Is Nothing Then
                Set getACsDeProyectos = New Scripting.Dictionary
                getACsDeProyectos.CompareMode = TextCompare
            End If
            If Not getACsDeProyectos.Exists(CStr(m_ACProyecto.IdAccionCorrectiva)) Then
                getACsDeProyectos.Add CStr(m_ACProyecto.IdAccionCorrectiva), m_ACProyecto
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
        p_Error = "El método getACsDeProyecto ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getACsDeProyectosSinFecha( _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ACProyecto As ACProyecto
    On Error GoTo errores
    
    
    m_SQL = "SELECT  * " & _
            "FROM TbNCAccionCorrectivas " & _
            "WHERE FechaAccionCorrectiva Is Null;"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
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
            If getACsDeProyectosSinFecha Is Nothing Then
                Set getACsDeProyectosSinFecha = New Scripting.Dictionary
                getACsDeProyectosSinFecha.CompareMode = TextCompare
            End If
            If Not getACsDeProyectosSinFecha.Exists(CStr(m_ACProyecto.IdAccionCorrectiva)) Then
                getACsDeProyectosSinFecha.Add CStr(m_ACProyecto.IdAccionCorrectiva), m_ACProyecto
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
        p_Error = "El método getACsDeProyecto ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getACsDeProyectosSinNAccion( _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ACProyecto As ACProyecto
    On Error GoTo errores
    
    
    m_SQL = "SELECT * " & _
            "FROM TbNCAccionCorrectivas " & _
            "WHERE NAccion Is Null;"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
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
            If getACsDeProyectosSinNAccion Is Nothing Then
                Set getACsDeProyectosSinNAccion = New Scripting.Dictionary
                getACsDeProyectosSinNAccion.CompareMode = TextCompare
            End If
            If Not getACsDeProyectosSinNAccion.Exists(CStr(m_ACProyecto.IdAccionCorrectiva)) Then
                getACsDeProyectosSinNAccion.Add CStr(m_ACProyecto.IdAccionCorrectiva), m_ACProyecto
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
        p_Error = "El método getACsDeProyectosSinNAccion ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getACsDeProyectosSolo1Accion( _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ACProyecto As ACProyecto
    On Error GoTo errores
    
    
    m_SQL = "SELECT DISTINCT TbNCAccionCorrectivas.* " & _
            "FROM TbNCAccionCorrectivas " & _
            "WHERE (((TbNCAccionCorrectivas.NAccion)=0) " & _
            "AND ((TbNCAccionCorrectivas.IDAccionCorrectiva) " & _
            "In " & _
                "(SELECT DISTINCT TbNCAccionCorrectivas.IDAccionCorrectiva " & _
                "FROM TbNCAccionCorrectivas " & _
                "GROUP BY TbNCAccionCorrectivas.IDAccionCorrectiva " & _
                "HAVING (((Count(TbNCAccionCorrectivas.IDNoConformidad))=1));)" & _
            "));"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
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
            If getACsDeProyectosSolo1Accion Is Nothing Then
                Set getACsDeProyectosSolo1Accion = New Scripting.Dictionary
                getACsDeProyectosSolo1Accion.CompareMode = TextCompare
            End If
            If Not getACsDeProyectosSolo1Accion.Exists(CStr(m_ACProyecto.IdAccionCorrectiva)) Then
                getACsDeProyectosSolo1Accion.Add CStr(m_ACProyecto.IdAccionCorrectiva), m_ACProyecto
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
        p_Error = "El método getACsDeProyectosSolo1Accion ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getARsDeProyectosSolo1Accion( _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ARProyecto As ARProyecto
    On Error GoTo errores
    
    
    m_SQL = "SELECT DISTINCT TbNCAccionesRealizadas.* " & _
            "FROM TbNCAccionesRealizadas " & _
            "WHERE (((TbNCAccionesRealizadas.NAccion) Is Null Or (TbNCAccionesRealizadas.NAccion)=0) " & _
            "AND ((TbNCAccionesRealizadas.IDAccionRealizada) " & _
            "In " & _
                "(SELECT DISTINCT TbNCAccionesRealizadas.IDAccionRealizada " & _
                "FROM TbNCAccionesRealizadas " & _
                "GROUP BY TbNCAccionesRealizadas.IDAccionRealizada " & _
                "HAVING (((Count(TbNCAccionesRealizadas.IDAccionCorrectiva))=1));)" & _
                "));"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
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
            If getARsDeProyectosSolo1Accion Is Nothing Then
                Set getARsDeProyectosSolo1Accion = New Scripting.Dictionary
                getARsDeProyectosSolo1Accion.CompareMode = TextCompare
            End If
            If Not getARsDeProyectosSolo1Accion.Exists(CStr(m_ARProyecto.IDAccionRealizada)) Then
                getARsDeProyectosSolo1Accion.Add CStr(m_ARProyecto.IDAccionRealizada), m_ARProyecto
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
        p_Error = "El método getARsDeProyectosSolo1Accion ha devuelto el error: " & Err.Description
    End If
End Function

Public Function getARsDeProyectosSinNAccion( _
                                            Optional ByRef p_Error As String _
                                            ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ARProyecto As ARProyecto
    On Error GoTo errores
    
    
    m_SQL = "SELECT * " & _
            "FROM TbNCAccionesRealizadas " & _
            "WHERE NAccion Is Null;"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
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
            If getARsDeProyectosSinNAccion Is Nothing Then
                Set getARsDeProyectosSinNAccion = New Scripting.Dictionary
                getARsDeProyectosSinNAccion.CompareMode = TextCompare
            End If
            If Not getARsDeProyectosSinNAccion.Exists(CStr(m_ARProyecto.IDAccionRealizada)) Then
                getARsDeProyectosSinNAccion.Add CStr(m_ARProyecto.IDAccionRealizada), m_ARProyecto
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
        p_Error = "El método getARsDeProyectosSinNAccion ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getARsDeProyectosAbiertos( _
                                                Optional ByRef p_Error As String _
                                                ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ARProyecto As ARProyecto
    On Error GoTo errores
    
    m_SQL = "SELECT TbNCAccionesRealizadas.* " & _
            "FROM TbNoConformidades INNER JOIN (TbNCAccionCorrectivas INNER JOIN TbNCAccionesRealizadas " & _
            "ON TbNCAccionCorrectivas.IDAccionCorrectiva = TbNCAccionesRealizadas.IDAccionCorrectiva) " & _
            "ON TbNoConformidades.IDNoConformidad = TbNCAccionCorrectivas.IDNoConformidad " & _
            "WHERE Borrado=False AND FECHACIERRE Is Null;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
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
            If getARsDeProyectosAbiertos Is Nothing Then
                Set getARsDeProyectosAbiertos = New Scripting.Dictionary
                getARsDeProyectosAbiertos.CompareMode = TextCompare
            End If
            If Not getARsDeProyectosAbiertos.Exists(CStr(m_ARProyecto.IDAccionRealizada)) Then
                getARsDeProyectosAbiertos.Add CStr(m_ARProyecto.IDAccionRealizada), m_ARProyecto
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
        p_Error = "El método getARsDeProyectosAbiertos ha devuelto el error: " & Err.Description
    End If
End Function


Public Function getARsDeProyectos( _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ARProyecto As ARProyecto
    On Error GoTo errores
    
    m_SQL = "TbNCAccionesRealizadas"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
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
            If getARsDeProyectos Is Nothing Then
                Set getARsDeProyectos = New Scripting.Dictionary
                getARsDeProyectos.CompareMode = TextCompare
            End If
            If Not getARsDeProyectos.Exists(CStr(m_ARProyecto.IDAccionRealizada)) Then
                getARsDeProyectos.Add CStr(m_ARProyecto.IDAccionRealizada), m_ARProyecto
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
        p_Error = "El método getARsDeProyectos ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getARsDeProyectosSinFecha( _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary

    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ARProyecto As ARProyecto
    On Error GoTo errores
    
    m_SQL = "SELECT * " & _
            "FROM TbNCAccionesRealizadas " & _
            "WHERE FechaAccionRealizada Is Null;"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
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
            If getARsDeProyectosSinFecha Is Nothing Then
                Set getARsDeProyectosSinFecha = New Scripting.Dictionary
                getARsDeProyectosSinFecha.CompareMode = TextCompare
            End If
            If Not getARsDeProyectosSinFecha.Exists(CStr(m_ARProyecto.IDAccionRealizada)) Then
                getARsDeProyectosSinFecha.Add CStr(m_ARProyecto.IDAccionRealizada), m_ARProyecto
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
        p_Error = "El método getARsDeProyectosSinFecha ha devuelto el error: " & Err.Description
    End If
End Function
Public Function PruebaHTML(Optional ByRef p_Error As String) As String
    Dim m_HTML As String
    Dim m_NC As NCProyecto
    On Error GoTo errores
    
    Set m_NC = constructor.getNCProyecto(p_IDNC:="401", p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_HTML = HTMLNCProyecto(p_NC:=m_NC, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    HTMLENTXT p_HTML:=m_HTML, p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método PruebaHTML ha devuelto el error " & vbNewLine & Err.Description
    End If
    Debug.Print p_Error
End Function

Public Function RellenarNAccionesACProyecto( _
                                            Optional ByRef p_Error As String _
                                            ) As String
            
   
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_ACProyecto As ACProyecto
    Dim m_IDAC As Variant
    
    Dim m_ACOp As ACProyectoOperaciones
    
    On Error GoTo errores
    
    Set m_Col = getACsDeProyectosSinNAccion(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    Set m_ACOp = New ACProyectoOperaciones
    
    For Each m_ID In m_Col
        Set m_ACProyecto = m_Col(m_ID)
        
        
        
        Set m_ACOp.AC = m_ACProyecto
        m_ACOp.RegistrarNAccion p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        VBA.DoEvents
        Debug.Print m_ACProyecto.IdAccionCorrectiva, m_ACProyecto.NAccion
        VBA.DoEvents
        Set m_ACProyecto = Nothing
        
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarNAccionesACProyecto ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function RellenarNAccionesProyecto( _
                                            Optional ByRef p_Error As String _
                                            ) As String
            
   
    Dim rcdDatosAC As DAO.Recordset
    Dim rcdDatosAR As DAO.Recordset
    Dim m_SQL As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_IDNC As Variant
    
    Dim NumAC As Long
    Dim NumAR As Long
    Dim m_IDAC As String
    
    
    On Error GoTo errores
    
    Set m_Col = getNCsProyectosTotales(p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_IDNC In m_Col
       VBA.DoEvents
       Debug.Print m_IDNC
        VBA.DoEvents
        m_SQL = "SELECT  IDAccionCorrectiva,NAccion, IDNoConformidad " & _
                "FROM TbNCAccionCorrectivas " & _
                "WHERE IDNoConformidad = " & m_IDNC & " " & _
                "ORDER BY IDAccionCorrectiva;"
        Set rcdDatosAC = getdb().OpenRecordset(m_SQL)
        If Not rcdDatosAC.EOF Then
            NumAC = 1
            rcdDatosAC.MoveFirst
            Do While Not rcdDatosAC.EOF
                m_IDAC = rcdDatosAC.Fields("IDAccionCorrectiva")
                rcdDatosAC.Edit
                    rcdDatosAC.Fields("NAccion") = NumAC
                rcdDatosAC.Update
                
                
                
                 m_SQL = "SELECT NAccion " & _
                        "FROM TbNCAccionesRealizadas " & _
                        "WHERE IDAccionCorrectiva = " & m_IDAC & " " & _
                        "ORDER BY IDAccionRealizada;"
                Set rcdDatosAR = getdb().OpenRecordset(m_SQL)
                If Not rcdDatosAR.EOF Then
                    NumAR = 1
                    rcdDatosAR.MoveFirst
                    Do While Not rcdDatosAR.EOF
                        rcdDatosAR.Edit
                            rcdDatosAR.Fields("NAccion") = NumAR
                        rcdDatosAR.Update
                
                        NumAR = NumAR + 1
                        rcdDatosAR.MoveNext
                    Loop
                End If
                NumAC = NumAC + 1
                rcdDatosAC.MoveNext
            Loop
        End If
       
        
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarNAccionesProyecto ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function RellenarNAccionesAuditoria( _
                                            Optional ByRef p_Error As String _
                                            ) As String
            
   
    Dim rcdDatosAC As DAO.Recordset
    Dim rcdDatosAR As DAO.Recordset
    Dim m_SQL As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_IDNC As Variant
    
    Dim NumAC As Long
    Dim NumAR As Long
    Dim m_IDAC As String
    
    
    On Error GoTo errores
    
    Set m_Col = getNCsAuditoriasTotales(p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_IDNC In m_Col
       VBA.DoEvents
       Debug.Print m_IDNC
        VBA.DoEvents
        m_SQL = "SELECT  IDAccionCorrectiva,NAccion, ID " & _
                "FROM TbNCAuditoriaAccionCorrectivas " & _
                "WHERE ID = " & m_IDNC & " " & _
                "ORDER BY IDAccionCorrectiva;"
        Set rcdDatosAC = getdb().OpenRecordset(m_SQL)
        If Not rcdDatosAC.EOF Then
            NumAC = 1
            rcdDatosAC.MoveFirst
            Do While Not rcdDatosAC.EOF
                m_IDAC = rcdDatosAC.Fields("IDAccionCorrectiva")
                rcdDatosAC.Edit
                    rcdDatosAC.Fields("NAccion") = NumAC
                rcdDatosAC.Update
                
                
                
                 m_SQL = "SELECT NAccion " & _
                        "FROM TbNCAuditoriaAccionesRealizadas " & _
                        "WHERE IDAccionCorrectiva = " & m_IDAC & " " & _
                        "ORDER BY IDAccionRealizada;"
                Set rcdDatosAR = getdb().OpenRecordset(m_SQL)
                If Not rcdDatosAR.EOF Then
                    NumAR = 1
                    rcdDatosAR.MoveFirst
                    Do While Not rcdDatosAR.EOF
                        rcdDatosAR.Edit
                            rcdDatosAR.Fields("NAccion") = NumAR
                        rcdDatosAR.Update
                
                        NumAR = NumAR + 1
                        rcdDatosAR.MoveNext
                    Loop
                End If
                NumAC = NumAC + 1
                rcdDatosAC.MoveNext
            Loop
        End If
       
        
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarNAccionesAuditoria ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function RellenarNumeroNCAuditoria( _
                                            Optional ByRef p_Error As String _
                                            ) As String
            
   
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_ID As Variant
    Dim i As Long
    Dim m_Col As Scripting.Dictionary
    
    
    On Error GoTo errores
    
    Set m_Col = getAuditorias(p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        VBA.DoEvents
        Debug.Print m_ID
        VBA.DoEvents
        m_SQL = "SELECT ID, Numero, Tipo " & _
                "FROM TbNoConformidadesAuditoria " & _
                "WHERE Tipo='NC' AND IDAuditoria=" & m_ID & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If Not rcdDatos.EOF Then
            i = 1
            rcdDatos.MoveFirst
            Do While Not rcdDatos.EOF
                
                rcdDatos.Edit
                    rcdDatos.Fields("Numero") = i
                rcdDatos.Update
                
                i = i + 1
                rcdDatos.MoveNext
            Loop
        End If
        m_SQL = "SELECT ID, Numero, Tipo " & _
                "FROM TbNoConformidadesAuditoria " & _
                "WHERE Tipo='OB' AND IDAuditoria=" & m_ID & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If Not rcdDatos.EOF Then
            i = 1
            rcdDatos.MoveFirst
            Do While Not rcdDatos.EOF
                
                rcdDatos.Edit
                    rcdDatos.Fields("Numero") = i
                rcdDatos.Update
                
                i = i + 1
                rcdDatos.MoveNext
            Loop
        End If
         m_SQL = "SELECT ID, Numero, Tipo " & _
                "FROM TbNoConformidadesAuditoria " & _
                "WHERE Tipo='OP' AND IDAuditoria=" & m_ID & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
        If Not rcdDatos.EOF Then
            i = 1
            rcdDatos.MoveFirst
            Do While Not rcdDatos.EOF
                
                rcdDatos.Edit
                    rcdDatos.Fields("Numero") = i
                rcdDatos.Update
                
                i = i + 1
                rcdDatos.MoveNext
            Loop
        End If
        
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarNumeroNCAuditoria ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function RellenarFechasACProyecto( _
                                            Optional ByRef p_Error As String _
                                            ) As String
    
   
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_ACProyecto As ACProyecto
    Dim m_IDAC As Variant
    Dim m_Fecha As String
    Dim m_SQL As String
    
    
    On Error GoTo errores
    
    Set m_Col = getACsDeProyectosSinFecha(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    
    
    For Each m_ID In m_Col
        Set m_ACProyecto = m_Col(m_ID)
        If IsDate(m_ACProyecto.FechaFinPrevistaUltima) Then
            m_Fecha = m_ACProyecto.FechaFinPrevistaUltima
        Else
            If IsDate(m_ACProyecto.nc.FechaApertura) Then
                m_Fecha = m_ACProyecto.nc.FechaApertura
            Else
                m_Fecha = ""
            End If
        End If
        If m_Fecha <> "" Then
            m_SQL = "UPDATE TbNCAccionCorrectivas " & _
                    "SET FechaAccionCorrectiva=#" & Format(m_Fecha, "mm/dd/yyyy") & "# " & _
                    "WHERE IDAccionCorrectiva=" & m_ACProyecto.IdAccionCorrectiva & ";"
            getdb().Execute m_SQL
        End If
        
        
        VBA.DoEvents
        Debug.Print m_ACProyecto.IdAccionCorrectiva, m_Fecha
        VBA.DoEvents
        Set m_ACProyecto = Nothing
        
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarFechasACProyecto ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function

Public Function RellenarFechasARProyecto( _
                                            Optional ByRef p_Error As String _
                                            ) As String
    
   
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_ARProyecto As ARProyecto
    Dim m_IDAC As Variant
    Dim m_Fecha As String
    Dim m_SQL As String
    
    
    On Error GoTo errores
    
    Set m_Col = getARsDeProyectosSinFecha(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    
    
    For Each m_ID In m_Col
        Set m_ARProyecto = m_Col(m_ID)
        If IsDate(m_ARProyecto.FechaInicio) Then
            m_Fecha = m_ARProyecto.FechaInicio
        Else
            If IsDate(m_ARProyecto.AC.FechaAccionCorrectiva) Then
                m_Fecha = m_ARProyecto.AC.FechaAccionCorrectiva
            Else
                If IsDate(m_ARProyecto.AC.nc.FechaApertura) Then
                    m_Fecha = m_ARProyecto.AC.nc.FechaApertura
                Else
                    m_Fecha = ""
                End If
                
            End If
        End If
        If m_Fecha <> "" Then
            m_SQL = "UPDATE TbNCAccionesRealizadas " & _
                    "SET FechaAccionRealizada=#" & Format(m_Fecha, "mm/dd/yyyy") & "# " & _
                    "WHERE IDAccionRealizada=" & m_ARProyecto.IDAccionRealizada & ";"
            getdb().Execute m_SQL
        End If
        
        
        VBA.DoEvents
        Debug.Print m_ARProyecto.IDAccionRealizada, m_Fecha
        VBA.DoEvents
        Set m_ARProyecto = Nothing
        
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarFechasARProyecto ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function


Public Function RegistrarNAccion( _
                                    p_ARProyecto As ARProyecto, _
                                    Optional ByRef p_Error As String _
                                    ) As String
                                        
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    
    
    On Error GoTo errores
   
    With p_ARProyecto
        If IsNumeric(.NAccion) Then
            Exit Function
        End If
        .NAccion = .AC.NAccionARCalculado
        p_Error = .AC.Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        
        
        m_SQL = "SELECT * FROM TbNCAccionesRealizadas " & _
                "WHERE IDAccionRealizada=" & .IDAccionRealizada & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
    
        
        rcdDatos.Edit
            rcdDatos.Fields("NAccion") = .NAccion
            
            
            
        rcdDatos.Update
        rcdDatos.Close
        Set rcdDatos = Nothing
       
    End With
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ARProyectoOperaciones.RegistrarNAccion ha devuelto el error: " & Err.Description
    End If
End Function

Public Function RegistrarResponsable( _
                                    p_ARProyecto As ARProyecto, _
                                    Optional ByRef p_Error As String _
                                    ) As String
                                        
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    
    
    
    On Error GoTo errores
   
    With p_ARProyecto
        If .AC.Responsable = "" Then
            Exit Function
        End If
        
        .Responsable = .AC.Responsable
       
        
        m_SQL = "SELECT * FROM TbNCAccionesRealizadas " & _
                "WHERE IDAccionRealizada=" & .IDAccionRealizada & ";"
        Set rcdDatos = getdb().OpenRecordset(m_SQL)
    
        
        rcdDatos.Edit
            rcdDatos.Fields("Responsable") = .Responsable
            
            
            
        rcdDatos.Update
        rcdDatos.Close
        Set rcdDatos = Nothing
       
    End With
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ARProyectoOperaciones.RegistrarResponsable ha devuelto el error: " & Err.Description
    End If
End Function


Public Function RellenarNAccionesAR( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
   
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_ARProyecto As ARProyecto
    Dim m_IDAC As Variant
    
    
    On Error GoTo errores
    
    Set m_Col = getARsDeProyectosSinNAccion(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    
    
    For Each m_ID In m_Col
        Set m_ARProyecto = m_Col(m_ID)
        RegistrarNAccion m_ARProyecto, p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        
        VBA.DoEvents
        Debug.Print m_ARProyecto.IDAccionRealizada, m_ARProyecto.NAccion
        VBA.DoEvents
        Set m_ARProyecto = Nothing
        
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarNAccionesAR ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function



Public Function RellenarResponsablesDeACsProyecto( _
                                            Optional ByRef p_Error As String _
                                            ) As String
    
   
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_NC As NCProyecto
    Dim m_ACProyecto As ACProyecto
    Dim m_IDAC As Variant
    
    Dim m_ACOp As ACProyectoOperaciones
    
    On Error GoTo errores
    'Set m_Col = getACsDeProyectosAbiertos(p_Error)
    Set m_Col = getNCsDeProyectos(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    Set m_ACOp = New ACProyectoOperaciones
    
    For Each m_ID In m_Col
        Set m_NC = m_Col(m_ID)
        VBA.DoEvents
        'Debug.Print m_NC.CodigoNoConformidad, m_NC.ResponsableTelefonica
        VBA.DoEvents
        If Not m_NC.ACs Is Nothing Then
            For Each m_IDAC In m_NC.ACs
                Set m_ACProyecto = m_NC.ACs(m_IDAC)
                Set m_ACOp.AC = m_ACProyecto
                m_ACOp.RegistrarResponsable p_Error
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                Set m_ACProyecto = Nothing
                
            Next
           Set m_NC = Nothing
        End If
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarResponsablesDeACsProyecto ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function RellenarResponsablesDeARs( _
                                            Optional ByRef p_Error As String _
                                            ) As String
    
   
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_ARProyecto As ARProyecto
    
    
    
    On Error GoTo errores
    'Set m_Col = getACsDeProyectosAbiertos(p_Error)
    Set m_Col = getARsDeProyectos(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
   
    
    For Each m_ID In m_Col
        Set m_ARProyecto = m_Col(m_ID)
        VBA.DoEvents
        Debug.Print m_ARProyecto.IDAccionRealizada
        VBA.DoEvents
        RegistrarResponsable m_ARProyecto, p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Set m_ARProyecto = Nothing
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarResponsablesDeARs ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function
Public Function UnificarCausaConAnalisis( _
                                        Optional ByRef p_Error As String _
                                        ) As String
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Causa As String
    Dim m_ACR As String
    Dim m_CausaYAnalisRaiz As String
    
    On Error GoTo errores
    m_SQL = "TbNoConformidades"
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    If rcdDatos.EOF Then
        Exit Function
    End If
    Do While Not rcdDatos.EOF
        m_ACR = Nz(rcdDatos.Fields("ACR"), "")
        m_Causa = Nz(rcdDatos.Fields("CAUSA"), "")
        m_CausaYAnalisRaiz = "[Causa]" & " " & m_Causa & vbNewLine & "[ACR]" & " " & m_ACR
        rcdDatos.Edit
            rcdDatos.Fields("CausaYAnalisRaiz") = m_CausaYAnalisRaiz
        rcdDatos.Update
        rcdDatos.MoveNext
    Loop
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método UnificarCausaConAnalisis ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function

Public Function RellenarRequiereACProyecto( _
                                    Optional ByRef p_Error As String _
                                    ) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_NC As NCProyecto
    Dim m_Estados As String
    Dim m_SQL As String
    
    On Error GoTo errores
    'Set m_Col = getACsDeProyectosAbiertos(p_Error)
'    Set m_Col = getNCsDeProyectos(p_Error)
'    If p_Error <> "" Then
'        Err.Raise 1000
'    End If
'    If m_Col Is Nothing Then
'        Exit Function
'    End If
'    For Each m_ID In m_Col
'        Set m_NC = m_Col(m_ID)
'            'If m_NC.CodigoNoConformidad = "NC0159" Then Stop
'            m_NC.RequiereACR = True
'            m_SQL = "UPDATE TbNoConformidades set RequiereACR=True;"
'            getdb().Execute m_SQL
'            VBA.DoEvents
'            Debug.Print m_NC.IDNoConformidad, m_NC.RequiereACR
'            VBA.DoEvents
'        Set m_NC = Nothing
'    Next
'
    m_SQL = "UPDATE TbNoConformidades set RequiereACR=True;"
    getdb().Execute m_SQL
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarRequiereACProyecto ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function

Public Function CargarDatosDeTbOriginalAPruebas( _
                                                Optional ByRef p_Error As String _
                                                ) As String
                                        
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_NC As NCProyecto
    Dim m_ColNC As Scripting.Dictionary
    Dim m_ColAC As Scripting.Dictionary
    Dim m_ColAR As Scripting.Dictionary
    Dim m_IDAC As Variant
    Dim m_IDAR As Variant
    
    
    
    On Error GoTo errores
    m_SQL = "DELETE * " & _
            "FROM TbNoConformidades;"
    getdb.Execute m_SQL
    
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método CargarDatosDeTbOriginalAPruebas ha devuelto el error: " & Err.Description
    End If
End Function

Public Function ListadoURLHuerfanas( _
                                            Optional ByRef p_Error As String _
                                            ) As String
            
   
   
    Dim m_Listado As String
    Dim m_Col As Scripting.Dictionary
    Dim m_IDNC As Variant
    Dim m_IDAC As Variant
    Dim m_IDAR As Variant
    Dim m_NC As NCProyecto
    Dim m_AC As ACProyecto
    Dim m_AR As ARProyecto
    Dim m_IDDOC As Variant
    Dim m_Documento As DocumentoProyecto
    On Error GoTo errores
    
    Set m_Col = getNCsProyectosTotales(p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_IDNC In m_Col
       
        Set m_NC = m_Col(m_IDNC)
        
        If Not m_NC.Documentos Is Nothing Then
            For Each m_IDDOC In m_NC.Documentos
                Set m_Documento = m_NC.Documentos(m_IDDOC)
                If Not fso.FileExists(m_Documento.URLAnexo) Then
                    VBA.DoEvents
                    Debug.Print m_NC.CodigoNoConformidad
                    VBA.DoEvents
                    If m_Listado = "" Then
                        m_Listado = m_Documento.NombreAnexo
                    Else
                        m_Listado = m_Listado & vbNewLine & m_Documento.NombreAnexo
                    End If
                    
                End If
                Set m_Documento = Nothing
            Next
        End If
        If Not m_NC.ACs Is Nothing Then
            For Each m_IDAC In m_NC.ACs
                Set m_AC = m_NC.ACs(m_IDAC)
                If Not m_AC.ARs Is Nothing Then
                    For Each m_IDAR In m_AC.ARs
                        Set m_AR = m_AC.ARs(m_IDAR)
                        If Not m_AR.Documentos Is Nothing Then
                            For Each m_IDDOC In m_AR.Documentos
                                Set m_Documento = m_AR.Documentos(m_IDDOC)
                                If Not fso.FileExists(m_Documento.URLAnexo) Then
                                    VBA.DoEvents
                                    Debug.Print m_NC.CodigoNoConformidad
                                    VBA.DoEvents
                                    If m_Listado = "" Then
                                        m_Listado = m_Documento.NombreAnexo
                                    Else
                                        m_Listado = m_Listado & vbNewLine & m_Documento.NombreAnexo
                                    End If
                                End If
                                Set m_Documento = Nothing
                            Next
                        End If
                        Set m_AR = Nothing
                    Next
                End If
                Set m_AC = Nothing
            Next
        End If
        Set m_NC = Nothing
    Next
    ListadoURLHuerfanas = m_Listado
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método ListadoURLHuerfanas ha devuelto el error: " & Err.Description
    End If
    Debug.Print p_Error
End Function

