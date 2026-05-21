Option Compare Database
Option Explicit
Public Event AltaExpediente(m_expediente As Expediente)
Public Event ExpedienteEditado(m_expediente As Expediente)

Private m_Error As String
Private m_DicEstadoPestanas As Scripting.Dictionary
Private m_IDExpedienteAbrir As String

Private Sub ComandoActualizarCompleto_Click()
    Dim m_CaptionOriginal As String
    Dim m_ExpOp As ExpedienteOperaciones
    On Error GoTo errores
    
    m_CaptionOriginal = Me.Caption
    If AntiSpamIsOperationInProgress(Me, m_Error) Then Exit Sub
    AntiSpamEnterOperation Me, m_CaptionOriginal, "ComandoRegistrar", "ComandoActualizarCompleto"
    
    m_Error = ""
    DoCmd.Hourglass True
    
    Set m_ExpOp = New ExpedienteOperaciones
    With m_ExpOp
        Set .Expediente = m_ObjExpedienteDTOActivo.Expediente
        .RegistrarExpEntidades p_Error:=m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    DoCmd.Hourglass False
    AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
    Exit Sub
errores:
     AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
     If Err.Number <> 1000 Then
        m_Error = "El método ComandoActualizarCompleto_Click ha devuelto el error: " & Err.Number & vbCrLf & "Detalle: " & Err.Description
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoAyuda_Click()
    On Error GoTo errores
    m_Error = ""
    DoCmd.Hourglass True
    AbrirAyuda m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Hourglass False
    Exit Sub
