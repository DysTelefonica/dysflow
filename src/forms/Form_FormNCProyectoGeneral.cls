Option Compare Database
Option Explicit

Private WithEvents m_FormExpedientes As Form_FormExpedientesBusqueda
Private m_NCAsociada As NCProyecto
Private m_RiesgoAsociado As riesgo

Private m_Error As String

Private Sub m_FormExpedientes_Seleccionado(m_Exp As Expediente)
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    EstablecerDatosExpediente m_Exp
    With m_Exp
        If Not .RESPONSABLECALIDAD Is Nothing Then
            Me.RESPONSABLECALIDAD = .RESPONSABLECALIDAD.Nombre
        End If
    End With
    RellenarBordeCamposObligatorios Me
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


Private Function DeshabilitarControlesPorVinculoNC(Optional ByRef p_Error As String) As String
    
    On Error GoTo errores
    With Me
        .Descripcion.Enabled = True
        .CausaYAnalisRaiz.Enabled = False
        .IDTipo.Enabled = False
        .EntidadResponsable.Enabled = False
        .ResponsableTelefonica.Enabled = False
        .RequiereControlEficacia.Enabled = False
        .ComandoControlEficaciaDatos.Enabled = False
        .VEHICULO.Enabled = False
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método DeshabilitarControlesPorVinculoNC ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Function RellenarDatosVinculados(Optional ByRef p_Error As String) As String
    Dim m_EstadoCalculadoTexto As String
    Dim m_FechaPrevista As String
    Dim m_FechaCierre As String
    
    On Error GoTo errores
    If m_NCAsociada Is Nothing Then
        Exit Function
    End If
    With m_NCAsociada
        If .CausaYAnalisRaiz <> "" Then
            Me.CausaYAnalisRaiz = .CausaYAnalisRaiz
        Else
            Me.CausaYAnalisRaiz = Null
        End If
        If .IDTipo <> "" Then
            Me.IDTipo = .IDTipo
        Else
            Me.IDTipo = Null
        End If
        If .EntidadResponsable <> "" Then
            Me.EntidadResponsable = .EntidadResponsable
        Else
            Me.EntidadResponsable = Null
        End If
        If .RequiereControlEficacia <> "" Then
            Me.RequiereControlEficacia = .RequiereControlEficacia
        Else
            Me.RequiereControlEficacia = Null
        End If
        If .VEHICULO <> "" Then
            Me.VEHICULO = .VEHICULO
        Else
            Me.VEHICULO = Null
        End If
        m_FechaPrevista = .FPREVCIERRECalculada
        If IsDate(m_FechaPrevista) Then
            Me.FPREVCIERRE = m_FechaPrevista
        Else
            Me.FPREVCIERRE = Null
        End If
        m_FechaCierre = .FECHACIERRECalculada
        If IsDate(m_FechaCierre) Then
            Me.FECHACIERRE = m_FechaCierre
        Else
            Me.FECHACIERRE = Null
        End If
      
       Me.Estado = "Vinculado a " & .CodigoNoConformidad & " " & .EstadoTitulo
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarDatosVinculados ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function



