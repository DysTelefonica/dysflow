 Option Compare Database
Option Explicit
Private m_Error As String

Public Event MotivoRegistrado(m_Motivo As String)

Private Sub Form_Load()
    On Error Resume Next
    Me.Caption = Me.lblTitulo.Caption
    If Nz(Me.OpenArgs(), "") = "" Then
        Exit Sub
    End If
    
    Me.MotivoNoRequiereControlEficacia = Me.OpenArgs()
End Sub

Private Sub ComandoRegistrar_Click()
    On Error Resume Next
    RaiseEvent MotivoRegistrado(Nz(Me.MotivoNoRequiereControlEficacia, ""))
    
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub

Private Sub cmdSalir_Click()
    On Error Resume Next
    DoCmd.Close acForm, Me.Name, acSaveNo
End Sub