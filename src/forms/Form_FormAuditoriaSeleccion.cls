VERSION 1.0 CLASS
BEGIN
  MultiUse = -1  'True
END
Attribute VB_Name = "Form_FormAuditoriaSeleccion"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = True
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = False
Option Compare Database
Option Explicit


Private m_Error As String

Private Sub cmdSalir_Click()
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Function EstablecerCombos( _
                                    Optional ByRef p_Error As String _
                                    ) As Scripting.Dictionary
   
    
    On Error GoTo errores
    
    
    EstablecerComboAuditoriasNombres Me.Auditoria, p_Error
    If p_Error <> "" Then
        Err.Raise 1000
    End If
    Exit Function
errores:
    If Err.Number <> 1000 Then
        p_Error = "El método EstablecerCombos ha devuelto el error: " & vbNewLine & Err.Description
    End If
End Function


Private Sub ComandoSeleccionar_Click()
    
      
    On Error GoTo errores
    VBA.DoEvents
    DoCmd.Hourglass True
    VBA.DoEvents
    
    m_Error = ""
    
    If Nz(Me.Auditoria.Column(1), "") = "" Then
        m_Error = "Se ha de seleccionar una auditoría"
        Err.Raise 1000
    End If
    Set m_ObjAuditoriaActiva = constructor.getAuditoria(p_ID:=Me.Auditoria.Column(0), p_Error:=m_Error)
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    
    If m_ObjAuditoriaActiva Is Nothing Then
        m_Error = "Se ha de seleccionar una auditoría"
        Err.Raise 1000
    End If
    If FormularioAbierto("FormNCAuditoria") Then
        DoCmd.Close acForm, "FormNCAuditoria", acSaveNo
    End If
    Set m_ObjNCAuditoriaActiva = Nothing
    DoCmd.OpenForm "FormNCAuditoria"
    
    
    
    VBA.DoEvents
    DoCmd.Hourglass False
    VBA.DoEvents
    DoCmd.Close acForm, Me.Name, acSaveNo
    Exit Sub
errores:
    DoCmd.Hourglass False
    If Err.Number <> 1000 Then
        m_Error = "Al ComandoSeleccionar_Click se ha producido el error n: " & Err.Number & vbNewLine & "Detalle: " & Err.Description
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
    
    Me.Caption = Me.lblTitulo.Caption
    
    EstablecerCombos m_Error
    If m_Error <> "" Then
        Err.Raise 1000
    End If
    AvanceCerrar
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


