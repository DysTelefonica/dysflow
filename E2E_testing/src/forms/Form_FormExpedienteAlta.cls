Option Compare Database
Option Explicit
Private WithEvents m_FormOC As Form_FormOrganoContratacionGestion
Private WithEvents m_FormClasificacion As Form_FormGradosClasificacionGestion
Private WithEvents m_FormEjercito As Form_FormEjercitosGestion
Private WithEvents m_FormOficinaPrograma As Form_FormOficinasProgramaGestion
Private m_TipoEnum As EnumTipoExpediente
Private m_IDExpedientePadre As String
Public Event Alta(m_ObjExpediente As Expediente)
Private m_Error As String
Private m_SnapshotInicial As String


Private Sub cmdSalir_Click()
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub



Private Sub ComandoLimpiarClasificacion_Click()
    Me.IdGradoClasificacion = Null
End Sub

Private Sub ComandoLimpiarOC_Click()
    Me.IDOrganoContratacion = Null
End Sub

Private Sub ComandoLimpiarOficinaPrograma_Click()
    Me.IDOficinaPrograma = Null
End Sub

Private Sub ComandoRegistrar_Click()
    Dim m_ExpOp As ExpedienteOperaciones
    Dim m_IDExpediente As String
    Dim m_FormTipo As Form_FormExpedienteAltaTipo
    Dim m_CaptionOriginal As String
    On Error GoTo errores
    
    m_CaptionOriginal = Me.Caption
    If AntiSpamIsOperationInProgress(Me, m_Error) Then Exit Sub
    AntiSpamEnterOperation Me, m_CaptionOriginal, "ComandoRegistrar"
    
    DoCmd.Hourglass True
    m_Error = ""
    
    Set m_ExpOp = New ExpedienteOperaciones
    SetDTOFromGeneral Me, m_ObjExpedienteDTOActivo.Expediente, m_Error
    If m_Error <> "" Then Err.Raise 1000
    
    m_ExpOp.RegistrarAlta m_ObjExpedienteDTOActivo, p_Error:=m_Error
    If m_Error <> "" Then Err.Raise 1000
    
    m_IDExpediente = m_ObjExpedienteDTOActivo.Expediente.IDExpediente
    
    RaiseEvent Alta(m_ObjExpedienteDTOActivo.Expediente)
    
    ' Notificar al tipo para que replique el evento y abra en Fechas
    If FormularioAbierto("FormExpedienteAltaTipo") Then
        Set m_FormTipo = Forms("FormExpedienteAltaTipo")
        m_FormTipo.ReplicarAltaEvento m_ObjExpedienteDTOActivo.Expediente
    Else
        ' Este caso no debería ocurrir en uso normal, pero por seguridad notificar
        Debug.Print "WARNING: FormExpedienteAltaTipo no está abierto, ReplicarAltaEvento no pudo ejecutarse"
    End If
    
    DoCmd.Close acForm, Me.Name, acSaveNo
    
    AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
    Exit Sub
errores:
    AntiSpamExitOperation Me, m_CaptionOriginal, m_Error
    m_Error = "Al Registrar se ha producido el error: " & Err.Description
    DoCmd.Hourglass False
    MsgBox m_Error, vbCritical, "Error"
End Sub

Private Sub Form_Unload(Cancel As Integer)
    Dim m_SnapshotActual As String
    Dim m_Respuesta As Integer
    On Error GoTo errores

    m_Error = ""

    ' Capturar estado actual
    m_SnapshotActual = getSnapshot(Me, m_Error)

    ' Si el formulario quedó vacío (sin cambios), cerrar sin aviso
    If m_SnapshotActual = "" Or m_SnapshotActual = m_SnapshotInicial Then
        Exit Sub
    End If

    ' Hay cambios sin guardar ? preguntar
    m_Respuesta = MsgBox("Hay cambios sin guardar. ¿Quieres salir sin guardar?", _
                        vbYesNo + vbExclamation, "Cambios sin guardar")
    If m_Respuesta = vbNo Then
        Cancel = True
        Exit Sub
    End If

    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Unload se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    MsgBox m_Error, vbCritical, "Error"
End Sub
Private Sub AccesoSharepoint_Exit(Cancel As Integer)
    If Nz(Me.AccesoSharepoint, "") <> "" Then
        Me.ComandoVerSharepoint.Enabled = True
    Else
        Me.ComandoVerSharepoint.Enabled = False
    End If
