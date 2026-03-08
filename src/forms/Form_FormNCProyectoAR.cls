VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_FormNCProyectoAR"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Private WithEvents m_FormAnexos As Form_FormARProyectoDocumentos
Attribute m_FormAnexos.VB_VarHelpID = -1
Public Event AltaAnexo()
Public Event EliminadoAnexo()
Public Event Alta(p_EstadoAlInicio As String)
Public Event Editado(p_EstadoAlInicio As String)
Private m_ARAlInicio As ARProyecto
Private m_EstadoAlInicio As String


Private m_Error As String

Private Function EstablecerCombos( _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
   
    
    On Error GoTo errores
    
    
    
    
    EstablecerComboResponsables Me.Responsable, p_Error
    
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerCombos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Public Function EstablecerDatos(Optional ByRef p_Error As String) As String
    
   Dim m_Titulo As String
    
    On Error GoTo errores
    If m_ObjACProyectoActiva Is Nothing Then
        m_Error = "El formulario se ha abierto con parámetros insuficientes"
        Err.Raise 1000
    End If
    Me.lblEstadoAR.Visible = False
    Me.ESTADOAR.Visible = False
    Me.ComandoActualizar.Visible = False
    EstablecerCombos p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    With m_ObjACProyectoActiva
        Me.AC = .AccionCorrectiva
       
    End With
    If m_ObjARProyectoActiva Is Nothing Then
        Me.lblTitulo.Caption = "Alta de tarea de AC de proyecto"
        Me.Caption = Me.lblTitulo.Caption
        If Not m_ObjACProyectoActiva.ResponsableObj Is Nothing Then
            Me.Responsable = m_ObjACProyectoActiva.ResponsableObj.Nombre
        End If
        Me.ComandoActualizar.Enabled = False
        Me.ComandoDocumentos.Enabled = False
        EstablecerBordes
        Exit Function
    End If
    Set m_ARAlInicio = constructor.getARProyecto(p_IDAR:=m_ObjARProyectoActiva.IDAccionRealizada, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    
    If m_ARAlInicio Is Nothing Then
        p_Error = "No parece estar registrada la tarea"
        Err.Raise 1000
    End If
    Me.lblEstadoAR.Visible = True
    Me.ESTADOAR.Visible = True
    
    If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
        Me.ComandoActualizar.Visible = True
        
        Me.ComandoActualizar.Enabled = True
    Else
        Me.ComandoActualizar.Visible = False
        
        Me.ComandoActualizar.Enabled = False
    End If
    Me.ComandoDocumentos.Enabled = True
    Me.lblTitulo.Caption = "Detalle de tarea de AC de proyecto"
    Me.Caption = Me.lblTitulo.Caption
    With m_ARAlInicio
        
        If .AccionRealizada <> "" Then
            Me.AccionRealizada = .AccionRealizada
        Else
            Me.AccionRealizada = Null
        End If
        If .Notas <> "" Then
            Me.Notas = .Notas
        Else
             Me.Notas = Null
        End If
        If IsDate(.FechaInicio) Then
            Me.FechaInicio = .FechaInicio
        End If
        If IsDate(.FechaFinPrevista) Then
            Me.FechaFinPrevista = .FechaFinPrevista
        End If
        If IsDate(.FechaFinReal) Then
            Me.FechaFinReal = .FechaFinReal
        End If
        If .Estado <> "" Then
            Me.ESTADOAR = .Estado
        End If
        
        If .Documentos Is Nothing Then
            Me.ImagenAnexo.Visible = False
        Else
            Me.ImagenAnexo.Visible = True
        End If
        If Not .ResponsableObj Is Nothing Then
            Me.Responsable = .ResponsableObj.Nombre
        Else
            Me.Responsable = Null
        End If
    End With
    
    If m_ObjNCProyectoActiva.Borrado = True Then
        Me.AllowEdits = False
        Me.ComandoRegistrar.Enabled = False
    Else
        If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
            If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.No Then
                Me.AllowEdits = False
                Me.ComandoRegistrar.Enabled = False
            Else
                Me.AllowEdits = True
                Me.ComandoRegistrar.Enabled = True
                
            End If
        Else
             Me.AllowEdits = False
            Me.ComandoRegistrar.Enabled = False
        End If
        
        
    End If
    EstablecerBordes
    
    
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Public Function EstablecerBordes(Optional ByRef p_Error As String) As String
    
   Dim m_Titulo As String
    
    On Error GoTo errores
    
    With Me
        .AccionRealizada.BorderColor = COLOR_BORDE_CAMPO_RELLENO
        .AccionRealizada.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
        .FechaInicio.BorderColor = COLOR_BORDE_CAMPO_RELLENO
        .FechaInicio.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
        .FechaFinPrevista.BorderColor = COLOR_BORDE_CAMPO_RELLENO
        .FechaFinPrevista.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
        .FechaFinReal.BorderColor = COLOR_BORDE_CAMPO_RELLENO
        .FechaFinReal.BorderWidth = ANCHO_BORDE_CAMPO_RELLENO
    End With
    If m_ObjNCProyectoActiva.Borrado = True Then
        Exit Function
    End If
    If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.No Then
        Exit Function
    End If
    With Me
        If Nz(.AccionRealizada, "") = "" Then
            Me.AccionRealizada.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
            Me.AccionRealizada.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
        End If
        
        If IsDate(.FechaInicio) Then
            If Not IsDate(.FechaFinPrevista) Then
                Me.FechaFinPrevista.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
                Me.FechaFinPrevista.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
            Else
                If Not IsDate(.FechaFinReal) Then
                    If CDate(.FechaFinPrevista) < CDate(.FechaInicio) Then
                        Me.FechaFinPrevista.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
                        Me.FechaFinPrevista.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
                    End If
                    If CDate(.FechaFinPrevista) < CDate(Date) Then
                        Me.FechaFinPrevista.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
                        Me.FechaFinPrevista.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
                    End If
                End If
                
                If IsDate(.FechaFinReal) Then
                    If CDate(.FechaInicio) > CDate(.FechaFinReal) Then
                        Me.FechaInicio.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
                        Me.FechaInicio.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
                        Me.FechaFinReal.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
                        Me.FechaFinReal.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
                    End If
                End If
                
            End If
            
        Else
            If IsDate(.FechaFinPrevista) Then
                Me.FechaFinPrevista.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
                Me.FechaFinPrevista.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
            End If
            If IsDate(.FechaFinReal) Then
                Me.FechaFinReal.BorderColor = COLOR_BORDE_CAMPO_NORELLENO
                Me.FechaFinReal.BorderWidth = ANCHO_BORDE_CAMPO_NORELLENO
            End If
        End If
    End With
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerBordes ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function
Private Sub AccionRealizada_AfterUpdate()
    On Error Resume Next
    EstablecerBordes
    
End Sub

Private Sub cmdSalir_Click()
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Sub ComandoActualizar_Click()
    Dim m_EstadoAlInicio As String
    Dim m_EstadoAlFinal As String
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    Me.ESTADOAR = Null
    
    m_EstadoAlInicio = m_ObjARProyectoActiva.Estado
    ActualizarDatosARProyecto m_ObjARProyectoActiva, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_EstadoAlFinal = m_ObjARProyectoActiva.Estado
    Me.ESTADOAR = m_ObjARProyectoActiva.Estado
    If m_EstadoAlInicio <> m_EstadoAlFinal Then
        Me.ESTADOAR = m_ObjARProyectoActiva.Estado
        If FormularioAbierto("FormNCProyectoGestion") Then
            Form_FormNCProyectoGestion.ActualizarLineaLista
        End If
        m_EstadoAlInicio = m_ObjNCProyectoActiva.Estado
        ActualizarDatosACProyecto m_ObjNCProyectoActiva, m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        m_EstadoAlFinal = m_ObjNCProyectoActiva.Estado
        If m_EstadoAlInicio <> m_EstadoAlFinal Then
           
            If FormularioAbierto("FormNCProyecto") Then
                Set Form_FormNCProyecto.m_NCAlInicio = constructor.getNCProyecto(p_IDNC:=Form_FormNCProyecto.m_NCAlInicio.IDNoConformidad, _
                                                                p_Error:=m_Error)
                If m_Error <> "" Then
                    Err.Raise 1000
                End If


                If Forms("FormNCProyecto").FrmDetalle.SourceObject = "FormNCProyectoAcciones" Then
                    Form_FormNCProyectoAcciones.ActualizarLineaListaAC
                    
                End If
                
            End If
            
        End If
        If FormularioAbierto("FormNCProyectoGestion") Then
            Form_FormNCProyectoGestion.ActualizarLineaLista
        End If
    End If
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

Public Function HaHabidoCambios(Optional ByRef p_Error As String) As Boolean
    
    On Error GoTo errores
    
    If m_ARAlInicio Is Nothing Then
        HaHabidoCambios = True
        Exit Function
    End If
    With m_ARAlInicio
        If .AccionRealizada <> Nz(Me.AccionRealizada, "") Then
            HaHabidoCambios = True
            Exit Function
        End If
        If .Notas <> Nz(Me.Notas, "") Then
            HaHabidoCambios = True
            Exit Function
        End If
        If .Responsable <> Nz(Me.Responsable.Column(1), "") Then
            HaHabidoCambios = True
            Exit Function
        End If
        If .FechaInicio <> Nz(Me.FechaInicio, "") Then
            HaHabidoCambios = True
            Exit Function
        End If
        If .FechaFinPrevista <> Nz(Me.FechaFinPrevista, "") Then
            HaHabidoCambios = True
            Exit Function
        End If
        If .FechaFinReal <> Nz(Me.FechaFinReal, "") Then
            HaHabidoCambios = True
            Exit Function
        End If
        
    End With
    HaHabidoCambios = False
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método HaHabidoCambios ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function

Private Sub ComandoDocumentos_Click()
     On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    If FormularioAbierto("FormARProyectoDocumentos") Then
        DoCmd.Close acForm, "FormARProyectoDocumentos", acSaveNo
    End If
    
    DoCmd.OpenForm "FormARProyectoDocumentos"
    If FormularioAbierto("FormARProyectoDocumentos") Then
        Set m_FormAnexos = Forms("FormARProyectoDocumentos")
    End If
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoDocumentos_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If

End Sub

Public Sub ComandoRegistrar_Click()
    Dim m_sEstadoAlInicio As String
    Dim m_sEstadoAlFinal As String
    
    Dim m_AccAlInicio As String
    Dim m_AccAlFinal As String
    Dim m_ARProyecto As ARProyecto
    Dim m_AROp As ARProyectoOperaciones
    Dim m_HaHabidoCambios As Boolean
    Dim m_MotivoReplanificacion As String
    
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
    If m_HaHabidoCambios = False Then
        m_Error = "No hay cambios que guardar"
        Err.Raise 1000
    End If
    
    If m_ObjARProyectoActiva Is Nothing Then
        Set m_ObjARProyectoActiva = New ARProyecto
        m_ObjARProyectoActiva.IdAccionCorrectiva = m_ObjACProyectoActiva.IdAccionCorrectiva
    End If
    With m_ObjARProyectoActiva
        .AccionRealizada = Me.AccionRealizada
        If Me.Notas <> "" Then
            .Notas = Me.Notas
        Else
            .Notas = ""
        End If
        If Me.FechaInicio <> "" Then
            .FechaInicio = Me.FechaInicio
        Else
            .FechaInicio = ""
        End If
        If Me.FechaFinPrevista <> "" Then
            .FechaFinPrevista = Me.FechaFinPrevista
        Else
            .FechaFinPrevista = ""
        End If
        If Me.FechaFinReal <> "" Then
            .FechaFinReal = Me.FechaFinReal
        Else
            .FechaFinReal = ""
        End If
        .Responsable = Nz(Me.Responsable.Column(1), "")
        If Not m_ARAlInicio Is Nothing Then
        
        
            m_sEstadoAlInicio = .Estado
            m_AccAlInicio = .AccionRealizada
            
            If IsDate(.FechaFinReal) And Not IsDate(m_ARAlInicio.FechaFinReal) Then
                If .Documentos Is Nothing Then
                    VBA.DoEvents
                    DoCmd.Hourglass False
                    VBA.DoEvents
                    pregunta = MsgBox("Para cerrar una tarea ha de adjuntar una evidencia" & vbNewLine & _
                                    "¿La quiere adjuntar en estos momentos?", vbExclamation + vbYesNo + vbDefaultButton1, "Fin de tarea")
                    If pregunta <> vbYes Then
                        Exit Sub
                    End If
                    If FormularioAbierto("FormARProyectoDocumentos") Then
                        DoCmd.Close acForm, "FormARProyectoDocumentos", acSaveNo
                    End If
                    
                    DoCmd.OpenForm "FormARProyectoDocumentos", OpenArgs:=.FechaFinReal
                    If FormularioAbierto("FormARProyectoDocumentos") Then
                        Set m_FormAnexos = Forms("FormARProyectoDocumentos")
                       
                    End If
                    Exit Sub
                End If
            End If
            If IsDate(.FechaFinPrevista) And IsDate(m_ARAlInicio.FechaFinPrevista) Then
                If .FechaFinPrevista <> m_ARAlInicio.FechaFinPrevista Then
                    m_MotivoReplanificacion = Nz(InputBox("Ha de indicar el motivo de la replanificación", "Motivo"), "")
                    If m_MotivoReplanificacion = "" Then
                        m_Error = "No se ha grabado el cambio"
                        Err.Raise 1000
                    End If
                End If
            End If
        End If
    End With
    Set m_AROp = New ARProyectoOperaciones
    With m_AROp
        Set .AR = m_ObjARProyectoActiva
        .Registrar m_ARAlInicio, m_MotivoReplanificacion, m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
        If Not m_ARAlInicio Is Nothing Then
        
        
            m_sEstadoAlFinal = m_ObjARProyectoActiva.Estado
            m_AccAlFinal = m_ObjARProyectoActiva.AccionRealizada
        End If
    End With
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    pregunta = MsgBox("Registrado correctamente", vbInformation, "Registro OK")
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    If m_ARAlInicio Is Nothing Then
        RaiseEvent Alta(m_EstadoAlInicio)
    Else
        RaiseEvent Editado(m_EstadoAlInicio)
    End If
    If Not m_ARAlInicio Is Nothing Then
        If (m_sEstadoAlInicio <> m_sEstadoAlFinal) Or (m_AccAlInicio <> m_AccAlFinal) Then
            If FormularioAbierto("FormNCProyectoGestion") Then
                Form_FormNCProyectoGestion.ActualizarLineaLista
            End If
            
           
        End If
    End If
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    DoCmd.Close acForm, Me.Name, acSaveNo
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

Private Sub FechaFinPrevista_AfterUpdate()
    On Error Resume Next
    
    EstablecerBordes
End Sub

Private Sub FechaFinReal_AfterUpdate()
    On Error Resume Next
    
    EstablecerBordes
End Sub

Private Sub FechaInicio_AfterUpdate()
    On Error Resume Next
    
    EstablecerBordes
End Sub

Private Sub Form_Open(Cancel As Integer)
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Ajustar Me
     m_EstadoAlInicio = Nz(Me.OpenArgs(), "")
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
        m_Error = "Al Form_Open se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub
Private Sub m_FormAnexos_Alta()
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Set m_ObjARProyectoActiva.Documentos = Nothing
    Set m_ARAlInicio = constructor.getARProyecto(p_IDAR:=m_ARAlInicio.IDAccionRealizada, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Form_Open False
    RaiseEvent AltaAnexo
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormAnexos_Alta se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub m_FormAnexos_Eliminado()
    
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    Set m_ObjARProyectoActiva.Documentos = Nothing
    Set m_ARAlInicio = constructor.getARProyecto(p_IDAR:=m_ARAlInicio.IDAccionRealizada, p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    Form_Open False
    RaiseEvent EliminadoAnexo
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al m_FormAnexos_Eliminado se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

Private Sub ImagenAnexo_Click()
    Dim m_Documento As DocumentoProyecto
    Dim m_ID As Variant
    On Error GoTo errores
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    If m_ObjARProyectoActiva.Documentos Is Nothing Then
        m_Error = "No parece tener anexos registrados"
        Err.Raise 1000
    End If
    If m_ObjARProyectoActiva.Documentos.count = 1 Then
        For Each m_ID In m_ObjARProyectoActiva.Documentos
            Set m_Documento = m_ObjARProyectoActiva.Documentos(m_ID)
            AbrirEnLocal m_Documento.URLAnexo, m_Error
            If m_Error <> "" Then
                Err.Raise 1000
            End If
            Set m_Documento = Nothing
            Exit For
        Next
    End If
    If Me.ComandoDocumentos.Enabled = True Then
        ComandoDocumentos_Click
    End If
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ImagenAnexo_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
        CorreoAlAdministrador m_Error
        pregunta = MsgBox(m_Error, vbCritical, "Error")
    Else
        pregunta = MsgBox(m_Error, vbExclamation, "Advertencia")
    End If
End Sub

