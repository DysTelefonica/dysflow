Attribute VB_Name = "Instalador"
Option Compare Database
Option Explicit

Public Function getExpedientesPrincipalesConNemotecnicos( _
                                                            Optional ByRef p_Error As String _
                                                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_expediente As Expediente
    
    
    On Error GoTo errores
    m_SQL = "SELECT * " & _
            "FROM TbExpedientes " & _
            "WHERE (((TbExpedientes.IDExpedientePadre) Is Null) " & _
            "AND ((TbExpedientes.EsAM)='Sí') " & _
            "AND (Not (TbExpedientes.Nemotecnico) Is Null)) OR (((TbExpedientes.IDExpedientePadre) Is Null) " & _
            "AND ((TbExpedientes.EsLote)='Sí') AND (Not (TbExpedientes.Nemotecnico) Is Null));"
    
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
             If getExpedientesPrincipalesConNemotecnicos Is Nothing Then
                Set getExpedientesPrincipalesConNemotecnicos = New Scripting.Dictionary
                getExpedientesPrincipalesConNemotecnicos.CompareMode = TextCompare
             End If
             If Not getExpedientesPrincipalesConNemotecnicos.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesPrincipalesConNemotecnicos.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesPrincipalesConNemotecnicos ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientesSinEstado( _
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
            "NOT APLICAESTADO Is Null " & _
            "AND ESTADO Is Null " & _
            "AND APLICAESTADO='Sí';"
    
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
             If getExpedientesSinEstado Is Nothing Then
                Set getExpedientesSinEstado = New Scripting.Dictionary
                getExpedientesSinEstado.CompareMode = TextCompare
             End If
             If Not getExpedientesSinEstado.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesSinEstado.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesSinEstado ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getEstadosDistintosMartina( _
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
            "NOT APLICAESTADO Is Null " & _
            "AND ESTADO Is Null " & _
            "AND APLICAESTADO='Sí';"
    
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
             If getEstadosDistintosMartina Is Nothing Then
                Set getEstadosDistintosMartina = New Scripting.Dictionary
                getEstadosDistintosMartina.CompareMode = TextCompare
             End If
             If Not getEstadosDistintosMartina.exists(CStr(m_expediente.IDExpediente)) Then
                getEstadosDistintosMartina.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getEstadosDistintosMartina ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientesAplicaEstado( _
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
            "APLICAESTADO='Sí';"
    
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
             If getExpedientesAplicaEstado Is Nothing Then
                Set getExpedientesAplicaEstado = New Scripting.Dictionary
                getExpedientesAplicaEstado.CompareMode = TextCompare
             End If
             If Not getExpedientesAplicaEstado.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesAplicaEstado.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesAplicaEstado ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientesEnOferta( _
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
            "ESTADO ='Oferta';"
    
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
             If getExpedientesEnOferta Is Nothing Then
                Set getExpedientesEnOferta = New Scripting.Dictionary
                getExpedientesEnOferta.CompareMode = TextCompare
             End If
             If Not getExpedientesEnOferta.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesEnOferta.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesEnOferta ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientesEntidades( _
                                            Optional ByRef p_Error As String _
                                        ) As Scripting.Dictionary
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Campo As Variant
    Dim m_ExpedienteEntidad As ExpedienteEntidad
    
    
    On Error GoTo errores
    m_SQL = "TbExpedientesConEntidades"
    
    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            Set m_ExpedienteEntidad = New ExpedienteEntidad
            For Each m_Campo In m_ExpedienteEntidad.ColCampos
                m_ExpedienteEntidad.SetPropiedad m_Campo, Nz(.Fields(m_Campo).value, ""), p_Error
                 If p_Error <> "" Then
                     Err.Raise 1000
                 End If
             Next
             If getExpedientesEntidades Is Nothing Then
                Set getExpedientesEntidades = New Scripting.Dictionary
                getExpedientesEntidades.CompareMode = TextCompare
             End If
             If Not getExpedientesEntidades.exists(CStr(m_ExpedienteEntidad.IDExpediente)) Then
                getExpedientesEntidades.Add CStr(m_ExpedienteEntidad.IDExpediente), m_ExpedienteEntidad
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesEntidades ha devuelto el error: " & Err.Description
    End If
End Function
Public Function getExpedientesFuera( _
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
            "AMBITO ='FUERA';"
    
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
             If getExpedientesFuera Is Nothing Then
                Set getExpedientesFuera = New Scripting.Dictionary
                getExpedientesFuera.CompareMode = TextCompare
             End If
             If Not getExpedientesFuera.exists(CStr(m_expediente.IDExpediente)) Then
                getExpedientesFuera.Add CStr(m_expediente.IDExpediente), m_expediente
             End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExpedientesFuera ha devuelto el error: " & Err.Description
    End If
End Function
Public Function RegistraMeses(Optional ByRef p_Error As String) As String
    
    
    Dim rcdDatos As DAO.Recordset
    Dim m_SQL As String
    Dim m_Meses As String
    On Error GoTo errores
    
    EVE p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
     m_SQL = "SELECT * " & _
            "FROM TbExpedientes " & _
            "WHERE " & _
            "NOT FechaFinGarantia Is Null " & _
            "AND NOT FechaFinContrato Is Null " & _
            "AND GARANTIAMESES Is Null ;"

    Set rcdDatos = getdb().OpenRecordset(m_SQL)
    With rcdDatos
        If .EOF Then
            rcdDatos.Close
            Set rcdDatos = Nothing
            Exit Function
        End If
        .MoveFirst
        Do While Not .EOF
            m_Meses = DateDiff("m", .Fields("FechaFinContrato"), .Fields("FechaFinGarantia"))
            If IsNumeric(m_Meses) Then
                .Edit
                    .Fields("GARANTIAMESES") = m_Meses
                .Update
            
            End If
            .MoveNext
        Loop
        
    End With
    rcdDatos.Close
    Set rcdDatos = Nothing
    
    
    Exit Function
errores:
    If Err.Number <> 0 Then
        p_Error = "El método RegistraMeses ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function
Public Function RegistraFechaAdjudicacion(Optional ByRef p_Error As String) As String
    
    
    Dim m_Col As Scripting.Dictionary
    Dim m_expediente As Expediente
    Dim m_ID As Variant
    Dim m_SQL As String
    Dim m_Estado As String
    On Error GoTo errores

    EVE p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_Col = getExpedientesEnOferta(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        'If CStr(m_ID) = "1035" Then Stop
        Set m_expediente = m_Col(m_ID)
        If Not IsDate(m_expediente.FechaInicioContrato) Then
            GoTo siguiente
        End If
        If Year(CDate(m_expediente.FechaInicioContrato)) < Year(Now()) Then
            m_expediente.FECHAADJUDICACION = m_expediente.FechaInicioContrato
            If m_expediente.Observaciones = "" Then
                m_expediente.Observaciones = "Fecha Adjudicación automática para regularizar"
            Else
                m_expediente.Observaciones = m_expediente.Observaciones & vbNewLine & _
                                            "Fecha Adjudicación automática para regularizar"
            End If
            m_Estado = m_expediente.ESTADOCalculadoTexto
            m_SQL = "UPDATE TbExpedientes SET " & _
                    "Estado = '" & m_Estado & "', " & _
                    "FECHAADJUDICACION = #" & Format(m_expediente.FECHAADJUDICACION, "mm/dd/yyyy") & "#, " & _
                    "Observaciones = '" & m_expediente.Observaciones & "' " & _
                    "WHERE IDExpediente=" & m_expediente.IDExpediente & ";"
            getdb().Execute m_SQL
            VBA.DoEvents
            Debug.Print m_expediente.IDExpediente, m_expediente.CodExp, m_Estado
            VBA.DoEvents
            m_Estado = ""
        End If
siguiente:
        Set m_expediente = Nothing
    Next
    

    Exit Function
errores:
    If Err.Number <> 0 Then
        p_Error = "El método RegistraEstado ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function
Public Function RegistraNoAplicaEstado(Optional ByRef p_Error As String) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_expediente As Expediente
    Dim m_ID As Variant
    Dim m_SQL As String
    Dim m_Estado As String
    On Error GoTo errores

    EVE p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_Col = m_ObjEntorno.ColExpedientesEstadoDesconocido
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_expediente = m_Col(m_ID)
        If m_expediente.TipoCalculado = EnumTipoExpediente.BasadoDeAM Or _
             m_expediente.TipoCalculado = EnumTipoExpediente.BasadoDeLote Or _
              m_expediente.TipoCalculado = EnumTipoExpediente.EXPIndividual Then
              GoTo siguiente
        End If
        If m_expediente.Derivados Is Nothing Then
            GoTo siguiente
        End If
        m_expediente.APLICAESTADO = "No"
        m_Estado = m_expediente.ESTADOCalculadoTexto
            m_SQL = "UPDATE TbExpedientes SET " & _
                    "Estado = '" & m_Estado & "', " & _
                    "APLICAESTADO = '" & m_expediente.APLICAESTADO & "' " & _
                    "WHERE IDExpediente=" & m_expediente.IDExpediente & ";"
           
            getdb().Execute m_SQL
            VBA.DoEvents
            Debug.Print m_expediente.IDExpediente, m_expediente.CodExp, m_Estado
            VBA.DoEvents
            m_Estado = ""
        
siguiente:
        Set m_expediente = Nothing
    Next
    

    Exit Function
errores:
    If Err.Number <> 0 Then
        p_Error = "El método RegistraNoAplicaEstado ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function

Public Function RegistraEstado(Optional ByRef p_Error As String) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_expediente As Expediente
    Dim m_ID As Variant
    Dim m_SQL As String
    Dim m_Estado As String
    On Error GoTo errores

    EVE p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_Col = getExpedientesAplicaEstado(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_expediente = m_Col(m_ID)
        
        m_Estado = m_expediente.ESTADOCalculadoTexto
        p_Error = m_expediente.Error
        If p_Error <> "" Then
            Stop
        End If
        If m_Estado <> "" Then
            If m_Estado <> m_expediente.ESTADO Then
                m_SQL = "UPDATE TbExpedientes SET Estado = '" & m_Estado & "' " & _
                        "WHERE IDExpediente=" & m_expediente.IDExpediente & ";"
                getdb().Execute m_SQL
                VBA.DoEvents
                Debug.Print m_expediente.IDExpediente, m_expediente.CodExp, m_Estado
                VBA.DoEvents
            End If
            
            m_Estado = ""
        Else
            Stop
        End If
        Set m_expediente = Nothing
    Next
    

    Exit Function
errores:
    If Err.Number <> 0 Then
        p_Error = "El método RegistraEstado ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function
Public Function RegistraResponsablesEnEntidades(Optional ByRef p_Error As String) As String
    
    Dim m_Col As Scripting.Dictionary
    Dim m_ExpedienteEntidad As ExpedienteEntidad
    Dim m_ID As Variant
    Dim m_SQL As String
    Dim m_CadenaResponsables As String
    Dim m_expediente As Expediente
    On Error GoTo errores

    EVE p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_Col = getExpedientesEntidades(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_ExpedienteEntidad = m_Col(m_ID)
        Set m_expediente = m_ExpedienteEntidad.Expediente
        If m_expediente.AGEDYSGenericoCalculado = EnumSiNo.Sí Then
            m_CadenaResponsables = ""
        Else
            m_CadenaResponsables = m_expediente.CadenaResponsables
            p_Error = m_ExpedienteEntidad.Expediente.Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End If
        
        If m_CadenaResponsables = "" Then
            m_SQL = "UPDATE TbExpedientesConEntidades SET CadenaJPs = Null " & _
                        "WHERE IDExpediente=" & m_ExpedienteEntidad.IDExpediente & ";"
        Else
            m_SQL = "UPDATE TbExpedientesConEntidades SET CadenaJPs = '" & m_CadenaResponsables & "' " & _
                            "WHERE IDExpediente=" & m_ExpedienteEntidad.IDExpediente & ";"
        End If
        
        getdb().Execute m_SQL
        VBA.DoEvents
        Debug.Print m_expediente.IDExpediente, m_expediente.CodExp, m_CadenaResponsables
        VBA.DoEvents
        
        m_CadenaResponsables = ""
        Set m_expediente = Nothing
        Set m_ExpedienteEntidad = Nothing
    Next
    

    Exit Function
errores:
    If Err.Number <> 0 Then
        p_Error = "El método RegistraResponsablesEnEntidades ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function
Public Function RellenoDeDatosDeAGEDYS(Optional ByRef p_Error As String)
    
    Dim rcdDatosOrigen As DAO.Recordset
    Dim rcdDatosDestino As DAO.Recordset
    Dim m_IDClasificacion As String
    Dim m_IDOficinaPrograma As String
    Dim m_IDReponsableCalidad As String
    Dim m_Usuario As USUARIO
    Dim m_SQL As String
    Dim m_Total As Long
    Dim m_Contador As Long
    On Error GoTo errores
    
    EVE p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    m_SQL = "DELETE * " & _
            "FROM TbExpedientes " & _
            "WHERE IDExpediente<1000;"
    getdb().Execute m_SQL
    
    m_SQL = "SELECT distinct TbExpedientes1.* " & _
            "FROM TbExpedientes1 INNER JOIN TbProyectos ON TbExpedientes1.IdExpediente = TbProyectos.IDExpediente " & _
            "ORDER BY TbExpedientes1.IdExpediente;"
    Set rcdDatosOrigen = getdb().OpenRecordset(m_SQL)
    
    m_SQL = "TbExpedientes"
    Set rcdDatosDestino = getdb().OpenRecordset(m_SQL)
    
    m_Total = rcdDatosOrigen.RecordCount
    rcdDatosOrigen.MoveFirst
    MostrarPopupProgreso "Migrando datos AGEDYS", "Importando expedientes..."
    m_Contador = 0
    
    Do While Not rcdDatosOrigen.EOF
        m_Contador = m_Contador + 1
        If m_Contador Mod 50 = 0 Then
            Forms("frmBusy").lblEstado.Caption = "Registro " & m_Contador & " de " & m_Total
        End If
        rcdDatosDestino.AddNew
            rcdDatosDestino.Fields("IDExpediente") = rcdDatosOrigen.Fields("IDExpediente")
            rcdDatosDestino.Fields("Titulo") = rcdDatosOrigen.Fields("TITULOEXP")
            rcdDatosDestino.Fields("CodExp") = rcdDatosOrigen.Fields("Expediente")
            rcdDatosDestino.Fields("CodExpLargo") = rcdDatosOrigen.Fields("CodExpedienteLargo")
            rcdDatosDestino.Fields("FechaInicioContrato") = rcdDatosOrigen.Fields("FirmadelContrato")
            rcdDatosDestino.Fields("FechaFinContrato") = rcdDatosOrigen.Fields("FechaFinExp")
            If IsDate(rcdDatosOrigen.Fields("FechaFinExp")) Then
                If IsNumeric(rcdDatosOrigen.Fields("AñosGarantia")) Then
                    rcdDatosDestino.Fields("FechaFinGarantia") = DateAdd("yyyy", CDbl(rcdDatosOrigen.Fields("AñosGarantia")), rcdDatosOrigen.Fields("FechaFinExp"))
                End If
            End If
            rcdDatosDestino.Fields("Ambito") = "Sí"
            rcdDatosDestino.Fields("EsAM") = "No"
            rcdDatosDestino.Fields("EsLote") = "No"
            rcdDatosDestino.Fields("EsBasado") = "No"
            rcdDatosDestino.Fields("EsExpediente") = "Sí"
            If Nz(rcdDatosOrigen.Fields("CLASIFICACION"), "") <> "" Then
                m_IDClasificacion = Dame("TbGradosClasificacion", "IdGradoClasificacion", "GradoClasificacion", _
                                    rcdDatosOrigen.Fields("CLASIFICACION"), getdb(), p_Error)
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                If Not IsNumeric(m_IDClasificacion) Then Stop
                rcdDatosDestino.Fields("IdGradoClasificacion") = m_IDClasificacion
            End If
            If Nz(rcdDatosOrigen.Fields("OFICINADELPROGRAMA"), "") <> "" Then
                m_IDClasificacion = Dame("TbOficinasPrograma", "IDOficinaPrograma", "OficinaPrograma", _
                    rcdDatosOrigen.Fields("OFICINADELPROGRAMA"), getdb(), p_Error)
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                If Not IsNumeric(m_IDClasificacion) Then Stop
                rcdDatosDestino.Fields("IdGradoClasificacion") = m_IDClasificacion
            End If
            rcdDatosDestino.Fields("Observaciones") = rcdDatosOrigen.Fields("Comentarios")
            rcdDatosDestino.Fields("FechaCreacion") = Date
            rcdDatosDestino.Fields("IDUsuarioCreacion") = m_ObjUsuarioConectado.ID
            If Nz(rcdDatosOrigen.Fields("ResponsableCalidad"), "") <> "" Then
                Set m_Usuario = constructor.getUsuario(p_Nombre:=rcdDatosOrigen.Fields("ResponsableCalidad"), p_Error:=p_Error)
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
                If m_Usuario Is Nothing Then
                    Stop
                End If
                rcdDatosDestino.Fields("IDResponsableCalidad") = m_Usuario.ID
            End If
            rcdDatosDestino.Fields("Adjudicado") = "Sí"
            rcdDatosDestino.Fields("EnPeriodoDeAdjudicacion") = "No"
            rcdDatosDestino.Fields("Tipo") = "Expediente individual"
            rcdDatosDestino.Fields("AGEDYSAplica") = "Sí"
            rcdDatosDestino.Fields("AGEDYSGenerico") = rcdDatosOrigen.Fields("Generico")
        rcdDatosDestino.Update
        rcdDatosOrigen.MoveNext
    Loop
    rcdDatosOrigen.Close
    Set rcdDatosOrigen = Nothing
    rcdDatosDestino.Close
    Set rcdDatosDestino = Nothing
    CerrarPopupProgreso
    Exit Function
errores:
    CerrarPopupProgreso
    If Err.Number <> 0 Then
        p_Error = "El método RellenoDeDatosDeAGEDYS ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function



Public Function RellenarOficinasProgramas(Optional ByRef p_Error As String)
    
    Dim rcdDatosOrigen As DAO.Recordset
    Dim rcdDatosDestino As DAO.Recordset
    Dim m_SQL As String
    On Error GoTo errores
    
    
    m_SQL = "DELETE * FROM TbExpedientes;"
    getdb().Execute m_SQL
    
    m_SQL = "TbExpAgedys"
    Set rcdDatosOrigen = getdb().OpenRecordset(m_SQL)
    
    m_SQL = "TbExpedientes"
    Set rcdDatosDestino = getdb().OpenRecordset(m_SQL)
    
    Do While Not rcdDatosOrigen.EOF
        rcdDatosDestino.AddNew
            rcdDatosDestino.Fields("IDExpediente") = rcdDatosOrigen.Fields("IDExpediente")
            rcdDatosDestino.Fields("CodExp") = rcdDatosOrigen.Fields("Expediente")
            rcdDatosDestino.Fields("CodExpLargo") = rcdDatosOrigen.Fields("CodExpedienteLargo")
            rcdDatosDestino.Fields("Titulo") = rcdDatosOrigen.Fields("TITULOEXP")
            rcdDatosDestino.Fields("FechaInicioContrato") = rcdDatosOrigen.Fields("FirmadelContrato")
            rcdDatosDestino.Fields("FechaFinContrato") = rcdDatosOrigen.Fields("FechaFinExp")
            rcdDatosDestino.Fields("EsAM") = rcdDatosOrigen.Fields("AcuerdoMarco")
            If rcdDatosOrigen.Fields("AcuerdoMarco") <> "Sí" Then
                rcdDatosDestino.Fields("EsExpediente") = "Sí"
                rcdDatosDestino.Fields("EsLote") = "No"
            End If
        rcdDatosDestino.Update
        rcdDatosOrigen.MoveNext
    Loop
    
    Exit Function
errores:
    If Err.Number <> 0 Then
        p_Error = "El método RellenoDeDatosDeAGEDYS ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function
Public Function RellenarCadenaPecales(Optional ByRef p_Error As String)
    
    Dim m_expediente As Expediente
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_Contador As Long
    Dim m_Total As Long
    On Error GoTo errores
    
    Set m_Col = constructor.getExpedientes(p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ExpOp = New ExpedienteOperaciones
    If m_Col Is Nothing Then
        Exit Function
    End If
    m_Total = m_Col.Count
    m_Contador = 0
    MostrarPopupProgreso "Actualizando PECAL", "Procesando expediente..."
    For Each m_ID In m_Col
        'If CStr(m_ID) = "299" Then Stop
        m_Contador = m_Contador + 1
        If m_Contador Mod 50 = 0 Then
            Forms("frmBusy").lblEstado.Caption = "Procesado " & m_Contador & " de " & m_Total
        End If
        Set m_expediente = m_Col(m_ID)
        VBA.DoEvents
        Debug.Print m_ID
        VBA.DoEvents
        With m_ExpOp
            Set .Expediente = m_expediente
            .ActualizarCadenaPECAL p_Error
        End With
        
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Set m_expediente = Nothing
    Next
    
    CerrarPopupProgreso
    Exit Function
errores:
    CerrarPopupProgreso
    If Err.Number <> 0 Then
        p_Error = "El método RellenarCadenaPecales ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function

Public Function ActualizaTipoInforme(Optional ByRef p_Error As String) As String
    
    
    Dim m_SQL As String
    Dim m_expediente As Expediente
    Dim m_TipoInformeCalculado As String
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    
    On Error GoTo errores
    
    EVE p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_Col = constructor.getExpedientes(p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_expediente = m_Col(m_ID)
        'If m_Expediente.IDExpediente = "1025" Then Stop
        m_TipoInformeCalculado = m_expediente.TipoInformeCalculado
        If m_TipoInformeCalculado <> "" Then
            m_SQL = "UPDATE TbExpedientes SET TipoInforme = '" & m_TipoInformeCalculado & "' " & _
                    "WHERE IDExpediente=" & m_expediente.IDExpediente & ";"
            getdb().Execute m_SQL
        Else
            Stop
        End If
        Set m_expediente = Nothing
    Next
    
    
    Exit Function
errores:
    If Err.Number <> 0 Then
        p_Error = "El método ActualizaTipoInforme ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function

Public Function InstActualizaNemotecnico(Optional ByRef p_Error As String) As String
    
    
    Dim m_SQL As String
    Dim m_expediente As Expediente
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    Dim m_ExpOp As ExpedienteOperaciones
    On Error GoTo errores
    
    
    Set m_Col = getExpedientesPrincipalesConNemotecnicos(p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    Set m_ExpOp = New ExpedienteOperaciones
    For Each m_ID In m_Col
        Set m_expediente = m_Col(m_ID)
        m_ExpOp.ActualizaNemotecnicosFamilia m_expediente, p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        Set m_expediente = Nothing
    Next
    
    
    Exit Function
errores:
    If Err.Number <> 0 Then
        p_Error = "El método InstActualizaNemotecnico ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function

Public Function ActualizaConCadenaEntidades(Optional ByRef p_Error As String) As String
    
    
    Dim m_SQL As String
    Dim m_expediente As Expediente
    
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    
    On Error GoTo errores
    
    EVE p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_Col = constructor.getExpedientes(p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    
    
    Set m_ExpOp = New ExpedienteOperaciones
    For Each m_ID In m_Col
        Set m_expediente = m_Col(m_ID)
        VBA.DoEvents
        Debug.Print m_expediente.CodExp
        With m_ExpOp
            Set .Expediente = m_expediente
            .RegistrarExpEntidades p_Error:=p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End With
        Set m_expediente = Nothing
    Next
    
    
    Exit Function
errores:
    If Err.Number <> 0 Then
        p_Error = "El método ActualizaConCadenaEntidades ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function
Public Function ActualizaConRSeguridadEntidades(Optional ByRef p_Error As String) As String
    
    
    Dim m_SQL As String
    Dim m_expediente As Expediente
    
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    
    On Error GoTo errores
    
    EVE p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_Col = constructor.getExpedientesConResponsableSeguridad(p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    
    
    Set m_ExpOp = New ExpedienteOperaciones
    For Each m_ID In m_Col
        Set m_expediente = m_Col(m_ID)
        VBA.DoEvents
        Debug.Print m_expediente.CodExp
        With m_ExpOp
            Set .Expediente = m_expediente
            .RegistrarExpEntidades p_Error:=p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End With
        Set m_expediente = Nothing
    Next
    
    
    Exit Function
errores:
    If Err.Number <> 0 Then
        p_Error = "El método ActualizaConRSeguridadEntidades ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function
Public Function RegistraConCadenaEntidadesLosNoExistentes(Optional ByRef p_Error As String) As String
    
    
    Dim m_SQL As String
    Dim m_expediente As Expediente
    
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_ID As Variant
    Dim m_Col As Scripting.Dictionary
    Dim m_Total As Long
    Dim m_Contador As Long
    
    On Error GoTo errores
    
'    EVE p_Error
'    If p_Error <> "" Then
'        Err.Raise 1000
'    End If
    Set m_Col = constructor.getExpedientesNoEnEntidades(p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    
    m_Total = m_Col.Count
    m_Contador = 0
    MostrarPopupProgreso "Registrando faltantes", "Procesando expedientes..."
    
    Set m_ExpOp = New ExpedienteOperaciones
    For Each m_ID In m_Col
        m_Contador = m_Contador + 1
        If m_Contador Mod 50 = 0 Then
            Forms("frmBusy").lblEstado.Caption = "Procesado " & m_Contador & " de " & m_Total
        End If
        Set m_expediente = m_Col(m_ID)
        VBA.DoEvents
        Debug.Print m_expediente.CodExp
        With m_ExpOp
            Set .Expediente = m_expediente
            .RegistrarExpEntidades p_Error:=p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
        End With
        Set m_expediente = Nothing
    Next
    
    CerrarPopupProgreso
    Exit Function
errores:
    CerrarPopupProgreso
    If Err.Number <> 0 Then
        p_Error = "El método RegistraConCadenaEntidadesLosNoExistentes ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function

Public Function RegistraTipoParaLista(Optional ByRef p_Error As String) As String
    
    Dim m_Exp As Expediente
    Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_SQL As String
    Dim m_TipoParaLista As String
    On Error GoTo errores

    EVE p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_Col = constructor.getExpedientes(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    For Each m_ID In m_Col
        Set m_Exp = m_Col(m_ID)
        
        m_TipoParaLista = m_Exp.TipoParaLista
        p_Error = m_Exp.Error
        If p_Error <> "" Then
            Stop
        End If
        If m_TipoParaLista <> "" Then
           
            m_SQL = "UPDATE TbExpedientesConEntidades SET TipoParaLista = '" & m_TipoParaLista & "' " & _
                    "WHERE IDExpediente=" & m_Exp.IDExpediente & ";"
            getdb().Execute m_SQL
            VBA.DoEvents
            Debug.Print m_Exp.IDExpediente, m_TipoParaLista
            VBA.DoEvents
            
            
            m_TipoParaLista = ""
        Else
            'Stop
        End If
        Set m_Exp = Nothing
    Next
    

    Exit Function
errores:
    If Err.Number <> 0 Then
        p_Error = "El método RegistraTipoParaLista ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function
Public Function getExpedientesNoPasaCriterioGR(Optional ByRef p_Error As String) As Scripting.Dictionary
    
    
    Dim m_Col As Scripting.Dictionary
    Dim m_expediente As Expediente
    Dim m_GR As GestionRiesgos
    Dim m_MotivoNoOKGR As String
    Dim m_ID As Variant
    On Error GoTo errores

    
    Set m_Col = m_ObjEntorno.ColExpedientesEnGestionDeRiesgos
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        Exit Function
    End If
    
    
    For Each m_ID In m_Col
        'If CStr(m_ID) = "1035" Then Stop
        Set m_expediente = m_Col(m_ID)
        m_MotivoNoOKGR = MotivoNoOKGR(m_expediente, p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If m_MotivoNoOKGR <> "" Then
            If getExpedientesNoPasaCriterioGR Is Nothing Then
                Set getExpedientesNoPasaCriterioGR = New Scripting.Dictionary
                getExpedientesNoPasaCriterioGR.CompareMode = TextCompare
            End If
            If Not getExpedientesNoPasaCriterioGR.exists(m_expediente.IDExpediente) Then
                getExpedientesNoPasaCriterioGR.Add m_expediente.IDExpediente, m_MotivoNoOKGR
            End If
        End If
        
        Set m_expediente = Nothing
    Next
    

    Exit Function
errores:
    If Err.Number <> 0 Then
        p_Error = "El método getExpedientesNoPasaCriterioGR ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function
Public Function ComprobarExpConGR(Optional ByRef p_Error As String) As String
    
    
    Dim m_Col As Scripting.Dictionary
    Dim m_MotivoNoOKGR As String
    Dim m_ID As Variant
    On Error GoTo errores

    EVE p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_Col = getExpedientesNoPasaCriterioGR(p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
        ComprobarExpConGR = "Todo OK"
        Exit Function
    End If
    For Each m_ID In m_Col
        VBA.DoEvents
        Debug.Print m_ID, m_Col(m_ID)
        VBA.DoEvents
    Next
    

    Exit Function
errores:
    If Err.Number <> 0 Then
        p_Error = "El método ComprobarExpConGR ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function
Public Function ActualizaJuridicas(Optional ByRef p_Error As String) As String
    
    Dim m_SQL As String
    Dim m_IDSuministrador As String
    Dim m_IDExpediente As String
    Dim m_ID As String
    Dim rcdDatosOrigen As DAO.Recordset
    Dim rcdDatosDestino As DAO.Recordset
    Dim m_Total As Long
    Dim m_Contador As Long
    
    On Error GoTo errores
    m_SQL = "SELECT TbExpedientesJuridicas.IDExpediente, TbJuridicas.IDSuministrador " & _
            "FROM TbExpedientesJuridicas INNER JOIN TbJuridicas ON TbExpedientesJuridicas.IDJuridica = TbJuridicas.IDJuridica;"
    Set rcdDatosOrigen = getdb().OpenRecordset(m_SQL)
    If rcdDatosOrigen Is Nothing Then
        Exit Function
    End If
    m_Total = rcdDatosOrigen.RecordCount
    rcdDatosOrigen.MoveFirst
    MostrarPopupProgreso "Actualizando Jurídicas", "Procesando relaciones..."
    m_Contador = 0
    Do While Not rcdDatosOrigen.EOF
        m_Contador = m_Contador + 1
        If m_Contador Mod 50 = 0 Then
            Forms("frmBusy").lblEstado.Caption = "Relación " & m_Contador & " de " & m_Total
        End If
        m_IDExpediente = rcdDatosOrigen.Fields("IDExpediente")
        m_IDSuministrador = rcdDatosOrigen.Fields("IDSuministrador")
        m_SQL = "SELECT * " & _
                "FROM TbExpedientesSuministradores " & _
                "WHERE IDExpediente=" & m_IDExpediente & " " & _
                "AND IDSuministrador=" & m_IDSuministrador & ";"
        Set rcdDatosDestino = getdb().OpenRecordset(m_SQL)
        If rcdDatosDestino.EOF Then
            rcdDatosDestino.AddNew
                rcdDatosDestino.Fields("IDExpedienteSuministrador") = DameID("TbExpedientesSuministradores", "IDExpedienteSuministrador", getdb())
                rcdDatosDestino.Fields("IDExpediente") = m_IDExpediente
                rcdDatosDestino.Fields("IDSuministrador") = m_IDSuministrador
                rcdDatosDestino.Fields("ContratistaPrincipal") = "Sí"
                rcdDatosDestino.Fields("SubContratista") = "No"
            rcdDatosDestino.Update
        End If
        
        rcdDatosDestino.Close
        Set rcdDatosDestino = Nothing
                
siguiente:
        rcdDatosOrigen.MoveNext
    Loop
    
    CerrarPopupProgreso
    Exit Function
errores:
    CerrarPopupProgreso
    If Err.Number <> 0 Then
        p_Error = "El método ActualizaJuridicas ha devuelto el error " & vbNewLine & Err.Description
    End If
End Function
Sub RellenarSoloFaltantes()
    Dim resultado As String
    Dim errorMsg As String
    
    resultado = RegistraConCadenaEntidadesLosNoExistentes(errorMsg)
    
    If errorMsg <> "" Then
        MsgBox "Error: " & errorMsg
    Else
        MsgBox "Expedientes faltantes registrados."
    End If
End Sub
Sub RellenarTodaLaTabla()
    Dim resultado As String
    Dim errorMsg As String
    
    ' Esta función recorre todos los expedientes y actualiza/crea su entrada en la tabla
    resultado = ActualizaConCadenaEntidades(errorMsg)
    
    If errorMsg <> "" Then
        MsgBox "Ocurrió un error: " & errorMsg
    Else
        MsgBox "Tabla TbExpedientesConEntidades actualizada correctamente."
    End If
End Sub
Public Sub RegenerarCacheDesdeCero()
    '========================================================================
    ' ESTE PROCESO BORRA TODOS LOS DATOS DE LA CACHÉ Y LOS CALCULA DE NUEVO
    ' PUEDE TARDAR VARIOS MINUTOS DEPENDIENDO DEL VOLUMEN DE DATOS
    '========================================================================
    Dim m_SQL As String
    Dim m_Error As String
    Dim m_Resultado As String
    
    On Error GoTo errores
    
    ' 1. Confirmación de seguridad (opcional, quitar si se va a lanzar automáticamente)
    If MsgBox("¿Está seguro de que desea vaciar y regenerar completamente la tabla caché de entidades?" & vbCrLf & _
              "Este proceso puede tardar unos minutos.", vbQuestion + vbYesNo, "Regenerar Caché") = vbNo Then
        Exit Sub
    End If
    
    DoCmd.Hourglass True
    
    ' 2. Vaciar la tabla caché
    Avance "Vaciando tabla caché..."
    m_SQL = "DELETE * FROM TbExpedientesConEntidades;"
    getdb().Execute m_SQL
    
    ' 3. Rellenar desde cero usando la lógica existente
    Avance "Regenerando registros (esto tardará)..."
    m_Resultado = ActualizaConCadenaEntidades(m_Error)
    
    DoCmd.Hourglass False
    AvanceCerrar
    
    If m_Error <> "" Then
        MsgBox "Se completó el proceso pero hubo errores: " & vbCrLf & m_Error, vbExclamation
    Else
        MsgBox "Caché regenerada correctamente.", vbInformation
    End If
    
    Exit Sub

errores:
    DoCmd.Hourglass False
    AvanceCerrar
    MsgBox "Error crítico al regenerar la caché: " & Err.Description, vbCritical
End Sub


