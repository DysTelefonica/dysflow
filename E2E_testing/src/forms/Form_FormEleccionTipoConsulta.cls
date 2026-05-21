Option Compare Database
Option Explicit
Private m_ColAM As Scripting.Dictionary
Private m_ColLotes As Scripting.Dictionary
Private m_ColBasados As Scripting.Dictionary
Private m_ColTecnica As Scripting.Dictionary

Private m_ColCampos As Scripting.Dictionary

    
Private m_ColObtenidas As EnumSiNo

Private m_NombreLista As String
Private m_NombreFormulario As String
Private m_Error As String

Private Sub cmdSalir_Click()
    
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub



Private Sub ComandoActualizarCompleto_Click()
    
    On Error GoTo errores
    m_Error = ""
    DoCmd.Hourglass True
    
    Set m_ColAM = geColActualizada(m_ColAM, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ColLotes = geColActualizada(m_ColLotes, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set m_ColBasados = geColActualizada(m_ColBasados, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    AvanceCerrar
    DoCmd.Hourglass False
    Exit Sub
errores:
     If Err.Number <> 1000 Then
        m_Error = "El método ComandoActualizarCompleto_Click ha devuelto el error: " & Err.Numbr & vbCrLf & "Detalle: " & Err.Description
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoEjecutar_Click()
    Dim lst As ListBox
    Dim m_URL As String
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Me.AllowEdits = False
    Avance "Obteniendo lista para informe...."
    
    m_URL = getExcelConsulta(p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    AvanceCerrar
    If Not fso.FileExists(m_URL) Then
        m_Error = "No se ha podido obtener la consulta"
        Err.Raise 1000
    End If
    Ejecutar Me.hwnd, "open", m_URL, "", "", 1
    
    Me.AllowEdits = True
    DoCmd.Close acForm, Me.Name, acSaveNo
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoEjecutar_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub



Private Sub ComandoAyuda_Click()
    On Error GoTo errores
    m_Error = ""
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    AbrirAyuda m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
     If Err.Number <> 1000 Then
        m_Error = "Al ComandoAyuda_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub
Private Function EstablecerLista(Optional ByRef p_Error As String) As String
    
    Dim lst As ListBox
    
    
    On Error GoTo errores
    
    
    Set lst = Me.ListaTipoConsulta
    lst.RowSource = "Consulta Completa;Consulta Simple"
    Me.ListaTipoConsulta.Selected(1) = True
    ListaTipoConsulta_Click
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerLista ha devuelto el error: " & Err.Description
    End If
End Function
Private Sub Form_Open(Cancel As Integer)
    
    Dim dato As Variant
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Ajustar Me
    On Error GoTo errores
    
    Me.ComandoEjecutar.Enabled = False
    Me.ComandoActualizarCompleto.Enabled = False
    Me.AllowEdits = False
    
    If Nz(Me.OpenArgs(), "") = "" Then
        m_NombreFormulario = "FormExpedientesGestion"
        m_NombreLista = m_NombreListaParaInforme
    Else
        dato = Split(Me.OpenArgs, "|")
        If UBound(dato) <> 1 Then
            m_Error = "El formulario se ha abierto con parámetros insuficientes"
            Err.Raise 1000
        End If
        m_NombreLista = dato(0)
        m_NombreFormulario = dato(1)
    End If
       
    Me.Caption = m_TituloFormulario
    If Not FormularioAbierto(m_NombreFormulario) Then
        m_Error = "No está abierto el formulario " & m_NombreFormulario
        Err.Raise 1000
    End If
    EstablecerLista m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    Me.AllowEdits = True
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Open se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub
Private Sub ListaTipoConsulta_Click()
    Dim lst As ListBox
    Dim p_TipoConsulta As String
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Me.AllowEdits = False
    Me.ComandoEjecutar.Enabled = False
    Me.ComandoActualizarCompleto.Enabled = False
    If Nz(Me.ListaTipoConsulta.Column(0), "") <> "" Then
        p_TipoConsulta = Me.ListaTipoConsulta.Column(0)
        If p_TipoConsulta = "Consulta Completa" Then
            Set m_ColCampos = m_ObjEntorno.ColCamposInformeCompleto
        ElseIf p_TipoConsulta = "Consulta Simple" Then
            Set m_ColCampos = m_ObjEntorno.ColCamposInformeSimple
        Else
            m_Error = "Tipo no codificado"
            Err.Raise 1000
        End If
        Me.ComandoEjecutar.Enabled = True
        Me.ComandoActualizarCompleto.Enabled = True
        If m_ColObtenidas = EnumSiNo.Sí Then
            Me.AllowEdits = True
            VBA.DoEvents
            DoCmd.Hourglass False
            VBA.DoEvents
            Exit Sub
        End If
        
        If m_NombreLista = "Todos" Then
            Set lst = Forms(m_NombreFormulario).Controls("ListaAMEIndividual")
            Set m_ColAM = getColExpedientesDeLista(lst:=lst, p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
            Set lst = Forms(m_NombreFormulario).Controls("ListaLotes")
            Set m_ColLotes = getColExpedientesDeLista(lst:=lst, p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
            Set lst = Forms(m_NombreFormulario).Controls("ListaBasados")
            Set m_ColBasados = getColExpedientesDeLista(lst:=lst, p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
            m_ColObtenidas = EnumSiNo.Sí
    
        Else
            Set m_ColAM = Nothing
            Set m_ColLotes = Nothing
            Set m_ColBasados = Nothing
            Set lst = Forms(m_NombreFormulario).Controls(m_NombreLista)
            If m_NombreLista = "ListaAMEIndividual" Then
                Set m_ColAM = getColExpedientesDeLista(lst:=lst, p_Error:=m_Error)
                If m_Error <> "" Then
                    Err.Raise 1000
                End If
            ElseIf m_NombreLista = "ListaLotes" Then
                Set m_ColLotes = getColExpedientesDeLista(lst:=lst, p_Error:=m_Error)
                If m_Error <> "" Then
                    Err.Raise 1000
                End If
            ElseIf m_NombreLista = "ListaBasados" Then
                Set m_ColBasados = getColExpedientesDeLista(lst:=lst, p_Error:=m_Error)
                If m_Error <> "" Then
                    Err.Raise 1000
                End If
            ElseIf m_NombreLista = "ListaFiltrados" Then
                Set m_ColTecnica = getColExpedientesDeLista(lst:=lst, p_Error:=m_Error)
                If m_Error <> "" Then
                    Err.Raise 1000
                End If
            End If
            m_ColObtenidas = EnumSiNo.Sí
        End If
        
    End If
    AvanceCerrar
    
    
    Me.AllowEdits = True
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ListaTipoConsulta_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    Me.AllowEdits = True
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ListaTipoConsulta_DblClick(Cancel As Integer)
    
    On Error Resume Next
    If Me.ComandoEjecutar.Enabled = True Then
        ComandoEjecutar_Click
    End If
End Sub
Public Function getExcelConsulta( _
                                Optional ByRef p_Error As String _
                                ) As String
    
    
    
    
    
   
    Dim m_form As Form
    Dim m_URLExcel As String
    Dim m_IncluirDerivados As Boolean
    
    On Error GoTo errores
    If m_NombreListaParaInforme = "Todos" Then
        m_IncluirDerivados = True   ' Viene de ComandoInformeUnificado_Click
    Else
        m_IncluirDerivados = False  ' Viene de cualquiera de los otros botones
    End If
    m_URLExcel = GenerarConsultaExpedientes( _
                                            p_ColCampos:=m_ColCampos, _
                                            p_ColAM:=m_ColAM, _
                                            p_ColLotes:=m_ColLotes, _
                                            p_ColBasados:=m_ColBasados, _
                                            p_ColTecnica:=m_ColTecnica, _
                                            p_IncluirDerivados:=m_IncluirDerivados, _
                                            p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    getExcelConsulta = m_URLExcel
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método getExcelConsulta ha devuelto el error: " & Err.Description
    End If
    
End Function


Public Function geColActualizada( _
                                    p_Col As Scripting.Dictionary, _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
    
    
   
    Dim m_ExpC As ExpedienteCompleto
    Dim m_ExpOp As ExpedienteOperaciones
    
    Dim m_ID As Variant
    
    On Error GoTo errores
    If p_Col Is Nothing Then
        Exit Function
    End If
    Set m_ExpOp = New ExpedienteOperaciones
    For Each m_ID In p_Col
        Set m_ExpC = p_Col(m_ID)
        Avance m_ExpC.IDExpediente & "..........." & m_ExpC.Nemotecnico
        With m_ExpOp
            Set .Expediente = m_ExpC.Expediente
            .RegistrarExpEntidades p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            Set m_ExpC = constructor.getExpedienteCompleto(p_IDExpediente:=m_ExpC.IDExpediente, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            If Not m_ExpC Is Nothing Then
                If geColActualizada Is Nothing Then
                    Set geColActualizada = New Scripting.Dictionary
                    geColActualizada.CompareMode = TextCompare
                End If
                If Not geColActualizada.exists(CStr(m_ExpC.IDExpediente)) Then
                    geColActualizada.Add CStr(m_ExpC.IDExpediente), m_ExpC
                End If
            End If
        End With
        Set m_ExpC = Nothing
    Next
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método geColActualizada ha devuelto el error: " & Err.Description
    End If
    
End Function
