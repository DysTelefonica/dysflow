Option Compare Database
Option Explicit
Private m_ArgumentoResto As String
Private m_IDExpedienteActivo As String
Private m_ExpedientePadre As Expediente
Private m_ColTipos As Scripting.Dictionary
Public Event Alta(p_Exp As Expediente)
Private WithEvents m_FormExpediente_ParaHPS As Form_FormExpedienteAltaParaHPS
Private WithEvents m_FormExpedienteAlta As Form_FormExpedienteAlta
Private m_TiposClase As String
Private m_Error As String

Private Sub cmdSalir_Click()
    
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Function EstablecerLista(Optional ByRef p_Error As String) As String
    
    Dim lst As ListBox
    Dim dato As Variant
    Dim m_ID As Variant
    Dim m_Opcion As String
    
    On Error GoTo errores
    
    
    Set lst = Me.ListaTipoAlta
    lst.RowSource = ""

    Debug.Print "=== EstablecerLista === m_ArgumentoResto=""" & m_ArgumentoResto & """"
    Debug.Print "=== EstablecerLista m_ObjEntorno Is Nothing:", m_ObjEntorno Is Nothing

    If m_ArgumentoResto = "" Then
        Set m_ColTipos = m_ObjEntorno.ColTiposExpedientesNoDerivados
        m_TiposClase = "No Derivados"
        Debug.Print "=== BRANCH TODOS — Count:", m_ColTipos.Count
        For Each m_ID In m_ColTipos
            m_Opcion = m_ColTipos(m_ID)
            lst.AddItem m_ID & ";" & "Alta de " & m_Opcion
            Debug.Print "=== AGREGADO TODOS:", m_ID, m_Opcion
        Next
        Exit Function
    End If
dato = Split(m_ArgumentoResto, ";")
    Debug.Print "=== BRANCH FILTRADO — dato count:", UBound(dato) + 1

    For Each m_ID In dato
        m_Opcion = m_ObjEntorno.ColTiposExpedientesNoDerivados(m_ID)
        Debug.Print "=== BUSCANDO m_ID:", m_ID, "? m_Opcion:", m_Opcion
        If m_Opcion <> "" Then
            lst.AddItem m_ID & ";" & "Alta de " & m_Opcion
            Debug.Print "=== AGREGADO FILTRADO:", m_ID, m_Opcion
        End If
    Next
    If lst.ListCount = 1 Then
        lst.Selected(0) = True
        ComandoAlta_Click
        ' No hacer DoCmd.Close aquí — ComandoAlta_Click ya cierra el form
    End If
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerLista ha devuelto el error: " & Err.Description
    End If
End Function

Private Sub ComandoAlta_Click()
    Dim m_Argumento As String
    Dim m_TipoEnum As EnumTipoExpediente
    Dim m_IDExpedientePadre As String
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    Me.ComandoAlta.Enabled = False
    
    If Nz(Me.ListaTipoAlta.Column(0), "") = "" Then
        m_Error = "No se ha seleccionado ninguna opción"
        Err.Raise 1000
    End If
    m_TipoEnum = Me.ListaTipoAlta.Column(0)

    ' --- EXPHPS: flujo especial ---
    If m_TipoEnum = EnumTipoExpediente.EXPHPS Then
        Set m_ObjExpedienteDTOActivo = New ExpedienteDTO
        Set m_ObjExpedienteDTOActivo.Expediente = New Expediente
        With m_ObjExpedienteDTOActivo.Expediente
            .TIpo = m_ObjEntorno.ColTiposExpedientes(CStr(m_TipoEnum))
            SetDatosDeExpedienteTipo m_ObjExpedienteDTOActivo.Expediente, m_TipoEnum, m_Error
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        End With
        If FormularioAbierto("FormExpedienteAltaParaHPS") Then
            DoCmd.Close acForm, "FormExpedienteAltaParaHPS", acSaveNo
        End If
        DoCmd.Close acForm, Me.Name, acSaveNo
        DoCmd.OpenForm "FormExpedienteAltaParaHPS"
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If


    ' --- Abrir formulario de alta ---
    If FormularioAbierto("FormExpedienteAlta") Then
        DoCmd.Close acForm, "FormExpedienteAlta", acSaveNo
    End If
    'm_Argumento=IDExpedientePadre | TipoEnum
    If Not m_ExpedientePadre Is Nothing Then
        m_IDExpedientePadre = m_ExpedientePadre.IDExpediente
    End If
    m_Argumento = m_IDExpedientePadre & "|" & m_TipoEnum
    DoCmd.Close acForm, Me.Name, acSaveNo
    DoCmd.OpenForm "FormExpedienteAlta", OpenArgs:=m_Argumento
    If FormularioAbierto("FormExpedienteAlta") Then
       Set m_FormExpedienteAlta = Forms("FormExpedienteAlta")
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoAlta_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
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

Private Sub Form_Open(Cancel As Integer)
    Dim dato As Variant
    Dim m_Argumento As String
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Ajustar Me
    
    
    Me.ComandoAlta.Enabled = False
    Me.AllowEdits = False
    
    Me.Caption = m_TituloFormulario
    
    If EsAdministrador = EnumSiNo.Sí Then
        Me.ComandoAlta.Enabled = True
        Me.AllowEdits = True
    End If
    
    Set m_ExpedientePadre = m_ObjExpedienteActivo
    m_Argumento = Nz(Me.OpenArgs, "")
    Debug.Print "=== FormExpedienteAltaTipo Open === OpenArgs=""" & m_Argumento & """"
    Debug.Print "=== m_ObjEntorno Is Nothing:", m_ObjEntorno Is Nothing
    Debug.Print "=== ColTiposExpedientesNoDerivados Is Nothing:", m_ObjEntorno.ColTiposExpedientesNoDerivados Is Nothing
    If InStr(1, m_Argumento, "|") <> 0 Then
        dato = Split(m_Argumento, "|")
        m_IDExpedienteActivo = dato(0)
        m_ArgumentoResto = dato(1)
    ElseIf InStr(1, m_Argumento, ";") <> 0 Then
        ' Formato "1;5;6" — viene de Alta() con g_ArgumentoAltaTipo
        m_ArgumentoResto = m_Argumento
    ElseIf m_Argumento <> "" And m_Argumento <> "DesdeInicio" Then
        ' Formato "2" (un solo tipo, sin separador) — viene de Alta() con Lote
        m_ArgumentoResto = m_Argumento
    Else
        If m_Argumento = "DesdeInicio" Then
            Set m_ExpedientePadre = Nothing
            m_IDExpedienteActivo = ""
        End If
    End If
    Debug.Print "=== m_ArgumentoResto=""" & m_ArgumentoResto & """"
   
    'm_Argumento =IDExpedienteActivo & "|" & m_ArgumentoResto
    'Ejemplo m_ArgumentoResto --> EnumTipoExpediente.Lote & "|" & EnumTipoExpediente.BasadoDeAM
    EstablecerLista m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
   
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
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
   
End Sub

Private Sub ListaTipoAlta_Click()
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    Me.ComandoAlta.Enabled = False
    
    
    If Nz(Me.ListaTipoAlta.Column(0), "") <> "" Then
        Me.ComandoAlta.Enabled = True
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ListaTipoAlta_Click se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ListaTipoAlta_DblClick(Cancel As Integer)
    
    On Error Resume Next
    If Me.ComandoAlta.Enabled = True Then
        ComandoAlta_Click
    End If
End Sub

Private Sub m_FormExpedienteAlta_Alta(m_ObjExpediente As Expediente)
    RaiseEvent Alta(m_ObjExpediente)
End Sub

Public Sub ReplicarAltaEvento(p_Exp As Expediente)
    RaiseEvent Alta(p_Exp)
End Sub