VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_FormNCAuditoriaAC"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit

Private m_ACAlInicio As ACAuditoria
Private m_EstadoAlInicio As String

Public Event Alta(p_EstadoAlInicio As String)
Public Event Editado()
Private m_Error As String

Private Function EstablecerCombos( _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
   
    
    On Error GoTo errores
    
    
    
    
    EstablecerComboResponsablesImplantacion Me.Responsable, p_Error
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
    
    If m_ObjNCAuditoriaActiva Is Nothing Then
        p_Error = "Se ha abierto el formulario con parámetros insuficientes"
        Err.Raise 1000
    End If
    With m_ObjNCAuditoriaActiva
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
    If m_ObjACAuditoriaActiva Is Nothing Then
        Me.lblTitulo.Caption = "Alta de acción correctiva"
        Me.Caption = Me.lblTitulo.Caption
        If m_ObjNCAuditoriaActiva.RESPONSABLEIMPLANTACION <> "" Then
            Me.Responsable = m_ObjNCAuditoriaActiva.RESPONSABLEIMPLANTACION
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
    Set m_ACAlInicio = constructor.getACAuditoria(p_IDAC:=m_ObjACAuditoriaActiva.IdAccionCorrectiva, p_Error:=p_Error)
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    If m_ACAlInicio Is Nothing Then
        p_Error = "No se han encontrado datos de la acción"
        Err.Raise 1000
    End If
    Me.ComandoActualizar.Visible = True
    Me.ComandoActualizar.Enabled = True
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
        If .Responsable <> "" Then
            Me.Responsable = .Responsable
        Else
            Me.Responsable = Null
        End If
        
    End With
    If m_ObjNCAuditoriaActiva.Borrado = True Then
        Me.AllowEdits = False
        Me.ComandoRegistrar.Enabled = False
    Else
         Me.AllowEdits = True
        Me.ComandoRegistrar.Enabled = True
        RellenarBordeCamposObligatorios Me
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerDatos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Private Sub AccionCorrectiva_AfterUpdate()
    On Error Resume Next
    
    RellenarBordeCamposObligatorios Me
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
    m_EstadoAlInicio = m_ObjACAuditoriaActiva.Estado
    ActualizarDatosACAuditoria m_ObjACAuditoriaActiva, m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    m_EstadoAlFinal = m_ObjACAuditoriaActiva.Estado
    EstablecerDatos
    If m_EstadoAlInicio <> m_EstadoAlFinal Then
        If FormularioAbierto("FormNCAuditoriaGestion") Then
            Form_FormNCAuditoriaGestion.ActualizarLineaLista
        End If
        If FormularioAbierto("FormNCAuditoria") Then
            Set Form_FormNCAuditoria.m_NCAlInicio = constructor.getNCAuditoria(p_IDNC:=Form_FormNCAuditoria.m_NCAlInicio.id, _
                                                                p_Error:=m_Error)
            If m_Error <> "" Then
                Err.Raise 1000
            End If


            If Forms("FormNCAuditoria").FrmDetalle.SourceObject = "FormNCAuditoriaAcciones" Then
                Form_FormNCAuditoriaAcciones.ActualizarLineaListaAC
                
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
    
    Dim m_ACAuditoria As ACAuditoria
    Dim m_ACOp As ACAuditoriaOperaciones
    
    
    
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
    If m_ObjACAuditoriaActiva Is Nothing Then
        Set m_ObjACAuditoriaActiva = New ACAuditoria
        m_ObjACAuditoriaActiva.id = m_ObjNCAuditoriaActiva.id
    End If
    With m_ObjACAuditoriaActiva
        .id = m_ObjNCAuditoriaActiva.id
        .AccionCorrectiva = Nz(Me.AccionCorrectiva, "")
        .Notas = Nz(Me.Notas, "")
        .Responsable = Nz(Me.Responsable, "")
    End With
    Set m_ACOp = New ACAuditoriaOperaciones
    With m_ACOp
        Set .AC = m_ObjACAuditoriaActiva
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
    
   
    If FormularioAbierto("FormNCAuditoriaGestion") Then
        Form_FormNCAuditoriaGestion.ActualizarLineaLista
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