Public Sub ComandoActualizar_Click()
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    Me.Estado = Null
   
    
    ActualizarDatosNCProyecto m_ObjNCProyectoActiva, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Set Form_FormNCProyecto.m_NCAlInicio = constructor.getNCProyecto(p_IDNC:=m_ObjNCProyectoActiva.IDNoConformidad, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    EstablecerDatos

    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoActualizar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
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
            With m_Expediente
                If Not .RESPONSABLECALIDAD Is Nothing Then
                    Me.RESPONSABLECALIDAD = .RESPONSABLECALIDAD.Nombre
                End If
            End With
            RellenarBordeCamposObligatorios Me
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

Private Sub ComandoControlEficaciaDatos_Click()
    On Error GoTo errores
    RellenarDatosObjeto m_Error
    If m_Error <> "" Then
        Err.Raise 100
    End If
    If m_ObjNCProyectoActiva.DatosGeneralesOK(EnumSino.Sí) = EnumSino.No Then
        m_Error = "Antes de rellenar este apartado ha de tener todos los datos obligatorios principales rellenos"
        Err.Raise 1000
    End If
    m_ObjNCProyectoActiva.RequiereControlEficacia = Nz(Me.RequiereControlEficacia, "")
    If FormularioAbierto("FormNCProyectoControlEficaciaAlta") Then
        DoCmd.Close acForm, "FormNCProyectoControlEficaciaAlta", acSaveNo
    End If
    DoCmd.OpenForm "FormNCProyectoControlEficaciaAlta"
    
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoControlEficaciaDatos_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Public Sub ComandoGrabar_Click()
    
    Dim m_NCOp As NCProyectoOperaciones
    Dim m_HaHabidoCambios As Boolean
    
    Dim m_EstadoAlInicio As String
    Dim m_Estado As String
    On Error GoTo errores
    
   
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    m_HaHabidoCambios = HaHabidoCambios(m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If Not m_HaHabidoCambios Then
        m_Error = "No hay cambios que guardar"
        Err.Raise 1000
    End If
    RellenarDatosObjeto m_Error
    If m_Error <> "" Then
        Err.Raise 100
    End If
    
    If Not Form_FormNCProyecto.m_NCAlInicio Is Nothing Then
        If Form_FormNCProyecto.m_NCAlInicio.VinculadoANC = EnumSino.No Then
            If m_ObjNCProyectoActiva.RequiereControlEficacia = "No" Then
                If Form_FormNCProyecto.m_NCAlInicio.ControlEficacia <> "" Then
                    VBA.DoEvents
                    DoCmd.Hourglass False
                    VBA.DoEvents
                    pregunta = MsgBox("Había un control de eficacia ya descrito" & vbNewLine & _
                                    "¿Desea guardar y perder ese dato?", vbExclamation + vbYesNo + vbDefaultButton2, "Eliminar control de eficacia")
                                    
                    If pregunta <> vbYes Then
                        
                        Exit Sub
                    End If
                    VBA.DoEvents
                    DoCmd.Hourglass True
                    VBA.DoEvents
                End If
            End If
        
        End If
    End If
    
    Set m_NCOp = New NCProyectoOperaciones
    With m_NCOp
        Set m_NCOp.nc = m_ObjNCProyectoActiva
        If Not m_NCAsociada Is Nothing Then
            .RegistrarCambiosDatosUnicosConVinculoNC Form_FormNCProyecto.m_NCAlInicio, m_Error
        Else
            m_EstadoAlInicio = m_ObjNCProyectoActiva.Estado
            .RegistrarDatosUnicos Form_FormNCProyecto.m_NCAlInicio, m_Error
            
            m_Estado = m_ObjNCProyectoActiva.Estado
            
        End If
        
        
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    
    Set Form_FormNCProyecto.m_NCAlInicio = constructor.getNCProyecto(p_IDNC:=m_ObjNCProyectoActiva.IDNoConformidad, p_Error:=m_Error)
    EstablecerColorPestañasNCProyecto p_Error:=m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ObjNCProyectoActiva.CodigoNoConformidad <> "" Then
        Me.CodigoNoConformidad = m_ObjNCProyectoActiva.CodigoNoConformidad
    End If
    ComandoActualizar_Click
    If FormularioAbierto("FormNCProyectoGestion") Then
        Form_FormNCProyectoGestion.ActualizarLista EnumSino.Sí
    End If
    If Not m_NCAsociada Is Nothing Then
        EstablecerDatos m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    If Not m_NCAsociada Is Nothing Then
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
        pregunta = MsgBox("Registro correcto de la NC de Proyecto " & m_ObjNCProyectoActiva.CodigoNoConformidad & " " & _
                    "asociada con la NC " & m_NCAsociada.CodigoNoConformidad, vbInformation, "Registro correcto")
       VBA.DoEvents
        DoCmd.Hourglass True
        VBA.DoEvents
    Else
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
         pregunta = MsgBox("Registro correcto de la NC de Proyecto " & m_ObjNCProyectoActiva.CodigoNoConformidad, _
                     vbInformation, "Registro correcto")
    
         If m_EstadoAlInicio <> "" Then
             If m_EstadoAlInicio <> "Cerrada" Then
                 If m_Estado = "Cerrada" Then
                     pregunta = MsgBox("La NC de proyecto pasa a estar cerrada ", vbInformation, "Cierre de NC")
                 End If
             Else
                 If m_EstadoAlInicio = "Cerrada" Then
                     If m_Estado <> "Cerrada" Then
                         pregunta = MsgBox("La NC de proyecto ha dejado de estar cerrada ", vbInformation, "Reapertura de NC")
                     End If
                 End If
             End If
         End If
        VBA.DoEvents
        DoCmd.Hourglass False
        VBA.DoEvents
    End If
    m_EstadoAlInicio = m_Estado
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoGrabar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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


Private Sub Form_Load()
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    EstablecerDatos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    
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

Private Function EstablecerCombos( _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
   
    
    On Error GoTo errores
    
    
    EstablecerComboTipo Me.IDTipo, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    EstablecerComboResponsablesCalidad cmb:=Me.RESPONSABLECALIDAD, p_Error:=p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    EstablecerComboResponsables Me.ResponsableTelefonica, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerCombos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Public Function EstablecerDatos( _
                                    Optional ByRef p_Error As String _
                                    ) As String
   
    
    
    Dim m_fechaCierreCalculada As String
    Dim m_EstadoTitulo As String
    Dim m_FechaPrevCierre As String
    Dim m_CausaYAnalisRaiz As String
    Dim m_IDTipo As String
    Dim m_EntidadResponsable As String
    Dim m_RequiereControlEficacia As String
    Dim m_FechaPrevistaControlEficacia As String
    Dim m_Vehiculo As String
    Dim m_FPREVCIERRE As String
    Dim m_FechaCierre As String
    Dim m_DatosGeneralesOK As EnumSino
    On Error GoTo errores
    EstablecerCombos
    If m_ObjNCProyectoActiva Is Nothing Then
        p_Error = "El formulario se ha abierto con parámetros insuficientes"
        Err.Raise 1000
        
    End If
    
    
    
    If m_ObjNCProyectoActiva.IDNoConformidad = "" Then
        If EsTecnico <> EnumSino.Sí Then
            Me.ComandoActualizar.Enabled = False
            Me.FechaApertura = Date
            RellenarBordeCamposObligatorios Me
            Me.PalabraClave.SetFocus
        End If
        Exit Function
    End If
    
    If Form_FormNCProyecto.m_NCAlInicio Is Nothing Then
        Set Form_FormNCProyecto.m_NCAlInicio = constructor.getNCProyecto(p_IDNC:=m_ObjNCProyectoActiva.IDNoConformidad, p_Error:=p_Error)
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If Form_FormNCProyecto.m_NCAlInicio Is Nothing Then
            p_Error = "El formulario se ha abierto con parámetros insuficientes"
            Err.Raise 1000
        End If
    End If
   
    Me.Estado.ForeColor = Me.CodigoNoConformidad.ForeColor
    Me.Estado.BorderWidth = Me.CodigoNoConformidad.BorderWidth
    With Form_FormNCProyecto.m_NCAlInicio
        
        EstablecerDatosExpediente p_Expediente:=.ExpedienteObj, p_Error:=p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
        If .Descripcion <> "" Then
            Me.Descripcion = .Descripcion
        End If
        If .RESPONSABLECALIDAD = "" Then
            If Not .ExpedienteObj.RESPONSABLECALIDAD Is Nothing Then
                Me.RESPONSABLECALIDAD = .ExpedienteObj.RESPONSABLECALIDAD.Nombre
            End If
        Else
            Me.RESPONSABLECALIDAD = .RESPONSABLECALIDAD
        End If
       
        
        If .CodigoNoConformidad <> "" Then
            Me.CodigoNoConformidad = .CodigoNoConformidad
        End If
        If .CodConcesionAsociada <> "" Then
            Me.CodConcesionAsociada = .CodConcesionAsociada
        End If
        
        If .CodRiesgosAsociados <> "" Then
            Me.CodigoRiesgo = .CodRiesgosAsociados
            
        End If
        If .DetectadoPor <> "" Then
            Me.DetectadoPor = .DetectadoPor
        End If
        If Not .ResponsableTelefonicaObj Is Nothing Then
            Me.ResponsableTelefonica = .ResponsableTelefonicaObj.Nombre
        End If
        If .FechaApertura <> "" Then
            Me.FechaApertura = .FechaApertura
        End If
        If Not .NCProyectoAsociada Is Nothing Then
            m_CausaYAnalisRaiz = .NCProyectoAsociada.CausaYAnalisRaiz
            m_IDTipo = .NCProyectoAsociada.IDTipo
            m_EntidadResponsable = .NCProyectoAsociada.EntidadResponsable
            m_RequiereControlEficacia = .NCProyectoAsociada.RequiereControlEficacia
            m_FechaPrevistaControlEficacia = .NCProyectoAsociada.FechaPrevistaControlEficacia
            m_Vehiculo = .NCProyectoAsociada.VEHICULO
            m_FPREVCIERRE = .NCProyectoAsociada.FPREVCIERRE
            m_FechaCierre = .NCProyectoAsociada.FECHACIERRECalculada
            .NCProyectoAsociada.EstadoGrabar
            m_EstadoTitulo = .NCProyectoAsociada.EstadoTitulo
            If .NCProyectoAsociada.DatosGeneralesOK = EnumSino.No Then
                Me.Estado.ForeColor = COLOR_BORDE_CAMPO_NORELLENO
            Else
                If .NCProyectoAsociada.TieneAcciones = EnumSino.No Then
                    Me.Estado.ForeColor = COLOR_BORDE_CAMPO_NORELLENO
                Else
                    Me.Estado.ForeColor = Me.CodigoNoConformidad.ForeColor
                End If
            End If
            m_DatosGeneralesOK = .NCProyectoAsociada.DatosGeneralesOK
            DeshabilitarControlesPorVinculoNC
        Else
            m_CausaYAnalisRaiz = .CausaYAnalisRaiz
            m_IDTipo = .IDTipo
            m_EntidadResponsable = .EntidadResponsable
            m_RequiereControlEficacia = .RequiereControlEficacia
            m_FechaPrevistaControlEficacia = .FechaPrevistaControlEficacia
            m_Vehiculo = .VEHICULO
            .FPREVCIERREGrabar
            m_FPREVCIERRE = .FPREVCIERRE
            .FECHACIERREGrabar
            m_FechaCierre = .FECHACIERRE
            .EstadoGrabar
            m_EstadoTitulo = .EstadoTitulo
            If EsTecnico <> EnumSino.Sí Then
            
            
                If .DatosGeneralesOK = EnumSino.No Then
                    Me.Estado.ForeColor = COLOR_BORDE_CAMPO_NORELLENO
                Else
                    If .TieneAcciones = EnumSino.No Then
                        Me.Estado.ForeColor = COLOR_BORDE_CAMPO_NORELLENO
                    Else
                        Me.Estado.ForeColor = Me.CodigoNoConformidad.ForeColor
                    End If
                End If
            End If
            m_DatosGeneralesOK = .DatosGeneralesOK
        End If
        If Not .NCProyectoAsociada Is Nothing Then
            m_EstadoTitulo = "Vinculado a " & .NCProyectoAsociada.CodigoNoConformidad & " " & .EstadoTitulo
        Else
            m_EstadoTitulo = .EstadoTitulo
           
        End If
        
        If m_EstadoTitulo <> "" Then
            Me.Estado = m_EstadoTitulo
        End If
        If m_CausaYAnalisRaiz <> "" Then
            Me.CausaYAnalisRaiz = m_CausaYAnalisRaiz
        End If
        If m_IDTipo <> "" Then
            Me.IDTipo = m_IDTipo
        End If
        If m_EntidadResponsable <> "" Then
            Me.EntidadResponsable = m_EntidadResponsable
        End If
        If m_RequiereControlEficacia <> "" Then
            Me.RequiereControlEficacia = m_RequiereControlEficacia
            If Not .NCProyectoAsociada Is Nothing Then
                Me.ComandoControlEficaciaDatos.Enabled = False
            Else
                If m_RequiereControlEficacia = "Sí" Then
                    If m_FechaPrevistaControlEficacia = "" Then
                        If EsTecnico <> EnumSino.Sí Then
                            Me.ComandoControlEficaciaDatos.Enabled = True
                        Else
                            Me.ComandoControlEficaciaDatos.Enabled = False
                        End If
                    Else
                        Me.ComandoControlEficaciaDatos.Enabled = False
                    End If
                Else
                    Me.ComandoControlEficaciaDatos.Enabled = False
                End If
            End If
        Else
            Me.ComandoControlEficaciaDatos.Enabled = False
        End If
        If m_Vehiculo = "" Then
            Me.VEHICULO = m_Vehiculo
        End If
        If .FPREVCIERRE <> "" Then
            Me.FPREVCIERRE = .FPREVCIERRE
        End If
        If m_FechaCierre <> "" Then
            Me.FECHACIERRE = m_FechaCierre
        End If
        If .NCProyectoAsociada Is Nothing Then
            Me.ComandoActualizar.Enabled = True
        Else
            Me.ComandoActualizar.Enabled = False
        End If
    End With
    
    If m_DatosGeneralesOK <> EnumSino.Sí Then
        If EsTecnico <> EnumSino.Sí Then
             Me.ComandoActualizararExpedientes.Enabled = True
             Me.ComandoBuscarExpediente.Enabled = True
             Me.ComandoIrABusquedaExpedientes.Enabled = True
            
             Me.PalabraClave.Enabled = True
             Me.ComandoGrabar.Enabled = True
             Me.AllowEdits = True
        Else
            Me.AllowEdits = False
            Me.ComandoActualizararExpedientes.Enabled = False
             Me.ComandoBuscarExpediente.Enabled = False
             Me.ComandoIrABusquedaExpedientes.Enabled = False
            
             Me.PalabraClave.Enabled = False
             Me.ComandoGrabar.Enabled = False
        End If
    Else
    
   
        If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.No Then
            Me.ComandoActualizararExpedientes.Enabled = False
            Me.ComandoBuscarExpediente.Enabled = False
            Me.ComandoIrABusquedaExpedientes.Enabled = False
            Me.PalabraClave.Enabled = False
           
            Me.ComandoGrabar.Enabled = False
            Me.AllowEdits = False
        Else
            If EsTecnico <> EnumSino.Sí Then
                 Me.ComandoActualizararExpedientes.Enabled = True
                 Me.ComandoBuscarExpediente.Enabled = True
                 Me.ComandoIrABusquedaExpedientes.Enabled = True
                
                 Me.PalabraClave.Enabled = True
                 Me.ComandoGrabar.Enabled = True
                 Me.AllowEdits = True
            End If
        End If
     End If
    If EsTecnico <> EnumSino.Sí Then
        RellenarBordeCamposObligatoriosOK Me
    End If
    If FormularioAbierto("FormNCProyectoGestion") Then
        Form_FormNCProyectoGestion.ActualizarLineaListaConDatos Nz(Me.Estado, ""), Nz(Me.FechaApertura, ""), Nz(Me.FECHACIERRE, ""), p_Error
        If p_Error <> "" Then
            Err.Raise 1000
        End If
    End If
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Private Sub PalabraClave_KeyDown(KeyCode As Integer, Shift As Integer)
    
    If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.No Then
        Exit Sub
    End If
    
    If KeyCode = vbKeyReturn Or KeyCode = 9 Then
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
    
    If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.Sí Then
        RellenarBordeCamposObligatorios Me
        
    End If
End Sub
Private Sub CausaYAnalisRaiz_BeforeUpdate(Cancel As Integer)
    On Error Resume Next
    
    If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.Sí Then
        RellenarBordeCamposObligatorios Me
        
    End If
End Sub

Private Sub RequiereControlEficacia_AfterUpdate()
    On Error Resume Next
    
    If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.Sí And EsTecnico <> EnumSino.Sí Then
        RellenarBordeCamposObligatorios Me
        If Nz(Me.RequiereControlEficacia, "") = "Sí" Then
            Me.ComandoControlEficaciaDatos.Enabled = True
        Else
            Me.ComandoControlEficaciaDatos.Enabled = False
        End If
    End If
End Sub

Private Sub IDTipo_BeforeUpdate(Cancel As Integer)
    On Error Resume Next
   
    If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.Sí Then
        RellenarBordeCamposObligatorios Me
        
    End If
End Sub


Private Sub EntidadResponsable_BeforeUpdate(Cancel As Integer)
    On Error Resume Next
    
    If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.Sí Then
        RellenarBordeCamposObligatorios Me
        
    End If
End Sub
Private Sub DetectadoPor_BeforeUpdate(Cancel As Integer)
    On Error Resume Next
    
    If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.Sí Then
        RellenarBordeCamposObligatorios Me
        
    End If
End Sub

Private Sub RESPONSABLECALIDAD_BeforeUpdate(Cancel As Integer)
    On Error Resume Next
    
    If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.Sí Then
        RellenarBordeCamposObligatorios Me
        
    End If
End Sub

Private Sub ResponsableTelefonica_BeforeUpdate(Cancel As Integer)
    On Error Resume Next
    
    If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.Sí Then
        RellenarBordeCamposObligatorios Me
        
    End If
End Sub
Private Sub FPREVCIERRE_BeforeUpdate(Cancel As Integer)
    On Error Resume Next
    
    If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.Sí Then
        RellenarBordeCamposObligatorios Me
        
    End If
End Sub

Public Function RellenarDatosObjeto(Optional ByRef p_Error As String) As String
    
    Dim ctl As Control
    Dim m_Valor As String
    Dim m_Motivo As String
    On Error GoTo errores
    
    For Each ctl In Me.Controls
        If InStr(1, Nz(ctl.Tag, ""), "DATO") <> 0 Then
            'Debug.Print ctl.Tag
            m_ObjNCProyectoActiva.SetPropiedad ctl.Name, Nz(ctl.Value, ""), p_Error
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            
        End If
    Next
    If Nz(Me.ResponsableTelefonica, "") <> "" Then
        m_ObjNCProyectoActiva.ResponsableTelefonica = Me.ResponsableTelefonica.Column(1)
    End If
    
'    If Not m_NCAsociada Is Nothing Then
'        m_ObjNCProyectoActiva.IDNCAsociada = m_NCAsociada.IDNoConformidad
'        m_ObjNCProyectoActiva.CodigoNoConformidadAsociada = m_NCAsociada.CodigoNoConformidad
'    Else
'        m_ObjNCProyectoActiva.IDNCAsociada = ""
'        m_ObjNCProyectoActiva.CodigoNoConformidadAsociada = ""
'    End If
    If Nz(Me.CodConcesionAsociada, "") = "" Then
        m_ObjNCProyectoActiva.CodConcesionAsociada = ""
    Else
        m_ObjNCProyectoActiva.CodConcesionAsociada = Me.CodConcesionAsociada
    End If
    
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método RellenarDatosObjeto ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function EstablecerDatosExpediente( _
                                            Optional p_Expediente As Expediente, _
                                            Optional ByRef p_Error As String _
                                            ) As String
    
    On Error GoTo errores
    If p_Expediente Is Nothing Then
        Set Form_FormNCProyecto.m_ColRiesgos = Nothing
        Me.IDExpediente = Null
        Me.Titulo = Null
        Me.Juridica = Null
        If EsTecnico <> EnumSino.Sí Then
            RellenarBordeCamposObligatorios Me
        End If
        Exit Function
    End If
    With p_Expediente
        
        If Form_FormNCProyecto.m_Expediente Is Nothing Then
            Set Form_FormNCProyecto.m_Expediente = constructor.getExpediente(p_IDExpediente:=.IDExpediente, p_Error:=p_Error)
            If p_Error <> "" Then
                Err.Raise 1000
            End If
            
        Else
            If Form_FormNCProyecto.m_Expediente.IDExpediente <> .IDExpediente Then
                 Set Form_FormNCProyecto.m_Expediente = constructor.getExpediente(p_IDExpediente:=.IDExpediente, p_Error:=p_Error)
                If p_Error <> "" Then
                    Err.Raise 1000
                End If
            End If
        End If
    End With
    With Form_FormNCProyecto.m_Expediente
        If Not Form_FormNCProyecto.m_Expediente Is Nothing Then
            Me.IDExpediente = .IDExpediente
            Me.Titulo = .TextoExpediente
            Me.Juridica = .CadenaJuridicas
            
            If .JefeProyectoNombre <> "" Then
                Me.ResponsableTelefonica = .JefeProyectoNombre
            End If
            Me.PalabraClave = Null
            Me.Descripcion.SetFocus
        End If
    End With
    If EsTecnico <> EnumSino.Sí Then
        RellenarBordeCamposObligatorios Me
    End If
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatosExpediente ha devuelto el error: " & Err.Description
    End If

End Function
Public Function HaHabidoCambios(Optional ByRef p_Error As String) As Boolean

    On Error GoTo errores
    
    If Form_FormNCProyecto.m_NCAlInicio Is Nothing Then
        HaHabidoCambios = True
        Exit Function
    End If
    
    
    With Me
        If Nz(.IDExpediente, "") <> Form_FormNCProyecto.m_NCAlInicio.IDExpediente Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(.RESPONSABLECALIDAD, "") <> Form_FormNCProyecto.m_NCAlInicio.RESPONSABLECALIDAD Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(.Descripcion, "") <> Form_FormNCProyecto.m_NCAlInicio.Descripcion Then
            HaHabidoCambios = True
            Exit Function
        End If
        
        If Nz(.CausaYAnalisRaiz, "") <> Form_FormNCProyecto.m_NCAlInicio.CausaYAnalisRaiz Then
            HaHabidoCambios = True
            Exit Function
        End If
        
       
        If Nz(.VEHICULO, "") <> Form_FormNCProyecto.m_NCAlInicio.VEHICULO Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(.IDTipo, "") <> Form_FormNCProyecto.m_NCAlInicio.IDTipo Then
            HaHabidoCambios = True
            Exit Function
        End If
        
        If Nz(.CodConcesionAsociada, "") <> Form_FormNCProyecto.m_NCAlInicio.CodConcesionAsociada Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(.EntidadResponsable, "") <> Form_FormNCProyecto.m_NCAlInicio.EntidadResponsable Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(.DetectadoPor, "") <> Form_FormNCProyecto.m_NCAlInicio.DetectadoPor Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(.ResponsableTelefonica, "") <> "" Then
            If Form_FormNCProyecto.m_NCAlInicio.ResponsableTelefonicaObj Is Nothing Then
                HaHabidoCambios = True
                Exit Function
            End If
            If Nz(.ResponsableTelefonica.Column(1), "") <> Form_FormNCProyecto.m_NCAlInicio.ResponsableTelefonica Then
                HaHabidoCambios = True
                Exit Function
            End If
        End If
        If Nz(.RequiereControlEficacia, "") <> Form_FormNCProyecto.m_NCAlInicio.RequiereControlEficacia Then
            HaHabidoCambios = True
            Exit Function
        End If
        
        If Nz(.VEHICULO, "") <> Form_FormNCProyecto.m_NCAlInicio.VEHICULO Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(.FechaApertura, "") <> Form_FormNCProyecto.m_NCAlInicio.FechaApertura Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(.FPREVCIERRE, "") <> Form_FormNCProyecto.m_NCAlInicio.FPREVCIERRE Then
            HaHabidoCambios = True
            Exit Function
        End If
        If Nz(.FECHACIERRE, "") <> Form_FormNCProyecto.m_NCAlInicio.FECHACIERRE Then
            HaHabidoCambios = True
            Exit Function
        End If
       
        
    End With
    Exit Function
    
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HaHabidoCambios ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Private Sub btnSeleccionarRiesgos_Click()
    Dim sArgs As String
    Dim lIdNC As Long
    
    On Error GoTo errores
    
    If m_ObjNCProyectoActiva Is Nothing Then Exit Sub
    
    ' Validamos que el expediente esté seleccionado
    If Nz(Me.IDExpediente, "") = "" Then
        MsgBox "Debe seleccionar primero un Expediente para poder ver sus riesgos asociados.", vbExclamation
        Exit Sub
    End If
    
    ' Determinamos el ID de forma segura para OpenArgs
    lIdNC = 0
    If IsNumeric(m_ObjNCProyectoActiva.IDNoConformidad) Then
        lIdNC = CLng(m_ObjNCProyectoActiva.IDNoConformidad)
    End If
    
    ' Preparamos OpenArgs: "IDNoConformidad|IDExpediente"
    ' Nota: Pasamos el IDExpediente del combo del formulario, que es el actual seleccionado
    sArgs = lIdNC & "|" & Me.IDExpediente
    
    ' Abrimos en modo diálogo
    DoCmd.OpenForm "formRiesgosSeleccion", _
                   WindowMode:=acDialog, _
                   OpenArgs:=sArgs
    
    ' AL VOLVER DEL POPUP (Código síncrono por acDialog):
    ' El objeto m_ObjNCProyectoActiva ha sido actualizado en memoria (propiedad .Riesgos)
    ' Refrescamos el cuadro de texto visual
    ActualizarTextoRiesgosUI
    
    Exit Sub
errores:
    MsgBox "Error al abrir selección de riesgos: " & Err.Description, vbCritical
End Sub
Private Sub ActualizarTextoRiesgosUI()
    Dim vKey As Variant
    Dim sCodigos As String
    Me.CodigoRiesgo = ""
    ' CLÁUSULA DE GUARDA
    If m_ObjNCProyectoActiva Is Nothing Then
        
        Exit Sub
    End If
    
    ' En modo Alta, el CodRiesgosAsociados puede haber sido seteado manualmente en el popup
    ' o calculamos desde el diccionario de objetos
    If Not m_ObjNCProyectoActiva.Riesgos Is Nothing Then
        If m_ObjNCProyectoActiva.Riesgos.count > 0 Then
            For Each vKey In m_ObjNCProyectoActiva.Riesgos.Keys
                sCodigos = sCodigos & IIf(sCodigos = "", "", "|") & m_ObjNCProyectoActiva.Riesgos(vKey).CodigoRiesgo
            Next vKey
            Me.CodigoRiesgo = sCodigos
            Exit Sub
        End If
    End If
    
    Me.CodigoRiesgo = ""
End Sub