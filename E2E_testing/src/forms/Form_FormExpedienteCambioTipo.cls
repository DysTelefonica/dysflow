Option Compare Database
Option Explicit
Private WithEvents m_form As Form_FormExpedientesParaCambioTipo
Public Event CambioRealizado()
Private m_TipoActual As EnumTipoExpediente
Private m_Error As String

Private Sub cmdSalir_Click()
    
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
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

Private Sub ComandoBuscar_Click()
    On Error GoTo errores
    m_Error = ""
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    If FormularioAbierto("FormExpedientesParaCambioTipo") Then
        DoCmd.Close acForm, "FormExpedientesParaCambioTipo"
    End If
    
    DoCmd.OpenForm "FormExpedientesParaCambioTipo"
    If FormularioAbierto("FormExpedientesParaCambioTipo") Then
        Set m_form = Forms("FormExpedientesParaCambioTipo")
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
     If Err.Number <> 1000 Then
        m_Error = "Al ComandoBuscar_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub ComandoRegistrar_Click()
    Dim m_TipoElegido As String
    Dim m_expediente As Expediente
    Dim m_ExpedienteOp As ExpedienteOperaciones
    Dim m_ExpPadre As Expediente
    Dim m_IDPadre As String
    On Error GoTo errores
    m_Error = ""
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    MostrarPopupProgreso "Procesando...", "Guardando..."
    m_TipoElegido = Nz(Me.TIpo, "")
    If m_TipoElegido = "" Then
        m_Error = "Seleccione el cambio de tipo"
        Err.Raise 1000
    End If
    With m_ObjExpedienteActivo
        
        If m_TipoElegido = "Convertir a Acuerdo Marco" Then
            .IDExpedientePadre = ""
            .EsAM = "Sí"
            .EsLote = "No"
            .EsExpediente = "No"
            .EsBasado = "No"
        ElseIf m_TipoElegido = "Convertir a Lote" Then
            If Nz(Me.IDExpedientePadre, "") <> "" Then
                Set m_ExpPadre = constructor.getExpediente(p_IDExpediente:=Me.IDExpedientePadre, p_Error:=m_Error)
                If m_Error <> "" Then
                    Err.Raise 1000
                End If
                If m_ExpPadre Is Nothing Then
                    m_Error = "El IDExpediente indicado no se encuentra registrado"
                    Err.Raise 1000
                End If
                If m_ExpPadre.EsAM <> "Sí" Then
                    m_Error = "Un Lote puede tener un padre sólo de tipo Acuerdo Marco"
                    Err.Raise 1000
                End If
                .IDExpedientePadre = Nz(Me.IDExpedientePadre, "")
                .EsAM = "No"
                .EsLote = "Sí"
                .EsExpediente = "No"
                .EsBasado = "No"
            End If
        ElseIf m_TipoElegido = "Convertir a Basado" Then
            If Nz(Me.IDExpedientePadre, "") = "" Then
                m_Error = "Para Convertir en Basado, hemos de indicar un IDExpediente padre de tipo Acuerdo Marco o Lote"
                Err.Raise 1000
            End If
            Set m_ExpPadre = constructor.getExpediente(p_IDExpediente:=Me.IDExpedientePadre, p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If
            If m_ExpPadre Is Nothing Then
                m_Error = "El IDExpediente indicado no se encuentra registrado"
                Err.Raise 1000
            End If
            If m_ExpPadre.EsAM <> "Sí" And m_ExpPadre.EsLote <> "Sí" Then
                m_Error = "Para Convertir en Basado, hemos de indicar un IDExpediente padre de tipo Acuerdo Marco o Lote"
                Err.Raise 1000
            End If
            .IDExpedientePadre = Nz(Me.IDExpedientePadre, "")
            .EsAM = "No"
            .EsLote = "No"
            .EsExpediente = "No"
            .EsBasado = "Sí"
        ElseIf m_TipoElegido = "Convertir a Expediente Independiente" Then
            If Nz(Me.IDExpedientePadre, "") <> "" Then
                m_Error = "Para Convertir en Expediente Independiente,no hemos de indicar un IDExpediente padre"
                Err.Raise 1000
            End If
            .IDExpedientePadre = ""
            .EsAM = "No"
            .EsLote = "No"
            .EsExpediente = "Sí"
            .EsBasado = "No"
        ElseIf m_TipoElegido = "Convertir a Lote de Acuerdo Marco" Then
            If Nz(Me.IDExpedientePadre, "") = "" Then
                m_Error = "Para Convertir a Lote de Acuerdo Marco. Hemos de rellenar el ID del Acuerdo Marco"
                Err.Raise 1000
            End If
            .IDExpedientePadre = Me.IDExpedientePadre
            .EsAM = "No"
            .EsLote = "Sí"
            .EsExpediente = "No"
            .EsBasado = "No"
        End If
    
    End With
    Set m_ExpedienteOp = New ExpedienteOperaciones
    With m_ExpedienteOp
        Set .Expediente = m_ObjExpedienteActivo
        .RegistrarCambioTipo p_Error:=m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    RaiseEvent CambioRealizado
    VBA.DoEvents
    CerrarPopupProgreso
    VBA.DoEvents
    DoCmd.Close acForm, Me.Name, acSaveNo
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
     If Err.Number <> 1000 Then
        m_Error = "Al ComandoCambiarTipo_Click se ha devuelto el error: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub Form_Open(Cancel As Integer)
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Ajustar Me
    
    
    Me.Caption = m_TituloFormulario
    If m_ObjExpedienteActivo Is Nothing Then
        m_Error = "El formulario se ha abierto con parámetros insuficientes"
        Err.Raise 1000
    End If
    EstablecerDatos m_Error
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
Public Function EstablecerDatos(Optional ByRef p_Error As String) As String
    
    Dim cmb As ComboBox
    
    On Error GoTo errores
    
    If m_ObjExpedienteActivo Is Nothing Then
        p_Error = "El formulario se ha abierto con parámetros insuficientes"
        Err.Raise 1000
    End If
    Me.IDExpedientePadre.Locked = True
    Me.IDExpedientePadre.Enabled = False
    Set cmb = Me.TIpo
    cmb.RowSource = ""
    With m_ObjExpedienteActivo
        m_TipoActual = .TipoCalculado
        Me.TIPOACTUAL = .TipoCalculadoTexto
        If m_TipoActual = EnumTipoExpediente.AM Then
            cmb.AddItem "Convertir a Lote"
            cmb.AddItem "Convertir a Basado"
            cmb.AddItem "Convertir a Expediente Independiente"
        ElseIf m_TipoActual = EnumTipoExpediente.Lote Then
            cmb.AddItem "Convertir a Lote de Acuerdo Marco"
            cmb.AddItem "Convertir a Acuerdo Marco"
            cmb.AddItem "Convertir a Basado"
            cmb.AddItem "Convertir a Expediente Independiente"
        ElseIf m_TipoActual = EnumTipoExpediente.BasadoDeAM Or _
            m_TipoActual = EnumTipoExpediente.BasadoDeLote Then
            cmb.AddItem "Convertir a Acuerdo Marco"
            cmb.AddItem "Convertir a Lote"
            cmb.AddItem "Convertir a Expediente Independiente"
            cmb.AddItem "Convertir a Basado"
            
        ElseIf m_TipoActual = EnumTipoExpediente.EXPIndividual Then
            cmb.AddItem "Convertir a Acuerdo Marco"
            cmb.AddItem "Convertir a Lote"
            cmb.AddItem "Convertir a Basado"
        End If
        
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha producido el error nº: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
    End If
    
End Function

Private Sub m_Form_Seleccionado(m_expediente As Expediente)
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Me.IDExpedientePadre = m_expediente.IDExpediente
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al m_Form_Seleccionado se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub

Private Sub Tipo_AfterUpdate()
    
    Dim m_TipoElegido As String
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Me.IDExpedientePadre.Locked = True
    Me.IDExpedientePadre.Enabled = False
    
    m_TipoElegido = Nz(Me.TIpo, "")
    If m_TipoElegido = "" Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If m_TipoElegido = "Convertir a Acuerdo Marco" Then
        'no se puede meter idpadre
        Me.IDExpedientePadre.Locked = True
        Me.IDExpedientePadre.Enabled = False
    ElseIf m_TipoElegido = "Convertir a Lote" Then
        'se puede meter idpadre pero solo de tipo AM
        Me.IDExpedientePadre.Locked = False
        Me.IDExpedientePadre.Enabled = True
    ElseIf m_TipoElegido = "Convertir a Basado" Then
        'no se puede meter idpadre de Lote o de AM
        Me.IDExpedientePadre.Locked = False
        Me.IDExpedientePadre.Enabled = True
    ElseIf m_TipoElegido = "Convertir a Expediente Independiente" Then
        'no se puede meter idpadre
        Me.IDExpedientePadre.Locked = True
        Me.IDExpedientePadre.Enabled = False
    ElseIf m_TipoElegido = "Convertir a Lote de Acuerdo Marco" Then
        
        Me.IDExpedientePadre.Locked = False
        Me.IDExpedientePadre.Enabled = True
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    If Err.Number <> 1000 Then
        m_Error = "Al Tipo_AfterUpdate se ha producido el error num " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        On Error Resume Next
        CorreoAlAdministrador m_Error
    End If
    DoCmd.Hourglass False
    pregunta = MsgBox(m_Error, vbCritical, "Error")
End Sub