End Sub

Private Sub Ambito_AfterUpdate()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Nz(Me.Ambito, "") = "HPS" Then
        Me.HPSAplica = "Sí"
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Ambito_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoElegitClasificacion_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If FormularioAbierto("FormGradosClasificacionGestion") Then
        DoCmd.Close acForm, "FormGradosClasificacionGestion"
    End If
    Set m_ObjGradoClasificacionActivo = Nothing
    DoCmd.OpenForm "FormGradosClasificacionGestion", OpenArgs:="PARA SELECCIONAR"
    If FormularioAbierto("FormGradosClasificacionGestion") Then
        Set m_FormClasificacion = Forms("FormGradosClasificacionGestion")
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoElegitClasificacion_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoElegirOficinaPrograma_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If FormularioAbierto("FormOficinasProgramaGestion") Then
        DoCmd.Close acForm, "FormOficinasProgramaGestion"
    End If
    Set m_ObjOficinaProgramaActiva = Nothing
    DoCmd.OpenForm "FormOficinasProgramaGestion", OpenArgs:="PARA SELECCIONAR"
    If FormularioAbierto("FormOficinasProgramaGestion") Then
        Set m_FormOficinaPrograma = Forms("FormOficinasProgramaGestion")
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoElegirOficinaPrograma_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoElegirEjercito_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If FormularioAbierto("FormEjercitosGestion") Then
        DoCmd.Close acForm, "FormEjercitosGestion"
    End If
    Set m_ObjEjercitoActivo = Nothing
    DoCmd.OpenForm "FormEjercitosGestion", OpenArgs:="PARA SELECCIONAR"
    If FormularioAbierto("FormEjercitosGestion") Then
        Set m_FormEjercito = Forms("FormEjercitosGestion")
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoElegirEjercito_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub ComandoElegirOC_Click()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If FormularioAbierto("FormOrganoContratacionGestion") Then
        DoCmd.Close acForm, "FormOrganoContratacionGestion"
    End If
    Set m_ObjOrganoContratacionActivo = Nothing
    DoCmd.OpenForm "FormOrganoContratacionGestion", OpenArgs:="PARA SELECCIONAR"
    If FormularioAbierto("FormOrganoContratacionGestion") Then
        Set m_FormOC = Forms("FormOrganoContratacionGestion")
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoElegirOC_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoRellenarNemotecnico_Click()
    Dim m_Padre As Expediente
    Dim m_Ordinal As String
    Dim m_EjercitoDesc As String
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""

    Set m_Padre = m_ObjExpedienteDTOActivo.Expediente.ExpedientePadre
    If Not m_Padre Is Nothing Then
        m_Ordinal = CalcularOrdinalSiguiente(m_Padre, m_ObjExpedienteDTOActivo.Expediente.TIPOEnum, m_Error)
        If m_Error <> "" Then Err.Raise 1000

        m_EjercitoDesc = ""
        If Not m_ObjExpedienteDTOActivo.Expediente.Ejercito Is Nothing Then
            m_EjercitoDesc = m_ObjExpedienteDTOActivo.Expediente.Ejercito.Ejercito
        End If
        Me.Nemotecnico = CalcularNemotecnicoCalculado(m_Padre, m_Ordinal, _
            m_ObjExpedienteDTOActivo.Expediente.TIPOEnum, m_EjercitoDesc, m_Error)
        If m_Error <> "" Then Err.Raise 1000
    End If

    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoRellenarNemotecnico_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoVerSharepoint_Click()
    If Nz(Me.AccesoSharepoint, "") <> "" Then
        Ejecutar 1, "open", Nz(Me.AccesoSharepoint, ""), "", "", 1
    End If
    
End Sub