errores:
     If Err.Number <> 1000 Then
        m_Error = "El método ComandoAyudaFormulario_Click ha devuelto el error: " & Err.Number & vbCrLf & "Detalle: " & Err.Description
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoRegistrar_Click()
    Dim m_form As Form
    Dim m_IDExpediente As String
    Dim m_CaptionOriginal As String
    On Error GoTo errores

    m_CaptionOriginal = Me.Caption
    If AntiSpamIsOperationInProgress(Me, m_Error) Then Exit Sub
    AntiSpamEnterOperation Me, m_CaptionOriginal, "ComandoRegistrar", "ComandoActualizarCompleto"

    m_Error = ""

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents

    MostrarPopupProgreso "Guardando...", "Guardando expediente..."

    Set m_form = getFormPestanaActiva(Me, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_form.Name <> "FormExpedienteGeneral" And m_form.Name <> "FormExpedienteFechas" Then
        m_Error = "Nada que guardar"
        Err.Raise 1000
    End If
    m_IDExpediente = m_ObjExpedienteDTOActivo.Expediente.IDExpediente
    GuardarPestanaActiva frmPadre:=Me, p_IDExpediente:=m_IDExpediente, p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If

    CerrarPopupProgreso
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents

    AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
    Exit Sub

errores:
    CerrarPopupProgreso
    AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
    If Err.Number <> 1000 Then
        m_Error = "El método ComandoRegistrar_Click ha devuelto el error: " & Err.Number & vbCrLf & "Detalle: " & Err.Description
    End If
    DoCmd.Hourglass False
    MsgBox m_Error, vbCritical, "Error"
End Sub
Private Sub cmdSalir_Click()
    Dim m_form As Form
    Dim m_IDExpediente As String
    On Error GoTo errores
    m_Error = ""
    If AbiertoParaEditar = False Then
        DoCmd.Close acForm, Me.Name, acSaveNo
        Exit Sub
    End If
    If Me.AllowEdits = False Then
        DoCmd.Close acForm, Me.Name, acSaveNo
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    Set m_form = getFormPestanaActiva(Me, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_form.Name <> "FormExpedienteGeneral" And m_form.Name <> "FormExpedienteFechas" Then
        DoCmd.Close acForm, Me.Name, acSaveNo
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        
        Exit Sub
    End If
    m_IDExpediente = m_ObjExpedienteDTOActivo.Expediente.IDExpediente
    GuardarPestanaActiva frmPadre:=Me, p_IDExpediente:=m_IDExpediente, p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    DoCmd.Close acForm, Me.Name, acSaveNo
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al cmdSalir_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
    
End Sub

Public Sub Form_Load()
    
    Dim m_Tipo As String
    Dim m_BackendActivo As String
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    ' Leer configuración de backend antes de cualquier operación de datos
    LeeConfiguracionLocal m_Error
    If m_Error <> "" Then
        MsgBox "No se pudo inicializar la configuración de backend: " & m_Error, vbCritical, "EXPE-DYS - Formulario expediente"
        Exit Sub
    End If
    
    m_BackendActivo = Nz(Application.TempVars("BackendActivo"), "")
    If m_BackendActivo = "" Then
        Err.Raise 1000, , "No se pudo identificar el entorno de backend activo (BackendActivo)."
    End If
    
    If Nz(Me.OpenArgs(), "") = "Sololectura" Then
        AbiertoParaEditar = False
    Else
        AbiertoParaEditar = True
    End If
    'Me.ControlDeNavegación0.Tabs(0).Enabled = False
    Me.InsideHeight = 9060
    Me.InsideWidth = 13980
    Me.ComandoRegistrar.Enabled = False
    Me.AllowEdits = False
    Me.Caption = m_TituloFormulario & " [" & m_BackendActivo & "]"
    If AbiertoParaEditar = True Then
        If EsAdministrador = EnumSiNo.Sí Then
            Me.ComandoRegistrar.Enabled = True
            Me.AllowEdits = True
        End If
    Else
        Me.ComandoRegistrar.Enabled = False
        Me.AllowEdits = False
    End If
    
    EstablecerDatos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If

    ' Extraer ID de OpenArgs (formato "ID|Fechas" o "ID")
    Dim m_Args As String
    m_Args = Nz(Me.OpenArgs(), "")
    If InStr(m_Args, "|") > 0 Then
        m_IDExpedienteAbrir = Split(m_Args, "|")(0)
    ElseIf m_Args <> "" And m_Args <> "Sololectura" Then
        m_IDExpedienteAbrir = m_Args
    End If

    ' Si m_ObjExpedienteDTOActivo no está setado (ej: abierto via AbrirExpedienteEnFechas),
    ' cargarlo desde el ID extraído de OpenArgs
    If m_IDExpedienteAbrir <> "" And m_ObjExpedienteDTOActivo Is Nothing Then
        Set m_ObjExpedienteDTOActivo = EstablecerDTODeExpediente( _
            p_Expediente:=constructor.getExpediente(p_IDExpediente:=m_IDExpedienteAbrir, p_Error:=m_Error), _
            p_ParaCopia:=EnumSiNo.No, _
            p_Error:=m_Error)
        If m_Error <> "" Then Err.Raise 1000
        ' Recargar controles con los datos del DTO recién cargado
        Dim m_formActivo As Form
        Set m_formActivo = getFormPestanaActiva(Me, m_Error)
        If m_Error = "" Then
            If m_formActivo.Name = "FormExpedienteGeneral" Then
                SetFormGeneralFromExpediente p_IDExpediente:=m_IDExpedienteAbrir, frm:=m_formActivo, p_Error:=m_Error
            End If
        End If
        If m_Error <> "" Then Err.Raise 1000
    End If

    ' Navegar a Fechas si OpenArgs lo indica
    NavegarAPestanaSiSolicitada Me, Nz(Me.OpenArgs(), ""), m_Error
    If m_Error <> "" Then
        ' Loggear o mostrar warning — no bloqueante pero al menos visible en debug
        Debug.Print "WARNING NavegarAPestanaSiSolicitada: " & m_Error
    End If

    ' Me.FrmDetalle.SourceObject = "FormExpedienteGeneral"
    'Me.NavGeneral.SetFocus
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Load se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Public Function EstablecerDatos(Optional ByRef p_Error As String) As String
    
    On Error GoTo errores
    
    If m_ObjExpedienteDTOActivo Is Nothing Then
        p_Error = "No se sabe para qué tipo de registro se ha abierto"
        Err.Raise 1000
    End If
    If m_ObjExpedienteDTOActivo.Expediente Is Nothing Then
        p_Error = "No se sabe para qué tipo de registro se ha abierto"
        Err.Raise 1000
    End If
    With m_ObjExpedienteDTOActivo.Expediente
        If .TIpo = "" Then
            p_Error = "No se sabe para qué tipo de registro se ha abierto"
            Err.Raise 1000
        End If
        If .Derivable = Empty Then
            p_Error = "No se sabe para qué tipo de registro se ha abierto"
            Err.Raise 1000
        End If

        Me.lblTitulo.Caption = .TituloFormulario
        
        If .IDExpediente = "" Then
            Me.lblUltimaModificacion.Visible = False
        Else
            Me.lblUltimaModificacion.Visible = True
            Me.lblUltimaModificacion.Caption = .UltimaModificacionTexto
        End If
        If .IDExpediente <> "" Then
            
            Me.ComandoActualizarCompleto.Visible = True
        Else
            Me.ComandoActualizarCompleto.Visible = False
        End If
        
    End With
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos a devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
