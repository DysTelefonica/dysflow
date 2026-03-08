VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_FormNCProyectoAC"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Private m_ACAlInicio As ACProyecto
Private m_EstadoAlInicio As String

Public Event Alta(p_EstadoAlInicio As String)
Public Event Editado()
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
    
    
    
    On Error GoTo errores
    
    If m_ObjNCProyectoActiva Is Nothing Then
        p_Error = "Se ha abierto el formulario con parámetros insuficientes"
        Err.Raise 1000
    End If
    With m_ObjNCProyectoActiva
        If .Descripcion <> "" Then
            Me.NoConformidad = .Descripcion
        Else
            Me.NoConformidad = "Sin definir"
        End If
    End With
    EstablecerCombos p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ObjACProyectoActiva Is Nothing Then
        Me.lblTitulo.Caption = "Alta de Acción Correctiva"
        Me.Caption = Me.lblTitulo.Caption
        If Not m_ObjNCProyectoActiva.ResponsableTelefonicaObj Is Nothing Then
            Me.Responsable = m_ObjNCProyectoActiva.ResponsableTelefonicaObj.Nombre
        End If
        Me.ComandoActualizar.Enabled = False
        Me.lblfecha1.Visible = False
        Me.lblfecha2.Visible = False
        Me.lblfecha3.Visible = False
        Me.lblEstado1.Visible = False
        Me.FechaInicialMinima.Visible = False
        Me.FechaFinalUltima.Visible = False
        Me.FechaFinPrevistaUltima.Visible = False
        Me.Estado.Visible = False
        Me.ComandoActualizar.Visible = False
        RellenarBordeCamposObligatorios Me
        Exit Function
    End If
    Me.ComandoActualizar.Enabled = True
    Me.lblfecha1.Visible = True
    Me.lblfecha2.Visible = True
    Me.lblfecha3.Visible = True
    Me.lblEstado1.Visible = True
    Me.FechaInicialMinima.Visible = True
    Me.FechaFinalUltima.Visible = True
    Me.FechaFinPrevistaUltima.Visible = True
    Me.Estado.Visible = True
    Me.ComandoActualizar.Visible = True
    Set m_ACAlInicio = constructor.getACProyecto(p_IDAC:=m_ObjACProyectoActiva.IdAccionCorrectiva, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ACAlInicio Is Nothing Then
        p_Error = "No se han encontrado datos de la acción"
        Err.Raise 1000
    End If
    If m_ObjNCProyectoActiva.NCProyectoAsociada Is Nothing Then
        Me.ComandoActualizar.Visible = True
        Me.ComandoActualizar.Enabled = True
    Else
        Me.ComandoActualizar.Visible = False
        Me.ComandoActualizar.Enabled = False
    End If
    With m_ACAlInicio
        
        Me.lblTitulo.Caption = "Edición de acción correctiva"
        
        Me.Caption = Me.lblTitulo.Caption
        If .AccionCorrectiva <> "" Then
            Me.AccionCorrectiva = .AccionCorrectiva
        End If
        If .Notas <> "" Then
            Me.Notas = .Notas
        Else
             Me.Notas = Null
        End If
        If .Estado <> "" Then
            Me.Estado = .Estado
        End If
        If IsDate(.FechaInicialMinima) Then
            Me.FechaInicialMinima = .FechaInicialMinima
        Else
            Me.FechaInicialMinima = Null
        End If
        If IsDate(.FechaFinPrevistaUltima) Then
            Me.FechaFinPrevistaUltima = .FechaFinPrevistaUltima
        Else
            Me.FechaFinPrevistaUltima = Null
        End If
        If IsDate(.FechaFinalUltima) Then
            Me.FechaFinalUltima = .FechaFinalUltima
        Else
            Me.FechaFinalUltima = Null
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
                RellenarBordeCamposObligatorios Me
            End If
        Else
            Me.AllowEdits = False
            Me.ComandoRegistrar.Enabled = False
        End If
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Private Sub AccionCorrectiva_AfterUpdate()
    On Error Resume Next
    
    If Form_FormNCProyecto.m_PermitidoEditar = EnumSino.Sí Then
        RellenarBordeCamposObligatorios Me
        
    End If
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
    Me.FechaInicialMinima = Null
    Me.FechaFinalUltima = Null
    Me.Estado = Null
    m_EstadoAlInicio = m_ObjACProyectoActiva.Estado
    ActualizarDatosACProyecto m_ObjACProyectoActiva, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_EstadoAlFinal = m_ObjACProyectoActiva.Estado
    EstablecerDatos
    If m_EstadoAlInicio <> m_EstadoAlFinal Then
        If FormularioAbierto("FormNCProyectoGestion") Then
            Form_FormNCProyectoGestion.ActualizarLineaLista
        End If
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

Private Sub ComandoRegistrar_Click()
    
    Dim m_ACProyecto As ACProyecto
    Dim m_ACOp As ACProyectoOperaciones
    
    
    
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    m_Error = ""
    
    
    
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    If EsTecnico = EnumSino.Sí Then
        m_Error = "No tiene autorización para esa acción"
        Err.Raise 1000
    End If
    If m_ObjACProyectoActiva Is Nothing Then
        Set m_ObjACProyectoActiva = New ACProyecto
        m_ObjACProyectoActiva.IDNoConformidad = m_ObjNCProyectoActiva.IDNoConformidad
    End If
    With m_ObjACProyectoActiva
        .AccionCorrectiva = Nz(Me.AccionCorrectiva, "")
        .Notas = Nz(Me.Notas, "")
        .Responsable = Nz(Me.Responsable.Column(1), "")
    End With
    Set m_ACOp = New ACProyectoOperaciones
    With m_ACOp
        Set .AC = m_ObjACProyectoActiva
        .Registrar m_ACAlInicio, m_Error
        If m_Error <> "" Then
            Err.Raise 1000
        End If
    End With
    If m_ACAlInicio Is Nothing Then
        
        RaiseEvent Alta(m_EstadoAlInicio)
    Else
        RaiseEvent Editado
    End If
    
   
    If FormularioAbierto("FormNCProyectoGestion") Then
        Form_FormNCProyectoGestion.ActualizarLineaLista
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