Private Sub Form_Load()
    Dim m_Argumento As String
    Dim dato As Variant
    On Error GoTo errores

    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    'm_Argumento=IDExpedientePadre | TipoEnum
    m_Argumento = Nz(Me.OpenArgs(), "")
    If InStr(m_Argumento, "|") = 0 Then
        m_Error = "El formulario de alta se ha abierto sin conocer el tipo"
        Err.Raise 1000
    End If
    dato = Split(m_Argumento, "|")
    m_IDExpedientePadre = CStr(dato(0))
    If Not IsNumeric(dato(1)) Then
        m_Error = "El formulario de alta se ha abierto sin conocer el tipo"
        Err.Raise 1000
    End If
    m_TipoEnum = CLng(dato(1))
    EstablecerCombos Me, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    ' Recuperar el DTO que dejó FormExpedienteAltaTipo
    Set m_ObjExpedienteDTOActivo = New ExpedienteDTO

    With m_ObjExpedienteDTOActivo
        Set .Expediente = New Expediente
        .Expediente.IDExpedientePadre = m_IDExpedientePadre

        SetDatosDeExpedienteTipo .Expediente, m_TipoEnum, m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If IsNumeric(m_IDExpedientePadre) Then
            HeredarDatosDePadre Me, m_IDExpedientePadre, m_TipoEnum, m_Error
            If m_Error <> "" Then
                Err.Raise 1000
            End If
        End If
        If .Expediente.TIpo <> "" Then
            Me.lblTitulo.Caption = "ALTA DE " & .Expediente.TIpo
        Else
            Me.lblTitulo.Caption = "ALTA DE EXPEDIENTE"
        End If
        Me.TIpo = .Expediente.TIpo
    End With

    Me.AllowEdits = True

    ' Capturar estado inicial para detectar cambios al cerrar
    m_SnapshotInicial = getSnapshot(Me, m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If

    ' EstablecerDatos PRIMERO para fijar visibilidad de ordinal
    ' antes de Ajustar que puede pisar valores del diseñador
    EstablecerDatos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If

    ' Ajustar AL FINAL para no sobrescribir visibilidad ya fijada
    Ajustar Me

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
End Sub


Public Function EstablecerDatos(Optional ByRef p_Error As String) As String

    Dim m_TipoCalculado As EnumTipoExpediente
    On Error GoTo errores

    Debug.Print "=== EstablecerDatos === m_TipoEnum:", m_TipoEnum, " m_IDExpedientePadre:", m_IDExpedientePadre

    If m_ObjExpedienteDTOActivo.Expediente Is Nothing Then
        p_Error = "El formulario se ha abierto con parámetros insuficientes"
        Err.Raise 1000
    End If

    ' En ALTA el DTO ya viene precargado desde FormExpedienteAltaTipo.
    ' Solo poblamos los controles que el alta realmente puede tener.
    ' Todo lo demás (cargar combos, inicializar???) se hace después del registro.

With m_ObjExpedienteDTOActivo.Expediente
        Me.TIpo = .TIpo
        Me.Nemotecnico = .Nemotecnico

        ' Respetar visibilidad de ordinal según el tipo de expediente.
        ' Lógica??ada de FormExpedienteGeneral (pre-refactor):
        ' AM y EXPIndividual no usan ordinal; Lote y Basado sí.
        If m_TipoEnum = EnumTipoExpediente.AM Or m_TipoEnum = EnumTipoExpediente.EXPIndividual Then
            Me.lblNumero.Visible = False
            Me.Ordinal.Visible = False
            Me.ComandoRellenarNemotecnico.Visible = False
        ElseIf m_TipoEnum = EnumTipoExpediente.Lote And m_IDExpedientePadre = "" Then
            ' Lote sin padre (no nacido de AM) — ordinal no tiene sentido (no hay hermanos)
            Me.lblNumero.Visible = False
            Me.Ordinal.Visible = False
            Me.ComandoRellenarNemotecnico.Visible = False
        Else
            Me.lblNumero.Visible = True
            Me.Ordinal.Visible = True
            ' Lógica de 4 ramas??ada del old FormExpedienteGeneral:
            ' Solo usar OrdinalCalculado si no hay ordinal numérico ya (no sobreescribir input del usuario)
            If .IDExpediente = "" Then
                If Not IsNumeric(.Ordinal) Then
                    Me.Ordinal = .OrdinalCalculado
                Else
                    Me.Ordinal = .Ordinal
                End If
            Else
                If IsNumeric(.Ordinal) Then
                    Me.Ordinal = .Ordinal
                End If
            End If
            ' Visible del botón según tipo
            If m_TipoEnum = EnumTipoExpediente.Lote Then
                Me.lblNumero.Caption = "Nº DE LOTE"
                Me.ComandoRellenarNemotecnico.Visible = True
            ElseIf m_TipoEnum = EnumTipoExpediente.BasadoDeAM Or m_TipoEnum = EnumTipoExpediente.BasadoDeLote Then
                Me.lblNumero.Caption = "Nº BASADO"
                Me.ComandoRellenarNemotecnico.Visible = True
            End If
        End If
    End With

    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha producido el error n: " & Err.Number & _
        vbNewLine & "Detalle: " & Err.Description
    End If

End Function

Private Sub EstablecerDatosConTipo()
    Dim m_Tipo As String
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    m_Tipo = m_ObjExpedienteDTOActivo.Expediente.TIpo
    
    With m_ObjExpedienteDTOActivo.Expediente
        If m_Tipo = "Acuerdo Marco" Then
            .EsAM = "Sí"
            .EsLote = "No"
            .EsExpediente = "No"
        ElseIf m_Tipo = "Lote sin Acuero Marco" Then
            .EsAM = "No"
            .EsLote = "Sí"
            .EsExpediente = "No"
        ElseIf m_Tipo = "Lote de Acuerdo Marco" Then
            .EsAM = "No"
            .EsLote = "Sí"
            .EsExpediente = "No"
        ElseIf m_Tipo = "Expediente Derivado de Lote" Then
            .EsAM = "No"
            .EsLote = "No"
            .EsExpediente = "Sí"
        ElseIf m_Tipo = "Expediente Derivado de Acuerdo Marco" Then
            .EsAM = "No"
            .EsLote = "No"
            .EsExpediente = "Sí"
        ElseIf m_Tipo = "Expediente individual" Then
            .EsAM = "No"
            .EsLote = "No"
            .EsExpediente = "Sí"
        ElseIf m_Tipo = "" Then
            .EsAM = ""
            .EsLote = ""
            .EsExpediente = ""
        End If
    End With
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al EstablecerDatosConTipo se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub


Private Sub m_FormClasificacion_Seleccionar(m_GradoClasificacionSeleccionado As GradoClasificacion)
     On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If Not m_GradoClasificacionSeleccionado Is Nothing Then
        Me.IdGradoClasificacion = m_GradoClasificacionSeleccionado.GradoClasificacion
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormClasificacion_Seleccionar se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub m_FormEjercito_Seleccionar(m_Ejercito As Ejercito)
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    
    If Not m_Ejercito Is Nothing Then
        Me.IDEjercito = m_Ejercito.Ejercito
        
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormEjercito_Seleccionar se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub m_FormOC_Seleccionar(m_OrganoContratacionSeleccionado As OrganoContratacion)
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    
    If Not m_OrganoContratacionSeleccionado Is Nothing Then
        Me.IDOrganoContratacion = m_OrganoContratacionSeleccionado.OrganoContratacion
        
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormOC_Seleccionar se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub




Private Sub m_FormOficinaPrograma_Seleccionar(m_OficinaProgramaSeleccionada As OficinaPrograma)
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    If Not m_OficinaProgramaSeleccionada Is Nothing Then
        Me.IDOficinaPrograma = m_OficinaProgramaSeleccionada.OficinaPrograma
        
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormOficinaPrograma_Seleccionar se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub Ordinal_AfterUpdate()
    
    Dim m_ExpedienteOrdinalUsado As EnumSiNo
    Dim m_Comprobar As Boolean
    Dim m_ExpedienteOtro As Expediente
    Dim m_textoExp As String
    On Error GoTo errores
    
    
    m_Error = ""
    If Not IsNumeric(Nz(Me.Ordinal, "")) Then
        Exit Sub
    End If
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    If m_ObjExpedienteDTOActivo.Expediente.IDExpedientePadre = "" Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    
    
    
    Set m_ExpedienteOtro = ExpedienteOrdinalUsado( _
                p_IDExpedientePadre:=m_ObjExpedienteDTOActivo.Expediente.IDExpedientePadre, _
                p_Ordinal:=Me.Ordinal, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_ExpedienteOtro Is Nothing Then
        If m_ExpedienteOtro.CodExp <> "" Then
            m_textoExp = m_ExpedienteOtro.CodExp
        Else
            If m_ExpedienteOtro.Nemotecnico <> "" Then
                m_textoExp = m_ExpedienteOtro.Nemotecnico
            Else
                m_textoExp = m_ExpedienteOtro.Titulo
            End If
        End If
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        pregunta = MsgBox("El número ya ha sido usado para el Expediente : " & m_textoExp, vbExclamation, "Ordinal repetido")
        
    End If
        
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Ordinal_AfterUpdate se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub
