VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_FormNCProyectoGeneralConVinculoNC"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Private WithEvents m_FormExpedientes As Form_FormExpedientesBusqueda
Attribute m_FormExpedientes.VB_VarHelpID = -1
Private m_Error As String

Private Sub cmdSalir_Click()
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Sub ComandoBuscarExpediente_Click()
     Dim m_Col As Scripting.Dictionary
    Dim m_ID As Variant
    Dim m_Expediente As Expediente
   
    Dim m_PalabraClave As String
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    
    m_PalabraClave = Nz(Me.PalabraClave, "")
    If m_PalabraClave = "" Then
        If FormularioAbierto("FormExpedientesBusqueda") Then
            DoCmd.Close acForm, "FormExpedientesBusqueda", acSaveNo
        End If
        DoCmd.OpenForm "FormExpedientesBusqueda"
        If FormularioAbierto("FormExpedientesBusqueda") Then
            Set m_FormExpedientes = Forms("FormExpedientesBusqueda")
            m_FormExpedientes.PalabraClave = Nz(Me.PalabraClave, "")
            Form_FormExpedientesBusqueda.Filtrar
        End If
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    Set m_Col = constructor.getExpedientesBusqueda( _
                                                    p_PC:=m_PalabraClave, _
                                                    p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_Col Is Nothing Then
       EstablecerDatosExpediente p_Error:=m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If Nz(Me.IDExpediente, "") = "" Then
            Me.ComandoActualizararExpedientes.Enabled = False
        Else
            Me.ComandoActualizararExpedientes.Enabled = True
        End If
        
        ComandoIrABusquedaExpedientes_Click
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    
    If m_Col.count = 1 Then
        For Each m_ID In m_Col
            Set m_Expediente = m_Col(m_ID)
            EstablecerDatosExpediente p_Expediente:=m_Expediente, p_Error:=m_Error
            If m_Error <> "" Then
                Err.Raise 1000
            End If
            RellenarBordeCamposObligatorios
        Next
        Me.PalabraClave = Null
        
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        Exit Sub
    End If
    If FormularioAbierto("FormExpedientesBusqueda") Then
        DoCmd.Close acForm, "FormExpedientesBusqueda", acSaveNo
    End If
    DoCmd.OpenForm "FormExpedientesBusqueda"
    If FormularioAbierto("FormExpedientesBusqueda") Then
        Set m_FormExpedientes = Forms("FormExpedientesBusqueda")
        m_FormExpedientes.PalabraClave = Nz(Me.PalabraClave, "")
        Form_FormExpedientesBusqueda.Filtrar
    End If
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoBuscarExpediente_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Private Sub ComandoIrABusquedaExpedientes_Click()
    
    On Error GoTo errores
    
   
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If FormularioAbierto("FormExpedientesBusqueda") Then
        DoCmd.Close acForm, "FormExpedientesBusqueda", acSaveNo
    End If
    DoCmd.OpenForm "FormExpedientesBusqueda"
    If FormularioAbierto("FormExpedientesBusqueda") Then
        Set m_FormExpedientes = Forms("FormExpedientesBusqueda")
        If Nz(Me.PalabraClave, "") <> "" Then
            m_FormExpedientes.PalabraClave = Nz(Me.PalabraClave, "")
            Form_FormExpedientesBusqueda.Filtrar
        End If
        
    End If
    AvanceCerrar
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoIrABusquedaExpedientes_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ComandoRegistrar_Click()
    
    Dim m_NCOp As NCProyectoOperaciones
    
    On Error GoTo errores
    
   
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    Set m_ObjNCProyectoActiva = New NCProyecto
    With m_ObjNCProyectoActiva
        .IDExpediente = Nz(Me.IDExpediente, "")
        If Not .ExpedienteObj Is Nothing Then
            .Juridica = .ExpedienteObj.CadenaJuridicas
            .JuridicaExp = .Juridica
            .CodExp = .ExpedienteObj.CodExp
            .Expediente = .CodExp
            .Nemotecnico = .ExpedienteObj.Nemotecnico
            If Not .ExpedienteObj.RESPONSABLECALIDAD Is Nothing Then
                .RESPONSABLECALIDAD = .ExpedienteObj.RESPONSABLECALIDAD.Nombre
            End If
            If Not .ExpedienteObj.JefeProyecto Is Nothing Then
                .ResponsableTelefonica = .ExpedienteObj.JefeProyecto.UsuarioRed
            End If
        End If
        .Descripcion = Nz(Me.Descripcion, "")
        .DetectadoPor = Nz(Me.DetectadoPor, "")
        .IDNCAsociada = m_ObjNCProyectoActivaPVinculada.IDNoConformidad
        .CodigoNoConformidadAsociada = m_ObjNCProyectoActivaPVinculada.CodigoNoConformidad
        .FechaApertura = Nz(Me.FechaApertura, "")
    End With
    Set m_NCOp = New NCProyectoOperaciones
    With m_NCOp
        Set m_NCOp.nc = m_ObjNCProyectoActiva
        .RegistrarAltaDatosUnicosConVinculoNC m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    pregunta = MsgBox("Registro correcto de la NC de Proyecto " & m_ObjNCProyectoActiva.CodigoNoConformidad & " " & _
                        "asociada con la NC " & m_ObjNCProyectoActiva.CodigoNoConformidadAsociada, vbInformation, "Registro correcto")
    If FormularioAbierto("FormNCProyectoGestion") Then
        Form_FormNCProyectoGestion.ActualizarLista
    End If
    DoCmd.Close acForm, Me.Name, acSaveNo
   
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoRegistrar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub Form_Load()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If m_ObjNCProyectoActivaPVinculada Is Nothing Then
        m_Error = "No se ha indicado primero la NC de proyecto a vincular"
        Err.Raise 1000
    End If
    Set m_ObjNCProyectoActiva = Nothing
    Ajustar Me
    EstablecerDatos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Me.lblTitulo.Caption = "ALTA DE NO CONFORMIDAD DE PROYECTO VINCULADA A " & m_ObjNCProyectoActivaPVinculada.CodigoNoConformidad
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al Form_Load se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub m_FormExpedientes_Seleccionado(m_Exp As Expediente)
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    EstablecerDatosExpediente m_Exp
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormExpedientes_Seleccionado se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub


Private Function EstablecerDatos(Optional ByRef p_Error As String) As String
    
    On Error GoTo errores
    If m_ObjNCProyectoActivaPVinculada Is Nothing Then
        Exit Function
    End If
    If EsTecnico = EnumSino.Sí Then
        Me.AllowEdits = False
    Else
        Me.AllowEdits = True
    End If
    With m_ObjNCProyectoActivaPVinculada
        If Not .ExpedienteObj Is Nothing Then
            EstablecerDatosExpediente .ExpedienteObj, p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            
        End If
        If .Descripcion <> "" Then
            Me.Descripcion = .Descripcion
        End If
        If .EntidadResponsable <> "" Then
            Me.EntidadResponsable = .EntidadResponsable
        End If
        If .DetectadoPor <> "" Then
            Me.DetectadoPor = .DetectadoPor
        End If
        
    End With
    Me.FechaApertura = Date
    If EsTecnico <> EnumSino.Sí Then
        RellenarBordeCamposObligatorios
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Sub PalabraClave_KeyDown(KeyCode As Integer, Shift As Integer)
    
    
    
    If KeyCode = vbKeyReturn Or KeyCode = 9 Then
'        If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.No Then
'            Exit Sub
'        End If
        Me.ComandoBuscarExpediente.SetFocus
        Me.PalabraClave.SetFocus
        'Debug.Print Me.Pass
        ' Código que deseas ejecutar cuando se pulse Enter
        ComandoBuscarExpediente_Click
        
        ' Si deseas evitar que Access realice la acción predeterminada de Enter,
        ' puedes utilizar la siguiente línea:
        KeyCode = 0
    End If
End Sub

Private Sub Descripcion_BeforeUpdate(Cancel As Integer)
    On Error Resume Next
    
    RellenarBordeCamposObligatorios
End Sub


Private Sub EntidadResponsable_BeforeUpdate(Cancel As Integer)
    On Error Resume Next
    
    RellenarBordeCamposObligatorios
End Sub
Private Sub DetectadoPor_BeforeUpdate(Cancel As Integer)
    On Error Resume Next
    
    RellenarBordeCamposObligatorios
End Sub


Public Function EstablecerDatosExpediente( _
                                            Optional p_Expediente As Expediente, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    
    On Error GoTo errores
    If p_Expediente Is Nothing Then
        
        Me.IDExpediente = Null
        Me.Titulo = Null
        Me.Juridica = Null
        Me.RESPONSABLECALIDAD = Null
        RellenarBordeCamposObligatorios
        Exit Function
    End If
    
    
    With p_Expediente
        
        Me.IDExpediente = .IDExpediente
        Me.Titulo = .TextoExpediente
        Me.Juridica = .CadenaJuridicas
        If Not .RESPONSABLECALIDAD Is Nothing Then
            Me.RESPONSABLECALIDAD = .RESPONSABLECALIDAD.Nombre
        End If
        If .JefeProyectoNombre <> "" Then
            Me.ResponsableTelefonica = .JefeProyectoNombre
        End If
        Me.PalabraClave = Null
        Me.Descripcion.SetFocus
        RellenarBordeCamposObligatorios
    End With
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatosExpediente ha devuelto el error: " & Err.Description
    End If

End Function

Private Function RellenarBordeCamposObligatorios( _
                                                Optional ByRef p_Error As String _
                                                ) As String
    
    
    Dim ctl As Control
    
    On Error GoTo errores
    
    p_Error = ""
    With Me
        Set ctl = Me.PalabraClave
        If Nz(Me.IDExpediente, "") = "" Then
            ctl.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
            ctl.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
        Else
            ctl.BorderColor = COLOR_BORDE_CAMPO_RELLENO
            ctl.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
        End If
        Set ctl = Me.Descripcion
        If Nz(Me.Descripcion, "") = "" Then
            ctl.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
            ctl.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
        Else
            ctl.BorderColor = COLOR_BORDE_CAMPO_RELLENO
            ctl.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
        End If
        Set ctl = Me.EntidadResponsable
        If Nz(Me.EntidadResponsable, "") = "" Then
            ctl.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
            ctl.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
        Else
            ctl.BorderColor = COLOR_BORDE_CAMPO_RELLENO
            ctl.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
        End If
        Set ctl = Me.DetectadoPor
        If Nz(Me.DetectadoPor, "") = "" Then
            ctl.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
            ctl.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
        Else
            ctl.BorderColor = COLOR_BORDE_CAMPO_RELLENO
            ctl.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
        End If
        Set ctl = Me.FechaApertura
        If Nz(Me.FechaApertura, "") = "" Then
            ctl.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
            ctl.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
        Else
            ctl.BorderColor = COLOR_BORDE_CAMPO_RELLENO
            ctl.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
        End If
    End With
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarBordeCamposObligatorios ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

